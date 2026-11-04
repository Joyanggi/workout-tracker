import { describe, expect, it } from 'vitest'
import { computeProgression } from './prefill'
import { progressionSuggestions } from './progression'
import { scaleFor } from './weightScale'
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
