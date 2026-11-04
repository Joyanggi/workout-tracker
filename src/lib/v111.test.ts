import { describe, expect, it } from 'vitest'
import { buildPrefill, computeProgression, defaultSetFor } from './prefill'
import {
  holdReasonText,
  judgeProgression,
  lastHoldChipText,
  progressionSuggestions,
  progressionVerdicts,
  type HoldReason,
} from './progression'
import { formatProgression, scaleFor } from './weightScale'
import { stripComments } from './sourceScan'
import { ROUTINE } from './testFixtures'
import { sessionToMarkdown } from './exportMarkdown'
import EXERCISES from '../data/exercises.json'
import { isInverseKey } from './weightScale'
import { NO_COMPENSATION, makeRecordKey } from '../types'
import type { Exercise, Phase, RoutineExercise, Session, SessionEntry, SessionMode } from '../types'

/**
 * v1.11 GG1 — 보류 사유를 판정 함수가 돌려준다.
 * 이 파일의 GG1_GOLDEN은 리팩터링 전(v1.10.0) 코드로 만든 표이고 이후 커밋에서 고치지 않는다.
 */

export const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))

// ─── 격자 (골든 비교용) ──────────────────────────────────

export type Pattern = 'all' | 'oneShort' | 'allShort'
export type Kind = 'normal' | 'assist'
export interface GridCell {
  key: string
  kind: Kind
  comp: boolean
  n: number
  pattern: Pattern
  mode: SessionMode
}

const planned = (dayId: string, exerciseId: string): RoutineExercise =>
  ROUTINE.days.find((d) => d.id === dayId)!.exercises.find((e) => e.exerciseId === exerciseId)!

export const NORMAL_RE = planned('d1', 'incline-chest-press') // 4세트 · 상단 10
export const ASSIST_ORIGIN = planned('d2', 'lat-pulldown') // 4세트 · 상단 12 (어시스트로 대체 수행)
export const NORMAL_KEY = makeRecordKey('incline-chest-press', 'd1')
export const ASSIST_KEY = makeRecordKey('assisted-pullup', 'd2')
export const ASSIST_ORIGIN_KEY = makeRecordKey('lat-pulldown', 'd2')
export const PHASE: Phase = 1

const KINDS: Kind[] = ['normal', 'assist']
const PATTERNS: Pattern[] = ['all', 'oneShort', 'allShort']
const MODES: SessionMode[] = ['normal', 'deload', 'return']

export function gridCells(): GridCell[] {
  const out: GridCell[] = []
  for (const kind of KINDS) {
    const planned = kind === 'normal' ? NORMAL_RE.sets : ASSIST_ORIGIN.sets
    for (const comp of [false, true])
      for (let n = 1; n <= planned + 1; n++)
        for (const pattern of PATTERNS)
          for (const mode of MODES)
            out.push({ key: `${kind}|${comp ? 'comp' : 'ok'}|n${n}|${pattern}|${mode}`, kind, comp, n, pattern, mode })
  }
  return out
}

export function cellSets(c: GridCell) {
  const repMax = c.kind === 'normal' ? NORMAL_RE.repMax : ASSIST_ORIGIN.repMax
  const repMin = c.kind === 'normal' ? NORMAL_RE.repMin : ASSIST_ORIGIN.repMin
  const w = c.kind === 'normal' ? 30 : 40
  return Array.from({ length: c.n }, (_, i) => ({
    weight: w,
    reps: c.pattern === 'all' ? repMax : c.pattern === 'allShort' ? repMin : i === 0 ? repMax - 1 : repMax,
    done: true,
    doneAt: '2026-08-26T10:00:00.000Z',
  }))
}

export function cellSession(c: GridCell): Session {
  const entry: SessionEntry = {
    recordKey: c.kind === 'normal' ? NORMAL_KEY : ASSIST_KEY,
    plannedOrder: 1,
    performedOrder: 1,
    sets: cellSets(c),
    compensation: c.comp ? '허리 젖힘' : NO_COMPENSATION,
    skipped: false,
    ...(c.kind === 'assist' ? { substituteFor: ASSIST_ORIGIN_KEY } : {}),
  }
  return {
    id: 'g', date: '2026-08-26', dayId: c.kind === 'normal' ? 'd1' : 'd2', routineId: ROUTINE.id,
    mode: c.mode, startedAt: '2026-08-26T09:00:00.000Z', endedAt: '2026-08-26T10:30:00.000Z', entries: [entry],
  }
}

