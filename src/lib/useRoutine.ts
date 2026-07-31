import { useLiveQuery } from 'dexie-react-hooks'
import { db, getActiveRoutine } from '../db'
import type { Exercise, RoutineDay, RoutineTemplate } from '../types'

export interface RoutineBundle {
  routine: RoutineTemplate
  /** id → Exercise */
  catalog: Map<string, Exercise>
  /** days + fallbackDays 전체 */
  allDays: RoutineDay[]
}

/** 활성 루틴과 종목 카탈로그. Dexie 변경 시 자동 재조회된다. */
export function useRoutine(): RoutineBundle | undefined {
  return useLiveQuery(async () => {
    const routine = await getActiveRoutine()
    if (!routine) return undefined
    const exercises = await db.exercises.toArray()
    return {
      routine,
      catalog: new Map(exercises.map((e) => [e.id, e])),
      allDays: [...routine.days, ...routine.fallbackDays],
    }
  }, [])
}

export function dayTotalSets(day: RoutineDay): number {
  return day.exercises.reduce((sum, ex) => sum + ex.sets, 0)
}

export function exerciseLabel(catalog: Map<string, Exercise>, exerciseId: string): string {
  return catalog.get(exerciseId)?.shortName ?? exerciseId
}
