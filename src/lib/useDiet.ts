import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteDietDay } from '../db'
import { requestSync } from './gistSync'
import { resolveTrainingDays } from './diet'
import { emptyDietDay } from './dietOps'
import { strengthDates } from './derive'
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
    // 근력 기준 (X3) — 유산소만 한 날은 휴식일로 남는다
    const trained = strengthDates(sessions)
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
 * 식단 변경 후 백업 예약 (X7).
 *
 * v1.3까지 `requestSync`를 부르는 곳이 **세션 종료 한 곳뿐**이었다. 그래서 식단만 기록한
 * 날은 백업에 올라가지 않고, 다음 세션을 마쳐야 같이 올라갔다 — 실제로 gist 마지막 갱신이
 * 이틀 전이었고 그 사이 식단 기록이 백업에 없었다.
 *
 * 쓰기 chokepoint 두 곳(`mutateDietDay`·`removeDietDay`)에만 붙인다. 화면마다 부르면
 * 새 화면을 추가할 때 빠뜨린다 — 세션 종료 경로에서 이미 겪은 형태다.
 *
 * **성공한 뒤에 부른다.** 실패한 쓰기로 백업을 올리면 없는 변경을 올리는 셈이다.
 * 연타는 `requestSync`의 8초 debounce가 흡수한다 (호출마다 타이머를 다시 건다) —
 * 슬롯 6개를 빠르게 누르면 업로드는 마지막 탭 이후 한 번이다.
 */
function scheduleBackup(): void {
  requestSync()
}

/** 그 날짜 기록 삭제 (G4). 미기록 상태로 완전히 되돌린다 */
export function removeDietDay(date: string): void {
  void deleteDietDay(date)
    .then(scheduleBackup)
    .catch((err) => {
      console.error('[diet] 삭제 실패', err)
    })
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
    .then(scheduleBackup)
    .catch((err) => {
      console.error('[diet] 저장 실패', err)
    })
}
