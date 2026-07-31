import type { RecordKey, RoutineTemplate, Session } from '../types'
import { parseRecordKey, recordDayIdOf } from '../types'
import { addDays, weekStart, weekStartsBetween } from './dates'
import { completedSessions, doneSets, e1rm, findRoutineExercise } from './derive'

/**
 * 분석 탭 파생 계산 (DESIGN.md §5.4 — v1 최소).
 *
 * "고급 분석(순서 영향 등)은 앱에서 하지 않음 — 내보내기 → Claude 분석이 설계 의도"
 * 그래서 여기 있는 것은 세 가지뿐이다. 차트를 늘리고 싶은 유혹을 설계가 미리 막아뒀다.
 */

// ─── A그룹 종목별 추이 (§5.4) ────────────────────────────

export interface StrengthPoint {
  date: string
  /** §5.4 "무게 × 최다 반복수" — 그 세션 최고 세트의 무게와 반복수 */
  topWeight: number
  maxReps: number
  /** 무게 × 최다 반복수 */
  topLoad: number
  /** 총 볼륨 Σ(무게 × 반복수) — 세트 상단을 못 채워도 상승이 보이는 지표 (§7) */
  volume: number
  e1rm: number
  mode: Session['mode']
}

/**
 * §7 진전 지표: "증량 조건이 감량기에 거의 충족되지 않으므로 보조 지표 필수".
 * topLoad만 보면 감량기에 평평해 보이므로 volume·e1RM을 같이 낸다.
 */
export function strengthTrend(sessions: Session[], recordKey: RecordKey): StrengthPoint[] {
  const out: StrengthPoint[] = []
  // 오래된 것부터 — 차트 x축이 시간순이어야 한다
  for (const session of completedSessions(sessions).slice().reverse()) {
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry) continue
    const sets = doneSets(entry)
    if (sets.length === 0) continue

    // "최고 세트" = e1RM이 가장 높은 세트. 무게만 보면 3회짜리 무거운 세트가
    // 12회짜리 가벼운 세트보다 항상 이겨서 반복수 진전이 안 보인다
    const best = sets.reduce((a, b) => (e1rm(b.weight, b.reps) > e1rm(a.weight, a.reps) ? b : a))
    out.push({
      date: session.date,
      topWeight: best.weight,
      maxReps: best.reps,
      topLoad: Math.round(best.weight * best.reps * 10) / 10,
      volume: sets.reduce((n, s) => n + s.weight * s.reps, 0),
      e1rm: Math.round(e1rm(best.weight, best.reps) * 10) / 10,
      mode: session.mode,
    })
  }
  return out
}

/** A그룹 recordKey 목록 (루틴 순서). 기록이 있는 것만 */
export function strengthRecordKeys(
  sessions: Session[],
  routine: RoutineTemplate,
): { recordKey: RecordKey; exerciseId: string; dayId: string; sessionCount: number }[] {
  const counts = new Map<RecordKey, number>()
  for (const session of completedSessions(sessions)) {
    for (const entry of session.entries) {
      if (doneSets(entry).length === 0) continue
      const { exerciseId, dayId } = parseRecordKey(entry.recordKey)
      if (findRoutineExercise(routine, dayId, exerciseId)?.group !== 'A') continue
      counts.set(entry.recordKey, (counts.get(entry.recordKey) ?? 0) + 1)
    }
  }

  const order = new Map<RecordKey, number>()
  let i = 0
  for (const day of routine.days) {
    for (const ex of [...day.exercises].sort((a, b) => a.plannedOrder - b.plannedOrder)) {
      order.set(`${ex.exerciseId}@${recordDayIdOf(day)}`, i)
      i += 1
    }
  }

  return [...counts.entries()]
    .map(([recordKey, sessionCount]) => ({
      recordKey,
      ...parseRecordKey(recordKey),
      sessionCount,
    }))
    .sort(
      (a, b) =>
        (order.get(a.recordKey) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.recordKey) ?? Number.MAX_SAFE_INTEGER),
    )
}

// ─── B그룹 감각 점수 추이 (§5.4) ─────────────────────────

/** §5.4: "B그룹 감각 점수 추이 (종목 × 4주 단위 평균)" */
export const SENSORY_BUCKET_WEEKS = 4

export interface SensoryBucket {
  /** 구간 시작(월요일) */
  from: string
  to: string
  label: string
  /** recordKey → 평균 점수 (기록 없으면 키가 없다) */
  scores: Record<RecordKey, number>
  /** recordKey → 입력된 세션 수 */
  counts: Record<RecordKey, number>
}

