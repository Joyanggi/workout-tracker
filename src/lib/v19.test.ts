import { describe, expect, it } from 'vitest'
import {
  CRITICAL_SKIP_SLOTS,
  comparePlans,
  hasVariants,
  isReducedPlan,
  itemVariant,
  itemWeight,
  planDiffText,
  planTotals,
  restDaySlotsOf,
  slotScore,
  slotsFor,
  splitPlanIds,
  splitsByTrainingDay,
  successorOf,
  summarizeDietDay,
  variantChoicesFor,
  variantDefaultKey,
  variantsOf,
  visiblePlans,
} from './diet'
import {
  applyCheckAllItems,
  applyToggleItem,
  applyVariantChoice,
  emptyDietDay,
  seedVariantChoices,
} from './dietOps'
import { dietSectionMarkdown } from './exportMarkdown'
import { allSlots, isTrainingOnlySlot, parseTimeHint } from './mealCalendar'
import { BUNDLED_DIET_PLANS } from '../db/seed'
import { stripComments } from './sourceScan'
import type { DietDay, DietPlan, DietSlot, SlotRecord } from '../types'

/**
 * v1.9 — 식단 단순화 라운드 (DD1~DD4).
 *
 * 이 라운드의 인바리언트: **과거 날짜의 판정이 하나도 바뀌지 않는다.** 그래서 옛 플랜을
 * 지우지 않고 숨겼고, 옛 플랜을 쓰는 테스트(diet.test.ts 전체)가 그대로 통과하는 것이
 * 1차 증거다. 이 파일은 새 플랜 쪽 계약과, 두 세계가 섞이지 않는다는 사실을 잠근다.
 */

const NEW = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800-u')!
const NEW_LOW = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1500-u')!
const OLD = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!
const OLD_LOW = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1500')!

const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const file = (path: string) => {
  const src = sources[path]
  expect(src, `${path}가 없습니다 — 이 검사가 헛돌고 있다`).toBeDefined()
  return stripComments(src!)
}

const slotOf = (plan: DietPlan, id: string): DietSlot =>
  slotsFor(plan).find((s) => s.id === id)!

const fullDay = (plan: DietPlan, over: Partial<DietDay> = {}): DietDay => ({
  date: '2026-08-06',
  planId: plan.id,
  isTrainingDay: false,
  slots: Object.fromEntries(
    slotsFor(plan).map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
  ) as Record<string, SlotRecord>,
  ...over,
})

// ─── DD1: 두 플랜의 차이를 화면이 말한다 ─────────────────

