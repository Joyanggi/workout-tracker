import { describe, expect, it } from 'vitest'
import { detectPrs, isPrEligible, topPrPerRecord } from './pr'
import { ROUTINE, completedSession } from './testFixtures'
import type { Session } from '../types'

const KEY = 'lat-pulldown@d2'

/** lat-pulldown의 세트를 직접 지정한 D2 세션 */
function s(
  date: string,
  sets: { weight: number; reps: number }[],
  opts: { mode?: 'normal' | 'deload' | 'return' } = {},
): Session {
  const base = completedSession({ dayId: 'd2', date, ...(opts.mode ? { mode: opts.mode } : {}) })
  return {
    ...base,
    startedAt: `${date}T09:00:00.000Z`,
    entries: base.entries.map((e) =>
      e.recordKey === KEY
        ? { ...e, sets: sets.map((x) => ({ ...x, done: true, doneAt: `${date}T09:00:00.000Z` })) }
        : e,
    ),
  }
}

const of = (hits: ReturnType<typeof detectPrs>, kind: string) =>
  hits.filter((h) => h.recordKey === KEY && h.kind === kind)

describe('첫 기록은 PR이 아니다', () => {
  it('히스토리가 없으면 아무 PR도 없다', () => {
    // 모든 종목이 첫 세션에 PR 뱃지를 달면 뱃지가 아무 의미도 갖지 못한다
    const only = s('2026-08-03', [{ weight: 40, reps: 10 }])
    expect(detectPrs([only], only)).toEqual([])
  })
})

describe('무게 PR', () => {
  it('이전 최고 무게를 넘으면 감지한다', () => {
    const prev = s('2026-08-03', [{ weight: 40, reps: 10 }])
    const now = s('2026-08-10', [{ weight: 42.5, reps: 8 }])
    const hit = of(detectPrs([prev, now], now), 'weight')[0]
    expect(hit).toMatchObject({ value: 42.5, previous: 40 })
  })

  it('같은 무게는 PR이 아니다', () => {
    const prev = s('2026-08-03', [{ weight: 40, reps: 10 }])
    const now = s('2026-08-10', [{ weight: 40, reps: 10 }])
    expect(of(detectPrs([prev, now], now), 'weight')).toEqual([])
  })
})

describe('e1RM PR — 무게가 안 올라도 진전을 잡는다', () => {
  it('같은 무게에서 반복이 늘면 e1RM PR이 뜬다', () => {
    // 감량기에는 증량 조건이 안 뜨므로 이 채널이 주 신호가 된다 (§7)
    const prev = s('2026-08-03', [{ weight: 40, reps: 8 }])
    const now = s('2026-08-10', [{ weight: 40, reps: 11 }])
    const hits = detectPrs([prev, now], now)
    expect(of(hits, 'weight')).toEqual([]) // 무게는 그대로
    expect(of(hits, 'e1rm')[0]).toMatchObject({ previous: 50.7, value: 54.7 })
  })

  it('무게가 내려가고 반복이 조금 늘면 e1RM PR이 아니다', () => {
    // 35×12 (e1RM 49) < 40×10 (e1RM 53.3)
    const prev = s('2026-08-03', [{ weight: 40, reps: 10 }])
    const now = s('2026-08-10', [{ weight: 35, reps: 12 }])
    expect(of(detectPrs([prev, now], now), 'e1rm')).toEqual([])
  })
})

describe('반복수 PR — 같은 무게에서만 비교한다', () => {
  it('같은 무게 최다 반복을 넘으면 감지한다', () => {
    const prev = s('2026-08-03', [{ weight: 40, reps: 9 }])
    const now = s('2026-08-10', [{ weight: 40, reps: 12 }])
    const hit = of(detectPrs([prev, now], now), 'reps')[0]
    expect(hit).toMatchObject({ value: 12, previous: 9, atWeight: 40 })
  })

  it('해본 적 없는 무게는 반복 PR로 잡지 않는다', () => {
    // 45kg을 처음 해봤다면 "45kg 최다 반복"은 비교 대상이 없다.
    // 무게 PR로 이미 잡히므로 중복 뱃지를 만들지 않는다.
    const prev = s('2026-08-03', [{ weight: 40, reps: 10 }])
    const now = s('2026-08-10', [{ weight: 45, reps: 6 }])
    expect(of(detectPrs([prev, now], now), 'reps')).toEqual([])
    expect(of(detectPrs([prev, now], now), 'weight')).toHaveLength(1)
  })

  it('세션 안 여러 무게를 각각 비교한다', () => {
    const prev = s('2026-08-03', [
      { weight: 40, reps: 10 },
      { weight: 35, reps: 12 },
    ])
    const now = s('2026-08-10', [
      { weight: 40, reps: 11 },
      { weight: 35, reps: 12 },
    ])
    const hits = of(detectPrs([prev, now], now), 'reps')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ atWeight: 40, value: 11 })
  })
})

