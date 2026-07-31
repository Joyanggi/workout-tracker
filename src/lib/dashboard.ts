import type { MuscleKey, RoutineTemplate, Session } from '../types'
import { parseRecordKey } from '../types'
import { daysBetween, weekDates, weekStart, weekStartsBetween } from './dates'
import { completedSessions, doneSets, weeklyVolume } from './derive'

/**
 * 홈 대시보드용 파생 계산 (DESIGN.md §5.1 · §7).
 * 저장하지 않고 sessions에서 매번 계산한다 — 기록을 나중에 고쳐도 지표가 같이 맞춰지도록.
 */

/** Phase 0 목표: 주 3회 이상 × 8주 연속 (§1 사용자 컨텍스트) */
export const PHASE0_TARGET_WEEKS = 8

/** Phase 0에서 "주 2회" 주를 통과로 인정해주는 횟수 (§7) */
export const PHASE0_TWO_SESSION_ALLOWANCE = 1

/** 4주+ 공백이면 디로드 카운터를 리셋한다 (§7) */
export const DELOAD_RESET_GAP_DAYS = 28

/** 조기 디로드 신호에 쓰는 A그룹 주요 종목 수 (§7) */
export const KEY_EXERCISE_COUNT = 3

// ─── 주간 수행 횟수 ──────────────────────────────────────

export interface WeekCount {
  weekStart: string
  count: number
}

/**
 * 주별 완료 세션 수. 정규 Day + fallback 모두 카운트한다 (§7).
 * 기록이 없는 주도 count 0으로 포함해서 연속성 판정에 쓸 수 있게 한다.
 */
export function weekCounts(sessions: Session[], today: string): WeekCount[] {
  const done = completedSessions(sessions)
  if (done.length === 0) return [{ weekStart: weekStart(today), count: 0 }]

  const oldest = done[done.length - 1].date
  const byWeek = new Map<string, number>()
  for (const session of done) {
    const key = weekStart(session.date)
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1)
  }
  return weekStartsBetween(oldest, today).map((ws) => ({
    weekStart: ws,
    count: byWeek.get(ws) ?? 0,
  }))
}

export interface WeekDot {
  date: string
  /** 그 날 완료된 세션 수 (같은 날 두 세션 허용 — §4) */
  count: number
  isToday: boolean
  isFuture: boolean
}

/** 이번 주 월~일 도트 (§5.1) */
export function weekDots(sessions: Session[], today: string): WeekDot[] {
  const done = completedSessions(sessions)
  const byDate = new Map<string, number>()
  for (const s of done) byDate.set(s.date, (byDate.get(s.date) ?? 0) + 1)

  return weekDates(today).map((date) => ({
    date,
    count: byDate.get(date) ?? 0,
    isToday: date === today,
    isFuture: date > today,
  }))
}

// ─── 부위별 볼륨 바 ──────────────────────────────────────

export interface MuscleBar {
  muscle: MuscleKey
  performed: number
  target: number
  weight: number
  /** 이번 주 노출 세션 수 */
  exposures: number
  /** 루틴이 이 부위를 제공하는 정규 Day 수 (최대 2로 캡) — 기대 빈도 */
  expectedExposures: number
  /** 기대 빈도에 미달 + 판단할 만큼 주가 진행됨 */
  underFrequency: boolean
}

/**
 * 부위별 기대 빈도는 **루틴이 그 부위를 몇 개 Day에서 제공하는지**로 구한다.
 * 부위 이름을 하드코딩하지 않기 위한 것 (§3: v2.5+ 루틴이 부위를 추가할 수 있다).
 * 2회 이상 제공하면 주 2회 노출을 기대한다 (§7: 볼륨을 맞춰도 주 2회 > 주 1회).
 */
export function expectedExposures(routine: RoutineTemplate, muscle: MuscleKey): number {
  const days = routine.days.filter((d) => (d.muscleSets[muscle] ?? 0) > 0).length
  return Math.min(2, days)
}

export function muscleBars(
  sessions: Session[],
  routine: RoutineTemplate,
  today: string,
): { bars: MuscleBar[]; sessionCount: number } {
  const week = weeklyVolume(sessions, routine, today)
  // 주가 최소 목표(주 3회)에 도달하기 전에는 빈도 미달을 경고하지 않는다.
  // 월요일에 모든 부위가 "0x 주의"로 빨갛게 뜨면 정보가 아니라 소음이다.
  const judgeable = week.sessionCount >= routine.rules.deloadMinSessionsPerWeek

  const bars = Object.entries(routine.muscleTargets)
    .map(([muscle, target]) => {
      const exposures = week.exposures[muscle] ?? 0
      const expected = expectedExposures(routine, muscle)
      return {
        muscle,
        performed: week.sets[muscle] ?? 0,
        target: target.target,
        weight: target.weight,
        exposures,
        expectedExposures: expected,
        underFrequency: judgeable && expected >= 2 && exposures < 2,
      }
    })
    // 우선순위(가중치) 순 정렬 (§5.1)
    .sort((a, b) => b.weight - a.weight)

  return { bars, sessionCount: week.sessionCount }
}

