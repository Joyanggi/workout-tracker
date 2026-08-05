import { describe, expect, it } from 'vitest'
import {
  DELOAD_RESET_GAP_DAYS,
  deloadState,
  earlyDeloadSignal,
  expectedExposures,
  keyARecordKeys,
  muscleBars,
  phase0Progress,
  weekCounts,
  weekDots,
} from './dashboard'
import { addDays } from './dates'
import { progressionSuggestions } from './progression'
import { ROUTINE, completedSession } from './testFixtures'
import type { Session } from '../types'

/** 2026-08-03 = 월요일 */
const MON = '2026-08-03'
const week = (n: number) => addDays(MON, n * 7)

/** 한 주에 지정한 Day들을 수행한 세션들 */
function weekOf(weekIndex: number, dayIds: string[], opts: { mode?: 'normal' | 'deload' } = {}) {
  return dayIds.map((dayId, i) =>
    completedSession({
      dayId,
      date: addDays(week(weekIndex), i * 2 <= 6 ? i * 2 : 6),
      ...(opts.mode === 'deload' ? { mode: 'deload' as const } : {}),
    }),
  )
}

describe('주간 수행 횟수 (§7)', () => {
  it('기록이 없는 주도 count 0으로 채운다 (연속성 판정용)', () => {
    const sessions = [...weekOf(0, ['d1']), ...weekOf(2, ['d1'])]
    const counts = weekCounts(sessions, week(2))
    expect(counts.map((c) => c.count)).toEqual([1, 0, 1])
  })

  it('fallback 세션도 카운트한다', () => {
    const sessions = weekOf(0, ['d1', 'fallback-pull', 'd3'])
    expect(weekCounts(sessions, week(0))[0].count).toBe(3)
  })

  it('같은 날 두 세션도 각각 센다 (§4에서 허용)', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: MON }),
      completedSession({ dayId: 'd2', date: MON }),
    ]
    expect(weekCounts(sessions, MON)[0].count).toBe(2)
    const dots = weekDots(sessions, MON)
    expect(dots[0].count).toBe(2)
  })
})

describe('주간 도트 (§5.1)', () => {
  it('월~일 7개, 오늘 표시, 미래 표시', () => {
    const wed = addDays(MON, 2)
    const dots = weekDots([completedSession({ dayId: 'd1', date: MON })], wed)
    expect(dots).toHaveLength(7)
    expect(dots[0]).toMatchObject({ date: MON, count: 1, isToday: false, isFuture: false })
    expect(dots[2]).toMatchObject({ date: wed, isToday: true, isFuture: false })
    expect(dots[3].isFuture).toBe(true)
  })
})

