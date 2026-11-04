import { describe, expect, it } from 'vitest'
import { buildSession } from './sessionFactory'
import {
  adjustedSetCount,
  entrySetPlan,
  modeAdjustFor,
  resolveSessionAdjust,
  sessionSetPlan,
  DELOAD_SET_PCT,
} from './setPlan'
import { applyAddExercise, applySubstitute } from './sessionOps'
import { applyDayChange } from './dayChange'
import { doneSets, workSetRows } from './derive'
import { stripComments } from './sourceScan'
import { makeRecordKey } from '../types'
import { exportMarkdown } from './exportMarkdown'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import type { Exercise, Phase, RoutineTemplate, Session, SessionMode } from '../types'

/**
 * v1.12 JJ — 복귀·디로드가 깎은 세트 수를 세션이 기억한다.
 * 이 파일의 JJ_BUILD_GOLDEN·JJ_EXPORT_NORMAL_BEFORE는 v1.11.2 코드(JJ 구현 전)로 만든 표이고
 * 이후 커밋에서 고치지 않는다.
 */

const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))
const PHASE: Phase = 1

// ─── 생성 불변 골든 (JJ1) ────────────────────────────────

const GOLDEN_HISTORY = (): Session[] => [
  completedSession({ dayId: 'd1', date: '2026-08-05', weight: 40, fullReps: true }),
  completedSession({ dayId: 'd1', date: '2026-07-29', weight: 37.5 }),
]

const GOLDEN_CASES: { name: string; mode: SessionMode; step?: number }[] = [
  { name: 'normal', mode: 'normal' },
  { name: 'deload', mode: 'deload' },
  { name: 'return1', mode: 'return', step: 0 },
  { name: 'return2', mode: 'return', step: 1 },
  { name: 'return3', mode: 'return', step: 2 },
  { name: 'returnNoStep', mode: 'return' },
]

/** 칸(행 수·무게·반복)만 문자열로 — 새 필드는 골든 밖이다 */
export function goldenRows(): Record<string, string[]> {
  const day = ROUTINE.days.find((d) => d.id === 'd1')!
  const out: Record<string, string[]> = {}
  for (const c of GOLDEN_CASES) {
    const { session } = buildSession({
      routine: ROUTINE,
      day,
      mode: c.mode,
      sessions: GOLDEN_HISTORY(),
      phase: PHASE,
      today: '2026-10-07',
      returnStep: c.step === undefined ? undefined : ROUTINE.rules.returnProtocol![c.step],
    })
    out[c.name] = session.entries.map(
      (e) => `${e.recordKey}: ${e.sets.map((s) => `${s.weight}x${s.reps}`).join(' ')}`,
    )
  }
  return out
}

// ─── normal 내보내기 골든 (JJ2) ──────────────────────────

