import type { RecordKey, RoutineTemplate, Session, SetRecord } from '../types'
import { parseRecordKey, recordDayIdOf } from '../types'
import { isSameMonth, monthGrid } from './dates'
import { completedSessions, doneSets, e1rm, findDay, totalDoneSets, totalVolume } from './derive'

/** 기록 탭 조회 (DESIGN.md §5.3) */

export interface CalendarCell {
  date: string
  inMonth: boolean
  sessions: Session[]
}

/** 월 달력 격자 + 각 날짜의 세션 (§5.3) */
export function calendarCells(
  sessions: Session[],
  anyDateInMonth: string,
): CalendarCell[] {
  const byDate = new Map<string, Session[]>()
  for (const s of completedSessions(sessions)) {
    const list = byDate.get(s.date) ?? []
    list.push(s)
    byDate.set(s.date, list)
  }
  return monthGrid(anyDateInMonth).map((date) => ({
    date,
    inMonth: isSameMonth(date, anyDateInMonth),
    sessions: byDate.get(date) ?? [],
  }))
}

export interface SessionSummary {
  session: Session
  dayName: string
  setCount: number
  volume: number
  durationMin: number | null
}

export function summarize(session: Session, routine: RoutineTemplate): SessionSummary {
  const day = findDay(routine, session.dayId)
  const durationMin =
    session.endedAt
      ? Math.round(
          (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
        )
      : null
  return {
    session,
    dayName: day?.name ?? session.dayId,
    setCount: totalDoneSets(session),
    volume: totalVolume(session),
    durationMin,
  }
}

/** 그 달의 완료 세션, 최신순 */
export function sessionsInMonth(sessions: Session[], anyDateInMonth: string): Session[] {
  return completedSessions(sessions).filter((s) => isSameMonth(s.date, anyDateInMonth))
}

// ─── 종목별 히스토리 (§5.3) ──────────────────────────────

export interface HistoryPoint {
  sessionId: string
  date: string
  dayId: string
  mode: Session['mode']
  sets: SetRecord[]
  /** 최고 무게 */
  topWeight: number
  totalReps: number
  volume: number
  bestE1rm: number
  sensoryScore?: 0 | 1 | 2 | 3
  compensation: string
}

/** recordKey의 세션 히스토리, 최신순 (무게·반복수 추이) */
export function exerciseHistory(sessions: Session[], recordKey: RecordKey): HistoryPoint[] {
  const out: HistoryPoint[] = []
  for (const session of completedSessions(sessions)) {
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry) continue
    const sets = doneSets(entry)
    if (sets.length === 0) continue
    out.push({
      sessionId: session.id,
      date: session.date,
      dayId: session.dayId,
      mode: session.mode,
      sets,
      topWeight: Math.max(...sets.map((s) => s.weight)),
      totalReps: sets.reduce((n, s) => n + s.reps, 0),
      volume: sets.reduce((n, s) => n + s.weight * s.reps, 0),
      bestE1rm: Math.max(...sets.map((s) => e1rm(s.weight, s.reps))),
      sensoryScore: entry.sensoryScore,
      compensation: entry.compensation,
    })
  }
  return out
}

export interface RecordKeyInfo {
  recordKey: RecordKey
  exerciseId: string
  dayId: string
  /** 루틴에 아직 정의가 있는가 (v2.5+ 교체 후 사라진 종목도 기록은 남는다) */
  known: boolean
  group: 'A' | 'B' | 'core' | null
  sessionCount: number
}

/**
 * 기록이 존재하는 모든 recordKey.
 *
 * 루틴 정의가 아니라 **세션에서** 뽑는다. 루틴을 v2.5로 교체해서 종목이 빠져도
 * 과거 기록은 계속 조회할 수 있어야 한다 (§5.5의 루틴 교체 경로).
 */
export function allRecordKeys(sessions: Session[], routine: RoutineTemplate): RecordKeyInfo[] {
  const counts = new Map<RecordKey, number>()
  for (const session of completedSessions(sessions)) {
    for (const entry of session.entries) {
      if (doneSets(entry).length === 0) continue
      counts.set(entry.recordKey, (counts.get(entry.recordKey) ?? 0) + 1)
    }
  }

  // 루틴 순서(Day → plannedOrder)를 따르고, 루틴에 없는 것은 뒤로 보낸다
  const order = new Map<RecordKey, number>()
  let i = 0
  for (const day of routine.days) {
    for (const ex of [...day.exercises].sort((a, b) => a.plannedOrder - b.plannedOrder)) {
      order.set(`${ex.exerciseId}@${recordDayIdOf(day)}`, i)
      i += 1
    }
  }

  return [...counts.entries()]
    .map(([recordKey, sessionCount]) => {
      const { exerciseId, dayId } = parseRecordKey(recordKey)
      const routineExercise = findDay(routine, dayId)?.exercises.find(
        (e) => e.exerciseId === exerciseId,
      )
      return {
        recordKey,
        exerciseId,
        dayId,
        known: routineExercise !== undefined,
        group: routineExercise?.group ?? null,
        sessionCount,
      }
    })
    .sort(
      (a, b) =>
        (order.get(a.recordKey) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.recordKey) ?? Number.MAX_SAFE_INTEGER),
    )
}
