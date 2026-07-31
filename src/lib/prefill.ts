import type {
  Phase,
  RecordKey,
  RoutineExercise,
  RoutineTemplate,
  Session,
  SessionMode,
  SetRecord,
} from '../types'
import { NO_COMPENSATION } from '../types'
import { completedSessions, doneSets } from './derive'
import { bGroupGuide, type BGroupGuide } from './bGroupGuide'
import { nextWeightForProgression, scaleFor, type WeightScale, type WeightScaleMap } from './weightScale'

/**
 * 무게·횟수 프리필 (DESIGN.md §5.2).
 *
 * **직전 세션이 아니라 최근 3세션 최고 기록을 기본값으로 쓴다.**
 * 직전 세션만 쓰면 컨디션 나쁜 날의 기록이 다음 세션의 기준점이 되어 하향 나선이
 * 생긴다 (§7 근거). 직전 기록은 비교용으로 같이 보여준다.
 */
export const RECENT_SESSIONS_FOR_PREFILL = 3

export interface SetRef {
  weight: number
  reps: number
}

export interface RecordPrefill {
  recordKey: RecordKey
  /** 세트 인덱스별 최근 3세션 최고 기록 */
  bestBySet: (SetRef | undefined)[]
  /** 인덱스별 기록이 없을 때 쓰는 전체 최고 */
  best?: SetRef
  /** 직전 세션의 세트 (고스트 표시용) */
  lastSets: SetRef[]
  /**
   * 더블 프로그레션 충족 → 증량 제안 (§7). 강제 아님.
   * `to === null`이면 사다리 최상단 (T9) — 프리필 무게는 그대로 두고 표시만 바꾼다.
   */
  progression?: { from: number; to: number | null }
  /**
   * B그룹 무게 회복/복귀 신호 (T10, Phase 2+).
   *
   * 카드가 아니라 여기서 계산한다 — 프리필은 이미 "카드에 무엇을 넣을지"의 단일 출구이고,
   * 복귀는 프리필 무게 자체를 바꿔야 하는 규칙이라 두 곳에서 판단하면 어긋난다.
   */
  bGroup?: BGroupGuide
}

/**
 * 더 나은 기록: 무게 우선, 동무게면 반복수.
 *
 * `inverse`(T8 어시스티드)에서는 **작은 보조가 더 나은 기록**이다. 이 반전이 없으면
 * 최근 3세션 중 가장 많이 보조받은(= 가장 쉬웠던) 세션이 프리필 기준이 되어
 * 회차마다 쉬워지는 방향으로 고착된다 — 하향 나선을 막으려고 "최고 기록 기준"을
 * 택한 §5.2 설계가 어시스티드에서는 정확히 반대로 작동한다.
 */
function better(a: SetRef | undefined, b: SetRef, inverse = false): SetRef {
  if (!a) return b
  const bIsBetter = inverse ? b.weight < a.weight : b.weight > a.weight
  if (bIsBetter) return b
  if (b.weight === a.weight && b.reps > a.reps) return b
  return a
}

/** 해당 recordKey가 등장한 완료 세션들, 최신순 */
export function sessionsForRecord(sessions: Session[], recordKey: RecordKey): Session[] {
  return completedSessions(sessions).filter((s) =>
    s.entries.some((e) => e.recordKey === recordKey && doneSets(e).length > 0),
  )
}

export function buildPrefill(args: {
  sessions: Session[]
  routine: RoutineTemplate
  recordKey: RecordKey
  routineExercise: RoutineExercise
  phase: Phase
  scales?: WeightScaleMap
  /** 표시 무게가 클수록 쉬운 종목 (T8 어시스티드) — 기준 기록 비교 방향이 반대다 */
  inverse?: boolean
}): RecordPrefill {
  const { sessions, routine, recordKey, routineExercise, phase, scales, inverse = false } = args
  const history = sessionsForRecord(sessions, recordKey)
  const recent = history.slice(0, RECENT_SESSIONS_FOR_PREFILL)

  const bestBySet: (SetRef | undefined)[] = []
  let best: SetRef | undefined

  for (const session of recent) {
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry) continue
    doneSets(entry).forEach((set, i) => {
      const ref = { weight: set.weight, reps: set.reps }
      bestBySet[i] = better(bestBySet[i], ref, inverse)
      best = better(best, ref, inverse)
    })
  }

  const lastEntry = history[0]?.entries.find((e) => e.recordKey === recordKey)
  const lastSets = lastEntry
    ? doneSets(lastEntry).map((s) => ({ weight: s.weight, reps: s.reps }))
    : []

  return {
    recordKey,
    bestBySet,
    best,
    lastSets,
    bGroup: bGroupGuide({ history, recordKey, routineExercise, phase }),
    progression: computeProgression({
      routine,
      routineExercise,
      phase,
      lastSets,
      lastCompensation: lastEntry?.compensation,
      scale: { ...scaleFor(scales, recordKey, routine.rules.weightIncrementKg), inverse },
    }),
  }
}

