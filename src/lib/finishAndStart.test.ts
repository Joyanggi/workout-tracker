import { describe, expect, it } from 'vitest'
import { buildSession, withJustFinished } from './sessionFactory'
import { ROUTINE, completedSession } from './testFixtures'
import { findDay } from './derive'
import { makeRecordKey } from '../types'
import type { Session } from '../types'

/**
 * "마감하고 새로 시작"에서 프리필이 한 세션 뒤처지지 않는다 (R4).
 *
 * `HomeScreen`의 `sessions`는 `useLiveQuery` 값이라 `finish()` 직후에는 아직 갱신되지
 * 않았다. 그 목록으로 새 세션을 만들면 **방금 한 기록이 프리필에 반영되지 않는다.**
 * 화면 밖에서 검증하려고 병합을 순수 함수로 뺐다.
 */

const KEY = makeRecordKey('incline-chest-press', 'd1')
const day = findDay(ROUTINE, 'd1')!

describe('withJustFinished', () => {
  const older = completedSession({ dayId: 'd1', date: '2026-07-20', weight: 40 })
  const justFinished = completedSession({ dayId: 'd1', date: '2026-07-27', weight: 47.5 })

  it('마감한 세션을 목록에 넣는다', () => {
    expect(withJustFinished([older], justFinished).map((s) => s.id)).toEqual([
      justFinished.id,
      older.id,
    ])
  })

  it('live query가 이미 갱신됐어도 중복되지 않는다', () => {
    // 중복되면 최근 3세션 창이 왜곡되어 bestBySet이 어긋난다
    const merged = withJustFinished([justFinished, older], justFinished)
    expect(merged.map((s) => s.id)).toEqual([justFinished.id, older.id])
  })

  it('마감한 세션이 없으면 원본 배열을 그대로 준다', () => {
    const list = [older]
    expect(withJustFinished(list, null)).toBe(list)
    expect(withJustFinished(list, undefined)).toBe(list)
  })
})

describe('마감 직후 시작한 세션의 프리필', () => {
  const older = completedSession({ dayId: 'd1', date: '2026-07-20', weight: 40 })
  const justFinished = completedSession({ dayId: 'd1', date: '2026-07-27', weight: 47.5 })

  const weightOf = (sessions: Session[]) => {
    const { session } = buildSession({
      routine: ROUTINE,
      day,
      mode: 'normal',
      sessions,
      phase: 1,
      today: '2026-07-29',
    })
    return session.entries.find((e) => e.recordKey === KEY)!.sets[0].weight
  }

  it('직전 기록이 반영된다', () => {
    expect(weightOf(withJustFinished([older], justFinished))).toBe(47.5)
  })

  it('병합하지 않으면 한 세션 뒤처진다 (수정의 근거)', () => {
    // 낡은 목록만 쓰면 47.5kg를 방금 했는데도 40kg로 프리필된다
    expect(weightOf([older])).toBe(40)
  })
})
