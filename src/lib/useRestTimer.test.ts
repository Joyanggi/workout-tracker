import { describe, expect, it } from 'vitest'
import { extendEndTime, isRestorable, COUNTDOWN_FROM_SEC, countdownSecond } from './useRestTimer'

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

// ─── G1 카운트다운 틱 ───────────────────────────────────

describe('카운트다운 틱 (G1)', () => {
  it(`남은 ${COUNTDOWN_FROM_SEC}초부터 울린다`, () => {
    expect(countdownSecond(4_000)).toBeNull()
    expect(countdownSecond(3_000)).toBe(3)
    expect(countdownSecond(2_400)).toBe(3) // 2.4초 남음 → 표시상 3초
    expect(countdownSecond(1_800)).toBe(2)
    expect(countdownSecond(600)).toBe(1)
  })

  it('종료 후에는 틱이 없다 (차임이 담당한다)', () => {
    expect(countdownSecond(0)).toBeNull()
    expect(countdownSecond(-5_000)).toBeNull()
  })

  it('남은 시간에서 파생되므로 소급 재생이 불가능하다', () => {
    /*
      화면이 꺼져 있다가 남은 1초에 복귀하면 "지금 울릴 초"는 1뿐이다.
      카운터를 누적했다면 3·2가 밀려 있다가 몰아서 울렸을 것이다
      (타이머 자체를 endTime 기준으로 만든 것과 같은 이유).
    */
    expect(countdownSecond(900)).toBe(1)
    expect([3_000, 2_000, 900].map(countdownSecond)).toEqual([3, 2, 1])
  })
})