/**
 * 증량 제안 (§7):
 *   직전 세션 같은 recordKey에서 모든 세트 reps ≥ repMax
 *   AND compensation == "없음"
 *   → +weightIncrementKg 제안
 *
 * A그룹만. Phase 0에서도 활성이다 (v2.4 — progressive overload가 근비대의 1차
 * 드라이버이고, 더블 프로그레션 조건 자체가 과욕을 막는 장치라는 근거. §7)
 */
export function computeProgression(args: {
  routine: RoutineTemplate
  routineExercise: RoutineExercise
  phase: Phase
  lastSets: SetRef[]
  lastCompensation?: string
  /** 종목별 무게 단위 (T9) + inverse 여부 (T8). 미지정 시 루틴 전역값 */
  scale?: WeightScale
}): { from: number; to: number | null } | undefined {
  const { routine, routineExercise, phase, lastSets, lastCompensation } = args
  if (routineExercise.group !== 'A') return undefined
  if (phase === 0 && !routine.rules.allowProgressionInPhase0) return undefined
  if (lastSets.length === 0) return undefined
  if ((lastCompensation ?? NO_COMPENSATION) !== NO_COMPENSATION) return undefined
  // 계획 세트를 다 채운 세션만 증량 대상 (progression.ts와 동일 규칙)
  if (lastSets.length < routineExercise.sets) return undefined
  if (!lastSets.every((s) => s.reps >= routineExercise.repMax)) return undefined

  const from = Math.max(...lastSets.map((s) => s.weight))
  const scale = args.scale ?? { step: routine.rules.weightIncrementKg }
  return { from, to: nextWeightForProgression(from, scale) }
}

/**
 * 세트 인덱스에 넣을 기본값. 기록이 전혀 없으면 0kg × repMin.
 *
 * **디로드·복귀 모드에서는 증량 제안을 무시한다.**
 * 디로드 원칙은 "세트 −50%, 무게 유지"(§7)인데 progression.to를 쓰면 +2.5kg가 기본값이 된다.
 * 복귀 모드에서는 (이전 무게 +2.5) × 0.95가 되어 명세("이전 무게 −5%")와 다른 값이 나온다.
 * 두 모드 모두 "직전 무게를 기준으로 줄이는" 것이 목적이므로 증량과 섞일 수 없다.
 */
export function defaultSetFor(
  prefill: RecordPrefill,
  index: number,
  routineExercise: RoutineExercise,
  mode: SessionMode = 'normal',
): SetRecord {
  const ref = prefill.bestBySet[index] ?? prefill.best
  const base = ref?.weight ?? 0
  /*
    B그룹 복귀(T10)는 루틴 문서 9장이 "절대 기준"이라고 못 박은 규칙이므로 프리필을
    자동으로 이전 무게로 내린다. 회복 힌트('recover')는 제안이라 프리필을 바꾸지 않는다 —
    B그룹 성공 기준은 기록이 아니라 감각이고, 올릴지는 사용자가 결정한다.
    디로드·복귀 모드에서는 그 모드의 무게 규칙이 우선이므로 적용하지 않는다.
  */
  if (mode === 'normal' && prefill.bGroup?.kind === 'revert' && prefill.bGroup.to !== undefined) {
    return {
      weight: prefill.bGroup.to,
      reps: ref?.reps ?? routineExercise.repMin,
      done: false,
    }
  }
  const weight = mode === 'normal' ? (prefill.progression?.to ?? base) : base
  return {
    weight,
    reps: ref?.reps ?? routineExercise.repMin,
    done: false,
  }
}
