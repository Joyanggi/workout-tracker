import { describe, expect, it } from 'vitest'
import {
  ADHERENCE_MARK,
  LOW_KCAL_STREAK_WARN,
  MIN_SLOTS_FOR_VERDICT,
  formatPlanLabel,
  dietMonthStats,
  nextUnloggedSlot,
  planStreak,
  planTotals,
  resolveTrainingDays,
  slotScore,
  slotsFor,
  summarizeDietDay,
} from './diet'
import { validateDietPlan } from '../db/validateDietPlan'
import { BUNDLED_DIET_PLANS, BUNDLED_DIET_REVISION } from '../db/seed'
import dietPlansJson from '../data/diet-plans.json'
import type { DietDay, DietPlan, SlotRecord } from '../types'

const PLAN = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!
const LOW = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1500')!

const day = (slots: Record<string, SlotRecord>, over: Partial<DietDay> = {}): DietDay => ({
  date: '2026-08-04',
  planId: PLAN.id,
  isTrainingDay: true,
  slots,
  ...over,
})

// ─── 시드 ────────────────────────────────────────────────

describe('번들 식단 플랜', () => {
  it('두 플랜이 정합성 검사를 통과한다', () => {
    expect(BUNDLED_DIET_PLANS.map((p) => p.id)).toEqual(['cut-1800', 'cut-1500'])
    for (const plan of BUNDLED_DIET_PLANS) {
      expect(validateDietPlan(plan), plan.id).toEqual([])
    }
  })

  it('훈련일 6슬롯 · 휴식일 5슬롯 (훈련 전·직후 통합)', () => {
    expect(PLAN.slots).toHaveLength(6)
    expect(PLAN.restDaySlots).toHaveLength(5)
    expect(PLAN.slots.map((s) => s.id)).toContain('pre')
    expect(PLAN.restDaySlots.map((s) => s.id)).not.toContain('pre')
  })

  it('휴식일 총량이 훈련일과 같다 (루틴 문서 15장 — 합치는 것이지 줄이는 것이 아니다)', () => {
    expect(planTotals(PLAN, false)).toEqual(planTotals(PLAN, true))
    expect(planTotals(LOW, false)).toEqual(planTotals(LOW, true))
  })

  it('보정 플랜은 저녁 현미밥 하나만 빠진 것이다', () => {
    const t = planTotals(PLAN)
    const l = planTotals(LOW)
    expect(t.kcal - l.kcal).toBe(215)
    expect(t.proteinG - l.proteinG).toBe(4)
    // 저녁 슬롯에서만 빠졌다 (다른 슬롯은 동일)
    for (const id of ['breakfast', 'lunch', 'afternoon', 'pre', 'post']) {
      expect(LOW.slots.find((s) => s.id === id)?.items).toEqual(
        PLAN.slots.find((s) => s.id === id)?.items,
      )
    }
  })

  it('kcalLabel은 항목 합계에서 파생된다 (손으로 적은 값이 남지 않는다)', () => {
    // 계획 문서 표기(1,796)와 항목 합계(1,781)가 어긋나 있었다 — 라벨을 파생시켜
    // 화면이 서로 다른 숫자를 말할 수 없게 만든다
    for (const plan of BUNDLED_DIET_PLANS) {
      expect(plan.kcalLabel, plan.id).toBe(formatPlanLabel(plan))
    }
    expect(PLAN.kcalLabel).toContain('1,781')
    expect(PLAN.kcalLabel).toContain('166g')
  })

  it('시드 리비전이 JSON과 일치한다 (R2 규칙)', () => {
    expect((dietPlansJson as { seedRevision: number }).seedRevision).toBe(BUNDLED_DIET_REVISION)
    expect(BUNDLED_DIET_PLANS.every((p) => p.seedRevision === BUNDLED_DIET_REVISION)).toBe(true)
  })
})

