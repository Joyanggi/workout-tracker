import type {
  MuscleKey,
  RecordKey,
  RoutineDay,
  RoutineExercise,
  RoutineTemplate,
  Session,
  SessionEntry,
} from '../types'
import { parseRecordKey } from '../types'
import { daysBetween, weekDates } from './dates'

/**
 * sessions에서 파생 계산하는 것들 (DESIGN.md §7).
 * streak·디로드 카운터·주간 볼륨을 저장하지 않는 이유: 기록을 나중에 고쳐도
 * 모든 지표가 같이 맞춰지게 하려면 단일 진실 원천이 하나여야 한다.
 */

export function isCompleted(s: Session): boolean {
  return Boolean(s.endedAt)
}

/** 완료 세션만, 최신순 */
export function completedSessions(sessions: Session[]): Session[] {
  return sessions
    .filter(isCompleted)
    .sort((a, b) => (a.date === b.date ? b.startedAt.localeCompare(a.startedAt) : b.date.localeCompare(a.date)))
}

/**
 * 체크된 **작업 세트** (워밍업 제외).
 *
 * 분석 경로 전부가 이 함수를 통과한다 — 볼륨, 증량 판정, PR, Phase 조건, 내보내기,
 * 부위별 집계. 워밍업 제외를 여기 한 곳에 두면 새 분석을 추가해도 자동으로 맞는다.
 * 반대로 각 호출부에서 필터하면 한 군데만 빠뜨려도 조용히 틀린 숫자가 나온다.
 */
export function doneSets(entry: SessionEntry) {
  return entry.sets.filter((s) => s.done && !s.warmup)
}

/** 체크된 전 세트 (워밍업 포함). "완료 n세트" 같은 **표시**용 */
export function doneSetsAll(entry: SessionEntry) {
  return entry.sets.filter((s) => s.done)
}

/** 세션 전체에서 실제로 체크된 세트 수 */
/** 표시용 — 워밍업도 "내가 한 세트"이므로 포함한다 */
export function totalDoneSets(session: Session): number {
  return session.entries.reduce((n, e) => n + doneSetsAll(e).length, 0)
}

/** 총 볼륨 = Σ(무게 × 반복수). 체크된 세트만. (§7 진전 지표) */
export function totalVolume(session: Session): number {
  return session.entries.reduce(
    (sum, e) => sum + doneSets(e).reduce((v, s) => v + s.weight * s.reps, 0),
    0,
  )
}

/** e1RM 추정 = 무게 × (1 + reps/30). Epley. (§7 진전 지표) */
export function e1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

// ─── 루틴 조회 ───────────────────────────────────────────

export function findDay(routine: RoutineTemplate, dayId: string): RoutineDay | undefined {
  return routine.days.find((d) => d.id === dayId) ?? routine.fallbackDays.find((d) => d.id === dayId)
}

export function findRoutineExercise(
  routine: RoutineTemplate,
  dayId: string,
  exerciseId: string,
): RoutineExercise | undefined {
  return findDay(routine, dayId)?.exercises.find((e) => e.exerciseId === exerciseId)
}

/**
 * recordKey → 부위. recordKey의 dayId는 항상 정규 Day를 가리킨다
 * (fallback 세션도 정규 Day의 라인으로 기록하므로 — §8).
 */
export function muscleOfRecordKey(
  routine: RoutineTemplate,
  recordKey: RecordKey,
): MuscleKey | undefined {
  const { exerciseId, dayId } = parseRecordKey(recordKey)
  return findRoutineExercise(routine, dayId, exerciseId)?.muscle
}

/**
 * entry → 그 entry가 따르는 루틴 계획 (T8 대체운동 대응).
 *
 * **분석·표시 경로 전부가 이 함수를 통과한다** — 부위 집계, 목표 반복수, 그룹(A/B),
 * 증량 판정, 내보내기, 카드 렌더링. 대체 종목은 루틴에 없으므로 각 호출부에서
 * `findRoutineExercise(routine, dayId, exerciseId)`를 직접 부르면 `undefined`가 되고,
 * 그 결과 **대체 수행한 세트의 볼륨이 조용히 0으로 사라진다.**
 *
 * 대체 수행이면 원 종목의 계획을 그대로 쓰고 exerciseId만 바꿔 돌려준다 —
 * "대체는 같은 운동의 다른 수행"이므로 부위·세트 수·목표 반복수·그룹이 원 종목을 따른다.
 * (recordKey는 대체 종목 자신의 것을 유지해서 프리필·증량·PR만 분리한다)
 */
