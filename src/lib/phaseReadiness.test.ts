import { describe, expect, it } from 'vitest'
import {
  GAP_DAYS,
  MIN_WEIGHT_INCREASES,
  hasGapWithin,
  phaseReadiness,
  weightIncreaseCount,
} from './phaseReadiness'
import { addDays } from './dates'
import { ROUTINE, completedSession } from './testFixtures'
import type { Session } from '../types'

const TODAY = '2026-08-31'
const back = (n: number) => addDays(TODAY, -n)

/** 특정 recordKey의 세트를 지정한 완료 세션 */
function withSets(date: string, recordKey: string, weight: number, dayId = 'd2'): Session {
  const base = completedSession({ dayId, date })
  return {
    ...base,
    entries: base.entries.map((e) =>
      e.recordKey === recordKey
        ? { ...e, sets: e.sets.map((s) => ({ ...s, weight, done: true })) }
        : e,
    ),
  }
}

/** B그룹 감각 점수를 지정한 완료 세션 */
function withSensory(date: string, scores: Record<string, 0 | 1 | 2 | 3>, dayId = 'd2'): Session {
  const base = completedSession({ dayId, date })
  return {
    ...base,
    entries: base.entries.map((e) =>
      scores[e.recordKey] !== undefined ? { ...e, sensoryScore: scores[e.recordKey] } : e,
    ),
  }
}

describe('Phase 0 → 1', () => {
  it('phase0Progress를 재사용한다 (주 3회 × 8주)', () => {
    const sessions = Array.from({ length: 8 }, (_, w) =>
      ['d1', 'd2', 'd4'].map((dayId, i) =>
        completedSession({ dayId, date: addDays('2026-07-06', w * 7 + i * 2) }),
      ),
    ).flat()
    const r = phaseReadiness(sessions, ROUTINE, 0, '2026-08-31')
    expect(r.to).toBe(1)
    expect(r.checks[0].detail).toBe('8/8주')
    expect(r.allMet).toBe(true)
  })

  it('미달이면 allMet=false', () => {
    const r = phaseReadiness([], ROUTINE, 0, TODAY)
    expect(r.allMet).toBe(false)
    expect(r.checks[0].detail).toBe('0/8주')
  })
})

describe('Phase 1 → 2 (B그룹 절반 이상 감각 2점 안정)', () => {
  it('절반 이상이 중앙값 2 이상이면 충족', () => {
    // D2의 B그룹: arm-pulldown, rear-delt-fly, lateral-raise, curl (4종목)
    const high = { 'arm-pulldown@d2': 3, 'rear-delt-fly@d2': 2 } as const
    const low = { 'lateral-raise@d2': 1, 'curl@d2': 0 } as const
    const sessions = [0, 3, 6].map((d) =>
      withSensory(back(d), { ...high, ...low } as Record<string, 0 | 1 | 2 | 3>),
    )
    const r = phaseReadiness(sessions, ROUTINE, 1, TODAY)
    expect(r.to).toBe(2)
    // 4종목 중 2종목 안정 → 필요 2 → 충족
    expect(r.checks[0].detail).toContain('2/4종목')
    expect(r.allMet).toBe(true)
  })

  it('절반 미달이면 미충족', () => {
    const sessions = [0, 3, 6].map((d) =>
      withSensory(back(d), {
        'arm-pulldown@d2': 3,
        'rear-delt-fly@d2': 1,
        'lateral-raise@d2': 1,
        'curl@d2': 0,
      }),
    )
    const r = phaseReadiness(sessions, ROUTINE, 1, TODAY)
    expect(r.allMet).toBe(false)
  })

  it('감각을 입력하지 않은 종목은 분모에 들고 분자에서 빠진다', () => {
    // 기록은 있지만 점수가 없으면 "검증되지 않음"이므로 충족으로 볼 수 없다
    const sessions = [0, 3].map((d) => withSensory(back(d), { 'arm-pulldown@d2': 3 }))
    const r = phaseReadiness(sessions, ROUTINE, 1, TODAY)
    expect(r.checks[0].detail).toContain('1/4종목')
    expect(r.allMet).toBe(false)
  })

  it('최근 4주에 B그룹 기록이 없으면 "기록 부족"으로 배너를 띄우지 않는다', () => {
    const old = withSensory(back(60), { 'arm-pulldown@d2': 3 })
    const r = phaseReadiness([old], ROUTINE, 1, TODAY)
    expect(r.checks[0].insufficient).toBe(true)
    expect(r.allMet).toBe(false)
  })

  it('중앙값이므로 한 번의 저점이 판정을 뒤집지 않는다', () => {
    // 2, 0, 2 → 중앙값 2 (통과) / 평균 1.33 (미달). 평균을 썼다면 이 케이스가 깨진다.
    // 컨디션 나쁜 하루가 Phase 전환을 막으면 안 되므로 중앙값을 쓴다.
    const all = (v: 0 | 2) => ({
      'arm-pulldown@d2': v,
      'rear-delt-fly@d2': v,
      'lateral-raise@d2': v,
      'curl@d2': v,
    })
    const sessions = [
      withSensory(back(0), all(2)),
      withSensory(back(3), all(0)),
      withSensory(back(6), all(2)),
    ]
    const r = phaseReadiness(sessions, ROUTINE, 1, TODAY)
    expect(r.checks[0].detail).toContain('4/4종목')
    expect(r.allMet).toBe(true)
  })
})

