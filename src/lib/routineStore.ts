import { db, getOpenSession, setSettings } from '../db/index'
import { validateRoutine } from '../db/validateRoutine'
import { requestSync } from './gistSync'
import { BUNDLED_EXERCISES } from '../db/seed'
import { exerciseInUse, finalizeRoutine, OPEN_SESSION_BLOCK, usedKeys } from './routineEdit'
import type { Exercise, RoutineTemplate } from '../types'

/**
 * 루틴 쓰기 (v1.16 NN1). 성공한 뒤에만 requestSync()를 부른다 (실패한 쓰기로 백업을 올리지 않는다).
 * "진행 중 세션" 판정은 getOpenSession() 한 곳이다 — 직접 세지 않는다.
 */

/** 초안을 저장하고 활성 루틴으로 삼는다. 문제 문구를 돌려주고, 빈 배열이면 성공이다 */
export async function saveRoutineDraft(draft: RoutineTemplate, savedId: string | undefined): Promise<string[]> {
  const problems = await db.transaction('rw', [db.routines, db.settings, db.sessions, db.exercises], async () => {
    if (await getOpenSession()) return [OPEN_SESSION_BLOCK.save]
    const saved = savedId ? await db.routines.get(savedId) : undefined
    const result = finalizeRoutine(draft, saved, usedKeys(await db.sessions.toArray()))
    const found = validateRoutine(result, await db.exercises.toArray())
    if (found.length > 0) return found
    await db.routines.put(result)
    await setSettings({ activeRoutineId: result.id })
    return []
  })
  if (problems.length === 0) requestSync()
  return problems
}

export async function activateRoutine(id: string): Promise<string[]> {
  const problems = await db.transaction('rw', [db.settings, db.sessions], async () => {
    if (await getOpenSession()) return [OPEN_SESSION_BLOCK.activate]
    await setSettings({ activeRoutineId: id })
    return []
  })
  if (problems.length === 0) requestSync()
  return problems
}

export async function deleteRoutine(id: string, bundledId: string): Promise<string[]> {
  const activeId = (await db.settings.get('activeRoutineId'))?.value
  if (id === activeId || id === bundledId) return ['활성 루틴과 기본 루틴은 지울 수 없습니다']
  await db.routines.delete(id)
  requestSync()
  return []
}

/** 내 종목을 저장한다 (새로 만들기·고치기 모두). 번들 종목은 부팅마다 시드가 덮으므로 받지 않는다 */
export async function saveCustomExercise(exercise: Exercise): Promise<string[]> {
  if (exercise.custom !== true || BUNDLED_EXERCISES.some((e) => e.id === exercise.id)) return ['직접 만든 종목만 저장할 수 있습니다']
  await db.exercises.put(exercise)
  requestSync()
  return []
}

/** 내 종목을 지운다. 루틴이나 기록이 쓰면 거절한다 (판정은 트랜잭션 안에서) */
export async function deleteCustomExercise(id: string): Promise<string[]> {
  const problems = await db.transaction('rw', [db.exercises, db.routines, db.sessions], async () => {
    if (BUNDLED_EXERCISES.some((e) => e.id === id)) return ['기본 종목은 지울 수 없습니다']
    const used = usedKeys(await db.sessions.toArray())
    if (exerciseInUse(id, await db.routines.toArray(), used)) return ['루틴이나 기록에서 쓰는 종목은 지울 수 없습니다']
    await db.exercises.delete(id)
    return []
  })
  if (problems.length === 0) requestSync()
  return problems
}