/** 현행(v1.10.0) 두 구현을 같은 칸에 돌린다. 둘이 어긋나면 'MISMATCH'. */
export function legacyCell(c: GridCell): string {
  const session = cellSession(c)
  const sug = progressionSuggestions(session, ROUTINE, PHASE, undefined, catalog)
  const re = c.kind === 'normal' ? NORMAL_RE : { ...ASSIST_ORIGIN, exerciseId: 'assisted-pullup' }
  const key = c.kind === 'normal' ? NORMAL_KEY : ASSIST_KEY
  const inverse = isInverseKey(catalog, key)
  const cp = computeProgression({
    routine: ROUTINE,
    routineExercise: re,
    phase: PHASE,
    lastSets: cellSets(c).map((s) => ({ weight: s.weight, reps: s.reps })),
    lastCompensation: session.entries[0].compensation,
    scale: { ...scaleFor(undefined, key, ROUTINE.rules.weightIncrementKg), inverse },
  })
  const a = sug.length === 0 ? 'H' : `U${sug[0].to}`
  const b = cp === undefined ? 'H' : `U${cp.to}`
  return a === b ? a : `MISMATCH(${a},${b})`
}

/** 2026-08-26 필드 리포트 재현 세션 (보고서 0·2절 숫자): 복귀 모드, 계획보다 세트가 적고 전부 상단 */
export function fieldSession(): Session {
  const mk = (exerciseId: string, order: number, weight: number, reps: number[]): SessionEntry => ({
    recordKey: makeRecordKey(exerciseId, 'd1'),
    plannedOrder: order,
    performedOrder: order,
    firstSetAt: '2026-08-26T09:00:00.000Z',
    sets: reps.map((r, i) => ({ weight, reps: r, done: true, doneAt: `2026-08-26T09:${10 + i * 3}:00.000Z` })),
    compensation: NO_COMPENSATION,
    skipped: false,
  })
  return {
    id: 'field', date: '2026-08-26', dayId: 'd1', routineId: ROUTINE.id, mode: 'return',
    startedAt: '2026-08-26T09:00:00.000Z', endedAt: '2026-08-26T10:30:00.000Z',
    entries: [
      mk('incline-chest-press', 1, 30, [10, 10, 10]),
      mk('flat-chest-press', 2, 25, [12, 12]),
      mk('shoulder-press', 3, 15, [12, 12]),
    ],
  }
}

/**
 * v1.10.0 코드(`2249b85`)로 만든 골든 표. 칸마다 증량 판정: H=유지, U<n>=증량(n=다음 무게).
 * **이후 커밋에서 고치지 않는다.**
 */
