import { describe, expect, it } from 'vitest'
import { applyDayChange, planDayChange } from './dayChange'
import { addMonths, monthGrid, monthLabel, monthStart, weekdayKo } from './dates'
import { allRecordKeys, calendarCells, exerciseHistory, sessionsInMonth, summarize } from './history'
import { weeklyVolume } from './derive'
import { ROUTINE, completedSession } from './testFixtures'
import type { Session } from '../types'

describe('월 달력 격자', () => {
  it('월요일로 시작하고 그 달을 전부 포함한다', () => {
    // 2026-08-01은 토요일 → 격자는 7월 27일(월)부터
    const grid = monthGrid('2026-08-15')
    expect(grid[0]).toBe('2026-07-27')
    expect(weekdayKo(grid[0])).toBe('월')
    expect(grid.length % 7).toBe(0)
    expect(grid).toContain('2026-08-01')
    expect(grid).toContain('2026-08-31')
    // 마지막 칸은 일요일
    expect(weekdayKo(grid[grid.length - 1])).toBe('일')
  })

  it('월 이동이 말일에서 밀리지 않는다', () => {
    // 3월 31일에서 −1개월을 단순 계산하면 2월 31일 → 3월 3일로 튄다
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01')
    expect(monthStart('2026-08-15')).toBe('2026-08-01')
    expect(monthLabel('2026-08-15')).toBe('2026년 8월')
  })

  it('세션이 있는 날에만 세션이 붙는다', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-08-03' }),
      completedSession({ dayId: 'd2', date: '2026-08-03' }),
      completedSession({ dayId: 'd3', date: '2026-08-05' }),
    ]
    const cells = calendarCells(sessions, '2026-08-01')
    const byDate = new Map(cells.map((c) => [c.date, c]))
    expect(byDate.get('2026-08-03')!.sessions).toHaveLength(2) // 같은 날 두 세션
    expect(byDate.get('2026-08-05')!.sessions).toHaveLength(1)
    expect(byDate.get('2026-08-04')!.sessions).toHaveLength(0)
    // 인접 달 칸은 inMonth=false
    expect(byDate.get('2026-07-27')!.inMonth).toBe(false)
    expect(byDate.get('2026-08-03')!.inMonth).toBe(true)
  })

  it('진행 중(endedAt 없음) 세션은 달력에 표시하지 않는다', () => {
    const open = completedSession({ dayId: 'd1', date: '2026-08-03' })
    delete (open as { endedAt?: string }).endedAt
    const cells = calendarCells([open], '2026-08-01')
    expect(cells.every((c) => c.sessions.length === 0)).toBe(true)
  })

  it('그 달의 세션만 목록에 담는다', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-07-31' }),
      completedSession({ dayId: 'd2', date: '2026-08-01' }),
    ]
    expect(sessionsInMonth(sessions, '2026-08-10').map((s) => s.date)).toEqual(['2026-08-01'])
  })
})

describe('세션 요약', () => {
  it('Day 이름 · 세트 수 · 볼륨 · 소요 시간', () => {
    const s = completedSession({
      dayId: 'd3',
      date: '2026-08-03',
      startedAt: '2026-08-03T18:00:00.000Z',
      endedAt: '2026-08-03T19:12:00.000Z',
      weight: 50,
      repsOverride: 10,
    })
    const out = summarize(s, ROUTINE)
    expect(out.dayName).toBe('Day 3 — 하체 + 코어')
    // CC9로 D3가 6종목 17세트가 됐다 (§8 검산표도 함께 갱신) — 소급 효과 기재 항목
    expect(out.setCount).toBe(17)
    expect(out.volume).toBe(17 * 50 * 10)
    expect(out.durationMin).toBe(72)
  })
})

describe('종목별 히스토리 (§5.3)', () => {
  const key = 'lat-pulldown@d2'

  it('최신순으로 무게·반복수·볼륨·e1RM을 낸다', () => {
    const sessions = [
      completedSession({ dayId: 'd2', date: '2026-08-03', weight: 40, repsOverride: 10 }),
      completedSession({ dayId: 'd2', date: '2026-08-10', weight: 45, repsOverride: 8 }),
    ]
    const h = exerciseHistory(sessions, key)
    expect(h.map((p) => p.date)).toEqual(['2026-08-10', '2026-08-03'])
    expect(h[0]).toMatchObject({ topWeight: 45, totalReps: 32, volume: 4 * 45 * 8 })
    expect(h[0].bestE1rm).toBeCloseTo(45 * (1 + 8 / 30), 5)
  })

  it('체크된 세트가 없는 세션은 제외한다', () => {
    const s = completedSession({ dayId: 'd2', date: '2026-08-03' })
    const unchecked: Session = {
      ...s,
      entries: s.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, done: false })) })),
    }
    expect(exerciseHistory([unchecked], key)).toEqual([])
  })

  it('(종목, Day)가 다르면 별개의 기록이다', () => {
    // 인클라인은 D1(A그룹, 무겁게)과 D4(B그룹, 가볍게)에 모두 있다
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-08-03', weight: 40 }),
      completedSession({ dayId: 'd4', date: '2026-08-05', weight: 25 }),
    ]
    expect(exerciseHistory(sessions, 'incline-chest-press@d1')[0].topWeight).toBe(40)
    expect(exerciseHistory(sessions, 'incline-chest-press@d4')[0].topWeight).toBe(25)
  })

  it('recordKey 목록은 세션에서 뽑는다 (루틴에서 사라진 종목도 조회 가능)', () => {
    const sessions = [completedSession({ dayId: 'd2', date: '2026-08-03' })]
    const withGhost: Session = {
      ...sessions[0],
      entries: [
        ...sessions[0].entries,
        {
          recordKey: 'removed-exercise@d2',
          plannedOrder: 99,
          performedOrder: 9,
          sets: [{ weight: 10, reps: 10, done: true }],
          compensation: '없음',
          skipped: false,
        },
      ],
    }
    const keys = allRecordKeys([withGhost], ROUTINE)
    const ghost = keys.find((k) => k.recordKey === 'removed-exercise@d2')
    expect(ghost).toMatchObject({ known: false, group: null })
    // 루틴에 있는 것들은 Day → plannedOrder 순서로 앞에 온다
    expect(keys[0].recordKey).toBe('arm-pulldown@d2')
    expect(keys[keys.length - 1].recordKey).toBe('removed-exercise@d2')
  })
})

