import { describe, expect, it } from "vitest"
import { BUNDLED_DIET_PLANS } from "../db/seed"
import { dietMonthStats, hasDietRecord, logEntryText, logTotals, nutritionText, resolveTrainingDays, sortedLog, summarizeDietDay } from "./diet"
import {
  applyAddition,
  applyAddLog,
  applyCheckAllItems,
  applyClearAddition,
  applyClearSlot,
  applyClearSubstitution,
  applyNote,
  applyPlan,
  applyRemoveLog,
  applySkipSlot,
  applySubstitution,
  applyToggleItem,
  applyUpdateLog,
  applyVariantChoice,
  seedVariantChoices,
} from "./dietOps"
import { dietSectionMarkdown } from "./exportMarkdown"
import { applyAddFood, applyRemoveFood, applyUpdateFood, foodCatalog, foodKey, planFoods, validateFood } from "./foods"
import { stripComments } from "./sourceScan"
import type { DietDay, DietPlan, Food, FoodLogEntry } from "../types"

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

// ─── MM1 내 음식 목록 ──────────────────────────────────────────
const mkFood = (id: string, name: string, qty: string, createdAt: string, extra: Partial<Food> = {}): Food => ({
  id,
  name,
  qty,
  createdAt,
  ...extra,
})
const mkEntry = (name: string, qty: string, time: string): FoodLogEntry => ({
  id: `${name}-${time}`,
  time,
  name,
  qty,
  count: 1,
})
/** 손으로 만든 log가 달린 날 (MM2 이전이라 타입만 있다) */
const logDay = (date: string, log: FoodLogEntry[]): DietDay => ({
  date,
  planId: PLAN.id,
  isTrainingDay: true,
  slots: {},
  log,
})

/** 변형이 있는 품목 하나와 중복 이름 품목을 가진 작은 플랜 */
const SMALL_PLAN: DietPlan = {
  ...PLAN,
  id: "small",
  slots: [
    {
      id: "a",
      name: "아침",
      timeHint: "07:00",
      items: [
        {
          id: "chicken",
          name: "닭가슴살",
          qty: "150g",
          kcal: 165,
          proteinG: 35,
          variants: [{ name: "닭안심", qty: "180g", kcal: 190, proteinG: 38 }],
        },
        { id: "egg", name: "계란", qty: "2개", kcal: 140, proteinG: 12 },
      ],
    },
    {
      id: "b",
      name: "점심",
      timeHint: "12:00",
      items: [{ id: "egg2", name: "계란", qty: "2개", kcal: 140, proteinG: 12 }],
    },
  ],
}

