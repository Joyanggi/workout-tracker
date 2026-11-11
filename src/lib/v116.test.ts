import { describe, expect, it } from "vitest"
import { BUNDLED_EXERCISES, BUNDLED_ROUTINE } from "../db/seed"
import { muscleBars } from "./dashboard"
import { weeklyVolume } from "./derive"
import { sessionToMarkdown } from "./exportMarkdown"
import { allRecordKeys } from "./history"
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
    exportLines: NN_SESSIONS.map((s) => sessionToMarkdown(s, routine, NN_CATALOG, 0).split("\n")),
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
    "## 2026-11-02 (월) — Day 1 Push  [03:00–04:30, 90분]",
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
    "## 2026-11-03 (화) — Pull 축소  [03:00–04:30, 90분]",
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
    "## 2026-11-05 (목) — Day 3 하체 + 코어  [03:00–04:30, 90분]",
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
    "## 2026-11-06 (금) — Day 4 피지크 보완  [03:00–04:30, 90분]",
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
