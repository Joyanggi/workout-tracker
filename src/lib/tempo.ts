import type { RoutineExercise } from '../types'

/**
 * 템포 가이드 (G7) — 세트 중 수축·이완 리듬을 소리+시각으로 안내한다.
 *
 * 템포 값은 **루틴 문서 3장 "템포 규정" 표 (2026-08-05 판)** 의 그룹 수준 상수다.
 * 종목별 시드에 넣지 않는 이유: 문서가 그룹 단위로 규정했고, 종목마다 값을 두면
 * 시드가 커지면서도 문서에 없는 정보를 앱이 발명하게 된다.
 *
 * **출처 이력 (V2 — DEV-RECORD-v1.2 §6.2):** v1.2에서 이 주석은 세 그룹 모두 "문서가
 * 규정했다"고 적었지만, 당시 문서가 숫자로 규정한 것은 **B그룹 3-1-1-1 하나**였고
 * A 올림 1초·core 2-1-2는 계획서의 보간이었다. 리뷰에서 드러나 문서 쪽을 고쳤다 —
 * 문서 v2.4 3장에 템포 규정 표가 신설되면서 세 그룹 모두 정식 규정이 됐다.
 * 즉 지금은 주석이 사실이지만, **그 사실을 만든 것은 문서 수정**이다.
 *
 * 페이즈 타이밍은 **경과 시간에서 파생**한다 (카운터 누적 금지 — 휴식 타이머·카운트다운
 * 틱과 같은 원칙). 화면이 잠겨 JS가 멈췄다가 복귀하면 "지금 어느 페이즈인가"가
 * 즉시 정확해야 하고, 밀린 페이즈를 몰아서 재생하면 안 된다.
 */

export type PhaseKind = 'concentric' | 'squeeze' | 'eccentric' | 'stretch'

export interface TempoPhase {
  kind: PhaseKind
  /** 초 */
  seconds: number
}

/** 루틴 문서 3장 템포 규정 표 (2026-08-05 판) */
export const TEMPO: Record<RoutineExercise['group'], TempoPhase[]> = {
  // "내릴 때 2초, 통제"
  A: [
    { kind: 'concentric', seconds: 1 },
    { kind: 'eccentric', seconds: 2 },
  ],
  // B그룹 실행 규칙 3-1-1-1 (이완 3 · 신장 정지 1 · 수축 1 · 정점 1)
  B: [
    { kind: 'concentric', seconds: 1 },
    { kind: 'squeeze', seconds: 1 },
    { kind: 'eccentric', seconds: 3 },
    { kind: 'stretch', seconds: 1 },
  ],
  // "천천히 통제"
  core: [
    { kind: 'concentric', seconds: 2 },
    { kind: 'squeeze', seconds: 1 },
    { kind: 'eccentric', seconds: 2 },
  ],
}

export const PHASE_LABEL: Record<PhaseKind, string> = {
  concentric: '올림',
  squeeze: '짜내기',
  eccentric: '내림',
  stretch: '늘림 유지',
}

/** 카운트인 초 (G1 틱과 같은 소리를 쓴다) */
export const COUNT_IN_SEC = 3

export function cycleSeconds(phases: TempoPhase[]): number {
  return phases.reduce((n, p) => n + p.seconds, 0)
}

export interface TempoPosition {
  /** 카운트인 중이면 남은 초 (3·2·1), 아니면 null */
  countIn: number | null
  /** 현재 페이즈 (카운트인 중이면 null) */
  phase: TempoPhase | null
  /** 현재 페이즈 안에서의 진행도 0~1 (링 애니메이션용) */
  phaseProgress: number
  /** 완료한 반복 수 */
  reps: number
  /** 페이즈 경계를 지날 때마다 1씩 늘어나는 인덱스 — 소리 트리거 중복 방지용 */
  phaseIndex: number
}

/**
 * 시작 후 경과 시간(ms)에서 현재 위치를 계산한다.
 *
 * 순수 함수다 — 상태를 누적하지 않으므로 복귀 시점에 그냥 다시 부르면 맞는다.
 * `phaseIndex`는 "몇 번째 페이즈 구간인가"이고, 호출부는 이 값이 바뀌는 순간에만
 * 소리를 낸다 (매 프레임 재생 방지).
 */
