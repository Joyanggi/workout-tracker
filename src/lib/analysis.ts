import type { RecordKey, RoutineTemplate, Session } from '../types'
import { parseRecordKey, recordDayIdOf } from '../types'
import { addDays, weekStart, weekStartsBetween } from './dates'
import { completedSessions, doneSets, e1rm, routineExerciseOfEntry } from './derive'

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
  /** 그 세션의 감각 점수 (B그룹 차트 툴팁용, T12). 미입력이면 undefined */
  sensoryScore?: 0 | 1 | 2 | 3
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
      sensoryScore: entry.sensoryScore,
    })
  }
  return out
}

/**
 * 추이 차트에 올릴 recordKey 목록 (루틴 순서). 기록이 있는 것만.
 *
 * 기본은 A그룹만이다 — **의도된 제한**이다. B그룹의 성공 기준은 감각이라,
 * 무게 차트를 주면 무게를 쫓게 되는 역효과가 있다.
 *
 * `includeB`는 Phase 2부터만 켠다 (T12). 그 시점부터 루틴 문서 9장이 B그룹
 * "무게 회복"을 규정하므로, 무게 추이가 회복 진행을 판단하는 정보가 된다.
 * 조건부 노출이면 원래 의도(Phase 0~1 무게 집착 방지)와 충돌하지 않는다.
 *
 * `isInverse`가 참인 종목은 제외한다 (T8 어시스티드) — 표시 무게가 클수록 쉬우므로
 * 무게·볼륨·e1RM 추이가 전부 방향이 반대로 그려진다. 진전은 종목 히스토리 화면에서
 * 반복수로 본다.
 */
export function strengthRecordKeys(
  sessions: Session[],
  routine: RoutineTemplate,
  opts: { includeB?: boolean; isInverse?: (recordKey: RecordKey) => boolean } = {},
): {
  recordKey: RecordKey
  exerciseId: string
  dayId: string
  sessionCount: number
  group: 'A' | 'B'
}[] {
  const counts = new Map<RecordKey, number>()
  const groups = new Map<RecordKey, 'A' | 'B'>()
  /** 대체 recordKey → 원 종목 recordKey (정렬용) */
  const originOf = new Map<RecordKey, RecordKey>()
  for (const session of completedSessions(sessions)) {
    for (const entry of session.entries) {
      if (doneSets(entry).length === 0) continue
      // 대체 수행은 루틴에 없는 종목이므로 recordKey로 조회하면 그룹 판정에 실패하고
      // 차트에서 통째로 사라진다 (A그룹 대체가 안 뜨던 원인)
      const group = routineExerciseOfEntry(routine, entry)?.group
      if (group !== 'A' && !(opts.includeB && group === 'B')) continue
      if (opts.isInverse?.(entry.recordKey)) continue
      counts.set(entry.recordKey, (counts.get(entry.recordKey) ?? 0) + 1)
      groups.set(entry.recordKey, group === 'B' ? 'B' : 'A')
      if (entry.substituteFor) originOf.set(entry.recordKey, entry.substituteFor)
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

  /**
   * 대체 recordKey는 루틴 순서 map에 없어서 그냥 두면 맨 뒤로 밀린다.
   * 원 종목 바로 뒤(+0.5)에 놓아 "무엇의 대체인지"가 순서로 보이게 한다.
   */
  const rank = (recordKey: RecordKey): number => {
    const own = order.get(recordKey)
    if (own !== undefined) return own
    const origin = originOf.get(recordKey)
    const originRank = origin === undefined ? undefined : order.get(origin)
    return originRank === undefined ? Number.MAX_SAFE_INTEGER : originRank + 0.5
  }

  return [...counts.entries()]
    .map(([recordKey, sessionCount]) => ({
      recordKey,
      ...parseRecordKey(recordKey),
      sessionCount,
      group: groups.get(recordKey) ?? 'A',
    }))
    .sort((a, b) => rank(a.recordKey) - rank(b.recordKey))
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
      // 대체 수행도 원 종목의 그룹을 따른다 — 안 그러면 B그룹 대체의 감각 기록이
      // 추이와 "계속 약한 종목" 탐지에서 누락된다. inverse는 무관하다(감각에 방향이 없다)
      if (routineExerciseOfEntry(routine, entry)?.group !== 'B') continue
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

// ─── 대체 수행 빈도 (T8) ─────────────────────────────────

export interface SubstituteUse {
  /** 대체로 수행한 종목의 recordKey */
  recordKey: RecordKey
  /** 원 종목의 recordKey */
  originRecordKey: RecordKey
  count: number
}

/**
 * 대체 수행 빈도.
 *
 * 계획서 판단: 같은 대체를 반복해서 쓴다고 앱이 "루틴에 고정할까요?"를 제안하지는
 * 않는다 — 종목 고정은 루틴 문서 개정 사안이지 앱이 결정할 일이 아니다.
 * 대신 빈도만 보여줘서 사용자가 직접 판단하게 한다.
 */
export function substituteUses(sessions: Session[]): SubstituteUse[] {
  const counts = new Map<string, SubstituteUse>()
  for (const session of completedSessions(sessions)) {
    for (const entry of session.entries) {
      if (!entry.substituteFor) continue
      if (doneSets(entry).length === 0) continue
      const id = `${entry.recordKey}<-${entry.substituteFor}`
      const found = counts.get(id)
      if (found) found.count += 1
      else
        counts.set(id, {
          recordKey: entry.recordKey,
          originRecordKey: entry.substituteFor,
          count: 1,
        })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}
