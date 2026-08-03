import { describe, expect, it } from 'vitest'
import {
  COUNTDOWN_FROM_SEC,
  countdownSecond,
  createCountdownTicker,
  extendEndTime,
  isRestorable,
} from './useRestTimer'

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

// ─── W2: 카운트다운 틱 재현 ─────────────────────────────────
// 증상은 "3·2·1 틱이 안 울리고 종료 차임만 울린다"였다. 원인이 스케줄링인지 음향인지
// 가려야 했으므로, 훅의 판정을 순수 함수로 꺼내 **실제 코드로** 재현했다.
// 결과: 스케줄링은 정상 — 모든 restSec에서 3·2·1이 정확히 한 번씩 발화한다.
// 원인은 음향이었다 (330Hz·80ms가 폰 스피커 롤오프 + A가중 + 시간적분으로 31dB 손실).

/** 훅의 250ms 샘플링을 그대로 돌린다 (`TICK_MS`) */
function ringsDuring(totalSec: number, sampleMs = 250): number[] {
  const ticker = createCountdownTicker()
  const endTime = 1_000_000
  const rang: number[] = []
  for (let now = endTime - totalSec * 1000; now <= endTime + 2000; now += sampleMs) {
    const sec = ticker(endTime, Math.max(0, endTime - now))
    if (sec !== null) rang.push(sec)
  }
  return rang
}

describe('W2 — 카운트다운 틱이 실제로 발화하는가', () => {
  it('루틴의 모든 휴식 시간에서 3·2·1이 정확히 한 번씩 울린다', () => {
    // 루틴 문서의 restSec 범위 전체 (A그룹 짧게 ~ B그룹 길게)
    for (const sec of [45, 60, 75, 90, 120, 150, 180]) {
      expect(ringsDuring(sec), `${sec}초 타이머`).toEqual([3, 2, 1])
    }
  })

  it('샘플 주기가 달라도 각 초에 한 번씩만 울린다', () => {
    for (const sample of [100, 250, 500, 900]) {
      expect(ringsDuring(90, sample), `${sample}ms 샘플`).toEqual([3, 2, 1])
    }
  })

  it('같은 초를 여러 번 물어도 한 번만 울린다 (프레임 중복 방지)', () => {
    const ticker = createCountdownTicker()
    expect(ticker(100_000, 2_500)).toBe(3)
    expect(ticker(100_000, 2_400)).toBeNull()
    expect(ticker(100_000, 2_100)).toBeNull()
    expect(ticker(100_000, 1_900)).toBe(2)
  })

  it('남은 1초에 복귀하면 3·2를 소급하지 않는다 (몰아서 울리기 금지)', () => {
    // 화면이 꺼져 있던 사이 3·2가 지나갔다 — 복귀 후 1만 울려야 한다
    const ticker = createCountdownTicker()
    expect(ticker(100_000, 900)).toBe(1)
    expect(ticker(100_000, 400)).toBeNull()
  })

  it('새 타이머가 시작되면 이력이 리셋된다 (다음 세트에서 또 울려야 한다)', () => {
    const ticker = createCountdownTicker()
    expect(ticker(100_000, 2_500)).toBe(3)
    expect(ringsDuring(90)).toEqual([3, 2, 1]) // 독립 인스턴스도 정상
    // 같은 판정기에 다른 endTime이 오면 다시 3부터
    expect(ticker(200_000, 2_500)).toBe(3)
    expect(ticker(200_000, 1_500)).toBe(2)
  })

  it('0 도달과 그 이후에는 틱이 없다 (차임의 영역)', () => {
    const ticker = createCountdownTicker()
    expect(ticker(100_000, 0)).toBeNull()
    expect(ticker(100_000, -500)).toBeNull()
  })
})
