import { weekdayKo } from '../lib/dates'
import type { WeekDot } from '../lib/dashboard'

/**
 * 이번 주 월~일 도트 (DESIGN.md §5.1).
 * 완료 = 불꽃, 오늘 = 링. 같은 날 두 세션이면 ×2를 붙인다 (§4에서 허용).
 */
export default function WeekDots({
  dots,
  target,
}: {
  dots: WeekDot[]
  target: number
}) {
  const total = dots.reduce((n, d) => n + d.count, 0)

  return (
    <div className="card">
      <div className="week-head">
        <div className="card-label" style={{ marginBottom: 0 }}>
          이번 주
        </div>
        <div className="week-count">
          {total}/{target}회
        </div>
      </div>
      <div className="week-dots">
        {dots.map((dot) => (
          <div key={dot.date} className="week-day">
            <div
              className={[
                'week-dot',
                dot.count > 0 ? 'week-dot-done' : '',
                dot.isToday ? 'week-dot-today' : '',
                dot.isFuture ? 'week-dot-future' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {dot.count > 0 ? '🔥' : ''}
              {dot.count > 1 && <span className="week-dot-multi">×{dot.count}</span>}
            </div>
            <div className="week-day-label">{weekdayKo(dot.date)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
