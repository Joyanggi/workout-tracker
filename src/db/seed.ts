import exercisesJson from '../data/exercises.json'
import routineJson from '../data/routine-v2.4.json'
import type { Exercise, RoutineTemplate } from '../types'
import { db, getSetting, setSettings } from './index'
import { validateRoutine } from './validateRoutine'

export const BUNDLED_EXERCISES = exercisesJson as Exercise[]
export const BUNDLED_ROUTINE = routineJson as unknown as RoutineTemplate

export interface SeedResult {
  routineId: string
  routineVersion: string
  exerciseCount: number
  /** 이번 실행에서 시드를 새로 넣었는가 */
  didSeed: boolean
  /** 저장된 루틴이 깨져 있어서 번들로 되돌렸는가 */
  repaired: boolean
  /** 정합성 문제 (있으면 화면에 노출한다 — 조용히 넘기면 숫자가 틀어진 걸 못 잡는다) */
  problems: string[]
}

/**
 * 최초 실행 / 시드 버전 상승 시에만 번들 루틴을 주입한다.
 *
 * seededRoutineVersion으로 판단하는 이유: 사용자가 설정 → 루틴 가져오기로
 * 같은 id의 루틴을 수정해 넣었을 때, 앱을 다시 열 때마다 번들 시드가 그걸
 * 덮어쓰면 안 된다.
 */
export async function ensureSeed(): Promise<SeedResult> {
  const problems = validateRoutine(BUNDLED_ROUTINE, BUNDLED_EXERCISES)
  if (problems.length > 0 && import.meta.env.DEV) {
    console.error('[seed] 루틴 정합성 문제:\n' + problems.join('\n'))
  }

  const seededVersion = await getSetting<string | null>('seededRoutineVersion', null)
  const stored = await db.routines.get(BUNDLED_ROUTINE.id)
  const routineExists = stored !== undefined

  /*
   * 저장된 복사본이 정합성 검사를 통과하지 못하면 번들로 되돌린다.
   *
   * version만 보고 판단하면, 번들 루틴의 **내용**이 바뀌었는데 version을 올리지 않은
   * 경우에 낡은 복사본이 영구히 남는다. 실제로 그랬다 — recordDayId를 마일스톤 2에서
   * fallbackDays에 추가하면서 version 2.4를 유지했고, 마일스톤 1 때 처음 실행한
   * 설치본은 그 필드가 없는 루틴을 계속 들고 있었다. 결과가 조용해서 더 나빴다:
   *   - fallback 세션의 recordKey가 정규 Day(@d1)가 아니라 @fallback-push로 쌓인다
   *     (recordDayIdOf의 폴백) → 프리필·증량·PR·부위 집계가 전부 끊긴다 (§8 위반)
   *   - 백업이 자기 검증을 통과하지 못해 **복원 자체가 막힌다**
   *
   * version 상승만으로 고치면 사용자가 가져온 정상 루틴까지 덮어쓴다. 그래서
   * "번들과 같은 id인데 깨져 있을 때"로 좁혔다. 되돌린 사실은 problems로 노출한다.
   */
  const storedProblems = stored ? validateRoutine(stored, BUNDLED_EXERCISES) : []
  const repaired = storedProblems.length > 0
  const needsSeed = !routineExists || seededVersion !== BUNDLED_ROUTINE.version || repaired

  // 카탈로그는 **시드 여부와 무관하게** 매 실행 최신으로 맞춘다.
  // needsSeed 안에 두면 보상작용 체크리스트 문구를 고쳐도 루틴 version을 올리지 않는 한
  // 사용자에게 반영되지 않는다. 삭제는 하지 않는다 — 과거 세션이 참조하는 종목이
  // 사라지면 기록 표시가 깨진다 (bulkPut은 추가/갱신만 한다).
  await db.exercises.bulkPut(BUNDLED_EXERCISES)

  if (needsSeed) {
    await db.transaction('rw', db.routines, db.settings, async () => {
      await db.routines.put(BUNDLED_ROUTINE)
      await setSettings({
        seededRoutineVersion: BUNDLED_ROUTINE.version,
        activeRoutineId: BUNDLED_ROUTINE.id,
      })
    })
  }

  // 기본 설정값 채우기 (없는 것만)
  const defaults: Record<string, unknown> = {
    currentPhase: 0,
    onboardingDone: false,
  }
  const missing: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(defaults)) {
    if ((await db.settings.get(key)) === undefined) missing[key] = value
  }
  if (Object.keys(missing).length > 0) await setSettings(missing)

  return {
    routineId: BUNDLED_ROUTINE.id,
    routineVersion: BUNDLED_ROUTINE.version,
    exerciseCount: BUNDLED_EXERCISES.length,
    didSeed: needsSeed,
    repaired,
    problems: repaired
      ? [
          ...problems,
          `저장된 루틴이 번들과 어긋나 되돌렸습니다: ${storedProblems.join(' / ')}`,
        ]
      : problems,
  }
}