describe('Day 변경 + recordKey 재매핑 (§11)', () => {
  it('양쪽에 있는 종목만 재매핑하고, 없는 종목은 키를 유지한다', () => {
    const s = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const plan = planDayChange(s, ROUTINE, 'd2')!

    // D1·D2 공통: 레터럴 레이즈, 리어델트
    expect(plan.remapped.map((r) => r.exerciseId).sort()).toEqual(['lateral-raise', 'rear-delt-fly'])
    expect(plan.remapped.find((r) => r.exerciseId === 'lateral-raise')).toMatchObject({
      from: 'lateral-raise@d1',
      to: 'lateral-raise@d2',
    })
    // D2에 없는 종목은 kept — 기록을 버리지 않는다
    expect(plan.kept.map((k) => k.exerciseId).sort()).toEqual([
      'flat-chest-press',
      'incline-chest-press',
      'pec-deck-fly',
      'pushdown',
      'shoulder-press',
    ])
  })

  it('fallback으로 바꿔도 기록 키는 그대로다 (recordDayId가 같으므로)', () => {
    // fallback-push는 @d1에 기록한다 → D1 → fallback-push는 키 변화 없음
    const s = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const plan = planDayChange(s, ROUTINE, 'fallback-push')!
    expect(plan.remapped).toEqual([])
    expect(plan.unchanged.map((u) => u.exerciseId).sort()).toEqual([
      'incline-chest-press',
      'lateral-raise',
      'pec-deck-fly',
    ])
    // fallback-push에 없는 D1 종목은 kept
    expect(plan.kept.map((k) => k.exerciseId).sort()).toEqual([
      'flat-chest-press',
      'pushdown',
      'rear-delt-fly',
      'shoulder-press',
    ])
  })

  it('같은 Day이거나 없는 Day면 계획이 없다', () => {
    const s = completedSession({ dayId: 'd1', date: '2026-08-03' })
    expect(planDayChange(s, ROUTINE, 'd1')).toBeNull()
    expect(planDayChange(s, ROUTINE, 'nope')).toBeNull()
  })

  it('적용하면 dayId·recordKey·plannedOrder가 함께 바뀐다', () => {
    const s = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const next = applyDayChange(s, ROUTINE, 'd2')

    expect(next.dayId).toBe('d2')
    const lateral = next.entries.find((e) => e.recordKey === 'lateral-raise@d2')!
    // D2에서 레터럴은 plannedOrder 5
    expect(lateral.plannedOrder).toBe(5)
    // 세트 기록은 그대로 보존된다
    expect(lateral.sets).toEqual(s.entries.find((e) => e.recordKey === 'lateral-raise@d1')!.sets)

    // 대상 Day에 없는 종목은 계획 순서를 뒤로 밀어 기존 순서와 섞이지 않게 한다
    const orphans = next.entries.filter((e) => e.recordKey.endsWith('@d1'))
    expect(orphans.length).toBe(5)
    expect(Math.min(...orphans.map((e) => e.plannedOrder))).toBeGreaterThan(6)
  })

  it('재매핑 후에도 recordKey가 중복되지 않는다', () => {
    for (const to of ['d1', 'd2', 'd3', 'd4', 'fallback-push', 'fallback-pull']) {
      for (const from of ['d1', 'd2', 'd4']) {
        if (from === to) continue
        const next = applyDayChange(completedSession({ dayId: from, date: '2026-08-03' }), ROUTINE, to)
        const keys = next.entries.map((e) => e.recordKey)
        expect(new Set(keys).size, `${from} → ${to}`).toBe(keys.length)
      }
    }
  })

  it('재매핑이 부위 집계에 반영된다', () => {
    // D1으로 기록했다가 D2로 옮기면, 옮겨진 종목의 부위 집계도 D2 기준으로 바뀐다
    const s = completedSession({ dayId: 'd1', date: '2026-08-03' })
    const before = weeklyVolume([s], ROUTINE, '2026-08-03')
    expect(before.sets).toEqual({ 상부가슴: 7, 가슴: 3, 측면어깨: 7, 후면어깨: 2, 팔: 3 })

    const after = weeklyVolume([applyDayChange(s, ROUTINE, 'd2')], ROUTINE, '2026-08-03')
    // 레터럴(4세트)·리어델트(2세트)는 @d2로 옮겨졌지만 부위는 동일하므로 총합은 그대로다.
    // 옮겨지지 않은 종목들도 @d1 키를 유지하므로 집계에서 사라지지 않는다.
    expect(after.sets).toEqual(before.sets)
  })
})
