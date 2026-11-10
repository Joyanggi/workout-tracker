import { describe, expect, it } from 'vitest'
import { dietSectionMarkdown, exportMarkdown } from './exportMarkdown'
import {
  ADHERENCE_GOOD,
  ADHERENCE_MARK,
  ADHERENCE_MID,
  MIN_SLOTS_FOR_VERDICT,
  dietMarkLegend,
  SLOT_GRADE_HIGH,
  SLOT_GRADE_MID,
  SLOT_MARK,
  dietDayStatusText,
  slotGrade,
  slotScore,
  summarizeDietDay,
  type DietDaySummary,
} from './diet'
import { stripComments } from './sourceScan'
import { BUNDLED_DIET_PLANS } from '../db/seed'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import type { DietDay, Exercise, SlotRecord } from '../types'

/** v1.11.2 II1 — 내보내기 슬롯 마크를 화면과 같은 slotGrade·SLOT_MARK로 */

const PLAN = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800-u')!
const slot = (id: string) => PLAN.slots.find((s) => s.id === id)!

const allChecked = () =>
  Object.fromEntries(
    PLAN.slots.map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
  ) as Record<string, SlotRecord>

const day = (slots: Record<string, SlotRecord>): DietDay => ({
  date: '2026-08-24',
  planId: PLAN.id,
  isTrainingDay: true,
  slots,
})
const lines = (slots: Record<string, SlotRecord>) => dietSectionMarkdown(PLAN, day(slots))
const slotLine = (slots: Record<string, SlotRecord>) =>
  lines(slots).find((l) => l.startsWith('- 슬롯:'))!

describe('II1', () => {
  it('보고서 사례: 아침 반숙란만 체크하면 아침 ◕', () => {
    const slots = { breakfast: { checkedItemIds: ['boiled-eggs'] } }
    expect(slotLine(slots)).toBe('- 슬롯: 아침 ◕')
    expect(lines(slots)).toContain('- 아침: 미섭취: 멀티비타민, 오메가3')
  })

  it('전부 체크는 ●', () => {
    const marks = slotLine(allChecked()).replace('- 슬롯: ', '').split(' · ')
    expect(marks.length).toBe(PLAN.slots.length)
    for (const m of marks) expect(m.endsWith(' ●')).toBe(true)
  })

  it('그냥 다른 음식 대체는 ◐', () => {
    const slots = { lunch: { checkedItemIds: [], substitution: { text: '샌드위치', quality: 'other' as const } } }
    expect(slotLine(slots)).toBe('- 슬롯: 점심 ◐')
  })

  it('안 먹음(일반 슬롯)은 ◐', () => {
    expect(slotLine({ afternoon: { checkedItemIds: [], skipped: true } })).toBe('- 슬롯: 오후 ◐')
  })

  it('보충 블록 안 먹음은 ◔', () => {
    expect(slotLine({ shake: { checkedItemIds: [], skipped: true } })).toBe('- 슬롯: 보충 블록 ◔')
  })

  it('주식을 빼면 ◔', () => {
    const ids = slot('lunch').items.map((i) => i.id).filter((id) => id !== 'brown-rice' && id !== 'chicken-2')
    expect(slotLine({ lunch: { checkedItemIds: ids } })).toBe('- 슬롯: 점심 ◔')
  })

  it('치팅 대체는 ✗', () => {
    const slots = { dinner: { checkedItemIds: [], substitution: { text: '떡볶이', quality: 'cheat' as const } } }
    expect(slotLine(slots)).toBe('- 슬롯: 저녁 ✗')
  })

  it('다른 음식 추가 상한 0.75는 ◐', () => {
    const slots = {
      dinner: {
        checkedItemIds: slot('dinner').items.map((i) => i.id),
        addition: { text: '과자', quality: 'other' as const },
      },
    }
    expect(slotLine(slots)).toBe('- 슬롯: 저녁 ◐')
  })

  it('경계: 0.8은 ◕, 0.45는 ◐', () => {
    expect(SLOT_GRADE_HIGH).toBe(0.8)
    expect(SLOT_GRADE_MID).toBe(0.45)
    expect(slotGrade(SLOT_GRADE_HIGH)).toBe('high')
    expect(slotGrade(SLOT_GRADE_MID)).toBe('mid')
  })

  it('내보내기와 화면이 같은 마크를 쓴다', () => {
    const cases: Record<string, SlotRecord>[] = [
      { breakfast: { checkedItemIds: ['boiled-eggs'] } },
      { shake: { checkedItemIds: [], skipped: true } },
      { afternoon: { checkedItemIds: [], skipped: true } },
      { dinner: { checkedItemIds: [], substitution: { text: 'x', quality: 'cheat' } } },
      { lunch: { checkedItemIds: ['vegetables', 'olive-oil'] } },
      allChecked(),
    ]
    for (const slots of cases) {
      const line = slotLine(slots).replace('- 슬롯: ', '').split(' · ')
      const logged = PLAN.slots.filter((s) => slots[s.id] !== undefined)
      expect(line.length).toBe(logged.length)
      logged.forEach((s, i) => {
        expect(line[i]).toBe(`${s.name} ${SLOT_MARK[slotGrade(slotScore(s, slots[s.id]))]}`)
      })
    }
  })
})

