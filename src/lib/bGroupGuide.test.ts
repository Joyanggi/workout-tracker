import { describe, expect, it } from 'vitest'
import { bGroupGuide, recoveryHint, revertWarning } from './bGroupGuide'
import { buildPrefill, defaultSetFor, sessionsForRecord } from './prefill'
import { strengthRecordKeys, strengthTrend } from './analysis'
import { ROUTINE, completedSession } from './testFixtures'
import { makeRecordKey, type Phase, type Session, type SessionEntry } from '../types'

const B_EXERCISE = 'lateral-raise' // D1 B그룹
const B_KEY = makeRecordKey(B_EXERCISE, 'd1')
const A_KEY = makeRecordKey('incline-chest-press', 'd1')

const plannedB = ROUTINE.days
  .find((d) => d.id === 'd1')!
  .exercises.find((e) => e.exerciseId === B_EXERCISE)!

/**
 * 최신순 세션 이력을 만든다. 항목마다 이 종목의 무게·반복수·감각을 지정한다.
 * spec[0]이 가장 최근이다.
 */
function history(
  spec: { weight: number; reps: number; sensory?: 0 | 1 | 2 | 3 }[],
): Session[] {
  return spec.map((item, i) => {
    const base = completedSession({
      dayId: 'd1',
      date: `2026-08-${String(20 - i * 2).padStart(2, '0')}`,
    })
    return {
      ...base,
      entries: base.entries.map((e): SessionEntry =>
        e.recordKey === B_KEY
          ? {
              ...e,
              sets: Array.from({ length: plannedB.sets }, () => ({
                weight: item.weight,
                reps: item.reps,
                done: true,
                doneAt: base.startedAt,
              })),
              sensoryScore: item.sensory,
            }
          : e,
      ),
    }
  })
}

const argsFor = (sessions: Session[], phase: Phase) => ({
  history: sessionsForRecord(sessions, B_KEY),
  recordKey: B_KEY,
  routineExercise: plannedB,
  phase,
})

const AT_TOP = { weight: 10, reps: plannedB.repMax, sensory: 3 as const }

describe('회복 힌트 (Phase 2+)', () => {
  it('최근 3세션 연속 감각 3점 + 마지막 세션 전 세트 상단 도달이면 힌트', () => {
    const hint = recoveryHint(argsFor(history([AT_TOP, AT_TOP, AT_TOP]), 2))
    expect(hint).toEqual({ from: 10 })
  })

  it('Phase 0~1에서는 비활성 — 문서가 그 기간 B그룹 증량을 금지한다', () => {
    for (const phase of [0, 1] as Phase[]) {
      expect(recoveryHint(argsFor(history([AT_TOP, AT_TOP, AT_TOP]), phase))).toBeUndefined()
    }
  })

  it('감각이 한 번이라도 3점이 아니면 힌트 없음', () => {
    const spec = [AT_TOP, { ...AT_TOP, sensory: 2 as const }, AT_TOP]
    expect(recoveryHint(argsFor(history(spec), 2))).toBeUndefined()
  })

  it('감각 미입력은 충족이 아니다', () => {
    const spec = [AT_TOP, { weight: 10, reps: plannedB.repMax }, AT_TOP]
    expect(recoveryHint(argsFor(history(spec), 2))).toBeUndefined()
  })

  it('상단에 도달하지 않으면 힌트 없음 — 감각만으로는 "가벼워서 편했다"와 구분되지 않는다', () => {
    const below = { weight: 10, reps: plannedB.repMax - 1, sensory: 3 as const }
    expect(recoveryHint(argsFor(history([below, AT_TOP, AT_TOP]), 2))).toBeUndefined()
  })

  it('세션이 3개 미만이면 힌트 없음', () => {
    expect(recoveryHint(argsFor(history([AT_TOP, AT_TOP]), 2))).toBeUndefined()
  })

  it('A그룹에는 적용하지 않는다', () => {
    const plannedA = ROUTINE.days.find((d) => d.id === 'd1')!.exercises.find((e) => e.exerciseId === 'incline-chest-press')!
    const sessions = history([AT_TOP, AT_TOP, AT_TOP])
    expect(
      recoveryHint({
        history: sessionsForRecord(sessions, A_KEY),
        recordKey: A_KEY,
        routineExercise: plannedA,
        phase: 2,
      }),
    ).toBeUndefined()
  })
})

