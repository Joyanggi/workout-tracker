import type { Exercise, RecordKey, SubstituteOption } from '../types'
import { makeRecordKey, parseRecordKey } from '../types'
import { e1rm } from './derive'

/**
 * 대체운동 무게 환산 (T8).
 *
 * ⚠ **종목 간 하중 전이에 검증된 공식은 존재하지 않는다.** 머신 표시 무게는 브랜드·
 * 지렛대 구조에 따라 실제 부하가 달라서 원리적으로 불가능하다. 검증된 것은 둘뿐이다:
 *   ① Epley 추정 1RM  w × (1 + reps/30)
 *   ② %1RM–반복수 관계 (rep max continuum)
 *
 * 그래서 이 파일은 두 부분을 **의도적으로 분리**한다:
 *   - `startWeightFor` — `startFactor` 휴리스틱을 쓴다. 코칭 관행이고 검증되지 않았다.
 *     첫 세트 시작점일 뿐이며, RIR 3~4로 수행하므로 계수가 틀려도 위험하지 않다.
 *   - `calibratedWeight` — 첫 세트의 **실측**(w₁, r₁)에서 Epley로 역산한다.
 *     2세트부터는 추정이 아니라 그날의 실제 능력에 기반한다. 이게 본체다.
 */

/** 2세트 이후 제안에 두는 RIR 1~2 여유 */
export const WORKING_MARGIN = 0.95

/** 어시스티드 풀업 보조 무게 산출에 쓰는 랫풀 계수 */
export const ASSIST_LAT_FACTOR = 0.9

/** 첫 세트 안내 — 계수가 아니라 이 지시가 안전을 담보한다 */
export const CALIBRATION_RIR = 'RIR 3~4'

/**
 * 원판·핀 현실에 맞춰 0.5kg 단위로.
 *
 * `toFixed(6)`를 먼저 통과시키는 이유: Epley 왕복(e1RM → 목표 반복수 무게)이
 * 부동소수 오차를 쌓아서 정확히 23.75여야 할 값이 23.749999999999996로 나온다.
 * 그대로 ×2 하면 47.49999…가 되어 반올림 경계에서 아래로 떨어진다(23.5).
 * 무게 제안이 계산 순서에 따라 0.5kg 흔들리면 안 된다.
 */
export function roundToHalf(n: number): number {
  return Math.round(Number(n.toFixed(6)) * 2) / 2
}

/** e1RM에서 목표 반복수의 무게로 되돌린다 (Epley 역산 — 검증된 관계) */
export function weightForReps(estimated1rm: number, reps: number): number {
  return (estimated1rm * 30) / (30 + reps)
}

/**
 * 처음 하는 대체 종목의 첫 세트 무게.
 *
 * `e1RM_원 × startFactor × 30/(30 + repMax_원)`
 * = "원 종목을 목표 반복수로 할 때의 무게"에 전이 계수를 곱한 값.
 * **계수는 휴리스틱이다** (위 주석 참조).
 */
export function startWeightFor(args: {
  originalBest: { weight: number; reps: number }
  originalRepMax: number
  startFactor: number
}): number {
  const { originalBest, originalRepMax, startFactor } = args
  const estimated = e1rm(originalBest.weight, originalBest.reps)
  return roundToHalf(weightForReps(estimated, originalRepMax) * startFactor)
}

/**
 * 어시스티드 풀업의 보조 무게. **역방향이다 — 클수록 쉽다.**
 *
 * `보조 = 체중 − 랫풀무게 × 0.9`
 * 랫풀에서 다루는 무게가 체중에 가까울수록 보조가 덜 필요하다는 뜻이다.
 * 음수(랫풀 무게가 체중을 넘음)면 0 — 보조 없이 가능하다는 신호다.
 */
export function assistWeightFor(args: {
  bodyWeightKg: number
  latPulldownWeight: number
}): number {
  const raw = args.bodyWeightKg - args.latPulldownWeight * ASSIST_LAT_FACTOR
  return Math.max(0, roundToHalf(raw))
}

