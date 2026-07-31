import { describe, expect, it } from 'vitest'
import { strengthRecordKeys, sensoryTrend } from './analysis'
import { phaseReadiness } from './phaseReadiness'
import { muscleOfEntry, routineExerciseOfEntry, weeklyVolume } from './derive'
import { exportMarkdown } from './exportMarkdown'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import { makeRecordKey } from '../types'
import type { Exercise, Session, SessionEntry } from '../types'

/**
 * 인바리언트 — **대체 수행이 모든 파생 경로에 나타나야 한다** (T8).
 *
 * 이 파일이 존재하는 이유: 같은 결함이 세 번 반복됐다. entry가 스코프에 있는데도
 * `parseRecordKey` + `findRoutineExercise`로 자기 recordKey를 조회하면 대체 종목은
 * 루틴에 없으므로 `undefined`가 되고, 그 경로에서 **조용히 사라진다.**
 * `findRoutineExercise`의 export를 없애 그 길을 막았지만, 새 분석 경로가 추가될 때
 * 같은 실수를 하지 않는다는 보장은 테스트뿐이다.
 *
 * 새 파생 경로(차트·집계·판정)를 추가하면 여기에 한 줄 추가하는 것이 규칙이다.
 */

const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))

// A그룹 대체: 인클라인 프레스 → 스미스 인클라인 (d1)
const A_ORIGIN = makeRecordKey('incline-chest-press', 'd1')
const A_SUB = makeRecordKey('smith-incline-press', 'd1')
// B그룹 대체: 펙덱 리어델트 → 케이블 리어델트 (d1)
const B_ORIGIN = makeRecordKey('rear-delt-fly', 'd1')
const B_SUB = makeRecordKey('cable-rear-delt-fly', 'd1')

/** d1 세션에서 A·B 종목을 각각 대체 수행으로 바꾼다 */
function withSubstitutes(date: string, sensory: 0 | 1 | 2 | 3 = 3): Session {
  const base = completedSession({ dayId: 'd1', date, fullReps: true, weight: 30 })
  return {
    ...base,
    entries: base.entries.map((e): SessionEntry => {
      if (e.recordKey === A_ORIGIN) {
        return { ...e, recordKey: A_SUB, substituteFor: A_ORIGIN }
      }
      if (e.recordKey === B_ORIGIN) {
        return { ...e, recordKey: B_SUB, substituteFor: B_ORIGIN, sensoryScore: sensory }
      }
      return e.recordKey.startsWith('lateral-raise@') ? { ...e, sensoryScore: sensory } : e
    }),
  }
}

const SESSIONS = ['2026-07-13', '2026-07-20', '2026-07-27'].map((d) => withSubstitutes(d))

describe('대체 수행이 파생 경로에서 누락되지 않는다', () => {
  it('추이 차트 목록에 A그룹 대체가 들어간다', () => {
    // 이 검증이 실패하던 것이 원래 증상 — 대체 종목의 차트가 아예 안 떴다
    const keys = strengthRecordKeys(SESSIONS, ROUTINE)
    expect(keys.map((k) => k.recordKey)).toContain(A_SUB)
    expect(keys.find((k) => k.recordKey === A_SUB)?.group).toBe('A')
  })

  it('차트 목록에서 대체는 원 종목 바로 뒤에 정렬된다', () => {
    // 루틴 순서 map에 없으므로 그냥 두면 맨 뒤로 밀려 "무엇의 대체인지"가 안 보인다.
    // 원 종목은 이 세션들에 없으니, 원 종목이 있는 세션을 섞어 위치를 확인한다
    const plain = completedSession({ dayId: 'd1', date: '2026-07-06', fullReps: true, weight: 30 })
    const keys = strengthRecordKeys([...SESSIONS, plain], ROUTINE).map((k) => k.recordKey)
    expect(keys).toContain(A_ORIGIN)
    expect(keys).toContain(A_SUB)
    expect(keys.indexOf(A_SUB)).toBe(keys.indexOf(A_ORIGIN) + 1)
  })

  it('감각 추이에 B그룹 대체가 들어간다', () => {
    const trend = sensoryTrend(SESSIONS, ROUTINE, '2026-07-31')
    expect(trend.recordKeys).toContain(B_SUB)
  })

  it('Phase 조건 판정에 B그룹 대체의 감각 기록이 반영된다', () => {
    /*
      d1의 B그룹은 pec-deck-fly · lateral-raise · rear-delt-fly · pushdown 4개인데,
      rear-delt-fly를 케이블 리어델트로 대체했으므로 수행된 B그룹은
      pec-deck-fly · lateral-raise · cable-rear-delt-fly(대체) · pushdown = 4개다.
      감각을 넣은 것은 lateral-raise와 대체 종목 2개.

      대체가 누락되면 분모가 3이 되고 분자도 1이 되어 조건이 과소평가된다.
      즉 이 단정문은 "대체가 세어졌는가"를 정확히 잡는다.
    */
    const readiness = phaseReadiness(SESSIONS, ROUTINE, 1, '2026-07-31')
    const detail = readiness.checks.map((c) => c.detail).join(' ')
    expect(detail).toContain('2/4종목')
  })

  it('부위 집계가 원 종목의 부위로 들어간다', () => {
    const plain = weeklyVolume(
      [completedSession({ dayId: 'd1', date: '2026-07-27', fullReps: true, weight: 30 })],
      ROUTINE,
      '2026-07-27',
    )
    const swapped = weeklyVolume([withSubstitutes('2026-07-27')], ROUTINE, '2026-07-27')
    expect(swapped.sets).toEqual(plain.sets)

    const entry = withSubstitutes('2026-07-27').entries.find((e) => e.recordKey === A_SUB)!
    expect(muscleOfEntry(ROUTINE, entry)).toBe(
      ROUTINE.days.find((d) => d.id === 'd1')!.exercises.find((e) => e.exerciseId === 'incline-chest-press')!
        .muscle,
    )
  })

  it('계획 해석이 원 종목을 따르고 exerciseId만 바뀐다', () => {
    const entry = withSubstitutes('2026-07-27').entries.find((e) => e.recordKey === B_SUB)!
    expect(routineExerciseOfEntry(ROUTINE, entry)?.group).toBe('B')
  })

  it('내보내기에 원 종목이 함께 적힌다', () => {
    const md = exportMarkdown({
      sessions: [withSubstitutes('2026-07-27')],
      routine: ROUTINE,
      catalog,
      phase: 1,
      range: { from: '2026-07-01', to: '2026-07-31' },
    })
    expect(md).toContain('(대체: 인클라인 프레스 — 자리 없음)')
    expect(md).toContain('(대체: 리어델트 — 자리 없음)')
  })
})