export const GG1_GOLDEN: Record<string, string> = {
  'normal|ok|n1|all|normal': 'H',
  'normal|ok|n1|all|deload': 'H',
  'normal|ok|n1|all|return': 'H',
  'normal|ok|n1|oneShort|normal': 'H',
  'normal|ok|n1|oneShort|deload': 'H',
  'normal|ok|n1|oneShort|return': 'H',
  'normal|ok|n1|allShort|normal': 'H',
  'normal|ok|n1|allShort|deload': 'H',
  'normal|ok|n1|allShort|return': 'H',
  'normal|ok|n2|all|normal': 'H',
  'normal|ok|n2|all|deload': 'H',
  'normal|ok|n2|all|return': 'H',
  'normal|ok|n2|oneShort|normal': 'H',
  'normal|ok|n2|oneShort|deload': 'H',
  'normal|ok|n2|oneShort|return': 'H',
  'normal|ok|n2|allShort|normal': 'H',
  'normal|ok|n2|allShort|deload': 'H',
  'normal|ok|n2|allShort|return': 'H',
  'normal|ok|n3|all|normal': 'H',
  'normal|ok|n3|all|deload': 'H',
  'normal|ok|n3|all|return': 'H',
  'normal|ok|n3|oneShort|normal': 'H',
  'normal|ok|n3|oneShort|deload': 'H',
  'normal|ok|n3|oneShort|return': 'H',
  'normal|ok|n3|allShort|normal': 'H',
  'normal|ok|n3|allShort|deload': 'H',
  'normal|ok|n3|allShort|return': 'H',
  'normal|ok|n4|all|normal': 'U32.5',
  'normal|ok|n4|all|deload': 'U32.5',
  'normal|ok|n4|all|return': 'U32.5',
  'normal|ok|n4|oneShort|normal': 'H',
  'normal|ok|n4|oneShort|deload': 'H',
  'normal|ok|n4|oneShort|return': 'H',
  'normal|ok|n4|allShort|normal': 'H',
  'normal|ok|n4|allShort|deload': 'H',
  'normal|ok|n4|allShort|return': 'H',
  'normal|ok|n5|all|normal': 'U32.5',
  'normal|ok|n5|all|deload': 'U32.5',
  'normal|ok|n5|all|return': 'U32.5',
  'normal|ok|n5|oneShort|normal': 'H',
  'normal|ok|n5|oneShort|deload': 'H',
  'normal|ok|n5|oneShort|return': 'H',
  'normal|ok|n5|allShort|normal': 'H',
  'normal|ok|n5|allShort|deload': 'H',
  'normal|ok|n5|allShort|return': 'H',
  'normal|comp|n1|all|normal': 'H',
  'normal|comp|n1|all|deload': 'H',
  'normal|comp|n1|all|return': 'H',
  'normal|comp|n1|oneShort|normal': 'H',
  'normal|comp|n1|oneShort|deload': 'H',
  'normal|comp|n1|oneShort|return': 'H',
  'normal|comp|n1|allShort|normal': 'H',
  'normal|comp|n1|allShort|deload': 'H',
  'normal|comp|n1|allShort|return': 'H',
  'normal|comp|n2|all|normal': 'H',
  'normal|comp|n2|all|deload': 'H',
  'normal|comp|n2|all|return': 'H',
  'normal|comp|n2|oneShort|normal': 'H',
  'normal|comp|n2|oneShort|deload': 'H',
  'normal|comp|n2|oneShort|return': 'H',
  'normal|comp|n2|allShort|normal': 'H',
  'normal|comp|n2|allShort|deload': 'H',
  'normal|comp|n2|allShort|return': 'H',
  'normal|comp|n3|all|normal': 'H',
  'normal|comp|n3|all|deload': 'H',
  'normal|comp|n3|all|return': 'H',
  'normal|comp|n3|oneShort|normal': 'H',
  'normal|comp|n3|oneShort|deload': 'H',
  'normal|comp|n3|oneShort|return': 'H',
  'normal|comp|n3|allShort|normal': 'H',
  'normal|comp|n3|allShort|deload': 'H',
  'normal|comp|n3|allShort|return': 'H',
  'normal|comp|n4|all|normal': 'H',
  'normal|comp|n4|all|deload': 'H',
  'normal|comp|n4|all|return': 'H',
  'normal|comp|n4|oneShort|normal': 'H',
  'normal|comp|n4|oneShort|deload': 'H',
  'normal|comp|n4|oneShort|return': 'H',
  'normal|comp|n4|allShort|normal': 'H',
  'normal|comp|n4|allShort|deload': 'H',
  'normal|comp|n4|allShort|return': 'H',
  'normal|comp|n5|all|normal': 'H',
  'normal|comp|n5|all|deload': 'H',
  'normal|comp|n5|all|return': 'H',
  'normal|comp|n5|oneShort|normal': 'H',
  'normal|comp|n5|oneShort|deload': 'H',
  'normal|comp|n5|oneShort|return': 'H',
  'normal|comp|n5|allShort|normal': 'H',
  'normal|comp|n5|allShort|deload': 'H',
  'normal|comp|n5|allShort|return': 'H',
  'assist|ok|n1|all|normal': 'H',
  'assist|ok|n1|all|deload': 'H',
  'assist|ok|n1|all|return': 'H',
  'assist|ok|n1|oneShort|normal': 'H',
  'assist|ok|n1|oneShort|deload': 'H',
  'assist|ok|n1|oneShort|return': 'H',
  'assist|ok|n1|allShort|normal': 'H',
  'assist|ok|n1|allShort|deload': 'H',
  'assist|ok|n1|allShort|return': 'H',
  'assist|ok|n2|all|normal': 'H',
  'assist|ok|n2|all|deload': 'H',
  'assist|ok|n2|all|return': 'H',
  'assist|ok|n2|oneShort|normal': 'H',
  'assist|ok|n2|oneShort|deload': 'H',
  'assist|ok|n2|oneShort|return': 'H',
  'assist|ok|n2|allShort|normal': 'H',
  'assist|ok|n2|allShort|deload': 'H',
  'assist|ok|n2|allShort|return': 'H',
  'assist|ok|n3|all|normal': 'H',
  'assist|ok|n3|all|deload': 'H',
  'assist|ok|n3|all|return': 'H',
  'assist|ok|n3|oneShort|normal': 'H',
  'assist|ok|n3|oneShort|deload': 'H',
  'assist|ok|n3|oneShort|return': 'H',
  'assist|ok|n3|allShort|normal': 'H',
  'assist|ok|n3|allShort|deload': 'H',
  'assist|ok|n3|allShort|return': 'H',
  'assist|ok|n4|all|normal': 'U37.5',
  'assist|ok|n4|all|deload': 'U37.5',
  'assist|ok|n4|all|return': 'U37.5',
  'assist|ok|n4|oneShort|normal': 'H',
  'assist|ok|n4|oneShort|deload': 'H',
  'assist|ok|n4|oneShort|return': 'H',
  'assist|ok|n4|allShort|normal': 'H',
  'assist|ok|n4|allShort|deload': 'H',
  'assist|ok|n4|allShort|return': 'H',
  'assist|ok|n5|all|normal': 'U37.5',
  'assist|ok|n5|all|deload': 'U37.5',
  'assist|ok|n5|all|return': 'U37.5',
  'assist|ok|n5|oneShort|normal': 'H',
  'assist|ok|n5|oneShort|deload': 'H',
  'assist|ok|n5|oneShort|return': 'H',
  'assist|ok|n5|allShort|normal': 'H',
  'assist|ok|n5|allShort|deload': 'H',
  'assist|ok|n5|allShort|return': 'H',
  'assist|comp|n1|all|normal': 'H',
  'assist|comp|n1|all|deload': 'H',
  'assist|comp|n1|all|return': 'H',
  'assist|comp|n1|oneShort|normal': 'H',
  'assist|comp|n1|oneShort|deload': 'H',
  'assist|comp|n1|oneShort|return': 'H',
  'assist|comp|n1|allShort|normal': 'H',
  'assist|comp|n1|allShort|deload': 'H',
  'assist|comp|n1|allShort|return': 'H',
  'assist|comp|n2|all|normal': 'H',
  'assist|comp|n2|all|deload': 'H',
  'assist|comp|n2|all|return': 'H',
  'assist|comp|n2|oneShort|normal': 'H',
  'assist|comp|n2|oneShort|deload': 'H',
  'assist|comp|n2|oneShort|return': 'H',
  'assist|comp|n2|allShort|normal': 'H',
  'assist|comp|n2|allShort|deload': 'H',
  'assist|comp|n2|allShort|return': 'H',
  'assist|comp|n3|all|normal': 'H',
  'assist|comp|n3|all|deload': 'H',
  'assist|comp|n3|all|return': 'H',
  'assist|comp|n3|oneShort|normal': 'H',
  'assist|comp|n3|oneShort|deload': 'H',
  'assist|comp|n3|oneShort|return': 'H',
  'assist|comp|n3|allShort|normal': 'H',
  'assist|comp|n3|allShort|deload': 'H',
  'assist|comp|n3|allShort|return': 'H',
  'assist|comp|n4|all|normal': 'H',
  'assist|comp|n4|all|deload': 'H',
  'assist|comp|n4|all|return': 'H',
  'assist|comp|n4|oneShort|normal': 'H',
  'assist|comp|n4|oneShort|deload': 'H',
  'assist|comp|n4|oneShort|return': 'H',
  'assist|comp|n4|allShort|normal': 'H',
  'assist|comp|n4|allShort|deload': 'H',
  'assist|comp|n4|allShort|return': 'H',
  'assist|comp|n5|all|normal': 'H',
  'assist|comp|n5|all|deload': 'H',
  'assist|comp|n5|all|return': 'H',
  'assist|comp|n5|oneShort|normal': 'H',
  'assist|comp|n5|oneShort|deload': 'H',
  'assist|comp|n5|oneShort|return': 'H',
  'assist|comp|n5|allShort|normal': 'H',
  'assist|comp|n5|allShort|deload': 'H',
  'assist|comp|n5|allShort|return': 'H',
}

