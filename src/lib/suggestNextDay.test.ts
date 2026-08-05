import { describe, expect, it } from 'vitest'
import { ROUTINE, completedSession } from './testFixtures'
import { FIRST_EXPOSURE_BONUS, majorMuscles, returnStepFor, suggestNextDay } from './suggestNextDay'
import { weeklyVolume } from './derive'

/**
 * DESIGN.md §4 "동작 검증" 표를 기계적으로 검증한다.
 *
 * 이 표가 통과하지 않으면 §4의 핵심 결론("주 4회 완주 시 D1→D2→D4→D3",
 * "완충이 D4에서 D3로 이동")이 성립하지 않는다.
 *
 * 날짜 주의: 2026-08-03(월)~08-09(일)이 한 주다. 회복 감쇠(24시간)를 피하려고
 * 세션 간 간격을 이틀로 둔다 — 표는 요일과 무관한 "순번"만 의미한다고 명시하고 있다.
 */
describe('§4 동작 검증 표', () => {
  const MON = '2026-08-03'
  const cases: { history: string[]; expected: string; note: string }[] = [
    { history: [], expected: 'd1', note: '기록 없음' },
    { history: ['d1'], expected: 'd2', note: '광배·후면어깨 0' },
    { history: ['d1', 'd2'], expected: 'd4', note: 'D4=10.5 > D3=6.45 (CC9 후)' },
    { history: ['d1', 'd2', 'd4'], expected: 'd3', note: '상체 충족, 하체·코어만 남음' },
  ]

  for (const { history, expected, note } of cases) {
    it(`이력 [${history.join(', ') || '없음'}] → ${expected} (${note})`, () => {
      const sessions = history.map((dayId, i) =>
        completedSession({ dayId, date: addDays(MON, i * 2) }),
      )
      const today = addDays(MON, history.length * 2)
      const result = suggestNextDay({
        sessions,
        routine: ROUTINE,
        today,
        now: new Date(`${today}T18:00:00.000Z`),
      })
      expect(result.day.id).toBe(expected)
    })
  }

  /*
   * ⚠ **CC9로 D3 점수가 바뀌었다** (소급 효과 — DEV-RECORD 기재 항목).
   *
   * 내전근 목표(target 3 · weight 0.3)가 신설되면서 D3가 제공하는 부위가 하나 늘었다:
   *   하체 0.45×9 = 4.05 · 내전근 0.3×3 = 0.90 · 코어 0.3×5 = 1.50 → **6.45** (이전 5.55)
   *
   * 문서 §4 표 3행의 숫자 "5.55"는 이제 시드와 어긋난다. **그 행의 결론(D4 > D3 이므로
   * 3행은 D4)은 그대로 성립한다** (10.5 > 9.675) — 바뀐 것은 D3의 값 하나다.
   * 문서 쪽 갱신이 필요한 자리이므로 DEV-RECORD §리뷰어 질의에 올렸다.
   */
  it('3행 점수: D4는 문서값 10.5, D3는 내전근 신설 후 6.45다', () => {
    // 이 행은 문서가 계산 과정을 명시한 유일한 행이라 수식 구현의 기준점이 된다.
    // (첫 노출 보너스는 이 행에서 발동하지 않는다: 상체는 전부 노출됨, D3는 하체·코어라
    //  보너스가 걸리지만 그래도 D4가 이긴다 — 아래에서 rawScore로 문서값을 확인한다)
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-08-03' }),
      completedSession({ dayId: 'd2', date: '2026-08-05' }),
    ]
    const result = suggestNextDay({
      sessions,
      routine: ROUTINE,
      today: '2026-08-07',
      now: new Date('2026-08-07T18:00:00.000Z'),
    })
    const d4 = result.scores.find((s) => s.dayId === 'd4')!
    const d3 = result.scores.find((s) => s.dayId === 'd3')!
    // D4는 내전근을 제공하지 않으므로 문서값 그대로다
    expect(d4.rawScore).toBeCloseTo(10.5, 5)
    // D3는 하체·내전근·코어가 이번 주 첫 노출이라 보너스가 곱해진다
    expect(d3.rawScore).toBeCloseTo(6.45 * FIRST_EXPOSURE_BONUS, 5)
    // **문서 3행의 결론**은 그대로다 — 점수가 올라도 D4가 이긴다
    expect(d4.score).toBeGreaterThan(d3.score)
  })
})

