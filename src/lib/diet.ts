import type { DietDay, DietPlan, DietSlot, SlotRecord } from '../types'
import { addDays, isSameMonth } from './dates'

/**
 * 식단 파생 계산 (D1·D3). **저장하지 않는다** — 기록을 나중에 고쳐도 모든 지표가
 * 같이 맞춰지려면 단일 진실 원천이 `dietDays` 하나여야 한다 (운동 쪽 §7과 같은 원칙).
 */

/** 슬롯 점수 기준 (PLAN-DIET §4) */
export const SCORE = {
  /** 전부 체크 / 비슷한 구성으로 대체 */
  full: 1,
  /** 절반 이상 체크 / 그냥 다른 음식 */
  partial: 0.5,
  /** 절반 미만 체크 */
  scarce: 0.25,
  /** 치팅인 걸 알고 먹음 */
  cheat: 0,
  /**
   * 그 끼니를 안 먹음.
   * 감량 문맥에서 덜 먹은 것은 실패가 아니다 — 단백질 손실은 단백질 지표가 따로 잡는다.
   */
  skipped: 0.5,
} as const

/** 하루 판정에 필요한 최소 기록 슬롯 수. 이보다 적으면 "미기록"으로 두고 판정하지 않는다 */
export const MIN_SLOTS_FOR_VERDICT = 3

export const ADHERENCE_GOOD = 0.85
export const ADHERENCE_MID = 0.5

export type Adherence = 'good' | 'mid' | 'poor' | 'unlogged'

/**
 * 저장된 `isTrainingDay`를 **사실로 덮어쓴다** (읽기 경계 정규화).
 *
 * 그 날짜에 완료 세션이 있으면 훈련일이다 — 수동 토글보다 사실이 우선한다.
 * 정규화를 읽는 쪽 한 곳에서 하지 않으면 화면과 나머지 경로가 갈라진다:
 * 아침을 운동 **전에** 기록하면 그 시점엔 휴식일이 맞아서 false로 저장되고, 이후 운동을
 * 마쳐도 저장값은 그대로다. 화면은 파생값(훈련일 6슬롯)으로 판정하는데 캘린더 링·월 요약·
 * 내보내기는 저장값(휴식일 5슬롯)으로 판정해서 **같은 날에 두 답이 나온다.**
 * (실기기 백업에서 실제로 그 상태가 나왔다)
 *
 * 저장값을 고치지 않고 읽을 때 덮는 이유: 저장값은 "사용자가 수동으로 고른 것"이라는
 * 의미를 유지해야 하고, 사실은 언제든 sessions에서 다시 파생할 수 있다.
 */
export function resolveTrainingDays(days: DietDay[], trainedDates: Set<string>): DietDay[] {
  return days.map((day) =>
    trainedDates.has(day.date) && !day.isTrainingDay ? { ...day, isTrainingDay: true } : day,
  )
}

export function slotsFor(plan: DietPlan, isTrainingDay: boolean): DietSlot[] {
  return isTrainingDay ? plan.slots : plan.restDaySlots
}

/**
 * 슬롯 하나의 점수.
 *
 * 대체가 있으면 체크 수보다 대체 태그가 우선한다 — "일부 체크 + 대체"는 그 슬롯을
 * 다른 음식으로 메웠다는 뜻이므로, 체크된 계획 항목 비율로 점수를 매기면 이중 감점이 된다.
 */
export function slotScore(slot: DietSlot, record: SlotRecord | undefined): number | null {
  if (!record) return null // 미기록 — 평균에 넣지 않는다
  if (record.substitution) {
    return record.substitution.quality === 'similar'
      ? SCORE.full
      : record.substitution.quality === 'other'
        ? SCORE.partial
        : SCORE.cheat
  }
  if (record.skipped) return SCORE.skipped

  const total = slot.items.length
  if (total === 0) return SCORE.full
  const checked = record.checkedItemIds.filter((id) => slot.items.some((i) => i.id === id)).length
  if (checked >= total) return SCORE.full
  if (checked === 0) return SCORE.scarce
  return checked * 2 >= total ? SCORE.partial : SCORE.scarce
}

export interface DietDaySummary {
  /** 기록된 슬롯 점수 평균. 판정 불가면 null */
  score: number | null
  adherence: Adherence
  /** 기록된 슬롯 수 */
  loggedSlots: number
  totalSlots: number
  /** 단백질 추정 (g) — 라벨에 "추정"을 붙여 표시한다 */
  proteinG: number
  /** 계획 단백질 총량 */
  targetProteinG: number
  kcal: number
  targetKcal: number
}

/**
 * 하루 요약.
 *
 * 단백질은 체크한 항목의 합 + `similar` 대체는 **그 슬롯 계획 단백질로 인정**한다
 * (비슷한 구성이면 단백질원이 있었다는 뜻이므로). `other`/`cheat`는 0으로 둔다 —
 * 모르는 것을 추정해서 넣으면 지표가 낙관적으로 망가진다.
 */
