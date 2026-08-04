import { weekdayKo } from '../lib/dates'
import type { WeekDot } from '../lib/dashboard'

/**
 * 이번 주 월~일 도트 (DESIGN.md §5.1).
 * 완료 = 불꽃, 오늘 = 링. 같은 날 두 세션이면 ×2를 붙인다 (§4에서 허용).
 *
 * **도트는 "헬스장에 간 날"이다** (X3) — 유산소만 한 날도 불꽃이 켜진다.
 * 반면 디로드·Phase 카운터는 근력 세션만 센다. 두 숫자가 갈릴 때만 그 사실을
 * 한 줄로 알린다 — 항상 적으면 잡음이고, 안 적으면 다른 숫자가 버그로 보인다.
 */
export default function WeekDots({
  dots,
  target,
  strengthCount,
}: {
  dots: WeekDot[]
  target: number
  /** 근력 세션 수 (도트 합계와 다를 수 있다) */
  strengthCount: number
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
      {total !== strengthCount && (
        <p className="row-sub" style={{ whiteSpace: 'normal', marginBottom: 6 }}>
          유산소만 한 날도 불꽃으로 표시합니다 — 디로드·Phase 카운터는 근력 {strengthCount}회로
          셉니다.
        </p>
      )}
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