describe('II1 — 소스 스캔', () => {
  const raw = import.meta.glob(['/src/lib/exportMarkdown.ts', '/src/lib/diet.ts'], {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const get = (p: string) => {
    expect(raw[p], '파일을 찾지 못했다 — 검사가 헛돌고 있다').toBeDefined()
    return stripComments(raw[p])
  }

  it('exportMarkdown에 슬롯 마크 글자와 점수 비교가 없다', () => {
    const src = get('/src/lib/exportMarkdown.ts')
    for (const ch of ['●', '◕', '◐', '◔', '✗', '○']) {
      expect(src).not.toMatch(new RegExp(`['"\`]${ch}['"\`]`))
    }
    expect(src).not.toMatch(/score\s*>=?/)
    expect(src).toContain('SLOT_MARK[slotGrade(')
  })

  it('slotGrade에 임계값 리터럴이 없다', () => {
    const src = get('/src/lib/diet.ts')
    const start = src.indexOf('export function slotGrade(')
    expect(start).toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf('\n}\n', start))
    expect(body).not.toContain('0.8')
    expect(body).not.toContain('0.45')
  })
})

/** II2 — 내보내기 하루 헤더를 화면과 같은 문구로 */
describe('II2', () => {
  const status = (slots: Record<string, SlotRecord>) => dietDayStatusText(summarizeDietDay(PLAN, day(slots)))
  const header = (slots: Record<string, SlotRecord>, plan = PLAN, d = day(slots)) =>
    dietSectionMarkdown(plan, d)[0]
  const skipped = (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { checkedItemIds: [], skipped: true }])) as Record<string, SlotRecord>

  it('dietDayStatusText: 판정이 있으면 마크와 퍼센트', () => {
    expect(status(allChecked())).toBe('준수 ● 100%')
    // PLAN 픽스처: breakfast·lunch·afternoon·dinner만 안 먹음(각 0.5), shake 기록 없음 → 0.5 → ◐ 50%
    expect(status(skipped(['breakfast', 'lunch', 'afternoon', 'dinner']))).toBe('준수 ◐ 50%')
    // 같은 ◐ 50%를 치팅 추가 상한 0.5로도 만든다 (전 슬롯 체크 + 치팅 추가)
    const capped = allChecked()
    for (const sl of PLAN.slots) capped[sl.id] = { ...capped[sl.id], addition: { text: '야식', quality: 'cheat' } }
    expect(status(capped)).toBe('준수 ◐ 50%')
    expect(status(skipped(PLAN.slots.map((sl) => sl.id)))).toBe('준수 ○ 45%')
  })

  it('dietDayStatusText: 3슬롯 미만은 기록 n/m슬롯', () => {
    expect(status({ breakfast: { checkedItemIds: ['boiled-eggs'] } })).toBe('기록 1/5슬롯')
    expect(status({ breakfast: { checkedItemIds: ['boiled-eggs'] }, lunch: { checkedItemIds: [] } })).toBe('기록 2/5슬롯')
  })

  it('dietDayStatusText: 퍼센트 반올림', () => {
    const slots = { ...allChecked(), breakfast: { checkedItemIds: ['boiled-eggs'] } }
    expect(status(slots)).toBe('준수 ● 99%')
  })

  it('dietDayStatusText: 반올림 경계는 마크가 판정을 따른다', () => {
    const s: DietDaySummary = {
      score: 0.846, adherence: 'mid', loggedSlots: 5, totalSlots: 5,
      proteinG: 0, targetProteinG: 0, kcal: 0, targetKcal: 0,
      logCount: 0, logUnknown: 0, // MM2(PLAN-v1.15): DietDaySummary에 필드가 늘었다 — 기계적 결과
    }
    expect(dietDayStatusText(s)).toBe('준수 ◐ 85%')
  })

  it('내보내기 헤더: 보고서 사례(1슬롯)', () => {
    const h = header({ breakfast: { checkedItemIds: ['boiled-eggs'] } })
    expect(h).toContain('기록 1/5슬롯')
    expect(h).not.toContain('준수 —')
  })

  it('내보내기 헤더: 판정 있음', () => {
    expect(header(allChecked())).toContain('준수 ● 100% (단백질 추정 166g / 166g)')
  })

  it('내보내기 헤더: 치팅 추가 상한', () => {
    const slots = allChecked()
    for (const sl of PLAN.slots) slots[sl.id] = { ...slots[sl.id], addition: { text: '야식', quality: 'cheat' } }
    expect(header(slots)).toContain('준수 ◐ 50%')
  })

  it('옛 플랜 헤더: 훈련일 표기와 함께', () => {
    const old = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!
    const slots = Object.fromEntries(
      old.slots.map((sl) => [sl.id, { checkedItemIds: sl.items.map((i) => i.id) }]),
    ) as Record<string, SlotRecord>
    const d: DietDay = { date: '2026-08-24', planId: old.id, isTrainingDay: true, slots }
    expect(header(slots, old, d).startsWith('### 식단 — 감량 1,800 (구) · 훈련일 · 준수 ● 100%')).toBe(true)
  })

  it('내보내기와 화면이 같은 문구를 쓴다', () => {
    const cases: Record<string, SlotRecord>[] = [
      { breakfast: { checkedItemIds: ['boiled-eggs'] } },
      allChecked(),
      skipped(PLAN.slots.map((sl) => sl.id)),
      { ...allChecked(), ...skipped(['breakfast', 'lunch']) },
    ]
    for (const slots of cases) {
      expect(header(slots)).toContain(dietDayStatusText(summarizeDietDay(PLAN, day(slots))))
    }
  })
})

