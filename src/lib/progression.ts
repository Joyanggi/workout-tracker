import { NO_COMPENSATION, parseRecordKey } from '../types'
import type { Exercise, Phase, RoutineTemplate, Session } from '../types'
import { doneSets, routineExerciseOfEntry } from './derive'
import { nextWeightForProgression, scaleFor, type WeightScaleMap } from './weightScale'

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
 *
 * 증량 폭은 종목별 무게 단위(T9)를 따른다. `scales`를 넘기지 않으면 루틴 전역값이다.
 * `catalog`를 넘기면 어시스티드 머신(inverseWeight)의 증량 방향을 반대로 잡는다 (T8).
 */
export interface ProgressionSuggestion {
  recordKey: string
  exerciseId: string
  from: number
  /**
   * 다음 무게. **`null`이면 사다리 최상단** — 조건은 충족했지만 스택에 다음 핀이 없다.
   * 조건 충족 자체가 사용자에게 필요한 정보이므로 목록에서 빼지 않고 이 상태로 알린다.
   */
  to: number | null
  /** 표시 무게가 클수록 쉬운 종목 (어시스티드) — 진전은 숫자가 줄어드는 것 (T8) */
  inverse?: boolean
}

export function progressionSuggestions(
  session: Session,
  routine: RoutineTemplate,
  phase: Phase,
  scales?: WeightScaleMap,
  catalog?: Map<string, Exercise>,
): ProgressionSuggestion[] {
  if (phase === 0 && !routine.rules.allowProgressionInPhase0) return []

  return session.entries.flatMap((entry) => {
    const { exerciseId } = parseRecordKey(entry.recordKey)
    // 대체 수행도 원 종목의 그룹·목표 반복수로 판정한다 (T8)
    const routineExercise = routineExerciseOfEntry(routine, entry)
    if (!routineExercise || routineExercise.group !== 'A') return []

    const sets = doneSets(entry)
    if (sets.length === 0) return []
    if (entry.compensation !== NO_COMPENSATION) return []
    // 계획 세트를 다 채워야 한다. 4세트 계획 중 2세트만 하고 둘 다 상단이면
    // "12/12"로 증량이 제안되는데, 루틴 문서의 더블 프로그레션 기준은 전 세트(12/12/12/12)다.
    // 기준은 루틴 정의값(routineExercise.sets) — 디로드로 줄어든 세트 수가 아니다.
    if (sets.length < routineExercise.sets) return []
    if (!sets.every((s) => s.reps >= routineExercise.repMax)) return []

    const from = Math.max(...sets.map((s) => s.weight))
    const scale = scaleFor(scales, entry.recordKey, routine.rules.weightIncrementKg)
    const inverse = catalog?.get(exerciseId)?.inverseWeight === true
    return [
      {
        recordKey: entry.recordKey,
        exerciseId,
        from,
        to: nextWeightForProgression(from, { ...scale, inverse }),
        inverse,
      },
    ]
  })
}
