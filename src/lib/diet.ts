import type {
  DietDay,
  DietItem,
  DietItemVariant,
  DietPlan,
  DietSlot,
  LegacyRestDayPlan,
  SlotQuality,
  SlotRecord,
} from '../types'
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
  /**
   * **훈련 전·직후 슬롯**의 스킵 (H3, 리뷰어 판정).
   * 루틴 문서 15장이 훈련 전 쉐이크를 "생략하지 말 것"으로 명시한다 —
   * 그 슬롯의 스킵은 다른 끼니보다 무겁다.
   */
  skippedCritical: 0.25,
} as const

/**
 * 스킵을 더 무겁게 보는 슬롯 (H3).
 *
 * 슬롯 id로 판정한다 — 플랜 JSON을 교체해도 같은 id를 쓰면 규칙이 따라간다.
 * 휴식일에는 두 슬롯이 하나로 합쳐지므로(`shake`) 그것도 포함한다.
 */
export const CRITICAL_SKIP_SLOTS: readonly string[] = ['pre', 'post', 'shake']

/**
 * 추가 섭취가 있을 때의 **점수 상한** (G2).
 *
 * 계획을 완수했어도 치팅을 추가했으면 완수가 아니다 — 감량기에 "계획 완수 + 야식"은
 * 완수로 볼 수 없다. 반대로 건강하게 추가한 것은 무벌점이다.
 * 기존 점수를 **깎지 않고 상한으로만** 적용한다 (이미 낮은 점수를 더 낮추지 않는다).
 */