describe('validateDietPlan', () => {
  it('휴식일이 조용히 덜 먹는 플랜을 잡는다', () => {
    const broken: DietPlan = {
      ...PLAN,
      restDaySlots: PLAN.restDaySlots.filter((s) => s.id !== 'dinner'),
    }
    expect(validateDietPlan(broken).join(' ')).toContain('총량 불일치')
  })

  it('슬롯 안 항목 id 중복을 잡는다 (한 번 체크에 단백질이 두 번 더해진다)', () => {
    const dup: DietPlan = {
      ...PLAN,
      slots: PLAN.slots.map((s) =>
        s.id === 'lunch' ? { ...s, items: [s.items[0], s.items[0]] } : s,
      ),
    }
    expect(validateDietPlan(dup).join(' ')).toContain('항목 id 중복')
  })

  it('빈 슬롯 목록을 잡는다', () => {
    expect(validateDietPlan({ ...PLAN, slots: [] }).join(' ')).toContain('slots가 비어 있습니다')
  })
})

// ─── 슬롯 점수 ───────────────────────────────────────────

describe('slotScore', () => {
  const lunch = PLAN.slots.find((s) => s.id === 'lunch')! // 항목 4개
  const ids = lunch.items.map((i) => i.id)

  it('미기록은 null — 평균에 넣지 않는다', () => {
    expect(slotScore(lunch, undefined)).toBeNull()
  })

  it('전부 체크는 1', () => {
    expect(slotScore(lunch, { checkedItemIds: ids })).toBe(1)
  })

  it('절반 이상은 0.5, 절반 미만은 0.25', () => {
    expect(slotScore(lunch, { checkedItemIds: ids.slice(0, 2) })).toBe(0.5)
    expect(slotScore(lunch, { checkedItemIds: ids.slice(0, 1) })).toBe(0.25)
  })

  it('스킵은 0.5 — 감량 문맥에서 덜 먹은 것은 실패가 아니다', () => {
    expect(slotScore(lunch, { checkedItemIds: [], skipped: true })).toBe(0.5)
  })

  it('대체 태그가 체크 수보다 우선한다 (이중 감점 방지)', () => {
    // 일부만 체크하고 나머지를 다른 음식으로 메운 경우 — 체크 비율로 깎으면 두 번 깎인다
    const partialWithSub: SlotRecord = {
      checkedItemIds: ids.slice(0, 1),
      substitution: { text: '구내식당 제육', quality: 'similar' },
    }
    expect(slotScore(lunch, partialWithSub)).toBe(1)
  })

  it('대체 품질 3단이 각각 다른 점수다', () => {
    const of = (quality: 'similar' | 'other' | 'cheat') =>
      slotScore(lunch, { checkedItemIds: [], substitution: { text: 'x', quality } })
    expect(of('similar')).toBe(1)
    expect(of('other')).toBe(0.5)
    expect(of('cheat')).toBe(0)
  })

  it('플랜에 없는 항목 id는 세지 않는다 (플랜 교체 후 낡은 기록)', () => {
    expect(slotScore(lunch, { checkedItemIds: ['ghost-item'] })).toBe(0.25)
  })
})

// ─── 하루 요약 ───────────────────────────────────────────