describe('부위별 기대 빈도 — 부위 이름을 하드코딩하지 않는다', () => {
  it('루틴이 제공하는 정규 Day 수로 기대 빈도를 정한다 (최대 2)', () => {
    // 측면어깨 d1·d2·d4 → 2, 상부가슴 d1·d4 → 2, 광배 d2·d4 → 2
    expect(expectedExposures(ROUTINE, '측면어깨')).toBe(2)
    expect(expectedExposures(ROUTINE, '상부가슴')).toBe(2)
    expect(expectedExposures(ROUTINE, '광배')).toBe(2)
    // 하체·코어는 d3만, 가슴(플랫)은 d1만 → 1
    expect(expectedExposures(ROUTINE, '하체')).toBe(1)
    expect(expectedExposures(ROUTINE, '코어')).toBe(1)
    expect(expectedExposures(ROUTINE, '가슴')).toBe(1)
  })

  it('바는 가중치(우선순위) 내림차순으로 정렬된다 (§5.1)', () => {
    const { bars } = muscleBars([], ROUTINE, MON)
    /*
      하드코딩 목록을 규칙으로 바꿨다 (CC9). 내전근(0.30)이 신설되며 코어(0.30)와
      **가중치가 같아졌고**, 동률의 순서는 정렬 안정성에 달려 있어 목록을 박으면
      의미 없는 실패가 된다. 검사해야 하는 것은 "내림차순"이라는 규칙이다.
    */
    const weights = bars.map((b) => ROUTINE.muscleTargets[b.muscle].weight)
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i], `${bars[i - 1].muscle} → ${bars[i].muscle}`).toBeLessThanOrEqual(
        weights[i - 1],
      )
    }
    // 목표에 있는 부위가 하나도 빠지지 않는다 (부위 이름을 하드코딩하지 않는 것이 이 describe의 취지다)
    expect(bars.map((b) => b.muscle).sort()).toEqual(Object.keys(ROUTINE.muscleTargets).sort())
    // 최상위 셋은 우선순위가 명확하므로 그대로 고정한다
    expect(bars.slice(0, 3).map((b) => b.muscle)).toEqual(['측면어깨', '상부가슴', '광배'])
  })

  it('주 3회 미만인 주에는 빈도 미달을 경고하지 않는다', () => {
    // 월요일에 D1만 한 상태에서 모든 부위가 "0x 주의"로 뜨면 소음이다
    const sessions = weekOf(0, ['d1'])
    const { bars, sessionCount } = muscleBars(sessions, ROUTINE, MON)
    expect(sessionCount).toBe(1)
    expect(bars.every((b) => !b.underFrequency)).toBe(true)
  })

  it('주 3회를 채운 뒤에는 2회 노출 기대 부위의 미달을 경고한다', () => {
    // D1·D2·D3 = 3회. 상부가슴은 D1에서만 노출(1x)인데 기대는 2x
    const sessions = weekOf(0, ['d1', 'd2', 'd3'])
    const { bars } = muscleBars(sessions, ROUTINE, week(0))
    const byMuscle = new Map(bars.map((b) => [b.muscle, b]))
    expect(byMuscle.get('상부가슴')).toMatchObject({ exposures: 1, underFrequency: true })
    // 측면어깨는 D1·D2 둘 다 있으므로 2x — 경고 없음
    expect(byMuscle.get('측면어깨')).toMatchObject({ exposures: 2, underFrequency: false })
    // 하체는 기대가 1x이므로 1회로 충분
    expect(byMuscle.get('하체')).toMatchObject({ exposures: 1, underFrequency: false })
  })

  it('실제 수행 세트만 집계한다 (목표 초과도 그대로 표시)', () => {
    const sessions = weekOf(0, ['d1', 'd2', 'd4'])
    const { bars } = muscleBars(sessions, ROUTINE, week(0))
    const 측면 = bars.find((b) => b.muscle === '측면어깨')!
    // §8 검산표: D1 7 + D2 2 + D4 4 = 13 (목표 11 초과)
    expect(측면).toMatchObject({ performed: 13, target: 11 })
  })
})

