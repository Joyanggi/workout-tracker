import { useEffect, useState } from 'react'
import { mmss } from '../lib/dates'
import type { RestTimer } from '../lib/useRestTimer'

/**
 * 최소화된 세션의 재개 스트립 (Z5) — 탭바 바로 위, **어느 탭에 있든 보인다.**
 *
 * 세션 중에 식단을 체크하거나 지난 기록을 보려면 세션을 버리거나 강제로 마감할 수밖에
 * 없던 것이 실사용 피드백이었다. 최소화를 만들면서 "지금 세션이 열려 있다"는 사실이
 * 어디서든 보여야 하고, 돌아가는 길이 한 탭이어야 한다.
 *
 * **홈의 "진행 중" 배너를 이 스트립으로 통합했다** — 같은 정보가 홈에서만 두 줄로
 * 뜨는 것을 피한다 (계획서가 구현 판단에 맡긴 부분).
 *
 * 휴식이 돌고 있으면 남은 시간을 함께 보여준다. 그게 이 스트립의 두 번째 이유다:
 * 다른 탭에 있는 동안 휴식이 얼마나 남았는지 알 수 없으면 결국 세션으로 돌아가 확인해야 한다.
 */
export default function SessionResumeStrip({
  dayName,
  startedAt,
  timer,
  onResume,
}: {
  dayName: string
  startedAt: string
  timer: RestTimer
  onResume: () => void
}) {
  const [elapsedMin, setElapsedMin] = useState(() => minutesSince(startedAt))

  /*
   * 경과 시간은 startedAt에서 다시 계산한다 (§5.2 타임스탬프 원칙) — 화면이 잠겨
   * 인터벌이 멈춰도 복귀 시 값이 정확하다. 분 단위라 30초 간격으로 충분하다.
   */
  useEffect(() => {
    const id = window.setInterval(() => setElapsedMin(minutesSince(startedAt)), 30_000)
    return () => window.clearInterval(id)
  }, [startedAt])

  return (
    <button className="resume-strip" onClick={onResume}>
      <span className="resume-main">
        <span aria-hidden="true">🏋️</span> {dayName} 진행 중 · {elapsedMin}분
      </span>
      {timer.running && (
        <span className="resume-rest">휴식 {mmss(timer.remainingSec)}</span>
      )}
      {timer.finished && <span className="resume-rest resume-rest-done">휴식 완료</span>}
      <span className="resume-cta">이어서 ›</span>
    </button>
  )
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}
