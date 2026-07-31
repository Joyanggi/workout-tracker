import type { RecordKey, RoutineTemplate, Session, SessionEntry } from '../types'
import { makeRecordKey, parseRecordKey, recordDayIdOf } from '../types'
import { findDay } from './derive'

/**
 * 세션의 dayId 변경 + recordKey 재매핑 (DESIGN.md §11).
 *
 * "잘못된 Day 선택 후 기록 → 세션 상세에서 dayId 변경 허용 (recordKey 재매핑 확인 다이얼로그)"
 *
 * 어려운 점: Day마다 종목 구성이 다르다. D1 → D2로 바꾸면 리어델트·레터럴은 양쪽에 있어서
 * 재매핑되지만 인클라인·펙덱·플랫·숄더·푸쉬다운은 D2에 없다.
 *
 * **없는 종목의 기록을 버리지 않는다.** recordKey를 그대로 남겨서 프리필·증량 판정·부위 집계가
 * 계속 원래 라인으로 이어지게 한다. 무엇이 어떻게 되는지는 확인 다이얼로그가 전부 보여준다.
 * (데이터를 조용히 삭제하는 것보다 dayId와 내용이 약간 어긋난 세션이 남는 게 낫다)
 */

export interface DayChangeItem {
  exerciseId: string
  from: RecordKey
  to: RecordKey
}

export interface DayChangePlan {
  fromDayId: string
  toDayId: string
  /** recordKey가 바뀌는 항목 */
  remapped: DayChangeItem[]
  /** 대상 Day에 없는 종목 — recordKey 유지 */
  kept: DayChangeItem[]
  /** 키가 원래 같은 항목 (예: d1 → fallback-push는 둘 다 @d1에 기록한다) */
  unchanged: DayChangeItem[]
}

export function planDayChange(
  session: Session,
  routine: RoutineTemplate,
  toDayId: string,
): DayChangePlan | null {
  const toDay = findDay(routine, toDayId)
  if (!toDay || toDayId === session.dayId) return null

  const targetRecordDay = recordDayIdOf(toDay)
  const targetExerciseIds = new Set(toDay.exercises.map((e) => e.exerciseId))

  const plan: DayChangePlan = {
    fromDayId: session.dayId,
    toDayId,
    remapped: [],
    kept: [],
    unchanged: [],
  }

  for (const entry of session.entries) {
    const { exerciseId } = parseRecordKey(entry.recordKey)
    if (!targetExerciseIds.has(exerciseId)) {
      plan.kept.push({ exerciseId, from: entry.recordKey, to: entry.recordKey })
      continue
    }
    const to = makeRecordKey(exerciseId, targetRecordDay)
    if (to === entry.recordKey) plan.unchanged.push({ exerciseId, from: entry.recordKey, to })
    else plan.remapped.push({ exerciseId, from: entry.recordKey, to })
  }

  return plan
}

export function applyDayChange(
  session: Session,
  routine: RoutineTemplate,
  toDayId: string,
): Session {
  const toDay = findDay(routine, toDayId)
  if (!toDay) return session

  const targetRecordDay = recordDayIdOf(toDay)
  const targetById = new Map(toDay.exercises.map((e) => [e.exerciseId, e]))
  const maxTargetOrder = Math.max(0, ...toDay.exercises.map((e) => e.plannedOrder))

  let keptIndex = 0
  const entries: SessionEntry[] = session.entries.map((entry) => {
    const { exerciseId } = parseRecordKey(entry.recordKey)
    const target = targetById.get(exerciseId)
    if (!target) {
      // 대상 Day에 없는 종목은 계획 순서를 뒤로 보낸다 (기존 순서와 섞이지 않게)
      keptIndex += 1
      return { ...entry, plannedOrder: maxTargetOrder + keptIndex }
    }
    return {
      ...entry,
      recordKey: makeRecordKey(exerciseId, targetRecordDay),
      plannedOrder: target.plannedOrder,
    }
  })

  return { ...session, dayId: toDayId, entries }
}