/** v1.10.0 내보내기의 2026-08-26 픽스처 출력 (`## ` 헤더 줄은 시간대 의존이라 제외) */
export const GG1_EXPORT_BEFORE: string[] = [
  "수행 순서: 인클라인 프레스 → 체스트프레스 → 숄더프레스",
  "",
  "### 인클라인 프레스 (D1/A) 30kg",
  "10 / 10 / 10",
  "간격: 3:00 / 3:00",
  "보상작용: 없음",
  "다음: 30kg 유지",
  "",
  "### 체스트프레스 (D1/A) 25kg",
  "12 / 12",
  "간격: 3:00",
  "보상작용: 없음",
  "다음: 25kg 유지",
  "",
  "### 숄더프레스 (D1/A) 15kg",
  "12 / 12",
  "간격: 3:00",
  "보상작용: 없음",
  "다음: 15kg 유지"
]

describe('GG1 골든 (리팩터링 전 기준)', () => {
  it('격자 180칸 전부 현행 progressionSuggestions·computeProgression이 골든과 같다', () => {
    const cells = gridCells()
    expect(cells).toHaveLength(180)
    expect(Object.keys(GG1_GOLDEN)).toHaveLength(180)
    for (const c of cells) expect(legacyCell(c), c.key).toBe(GG1_GOLDEN[c.key])
  })
})

// ─── GG1 본 검증 ────────────────────────────────────────

const PHASE0_OFF = { ...ROUTINE, rules: { ...ROUTINE.rules, allowProgressionInPhase0: false } }
const refs = (weight: number, reps: number[]) => reps.map((r) => ({ weight, reps: r }))
const inclineJudge = (reps: number[], extra: Partial<Parameters<typeof judgeProgression>[0]> = {}) =>
  judgeProgression({ routine: ROUTINE, routineExercise: NORMAL_RE, phase: PHASE, sets: refs(30, reps), ...extra })
