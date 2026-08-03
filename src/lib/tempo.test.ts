import { describe, expect, it } from 'vitest'
import {
  COUNT_IN_SEC,
  PHASE_LABEL,
  TEMPO,
  cycleSeconds,
  phaseTone,
  tempoPositionAt,
} from './tempo'

/**
 * 템포 가이드 (G7).
 *
 * 핵심 성질: **경과 시간에서 파생**된다. 상태를 누적하지 않으므로 화면이 잠겼다가
 * 복귀해도 같은 경과 시간이면 같은 위치가 나오고, 밀린 페이즈를 몰아서 재생하지 않는다
 * (휴식 타이머·카운트다운 틱과 같은 원칙).
 */

const s = (sec: number) => sec * 1000

describe('템포 상수 (루틴 문서 3장)', () => {
  it('B그룹 한 사이클은 6초다 (3-1-1-1)', () => {
    expect(cycleSeconds(TEMPO.B)).toBe(6)
    expect(TEMPO.B.map((p) => [p.kind, p.seconds])).toEqual([
      ['concentric', 1],
      ['squeeze', 1],
      ['eccentric', 3],
      ['stretch', 1],
    ])
  })

  it('A그룹은 내릴 때 2초', () => {
    expect(cycleSeconds(TEMPO.A)).toBe(3)
    expect(TEMPO.A.find((p) => p.kind === 'eccentric')?.seconds).toBe(2)
  })

  it('core는 천천히 통제 — 올림도 2초', () => {
    expect(TEMPO.core.find((p) => p.kind === 'concentric')?.seconds).toBe(2)
  })

  it('모든 그룹이 수축과 이완을 갖는다', () => {
    for (const [group, phases] of Object.entries(TEMPO)) {
      expect(phases.some((p) => p.kind === 'concentric'), group).toBe(true)
      expect(phases.some((p) => p.kind === 'eccentric'), group).toBe(true)
    }
  })

  it('모든 페이즈에 한국어 라벨이 있다', () => {
    for (const phases of Object.values(TEMPO)) {
      for (const p of phases) expect(PHASE_LABEL[p.kind]).toBeTruthy()
    }
  })
})

describe('카운트인', () => {
  it('3·2·1로 센다', () => {
    expect(tempoPositionAt(0, TEMPO.B).countIn).toBe(3)
    expect(tempoPositionAt(s(0.5), TEMPO.B).countIn).toBe(3)
    expect(tempoPositionAt(s(1.5), TEMPO.B).countIn).toBe(2)
    expect(tempoPositionAt(s(2.5), TEMPO.B).countIn).toBe(1)
  })

  it('카운트인 중에는 페이즈가 없다', () => {
    expect(tempoPositionAt(s(1), TEMPO.B).phase).toBeNull()
    expect(tempoPositionAt(s(1), TEMPO.B).reps).toBe(0)
  })

  it('초마다 phaseIndex가 달라져 틱이 초당 한 번만 울린다', () => {
    const at = (sec: number) => tempoPositionAt(s(sec), TEMPO.B).phaseIndex
    expect(at(0.1)).toBe(at(0.9))
    expect(at(0.1)).not.toBe(at(1.1))
    expect(at(1.1)).not.toBe(at(2.1))
  })

  it(`카운트인이 끝나면 첫 페이즈로 넘어간다 (${COUNT_IN_SEC}초)`, () => {
    const p = tempoPositionAt(s(COUNT_IN_SEC), TEMPO.B)
    expect(p.countIn).toBeNull()
    expect(p.phase?.kind).toBe('concentric')
  })
})

