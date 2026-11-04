import { describe, expect, it } from 'vitest'
import { buildSession } from './sessionFactory'
import { modeAdjustFor, returnStepText, returnWeightFor, returnWeightRuleOf } from './setPlan'
import { returnStepFor } from './suggestNextDay'
import { snapDownToScale, stepBelow, type WeightScale, type WeightScaleMap } from './weightScale'
import { applySubstitute, applyAddExercise } from './sessionOps'
import { applyDayChange } from './dayChange'
import { stripComments } from './sourceScan'
import { exportMarkdown } from './exportMarkdown'
import { validateRoutine } from '../db/validateRoutine'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import { makeRecordKey } from '../types'
import type {
  Exercise,
  Phase,
  ReturnProtocolStep,
  RoutineTemplate,
  Session,
  SessionMode,
} from '../types'

/**
 * v1.13 KK — 복귀 무게는 기구에 있는 무게로, 화면·내보내기는 저빈도의 결과를 말한다.
 * 이 파일의 describe는 작업별(KK1…)로 이어 붙는다.
 */

const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))
const PHASE: Phase = 1
const STEPS = ROUTINE.rules.returnProtocol
const D1 = ROUTINE.days.find((d) => d.id === 'd1')!
const D2 = ROUTINE.days.find((d) => d.id === 'd2')!
const D3 = ROUTINE.days.find((d) => d.id === 'd3')!
const K_INCLINE = makeRecordKey('incline-chest-press', 'd1')
const K_FLAT_SUB = makeRecordKey('flat-chest-press', 'd2')
const K_CRUNCH = makeRecordKey('crunch', 'd3')

/** v112 GOLDEN_HISTORY와 같은 모양 — d1 40kg, 오늘 10-07 */
const HISTORY = (): Session[] => [
  completedSession({ dayId: 'd1', date: '2026-08-05', weight: 40, fullReps: true }),
  completedSession({ dayId: 'd1', date: '2026-07-29', weight: 37.5 }),
]

interface BuildOpts {
  day?: typeof D1
  sessions?: Session[]
  scales?: WeightScaleMap
  step?: ReturnProtocolStep
  bodyWeightKg?: number
  inverse?: (rk: string) => boolean
}

function build(mode: SessionMode, o: BuildOpts = {}): Session {
  return buildSession({
    routine: ROUTINE,
    day: o.day ?? D1,
    mode,
    sessions: o.sessions ?? HISTORY(),
    phase: PHASE,
    today: '2026-10-07',
    returnStep: o.step,
    scales: o.scales,
    isInverse: o.inverse,
    ...(o.bodyWeightKg ? { bodyWeightKg: o.bodyWeightKg, startWeightPctBW: () => 0.3 } : {}),
  }).session
}

const weightsOf = (s: Session) => s.entries.map((e) => [...new Set(e.sets.map((x) => x.weight))])

