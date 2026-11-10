import { parseRecordKey } from '../types'
import { hasCompensation } from './compensation'
import { hasPain } from './pain'
import type {
  Exercise,
  Phase,
  RoutineExercise,
  RoutineTemplate,
  Session,
  SessionEntry,
  SessionMode,
} from '../types'
import { doneSets, routineExerciseOfEntry } from './derive'
import type { SetRef } from './prefill' // 타입 전용 — prefill이 이 파일을 값으로 import하므로 순환 방지
import {
  isInverseKey,
  nextWeightForProgression,
  scaleFor,
  type WeightScale,
  type WeightScaleMap,
} from './weightScale'

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

/** 증량하지 않는 이유. 판정 순서(위에서 처음 걸리는 것)가 곧 우선순위다. */
export type HoldReason =
  | { kind: 'phase0' } // Phase 0 + allowProgressionInPhase0=false
  | { kind: 'pain' } // 통증 있음 (LL2)
  | { kind: 'compensation' } // 보상작용 있음
  | { kind: 'reps'; reached: number; total: number; repMax: number } // 상단 도달 세트 수 / 수행 세트 수
  | { kind: 'sets'; done: number; planned: number; mode: SessionMode } // 전 세트 상단, 세트 부족

export type ProgressionVerdict =
  | { kind: 'up'; from: number; to: number | null } // to=null → 스택 최대
  | { kind: 'hold'; from: number; reason: HoldReason }

/**
 * 증량 판정의 **유일한 초크포인트.** progressionSuggestions·computeProgression·buildPrefill이
 * 모두 이 함수를 거친다 — 규칙을 다른 곳에 복제하지 않는다 (소스 스캔이 잠근다).
 *
 * 순서: 0 판정 대상 아님 → 1 Phase 0 → 2 통증 → 3 보상작용 → 4 반복 미달 → 5 세트 부족 → 증량.
 * 0이 통증보다 앞이다 — 세트가 없으면 보류할 무게(`from`)가 없다 (LL2).
 * 반복 미달을 세트 부족보다 먼저 본다: 반복이 모자라면 세트를 채워도 증량이 안 되므로 "세트 부족"은 틀린 처방이다.
 * `mode`는 사유 문구에만 쓰고 판정에는 쓰지 않는다.
 */
export function judgeProgression(args: {
  routine: RoutineTemplate
  routineExercise: RoutineExercise
  phase: Phase
  sets: SetRef[] // doneSets 결과 (워밍업 제외)
  compensation?: string
  pain?: boolean
  mode?: SessionMode
  scale?: WeightScale
}): ProgressionVerdict | undefined {
  const { routine, routineExercise, phase, sets } = args
  if (routineExercise.group !== 'A' || sets.length === 0) return undefined

  const from = Math.max(...sets.map((s) => s.weight))
  if (phase === 0 && !routine.rules.allowProgressionInPhase0) {
    return { kind: 'hold', from, reason: { kind: 'phase0' } }
  }
  if (args.pain) {
    return { kind: 'hold', from, reason: { kind: 'pain' } }
  }
  if (hasCompensation(args.compensation)) {
    return { kind: 'hold', from, reason: { kind: 'compensation' } }
  }
  const reached = sets.filter((s) => s.reps >= routineExercise.repMax).length
  if (reached < sets.length) {
    return {
      kind: 'hold',
      from,
      reason: { kind: 'reps', reached, total: sets.length, repMax: routineExercise.repMax },
    }
  }
  // 기준은 루틴 정의값(routineExercise.sets) — 디로드로 줄어든 세트 수가 아니다.
  if (sets.length < routineExercise.sets) {
    return {
      kind: 'hold',
      from,
      reason: { kind: 'sets', done: sets.length, planned: routineExercise.sets, mode: args.mode ?? 'normal' },
    }
  }
  const scale = args.scale ?? { step: routine.rules.weightIncrementKg }
  return { kind: 'up', from, to: nextWeightForProgression(from, scale) }
}

const MODE_SUFFIX: Record<SessionMode, string> = {
  normal: '',
  return: ' · 복귀 세션',
  deload: ' · 디로드 세션',
}