describe("MM1 내 음식 목록", () => {
  it("MM1 foodKey는 앞뒤 공백을 무시한다", () => {
    expect(foodKey(" 바나나 ", "1개 ")).toBe(foodKey("바나나", "1개"))
  })

  it("MM1 planFoods는 기본·대체 변형을 모두 내고 같은 이름·분량은 한 번만 낸다", () => {
    const foods = planFoods([SMALL_PLAN])
    expect(foods.map((f) => foodKey(f.name, f.qty))).toEqual(["닭가슴살|150g", "닭안심|180g", "계란|2개"])
    expect(foods.every((f) => f.source === "plan")).toBe(true)
  })

  it("MM1 planFoods는 legacy 플랜의 품목을 내지 않는다", () => {
    expect(planFoods([{ ...SMALL_PLAN, legacy: true }])).toEqual([])
  })

  it("MM1 foodCatalog: 먹은 것이 맨 위, 더 최근이 먼저, 같은 날이면 늦은 시각이 먼저", () => {
    const days = [
      logDay("2026-11-02", [mkEntry("계란", "2개", "08:00")]),
      logDay("2026-11-03", [mkEntry("닭안심", "180g", "09:00"), mkEntry("닭가슴살", "150g", "19:00")]),
    ]
    const names = foodCatalog([SMALL_PLAN], [], days).map((f) => f.name)
    expect(names).toEqual(["닭가슴살", "닭안심", "계란"])
  })

  it("MM1 foodCatalog: 적힌 적 없는 내 음식이 적힌 적 없는 플랜 품목보다 앞이다 (내 음식은 최신 등록 먼저)", () => {
    const mine = [mkFood("1", "바나나", "1개", "2026-11-01T00:00:00Z"), mkFood("2", "우유", "200ml", "2026-11-05T00:00:00Z")]
    const names = foodCatalog([SMALL_PLAN], mine, []).map((f) => f.name)
    expect(names).toEqual(["우유", "바나나", "닭가슴살", "닭안심", "계란"])
  })

  it("MM1 foodCatalog: 내 음식과 플랜 품목의 foodKey가 같으면 한 줄이고 source는 user다", () => {
    const mine = [mkFood("1", "계란", "2개", "2026-11-01T00:00:00Z", { kcal: 150 })]
    const eggs = foodCatalog([SMALL_PLAN], mine, []).filter((f) => foodKey(f.name, f.qty) === "계란|2개")
    expect(eggs).toHaveLength(1)
    expect(eggs[0]).toMatchObject({ source: "user", id: "1", kcal: 150 })
  })

  it("MM1 foodCatalog: 같은 이름·다른 분량(바나나|1개, 바나나|2개)은 두 줄이다", () => {
    const mine = [mkFood("1", "바나나", "1개", "2026-11-01T00:00:00Z"), mkFood("2", "바나나", "2개", "2026-11-02T00:00:00Z")]
    expect(foodCatalog([], mine, []).map((f) => foodKey(f.name, f.qty)).sort()).toEqual(["바나나|1개", "바나나|2개"])
  })

  it("MM1 foodCatalog: 플랜 품목과 이름만 같고 분량이 다른 내 음식은 둘 다 남는다 (중복 제거는 foodKey로)", () => {
    const mine = [mkFood("1", "계란", "3개", "2026-11-01T00:00:00Z")]
    const keys = foodCatalog([SMALL_PLAN], mine, []).map((f) => foodKey(f.name, f.qty))
    expect(keys).toContain("계란|3개")
    expect(keys).toContain("계란|2개")
  })

  it("MM1 validateFood: 이름이 공백뿐이면 문구 1개", () => {
    expect(validateFood({ name: "  ", qty: "" }, [SMALL_PLAN], [])).toEqual(["이름을 적어 주세요"])
  })

  it("MM1 validateFood: kcal -1은 문구, kcal·단백질 빈칸은 통과", () => {
    expect(validateFood({ name: "바나나", qty: "", kcal: -1 }, [], [])).toEqual([
      "칼로리와 단백질은 0 이상의 숫자로 적어 주세요",
    ])
    expect(validateFood({ name: "바나나", qty: "", kcal: Number.NaN }, [], [])).toHaveLength(1)
    expect(validateFood({ name: "바나나", qty: "" }, [], [])).toEqual([])
  })

  it("MM1 validateFood: 플랜 품목과 같은 이름·분량은 문구, 자기 자신과 같은 것은 통과", () => {
    expect(validateFood({ name: "계란", qty: "2개" }, [SMALL_PLAN], [])).toEqual([
      "같은 이름·분량의 음식이 이미 목록에 있습니다",
    ])
    const mine = [mkFood("1", "바나나", "1개", "2026-11-01T00:00:00Z")]
    expect(validateFood({ name: "바나나", qty: "1개" }, [], mine)).toHaveLength(1)
    expect(validateFood({ name: "바나나", qty: "1개" }, [], mine, "1")).toEqual([])
  })

  it("MM1 applyUpdateFood·applyRemoveFood·applyAddFood는 받은 배열을 바꾸지 않는다", () => {
    const base = [mkFood("1", "바나나", "1개", "2026-11-01T00:00:00Z", { kcal: 90 })]
    const frozen = JSON.stringify(base)
    const updated = applyUpdateFood(base, "1", { name: "바나나", qty: "2개" })
    const removed = applyRemoveFood(base, "1")
    const added = applyAddFood(base, mkFood("2", "우유", "", "2026-11-02T00:00:00Z"))
    expect(JSON.stringify(base)).toBe(frozen)
    expect(updated).not.toBe(base)
    expect(updated[0]).toMatchObject({ id: "1", qty: "2개", createdAt: "2026-11-01T00:00:00Z" })
    expect("kcal" in updated[0]).toBe(false) // 비운 칸은 영양 미입력
    expect(removed).toEqual([])
    expect(added).toHaveLength(2)
  })

  const sources = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<
    string,
    string
  >

  it("MM1 스캔: useDiet.ts에 mutateUserFoods가 있고 .then(scheduleBackup) 개수가 쓰기 함수 4개와 같다", () => {
    const src = stripComments(sources["/src/lib/useDiet.ts"]!)
    expect(src).toMatch(/export function mutateUserFoods/)
    const writers = src.match(/export function (mutateDietDay|removeDietDay|rememberVariantDefault|mutateUserFoods)/g) ?? []
    expect(writers).toHaveLength(4)
    expect((src.match(/\.then\(scheduleBackup\)/g) ?? []).length).toBe(4)
  })

  it("MM1 스캔: foodKey를 거치지 않고 `${…name}|${…qty}` 꼴로 키를 만드는 곳이 foods.ts 밖에 없다", () => {
    const hits = Object.entries(sources)
      .filter(([p]) => !p.endsWith("/src/lib/foods.ts") && !p.endsWith(".test.ts"))
      .filter(([, src]) => /`[^`]*\$\{[^}]*name[^}]*\}\|\$\{[^}]*qty[^}]*\}/.test(stripComments(src)))
      .map(([p]) => p)
    expect(hits).toEqual([])
  })
})