const reasonOf = (v: ReturnType<typeof judgeProgression>) => (v as { reason: HoldReason }).reason

describe('GG1 — 보류 사유', () => {
  it('사유 우선순위: 보상작용 > 반복 미달 > 세트 부족 > 증량', () => {
    // 보상작용 + 반복 미달 + 세트 부족
    expect(inclineJudge([10, 8], { compensation: '허리 젖힘' })).toEqual({
      kind: 'hold', from: 30, reason: { kind: 'compensation' },
    })
    // 반복 미달 + 세트 부족 → 반복 (세트를 채워도 증량이 안 되므로 세트 부족이라 말하면 틀린 처방)
    expect(inclineJudge([10, 8])).toMatchObject({ kind: 'hold', reason: { kind: 'reps', reached: 1, total: 2 } })
    // 전 세트 상단 + 세트 부족
    expect(inclineJudge([10, 10, 10])).toMatchObject({ kind: 'hold', reason: { kind: 'sets', done: 3, planned: 4 } })
    // 전부 충족
    expect(inclineJudge([10, 10, 10, 10])).toEqual({ kind: 'up', from: 30, to: 32.5 })
  })

  it('판정 대상 아님: B그룹 · 수행 세트 없음 → undefined', () => {
    const bEx = ROUTINE.days.flatMap((d) => d.exercises).find((e) => e.group === 'B')!
    expect(judgeProgression({ routine: ROUTINE, routineExercise: bEx, phase: PHASE, sets: refs(20, [15, 15, 15]) })).toBeUndefined()
    expect(inclineJudge([])).toBeUndefined()
  })

  it('판정 불변(전수, 골든 비교): judgeProgression과 두 래퍼가 GG1_GOLDEN과 칸 단위로 같다', () => {
    for (const c of gridCells()) {
      const golden = GG1_GOLDEN[c.key]
      const re = c.kind === 'normal' ? NORMAL_RE : { ...ASSIST_ORIGIN, exerciseId: 'assisted-pullup' }
      const key = c.kind === 'normal' ? NORMAL_KEY : ASSIST_KEY
      const session = cellSession(c)
      const scale = { ...scaleFor(undefined, key, ROUTINE.rules.weightIncrementKg), inverse: isInverseKey(catalog, key) }
      const v = judgeProgression({
        routine: ROUTINE, routineExercise: re, phase: PHASE, sets: cellSets(c),
        compensation: session.entries[0].compensation, mode: c.mode, scale,
      })
      expect(v?.kind === 'up' ? `U${v.to}` : 'H', `judge ${c.key}`).toBe(golden)
      expect(legacyCell(c), `wrappers ${c.key}`).toBe(golden)
      const sug = progressionSuggestions(session, ROUTINE, PHASE, undefined, catalog)
      expect(sug.length === 0 ? 'H' : `U${sug[0].to}`, `suggestions ${c.key}`).toBe(golden)
    }
  })

  it('필드리포트 재현: 인클라인 30kg 10/10/10 · 복귀 → sets 3/4 복귀 세션, 체스트프레스 12/12 → 3세트 중 2세트', () => {
    const v = inclineJudge([10, 10, 10], { mode: 'return' })
    expect(v).toEqual({ kind: 'hold', from: 30, reason: { kind: 'sets', done: 3, planned: 4, mode: 'return' } })
    expect(holdReasonText(reasonOf(v))).toBe('반복 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션')
    const chest = judgeProgression({
      routine: ROUTINE, routineExercise: planned('d1', 'flat-chest-press'), phase: PHASE, sets: refs(25, [12, 12]),
    })
    expect(holdReasonText(reasonOf(chest))).toBe('반복 상단 도달 · 계획 3세트 중 2세트')
  })

  it('디로드: 같은 입력, mode deload → "· 디로드 세션"', () => {
    const v = inclineJudge([10, 10, 10], { mode: 'deload' })
    expect(holdReasonText(reasonOf(v))).toBe('반복 상단 도달 · 계획 4세트 중 3세트 · 디로드 세션')
  })

  it('반복 미달 문구: 10/8/7, repMax 10 → "반복 상단(10회) 미달 — 3세트 중 1세트 도달"', () => {
    expect(holdReasonText(reasonOf(inclineJudge([10, 8, 7])))).toBe('반복 상단(10회) 미달 — 3세트 중 1세트 도달')
  })

  it('보상작용·Phase 0 문구', () => {
    expect(holdReasonText({ kind: 'compensation' })).toBe('보상작용 있음')
    expect(holdReasonText({ kind: 'phase0' })).toBe('Phase 0 — 증량 판정 꺼짐')
  })

  it('Phase 0 꺼진 루틴 사본 → phase0, 배포 루틴은 켜져 있어 phase0이 나오지 않는다', () => {
    const off = judgeProgression({ routine: PHASE0_OFF, routineExercise: NORMAL_RE, phase: 0, sets: refs(30, [10, 10, 10, 10]) })
    expect(off).toEqual({ kind: 'hold', from: 30, reason: { kind: 'phase0' } })
    expect(ROUTINE.rules.allowProgressionInPhase0).toBe(true)
    const on = judgeProgression({ routine: ROUTINE, routineExercise: NORMAL_RE, phase: 0, sets: refs(30, [10, 10, 10, 10]) })
    expect(on?.kind).toBe('up')
  })

  it('대체 종목: 대체 entry는 원 종목의 sets·repMax로 판정한다', () => {
    const s = cellSession({ key: '', kind: 'assist', comp: false, n: 3, pattern: 'all', mode: 'normal' })
    const v = progressionVerdicts(s, ROUTINE, PHASE, undefined, catalog).get(ASSIST_KEY)
    expect(v).toMatchObject({ kind: 'hold', reason: { kind: 'sets', done: 3, planned: ASSIST_ORIGIN.sets } })
    const short = cellSession({ key: '', kind: 'assist', comp: false, n: 4, pattern: 'oneShort', mode: 'normal' })
    expect(progressionVerdicts(short, ROUTINE, PHASE, undefined, catalog).get(ASSIST_KEY)).toMatchObject({
      kind: 'hold', reason: { kind: 'reps', repMax: ASSIST_ORIGIN.repMax, reached: 3, total: 4 },
    })
  })

  it('어시스트(inverse): hold 사유는 같고, 스택 최대 up은 formatProgression의 "보조 없이"', () => {
    const hold = cellSession({ key: '', kind: 'assist', comp: false, n: 4, pattern: 'oneShort', mode: 'normal' })
    expect(progressionVerdicts(hold, ROUTINE, PHASE, undefined, catalog).get(ASSIST_KEY)).toMatchObject({
      kind: 'hold', reason: { kind: 'reps' },
    })
    const top = judgeProgression({
      routine: ROUTINE, routineExercise: { ...ASSIST_ORIGIN, exerciseId: 'assisted-pullup' }, phase: PHASE,
      sets: refs(0, [12, 12, 12, 12]), scale: { step: 2.5, inverse: true },
    })
    expect(top).toEqual({ kind: 'up', from: 0, to: null })
    expect(formatProgression(0, null, true)).toMatch(/보조 없이/)
  })

  it('얹은 종목(extra): 판정이 현행 progressionSuggestions와 같다', () => {
    const s = fieldSession()
    s.entries = [
      {
        recordKey: makeRecordKey('lat-pulldown', 'd2'), plannedOrder: 9, performedOrder: 4, extra: true,
        sets: [12, 12, 12, 12].map((r) => ({ weight: 30, reps: r, done: true })), compensation: NO_COMPENSATION, skipped: false,
      },
    ]
    const sug = progressionSuggestions(s, ROUTINE, PHASE, undefined, catalog)
    expect(sug.map((p) => [p.recordKey, p.from, p.to])).toEqual([[makeRecordKey('lat-pulldown', 'd2'), 30, 32.5]])
  })

  it('워밍업 세트는 done·total·planned 비교 어디에도 세지 않는다', () => {
    const wu = { weight: 10, reps: 5, done: true, warmup: true as const }
    const entry = (sets: SessionEntry['sets']): Session => ({
      ...fieldSession(), entries: [{ ...fieldSession().entries[0], sets }],
    })
    const work = (n: number) => Array.from({ length: n }, () => ({ weight: 30, reps: 10, done: true }))
    const three = progressionVerdicts(entry([wu, ...work(3)]), ROUTINE, PHASE).get(NORMAL_KEY)
    expect(three).toMatchObject({ kind: 'hold', from: 30, reason: { kind: 'sets', done: 3 } })
    expect(progressionVerdicts(entry([wu, ...work(4)]), ROUTINE, PHASE).get(NORMAL_KEY)?.kind).toBe('up')
  })

  it('스택 최대: up to:null → 내보내기 줄이 현행 문자열과 같다', () => {
    const scales = new Map([[NORMAL_KEY, { step: 2.5, ladder: [20, 30] }]])
    const s = { ...fieldSession(), mode: 'normal' as const }
    s.entries = [
      {
        ...s.entries[0],
        sets: [10, 10, 10, 10].map((r) => ({ weight: 30, reps: r, done: true, doneAt: '2026-08-26T09:10:00.000Z' })),
      },
    ]
    const md = sessionToMarkdown(s, ROUTINE, catalog, PHASE, scales)
    expect(md).toContain('다음: 30kg 유지 (증량 조건 충족 — 스택 최대)')
  })
})

