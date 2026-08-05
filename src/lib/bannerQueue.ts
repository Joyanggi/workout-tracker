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
 * **큐 밖에 있는 것 두 개** (접히지 않는다 — 둘 다 데이터 유실 축이다):
 *   1. `storageAtRisk` — 홈 화면에 추가하지 않으면 기록이 삭제될 수 있다는 경고.
 *   2. **백업 미설정** (v1.7 후속 2) — 백업이 아예 없는 상태다. 아래 `backupStale` 참조.
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
  /**
   * 백업 리마인드 — **설정돼 있고 오래된 경우만** (v1.7 후속 2).
   *
   * 미설정(`configured === false`)은 이 큐에 들어오지 않는다. 둘을 가르는 이유:
   * 설정된 상태에서는 세션 종료마다 자동 백업이 돌고 있으므로 이 배너는 **보조 신호**이고,
   * 복귀 램프 몇 주 동안 접혀 있어도 실위험이 아니다. 반면 미설정은 **백업이 아예 없는
   * 상태**라 데이터 유실 축이고, 그건 접을 대상이 아니다 (storageAtRisk와 같은 취급).
   */
  backupStale: boolean
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
 * 데이터 보존은 훈련 판정과 다른 축이라 모순 쌍이 없다. (그래서 순서만 낮고, 접힘의
 * 대상이 된다. 미설정은 큐 밖이라 이 표에 없다.)
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
  backup: (c) => c.backupStale,
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