describe('II2 — 소스 스캔', () => {
  const raw = import.meta.glob(['/src/lib/exportMarkdown.ts', '/src/components/DietDayEditor.tsx'], {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  it('화면과 내보내기가 하루 문구를 직접 만들지 않는다', () => {
    for (const p of ['/src/lib/exportMarkdown.ts', '/src/components/DietDayEditor.tsx']) {
      expect(raw[p], '파일을 찾지 못했다 — 검사가 헛돌고 있다').toBeDefined()
      const src = stripComments(raw[p])
      expect(src).not.toContain('ADHERENCE_MARK[')
      expect(src).not.toContain('summary.score')
      expect(src).toContain('dietDayStatusText(')
    }
  })
})

/** II3 — 식단 범례를 문서 머리에 */
describe('II3', () => {
  const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))
  const session = completedSession({ dayId: 'd1', date: '2026-08-24', weight: 40 })
  const run = (dietDays: DietDay[], sessions = [session]) =>
    exportMarkdown({
      sessions, routine: ROUTINE, catalog, phase: 1,
      range: { from: '2026-08-01', to: '2026-08-31' },
      dietPlans: BUNDLED_DIET_PLANS, dietDays,
    })
  const legend = dietMarkLegend()
  const pct = (n: number) => `${Math.round(n * 100)}%`

  it('식단이 있으면 범례 두 줄이 간격 캡션 뒤에 온다', () => {
    const head = run([day(allChecked())]).split('\n')
    expect(head[2]).toMatch(/^> 간격 = /)
    expect(head[3]).toMatch(/^> 첫 세트는/)
    expect(head[4]).toBe(`> ${legend[0]}`)
    expect(head[5]).toBe(`> ${legend[1]}`)
  })

  it('식단만 있는 기간에도 범례가 있다', () => {
    const out = run([day(allChecked())], [])
    expect(out).toContain(legend[0])
    expect(out).toContain(legend[1])
  })

  it('식단이 없으면 머리가 그대로다', () => {
    const out = run([])
    expect(out).not.toContain(legend[0])
    expect(out.split('\n').slice(0, 4)).toEqual([
      '# 운동 기록 2026-08-01 ~ 2026-08-31',
      '',
      '> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**',
      '> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)',
    ])
    expect(out.split('\n')[4]).not.toMatch(/^> 식단/)
  })

  it('기록 슬롯이 0인 식단일만 있으면 범례가 없다', () => {
    const out = run([day({})], [])
    expect(out).not.toContain(legend[0])
  })

  it('범례 퍼센트가 상수와 맞는다', () => {
    expect(legend[0]).toContain(pct(SLOT_GRADE_HIGH))
    expect(legend[0]).toContain(pct(SLOT_GRADE_MID))
    expect(legend[1]).toContain(pct(ADHERENCE_GOOD))
    expect(legend[1]).toContain(pct(ADHERENCE_MID))
    expect(legend[1]).toContain(`${MIN_SLOTS_FOR_VERDICT}슬롯 미만`)
  })

  it('범례가 모든 마크를 말한다', () => {
    for (const k of ['full', 'high', 'mid', 'low', 'zero'] as const) {
      expect(legend[0]).toContain(SLOT_MARK[k])
    }
    for (const k of ['good', 'mid', 'poor'] as const) {
      expect(legend[1]).toContain(ADHERENCE_MARK[k])
    }
  })
})

describe('II3 — 소스 스캔', () => {
  const raw = import.meta.glob('/src/lib/diet.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  it('dietMarkLegend에 마크 글자와 임계 숫자 리터럴이 없다', () => {
    const src = stripComments(raw['/src/lib/diet.ts'])
    const start = src.indexOf('export function dietMarkLegend(')
    expect(start).toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf('\n}\n', start))
    for (const ch of ['●', '◕', '◐', '◔', '✗', '○']) expect(body).not.toContain(ch)
    for (const n of ['80', '45', '85', '50']) expect(body).not.toMatch(new RegExp(`(?<![\\w.])${n}(?![\\w])`))
  })
})
