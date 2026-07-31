import { describe, expect, it } from 'vitest'
import { buildPrefill, defaultSetFor } from './prefill'
import { buildSession, roundToHalf } from './sessionFactory'
import { ROUTINE, completedSession } from './testFixtures'
import type { Session } from '../types'

const INCLINE_D1 = 'incline-chest-press@d1'
const inclineD1 = ROUTINE.days[0].exercises.find((e) => e.exerciseId === 'incline-chest-press')!

/** 특정 recordKey의 세트를 직접 지정한 완료 세션 */
function sessionWith(args: {
  date: string
  recordKey: string
  sets: { weight: number; reps: number }[]
  compensation?: string
}): Session {
  const base = completedSession({ dayId: 'd1', date: args.date })
  return {
    ...base,
    entries: base.entries.map((e) =>
      e.recordKey === args.recordKey
        ? {
            ...e,
            sets: args.sets.map((s) => ({ ...s, done: true, doneAt: base.startedAt })),
            compensation: args.compensation ?? e.compensation,
          }
        : e,
    ),
  }
}

describe('프리필 — 최근 3세션 최고 기록', () => {
  it('직전 세션이 아니라 최근 3세션 최고치를 기본값으로 쓴다', () => {
    // 컨디션 나쁜 날(직전)의 기록이 다음 기준점이 되면 하향 나선이 생긴다 (§7)
    const sessions = [
      sessionWith({ date: '2026-08-01', recordKey: INCLINE_D1, sets: [{ weight: 42.5, reps: 9 }] }),
      sessionWith({ date: '2026-08-05', recordKey: INCLINE_D1, sets: [{ weight: 35, reps: 8 }] }),
    ]
    const prefill = buildPrefill({
      sessions,
      routine: ROUTINE,
      recordKey: INCLINE_D1,
      routineExercise: inclineD1,
      phase: 0,
    })
    expect(prefill.bestBySet[0]).toEqual({ weight: 42.5, reps: 9 })
    expect(prefill.lastSets[0]).toEqual({ weight: 35, reps: 8 }) // 비교용 고스트
    expect(defaultSetFor(prefill, 0, inclineD1).weight).toBe(42.5)
  })

  it('4세션 전 기록은 무시한다', () => {
    const sessions = [
      sessionWith({ date: '2026-07-01', recordKey: INCLINE_D1, sets: [{ weight: 60, reps: 10 }] }),
      sessionWith({ date: '2026-07-10', recordKey: INCLINE_D1, sets: [{ weight: 40, reps: 8 }] }),
      sessionWith({ date: '2026-07-17', recordKey: INCLINE_D1, sets: [{ weight: 40, reps: 8 }] }),
      sessionWith({ date: '2026-07-24', recordKey: INCLINE_D1, sets: [{ weight: 40, reps: 9 }] }),
    ]
    const prefill = buildPrefill({
      sessions,
      routine: ROUTINE,
      recordKey: INCLINE_D1,
      routineExercise: inclineD1,
      phase: 0,
    })
    expect(prefill.best?.weight).toBe(40) // 60kg는 4세션 전이라 제외
  })

  it('동일 무게면 반복수가 많은 쪽이 최고 기록이다', () => {
    const sessions = [
      sessionWith({ date: '2026-08-01', recordKey: INCLINE_D1, sets: [{ weight: 40, reps: 8 }] }),
      sessionWith({ date: '2026-08-05', recordKey: INCLINE_D1, sets: [{ weight: 40, reps: 10 }] }),
    ]
    const prefill = buildPrefill({
      sessions,
      routine: ROUTINE,
      recordKey: INCLINE_D1,
      routineExercise: inclineD1,
      phase: 0,
    })
    expect(prefill.bestBySet[0]).toEqual({ weight: 40, reps: 10 })
  })

  it('기록이 없으면 0kg × repMin', () => {
    const prefill = buildPrefill({
      sessions: [],
      routine: ROUTINE,
      recordKey: INCLINE_D1,
      routineExercise: inclineD1,
      phase: 0,
    })
    expect(defaultSetFor(prefill, 0, inclineD1)).toEqual({
      weight: 0,
      reps: inclineD1.repMin,
      done: false,
    })
  })

  it('진행 중(endedAt 없음) 세션은 기준에 넣지 않는다', () => {
    const open = sessionWith({ date: '2026-08-05', recordKey: INCLINE_D1, sets: [{ weight: 99, reps: 20 }] })
    delete (open as { endedAt?: string }).endedAt
    const prefill = buildPrefill({
      sessions: [open],
      routine: ROUTINE,
      recordKey: INCLINE_D1,
      routineExercise: inclineD1,
      phase: 0,
    })
    expect(prefill.best).toBeUndefined()
  })
})