describe('summarizeDietDay', () => {
  const allChecked = () =>
    Object.fromEntries(
      PLAN.slots.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
    ) as Record<string, SlotRecord>

  it('기록이 없으면 미기록 — 판정하지 않는다', () => {
    const s = summarizeDietDay(PLAN, undefined)
    expect(s.adherence).toBe('unlogged')
    expect(s.score).toBeNull()
    expect(s.targetProteinG).toBe(166)
  })

  it(`기록 슬롯이 ${MIN_SLOTS_FOR_VERDICT}개 미만이면 미기록`, () => {
    const two = summarizeDietDay(
      PLAN,
      day({ breakfast: { checkedItemIds: [] }, lunch: { checkedItemIds: [] } }),
    )
    expect(two.loggedSlots).toBe(2)
    expect(two.adherence).toBe('unlogged')
  })

  it('전부 체크하면 준수 ● 이고 단백질이 목표와 같다', () => {
    const s = summarizeDietDay(PLAN, day(allChecked()))
    expect(s.score).toBe(1)
    expect(s.adherence).toBe('good')
    expect(s.proteinG).toBe(s.targetProteinG)
    expect(s.kcal).toBe(s.targetKcal)
    expect(ADHERENCE_MARK[s.adherence]).toBe('●')
  })

  it('similar 대체는 그 슬롯 계획 단백질로 인정한다', () => {
    const slots = allChecked()
    const lunch = PLAN.slots.find((s) => s.id === 'lunch')!
    slots.lunch = { checkedItemIds: [], substitution: { text: '제육', quality: 'similar' } }
    const s = summarizeDietDay(PLAN, day(slots))
    expect(s.proteinG).toBe(s.targetProteinG) // 점심 계획 단백질이 그대로 인정됨
    expect(lunch.items.reduce((n, i) => n + i.proteinG, 0)).toBeGreaterThan(0)
  })

  it('other·cheat 대체는 단백질 0으로 둔다 (모르는 것을 추정하지 않는다)', () => {
    const slots = allChecked()
    const lunchProtein = PLAN.slots
      .find((s) => s.id === 'lunch')!
      .items.reduce((n, i) => n + i.proteinG, 0)
    slots.lunch = { checkedItemIds: [], substitution: { text: '떡볶이', quality: 'cheat' } }
    const s = summarizeDietDay(PLAN, day(slots))
    expect(s.proteinG).toBe(s.targetProteinG - lunchProtein)
  })

  it('휴식일이면 휴식일 슬롯으로 판정한다', () => {
    const rest = day(
      Object.fromEntries(
        PLAN.restDaySlots.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
      ) as Record<string, SlotRecord>,
      { isTrainingDay: false },
    )
    const s = summarizeDietDay(PLAN, rest)
    expect(s.totalSlots).toBe(5)
    expect(s.proteinG).toBe(166)
  })

  it('중간 준수는 ◐, 낮으면 ○', () => {
    const half = Object.fromEntries(
      PLAN.slots.map((s) => [s.id, { checkedItemIds: [], skipped: true }]),
    ) as Record<string, SlotRecord>
    expect(summarizeDietDay(PLAN, day(half)).adherence).toBe('mid')

    const cheat = Object.fromEntries(
      PLAN.slots.map((s) => [
        s.id,
        { checkedItemIds: [], substitution: { text: 'x', quality: 'cheat' as const } },
      ]),
    ) as Record<string, SlotRecord>
    expect(summarizeDietDay(PLAN, day(cheat)).adherence).toBe('poor')
  })

  it('슬롯 목록은 훈련일 여부로 갈린다', () => {
    expect(slotsFor(PLAN, true)).toBe(PLAN.slots)
    expect(slotsFor(PLAN, false)).toBe(PLAN.restDaySlots)
  })
})

// ─── 연속 저칼로리 가드 ──────────────────────────────────

describe('planStreak', () => {
  const mk = (date: string, planId: string): DietDay => ({
    date,
    planId,
    isTrainingDay: true,
    slots: {},
  })

  it('오늘부터 거슬러 연속된 일수를 센다', () => {
    const days = [mk('2026-08-04', LOW.id), mk('2026-08-03', LOW.id), mk('2026-08-02', LOW.id)]
    expect(planStreak(days, LOW.id, '2026-08-04')).toBe(3)
  })

  it('중간에 끊기면 거기서 멈춘다', () => {
    const days = [mk('2026-08-04', LOW.id), mk('2026-08-03', PLAN.id), mk('2026-08-02', LOW.id)]
    expect(planStreak(days, LOW.id, '2026-08-04')).toBe(1)
  })

  it('기록이 없는 날에서 멈춘다 (미기록을 연속으로 보지 않는다)', () => {
    const days = [mk('2026-08-04', LOW.id), mk('2026-08-02', LOW.id)]
    expect(planStreak(days, LOW.id, '2026-08-04')).toBe(1)
  })

  it(`${LOW_KCAL_STREAK_WARN}일째부터 경고 대상이다`, () => {
    const dates = ['2026-08-04', '2026-08-03', '2026-08-02', '2026-08-01']
    const days = dates.map((d) => mk(d, LOW.id))
    expect(planStreak(days, LOW.id, '2026-08-04')).toBeGreaterThanOrEqual(LOW_KCAL_STREAK_WARN)
  })

  it('오늘 기록이 없으면 0', () => {
    expect(planStreak([mk('2026-08-03', LOW.id)], LOW.id, '2026-08-04')).toBe(0)
  })
})