describe('디로드 카운터 (§7)', () => {
  it('주 3회 이상인 주만 센다', () => {
    const sessions = [
      ...weekOf(0, ['d1', 'd2', 'd4']), // 3회 → 카운트
      ...weekOf(1, ['d1', 'd2']), // 2회 → 카운트 안 함
      ...weekOf(2, ['d1', 'd2', 'd3', 'd4']), // 4회 → 카운트
    ]
    expect(deloadState(sessions, ROUTINE, week(2)).performedWeeks).toBe(2)
  })

  it('8주 도달 시 due', () => {
    const sessions = Array.from({ length: 8 }, (_, i) => weekOf(i, ['d1', 'd2', 'd4'])).flat()
    const state = deloadState(sessions, ROUTINE, week(7))
    expect(state.performedWeeks).toBe(8)
    expect(state.due).toBe(true)
  })

  it('4주+ 공백이 생기면 리셋된다', () => {
    const sessions = [
      ...weekOf(0, ['d1', 'd2', 'd4']),
      ...weekOf(1, ['d1', 'd2', 'd4']),
      // 5주 공백 후 재개
      ...weekOf(7, ['d1', 'd2', 'd4']),
      ...weekOf(8, ['d1', 'd2', 'd4']),
    ]
    expect(deloadState(sessions, ROUTINE, week(8)).performedWeeks).toBe(2)
  })

  it('진행 중인 공백(마지막 세션 이후 4주+)도 리셋한다', () => {
    const sessions = [...weekOf(0, ['d1', 'd2', 'd4']), ...weekOf(1, ['d1', 'd2', 'd4'])]
    const later = addDays(week(1), DELOAD_RESET_GAP_DAYS + 7)
    expect(deloadState(sessions, ROUTINE, later).performedWeeks).toBe(0)
  })

  it('디로드를 수행하면 카운터가 리셋된다 (§7에 없지만 없으면 배너가 영구히 남는다)', () => {
    const eight = Array.from({ length: 8 }, (_, i) => weekOf(i, ['d1', 'd2', 'd4'])).flat()
    expect(deloadState(eight, ROUTINE, week(7)).due).toBe(true)

    // 9주차에 디로드 수행 → 10주차에는 카운터가 다시 0부터
    const withDeload = [...eight, ...weekOf(8, ['d1', 'd2', 'd4'], { mode: 'deload' })]
    const after = deloadState(withDeload, ROUTINE, week(9))
    expect(after.performedWeeks).toBe(0)
    expect(after.due).toBe(false)
  })

  it('기록이 없으면 0/8', () => {
    expect(deloadState([], ROUTINE, MON)).toMatchObject({ performedWeeks: 0, due: false })
  })
})

describe('조기 디로드 신호 (§7)', () => {
  it('주요 3종목은 A그룹 중 세트 수 최다 3개다', () => {
    expect(keyARecordKeys(ROUTINE)).toEqual([
      'incline-chest-press@d1', // 4세트, 상부가슴 0.90
      'lat-pulldown@d2', // 4세트, 광배 0.85
      'seated-cable-row@d2', // 4세트, 광배 0.85
    ])
  })

  it('2주 연속 하락하면 신호가 뜬다', () => {
    const sessions = [0, 1, 2].flatMap((i) =>
      ['d1', 'd2'].map((dayId) =>
        completedSession({
          dayId,
          date: addDays(week(i), dayId === 'd1' ? 0 : 2),
          // 주차마다 반복수를 낮춘다: repMax → repMin
          fullReps: i === 0,
          repsOverride: i === 0 ? undefined : i === 1 ? 9 : 8,
        }),
      ),
    )
    const result = earlyDeloadSignal(sessions, ROUTINE, week(2))
    expect(result.signal).toBe(true)
    expect(result.detail).toContain('→')
  })

  it('반복수가 유지되면 신호가 없다', () => {
    const sessions = [0, 1, 2].flatMap((i) =>
      ['d1', 'd2'].map((dayId) =>
        completedSession({ dayId, date: addDays(week(i), dayId === 'd1' ? 0 : 2), repsOverride: 10 }),
      ),
    )
    expect(earlyDeloadSignal(sessions, ROUTINE, week(2)).signal).toBe(false)
  })

  it('출석이 줄어든 것만으로는 신호가 뜨지 않는다', () => {
    // §7의 "총 반복수"를 주간 합으로 계산하면 이 케이스가 오탐이 된다.
    // 주 4회 → 3회 → 2회로 줄지만 세션당 수행은 동일하다 = 수행 저하가 아니다.
    const plan: string[][] = [
      ['d1', 'd2', 'd1', 'd2'],
      ['d1', 'd2', 'd1'],
      ['d1', 'd2'],
    ]
    const sessions = plan.flatMap((days, i) =>
      days.map((dayId, j) =>
        completedSession({ dayId, date: addDays(week(i), j), repsOverride: 10 }),
      ),
    )
    expect(earlyDeloadSignal(sessions, ROUTINE, week(2)).signal).toBe(false)
  })

  it('종목이 빠진 주는 비교 대상에서 제외한다', () => {
    // 2주차에 D2를 안 하면 랫풀다운·시티드 로우 데이터가 없다.
    // 그 주를 0으로 취급하면 "하락"이 되지만 실제로는 비교 불가다.
    const sessions = [
      ...['d1', 'd2'].map((d) => completedSession({ dayId: d, date: addDays(week(0), d === 'd1' ? 0 : 2), repsOverride: 10 })),
      completedSession({ dayId: 'd1', date: week(1), repsOverride: 10 }),
      ...['d1', 'd2'].map((d) => completedSession({ dayId: d, date: addDays(week(2), d === 'd1' ? 0 : 2), repsOverride: 10 })),
    ]
    // 비교 가능한 주가 2개(0주, 2주)뿐이라 3주 연속 판정이 불가능 → 신호 없음
    expect(earlyDeloadSignal(sessions, ROUTINE, week(2)).signal).toBe(false)
  })

  it('데이터가 3주 미만이면 판정하지 않는다', () => {
    const sessions = weekOf(0, ['d1', 'd2'])
    expect(earlyDeloadSignal(sessions, ROUTINE, week(0)).signal).toBe(false)
  })
})