export function summarizeDietDay(plan: DietPlan, day: DietDay | undefined): DietDaySummary {
  const slots = slotsFor(plan, day?.isTrainingDay ?? true)
  const targetProteinG = slots.reduce((n, s) => n + s.items.reduce((m, i) => m + i.proteinG, 0), 0)
  const targetKcal = slots.reduce((n, s) => n + s.items.reduce((m, i) => m + i.kcal, 0), 0)

  if (!day) {
    return {
      score: null,
      adherence: 'unlogged',
      loggedSlots: 0,
      totalSlots: slots.length,
      proteinG: 0,
      targetProteinG,
      kcal: 0,
      targetKcal,
    }
  }

  let proteinG = 0
  let kcal = 0
  const scores: number[] = []
  for (const slot of slots) {
    const record = day.slots[slot.id]
    const score = slotScore(slot, record)
    if (score !== null) scores.push(score)
    if (!record) continue

    const planned = slot.items.reduce(
      (acc, i) => ({ p: acc.p + i.proteinG, k: acc.k + i.kcal }),
      { p: 0, k: 0 },
    )
    if (record.substitution) {
      if (record.substitution.quality === 'similar') {
        proteinG += planned.p
        kcal += planned.k
      }
      continue
    }
    if (record.skipped) continue
    for (const item of slot.items) {
      if (record.checkedItemIds.includes(item.id)) {
        proteinG += item.proteinG
        kcal += item.kcal
      }
    }
  }

  const score = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  const adherence: Adherence =
    scores.length < MIN_SLOTS_FOR_VERDICT || score === null
      ? 'unlogged'
      : score >= ADHERENCE_GOOD
        ? 'good'
        : score >= ADHERENCE_MID
          ? 'mid'
          : 'poor'

  return {
    score,
    adherence,
    loggedSlots: scores.length,
    totalSlots: slots.length,
    proteinG,
    targetProteinG,
    kcal,
    targetKcal,
  }
}

export const ADHERENCE_MARK: Record<Adherence, string> = {
  good: '●',
  mid: '◐',
  poor: '○',
  unlogged: '—',
}

/** 플랜 항목 합계 — kcalLabel을 손으로 적지 않고 여기서 만든다 */
export function planTotals(plan: DietPlan, isTrainingDay = true): { kcal: number; proteinG: number } {
  const slots = slotsFor(plan, isTrainingDay)
  return {
    kcal: slots.reduce((n, s) => n + s.items.reduce((m, i) => m + i.kcal, 0), 0),
    proteinG: slots.reduce((n, s) => n + s.items.reduce((m, i) => m + i.proteinG, 0), 0),
  }
}

export function formatPlanLabel(plan: DietPlan): string {
  const { kcal, proteinG } = planTotals(plan)
  return `약 ${kcal.toLocaleString()}kcal · 단 ${proteinG}g`
}

/** 저칼로리 플랜 연속일 가드 (PLAN-DIET §0-2) */
export const LOW_KCAL_STREAK_WARN = 4

/**
 * 오늘부터 거슬러 올라가며 같은 플랜이 연속된 일수.
 *
 * 루틴 문서 15장: "전날 초과분을 만회하려고 덜 먹지 않는다." 구조화된 소폭 보정은
 * 허용하되 **장기화는 문서가 금지한 만회성 절식**이므로, 연속 4일째부터 경고한다.
 */
export function planStreak(days: DietDay[], planId: string, today: string): number {
  // 날짜 산술은 dates.addDays로 한다 — Date.toISOString()은 UTC로 변환해서
  // 시간대에 따라 하루가 밀린다 (기록이 로컬 날짜 문자열이므로 섞이면 안 된다)
  const byDate = new Map(days.map((d) => [d.date, d]))
  let streak = 0
  let cursor = today
  while (byDate.get(cursor)?.planId === planId) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

/**
 * 아직 기록하지 않은 첫 슬롯 (D5 홈 칩).
 *
 * 시간순으로 첫 미기록 슬롯을 준다 — "지금 뭘 먹어야 하나"에 답하는 것이 목적이므로
 * 이미 기록한 슬롯을 건너뛴다. 전부 기록했으면 null (칩을 숨긴다).
 */
export function nextUnloggedSlot(
  plan: DietPlan,
  day: DietDay | undefined,
  isTrainingDay: boolean,
): DietSlot | null {
  return slotsFor(plan, isTrainingDay).find((s) => day?.slots[s.id] === undefined) ?? null
}

// ─── 월 집계 (D3 캘린더 링 · 월 요약) ────────────────────

/**
 * 날짜별 준수 등급.
 *
 * 플랜을 찾지 못하면 `unlogged`로 둔다 — 플랜 JSON을 교체해 id가 사라져도 과거 기록이
 * 화면을 깨뜨리지 않아야 한다 (운동 쪽 "루틴에 없음" 처리와 같은 사상).
 */
export function adherenceByDate(days: DietDay[], plans: DietPlan[]): Map<string, Adherence> {
  const byId = new Map(plans.map((p) => [p.id, p]))
  const out = new Map<string, Adherence>()
  for (const day of days) {
    const plan = byId.get(day.planId)
    out.set(day.date, plan ? summarizeDietDay(plan, day).adherence : 'unlogged')
  }
  return out
}

export interface DietMonthStats {
  byDate: Map<string, Adherence>
  /** 판정 가능한 날 수 (미기록 제외) */
  logged: number
  /** ● 인 날 수 */
  good: number
}

export function dietMonthStats(
  days: DietDay[],
  plans: DietPlan[],
  anyDateInMonth: string,
): DietMonthStats {
  const inMonth = days.filter((d) => isSameMonth(d.date, anyDateInMonth))
  const byDate = adherenceByDate(inMonth, plans)
  let logged = 0
  let good = 0
  for (const grade of byDate.values()) {
    if (grade === 'unlogged') continue
    logged += 1
    if (grade === 'good') good += 1
  }
  return { byDate, logged, good }
}