describe('KK1', () => {
  // ─── 데이터 · 단계 선택 ───────────────────────────────
  describe('배포 returnProtocol', () => {
    it('세 단계의 gapDaysMin·weightPct·weightRule이 설계 2번 표와 같다 (고정)', () => {
      expect(
        STEPS.map((s) => ({
          gapWeeksMin: s.gapWeeksMin,
          gapDaysMin: s.gapDaysMin,
          weightPct: s.weightPct,
          weightRule: s.weightRule,
          setPct: s.setPct,
          targetRIR: s.targetRIR,
          rampWeeks: s.rampWeeks,
        })),
      ).toEqual([
        { gapWeeksMin: 2, gapDaysMin: 14, weightPct: 0, weightRule: 'keep', setPct: -30, targetRIR: 3, rampWeeks: 1 },
        { gapWeeksMin: 4, gapDaysMin: 29, weightPct: 0, weightRule: 'oneStep', setPct: -40, targetRIR: 3, rampWeeks: 2 },
        { gapWeeksMin: 8, gapDaysMin: 56, weightPct: -20, weightRule: 'pctSnapDown', setPct: -50, targetRIR: 4, rampWeeks: 3 },
      ])
    })
  })

  describe('returnStepFor 경계', () => {
    it('배포 루틴: 13 → 없음 · 14 → 1 · 28 → 1 · 29 → 2 · 55 → 2 · 56 → 3 · 60 → 3', () => {
      const w = (d: number) => returnStepFor(ROUTINE, d)?.gapWeeksMin
      expect(w(13)).toBeUndefined()
      expect(w(14)).toBe(2)
      expect(w(28)).toBe(2) // 정확히 28일은 4주 이하
      expect(w(29)).toBe(4)
      expect(w(55)).toBe(4)
      expect(w(56)).toBe(8)
      expect(w(60)).toBe(8)
    })
    it('옛 루틴(gapDaysMin·weightRule 없음, weightPct −5/−10/−20): 28 → 2단계 (옛 의미 유지)', () => {
      const old: RoutineTemplate = {
        ...ROUTINE,
        rules: {
          ...ROUTINE.rules,
          returnProtocol: STEPS.map((s, i) => {
            const { gapDaysMin: _d, weightRule: _r, ...rest } = s
            return { ...rest, weightPct: [-5, -10, -20][i] }
          }),
        },
      }
      expect(returnStepFor(old, 28)?.gapWeeksMin).toBe(4)
      expect(returnStepFor(old, 27)?.gapWeeksMin).toBe(2)
    })
  })

  describe('returnWeightRuleOf', () => {
    it('배포 1·2·3단계 → keep·oneStep·pctSnapDown', () => {
      expect(STEPS.map((s) => returnWeightRuleOf(s))).toEqual(['keep', 'oneStep', 'pctSnapDown'])
    })
    it('옛 루틴 1단계(−5, 필드 없음) → pctSnapDown · weightPct 0 → keep · undefined → keep', () => {
      expect(returnWeightRuleOf({ gapWeeksMin: 2, weightPct: -5, setPct: -30, targetRIR: 3, rampWeeks: 1 })).toBe('pctSnapDown')
      expect(returnWeightRuleOf({ gapWeeksMin: 2, weightPct: 0, setPct: -30, targetRIR: 3, rampWeeks: 1 })).toBe('keep')
      expect(returnWeightRuleOf(undefined)).toBe('keep')
    })
  })

  // ─── 무게 함수 ────────────────────────────────────────
  describe('stepBelow', () => {
    const s25: WeightScale = { step: 2.5 }
    it('단위 2.5: 30 → 27.5 · 31 → 30 · 2.5 → 0 · 0 → 0', () => {
      expect(stepBelow(30, s25)).toBe(27.5)
      expect(stepBelow(31, s25)).toBe(30) // 단위 밖 값에서도 한 칸 아래 격자
      expect(stepBelow(2.5, s25)).toBe(0)
      expect(stepBelow(0, s25)).toBe(0)
    })
    it('단위 5: 25 → 20', () => {
      expect(stepBelow(25, { step: 5 })).toBe(20)
    })
    it('사다리 [15,20,25,30]: 30 → 25 · 15 → 15 · 22 → 20', () => {
      const l: WeightScale = { step: 2.5, ladder: [15, 20, 25, 30] }
      expect(stepBelow(30, l)).toBe(25)
      expect(stepBelow(15, l)).toBe(15)
      expect(stepBelow(22, l)).toBe(20)
    })
  })

  describe('returnWeightFor', () => {
    const s25: WeightScale = { step: 2.5 }
    const keep = { weightPct: 0, weightRule: 'keep' as const }
    const one = { weightPct: 0, weightRule: 'oneStep' as const }
    const pct = { weightPct: -20, weightRule: 'pctSnapDown' as const }
    it('keep: 30 → 30 · 키 없음(v1.12 저장값 모양) → 30', () => {
      expect(returnWeightFor(30, keep, s25)).toBe(30)
      expect(returnWeightFor(30, { weightPct: -5 }, s25)).toBe(30)
    })
    it('oneStep: 단위 2.5 30 → 27.5 · 단위 5 25 → 20 · 사다리 최하단 15 → 15 · base 0 → 0', () => {
      expect(returnWeightFor(30, one, s25)).toBe(27.5)
      expect(returnWeightFor(25, one, { step: 5 })).toBe(20)
      expect(returnWeightFor(15, one, { step: 2.5, ladder: [15, 20, 25, 30] })).toBe(15)
      expect(returnWeightFor(0, one, s25)).toBe(0)
    })
    it('pctSnapDown −20: 단위 2.5 30 → 22.5(24에서 내림) · 40 → 30(32에서) · 단위 5 25 → 20 · 사다리 [35,41] 41 → 35', () => {
      expect(returnWeightFor(30, pct, s25)).toBe(22.5)
      expect(returnWeightFor(40, pct, s25)).toBe(30)
      expect(returnWeightFor(25, pct, { step: 5 })).toBe(20)
      expect(returnWeightFor(41, pct, { step: 2.5, ladder: [35, 41] })).toBe(35)
    })
    it('어시스티드(inverse, 단위 2.5) 20: oneStep → 22.5 · pctSnapDown → 22.5 (보조가 줄지 않는다)', () => {
      const inv: WeightScale = { step: 2.5, inverse: true }
      expect(returnWeightFor(20, one, inv)).toBe(22.5)
      expect(returnWeightFor(20, pct, inv)).toBe(22.5)
    })
    it('결과가 단위 격자 위에 있다: 단위 2.5 × base 12.5..60 × 세 규칙 → 2.5의 배수이고 ≤ base', () => {
      for (let base = 12.5; base <= 60; base += 2.5) {
        for (const rule of [keep, one, pct]) {
          const w = returnWeightFor(base, rule, s25)
          expect(Math.round((w / 2.5) * 1e6) / 1e6 % 1).toBe(0)
          expect(w).toBeLessThanOrEqual(base)
        }
      }
    })
    it('snapDownToScale은 기존 규칙 그대로 (사다리 최하단 미만이면 최하단)', () => {
      expect(snapDownToScale(10, { step: 2.5, ladder: [15, 20] })).toBe(15)
    })
  })

  // ─── buildSession ─────────────────────────────────────
  describe('buildSession 복귀 무게', () => {
    it('1단계 → 모든 세트 40 (v1.12는 38) · 2단계 → 37.5 (v1.12는 36) · 3단계 → 30 (v1.12는 32) · step 없음 → 40', () => {
      for (const [i, w] of [[0, 40], [1, 37.5], [2, 30]] as const) {
        const s = build('return', { step: STEPS[i] })
        expect(weightsOf(s).flat().every((x) => x === w)).toBe(true)
      }
      expect(weightsOf(build('return')).flat().every((x) => x === 40)).toBe(true)
    })
    it('행 수·반복은 JJ_BUILD_GOLDEN과 같다 (세트 조정은 안 바뀌었다)', () => {
      expect(build('return', { step: STEPS[1] }).entries.map((e) => e.sets.length)).toEqual([2, 2, 2, 2, 2, 1, 2])
      expect(build('return', { step: STEPS[0] }).entries.map((e) => e.sets.length)).toEqual([3, 2, 2, 2, 3, 1, 2])
    })
    it('인클라인 단위 5(scales) · 2단계 → 인클라인만 35, 나머지 37.5', () => {
      const scales: WeightScaleMap = new Map([[K_INCLINE, { step: 5 }]])
      const s = build('return', { step: STEPS[1], scales })
      const w = weightsOf(s)
      expect(w[0]).toEqual([35])
      expect(w.slice(1).every((x) => x.length === 1 && x[0] === 37.5)).toBe(true)
    })
    it('deload는 무게 40 그대로 · normal·deload 모두 returnWeight 없음 (전 칸은 JJ_BUILD_GOLDEN이 고정)', () => {
      const d = build('deload')
      expect(weightsOf(d).flat().every((x) => x === 40)).toBe(true)
      expect(d.entries.every((e) => e.returnWeight === undefined)).toBe(true)
      expect(build('normal').entries.every((e) => e.returnWeight === undefined)).toBe(true)
    })
    it('0kg 종목: D3 크런치(프리필 0) · 2단계·3단계 → 세트 무게 0, returnWeight 키 없음, 내보내기에 `무게:` 줄 없음', () => {
      for (const i of [1, 2]) {
        const s = build('return', { day: D3, sessions: [], step: STEPS[i] })
        const e = s.entries.find((x) => x.recordKey === K_CRUNCH)!
        expect(e.sets.every((x) => x.weight === 0)).toBe(true)
        expect('returnWeight' in e).toBe(false)
        const md = exportMarkdown({
          sessions: [{ ...s, endedAt: '2026-10-07T20:00:00.000Z' }],
          routine: ROUTINE,
          catalog,
          phase: PHASE,
          range: { from: '2026-10-01', to: '2026-10-31' },
        })
        expect(md).not.toContain('무게:')
      }
    })
    it('기록 없는 종목: 이력 없는 D2 + 체중·startWeightPctBW → 세트 무게 = startEstimate 그대로, returnWeight 키 없음', () => {
      const normal = build('normal', { day: D2, sessions: [], bodyWeightKg: 70 })
      expect(weightsOf(normal).flat().some((x) => x > 0)).toBe(true) // 추정이 실제로 나온다
      for (const i of [1, 2]) {
        const s = build('return', { day: D2, sessions: [], bodyWeightKg: 70, step: STEPS[i] })
        expect(weightsOf(s)).toEqual(weightsOf(normal))
        expect(s.entries.every((e) => !('returnWeight' in e))).toBe(true)
      }
    })
    it('같은 종목에 기록 하나 추가 → 감량이 걸린다 (나머지 추정 종목은 그대로)', () => {
      const first = D2.exercises[0].exerciseId
      const hist = [completedSession({ dayId: 'd2', date: '2026-08-05', weight: 40, onlyExercises: [first] })]
      const s = build('return', { day: D2, sessions: hist, bodyWeightKg: 70, step: STEPS[1] })
      const e = s.entries.find((x) => x.recordKey.startsWith(`${first}@`))!
      expect(e.sets.every((x) => x.weight === 37.5)).toBe(true)
      expect(e.returnWeight).toEqual({ base: 40, given: 37.5 })
      expect(s.entries.filter((x) => x !== e).every((x) => !('returnWeight' in x))).toBe(true)
    })
    it('사다리 최하단 15 · 2단계 → 세트 15, returnWeight {15, 15} (base > 0이라 남긴다)', () => {
      const scales: WeightScaleMap = new Map([[K_INCLINE, { step: 2.5, ladder: [15, 20, 25, 30] }]])
      const hist = [completedSession({ dayId: 'd1', date: '2026-08-05', weight: 15 })]
      const s = build('return', { sessions: hist, scales, step: STEPS[1] })
      const e = s.entries.find((x) => x.recordKey === K_INCLINE)!
      expect(e.sets.every((x) => x.weight === 15)).toBe(true)
      expect(e.returnWeight).toEqual({ base: 15, given: 15 })
    })
    it('어시스티드(isInverse) 종목은 복귀 세션에서 보조가 줄지 않는다', () => {
      // 이력 하나(40kg)로 기준을 고정한다 — inverse는 프리필의 최고 기록 방향도 바꾼다
      const hist = [completedSession({ dayId: 'd1', date: '2026-08-05', weight: 40 })]
      const s = build('return', { sessions: hist, step: STEPS[2], inverse: (rk) => rk === K_INCLINE })
      expect(weightsOf(s)[0][0]).toBe(42.5)
      expect(s.entries[0].returnWeight).toEqual({ base: 40, given: 42.5 })
    })
  })

  describe('modeAdjust 저장', () => {
    it('1단계 {-30,0,keep,3} · 2단계 {-40,0,oneStep,3} · 3단계 {-50,-20,pctSnapDown,4} · step 없음 {0,0,keep}(targetRIR 키 없음) · deload {-50,0}', () => {
      expect(build('return', { step: STEPS[0] }).modeAdjust).toEqual({ setPct: -30, weightPct: 0, weightRule: 'keep', targetRIR: 3 })
      expect(build('return', { step: STEPS[1] }).modeAdjust).toEqual({ setPct: -40, weightPct: 0, weightRule: 'oneStep', targetRIR: 3 })
      expect(build('return', { step: STEPS[2] }).modeAdjust).toEqual({ setPct: -50, weightPct: -20, weightRule: 'pctSnapDown', targetRIR: 4 })
      const none = build('return').modeAdjust!
      expect(none).toEqual({ setPct: 0, weightPct: 0, weightRule: 'keep' })
      expect('targetRIR' in none).toBe(false)
      const del = modeAdjustFor('deload')!
      expect(del).toEqual({ setPct: -50, weightPct: 0 })
      expect('weightRule' in del).toBe(false)
    })
  })

  describe('returnWeight 저장', () => {
    it('1단계·normal·deload → 키 없음', () => {
      for (const s of [build('return', { step: STEPS[0] }), build('normal'), build('deload')]) {
        expect(s.entries.every((e) => !('returnWeight' in e))).toBe(true)
      }
    })
    it('2단계 → 모든 루틴 종목 entry {base:40, given:37.5} · 3단계 → {40, 30}', () => {
      expect(build('return', { step: STEPS[1] }).entries.every((e) => e.returnWeight?.base === 40 && e.returnWeight.given === 37.5)).toBe(true)
      expect(build('return', { step: STEPS[2] }).entries.every((e) => e.returnWeight?.base === 40 && e.returnWeight.given === 30)).toBe(true)
    })
    it('applyDayChange 뒤 같은 값 · applySubstitute 뒤 undefined · applyAddExercise entry에는 없음', () => {
      const s = build('return', { step: STEPS[1] })
      const moved = applyDayChange(s, ROUTINE, 'd2')
      expect(moved.entries.every((e) => e.returnWeight?.given === 37.5)).toBe(true)
      const sub = applySubstitute(s, K_INCLINE, { recordKey: K_FLAT_SUB, setCount: 3, weight: 30, reps: 10 })
      expect(sub.entries.find((e) => e.substituteFor === K_INCLINE)!.returnWeight).toBeUndefined()
      const added = applyAddExercise(s, { recordKey: makeRecordKey('leg-curl', 'd3'), setCount: 2, weight: 20, reps: 12 })
      expect(added.entries[added.entries.length - 1].returnWeight).toBeUndefined()
    })
  })

  describe('홈 배너 문구', () => {
    it('returnStepText 세 단계가 PLAN 표와 같다', () => {
      expect(returnStepText(STEPS[0])).toBe('세트 −30% · 무게 유지 · 반복 3회 남기기')
      expect(returnStepText(STEPS[1])).toBe('세트 −40% · 무게 한 단계 내림 · 반복 3회 남기기')
      expect(returnStepText(STEPS[2])).toBe('세트 −50% · 무게 −20% (기구 무게로 내림) · 반복 4회 남기기')
    })
  })

  describe('validateRoutine 복귀 단계', () => {
    const withSteps = (steps: ReturnProtocolStep[]): RoutineTemplate => ({
      ...ROUTINE,
      rules: { ...ROUTINE.rules, returnProtocol: steps },
    })
    const clone = () => STEPS.map((s) => ({ ...s }))
    const problems = (r: RoutineTemplate) =>
      validateRoutine(r, EXERCISES as Exercise[]).filter((p) => p.includes('returnProtocol'))
    it('배포 루틴 문제 0건', () => {
      expect(validateRoutine(ROUTINE, EXERCISES as Exercise[])).toEqual([])
    })
    it('gapDaysMin 29 ↔ 14 뒤바꿈 → 문제', () => {
      const s = clone()
      s[0].gapDaysMin = 29
      s[1].gapDaysMin = 14
      expect(problems(withSteps(s)).length).toBeGreaterThan(0)
    })
    it('한 단계에서만 gapDaysMin 삭제 → 문제', () => {
      const s = clone()
      delete s[1].gapDaysMin
      expect(problems(withSteps(s)).length).toBeGreaterThan(0)
    })
    it('oneStep + weightPct −10 · pctSnapDown + weightPct 0 · keep + weightPct −5 → 각각 문제', () => {
      for (const [i, rule, pctv] of [[1, 'oneStep', -10], [2, 'pctSnapDown', 0], [0, 'keep', -5]] as const) {
        const s = clone()
        s[i].weightRule = rule
        s[i].weightPct = pctv
        expect(problems(withSteps(s)).length).toBeGreaterThan(0)
      }
    })
    it('gapDaysMin 같은 값 두 개(29, 29) → 문제', () => {
      const s = clone()
      s[0].gapDaysMin = 29
      expect(problems(withSteps(s)).length).toBeGreaterThan(0)
    })
    it('2단계 gapDaysMin 28(오름차순은 지킴) → 문제 0건 (값은 검사 범위 밖)', () => {
      const s = clone()
      s[1].gapDaysMin = 28
      expect(problems(withSteps(s))).toEqual([])
    })
  })

  describe('소스 스캔', () => {
    const raw = import.meta.glob(
      ['/src/lib/sessionFactory.ts', '/src/screens/HomeScreen.tsx', '/src/lib/**/*.ts', '!/src/lib/**/*.test.ts'],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>
    const src = (name: string) => stripComments(raw[name])
    it('sessionFactory.ts: roundToHalf·weightPct / 100 없음, returnWeightFor( 있음', () => {
      const s = src('/src/lib/sessionFactory.ts')
      expect(s).not.toContain('roundToHalf')
      expect(s).not.toContain('weightPct / 100')
      expect(s).toContain('returnWeightFor(')
    })
    it('setPlan.ts·weightScale.ts 밖에서 snapDownToScale( 호출은 prefill.ts(CC13)뿐', () => {
      const users = Object.keys(raw).filter(
        (k) =>
          !k.endsWith('/setPlan.ts') &&
          !k.endsWith('/weightScale.ts') &&
          src(k).includes('snapDownToScale('),
      )
      expect(users).toEqual(['/src/lib/prefill.ts'])
    })
    it('HomeScreen.tsx: returnStep?.weightPct·returnStep?.setPct 없음, returnStepText( 있음', () => {
      const s = src('/src/screens/HomeScreen.tsx')
      expect(s).not.toContain('returnStep?.weightPct')
      expect(s).not.toContain('returnStep?.setPct')
      expect(s).toContain('returnStepText(')
    })
    it('setPlan.ts: resolveSessionAdjust 안에서 현재 루틴 단계(returnStepFor)를 읽지 않는다 (과거 세션 조정률 불변)', () => {
      expect(src('/src/lib/setPlan.ts')).not.toContain('returnStepFor')
    })
  })
})