describe('Phase 0 진행률 (§7)', () => {
  it('주 3회 이상 연속 주 수를 센다', () => {
    const sessions = [0, 1, 2].flatMap((i) => weekOf(i, ['d1', 'd2', 'd4']))
    expect(phase0Progress(sessions, ROUTINE, week(2))).toMatchObject({ streak: 3, target: 8 })
  })

  it('주 2회 주를 1회까지 통과로 인정한다', () => {
    const sessions = [
      ...weekOf(0, ['d1', 'd2', 'd4']),
      ...weekOf(1, ['d1', 'd2']), // 2회 — 통과권 사용
      ...weekOf(2, ['d1', 'd2', 'd4']),
    ]
    const p = phase0Progress(sessions, ROUTINE, week(2))
    expect(p).toMatchObject({ streak: 3, allowanceUsed: 1 })
  })

  it('주 2회가 두 번 나오면 두 번째에서 연속이 끊긴다', () => {
    const sessions = [
      ...weekOf(0, ['d1', 'd2', 'd4']),
      ...weekOf(1, ['d1', 'd2']), // 2회
      ...weekOf(2, ['d1', 'd2']), // 2회 — 통과권 소진
      ...weekOf(3, ['d1', 'd2', 'd4']),
    ]
    // 최근 주부터: 3주차(3회) → 2주차(2회, 통과) → 1주차(2회, 통과권 없음) → 끊김
    expect(phase0Progress(sessions, ROUTINE, week(3)).streak).toBe(2)
  })

  it('진행 중인 이번 주가 미달이어도 연속이 끊기지 않는다', () => {
    // 수요일에 1회만 한 상태를 "실패"로 처리하면 주중에 진행률이 0으로 떨어진다
    const sessions = [
      ...weekOf(0, ['d1', 'd2', 'd4']),
      ...weekOf(1, ['d1', 'd2', 'd4']),
      completedSession({ dayId: 'd1', date: week(2) }), // 이번 주 1회
    ]
    const wed = addDays(week(2), 2)
    expect(phase0Progress(sessions, ROUTINE, wed).streak).toBe(2)
  })

  it('진행 중인 이번 주는 통과권을 소진하지 않는다', () => {
    // 수요일에 2회를 한 상태에서 8주 중 1회뿐인 통과권을 써버리면,
    // 그 주에 3회를 채워도 이미 쓴 것처럼 보이고 다음 주에 쓸 수 없게 된다.
    const sessions = [
      ...weekOf(0, ['d1', 'd2', 'd4']),
      ...weekOf(1, ['d1', 'd2', 'd4']),
      ...weekOf(2, ['d1', 'd2']), // 이번 주 2회 (진행 중)
    ]
    const wed = addDays(week(2), 2)
    const p = phase0Progress(sessions, ROUTINE, wed)
    expect(p.streak).toBe(2) // 완료된 2주만
    expect(p.allowanceUsed).toBe(0) // 통과권 보존
  })

  it('지난 주 2회는 통과권을 쓴다 (주가 끝났으므로)', () => {
    const sessions = [
      ...weekOf(0, ['d1', 'd2', 'd4']),
      ...weekOf(1, ['d1', 'd2']), // 끝난 주, 2회
      ...weekOf(2, ['d1', 'd2', 'd4']), // 이번 주 3회
    ]
    const p = phase0Progress(sessions, ROUTINE, addDays(week(2), 5))
    expect(p).toMatchObject({ streak: 3, allowanceUsed: 1 })
  })

  it('이번 주가 이미 3회면 포함한다', () => {
    const sessions = [...weekOf(0, ['d1', 'd2', 'd4']), ...weekOf(1, ['d1', 'd2', 'd4'])]
    const sat = addDays(week(1), 5)
    expect(phase0Progress(sessions, ROUTINE, sat).streak).toBe(2)
  })

  it('8주 달성 시 achieved', () => {
    const sessions = Array.from({ length: 8 }, (_, i) => weekOf(i, ['d1', 'd2', 'd4'])).flat()
    expect(phase0Progress(sessions, ROUTINE, week(7))).toMatchObject({ streak: 8, achieved: true })
  })

  it('기록이 없으면 0주', () => {
    expect(phase0Progress([], ROUTINE, MON).streak).toBe(0)
  })
})

