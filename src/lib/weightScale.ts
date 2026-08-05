import type { Exercise, ExerciseSetting, RecordKey } from '../types'
import { parseRecordKey } from '../types'

/**
 * 종목별 무게 단위 (T9).
 *
 * 루틴 문서 10장은 증량을 "머신은 한 핀"으로 규정한다. 그런데 앱은 전역
 * `weightIncrementKg: 2.5` 하나만 알고 있어서, 한 핀이 5kg인 머신에서 "40 → 42.5"처럼
 * **존재하지 않는 무게**를 제안했다. 핀 간격은 머신마다 다르고 균일하지도 않다.
 *
 * 그래서 두 단계로 표현한다:
 *   - `step`  — 균일 간격 머신 (대다수). 미설정 시 루틴의 전역값
 *   - `ladder` — 불규칙 스택 (2.5씩 가다 3씩 뛰는 것). 실제 핀 값을 나열
 *
 * `ladder`가 있으면 그것이 우선한다. 사다리는 **스테퍼 이동과 증량 제안에만** 쓰고
 * 저장값을 강제로 스냅하지 않는다 — 직접 입력은 자유여야 한다 (원판을 얹거나,
 * 머신을 잘못 등록했을 때 기록이 막히면 안 된다).
 */
export interface WeightScale {
  step: number
  ladder?: number[]
  /**
   * 표시 무게가 **클수록 쉬운** 종목 (어시스티드 풀업의 보조 무게, T8).
   * ± 버튼은 그대로 물리적 방향이지만 **증량 제안만 반대로** 간다.
   */
  inverse?: boolean
}

export type WeightScaleMap = Map<RecordKey, WeightScale>

/** 로딩 중에도 매 렌더 새 Map을 만들지 않도록 공용 상수를 쓴다 */
export const EMPTY_SCALES: WeightScaleMap = new Map()

/** 무게 단위 프리셋 (설정 시트). 직접 입력·사다리는 별도 경로 */
export const STEP_PRESETS = [1, 1.25, 2, 2.5, 5] as const

/** 0.01 단위 반올림 — 2.5 스텝 누적에서 40.00000000000001 같은 값을 막는다 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function buildScaleMap(
  rows: ExerciseSetting[] | undefined,
  defaultStep: number,
): WeightScaleMap {
  const map: WeightScaleMap = new Map()
  for (const row of rows ?? []) {
    const ladder = row.weightLadderKg
    const step = row.weightStepKg
    // 아무것도 설정되지 않은 행(메모만 있는 행)은 넣지 않는다 — 기본값과 같다
    if (!ladder?.length && step === undefined) continue
    map.set(row.recordKey, {
      step: step ?? defaultStep,
      ...(ladder?.length ? { ladder } : {}),
    })
  }
  return map
}

export function scaleFor(
  scales: WeightScaleMap | undefined,
  recordKey: RecordKey,
  defaultStep: number,
): WeightScale {
  return scales?.get(recordKey) ?? { step: defaultStep }
}

/** 사다리 등록 입력 파싱. "5,10,15" / 공백·줄바꿈 구분 모두 허용 */
export function parseLadder(text: string): { ladder?: number[]; error?: string } {
  const tokens = text
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '')
  if (tokens.length === 0) return {}

  const values: number[] = []
  for (const token of tokens) {
    const n = Number(token.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return { error: `"${token}"은 무게로 읽을 수 없습니다` }
    values.push(round2(n))
  }
  const ladder = [...new Set(values)].sort((a, b) => a - b)
  if (ladder.length < 2) return { error: '핀 값이 2개 이상 필요합니다' }
  return { ladder }
}

export function formatLadder(ladder: number[]): string {
  return ladder.map((n) => String(n)).join(', ')
}

/**
 * 스테퍼 + 이동.
 *
 * 사다리에서는 **현재 값보다 큰 첫 핀**으로 간다. 계획서는 "가장 가까운 값으로 스냅 후
 * 이동"이었지만, 그러면 사다리 밖 값에서 유효한 핀을 뛰어넘는다 — [35, 41]에서 36에
 * 있을 때 스냅(35) 후 하강은 30으로 가버려 35를 건너뛴다. 이웃 핀으로 직행하면
 * 어느 값에서 시작해도 유효한 핀을 잃지 않는다. 사다리 안의 값에서는 두 방식이 같다.
 */
export function stepUp(current: number, scale: WeightScale): number {
  if (scale.ladder?.length) {
    return scale.ladder.find((v) => v > current) ?? current
  }
  return round2(current + scale.step)
}

