import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Exercise, RoutineTemplate, Session } from '../types'

export interface RoutineEditContext {
  routines: RoutineTemplate[]
  sessions: Session[]
  catalog: Exercise[]
}

/** 편집 화면이 읽는 DB 값 (읽기 전용 — 쓰기는 routineStore만). 새 Day·루틴 id가 겹치지 않게 모든 루틴·세션을 본다 */
export function useRoutineEditContext(): RoutineEditContext | undefined {
  return useLiveQuery(async () => ({
    routines: await db.routines.toArray(),
    sessions: await db.sessions.toArray(),
    catalog: await db.exercises.toArray(),
  }), [])
}