describe('증량 배지 — 홈과 요약이 같은 함수를 쓴다 (§5.1 · §5.2)', () => {
  const atMax = (dayId: string, date: string): Session =>
    completedSession({ dayId, date, fullReps: true })

  it('A그룹에서 모든 세트 상단 도달 + 보상작용 없음이면 제안한다', () => {
    const s = atMax('d2', MON)
    const out = progressionSuggestions(s, ROUTINE, 0)
    expect(out.map((p) => p.exerciseId).sort()).toEqual(['lat-pulldown', 'seated-cable-row'])
    expect(out[0]).toMatchObject({ from: 40, to: 42.5 })
  })

  it('보상작용이 있으면 제안하지 않는다', () => {
    const s = completedSession({ dayId: 'd2', date: MON, fullReps: true, compensation: '상체가 크게 젖혀짐' })
    expect(progressionSuggestions(s, ROUTINE, 0)).toEqual([])
  })

  it('Phase 0에서도 활성이다 (v2.4)', () => {
    expect(progressionSuggestions(atMax('d2', MON), ROUTINE, 0).length).toBeGreaterThan(0)
  })

  it('allowProgressionInPhase0이 false면 Phase 0에서 막힌다', () => {
    const strict = { ...ROUTINE, rules: { ...ROUTINE.rules, allowProgressionInPhase0: false } }
    expect(progressionSuggestions(atMax('d2', MON), strict, 0)).toEqual([])
    expect(progressionSuggestions(atMax('d2', MON), strict, 1).length).toBeGreaterThan(0)
  })
})

describe('리뷰 P0-2 회귀 — 홈 증량 배지도 계획 세트를 요구한다', () => {
  it('부분 수행 세션은 증량 배지를 만들지 않는다', () => {
    // completedSession은 계획 세트를 전부 채우므로, 일부만 남긴 세션을 직접 만든다
    const base = completedSession({ dayId: 'd2', date: MON, fullReps: true })
    const partial = {
      ...base,
      entries: base.entries.map((e) =>
        e.recordKey === 'lat-pulldown@d2' ? { ...e, sets: e.sets.slice(0, 2) } : e,
      ),
    }
    const keys = progressionSuggestions(partial, ROUTINE, 0).map((p) => p.recordKey)
    expect(keys).not.toContain('lat-pulldown@d2')
    // 계획대로 다 한 시티드 로우는 여전히 제안된다
    expect(keys).toContain('seated-cable-row@d2')
  })
})