export const ADDITION_CAP = {
  similar: 1,
  other: 0.75,
  cheat: 0.5,
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
export function resolveTrainingDays(
  days: DietDay[],
  trainedDates: Set<string>,
  /**
   * 훈련일/휴식일로 구성이 갈리는 플랜의 id 집합 (DD2 — `splitPlanIds`).
   *
   * 새 플랜은 매일 같은 5끼라 `isTrainingDay`가 판정에 아무 영향을 주지 않는다.
   * 그래도 정규화를 전체에 걸면 **저장값을 바꿀 이유가 없는 날까지 파생값이 흔들려**
   * "왜 이 값이 바뀌나"를 추적할 수 없다. 정규화가 필요한 날 = 옛 플랜을 쓰는 날뿐이다.
   */
  splitPlanIds: Set<string>,
): DietDay[] {
  return days.map((day) =>
    splitPlanIds.has(day.planId) && trainedDates.has(day.date) && !day.isTrainingDay
      ? { ...day, isTrainingDay: true }
      : day,
  )
}

/**
 * 옛 플랜의 휴식일 구성 (DD2). 새 플랜에는 없다.
 *
 * 타입 단정을 **이 함수 하나에 가둔다** — 흩어 놓으면 새 코드가 사라진 필드에 계속
 * 의존하게 되고, "옛 플랜만의 것"이라는 사실이 화면에서 읽히지 않는다.
 */
export function restDaySlotsOf(plan: DietPlan): DietSlot[] | undefined {
  const slots = (plan as DietPlan & LegacyRestDayPlan).restDaySlots
  return slots && slots.length > 0 ? slots : undefined
}

/** 훈련일/휴식일로 구성이 갈리는 플랜인가 (= 옛 플랜) */
export function splitsByTrainingDay(plan: DietPlan): boolean {
  return restDaySlotsOf(plan) !== undefined
}

export function splitPlanIds(plans: DietPlan[]): Set<string> {
  return new Set(plans.filter(splitsByTrainingDay).map((p) => p.id))
}

/**
 * 그 날의 슬롯 구성.
 *
 * 새 플랜은 `isTrainingDay`와 무관하게 같은 5끼다 (DD2). 옛 플랜은 저장된 구성을
 * 그대로 판정해야 하므로 분기를 **읽기에서만** 유지한다 — 과거 날짜의 마크가 바뀌면
 * 이 라운드의 인바리언트가 깨진다.
 */
export function slotsFor(plan: DietPlan, isTrainingDay = true): DietSlot[] {
  const rest = restDaySlotsOf(plan)
  return !isTrainingDay && rest ? rest : plan.slots
}

/**
 * 플랜 목록에 노출할 플랜 (DD2). 대체된 옛 플랜은 숨긴다.
 *
 * 지우지 않는 이유는 `DietPlan.legacy` 주석 참조. 목록을 만드는 곳이 늘어날 수 있으므로
 * 필터를 화면에 두지 않는다 — 한 곳이 빠지면 사용자가 옛 플랜을 다시 고를 수 있게 된다.
 */
export function visiblePlans(plans: DietPlan[]): DietPlan[] {
  return plans.filter((p) => !p.legacy)
}

/** 이 플랜을 대신하는 새 플랜 (DD2). 없으면 undefined */
export function successorOf(plans: DietPlan[], planId: string): DietPlan | undefined {
  const from = plans.find((p) => p.id === planId)
  return from?.supersededBy ? plans.find((p) => p.id === from.supersededBy) : undefined
}

// ─── 품목 변형 (DD3 단백질원 로테이션) ───────────────────

/**
 * 이 품목이 가질 수 있는 형태들. **0번이 기본**이다.
 *
 * 기본 변형은 품목 자신에서 합성한다 (JSON에 0번을 또 적지 않는다 — `DietItem.variants`
 * 주석). 그래서 변형이 없는 품목도 같은 경로를 지나고, 화면·요약·내보내기가
 * "변형이 있는 품목"과 "없는 품목"을 다르게 다룰 필요가 없다.
 */
export function variantsOf(item: DietItem): DietItemVariant[] {
  const base: DietItemVariant = {
    name: item.name,
    qty: item.qty,
    kcal: item.kcal,
    proteinG: item.proteinG,
  }
  return item.variants ? [base, ...item.variants] : [base]
}

/**
 * 고른 변형. 범위를 벗어난 인덱스는 **기본으로 떨어진다** —
 * 플랜 JSON을 교체해 변형이 줄어도 과거 기록이 화면을 깨뜨리지 않아야 한다
 * (운동 쪽 "루틴에 없음" 처리와 같은 사상).
 */
export function itemVariant(item: DietItem, choice: number | undefined): DietItemVariant {
  const all = variantsOf(item)
  return all[choice ?? 0] ?? all[0]
}

export function hasVariants(item: DietItem): boolean {
  return variantsOf(item).length > 1
}

/** `settings.variantDefaults`의 키 — 슬롯×품목 (같은 품목이 점심·저녁에 따로 있다) */
export function variantDefaultKey(slotId: string, itemId: string): string {
  return `${slotId}.${itemId}`
}

/**
 * 그 슬롯에서 **지금 화면이 보여줄** 변형 선택 (DD3 5-b).
 *
 * 우선순위: 기록된 값 → 기억된 기본값 → 0번. 기록이 항상 이기므로 기본값을 바꿔도
 * 과거 날짜에 소급되지 않는다. 판정(`summarizeDietDay`)은 **기록만** 본다 — 여기서
 * 기억값을 섞으면 "안 적은 날의 kcal이 설정에 따라 달라지는" 파생값이 생긴다.
 */
export function variantChoicesFor(
  slot: DietSlot,
  record: SlotRecord | undefined,
  defaults: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of slot.items) {
    if (!hasVariants(item)) continue
    out[item.id] =
      record?.variantChoices?.[item.id] ?? defaults?.[variantDefaultKey(slot.id, item.id)] ?? 0
  }
  return out
}

/**
 * 슬롯 하나의 점수.
 *
 * 대체가 있으면 체크 수보다 대체 태그가 우선한다 — "일부 체크 + 대체"는 그 슬롯을
 * 다른 음식으로 메웠다는 뜻이므로, 체크된 계획 항목 비율로 점수를 매기면 이중 감점이 된다.
 */
export function slotScore(slot: DietSlot, record: SlotRecord | undefined): number | null {
  if (!record) return null // 미기록 — 평균에 넣지 않는다
  const base = baseSlotScore(slot, record)
  // 추가 섭취는 상한으로만 작용한다 (G2) — 완수했어도 치팅 추가면 완수가 아니다
  return record.addition ? Math.min(base, ADDITION_CAP[record.addition.quality]) : base
}

