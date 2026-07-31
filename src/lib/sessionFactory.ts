import type {
  Phase,
  ReturnProtocolStep,
  RoutineDay,
  RoutineTemplate,
  Session,
  SessionEntry,
  SessionMode,
} from '../types'
import { NO_COMPENSATION, makeRecordKey, recordDayIdOf } from '../types'
import { buildPrefill, defaultSetFor, type RecordPrefill } from './prefill'

/** 머신 무게는 2.5kg 단위가 많지만 조절 결과가 애매하게 떨어지므로 0.5kg 단위로 맞춘다 */
export function roundToHalf(kg: number): number {
  return Math.round(kg * 2) / 2
}

/**
 * 디로드: 세트 −50%, 무게 유지 (§7 — 강도 감소형보다 볼륨 감소형이 근육·근력
 * 유지에 유리).
 */
export const DELOAD_SET_PCT = -50

export interface BuiltSession {
  session: Session
  prefills: Map<string, RecordPrefill>
}

export function buildSession(args: {
  routine: RoutineTemplate
  day: RoutineDay
  mode: SessionMode
  sessions: Session[]
  phase: Phase
  today: string
  now?: Date
  returnStep?: ReturnProtocolStep
}): BuiltSession {
  const { routine, day, mode, sessions, phase, today, now = new Date(), returnStep } = args

  const setPct = mode === 'return' ? (returnStep?.setPct ?? 0) : mode === 'deload' ? DELOAD_SET_PCT : 0
  const weightPct = mode === 'return' ? (returnStep?.weightPct ?? 0) : 0

  const prefills = new Map<string, RecordPrefill>()
  const entries: SessionEntry[] = day.exercises
    .slice()
    .sort((a, b) => a.plannedOrder - b.plannedOrder)
    .map((routineExercise) => {
      const recordKey = makeRecordKey(routineExercise.exerciseId, recordDayIdOf(day))
      const prefill = buildPrefill({ sessions, routine, recordKey, routineExercise, phase })
      prefills.set(recordKey, prefill)

      // 세트 수 조절. 최소 1세트는 남긴다
      const setCount = Math.max(1, Math.round(routineExercise.sets * (1 + setPct / 100)))

      const sets = Array.from({ length: setCount }, (_, i) => {
        const base = defaultSetFor(prefill, i, routineExercise, mode)
        return weightPct === 0
          ? base
          : { ...base, weight: roundToHalf(base.weight * (1 + weightPct / 100)) }
      })

      return {
        recordKey,
        plannedOrder: routineExercise.plannedOrder,
        performedOrder: null,
        sets,
        compensation: NO_COMPENSATION, // 빈칸 금지 규칙을 기본값으로 마찰 없이 충족 (§5.2)
        skipped: false,
      }
    })

  const session: Session = {
    id: crypto.randomUUID(),
    date: today,
    dayId: day.id,
    routineId: routine.id,
    mode,
    startedAt: now.toISOString(),
    entries,
  }

  return { session, prefills }
}
