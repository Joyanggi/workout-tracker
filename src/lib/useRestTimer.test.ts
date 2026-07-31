import { describe, expect, it } from 'vitest'
import { extendEndTime, isRestorable } from './useRestTimer'

const NOW = new Date('2026-08-05T18:30:00.000Z').getTime()

describe('휴식 타이머 — 타임스탬프 기준 계산', () => {
  it('진행 중인 타이머에 +30초를 더하면 남은 시간이 30초 늘어난다', () => {
    const endTime = NOW + 60_000 // 1분 남음
    expect(extendEndTime(endTime, NOW, 30) - NOW).toBe(90_000)
  })

  it('이미 끝난 타이머에 +30초를 누르면 "지금부터" 30초다', () => {
    // 2분 전에 끝난 타이머. 지나간 endTime에 그냥 더하면 여전히 과거라
    // 누르는 순간 다시 "휴식 완료"로 떨어진다.
    const endTime = NOW - 120_000
    expect(extendEndTime(endTime, NOW, 30) - NOW).toBe(30_000)
  })

  it('정확히 0초일 때도 지금부터 계산한다', () => {
    expect(extendEndTime(NOW, NOW, 30) - NOW).toBe(30_000)
  })

  it('진행 중인 타이머만 복원한다', () => {
    const base = { totalSec: 90, label: '레터럴 레이즈' }
    expect(isRestorable({ ...base, endTime: NOW + 1 }, NOW)).toBe(true)
    expect(isRestorable({ ...base, endTime: NOW }, NOW)).toBe(false)
    // 어제 세션의 타이머가 오늘 "휴식 완료"로 되살아나면 안 된다
    expect(isRestorable({ ...base, endTime: NOW - 86_400_000 }, NOW)).toBe(false)
  })
})