// ─── 디로드 카운터 ───────────────────────────────────────

export interface DeloadState {
  /** 주 3회 이상을 채운 주 수 (리셋 이후) */
  performedWeeks: number
  target: number
  /** 8주 도달 */
  due: boolean
  /** 2주 연속 수행 하락 (조기 신호) */
  earlySignal: boolean
  earlyDetail: string | null
}

/**
 * 카운터를 다시 0부터 세기 시작하는 날.
 *
 * §7은 "마지막 세션과 4주+ 공백 발생 시 0으로 리셋"만 규정한다. 그런데 **디로드를 실제로
 * 수행했을 때의 리셋이 빠져 있다.** 그것이 없으면 8주에 도달해 디로드를 하고 나서도
 * 카운터가 8 이상으로 남아 배너가 영구히 뜬다. 그래서 두 조건 중 나중 것을 쓴다.
 */
function counterStartWeek(done: Session[], today: string): string {
  // done은 최신순 → 오래된 순으로 훑는다
  const asc = [...done].reverse()
  let startWeek = weekStart(asc[0].date)

  for (let i = 1; i < asc.length; i += 1) {
    if (daysBetween(asc[i - 1].date, asc[i].date) >= DELOAD_RESET_GAP_DAYS) {
      // 공백 이후 첫 세션이 속한 주부터 새로 센다 (그 주는 포함)
      startWeek = weekStart(asc[i].date)
    }
  }

  // 디로드 주는 새 사이클에 포함하지 않는다 → 그 다음 주부터
  const lastDeload = asc.filter((s) => s.mode === 'deload').pop()
  if (lastDeload) {
    const after = weekStartsBetween(lastDeload.date, today)[1]
    if (after && after > startWeek) startWeek = after
  }

  // 진행 중인 공백도 리셋 대상이다 (마지막 세션 이후 4주가 지난 경우)
  if (daysBetween(asc[asc.length - 1].date, today) >= DELOAD_RESET_GAP_DAYS) {
    startWeek = weekStart(today)
  }

  return startWeek
}

export function deloadState(
  sessions: Session[],
  routine: RoutineTemplate,
  today: string,
): DeloadState {
  const done = completedSessions(sessions)
  const target = routine.rules.deloadEveryPerformedWeeks
  const early = earlyDeloadSignal(sessions, routine, today)

  if (done.length === 0) {
    return { performedWeeks: 0, target, due: false, earlySignal: false, earlyDetail: null }
  }

  const startWeek = counterStartWeek(done, today)
  const performedWeeks = weekCounts(sessions, today).filter(
    (w) => w.weekStart >= startWeek && w.count >= routine.rules.deloadMinSessionsPerWeek,
  ).length

  return {
    performedWeeks,
    target,
    due: performedWeeks >= target,
    earlySignal: early.signal,
    earlyDetail: early.detail,
  }
}

// ─── 조기 디로드 신호 ────────────────────────────────────

/**
 * "A그룹 주요 3종목"의 정의가 §7에 없다. A그룹 중 세트 수가 많은 순으로 3개를 고른다
 * (동수면 부위 가중치). v2.4에서는 인클라인 프레스·랫풀다운·시티드 로우 —
 * D1/D2의 앵커 리프트라 "주요"의 상식적 해석과 맞는다.
 */
export function keyARecordKeys(routine: RoutineTemplate): string[] {
  return routine.days
    .flatMap((day) =>
      day.exercises
        .filter((ex) => ex.group === 'A')
        .map((ex) => ({
          recordKey: `${ex.exerciseId}@${day.id}`,
          sets: ex.sets,
          weight: routine.muscleTargets[ex.muscle]?.weight ?? 0,
        })),
    )
    .sort((a, b) => (b.sets === a.sets ? b.weight - a.weight : b.sets - a.sets))
    .slice(0, KEY_EXERCISE_COUNT)
    .map((x) => x.recordKey)
}

/**
 * 그 주에 해당 recordKey를 수행한 세션 중 **총 반복수가 가장 많은 세션의 값**.
 *
 * §7은 "총 반복수 하락"이라고만 쓰여 있는데, 주간 합으로 계산하면 **출석 감소와 수행 저하를
 * 구분할 수 없다.** 주 4회 한 주 다음에 주 3회 한 주가 오면 합은 당연히 떨어지므로,
 * 컨디션이 좋아도 디로드 배너가 뜬다. 세션 단위 최고값을 쓰면 횟수에 영향받지 않는다.
 */
