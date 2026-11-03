import { describe, expect, it } from 'vitest'
import { itemVariant, slotsFor, summarizeDietDay, variantsOf } from './diet'
import { dietSectionMarkdown } from './exportMarkdown'
import { BUNDLED_DIET_PLANS } from '../db/seed'
import { validateDietPlan } from '../db/validateDietPlan'
import type { DietDay, DietPlan, DietSlot, SlotRecord } from '../types'

/**
 * v1.10 EE1 — 저녁 다리살 변형 (문서 15장 로테이션 표 2026-08-06 개정 미러링).
 * 조건(점심 오일·오후 아몬드 생략)은 문구로만 말하고 강제하지 않는다 — 합계가 사실을 보여준다.
 */

const NEW = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800-u')!
const NEW_LOW = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1500-u')!
const OLD = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!

const slotOf = (plan: DietPlan, id: string): DietSlot => slotsFor(plan).find((s) => s.id === id)!
const dinnerChicken = (plan: DietPlan) => slotOf(plan, 'dinner').items.find((i) => i.id === 'chicken-3')!

const fullDay = (plan: DietPlan): DietDay => ({
  date: '2026-08-06',
  planId: plan.id,
  isTrainingDay: false,
  slots: Object.fromEntries(
    slotsFor(plan).map((s) => [s.id, { checkedItemIds: s.items.map((i) => i.id) }]),
  ) as Record<string, SlotRecord>,
})

describe('EE1 — 저녁 다리살 변형', () => {
  it('저녁은 3택이다 (가슴살 3팩 / 안심 270g / 다리살 320g) — 두 플랜 모두', () => {
    for (const plan of [NEW, NEW_LOW]) {
      expect(variantsOf(dinnerChicken(plan)).map((v) => `${v.name} ${v.qty}`), plan.id).toEqual([
        '닭가슴살 3팩',
        '닭안심 270g',
        '닭다리살 320g · 그날 점심 오일·오후 아몬드 생략',
      ])
    }
  })

  it('다리살은 kcal 544 · 단백질 51이다 (가슴살과 단백질 등가)', () => {
    for (const plan of [NEW, NEW_LOW]) {
      const [base, , thigh] = variantsOf(dinnerChicken(plan))
      expect(thigh.kcal).toBe(544)
      expect(thigh.proteinG).toBe(51)
      expect(thigh.proteinG).toBe(base.proteinG)
    }
  })

  it('점심 오일·아몬드를 생략하면 실효 +14kcal다 (문서의 실효 수치)', () => {
    const [base, , thigh] = variantsOf(dinnerChicken(NEW))
    const oil = slotOf(NEW, 'lunch').items.find((i) => i.id === 'olive-oil')!
    const almond = slotOf(NEW, 'afternoon').items.find((i) => i.id === 'almonds')!
    expect(thigh.kcal - base.kcal).toBe(274)
    expect(thigh.kcal - base.kcal - oil.kcal - almond.kcal).toBe(14)
  })

  it('플랜 id는 유지된다 — 변형 추가는 새 플랜이 아니다', () => {
    expect(NEW.id).toBe('cut-1800-u')
    expect(NEW_LOW.id).toBe('cut-1500-u')
  })

  it('변형 추가 전에 기록된 저녁 슬롯의 마크로가 변하지 않는다 (variantChoices 부재 = 가슴살)', () => {
    const s = summarizeDietDay(NEW, fullDay(NEW))
    expect(s.kcal).toBe(1781)
    expect(s.proteinG).toBe(166)
    expect(itemVariant(dinnerChicken(NEW), undefined)).toEqual(variantsOf(dinnerChicken(NEW))[0])
  })

  it('옛 플랜은 여전히 변형이 없다', () => {
    expect(OLD.slots.flatMap((s) => s.items).every((i) => i.variants === undefined)).toBe(true)
  })

  it('두 플랜이 검증기를 통과하고 변형이 있는 품목은 점심·저녁 단백질원뿐이다', () => {
    for (const plan of [NEW, NEW_LOW]) {
      expect(validateDietPlan(plan), plan.id).toEqual([])
      const withVariants = slotsFor(plan).flatMap((s) =>
        s.items.filter((i) => i.variants).map((i) => `${s.id}.${i.id}`),
      )
      expect(withVariants).toEqual(['lunch.chicken-2', 'dinner.chicken-3'])
    }
  })

  it('다리살을 고르면 내보내기에 이름·수량이 그대로 실린다', () => {
    const day = fullDay(NEW)
    day.slots.dinner = { ...day.slots.dinner, variantChoices: { 'chicken-3': 2 } }
    expect(dietSectionMarkdown(NEW, day).join('\n')).toContain(
      '단백질원: 닭다리살 320g · 그날 점심 오일·오후 아몬드 생략',
    )
  })

  it('조건을 어기면 막지 않고 +274가 합계에 그대로 보인다 (오일·아몬드를 먹고 저녁 다리살)', () => {
    const day = fullDay(NEW)
    day.slots.dinner = { ...day.slots.dinner, variantChoices: { 'chicken-3': 2 } }
    expect(summarizeDietDay(NEW, day).kcal).toBe(1781 + 274)
    // 조건대로 오일·아몬드를 빼면 +14
    day.slots.lunch = {
      checkedItemIds: slotOf(NEW, 'lunch').items.filter((i) => i.id !== 'olive-oil').map((i) => i.id),
    }
    day.slots.afternoon = { checkedItemIds: [] }
    expect(summarizeDietDay(NEW, day).kcal).toBe(1781 + 274 - 115 - 145)
  })
})