export function routineExerciseOfEntry(
  routine: RoutineTemplate,
  entry: SessionEntry,
): RoutineExercise | undefined {
  const own = parseRecordKey(entry.recordKey)
  if (!entry.substituteFor) {
    return findRoutineExercise(routine, own.dayId, own.exerciseId)
  }
  const origin = parseRecordKey(entry.substituteFor)
  const planned = findRoutineExercise(routine, origin.dayId, origin.exerciseId)
  return planned ? { ...planned, exerciseId: own.exerciseId } : undefined
}

/** entry → 부위. 대체 수행이면 원 종목의 부위 (T8) */
export function muscleOfEntry(
  routine: RoutineTemplate,
  entry: SessionEntry,
): MuscleKey | undefined {
  return routineExerciseOfEntry(routine, entry)?.muscle
}

// ─── 주간 집계 (§4 볼륨 예산 · §5.1 대시보드 공용) ──────

export interface WeeklyVolume {
  /** 부위별 실제 수행 세트 수 (체크된 세트만) */
  sets: Record<MuscleKey, number>
  /** 부위별 노출 세션 수 — 빈도(2x/1x) 판정용 */
  exposures: Record<MuscleKey, number>
  /** 이번 주 완료 세션 수 */
  sessionCount: number
}

export function weeklyVolume(
  sessions: Session[],
  routine: RoutineTemplate,
  anyDateInWeek: string,
): WeeklyVolume {
  const dates = new Set(weekDates(anyDateInWeek))
  const inWeek = completedSessions(sessions).filter((s) => dates.has(s.date))

  const sets: Record<MuscleKey, number> = {}
  const exposures: Record<MuscleKey, number> = {}

  for (const session of inWeek) {
    const touched = new Set<MuscleKey>()
    for (const entry of session.entries) {
      const n = doneSets(entry).length
      if (n === 0) continue
      // 대체 수행(T8)은 원 종목의 부위로 집계한다 — 자리가 없어 기계를 바꾼 것이
      // 그 부위를 하지 않은 것이 되면 §4 볼륨 예산이 같은 부위를 또 배정한다
      const muscle = muscleOfEntry(routine, entry)
      if (!muscle) continue // v2.5+ 루틴이 부위를 바꿔도 집계만 건너뛴다 (§3)
      sets[muscle] = (sets[muscle] ?? 0) + n
      touched.add(muscle)
    }
    for (const muscle of touched) exposures[muscle] = (exposures[muscle] ?? 0) + 1
  }

  return { sets, exposures, sessionCount: inWeek.length }
}

/** 마지막으로 해당 Day를 수행한 날로부터 며칠 지났는지. 기록이 없으면 null */
export function daysSinceDay(
  sessions: Session[],
  dayId: string,
  today: string,
): number | null {
  const last = completedSessions(sessions).find(
    (s) => s.dayId === dayId || findDayIdOfRecord(s) === dayId,
  )
  return last ? daysBetween(last.date, today) : null
}

/**
 * 계획 순서 대비 수행 순서 이탈 (§5.2 타임라인 · §6 내보내기 공용).
 * 수행한 종목들만 놓고, 계획 순서로 정렬했을 때의 자리와 실제 자리를 비교한다.
 */
export function orderDeviations(session: Session): { entry: SessionEntry; shift: number }[] {
  const performed = session.entries
    .filter((e) => e.performedOrder !== null)
    .sort((a, b) => a.performedOrder! - b.performedOrder!)
  const byPlan = [...performed].sort((a, b) => a.plannedOrder - b.plannedOrder)
  return performed.map((entry) => ({
    entry,
    shift: entry.performedOrder! - (byPlan.indexOf(entry) + 1),
  }))
}

/** fallback 세션도 대응 정규 Day를 수행한 것으로 본다 */
function findDayIdOfRecord(session: Session): string | undefined {
  const first = session.entries[0]
  return first ? parseRecordKey(first.recordKey).dayId : undefined
}
