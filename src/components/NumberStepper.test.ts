import { describe, expect, it } from 'vitest'
import { isAllowedInput } from './NumberStepper'

/**
 * T2: 입력 중 패턴 제한.
 * 커밋 시 반올림은 그대로 두고(이중 방어) 타이핑 자체를 막는 층을 검증한다.
 */
describe('무게 입력 (소수점 2자리)', () => {
  const ok = (t: string) => isAllowedInput(t, 2)

  it('정수와 2자리 이하 소수를 허용한다', () => {
    for (const t of ['', '4', '40', '42.5', '42.50', '0.5', '102.25', '1234']) {
      expect(ok(t), t).toBe(true)
    }
  })

  it('소수점 셋째 자리부터 막는다', () => {
    for (const t of ['40.123', '42.555', '0.001']) {
      expect(ok(t), t).toBe(false)
    }
  })

  it('쉼표를 소수점으로 허용한다 (일부 키패드가 쉼표를 낸다)', () => {
    expect(ok('42,5')).toBe(true)
    expect(ok('42,555')).toBe(false)
  })

  it('문자·기호·음수·중복 소수점을 막는다', () => {
    for (const t of ['40a', 'abc', '-5', '4..5', '4.5.6', '+40', '4 0', '１２']) {
      expect(ok(t), t).toBe(false)
    }
  })

  it('정수부는 4자리까지 (500kg 상한을 훨씬 넘지만 오타 방지선)', () => {
    expect(ok('1234')).toBe(true)
    expect(ok('12345')).toBe(false)
  })

  it('빈 문자열을 허용한다 — 전체 선택 후 지우고 재입력하는 흐름', () => {
    expect(ok('')).toBe(true)
  })
})

describe('횟수 입력 (정수)', () => {
  const ok = (t: string) => isAllowedInput(t, 0)

  it('정수만 허용한다', () => {
    for (const t of ['', '1', '12', '100']) expect(ok(t), t).toBe(true)
  })

  it('소수점을 아예 막는다', () => {
    for (const t of ['1.', '1.5', '12,5', '.5']) expect(ok(t), t).toBe(false)
  })

  it('문자·음수를 막는다', () => {
    for (const t of ['10a', '-1', '+1']) expect(ok(t), t).toBe(false)
  })
})
