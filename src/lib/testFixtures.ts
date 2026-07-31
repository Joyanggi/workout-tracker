import routineJson from '../data/routine-v2.4.json'
import type { RoutineTemplate, Session, SessionEntry, SetRecord } from '../types'
import { NO_COMPENSATION, makeRecordKey, recordDayIdOf } from '../types'
import { findDay } from './derive'

export const ROUTINE = routineJson as unknown as RoutineTemplate

let counter = 0

/**
 * 해당 Day를 계획대로 전부 수행한 완료 세션. 테스트에서 이력을 만들 때 쓴다.
 * repMax를 채우게 하려면 fullReps를 켠다 (증량 제안 테스트용).
 */
export function completedSession(args: {
  dayId: string
  date: string
  startedAt?: string
  endedAt?: string
  fullReps?: boolean
  weight?: number
  /** 이 종목들만 수행 (부분 수행 시나리오) */
  onlyExercises?: string[]
  compensation?: string
}): Session {
  const {
    dayId,
    date,
    startedAt = `${date}T18:00:00.000Z`,
    endedAt = `${date}T19:30:00.000Z`,
    fullReps = false,
    weight = 40,
    onlyExercises,
    compensation = NO_COMPENSATION,
  } = args

  const day = findDay(ROUTINE, dayId)
  if (!day) throw new Error(`unknown day ${dayId}`)

  const entries: SessionEntry[] = day.exercises
    .filter((ex) => !onlyExercises || onlyExercises.includes(ex.exerciseId))
    .map((ex, i) => {
      const sets: SetRecord[] = Array.from({ length: ex.sets }, () => ({
        weight,
        reps: fullReps ? ex.repMax : ex.repMin,
        done: true,
        doneAt: startedAt,
      }))
      return {
        recordKey: makeRecordKey(ex.exerciseId, recordDayIdOf(day)),
        plannedOrder: ex.plannedOrder,
        performedOrder: i + 1,
        firstSetAt: startedAt,
        sets,
        compensation,
        skipped: false,
      }
    })

  counter += 1
  return {
    id: `test-${counter}`,
    date,
    dayId,
    routineId: ROUTINE.id,
    mode: 'normal',
    startedAt,
    endedAt,
    entries,
  }
}