export function stepDown(current: number, scale: WeightScale): number {
  if (scale.ladder?.length) {
    const below = scale.ladder.filter((v) => v < current)
    return below.length > 0 ? below[below.length - 1] : current
  }
  return round2(current - scale.step)
}

/**
 * 이 스택에서 실제로 걸 수 있는 무게로 내림 (CC13).
 *
 * **내림이다.** 추정 시작 무게는 "실제보다 가볍게"가 규칙이므로(남는 것이 부족한 것보다
 * 낫다) 반올림도 같은 방향이어야 한다 — 사다리 [35, 41]에서 40을 추정했으면 41이 아니라
 * 35다. 사다리 최하단보다 작으면 최하단을 준다 (핀을 안 꽂는 것은 이 함수의 답이 아니다).
 */
export function snapDownToScale(target: number, scale: WeightScale): number {
  if (scale.ladder?.length) {
    const below = scale.ladder.filter((v) => v <= target)
    return below.length > 0 ? below[below.length - 1] : scale.ladder[0]
  }
  if (scale.step <= 0) return round2(target)
  return round2(Math.max(0, Math.floor(target / scale.step) * scale.step))
}

/**
 * 증량 제안 무게. **사다리 최상단이면 `null`** — 스택을 다 쓴 것이므로
 * "존재하지 않는 다음 무게"를 제안하는 대신 그 사실을 알린다 (루틴 문서 10장의
 * "스택이 부족하면 템포·정지 시간으로" 판단은 사용자 몫).
 */
export function nextWeightForProgression(current: number, scale: WeightScale): number | null {
  // 어시스티드는 진전이 "보조를 줄이는 것"이다. 이 분기가 없으면 조건을 충족한 사용자에게
  // "보조를 늘려 더 쉽게 하라"고 제안한다 (T8).
  if (scale.inverse) {
    if (scale.ladder?.length) {
      const below = scale.ladder.filter((v) => v < current)
      return below.length > 0 ? below[below.length - 1] : null
    }
    const next = round2(current - scale.step)
    return next > 0 ? next : null
  }
  if (scale.ladder?.length) {
    return scale.ladder.find((v) => v > current) ?? null
  }
  return round2(current + scale.step)
}

/**
 * 이 기록 라인이 **표시 무게가 클수록 쉬운** 종목인지 (T8 어시스티드).
 *
 * 판정 기준은 **entry 자신의 exerciseId**다 — `substituteFor`가 아니다.
 * inverse는 실제로 쓴 기계의 속성이지 원 종목의 속성이 아니다.
 *
 * 순수 lib 함수들은 카탈로그를 직접 받지 않고 `isInverse?: (rk) => boolean` 술어를
 * 받는다. 화면 호출부는 전부 `bundle.catalog`를 갖고 있으므로 여기서 술어를 만든다.
 * 해석을 이 한 곳에 모아 두면 "어디는 반영되고 어디는 안 되는" 상태가 생기지 않는다.
 */
export function isInverseKey(catalog: Map<string, Exercise>, recordKey: RecordKey): boolean {
  return catalog.get(parseRecordKey(recordKey).exerciseId)?.inverseWeight === true
}

/**
 * 한 단위 **더 쉽게**. 일반 종목은 무게를 내리고, 어시스티드는 보조를 올린다.
 *
 * "하향"이라는 말이 어시스티드에서는 반대 동작이 되므로, 호출부가 stepDown을
 * 직접 부르지 않고 의도(더 쉽게)로 부르게 한다 — T11 보상작용 하향 제안이
 * 어시스티드에서 더 어렵게 만드는 버그가 이 구분이 없어서 생겼다.
 */
export function easierWeight(current: number, scale: WeightScale): number {
  return scale.inverse ? stepUp(current, scale) : stepDown(current, scale)
}

/** 설정 시트·카드에 표시할 한 줄 요약 */
export function describeScale(scale: WeightScale): string {
  if (scale.ladder?.length) return `핀 목록 ${scale.ladder.length}개 (${scale.ladder[0]}~${scale.ladder[scale.ladder.length - 1]}kg)`
  return `${scale.step}kg 단위`
}

/**
 * 증량 제안 표시. 사다리 최상단(`to === null`)이면 무게 대신 그 사실을 말한다 —
 * "40 → nullkg" 같은 문자열이 새어나오지 않게 표시를 한 곳에 모은다.
 */
export function formatProgression(from: number, to: number | null, inverse = false): string {
  if (to !== null) return `${from} → ${to}kg`
  return inverse ? `${from}kg · 보조 없이 가능` : `${from}kg · 스택 최대`
}