export function tempoPositionAt(elapsedMs: number, phases: TempoPhase[]): TempoPosition {
  const elapsed = Math.max(0, elapsedMs) / 1000

  if (elapsed < COUNT_IN_SEC) {
    return {
      countIn: Math.ceil(COUNT_IN_SEC - elapsed),
      phase: null,
      phaseProgress: 0,
      reps: 0,
      // 카운트인 초마다 다른 인덱스를 줘서 틱이 초당 한 번만 울리게 한다
      phaseIndex: -Math.ceil(COUNT_IN_SEC - elapsed),
    }
  }

  const cycle = cycleSeconds(phases)
  if (cycle <= 0) {
    return { countIn: null, phase: null, phaseProgress: 0, reps: 0, phaseIndex: 0 }
  }

  const afterCountIn = elapsed - COUNT_IN_SEC
  const reps = Math.floor(afterCountIn / cycle)
  let within = afterCountIn - reps * cycle

  for (const [i, phase] of phases.entries()) {
    if (within < phase.seconds) {
      return {
        countIn: null,
        phase,
        phaseProgress: phase.seconds > 0 ? within / phase.seconds : 0,
        reps,
        phaseIndex: reps * phases.length + i,
      }
    }
    within -= phase.seconds
  }

  // 부동소수 경계에서 루프를 빠져나온 경우 — 마지막 페이즈 끝으로 본다
  const last = phases[phases.length - 1]
  return {
    countIn: null,
    phase: last,
    phaseProgress: 1,
    reps,
    phaseIndex: reps * phases.length + phases.length - 1,
  }
}

/**
 * 상단 반복수 대비 현재 상태 (W3).
 *
 * 실사용 피드백: 인클라인(6~10회)에서 **30회를 넘어도 가이드가 계속 돌았다.**
 * 상단(`repMax`)에 도달하면 계속할 운동학적 이유가 없다 — A그룹은 상단 도달이
 * 더블 프로그레션의 목표 지점이고(문서 10장), B그룹은 "횟수는 목표가 아니라 결과"다(3장).
 *
 * 순수 함수로 두는 이유는 `tempoPositionAt`과 같다 — 화면 없이 경계를 검증할 수 있어야 한다.
 * 특히 "자동 종료가 정확히 한 번"은 호출부의 ref로 지키지만, **그 판정 자체**는 여기서
 * 확정적이어야 한다.
 */
export interface TempoRepState {
  /** **완료한** 반복 수. 기록에 들어가는 값이다 (`repMax`를 넘겨 세지 않는다) */
  reps: number
  /**
   * **지금 하고 있는** 회차 (1부터). 화면에 보여주는 값이다.
   *
   * 완료 수와 진행 회차를 나눈 이유 (실사용 피드백): 화면에 완료 수만 보여주니
   * 10회짜리에서 마지막에 보이는 숫자가 **9**였다 — 10번째를 하는 동안 "9"가 떠 있고,
   * 10회가 완료되는 순간 자동 종료되어 시트가 닫히므로 10은 한 번도 보이지 않는다.
   * 사용자는 "최대횟수 −1만큼만 뜬다"고 느낀다 (기록되는 값은 10으로 정확했다).
   *
   * 그래서 화면은 진행 회차(1부터)를, 기록과 종료 라벨은 완료 수를 쓴다.
   * 라벨을 "N회째"로 두어 "약 N회로 기록"과 구분한다 — 3회째를 하는 중이면 2회 완료다.
   */
  currentRep: number
  /** 지금 도는 사이클이 마지막이다 — 갑자기 끊기지 않게 미리 알린다 */
  lastCycle: boolean
  /** 상단에 도달했다 — 자동 종료 신호 */
  complete: boolean
}

export function tempoRepState(pos: TempoPosition, repMax: number): TempoRepState {
  // 카운트인 중에는 아직 한 회도 시작하지 않았다
  if (pos.countIn !== null || repMax <= 0) {
    return { reps: 0, currentRep: 0, lastCycle: false, complete: false }
  }
  const complete = pos.reps >= repMax
  return {
    reps: Math.min(pos.reps, repMax),
    // 진행 중인 회차는 완료 수 + 1이고, 상단을 넘지 않는다
    currentRep: Math.min(pos.reps + 1, repMax),
    // 상단 직전 사이클 — 도달한 뒤에는 "마지막"이 아니라 "끝"이다
    lastCycle: !complete && pos.reps === repMax - 1,
    complete,
  }
}

/**
 * 그 페이즈에 낼 소리.
 *
 * 수축은 상행, 이완은 하행 롱톤(길이 = 이완 초), 정지·짜내기는 저음 틱.
 * 이완이 가장 길고 통제가 필요한 구간이므로 소리도 그 길이만큼 이어진다 —
 * "언제까지 내려야 하나"를 귀로 알 수 있어야 한다.
 */
export function phaseTone(phase: TempoPhase): { freq: number; duration: number; gain: number } {
  switch (phase.kind) {
    case 'concentric':
      return { freq: 660, duration: Math.min(0.3, phase.seconds), gain: 0.18 }
    case 'eccentric':
      return { freq: 440, duration: phase.seconds * 0.9, gain: 0.14 }
    case 'squeeze':
    case 'stretch':
      return { freq: 290, duration: 0.08, gain: 0.14 }
  }
}
