import { describe, expect, it } from 'vitest'
import {
  ASSIST_LAT_FACTOR,
  assistWeightFor,
  calibratedWeight,
  previewSubstitutes,
  roundToHalf,
  startWeightFor,
  weightForReps,
} from './substitute'
import { e1rm, muscleOfEntry, routineExerciseOfEntry, weeklyVolume } from './derive'
import { exportMarkdown } from './exportMarkdown'
import { progressionSuggestions } from './progression'
import { buildScaleMap, formatProgression, nextWeightForProgression } from './weightScale'
import { applySubstitute } from './sessionOps'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import { makeRecordKey, parseRecordKey } from '../types'
import type { Exercise, Session } from '../types'

const catalog = new Map<string, Exercise>(
  (EXERCISES as Exercise[]).map((e) => [e.id, e]),
)

const ORIGIN = 'incline-chest-press'
const ORIGIN_KEY = makeRecordKey(ORIGIN, 'd1')
const SUB = 'smith-incline-press'
const SUB_KEY = makeRecordKey(SUB, 'd1')

const plannedOrigin = ROUTINE.days
  .find((d) => d.id === 'd1')!
  .exercises.find((e) => e.exerciseId === ORIGIN)!

/** 원 종목 entry를 대체 종목으로 바꾼 완료 세션 */
function sessionWithSubstitute(args: { weight?: number; fullReps?: boolean } = {}): Session {
  const base = completedSession({ dayId: 'd1', date: '2026-08-04', ...args })
  return {
    ...base,
    entries: base.entries.map((e) =>
      e.recordKey === ORIGIN_KEY ? { ...e, recordKey: SUB_KEY, substituteFor: ORIGIN_KEY } : e,
    ),
  }
}

// ─── 검증된 부분: Epley 왕복 ─────────────────────────────

describe('Epley 왕복', () => {
  it('같은 반복수로 되돌리면 원래 무게가 나온다', () => {
    for (const [w, r] of [
      [40, 10],
      [22.5, 6],
      [100, 3],
    ]) {
      expect(weightForReps(e1rm(w, r), r)).toBeCloseTo(w, 10)
    }
  })

  it('반복수가 늘면 무게가 줄어든다 (rep max continuum 방향)', () => {
    const est = e1rm(40, 10)
    expect(weightForReps(est, 15)).toBeLessThan(weightForReps(est, 5))
  })
})

describe('roundToHalf', () => {
  it('0.5kg 단위로 맞춘다', () => {
    expect(roundToHalf(6.4)).toBe(6.5)
    expect(roundToHalf(6.2)).toBe(6)
    expect(roundToHalf(27.75)).toBe(28)
  })
})

// ─── 휴리스틱 부분: 시작 무게 ────────────────────────────

describe('startWeightFor', () => {
  const originalBest = { weight: 40, reps: 10 }

  it('원 종목이 이미 목표 반복수면 시작 무게 = 무게 × 계수', () => {
    // repMax에서의 무게로 되돌리는 항이 항등식이 되므로 계수만 남는다
    expect(startWeightFor({ originalBest, originalRepMax: 10, startFactor: 0.7 })).toBe(28)
    expect(startWeightFor({ originalBest, originalRepMax: 10, startFactor: 0.16 })).toBe(6.5)
  })

  it('원 종목 기록의 반복수에 따라 목표 반복수 기준으로 정규화된다', () => {
    // 40kg × 12회를 한 사람이 40kg × 6회를 한 사람보다 강하다.
    // 목표가 10회일 때 전자는 40kg보다 무겁게(42), 후자는 가볍게(36) 시작해야 한다.
    const at6 = startWeightFor({ originalBest: { weight: 40, reps: 6 }, originalRepMax: 10, startFactor: 1 })
    const at10 = startWeightFor({ originalBest: { weight: 40, reps: 10 }, originalRepMax: 10, startFactor: 1 })
    const at12 = startWeightFor({ originalBest: { weight: 40, reps: 12 }, originalRepMax: 10, startFactor: 1 })
    expect(at6).toBe(36)
    expect(at10).toBe(40) // 목표 반복수와 같으면 항등
    expect(at12).toBe(42)
  })
})

