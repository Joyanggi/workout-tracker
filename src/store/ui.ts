import { create } from 'zustand'

/**
 * 화면 전환에도 살아남아야 하는 UI 상태.
 *
 * 배너 "나중에"를 화면 컴포넌트의 useState로 두면, 탭을 옮기는 순간 HomeScreen이
 * 언마운트되어 dismiss가 리셋된다. 홈 → 기록 → 홈만 왕복해도 방금 닫은 배너가 다시 뜬다.
 * 앱 실행 단위로는 유지하되 저장하지는 않는다 — 디로드·백업 경고는 다음 실행에
 * 다시 보여주는 것이 맞다 (미루면 안 되는 신호이므로).
 */
interface UiState {
  dismissed: Record<string, true>
  dismiss: (id: string) => void
  isDismissed: (id: string) => boolean
}

export const useUi = create<UiState>((set, get) => ({
  dismissed: {},
  dismiss: (id) => set((s) => ({ dismissed: { ...s.dismissed, [id]: true } })),
  isDismissed: (id) => get().dismissed[id] === true,
}))

export const BANNER_DELOAD = 'deload'
export const BANNER_BACKUP = 'backup'
