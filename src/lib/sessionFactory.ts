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
import type { WeightScaleMap } from './weightScale'

/** 머신 무게는 2.5kg 단위가 많지만 조절 결과가 애매하게 떨어지므로 0.5kg 단위로 맞춘다 */
export function roundToHalf(kg: number): number {
  return Math.round(kg * 2) / 2
}

/**
 * 디로드: 세트 −50%, 무게 유지 (§7 — 강도 감소형보다 볼륨 감소형이 근육·근력
 * 유지에 유리).
 */
export const DELOAD_SET_PCT = -50

/**
 * 방금 마감한 세션을 목록에 합류시킨다 (R4).
 *
 * `useLiveQuery`의 `sessions`는 마감 직후 아직 갱신되지 않았다. 그 목록으로 프리필을
 * 만들면 방금 한 기록이 다음 세션에 반영되지 않아 **프리필이 한 세션 뒤처진다**
 * ("마감하고 새로 시작" 경로). id로 중복을 제거하는 이유는 live query가 이미 갱신됐을
 * 수도 있어서다 — 같은 세션이 두 번 들어가면 최근 3세션 창이 왜곡된다.
 */
export function withJustFinished(sessions: Session[], justFinished?: Session | null): Session[] {
  if (!justFinished) return sessions
  return [justFinished, ...sessions.filter((s) => s.id !== justFinished.id)]
}

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
  /** 표시 무게가 클수록 쉬운 종목 (T8 어시스티드) — 프리필 기준 기록 비교 방향이 반대다 */
  isInverse?: (recordKey: string) => boolean
  /**
   * 종목별 무게 단위 (T9). **없으면 증량 프리필이 루틴 전역값을 쓴다** —
   * 5kg 머신에서 세션 화면 칩은 "40 → 45kg"인데 실제 세트에는 42.5가 들어가
   * 같은 화면이 서로 다른 말을 한다 (F6).
   */
  scales?: WeightScaleMap
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
      const prefill = buildPrefill({
        sessions,
        routine,
        recordKey,
        routineExercise,
        phase,
        scales: args.scales,
        inverse: args.isInverse?.(recordKey) ?? false,
      })
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
