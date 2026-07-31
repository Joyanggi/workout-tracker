import { describe, expect, it } from 'vitest'
import {
  SENSORY_BUCKET_WEEKS,
  sensoryTrend,
  strengthRecordKeys,
  strengthTrend,
  weeklyBars,
} from './analysis'
import { addDays } from './dates'
import { e1rm } from './derive'
import { ROUTINE, completedSession } from './testFixtures'
import type { Session } from '../types'

const MON = '2026-08-03'
const week = (n: number) => addDays(MON, n * 7)
const LAT = 'lat-pulldown@d2'

/** 특정 recordKey의 세트를 직접 지정한 완료 세션 */
function withSets(date: string, recordKey: string, sets: { weight: number; reps: number }[], dayId = 'd2'): Session {
  const base = completedSession({ dayId, date })
  return {
    ...base,
    entries: base.entries.map((e) =>
      e.recordKey === recordKey
        ? { ...e, sets: sets.map((s) => ({ ...s, done: true, doneAt: base.startedAt })) }
        : e,
    ),
  }
}

describe('A그룹 추이 (§5.4)', () => {
  it('오래된 것부터 시간순으로 낸다 (차트 x축)', () => {
    const sessions = [
      withSets('2026-08-10', LAT, [{ weight: 45, reps: 8 }]),
      withSets('2026-08-03', LAT, [{ weight: 40, reps: 10 }]),
    ]
    expect(strengthTrend(sessions, LAT).map((p) => p.date)).toEqual(['2026-08-03', '2026-08-10'])
  })

  it('"최고 세트"는 무게가 아니라 e1RM 기준이다', () => {
    // 무게만 보면 45×3이 40×12를 항상 이겨서 반복수 진전이 안 보인다.
    // e1RM: 45×3 = 49.5, 40×12 = 56 → 40×12가 최고 세트
    const s = withSets('2026-08-03', LAT, [
      { weight: 45, reps: 3 },
      { weight: 40, reps: 12 },
    ])
    const p = strengthTrend([s], LAT)[0]
    expect(p.topWeight).toBe(40)
    expect(p.maxReps).toBe(12)
    expect(p.e1rm).toBeCloseTo(Math.round(e1rm(40, 12) * 10) / 10, 5)
  })

  it('topLoad · volume · e1RM을 함께 낸다 (§7 진전 지표)', () => {
    // 감량기에는 증량 조건이 거의 충족되지 않으므로 보조 지표가 필수다
    const s = withSets('2026-08-03', LAT, [
      { weight: 40, reps: 10 },
      { weight: 40, reps: 9 },
      { weight: 40, reps: 8 },
    ])
    const p = strengthTrend([s], LAT)[0]
    expect(p.topLoad).toBe(400) // 40 × 10
    expect(p.volume).toBe(40 * (10 + 9 + 8))
  })

  it('체크된 세트가 없는 세션은 점을 만들지 않는다', () => {
    const s = completedSession({ dayId: 'd2', date: MON })
    const unchecked: Session = {
      ...s,
      entries: s.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, done: false })) })),
    }
    expect(strengthTrend([unchecked], LAT)).toEqual([])
  })

  it('디로드/복귀 세션도 포함하되 mode를 표시한다', () => {
    // 제외하면 "왜 그 주가 비었나"를 알 수 없고, 표시하지 않으면 하락으로 오독한다
    const sessions = [
      completedSession({ dayId: 'd2', date: MON }),
      completedSession({ dayId: 'd2', date: '2026-08-05', mode: 'deload' }),
    ]
    expect(strengthTrend(sessions, LAT).map((p) => p.mode)).toEqual(['normal', 'deload'])
  })

  it('A그룹만 목록에 넣고 루틴 순서로 정렬한다', () => {
    const sessions = [completedSession({ dayId: 'd1', date: MON }), completedSession({ dayId: 'd2', date: '2026-08-05' })]
    const keys = strengthRecordKeys(sessions, ROUTINE).map((k) => k.recordKey)
    // D1의 A그룹: 인클라인(1), 플랫(3), 숄더(4) / D2의 A그룹: 랫풀(2), 로우(3)
    expect(keys).toEqual([
      'incline-chest-press@d1',
      'flat-chest-press@d1',
      'shoulder-press@d1',
      'lat-pulldown@d2',
      'seated-cable-row@d2',
    ])
    // B그룹(레터럴·펙덱 등)은 없다
    expect(keys.some((k) => k.startsWith('lateral-raise'))).toBe(false)
  })
})