describe('복귀 경고 — 문서 9장의 절대 기준', () => {
  it('무게를 올렸는데 감각이 1점 이하면 이전 무게로', () => {
    const sessions = history([
      { weight: 12.5, reps: 15, sensory: 1 },
      { weight: 10, reps: 15, sensory: 3 },
    ])
    expect(revertWarning(argsFor(sessions, 2))).toEqual({ from: 12.5, to: 10 })
  })

  it('감각 0점도 대상이다', () => {
    const sessions = history([
      { weight: 12.5, reps: 15, sensory: 0 },
      { weight: 10, reps: 15, sensory: 2 },
    ])
    expect(revertWarning(argsFor(sessions, 2))?.to).toBe(10)
  })

  it('무게를 올리지 않았으면 복귀하지 않는다 — 다른 원인(피로·자세)일 수 있다', () => {
    const sessions = history([
      { weight: 10, reps: 15, sensory: 1 },
      { weight: 10, reps: 15, sensory: 3 },
    ])
    expect(revertWarning(argsFor(sessions, 2))).toBeUndefined()
  })

  it('감각이 2점 이상이면 올린 무게를 유지한다', () => {
    const sessions = history([
      { weight: 12.5, reps: 15, sensory: 2 },
      { weight: 10, reps: 15, sensory: 3 },
    ])
    expect(revertWarning(argsFor(sessions, 2))).toBeUndefined()
  })

  it('Phase 0~1에서는 비활성', () => {
    const sessions = history([
      { weight: 12.5, reps: 15, sensory: 1 },
      { weight: 10, reps: 15, sensory: 3 },
    ])
    expect(revertWarning(argsFor(sessions, 1))).toBeUndefined()
  })

  it('복귀가 회복보다 우선한다 — 절대 기준이 제안을 이긴다', () => {
    // 감각 3점 3연속 + 상단 도달로 회복 조건을 만족시킨 뒤, 최신 세션만 올렸고 감각 1점
    const sessions = history([
      { weight: 12.5, reps: plannedB.repMax, sensory: 1 },
      AT_TOP,
      AT_TOP,
      AT_TOP,
    ])
    expect(bGroupGuide(argsFor(sessions, 2))?.kind).toBe('revert')
  })
})

describe('프리필 연동', () => {
  const build = (sessions: Session[], phase: Phase) =>
    buildPrefill({ sessions, routine: ROUTINE, recordKey: B_KEY, routineExercise: plannedB, phase })

  it('복귀는 프리필 무게를 자동으로 내린다 (절대 기준이므로)', () => {
    const sessions = history([
      { weight: 12.5, reps: 15, sensory: 1 },
      { weight: 10, reps: 15, sensory: 3 },
    ])
    const prefill = build(sessions, 2)
    expect(prefill.bGroup).toEqual({ kind: 'revert', from: 12.5, to: 10 })
    expect(defaultSetFor(prefill, 0, plannedB).weight).toBe(10)
  })

  it('회복 힌트는 프리필을 바꾸지 않는다 — 올릴지는 사용자 결정', () => {
    const prefill = build(history([AT_TOP, AT_TOP, AT_TOP]), 2)
    expect(prefill.bGroup?.kind).toBe('recover')
    expect(defaultSetFor(prefill, 0, plannedB).weight).toBe(10)
  })

  it('디로드·복귀 모드에서는 B그룹 복귀를 적용하지 않는다 (그 모드의 무게 규칙이 우선)', () => {
    const sessions = history([
      { weight: 12.5, reps: 15, sensory: 1 },
      { weight: 10, reps: 15, sensory: 3 },
    ])
    const prefill = build(sessions, 2)
    // 디로드는 "무게 유지, 세트 −50%"이므로 기준 무게(최근 최고 12.5)를 그대로 쓴다
    expect(defaultSetFor(prefill, 0, plannedB, 'deload').weight).toBe(12.5)
  })

  it('Phase 1에서는 프리필에 아무 신호도 붙지 않는다', () => {
    const sessions = history([
      { weight: 12.5, reps: 15, sensory: 1 },
      { weight: 10, reps: 15, sensory: 3 },
    ])
    expect(build(sessions, 1).bGroup).toBeUndefined()
  })
})

describe('T12 B그룹 차트 조건부 노출', () => {
  const sessions = history([AT_TOP, AT_TOP, AT_TOP])

  it('기본은 A그룹만 (의도된 제한)', () => {
    const keys = strengthRecordKeys(sessions, ROUTINE)
    expect(keys.some((k) => k.recordKey === B_KEY)).toBe(false)
    expect(keys.every((k) => k.group === 'A')).toBe(true)
  })

  it('includeB면 B그룹이 그룹 표시와 함께 들어온다', () => {
    const keys = strengthRecordKeys(sessions, ROUTINE, { includeB: true })
    const b = keys.find((k) => k.recordKey === B_KEY)
    expect(b).toBeDefined()
    expect(b!.group).toBe('B')
    // A그룹은 그대로 남는다
    expect(keys.some((k) => k.recordKey === A_KEY && k.group === 'A')).toBe(true)
  })

  it('루틴 순서가 유지된다 (B가 뒤로 밀리지 않고 계획 순서대로)', () => {
    const keys = strengthRecordKeys(sessions, ROUTINE, { includeB: true })
    const ids = keys.filter((k) => k.dayId === 'd1').map((k) => k.exerciseId)
    const planned = [...ROUTINE.days.find((d) => d.id === 'd1')!.exercises]
      .sort((a, b) => a.plannedOrder - b.plannedOrder)
      .map((e) => e.exerciseId)
    expect(ids).toEqual(planned.filter((id) => ids.includes(id)))
  })

  it('추이 데이터에 감각 점수가 실린다 (툴팁 병기용)', () => {
    const trend = strengthTrend(sessions, B_KEY)
    expect(trend).toHaveLength(3)
    expect(trend.every((p) => p.sensoryScore === 3)).toBe(true)
  })

  it('감각 미입력은 undefined로 남는다 (0점과 구분)', () => {
    const noSensory = history([{ weight: 10, reps: 15 }])
    expect(strengthTrend(noSensory, B_KEY)[0].sensoryScore).toBeUndefined()
    const zero = history([{ weight: 10, reps: 15, sensory: 0 }])
    expect(strengthTrend(zero, B_KEY)[0].sensoryScore).toBe(0)
  })
})