describe('증량 제안 (더블 프로그레션)', () => {
  const allAtMax = [
    { weight: 40, reps: 10 },
    { weight: 40, reps: 10 },
    { weight: 40, reps: 10 },
    { weight: 40, reps: 10 },
  ]

  const prefillWith = (sessions: Session[], phase: 0 | 1 = 0) =>
    buildPrefill({ sessions, routine: ROUTINE, recordKey: INCLINE_D1, routineExercise: inclineD1, phase })

  it('모든 세트가 상단(repMax) 도달 + 보상작용 없음 → +2.5kg', () => {
    const p = prefillWith([sessionWith({ date: '2026-08-05', recordKey: INCLINE_D1, sets: allAtMax })])
    expect(p.progression).toEqual({ from: 40, to: 42.5 })
    // 프리필 무게가 제안값으로 채워진다
    expect(defaultSetFor(p, 0, inclineD1).weight).toBe(42.5)
  })

  it('Phase 0에서도 활성이다 (v2.4 규칙)', () => {
    expect(ROUTINE.rules.allowProgressionInPhase0).toBe(true)
    expect(prefillWith([sessionWith({ date: '2026-08-05', recordKey: INCLINE_D1, sets: allAtMax })], 0).progression)
      .toBeDefined()
  })

  it('한 세트라도 상단 미달이면 제안하지 않는다', () => {
    const sets = [...allAtMax.slice(0, 3), { weight: 40, reps: 9 }]
    expect(prefillWith([sessionWith({ date: '2026-08-05', recordKey: INCLINE_D1, sets })]).progression)
      .toBeUndefined()
  })

  it('보상작용이 기록돼 있으면 제안하지 않는다', () => {
    const p = prefillWith([
      sessionWith({
        date: '2026-08-05',
        recordKey: INCLINE_D1,
        sets: allAtMax,
        compensation: '마지막 세트 엉덩이 살짝 뜸',
      }),
    ])
    expect(p.progression).toBeUndefined()
  })

  it('B그룹은 증량 제안 대상이 아니다', () => {
    const lateral = ROUTINE.days[0].exercises.find((e) => e.exerciseId === 'lateral-raise')!
    const key = 'lateral-raise@d1'
    const p = buildPrefill({
      sessions: [
        sessionWith({
          date: '2026-08-05',
          recordKey: key,
          sets: Array.from({ length: 4 }, () => ({ weight: 6, reps: lateral.repMax })),
        }),
      ],
      routine: ROUTINE,
      recordKey: key,
      routineExercise: lateral,
      phase: 0,
    })
    expect(p.progression).toBeUndefined()
  })
})

