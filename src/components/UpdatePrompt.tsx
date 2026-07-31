import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * 새 버전이 배포되면 배너로 알리고, 사용자가 누를 때만 적용한다.
 * autoUpdate로 자동 리로드하면 세션 입력 중에 화면이 날아간다 (vite.config.ts 주석 참조).
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      className="banner banner-info"
      style={{ position: 'sticky', top: 'var(--safe-t)', zIndex: 30 }}
    >
      <span>새 버전이 준비됐어요</span>
      <button onClick={() => void updateServiceWorker(true)}>
        <span>업데이트</span>
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        style={{ background: 'transparent', marginLeft: 0 }}
        aria-label="나중에"
      >
        <span style={{ color: 'var(--accent)' }}>나중에</span>
      </button>
    </div>
  )
}
