import { describe, expect, it } from 'vitest'
import { easierWeight, isInverseKey, stepDown, stepUp } from './weightScale'
import { detectPrs, topPrPerRecord } from './pr'
import { buildPrefill } from './prefill'
import { totalVolume } from './derive'
import { strengthRecordKeys } from './analysis'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import { makeRecordKey } from '../types'
import type { Exercise, Session, SessionEntry } from '../types'

/**
 * 어시스티드 머신(T8 `inverseWeight`) — **표시 무게가 클수록 쉽다.**
 *
 * 진전은 숫자가 줄어드는 것이다. 그래서 무게를 "더 좋음"으로 읽는 모든 경로가
 * 방향이 반대가 된다. 이 파일은 경로별로 그 방향을 고정한다.
 */

const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))

const LAT = makeRecordKey('lat-pulldown', 'd2')
const ASSIST = makeRecordKey('assisted-pullup', 'd2')
const isInverse = (rk: string) => isInverseKey(catalog, rk)

const plannedLat = ROUTINE.days
  .find((d) => d.id === 'd2')!
  .exercises.find((e) => e.exerciseId === 'lat-pulldown')!

/**
 * 랫풀을 어시스티드 풀업으로 대체한 세션. `assist`는 **그 종목만** 바꾼다 —
 * completedSession의 weight는 Day 전 종목에 적용되므로, 다른 종목까지 같이 움직이면
 * "보조만 늘렸을 때"의 효과를 분리해서 볼 수 없다.
 */
const OTHERS_WEIGHT = 30
function assistSession(date: string, assist: number, reps: number): Session {
  const base = completedSession({
    dayId: 'd2',
    date,
    weight: OTHERS_WEIGHT,
    repsOverride: reps,
  })
  return {
    ...base,
    entries: base.entries.map((e): SessionEntry =>
      e.recordKey === LAT
        ? {
            ...e,
            recordKey: ASSIST,
            substituteFor: LAT,
            sets: e.sets.map((set) => ({ ...set, weight: assist })),
          }
        : e,
    ),
  }
}

describe('술어', () => {
  it('entry 자신의 exerciseId로 판정한다 (원 종목이 아니라)', () => {
    // inverse는 실제로 쓴 기계의 속성이다. 원 종목(랫풀)은 일반 종목이다
    expect(isInverse(ASSIST)).toBe(true)
    expect(isInverse(LAT)).toBe(false)
  })
})

describe('easierWeight — "더 쉽게"의 방향', () => {
  it('일반 종목은 무게를 내린다', () => {
    expect(easierWeight(40, { step: 5 })).toBe(35)
    expect(easierWeight(40, { step: 5 })).toBe(stepDown(40, { step: 5 }))
  })

  it('어시스티드는 보조를 올린다', () => {
    // 이 반전이 없으면 T11 "무게 하향 권장"이 어시스티드를 더 어렵게 만든다
    expect(easierWeight(40, { step: 5, inverse: true })).toBe(45)
    expect(easierWeight(40, { step: 5, inverse: true })).toBe(stepUp(40, { step: 5 }))
  })

  it('사다리에서는 이웃 핀으로 간다', () => {
    const ladder = [5, 10, 15, 20]
    expect(easierWeight(15, { step: 2.5, ladder })).toBe(10)
    expect(easierWeight(15, { step: 2.5, ladder, inverse: true })).toBe(20)
  })

  it('경계에서는 값이 그대로 — 호출부가 버튼을 막는다', () => {
    expect(easierWeight(5, { step: 2.5, ladder: [5, 10] })).toBe(5)
    expect(easierWeight(10, { step: 2.5, ladder: [5, 10], inverse: true })).toBe(10)
  })
})

