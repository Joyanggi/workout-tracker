import type { Exercise, MuscleKey, MuscleTarget, RoutineDay, RoutineExercise, RoutineRules, RoutineTemplate, Session } from '../types'
import { parseRecordKey, recordDayIdOf } from '../types'

/**
 * 루틴 편집의 순수 함수 (v1.16 NN1). React·Dexie 없음.
 * 저장되는 루틴은 `finalizeRoutine` 하나가 만든다 — muscleSets·plannedOrder·muscleTargets를 화면이 입력받지 않는다.
 */

export const NEW_MUSCLE_WEIGHT = 0.5
/** 하체 Day를 지운 뒤 하체 가드가 걸리지 않게 하는 간격 (옛 검증은 lowerBodyDayId가 실제 Day여야 통과한다) */
export const NO_GUARD_GAP_DAYS = 100000
export const USER_ROUTINE_PREFIX = 'user-'
export const CUSTOM_EXERCISE_PREFIX = 'custom-'
/** 진행 중 세션이 있을 때 편집·저장·전환을 막는 문구. 화면과 routineStore가 같이 쓰는 한 곳 */
export const OPEN_SESSION_BLOCK = {
  edit: '진행 중인 세션을 마치거나 버린 뒤에 고칠 수 있습니다',
  save: '진행 중인 세션을 마치거나 버린 뒤에 저장할 수 있습니다',
  activate: '진행 중인 세션을 마치거나 버린 뒤에 바꿀 수 있습니다',
} as const

/** 부위별 sets 합. muscleSets를 만드는 유일한 자리 */
export function deriveMuscleSets(exercises: RoutineExercise[]): Record<MuscleKey, number> {
  const out: Record<MuscleKey, number> = {}
  for (const ex of exercises) out[ex.muscle] = (out[ex.muscle] ?? 0) + ex.sets
  return out
}

export interface UsedKeys {
  dayIds: Set<string>
  recordKeys: Set<string>
}

/** 세션(진행 중 포함)이 쓴 Day id와 기록 라인. 이것이 있는 종목·Day만 보관한다 */
export function usedKeys(sessions: Session[]): UsedKeys {
  const dayIds = new Set<string>()
  const recordKeys = new Set<string>()
  for (const s of sessions) {
    dayIds.add(s.dayId)
    for (const e of s.entries) {
      for (const key of [e.recordKey, e.substituteFor]) {
        if (!key) continue
        recordKeys.add(key)
        dayIds.add(parseRecordKey(key).dayId)
      }
    }
  }
  return { dayIds, recordKeys }
}

/** 주간 목표: auto 없는 값은 그대로, auto는 플랜 합계, 새 부위는 auto로, 쓰지 않는 부위는 지운다 */
export function resolveMuscleTargets(draft: RoutineTemplate): Record<MuscleKey, MuscleTarget> {
  const planSum = deriveMuscleSets(draft.days.flatMap((d) => d.exercises))
  const used = new Set<MuscleKey>(
    [...draft.days, ...draft.fallbackDays].flatMap((d) => d.exercises.map((e) => e.muscle)),
  )
  const out: Record<MuscleKey, MuscleTarget> = {}
  for (const muscle of used) {
    const existing = draft.muscleTargets[muscle]
    if (!existing) out[muscle] = { target: planSum[muscle] ?? 0, weight: NEW_MUSCLE_WEIGHT, auto: true }
    else if (existing.auto) out[muscle] = { ...existing, target: planSum[muscle] ?? 0 }
    else out[muscle] = { ...existing }
  }
  return out
}

/** 저장된 루틴에서 편집 초안을 만드는 유일한 자리. 종목을 plannedOrder 순으로 정렬한 복사본 */
export function toDraft(routine: RoutineTemplate): RoutineTemplate {
  const copy = structuredClone(routine)
  for (const day of [...copy.days, ...copy.fallbackDays]) {
    day.exercises.sort((a, b) => a.plannedOrder - b.plannedOrder)
  }
  return copy
}

