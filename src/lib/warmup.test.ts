import { describe, expect, it } from 'vitest'
import { applyAddSet, applyToggleDone } from './sessionOps'
import { buildSession } from './sessionFactory'
import { doneSets, doneSetsAll, totalDoneSets, totalVolume, weeklyVolume } from './derive'
import { computeProgression } from './prefill'
import { progressionSuggestions } from './progression'
import { detectPrs } from './pr'
import { ROUTINE, completedSession } from './testFixtures'
import type { Session } from '../types'

const INCLINE = 'incline-chest-press@d1'
const inclineD1 = ROUTINE.days[0].exercises.find((e) => e.exerciseId === 'incline-chest-press')!
const at = (m: number) => new Date(`2026-08-05T18:${String(m).padStart(2, '0')}:00.000Z`)

function fresh(): Session {
  return buildSession({
    routine: ROUTINE,
    day: ROUTINE.days[0],
    mode: 'normal',
    sessions: [],
    phase: 0,
    today: '2026-08-05',
  }).session
}

/**
 * T7의 핵심: 워밍업은 볼륨·증량·PR·부위 집계 어디에도 들어가지 않는다.
 * 제외는 derive.doneSets() 한 곳에서 이뤄지므로 이 테스트가 그 관문을 지킨다.
 */
describe('워밍업 세트는 앞에 붙고 번호를 받지 않는다', () => {
  it('세트 배열 맨 앞에 추가된다 (실제 수행 순서)', () => {
    const s = applyAddSet(fresh(), INCLINE, { warmup: true })
    const entry = s.entries.find((e) => e.recordKey === INCLINE)!
    expect(entry.sets[0].warmup).toBe(true)
    expect(entry.sets).toHaveLength(5) // 계획 4 + 워밍업 1
    expect(entry.sets.slice(1).every((x) => !x.warmup)).toBe(true)
  })

  it('일반 세트 추가는 뒤에 붙는다', () => {
    const s = applyAddSet(fresh(), INCLINE)
    const entry = s.entries.find((e) => e.recordKey === INCLINE)!
    expect(entry.sets[entry.sets.length - 1].warmup).toBeUndefined()
  })
})

describe('doneSets는 워밍업을 제외한다 (분석 관문)', () => {
  const withWarmup = () => {
    let s = applyAddSet(fresh(), INCLINE, { warmup: true })
    // 워밍업 + 작업 세트 1개를 체크
    s = applyToggleDone(s, INCLINE, 0, at(0))
    s = applyToggleDone(s, INCLINE, 1, at(5))
    return s
  }

  it('doneSets는 작업 세트만, doneSetsAll은 전부', () => {
    const entry = withWarmup().entries.find((e) => e.recordKey === INCLINE)!
    expect(doneSets(entry)).toHaveLength(1)
    expect(doneSetsAll(entry)).toHaveLength(2)
  })

  it('총 볼륨에서 워밍업이 빠진다', () => {
    let s = withWarmup()
    // 워밍업 20kg×10, 작업 40kg×10으로 맞춘다
    s = {
      ...s,
      entries: s.entries.map((e) =>
        e.recordKey === INCLINE
          ? {
              ...e,
              sets: e.sets.map((x, i) =>
                i === 0 ? { ...x, weight: 20, reps: 10 } : { ...x, weight: 40, reps: 10 },
              ),
            }
          : e,
      ),
    }
    // 작업 세트 1개(40×10)만 = 400. 워밍업 200이 들어갔으면 600이 된다
    expect(totalVolume(s)).toBe(400)
  })

  it('"완료 세트" 표시에는 워밍업이 포함된다 (내가 한 것이므로)', () => {
    expect(totalDoneSets(withWarmup())).toBe(2)
  })

  it('부위별 주간 집계에서 워밍업이 빠진다', () => {
    const base = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const plusWarmup: Session = {
      ...base,
      entries: base.entries.map((e) =>
        e.recordKey === INCLINE
          ? { ...e, sets: [{ weight: 20, reps: 10, done: true, warmup: true }, ...e.sets] }
          : e,
      ),
    }
    // §8 검산표의 상부가슴 7세트가 그대로여야 한다 (워밍업이 8로 만들지 않는다)
    expect(weeklyVolume([plusWarmup], ROUTINE, '2026-08-03').sets['상부가슴']).toBe(7)
  })
})

describe('워밍업은 증량 판정에 영향을 주지 않는다', () => {
  const atMax = (n: number) => Array.from({ length: n }, () => ({ weight: 40, reps: 10 }))

  it('워밍업을 세트 수 충족으로 세지 않는다', () => {
    // 작업 3세트(계획 4) + 워밍업 1 = 체크 4개지만 증량 조건은 미달이어야 한다
    const lastSets = atMax(3)
    expect(
      computeProgression({ routine: ROUTINE, routineExercise: inclineD1, phase: 0, lastSets }),
    ).toBeUndefined()
  })

  it('홈 배지 판정에서도 워밍업이 세트 수에 안 들어간다', () => {
    const base = completedSession({ dayId: 'd1', date: '2026-08-03', fullReps: true })
    // 인클라인의 작업 세트를 3개로 줄이고 워밍업 1개를 앞에 붙인다
    const s: Session = {
      ...base,
      entries: base.entries.map((e) =>
        e.recordKey === INCLINE
          ? {
              ...e,
              sets: [{ weight: 20, reps: 15, done: true, warmup: true }, ...e.sets.slice(0, 3)],
            }
          : e,
      ),
    }
    const keys = progressionSuggestions(s, ROUTINE, 0).map((p) => p.recordKey)
    expect(keys).not.toContain(INCLINE)
  })
})

describe('워밍업은 PR 판정에 영향을 주지 않는다', () => {
  it('가벼운 워밍업이 반복 PR을 만들지 않는다', () => {
    const mk = (date: string, sets: { weight: number; reps: number; warmup?: boolean }[]): Session => {
      const base = completedSession({ dayId: 'd1', date })
      return {
        ...base,
        startedAt: `${date}T09:00:00.000Z`,
        entries: base.entries.map((e) =>
          e.recordKey === INCLINE
            ? { ...e, sets: sets.map((x) => ({ ...x, done: true })) }
            : e,
        ),
      }
    }
    const prev = mk('2026-08-03', [{ weight: 40, reps: 8 }])
    // 워밍업 40kg×20 — 제외되지 않으면 반복 PR(8 → 20)이 잘못 뜬다
    const now = mk('2026-08-10', [
      { weight: 40, reps: 20, warmup: true },
      { weight: 40, reps: 8 },
    ])
    const hits = detectPrs([prev, now], now).filter((h) => h.recordKey === INCLINE)
    expect(hits).toEqual([])
  })
})
