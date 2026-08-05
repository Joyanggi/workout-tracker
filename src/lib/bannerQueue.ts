import { BANNER_BACKUP, BANNER_COMPENSATION, BANNER_DELOAD, BANNER_PHASE } from '../store/ui'

/**
 * 홈 배너의 우선순위·상호 배제를 한 곳으로 (BB4).
 *
 * 규칙은 이미 있었지만 **여섯 개 독립 조건식으로 흩어져 있었다**:
 *
 * ```
 * showReturn  = Boolean(returnStep)
 * showDeload  = !showReturn && !dismissed[DELOAD] && (due || earlySignal)
 * showPhase   = !showReturn && !showDeload && !dismissed[PHASE] && allMet && to !== null
 * reminder.show && !dismissed[BACKUP]                       ← 배제 규칙이 없다
 * progressions.length > 0 && !showReturn && !showDeload && !showPhase
 * watches.length > 0 && !showReturn && !showDeload && !dismissed[COMPENSATION]
 * ```
 *
 * 이 형태의 문제는 두 가지다. ① 조건이 늘어날 때마다 `!showX`를 손으로 더해야 하고
 * (하나 빼먹으면 모순 쌍이 나란히 뜬다), ② **몇 개가 동시에 뜨는지 아무도 계산하지 않는다** —
 * 백업은 배제 대상이 아니라서 백업+증량+보상작용이 실제로 함께 쌓인다.
 * 첫 화면이 경고로 가득 차면 어느 것도 읽히지 않는다.
 *
 * **배제 규칙은 현행 그대로 옮겼다** (동작 변경 없음). 순서만 계획서가 정한 우선순위로
 * 명시한다: 복귀 > 디로드 > 백업 > Phase > 보상작용 > 증량.
 *
 * `storageAtRisk`(데이터 유실 경고)는 **이 큐에 넣지 않는다** — 접히면 안 되는 유일한
 * 배너이고, 큐 밖 최상단에 고정된다.
 */

export type BannerId = 'return' | 'deload' | 'backup' | 'phase' | 'compensation' | 'progression'

/** 표시 순서 = 우선순위. 첫 번째만 펼쳐지고 나머지는 접힌다 */
export const BANNER_ORDER: readonly BannerId[] = [
  'return',
  'deload',
  'backup',
  'phase',
  'compensation',
  'progression',
]

/** dismiss 키 매핑 — 복귀는 dismiss 대상이 아니다 (모드 판정이지 알림이 아니다) */
const DISMISS_KEY: Partial<Record<BannerId, string>> = {
  deload: BANNER_DELOAD,
  backup: BANNER_BACKUP,
  phase: BANNER_PHASE,
  compensation: BANNER_COMPENSATION,
}

export interface BannerConditions {
  /** 14일+ 공백 복귀 프로토콜이 있는가 */
  hasReturn: boolean
  /** 디로드 권장 (도달 또는 조기 신호) */
  deloadDue: boolean
  /** 백업 리마인드 */
  backupDue: boolean
  /** Phase 전환 조건 충족 + 다음 Phase 존재 */
  phaseReady: boolean
  /** 반복 보상작용 감시 대상이 있는가 */
  hasWatches: boolean
  /** 증량 제안이 있는가 */
  hasProgressions: boolean
}

/**
 * 각 배너를 가리는 상위 배너.
 *
 * **현행 코드에서 그대로 옮긴 것이다.** 근거는 원래 주석에 있다: "볼륨을 줄여라"와
 * "증량하라"가 나란히 뜨면 어느 쪽을 따라야 하는지 알 수 없고, 복귀는 이미 볼륨을 줄인
 * 상태이므로 디로드 권고가 중복이다.
 *
 * 백업이 아무것도 가리지 않고 아무것에도 가려지지 않는 것도 현행 그대로다 —
 * 데이터 보존은 훈련 판정과 다른 축이라 모순 쌍이 없다.
 */
const BLOCKED_BY: Record<BannerId, readonly BannerId[]> = {
  return: [],
  deload: ['return'],
  backup: [],
  phase: ['return', 'deload'],
  compensation: ['return', 'deload'],
  progression: ['return', 'deload', 'phase'],
}

const PRESENT: Record<BannerId, (c: BannerConditions) => boolean> = {
  return: (c) => c.hasReturn,
  deload: (c) => c.deloadDue,
  backup: (c) => c.backupDue,
  phase: (c) => c.phaseReady,
  compensation: (c) => c.hasWatches,
  progression: (c) => c.hasProgressions,
}

/**
 * 표시할 배너를 우선순위 순으로.
 *
 * **가리는 것은 "실제로 표시되는" 배너뿐이다** — 닫힌(dismiss) 배너는 아무것도 가리지
 * 않는다. 현행 코드가 그렇게 동작한다 (`showDeload`에 `!dismissed`가 들어 있고
 * `showPhase`가 그 `showDeload`를 본다): 디로드를 "나중에"로 닫으면 Phase 배너가 올라온다.
 * 닫은 배너가 계속 다른 배너를 가리면 **닫았는데 아무것도 안 보이는** 상태가 된다.
 */
export function bannerQueue(
  conditions: BannerConditions,
  dismissed: Record<string, boolean>,
): BannerId[] {
  const shown = new Set<BannerId>()
  for (const id of BANNER_ORDER) {
    if (!PRESENT[id](conditions)) continue
    if (BLOCKED_BY[id].some((blocker) => shown.has(blocker))) continue
    const key = DISMISS_KEY[id]
    if (key !== undefined && dismissed[key]) continue
    shown.add(id)
  }
  return BANNER_ORDER.filter((id) => shown.has(id))
}