describe('PR — 거짓 신호를 만들지 않는다', () => {
  const older = assistSession('2026-07-13', 30, 10)

  it('보조를 늘리면(쉬워지면) 무게·e1RM PR이 뜨지 않는다', () => {
    const easier = assistSession('2026-07-20', 35, 10)
    const hits = detectPrs([older, easier], easier, isInverse)
    expect(hits.filter((h) => h.recordKey === ASSIST).map((h) => h.kind)).not.toContain('weight')
    expect(hits.filter((h) => h.recordKey === ASSIST).map((h) => h.kind)).not.toContain('e1rm')
  })

  it('술어가 없으면 바로 그 거짓 PR이 뜬다 (수정의 근거)', () => {
    const easier = assistSession('2026-07-20', 35, 10)
    const hits = detectPrs([older, easier], easier)
    expect(hits.filter((h) => h.recordKey === ASSIST).map((h) => h.kind)).toContain('weight')
  })

  it('같은 보조 무게에서 반복이 늘면 반복수 PR은 뜬다', () => {
    // 어시스티드에서도 실제 진전이고 방향이 이미 맞다 — 유지해야 한다
    const more = assistSession('2026-07-20', 30, 12)
    const hits = detectPrs([older, more], more, isInverse)
    const mine = hits.filter((h) => h.recordKey === ASSIST)
    expect(mine.map((h) => h.kind)).toContain('reps')
    expect(mine.find((h) => h.kind === 'reps')).toMatchObject({ value: 12, previous: 10, atWeight: 30 })
  })

  it('보조를 줄이면 무게 PR로 잡히지 않는다 (방향이 반대이므로 무게 축은 쓰지 않는다)', () => {
    const harder = assistSession('2026-07-20', 25, 10)
    const hits = detectPrs([older, harder], harder, isInverse)
    expect(hits.filter((h) => h.recordKey === ASSIST)).toEqual([])
  })

  it('일반 종목의 PR은 영향받지 않는다', () => {
    const a = completedSession({ dayId: 'd1', date: '2026-07-13', weight: 40, repsOverride: 10 })
    const b = completedSession({ dayId: 'd1', date: '2026-07-20', weight: 45, repsOverride: 10 })
    const hits = topPrPerRecord(detectPrs([a, b], b, isInverse))
    expect(hits.some((h) => h.kind === 'weight')).toBe(true)
  })
})

describe('프리필 기준 기록 — 방향 반전 (기능 성립 조건)', () => {
  const sessions = [assistSession('2026-07-13', 30, 10), assistSession('2026-07-20', 35, 10)]

  it('어시스티드는 보조가 가장 적은 세션을 기준으로 잡는다', () => {
    const prefill = buildPrefill({
      sessions,
      routine: ROUTINE,
      recordKey: ASSIST,
      routineExercise: { ...plannedLat, exerciseId: 'assisted-pullup' },
      phase: 1,
      inverse: true,
    })
    expect(prefill.best?.weight).toBe(30)
  })

  it('반전이 없으면 가장 쉬웠던 세션이 기준이 된다 (하향 나선의 반대 방향)', () => {
    const prefill = buildPrefill({
      sessions,
      routine: ROUTINE,
      recordKey: ASSIST,
      routineExercise: { ...plannedLat, exerciseId: 'assisted-pullup' },
      phase: 1,
    })
    expect(prefill.best?.weight).toBe(35)
  })

  it('동무게면 반복수가 많은 쪽 (방향 무관)', () => {
    const same = [assistSession('2026-07-13', 30, 10), assistSession('2026-07-20', 30, 14)]
    const prefill = buildPrefill({
      sessions: same,
      routine: ROUTINE,
      recordKey: ASSIST,
      routineExercise: { ...plannedLat, exerciseId: 'assisted-pullup' },
      phase: 1,
      inverse: true,
    })
    expect(prefill.best).toEqual({ weight: 30, reps: 14 })
  })
})

describe('볼륨 — 어시스티드 제외', () => {
  const session = assistSession('2026-07-20', 30, 10)

  it('제외 술어를 주면 어시스티드 세트가 볼륨에서 빠진다', () => {
    const all = totalVolume(session)
    const excluded = totalVolume(session, isInverse)
    expect(excluded).toBeLessThan(all)
    // 빠진 양이 정확히 그 종목의 보조무게 × 반복 합이다
    const entry = session.entries.find((e) => e.recordKey === ASSIST)!
    const own = entry.sets.reduce((n, s) => n + s.weight * s.reps, 0)
    expect(all - excluded).toBe(own)
  })

  it('술어가 없으면 보조 무게가 볼륨에 섞인다 (수정의 근거)', () => {
    const more = assistSession('2026-07-20', 60, 10) // 보조를 두 배로 = 훨씬 쉬움
    expect(totalVolume(more)).toBeGreaterThan(totalVolume(session))
    // 제외하면 "쉬워졌더니 볼륨이 늘었다"가 사라진다
    expect(totalVolume(more, isInverse)).toBe(totalVolume(session, isInverse))
  })
})

describe('추이 차트 — 어시스티드 제외', () => {
  const sessions = [assistSession('2026-07-13', 30, 10), assistSession('2026-07-20', 30, 10)]

  it('술어를 주면 목록에서 빠진다', () => {
    const keys = strengthRecordKeys(sessions, ROUTINE, { isInverse })
    expect(keys.map((k) => k.recordKey)).not.toContain(ASSIST)
  })

  it('술어가 없으면 들어간다 — F1 수정으로 그룹 판정이 되기 때문 (그래서 F2가 함께 필요했다)', () => {
    const keys = strengthRecordKeys(sessions, ROUTINE)
    expect(keys.map((k) => k.recordKey)).toContain(ASSIST)
  })

  it('같은 Day의 일반 A그룹은 그대로 남는다', () => {
    const keys = strengthRecordKeys(sessions, ROUTINE, { isInverse })
    expect(keys.some((k) => k.group === 'A' && k.recordKey !== ASSIST)).toBe(true)
  })
})
