import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { resolveTrainingDays } from './diet'
import { emptyDietDay } from './dietOps'
import { completedSessions } from './derive'
import type { DietDay, DietPlan } from '../types'

/**
 * 식단 데이터 접근 (D2).
 *
 * zustand 작업 사본을 두지 않고 Dexie를 단일 진실 원천으로 쓴다. 대신 변경은
 * **반드시 `mutateDietDay`(read-modify-write 트랜잭션)로** 한다.
 *
 * 렌더 시점의 `day`를 기반으로 `put`하면 안 된다 — 슬롯 6개를 빠르게 연타하면
 * live query가 갱신되기 전에 다음 탭이 낡은 `day`를 읽고 **앞선 쓰기를 덮어쓴다.**
 * 실측에서 6탭 중 1슬롯이 유실됐다(단백질 142/166). 일괄 체크가 주 경로라
 * 연타는 예외 상황이 아니라 정상 사용이다.
 */

const EMPTY_PLANS: DietPlan[] = []

export interface DietData {
  plans: DietPlan[]
  /** 그 달 범위 기록 — 캘린더 링(D3)과 연속 카운트가 같은 데이터를 쓴다 */
  days: DietDay[]
  defaultPlanId: string | null
  loading: boolean
}

export function useDiet(): DietData {
  const data = useLiveQuery(async () => {
    const [plans, rawDays, defaultRow, sessions] = await Promise.all([
      db.dietPlans.toArray(),
      db.dietDays.toArray(),
      db.settings.get('defaultDietPlanId'),
      db.sessions.toArray(),
    ])
    /*
     * 훈련일 여부를 **여기서 한 번** 정규화한다 (diet.resolveTrainingDays 주석 참조).
     * 이 훅이 식단 데이터의 단일 읽기 경로이므로, 화면·캘린더·내보내기가 전부 같은 답을 본다.
     */
    const trained = new Set(completedSessions(sessions).map((s) => s.date))
    return {
      plans,
      days: resolveTrainingDays(rawDays, trained),
      defaultPlanId: (defaultRow?.value as string | undefined) ?? null,
    }
  }, [])

  return {
    plans: data?.plans ?? EMPTY_PLANS,
    days: data?.days ?? [],
    defaultPlanId: data?.defaultPlanId ?? null,
    loading: data === undefined,
  }
}

export function findPlan(plans: DietPlan[], planId: string | null): DietPlan | undefined {
  return plans.find((p) => p.id === planId) ?? plans.find((p) => p.isDefault) ?? plans[0]
}

/**
 * 그 날짜의 기록을 꺼내거나 새로 만든다.
 *
 * **없을 때 즉시 저장하지 않는다** — 화면을 열기만 해도 빈 기록이 생기면 "미기록"과
 * "손댔지만 아무것도 안 한 날"을 구분할 수 없고, 캘린더가 전부 기록된 것처럼 보인다.
 * 첫 변경이 일어날 때 저장된다 (`saveDietDay`).
 */
export function dietDayFor(
  days: DietDay[],
  date: string,
  planId: string,
  isTrainingDay: boolean,
): DietDay {
  return days.find((d) => d.date === date) ?? emptyDietDay(date, planId, isTrainingDay)
}

/**
 * 그 날짜 기록을 **최신 상태에서 읽어** 변형하고 저장한다.
 *
 * Dexie 트랜잭션이 직렬화하므로 연타해도 각 변경이 누적된다.
 * `fallback`은 아직 저장된 적 없는 날짜를 위한 초기값이다.
 */
export function mutateDietDay(
  date: string,
  fallback: DietDay,
  fn: (day: DietDay) => DietDay,
): void {
  void db
    .transaction('rw', db.dietDays, async () => {
      const current = (await db.dietDays.get(date)) ?? fallback
      await db.dietDays.put(fn(current))
    })
    .catch((err) => {
      console.error('[diet] 저장 실패', err)
    })
}