// ─── MM2 먹은 것 시간별 기록 ───────────────────────────────────
const E = (over: Partial<FoodLogEntry> = {}): FoodLogEntry => ({
  id: "e1",
  time: "13:20",
  name: "서브웨이 터키",
  qty: "15cm",
  kcal: 350,
  proteinG: 25,
  count: 1,
  ...over,
})
const BASE: DietDay = { date: "2026-11-06", planId: PLAN.id, isTrainingDay: true, slots: {} }
const withSlots = (n: number): DietDay => {
  const slots: DietDay["slots"] = {}
  for (const sl of PLAN.slots.slice(0, n)) slots[sl.id] = { checkedItemIds: sl.items.map((i) => i.id) }
  return { ...BASE, slots }
}

describe("MM2 먹은 것 기록", () => {
  it("MM2 합계: applyAddLog 뒤 proteinG·kcal이 줄 값만큼 늘고 score·adherence·loggedSlots는 같다", () => {
    const before = summarizeDietDay(PLAN, withSlots(3))
    const after = summarizeDietDay(PLAN, applyAddLog(withSlots(3), E()))
    expect(after.proteinG).toBe(before.proteinG + 25)
    expect(after.kcal).toBe(before.kcal + 350)
    expect(after.score).toBe(before.score)
    expect(after.adherence).toBe(before.adherence)
    expect(after.loggedSlots).toBe(before.loggedSlots)
  })

  it("MM2 합계: count 2, kcal 105, proteinG 1.3 → 210kcal · 3g (줄마다 반올림)", () => {
    const t = logTotals([E({ kcal: 105, proteinG: 1.3, count: 2 })])
    expect(t).toMatchObject({ kcal: 210, proteinG: 3, count: 1, unknown: 0 })
  })

  it("MM2 합계: kcal·proteinG가 둘 다 없는 줄은 합계 변화 없음, logUnknown 1, logCount 1", () => {
    const base = summarizeDietDay(PLAN, BASE)
    const s = summarizeDietDay(PLAN, applyAddLog(BASE, E({ kcal: undefined, proteinG: undefined })))
    expect(s.kcal).toBe(base.kcal)
    expect(s.proteinG).toBe(base.proteinG)
    expect(s.logUnknown).toBe(1)
    expect(s.logCount).toBe(1)
  })

  it("MM2 합계: proteinG만 있는 줄은 단백질만, kcal만 있는 줄은 칼로리만 늘고 logUnknown 0", () => {
    const p = summarizeDietDay(PLAN, applyAddLog(BASE, E({ kcal: undefined, proteinG: 20 })))
    expect(p).toMatchObject({ kcal: 0, proteinG: 20, logUnknown: 0 })
    const k = summarizeDietDay(PLAN, applyAddLog(BASE, E({ kcal: 140, proteinG: undefined })))
    expect(k).toMatchObject({ kcal: 140, proteinG: 0, logUnknown: 0 })
  })

  it("MM2 nutritionText: 네 경우와 (0, 0)은 미입력이 아니다", () => {
    expect(nutritionText(350, 25)).toBe("350kcal · 단 25g")
    expect(nutritionText(140, undefined)).toBe("140kcal")
    expect(nutritionText(undefined, 20)).toBe("단 20g")
    expect(nutritionText(undefined, undefined)).toBe("영양 미입력")
    expect(nutritionText(0, 0)).toBe("0kcal · 단 0g")
  })

  it("MM2 logEntryText: 표기 표 다섯 줄, 칼로리만 있는 줄에는 단이 없다", () => {
    expect(logEntryText(E())).toBe("13:20 서브웨이 터키 15cm — 350kcal · 단 25g")
    expect(logEntryText(E({ time: "16:00", name: "바나나", qty: "1개", kcal: 105, proteinG: 1.3, count: 2 }))).toBe(
      "16:00 바나나 1개 ×2 — 210kcal · 단 3g",
    )
    expect(logEntryText(E({ time: "19:00", name: "프로틴바", qty: "1개", kcal: undefined, proteinG: 20 }))).toBe(
      "19:00 프로틴바 1개 — 단 20g",
    )
    const cider = logEntryText(E({ time: "14:00", name: "사이다", qty: "1캔", kcal: 140, proteinG: undefined }))
    expect(cider).toBe("14:00 사이다 1캔 — 140kcal")
    expect(cider).not.toContain("단")
    expect(logEntryText(E({ time: "21:10", name: "회식", qty: "", kcal: undefined, proteinG: undefined }))).toBe(
      "21:10 회식 — 영양 미입력",
    )
  })

  it("MM2 슬롯을 건드리지 않고 먹은 것 1건만 있는 날: unlogged · hasDietRecord · 달력 회색 점", () => {
    const day = applyAddLog(BASE, E())
    const s = summarizeDietDay(PLAN, day)
    expect(s.adherence).toBe("unlogged")
    expect(hasDietRecord(s)).toBe(true)
    expect(dietMonthStats([day], [PLAN], "2026-11-01").partialDates.has(day.date)).toBe(true)
  })

  it("MM2 slots {}이고 log가 없는 날(MM0의 11-05): hasDietRecord false, 회색 점 없음", () => {
    const day = MM_DAYS.find((d) => d.date === "2026-11-05")!
    expect(hasDietRecord(summarizeDietDay(PLAN, day))).toBe(false)
    expect(dietMonthStats([day], [PLAN], "2026-11-01").partialDates.has(day.date)).toBe(false)
  })

  it("MM2 슬롯 3개 이상 + 먹은 것 여러 건: adherence가 먹은 것을 뺀 날과 같다 (kcal이 아무리 커도)", () => {
    const plain = withSlots(3)
    let withLog = plain
    for (let i = 0; i < 3; i += 1) withLog = applyAddLog(withLog, E({ id: `x${i}`, kcal: 99999, proteinG: 999 }))
    const a = summarizeDietDay(PLAN, plain)
    const b = summarizeDietDay(PLAN, withLog)
    expect(b.adherence).toBe(a.adherence)
    expect(b.score).toBe(a.score)
  })

  it("MM2 applyRemoveLog로 마지막 줄을 지우면 'log' in day === false", () => {
    const day = applyRemoveLog(applyAddLog(BASE, E()), "e1")
    expect("log" in day).toBe(false)
  })

  it("MM2 applyUpdateLog는 time·count만 바꾼다. count 0.2 → 0.5, 1.3 → 1.5", () => {
    const day = applyAddLog(BASE, E())
    const t = applyUpdateLog(day, "e1", { time: "14:00", count: 1.3 })
    expect(t.log![0]).toEqual({ ...E(), time: "14:00", count: 1.5 })
    expect(applyUpdateLog(day, "e1", { count: 0.2 }).log![0].count).toBe(0.5)
    expect(applyUpdateLog(day, "e1", { time: "99:99" })).toBe(day)
  })

  it("MM2 applyAddLog에 time '25:00'이나 ''이면 받은 day와 같은 객체를 돌려준다", () => {
    expect(applyAddLog(BASE, E({ time: "25:00" }))).toBe(BASE)
    expect(applyAddLog(BASE, E({ time: "" }))).toBe(BASE)
  })

  it("MM2 sortedLog: 09:00, 21:00, 09:00 순으로 넣으면 먼저 넣은 09:00 → 09:00 → 21:00", () => {
    const out = sortedLog([E({ id: "a", time: "09:00" }), E({ id: "b", time: "21:00" }), E({ id: "c", time: "09:00" })])
    expect(out.map((e) => e.id)).toEqual(["a", "c", "b"])
  })

  it("MM2 기존 연산이 log를 지우지 않는다 (옛 코드를 되돌려 배포해도 기록이 남는 근거)", () => {
    const slot = PLAN.slots[0]
    const day: DietDay = { ...withSlots(2), log: [E()] }
    const results: DietDay[] = [
      applyToggleItem(day, slot.id, slot.items[0].id),
      applyCheckAllItems(day, slot),
      applySkipSlot(day, slot.id),
      applySubstitution(day, slot.id, { text: "x", quality: "other" }),
      applyAddition(day, slot.id, { text: "x", quality: "other" }),
      applyClearAddition(day, slot.id),
      applyClearSubstitution(day, slot.id),
      applyVariantChoice(day, slot.id, slot.items[0].id, 0),
      applyClearSlot(day, slot.id),
      applyPlan(day, "other-plan"),
      applyNote(day, "메모"),
      seedVariantChoices(day, PLAN.slots, undefined),
    ]
    for (const r of results) expect(r.log).toEqual([E()])
  })

  it("MM2 목록의 음식을 고치거나 지워도 이미 만든 기록과 그날 합계가 그대로다", () => {
    const foods = [mkFood("f1", "서브웨이 터키", "15cm", "2026-11-01T00:00:00Z", { kcal: 350, proteinG: 25 })]
    const entry = E()
    const day = applyAddLog(BASE, entry)
    const before = summarizeDietDay(PLAN, day)
    applyUpdateFood(foods, "f1", { name: "다른", qty: "1", kcal: 1, proteinG: 1 })
    applyRemoveFood(foods, "f1")
    expect(day.log![0]).toEqual(entry)
    expect(summarizeDietDay(PLAN, day)).toEqual(before)
  })

  it("MM2 플랜을 바꿔도(applyPlan) log의 합계 기여는 같다", () => {
    const day = applyAddLog(BASE, E())
    expect(logTotals(applyPlan(day, "other-plan").log)).toEqual(logTotals(day.log))
  })

  it("MM2 resolveTrainingDays를 거친 날에도 log가 남는다", () => {
    const day = applyAddLog(BASE, E())
    const [out] = resolveTrainingDays([day], new Set([day.date]), new Set())
    expect(out.log).toEqual([E()])
  })

  it("MM2 MM0 골든 셋이 그대로 통과한다 (log 없는 날의 새 필드는 0)", () => {
    for (const day of MM_DAYS) {
      expect(summarizeDietDay(PLAN, day)).toMatchObject({
        ...MM_SUMMARY_BEFORE[day.date as keyof typeof MM_SUMMARY_BEFORE],
        logCount: 0,
        logUnknown: 0,
      })
    }
  })
})