describe('GG1 — prefill', () => {
  const done = (date: string, mode: SessionMode, reps: number[], weight = 30): Session => ({
    ...fieldSession(), id: date, date, mode, startedAt: `${date}T09:00:00.000Z`, endedAt: `${date}T10:30:00.000Z`,
    entries: [{ ...fieldSession().entries[0], sets: reps.map((r) => ({ weight, reps: r, done: true })) }],
  })
  const prefillOf = (sessions: Session[]) =>
    buildPrefill({ sessions, routine: ROUTINE, recordKey: NORMAL_KEY, routineExercise: NORMAL_RE, phase: PHASE })

  it('복귀 세션(3/4, 전부 상단) 다음 날: lastVerdict = hold sets/return, progression 없음, 칩 문구', () => {
    const p = prefillOf([done('2026-08-26', 'return', [10, 10, 10])])
    expect(p.lastVerdict).toEqual({ kind: 'hold', from: 30, reason: { kind: 'sets', done: 3, planned: 4, mode: 'return' } })
    expect(p.progression).toBeUndefined()
    expect(lastHoldChipText(p.lastVerdict)).toBe(
      '지난번 상단 도달 · 계획 4세트 중 3세트 완료 · 복귀 세션 — 오늘 4세트 모두 완료하면 증량 판정',
    )
  })

  it('그 다음 정상 세션 4/4 전부 상단 → progression up', () => {
    const p = prefillOf([done('2026-08-26', 'return', [10, 10, 10]), done('2026-08-28', 'normal', [10, 10, 10, 10])])
    expect(p.lastVerdict?.kind).toBe('up')
    expect(p.progression).toEqual({ from: 30, to: 32.5 })
  })

  it('미체크 행: 4행 중 3행만 체크 → hold sets {done:3}, 칩 숫자 "3세트 완료"', () => {
    const s = done('2026-08-26', 'return', [10, 10, 10, 10])
    s.entries[0].sets[3].done = false
    const p = prefillOf([s])
    expect(p.lastVerdict).toMatchObject({ kind: 'hold', reason: { kind: 'sets', done: 3, planned: 4 } })
    expect(lastHoldChipText(p.lastVerdict)).toContain('4세트 중 3세트 완료')
  })

  it('lastHoldChipText: reps·compensation·phase0·up·undefined → undefined', () => {
    expect(lastHoldChipText({ kind: 'hold', from: 30, reason: { kind: 'reps', reached: 1, total: 3, repMax: 10 } })).toBeUndefined()
    expect(lastHoldChipText({ kind: 'hold', from: 30, reason: { kind: 'compensation' } })).toBeUndefined()
    expect(lastHoldChipText({ kind: 'hold', from: 30, reason: { kind: 'phase0' } })).toBeUndefined()
    expect(lastHoldChipText({ kind: 'up', from: 30, to: 32.5 })).toBeUndefined()
    expect(lastHoldChipText(undefined)).toBeUndefined()
  })

  it('디로드 직전 세션 → "· 디로드 세션" 접미사', () => {
    const p = prefillOf([done('2026-08-26', 'deload', [10, 10])])
    expect(lastHoldChipText(p.lastVerdict)).toContain('· 디로드 세션')
  })
})