/**
 * 항목의 **영양 기여 가중** (Z6).
 *
 * 개수 기반 점수의 문제: 오메가3 1캡슐 = 현미밥 150g 1표였다. 아침에서 오메가3 하나만
 * 빼면 2/3 체크 → `partial` 0.5로 떨어져 **캡슐 하나가 끼니의 절반을 깎았다.**
 *
 * `kcal + proteinG × 4`인 이유: 단백질은 kcal에 이미 포함돼 있지만 한 번 더 얹는다 —
 * 이 프로그램의 1급 지표가 단백질 160g이므로, 단백질원 누락이 같은 kcal의 탄수 누락보다
 * 무거워야 한다.
 *
 * ⚠ **×4는 선택한 미검증 계수다** (설계 판단이지 코칭 근거가 아니다 — `substitute.ts`의
 * `startFactor`와 같은 표기 수준). 방향(단백질을 더 무겁게)은 근거가 있지만 "왜 두 배인가"
 * 는 정해진 바가 없다. 이 값은 **항목 간 상대 가중에만** 쓰이고 절대값 소비처가 없어
 * 정밀도가 요구되지 않는다 (리뷰 판정: 문서 승격 없이 현행 + 명시).
 *
 * floor 10인 이유: 0kcal에 가까운 보충제(오메가3·비타민)가 가중 0이 되면 체크 여부가
 * 점수에 전혀 안 보여 **체크할 이유가 사라진다.** "거의 안 깎이지만 0은 아니다"가 맞는 자리다.
 */
export const ITEM_WEIGHT_FLOOR = 10
export const PROTEIN_WEIGHT_FACTOR = 4

export function itemWeight(item: DietItem): number {
  return Math.max(ITEM_WEIGHT_FLOOR, item.kcal + item.proteinG * PROTEIN_WEIGHT_FACTOR)
}

function baseSlotScore(slot: DietSlot, record: SlotRecord): number {
  if (record.substitution) {
    return record.substitution.quality === 'similar'
      ? SCORE.full
      : record.substitution.quality === 'other'
        ? SCORE.partial
        : SCORE.cheat
  }
  if (record.skipped) {
    return CRITICAL_SKIP_SLOTS.includes(slot.id) ? SCORE.skippedCritical : SCORE.skipped
  }

  /*
   * 체크로 채운 슬롯은 **연속값**이다 (Z6) — 개수 양자화를 버렸다.
   * 대체·스킵·추가 상한(G2)·크리티컬 스킵(H3) 매핑은 위에서 그대로 유지된다.
   * 바뀌는 것은 이 경로뿐이다.
   */
  const total = slot.items.reduce((n, item) => n + itemWeight(item), 0)
  if (total === 0) return SCORE.full
  const checked = slot.items
    .filter((item) => record.checkedItemIds.includes(item.id))
    .reduce((n, item) => n + itemWeight(item), 0)
  return checked / total
}

/**
 * 슬롯 마크 5단 (Z6).
 *
 * 3단(●◐✗)에서는 0.86과 1.0이 같아 보이고, 0.97과 0.5도 같아 보였다 —
 * 연속 점수를 만들어도 표시가 3단이면 그 정밀도가 화면에 도달하지 않는다.
 *
 * 임계값을 **여기 한 곳**에 두는 이유: 화면이 자기 임계값을 들고 있으면 슬롯 마크와
 * 일 요약이 다른 기준으로 말하게 된다 (이 프로젝트의 반복 결함).
 */
export type SlotGrade = 'none' | 'full' | 'high' | 'mid' | 'low' | 'zero'

export const SLOT_MARK: Record<SlotGrade, string> = {
  none: '○',
  full: '●',
  high: '◕',
  mid: '◐',
  low: '◔',
  zero: '✗',
}

export function slotGrade(score: number | null): SlotGrade {
  if (score === null) return 'none'
  if (score >= 1) return 'full'
  if (score >= 0.8) return 'high'
  if (score >= 0.45) return 'mid'
  if (score > 0) return 'low'
  return 'zero'
}

/**
 * 자가 태그 표시 문구 — **카드·시트·내보내기가 같은 말을 써야 한다.**
 *
 * 세 곳에 같은 사본이 따로 있었다 (DietDayEditor·DietSlotSheet·exportMarkdown).
 * AA3에서 시트에 상태 요약을 추가하며 네 번째 사본을 만들 자리였고, 그게 이 프로젝트가
 * 반복해서 만든 결함 B(같은 값을 두 경로가 각자 계산)의 형태다. 마크 상수들과 같은
 * 이유로 여기 둔다: 표시 문구도 규칙이다.
 */
export const QUALITY_LABEL: Record<SlotQuality, string> = {
  similar: '비슷한 구성',
  other: '다른 음식',
  cheat: '치팅',
}

/**
 * 대체·추가 한 줄 표기 (AA3).
 *
 * 카드(DietDayEditor)와 시트(DietSlotSheet)가 **같은 사실을 같은 문구로** 말한다 —
 * 시트에서 상태를 확인하고 카드로 돌아왔을 때 표기가 다르면 다른 기록처럼 읽힌다.
 * 내보내기는 문장 형식이 달라 별도로 둔다 (LLM이 읽는 마크다운 vs 화면 한 줄).
 */
