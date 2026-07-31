import { describe, expect, it } from 'vitest'
import { validateRoutine } from '../db/validateRoutine'
import { BUNDLED_EXERCISES, BUNDLED_ROUTINE } from '../db/seed'
import { parseBackup, SCHEMA_VERSION } from './backup'
import { recordDayIdOf } from '../types'
import type { RoutineTemplate } from '../types'

/** 마일스톤 1 시점의 저장본 — fallbackDays에 recordDayId가 없다 */
function withoutRecordDayId(): RoutineTemplate {
  return {
    ...BUNDLED_ROUTINE,
    fallbackDays: BUNDLED_ROUTINE.fallbackDays.map((d) => {
      const { recordDayId: _drop, ...rest } = d
      return rest
    }),
  }
}

describe('시드 자기복구 (저장된 루틴이 번들과 어긋난 경우)', () => {
  it('번들 루틴은 정합성 검사를 통과한다', () => {
    expect(validateRoutine(BUNDLED_ROUTINE, BUNDLED_EXERCISES)).toEqual([])
  })

  it('recordDayId가 빠진 저장본은 검사에서 걸린다 — ensureSeed가 이걸 보고 되돌린다', () => {
    const problems = validateRoutine(withoutRecordDayId(), BUNDLED_EXERCISES)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join(' ')).toContain('recordDayId')
  })

  it('fallbackDays 전부에 recordDayId가 있고 정규 Day를 가리킨다', () => {
    // 없으면 recordDayIdOf가 자기 id로 폴백해서 fallback 세션이 @fallback-push에 쌓인다
    for (const day of BUNDLED_ROUTINE.fallbackDays) {
      expect(day.recordDayId, day.id).toBeTruthy()
      expect(recordDayIdOf(day), day.id).toBe(day.recordDayId)
      expect(BUNDLED_ROUTINE.days.some((d) => d.id === day.recordDayId), day.id).toBe(true)
    }
  })
})

describe('백업 왕복 — 앱은 자기 백업을 복원할 수 있어야 한다', () => {
  const backupOf = (routine: RoutineTemplate) =>
    JSON.stringify({
      app: 'workout-tracker',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-07-31T00:00:00.000Z',
      routines: [routine],
      exercises: BUNDLED_EXERCISES,
      sessions: [],
      settings: [],
      exerciseNotes: [],
    })

  it('번들 루틴으로 만든 백업은 복원 가능하다', () => {
    const parsed = parseBackup(backupOf(BUNDLED_ROUTINE))
    expect('problems' in parsed ? parsed.problems : []).toEqual([])
  })

  it('recordDayId가 빠진 루틴이 담긴 백업은 거부된다 (복원이 막히는 실제 증상)', () => {
    const parsed = parseBackup(backupOf(withoutRecordDayId()))
    expect('problems' in parsed).toBe(true)
    if ('problems' in parsed) expect(parsed.problems.join(' ')).toContain('recordDayId')
  })
})
