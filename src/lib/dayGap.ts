import type { RoutineDay, RoutineTemplate, Session } from '../types'
import { recordDayIdOf } from '../types'
import { daysBetween } from './dates'
import { daysSinceDay, strengthSessions } from './derive'
import { RETURN_GAP_DAYS } from './suggestNextDay'

/**
 * "그 Day를 얼마나 안 했나"를 묻는 곳(KK3·KK4)은 여기를 지난다.
 * 기준 일수는 `RETURN_GAP_DAYS`(장기 공백의 기존 정의)를 그대로 쓴다.
 */

/** "Day 1 — Push" → "Day 1 Push" (§6 예시 표기) */
export function dayLabel(name: string): string {
  return name.replace(' — ', ' ')
}

export interface DayLastDone {
  day: RoutineDay
  /** 근력 기준 마지막 수행 후 경과일. 기록 없으면 null */
  days: number | null
}

/** 정규 Day(`routine.days`) 순서대로 Day별 마지막 근력 수행 후 경과일 */
export function dayLastDone(
  sessions: Session[],
  routine: RoutineTemplate,
  today: string,
): DayLastDone[] {
  return routine.days.map((day) => ({ day, days: daysSinceDay(sessions, day.id, today) }))
}

export function lastDoneText(days: number | null): string {
  if (days === null) return '기록 없음'
  if (days === 0) return '오늘'
  return `마지막 ${days}일 전`
}

/**
 * 홈 카드의 "오래 안 한 Day" 한 줄. `lastDone`은 `dayLastDone`의 결과를 받는다.
 * 기록 없음 ≠ 오래 안 함 — 첫 근력 세션이 14일 이상 전일 때만 "기록 없음"을 오래 안 한 것으로 센다.
 */
export function staleDaysLine(
  lastDone: DayLastDone[],
  sessions: Session[],
  today: string,
  displayedDay: RoutineDay,
): string | undefined {
  const strength = strengthSessions(sessions)
  if (strength.length === 0) return undefined
  const firstDate = strength.reduce((m, s) => (s.date < m ? s.date : m), strength[0].date)
  const sinceFirst = daysBetween(firstDate, today)
  const shownId = recordDayIdOf(displayedDay)

  const stale = lastDone.filter(({ day, days }) => {
    if (day.id === shownId) return false
    if (days === null) return sinceFirst >= RETURN_GAP_DAYS
    return days >= RETURN_GAP_DAYS
  })
  if (stale.length === 0) return undefined

  const sorted = stale
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => {
      if ((a.days === null) !== (b.days === null)) return a.days === null ? -1 : 1
      if (a.days !== null && b.days !== null && a.days !== b.days) return b.days - a.days
      return a.i - b.i
    })
  return `오래 안 한 Day — ${sorted
    .map(({ day, days }) => `${dayLabel(day.name)} ${days === null ? '기록 없음' : `${days}일`}`)
    .join(' · ')}`
}