/**
 * 캘리브레이션 후 2세트 이후 제안 무게.
 *
 * 첫 세트를 RIR 3~4로 수행한 실측(w₁, r₁)에서 e1RM을 구하고, 목표 반복수의 무게로
 * 되돌린 뒤 RIR 1~2 여유(0.95)를 둔다. **여기부터는 추정 계수가 개입하지 않는다.**
 *
 * 목표 반복수는 원 종목의 `repMax`를 쓴다 — 더블 프로그레션의 목표가 "그 무게로
 * repMax 도달"이므로, 상단을 기준으로 잡아야 첫 세션부터 그 범위 안에서 수행된다.
 */
export function calibratedWeight(args: {
  firstSetWeight: number
  firstSetReps: number
  targetReps: number
}): number {
  const { firstSetWeight, firstSetReps, targetReps } = args
  const estimated = e1rm(firstSetWeight, firstSetReps)
  return roundToHalf(weightForReps(estimated, targetReps) * WORKING_MARGIN)
}

// ─── 후보 목록 (UI) ──────────────────────────────────────

export interface SubstitutePreview {
  option: SubstituteOption
  exercise: Exercise
  /** 대체 시 쓸 recordKey — 대체 종목 자신의 것 (원 종목 라인을 오염시키지 않는다) */
  recordKey: RecordKey
  /** 예상 시작 무게. 근거가 없으면 undefined */
  startWeight?: number
  /** 무게를 추정하지 못한 이유 */
  blocked?: 'no-history' | 'no-bodyweight'
  /** 이 대체 종목에 이미 기록이 있으면 환산하지 않고 그 기록을 쓴다 (계획서 규칙 1) */
  lastRecord?: { weight: number; reps: number }
}

/**
 * 후보별 예상 시작 무게.
 *
 * 계획서 규칙 1: **대체 종목에 과거 기록이 있으면 환산하지 않는다** — 그 종목의
 * 실제 기록이 어떤 추정보다 낫다. 환산은 "처음 하는 종목"만의 문제다.
 */
export function previewSubstitutes(args: {
  originalRecordKey: RecordKey
  originalBest?: { weight: number; reps: number }
  originalRepMax: number
  options: SubstituteOption[]
  catalog: Map<string, Exercise>
  /** 대체 종목 recordKey → 그 종목의 직전 기록 (있으면 환산 생략) */
  lastRecordOf: (recordKey: RecordKey) => { weight: number; reps: number } | undefined
  bodyWeightKg?: number
}): SubstitutePreview[] {
  const { dayId } = parseRecordKey(args.originalRecordKey)

  return args.options.flatMap((option): SubstitutePreview[] => {
    const exercise = args.catalog.get(option.exerciseId)
    if (!exercise) return [] // 카탈로그에 없으면 표시하지 않는다 (루틴 교체 내구성)

    const recordKey = makeRecordKey(option.exerciseId, dayId)
    const lastRecord = args.lastRecordOf(recordKey)
    const base: SubstitutePreview = { option, exercise, recordKey, lastRecord }

    if (lastRecord) return [{ ...base, startWeight: lastRecord.weight }]

    if (option.assisted) {
      if (args.bodyWeightKg === undefined) return [{ ...base, blocked: 'no-bodyweight' }]
      if (!args.originalBest) return [{ ...base, blocked: 'no-history' }]
      return [
        {
          ...base,
          startWeight: assistWeightFor({
            bodyWeightKg: args.bodyWeightKg,
            latPulldownWeight: args.originalBest.weight,
          }),
        },
      ]
    }

    if (!args.originalBest || option.startFactor === undefined) {
      return [{ ...base, blocked: 'no-history' }]
    }
    return [
      {
        ...base,
        startWeight: startWeightFor({
          originalBest: args.originalBest,
          originalRepMax: args.originalRepMax,
          startFactor: option.startFactor,
        }),
      },
    ]
  })
}
