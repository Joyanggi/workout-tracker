import Dexie, { type Table } from 'dexie'
import { isSecretSettingKey } from '../lib/secrets'
import type {
  Exercise,
  ExerciseNote,
  RoutineTemplate,
  Session,
  SettingRow,
} from '../types'

export class WorkoutDB extends Dexie {
  routines!: Table<RoutineTemplate, string>
  exercises!: Table<Exercise, string>
  sessions!: Table<Session, string>
  settings!: Table<SettingRow, string>
  /** recordKey별 머신 세팅 메모 (T4) */
  exerciseNotes!: Table<ExerciseNote, string>

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

    /*
     * 스키마 마이그레이션 규칙
     *
     * Dexie는 version()을 누적 선언한다 — 이전 version 블록을 **지우면 안 된다.**
     * v1에서 멈춰 있던 기기가 앱을 열면 v1 → v2를 순서대로 밟는다.
     * 테이블을 추가하는 것만으로는 upgrade() 콜백이 필요 없다 (빈 테이블이 생긴다).
     * 기존 데이터를 변형해야 할 때만 .upgrade()를 붙인다.
     *
     * v2: exerciseNotes 추가 (T4 머신 세팅 메모)
     */
    this.version(2).stores({
      exerciseNotes: 'recordKey',
    })
  }
}

export const db = new WorkoutDB()

// ─── settings (key-value) 접근 헬퍼 ──────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

/**
 * 비밀값이 Dexie로 새는 것을 막는다.
 *
 * JSON 백업(§5.5)이 settings 테이블을 통째로 덤프하고, 그 파일은 공유 시트로 나가고
 * Gist에 올라간다. GitHub PAT가 여기 들어가면 그대로 유출된다.
 * localStorage 경로(lib/secrets.ts)를 쓰도록 개발 시점에 즉시 터뜨린다.
 */
function assertNotSecret(key: string): void {
  if (isSecretSettingKey(key)) {
    throw new Error(
      `[db] "${key}"는 Dexie settings에 저장할 수 없습니다. lib/secrets.ts를 사용하세요 ` +
        '(JSON 백업에 비밀값이 섞여 나갑니다).',
    )
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  assertNotSecret(key)
  const row: SettingRow = { key, value }
  await db.settings.put(row)
}

/** 설정 키 삭제. undefined를 put하면 값이 undefined인 row가 남아 백업에 실린다 */
export async function deleteSettings(keys: string[]): Promise<void> {
  await db.settings.bulkDelete(keys)
}

export async function setSettings(patch: Record<string, unknown>): Promise<void> {
  const rows: SettingRow[] = Object.entries(patch).map(([key, value]) => {
    assertNotSecret(key)
    return { key, value }
  })
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

// ─── 머신 세팅 메모 (T4) ─────────────────────────────────

/**
 * recordKey별 고정 메모. 세션이 아니라 **종목에 붙는다** — 매 세션 같은 세팅을
 * 다시 찾는 시간을 없애는 것이 목적이므로 다음 세션에도 그대로 보여야 한다.
 * 빈 문자열이면 행을 지운다 (undefined 값 행을 남기지 않는다).
 */
export async function getExerciseNote(recordKey: string): Promise<string> {
  return (await db.exerciseNotes.get(recordKey))?.note ?? ''
}

export async function setExerciseNote(recordKey: string, note: string): Promise<void> {
  const trimmed = note.trim()
  if (trimmed) await db.exerciseNotes.put({ recordKey, note: trimmed })
  else await db.exerciseNotes.delete(recordKey)
}