describe('assistWeightFor — 역방향', () => {
  it('체중에서 랫풀 무게×0.9를 뺀다', () => {
    expect(assistWeightFor({ bodyWeightKg: 72, latPulldownWeight: 50 })).toBe(
      roundToHalf(72 - 50 * ASSIST_LAT_FACTOR),
    )
    expect(assistWeightFor({ bodyWeightKg: 72, latPulldownWeight: 50 })).toBe(27)
  })

  it('랫풀 무게가 체중을 넘으면 0 — 보조 없이 가능하다는 신호', () => {
    expect(assistWeightFor({ bodyWeightKg: 72, latPulldownWeight: 90 })).toBe(0)
  })

  it('랫풀 무게가 클수록 보조가 줄어든다 (방향이 반대)', () => {
    const light = assistWeightFor({ bodyWeightKg: 72, latPulldownWeight: 30 })
    const heavy = assistWeightFor({ bodyWeightKg: 72, latPulldownWeight: 60 })
    expect(heavy).toBeLessThan(light)
  })
})

describe('calibratedWeight — 실측 기반', () => {
  it('첫 세트 실측에서 목표 반복수 무게를 역산한다', () => {
    // 30kg × 12 → e1RM 42 → 10회 무게 31.5 → RIR 여유 0.95 → 29.925 → 30
    expect(calibratedWeight({ firstSetWeight: 30, firstSetReps: 12, targetReps: 10 })).toBe(30)
  })

  it('첫 세트가 쉬웠으면(반복수 많음) 무게를 올린다', () => {
    const easy = calibratedWeight({ firstSetWeight: 30, firstSetReps: 18, targetReps: 10 })
    const hard = calibratedWeight({ firstSetWeight: 30, firstSetReps: 8, targetReps: 10 })
    expect(easy).toBeGreaterThan(hard)
  })

  it('계수(startFactor)가 개입하지 않는다 — 같은 실측이면 어느 종목이든 같은 답', () => {
    const a = calibratedWeight({ firstSetWeight: 25, firstSetReps: 10, targetReps: 10 })
    expect(a).toBe(roundToHalf(25 * 0.95))
  })
})

// ─── 후보 목록 ───────────────────────────────────────────

describe('previewSubstitutes', () => {
  const options = catalog.get(ORIGIN)!.substitutes!

  it('원 종목 기록으로 후보별 시작 무게를 낸다', () => {
    const previews = previewSubstitutes({
      originalRecordKey: ORIGIN_KEY,
      originalBest: { weight: 40, reps: 10 },
      originalRepMax: 10,
      options,
      catalog,
      lastRecordOf: () => undefined,
    })
    expect(previews).toHaveLength(2)
    expect(previews[0]).toMatchObject({ recordKey: SUB_KEY, startWeight: 28 })
    // 덤벨은 한쪽 무게로 훨씬 작게 나온다
    expect(previews[1].startWeight).toBe(6.5)
    expect(previews[1].option.perSide).toBe(true)
  })

  it('대체 종목에 기록이 있으면 환산하지 않고 그 무게를 쓴다', () => {
    const previews = previewSubstitutes({
      originalRecordKey: ORIGIN_KEY,
      originalBest: { weight: 40, reps: 10 },
      originalRepMax: 10,
      options,
      catalog,
      lastRecordOf: (key) => (key === SUB_KEY ? { weight: 45, reps: 8 } : undefined),
    })
    const smith = previews.find((p) => p.recordKey === SUB_KEY)!
    // 추정(28)이 아니라 실제 기록(45)
    expect(smith.startWeight).toBe(45)
    expect(smith.lastRecord).toEqual({ weight: 45, reps: 8 })
  })

  it('원 종목 기록이 없으면 무게를 추정하지 않고 막는다', () => {
    const previews = previewSubstitutes({
      originalRecordKey: ORIGIN_KEY,
      originalBest: undefined,
      originalRepMax: 10,
      options,
      catalog,
      lastRecordOf: () => undefined,
    })
    expect(previews.every((p) => p.blocked === 'no-history')).toBe(true)
    expect(previews.every((p) => p.startWeight === undefined)).toBe(true)
  })

  it('어시스티드는 체중이 없으면 막는다', () => {
    const latKey = makeRecordKey('lat-pulldown', 'd2')
    const args = {
      originalRecordKey: latKey,
      originalBest: { weight: 50, reps: 10 },
      originalRepMax: 10,
      options: catalog.get('lat-pulldown')!.substitutes!,
      catalog,
      lastRecordOf: () => undefined,
    }
    expect(previewSubstitutes(args)[0].blocked).toBe('no-bodyweight')
    const withWeight = previewSubstitutes({ ...args, bodyWeightKg: 72 })
    expect(withWeight[0].startWeight).toBe(27)
    expect(withWeight[0].recordKey).toBe(makeRecordKey('assisted-pullup', 'd2'))
  })

  it('카탈로그에 없는 후보는 표시하지 않는다', () => {
    const previews = previewSubstitutes({
      originalRecordKey: ORIGIN_KEY,
      originalBest: { weight: 40, reps: 10 },
      originalRepMax: 10,
      options: [{ exerciseId: 'does-not-exist', startFactor: 0.5 }],
      catalog,
      lastRecordOf: () => undefined,
    })
    expect(previews).toEqual([])
  })
})