/** 키 `종목@Day`가 쓰였으면 보관 대상, 아니면 버린다 */
function keepUsed(removed: RoutineExercise[], dayId: string, used: UsedKeys): RoutineExercise[] {
  return removed.filter((ex) => used.recordKeys.has(`${ex.exerciseId}@${dayId}`))
}

function mergeRetired(a: RoutineExercise[] | undefined, b: RoutineExercise[]): RoutineExercise[] {
  const out = [...(a ?? [])]
  for (const ex of b) if (!out.some((o) => o.exerciseId === ex.exerciseId)) out.push(ex)
  return out
}

/**
 * 저장되는 루틴을 만드는 유일한 자리. `draft`는 `toDraft`를 거친 것(배열 순서 = 계획 순서)이다.
 * `saved`는 고치기 전 저장본 (새 루틴이면 undefined).
 */
export function finalizeRoutine(
  draft: RoutineTemplate,
  saved: RoutineTemplate | undefined,
  used: UsedKeys,
): RoutineTemplate {
  const out = structuredClone(draft)
  const savedDays = saved ? [...saved.days, ...saved.fallbackDays] : []

  // 1. plannedOrder를 배열 순서대로 1부터. 여기서 정렬하지 않는다 (▲▼로 바꾼 순서가 되돌아간다)
  for (const day of [...out.days, ...out.fallbackDays]) {
    day.exercises.forEach((ex, i) => {
      ex.plannedOrder = i + 1
    })
  }

  // 2. 종목 보관 — 같은 Day id의 저장본에 있던 종목이 초안에 없으면
  for (const day of [...out.days, ...out.fallbackDays]) {
    const before = savedDays.find((d) => d.id === day.id)
    if (!before) continue
    const kept = new Set(day.exercises.map((e) => e.exerciseId))
    const removed = before.exercises.filter((e) => !kept.has(e.exerciseId))
    day.retiredExercises = mergeRetired(
      day.retiredExercises ?? before.retiredExercises,
      keepUsed(removed, recordDayIdOf(day), used),
    )
  }

  const retiredDays: RoutineDay[] = [...(out.retiredDays ?? saved?.retiredDays ?? [])]
  const retireDay = (day: RoutineDay) => {
    if (!used.dayIds.has(day.id)) return
    if (!retiredDays.some((d) => d.id === day.id)) retiredDays.push(day)
  }

  // 3. Day 보관 — 저장본의 Day가 초안에 없으면
  const draftIds = new Set([...out.days, ...out.fallbackDays].map((d) => d.id))
  for (const day of savedDays) if (!draftIds.has(day.id)) retireDay(day)

  // 4. 하한 모드 맞춤 — 정규 Day의 종목·반복수·부위·그룹을 따른다
  const fallbackDays: RoutineDay[] = []
  for (const fb of out.fallbackDays) {
    const twin = out.days.find((d) => d.id === fb.recordDayId)
    if (!twin) {
      retireDay(fb)
      continue
    }
    const twinOf = (id: string) => twin.exercises.find((e) => e.exerciseId === id)
    const removed = fb.exercises.filter((e) => !twinOf(e.exerciseId))
    const exercises = fb.exercises.flatMap((e) => {
      const t = twinOf(e.exerciseId)
      return t ? [{ ...e, repMin: t.repMin, repMax: t.repMax, muscle: t.muscle, group: t.group }] : []
    })
    const next: RoutineDay = { ...fb, exercises }
    const retired = mergeRetired(fb.retiredExercises, keepUsed(removed, recordDayIdOf(fb), used))
    if (retired.length > 0) next.retiredExercises = retired
    if (exercises.length === 0) retireDay(next)
    else fallbackDays.push(next)
  }
  out.fallbackDays = fallbackDays

  // 5. 합계·주간 목표
  for (const day of [...out.days, ...out.fallbackDays]) {
    day.muscleSets = deriveMuscleSets(day.exercises)
  }
  out.muscleTargets = resolveMuscleTargets(out)

  // 6. 하체 가드가 가리키던 Day가 없으면 가드를 끈다
  if (!out.days.some((d) => d.id === out.rules.lowerBodyDayId) && out.days[0]) {
    out.rules = { ...out.rules, lowerBodyDayId: out.days[0].id, lowerBodyMaxGapDays: NO_GUARD_GAP_DAYS }
  }

  // 정리: 다시 들어온 종목·Day는 보관에서 빼고, 빈 배열은 키를 만들지 않는다
  const liveIds = new Set([...out.days, ...out.fallbackDays].map((d) => d.id))
  for (const day of [...out.days, ...out.fallbackDays, ...retiredDays]) {
    const live = new Set(day.exercises.map((e) => e.exerciseId))
    const left = (day.retiredExercises ?? []).filter((e) => !live.has(e.exerciseId))
    if (left.length > 0) day.retiredExercises = left
    else delete day.retiredExercises
  }
  const retiredLeft = retiredDays.filter((d) => !liveIds.has(d.id))
  if (retiredLeft.length > 0) out.retiredDays = retiredLeft
  else delete out.retiredDays

  return out
}

