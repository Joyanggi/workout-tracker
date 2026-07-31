import { db } from "../db";
import type {
  Exercise,
  ExerciseSetting,
  RoutineTemplate,
  Session,
  SettingRow,
} from "../types";
import { validateRoutine } from "../db/validateRoutine";
import { isSecretSettingKey } from "./secrets";

/**
 * JSON 백업/복원 (DESIGN.md §5.5 · §6).
 * "JSON 내보내기는 Dexie 전체 덤프 + 스키마 버전 필드"
 * "가져오기: JSON 복원 (병합 아닌 전체 교체, 확인 2단계)"
 */

/**
 * 백업 파일 스키마 버전.
 * v2: exerciseNotes 추가 (T4). 구버전 앱은 parseBackup에서 "더 새로운 스키마"로 거부한다.
 *
 * T9(무게 단위)는 **버전을 올리지 않는다.** 같은 테이블·같은 행에 필드를 더한 것이고,
 * 복원은 행을 통째로 put하므로 모르는 필드도 그대로 실려간다 — 즉 v2 앱이 T9 파일을
 * 복원해도 무게 단위가 유실되지 않는다. 버전을 올리면 그 앱이 파일을 **거부**해
 * 오히려 복원이 막힌다.
 */
export const SCHEMA_VERSION = 2;
export const APP_ID = "workout-tracker";

export interface BackupFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  routines: RoutineTemplate[];
  exercises: Exercise[];
  sessions: Session[];
  settings: SettingRow[];
  /** v2+. 구버전 백업에는 없으므로 optional (복원 시 [] 취급) */
  exerciseNotes?: ExerciseSetting[];
}

/**
 * settings에서 비밀 키를 걸러낸다.
 *
 * db.setSetting이 이미 비밀 키를 거부하지만, **내보내기 쪽에서도 한 번 더 막는다.**
 * 백업 파일은 공유 시트로 나가고 Gist(§5.5)에 올라가므로, 과거 버전이 남긴 데이터나
 * 수동 조작으로 들어온 값이 있어도 유출되지 않아야 한다.
 */
function stripSecrets(rows: SettingRow[]): SettingRow[] {
  return rows.filter((r) => !isSecretSettingKey(r.key));
}

export async function createBackup(
  now: Date = new Date(),
): Promise<BackupFile> {
  const [routines, exercises, sessions, settings, exerciseNotes] =
    await Promise.all([
      db.routines.toArray(),
      db.exercises.toArray(),
      db.sessions.toArray(),
      db.settings.toArray(),
      db.exerciseNotes.toArray(),
    ]);
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    routines,
    exercises,
    sessions,
    settings: stripSecrets(settings),
    exerciseNotes,
  };
}

export interface BackupSummary {
  routines: number;
  exercises: number;
  sessions: number;
  settings: number;
  exportedAt: string;
  oldestSession: string | null;
  newestSession: string | null;
}

export function summarizeBackup(file: BackupFile): BackupSummary {
  const dates = file.sessions.map((s) => s.date).sort();
  return {
    routines: file.routines.length,
    exercises: file.exercises.length,
    sessions: file.sessions.length,
    settings: file.settings.length,
    exportedAt: file.exportedAt,
    oldestSession: dates[0] ?? null,
    newestSession: dates[dates.length - 1] ?? null,
  };
}

/**
 * 파싱 + 검증. 되돌릴 수 없는 전체 교체를 하기 전에 형태를 확인한다.
 * 통과하지 못하면 예외 대신 문제 목록을 돌려준다 (화면에 그대로 보여주기 위해).
 */
export function parseBackup(
  text: string,
): { file: BackupFile } | { problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      problems: [
        `JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const problems: string[] = [];
  const obj = raw as Partial<BackupFile>;

  if (obj.app !== APP_ID) {
    problems.push(`이 앱의 백업이 아닙니다 (app: ${JSON.stringify(obj.app)})`);
  }
  if (typeof obj.schemaVersion !== "number") {
    problems.push("schemaVersion이 없습니다");
  } else if (obj.schemaVersion > SCHEMA_VERSION) {
    problems.push(
      `더 새로운 스키마입니다 (파일 v${obj.schemaVersion} > 앱 v${SCHEMA_VERSION}). 앱을 업데이트하세요`,
    );
  }
  for (const key of [
    "routines",
    "exercises",
    "sessions",
    "settings",
  ] as const) {
    if (!Array.isArray(obj[key])) problems.push(`${key}가 배열이 아닙니다`);
  }
  // v1 백업에는 없다. 있으면 배열이어야 한다
  if (obj.exerciseNotes !== undefined && !Array.isArray(obj.exerciseNotes)) {
    problems.push("exerciseNotes가 배열이 아닙니다");
  }

  if (problems.length === 0) {
    // 세션의 최소 형태 검사 — 하나라도 깨져 있으면 복원 후 화면이 터진다
    const sessions = obj.sessions as Session[];
    for (const [i, s] of sessions.entries()) {
      if (
        typeof s?.id !== "string" ||
        typeof s?.date !== "string" ||
        !Array.isArray(s?.entries)
      ) {
        problems.push(`sessions[${i}]의 형태가 올바르지 않습니다`);
        break;
      }
    }

    // 루틴 정합성도 검사한다. muscleSets 합이 어긋난 루틴이 복원되면 §4 제안 로직과
    // §5.1 대시보드가 서로 다른 숫자를 말하기 시작하고 원인 추적이 매우 어렵다.
    // (설정 → 루틴 가져오기 경로는 이미 검증하는데 복원 경로만 빠져 있었다)
    const routines = obj.routines as RoutineTemplate[];
    const exercises = obj.exercises as Exercise[];
    for (const routine of routines) {
      for (const p of validateRoutine(routine, exercises)) {
        problems.push(`routines/${routine.id}: ${p}`);
      }
    }
  }

  return problems.length > 0 ? { problems } : { file: raw as BackupFile };
}

/**
 * 전체 교체 복원 (§5.5: "병합 아닌 전체 교체").
 *
 * 병합하지 않는 이유: 같은 id의 세션이 양쪽에 있을 때 어느 쪽이 옳은지 알 수 없고,
 * 부분 병합은 "복원했는데 일부만 돌아왔다"는 최악의 상태를 만든다.
 *
 * 비밀값은 복원 대상이 아니다 — localStorage에 있고 백업에 들어가지 않는다.
 */
export async function restoreBackup(file: BackupFile): Promise<void> {
  await db.transaction(
    "rw",
    db.routines,
    db.exercises,
    db.sessions,
    db.settings,
    db.exerciseNotes,
    async () => {
      await Promise.all([
        db.routines.clear(),
        db.exercises.clear(),
        db.sessions.clear(),
        db.settings.clear(),
        db.exerciseNotes.clear(),
      ]);
      await Promise.all([
        db.routines.bulkPut(file.routines),
        db.exercises.bulkPut(file.exercises),
        db.sessions.bulkPut(file.sessions),
        db.settings.bulkPut(
          file.settings.filter((r) => !isSecretSettingKey(r.key)),
        ),
        // v1 백업에는 없다 — 없으면 비운 상태로 둔다
        db.exerciseNotes.bulkPut(file.exerciseNotes ?? []),
      ]);
    },
  );
}
