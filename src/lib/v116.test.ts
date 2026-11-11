import { describe, expect, it } from "vitest"
import { BUNDLED_EXERCISES, BUNDLED_ROUTINE, shouldResetActiveRoutine } from "../db/seed"
import { validateRoutine } from "../db/validateRoutine"
import { muscleBars } from "./dashboard"
import { displayDay } from "./dayChoice"
import { planDayChange } from "./dayChange"
import { findDay, findDayForRecord, weeklyVolume } from "./derive"
import { sessionToMarkdown } from "./exportMarkdown"
import { allRecordKeys, summarize } from "./history"
import {
  blankRoutine,
  finalizeRoutine,
  forkRoutine,
  nextDayId,
  NO_GUARD_GAP_DAYS,
  resolveMuscleTargets,
  toDraft,
  uniqueId,
  usedKeys,
  validateDraft,
  type UsedKeys,
} from "./routineEdit"
import { buildSession } from "./sessionFactory"
import { stripComments } from "./sourceScan"
import { suggestNextDay } from "./suggestNextDay"
import { makeRecordKey, recordDayIdOf } from "../types"
import type { Exercise, RoutineDay, RoutineTemplate, Session, SessionEntry } from "../types"

/**
 * v1.16 NN — 운동 루틴을 앱에서 만들고 고친다.
 * 이 파일의 describe는 작업별(NN0…)로 이어 붙는다.
 * NN0 골든은 v1.15 코드의 출력을 고정한다. 이후 고치지 않는다.
 */

// ─── NN0 픽스처 (다른 테스트 파일을 import하지 않는다) ─────────────
const NN_ROUTINE = BUNDLED_ROUTINE
const NN_CATALOG = new Map<string, Exercise>(BUNDLED_EXERCISES.map((e) => [e.id, e]))
const NN_TODAY = "2026-11-07"
const NN_NOW = new Date("2026-11-07T09:00:00.000Z")

const nnDay = (id: string): RoutineDay => {
  const day = [...NN_ROUTINE.days, ...NN_ROUTINE.fallbackDays].find((d) => d.id === id)
  if (!day) throw new Error(`unknown day ${id}`)
  return day
}

/** Day의 계획 종목을 앞에서 limit개까지 전 세트 체크한 entry들 */
function nnEntries(day: RoutineDay, startedAt: string, limit = Infinity): SessionEntry[] {
  return day.exercises.slice(0, limit).map((ex, i) => ({
    recordKey: makeRecordKey(ex.exerciseId, recordDayIdOf(day)),
    plannedOrder: ex.plannedOrder,
    performedOrder: i + 1,
    firstSetAt: startedAt,
    sets: Array.from({ length: ex.sets }, () => ({ weight: 40, reps: ex.repMin, done: true, doneAt: startedAt })),
    compensation: "없음",
    skipped: false,
  }))
}

function nnSession(id: string, date: string, dayId: string, entries: SessionEntry[]): Session {
  const startedAt = `${date}T18:00:00.000Z`
  return {
    id,
    date,
    dayId,
    routineId: NN_ROUTINE.id,
    mode: "normal",
    startedAt,
    endedAt: `${date}T19:30:00.000Z`,
    entries,
  }
}

const nnD1 = nnDay("d1")
const nnD1Started = "2026-11-02T18:00:00.000Z"
const nnD3Started = "2026-11-05T18:00:00.000Z"
const nnD3Entries = nnEntries(nnDay("d3"), nnD3Started)

const NN_SESSIONS: Session[] = [
  // 11-02 d1: incline-chest-press만 smith-incline-press@d1로 대체 (대체 되짚기)
  nnSession(
    "nn-1",
    "2026-11-02",
    "d1",
    nnEntries(nnD1, nnD1Started).map((e) =>
      e.recordKey === "incline-chest-press@d1"
        ? { ...e, recordKey: makeRecordKey("smith-incline-press", "d1"), substituteFor: e.recordKey }
        : e,
    ),
  ),
  // 11-03 fallback-pull: 기록 라인은 @d2 (하한 모드 되짚기)
  nnSession("nn-2", "2026-11-03", "fallback-pull", nnEntries(nnDay("fallback-pull"), "2026-11-03T18:00:00.000Z")),
  // 11-05 d3: 전 종목 + 얹은 lateral-raise@d1 2세트 (얹기)
  nnSession("nn-3", "2026-11-05", "d3", [
    ...nnD3Entries,
    {
      recordKey: makeRecordKey("lateral-raise", "d1"),
      plannedOrder: 99,
      performedOrder: nnD3Entries.length + 1,
      firstSetAt: nnD3Started,
      sets: Array.from({ length: 2 }, () => ({ weight: 5, reps: 12, done: true, doneAt: nnD3Started })),
      compensation: "없음",
      skipped: false,
      extra: true,
    },
  ]),
  // 11-06 d4: 앞 두 종목만 체크 (부분 수행)
  nnSession("nn-4", "2026-11-06", "d4", nnEntries(nnDay("d4"), "2026-11-06T18:00:00.000Z", 2)),
]

