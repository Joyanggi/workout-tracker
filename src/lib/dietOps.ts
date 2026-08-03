import type { DietDay, DietSlot, SlotRecord } from '../types'

/**
 * 식단 기록 변형 — 순수 함수 (D2).
 *
 * 화면은 이걸 호출하고 저장만 담당한다. 운동 세션(`sessionOps`)과 같은 구조이고
 * 같은 이유다: Dexie 없이 규칙을 검증할 수 있어야 한다.
 *
 * **저장 버튼은 없다.** 항목 탭 즉시 반영 (§5.2 write-through와 동일 사상).
 */

export function emptyDietDay(date: string, planId: string, isTrainingDay: boolean): DietDay {
  return { date, planId, isTrainingDay, slots: {} }
}

function patchSlot(
  day: DietDay,
  slotId: string,
  fn: (record: SlotRecord) => SlotRecord | undefined,
): DietDay {
  const current = day.slots[slotId] ?? { checkedItemIds: [] }
  const next = fn(current)
  const slots = { ...day.slots }
  // undefined를 반환하면 **키를 지운다** — 미기록과 "0점 기록"은 다르다
  if (next === undefined) delete slots[slotId]
  else slots[slotId] = next
  return { ...day, slots }
}

/**
 * 항목 하나 토글.
 *
 * `skipped`는 해제한다 — 안 먹었다고 해놓고 항목을 체크하는 것은 모순이다.
 * `substitution`은 **남긴다**: 일부만 계획대로 먹고 나머지를 다른 음식으로 메운
 * "일부 대체"가 실제로 흔하고, 계획서가 그것을 별도 상태 없이 데이터로 표현하라고 했다.
 */
export function applyToggleItem(day: DietDay, slotId: string, itemId: string): DietDay {
  return patchSlot(day, slotId, (record) => {
    const has = record.checkedItemIds.includes(itemId)
    return {
      ...record,
      checkedItemIds: has
        ? record.checkedItemIds.filter((id) => id !== itemId)
        : [...record.checkedItemIds, itemId],
      skipped: undefined,
    }
  })
}

/**
 * 전부 먹음 (일괄 체크) — 정상일의 주 경로다.
 * 슬롯 6개 × 1탭으로 하루가 끝나야 한다 (마찰 기준: 6~8탭).
 *
 * 대체·스킵을 지운다: 계획대로 전부 먹었다면 그 둘은 사실이 아니다.
 */
export function applyCheckAllItems(day: DietDay, slot: DietSlot): DietDay {
  /*
   * 대체·스킵은 지우지만 **추가는 남긴다** (G2) — "계획대로 다 먹었고 그 위에 더 먹었다"가
   * 실제로 흔한 조합이고, 일괄 체크가 추가 기록을 지워버리면 다시 적어야 한다.
   */
  return patchSlot(day, slot.id, (record) => ({
    ...record,
    checkedItemIds: slot.items.map((i) => i.id),
    substitution: undefined,
    skipped: undefined,
  }))
}

/** 그 끼니 자체를 안 먹음. 체크·대체를 비운다 */
export function applySkipSlot(day: DietDay, slotId: string): DietDay {
  return patchSlot(day, slotId, () => ({
    checkedItemIds: [],
    substitution: undefined,
    addition: undefined,
    skipped: true,
  }))
}

export function applySubstitution(
  day: DietDay,
  slotId: string,
  substitution: NonNullable<SlotRecord['substitution']>,
): DietDay {
  return patchSlot(day, slotId, (record) => ({
    ...record,
    substitution,
    skipped: undefined,
  }))
}

/**
 * 계획 외로 더 먹은 것 (G2). 대체와 **독립**이다 — 일부 대체 + 추가가 동시에 가능하다.
 * `skipped`는 해제한다 (안 먹었다면서 추가로 먹었다는 건 모순이다).
 */
export function applyAddition(
  day: DietDay,
  slotId: string,
  addition: NonNullable<SlotRecord['addition']>,
): DietDay {
  return patchSlot(day, slotId, (record) => ({ ...record, addition, skipped: undefined }))
}

/** 추가 기록만 지운다 (체크·대체는 유지) */
export function applyClearAddition(day: DietDay, slotId: string): DietDay {
  return patchSlot(day, slotId, (record) => ({ ...record, addition: undefined }))
}

/** 기록 취소 — 슬롯을 미기록 상태로 되돌린다 (잘못 누른 것을 없앨 수 있어야 한다) */
export function applyClearSlot(day: DietDay, slotId: string): DietDay {
  return patchSlot(day, slotId, () => undefined)
}

/**
 * 플랜 전환 (일 단위).
 *
 * 주 단위 전환은 제공하지 않는다 — 회식은 날짜 단위 사건이고, 주 단위 스위치는
 * "이번 주는 망함" 프레임을 만든다 (PLAN-DIET §0-1).
 */
export function applyPlan(day: DietDay, planId: string): DietDay {
  return { ...day, planId }
}

/**
 * 훈련일/휴식일 전환.
 *
 * 슬롯 구성이 바뀌므로 **기록은 유지하되 없는 슬롯의 키는 남는다** — 일부러 지우지 않는다.
 * 잘못 토글했다가 되돌렸을 때 기록이 사라지면 안 되고, 없는 슬롯 키는 판정에서
 * 자동으로 무시된다 (`summarizeDietDay`가 현재 구성의 슬롯만 순회한다).
 */
export function applyTrainingDay(day: DietDay, isTrainingDay: boolean): DietDay {
  return { ...day, isTrainingDay }
}

export function applyNote(day: DietDay, note: string): DietDay {
  return { ...day, note: note.trim() === '' ? undefined : note }
}
