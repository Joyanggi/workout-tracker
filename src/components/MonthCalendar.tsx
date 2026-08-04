import { monthLabel, parseDateStr, todayLocal } from '../lib/dates'
import type { Adherence } from '../lib/diet'
import type { CalendarCell } from '../lib/history'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

/**
 * 월 달력 (DESIGN.md §5.3). 세션 있는 날 불꽃, 탭하면 상세.
 * 주 시작은 월요일 — 주간 집계(§7)와 같은 기준이어야 도트/카운트가 일관된다.
 *
 * 식단은 **테두리 링 색**으로 겹쳐 보여준다 (D3). 전용 달력을 만들지 않는 이유:
 * "그날 운동과 식단이 어땠나"를 한 화면에서 봐야 상관을 읽을 수 있다.
 * 미기록은 링을 그리지 않는다 — 링이 없는 것과 빨간 링은 다른 정보다.
 */
export default function MonthCalendar({
  cells,
  month,
  onPrev,
  onNext,
  onPickDate,
  selectedDate,
  adherenceByDate,
  dietPartialDates,
}: {
  cells: CalendarCell[]
  month: string
  onPrev: () => void
  onNext: () => void
  onPickDate: (date: string) => void
  selectedDate: string | null
  /** 날짜 → 식단 준수 등급 (D3). 없으면 링을 그리지 않는다 */
  adherenceByDate?: Map<string, Adherence>
  /** 기록은 있으나 판정 보류인 날 (X2) — 회색 링 */
  dietPartialDates?: Set<string>
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
          const diet = adherenceByDate?.get(cell.date)
          const hasDiet = diet !== undefined && diet !== 'unlogged'
          // 판정 전이라도 기록이 있으면 회색 링 — "기록이 사라졌다"고 보이지 않게 (X2)
          const dietPartial = !hasDiet && dietPartialDates?.has(cell.date) === true
          return (
            <button
              key={cell.date}
              className={[
                'cal-cell',
                cell.inMonth ? '' : 'cal-cell-out',
                hasSession ? 'cal-cell-done' : '',
                hasDiet ? `cal-cell-diet-${diet}` : '',
                dietPartial ? 'cal-cell-diet-partial' : '',
                cell.date === today ? 'cal-cell-today' : '',
                cell.date === selectedDate ? 'cal-cell-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onPickDate(cell.date)}
              // 식단만 있는 날도 열려야 한다 (기록 보정 경로, D3)
              disabled={!hasSession && !hasDiet && !cell.inMonth}
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