describe('B그룹 감각 점수 추이 (§5.4)', () => {
  function withSensory(date: string, scores: Record<string, 0 | 1 | 2 | 3>): Session {
    const base = completedSession({ dayId: 'd2', date })
    return {
      ...base,
      entries: base.entries.map((e) =>
        scores[e.recordKey] !== undefined ? { ...e, sensoryScore: scores[e.recordKey] } : e,
      ),
    }
  }

  it('4주 단위로 묶어 평균을 낸다', () => {
    const sessions = [
      withSensory(week(0), { 'rear-delt-fly@d2': 1 }),
      withSensory(week(1), { 'rear-delt-fly@d2': 3 }),
      // 5주차 = 다음 구간
      withSensory(week(4), { 'rear-delt-fly@d2': 2 }),
    ]
    const t = sensoryTrend(sessions, ROUTINE, week(4))
    expect(t.buckets).toHaveLength(2)
    expect(t.buckets[0].scores['rear-delt-fly@d2']).toBe(2) // (1+3)/2
    expect(t.buckets[0].counts['rear-delt-fly@d2']).toBe(2)
    expect(t.buckets[1].scores['rear-delt-fly@d2']).toBe(2)
    expect(SENSORY_BUCKET_WEEKS).toBe(4)
  })

  it('감각 점수가 입력되지 않은 종목은 대상에서 뺀다', () => {
    const t = sensoryTrend([withSensory(week(0), { 'rear-delt-fly@d2': 2 })], ROUTINE, week(0))
    expect(t.recordKeys).toEqual(['rear-delt-fly@d2'])
  })

  it('A그룹은 감각 점수 대상이 아니다', () => {
    // 데이터에 실수로 들어가 있어도 차트에 넣지 않는다 (§5.2 B그룹만)
    const s = withSensory(week(0), { 'lat-pulldown@d2': 3 })
    expect(sensoryTrend([s], ROUTINE, week(0)).recordKeys).toEqual([])
  })

  it('평균 1점 이하 + 2회 이상 입력이면 "약한 종목"으로 잡는다', () => {
    // §5.4 "계속 0인 종목" 탐지. 1회만 낮은 것은 우연일 수 있어 제외한다
    const sessions = [
      withSensory(week(0), { 'rear-delt-fly@d2': 0, 'curl@d2': 0 }),
      withSensory(week(1), { 'rear-delt-fly@d2': 1 }),
    ]
    const t = sensoryTrend(sessions, ROUTINE, week(1))
    expect(t.weak.map((w) => w.recordKey)).toEqual(['rear-delt-fly@d2'])
    expect(t.weak[0]).toMatchObject({ average: 0.5, count: 2 })
  })

  it('0점은 유효한 기록이다 (미입력과 구분)', () => {
    const sessions = [
      withSensory(week(0), { 'rear-delt-fly@d2': 0 }),
      withSensory(week(1), { 'rear-delt-fly@d2': 0 }),
    ]
    const t = sensoryTrend(sessions, ROUTINE, week(1))
    expect(t.buckets[0].scores['rear-delt-fly@d2']).toBe(0)
    expect(t.weak[0].average).toBe(0)
  })

  it('기록이 없으면 빈 결과', () => {
    expect(sensoryTrend([], ROUTINE, MON)).toEqual({ buckets: [], recordKeys: [], weak: [] })
  })
})

describe('주간 수행 횟수 바 (§5.4)', () => {
  it('요청한 주 수만큼, 기록 없는 주도 0으로 채운다', () => {
    const bars = weeklyBars([completedSession({ dayId: 'd1', date: week(0) })], week(3), 4, 3)
    expect(bars).toHaveLength(4)
    expect(bars.map((b) => b.count)).toEqual([1, 0, 0, 0])
  })

  it('목표 도달 주를 표시한다', () => {
    const sessions = ['d1', 'd2', 'd4'].map((dayId, i) =>
      completedSession({ dayId, date: addDays(week(0), i * 2) }),
    )
    const bars = weeklyBars(sessions, week(0), 1, 3)
    expect(bars[0]).toMatchObject({ count: 3, met: true })
    expect(weeklyBars(sessions.slice(0, 2), week(0), 1, 3)[0]).toMatchObject({ count: 2, met: false })
  })

  it('fallback 세션도 카운트한다', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: week(0) }),
      completedSession({ dayId: 'fallback-pull', date: addDays(week(0), 2) }),
      completedSession({ dayId: 'd3', date: addDays(week(0), 4) }),
    ]
    expect(weeklyBars(sessions, week(0), 1, 3)[0]).toMatchObject({ count: 3, met: true })
  })
})