function weeklyBestReps(
  sessions: Session[],
  recordKey: string,
  weekStartDate: string,
): number | null {
  const dates = new Set(weekDates(weekStartDate))
  let best: number | null = null
  for (const session of completedSessions(sessions)) {
    if (!dates.has(session.date)) continue
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry) continue
    const sets = doneSets(entry)
    if (sets.length === 0) continue
    const total = sets.reduce((n, s) => n + s.reps, 0)
    if (best === null || total > best) best = total
  }
  return best
}

function isAllNumbers(values: (number | null)[]): values is number[] {
  return values.every((v) => v !== null)
}

/**
 * 조기 디로드 신호: 주요 3종목 합계가 2주 연속 하락 (§7).
 * 세 종목 모두 데이터가 있는 주만 비교 대상이다 — 한 종목이 빠진 주를 끼우면
 * 합계가 떨어지는 게 당연해서 신호가 아니라 잡음이 된다.
 */
export function earlyDeloadSignal(
  sessions: Session[],
  routine: RoutineTemplate,
  today: string,
): { signal: boolean; detail: string | null } {
  const keys = keyARecordKeys(routine)
  const done = completedSessions(sessions)
  if (done.length === 0 || keys.length === 0) return { signal: false, detail: null }

  const oldest = done[done.length - 1].date
  const comparable: { weekStart: string; total: number }[] = []

  for (const ws of weekStartsBetween(oldest, today)) {
    const values = keys.map((key) => weeklyBestReps(sessions, key, ws))
    // 한 종목이라도 데이터가 없는 주는 비교하지 않는다 — 합계가 떨어지는 게 당연해서
    // 수행 저하 신호가 아니라 잡음이 된다
    if (!isAllNumbers(values)) continue
    comparable.push({ weekStart: ws, total: values.reduce((a, b) => a + b, 0) })
  }

  if (comparable.length < 3) return { signal: false, detail: null }
  const [a, b, c] = comparable.slice(-3)
  const signal = a.total > b.total && b.total > c.total
  return {
    signal,
    detail: signal ? `주요 3종목 총 반복수 ${a.total} → ${b.total} → ${c.total}` : null,
  }
}

// ─── Phase 0 진행률 ──────────────────────────────────────

export interface Phase0Progress {
  /** 연속 주 수 */
  streak: number
  target: number
  /** 주 2회 통과를 몇 번 썼는가 */
  allowanceUsed: number
  achieved: boolean
}

/**
 * Phase 0 진행: 최근 주부터 거슬러 "주 3회 이상" 연속 주 수 (§7).
 * 주 2회 주는 8주 중 1회까지 통과로 인정한다.
 *
 * **진행 중인 이번 주는 미달이어도 연속을 끊지 않는다.** 수요일에 2회를 한 상태를
 * "실패"로 처리하면 주중에 진행률이 0으로 떨어졌다가 주말에 되살아난다.
 * 이번 주가 이미 조건을 충족했으면 포함하고, 아직 아니면 판정을 보류한다.
 */
export function phase0Progress(
  sessions: Session[],
  routine: RoutineTemplate,
  today: string,
): Phase0Progress {
  const min = routine.rules.deloadMinSessionsPerWeek
  const weeks = weekCounts(sessions, today)
  const thisWeek = weekStart(today)

  let streak = 0
  let allowanceUsed = 0

  for (let i = weeks.length - 1; i >= 0; i -= 1) {
    const { weekStart: ws, count } = weeks[i]
    const isCurrent = ws === thisWeek

    if (count >= min) {
      streak += 1
    } else if (isCurrent) {
      // 아직 진행 중 — 판정 보류. **통과권도 쓰지 않는다.**
      // 수요일에 2회를 한 상태에서 8주 중 단 1회뿐인 통과권을 소진하면,
      // 그 주에 3회를 채워도 이미 쓴 것처럼 보이고 다음 주에 쓸 수 없게 된다.
      continue
    } else if (count === min - 1 && allowanceUsed < PHASE0_TWO_SESSION_ALLOWANCE) {
      allowanceUsed += 1
      streak += 1
    } else {
      break
    }
    if (streak >= PHASE0_TARGET_WEEKS) break
  }

  return {
    streak,
    target: PHASE0_TARGET_WEEKS,
    allowanceUsed,
    achieved: streak >= PHASE0_TARGET_WEEKS,
  }
}

// ─── 증량 배지 ───────────────────────────────────────────

/** 홈 배지용 — 직전 완료 세션에서 더블 프로그레션을 충족한 종목 (§5.1) */
export function lastSessionOf(sessions: Session[]): Session | undefined {
  return completedSessions(sessions)[0]
}

/** recordKey → 종목 shortName 조회용. 루틴에 없는 종목은 id를 그대로 돌려준다 */
export function exerciseIdOfRecordKey(recordKey: string): string {
  return parseRecordKey(recordKey).exerciseId
}