describe('세션 생성', () => {
  it('normal 모드는 루틴 세트 수를 그대로 쓴다', () => {
    const { session } = buildSession({
      routine: ROUTINE,
      day: ROUTINE.days[0],
      mode: 'normal',
      sessions: [],
      phase: 0,
      today: '2026-08-05',
    })
    expect(session.entries.map((e) => e.sets.length)).toEqual([4, 3, 3, 3, 4, 2, 3])
    expect(session.entries.every((e) => e.compensation === '없음')).toBe(true)
    expect(session.entries.every((e) => e.performedOrder === null)).toBe(true)
  })

  it('복귀 모드는 세트를 깎고 무게는 소폭만 내린다 (§7)', () => {
    const step = ROUTINE.rules.returnProtocol[2] // −20% 무게, −50% 세트
    const history = [sessionWith({ date: '2026-07-01', recordKey: INCLINE_D1, sets: [{ weight: 40, reps: 8 }] })]
    const { session } = buildSession({
      routine: ROUTINE,
      day: ROUTINE.days[0],
      mode: 'return',
      sessions: history,
      phase: 0,
      today: '2026-09-01',
      returnStep: step,
    })
    // 4세트 → 2세트
    expect(session.entries[0].sets.length).toBe(2)
    // 40kg → 32kg (무게 손실은 작으므로 조절 폭이 세트보다 작다)
    expect(session.entries[0].sets[0].weight).toBe(32)
    expect(session.mode).toBe('return')
  })

  it('디로드는 세트 −50%, 무게 유지', () => {
    const history = [sessionWith({ date: '2026-08-01', recordKey: INCLINE_D1, sets: [{ weight: 40, reps: 8 }] })]
    const { session } = buildSession({
      routine: ROUTINE,
      day: ROUTINE.days[0],
      mode: 'deload',
      sessions: history,
      phase: 0,
      today: '2026-08-05',
    })
    expect(session.entries[0].sets.length).toBe(2)
    expect(session.entries[0].sets[0].weight).toBe(40)
  })

  it('세트 수는 최소 1세트를 남긴다', () => {
    const { session } = buildSession({
      routine: ROUTINE,
      day: ROUTINE.days[0],
      mode: 'return',
      sessions: [],
      phase: 0,
      today: '2026-08-05',
      returnStep: { gapWeeksMin: 8, weightPct: -20, setPct: -100, targetRIR: 4, rampWeeks: 3 },
    })
    expect(session.entries.every((e) => e.sets.length >= 1)).toBe(true)
  })

  it('fallback Day의 recordKey는 정규 Day를 가리킨다 (§8)', () => {
    const fb = ROUTINE.fallbackDays[0] // fallback-push → d1
    const { session } = buildSession({
      routine: ROUTINE,
      day: fb,
      mode: 'normal',
      sessions: [],
      phase: 0,
      today: '2026-08-05',
    })
    expect(session.dayId).toBe('fallback-push')
    expect(session.entries.map((e) => e.recordKey)).toEqual([
      'incline-chest-press@d1',
      'lateral-raise@d1',
      'pec-deck-fly@d1',
    ])
    // 세트 수는 fallback 기준 (3/3/2), 정규 D1(4/4/3)이 아니다
    expect(session.entries.map((e) => e.sets.length)).toEqual([3, 3, 2])
  })

  it('fallback에서 쌓은 기록이 정규 Day 프리필로 이어진다', () => {
    const fb = ROUTINE.fallbackDays[0]
    const { session } = buildSession({
      routine: ROUTINE,
      day: fb,
      mode: 'normal',
      sessions: [],
      phase: 0,
      today: '2026-08-05',
    })
    const finished: Session = {
      ...session,
      endedAt: '2026-08-05T19:00:00.000Z',
      entries: session.entries.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, weight: 45, reps: 8, done: true })),
      })),
    }
    const p = buildPrefill({
      sessions: [finished],
      routine: ROUTINE,
      recordKey: INCLINE_D1,
      routineExercise: inclineD1,
      phase: 0,
    })
    expect(p.best).toEqual({ weight: 45, reps: 8 })
  })
})

describe('roundToHalf', () => {
  it('0.5kg 단위로 맞춘다', () => {
    expect(roundToHalf(38.0)).toBe(38)
    expect(roundToHalf(36.1)).toBe(36)
    expect(roundToHalf(36.3)).toBe(36.5)
    expect(roundToHalf(32.0000001)).toBe(32)
  })
})
