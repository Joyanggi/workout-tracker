import { describe, expect, it } from 'vitest'
import { hasStrengthWork, strengthDates, strengthSessions } from './derive'
import { strengthCountThisWeek, weekCounts, weekDots } from './dashboard'
import { suggestNextDay } from './suggestNextDay'
import { resolveTrainingDays } from './diet'
import { ROUTINE, completedSession } from './testFixtures'
import type { Session } from '../types'

/**
 * X3 — **"근력 세션"과 "완료 세션"은 다르다.**
 *
 * 실사용 보고 두 건의 공통 뿌리였다:
 * ① D1 날 유산소만 했는데 다음날 D4를 추천했다 (회복 감쇠가 오발동)
 * ② 휴식일을 골랐는데 유산소만 한 세션 때문에 훈련일로 강제 고정됐다
 *
 * 둘 다 "완료 세션 = 근력 수행"으로 본 탓이다. 유산소만 기록한 세션은 완료됐지만
 * 아무 근육도 쓰지 않았다.
 */

/** 유산소만 기록한 세션 — 세트를 하나도 체크하지 않았다 */
function cardioOnly(dayId: string, date: string): Session {
  const base = completedSession({ dayId, date, fullReps: true, weight: 30 })
  return {
    ...base,
    entries: base.entries.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({ ...s, done: false })),
    })),
    cardio: { type: '마이마운틴', minutes: 25, note: '25/3.8' },
  }
}

/** 워밍업만 체크한 세션 — 회복 감쇠도 훈련일 끼니도 근거가 없다 */
function warmupOnly(dayId: string, date: string): Session {
  const base = completedSession({ dayId, date, fullReps: true, weight: 30 })
  return {
    ...base,
    entries: base.entries.map((e, i) => ({
      ...e,
      sets: e.sets.map((s, j) => ({ ...s, done: i === 0 && j === 0, warmup: i === 0 && j === 0 })),
    })),
  }
}

describe('근력 수행 판정', () => {
  it('작업 세트를 하나라도 체크했으면 근력 수행이다', () => {
    expect(hasStrengthWork(completedSession({ dayId: 'd1', date: '2026-08-04' }))).toBe(true)
  })

  it('유산소만 기록한 세션은 근력 수행이 아니다', () => {
    expect(hasStrengthWork(cardioOnly('d1', '2026-08-04'))).toBe(false)
  })

  it('워밍업만 체크한 세션도 근력 수행이 아니다 (작업 세트 기준)', () => {
    // 랙에 올려만 보고 그만둔 날 — 감쇠할 회복도, 훈련일 끼니의 근거도 없다
    expect(hasStrengthWork(warmupOnly('d1', '2026-08-04'))).toBe(false)
  })

  it('strengthSessions는 완료 + 근력만 남긴다 (최신순 유지)', () => {
    const list = [
      completedSession({ dayId: 'd1', date: '2026-08-01' }),
      cardioOnly('d2', '2026-08-03'),
      completedSession({ dayId: 'd3', date: '2026-08-02' }),
    ]
    expect(strengthSessions(list).map((s) => s.date)).toEqual(['2026-08-02', '2026-08-01'])
  })

  it('진행 중 세션(endedAt 없음)은 포함하지 않는다', () => {
    const running: Session = { ...completedSession({ dayId: 'd1', date: '2026-08-04' }), endedAt: undefined }
    expect(strengthSessions([running])).toEqual([])
  })
})

