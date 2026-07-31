import { NO_COMPENSATION, parseRecordKey } from '../types'
import type { Phase, RoutineTemplate, Session } from '../types'
import { doneSets, findRoutineExercise } from './derive'

/**
 * 더블 프로그레션 증량 판정 (DESIGN.md §7).
 *
 *   모든 세트 reps ≥ repMax  AND  compensation == "없음"  → +weightIncrementKg
 *
 * A그룹만. Phase 0에서도 활성이다 (v2.4 — progressive overload가 근비대의 1차 드라이버이고,
 * 더블 프로그레션 조건 자체가 과욕을 막는 장치라는 근거. §7)
 *
 * prefill.ts의 computeProgression은 "다음 세션 프리필에 넣을 무게"를 구하고,
 * 이 함수는 "완료된 세션에서 달성한 종목 목록"을 구한다. 판정 규칙은 동일하다 —
 * 홈 배지(§5.1)와 세션 요약(§5.2)이 같은 답을 말해야 하므로 한 곳에 둔다.
 */
export interface ProgressionSuggestion {
  recordKey: string
  exerciseId: string
  from: number
  to: number
}

export function progressionSuggestions(
  session: Session,
  routine: RoutineTemplate,
  phase: Phase,
): ProgressionSuggestion[] {
  if (phase === 0 && !routine.rules.allowProgressionInPhase0) return []

  return session.entries.flatMap((entry) => {
    const { exerciseId, dayId } = parseRecordKey(entry.recordKey)
    const routineExercise = findRoutineExercise(routine, dayId, exerciseId)
    if (!routineExercise || routineExercise.group !== 'A') return []

    const sets = doneSets(entry)
    if (sets.length === 0) return []
    if (entry.compensation !== NO_COMPENSATION) return []
    if (!sets.every((s) => s.reps >= routineExercise.repMax)) return []

    const from = Math.max(...sets.map((s) => s.weight))
    return [
      {
        recordKey: entry.recordKey,
        exerciseId,
        from,
        to: from + routine.rules.weightIncrementKg,
      },
    ]
  })
}