describe('첫 노출 보너스', () => {
  it('보너스가 없으면 2행(D1 → D2)이 깨진다', () => {
    // 문서 표의 산술 누락을 회귀 테스트로 고정한다.
    // 원식(보너스 1.0): D4=15.40 > D2=14.80 → D4가 뽑혀 문서와 어긋난다.
    const sessions = [completedSession({ dayId: 'd1', date: '2026-08-03' })]
    const week = weeklyVolume(sessions, ROUTINE, '2026-08-05')

    const raw = (dayId: string) => {
      const day = ROUTINE.days.find((d) => d.id === dayId)!
      let sum = 0
      for (const [muscle, provided] of Object.entries(day.muscleSets)) {
        const t = ROUTINE.muscleTargets[muscle]
        sum += t.weight * Math.max(0, Math.min(t.target - (week.sets[muscle] ?? 0), provided))
      }
      return sum
    }
    expect(raw('d2')).toBeCloseTo(14.8, 5)
    expect(raw('d4')).toBeCloseTo(15.4, 5)
    expect(raw('d4')).toBeGreaterThan(raw('d2')) // ← 이게 문서 표와 모순되는 지점
  })

  it('유효 구간(1.176, 1.892)의 중앙 근처 값이다', () => {
    expect(FIRST_EXPOSURE_BONUS).toBeGreaterThan(4.0 / 3.4) // 2행 성립: D2 > D4
    expect(FIRST_EXPOSURE_BONUS).toBeLessThan(10.5 / 5.55) // 3행 성립: D4 > D3
  })
})

describe('규칙 우선순위', () => {
  it('14일 이상 공백이면 점수를 무시하고 D1 + 복귀 프로토콜', () => {
    const sessions = [completedSession({ dayId: 'd2', date: '2026-07-01' })]
    const result = suggestNextDay({
      sessions,
      routine: ROUTINE,
      today: '2026-08-03',
      now: new Date('2026-08-03T18:00:00.000Z'),
    })
    expect(result.rule).toBe('returnGap')
    expect(result.day.id).toBe('d1')
    // 33일 = 4.7주 → gapWeeksMin 4 구간
    expect(result.returnStep).toEqual({
      gapWeeksMin: 4,
      weightPct: -10,
      setPct: -40,
      targetRIR: 3,
      rampWeeks: 2,
    })
  })

  it('하체를 10일 이상 안 했으면 점수를 무시하고 D3', () => {
    const sessions = [
      completedSession({ dayId: 'd3', date: '2026-07-20' }),
      completedSession({ dayId: 'd1', date: '2026-08-03' }),
      completedSession({ dayId: 'd2', date: '2026-08-04' }),
    ]
    const result = suggestNextDay({
      sessions,
      routine: ROUTINE,
      today: '2026-08-05',
      now: new Date('2026-08-05T18:00:00.000Z'),
    })
    expect(result.rule).toBe('lowerBodyGuard')
    expect(result.day.id).toBe('d3')
  })

  it('하체 가드는 14일 공백 규칙보다 뒤다', () => {
    // 전체 공백이 14일 이상이면 하체가 밀렸든 아니든 복귀가 우선이다
    const sessions = [completedSession({ dayId: 'd1', date: '2026-07-01' })]
    const result = suggestNextDay({
      sessions,
      routine: ROUTINE,
      today: '2026-08-03',
      now: new Date('2026-08-03T18:00:00.000Z'),
    })
    expect(result.rule).toBe('returnGap')
  })
})

