import type { DietDay, DietSlot, SlotRecord } from '../types'
import { hasVariants, variantDefaultKey } from './diet'

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

/**
 * 대체 기록만 지운다 (체크·추가는 유지) — `applyClearAddition`의 거울 (AA3).
 *
 * 이것이 없어서 **대체를 걷어내는 유일한 방법이 슬롯 전체 삭제**(`applyClearSlot`)였다.
 * 대체와 추가가 공존할 수 있는데 한쪽만 지울 수 있으면, 잘못 적은 대체를 고치려고
 * 추가 기록까지 다시 입력해야 한다 — 지우기가 비대칭이면 조작이 데이터 모델보다 좁다.
 */
export function applyClearSubstitution(day: DietDay, slotId: string): DietDay {
  return patchSlot(day, slotId, (record) => ({ ...record, substitution: undefined }))
}

/**
 * 단백질원 변형 선택 (DD3).
 *
 * **미기록 슬롯에는 기록을 만들지 않는다.** 만들면 `{ checkedItemIds: [] }`가 되어
 * 그 슬롯이 0점으로 판정에 들어간다 — 먹기 전에 "오늘은 다리살" 하고 고른 것이
 * "안 먹었다"로 집계되는 셈이다. 그 경우 선택은 `settings.variantDefaults`에만 남고
 * (표시는 그것으로 충분하다), 체크하는 순간 `seedVariantChoices`가 기록에 새긴다.
 */
export function applyVariantChoice(
  day: DietDay,
  slotId: string,
  itemId: string,
  index: number,
): DietDay {
  const record = day.slots[slotId]
  if (!record) return day
  return patchSlot(day, slotId, (current) => ({
    ...current,
    variantChoices: { ...current.variantChoices, [itemId]: index },
  }))
}

/**
 * 기록이 생기는 순간 **그때 화면에 보였던 변형을 기록에 새긴다** (DD3 5-b).
 *
 * 이것이 없으면 화면과 판정이 갈린다 (이 프로젝트의 결함 B): 기억된 기본값이 다리살이면
 * 카드에는 "닭다리살 200g"이 보이는데, 기록에는 선택이 없으니 요약은 가슴살 kcal로
 * 계산한다. 그래서 **기록은 항상 자기 자신으로 완결돼야 한다** — 설정을 나중에 바꿔도
 * 지난 날의 마크로가 흔들리지 않는 것도 같은 성질이다.
 *
 * 호출은 편집기의 `mutate` 한 곳에서 한다 (op마다 부르면 새 op를 추가할 때 빠뜨린다).
 */
export function seedVariantChoices(
  day: DietDay,
  slots: DietSlot[],
  defaults: Record<string, number> | undefined,
): DietDay {
  let next = day
  for (const slot of slots) {
    const record = next.slots[slot.id]
    if (!record) continue
    let choices = record.variantChoices
    for (const item of slot.items) {
      if (!hasVariants(item)) continue
      if (choices?.[item.id] !== undefined) continue
      choices = {
        ...choices,
        [item.id]: defaults?.[variantDefaultKey(slot.id, item.id)] ?? 0,
      }
    }
    if (choices !== record.variantChoices) {
      next = { ...next, slots: { ...next.slots, [slot.id]: { ...record, variantChoices: choices } } }
    }
  }
  return next
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

/*
 * `applyTrainingDay`는 **삭제했다** (DD2). 훈련일/휴식일 전환 UI가 없어졌고
 * (매일 같은 5끼), 남겨 두면 "기각된 구성으로 돌아가는 경로"가 된다 —
 * CC7-R에서 글라이드 심볼을 전부 지운 것과 같은 이유다.
 * 새 기록의 `isTrainingDay`는 `emptyDietDay`가 사실(근력 세션 유무)로 채운다.
 */

export function applyNote(day: DietDay, note: string): DietDay {
  return { ...day, note: note.trim() === '' ? undefined : note }
}
