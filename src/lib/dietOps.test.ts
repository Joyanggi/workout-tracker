import { describe, expect, it } from 'vitest'
import {
  applyCheckAllItems,
  applyClearSlot,
  applyNote,
  applyPlan,
  applySkipSlot,
  applySubstitution,
  applyToggleItem,
  applyTrainingDay,
  emptyDietDay,
} from './dietOps'
import { slotScore, summarizeDietDay } from './diet'
import { BUNDLED_DIET_PLANS } from '../db/seed'

const PLAN = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!
const LUNCH = PLAN.slots.find((s) => s.id === 'lunch')!
const base = () => emptyDietDay('2026-08-04', PLAN.id, true)

describe('항목 토글', () => {
  it('체크·해제가 왕복한다', () => {
    const on = applyToggleItem(base(), LUNCH.id, LUNCH.items[0].id)
    expect(on.slots[LUNCH.id].checkedItemIds).toEqual([LUNCH.items[0].id])
    const off = applyToggleItem(on, LUNCH.id, LUNCH.items[0].id)
    expect(off.slots[LUNCH.id].checkedItemIds).toEqual([])
  })

  it('안 먹음 상태에서 항목을 체크하면 안 먹음이 풀린다 (모순 제거)', () => {
    const skipped = applySkipSlot(base(), LUNCH.id)
    const checked = applyToggleItem(skipped, LUNCH.id, LUNCH.items[0].id)
    expect(checked.slots[LUNCH.id].skipped).toBeUndefined()
  })

  it('대체는 유지한다 — "일부 대체"가 실제로 흔하다', () => {
    const sub = applySubstitution(base(), LUNCH.id, { text: '제육', quality: 'similar' })
    const checked = applyToggleItem(sub, LUNCH.id, LUNCH.items[0].id)
    expect(checked.slots[LUNCH.id].substitution?.text).toBe('제육')
    expect(checked.slots[LUNCH.id].checkedItemIds).toEqual([LUNCH.items[0].id])
  })
})

describe('전부 먹음 — 정상일의 주 경로', () => {
  it('슬롯 항목 전부를 체크한다', () => {
    const day = applyCheckAllItems(base(), LUNCH)
    expect(day.slots[LUNCH.id].checkedItemIds).toEqual(LUNCH.items.map((i) => i.id))
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(1)
  })

  it('대체·안 먹음을 지운다 (계획대로 먹었다면 둘은 사실이 아니다)', () => {
    let day = applySubstitution(base(), LUNCH.id, { text: '제육', quality: 'cheat' })
    day = applySkipSlot(day, LUNCH.id)
    day = applyCheckAllItems(day, LUNCH)
    expect(day.slots[LUNCH.id].substitution).toBeUndefined()
    expect(day.slots[LUNCH.id].skipped).toBeUndefined()
  })

  it('슬롯마다 한 번씩이면 하루가 끝난다 (마찰 기준 6~8탭)', () => {
    let day = base()
    let taps = 0
    for (const slot of PLAN.slots) {
      day = applyCheckAllItems(day, slot)
      taps += 1 // 시트의 [전부 먹음] 1탭 (슬롯 헤더 탭은 시트를 여는 동작)
    }
    expect(taps).toBe(6)
    const summary = summarizeDietDay(PLAN, day)
    expect(summary.adherence).toBe('good')
    expect(summary.proteinG).toBe(summary.targetProteinG)
  })
})

describe('안 먹음 · 대체 · 기록 지우기', () => {
  it('안 먹음은 체크와 대체를 비운다', () => {
    let day = applyCheckAllItems(base(), LUNCH)
    day = applySubstitution(day, LUNCH.id, { text: 'x', quality: 'other' })
    day = applySkipSlot(day, LUNCH.id)
    expect(day.slots[LUNCH.id]).toEqual({
      checkedItemIds: [],
      substitution: undefined,
      skipped: true,
    })
  })

  it('기록 지우기는 키를 제거한다 — 미기록과 0점은 다르다', () => {
    const day = applyClearSlot(applyCheckAllItems(base(), LUNCH), LUNCH.id)
    expect(LUNCH.id in day.slots).toBe(false)
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBeNull()
  })

  it('지운 슬롯은 하루 판정의 분모에서도 빠진다', () => {
    let day = base()
    for (const slot of PLAN.slots) day = applyCheckAllItems(day, slot)
    const cleared = applyClearSlot(day, LUNCH.id)
    expect(summarizeDietDay(PLAN, cleared).loggedSlots).toBe(PLAN.slots.length - 1)
  })
})

describe('플랜·훈련일 전환', () => {
  it('플랜은 그 날짜만 바꾼다', () => {
    const day = applyPlan(base(), 'cut-1500')
    expect(day.planId).toBe('cut-1500')
    expect(day.date).toBe('2026-08-04')
  })

  it('훈련일 토글이 기록을 지우지 않는다', () => {
    // 잘못 토글했다가 되돌렸을 때 기록이 사라지면 안 된다.
    // 없는 슬롯 키는 판정에서 자동으로 무시된다 (현재 구성의 슬롯만 순회하므로)
    const withPre = applyCheckAllItems(base(), PLAN.slots.find((s) => s.id === 'pre')!)
    const rest = applyTrainingDay(withPre, false)
    expect(rest.slots.pre).toBeDefined()
    expect(summarizeDietDay(PLAN, rest).totalSlots).toBe(5)
    const backToTraining = applyTrainingDay(rest, true)
    expect(summarizeDietDay(PLAN, backToTraining).loggedSlots).toBe(1)
  })
})

describe('메모', () => {
  it('빈 문자열은 저장하지 않는다', () => {
    expect(applyNote(base(), '  ').note).toBeUndefined()
    expect(applyNote(base(), '회식').note).toBe('회식')
  })
})