describe('회복 감쇠', () => {
  it('직전 세션과 24시간 이내 + 주요 부위 겹침이면 ×0.3', () => {
    // D1 직후(같은 날 저녁) → D1의 주요 부위는 {상부가슴, 측면어깨}.
    // fallback-push는 후보가 아니므로, 정규 Day 중 주요 부위가 겹치는 Day를 확인한다.
    const sessions = [
      completedSession({
        dayId: 'd1',
        date: '2026-08-03',
        endedAt: '2026-08-03T19:30:00.000Z',
      }),
    ]
    const result = suggestNextDay({
      sessions,
      routine: ROUTINE,
      today: '2026-08-03',
      now: new Date('2026-08-03T21:00:00.000Z'), // 1.5시간 후
    })
    const d1 = result.scores.find((s) => s.dayId === 'd1')!
    expect(d1.penalized).toBe(true) // 자기 자신은 당연히 겹친다
    expect(d1.score).toBeCloseTo(d1.rawScore * 0.3, 5)
  })

  it('24시간이 지나면 감쇠하지 않는다', () => {
    const sessions = [
      completedSession({
        dayId: 'd1',
        date: '2026-08-03',
        endedAt: '2026-08-03T19:30:00.000Z',
      }),
    ]
    const result = suggestNextDay({
      sessions,
      routine: ROUTINE,
      today: '2026-08-05',
      now: new Date('2026-08-05T18:00:00.000Z'),
    })
    expect(result.scores.every((s) => !s.penalized)).toBe(true)
  })
})

describe('주요 부위 판정', () => {
  it('총 세트의 25% 이상을 차지하는 부위만 주요 부위다', () => {
    // D1 총 22세트: 상부가슴 7(31.8%), 측면어깨 7(31.8%)만 통과.
    // 팔 3세트(13.6%)가 주요 부위로 잡히면 D2도 D1과 겹쳐서 같이 감쇠되고,
    // 회복 제약이 사실상 모든 Day를 균일하게 깎아 무의미해진다.
    const d1 = ROUTINE.days.find((d) => d.id === 'd1')!
    expect([...majorMuscles(d1)].sort()).toEqual(['상부가슴', '측면어깨'])
    const d2 = ROUTINE.days.find((d) => d.id === 'd2')!
    expect([...majorMuscles(d2)]).toEqual(['광배'])
  })
})

describe('복귀 프로토콜 구간 선택', () => {
  it('가장 큰 gapWeeksMin 구간이 이긴다', () => {
    expect(returnStepFor(ROUTINE, 13)?.gapWeeksMin).toBe(undefined) // 1.9주 → 해당 없음
    expect(returnStepFor(ROUTINE, 14)?.gapWeeksMin).toBe(2)
    expect(returnStepFor(ROUTINE, 28)?.gapWeeksMin).toBe(4)
    expect(returnStepFor(ROUTINE, 60)?.gapWeeksMin).toBe(8)
  })
})

describe('주간 집계', () => {
  it('월요일이 주의 시작이다 — 일요일 세션은 그 주에 포함된다', () => {
    // 2026-08-09는 일요일, 2026-08-10은 월요일
    const sunday = completedSession({ dayId: 'd1', date: '2026-08-09' })
    const inSameWeek = weeklyVolume([sunday], ROUTINE, '2026-08-03')
    expect(inSameWeek.sessionCount).toBe(1)
    const nextWeek = weeklyVolume([sunday], ROUTINE, '2026-08-10')
    expect(nextWeek.sessionCount).toBe(0)
  })

  it('체크되지 않은 세트는 집계하지 않는다', () => {
    const session = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const withUnchecked = {
      ...session,
      entries: session.entries.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, done: false })),
      })),
    }
    expect(weeklyVolume([withUnchecked], ROUTINE, '2026-08-03').sets).toEqual({})
  })

  it('fallback 세션은 정규 Day 부위로 집계된다', () => {
    // fallback-push의 recordKey는 @d1 → 상부가슴 5, 측면어깨 3
    const fb = completedSession({ dayId: 'fallback-push', date: '2026-08-03' })
    const week = weeklyVolume([fb], ROUTINE, '2026-08-03')
    expect(week.sets).toEqual({ 상부가슴: 5, 측면어깨: 3 })
    expect(week.exposures).toEqual({ 상부가슴: 1, 측면어깨: 1 })
  })

  it('부분 수행은 실제 체크한 세트만 잡는다 (Day 단위 집계와의 차이)', () => {
    // 인클라인(4세트)만 하고 나간 경우. Day 단위로 집계하면 상부가슴 7이 되지만
    // 실제로는 4세트다. 이 차이가 §4 제안과 §5.1 대시보드를 동시에 틀어뜨린다.
    const partial = completedSession({
      dayId: 'd1',
      date: '2026-08-03',
      onlyExercises: ['incline-chest-press'],
    })
    expect(weeklyVolume([partial], ROUTINE, '2026-08-03').sets).toEqual({ 상부가슴: 4 })
  })
})

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}
