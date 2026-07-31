/**
 * 날짜는 전부 로컬 기준 "YYYY-MM-DD" 문자열로 다룬다 (Session.date와 동일 포맷).
 *
 * `new Date("2026-08-04")`는 **UTC 자정**으로 파싱된다. 한국(UTC+9)에서 이걸
 * `getDate()`로 읽으면 8월 4일 09:00이라 우연히 맞지만, UTC보다 뒤진 타임존이나
 * 날짜 산술에서는 하루가 밀린다. 그래서 파싱을 직접 한다.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function todayLocal(now: Date = new Date()): string {
  return toDateStr(now)
}

/** "YYYY-MM-DD" → 로컬 자정 Date */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** to − from, 일 단위. DST로 23/25시간이 되는 날이 있어 반올림한다. */
export function daysBetween(from: string, to: string): number {
  const ms = parseDateStr(to).getTime() - parseDateStr(from).getTime()
  return Math.round(ms / 86_400_000)
}

/** 주의 시작(월요일). DESIGN.md §7 "주간 수행 횟수: 월~일 기준" */
export function weekStart(dateStr: string): string {
  const d = parseDateStr(dateStr)
  const mondayBased = (d.getDay() + 6) % 7 // 일=6, 월=0
  d.setDate(d.getDate() - mondayBased)
  return toDateStr(d)
}

/** 해당 날짜가 속한 주의 월~일 7일 */
export function weekDates(dateStr: string): string[] {
  const start = parseDateStr(weekStart(dateStr))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return toDateStr(d)
  })
}

/** from~to를 포함하는 모든 주의 월요일, 오름차순 */
export function weekStartsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let cursor = parseDateStr(weekStart(from))
  const end = parseDateStr(weekStart(to)).getTime()
  while (cursor.getTime() <= end) {
    out.push(toDateStr(cursor))
    const next = new Date(cursor)
    next.setDate(next.getDate() + 7)
    cursor = next
  }
  return out
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateStr(dateStr)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

/** 그 달의 1일 */
export function monthStart(dateStr: string): string {
  const d = parseDateStr(dateStr)
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function addMonths(dateStr: string, months: number): string {
  const d = parseDateStr(dateStr)
  // 1일로 정규화한 뒤 이동한다. 3월 31일에서 −1개월 하면 2월 31일 → 3월 3일로 넘어간다
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + months, 1))
}

export function monthLabel(dateStr: string): string {
  const d = parseDateStr(dateStr)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/**
 * 달력 격자. 그 달을 포함하는 월요일 시작 주들을 채운다.
 * 주 수는 달마다 4~6주로 다르므로 고정하지 않는다 (2월이 월요일 시작이면 4주).
 */
export function monthGrid(anyDateInMonth: string): string[] {
  const first = monthStart(anyDateInMonth)
  const lastDay = parseDateStr(addMonths(first, 1))
  lastDay.setDate(lastDay.getDate() - 1)
  const last = toDateStr(lastDay)

  const out: string[] = []
  let cursor = parseDateStr(weekStart(first))
  const end = parseDateStr(weekStart(last))
  end.setDate(end.getDate() + 6)
  while (cursor.getTime() <= end.getTime()) {
    out.push(toDateStr(cursor))
    const next = new Date(cursor)
    next.setDate(next.getDate() + 1)
    cursor = next
  }
  return out
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

export function weekdayKo(dateStr: string): string {
  return WEEKDAY_KO[parseDateStr(dateStr).getDay()]
}

export function hoursBetweenIso(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000
}

/** 경과 시간 "1:23:45" / "23:45" */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