describe('GG1 — 내보내기', () => {
  const line = (md: string, exName: string) => {
    const lines = md.split('\n')
    const i = lines.findIndex((l) => l.startsWith(`### ${exName}`))
    return lines.slice(i, i + 8).find((l) => l.startsWith('다음:'))
  }
  const one = (mutate: (e: SessionEntry) => void, routine = ROUTINE, phase: Phase = PHASE) => {
    const s = fieldSession()
    s.mode = 'normal'
    s.entries = [s.entries[0]]
    mutate(s.entries[0])
    return sessionToMarkdown(s, routine, catalog, phase)
  }
  const sets = (reps: number[]) => reps.map((r) => ({ weight: 30, reps: r, done: true, doneAt: '2026-08-26T09:10:00.000Z' }))

  it('사유 4종의 "다음:" 줄', () => {
    expect(line(one((e) => (e.sets = sets([10, 10, 10]))), '인클라인')).toBe('다음: 30kg 유지 (반복 상단 도달 · 계획 4세트 중 3세트)')
    expect(line(one((e) => (e.sets = sets([10, 8, 7, 7]))), '인클라인')).toBe('다음: 30kg 유지 (반복 상단(10회) 미달 — 4세트 중 1세트 도달)')
    expect(
      line(one((e) => { e.sets = sets([10, 10, 10, 10]); e.compensation = '허리 젖힘' }), '인클라인'),
    ).toBe('다음: 30kg 유지 (보상작용 있음)')
    expect(line(one((e) => (e.sets = sets([10, 10, 10, 10])), PHASE0_OFF, 0), '인클라인')).toBe('다음: 30kg 유지 (Phase 0 — 증량 판정 꺼짐)')
    expect(line(one((e) => (e.sets = sets([10, 10, 10, 10]))), '인클라인')).toBe('다음: 32.5kg로 증량')
  })

  it('B그룹은 "다음:" 줄이 없다 (현행)', () => {
    const day = ROUTINE.days.find((d) => d.exercises.some((e) => e.group === 'B'))!
    const bEx = day.exercises.find((e) => e.group === 'B')!
    const s = fieldSession()
    s.dayId = day.id
    s.entries = [{ ...s.entries[0], recordKey: makeRecordKey(bEx.exerciseId, day.id), sets: sets([15, 15, 15]) }]
    expect(sessionToMarkdown(s, ROUTINE, catalog, PHASE)).not.toContain('다음:')
  })
})

