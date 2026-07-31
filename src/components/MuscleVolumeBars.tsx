import type { MuscleBar } from '../lib/dashboard'

/**
 * 주간 부위별 볼륨 대시보드 (DESIGN.md §5.1).
 * §4 볼륨 예산의 가시화 — 왜 그 Day가 제안됐는지를 숫자로 보여준다.
 *
 * **목표 초과를 문제로 표시하지 않는다** (§5.1: 용량-반응 유효 범위 내).
 * 바는 100%에서 멈추고, 숫자만 초과분을 보여준다.
 */
export default function MuscleVolumeBars({
  bars,
  sessionCount,
  minSessionsToJudge,
}: {
  bars: MuscleBar[]
  sessionCount: number
  minSessionsToJudge: number
}) {
  return (
    <div className="card">
      <div className="card-label">주간 부위별 볼륨</div>
      {bars.map((bar) => {
        const ratio = bar.target > 0 ? Math.min(1, bar.performed / bar.target) : 0
        const met = bar.performed >= bar.target
        return (
          <div className="mbar" key={bar.muscle}>
            <div className="mbar-head">
              <span className="mbar-name">{bar.muscle}</span>
              <span
                className={`chip${bar.underFrequency ? ' chip-warn' : ''}`}
                title={`기대 ${bar.expectedExposures}회 / 실제 ${bar.exposures}회`}
              >
                {bar.exposures}x
              </span>
              <span className={`mbar-num${met ? ' mbar-num-met' : ''}`}>
                {bar.performed}/{bar.target}
              </span>
            </div>
            <div className="mbar-track">
              <div
                className={`mbar-fill${met ? ' mbar-fill-met' : ''}`}
                style={{ transform: `scaleX(${ratio})` }}
              />
            </div>
          </div>
        )
      })}
      <p className="row-sub" style={{ marginTop: 10 }}>
        {sessionCount < minSessionsToJudge
          ? `이번 주 ${sessionCount}회 — ${minSessionsToJudge}회부터 빈도 미달을 표시합니다`
          : '노란 뱃지 = 주 2회 노출이 기대되는데 아직 1회 이하'}
      </p>
    </div>
  )
}