describe('페이즈 진행 (B그룹 3-1-1-1)', () => {
  /** 카운트인 이후 t초 */
  const at = (t: number) => tempoPositionAt(s(COUNT_IN_SEC + t), TEMPO.B)

  it('수축 → 짜내기 → 이완 → 늘림 순서로 간다', () => {
    expect(at(0.5).phase?.kind).toBe('concentric')
    expect(at(1.5).phase?.kind).toBe('squeeze')
    expect(at(3.0).phase?.kind).toBe('eccentric')
    expect(at(5.5).phase?.kind).toBe('stretch')
  })

  it('한 사이클이 지나면 반복수가 1이다', () => {
    expect(at(5.9).reps).toBe(0)
    expect(at(6.1).reps).toBe(1)
    expect(at(12.1).reps).toBe(2)
  })

  it('페이즈 안 진행도가 0에서 1로 간다 (링 애니메이션)', () => {
    // 이완은 3초 — 시작 직후와 끝 직전
    expect(at(2.05).phaseProgress).toBeLessThan(0.1)
    expect(at(4.9).phaseProgress).toBeGreaterThan(0.9)
  })

  it('phaseIndex가 사이클을 넘어 계속 증가한다 (소리 중복 방지)', () => {
    expect(at(0.5).phaseIndex).toBe(0)
    expect(at(1.5).phaseIndex).toBe(1)
    expect(at(6.5).phaseIndex).toBe(4) // 두 번째 사이클의 첫 페이즈
    expect(at(0.5).phaseIndex).toBeLessThan(at(6.5).phaseIndex)
  })
})

describe('복귀 안전성 — 누적하지 않는다', () => {
  it('같은 경과 시간이면 항상 같은 위치다 (몇 번 불러도)', () => {
    const a = tempoPositionAt(s(20), TEMPO.B)
    const b = tempoPositionAt(s(20), TEMPO.B)
    expect(a).toEqual(b)
  })

  it('중간을 건너뛰어도 그 시점의 위치가 정확하다', () => {
    // 화면이 꺼져 있다가 20초 뒤에 복귀한 경우 — 밀린 페이즈를 재생하지 않고
    // "지금 어디인가"만 답한다
    const jumped = tempoPositionAt(s(COUNT_IN_SEC + 20), TEMPO.B)
    expect(jumped.reps).toBe(3) // 20 / 6 = 3회 완료
    expect(jumped.phase?.kind).toBe('eccentric') // 20 - 18 = 2초 → 수축1+짜내기1 끝, 이완 시작
  })

  it('음수 경과 시간도 안전하다', () => {
    expect(tempoPositionAt(-1000, TEMPO.B).countIn).toBe(COUNT_IN_SEC)
  })

  it('빈 페이즈 목록에서도 던지지 않는다', () => {
    const p = tempoPositionAt(s(10), [])
    expect(p.phase).toBeNull()
    expect(p.reps).toBe(0)
  })
})

describe('페이즈 소리', () => {
  it('이완 톤 길이가 이완 초에 비례한다 — "언제까지 내려야 하나"를 귀로 안다', () => {
    const bEcc = TEMPO.B.find((p) => p.kind === 'eccentric')!
    const aEcc = TEMPO.A.find((p) => p.kind === 'eccentric')!
    expect(phaseTone(bEcc).duration).toBeGreaterThan(phaseTone(aEcc).duration)
    expect(phaseTone(bEcc).duration).toBeCloseTo(2.7, 5)
  })

  it('수축이 이완보다 높은 음이다 (상행 vs 하행)', () => {
    const conc = phaseTone(TEMPO.B[0])
    const ecc = phaseTone(TEMPO.B[2])
    expect(conc.freq).toBeGreaterThan(ecc.freq)
  })

  it('정지·짜내기는 짧은 저음 틱이다', () => {
    for (const kind of ['squeeze', 'stretch'] as const) {
      const t = phaseTone({ kind, seconds: 1 })
      expect(t.duration).toBeLessThan(0.2)
      expect(t.freq).toBeLessThan(phaseTone(TEMPO.B[2]).freq)
    }
  })

  it('수축 톤이 페이즈보다 길어지지 않는다', () => {
    const short = phaseTone({ kind: 'concentric', seconds: 0.2 })
    expect(short.duration).toBeLessThanOrEqual(0.2)
  })
})
