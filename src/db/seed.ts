import dietPlansJson from '../data/diet-plans.json'
import exercisesJson from '../data/exercises.json'
import routineJson from '../data/routine-v2.4.json'
import { formatPlanLabel, successorOf } from '../lib/diet'
import type { DietPlan, Exercise, RoutineTemplate } from '../types'
import { validateDietPlan } from './validateDietPlan'
import { db, deleteSettings, getSetting, setSettings } from './index'
import { validateRoutine } from './validateRoutine'

export const BUNDLED_EXERCISES = exercisesJson as Exercise[]
export const BUNDLED_ROUTINE = routineJson as unknown as RoutineTemplate

const dietSeed = dietPlansJson as unknown as { seedRevision: number; plans: DietPlan[] }
export const BUNDLED_DIET_REVISION = dietSeed.seedRevision
/**
 * 번들 식단 플랜 (D1).
 *
 * `kcalLabel`을 시드 JSON의 값 대신 **항목 합계에서 다시 만든다.** 손으로 적은 라벨은
 * 항목을 고칠 때 남아서 화면이 서로 다른 숫자를 말하게 된다 — 실제로 계획 문서의
 * 표기(1,796kcal)와 항목 합계(1,781kcal)가 어긋나 있었다.
 */
export const BUNDLED_DIET_PLANS: DietPlan[] = dietSeed.plans.map((plan) => ({
  ...plan,
  seedRevision: dietSeed.seedRevision,
  kcalLabel: formatPlanLabel(plan),
}))

export interface SeedResult {
  routineId: string
  routineVersion: string
  /** 이번에 주입한(또는 이미 주입돼 있던) 시드 리비전 */
  seedRevision: number
  /** 식단 플랜 수 (D1) */
  dietPlanCount: number
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
 * seededRoutineRevision으로 판단하는 이유: 사용자가 설정 → 루틴 가져오기로
 * 같은 id의 루틴을 수정해 넣었을 때, 앱을 다시 열 때마다 번들 시드가 그걸
 * 덮어쓰면 안 된다.
 */
export async function ensureSeed(): Promise<SeedResult> {
  const problems = validateRoutine(BUNDLED_ROUTINE, BUNDLED_EXERCISES)
  for (const plan of BUNDLED_DIET_PLANS) {
    for (const p of validateDietPlan(plan)) problems.push(`dietPlans/${plan.id}: ${p}`)
  }
  if (problems.length > 0 && import.meta.env.DEV) {
    console.error('[seed] 루틴 정합성 문제:\n' + problems.join('\n'))
  }

  const seededRevision = await getSetting<number | null>('seededRoutineRevision', null)
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
  const needsSeed =
    !routineExists || seededRevision !== BUNDLED_ROUTINE.seedRevision || repaired

  // 카탈로그는 **시드 여부와 무관하게** 매 실행 최신으로 맞춘다.
  // needsSeed 안에 두면 보상작용 체크리스트 문구를 고쳐도 루틴 version을 올리지 않는 한
  // 사용자에게 반영되지 않는다. 삭제는 하지 않는다 — 과거 세션이 참조하는 종목이
  // 사라지면 기록 표시가 깨진다 (bulkPut은 추가/갱신만 한다).
  await db.exercises.bulkPut(BUNDLED_EXERCISES)

  if (needsSeed) {
    await db.transaction('rw', db.routines, db.settings, async () => {
      await db.routines.put(BUNDLED_ROUTINE)
      await setSettings({
        seededRoutineRevision: BUNDLED_ROUTINE.seedRevision,
        activeRoutineId: BUNDLED_ROUTINE.id,
      })
      // version 기반 판단은 폐기했다 — 낡은 키를 남기면 백업에 실려 혼란만 준다
      await deleteSettings(['seededRoutineVersion'])
    })
  }

  /*
   * 식단 플랜 (D1). 루틴과 같은 리비전 규칙을 쓴다.
   * 루틴처럼 "사용자가 가져온 것을 덮지 않는다"가 필요하므로 리비전이 같으면 건드리지 않는다.
   */
  const seededDiet = await getSetting<number | null>('seededDietRevision', null)
  if (seededDiet !== BUNDLED_DIET_REVISION) {
    await db.dietPlans.bulkPut(BUNDLED_DIET_PLANS)
    await setSettings({ seededDietRevision: BUNDLED_DIET_REVISION })
  }
  // 기본 플랜은 없을 때만 채운다 (사용자 선택을 덮지 않는다)
  if ((await db.settings.get('defaultDietPlanId')) === undefined) {
    const fallback = BUNDLED_DIET_PLANS.find((p) => p.isDefault) ?? BUNDLED_DIET_PLANS[0]
    if (fallback) await setSettings({ defaultDietPlanId: fallback.id })
  } else {
    /*
     * 대체된 플랜을 가리키는 기본값을 **후속 플랜으로 이관한다** (DD2).
     *
     * 이게 없으면 기존 설치본에서 조용히 망가진다: 플랜 시트는 새 플랜만 보여주는데
     * `defaultDietPlanId`는 숨긴 옛 플랜(cut-1800)을 계속 가리켜서, 오늘 화면이 6끼
     * 옛 구성으로 열리고 사용자는 그것을 고른 적도 없다. **선택을 덮는 것이 아니라
     * 같은 선택을 새 id로 옮기는 것**이므로 "사용자 선택을 존중한다"와 충돌하지 않는다.
     * 과거 DietDay의 planId는 건드리지 않는다 (판정 불변).
     */
    const current = await getSetting<string | null>('defaultDietPlanId', null)
    const successor = current ? successorOf(BUNDLED_DIET_PLANS, current) : undefined
    if (successor) await setSettings({ defaultDietPlanId: successor.id })
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
    seedRevision: BUNDLED_ROUTINE.seedRevision,
    exerciseCount: BUNDLED_EXERCISES.length,
    didSeed: needsSeed,
    dietPlanCount: BUNDLED_DIET_PLANS.length,
    repaired,
    problems: repaired
      ? [
          ...problems,
          `저장된 루틴이 번들과 어긋나 되돌렸습니다: ${storedProblems.join(' / ')}`,
        ]
      : problems,
  }
}
