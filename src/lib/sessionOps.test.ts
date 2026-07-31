import { describe, expect, it } from 'vitest'
import { applyAddSet, applyRemoveSet, applySkipped, applyToggleDone } from './sessionOps'
import { buildSession } from './sessionFactory'
import { ROUTINE } from './testFixtures'

function freshSession() {
  return buildSession({
    routine: ROUTINE,
    day: ROUTINE.days[0], // D1: 인클라인, 펙덱, 체스트프레스, 숄더, 레터럴, 리어델트, 푸쉬다운
    mode: 'normal',
    sessions: [],
    phase: 0,
    today: '2026-08-05',
  }).session
}

const INCLINE = 'incline-chest-press@d1'
const LATERAL = 'lateral-raise@d1'
const PUSHDOWN = 'pushdown@d1'
const at = (min: number) => new Date(`2026-08-05T18:${String(min).padStart(2, '0')}:00.000Z`)

describe('performedOrder — 계획 순서와 무관한 실제 수행 순서', () => {
  it('첫 세트를 체크한 순서대로 부여된다 (계획 순서를 건너뛰어도)', () => {
    // 헬스장에서는 기계가 비는 순서대로 하게 된다. 계획 5번을 먼저 해도 된다.
    let s = freshSession()
    s = applyToggleDone(s, LATERAL, 0, at(0)) // 계획 5번을 첫 번째로
    s = applyToggleDone(s, INCLINE, 0, at(10)) // 계획 1번을 두 번째로
    s = applyToggleDone(s, PUSHDOWN, 0, at(20)) // 계획 7번을 세 번째로

    const order = (key: string) => s.entries.find((e) => e.recordKey === key)!.performedOrder
    expect(order(LATERAL)).toBe(1)
    expect(order(INCLINE)).toBe(2)
    expect(order(PUSHDOWN)).toBe(3)
    // 계획 순서는 그대로 유지된다 (분석 시 둘을 비교하기 위함)
    expect(s.entries.find((e) => e.recordKey === LATERAL)!.plannedOrder).toBe(5)
  })

  it('firstSetAt에 첫 체크 시각이 기록된다', () => {
    let s = freshSession()
    s = applyToggleDone(s, LATERAL, 0, at(0))
    s = applyToggleDone(s, LATERAL, 1, at(3)) // 두 번째 세트는 시각을 바꾸지 않는다
    const entry = s.entries.find((e) => e.recordKey === LATERAL)!
    expect(entry.firstSetAt).toBe(at(0).toISOString())
  })

  it('같은 종목의 세트를 더 체크해도 순서는 늘지 않는다', () => {
    let s = freshSession()
    s = applyToggleDone(s, INCLINE, 0, at(0))
    s = applyToggleDone(s, INCLINE, 1, at(3))
    s = applyToggleDone(s, INCLINE, 2, at(6))
    expect(s.entries.find((e) => e.recordKey === INCLINE)!.performedOrder).toBe(1)
    expect(s.entries.filter((e) => e.performedOrder !== null)).toHaveLength(1)
  })

  it('세트를 전부 해제하면 순서를 되돌린다 (오탭 복구)', () => {
    let s = freshSession()
    s = applyToggleDone(s, INCLINE, 0, at(0))
    expect(s.entries.find((e) => e.recordKey === INCLINE)!.performedOrder).toBe(1)
    s = applyToggleDone(s, INCLINE, 0, at(1)) // 해제
    const entry = s.entries.find((e) => e.recordKey === INCLINE)!
    expect(entry.performedOrder).toBeNull()
    expect(entry.firstSetAt).toBeUndefined()
  })

  it('중간 종목을 되돌려도 나머지 순서는 유지되고, 다시 하면 뒤에 붙는다', () => {
    let s = freshSession()
    s = applyToggleDone(s, INCLINE, 0, at(0)) // 1
    s = applyToggleDone(s, LATERAL, 0, at(10)) // 2
    s = applyToggleDone(s, PUSHDOWN, 0, at(20)) // 3
    s = applyToggleDone(s, LATERAL, 0, at(25)) // 2번 해제
    const order = (key: string) => s.entries.find((e) => e.recordKey === key)!.performedOrder
    expect(order(INCLINE)).toBe(1)
    expect(order(LATERAL)).toBeNull()
    expect(order(PUSHDOWN)).toBe(3)

    s = applyToggleDone(s, LATERAL, 0, at(30)) // 다시 수행
    expect(order(LATERAL)).toBe(4) // max(3) + 1 — 실제 수행 시각 순서가 맞다
  })

  it('체크하면 스킵 표시가 풀린다', () => {
    let s = freshSession()
    s = applySkipped(s, INCLINE, true)
    s = applyToggleDone(s, INCLINE, 0, at(0))
    expect(s.entries.find((e) => e.recordKey === INCLINE)!.skipped).toBe(false)
  })

  it('doneAt은 체크 해제 시 지워진다', () => {
    let s = freshSession()
    s = applyToggleDone(s, INCLINE, 0, at(0))
    expect(s.entries.find((e) => e.recordKey === INCLINE)!.sets[0].doneAt).toBe(at(0).toISOString())
    s = applyToggleDone(s, INCLINE, 0, at(1))
    expect(s.entries.find((e) => e.recordKey === INCLINE)!.sets[0].doneAt).toBeUndefined()
  })
})

describe('세트 추가/삭제', () => {
  it('추가한 세트는 마지막 세트의 무게·횟수를 물려받는다', () => {
    let s = freshSession()
    s = applyToggleDone(s, INCLINE, 3, at(0))
    const before = s.entries.find((e) => e.recordKey === INCLINE)!
    s = applyAddSet(s, INCLINE)
    const after = s.entries.find((e) => e.recordKey === INCLINE)!
    expect(after.sets).toHaveLength(before.sets.length + 1)
    expect(after.sets[4].weight).toBe(before.sets[3].weight)
    expect(after.sets[4].done).toBe(false)
  })

  it('마지막 1세트는 삭제되지 않는다', () => {
    let s = freshSession()
    for (let i = 0; i < 10; i += 1) s = applyRemoveSet(s, INCLINE, 0)
    expect(s.entries.find((e) => e.recordKey === INCLINE)!.sets).toHaveLength(1)
  })
})
