import type { RoutineDay, RoutineTemplate, Session } from '../types'
import { recordDayIdOf } from '../types'
import { daysBetween } from './dates'
import { daysSinceDay, findDay, hasStrengthWork, strengthSessions } from './derive'
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

/** 마지막 근력 세션과 `today` 사이 일수. 근력 세션이 없으면 null */
function daysSinceLastStrength(sessions: Session[], today: string): number | null {
  const last = strengthSessions(sessions)[0]
  return last ? daysBetween(last.date, today) : null
}

/**
 * 홈 카드의 "이 Day 자체의 긴 공백" 한 줄 (KK4).
 * 그 Day 공백 14일 이상 그리고 마지막 근력 세션과 14일 미만일 때만 말한다 —
 * 마지막 근력 세션과 14일 이상이면 복귀 판정의 몫이다 (`sessionDayGapLine`과 같은 규칙).
 */
export function dayGapNotice(o: {
  sessions: Session[]
  routine: RoutineTemplate
  day: RoutineDay
  today: string
  returnSuggested: boolean
}): string | undefined {
  if (o.returnSuggested) return undefined
  const own = daysSinceDay(o.sessions, recordDayIdOf(o.day), o.today)
  if (own === null || own < RETURN_GAP_DAYS) return undefined
  const last = daysSinceLastStrength(o.sessions, o.today)
  if (last === null || last >= RETURN_GAP_DAYS) return undefined
  return `이 Day는 ${own}일 만이에요 — 복귀 조정은 마지막 운동(${last}일 전) 기준이라 적용되지 않습니다`
}

/** 정상 세션 내보내기의 "Day 공백" 줄 (KK4). `sessions`가 없으면 말하지 않는다 */
export function sessionDayGapLine(
  session: Session,
  routine: RoutineTemplate,
  sessions?: Session[],
): string | undefined {
  if (!sessions || session.mode !== 'normal' || !hasStrengthWork(session)) return undefined
  const before = sessions.filter((s) => s.date < session.date)
  const found = findDay(routine, session.dayId)
  const recordDay = found ? recordDayIdOf(found) : session.dayId
  const own = daysSinceDay(before, recordDay, session.date)
  if (own === null || own < RETURN_GAP_DAYS) return undefined
  const last = daysSinceLastStrength(before, session.date)
  if (last === null || last >= RETURN_GAP_DAYS) return undefined
  return `Day 공백 ${own}일 — 복귀 조정 없음 (직전 근력 세션 ${last}일 전 기준)`
}
