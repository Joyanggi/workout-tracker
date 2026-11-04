import { describe, expect, it } from 'vitest'
import { buildSession } from './sessionFactory'
import {
  entryWeightLine,
  modeAdjustFor,
  resolveSessionAdjust,
  returnStepText,
  returnWeightFor,
  returnWeightRuleOf,
  sessionAdjustText,
  sessionReturnRirText,
  sessionSetPlan,
} from './setPlan'
import { returnStepFor, suggestNextDay } from './suggestNextDay'
import { holdReasonText } from './progression'
import { snapDownToScale, stepBelow, type WeightScale, type WeightScaleMap } from './weightScale'
import { applySubstitute, applyAddExercise } from './sessionOps'
import { applyDayChange } from './dayChange'
import { stripComments } from './sourceScan'
import { dayGapNotice, dayLastDone, lastDoneText, sessionDayGapLine, staleDaysLine } from './dayGap'
import { exportMarkdown, sessionToMarkdown } from './exportMarkdown'
import { validateRoutine } from '../db/validateRoutine'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import { makeRecordKey } from '../types'
import { BUNDLED_DIET_PLANS } from '../db/seed'
import type {
  DietDay,
  SlotRecord,
  Exercise,
  Phase,
  ReturnProtocolStep,
  RoutineDay,
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


// ═══ 골든 (KK 구현 전 · 이후 커밋에서 고치지 않는다) ═══
// KK_EXPORT_BEFORE = v1.12 코드(커밋 609072f)의 exportMarkdown 출력. FIELD_1104 = 보고서 0절 11세션.

// ─── FIELD_1104 픽스처 (KK 골든) ─────────────────────────
// 보고서 0절의 11세션. 복귀 세션은 저장값 없음(JJ 이전 모양). 시각은 렌더 때 고정한다.
export function buildFieldSessions(): Session[] {
  // [날짜, Day, 모드, 유산소 분, 유산소 메모]
  const rows: [string, string, SessionMode, number | undefined, string | undefined][] = [
    ['2026-08-03', 'd1', 'normal', 30, '마이마운틴'],
    ['2026-08-05', 'd3', 'normal', 20, undefined],
    ['2026-08-26', 'd1', 'return', 20, undefined],
    ['2026-08-28', 'd3', 'normal', 10, undefined],
    ['2026-09-21', 'd1', 'return', 15, undefined],
    ['2026-09-22', 'd3', 'normal', undefined, undefined],
    ['2026-10-06', 'd1', 'return', 20, undefined],
    ['2026-10-07', 'd3', 'normal', 20, undefined],
    ['2026-10-16', 'd2', 'normal', 19, undefined],
    ['2026-10-29', 'd3', 'normal', undefined, undefined],
    ['2026-11-04', 'd1', 'normal', 16, undefined],
  ]
  // Push A그룹 (보고서 5절): 무게, 반복
  const PUSH_A: Record<string, Record<string, [number, number[]]>> = {
    '2026-08-26': { 'incline-chest-press': [30, [10, 10, 10]], 'flat-chest-press': [25, [12, 12]], 'shoulder-press': [20, [12, 12]] },
    '2026-09-21': { 'incline-chest-press': [30, [10, 9, 10]], 'flat-chest-press': [25, [12, 12]], 'shoulder-press': [20, [12, 12]] },
    '2026-10-06': { 'incline-chest-press': [30, [13, 10, 10]], 'flat-chest-press': [25, [12, 12]], 'shoulder-press': [20, [12, 12]] },
    '2026-11-04': { 'incline-chest-press': [30, [10, 10, 10, 10]], 'flat-chest-press': [30, [11, 6, 7]], 'shoulder-press': [20, [12, 8, 8]] },
  }
  return rows.map(([date, dayId, mode, cardioMin, cardioNote]) => {
    const s = completedSession({ dayId, date, weight: 40, mode })
    const push = PUSH_A[date]
    if (push) {
      for (const e of s.entries) {
        const ex = e.recordKey.split('@')[0]
        const p = push[ex]
        if (p) e.sets = p[1].map((reps) => ({ weight: p[0], reps, done: true, doneAt: s.startedAt }))
      }
    }
    if (date === '2026-08-03') {
      s.startedAt = `${date}T13:09:00.000Z`
      s.endedAt = s.startedAt
      for (const e of s.entries) for (const x of e.sets) x.done = false
    }
    if (cardioMin !== undefined) {
      s.cardio = { type: '유산소', minutes: cardioMin, ...(cardioNote ? { note: cardioNote } : {}) }
    }
    return s
  })
}

/** 08-03~08-06 식단 나흘 + 08-12 슬롯 없는 레코드 1건 */
export function buildFieldDiet(): DietDay[] {
  const plan = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!
  const full = Object.fromEntries(
    plan.slots.map((sl) => [sl.id, { checkedItemIds: sl.items.map((i) => i.id) }]),
  ) as Record<string, SlotRecord>
  const day = (date: string, slots: Record<string, SlotRecord>): DietDay => ({
    date,
    planId: plan.id,
    isTrainingDay: true,
    slots,
  })
  return [
    day('2026-08-03', full),
    day('2026-08-04', full),
    day('2026-08-05', full),
    day('2026-08-06', full),
    day('2026-08-12', {}),
  ]
}

export function renderFieldExport(): string {
  return exportMarkdown({
    sessions: buildFieldSessions(),
    routine: ROUTINE,
    catalog,
    phase: PHASE,
    range: { from: '2026-08-01', to: '2026-11-30' },
    dietPlans: BUNDLED_DIET_PLANS,
    dietDays: buildFieldDiet(),
  }).replace(/\[\d\d:\d\d–\d\d:\d\d, /g, '[시각, ')
}


/** v1.12 코드(609072f)로 뽑은 FIELD_1104 내보내기 전문 */
export const KK_EXPORT_BEFORE: string = "# 운동 기록 2026-08-01 ~ 2026-11-30\n\n> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**\n> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)\n> 식단 슬롯 마크 = 그 끼니 이행률(항목 영양 가중): ● 100% · ◕ 80% 이상 · ◐ 45% 이상 · ◔ 45% 미만 · ✗ 0%. 대체·안 먹음은 상세 줄에 적는다.\n> 식단 준수 = 기록한 슬롯 점수의 평균: ● 85% 이상 · ◐ 50% 이상 · ○ 50% 미만. 3슬롯 미만이면 판정하지 않고 \"기록 n/m슬롯\"으로 적는다.\n\n## 2026-08-03 (월) — Day 1 Push  [시각, 0분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n유산소: 유산소 마이마운틴 · 30분\n\n### 식단 — 감량 1,800 (구) · 훈련일 · 준수 ● 100% (단백질 추정 166g / 166g)\n- 슬롯: 아침 ● · 점심 ● · 오후 ● · 훈련 전 ● · 훈련 직후 ● · 저녁 ●\n\n## 2026-08-04 (화) — 운동 없음\n\n### 식단 — 감량 1,800 (구) · 훈련일 · 준수 ● 100% (단백질 추정 166g / 166g)\n- 슬롯: 아침 ● · 점심 ● · 오후 ● · 훈련 전 ● · 훈련 직후 ● · 저녁 ●\n\n## 2026-08-05 (수) — Day 3 하체 + 코어  [시각, 90분]\n수행 순서: 레그 익스텐션 → 레그 컬 → 몬스터 글루트 → 힙 어덕션 → 크런치 → 데드버그\n\n### 레그 익스텐션 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 레그 컬 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 몬스터 글루트 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 힙 어덕션 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 크런치 (D3/core) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 데드버그 (D3/core) 40kg\n10 / 10\n간격: 0:00\n보상작용: 없음\n\n유산소: 유산소 20분\n\n### 식단 — 감량 1,800 (구) · 훈련일 · 준수 ● 100% (단백질 추정 166g / 166g)\n- 슬롯: 아침 ● · 점심 ● · 오후 ● · 훈련 전 ● · 훈련 직후 ● · 저녁 ●\n\n## 2026-08-06 (목) — 운동 없음\n\n### 식단 — 감량 1,800 (구) · 훈련일 · 준수 ● 100% (단백질 추정 166g / 166g)\n- 슬롯: 아침 ● · 점심 ● · 오후 ● · 훈련 전 ● · 훈련 직후 ● · 저녁 ●\n\n## 2026-08-12 (수) — 운동 없음\n\n\n## 2026-08-26 (수) — Day 1 Push [복귀]  [시각, 90분]\n복귀 조정: 세트 −30% · 무게 −5% (공백 21일로 재계산) — 현재 루틴 계획 22세트 → 15세트 생성 · 완료 19세트\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 30kg\n10 / 10 / 10\n세트: 계획 4 → 복귀 조정 3 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 30kg 유지 (반복 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 25kg\n12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 2\n간격: 0:00\n보상작용: 없음\n다음: 25kg 유지 (반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션)\n\n### 숄더프레스 (D1/A) 20kg\n12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 2\n간격: 0:00\n보상작용: 없음\n다음: 20kg 유지 (반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n세트: 계획 4 → 복귀 조정 3 · 완료 4\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n세트: 계획 2 → 복귀 조정 1 · 완료 2\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n세트: 계획 3 → 복귀 조정 2 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n\n유산소: 유산소 20분\n\n\n## 2026-08-28 (금) — Day 3 하체 + 코어  [시각, 90분]\n수행 순서: 레그 익스텐션 → 레그 컬 → 몬스터 글루트 → 힙 어덕션 → 크런치 → 데드버그\n\n### 레그 익스텐션 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 레그 컬 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 몬스터 글루트 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 힙 어덕션 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 크런치 (D3/core) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 데드버그 (D3/core) 40kg\n10 / 10\n간격: 0:00\n보상작용: 없음\n\n유산소: 유산소 10분\n\n\n## 2026-09-21 (월) — Day 1 Push [복귀]  [시각, 90분]\n복귀 조정: 세트 −30% · 무게 −5% (공백 24일로 재계산) — 현재 루틴 계획 22세트 → 15세트 생성 · 완료 19세트\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 30kg\n10 / 9 / 10\n세트: 계획 4 → 복귀 조정 3 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 30kg 유지 (반복 상단(10회) 미달 — 3세트 중 2세트 도달)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 25kg\n12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 2\n간격: 0:00\n보상작용: 없음\n다음: 25kg 유지 (반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션)\n\n### 숄더프레스 (D1/A) 20kg\n12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 2\n간격: 0:00\n보상작용: 없음\n다음: 20kg 유지 (반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n세트: 계획 4 → 복귀 조정 3 · 완료 4\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n세트: 계획 2 → 복귀 조정 1 · 완료 2\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n세트: 계획 3 → 복귀 조정 2 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n\n유산소: 유산소 15분\n\n\n## 2026-09-22 (화) — Day 3 하체 + 코어  [시각, 90분]\n수행 순서: 레그 익스텐션 → 레그 컬 → 몬스터 글루트 → 힙 어덕션 → 크런치 → 데드버그\n\n### 레그 익스텐션 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 레그 컬 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 몬스터 글루트 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 힙 어덕션 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 크런치 (D3/core) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 데드버그 (D3/core) 40kg\n10 / 10\n간격: 0:00\n보상작용: 없음\n\n\n## 2026-10-06 (화) — Day 1 Push [복귀]  [시각, 90분]\n복귀 조정: 세트 −30% · 무게 −5% (공백 14일로 재계산) — 현재 루틴 계획 22세트 → 15세트 생성 · 완료 19세트\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 30kg\n13 / 10 / 10\n세트: 계획 4 → 복귀 조정 3 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 30kg 유지 (반복 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 25kg\n12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 2\n간격: 0:00\n보상작용: 없음\n다음: 25kg 유지 (반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션)\n\n### 숄더프레스 (D1/A) 20kg\n12 / 12\n세트: 계획 3 → 복귀 조정 2 · 완료 2\n간격: 0:00\n보상작용: 없음\n다음: 20kg 유지 (반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n세트: 계획 4 → 복귀 조정 3 · 완료 4\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n세트: 계획 2 → 복귀 조정 1 · 완료 2\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n세트: 계획 3 → 복귀 조정 2 · 완료 3\n간격: 0:00 / 0:00\n보상작용: 없음\n\n유산소: 유산소 20분\n\n\n## 2026-10-07 (수) — Day 3 하체 + 코어  [시각, 90분]\n수행 순서: 레그 익스텐션 → 레그 컬 → 몬스터 글루트 → 힙 어덕션 → 크런치 → 데드버그\n\n### 레그 익스텐션 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 레그 컬 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 몬스터 글루트 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 힙 어덕션 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 크런치 (D3/core) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 데드버그 (D3/core) 40kg\n10 / 10\n간격: 0:00\n보상작용: 없음\n\n유산소: 유산소 20분\n\n\n## 2026-10-16 (금) — Day 2 Pull  [시각, 90분]\n수행 순서: 암 풀다운 → 랫풀다운 → 시티드 로우 → 리어델트 → 레터럴 레이즈 → 컬\n\n### 암 풀다운 (D2/B) 40kg\n15 / 15\n간격: 0:00\n보상작용: 없음\n\n### 랫풀다운 (D2/A) 40kg\n8 / 8 / 8 / 8\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 4세트 중 0세트 도달)\n\n### 시티드 로우 (D2/A) 40kg\n8 / 8 / 8 / 8\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 4세트 중 0세트 도달)\n\n### 리어델트 (D2/B) 40kg\n12 / 12 / 12 / 12\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 레터럴 레이즈 (D2/B) 40kg\n12 / 12\n간격: 0:00\n보상작용: 없음\n\n### 컬 (D2/B) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n유산소: 유산소 19분\n\n\n## 2026-10-29 (목) — Day 3 하체 + 코어  [시각, 90분]\n수행 순서: 레그 익스텐션 → 레그 컬 → 몬스터 글루트 → 힙 어덕션 → 크런치 → 데드버그\n\n### 레그 익스텐션 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 레그 컬 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 몬스터 글루트 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 힙 어덕션 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 크런치 (D3/core) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 데드버그 (D3/core) 40kg\n10 / 10\n간격: 0:00\n보상작용: 없음\n\n\n## 2026-11-04 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 30kg\n10 / 10 / 10 / 10\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n다음: 32.5kg로 증량\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 30kg\n11 / 6 / 7\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 30kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 숄더프레스 (D1/A) 20kg\n12 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 20kg 유지 (반복 상단(12회) 미달 — 3세트 중 1세트 도달)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n유산소: 유산소 16분\n"

describe('KK 골든', () => {
  it('FIELD_1104 픽스처는 11세션 · 식단 5건이고 KK_EXPORT_BEFORE는 11세션 날짜를 모두 담는다', () => {
    const sessions = buildFieldSessions()
    expect(sessions).toHaveLength(11)
    expect(buildFieldDiet()).toHaveLength(5)
    for (const s of sessions) expect(KK_EXPORT_BEFORE).toContain(`## ${s.date} `)
  })
})

// ─── KK2 ─────────────────────────────────────────────────

describe('KK2', () => {
  const END = '2026-10-07T19:30:00.000Z'
  /** 전 행 체크 + 수행한 것으로 (내보내기 본문은 performedOrder가 있는 종목만 쓴다) */
  const done = (s: Session): Session => ({
    ...s,
    endedAt: END,
    entries: s.entries.map((e) => ({
      ...e,
      performedOrder: e.plannedOrder,
      firstSetAt: '2026-10-07T18:20:00.000Z',
      sets: e.sets.map((x) => ({ ...x, done: true })),
    })),
  })
  const stepRun = (i: number) => done(build('return', { step: STEPS[i] }))
  const md = (s: Session, sessions?: Session[]) =>
    sessionToMarkdown(s, ROUTINE, catalog, PHASE, undefined, sessions).split('\n')
  const next = (lines: string[]) => lines[lines.findIndex((l) => l.startsWith('## 2026-10-07')) + 1]
  /** JJ 이전 모양: 저장값(modeAdjust·plannedSets·returnWeight) 없음 */
  const stripNew = (s: Session): Session => {
    const { modeAdjust: _m, ...rest } = s
    void _m
    return {
      ...rest,
      entries: s.entries.map((e) => {
        const { plannedSets: _p, returnWeight: _r, ...r } = e
        void _p
        void _r
        return r
      }),
    }
  }
  const prior = (daysBefore: number): Session[] => {
    const d = new Date(Date.UTC(2026, 9, 7) - daysBefore * 86400000).toISOString().slice(0, 10)
    return [completedSession({ dayId: 'd1', date: d, weight: 40 })]
  }
  const TAIL = ' — 계획 22세트 → 15세트 생성 · 완료 15세트'

  describe('헤더', () => {
    it('KK 이후 복귀 1단계 → 세트 −30% · 무게 유지 · 반복 3회 남기기', () => {
      expect(next(md(stepRun(0)))).toBe(`복귀 조정: 세트 −30% · 무게 유지 · 반복 3회 남기기${TAIL}`)
    })
    it('KK 이후 복귀 2단계 → 무게 한 단계 내림', () => {
      expect(
        next(md(stepRun(1))).startsWith('복귀 조정: 세트 −40% · 무게 한 단계 내림 · 반복 3회 남기기 — 계획 22세트'),
      ).toBe(true)
    })
    it('KK 이후 복귀 3단계 → 무게 −20% (기구 무게로 내림) · 반복 4회', () => {
      expect(
        next(md(stepRun(2))).startsWith(
          '복귀 조정: 세트 −50% · 무게 −20% (기구 무게로 내림) · 반복 4회 남기기 — 계획 22세트',
        ),
      ).toBe(true)
    })
    it('v1.12 모양(modeAdjust {-30,-5} + plannedSets) → 무게 −5% (당시 규칙)', () => {
      const s = { ...stepRun(0), modeAdjust: { setPct: -30, weightPct: -5 } }
      expect(next(md(s))).toBe(`복귀 조정: 세트 −30% · 무게 −5% (당시 규칙)${TAIL}`)
    })
    it('JJ 이전 모양(저장값 없음, 21일 전) → (당시 규칙) (공백 21일로 재계산)', () => {
      expect(next(md(stripNew(stepRun(0)), prior(21)))).toBe(
        '복귀 조정: 세트 −30% · 무게 −5% (당시 규칙) (공백 21일로 재계산) — 현재 루틴 계획 22세트 → 15세트 생성 · 완료 15세트',
      )
    })
    it('JJ 이전 모양, 공백 28일 → 옛 경계로 세트 −40% · 무게 −10% (당시 규칙)', () => {
      expect(
        next(md(stripNew(stepRun(0)), prior(28))).startsWith(
          '복귀 조정: 세트 −40% · 무게 −10% (당시 규칙) (공백 28일로 재계산)',
        ),
      ).toBe(true)
    })
    it('JJ 이전 모양 + 루틴 사본의 returnProtocol을 []로 → 결과가 같다 (되짚기가 현재 루틴을 읽지 않는다)', () => {
      const empty = { ...ROUTINE, rules: { ...ROUTINE.rules, returnProtocol: [] } } as RoutineTemplate
      const s = stripNew(stepRun(0))
      const a = sessionToMarkdown(s, ROUTINE, catalog, PHASE, undefined, prior(21))
      const b = sessionToMarkdown(s, empty, catalog, PHASE, undefined, prior(21))
      expect(b).toBe(a)
    })
    it('디로드(저장·되짚기)·step 없는 복귀는 JJ 문자열 그대로', () => {
      const dl = done(build('deload'))
      expect(next(md(dl))).toMatch(/^디로드 조정: 세트 −50% — /)
      expect(next(md(stripNew(dl), prior(21)))).toMatch(/^디로드 조정: 세트 −50% \(재계산\) — /)
      expect(next(md(done(build('return'))))).toMatch(/^복귀 조정: 없음 — /)
    })
  })

  describe('entryWeightLine', () => {
    const incline = (step: number, w: number) => {
      const s = build('return', { step: STEPS[step] })
      const e = s.entries.find((x) => x.recordKey === K_INCLINE)!
      return { ...e, sets: e.sets.map((x) => ({ ...x, weight: w, done: true })) }
    }
    it('2단계 인클라인 기준 40 → 복귀 37.5, 수행 40 / 37.5', () => {
      expect(entryWeightLine(incline(1, 40), 'return')).toBe('무게: 기준 40 → 복귀 37.5 · 수행 40')
      expect(entryWeightLine(incline(1, 37.5), 'return')).toBe('무게: 기준 40 → 복귀 37.5 · 수행 37.5')
    })
    it('사다리 최하단(given === base) → 내릴 무게 없음', () => {
      const e = { ...incline(1, 15), returnWeight: { base: 15, given: 15 } }
      expect(entryWeightLine(e, 'return')).toBe('무게: 기준 15 · 내릴 무게 없음 · 수행 15')
    })
    it('어시스티드(given > base)도 기준 → 복귀 모양', () => {
      const e = { ...incline(1, 35), returnWeight: { base: 30, given: 35 } }
      expect(entryWeightLine(e, 'return')).toBe('무게: 기준 30 → 복귀 35 · 수행 35')
    })
    it('1단계·v1.12 세션·대체·얹은 종목·normal은 undefined', () => {
      expect(entryWeightLine(incline(0, 40), 'return')).toBeUndefined()
      const { returnWeight: _r, ...v112 } = incline(1, 40)
      void _r
      expect(entryWeightLine(v112, 'return')).toBeUndefined()
      expect(entryWeightLine({ ...incline(1, 40), substituteFor: K_INCLINE }, 'return')).toBeUndefined()
      expect(entryWeightLine({ ...incline(1, 40), extra: true }, 'return')).toBeUndefined()
      expect(entryWeightLine(incline(1, 40), 'normal')).toBeUndefined()
    })
    it('종목 블록 순서(2단계): 반복 줄 → 세트: → 무게: → 간격: → 보상작용:', () => {
      const lines = md(stepRun(1))
      const i = lines.findIndex((l) => l.startsWith('### 인클라인'))
      const kinds = lines.slice(i + 2, i + 6).map((l) => l.split(':')[0])
      expect(lines[i + 1]).toMatch(/^[\d / ]+$/)
      expect(kinds).toEqual(['세트', '무게', '간격', '보상작용'])
    })
  })

  describe('sessionReturnRirText', () => {
    const run = (i: number) => build('return', { step: STEPS[i] })
    it('KK 1단계 → 복귀 — 반복 3회 남기기 · 3단계 → 반복 4회', () => {
      const s = run(0)
      expect(sessionReturnRirText(s, s.entries[0])).toBe('복귀 — 반복 3회 남기기')
      const s3 = run(2)
      expect(sessionReturnRirText(s3, s3.entries[0])).toBe('복귀 — 반복 4회 남기기')
    })
    it('대체 entry는 붙고 얹은 종목(extra)은 undefined', () => {
      const s = run(0)
      expect(sessionReturnRirText(s, { ...s.entries[0], substituteFor: K_INCLINE })).toBe('복귀 — 반복 3회 남기기')
      expect(sessionReturnRirText(s, { ...s.entries[0], extra: true })).toBeUndefined()
    })
    it('step 없음·v1.12 복귀·normal·deload → undefined', () => {
      const none = build('return')
      expect(sessionReturnRirText(none, none.entries[0])).toBeUndefined()
      const old = { ...run(0), modeAdjust: { setPct: -30, weightPct: -5 } }
      expect(sessionReturnRirText(old, old.entries[0])).toBeUndefined()
      for (const m of ['normal', 'deload'] as const) {
        const s = build(m)
        expect(sessionReturnRirText(s, s.entries[0])).toBeUndefined()
      }
    })
  })

  describe('종료 시트 = 내보내기', () => {
    it('sessionAdjustText 한 줄이 내보내기 헤더 다음 줄과 같다 (KK 1단계)', () => {
      const s = stepRun(0)
      const adjust = resolveSessionAdjust(s, ROUTINE, [s])
      const plan = sessionSetPlan(s, ROUTINE, adjust)
      expect(sessionAdjustText(s, plan, adjust)).toBe(next(md(s)))
    })
  })

  describe('소스 스캔', () => {
    const raw = import.meta.glob(
      ['/src/lib/exportMarkdown.ts', '/src/components/ExerciseCard.tsx', '/src/screens/HomeScreen.tsx', '/src/lib/setPlan.ts'],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>
    const src = (name: string) => stripComments(raw[name])
    it('exportMarkdown.ts·ExerciseCard.tsx·HomeScreen.tsx에 남기기·당시 규칙·한 단계·무게 유지 리터럴 없음', () => {
      for (const f of ['/src/lib/exportMarkdown.ts', '/src/components/ExerciseCard.tsx', '/src/screens/HomeScreen.tsx']) {
        // 디로드 배너의 `세트 50%, 무게 유지`(HomeScreen)는 복귀 문구가 아니라 제외한다
        const text = src(f).replace('디로드 권장 — 세트 50%, 무게 유지', '')
        for (const lit of ['남기기', '당시 규칙', '한 단계', '무게 유지']) expect(text, `${f} ${lit}`).not.toContain(lit)
      }
    })
    it('ExerciseCard.tsx는 targetRIR을 읽지 않는다', () => {
      expect(src('/src/components/ExerciseCard.tsx')).not.toContain('targetRIR')
    })
    it('setPlan.ts: LEGACY_RETURN_PROTOCOL 있음, resolveSessionAdjust 안에 returnStepFor( 없음', () => {
      const s = src('/src/lib/setPlan.ts')
      expect(s).toContain('LEGACY_RETURN_PROTOCOL')
      const body = s.slice(s.indexOf('export function resolveSessionAdjust'), s.indexOf('export interface EntrySetPlan'))
      expect(body).not.toContain('returnStepFor(')
    })
  })
})

// ─── KK3 ─────────────────────────────────────────────────

describe('KK3', () => {
  const day = (id: string) => ROUTINE.days.find((d) => d.id === id)!
  const FALLBACK_PULL = ROUTINE.fallbackDays.find((d) => d.id === 'fallback-pull')!
  /** today 이전 세션만 (그날 세션 전 시점) */
  const before = (today: string) => buildFieldSessions().filter((s) => s.date < today)
  const line = (sessions: Session[], today: string, displayed: RoutineDay) =>
    staleDaysLine(dayLastDone(sessions, ROUTINE, today), sessions, today, displayed)
  const ago = (today: string, n: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const strength = (dayId: string, date: string) => completedSession({ dayId, date })

  it('dayLastDone @ 11-04: D1 29 · D2 19 · D3 6 · D4 null', () => {
    const r = dayLastDone(before('2026-11-04'), ROUTINE, '2026-11-04')
    expect(r.map((x) => [x.day.id, x.days])).toEqual([
      ['d1', 29],
      ['d2', 19],
      ['d3', 6],
      ['d4', null],
    ])
  })
  it('staleDaysLine @ 11-04, 표시 D1', () => {
    expect(line(before('2026-11-04'), '2026-11-04', day('d1'))).toBe(
      '오래 안 한 Day — Day 4 피지크 보완 기록 없음 · Day 2 Pull 19일',
    )
  })
  it('@ 10-29, 표시 D3 → D2는 13일이라 빠진다', () => {
    expect(line(before('2026-10-29'), '2026-10-29', day('d3'))).toBe(
      '오래 안 한 Day — Day 4 피지크 보완 기록 없음 · Day 1 Push 23일',
    )
  })
  it('@ 10-16, 표시 D1 → 둘 다 기록 없음(routine.days 순서) · 표시 D2면 D2가 빠진다', () => {
    const s = before('2026-10-16')
    expect(line(s, '2026-10-16', day('d1'))).toBe(
      '오래 안 한 Day — Day 2 Pull 기록 없음 · Day 4 피지크 보완 기록 없음',
    )
    expect(line(s, '2026-10-16', day('d2'))).toBe('오래 안 한 Day — Day 4 피지크 보완 기록 없음')
  })
  it('표시가 fallback-pull이면 D2가 빠진다(기록 라인 d2)', () => {
    const out = line(before('2026-10-16'), '2026-10-16', FALLBACK_PULL)
    expect(out).toBe('오래 안 한 Day — Day 4 피지크 보완 기록 없음')
    expect(out).not.toContain('Day 2')
  })
  it('경계: 다른 Day 13일 → 빠짐 · 14일 → 포함', () => {
    const today = '2026-11-04'
    const base = [strength('d3', ago(today, 60))]
    const mk = (n: number) => [...base, strength('d1', ago(today, n)), strength('d2', ago(today, 1)), strength('d4', ago(today, 1)), strength('d3', ago(today, 2))]
    expect(line(mk(13), today, day('d3'))).toBeUndefined()
    expect(line(mk(14), today, day('d3'))).toBe('오래 안 한 Day — Day 1 Push 14일')
  })
  it('기록 없음 + 첫 근력 세션 10일 전 → 빠짐 · 14일 전 → 포함', () => {
    const today = '2026-11-04'
    expect(line([strength('d1', ago(today, 10))], today, day('d1'))).toBeUndefined()
    expect(line([strength('d1', ago(today, 14))], today, day('d1'))).toBe(
      '오래 안 한 Day — Day 2 Pull 기록 없음 · Day 3 하체 + 코어 기록 없음 · Day 4 피지크 보완 기록 없음',
    )
  })
  it('주 4회 픽스처(D1 월 · D2 화 · D4 목 · D3 토, 3주) → 어느 날이든 undefined', () => {
    const mon = '2026-10-12'
    const sessions: Session[] = []
    for (let w = 0; w < 3; w++) {
      for (const [id, off] of [['d1', 0], ['d2', 1], ['d4', 3], ['d3', 5]] as const) {
        sessions.push(strength(id, ago(mon, -(w * 7 + off))))
      }
    }
    for (let n = 0; n <= 21; n++) {
      const t = ago(mon, -n)
      const seen = sessions.filter((s) => s.date < t)
      for (const d of ROUTINE.days) expect(line(seen, t, d), `${t} ${d.id}`).toBeUndefined()
    }
  })
  it('세션 없음 · 유산소만 세션뿐 → undefined (근력 기준)', () => {
    expect(line([], '2026-11-04', day('d1'))).toBeUndefined()
    const cardioOnly = buildFieldSessions().filter((s) => s.date === '2026-08-03')
    expect(line(cardioOnly, '2026-11-04', day('d1'))).toBeUndefined()
  })
  it('lastDoneText: null → 기록 없음 · 0 → 오늘 · 19 → 마지막 19일 전', () => {
    expect(lastDoneText(null)).toBe('기록 없음')
    expect(lastDoneText(0)).toBe('오늘')
    expect(lastDoneText(19)).toBe('마지막 19일 전')
  })

  describe('소스 스캔', () => {
    const raw = import.meta.glob(
      [
        '/src/components/DayPickerSheet.tsx',
        '/src/screens/HomeScreen.tsx',
        '/src/lib/dayGap.ts',
        '/src/lib/exportMarkdown.ts',
      ],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>
    const src = (name: string) => stripComments(raw[name])
    it('DayPickerSheet.tsx·HomeScreen.tsx에 daysSinceDay( 없음', () => {
      expect(src('/src/components/DayPickerSheet.tsx')).not.toContain('daysSinceDay(')
      expect(src('/src/screens/HomeScreen.tsx')).not.toContain('daysSinceDay(')
    })
    it('HomeScreen.tsx에 dayLastDone( 한 번', () => {
      expect(src('/src/screens/HomeScreen.tsx').split('dayLastDone(').length - 1).toBe(1)
    })
    it('dayGap.ts의 staleDaysLine 본문에 dayLastDone( 없음', () => {
      const s = src('/src/lib/dayGap.ts')
      expect(s.slice(s.indexOf('export function staleDaysLine'))).not.toContain('dayLastDone(')
    })
    it('exportMarkdown.ts에 function dayLabel 없음', () => {
      expect(src('/src/lib/exportMarkdown.ts')).not.toContain('function dayLabel')
    })
  })
})

// ─── KK4 ─────────────────────────────────────────────────

describe('KK4', () => {
  const day = (id: string) => ROUTINE.days.find((d) => d.id === id)!
  const FALLBACK_PUSH = ROUTINE.fallbackDays.find((d) => d.id === 'fallback-push')!
  const before = (today: string) => buildFieldSessions().filter((s) => s.date < today)
  const notice = (today: string, displayed: RoutineDay, sessions = before(today)) =>
    dayGapNotice({
      sessions,
      routine: ROUTINE,
      day: displayed,
      today,
      returnSuggested: Boolean(suggestNextDay({ sessions, routine: ROUTINE, today }).returnStep),
    })
  const ago = (today: string, n: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const strength = (dayId: string, date: string, mode: SessionMode = 'normal') =>
    completedSession({ dayId, date, mode })
  const all = buildFieldSessions()
  const gapOf = (date: string) => {
    const s = all.find((x) => x.date === date)!
    return sessionDayGapLine(s, ROUTINE, all)
  }

  describe('dayGapNotice', () => {
    it('@ 10-29 D3 → 22일 만 · 마지막 운동 13일 전', () => {
      expect(notice('2026-10-29', day('d3'))).toBe(
        '이 Day는 22일 만이에요 — 복귀 조정은 마지막 운동(13일 전) 기준이라 적용되지 않습니다',
      )
    })
    it('@ 08-28 D3 → 23일 만 · 마지막 운동 2일 전', () => {
      expect(notice('2026-08-28', day('d3'))).toBe(
        '이 Day는 23일 만이에요 — 복귀 조정은 마지막 운동(2일 전) 기준이라 적용되지 않습니다',
      )
    })
    it('@ 09-21 (복귀 제안) D3를 골라도 undefined', () => {
      expect(notice('2026-09-21', day('d3'))).toBeUndefined()
    })
    it('returnSuggested true면 마지막 운동이 14일 미만이어도 undefined (복귀 배너가 말한다)', () => {
      const sessions = before('2026-10-29')
      const call = (returnSuggested: boolean) =>
        dayGapNotice({ sessions, routine: ROUTINE, day: day('d3'), today: '2026-10-29', returnSuggested })
      expect(call(true)).toBeUndefined()
      expect(call(false)).toContain('22일 만이에요')
    })
    it('own 13일 → undefined · 기록 없는 Day → undefined', () => {
      const today = '2026-11-04'
      const s = [strength('d3', ago(today, 13)), strength('d1', ago(today, 2))]
      expect(notice(today, day('d3'), s)).toBeUndefined()
      expect(notice(today, day('d4'), s)).toBeUndefined()
    })
    it('fallback-push는 d1의 공백을 쓴다', () => {
      expect(notice('2026-11-04', FALLBACK_PUSH)).toBe(
        '이 Day는 29일 만이에요 — 복귀 조정은 마지막 운동(6일 전) 기준이라 적용되지 않습니다',
      )
    })
    it('returnSuggested false인데 마지막 근력 세션 14일 전 → undefined · 13일 전 → 문구', () => {
      const today = '2026-11-04'
      const mk = (n: number) => [strength('d3', ago(today, 40)), strength('d1', ago(today, n))]
      const call = (n: number) =>
        dayGapNotice({ sessions: mk(n), routine: ROUTINE, day: day('d3'), today, returnSuggested: false })
      expect(call(14)).toBeUndefined()
      expect(call(13)).toBe(
        '이 Day는 40일 만이에요 — 복귀 조정은 마지막 운동(13일 전) 기준이라 적용되지 않습니다',
      )
    })
  })

  describe('sessionDayGapLine', () => {
    it('08-28 D3 → 23일 · 직전 2일 전', () => {
      expect(gapOf('2026-08-28')).toBe('Day 공백 23일 — 복귀 조정 없음 (직전 근력 세션 2일 전 기준)')
    })
    it('09-22 → 25일 · 1일 전 / 10-07 → 15일 · 1일 전', () => {
      expect(gapOf('2026-09-22')).toBe('Day 공백 25일 — 복귀 조정 없음 (직전 근력 세션 1일 전 기준)')
      expect(gapOf('2026-10-07')).toBe('Day 공백 15일 — 복귀 조정 없음 (직전 근력 세션 1일 전 기준)')
    })
    it('10-29 → 22일 · 13일 전 / 11-04 D1 → 29일 · 6일 전', () => {
      expect(gapOf('2026-10-29')).toBe('Day 공백 22일 — 복귀 조정 없음 (직전 근력 세션 13일 전 기준)')
      expect(gapOf('2026-11-04')).toBe('Day 공백 29일 — 복귀 조정 없음 (직전 근력 세션 6일 전 기준)')
    })
    it('복귀 세션 · 이전 같은 Day 없음 · 유산소만 → 없음', () => {
      for (const d of ['2026-08-26', '2026-09-21', '2026-10-06']) expect(gapOf(d), d).toBeUndefined()
      expect(gapOf('2026-10-16')).toBeUndefined()
      expect(gapOf('2026-08-03')).toBeUndefined()
      expect(gapOf('2026-08-05')).toBeUndefined()
    })
    it('sessions 없이 → 없음 · 디로드 → 없음', () => {
      const s = all.find((x) => x.date === '2026-10-29')!
      expect(sessionDayGapLine(s, ROUTINE)).toBeUndefined()
      expect(sessionDayGapLine({ ...s, mode: 'deload' }, ROUTINE, all)).toBeUndefined()
    })
    it('복귀를 끈 정상 세션: 직전 20일 전 → 없음 · 13일 전 → 13일 전 기준', () => {
      const today = '2026-11-04'
      const run = (lastAgo: number) => {
        const cur = strength('d3', today)
        const sessions = [strength('d3', ago(today, 30)), strength('d1', ago(today, lastAgo)), cur]
        return sessionDayGapLine(cur, ROUTINE, sessions)
      }
      expect(run(20)).toBeUndefined()
      expect(run(13)).toBe('Day 공백 30일 — 복귀 조정 없음 (직전 근력 세션 13일 전 기준)')
    })
    it('줄 위치: 헤더 바로 다음, 수행 순서: 앞', () => {
      const s = all.find((x) => x.date === '2026-10-29')!
      const lines = sessionToMarkdown(s, ROUTINE, catalog, PHASE, undefined, all).split('\n')
      expect(lines[0]).toContain('2026-10-29')
      expect(lines[1]).toMatch(/^Day 공백 22일/)
      expect(lines[2]).toMatch(/^수행 순서:/)
    })
    it('내보내기 전문에 Day 공백 줄은 정확히 다섯 줄 (골든에는 없다)', () => {
      const gapLines = renderFieldExport().split('\n').filter((l) => l.startsWith('Day 공백 '))
      expect(gapLines).toHaveLength(5)
      expect(KK_EXPORT_BEFORE).not.toContain('Day 공백')
    })
  })

  describe('holdReasonText 세트 부족', () => {
    it('복귀 · 정상 · 디로드는 끝에 다음 시험을 말한다', () => {
      const r = (planned: number, done: number, mode: SessionMode) =>
        holdReasonText({ kind: 'sets', planned, done, mode })
      expect(r(3, 2, 'return')).toBe('반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션 — 3세트로는 아직 시험 안 됨')
      expect(r(4, 3, 'normal')).toBe('반복 상단 도달 · 계획 4세트 중 3세트 — 4세트로는 아직 시험 안 됨')
      expect(r(4, 3, 'deload')).toBe('반복 상단 도달 · 계획 4세트 중 3세트 · 디로드 세션 — 4세트로는 아직 시험 안 됨')
    })
    it('reps · compensation · phase0는 이전 문구 그대로', () => {
      expect(holdReasonText({ kind: 'reps', repMax: 12, total: 3, reached: 1 })).toBe('반복 상단(12회) 미달 — 3세트 중 1세트 도달')
      expect(holdReasonText({ kind: 'compensation' })).toBe('보상작용 있음')
      expect(holdReasonText({ kind: 'phase0' })).toBe('Phase 0 — 증량 판정 꺼짐')
    })
  })

  describe('소스 스캔', () => {
    const raw = import.meta.glob(
      ['/src/screens/HomeScreen.tsx', '/src/lib/exportMarkdown.ts', '/src/lib/progression.ts'],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>
    const src = (name: string) => stripComments(raw[name])
    const count = (text: string, needle: string) => text.split(needle).length - 1
    it('HomeScreen·exportMarkdown에 문구 리터럴 없음', () => {
      for (const f of ['/src/screens/HomeScreen.tsx', '/src/lib/exportMarkdown.ts']) {
        expect(src(f)).not.toContain('일 만이에요')
        expect(src(f)).not.toContain('Day 공백')
      }
    })
    it('dayGapNotice( · sessionDayGapLine( 각 한 번', () => {
      expect(count(src('/src/screens/HomeScreen.tsx'), 'dayGapNotice(')).toBe(1)
      expect(count(src('/src/lib/exportMarkdown.ts'), 'sessionDayGapLine(')).toBe(1)
    })
    it('progression.ts에 아직 시험 안 됨 한 번', () => {
      expect(count(src('/src/lib/progression.ts'), '아직 시험 안 됨')).toBe(1)
    })
  })
})