/** 보류 사유 문구 — 화면·내보내기가 쓰는 문구는 여기 한 곳에만 둔다 */
export function holdReasonText(reason: HoldReason): string {
  switch (reason.kind) {
    case 'phase0':
      return 'Phase 0 — 증량 판정 꺼짐'
    case 'pain':
      return '통증 있음'
    case 'compensation':
      return '보상작용 있음'
    case 'reps':
      return `반복 상단(${reason.repMax}회) 미달 — ${reason.total}세트 중 ${reason.reached}세트 도달`
    case 'sets':
      return `반복 상단 도달 · 계획 ${reason.planned}세트 중 ${reason.done}세트${MODE_SUFFIX[reason.mode]} — ${reason.planned}세트로는 아직 시험 안 됨`
  }
}

/** 다음 세션 카드 칩 문구. 세트 부족(`sets`)일 때만 말한다 — 그 외 사유·증량은 undefined */
export function lastHoldChipText(verdict: ProgressionVerdict | undefined): string | undefined {
  if (verdict?.kind !== 'hold' || verdict.reason.kind !== 'sets') return undefined
  const { done, planned, mode } = verdict.reason
  return `지난번 상단 도달 · 계획 ${planned}세트 중 ${done}세트 완료${MODE_SUFFIX[mode]} — 오늘 ${planned}세트 모두 완료하면 증량 판정`
}

/**
 * 복귀·디로드 세션 카드 칩 (GG2). 완료 작업 세트(`doneSets`)가 계획보다 적을 때만 말한다.
 * 세는 기준이 `judgeProgression`의 `sets`와 같다 — 행 수를 세지 않는다.
 * 대체 종목은 호출부가 `routineExerciseOfEntry` 결과(원 종목)를 넘긴다.
 */
export function modeSetNotice(
  mode: SessionMode,
  routineExercise: RoutineExercise,
  entry: SessionEntry,
): string | undefined {
  if (mode === 'normal' || routineExercise.group !== 'A') return undefined
  const done = doneSets(entry).length
  if (done >= routineExercise.sets) return undefined
  return `${MODE_SUFFIX[mode].slice(3)} · 계획 ${routineExercise.sets}세트 중 ${done}세트 완료 — 증량 판정은 계획 세트를 모두 완료한 세션에서`
}

/** 세션의 A그룹 entry별 판정 (up/hold). 내보내기·요약이 쓴다. 판정 대상 아닌 entry는 없다. */
export function progressionVerdicts(
  session: Session,
  routine: RoutineTemplate,
  phase: Phase,
  scales?: WeightScaleMap,
  catalog?: Map<string, Exercise>,
): Map<string, ProgressionVerdict> {
  const out = new Map<string, ProgressionVerdict>()
  for (const entry of session.entries) {
    // 대체 수행도 원 종목의 그룹·목표 반복수로 판정한다 (T8)
    const routineExercise = routineExerciseOfEntry(routine, entry)
    if (!routineExercise) continue
    // 해석은 weightScale.isInverseKey 한 곳에 모여 있다 (T8 §2a)
    const inverse = catalog ? isInverseKey(catalog, entry.recordKey) : false
    const verdict = judgeProgression({
      routine,
      routineExercise,
      phase,
      sets: doneSets(entry),
      compensation: entry.compensation,
      pain: hasPain(entry),
      mode: session.mode,
      scale: { ...scaleFor(scales, entry.recordKey, routine.rules.weightIncrementKg), inverse },
    })
    if (verdict) out.set(entry.recordKey, verdict)
  }
  return out
}

export function progressionSuggestions(
  session: Session,
  routine: RoutineTemplate,
  phase: Phase,
  scales?: WeightScaleMap,
  catalog?: Map<string, Exercise>,
): ProgressionSuggestion[] {
  const out: ProgressionSuggestion[] = []
  for (const [recordKey, v] of progressionVerdicts(session, routine, phase, scales, catalog)) {
    if (v.kind !== 'up') continue
    out.push({
      recordKey,
      exerciseId: parseRecordKey(recordKey).exerciseId,
      from: v.from,
      to: v.to,
      inverse: catalog ? isInverseKey(catalog, recordKey) : false,
    })
  }
  return out
}