describe("MM2 스캔", () => {
  const sources = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<
    string,
    string
  >
  const code = (path: string) => stripComments(sources[path]!)

  it("MM2 스캔: loggedSlots > 0 을 직접 비교하는 곳이 hasDietRecord 정의 밖에 없다", () => {
    const hits = Object.entries(sources)
      .filter(([p]) => !p.endsWith(".test.ts"))
      .flatMap(([p, src]) =>
        stripComments(src)
          .split("\n")
          .filter((l) => /loggedSlots\s*>\s*0/.test(l) && !/logCount\s*>\s*0/.test(l))
          .map(() => p),
      )
    expect(hits).toEqual([])
  })

  it("MM2 스캔: FoodLogSheet.tsx·DietDayEditor.tsx에 requestSync(가 없다 (쓰기 함수가 예약한다)", () => {
    expect(code("/src/components/FoodLogSheet.tsx")).not.toMatch(/requestSync\(/)
    expect(code("/src/components/DietDayEditor.tsx")).not.toMatch(/requestSync\(/)
  })

  it("MM2 스캔: 먹은 것 개수 NumberStepper에 decimals={2}가 있다", () => {
    const src = code("/src/components/DietDayEditor.tsx")
    const m = src.match(/<NumberStepper[\s\S]*?\/>/)
    expect(m, "먹은 것 NumberStepper가 있어야 한다").not.toBeNull()
    expect(m![0]).toMatch(/decimals=\{2\}/)
  })

  it("MM2 스캔: DietDayEditor를 부르는 세 화면이 모두 userFoods=를 넘긴다", () => {
    for (const f of ["DietScreen", "HistoryScreen", "SessionDetailScreen"]) {
      const src = code(`/src/screens/${f}.tsx`)
      const m = src.match(/<DietDayEditor[\s\S]*?\/>/)
      expect(m, `${f}에 DietDayEditor가 있어야 한다`).not.toBeNull()
      expect(m![0]).toMatch(/userFoods=/)
    }
  })

  it("MM2 스캔: 먹은 것 줄 글자는 logEntryText 한 자리에서 온다", () => {
    expect(code("/src/components/DietDayEditor.tsx")).toMatch(/logEntryText\(/)
  })
})