// ─── 월 집계 (D3) ────────────────────────────────────────

describe('dietMonthStats', () => {
  const mk = (date: string, planId: string, full: boolean): DietDay => ({
    date,
    planId,
    isTrainingDay: true,
    slots: full
      ? (Object.fromEntries(
          PLAN.slots.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
        ) as Record<string, SlotRecord>)
      : (Object.fromEntries(
          PLAN.slots.map((s) => [
            s.id,
            { checkedItemIds: [], substitution: { text: 'x', quality: 'cheat' as const } },
          ]),
        ) as Record<string, SlotRecord>),
  })

  it('그 달 기록만 세고 등급별로 나눈다', () => {
    const days = [
      mk('2026-08-01', PLAN.id, true),
      mk('2026-08-02', PLAN.id, false),
      mk('2026-07-31', PLAN.id, true), // 다른 달 — 제외
    ]
    const stats = dietMonthStats(days, BUNDLED_DIET_PLANS, '2026-08-15')
    expect(stats.logged).toBe(2)
    expect(stats.good).toBe(1)
    expect(stats.byDate.get('2026-08-01')).toBe('good')
    expect(stats.byDate.get('2026-08-02')).toBe('poor')
    expect(stats.byDate.has('2026-07-31')).toBe(false)
  })

  it('판정 불가한 날은 logged에 넣지 않는다 (링을 그리지 않는 근거)', () => {
    const sparse: DietDay = {
      date: '2026-08-03',
      planId: PLAN.id,
      isTrainingDay: true,
      slots: { breakfast: { checkedItemIds: [] } },
    }
    const stats = dietMonthStats([sparse], BUNDLED_DIET_PLANS, '2026-08-03')
    expect(stats.logged).toBe(0)
    expect(stats.byDate.get('2026-08-03')).toBe('unlogged')
  })

  it('플랜이 사라진 과거 기록도 화면을 깨뜨리지 않는다', () => {
    // 플랜 JSON을 교체해 id가 없어질 수 있다 — 운동 쪽 "루틴에 없음"과 같은 내구성
    const orphan = mk('2026-08-04', 'deleted-plan', true)
    const stats = dietMonthStats([orphan], BUNDLED_DIET_PLANS, '2026-08-04')
    expect(stats.byDate.get('2026-08-04')).toBe('unlogged')
    expect(stats.logged).toBe(0)
  })
})

// ─── 홈 칩 (D5) ──────────────────────────────────────────

describe('nextUnloggedSlot', () => {
  it('시간순 첫 미기록 슬롯을 준다', () => {
    const partial = day({ breakfast: { checkedItemIds: [] } })
    expect(nextUnloggedSlot(PLAN, partial, true)?.id).toBe('lunch')
  })

  it('기록이 없으면 첫 슬롯', () => {
    expect(nextUnloggedSlot(PLAN, undefined, true)?.id).toBe('breakfast')
  })

  it('전부 기록했으면 null (칩이 판정 마크로 바뀐다)', () => {
    const all = Object.fromEntries(
      PLAN.slots.map((s) => [s.id, { checkedItemIds: [] }]),
    ) as Record<string, SlotRecord>
    expect(nextUnloggedSlot(PLAN, day(all), true)).toBeNull()
  })

  it('휴식일이면 휴식일 슬롯에서 찾는다', () => {
    const rest = day({ breakfast: { checkedItemIds: [] } }, { isTrainingDay: false })
    const next = nextUnloggedSlot(PLAN, rest, false)
    expect(PLAN.restDaySlots.some((s) => s.id === next?.id)).toBe(true)
    expect(next?.id).not.toBe('pre')
  })

  it('건너뛴 슬롯도 "기록됨"이다 (안 먹은 것도 결정이다)', () => {
    const skipped = day({ breakfast: { checkedItemIds: [], skipped: true } })
    expect(nextUnloggedSlot(PLAN, skipped, true)?.id).toBe('lunch')
  })
})