// ─── 기록 라인 규칙 ──────────────────────────────────────

describe('applySubstitute', () => {
  const open = { ...completedSession({ dayId: 'd1', date: '2026-08-04' }), endedAt: undefined }
  const fresh: Session = {
    ...open,
    entries: open.entries.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({ ...s, done: false, doneAt: undefined })),
      performedOrder: null,
    })),
  }

  it('recordKey를 바꾸고 원 라인을 substituteFor에 남긴다', () => {
    const next = applySubstitute(fresh, ORIGIN_KEY, {
      recordKey: SUB_KEY,
      setCount: 4,
      weight: 28,
      reps: 6,
    })
    const entry = next.entries.find((e) => e.recordKey === SUB_KEY)!
    expect(entry.substituteFor).toBe(ORIGIN_KEY)
    expect(entry.sets).toHaveLength(4)
    expect(entry.sets.every((s) => s.weight === 28 && !s.done)).toBe(true)
    // 원 라인은 사라진다 — "대체한 날은 그걸로 끝" (루틴 문서 규칙)
    expect(next.entries.some((e) => e.recordKey === ORIGIN_KEY)).toBe(false)
  })

  it('이미 체크된 세트가 있으면 거부한다 (기록 유실 방지)', () => {
    const performed: Session = {
      ...fresh,
      entries: fresh.entries.map((e) =>
        e.recordKey === ORIGIN_KEY
          ? { ...e, sets: e.sets.map((s, i) => (i === 0 ? { ...s, done: true } : s)) }
          : e,
      ),
    }
    const next = applySubstitute(performed, ORIGIN_KEY, {
      recordKey: SUB_KEY,
      setCount: 4,
      weight: 28,
      reps: 6,
    })
    expect(next).toBe(performed)
  })

  it('이미 있는 종목으로는 교체하지 않는다 (recordKey 중복 금지)', () => {
    const existing = parseRecordKey(fresh.entries[1].recordKey).exerciseId
    const next = applySubstitute(fresh, ORIGIN_KEY, {
      recordKey: makeRecordKey(existing, 'd1'),
      setCount: 3,
      weight: 20,
      reps: 8,
    })
    expect(next).toBe(fresh)
  })

  it('감각·보상작용을 원 종목에서 물려받지 않는다', () => {
    const withNotes: Session = {
      ...fresh,
      entries: fresh.entries.map((e) =>
        e.recordKey === ORIGIN_KEY ? { ...e, sensoryScore: 3 as const, compensation: '승모 개입' } : e,
      ),
    }
    const entry = applySubstitute(withNotes, ORIGIN_KEY, {
      recordKey: SUB_KEY,
      setCount: 4,
      weight: 28,
      reps: 6,
    }).entries.find((e) => e.recordKey === SUB_KEY)!
    expect(entry.sensoryScore).toBeUndefined()
    expect(entry.compensation).toBe('없음')
  })
})

// ─── 분석 경로: 대체 세트가 사라지지 않아야 한다 ────────

