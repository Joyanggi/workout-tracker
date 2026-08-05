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

/**
 * 초 → `M:SS` (휴식 표시 공용).
 *
 * 휴식 타이머 바와 재개 스트립이 각자 이 3줄을 갖고 있었다 — 같은 사실을 두 곳에서
 * 포맷하는 형태이고, 이 프로젝트가 반복해서 고쳐 온 부류다. 지금은 둘 다 같은
 * `timer.remainingSec`을 받으므로 무해했지만, 표시 형식을 바꾸려면 두 곳을 고쳐야 했다.
 */
export function mmss(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/*
 * ─── UTC ISO → 기기 로컬 표시 (Z7) ────────────────────────
 *
 * 백업 시각은 GitHub API의 `updated_at`(UTC ISO)이다. 화면이 이걸 `slice(0, 16)`으로
 * 그대로 잘라 쓰고 있었고, 그래서 **KST 자정~09시 사이의 모든 백업이 하루 전 날짜로**
 * 보였다 — 8/5 08:56에 백업한 것이 "08-04 23:56"으로 표시된다.
 *
 * 사용자 보고는 "백업이 된 건데 시간만 오류인지 판단이 안 선다"였다.
 * **판단이 안 서는 것 자체가 결함이다** — 백업 상태 표시의 존재 이유가 그 판단을
 * 대신 해주는 것이다. 데이터는 무사했다 (Gist 리비전 이력으로 확정).
 *
 * `slice`가 **네 곳**에 복제돼 있었다 (패턴 B) — 계획서는 두 곳을 지목했고, 내가 grep으로
 * 세 곳을 찾았고, 인바리언트 테스트가 네 번째(`ImportPanel`)를 잡았다.
 * 함수 하나로 모은다 — `mmss`를 뽑은 것과 같은 이유다.
 */

/** UTC ISO → 로컬 `YYYY-MM-DD HH:mm`. 파싱 실패는 원문을 돌려준다 (표시가 사라지지 않게) */
export function formatDateTimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${toDateStr(d)} ${hh}:${mm}`
}

/**
 * UTC ISO → 로컬 `YYYY-MM-DD` (날짜 계산용).
 *
 * `iso.slice(0, 10)`은 UTC 날짜라 KST 자정~09시 업로드가 하루 어긋난다.
 * 백업 리마인드가 그 값으로 경과일을 세고 있었다.
 *
 * **날짜만 있는 문자열(`"2026-08-04"`)은 그대로 돌려준다.** 이 코드베이스에서
 * `YYYY-MM-DD`는 이미 로컬 날짜이고(`toDateStr`·`parseDateStr` 규약), `new Date()`는
 * 그것을 **UTC 자정**으로 읽는다 — UTC보다 뒤진 시간대(예: UTC−4)에서는 하루 밀린다.
 * 테스트를 여러 시간대에서 돌리다 발견했다 (America/New_York에서 8/4 → 8/3).
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function localDateOf(iso: string): string {
  if (DATE_ONLY.test(iso.trim())) return iso.trim()
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : toDateStr(d)
}