// ─── 훈련일 정규화 (실기기 백업에서 드러난 결함) ─────────

describe('resolveTrainingDays', () => {
  const stored = (isTrainingDay: boolean): DietDay => ({
    date: '2026-08-03',
    planId: PLAN.id,
    isTrainingDay,
    slots: { breakfast: { checkedItemIds: [] } },
  })

  it('그 날 완료 세션이 있으면 훈련일로 덮는다', () => {
    // 아침을 운동 전에 기록하면 false로 저장된다. 이후 운동을 마쳐도 저장값은 그대로다
    const [fixed] = resolveTrainingDays([stored(false)], new Set(['2026-08-03']))
    expect(fixed.isTrainingDay).toBe(true)
  })

  it('세션이 없으면 저장값을 그대로 둔다 (수동 토글을 존중한다)', () => {
    const [kept] = resolveTrainingDays([stored(false)], new Set())
    expect(kept.isTrainingDay).toBe(false)
    const [keptTrue] = resolveTrainingDays([stored(true)], new Set())
    expect(keptTrue.isTrainingDay).toBe(true)
  })

  it('정규화하지 않으면 판정 슬롯 수가 갈라진다 (수정의 근거)', () => {
    const raw = stored(false)
    // 화면은 파생값(훈련일 6슬롯)으로 보는데 저장값으로 판정하면 휴식일 5슬롯이 된다
    expect(summarizeDietDay(PLAN, raw).totalSlots).toBe(5)
    const [fixed] = resolveTrainingDays([raw], new Set(['2026-08-03']))
    expect(summarizeDietDay(PLAN, fixed).totalSlots).toBe(6)
  })

  it('원본 객체를 변형하지 않는다', () => {
    const raw = stored(false)
    resolveTrainingDays([raw], new Set(['2026-08-03']))
    expect(raw.isTrainingDay).toBe(false)
  })
})

// ─── G4 삭제 후 상태 ─────────────────────────────────────

describe('식단 기록 삭제 (G4)', () => {
  const full = () =>
    Object.fromEntries(
      PLAN.slots.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
    ) as Record<string, SlotRecord>

  it('삭제된 날짜는 캘린더 링·월 요약에서 사라진다', () => {
    const days: DietDay[] = [
      { date: '2026-08-01', planId: PLAN.id, isTrainingDay: true, slots: full() },
      { date: '2026-08-02', planId: PLAN.id, isTrainingDay: true, slots: full() },
    ]
    const before = dietMonthStats(days, BUNDLED_DIET_PLANS, '2026-08-01')
    expect(before.logged).toBe(2)

    // 행 삭제 = 목록에서 빠지는 것 (플랜 선택도 함께 사라진다)
    const after = dietMonthStats(days.slice(1), BUNDLED_DIET_PLANS, '2026-08-01')
    expect(after.logged).toBe(1)
    expect(after.byDate.has('2026-08-01')).toBe(false)
  })

  it('삭제 후 그 날은 다시 "미기록"이다 (0점이 아니다)', () => {
    expect(summarizeDietDay(PLAN, undefined).adherence).toBe('unlogged')
    expect(summarizeDietDay(PLAN, undefined).score).toBeNull()
  })

  it('연속 플랜 카운트도 끊긴다', () => {
    const days: DietDay[] = [
      { date: '2026-08-03', planId: LOW.id, isTrainingDay: true, slots: {} },
      { date: '2026-08-02', planId: LOW.id, isTrainingDay: true, slots: {} },
    ]
    expect(planStreak(days, LOW.id, '2026-08-03')).toBe(2)
    // 8/3을 지우면 오늘 기록이 없으므로 0
    expect(planStreak(days.slice(1), LOW.id, '2026-08-03')).toBe(0)
  })
})
