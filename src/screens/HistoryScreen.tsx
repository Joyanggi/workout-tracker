import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import MonthCalendar from '../components/MonthCalendar'
import { db } from '../db'
import { addMonths, monthStart, todayLocal, weekdayKo } from '../lib/dates'
import { calendarCells, sessionsInMonth, summarize } from '../lib/history'
import { isInverseKey } from '../lib/weightScale'
import type { RoutineBundle } from '../lib/useRoutine'
import ExerciseHistoryScreen from './ExerciseHistoryScreen'
import SessionDetailScreen from './SessionDetailScreen'

type Mode = 'calendar' | 'byExercise'

/** 기록 탭 (DESIGN.md §5.3) */
export default function HistoryScreen({ bundle }: { bundle: RoutineBundle }) {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const [month, setMonth] = useState(() => monthStart(todayLocal()))
  const [mode, setMode] = useState<Mode>('calendar')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const cells = useMemo(() => calendarCells(sessions, month), [sessions, month])
  const monthSessions = useMemo(() => sessionsInMonth(sessions, month), [sessions, month])

  if (detailId) {
    return (
      <SessionDetailScreen
        bundle={bundle}
        sessionId={detailId}
        onBack={() => setDetailId(null)}
      />
    )
  }

  const pickDate = (date: string) => {
    const cell = cells.find((c) => c.date === date)
    if (!cell || cell.sessions.length === 0) {
      setSelectedDate(null)
      return
    }
    // 세션이 하나면 바로 상세로, 여럿이면 아래 목록에서 고르게 한다 (§4 같은 날 두 세션 허용)
    if (cell.sessions.length === 1) setDetailId(cell.sessions[0].id)
    else setSelectedDate(date)
  }

  const listed = selectedDate
    ? monthSessions.filter((s) => s.date === selectedDate)
    : monthSessions

  return (
    <div className="screen">
      <h1 className="screen-title">기록</h1>

      <div className="segment" style={{ marginBottom: 16 }}>
        <button aria-pressed={mode === 'calendar'} onClick={() => setMode('calendar')}>
          달력
        </button>
        <button aria-pressed={mode === 'byExercise'} onClick={() => setMode('byExercise')}>
          종목별
        </button>
      </div>

      {mode === 'byExercise' ? (
        <ExerciseHistoryScreen
          bundle={bundle}
          sessions={sessions}
          onOpenSession={setDetailId}
        />
      ) : (
        <>
          <MonthCalendar
            cells={cells}
            month={month}
            onPrev={() => {
              setMonth(addMonths(month, -1))
              setSelectedDate(null)
            }}
            onNext={() => {
              setMonth(addMonths(month, 1))
              setSelectedDate(null)
            }}
            onPickDate={pickDate}
            selectedDate={selectedDate}
          />

          <div className="card">
            <div className="week-head">
              <div className="card-label" style={{ marginBottom: 0 }}>
                {selectedDate ? `${selectedDate} (${weekdayKo(selectedDate)})` : '이 달의 세션'}
              </div>
              {selectedDate ? (
                <button
                  className="chip"
                  onClick={() => setSelectedDate(null)}
                  style={{ minHeight: 0 }}
                >
                  전체 보기
                </button>
              ) : (
                <div className="week-count">{monthSessions.length}회</div>
              )}
            </div>

            {listed.length === 0 && (
              <p className="row-sub" style={{ marginTop: 8 }}>
                기록이 없습니다.
              </p>
            )}
            {listed.map((session) => {
              const s = summarize(session, bundle.routine, (rk) => isInverseKey(bundle.catalog, rk))
              return (
                <button className="row" key={session.id} onClick={() => setDetailId(session.id)}>
                  <div className="row-main">
                    <div className="row-title">
                      {s.dayName}
                      {session.mode !== 'normal' && (
                        <span className="chip chip-warn" style={{ marginLeft: 6 }}>
                          {session.mode === 'return' ? '복귀' : '디로드'}
                        </span>
                      )}
                    </div>
                    <div className="row-sub">
                      {session.date} ({weekdayKo(session.date)}) · {s.setCount}세트
                      {s.durationMin !== null && ` · ${s.durationMin}분`}
                      {session.cardio && ` · ${session.cardio.type} ${session.cardio.minutes}분`}
                    </div>
                  </div>
                  <div className="row-meta">
                    {Math.round(s.volume).toLocaleString()}
                    <br />
                    <span style={{ fontSize: 11 }}>kg·회</span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
