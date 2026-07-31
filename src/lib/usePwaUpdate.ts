import { useRegisterSW } from 'virtual:pwa-register/react'

export interface PwaUpdate {
  needRefresh: boolean
  update: () => void
  dismiss: () => void
}

/**
 * 서비스워커 등록 + 업데이트 감지.
 *
 * 반드시 App 최상위에서 호출한다. 배너 컴포넌트 안에서 호출하면 그 컴포넌트가
 * 렌더되는 조건(예: 온보딩 완료 후)이 곧 SW 등록 조건이 되어, 첫 방문에는
 * 오프라인 캐싱이 되지 않는다.
 *
 * immediate: true — 기본값(false)은 window 'load' 이벤트에 등록을 건다.
 * React 마운트 + Dexie 시드 주입이 끝난 뒤에 훅이 실행되면 'load'는 이미 지나가서
 * 등록이 영원히 일어나지 않는다.
 */
export function usePwaUpdate(): PwaUpdate {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  return {
    needRefresh,
    update: () => void updateServiceWorker(true),
    dismiss: () => setNeedRefresh(false),
  }
}