describe('대체 수행의 분석 해석', () => {
  it('부위 집계가 원 종목의 부위로 들어간다', () => {
    // 이 규칙이 없으면 자리가 없어 기계를 바꾼 것이 "그 부위를 안 한 것"이 되고,
    // §4 볼륨 예산이 같은 부위를 또 배정한다
    const plain = weeklyVolume([completedSession({ dayId: 'd1', date: '2026-08-04' })], ROUTINE, '2026-08-04')
    const swapped = weeklyVolume([sessionWithSubstitute()], ROUTINE, '2026-08-04')
    expect(swapped.sets).toEqual(plain.sets)
    expect(swapped.exposures).toEqual(plain.exposures)

    const entry = sessionWithSubstitute().entries.find((e) => e.recordKey === SUB_KEY)!
    expect(muscleOfEntry(ROUTINE, entry)).toBe(plannedOrigin.muscle)
  })

  it('계획(그룹·세트·목표 반복수)은 원 종목을 따르고 exerciseId만 바뀐다', () => {
    const entry = sessionWithSubstitute().entries.find((e) => e.recordKey === SUB_KEY)!
    const resolved = routineExerciseOfEntry(ROUTINE, entry)!
    expect(resolved).toEqual({ ...plannedOrigin, exerciseId: SUB })
  })

  it('증량 판정이 원 종목의 repMax 기준으로 대체 라인에 적용된다', () => {
    const session = sessionWithSubstitute({ fullReps: true, weight: 40 })
    const found = progressionSuggestions(session, ROUTINE, 1, undefined, catalog)
    expect(found.find((p) => p.recordKey === SUB_KEY)).toMatchObject({ from: 40, to: 42.5 })
    // 원 종목 라인에는 아무것도 붙지 않는다 — 프리필·증량이 섞이지 않는다
    expect(found.some((p) => p.recordKey === ORIGIN_KEY)).toBe(false)
  })

  it('내보내기에 원 종목을 함께 적는다', () => {
    const md = exportMarkdown({
      sessions: [sessionWithSubstitute({ weight: 40 })],
      routine: ROUTINE,
      catalog,
      phase: 1,
      range: { from: '2026-08-01', to: '2026-08-31' },
    })
    expect(md).toContain('(대체: 인클라인 프레스 — 자리 없음)')
    // 그룹이 '?'로 빠지지 않는다 (원 종목 계획을 되짚으므로)
    expect(md).toMatch(/### 스미스 인클라인 \(D1\/A\)/)
  })
})

// ─── 어시스티드: 증량 방향이 반대 ───────────────────────

describe('어시스티드 머신의 증량 방향', () => {
  it('카탈로그에 inverseWeight가 표시돼 있다', () => {
    expect(catalog.get('assisted-pullup')?.inverseWeight).toBe(true)
    // 일반 종목은 표시가 없다
    expect(catalog.get(ORIGIN)?.inverseWeight).toBeUndefined()
  })

  it('보조 무게는 줄어드는 것이 진전이다', () => {
    expect(nextWeightForProgression(30, { step: 2.5, inverse: true })).toBe(27.5)
    expect(nextWeightForProgression(30, { step: 2.5 })).toBe(32.5)
  })

  it('보조가 0에 닿으면 "보조 없이 가능"으로 알린다', () => {
    expect(nextWeightForProgression(2.5, { step: 2.5, inverse: true })).toBeNull()
    expect(formatProgression(2.5, null, true)).toContain('보조 없이')
    expect(formatProgression(2.5, null, false)).toContain('스택 최대')
  })

  it('사다리에서도 아래 핀으로 간다', () => {
    const scale = { step: 2.5, ladder: [5, 10, 15, 20], inverse: true }
    expect(nextWeightForProgression(15, scale)).toBe(10)
    expect(nextWeightForProgression(5, scale)).toBeNull()
  })

  it('세션 전체 경로에서 어시스티드가 "+"로 제안되지 않는다', () => {
    // 랫풀을 어시스티드 풀업으로 대체하고 전 세트 상단을 채운 세션
    const base = completedSession({ dayId: 'd2', date: '2026-08-05', fullReps: true, weight: 30 })
    const latKey = makeRecordKey('lat-pulldown', 'd2')
    const assistKey = makeRecordKey('assisted-pullup', 'd2')
    const session: Session = {
      ...base,
      entries: base.entries.map((e) =>
        e.recordKey === latKey ? { ...e, recordKey: assistKey, substituteFor: latKey } : e,
      ),
    }
    const one = progressionSuggestions(
      session,
      ROUTINE,
      1,
      buildScaleMap([], ROUTINE.rules.weightIncrementKg),
      catalog,
    ).find((p) => p.recordKey === assistKey)
    expect(one).toBeDefined()
    expect(one!.inverse).toBe(true)
    expect(one!.to).toBe(27.5) // 32.5가 아니다 — 보조를 늘리면 더 쉬워진다
  })
})
