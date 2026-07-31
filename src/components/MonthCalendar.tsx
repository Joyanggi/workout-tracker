import { monthLabel, parseDateStr, todayLocal } from '../lib/dates'
import type { CalendarCell } from '../lib/history'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

/**
 * 월 달력 (DESIGN.md §5.3). 세션 있는 날 불꽃, 탭하면 상세.
 * 주 시작은 월요일 — 주간 집계(§7)와 같은 기준이어야 도트/카운트가 일관된다.
 */
export default function MonthCalendar({
  cells,
  month,
  onPrev,
  onNext,
  onPickDate,
  selectedDate,
}: {
  cells: CalendarCell[]
  month: string
  onPrev: () => void
  onNext: () => void
  onPickDate: (date: string) => void
  selectedDate: string | null
}) {
  const today = todayLocal()

  return (
    <div className="card">
      <div className="cal-head">
        <button className="cal-nav" onClick={onPrev} aria-label="이전 달">
          ‹
        </button>
        <div className="cal-title">{monthLabel(month)}</div>
        <button className="cal-nav" onClick={onNext} aria-label="다음 달">
          ›
        </button>
      </div>

      <div className="cal-grid cal-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((cell) => {
          const hasSession = cell.sessions.length > 0
          const dayNum = parseDateStr(cell.date).getDate()
          return (
            <button
              key={cell.date}
              className={[
                'cal-cell',
                cell.inMonth ? '' : 'cal-cell-out',
                hasSession ? 'cal-cell-done' : '',
                cell.date === today ? 'cal-cell-today' : '',
                cell.date === selectedDate ? 'cal-cell-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onPickDate(cell.date)}
              disabled={!hasSession && !cell.inMonth}
            >
              <span className="cal-num">{dayNum}</span>
              {hasSession && (
                <span className="cal-flame">
                  🔥{cell.sessions.length > 1 && <span className="cal-multi">{cell.sessions.length}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
