import { describe, expect, it } from 'vitest'
import { dietSectionMarkdown, exportMarkdown } from './exportMarkdown'
import { summarizeDietDay } from './diet'
import { BUNDLED_DIET_PLANS } from '../db/seed'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import type { DietDay, Exercise, SlotRecord } from '../types'

/**
 * 식단 내보내기 (D4) — **LLM 분석 경로**다.
 *
 * 대체 텍스트가 그대로 실려야 "회식 다음 날 아침 스킵이 반복" 같은 패턴을 잡을 수 있다.
 * 앱이 음식을 판단하지 않으므로, 판단의 재료를 손실 없이 넘기는 것이 이 경로의 목적이다.
 */

const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))
const PLAN = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!
const RANGE = { from: '2026-08-01', to: '2026-08-31' }

const allChecked = () =>
  Object.fromEntries(
    PLAN.slots.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
  ) as Record<string, SlotRecord>

const dietDay = (date: string, slots: Record<string, SlotRecord>, note?: string): DietDay => ({
  date,
  planId: PLAN.id,
  isTrainingDay: true,
  slots,
  note,
})

describe('dietSectionMarkdown', () => {
  it('플랜·훈련일·준수·단백질을 헤더에 담는다', () => {
    const lines = dietSectionMarkdown(PLAN, dietDay('2026-08-04', allChecked()))
    expect(lines[0]).toContain('감량 1,800')
    expect(lines[0]).toContain('훈련일')
    expect(lines[0]).toContain('●')
    expect(lines[0]).toContain('166g / 166g')
  })

  it('기록이 없으면 섹션을 만들지 않는다 (빈 헤더를 남기지 않는다)', () => {
    expect(dietSectionMarkdown(PLAN, dietDay('2026-08-04', {}))).toEqual([])
  })

  it('대체 문구를 그대로 싣는다 (따옴표 포함)', () => {
    const slots = allChecked()
    slots.lunch = {
      checkedItemIds: [],
      substitution: { text: '회사 근처 서브웨이 15cm 터키', quality: 'similar' },
    }
    const md = dietSectionMarkdown(PLAN, dietDay('2026-08-04', slots)).join('\n')
    expect(md).toContain('대체: "회사 근처 서브웨이 15cm 터키" — 비슷한 구성')
  })

  it('치팅·안 먹음을 구분해 적는다', () => {
    const slots = allChecked()
    slots.dinner = { checkedItemIds: [], substitution: { text: '떡볶이+튀김', quality: 'cheat' } }
    slots.pre = { checkedItemIds: [], skipped: true }
    const md = dietSectionMarkdown(PLAN, dietDay('2026-08-04', slots)).join('\n')
    expect(md).toContain('치팅')
    expect(md).toContain('안 먹음')
  })

  it('부분 수행은 미섭취 항목을 이름으로 적는다', () => {
    const slots = allChecked()
    const lunch = PLAN.slots.find((s) => s.id === 'lunch')!
    slots.lunch = { checkedItemIds: [lunch.items[0].id] }
    const md = dietSectionMarkdown(PLAN, dietDay('2026-08-04', slots)).join('\n')
    expect(md).toContain('미섭취:')
    expect(md).toContain(lunch.items[1].name)
    // 체크한 항목은 미섭취에 들어가지 않는다
    expect(md).not.toContain(`미섭취: ${lunch.items[0].name}`)
  })

  it('전부 안 먹은 슬롯은 미섭취 목록을 나열하지 않는다 (안 먹음으로 충분)', () => {
    const slots = allChecked()
    slots.pre = { checkedItemIds: [], skipped: true }
    const md = dietSectionMarkdown(PLAN, dietDay('2026-08-04', slots)).join('\n')
    expect(md).toContain('훈련 전: 안 먹음')
    expect(md).not.toMatch(/훈련 전: 안 먹음 \/ 미섭취/)
  })

  it('메모를 싣는다', () => {
    const md = dietSectionMarkdown(PLAN, dietDay('2026-08-04', allChecked(), '팀 회식')).join('\n')
    expect(md).toContain('메모: 팀 회식')
  })
})

