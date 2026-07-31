import Dexie, { type Table } from 'dexie'
import type { Exercise, RoutineTemplate, Session, SettingRow } from '../types'

export class WorkoutDB extends Dexie {
  routines!: Table<RoutineTemplate, string>
  exercises!: Table<Exercise, string>
  sessions!: Table<Session, string>
  settings!: Table<SettingRow, string>

  constructor() {
    super('workout-tracker')

    // 인덱스 선정 주의사항
    // - isActive(boolean)는 인덱스로 두지 않는다. IndexedDB는 boolean을 유효한 키로
    //   취급하지 않아서 해당 레코드가 인덱스에서 조용히 누락된다. 활성 루틴은
    //   settings.activeRoutineId로 찾는다.
    // - endedAt도 인덱스로 두지 않는다. 진행 중 세션은 endedAt이 undefined인데,
    //   undefined 키는 인덱스에 들어가지 않아 "진행 중 세션 찾기"에 못 쓴다.
    //   세션 수가 수천 건 규모라 전체 스캔으로 충분하다.
    this.version(1).stores({
      routines: 'id, version',
      exercises: 'id',
      sessions: 'id, date, dayId, routineId',
      settings: 'key',
    })
  }
}

export const db = new WorkoutDB()

// ─── settings (key-value) 접근 헬퍼 ──────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const row: SettingRow = { key, value }
  await db.settings.put(row)
}

export async function setSettings(patch: Record<string, unknown>): Promise<void> {
  const rows: SettingRow[] = Object.entries(patch).map(([key, value]) => ({ key, value }))
  await db.settings.bulkPut(rows)
}

/** 활성 루틴. settings에 없거나 깨졌으면 routines 테이블의 첫 레코드로 폴백한다. */
export async function getActiveRoutine(): Promise<RoutineTemplate | undefined> {
  const activeId = await getSetting<string | null>('activeRoutineId', null)
  if (activeId) {
    const found = await db.routines.get(activeId)
    if (found) return found
  }
  return db.routines.toCollection().first()
}

/** 진행 중(endedAt 없음) 세션. 앱 강제 종료 후 "이어하기" 복구용 (§11) */
export async function getOpenSession(): Promise<Session | undefined> {
  const all = await db.sessions.toArray()
  return all
    .filter((s) => !s.endedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}
