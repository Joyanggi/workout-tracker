import type { RoutineDay, RoutineTemplate } from '../types'
import { findDay } from './derive'

/**
 * Day 선택 override (AA1) — **선택과 시작의 분리**.
 *
 * 피드백: "추천 Day 말고 다른 Day를 카드에서 고르면 시작 버튼 없이 바로 시작된다."
 * 제안 Day는 보고 나서 시작하는 2단(카드 → 시작 버튼)인데 다른 Day는 **보는 행위가 곧
 * 시작**인 1단이었다. 같은 결정(오늘 뭘 할까)의 무게가 경로에 따라 달라지고, 둘러보기가
 * 불가능하다 — 잘못 탭하면 세션이 생겨 버리거나 강제로 마감해야 한다 (Z5에서 사용자가
 * 겪은 것과 같은 부류의 마찰).
 *
 * 규칙 두 개를 함수로 못 박는다. 화면에 인라인으로 두면 카드와 시작 버튼이 각자 Day를
 * 골라 **보이는 Day와 시작되는 Day가 갈라질 수 있다** (이 프로젝트의 반복 결함 B).
 */

/**
 * 시트에서 고른 Day → 다음 override 값.
 *
 * **제안 Day를 다시 고르면 override를 지운다** (null) — "제안으로 되돌리기"를 별도 행으로
 * 만들지 않는다. 제안 행에 이미 "제안" 칩이 붙어 있으므로 그 행이 곧 되돌리기다.
 */
export function pickedIdFor(pickedDayId: string, suggestedDayId: string): string | null {
  return pickedDayId === suggestedDayId ? null : pickedDayId
}

/**
 * 카드·시작 버튼·디로드 시작이 **함께 쓰는 Day**.
 *
 * 못 찾으면 제안으로 되돌린다 — 시드 교체로 Day id가 사라졌을 때 실패하는 방향이
 * "제안 Day 시작"이어야 한다 (빈 화면이나 예외가 아니라 현상 유지).
 */
export function displayDay(
  routine: RoutineTemplate,
  pickedDayId: string | null,
  suggested: RoutineDay,
): RoutineDay {
  if (pickedDayId === null) return suggested
  return findDay(routine, pickedDayId) ?? suggested
}

/**
 * 카드가 제안 이유 자리에 쓸 문구.
 *
 * 직접 선택 상태에서 제안 이유를 그대로 두면 **다른 Day의 근거가 이 Day의 근거처럼**
 * 읽힌다. 제안이 무시된 게 아니라 보류된 것임을 화면이 말해야 한다.
 */
export function dayChoiceReason(
  pickedDayId: string | null,
  suggested: RoutineDay,
  suggestionReason: string,
): string {
  return pickedDayId === null ? suggestionReason : `직접 선택 — 제안은 ${suggested.name}`
}

/**
 * 홈 카드가 무엇을 가리키는가 (CC11).
 *
 * 피드백: "운동 중에 홈으로 나오면 카드가 지금 하는 운동으로, 시작 버튼이 '이어서 하기'로
 * 바뀌면 좋겠다. 실수로 누르면 세션이 날아갈까 불안하다."
 *
 * **데이터는 이미 안전했다** — `start()`가 열린 세션을 감지하면 OpenSessionSheet(이어서 /
 * 마치고 시작 / 버리고 시작)를 먼저 띄우고 `store.begin`도 덮어쓰기를 거부한다.
 * 유실 경로는 없었고, 고칠 것은 **화면이 그 사실을 말하지 않는 것**이었다.
 * 불안은 실재하고, 주 행동 버튼의 라벨이 정확하지 않은 것이 그 원인이다.
 *
 * **직접 선택이 세션 모드를 이긴다.** 세션 중에 [변경]으로 다른 Day를 고르는 것은
 * "갈아타겠다"는 명시적 의사표시이고, 그때 카드가 계속 진행 중 세션을 보여주면
 * 고른 결과가 화면에 나타나지 않는다 (AA1이 없애려던 형태다). 갈아타기 자체는
 * OpenSessionSheet 가드가 그대로 받는다.
 */
export interface HomeCardState {
  day: RoutineDay
  /** 제안 이유 자리에 쓸 문구 */
  reason: string
  /** primary 버튼 라벨 */
  cta: string
  /** 진행 중 세션 모드 — 버튼이 시작이 아니라 이어서 하기다 */
  resuming: boolean
}

export function homeCardState(args: {
  routine: RoutineTemplate
  suggested: RoutineDay
  suggestionReason: string
  pickedDayId: string | null
  /** 열린 세션의 dayId (없으면 null) */
  openDayId: string | null
}): HomeCardState {
  const { routine, suggested, suggestionReason, pickedDayId, openDayId } = args
  const picked = displayDay(routine, pickedDayId, suggested)

  if (openDayId !== null && pickedDayId === null) {
    // 세션의 Day를 못 찾으면(시드 교체) 제안으로 되돌린다 — displayDay와 같은 실패 방향
    const day = findDay(routine, openDayId) ?? suggested
    return {
      day,
      reason: '진행 중인 세션이 있어요',
      cta: '이어서 하기',
      resuming: true,
    }
  }

  return {
    day: picked,
    reason: dayChoiceReason(pickedDayId, suggested, suggestionReason),
    cta: `${picked.name} 시작`,
    resuming: false,
  }
}
