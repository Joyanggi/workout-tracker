import type { RestTimer } from '../lib/useRestTimer'

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 하단 고정 휴식 타이머 바 (DESIGN.md §5.2).
 * +30초 / 건너뛰기. 종료 시 색이 바뀌고 비프음이 울린다.
 */
export default function RestTimerBar({ timer }: { timer: RestTimer }) {
  if (!timer.running && !timer.finished) return null

  const progress = timer.totalSec > 0 ? 1 - timer.remainingSec / timer.totalSec : 1

  return (
    <div className={`rest-bar${timer.finished ? ' rest-bar-done' : ''}`} role="timer" aria-live="off">
      <div className="rest-progress" style={{ transform: `scaleX(${Math.min(1, progress)})` }} />
      <div className="rest-content">
        <div className="rest-main">
          <div className="rest-time">{timer.finished ? '휴식 완료' : mmss(timer.remainingSec)}</div>
          <div className="rest-label">{timer.label}</div>
        </div>
        <button className="rest-btn" onClick={() => timer.addSeconds(30)}>
          +30초
        </button>
        <button className="rest-btn rest-btn-strong" onClick={timer.dismiss}>
          {timer.finished ? '확인' : '건너뛰기'}
        </button>
      </div>
    </div>
  )
}
