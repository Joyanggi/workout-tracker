import { describe, expect, it } from 'vitest'
import exercisesJson from '../data/exercises.json'
import type { Exercise } from '../types'
import {
  SEPARATOR,
  compensationSummary,
  hasCompensation,
  parseCompensation,
  serializeCompensation,
} from './compensation'

const EXERCISES = exercisesJson as Exercise[]
import { applyCompensation, applySensoryNote, applySensoryScore } from './sessionOps'
import { buildSession } from './sessionFactory'
import { ROUTINE } from './testFixtures'
import { NO_COMPENSATION } from '../types'

const SIGNS = ['엉덩이가 시트에서 뜸', '어깨가 앞으로 말림']

describe('보상작용 직렬화 — 빈칸이 될 수 없다', () => {
  it('아무것도 없으면 "없음"이 된다 (루틴 문서: 빈칸 금지)', () => {
    expect(serializeCompensation({ signs: [], free: '' })).toBe(NO_COMPENSATION)
    expect(serializeCompensation({ signs: [], free: '   ' })).toBe(NO_COMPENSATION)
  })

  it('체크리스트 + 자유 입력을 한 문자열로 접는다', () => {
    expect(serializeCompensation({ signs: SIGNS, free: '3세트부터 심함' })).toBe(
      '엉덩이가 시트에서 뜸, 어깨가 앞으로 말림, 3세트부터 심함',
    )
  })

  it('왕복(round-trip)해도 체크 상태와 자유 입력이 분리된다', () => {
    const original = { signs: [SIGNS[1]], free: '마지막 세트만' }
    const stored = serializeCompensation(original)
    expect(parseCompensation(stored, SIGNS)).toEqual(original)
  })

  it('"없음"을 펴면 아무것도 선택되지 않은 상태다', () => {
    expect(parseCompensation(NO_COMPENSATION, SIGNS)).toEqual({ signs: [], free: '' })
    expect(parseCompensation('', SIGNS)).toEqual({ signs: [], free: '' })
  })

  it('체크리스트에 없는 항목은 자유 입력으로 되돌아온다', () => {
    // 루틴 JSON을 교체해서 compensationSigns가 바뀌어도 과거 기록을 잃지 않아야 한다
    const parsed = parseCompensation('예전 체크리스트 항목, 손목 꺾임', SIGNS)
    expect(parsed.signs).toEqual([])
    expect(parsed.free).toBe('예전 체크리스트 항목, 손목 꺾임')
  })

  it('hasCompensation / compensationSummary', () => {
    expect(hasCompensation(NO_COMPENSATION)).toBe(false)
    expect(hasCompensation('반동')).toBe(true)
    expect(compensationSummary(NO_COMPENSATION)).toBe(NO_COMPENSATION)
    expect(compensationSummary('반동')).toBe('반동')
    expect(compensationSummary('반동, 승모 개입, 허리 과신전')).toBe('반동 +2')
  })
})

describe('세션 반영', () => {
  const fresh = () =>
    buildSession({
      routine: ROUTINE,
      day: ROUTINE.days[0],
      mode: 'normal',
      sessions: [],
      phase: 0,
      today: '2026-08-05',
    }).session
  const INCLINE = 'incline-chest-press@d1'
  const get = (s: ReturnType<typeof fresh>) => s.entries.find((e) => e.recordKey === INCLINE)!

  it('생성 시점의 기본값이 "없음"이다', () => {
    expect(get(fresh()).compensation).toBe(NO_COMPENSATION)
  })

  it('빈 문자열을 저장하려 해도 "없음"으로 막는다', () => {
    const s = applyCompensation(fresh(), INCLINE, '   ')
    expect(get(s).compensation).toBe(NO_COMPENSATION)
  })

  it('감각 점수는 같은 값을 다시 누르면 해제된다', () => {
    let s = applySensoryScore(fresh(), INCLINE, 3)
    expect(get(s).sensoryScore).toBe(3)
    s = applySensoryScore(s, INCLINE, 3)
    expect(get(s).sensoryScore).toBeUndefined()
    s = applySensoryScore(s, INCLINE, 0)
    expect(get(s).sensoryScore).toBe(0) // 0점도 유효한 기록이다 ("안 느껴짐")
  })

  it('감각 메모를 비우면 필드가 사라진다 (빈 문자열을 남기지 않음)', () => {
    let s = applySensoryNote(fresh(), INCLINE, '바깥쪽에 느껴짐')
    expect(get(s).sensoryNote).toBe('바깥쪽에 느껴짐')
    s = applySensoryNote(s, INCLINE, '  ')
    expect(get(s).sensoryNote).toBeUndefined()
  })

  it('보상작용이 기록되면 증량 제안이 막힌다 (§7 연동 확인)', () => {
    // computeProgression은 compensation !== "없음"이면 제안하지 않는다.
    // 여기서는 두 규칙이 같은 필드를 본다는 사실만 고정한다.
    const s = applyCompensation(fresh(), INCLINE, '엉덩이가 시트에서 뜸')
    expect(hasCompensation(get(s).compensation)).toBe(true)
  })
})

describe('카탈로그 체크리스트', () => {
  it('시드의 compensationSigns가 구분자를 포함하지 않는다', () => {
    // 항목 안에 ", "가 있으면 직렬화한 뒤 되읽을 때 하나가 둘로 쪼개져
    // 체크 상태가 자유 입력으로 새어나간다.
    for (const exercise of EXERCISES) {
      for (const sign of exercise.compensationSigns) {
        expect(sign).not.toContain(SEPARATOR)
        expect(sign.trim()).toBe(sign)
      }
    }
  })

  it('체크리스트 전체를 선택해도 왕복이 보존된다', () => {
    for (const exercise of EXERCISES) {
      if (exercise.compensationSigns.length === 0) continue
      const value = { signs: exercise.compensationSigns, free: '' }
      const stored = serializeCompensation(value)
      expect(parseCompensation(stored, exercise.compensationSigns)).toEqual(value)
    }
  })
})