describe('#3 — 유산소만 한 다음날 제안', () => {
  const today = '2026-08-05'

  it('유산소만 한 날에는 회복 감쇠가 걸리지 않는다', () => {
    // 어제 D1에서 유산소만 했다 → D1 점수에 ×0.3이 걸리면 D4가 이긴다 (보고된 증상)
    const suggestion = suggestNextDay({
      sessions: [cardioOnly('d1', '2026-08-04')],
      routine: ROUTINE,
      today,
      now: new Date('2026-08-05T09:00:00Z'),
    })
    expect(suggestion.day.id).toBe('d1')
  })

  it('실제로 근력을 했으면 감쇠가 걸린다 (수정이 페널티 자체를 없애지 않았다)', () => {
    const suggestion = suggestNextDay({
      sessions: [completedSession({ dayId: 'd1', date: '2026-08-04', fullReps: true, weight: 30 })],
      routine: ROUTINE,
      today,
      now: new Date('2026-08-05T09:00:00Z'),
    })
    expect(suggestion.day.id).not.toBe('d1')
  })

  it('유산소만 한 기록뿐이면 "첫 세션"으로 본다', () => {
    const suggestion = suggestNextDay({
      sessions: [cardioOnly('d2', '2026-08-04')],
      routine: ROUTINE,
      today,
    })
    expect(suggestion.rule).toBe('first')
  })

  it('복귀 공백을 유산소가 메우지 않는다', () => {
    // 20일 전에 근력, 어제 유산소 → 근력 공백은 여전히 20일이다
    const suggestion = suggestNextDay({
      sessions: [
        completedSession({ dayId: 'd2', date: '2026-07-16', fullReps: true, weight: 30 }),
        cardioOnly('d1', '2026-08-04'),
      ],
      routine: ROUTINE,
      today,
    })
    expect(suggestion.rule).toBe('returnGap')
  })

  it('하체 가드도 근력 기준이다 — 유산소만 한 하체 날은 "했다"가 아니다', () => {
    const lowerId = ROUTINE.rules.lowerBodyDayId
    const gap = ROUTINE.rules.lowerBodyMaxGapDays
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-08-04', fullReps: true, weight: 30 }),
      // 가드 기간 안에 하체 날이 있지만 유산소만 했다
      cardioOnly(lowerId, '2026-08-03'),
      completedSession({ dayId: lowerId, date: '2026-07-01', fullReps: true, weight: 30 }),
    ]
    const suggestion = suggestNextDay({ sessions, routine: ROUTINE, today: '2026-08-05' })
    expect(gap).toBeGreaterThan(0)
    expect(suggestion.day.id).toBe(lowerId)
  })
})

describe('주 카운터와 도트의 기준이 다르다', () => {
  const today = '2026-08-07'
  const week = [
    completedSession({ dayId: 'd1', date: '2026-08-03', fullReps: true, weight: 30 }),
    cardioOnly('d2', '2026-08-05'),
  ]

  it('주 카운터는 유산소만 한 날을 세지 않는다 (문서의 "주 3회"는 근력이다)', () => {
    const thisWeek = weekCounts(week, today).find((w) => w.weekStart <= '2026-08-03')
    expect(thisWeek?.count).toBe(1)
  })

  it('주간 도트는 유산소만 한 날도 보여준다 (헬스장에 간 것은 사실이다)', () => {
    const dots = weekDots(week, today)
    expect(dots.find((d) => d.date === '2026-08-05')?.count).toBe(1)
    expect(dots.find((d) => d.date === '2026-08-03')?.count).toBe(1)
  })

  it('두 숫자가 실제로 갈린다 — 홈이 그때만 설명 줄을 띄운다', () => {
    const dotTotal = weekDots(week, today).reduce((n, d) => n + d.count, 0)
    expect(dotTotal).toBe(2)
    expect(strengthCountThisWeek(week, today)).toBe(1)
  })

  it('유산소가 없는 주에는 두 숫자가 같다 (설명 줄이 뜨지 않아야 한다)', () => {
    const onlyStrength = [completedSession({ dayId: 'd1', date: '2026-08-03', fullReps: true, weight: 30 })]
    const dotTotal = weekDots(onlyStrength, today).reduce((n, d) => n + d.count, 0)
    expect(dotTotal).toBe(strengthCountThisWeek(onlyStrength, today))
  })
})

describe('#4 — 식단 훈련일 판정', () => {
  const date = '2026-08-04'
  const restDay = { date, planId: 'cut-1800', isTrainingDay: false, slots: {} }

  it('유산소만 한 날은 휴식일로 남는다', () => {
    const trained = strengthDates([cardioOnly('d1', date)])
    expect(resolveTrainingDays([restDay], trained)[0].isTrainingDay).toBe(false)
  })

  it('근력을 한 날은 훈련일로 덮어쓴다 (정규화 자체는 유지)', () => {
    const trained = strengthDates([completedSession({ dayId: 'd1', date, fullReps: true, weight: 30 })])
    expect(resolveTrainingDays([restDay], trained)[0].isTrainingDay).toBe(true)
  })

  it('같은 날 유산소 세션과 근력 세션이 둘 다 있으면 훈련일이다', () => {
    const trained = strengthDates([
      cardioOnly('d1', date),
      completedSession({ dayId: 'd1', date, fullReps: true, weight: 30 }),
    ])
    expect(trained.has(date)).toBe(true)
  })
})