/** 다섯 계산을 한 함수로 묶는다 — NN1이 복사본 루틴을 넣어 같은 골든과 다시 비교한다 */
function nnOutputs(routine: RoutineTemplate) {
  const suggestion = suggestNextDay({ sessions: NN_SESSIONS, routine, today: NN_TODAY, now: NN_NOW })
  return {
    week: weeklyVolume(NN_SESSIONS, routine, NN_TODAY),
    suggest: { dayId: suggestion.day.id, rule: suggestion.rule, reason: suggestion.reason, scores: suggestion.scores },
    bars: muscleBars(NN_SESSIONS, routine, NN_TODAY),
    exportLines: NN_SESSIONS.map((s) =>
      sessionToMarkdown(s, routine, NN_CATALOG, 0)
        .replace(/\[\d\d:\d\d–\d\d:\d\d, /g, "[시각, ")
        .split("\n"),
    ),
    keys: allRecordKeys(NN_SESSIONS, routine),
  }
}

// ─── NN0 골든: v1.15 코드의 출력 ───────────────────────────────
const NN_WEEK_BEFORE = {
  "sets": {
    "광배": 9,
    "상부가슴": 10,
    "하체": 9,
    "내전근": 3,
    "코어": 5,
    "측면어깨": 9,
    "후면어깨": 4,
    "가슴": 3,
    "팔": 3
  },
  "exposures": {
    "광배": 2,
    "상부가슴": 2,
    "하체": 1,
    "내전근": 1,
    "코어": 1,
    "측면어깨": 2,
    "후면어깨": 2,
    "가슴": 1,
    "팔": 1
  },
  "sessionCount": 4
}

const NN_SUGGEST_BEFORE = {
  "dayId": "d1",
  "rule": "volumeBudget",
  "reason": "측면어깨·팔 2회차가 남았어요",
  "scores": [
    {
      "dayId": "d1",
      "rawScore": 4.9,
      "score": 4.9,
      "penalized": false,
      "contributions": [
        {
          "muscle": "측면어깨",
          "sets": 2,
          "points": 2,
          "firstExposure": false
        },
        {
          "muscle": "팔",
          "sets": 3,
          "points": 1.5,
          "firstExposure": false
        },
        {
          "muscle": "후면어깨",
          "sets": 2,
          "points": 1.4,
          "firstExposure": false
        }
      ]
    },
    {
      "dayId": "d2",
      "rawScore": 11.55,
      "score": 3.4650000000000003,
      "penalized": true,
      "contributions": [
        {
          "muscle": "광배",
          "sets": 7,
          "points": 5.95,
          "firstExposure": false
        },
        {
          "muscle": "후면어깨",
          "sets": 3,
          "points": 2.0999999999999996,
          "firstExposure": false
        },
        {
          "muscle": "측면어깨",
          "sets": 2,
          "points": 2,
          "firstExposure": false
        },
        {
          "muscle": "팔",
          "sets": 3,
          "points": 1.5,
          "firstExposure": false
        }
      ]
    },
    {
      "dayId": "d4",
      "rawScore": 10.7,
      "score": 3.2099999999999995,
      "penalized": true,
      "contributions": [
        {
          "muscle": "광배",
          "sets": 6,
          "points": 5.1,
          "firstExposure": false
        },
        {
          "muscle": "후면어깨",
          "sets": 3,
          "points": 2.0999999999999996,
          "firstExposure": false
        },
        {
          "muscle": "측면어깨",
          "sets": 2,
          "points": 2,
          "firstExposure": false
        },
        {
          "muscle": "팔",
          "sets": 3,
          "points": 1.5,
          "firstExposure": false
        }
      ]
    },
    {
      "dayId": "d3",
      "rawScore": 0,
      "score": 0,
      "penalized": false,
      "contributions": []
    }
  ]
}

const NN_BARS_BEFORE = {
  "bars": [
    {
      "muscle": "측면어깨",
      "performed": 9,
      "target": 11,
      "weight": 1,
      "exposures": 2,
      "expectedExposures": 2,
      "underFrequency": false
    },
    {
      "muscle": "상부가슴",
      "performed": 10,
      "target": 10,
      "weight": 0.9,
      "exposures": 2,
      "expectedExposures": 2,
      "underFrequency": false
    },
    {
      "muscle": "광배",
      "performed": 9,
      "target": 16,
      "weight": 0.85,
      "exposures": 2,
      "expectedExposures": 2,
      "underFrequency": false
    },
    {
      "muscle": "후면어깨",
      "performed": 4,
      "target": 7,
      "weight": 0.7,
      "exposures": 2,
      "expectedExposures": 2,
      "underFrequency": false
    },
    {
      "muscle": "팔",
      "performed": 3,
      "target": 6,
      "weight": 0.5,
      "exposures": 1,
      "expectedExposures": 2,
      "underFrequency": true
    },
    {
      "muscle": "하체",
      "performed": 9,
      "target": 9,
      "weight": 0.45,
      "exposures": 1,
      "expectedExposures": 1,
      "underFrequency": false
    },
    {
      "muscle": "가슴",
      "performed": 3,
      "target": 3,
      "weight": 0.4,
      "exposures": 1,
      "expectedExposures": 1,
      "underFrequency": false
    },
    {
      "muscle": "코어",
      "performed": 5,
      "target": 5,
      "weight": 0.3,
      "exposures": 1,
      "expectedExposures": 1,
      "underFrequency": false
    },
    {
      "muscle": "내전근",
      "performed": 3,
      "target": 3,
      "weight": 0.3,
      "exposures": 1,
      "expectedExposures": 1,
      "underFrequency": false
    }
  ],
  "sessionCount": 4
}

const NN_EXPORT_BEFORE: string[][] = [
  [
    "## 2026-11-02 (월) — Day 1 Push  [시각, 90분]",
    "수행 순서: 스미스 인클라인 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운",
    "",
    "### 스미스 인클라인 (D1/A) 40kg (대체: 인클라인 프레스 — 자리 없음)",
    "6 / 6 / 6 / 6",
    "간격: 0:00 / 0:00 / 0:00",
    "보상작용: 없음",
    "다음: 40kg 유지 (반복 상단(10회) 미달 — 4세트 중 0세트 도달)",
    "",
    "### 펙덱 플라이 (D1/B) 40kg",
    "12 / 12 / 12",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "",
    "### 체스트프레스 (D1/A) 40kg",
    "8 / 8 / 8",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)",
    "",
    "### 숄더프레스 (D1/A) 40kg",
    "8 / 8 / 8",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)",
    "",
    "### 레터럴 레이즈 (D1/B) 40kg",
    "12 / 12 / 12 / 12",
    "간격: 0:00 / 0:00 / 0:00",
    "보상작용: 없음",
    "",
    "### 리어델트 (D1/B) 40kg",
    "12 / 12",
    "간격: 0:00",
    "보상작용: 없음",
    "",
    "### 푸쉬다운 (D1/B) 40kg",
    "10 / 10 / 10",
    "간격: 0:00 / 0:00",
    "보상작용: 없음"
  ],
  [
    "## 2026-11-03 (화) — Pull 축소  [시각, 90분]",
    "수행 순서: 랫풀다운 → 시티드 로우 → 리어델트",
    "",
    "### 랫풀다운 (D2/A) 40kg",
    "8 / 8 / 8",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)",
    "",
    "### 시티드 로우 (D2/A) 40kg",
    "8 / 8 / 8",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)",
    "",
    "### 리어델트 (D2/B) 40kg",
    "12 / 12",
    "간격: 0:00",
    "보상작용: 없음"
  ],
  [
    "## 2026-11-05 (목) — Day 3 하체 + 코어  [시각, 90분]",
    "수행 순서: 레그 익스텐션 → 레그 컬 → 몬스터 글루트 → 힙 어덕션 → 크런치 → 데드버그 → 레터럴 레이즈",
    "",
    "### 레그 익스텐션 (D3/A) 40kg",
    "10 / 10 / 10",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)",
    "",
    "### 레그 컬 (D3/A) 40kg",
    "10 / 10 / 10",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)",
    "",
    "### 몬스터 글루트 (D3/B) 40kg",
    "15 / 15 / 15",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "",
    "### 힙 어덕션 (D3/B) 40kg",
    "15 / 15 / 15",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "",
    "### 크런치 (D3/core) 40kg",
    "10 / 10 / 10",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "",
    "### 데드버그 (D3/core) 40kg",
    "10 / 10",
    "간격: 0:00",
    "보상작용: 없음",
    "",
    "### 레터럴 레이즈 (D1/B) 5kg (추가 — 계획 외)",
    "12 / 12",
    "간격: 0:00",
    "보상작용: 없음"
  ],
  [
    "## 2026-11-06 (금) — Day 4 피지크 보완  [시각, 90분]",
    "수행 순서: 뉴트럴 랫풀 → 인클라인 프레스",
    "",
    "### 뉴트럴 랫풀 (D4/B) 40kg",
    "10 / 10 / 10",
    "간격: 0:00 / 0:00",
    "보상작용: 없음",
    "",
    "### 인클라인 프레스 (D4/B) 40kg",
    "10 / 10 / 10",
    "간격: 0:00 / 0:00",
    "보상작용: 없음"
  ]
]

