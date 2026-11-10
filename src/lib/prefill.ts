import type {
  Phase,
  RecordKey,
  RoutineExercise,
  RoutineTemplate,
  Session,
  SessionMode,
  SetRecord,
} from '../types'
import { completedSessions, doneSets } from './derive'
import { painTrail, type PainTrail } from './pain'
import { judgeProgression, type ProgressionVerdict } from './progression'
import { bGroupGuide, type BGroupGuide } from './bGroupGuide'
import {
  scaleFor,
  snapDownToScale,
  type WeightScale,
  type WeightScaleMap,
} from './weightScale'

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
   * 직전 세션의 증량 판정 (up/hold + 사유). `progression`은 여기서 파생한다.
   * hold `sets`면 카드가 "지난번 상단 도달 · 계획 N세트 중 M세트" 칩을 띄운다 (GG1).
   */
  lastVerdict?: ProgressionVerdict
  /**
   * 가장 최근에 닿은 세션(작업 세트 또는 통증)에 통증이 있었으면 그 내용 (LL2).
   * 작업 세트 없이 통증만 적은 세션도 닿은 것으로 센다 — `history`와 기준이 다르다.
   */
  lastPain?: PainTrail
  /**
   * B그룹 무게 회복/복귀 신호 (T10, Phase 2+).
   *
   * 카드가 아니라 여기서 계산한다 — 프리필은 이미 "카드에 무엇을 넣을지"의 단일 출구이고,
   * 복귀는 프리필 무게 자체를 바꿔야 하는 규칙이라 두 곳에서 판단하면 어긋난다.
   */
  bGroup?: BGroupGuide
  /**
   * 첫 기록 종목의 **추정 시작 무게** (CC13).
   *
   * 기록이 하나라도 있으면 `undefined`다 — 실측이 있으면 추정이 끼어들 자리가 없다.
   * 값의 성격은 `SubstituteOption.startFactor`와 같다: **미검증 코칭 휴리스틱**이고
   * 본체는 첫 세트 RIR 3~4 캘리브레이션이다. 그래서 화면이 "추정"이라고 말한다.
   */
  startEstimate?: number
  /**
   * 이 recordKey에 **완료 세션 기록이 있는가** (v1.8 후속).
   *
   * 화면이 "처음 하는 종목인가"를 물을 때 쓴다. 이전에는 `prefill.best`의 부재로
   * 그 질문에 답했는데, 그건 **프리필 내부 사정**(최근 3세션 최고 기록의 유무)이지
   * "기록이 있는가"가 아니다. 대체 프리필을 채운 뒤로는 그 차이가 실제로 벌어진다 —
   * 질문을 그대로 담는 필드를 둔다.
   */
  hasHistory: boolean
}

/**
 * 첫 기록 종목의 시작 무게 추정 (CC13).
 *
 * 피드백: "기준 기록 없는 운동은 신체 조건으로 추정한 권장 시작 무게가 입력돼 있으면
 * 좋겠다. 안 맞으면 그날 조절할게."
 *
 * **조건 세 개가 다 맞아야 값이 나온다** — 기록이 없고, 체중이 있고, 계수가 있고.
 * 하나라도 없으면 `undefined`이고 현행(0kg)이 유지된다. 실패 방향이 현상 유지다.
 *
 * 어시스티드(inverse)는 여기서 계산하지 않는다: 보조 무게는 `substitute.assistWeightFor`가
 * 랫풀 실적에서 역산하는 별도 규칙이고, 체중 비율로 근사하면 방향이 뒤집힌 값이 나온다.
 */
export function startWeightEstimate(args: {
  hasHistory: boolean
  bodyWeightKg?: number
  startWeightPctBW?: number
  scale: WeightScale
}): number | undefined {
  const { hasHistory, bodyWeightKg, startWeightPctBW, scale } = args
  if (hasHistory || scale.inverse) return undefined
  if (bodyWeightKg === undefined || bodyWeightKg <= 0) return undefined
  if (startWeightPctBW === undefined || startWeightPctBW <= 0) return undefined
  // 내림으로 맞춘다 — 추정은 가벼운 쪽으로 틀리는 것이 맞다 (snapDownToScale 주석)
  const snapped = snapDownToScale(bodyWeightKg * startWeightPctBW, scale)
  return snapped > 0 ? snapped : undefined
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
  /** 첫 기록 추정용 (CC13). 없으면 추정하지 않는다 */
  bodyWeightKg?: number
  /** 카탈로그의 체중 대비 시작 계수 (CC13) */
  startWeightPctBW?: number
}): RecordPrefill {
  const {
    sessions,
    routine,
    recordKey,
    routineExercise,
    phase,
    scales,
    inverse = false,
    bodyWeightKg,
    startWeightPctBW,
  } = args
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

  const scale: WeightScale = {
    ...scaleFor(scales, recordKey, routine.rules.weightIncrementKg),
    inverse,
  }

  const trail = painTrail(sessions, recordKey)
  const lastVerdict = judgeProgression({
    routine,
    routineExercise,
    phase,
    sets: lastSets,
    compensation: lastEntry?.compensation,
    pain: trail !== undefined,
    mode: history[0]?.mode,
    scale,
  })

  return {
    recordKey,
    bestBySet,
    best,
    lastSets,
    hasHistory: history.length > 0,
    startEstimate: startWeightEstimate({
      hasHistory: history.length > 0,
      bodyWeightKg,
      startWeightPctBW,
      scale,
    }),
    bGroup: bGroupGuide({ history, recordKey, routineExercise, phase }),
    lastVerdict,
    lastPain: trail,
    progression: lastVerdict?.kind === 'up' ? { from: lastVerdict.from, to: lastVerdict.to } : undefined,
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
  lastPain?: boolean
  /** 종목별 무게 단위 (T9) + inverse 여부 (T8). 미지정 시 루틴 전역값 */
  scale?: WeightScale
}): { from: number; to: number | null } | undefined {
  const v = judgeProgression({
    routine: args.routine,
    routineExercise: args.routineExercise,
    phase: args.phase,
    sets: args.lastSets,
    compensation: args.lastCompensation,
    pain: args.lastPain,
    scale: args.scale,
  })
  return v?.kind === 'up' ? { from: v.from, to: v.to } : undefined
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
  // 기록이 없을 때만 추정이 base가 된다 (CC13) — ref가 있으면 실측이 이긴다
  const base = ref?.weight ?? prefill.startEstimate ?? 0
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