/**
 * 인바리언트 — **"그날 훈련했나"를 다른 곳에서 다시 계산하지 못하게 한다.**
 *
 * 이 판정이 네 곳에서 각각 `completedSessions(...).some(s => s.date === X)`로 계산되고
 * 있었다 (식단 정규화 · 오늘 식단 · 과거 식단 편집 · 홈 칩). 기준이 "완료"에서 "근력"으로
 * 바뀌는 순간, 한 곳만 놓쳐도 화면과 판정이 갈린다 — 이 프로젝트에서 두 번 겪은 방식이다
 * (F6 증량 칩, B2 훈련일). 그래서 기계로 막는다.
 */
describe('인바리언트 — 날짜별 훈련 판정의 단일 경로', () => {
  const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  /**
   * **주석을 걷어내고 검사한다.**
   *
   * 첫 시도에서 이 검사가 `derive.ts`를 잡았는데, 위반 코드가 아니라 chokepoint를 설명하는
   * **내 주석 문장**이었다 (금지하려는 표현을 예시로 적어 뒀다). 허용 목록에 넣어 넘길 수도
   * 있었지만 그러면 정의 파일 안의 진짜 위반을 못 잡는다. 주석을 지우는 쪽이 정확하다.
   */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  const appFiles = Object.entries(sources)
    .filter(([p]) => !p.endsWith('.test.ts'))
    .map(([p, src]) => [p, stripComments(src)] as const)

  it('completedSessions로 날짜 일치를 직접 판정하지 않는다', () => {
    const offenders = appFiles
      .filter(([, src]) => /completedSessions\([^)]*\)\s*\.\s*some/.test(src))
      .map(([p]) => p)

    expect(
      offenders,
      `"그날 훈련했나"는 strengthDates()로 물어야 합니다 (X3).\n` +
        `completedSessions는 유산소만 한 세션도 포함하므로 훈련일·회복 감쇠가 오발동합니다:\n` +
        offenders.map((f) => `  ${f}`).join('\n'),
    ).toEqual([])
  })

  it('훈련일 정규화는 useDiet 한 곳에서만 한다', () => {
    // `trained || stored.isTrainingDay` 사본이 HomeScreen에 남아 있었다
    const offenders = appFiles
      .filter(([p]) => p !== '/src/lib/diet.ts' && p !== '/src/lib/useDiet.ts')
      .filter(([, src]) => /isTrainingDay\s*\)?\s*$|\|\|\s*\(?stored\?\.isTrainingDay/.test(src))
      .filter(([, src]) => /\btrained\b[\s\S]{0,80}isTrainingDay/.test(src))
      .map(([p]) => p)
    expect(offenders).toEqual([])
  })

  it('주석 제거가 코드를 지우지는 않는다 (검사가 헛돌지 않게)', () => {
    // 위반 형태를 코드로 주면 실제로 잡혀야 한다
    const fake = stripComments(`
      // completedSessions(x).some(s => s.date === d)  ← 주석은 무시돼야 한다
      const trained = completedSessions(sessions).some((s) => s.date === today)
    `)
    expect(/completedSessions\([^)]*\)\s*\.\s*some/.test(fake)).toBe(true)
    // 주석만 있으면 잡히지 않아야 한다
    const onlyComment = stripComments('/* completedSessions(s).some(x => x.date === d) */')
    expect(/completedSessions\([^)]*\)\s*\.\s*some/.test(onlyComment)).toBe(false)
  })

  it('스캔이 헛돌지 않는다 — chokepoint가 실제로 쓰이고 있다', () => {
    const users = appFiles.filter(([, src]) => /\bstrengthDates\(/.test(src)).map(([p]) => p)
    expect(users.sort()).toEqual([
      '/src/lib/derive.ts',
      '/src/lib/useDiet.ts',
      '/src/screens/DietScreen.tsx',
      '/src/screens/HistoryScreen.tsx',
    ])
  })

  it('근력 기준 판정을 쓰는 곳이 전부 chokepoint를 지난다', () => {
    for (const path of [
      '/src/lib/suggestNextDay.ts',
      '/src/lib/dashboard.ts',
      '/src/lib/useDiet.ts',
    ]) {
      expect(sources[path], `${path}가 없습니다`).toMatch(/strengthSessions|strengthDates/)
    }
  })
})