const NN_KEYS_BEFORE = [
  {
    "recordKey": "pec-deck-fly@d1",
    "exerciseId": "pec-deck-fly",
    "dayId": "d1",
    "known": true,
    "group": "B",
    "sessionCount": 1
  },
  {
    "recordKey": "flat-chest-press@d1",
    "exerciseId": "flat-chest-press",
    "dayId": "d1",
    "known": true,
    "group": "A",
    "sessionCount": 1
  },
  {
    "recordKey": "shoulder-press@d1",
    "exerciseId": "shoulder-press",
    "dayId": "d1",
    "known": true,
    "group": "A",
    "sessionCount": 1
  },
  {
    "recordKey": "lateral-raise@d1",
    "exerciseId": "lateral-raise",
    "dayId": "d1",
    "known": true,
    "group": "B",
    "sessionCount": 2
  },
  {
    "recordKey": "rear-delt-fly@d1",
    "exerciseId": "rear-delt-fly",
    "dayId": "d1",
    "known": true,
    "group": "B",
    "sessionCount": 1
  },
  {
    "recordKey": "pushdown@d1",
    "exerciseId": "pushdown",
    "dayId": "d1",
    "known": true,
    "group": "B",
    "sessionCount": 1
  },
  {
    "recordKey": "lat-pulldown@d2",
    "exerciseId": "lat-pulldown",
    "dayId": "d2",
    "known": true,
    "group": "A",
    "sessionCount": 1
  },
  {
    "recordKey": "seated-cable-row@d2",
    "exerciseId": "seated-cable-row",
    "dayId": "d2",
    "known": true,
    "group": "A",
    "sessionCount": 1
  },
  {
    "recordKey": "rear-delt-fly@d2",
    "exerciseId": "rear-delt-fly",
    "dayId": "d2",
    "known": true,
    "group": "B",
    "sessionCount": 1
  },
  {
    "recordKey": "leg-extension@d3",
    "exerciseId": "leg-extension",
    "dayId": "d3",
    "known": true,
    "group": "A",
    "sessionCount": 1
  },
  {
    "recordKey": "leg-curl@d3",
    "exerciseId": "leg-curl",
    "dayId": "d3",
    "known": true,
    "group": "A",
    "sessionCount": 1
  },
  {
    "recordKey": "monster-glute@d3",
    "exerciseId": "monster-glute",
    "dayId": "d3",
    "known": true,
    "group": "B",
    "sessionCount": 1
  },
  {
    "recordKey": "hip-adduction@d3",
    "exerciseId": "hip-adduction",
    "dayId": "d3",
    "known": true,
    "group": "B",
    "sessionCount": 1
  },
  {
    "recordKey": "crunch@d3",
    "exerciseId": "crunch",
    "dayId": "d3",
    "known": true,
    "group": "core",
    "sessionCount": 1
  },
  {
    "recordKey": "dead-bug@d3",
    "exerciseId": "dead-bug",
    "dayId": "d3",
    "known": true,
    "group": "core",
    "sessionCount": 1
  },
  {
    "recordKey": "neutral-lat-pulldown@d4",
    "exerciseId": "neutral-lat-pulldown",
    "dayId": "d4",
    "known": true,
    "group": "B",
    "sessionCount": 1
  },
  {
    "recordKey": "incline-chest-press@d4",
    "exerciseId": "incline-chest-press",
    "dayId": "d4",
    "known": true,
    "group": "B",
    "sessionCount": 1
  },
  {
    "recordKey": "smith-incline-press@d1",
    "exerciseId": "smith-incline-press",
    "dayId": "d1",
    "known": false,
    "group": null,
    "sessionCount": 1
  }
]