describe('exportMarkdown 통합', () => {
  const session = completedSession({ dayId: 'd1', date: '2026-08-04', weight: 40 })

  const md = (dietDays: DietDay[], sessions = [session]) =>
    exportMarkdown({
      sessions,
      routine: ROUTINE,
      catalog,
      phase: 1,
      range: RANGE,
      dietPlans: BUNDLED_DIET_PLANS,
      dietDays,
    })

  it('식단이 같은 날짜의 운동 섹션 아래 붙는다', () => {
    const out = md([dietDay('2026-08-04', allChecked())])
    const dayHeader = out.indexOf('## 2026-08-04')
    const dietHeader = out.indexOf('### 식단')
    expect(dayHeader).toBeGreaterThanOrEqual(0)
    expect(dietHeader).toBeGreaterThan(dayHeader)
  })

  it('식단만 있는 날도 내보낸다 — 빼면 "회식 다음 날" 패턴을 볼 수 없다', () => {
    const out = md([dietDay('2026-08-06', allChecked())], [session])
    expect(out).toContain('## 2026-08-06')
    expect(out).toContain('운동 없음')
    expect(out.indexOf('## 2026-08-04')).toBeLessThan(out.indexOf('## 2026-08-06'))
  })

  it('범위 밖 식단은 넣지 않는다', () => {
    const out = md([dietDay('2026-09-02', allChecked())])
    expect(out).not.toContain('2026-09-02')
  })

  it('식단을 넘기지 않으면 기존 출력과 같다 (하위 호환)', () => {
    const withDiet = md([])
    const without = exportMarkdown({
      sessions: [session],
      routine: ROUTINE,
      catalog,
      phase: 1,
      range: RANGE,
    })
    expect(withDiet).toBe(without)
    expect(without).not.toContain('### 식단')
  })

  it('플랜 id가 사라진 기록은 조용히 건너뛴다 (화면·문서를 깨뜨리지 않는다)', () => {
    const orphan: DietDay = { ...dietDay('2026-08-04', allChecked()), planId: 'deleted' }
    const out = md([orphan])
    expect(out).toContain('## 2026-08-04')
    expect(out).not.toContain('### 식단')
  })

  it('같은 날 세션이 둘이면 식단은 한 번만 붙는다', () => {
    const second = completedSession({ dayId: 'd2', date: '2026-08-04', weight: 40 })
    const out = md([dietDay('2026-08-04', allChecked())], [session, second])
    expect(out.match(/### 식단/g)).toHaveLength(1)
  })
})

/**
 * 내보내기 범위가 식단 날짜도 본다 (D4 실측 결함).
 *
 * `rangeFor('all')`이 세션만 보고 시작일을 잡아서, 식단만 기록한 앞 날짜가 통째로
 * 빠졌다 (실측: 8/1·8/2 누락). 범위 계산은 ExportPanel에 있으므로 여기서는
 * "범위를 넓게 주면 전부 실린다"는 성질만 고정한다.
 */
describe('식단 날짜가 범위 밖이면 빠진다 (범위 계산의 근거)', () => {
  const days = [
    dietDay('2026-08-01', allChecked()),
    dietDay('2026-08-02', allChecked()),
    dietDay('2026-08-03', allChecked()),
  ]

  it('좁은 범위는 앞 날짜를 버린다', () => {
    const out = exportMarkdown({
      sessions: [],
      routine: ROUTINE,
      catalog,
      phase: 1,
      range: { from: '2026-08-03', to: '2026-08-03' },
      dietPlans: BUNDLED_DIET_PLANS,
      dietDays: days,
    })
    expect(out).not.toContain('2026-08-01')
    expect(out).toContain('2026-08-03')
  })

  it('식단 시작일을 포함하면 전부 실린다', () => {
    const out = exportMarkdown({
      sessions: [],
      routine: ROUTINE,
      catalog,
      phase: 1,
      range: { from: '2026-08-01', to: '2026-08-03' },
      dietPlans: BUNDLED_DIET_PLANS,
      dietDays: days,
    })
    expect(out.match(/### 식단/g)).toHaveLength(3)
    expect(out.indexOf('2026-08-01')).toBeLessThan(out.indexOf('2026-08-03'))
  })

  it('세션이 하나도 없어도 식단만으로 문서가 만들어진다', () => {
    const out = exportMarkdown({
      sessions: [],
      routine: ROUTINE,
      catalog,
      phase: 1,
      range: { from: '2026-08-01', to: '2026-08-03' },
      dietPlans: BUNDLED_DIET_PLANS,
      dietDays: days,
    })
    expect(out).not.toContain('(기간 내 기록 없음)')
  })
})

// ─── G2 추가 섭취 내보내기 ──────────────────────────────

describe('추가 섭취 (G2) 내보내기', () => {
  it('추가를 대체와 별개 줄로 적는다 — 결식·대체·과식이 구분돼야 분석이 된다', () => {
    const slots = allChecked()
    slots.dinner = {
      checkedItemIds: PLAN.slots.find((s) => s.id === 'dinner')!.items.map((i) => i.id),
      addition: { text: '라면 반 개', quality: 'cheat' },
    }
    const md = dietSectionMarkdown(PLAN, dietDay('2026-08-04', slots)).join('\n')
    expect(md).toContain('+ 추가: "라면 반 개" — 치팅')
    expect(md).not.toContain('대체: "라면 반 개"')
  })

  it('대체와 추가가 같은 슬롯에 있으면 둘 다 적는다', () => {
    const slots = allChecked()
    slots.lunch = {
      checkedItemIds: [],
      substitution: { text: '구내식당 제육', quality: 'other' },
      addition: { text: '아이스크림', quality: 'cheat' },
    }
    const md = dietSectionMarkdown(PLAN, dietDay('2026-08-04', slots)).join('\n')
    expect(md).toContain('대체: "구내식당 제육" — 다른 음식')
    expect(md).toContain('+ 추가: "아이스크림" — 치팅')
  })

  it('치팅 추가가 준수 판정에 반영된다', () => {
    const slots = allChecked()
    const withoutAdd = dietSectionMarkdown(PLAN, dietDay('2026-08-04', slots)).join('\n')
    expect(withoutAdd).toContain('준수 ●')

    // 6슬롯 전부 치팅 추가 → 상한 0.5가 전 슬롯에 걸려 ◐
    for (const s of PLAN.slots) {
      slots[s.id] = { ...slots[s.id], addition: { text: '야식', quality: 'cheat' } }
    }
    const withAdd = dietSectionMarkdown(PLAN, dietDay('2026-08-04', slots)).join('\n')
    expect(withAdd).toContain('준수 ◐')
  })

  it('단백질 추정에는 반영하지 않는다 (미지수)', () => {
    const slots = allChecked()
    const before = summarizeDietDay(PLAN, dietDay('2026-08-04', slots)).proteinG
    for (const s of PLAN.slots) {
      slots[s.id] = { ...slots[s.id], addition: { text: '고기 300g', quality: 'similar' } }
    }
    expect(summarizeDietDay(PLAN, dietDay('2026-08-04', slots)).proteinG).toBe(before)
  })
})