/** 번들 루틴을 처음 고칠 때 만드는 복사본. Day id를 그대로 두므로 기록 라인이 이어진다 */
export function forkRoutine(routine: RoutineTemplate, newId: string, now: string): RoutineTemplate {
  return { ...routine, id: newId, name: routine.name + ' (수정)', createdAt: now, isActive: true }
}

/** 루틴 id(user-)와 내 종목 id(custom-)를 만드는 유일한 자리. put은 같은 id의 행을 덮어쓰므로 겹치지 않게 한다 */
export function uniqueId(
  prefix: string,
  taken: Set<string>,
  make: () => string = () => crypto.randomUUID().slice(0, 8),
): string {
  let id = prefix + make()
  while (taken.has(id)) id = prefix + make()
  return id
}

export function blankRoutine(newId: string, now: string, rules: RoutineRules): RoutineTemplate {
  return {
    id: newId,
    name: '내 루틴',
    version: '1',
    seedRevision: 0,
    createdAt: now,
    isActive: true,
    muscleTargets: {},
    days: [],
    fallbackDays: [],
    rules: { ...rules },
  }
}

/** d1, d2… 중 taken에 없는 가장 작은 id */
export function nextDayId(taken: Set<string>): string {
  let n = 1
  while (taken.has(`d${n}`)) n += 1
  return `d${n}`
}

export function validateDraft(draft: RoutineTemplate, catalog: Exercise[]): string[] {
  const problems: string[] = []
  const nameOf = (id: string) => catalog.find((e) => e.id === id)?.shortName ?? id
  if (draft.name.trim() === '') problems.push('루틴 이름을 적어 주세요')
  if (draft.days.length === 0) problems.push('Day를 하나 이상 만들어 주세요')
  for (const day of draft.days) {
    const label = day.name.trim() === '' ? day.id : day.name
    if (day.name.trim() === '') problems.push('Day 이름을 적어 주세요')
    if (day.exercises.length === 0) problems.push(`${label}: 종목을 하나 이상 넣어 주세요`)
    for (const ex of day.exercises) {
      if (ex.muscle.trim() === '') problems.push(`${label} · ${nameOf(ex.exerciseId)}: 부위를 골라 주세요`)
      if (ex.repMin > ex.repMax) problems.push(`${label} · ${nameOf(ex.exerciseId)}: 반복 최소가 최대보다 큽니다`)
    }
  }
  return problems
}

export function shouldForkOnEdit(routineId: string, bundledId: string): boolean {
  return routineId === bundledId
}
