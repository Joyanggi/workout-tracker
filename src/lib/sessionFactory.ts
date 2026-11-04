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
import { adjustedSetCount, modeAdjustFor, returnWeightFor } from './setPlan'
import { scaleFor, type WeightScaleMap } from './weightScale'

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
  /**
   * 첫 기록 시작 무게 추정 (CC13). 둘 다 있어야 추정이 나온다 — 없으면 현행(0kg)이다.
   * 계수를 함수로 받는 이유: 카탈로그를 이 모듈이 알 필요가 없다.
   */
  bodyWeightKg?: number
  startWeightPctBW?: (exerciseId: string) => number | undefined
}): BuiltSession {
  const { routine, day, mode, sessions, phase, today, now = new Date(), returnStep } = args

  // 조정률은 setPlan 한 곳에서 정하고 세션에 남긴다 (JJ1) — 나중에 "앱이 줄였나"를 되짚지 않아도 된다
  const modeAdjust = modeAdjustFor(mode, returnStep)
  const setPct = modeAdjust?.setPct ?? 0

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
        // 첫 기록 시작 무게 추정 (CC13). 세션 생성 시점의 프리필이 카드와 같아야 한다
        bodyWeightKg: args.bodyWeightKg,
        startWeightPctBW: args.startWeightPctBW?.(routineExercise.exerciseId),
      })
      prefills.set(recordKey, prefill)

      // 세트 수 조절. 최소 1세트는 남긴다
      const setCount = adjustedSetCount(routineExercise.sets, setPct)

      /*
       * 복귀 무게 (KK1). 기구에 있는 무게만 쓴다. **기록 없는 종목(추정 시작 무게)에는 걸지 않는다** —
       * 추정이 이미 가벼운 쪽 규칙이고(CC13) "기준"이라 부를 직전 수행이 없다.
       */
      const applies =
        mode === 'return' &&
        modeAdjust !== undefined &&
        modeAdjust.weightRule !== 'keep' &&
        prefill.startEstimate === undefined
      const scale = {
        ...scaleFor(args.scales, recordKey, routine.rules.weightIncrementKg),
        inverse: args.isInverse?.(recordKey) ?? false,
      }
      let baseMax = 0
      const sets = Array.from({ length: setCount }, (_, i) => {
        const base = defaultSetFor(prefill, i, routineExercise, mode)
        baseMax = Math.max(baseMax, base.weight)
        return applies && modeAdjust
          ? { ...base, weight: returnWeightFor(base.weight, modeAdjust, scale) }
          : base
      })
      // given === baseMax(사다리 최하단 등)도 남긴다 — "내릴 무게가 없었다"는 사실이다. 0kg 종목은 남기지 않는다
      const returnWeight =
        applies && modeAdjust && baseMax > 0
          ? { base: baseMax, given: returnWeightFor(baseMax, modeAdjust, scale) }
          : undefined

      return {
        recordKey,
        plannedOrder: routineExercise.plannedOrder,
        performedOrder: null,
        sets,
        compensation: NO_COMPENSATION, // 빈칸 금지 규칙을 기본값으로 마찰 없이 충족 (§5.2)
        skipped: false,
        // normal이면 키를 만들지 않는다 (JJ1)
        ...(modeAdjust ? { plannedSets: routineExercise.sets } : {}),
        ...(returnWeight ? { returnWeight } : {}),
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
    ...(modeAdjust ? { modeAdjust } : {}),
  }

  return { session, prefills }
}