describe('무게 증가 이벤트 카운트', () => {
  const KEY = 'lat-pulldown@d2'

  it('최고 무게가 갱신된 횟수만 센다', () => {
    const sessions = [40, 40, 42.5, 42.5, 45].map((w, i) => withSets(back(30 - i * 5), KEY, w))
    // 40(첫 기록) → 40(유지) → 42.5(+1) → 42.5(유지) → 45(+1)
    expect(weightIncreaseCount(sessions, KEY)).toBe(2)
  })

  it('첫 기록은 증가로 세지 않는다', () => {
    expect(weightIncreaseCount([withSets(back(1), KEY, 40)], KEY)).toBe(0)
  })

  it('무게가 내려갔다 회복한 것은 갱신이 아니다', () => {
    // 45 → 40(디로드) → 45(복귀) : 러닝 최고 45를 넘지 못했으므로 0
    const sessions = [45, 40, 45].map((w, i) => withSets(back(20 - i * 5), KEY, w))
    expect(weightIncreaseCount(sessions, KEY)).toBe(0)
  })

  it('기록이 없으면 0', () => {
    expect(weightIncreaseCount([], KEY)).toBe(0)
  })
})

describe('공백 판정', () => {
  it('기록 사이 4주+ 공백을 잡는다', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: back(90) }),
      completedSession({ dayId: 'd1', date: back(10) }),
    ]
    expect(hasGapWithin(sessions, back(180), TODAY)).toBe(true)
  })

  it('마지막 기록 이후의 공백도 잡는다', () => {
    const sessions = [completedSession({ dayId: 'd1', date: back(GAP_DAYS + 5) })]
    expect(hasGapWithin(sessions, back(180), TODAY)).toBe(true)
  })

  it('구간 시작부터 첫 기록까지의 공백도 잡는다', () => {
    const sessions = [completedSession({ dayId: 'd1', date: back(1) })]
    expect(hasGapWithin(sessions, back(180), TODAY)).toBe(true)
  })

  it('꾸준하면 공백 없음', () => {
    const sessions = Array.from({ length: 30 }, (_, i) =>
      completedSession({ dayId: 'd1', date: back(i * 5) }),
    )
    expect(hasGapWithin(sessions, back(140), TODAY)).toBe(false)
  })

  it('기록이 아예 없으면 공백으로 본다', () => {
    expect(hasGapWithin([], back(180), TODAY)).toBe(true)
  })
})

describe('Phase 2 → 3 (4개 조건)', () => {
  it('조건 4개를 모두 낸다', () => {
    const r = phaseReadiness([], ROUTINE, 2, TODAY)
    expect(r.to).toBe(3)
    expect(r.checks).toHaveLength(4)
    expect(r.allMet).toBe(false)
  })

  it('보상작용이 최근 4주에 하나라도 있으면 미충족', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: back(3), compensation: '반동' }),
      completedSession({ dayId: 'd2', date: back(1) }),
    ]
    const comp = phaseReadiness(sessions, ROUTINE, 2, TODAY).checks.find((c) =>
      c.label.includes('보상작용'),
    )!
    expect(comp.met).toBe(false)
    expect(comp.detail).toContain('1세션')
  })

  it('전 조건 충족 시 allMet', () => {
    // 5일 간격으로 꾸준히 + 무게 계단 증가 + 감각 3점 + 보상작용 없음
    const sessions: Session[] = []
    for (let i = 0; i < 36; i += 1) {
      const date = back(i * 5)
      const weight = 40 + Math.floor((36 - i) / 6) * 2.5
      for (const dayId of ['d1', 'd2']) {
        const base = completedSession({ dayId, date })
        sessions.push({
          ...base,
          entries: base.entries.map((e) => ({
            ...e,
            sets: e.sets.map((s) => ({ ...s, weight, done: true })),
            sensoryScore: 3 as const,
          })),
        })
      }
    }
    const r = phaseReadiness(sessions, ROUTINE, 2, TODAY)
    const failed = r.checks.filter((c) => !c.met).map((c) => `${c.label}: ${c.detail}`)
    expect(failed).toEqual([])
    expect(r.allMet).toBe(true)
    // 주요 3종목이 MIN_WEIGHT_INCREASES 이상 올랐다
    expect(MIN_WEIGHT_INCREASES).toBe(3)
  })
})

describe('Phase 3', () => {
  it('전환 대상이 없고 배너를 띄우지 않는다', () => {
    const r = phaseReadiness([], ROUTINE, 3, TODAY)
    expect(r.to).toBeNull()
    expect(r.allMet).toBe(false)
  })
})