describe('디로드·복귀 세션 제외', () => {
  it('디로드 세션 자체는 PR 판정하지 않는다', () => {
    const prev = s('2026-08-03', [{ weight: 40, reps: 10 }])
    const deload = s('2026-08-10', [{ weight: 45, reps: 12 }], { mode: 'deload' })
    expect(detectPrs([prev, deload], deload)).toEqual([])
    expect(isPrEligible(deload)).toBe(false)
  })

  it('디로드 세션의 기록은 이전 최고값에도 넣지 않는다', () => {
    // 가벼운 무게로 많이 한 디로드 기록이 기준선이 되면 이후 반복 PR이 영구히 막힌다
    const normal = s('2026-08-03', [{ weight: 40, reps: 8 }])
    const deload = s('2026-08-05', [{ weight: 40, reps: 20 }], { mode: 'deload' })
    const now = s('2026-08-10', [{ weight: 40, reps: 10 }])
    const hit = of(detectPrs([normal, deload, now], now), 'reps')[0]
    expect(hit).toMatchObject({ previous: 8, value: 10 })
  })

  it('복귀 세션도 동일하게 제외된다', () => {
    const ret = s('2026-08-10', [{ weight: 99, reps: 20 }], { mode: 'return' })
    expect(isPrEligible(ret)).toBe(false)
  })
})

describe('같은 날 두 세션', () => {
  it('앞 세션이 뒤 세션의 기준선이 된다', () => {
    const first = s('2026-08-10', [{ weight: 40, reps: 10 }])
    const second: Session = {
      ...s('2026-08-10', [{ weight: 42.5, reps: 8 }]),
      startedAt: '2026-08-10T18:00:00.000Z',
    }
    const hit = of(detectPrs([first, second], second), 'weight')[0]
    expect(hit).toMatchObject({ previous: 40, value: 42.5 })
  })
})

describe('종목당 하나로 압축', () => {
  it('무게 PR이 있으면 e1RM·반복 PR을 숨긴다 (중복)', () => {
    const prev = s('2026-08-03', [{ weight: 40, reps: 10 }])
    const now = s('2026-08-10', [{ weight: 42.5, reps: 12 }])
    const all = detectPrs([prev, now], now).filter((h) => h.recordKey === KEY)
    expect(all.length).toBeGreaterThan(1) // 무게 + e1RM
    const top = topPrPerRecord(all)
    expect(top).toHaveLength(1)
    expect(top[0].kind).toBe('weight')
  })

  it('무게가 그대로면 e1RM을 보여준다', () => {
    const prev = s('2026-08-03', [{ weight: 40, reps: 8 }])
    const now = s('2026-08-10', [{ weight: 40, reps: 11 }])
    const top = topPrPerRecord(detectPrs([prev, now], now).filter((h) => h.recordKey === KEY))
    expect(top[0].kind).toBe('e1rm')
  })

  it('여러 종목의 PR은 각각 남는다', () => {
    const prev = completedSession({ dayId: 'd2', date: '2026-08-03', weight: 40, repsOverride: 8 })
    const now = completedSession({ dayId: 'd2', date: '2026-08-10', weight: 45, repsOverride: 8 })
    const top = topPrPerRecord(detectPrs([prev, now], now))
    // D2 전 종목이 무게 PR
    expect(top.length).toBe(now.entries.length)
    expect(new Set(top.map((h) => h.kind))).toEqual(new Set(['weight']))
    expect(ROUTINE.days[1].exercises.length).toBe(now.entries.length)
  })
})