describe("NN0 골든 — v1.15 출력 고정", () => {
  it("NN0 weeklyVolume이 v1.15와 같다 (대체·얹기·하한 모드·부분 수행 포함)", () => {
    expect(nnOutputs(NN_ROUTINE).week).toEqual(NN_WEEK_BEFORE)
  })

  it("NN0 suggestNextDay의 dayId·rule·reason·scores가 v1.15와 같다", () => {
    expect(nnOutputs(NN_ROUTINE).suggest).toEqual(NN_SUGGEST_BEFORE)
  })

  it("NN0 muscleBars가 v1.15와 같다", () => {
    expect(nnOutputs(NN_ROUTINE).bars).toEqual(NN_BARS_BEFORE)
  })

  it("NN0 세션별 sessionToMarkdown 줄 배열이 v1.15와 같다", () => {
    expect(nnOutputs(NN_ROUTINE).exportLines).toEqual(NN_EXPORT_BEFORE)
  })

  it("NN0 allRecordKeys가 v1.15와 같다", () => {
    expect(nnOutputs(NN_ROUTINE).keys).toEqual(NN_KEYS_BEFORE)
  })
})

// ─── NN1 ───────────────────────────────────────────────────────
const nn1Used = usedKeys(NN_SESSIONS)
const NN1_EMPTY: UsedKeys = { dayIds: new Set(), recordKeys: new Set() }
const nn1Fin = (mutate: (draft: RoutineTemplate) => void, used: UsedKeys = nn1Used, saved: RoutineTemplate = NN_ROUTINE) => {
  const draft = toDraft(saved)
  mutate(draft)
  return finalizeRoutine(draft, saved, used)
}
const nn1Day = (r: RoutineTemplate, id: string) => [...r.days, ...r.fallbackDays].find((d) => d.id === id)
// 소스 스캔은 import.meta.glob(?raw)로 읽는다 (node:fs 타입이 빌드에 없다 — dietBackup.test.ts와 같은 방식)
const NN1_SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>
const nn1Src = (path: string) => stripComments(NN1_SOURCES["/" + path] ?? "")
const nn1Export = (s: Session, r: RoutineTemplate) =>
  sessionToMarkdown(s, r, NN_CATALOG, 0)
    .replace(/\[\d\d:\d\d–\d\d:\d\d, /g, "[시각, ")
    .split("\n")

describe("NN1 finalizeRoutine·보관·시드·쓰기", () => {
  it("NN1 아무것도 안 고친 번들 루틴은 finalizeRoutine(toDraft(r), r, 빈 used)가 r과 같다 (항등)", () => {
    const out = finalizeRoutine(toDraft(NN_ROUTINE), NN_ROUTINE, NN1_EMPTY)
    expect(out).toEqual(NN_ROUTINE)
    expect("retiredDays" in out).toBe(false)
    for (const t of Object.values(out.muscleTargets)) expect("auto" in t).toBe(false)
  })

  it("NN1 배열 순서 ≠ plannedOrder인 루틴도 toDraft가 plannedOrder로 정렬해 세션·저장 결과가 같다", () => {
    const r = structuredClone(NN_ROUTINE)
    r.days[0].exercises.reverse()
    const ids = (d: RoutineDay) => d.exercises.map((e) => e.exerciseId)
    expect(ids(toDraft(r).days[0])).toEqual(ids(NN_ROUTINE.days[0]))
    expect(finalizeRoutine(toDraft(r), r, NN1_EMPTY).days[0]).toEqual(NN_ROUTINE.days[0])
    const build = (routine: RoutineTemplate) =>
      buildSession({ routine, day: routine.days[0], mode: "normal", sessions: [], phase: 0, today: NN_TODAY, now: NN_NOW })
        .session.entries.map((e) => e.recordKey)
    expect(build(r)).toEqual(build(NN_ROUTINE))
  })

  it("NN1 plannedOrder가 1·2·4처럼 빈 루틴은 저장하면 1·2·3이고 종목 순서는 같다", () => {
    const r = structuredClone(NN_ROUTINE)
    r.days[2].exercises.forEach((e, i) => {
      e.plannedOrder = i < 2 ? i + 1 : i + 2
    })
    const out = finalizeRoutine(toDraft(r), r, NN1_EMPTY)
    expect(out.days[2].exercises.map((e) => e.plannedOrder)).toEqual([1, 2, 3, 4, 5, 6])
    expect(out.days[2].exercises.map((e) => e.exerciseId)).toEqual(NN_ROUTINE.days[2].exercises.map((e) => e.exerciseId))
  })

  it("NN1 forkRoutine 복사본을 넣어도 골든 다섯이 같다 (복사본으로 바꿔도 판정 불변)", () => {
    const fork = forkRoutine(NN_ROUTINE, "user-x", NN_NOW.toISOString())
    const out = nnOutputs(fork)
    expect(out.week).toEqual(NN_WEEK_BEFORE)
    expect(out.suggest).toEqual(NN_SUGGEST_BEFORE)
    expect(out.bars).toEqual(NN_BARS_BEFORE)
    expect(out.exportLines).toEqual(NN_EXPORT_BEFORE)
    expect(out.keys).toEqual(NN_KEYS_BEFORE)
    expect(fork.name).toBe(NN_ROUTINE.name + " (수정)")
  })

  it("NN1 uniqueId는 taken에 있으면 다시 만든다 (user-bbbb)", () => {
    const seq = ["aaaa", "bbbb"]
    let i = 0
    expect(uniqueId("user-", new Set(["user-aaaa"]), () => seq[i++])).toBe("user-bbbb")
    expect(uniqueId("user-", new Set(), () => "zzzz")).toBe("user-zzzz")
  })

  describe("종목을 뺀다 (pec-deck-fly)", () => {
    const edit = (used: UsedKeys) =>
      nn1Fin((d) => {
        d.days[0].exercises = d.days[0].exercises.filter((e) => e.exerciseId !== "pec-deck-fly")
      }, used)
    const usedPec: UsedKeys = { dayIds: new Set(["d1"]), recordKeys: new Set(["pec-deck-fly@d1"]) }

    it("NN1 기록이 있으면 d1·fallback-push의 retiredExercises에 보관하고 합계·순서를 다시 만든다", () => {
      const out = edit(usedPec)
      const d1 = nn1Day(out, "d1")!
      expect(d1.retiredExercises?.map((e) => e.exerciseId)).toEqual(["pec-deck-fly"])
      expect(d1.exercises.some((e) => e.exerciseId === "pec-deck-fly")).toBe(false)
      expect(d1.muscleSets["상부가슴"]).toBe(4)
      expect(d1.exercises.map((e) => e.plannedOrder)).toEqual([1, 2, 3, 4, 5, 6])
      const fb = nn1Day(out, "fallback-push")!
      expect(fb.exercises).toHaveLength(2)
      expect(fb.muscleSets["상부가슴"]).toBe(3)
      expect(fb.retiredExercises?.map((e) => e.exerciseId)).toEqual(["pec-deck-fly"])
      expect(validateRoutine(out, BUNDLED_EXERCISES)).toEqual([])
    })

    it("NN1 같은 편집 뒤에도 weeklyVolume·sessionToMarkdown이 골든과 같다 (과거 판정 불변)", () => {
      const out = nnOutputs(edit(nn1Used))
      expect(out.week).toEqual(NN_WEEK_BEFORE)
      expect(out.exportLines).toEqual(NN_EXPORT_BEFORE)
    })

    it("NN1 같은 편집 뒤 새 세션에는 그 종목이 없고 allRecordKeys의 그 라인은 known:false·group B", () => {
      const out = edit(nn1Used)
      const built = buildSession({ routine: out, day: out.days[0], mode: "normal", sessions: [], phase: 0, today: NN_TODAY, now: NN_NOW })
      expect(built.session.entries.some((e) => e.recordKey === "pec-deck-fly@d1")).toBe(false)
      const line = allRecordKeys(NN_SESSIONS, out).find((k) => k.recordKey === "pec-deck-fly@d1")
      expect(line?.known).toBe(false)
      expect(line?.group).toBe("B")
    })

    it("NN1 used에 그 키가 없으면 retiredExercises 키가 없다 (버렸다)", () => {
      const out = edit(NN1_EMPTY)
      expect("retiredExercises" in nn1Day(out, "d1")!).toBe(false)
      expect("retiredExercises" in nn1Day(out, "fallback-push")!).toBe(false)
    })

    it("NN1 뺀 종목을 다시 넣으면 exercises에 있고 retiredExercises에는 없다", () => {
      const removed = edit(usedPec)
      const draft = toDraft(removed)
      const pec = nn1Day(removed, "d1")!.retiredExercises![0]
      draft.days[0].exercises.push({ ...pec })
      const back = finalizeRoutine(draft, removed, usedPec)
      const d1 = nn1Day(back, "d1")!
      expect(d1.exercises.some((e) => e.exerciseId === "pec-deck-fly")).toBe(true)
      expect("retiredExercises" in d1).toBe(false)
      expect(validateRoutine(back, BUNDLED_EXERCISES)).toEqual([])
    })
  })

  describe("Day를 지운다", () => {
    const del = (id: string, used: UsedKeys = nn1Used) =>
      nn1Fin((d) => {
        d.days = d.days.filter((x) => x.id !== id)
      }, used)

    it("NN1 d4를 지우면 retiredDays에 보관되고 제목·내보내기·판정은 그대로다", () => {
      const out = del("d4")
      expect(out.retiredDays?.map((d) => d.id)).toEqual(["d4"])
      const scores = suggestNextDay({ sessions: NN_SESSIONS, routine: out, today: NN_TODAY, now: NN_NOW }).scores
      expect(scores.some((s) => s.dayId === "d4")).toBe(false)
      expect(summarize(NN_SESSIONS[3], out).dayName).toBe("Day 4 — 피지크 보완")
      expect(nn1Export(NN_SESSIONS[3], out)).toEqual(NN_EXPORT_BEFORE[3])
      expect(Object.keys(out.muscleTargets).sort()).toEqual(Object.keys(NN_ROUTINE.muscleTargets).sort())
    })

    it("NN1 보관한 d4는 findDay에는 없고 findDayForRecord에만 있다 (displayDay·planDayChange·known:false)", () => {
      const out = del("d4")
      expect(findDay(out, "d4")).toBeUndefined()
      expect(findDayForRecord(out, "d4")?.id).toBe("d4")
      const suggested = out.days[0]
      expect(displayDay(out, "d4", suggested)).toBe(suggested)
      expect(planDayChange(NN_SESSIONS[0], out, "d4")).toBeNull()
      const d4Lines = allRecordKeys(NN_SESSIONS, out).filter((k) => k.dayId === "d4")
      expect(d4Lines.length).toBeGreaterThan(0)
      for (const k of d4Lines) {
        expect(k.known).toBe(false)
        expect(k.group).toBe("B")
      }
    })

    it("NN1 d3을 지우면 하체 가드가 꺼지고 하체 목표가 사라지며 검증을 통과한다", () => {
      const out = del("d3")
      expect(out.rules.lowerBodyDayId).toBe("d1")
      expect(out.rules.lowerBodyMaxGapDays).toBe(NO_GUARD_GAP_DAYS)
      for (const m of ["하체", "내전근", "코어"]) expect(m in out.muscleTargets).toBe(false)
      expect(validateRoutine(out, BUNDLED_EXERCISES)).toEqual([])
      const sessions = [
        nnSession("g-1", "2026-10-25", "d1", nnEntries(nnDay("d1"), "2026-10-25T18:00:00.000Z")),
        nnSession("g-2", "2026-11-05", "d2", nnEntries(nnDay("d2"), "2026-11-05T18:00:00.000Z")),
      ]
      expect(suggestNextDay({ sessions, routine: out, today: NN_TODAY, now: NN_NOW }).rule).not.toBe("lowerBodyGuard")
    })

    it("NN1 d2를 지우면(11-03 세션이 fallback-pull) d2와 fallback-pull이 보관되고 recordDayId는 그대로다", () => {
      const out = del("d2")
      expect(out.retiredDays?.map((d) => d.id).sort()).toEqual(["d2", "fallback-pull"])
      expect(out.fallbackDays.some((d) => d.id === "fallback-pull")).toBe(false)
      expect(findDayForRecord(out, "fallback-pull")?.recordDayId).toBe("d2")
      expect(summarize(NN_SESSIONS[1], out).dayName).toBe("Pull 축소")
      expect(nn1Export(NN_SESSIONS[1], out)).toEqual(NN_EXPORT_BEFORE[1])
      expect(validateRoutine(out, BUNDLED_EXERCISES)).toEqual([])
    })

    it("NN1 d1을 지우면(fallback-push 세션 없음) d1은 보관되고 fallback-push는 버린다", () => {
      const out = del("d1")
      expect(out.retiredDays?.map((d) => d.id)).toEqual(["d1"])
      expect(out.fallbackDays.some((d) => d.id === "fallback-push")).toBe(false)
    })
  })

  it("NN1 d2 lat-pulldown 반복수를 6~10으로 바꾸면 fallback-pull의 같은 종목도 6~10이다", () => {
    const out = nn1Fin((d) => {
      const ex = d.days[1].exercises.find((e) => e.exerciseId === "lat-pulldown")!
      ex.repMin = 6
      ex.repMax = 10
    })
    const fb = nn1Day(out, "fallback-pull")!.exercises.find((e) => e.exerciseId === "lat-pulldown")!
    expect([fb.repMin, fb.repMax]).toEqual([6, 10])
    expect(validateRoutine(out, BUNDLED_EXERCISES)).toEqual([])
  })

  it("NN1 resolveMuscleTargets: 새 부위는 auto, 기존 값은 그대로, auto로 바꾸면 플랜 합계를 따른다", () => {
    const base = toDraft(NN_ROUTINE)
    const mk = (muscle: string, sets: number, order: number) => ({ ...base.days[0].exercises[0], exerciseId: `nn-${muscle}-${order}`, muscle, sets, plannedOrder: order })
    base.days[0].exercises.push(mk("둔근", 3, 8))
    base.days[1].exercises.push(mk("둔근", 2, 7))
    const out = finalizeRoutine(base, NN_ROUTINE, NN1_EMPTY)
    expect(out.muscleTargets["둔근"]).toEqual({ target: 5, weight: 0.5, auto: true })
    const more = toDraft(NN_ROUTINE)
    more.days[0].exercises[4].sets += 2
    const grown = finalizeRoutine(more, NN_ROUTINE, NN1_EMPTY)
    expect(grown.muscleTargets["측면어깨"].target).toBe(11)
    const auto = toDraft(NN_ROUTINE)
    auto.muscleTargets["측면어깨"] = { ...auto.muscleTargets["측면어깨"], auto: true }
    expect(resolveMuscleTargets(auto)["측면어깨"].target).toBe(13)
  })

  it("NN1 blankRoutine에 Day·종목 하나를 넣어 finalizeRoutine하면 검증을 통과하고 하체 가드는 꺼진다", () => {
    const draft = blankRoutine("user-new", NN_NOW.toISOString(), NN_ROUTINE.rules)
    draft.days.push({ ...structuredClone(NN_ROUTINE.days[0]), id: "d1", exercises: [{ ...NN_ROUTINE.days[0].exercises[0] }] })
    const out = finalizeRoutine(draft, undefined, NN1_EMPTY)
    expect(validateRoutine(out, BUNDLED_EXERCISES)).toEqual([])
    expect(out.rules.lowerBodyMaxGapDays).toBe(NO_GUARD_GAP_DAYS)
  })

  it("NN1 nextDayId는 비어 있는 가장 작은 dN을 낸다", () => {
    expect(nextDayId(new Set(["d1", "d2", "d4", "fallback-push"]))).toBe("d3")
    expect(nextDayId(new Set(["d1", "d2", "d3", "d4"]))).toBe("d5")
  })

  it("NN1 usedKeys는 대체 키·얹은 종목의 Day·진행 중 세션까지 센다", () => {
    const u = usedKeys(NN_SESSIONS)
    expect(u.recordKeys.has("incline-chest-press@d1")).toBe(true)
    expect(u.recordKeys.has("smith-incline-press@d1")).toBe(true)
    expect(u.dayIds.has("d1")).toBe(true)
    const open = { ...nnSession("open", "2026-11-07", "fallback-push", []), endedAt: undefined }
    expect(usedKeys([open]).dayIds.has("fallback-push")).toBe(true)
  })

  it("NN1 shouldResetActiveRoutine: 비었거나 번들이거나 활성 행이 없으면 true, 사용자 루틴이 있으면 false", () => {
    const b = "physique-v2.4"
    expect(shouldResetActiveRoutine(null, b, false)).toBe(true)
    expect(shouldResetActiveRoutine(b, b, true)).toBe(true)
    expect(shouldResetActiveRoutine("user-x", b, false)).toBe(true)
    expect(shouldResetActiveRoutine("user-x", b, true)).toBe(false)
  })

  it("NN1 validateRoutine: Day 없음(8)·Day id 중복(9)·보관 종목이 현재 종목과 겹침(10)", () => {
    expect(validateRoutine({ ...NN_ROUTINE, days: [] }, BUNDLED_EXERCISES)).toContain("정규 Day가 없음")
    const dup = { ...NN_ROUTINE, retiredDays: [structuredClone(NN_ROUTINE.days[0])] }
    expect(validateRoutine(dup, BUNDLED_EXERCISES)).toContain('Day id 중복 "d1"')
    const overlap = structuredClone(NN_ROUTINE)
    overlap.days[0].retiredExercises = [structuredClone(overlap.days[0].exercises[0])]
    expect(validateRoutine(overlap, BUNDLED_EXERCISES).some((p) => p.includes("보관 종목") && p.includes("현재 종목과 겹침"))).toBe(true)
  })

  it("NN1 validateDraft는 번들 루틴 그대로면 빈 배열이다", () => {
    expect(validateDraft(toDraft(NN_ROUTINE), BUNDLED_EXERCISES)).toEqual([])
  })

  describe("스캔", () => {
    const srcFiles = (_dir: string): string[] =>
      Object.keys(NN1_SOURCES)
        .filter((p) => !/\.test\.tsx?$/.test(p))
        .map((p) => p.slice(1))
    const norm = (ps: string[]) => [...ps].sort()

    it("NN1 retiredDays·retiredExercises는 types·routineEdit·derive·validateRoutine에서만 나온다", () => {
      const hits = srcFiles("src").filter((p) => /retiredDays|retiredExercises/.test(nn1Src(p)))
      expect(norm(hits)).toEqual(["src/db/validateRoutine.ts", "src/lib/derive.ts", "src/lib/routineEdit.ts", "src/types.ts"])
    })

    it("NN1 derive.ts는 findRoutineExercise를 export하지 않는다", () => {
      expect(nn1Src("src/lib/derive.ts")).not.toMatch(/export function findRoutineExercise/)
    })

    it("NN1 exportMarkdown.ts는 routine.fallbackDays를 직접 훑지 않고, dayChoice·dayChange는 findDayForRecord를 쓰지 않는다", () => {
      expect(nn1Src("src/lib/exportMarkdown.ts")).not.toContain("routine.fallbackDays")
      expect(nn1Src("src/lib/exportMarkdown.ts")).toContain("findDayForRecord")
      expect(nn1Src("src/lib/dayChoice.ts")).not.toContain("findDayForRecord")
      expect(nn1Src("src/lib/dayChange.ts")).not.toContain("findDayForRecord")
    })

    it("NN1 routineStore.ts는 endedAt을 직접 세지 않고 getOpenSession(을 부르며, 진행 중 문구는 routineEdit.ts에만 있다", () => {
      const store = nn1Src("src/lib/routineStore.ts")
      expect(store).not.toContain("endedAt")
      expect(store).toContain("getOpenSession(")
      const hits = srcFiles("src").filter((p) => nn1Src(p).includes("진행 중인 세션을 마치거나"))
      expect(norm(hits)).toEqual(["src/lib/routineEdit.ts"])
    })

    it("NN1 routineStore.ts의 export async function 개수와 requestSync() 호출 개수가 같고, routines.put·delete는 정해진 파일에만 있다", () => {
      const store = nn1Src("src/lib/routineStore.ts")
      expect((store.match(/export async function/g) ?? []).length).toBe((store.match(/requestSync\(\)/g) ?? []).length)
      const hits = srcFiles("src").filter((p) => /db\.routines\.(put|delete)/.test(nn1Src(p)))
      expect(norm(hits)).toEqual(["src/components/RoutineIoPanel.tsx", "src/db/seed.ts", "src/lib/routineStore.ts"])
    })

    it("NN1 seed.ts의 activeRoutineId: BUNDLED_ROUTINE.id는 shouldResetActiveRoutine 조건 안에만 있다", () => {
      const seed = nn1Src("src/db/seed.ts")
      const at = seed.indexOf("activeRoutineId: BUNDLED_ROUTINE.id")
      expect(at).toBeGreaterThan(0)
      expect(seed.slice(seed.lastIndexOf("if (", at), at)).toContain("shouldResetActiveRoutine")
      expect(seed.split("activeRoutineId: BUNDLED_ROUTINE.id")).toHaveLength(2)
    })
  })
})
