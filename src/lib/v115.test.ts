import { describe, expect, it } from "vitest"
import { BUNDLED_DIET_PLANS } from "../db/seed"
import { dietMonthStats, summarizeDietDay } from "./diet"
import { dietSectionMarkdown } from "./exportMarkdown"
import type { DietDay } from "../types"

/**
 * v1.15 MM — 내 음식 목록과 시간별 먹은 것 기록.
 * 이 파일의 describe는 작업별(MM0…)로 이어 붙는다.
 * MM0 골든은 v1.14 코드의 출력을 고정한다. 이후 고치지 않는다.
 * MM2가 DietDaySummary에 필드를 더하므로 요약 비교는 처음부터 골든에 있는 키만 본다(toMatchObject).
 */

// ─── MM0 픽스처 (다른 테스트 파일을 import하지 않는다) ─────────────
const PLAN = BUNDLED_DIET_PLANS.find((p) => p.isDefault)!
const itemIds = (slotIndex: number) => PLAN.slots[slotIndex].items.map((i) => i.id)

function allChecked(): DietDay["slots"] {
  const slots: DietDay["slots"] = {}
  for (const s of PLAN.slots) slots[s.id] = { checkedItemIds: s.items.map((i) => i.id) }
  return slots
}

const MM_DAYS: DietDay[] = [
  // 전 슬롯 전부 체크 — 준수 ● 불변
  { date: "2026-11-02", planId: PLAN.id, isTrainingDay: true, slots: allChecked() },
  // 전부 체크 / 일부 체크 + 대체 / 안 먹음 — 판정·상세 줄 불변
  {
    date: "2026-11-03",
    planId: PLAN.id,
    isTrainingDay: true,
    slots: {
      breakfast: { checkedItemIds: itemIds(0) },
      lunch: { checkedItemIds: [itemIds(1)[0]], substitution: { text: "서브웨이 터키", quality: "other" } },
      dinner: { checkedItemIds: [], skipped: true },
    },
  },
  // 슬롯 1개 + 추가(cheat) + 메모 — 판정 전(회색 점)·+ 추가·메모 줄 불변
  {
    date: "2026-11-04",
    planId: PLAN.id,
    isTrainingDay: true,
    slots: { breakfast: { checkedItemIds: itemIds(0), addition: { text: "치킨 두 조각", quality: "cheat" } } },
    note: "회식",
  },
  // 기록 행만 있고 슬롯 없음 — 내보내기 빈 배열·회색 점 없음 불변
  { date: "2026-11-05", planId: PLAN.id, isTrainingDay: true, slots: {} },
]

// ─── MM0 골든: v1.14 코드의 출력 ───────────────────────────────
const MM_SUMMARY_BEFORE = {
  "2026-11-02": {
    score: 1,
    adherence: "good",
    loggedSlots: 5,
    totalSlots: 5,
    proteinG: 166,
    targetProteinG: 166,
    kcal: 1781,
    targetKcal: 1781
  },
  "2026-11-03": {
    score: 0.6666666666666666,
    adherence: "mid",
    loggedSlots: 3,
    totalSlots: 5,
    proteinG: 20,
    targetProteinG: 166,
    kcal: 235,
    targetKcal: 1781
  },
  "2026-11-04": {
    score: 0.5,
    adherence: "unlogged",
    loggedSlots: 1,
    totalSlots: 5,
    proteinG: 20,
    targetProteinG: 166,
    kcal: 235,
    targetKcal: 1781
  },
  "2026-11-05": {
    score: null,
    adherence: "unlogged",
    loggedSlots: 0,
    totalSlots: 5,
    proteinG: 0,
    targetProteinG: 166,
    kcal: 0,
    targetKcal: 1781
  }
}

const MM_MONTH_BEFORE = {
  byDate: {
    "2026-11-02": "good",
    "2026-11-03": "mid",
    "2026-11-04": "unlogged",
    "2026-11-05": "unlogged"
  },
  logged: 2,
  good: 1,
  partialDates: [
    "2026-11-04"
  ]
}

const MM_EXPORT_BEFORE: Record<string, string[]> = {
  "2026-11-02": [
    "### 식단 — 감량 1,800 · 준수 ● 100% (단백질 추정 166g / 166g)",
    "- 슬롯: 아침 ● · 점심 ● · 오후 ● · 보충 블록 ● · 저녁 ●"
  ],
  "2026-11-03": [
    "### 식단 — 감량 1,800 · 준수 ◐ 67% (단백질 추정 20g / 166g)",
    "- 슬롯: 아침 ● · 점심 ◐ · 저녁 ◐",
    "- 점심: 미섭취: 닭가슴살, 채소, 올리브오일 / 대체: \"서브웨이 터키\" — 다른 음식",
    "- 저녁: 안 먹음"
  ],
  "2026-11-04": [
    "### 식단 — 감량 1,800 · 기록 1/5슬롯 (단백질 추정 20g / 166g)",
    "- 슬롯: 아침 ◐",
    "- 아침: + 추가: \"치킨 두 조각\" — 치팅",
    "- 메모: 회식"
  ],
  "2026-11-05": []
}

describe("MM0 골든 — v1.14 출력 고정", () => {
  it("MM0 summarizeDietDay 반환 객체가 v1.14와 같다 (골든에 있는 키만 비교)", () => {
    for (const day of MM_DAYS) {
      expect(summarizeDietDay(PLAN, day)).toMatchObject(MM_SUMMARY_BEFORE[day.date as keyof typeof MM_SUMMARY_BEFORE])
    }
  })

  it("MM0 dietMonthStats의 byDate·logged·good·partialDates가 v1.14와 같다", () => {
    const m = dietMonthStats(MM_DAYS, [PLAN], "2026-11-01")
    expect({
      byDate: Object.fromEntries([...m.byDate].sort()),
      logged: m.logged,
      good: m.good,
      partialDates: [...m.partialDates].sort(),
    }).toEqual(MM_MONTH_BEFORE)
  })

  it("MM0 dietSectionMarkdown 줄 배열이 v1.14와 같다", () => {
    for (const day of MM_DAYS) {
      expect(dietSectionMarkdown(PLAN, day)).toEqual(MM_EXPORT_BEFORE[day.date])
    }
  })
})