export function normalExportFixtures(): Record<string, string> {
  const range = { from: '2026-08-01', to: '2026-08-31' }
  const render = (s: Session) =>
    exportMarkdown({ sessions: [s], routine: ROUTINE, catalog, phase: PHASE, range })
      // 시각은 실행 환경 시간대를 따르므로 괄호 안만 고정한다 (소요 분은 유지)
      .replace(/\[\d\d:\d\d–\d\d:\d\d, /g, '[시각, ')

  const allDone = completedSession({ dayId: 'd1', date: '2026-08-12', weight: 40, fullReps: true })

  const oneUnchecked = completedSession({ dayId: 'd1', date: '2026-08-12', weight: 40 })
  oneUnchecked.entries[0].sets[oneUnchecked.entries[0].sets.length - 1].done = false

  const rowDeleted = completedSession({ dayId: 'd1', date: '2026-08-12', weight: 40 })
  rowDeleted.entries[0].sets.pop()

  return {
    allDone: render(allDone),
    oneUnchecked: render(oneUnchecked),
    rowDeleted: render(rowDeleted),
  }
}

export const JJ_BUILD_GOLDEN: Record<string, string[]> = {
  normal: [
    "incline-chest-press@d1: 42.5x10 42.5x10 42.5x10 42.5x10",
    "pec-deck-fly@d1: 40x15 40x15 40x15",
    "flat-chest-press@d1: 42.5x12 42.5x12 42.5x12",
    "shoulder-press@d1: 42.5x12 42.5x12 42.5x12",
    "lateral-raise@d1: 40x20 40x20 40x20 40x20",
    "rear-delt-fly@d1: 40x20 40x20",
    "pushdown@d1: 40x15 40x15 40x15"
  ],
  deload: [
    "incline-chest-press@d1: 40x10 40x10",
    "pec-deck-fly@d1: 40x15 40x15",
    "flat-chest-press@d1: 40x12 40x12",
    "shoulder-press@d1: 40x12 40x12",
    "lateral-raise@d1: 40x20 40x20",
    "rear-delt-fly@d1: 40x20",
    "pushdown@d1: 40x15 40x15"
  ],
  return1: [
    "incline-chest-press@d1: 38x10 38x10 38x10",
    "pec-deck-fly@d1: 38x15 38x15",
    "flat-chest-press@d1: 38x12 38x12",
    "shoulder-press@d1: 38x12 38x12",
    "lateral-raise@d1: 38x20 38x20 38x20",
    "rear-delt-fly@d1: 38x20",
    "pushdown@d1: 38x15 38x15"
  ],
  return2: [
    "incline-chest-press@d1: 36x10 36x10",
    "pec-deck-fly@d1: 36x15 36x15",
    "flat-chest-press@d1: 36x12 36x12",
    "shoulder-press@d1: 36x12 36x12",
    "lateral-raise@d1: 36x20 36x20",
    "rear-delt-fly@d1: 36x20",
    "pushdown@d1: 36x15 36x15"
  ],
  return3: [
    "incline-chest-press@d1: 32x10 32x10",
    "pec-deck-fly@d1: 32x15 32x15",
    "flat-chest-press@d1: 32x12 32x12",
    "shoulder-press@d1: 32x12 32x12",
    "lateral-raise@d1: 32x20 32x20",
    "rear-delt-fly@d1: 32x20",
    "pushdown@d1: 32x15 32x15"
  ],
  returnNoStep: [
    "incline-chest-press@d1: 40x10 40x10 40x10 40x10",
    "pec-deck-fly@d1: 40x15 40x15 40x15",
    "flat-chest-press@d1: 40x12 40x12 40x12",
    "shoulder-press@d1: 40x12 40x12 40x12",
    "lateral-raise@d1: 40x20 40x20 40x20 40x20",
    "rear-delt-fly@d1: 40x20 40x20",
    "pushdown@d1: 40x15 40x15 40x15"
  ]
}

export const JJ_EXPORT_NORMAL_BEFORE: Record<string, string> = {
  allDone: "# 운동 기록 2026-08-01 ~ 2026-08-31\n\n> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**\n> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)\n\n## 2026-08-12 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 40kg\n10 / 10 / 10 / 10\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n다음: 42.5kg로 증량\n\n### 펙덱 플라이 (D1/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 42.5kg로 증량\n\n### 숄더프레스 (D1/A) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 42.5kg로 증량\n\n### 레터럴 레이즈 (D1/B) 40kg\n20 / 20 / 20 / 20\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n20 / 20\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n",
  oneUnchecked: "# 운동 기록 2026-08-01 ~ 2026-08-31\n\n> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**\n> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)\n\n## 2026-08-12 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 40kg\n6 / 6 / 6\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(10회) 미달 — 3세트 중 0세트 도달)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 숄더프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n",
  rowDeleted: "# 운동 기록 2026-08-01 ~ 2026-08-31\n\n> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**\n> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)\n\n## 2026-08-12 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 40kg\n6 / 6 / 6\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(10회) 미달 — 3세트 중 0세트 도달)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 숄더프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n"
}

describe('JJ1 — 생성 불변 (골든)', () => {
  it('normal·deload·return(1·2·3단계)·return(step 없음)의 entries(행 수·무게·반복)가 JJ_BUILD_GOLDEN과 칸마다 같다', () => {
    expect(goldenRows()).toEqual(JJ_BUILD_GOLDEN)
  })
})

describe('JJ2 — normal 불변 (골든)', () => {
  it('normal 세션 셋(전부 완료 · 한 행 미체크 · 행 하나 삭제)의 exportMarkdown 전문이 JJ_EXPORT_NORMAL_BEFORE와 문자 단위로 같다', () => {
    expect(normalExportFixtures()).toEqual(JJ_EXPORT_NORMAL_BEFORE)
  })
})

// ─── JJ1 ─────────────────────────────────────────────────

const D1 = ROUTINE.days.find((d) => d.id === 'd1')!
const STEPS = ROUTINE.rules.returnProtocol
const K_INCLINE = makeRecordKey('incline-chest-press', 'd1')
const K_REAR = makeRecordKey('rear-delt-fly', 'd1')
const K_FLAT_SUB = makeRecordKey('flat-chest-press', 'd2') // 대체 종목 키 (원 종목: 인클라인)

function build(mode: SessionMode, step?: number): Session {
  return buildSession({
    routine: ROUTINE,
    day: D1,
    mode,
    sessions: GOLDEN_HISTORY(),
    phase: PHASE,
    today: '2026-10-07',
    returnStep: step === undefined ? undefined : STEPS[step],
  }).session
}

/** 전 행 체크 */
function allChecked(s: Session): Session {
  return {
    ...s,
    endedAt: '2026-10-07T19:30:00.000Z',
    entries: s.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, done: true })) })),
  }
}

