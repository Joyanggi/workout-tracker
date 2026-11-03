import { describe, expect, it } from 'vitest'
import {
  itemVariant,
  pairedVariant,
  slotsFor,
  summarizeDietDay,
  todayVariantChoices,
  variantChoicesFor,
  variantDefaultKey,
  variantsOf,
} from './diet'
import {
  applyCheckAllItems,
  applyToggleItem,
  applyVariantChoice,
  emptyDietDay,
  seedVariantChoices,
} from './dietOps'
import { stripComments } from './sourceScan'
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

  it('점심 오일·아몬드를 생략하면 실효 +14kcal다 (문서의 실효 수치) — 두 플랜 모두', () => {
    for (const plan of [NEW, NEW_LOW]) {
      const [base, , thigh] = variantsOf(dinnerChicken(plan))
      const oil = slotOf(plan, 'lunch').items.find((i) => i.id === 'olive-oil')!
      const almond = slotOf(plan, 'afternoon').items.find((i) => i.id === 'almonds')!
      expect(thigh.kcal - base.kcal, plan.id).toBe(274)
      expect(thigh.kcal - base.kcal - oil.kcal - almond.kcal, plan.id).toBe(14)
    }
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
    // 이미 기록된 선택 인덱스의 뜻도 변하지 않는다 (1 = 안심, 새 3번째 다리살이 끼어들지 않는다)
    for (const plan of [NEW, NEW_LOW]) {
      const chicken = dinnerChicken(plan)
      expect(itemVariant(chicken, 0).name).toBe('닭가슴살')
      expect(itemVariant(chicken, 1)).toMatchObject({ name: '닭안심', qty: '270g', kcal: 284, proteinG: 51 })
      expect(itemVariant(chicken, 2).name).toBe('닭다리살')
    }
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

/**
 * v1.10 EE2 — 단백질원 짝 연동. **표시 기본값에만 작용한다** — 앱은 사용자 대신 기록하지 않는다.
 * 우선순위: ① 그 슬롯의 기록 > ② 같은 날 짝 슬롯의 기록에서 파생된 짝 > ③ 기억된 기본값 > ④ 0.
 */
describe('EE2 — 단백질원 짝 연동 (표시 기본값)', () => {
  const BREAST = 0
  const TENDERLOIN = 1
  const THIGH = 2
  const lunchOf = (plan: DietPlan) => slotOf(plan, 'lunch')
  const dinnerOf = (plan: DietPlan) => slotOf(plan, 'dinner')
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
  /** 점심을 기록하고(전부 체크) 그 선택을 새긴 날 */
  const lunchRecorded = (plan: DietPlan, choice: number): DietDay =>
    applyVariantChoice(
      applyCheckAllItems(emptyDietDay('2026-08-06', plan.id, false), lunchOf(plan)),
      'lunch',
      'chicken-2',
      choice,
    )

  it('짝 인덱스의 뜻이 두 플랜 데이터와 맞다 (점심·저녁 모두 0 가슴살 · 1 안심 · 2 다리살)', () => {
    for (const plan of [NEW, NEW_LOW]) {
      const lunch = lunchOf(plan).items.find((i) => i.id === 'chicken-2')!
      for (const item of [lunch, dinnerChicken(plan)]) {
        expect(variantsOf(item).map((v) => v.name), `${plan.id} ${item.id}`).toEqual([
          '닭가슴살',
          '닭안심',
          '닭다리살',
        ])
      }
    }
  })

  describe('우선순위 4단', () => {
    const defaults = { [variantDefaultKey('dinner', 'chicken-3')]: BREAST }

    it('① 그 슬롯의 기록된 선택이 짝·기억값보다 앞선다', () => {
      const today = { lunch: { 'chicken-2': THIGH }, dinner: { 'chicken-3': THIGH } }
      expect(pairedVariant('dinner', 'chicken-3', today, defaults)).toBe(THIGH)
    })

    it('② 같은 날 짝 슬롯의 기록이 기억된 기본값보다 앞선다 ("오늘의 사실" > "평소의 나")', () => {
      const today = { lunch: { 'chicken-2': THIGH } }
      expect(pairedVariant('dinner', 'chicken-3', today, defaults)).toBe(TENDERLOIN)
    })

    it('③ 짝이 없으면 기억된 기본값이다', () => {
      expect(pairedVariant('dinner', 'chicken-3', {}, { 'dinner.chicken-3': THIGH })).toBe(THIGH)
    })

    it('④ 아무것도 없으면 기본(0)이다', () => {
      expect(pairedVariant('dinner', 'chicken-3', {}, undefined)).toBe(BREAST)
      expect(pairedVariant('dinner', 'chicken-3', {}, {})).toBe(BREAST)
    })
  })

  describe('짝 규칙 ("다리살은 하루 한 끼만")', () => {
    const remembered = { 'dinner.chicken-3': TENDERLOIN, 'lunch.chicken-2': TENDERLOIN }

    it('점심 다리살 → 저녁 초기값은 안심', () => {
      expect(
        pairedVariant('dinner', 'chicken-3', { lunch: { 'chicken-2': THIGH } }, { 'dinner.chicken-3': THIGH }),
      ).toBe(TENDERLOIN)
    })

    it('점심 안심 → 저녁 초기값은 다리살 (기억값이 안심이어도)', () => {
      expect(
        pairedVariant('dinner', 'chicken-3', { lunch: { 'chicken-2': TENDERLOIN } }, remembered),
      ).toBe(THIGH)
    })

    it('점심 가슴살 → 저녁은 기억된 기본값 그대로', () => {
      const today = { lunch: { 'chicken-2': BREAST } }
      expect(pairedVariant('dinner', 'chicken-3', today, remembered)).toBe(TENDERLOIN)
      expect(pairedVariant('dinner', 'chicken-3', today, { 'dinner.chicken-3': THIGH })).toBe(THIGH)
      expect(pairedVariant('dinner', 'chicken-3', today, {})).toBe(BREAST)
    })

    it('역방향 — 저녁을 먼저 기록한 날: 저녁 다리살 → 점심 안심, 저녁 안심 → 점심 다리살, 저녁 가슴살 → 기억값', () => {
      expect(
        pairedVariant('lunch', 'chicken-2', { dinner: { 'chicken-3': THIGH } }, { 'lunch.chicken-2': THIGH }),
      ).toBe(TENDERLOIN)
      expect(pairedVariant('lunch', 'chicken-2', { dinner: { 'chicken-3': TENDERLOIN } }, {})).toBe(THIGH)
      expect(
        pairedVariant('lunch', 'chicken-2', { dinner: { 'chicken-3': BREAST } }, { 'lunch.chicken-2': THIGH }),
      ).toBe(THIGH)
    })

    it('짝 슬롯이 미기록이면 짝은 없다 — 짝은 기억값이 아니라 기록에서만 파생된다', () => {
      // 점심 기억값이 다리살이어도 점심이 기록되지 않았으면 저녁은 저녁의 기억값
      const defaults = { 'lunch.chicken-2': THIGH, 'dinner.chicken-3': BREAST }
      expect(pairedVariant('dinner', 'chicken-3', {}, defaults)).toBe(BREAST)
      expect(pairedVariant('dinner', 'chicken-3', { lunch: undefined }, defaults)).toBe(BREAST)
    })

    it('화면 경로(variantChoicesFor)가 같은 규칙을 쓴다 — 점심 다리살 기록 → 저녁 표시 안심', () => {
      for (const plan of [NEW, NEW_LOW]) {
        const day = lunchRecorded(plan, THIGH)
        expect(
          variantChoicesFor(dinnerOf(plan), day.slots.dinner, {}, todayVariantChoices(day)),
          plan.id,
        ).toEqual({ 'chicken-3': TENDERLOIN })
        expect(itemVariant(dinnerChicken(plan), TENDERLOIN).name).toBe('닭안심')
      }
    })
  })

  describe('짝 파생은 기록을 만들지 않는다 (v1.9 §5.3 유령 기록 금지)', () => {
    it('점심을 기록해도 저녁 슬롯은 미기록 그대로다 — 판정에 들어가지 않는다', () => {
      const day = lunchRecorded(NEW, THIGH)
      const seeded = seedVariantChoices(day, slotsFor(NEW), {})
      expect(seeded.slots.dinner).toBeUndefined()
      expect(Object.keys(seeded.slots)).toEqual(['lunch'])
      expect(summarizeDietDay(NEW, seeded).loggedSlots).toBe(1)
    })

    it('pairedVariant는 입력을 바꾸지 않는다 (순수 함수)', () => {
      const today = { lunch: { 'chicken-2': THIGH } }
      const defaults = { 'dinner.chicken-3': BREAST }
      const snapshot = JSON.stringify([today, defaults])
      pairedVariant('dinner', 'chicken-3', today, defaults)
      expect(JSON.stringify([today, defaults])).toBe(snapshot)
    })

    it('기록되는 순간에는 화면이 보여준 짝이 새겨진다 (화면과 판정이 갈리지 않는다)', () => {
      const before = lunchRecorded(NEW, THIGH)
      const defaults = { 'dinner.chicken-3': THIGH }
      const shown = variantChoicesFor(dinnerOf(NEW), undefined, defaults, todayVariantChoices(before))
      const seeded = seedVariantChoices(applyToggleItem(before, 'dinner', 'chicken-3'), slotsFor(NEW), defaults)
      expect(shown).toEqual({ 'chicken-3': TENDERLOIN })
      expect(seeded.slots.dinner.variantChoices).toEqual(shown)
    })

    it('이미 기록된 저녁 선택은 짝이 덮지 않는다', () => {
      const lunch = lunchRecorded(NEW, THIGH)
      const day = applyVariantChoice(applyToggleItem(lunch, 'dinner', 'chicken-3'), 'dinner', 'chicken-3', BREAST)
      expect(seedVariantChoices(day, slotsFor(NEW), {}).slots.dinner.variantChoices).toEqual({
        'chicken-3': BREAST,
      })
    })

    it('한 번의 새기기에서 막 새긴 값이 다른 슬롯의 짝이 되지 않는다 (들어온 기록에서만 파생)', () => {
      // 점심·저녁이 같은 패스에서 처음 기록되는 경우 — 둘 다 화면은 기억값을 보고 있었다
      let day = applyCheckAllItems(emptyDietDay('2026-08-06', NEW.id, false), lunchOf(NEW))
      day = applyCheckAllItems(day, dinnerOf(NEW))
      const defaults = { 'lunch.chicken-2': THIGH, 'dinner.chicken-3': THIGH }
      const seeded = seedVariantChoices(day, slotsFor(NEW), defaults)
      expect(seeded.slots.lunch.variantChoices).toEqual({ 'chicken-2': THIGH })
      expect(seeded.slots.dinner.variantChoices).toEqual({ 'chicken-3': THIGH })
    })

    it('편집기는 표시와 변형 시트 모두 같은 날 기록을 짝 규칙에 넘긴다', () => {
      const src = file('/src/components/DietDayEditor.tsx')
      const calls = src.match(/variantChoicesFor\([^;]*?todayVariantChoices\(day\),?\s*\)/g) ?? []
      expect(calls.length).toBe((src.match(/variantChoicesFor\(/g) ?? []).length)
      expect(calls.length).toBe(2)
    })

    it('화면 코드는 pairedVariant를 직접 부르지 않는다 (짝 파생은 lib의 표시·새기기 경로에만 있다)', () => {
      const offenders = Object.entries(sources)
        .filter(([p]) => p.startsWith('/src/components/') || p.startsWith('/src/screens/'))
        .filter(([, src]) => /pairedVariant\(/.test(stripComments(src)))
        .map(([p]) => p)
      expect(offenders).toEqual([])
    })
  })

  it('저녁 다리살이 초기값이 되는 날에도 점심 오일·오후 아몬드 슬롯은 건드리지 않는다 (강제 금지)', () => {
    for (const plan of [NEW, NEW_LOW]) {
      let day = lunchRecorded(plan, TENDERLOIN)
      day = applyCheckAllItems(day, slotOf(plan, 'afternoon'))
      day = applyCheckAllItems(day, dinnerOf(plan))
      const seeded = seedVariantChoices(day, slotsFor(plan), {})
      expect(seeded.slots.dinner.variantChoices, plan.id).toEqual({ 'chicken-3': THIGH })
      expect(seeded.slots.lunch.checkedItemIds).toEqual(day.slots.lunch.checkedItemIds)
      expect(seeded.slots.lunch.checkedItemIds).toContain('olive-oil')
      expect(seeded.slots.afternoon).toEqual(day.slots.afternoon)
    }
  })

  it('점심 다리살 + 저녁 다리살을 막지 않고, 오일·아몬드를 빼도 합계가 +174를 정직하게 보여준다', () => {
    const day = fullDay(NEW)
    day.slots.lunch = {
      checkedItemIds: slotOf(NEW, 'lunch').items.filter((i) => i.id !== 'olive-oil').map((i) => i.id),
      variantChoices: { 'chicken-2': THIGH },
    }
    day.slots.afternoon = { checkedItemIds: [] }
    // 짝은 저녁을 안심으로 보여주지만, 사용자가 다리살을 고르면 그대로 기록된다 (막지 않는다)
    expect(pairedVariant('dinner', 'chicken-3', todayVariantChoices(day), {})).toBe(TENDERLOIN)
    const chosen = applyVariantChoice(day, 'dinner', 'chicken-3', THIGH)
    const seeded = seedVariantChoices(chosen, slotsFor(NEW), {})
    expect(seeded.slots.dinner.variantChoices).toEqual({ 'chicken-3': THIGH })
    // 점심 다리살 +160 · 저녁 다리살 +274 · 오일 -115 · 아몬드 -145 = +174
    expect(summarizeDietDay(NEW, seeded).kcal).toBe(1781 + 174)
    expect(160 + 274 - 115 - 145).toBe(174)
  })
})