export function substitutionNote(sub: NonNullable<SlotRecord['substitution']>): string {
  return `대체: “${sub.text}” · ${QUALITY_LABEL[sub.quality]}`
}

export function additionNote(add: NonNullable<SlotRecord['addition']>): string {
  return `+ 추가: “${add.text}” · ${QUALITY_LABEL[add.quality]}`
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
        /*
         * 고른 변형의 값을 쓴다 (DD3 마크로 정직성) — 다리살을 골랐으면 그 날 kcal이
         * 실제로 올라가야 한다. **기록된 선택만** 본다 (기억된 기본값을 섞지 않는다).
         */
        const variant = itemVariant(item, record.variantChoices?.[item.id])
        proteinG += variant.proteinG
        kcal += variant.kcal
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

/**
 * 플랜 항목 합계 — kcalLabel을 손으로 적지 않고 여기서 만든다.
 *
 * **기본 변형 기준이다** (DD3.4). 변형은 그날의 선택이고 플랜의 목표량이 아니다 —
 * 목표가 선택에 따라 흔들리면 "목표 대비" 표시가 매일 다른 기준으로 말한다.
 */
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

// ─── 플랜 비교 (DD1) ─────────────────────────────────────

/**
 * 두 플랜의 **품목 차이** (DD1).
 *
 * 피드백: "보정 1,500과 감량 1,800 차이를 앱에서 잘 모르겠다." 실제 차이는 저녁 현미밥
 * 1개뿐인데 플랜 시트가 이름과 총량만 보여줬다 — **화면에 차이를 알 방법이 없었다.**
 *
 * 설명 문자열을 손으로 적지 않는 이유: 플랜 JSON을 고치면 설명도 따라와야 한다.
 * 이 프로젝트에서 반복해서 나온 결함 A(손으로 쓴 파생값이 낡는다)의 형태다 —
 * `kcalLabel`을 시드에서 다시 만드는 것과 같은 처방이다.
 */
export type PlanItemDiffKind = 'removed' | 'added' | 'changed'

export interface PlanItemDiff {
  slotId: string
  slotName: string
  /** 표시 이름 — 변형이 있으면 기본 변형 이름 */
  itemName: string
  kind: PlanItemDiffKind
  /** `base`에서의 수량 (removed·changed) */
  fromQty?: string
  /** `other`에서의 수량 (added·changed) */
  toQty?: string
  kcalDelta: number
  proteinDelta: number
}

export interface PlanDiff {
  items: PlanItemDiff[]
  kcalDelta: number
  proteinDelta: number
}

/**
 * `base` → `other`로 갈 때 무엇이 달라지는가.
 *
 * 총량은 `planTotals`에서 가져온다 (품목 델타의 합이 아니다) — 합계는 이미 한 곳에서
 * 파생되고 있고, 두 경로로 계산하면 답이 갈릴 수 있다 (결함 B). 대신 **둘이 일치한다는
 * 것을 테스트가 잠근다.**
 */
export function comparePlans(base: DietPlan, other: DietPlan): PlanDiff {
  const items: PlanItemDiff[] = []
  const baseSlots = slotsFor(base)
  const otherSlots = slotsFor(other)
  const slotIds = [...new Set([...baseSlots.map((s) => s.id), ...otherSlots.map((s) => s.id)])]

  for (const slotId of slotIds) {
    const from = baseSlots.find((s) => s.id === slotId)
    const to = otherSlots.find((s) => s.id === slotId)
    const slotName = to?.name ?? from?.name ?? slotId
    const itemIds = [
      ...new Set([...(from?.items ?? []).map((i) => i.id), ...(to?.items ?? []).map((i) => i.id)]),
    ]
    for (const itemId of itemIds) {
      const a = from?.items.find((i) => i.id === itemId)
      const b = to?.items.find((i) => i.id === itemId)
      if (a && b && a.qty === b.qty && a.kcal === b.kcal && a.proteinG === b.proteinG) continue
      items.push({
        slotId,
        slotName,
        itemName: (b ?? a)!.name,
        kind: !a ? 'added' : !b ? 'removed' : 'changed',
        fromQty: a?.qty,
        toQty: b?.qty,
        kcalDelta: (b?.kcal ?? 0) - (a?.kcal ?? 0),
        proteinDelta: (b?.proteinG ?? 0) - (a?.proteinG ?? 0),
      })
    }
  }

  const t = planTotals(base)
  const o = planTotals(other)
  return { items, kcalDelta: o.kcal - t.kcal, proteinDelta: o.proteinG - t.proteinG }
}

/** 부호를 붙인 숫자 — "−215" (음수 기호는 하이픈이 아니라 U+2212) */
function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`
}

/**
 * 차이 한 줄 — "저녁: 현미밥 1개 빠짐 · −215kcal".
 *
 * 차이가 없으면 빈 문자열이다 (화면이 그때 줄을 그리지 않는다).
 */
export function planDiffText(base: DietPlan, other: DietPlan): string {
  const diff = comparePlans(base, other)
  if (diff.items.length === 0 && diff.kcalDelta === 0) return ''
  const parts = diff.items.map((d) =>
    d.kind === 'removed'
      ? `${d.slotName}: ${d.itemName} ${d.fromQty} 빠짐`
      : d.kind === 'added'
        ? `${d.slotName}: ${d.itemName} ${d.toQty} 추가`
        : `${d.slotName}: ${d.itemName} ${d.fromQty} → ${d.toQty}`,
  )
  const totals = `${signed(diff.kcalDelta)}kcal · 단백질 ${signed(diff.proteinDelta)}g`
  return parts.length > 0 ? `${parts.join(' / ')} · ${totals}` : totals
}

/** 저칼로리 플랜 연속일 가드 (PLAN-DIET §0-2) */
export const LOW_KCAL_STREAK_WARN = 4

/**
 * 기본 플랜보다 **덜 먹는** 플랜인가 (보정 플랜).
 *
 * 연속일 경고의 대상 판정이다. `!plan.isDefault`로 판단하던 것을 바꿨다 — DD2에서
 * 옛 플랜이 `isDefault`를 잃으면서, 미리 잡아 둔 옛 감량 플랜 날짜에 "만회성 절식" 경고가
 * 뜰 수 있게 됐다. 경고의 근거는 문서의 **총량 감소**이므로 총량에서 파생시킨다.
 */
export function isReducedPlan(plan: DietPlan, plans: DietPlan[]): boolean {
  const base = plans.find((p) => p.isDefault)
  if (!base || base.id === plan.id) return false
  return planTotals(plan).kcal < planTotals(base).kcal
}

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
  /**
   * **기록은 있으나 판정을 보류한 날** (X2) — 1슬롯 이상, `MIN_SLOTS_FOR_VERDICT` 미만.
   *
   * 왜 `Adherence`에 값을 더하지 않았나: 판정 기준을 3슬롯으로 유지하라는 것이 요구였고
   * (`good/mid/poor`의 의미가 바뀌면 과거 날의 마크가 전부 흔들린다), 이 정보는 판정이
   * 아니라 **"기록이 있다"는 사실**이다. 종류가 다른 것을 같은 열거형에 넣으면
   * 마크·내보내기·칩까지 전부 새 값을 처리해야 한다.
   *
   * 캘린더가 이것으로 회색 링을 그린다 — 아침만 적은 날이 "아무것도 없는 날"과 같아 보이면
   * 기록한 사람이 기록이 사라졌다고 느낀다 (실사용 보고 #2).
   */
  partialDates: Set<string>
}

export function dietMonthStats(
  days: DietDay[],
  plans: DietPlan[],
  anyDateInMonth: string,
): DietMonthStats {
  const inMonth = days.filter((d) => isSameMonth(d.date, anyDateInMonth))
  const byDate = adherenceByDate(inMonth, plans)
  const byId = new Map(plans.map((p) => [p.id, p]))
  let logged = 0
  let good = 0
  const partialDates = new Set<string>()
  for (const [date, grade] of byDate) {
    if (grade === 'unlogged') {
      /*
       * 판정은 못 하지만 기록이 있는 날을 골라낸다 (X2).
       * 슬롯 수는 `summarizeDietDay`에서 가져온다 — 여기서 세면 판정과 다른 기준이 생긴다.
       */
      const day = inMonth.find((d) => d.date === date)
      const plan = day ? byId.get(day.planId) : undefined
      if (day && plan && summarizeDietDay(plan, day).loggedSlots > 0) partialDates.add(date)
      continue
    }
    logged += 1
    if (grade === 'good') good += 1
  }
  return { byDate, logged, good, partialDates }
}