/** JJ 이전 기록처럼: 저장값을 지운다 */
function stripJJ(s: Session): Session {
  const { modeAdjust: _m, ...rest } = s
  void _m
  return {
    ...rest,
    entries: s.entries.map((e) => {
      const { plannedSets: _p, ...r } = e
      void _p
      return r
    }),
  }
}

function withRoutineSets(changes: Record<string, number>): RoutineTemplate {
  return {
    ...ROUTINE,
    days: ROUTINE.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) =>
        d.id === 'd1' && changes[e.exerciseId] !== undefined ? { ...e, sets: changes[e.exerciseId] } : e,
      ),
    })),
  }
}

const prevAt = (date: string) => [completedSession({ dayId: 'd1', date })]

describe('JJ1', () => {
  it('adjustedSetCount: 격자 P{1..6} × setPct{0,−30,−40,−50}가 v1.11.2 식과 같다', () => {
    for (const p of [1, 2, 3, 4, 5, 6])
      for (const pct of [0, -30, -40, -50])
        expect(adjustedSetCount(p, pct), `${p}/${pct}`).toBe(Math.max(1, Math.round(p * (1 + pct / 100))))
  })

  it('adjustedSetCount: 보고서 0절 표 7종목(4·3·3·3·4·2·3, −30) → 3·2·2·2·3·1·2, 합 22 → 15', () => {
    const P = [4, 3, 3, 3, 4, 2, 3]
    const G = P.map((p) => adjustedSetCount(p, -30))
    expect(G).toEqual([3, 2, 2, 2, 3, 1, 2])
    expect(P.reduce((a, b) => a + b, 0)).toBe(22)
    expect(G.reduce((a, b) => a + b, 0)).toBe(15)
  })

  it('modeAdjustFor: normal은 없다 · deload {−50,0} · return step 없음 {0,0}', () => {
    expect(modeAdjustFor('normal')).toBeUndefined()
    expect(modeAdjustFor('deload')).toEqual({ setPct: DELOAD_SET_PCT, weightPct: 0 })
    expect(modeAdjustFor('return')).toEqual({ setPct: 0, weightPct: 0 })
  })

  describe('modeAdjust 저장', () => {
    it('return 1단계 {−30,−5} · 3단계 {−50,−20}', () => {
      expect(build('return', 0).modeAdjust).toEqual({ setPct: -30, weightPct: -5 })
      expect(build('return', 2).modeAdjust).toEqual({ setPct: -50, weightPct: -20 })
    })
    it('deload {−50,0}', () => {
      expect(build('deload').modeAdjust).toEqual({ setPct: -50, weightPct: 0 })
    })
    it('normal은 키 자체가 없다', () => {
      expect('modeAdjust' in build('normal')).toBe(false)
    })
    it('return인데 step 없음 → {0,0}, 행 수 = P', () => {
      const s = build('return')
      expect(s.modeAdjust).toEqual({ setPct: 0, weightPct: 0 })
      expect(s.entries.map((e) => e.sets.length)).toEqual(D1.exercises.map((e) => e.sets))
    })
  })

  describe('plannedSets 저장', () => {
    it('return·deload의 모든 entry가 plannedSets === routineExercise.sets (4·3·3·3·4·2·3)', () => {
      for (const s of [build('return', 0), build('deload')])
        expect(s.entries.map((e) => e.plannedSets)).toEqual([4, 3, 3, 3, 4, 2, 3])
    })
    it('normal은 모든 entry에서 키가 없다', () => {
      for (const e of build('normal').entries) expect('plannedSets' in e).toBe(false)
    })
  })

  describe('plannedSets 보존', () => {
    it('applySubstitute 뒤 같은 값', () => {
      const next = applySubstitute(build('return', 0), K_INCLINE, {
        recordKey: K_FLAT_SUB,
        setCount: 3,
        weight: 30,
        reps: 10,
      })
      expect(next.entries.find((e) => e.substituteFor === K_INCLINE)!.plannedSets).toBe(4)
    })
    it('applyDayChange 뒤 같은 값 (대상 Day에 없는 종목도)', () => {
      const moved = applyDayChange(build('return', 0), ROUTINE, 'd2')
      expect(moved.entries.map((e) => e.plannedSets)).toEqual([4, 3, 3, 3, 4, 2, 3])
    })
    it('applyAddExercise가 만든 얹은 entry에는 없다', () => {
      const key = makeRecordKey('lat-pulldown', 'd2')
      const next = applyAddExercise(build('return', 0), { recordKey: key, setCount: 2, weight: 30, reps: 10 })
      const added = next.entries.find((e) => e.recordKey === key)!
      expect(added.extra).toBe(true)
      expect('plannedSets' in added).toBe(false)
    })
  })

  describe('resolveSessionAdjust', () => {
    const noStored = (mode: SessionMode) => stripJJ(build(mode, 0))

    it('normal은 modeAdjust를 억지로 넣어도 none', () => {
      const s = { ...build('normal'), modeAdjust: { setPct: -30, weightPct: -5 } }
      expect(resolveSessionAdjust(s, ROUTINE)).toEqual({ kind: 'none' })
    })
    it('저장값 {−30,−5}는 이력상 공백 60일이어도 그대로 (stored) — 저장값이 되짚기보다 우선', () => {
      expect(resolveSessionAdjust(build('return', 0), ROUTINE, prevAt('2026-08-08'))).toEqual({
        kind: 'known',
        setPct: -30,
        weightPct: -5,
        source: 'stored',
      })
    })
    it('저장값 있는 세션: 루틴 사본의 returnProtocol을 바꾸거나 직전 세션을 지워도 결과가 같다', () => {
      const s = build('return', 0)
      const base = resolveSessionAdjust(s, ROUTINE, prevAt('2026-09-16'))
      const changed = { ...ROUTINE, rules: { ...ROUTINE.rules, returnProtocol: [] } }
      expect(resolveSessionAdjust(s, changed, prevAt('2026-09-16'))).toEqual(base)
      expect(resolveSessionAdjust(s, ROUTINE, [])).toEqual(base)
    })
    it('저장값 없는 deload → {−50,0}, derived', () => {
      expect(resolveSessionAdjust(noStored('deload'), ROUTINE)).toEqual({
        kind: 'known',
        setPct: -50,
        weightPct: 0,
        source: 'derived',
      })
    })
    it('저장값 없는 return: 21일 → {−30,−5} gapDays 21 · 35일 → {−40,−10} · 60일 → {−50,−20}', () => {
      const s = noStored('return')
      expect(resolveSessionAdjust(s, ROUTINE, prevAt('2026-09-16'))).toEqual({
        kind: 'known',
        setPct: -30,
        weightPct: -5,
        source: 'derived',
        gapDays: 21,
      })
      expect(resolveSessionAdjust(s, ROUTINE, prevAt('2026-09-02'))).toMatchObject({
        setPct: -40,
        weightPct: -10,
        gapDays: 35,
      })
      expect(resolveSessionAdjust(s, ROUTINE, prevAt('2026-08-08'))).toMatchObject({
        setPct: -50,
        weightPct: -20,
        gapDays: 60,
      })
    })
    it('저장값 없는 return, sessions 미전달 → unknown', () => {
      expect(resolveSessionAdjust(noStored('return'), ROUTINE)).toEqual({ kind: 'unknown' })
    })
    it('저장값 없는 return, 10일 전 세션이 끼어든 이력 → unknown (공백 14일 미만)', () => {
      expect(resolveSessionAdjust(noStored('return'), ROUTINE, prevAt('2026-09-27'))).toEqual({
        kind: 'unknown',
      })
    })
    it('직전 세션이 유산소만이면 건너뛰고 그 앞 근력 세션으로 잰다 · 자기 자신은 제외', () => {
      const s = noStored('return')
      const cardioOnly: Session = {
        ...completedSession({ dayId: 'd1', date: '2026-10-01' }),
        entries: [],
        cardio: { type: '걷기', minutes: 30 },
      }
      const history = [cardioOnly, ...prevAt('2026-09-16'), s]
      expect(resolveSessionAdjust(s, ROUTINE, history)).toMatchObject({ kind: 'known', gapDays: 21 })
    })
  })

  describe('entrySetPlan', () => {
    const adj = { kind: 'known', setPct: -30, weightPct: -5, source: 'stored' } as const
    it('얹은 종목은 undefined', () => {
      const s = applyAddExercise(build('return', 0), {
        recordKey: makeRecordKey('lat-pulldown', 'd2'),
        setCount: 2,
        weight: 30,
        reps: 10,
      })
      expect(entrySetPlan(s.entries[s.entries.length - 1], ROUTINE, adj)).toBeUndefined()
    })
    it('plannedSets 없고 루틴에 없는 키 → undefined', () => {
      const e = { ...stripJJ(build('return', 0)).entries[0], recordKey: makeRecordKey('nope', 'd1') }
      expect(entrySetPlan(e, ROUTINE, adj)).toBeUndefined()
    })
    it('plannedSets 있고 루틴에 없는 키(Day 변경으로 빠진 종목) → 저장 P', () => {
      const e = { ...build('return', 0).entries[0], recordKey: makeRecordKey('nope', 'd1') }
      expect(entrySetPlan(e, ROUTINE, adj)).toMatchObject({ planned: 4, plannedFrom: 'stored' })
    })
    it('대체 종목(저장값 없음) → 원 종목 P, routine', () => {
      const sub = applySubstitute(stripJJ(build('return', 0)), K_INCLINE, {
        recordKey: K_FLAT_SUB,
        setCount: 3,
        weight: 30,
        reps: 10,
      })
      const e = sub.entries.find((x) => x.substituteFor === K_INCLINE)!
      expect(entrySetPlan(e, ROUTINE, adj)).toMatchObject({ planned: 4, plannedFrom: 'routine' })
    })
    it('워밍업 행(체크 여부 무관)은 workRows·done 어디에도 안 센다', () => {
      const e0 = build('return', 0).entries[0]
      const e = {
        ...e0,
        sets: [
          { weight: 20, reps: 10, done: true, warmup: true },
          { weight: 20, reps: 10, done: false, warmup: true },
          ...e0.sets.map((x) => ({ ...x, done: true })),
        ],
      }
      const plan = entrySetPlan(e, ROUTINE, adj)!
      expect(plan.workRows).toBe(3)
      expect(plan.done).toBe(3)
      expect(workSetRows(e)).toBe(3)
      expect(doneSets(e)).toHaveLength(3)
    })
    it('none → given === planned · unknown → null · known {0,0} → given === planned', () => {
      const e = build('return', 0).entries[0]
      expect(entrySetPlan(e, ROUTINE, { kind: 'none' })!.given).toBe(4)
      expect(entrySetPlan(e, ROUTINE, { kind: 'unknown' })!.given).toBeNull()
      expect(
        entrySetPlan(e, ROUTINE, { kind: 'known', setPct: 0, weightPct: 0, source: 'stored' })!.given,
      ).toBe(4)
    })
  })

  describe('루틴 변경 뒤에도 그날 P가 남는다 (회귀)', () => {
    it('인클라인 4→5, 리어델트 2→3으로 바꿔도 저장값이 말하고, plannedSets를 지우면 새 루틴을 읽는다', () => {
      const s = allChecked(build('return', 0))
      const changed = withRoutineSets({ 'incline-chest-press': 5, 'rear-delt-fly': 3 })
      const adj = resolveSessionAdjust(s, changed)
      const incline = s.entries.find((e) => e.recordKey === K_INCLINE)!
      const rear = s.entries.find((e) => e.recordKey === K_REAR)!
      expect(entrySetPlan(incline, changed, adj)).toMatchObject({ planned: 4, plannedFrom: 'stored', given: 3 })
      expect(entrySetPlan(rear, changed, adj)).toMatchObject({ planned: 2, given: 1 })
      const { plannedSets: _p, ...bare } = incline
      void _p
      expect(entrySetPlan(bare, changed, adj)).toMatchObject({ planned: 5, plannedFrom: 'routine', given: 4 })
    })
  })

  describe('sessionSetPlan', () => {
    it('08-26 7종목(전부 체크) → {planned:22, given:15, done:15}, routinePlanned false', () => {
      const s = allChecked(build('return', 0))
      expect(sessionSetPlan(s, ROUTINE, resolveSessionAdjust(s, ROUTINE))).toEqual({
        planned: 22,
        given: 15,
        done: 15,
        routinePlanned: false,
      })
    })
    it('한 종목 skipped → planned·given 그대로, done만 준다', () => {
      const s = allChecked(build('return', 0))
      const skipped = {
        ...s,
        entries: s.entries.map((e, i) =>
          i === 0 ? { ...e, skipped: true, sets: e.sets.map((x) => ({ ...x, done: false })) } : e,
        ),
      }
      expect(sessionSetPlan(skipped, ROUTINE, resolveSessionAdjust(skipped, ROUTINE))).toMatchObject({
        planned: 22,
        given: 15,
        done: 12,
      })
    })
    it('얹은 종목은 합에 없다', () => {
      const s = applyAddExercise(allChecked(build('return', 0)), {
        recordKey: makeRecordKey('lat-pulldown', 'd2'),
        setCount: 3,
        weight: 30,
        reps: 10,
      })
      expect(sessionSetPlan(s, ROUTINE, resolveSessionAdjust(s, ROUTINE))).toMatchObject({
        planned: 22,
        given: 15,
      })
    })
    it('저장값 없는 픽스처 → routinePlanned true', () => {
      const s = stripJJ(allChecked(build('return', 0)))
      const adj = resolveSessionAdjust(s, ROUTINE, prevAt('2026-09-16'))
      expect(sessionSetPlan(s, ROUTINE, adj)).toMatchObject({ planned: 22, given: 15, routinePlanned: true })
    })
    it('unknown → given null', () => {
      const s = stripJJ(allChecked(build('return', 0)))
      expect(sessionSetPlan(s, ROUTINE, resolveSessionAdjust(s, ROUTINE))!.given).toBeNull()
    })
  })

  describe('소스 스캔', () => {
    const raw = import.meta.glob('/src/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const app = Object.entries(raw)
      .filter(([p]) => !/\.test\.tsx?$/.test(p))
      .map(([p, s]) => [p, stripComments(s)] as const)
    const src = (name: string) => app.find(([p]) => p === `/src/lib/${name}`)![1]

    it('sessionFactory.ts: 세트 수 식·DELOAD_SET_PCT 정의 없음, 초크포인트 호출·plannedSets 저장 있음', () => {
      const s = src('sessionFactory.ts')
      expect(s).not.toContain('Math.max(1, Math.round(')
      expect(s).not.toContain('DELOAD_SET_PCT =')
      expect(s).toContain('adjustedSetCount(')
      expect(s).toContain('modeAdjustFor(')
      expect(s).toContain('plannedSets:')
    })
    it('setPlan.ts 밖(테스트 제외)에 `1 + setPct / 100`이 없다', () => {
      const hits = app.filter(([, s]) => s.includes('1 + setPct / 100')).map(([p]) => p)
      expect(hits).toEqual(['/src/lib/setPlan.ts'])
    })
    it('src/ 전체에서 `.filter((s) => !s.warmup).length`는 derive.ts의 workSetRows 한 곳', () => {
      const hits = app.filter(([, s]) => s.includes('.filter((s) => !s.warmup).length')).map(([p]) => p)
      expect(hits).toEqual(['/src/lib/derive.ts'])
    })
    it('setPlan.ts는 저장값 우선(`plannedSets ??`)', () => {
      expect(src('setPlan.ts')).toContain('plannedSets ??')
    })
  })
})
