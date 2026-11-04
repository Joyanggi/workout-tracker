import { describe, expect, it } from 'vitest'
import { dietSectionMarkdown } from './exportMarkdown'
import { SLOT_GRADE_HIGH, SLOT_GRADE_MID, SLOT_MARK, slotGrade, slotScore } from './diet'
import { stripComments } from './sourceScan'
import { BUNDLED_DIET_PLANS } from '../db/seed'
import type { DietDay, SlotRecord } from '../types'

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