describe('GG1 — 과거 판정 불변 (2026-08-26 픽스처)', () => {
  const after = () =>
    sessionToMarkdown(fieldSession(), ROUTINE, catalog, PHASE).split('\n').filter((l) => !l.startsWith('## '))

  it('② 새 내보내기와 GG1_EXPORT_BEFORE의 diff는 A그룹 "다음: … 유지" 세 줄뿐이고 괄호 사유만 늘었다', () => {
    const now = after()
    expect(now).toHaveLength(GG1_EXPORT_BEFORE.length)
    const changed = now.map((l, i) => [GG1_EXPORT_BEFORE[i], l]).filter(([b, a]) => b !== a)
    expect(changed).toEqual([
      ['다음: 30kg 유지', '다음: 30kg 유지 (반복 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션)'],
      ['다음: 25kg 유지', '다음: 25kg 유지 (반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션)'],
      ['다음: 15kg 유지', '다음: 15kg 유지 (반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션)'],
    ])
  })

  it('③ 홈 배지(progressionSuggestions)·요약 증량 행·프리필 무게(defaultSetFor)가 그대로다', () => {
    const s = fieldSession()
    expect(progressionSuggestions(s, ROUTINE, PHASE, undefined, catalog)).toEqual([])
    const verdicts = progressionVerdicts(s, ROUTINE, PHASE, undefined, catalog)
    expect([...verdicts.values()].filter((v) => v.kind === 'up')).toEqual([])
    const p = buildPrefill({
      sessions: [s], routine: ROUTINE, recordKey: NORMAL_KEY, routineExercise: NORMAL_RE, phase: PHASE,
    })
    expect(p.progression).toBeUndefined()
    expect(defaultSetFor(p, 0, NORMAL_RE).weight).toBe(30)
  })
})

describe('GG1 — 소스 스캔 (초크포인트)', () => {
  const raw = import.meta.glob(['/src/lib/*.ts', '/src/screens/*.tsx', '/src/components/*.tsx'], {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const src = (p: string) => {
    expect(raw[p], `${p}를 찾지 못했다 — 이 검사가 헛돌고 있다`).toBeDefined()
    return stripComments(raw[p])
  }

  it('계획 세트 수와 길이를 비교하는 증량 판정이 progression.ts 밖에 없다', () => {
    for (const p of ['/src/lib/prefill.ts', '/src/lib/exportMarkdown.ts', '/src/screens/SummaryScreen.tsx']) {
      expect(src(p), p).not.toMatch(/\.length\s*<\s*[\w.]*\.sets\b/)
      expect(src(p), p).not.toMatch(/routineExercise\.sets\b/)
    }
    expect(src('/src/lib/progression.ts')).toMatch(/sets\.length\s*<\s*routineExercise\.sets/)
  })

  it('Summary·내보내기는 holdReasonText를 import하고 사유 문구 리터럴이 없다', () => {
    for (const p of ['/src/screens/SummaryScreen.tsx', '/src/lib/exportMarkdown.ts']) {
      expect(src(p), p).toMatch(/import\s*\{[^}]*\bholdReasonText\b[^}]*\}\s*from\s*'[^']*progression'/)
      expect(src(p), p).not.toMatch(/세트 중|반복 상단/)
    }
  })

  it('ExerciseCard의 hold 칩이 lastHoldChipText를 거친다', () => {
    const s = src('/src/components/ExerciseCard.tsx')
    expect(s).toMatch(/import\s*\{\s*lastHoldChipText\s*\}\s*from\s*'[^']*progression'/)
    expect(s).toMatch(/lastHoldChipText\(prefill\?\.lastVerdict\)/)
    expect(s).not.toMatch(/지난번 상단/)
  })
})