describe('DD1 — comparePlans', () => {
  it('현재 두 플랜의 차이는 저녁 현미밥 1개뿐이다', () => {
    // 피드백("차이를 앱에서 모르겠다")의 사실 확인 — 이 테스트가 그 사실을 고정한다
    const diff = comparePlans(NEW, NEW_LOW)
    expect(diff.items).toHaveLength(1)
    expect(diff.items[0]).toMatchObject({
      slotId: 'dinner',
      itemName: '현미밥',
      kind: 'removed',
      fromQty: '1개',
    })
    expect(diff.kcalDelta).toBe(-215)
    expect(diff.proteinDelta).toBe(-4)
  })

  it('한 줄 문구가 그 사실을 그대로 말한다', () => {
    expect(planDiffText(NEW, NEW_LOW)).toBe('저녁: 현미밥 1개 빠짐 · −215kcal · 단백질 −4g')
  })

  it('품목 추가를 잡는다', () => {
    const plus: DietPlan = {
      ...NEW,
      id: 'x',
      slots: slotsFor(NEW).map((s) =>
        s.id === 'afternoon'
          ? { ...s, items: [...s.items, { id: 'yogurt', name: '그릭요거트', qty: '1개', kcal: 100, proteinG: 10 }] }
          : s,
      ),
    }
    const diff = comparePlans(NEW, plus)
    expect(diff.items[0]).toMatchObject({ kind: 'added', itemName: '그릭요거트', toQty: '1개' })
    expect(diff.kcalDelta).toBe(100)
    expect(planDiffText(NEW, plus)).toContain('오후: 그릭요거트 1개 추가')
  })

  it('수량 변경을 잡는다 (제거·추가로 뭉개지 않는다)', () => {
    const changed: DietPlan = {
      ...NEW,
      id: 'y',
      slots: slotsFor(NEW).map((s) =>
        s.id === 'breakfast'
          ? { ...s, items: s.items.map((i) => (i.id === 'boiled-eggs' ? { ...i, qty: '2개', kcal: 150, proteinG: 13 } : i)) }
          : s,
      ),
    }
    const diff = comparePlans(NEW, changed)
    expect(diff.items[0]).toMatchObject({ kind: 'changed', fromQty: '3개', toQty: '2개' })
    expect(planDiffText(NEW, changed)).toContain('아침: 반숙란 3개 → 2개')
  })

  it('같은 플랜끼리는 차이가 없다 (빈 문구 → 화면이 줄을 그리지 않는다)', () => {
    expect(comparePlans(NEW, NEW).items).toEqual([])
    expect(planDiffText(NEW, NEW)).toBe('')
  })

  it('총량 델타가 품목 델타의 합과 일치한다 (두 경로가 갈리지 않는다)', () => {
    for (const [a, b] of [
      [NEW, NEW_LOW],
      [NEW_LOW, NEW],
      [NEW, OLD],
    ] as const) {
      const diff = comparePlans(a, b)
      const kcal = diff.items.reduce((n, d) => n + d.kcalDelta, 0)
      const protein = diff.items.reduce((n, d) => n + d.proteinDelta, 0)
      expect(kcal, `${a.id}→${b.id}`).toBe(diff.kcalDelta)
      expect(protein, `${a.id}→${b.id}`).toBe(diff.proteinDelta)
      expect(diff.kcalDelta).toBe(planTotals(b).kcal - planTotals(a).kcal)
    }
  })

  it('플랜 시트가 문구를 손으로 적지 않는다 (파생 함수를 쓴다)', () => {
    const sheet = file('/src/components/DietPlanSheet.tsx')
    expect(sheet).toMatch(/planDiffText\(/)
    // 품목 이름을 화면이 들고 있으면 시드를 고칠 때 낡는다
    expect(sheet).not.toMatch(/현미밥|빠짐/)
  })
})

// ─── DD2: 훈련일/휴식일 통일 ─────────────────────────────

describe('DD2 — 새 플랜이 루틴 문서 15장 개정 표와 1:1', () => {
  it('매일 같은 5끼다', () => {
    expect(slotsFor(NEW).map((s) => s.id)).toEqual([
      'breakfast',
      'lunch',
      'afternoon',
      'shake',
      'dinner',
    ])
    expect(slotsFor(NEW_LOW).map((s) => s.id)).toEqual(slotsFor(NEW).map((s) => s.id))
  })

  it('끼니별 구성이 문서 표와 같다', () => {
    const names = (id: string) => slotOf(NEW, id).items.map((i) => i.name)
    expect(names('breakfast')).toEqual(['반숙란', '멀티비타민', '오메가3'])
    expect(names('lunch')).toEqual(['현미밥', '닭가슴살', '채소', '올리브오일'])
    expect(names('afternoon')).toEqual(['아몬드'])
    expect(names('shake')).toEqual(['WPI', '바나나'])
    expect(names('dinner')).toEqual(['현미밥', '닭가슴살', '채소', '멀티비타민', '오메가3'])
  })

  it('끼니별 합계가 문서 표와 같다 (점심 510은 문서의 525 반올림 표기와 다르다)', () => {
    const totals = (id: string) =>
      slotOf(NEW, id).items.reduce(
        (acc, i) => ({ kcal: acc.kcal + i.kcal, proteinG: acc.proteinG + i.proteinG }),
        { kcal: 0, proteinG: 0 },
      )
    expect(totals('breakfast')).toEqual({ kcal: 235, proteinG: 20 })
    expect(totals('lunch')).toEqual({ kcal: 510, proteinG: 38 })
    expect(totals('afternoon')).toEqual({ kcal: 145, proteinG: 5 })
    expect(totals('shake')).toEqual({ kcal: 396, proteinG: 48 })
    expect(totals('dinner')).toEqual({ kcal: 495, proteinG: 55 })
  })

  it('하루 총량이 문서 품목 표의 합과 같다 (문서의 "합계 1,796"은 문서 자체의 산술 오차)', () => {
    // 현미밥 430 + 바나나 210 + 닭가슴살 450 + 반숙란 225 + WPI 186 + 아몬드 145
    // + 올리브오일 115 + 오메가3 20 = 1,781
    expect(planTotals(NEW)).toEqual({ kcal: 1781, proteinG: 166 })
    expect(planTotals(NEW_LOW)).toEqual({ kcal: 1566, proteinG: 162 })
  })

  it('통일은 합치는 것이지 줄이는 것이 아니다 (옛 휴식일 구성과 총량 동일)', () => {
    expect(planTotals(NEW)).toEqual(planTotals(OLD, false))
    expect(planTotals(NEW_LOW)).toEqual(planTotals(OLD_LOW, false))
    // 옛 훈련일 구성과도 같다 (문서: 총량·단백질이 완전히 같았다)
    expect(planTotals(NEW)).toEqual(planTotals(OLD, true))
  })

  it('새 플랜에는 훈련일 분기가 없다 (isTrainingDay가 판정에 관여하지 않는다)', () => {
    expect(restDaySlotsOf(NEW)).toBeUndefined()
    expect(splitsByTrainingDay(NEW)).toBe(false)
    expect(slotsFor(NEW, true)).toBe(slotsFor(NEW, false))
    const trained = summarizeDietDay(NEW, fullDay(NEW, { isTrainingDay: true }))
    const rest = summarizeDietDay(NEW, fullDay(NEW, { isTrainingDay: false }))
    expect(trained).toEqual(rest)
  })

  it('옛 플랜은 여전히 갈린다 (정규화 대상 집합이 옛 플랜만 담는다)', () => {
    expect(splitsByTrainingDay(OLD)).toBe(true)
    expect([...splitPlanIds(BUNDLED_DIET_PLANS)].sort()).toEqual(['cut-1500', 'cut-1800'])
  })

  it('보충 블록 안내를 timeHint가 승계했고 알림 시각은 그대로 15:00이다', () => {
    const shake = slotOf(NEW, 'shake')
    expect(shake.timeHint).toContain('훈련 2시간 전까지')
    // "15:00~16:00 · …" 형식을 알림 파서가 여전히 읽는다 (범위 표기 + 문장)
    expect(parseTimeHint(shake.timeHint)).toEqual({ h: 15, m: 0 })
  })

  it('크리티컬 스킵이 shake로 이어진다 (id 기반이라 자동)', () => {
    expect(CRITICAL_SKIP_SLOTS).toContain('shake')
    expect(slotsFor(NEW).map((s) => s.id)).not.toContain('pre')
    expect(slotScore(slotOf(NEW, 'shake'), { checkedItemIds: [], skipped: true })).toBe(0.25)
    expect(slotScore(slotOf(NEW, 'breakfast'), { checkedItemIds: [], skipped: true })).toBe(0.5)
  })

  it('알림 목록이 5끼 그대로이고 훈련일 전용 슬롯이 없다', () => {
    expect(allSlots(NEW)).toHaveLength(5)
    for (const slot of allSlots(NEW)) {
      expect(isTrainingOnlySlot(NEW, slot.id), slot.id).toBe(false)
    }
    // 옛 플랜에서는 그 개념이 살아 있다 (백업에서 돌아온 플랜으로 알림을 만들 수 있다)
    expect(allSlots(OLD)).toHaveLength(7)
    expect(isTrainingOnlySlot(OLD, 'pre')).toBe(true)
  })
})

describe('DD2 — 옛 플랜은 숨기고 남긴다', () => {
  it('목록에는 새 플랜만 나온다', () => {
    expect(visiblePlans(BUNDLED_DIET_PLANS).map((p) => p.id)).toEqual(['cut-1800-u', 'cut-1500-u'])
  })

  it('숨긴 플랜은 DB에 남는다 (과거 날짜가 자기 planId로 판정된다)', () => {
    expect(BUNDLED_DIET_PLANS.map((p) => p.id)).toContain('cut-1800')
    expect(OLD.legacy).toBe(true)
  })

  it('기본 플랜은 새 플랜이고 옛 플랜은 아니다', () => {
    expect(BUNDLED_DIET_PLANS.filter((p) => p.isDefault).map((p) => p.id)).toEqual(['cut-1800-u'])
  })

  it('대체 관계가 데이터에 있다 (기본 플랜 설정 이관의 근거)', () => {
    expect(successorOf(BUNDLED_DIET_PLANS, 'cut-1800')?.id).toBe('cut-1800-u')
    expect(successorOf(BUNDLED_DIET_PLANS, 'cut-1500')?.id).toBe('cut-1500-u')
    expect(successorOf(BUNDLED_DIET_PLANS, 'cut-1800-u')).toBeUndefined()
  })

  it('시드가 그 이관을 실제로 한다', () => {
    // 이게 없으면 기존 설치본의 defaultDietPlanId가 숨긴 플랜을 계속 가리킨다
    const seed = file('/src/db/seed.ts')
    expect(seed).toMatch(/successorOf\(/)
    expect(seed).toMatch(/defaultDietPlanId/)
  })

  it('연속일 경고 대상은 총량에서 파생된다 (isDefault 플래그가 아니다)', () => {
    // 옛 감량 플랜은 기본과 총량이 같으므로 "만회성 절식" 경고 대상이 아니다
    expect(isReducedPlan(NEW_LOW, BUNDLED_DIET_PLANS)).toBe(true)
    expect(isReducedPlan(OLD, BUNDLED_DIET_PLANS)).toBe(false)
    expect(isReducedPlan(OLD_LOW, BUNDLED_DIET_PLANS)).toBe(true)
    expect(isReducedPlan(NEW, BUNDLED_DIET_PLANS)).toBe(false)
  })
})

describe('DD2 — 과거 판정 불변 (이 라운드의 인바리언트)', () => {
  /** v1.8까지 기록된 형태 그대로 — 옛 planId + 훈련일 6슬롯 */
  const pastTrainingDay: DietDay = {
    date: '2026-08-04',
    planId: 'cut-1800',
    isTrainingDay: true,
    slots: Object.fromEntries(
      OLD.slots.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
    ) as Record<string, SlotRecord>,
  }
  /** 옛 휴식일 5슬롯 (보충 블록) */
  const pastRestDay: DietDay = {
    date: '2026-08-03',
    planId: 'cut-1800',
    isTrainingDay: false,
    slots: Object.fromEntries(
      restDaySlotsOf(OLD)!.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
    ) as Record<string, SlotRecord>,
  }

  it('옛 훈련일 기록은 6슬롯·166g·● 그대로다', () => {
    const s = summarizeDietDay(OLD, pastTrainingDay)
    expect(s.totalSlots).toBe(6)
    expect(s.loggedSlots).toBe(6)
    expect(s.score).toBe(1)
    expect(s.adherence).toBe('good')
    expect(s.proteinG).toBe(166)
    expect(s.kcal).toBe(1781)
  })

  it('옛 휴식일 기록은 5슬롯·166g·● 그대로다', () => {
    const s = summarizeDietDay(OLD, pastRestDay)
    expect(s.totalSlots).toBe(5)
    expect(s.score).toBe(1)
    expect(s.proteinG).toBe(166)
  })

  it('변형 모델이 과거 기록을 건드리지 않는다 (variantChoices 부재 = 기본)', () => {
    // 옛 플랜에는 변형 자체가 없다 — 그리고 새 플랜에서도 부재는 기본 변형이다
    expect(OLD.slots.flatMap((s) => s.items).every((i) => i.variants === undefined)).toBe(true)
    const withoutChoices = summarizeDietDay(NEW, fullDay(NEW))
    expect(withoutChoices.kcal).toBe(1781)
    expect(withoutChoices.proteinG).toBe(166)
  })

  it('옛 플랜의 표기도 그대로다 (채소 1접시 — 과거 문서와 어긋나지 않게)', () => {
    expect(OLD.slots.find((s) => s.id === 'lunch')!.items.find((i) => i.id === 'vegetables')!.qty).toBe(
      '1접시',
    )
  })
})

describe('DD2 — 훈련일/휴식일 조작이 화면에서 사라졌다', () => {
  const editor = () => file('/src/components/DietDayEditor.tsx')

  it('세그먼트·잠금 문구·전환 op가 없다', () => {
    const src = editor()
    for (const gone of [
      'diet-daytype',
      'applyTrainingDay',
      '훈련일',
      '휴식일',
      '운동 기록이 있어',
    ]) {
      expect(src, `"${gone}"가 남아 있다`).not.toContain(gone)
    }
  })

  it('전환 op가 소스 어디에도 없다 (되살아나는 경로를 남기지 않는다)', () => {
    const owners = Object.entries(sources)
      .filter(([p]) => !p.includes('.test.'))
      .filter(([, src]) => /applyTrainingDay/.test(stripComments(src)))
      .map(([p]) => p)
    expect(owners).toEqual([])
  })

  it('스캔이 실제로 그 표현을 잡는다 (검사가 헛돌지 않게)', () => {
    // 결함을 되살린 형태를 문자열로 주면 걸려야 한다
    const revived = stripComments(`
      // 훈련일 세그먼트 주석은 무시돼야 한다
      const seg = <div className="diet-daytype">{'훈련일'}</div>
      onClick={() => mutate((d) => applyTrainingDay(d, true))}
    `)
    expect(revived).toContain('diet-daytype')
    expect(revived).toContain('훈련일')
    expect(/applyTrainingDay/.test(revived)).toBe(true)
    // 그리고 편집기에는 그 형태가 없다
    expect(editor()).not.toContain('diet-daytype')
  })

  it('기록 생성 시 훈련일 기본값은 여전히 사실에서 온다', () => {
    // 저장값 자체는 남는다 (옛 플랜 판정 경로에 필요하고, 사실 기반이어야 한다)
    expect(editor()).toMatch(/trainedThatDay \|\| \(stored\?\.isTrainingDay \?\? false\)/)
  })
})

// ─── DD3·DD4: 단백질원 변형 + 그램 표기 ──────────────────

describe('DD3 — 변형 정의가 문서 로테이션 표와 1:1', () => {
  const lunchChicken = () => slotOf(NEW, 'lunch').items.find((i) => i.id === 'chicken-2')!
  const dinnerChicken = () => slotOf(NEW, 'dinner').items.find((i) => i.id === 'chicken-3')!

  it('점심은 3택이다 (가슴살 2팩 / 안심 180g / 다리살 200g)', () => {
    const v = variantsOf(lunchChicken())
    expect(v.map((x) => `${x.name} ${x.qty}`)).toEqual([
      '닭가슴살 2팩',
      '닭안심 180g',
      '닭다리살 200g · 그날 올리브오일 생략',
    ])
  })

  it('저녁은 2택이고 다리살이 없다 (문서: 뺄 지방원이 없어 쓰지 않는다)', () => {
    const v = variantsOf(dinnerChicken())
    expect(v.map((x) => `${x.name} ${x.qty}`)).toEqual(['닭가슴살 3팩', '닭안심 270g'])
    expect(v.some((x) => x.name.includes('다리살'))).toBe(false)
  })

  it('안심은 단백질 등가다 (등가 기준이 단백질이라는 문서 규칙)', () => {
    for (const item of [lunchChicken(), dinnerChicken()]) {
      const [base, tender] = variantsOf(item)
      expect(tender.proteinG, item.id).toBe(base.proteinG)
      expect(tender.kcal).toBeGreaterThan(base.kcal) // 안심은 +9/+14kcal
    }
  })

  it('다리살은 단백질 −2g · kcal +160이고, 오일을 생략하면 실효 +45다', () => {
    const [base, , thigh] = variantsOf(lunchChicken())
    expect(thigh.proteinG - base.proteinG).toBe(-2)
    expect(thigh.kcal - base.kcal).toBe(160)
    const oil = slotOf(NEW, 'lunch').items.find((i) => i.id === 'olive-oil')!
    expect(thigh.kcal - base.kcal - oil.kcal).toBe(45) // 문서의 "실효 +45kcal"
  })

  it('기본 변형을 JSON에 두 번 적지 않는다 (0번은 품목 자신에서 합성)', () => {
    for (const plan of BUNDLED_DIET_PLANS) {
      for (const slot of slotsFor(plan)) {
        for (const item of slot.items) {
          if (!item.variants) continue
          expect(variantsOf(item)[0]).toEqual({
            name: item.name,
            qty: item.qty,
            kcal: item.kcal,
            proteinG: item.proteinG,
          })
          expect(item.variants.some((v) => v.name === item.name), item.id).toBe(false)
        }
      }
    }
  })

  it('변형이 있는 품목은 점심·저녁의 단백질원 둘뿐이다', () => {
    const withVariants = slotsFor(NEW)
      .flatMap((s) => s.items.filter(hasVariants).map((i) => `${s.id}.${i.id}`))
    expect(withVariants).toEqual(['lunch.chicken-2', 'dinner.chicken-3'])
  })
})

describe('DD4 — 그램 표기', () => {
  it('채소가 150g이다 (kcal은 계속 0 취급)', () => {
    for (const plan of [NEW, NEW_LOW]) {
      for (const slot of slotsFor(plan)) {
        const veg = slot.items.find((i) => i.id === 'vegetables')
        if (!veg) continue
        expect(veg.qty, plan.id).toBe('150g')
        expect(veg.kcal).toBe(0)
      }
    }
  })

  it('안심·다리살이 g으로 적혀 있다', () => {
    const qtys = slotsFor(NEW)
      .flatMap((s) => s.items)
      .flatMap((i) => (i.variants ?? []).map((v) => v.qty))
    expect(qtys).toEqual(['180g', '200g · 그날 올리브오일 생략', '270g'])
  })

  it('새 플랜에 "1접시"가 남아 있지 않다', () => {
    const all = slotsFor(NEW).flatMap((s) => s.items.map((i) => i.qty))
    expect(all).not.toContain('1접시')
  })
})

describe('DD3 — 마크로 정직성', () => {
  const lunch = () => slotOf(NEW, 'lunch')

  it('다리살을 고르고 오일을 빼면 그날 kcal이 +45다', () => {
    const base = summarizeDietDay(NEW, fullDay(NEW))
    const day = fullDay(NEW)
    const oilId = 'olive-oil'
    day.slots.lunch = {
      checkedItemIds: lunch()
        .items.map((i) => i.id)
        .filter((id) => id !== oilId),
      variantChoices: { 'chicken-2': 2 },
    }
    const withThigh = summarizeDietDay(NEW, day)
    expect(withThigh.kcal - base.kcal).toBe(45)
    expect(withThigh.proteinG - base.proteinG).toBe(-2)
  })

  it('오일을 그대로 먹으면 초과가 정직하게 보인다 (앱이 강제하지 않는다)', () => {
    const base = summarizeDietDay(NEW, fullDay(NEW))
    const day = fullDay(NEW)
    day.slots.lunch = { ...day.slots.lunch, variantChoices: { 'chicken-2': 2 } }
    expect(summarizeDietDay(NEW, day).kcal - base.kcal).toBe(160)
  })

  it('안심은 등가라 단백질이 그대로다', () => {
    const base = summarizeDietDay(NEW, fullDay(NEW))
    const day = fullDay(NEW)
    day.slots.lunch = { ...day.slots.lunch, variantChoices: { 'chicken-2': 1 } }
    day.slots.dinner = { ...day.slots.dinner, variantChoices: { 'chicken-3': 1 } }
    const s = summarizeDietDay(NEW, day)
    expect(s.proteinG).toBe(base.proteinG)
    expect(s.kcal - base.kcal).toBe(9 + 14)
  })

  it('목표(분모)는 변형 선택에 흔들리지 않는다', () => {
    const day = fullDay(NEW)
    day.slots.lunch = { ...day.slots.lunch, variantChoices: { 'chicken-2': 2 } }
    expect(summarizeDietDay(NEW, day).targetKcal).toBe(1781)
    expect(summarizeDietDay(NEW, day).targetProteinG).toBe(166)
  })

  it('점수는 변형 간 동등하다 (문서가 셋 다 허용한다)', () => {
    const ids = lunch().items.map((i) => i.id)
    const scores = [0, 1, 2].map((choice) =>
      slotScore(lunch(), { checkedItemIds: ids, variantChoices: { 'chicken-2': choice } }),
    )
    expect(scores).toEqual([1, 1, 1])
    // 가중도 기본 변형 기준이다 (선택에 따라 과거 점수가 흔들리지 않게)
    const chicken = lunch().items.find((i) => i.id === 'chicken-2')!
    expect(itemWeight(chicken)).toBe(180 + 34 * 4)
  })

  it('범위를 벗어난 인덱스는 기본으로 떨어진다 (플랜 교체 내구성)', () => {
    const chicken = lunch().items.find((i) => i.id === 'chicken-2')!
    expect(itemVariant(chicken, 9).name).toBe('닭가슴살')
    expect(itemVariant(chicken, undefined).name).toBe('닭가슴살')
  })

  it('백업 왕복에서 선택이 보존된다', () => {
    const day = fullDay(NEW)
    day.slots.lunch = { ...day.slots.lunch, variantChoices: { 'chicken-2': 2 } }
    const roundTrip = JSON.parse(JSON.stringify(day)) as DietDay
    expect(roundTrip.slots.lunch.variantChoices).toEqual({ 'chicken-2': 2 })
    expect(summarizeDietDay(NEW, roundTrip)).toEqual(summarizeDietDay(NEW, day))
  })
})

describe('DD3 5-b — 마지막 선택을 기억한다', () => {
  const lunch = () => slotOf(NEW, 'lunch')

  it('우선순위가 기록 → 기억값 → 기본이다', () => {
    const defaults = { [variantDefaultKey('lunch', 'chicken-2')]: 2 }
    // 미기록 슬롯: 기억값이 보인다
    expect(variantChoicesFor(lunch(), undefined, defaults)).toEqual({ 'chicken-2': 2 })
    // 기록이 있으면 기록이 이긴다 (과거 소급 없음)
    expect(
      variantChoicesFor(lunch(), { checkedItemIds: [], variantChoices: { 'chicken-2': 1 } }, defaults),
    ).toEqual({ 'chicken-2': 1 })
    // 둘 다 없으면 기본
    expect(variantChoicesFor(lunch(), undefined, undefined)).toEqual({ 'chicken-2': 0 })
  })

  it('변형이 없는 품목은 목록에 넣지 않는다', () => {
    expect(Object.keys(variantChoicesFor(slotOf(NEW, 'breakfast'), undefined, {}))).toEqual([])
  })

  it('기록이 생기는 순간 그때 보였던 선택이 기록에 새겨진다', () => {
    const defaults = { [variantDefaultKey('lunch', 'chicken-2')]: 2 }
    const day = applyCheckAllItems(emptyDietDay('2026-08-06', NEW.id, false), lunch())
    const seeded = seedVariantChoices(day, slotsFor(NEW), defaults)
    expect(seeded.slots.lunch.variantChoices).toEqual({ 'chicken-2': 2 })
    // 그래서 요약이 화면과 같은 말을 한다 (다리살 +160)
    expect(summarizeDietDay(NEW, seeded).kcal).toBe(
      summarizeDietDay(NEW, seedVariantChoices(day, slotsFor(NEW), {})).kcal + 160,
    )
  })

  it('이미 기록된 선택을 덮지 않는다 (기본값을 바꿔도 과거가 흔들리지 않는다)', () => {
    const day = applyCheckAllItems(emptyDietDay('2026-08-06', NEW.id, false), lunch())
    const chosen = applyVariantChoice(day, 'lunch', 'chicken-2', 1)
    const seeded = seedVariantChoices(chosen, slotsFor(NEW), {
      [variantDefaultKey('lunch', 'chicken-2')]: 2,
    })
    expect(seeded.slots.lunch.variantChoices).toEqual({ 'chicken-2': 1 })
  })

  it('미기록 슬롯에는 기록을 만들지 않는다 (먹기 전 선택이 0점이 되면 안 된다)', () => {
    const empty = emptyDietDay('2026-08-06', NEW.id, false)
    expect(applyVariantChoice(empty, 'lunch', 'chicken-2', 2)).toEqual(empty)
    expect(seedVariantChoices(empty, slotsFor(NEW), { 'lunch.chicken-2': 2 })).toEqual(empty)
    expect(summarizeDietDay(NEW, empty).loggedSlots).toBe(0)
  })

  it('항목 하나만 체크한 슬롯에도 새겨진다 (일괄 체크 경로만이 아니다)', () => {
    const day = applyToggleItem(emptyDietDay('2026-08-06', NEW.id, false), 'lunch', 'chicken-2')
    const seeded = seedVariantChoices(day, slotsFor(NEW), { 'lunch.chicken-2': 2 })
    expect(seeded.slots.lunch.variantChoices).toEqual({ 'chicken-2': 2 })
  })

  it('편집기가 모든 변경을 그 초크포인트로 통과시킨다', () => {
    const src = file('/src/components/DietDayEditor.tsx')
    // mutate 안에서 한 번만 부른다 (op마다 부르면 새 op에서 빠뜨린다)
    expect(src).toMatch(/mutateDietDay\(date, \{ \.\.\.day, isTrainingDay \}, \(d\) =>\s*seedVariantChoices\(fn\(d\), slots, variantDefaults\),?\s*\)/)
    expect((src.match(/seedVariantChoices\(/g) ?? []).length).toBe(1)
  })

  it('화면이 품목 표기를 직접 읽지 않는다 (변형 초크포인트를 지난다)', () => {
    const offenders = Object.entries(sources)
      .filter(([p]) => p.startsWith('/src/components/') || p.startsWith('/src/screens/'))
      .filter(([p]) => !p.includes('.test.'))
      .filter(([, src]) => /\bitem\.qty\b/.test(stripComments(src)))
      .map(([p]) => p)
    expect(offenders, '고른 변형이 아니라 기본 표기가 화면에 나옵니다 — itemVariant를 쓰세요').toEqual([])
  })

  it('그 스캔이 실제로 위반을 잡는다', () => {
    expect(/\bitem\.qty\b/.test(stripComments('<span>{item.qty}</span>'))).toBe(true)
    expect(/\bitem\.qty\b/.test(stripComments('<span>{variant.qty}</span>'))).toBe(false)
  })
})

describe('DD3 — 내보내기가 고른 단백질원을 적는다', () => {
  const dayWith = (choice: number): DietDay => {
    const day = fullDay(NEW)
    day.slots.lunch = { ...day.slots.lunch, variantChoices: { 'chicken-2': choice } }
    return day
  }

  it('기본이 아닌 변형은 이름·수량이 그대로 실린다 (LLM이 로테이션을 본다)', () => {
    const md = dietSectionMarkdown(NEW, dayWith(2)).join('\n')
    expect(md).toContain('단백질원: 닭다리살 200g · 그날 올리브오일 생략')
  })

  it('기본 변형이면 적지 않는다 (문서를 길게 만들지 않는다)', () => {
    expect(dietSectionMarkdown(NEW, dayWith(0)).join('\n')).not.toContain('단백질원:')
  })

  it('미섭취 목록도 고른 변형 이름을 쓴다', () => {
    const day = dayWith(1)
    day.slots.dinner = {
      checkedItemIds: ['brown-rice'],
      variantChoices: { 'chicken-3': 1 },
    }
    const md = dietSectionMarkdown(NEW, day).join('\n')
    expect(md).toContain('미섭취: 닭안심')
    expect(md).not.toContain('미섭취: 닭가슴살')
  })

  it('새 플랜에는 훈련일/휴식일 표기를 붙이지 않는다 (의미 없는 라벨을 주지 않는다)', () => {
    const md = dietSectionMarkdown(NEW, fullDay(NEW)).join('\n')
    expect(md).not.toContain('휴식일')
    expect(md).not.toContain('훈련일')
    // 옛 플랜에서는 그 표기가 남는다 (그때는 구성이 실제로 갈렸다)
    const old = dietSectionMarkdown(OLD, {
      date: '2026-08-04',
      planId: OLD.id,
      isTrainingDay: true,
      slots: Object.fromEntries(
        OLD.slots.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
      ) as Record<string, SlotRecord>,
    }).join('\n')
    expect(old).toContain('훈련일')
  })
})