export interface SensoryTrend {
  buckets: SensoryBucket[]
  /** 감각 점수가 입력된 B그룹 recordKey */
  recordKeys: RecordKey[]
  /** 전 구간 평균이 1 이하인 종목 — §5.4 "계속 0인 종목" 탐지 */
  weak: { recordKey: RecordKey; average: number; count: number }[]
}

export function sensoryTrend(
  sessions: Session[],
  routine: RoutineTemplate,
  today: string,
): SensoryTrend {
  const done = completedSessions(sessions)
  const keys = new Set<RecordKey>()

  // 감각 점수가 실제로 입력된 B그룹만 대상 (미입력 종목으로 차트를 채우지 않는다)
  for (const session of done) {
    for (const entry of session.entries) {
      if (entry.sensoryScore === undefined) continue
      const { exerciseId, dayId } = parseRecordKey(entry.recordKey)
      if (findRoutineExercise(routine, dayId, exerciseId)?.group !== 'B') continue
      keys.add(entry.recordKey)
    }
  }

  if (done.length === 0 || keys.size === 0) {
    return { buckets: [], recordKeys: [], weak: [] }
  }

  const oldest = done[done.length - 1].date
  const allWeeks = weekStartsBetween(oldest, today)

  const buckets: SensoryBucket[] = []
  for (let i = 0; i < allWeeks.length; i += SENSORY_BUCKET_WEEKS) {
    const from = allWeeks[i]
    const lastWeek = allWeeks[Math.min(i + SENSORY_BUCKET_WEEKS - 1, allWeeks.length - 1)]
    const to = addDays(lastWeek, 6)

    const sums: Record<RecordKey, number> = {}
    const counts: Record<RecordKey, number> = {}
    for (const session of done) {
      if (session.date < from || session.date > to) continue
      for (const entry of session.entries) {
        if (entry.sensoryScore === undefined || !keys.has(entry.recordKey)) continue
        sums[entry.recordKey] = (sums[entry.recordKey] ?? 0) + entry.sensoryScore
        counts[entry.recordKey] = (counts[entry.recordKey] ?? 0) + 1
      }
    }
    const scores: Record<RecordKey, number> = {}
    for (const [key, sum] of Object.entries(sums)) {
      scores[key] = Math.round((sum / counts[key]) * 100) / 100
    }
    buckets.push({ from, to, label: `${from.slice(5)}~`, scores, counts })
  }

  // 전 기간 평균으로 약한 종목을 뽑는다 (구간별로 보면 표본이 1~2개라 흔들린다)
  const totalSum: Record<RecordKey, number> = {}
  const totalCount: Record<RecordKey, number> = {}
  for (const b of buckets) {
    for (const [key, count] of Object.entries(b.counts)) {
      totalSum[key] = (totalSum[key] ?? 0) + b.scores[key] * count
      totalCount[key] = (totalCount[key] ?? 0) + count
    }
  }
  const weak = Object.keys(totalCount)
    .map((key) => ({
      recordKey: key,
      average: Math.round((totalSum[key] / totalCount[key]) * 100) / 100,
      count: totalCount[key],
    }))
    // 표본이 1개면 우연일 수 있다. 2회 이상 입력된 것만 신호로 본다
    .filter((x) => x.average <= 1 && x.count >= 2)
    .sort((a, b) => a.average - b.average)

  return { buckets, recordKeys: [...keys], weak }
}

// ─── 주간 수행 횟수 (§5.4) ───────────────────────────────

export interface WeeklyBar {
  weekStart: string
  label: string
  count: number
  /** 목표(주 N회) 달성 */
  met: boolean
}

/**
 * §5.4 "주간 수행 횟수 바 차트 (월별)".
 * 이 앱의 존재 이유가 "기록 부재 → 주 3회 습관"이므로 목표선 대비로 보여준다.
 */
export function weeklyBars(
  sessions: Session[],
  today: string,
  weeks: number,
  minPerWeek: number,
): WeeklyBar[] {
  const byWeek = new Map<string, number>()
  for (const session of completedSessions(sessions)) {
    const key = weekStart(session.date)
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1)
  }
  const from = addDays(weekStart(today), -7 * (weeks - 1))
  return weekStartsBetween(from, today).map((ws) => {
    const count = byWeek.get(ws) ?? 0
    return { weekStart: ws, label: ws.slice(5).replace('-', '/'), count, met: count >= minPerWeek }
  })
}
