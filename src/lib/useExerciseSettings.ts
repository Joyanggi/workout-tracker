import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { ExerciseSetting } from '../types'

const EMPTY: ExerciseSetting[] = []

/**
 * 종목별 고정 설정 전체 (T4 메모 · T9 무게 단위).
 *
 * 맵으로 바로 만들지 않고 행을 그대로 준다 — 무게 단위의 기본값은 루틴의
 * `weightIncrementKg`이고, 그 값을 아는 곳은 루틴을 이미 로드한 호출부다.
 * 여기서 기본값을 추측하면(2.5 하드코딩) 루틴을 교체했을 때 조용히 틀린다.
 * 호출부에서 `buildScaleMap(rows, routine.rules.weightIncrementKg)`로 만든다.
 *
 * 행 수가 종목 수(수십 건) 규모라 통째로 읽는다.
 */
export function useExerciseSettings(): ExerciseSetting[] {
  return useLiveQuery(() => db.exerciseNotes.toArray(), [], EMPTY)
}
