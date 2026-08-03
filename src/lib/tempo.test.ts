import { describe, expect, it } from 'vitest'
import {
  COUNT_IN_SEC,
  PHASE_LABEL,
  TEMPO,
  cycleSeconds,
  phaseTone,
  tempoPositionAt,
  tempoRepState,
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

// ─── W3: 상단 도달 자동 종료 ─────────────────────────────────
// 인클라인(6~10회)에서 30회를 넘어도 가이드가 계속 돌던 것이 실사용 피드백이었다.

describe('W3 — 상단 반복수 판정', () => {
  const B = TEMPO.B // 6초 사이클 (1+1+3+1)
  const at = (sec: number) => tempoPositionAt(sec * 1000, B)
  const state = (sec: number, repMax = 10) => tempoRepState(at(sec), repMax)

  it('카운트인 중에는 아직 한 회도 아니다', () => {
    expect(state(0)).toEqual({ reps: 0, lastCycle: false, complete: false })
    expect(state(2.9)).toEqual({ reps: 0, lastCycle: false, complete: false })
  })

  it('사이클이 끝날 때마다 한 회씩 는다', () => {
    expect(state(COUNT_IN_SEC + 0.1).reps).toBe(0) // 1회째 진행 중
    expect(state(COUNT_IN_SEC + 6.1).reps).toBe(1)
    expect(state(COUNT_IN_SEC + 12.1).reps).toBe(2)
  })

  it('상단 직전 사이클에서 "마지막"을 알린다 (갑자기 끊기지 않게)', () => {
    // repMax 10 → 10번째 사이클(reps === 9) 도는 동안 마지막이다
    expect(state(COUNT_IN_SEC + 6 * 9 + 0.1, 10)).toMatchObject({ reps: 9, lastCycle: true })
    expect(state(COUNT_IN_SEC + 6 * 8 + 0.1, 10).lastCycle).toBe(false)
  })

  it('상단에 도달하면 complete이고, 그때는 "마지막"이 아니라 "끝"이다', () => {
    const s = state(COUNT_IN_SEC + 6 * 10 + 0.1, 10)
    expect(s.complete).toBe(true)
    expect(s.lastCycle).toBe(false)
    expect(s.reps).toBe(10)
  })

  it('상단을 넘겨 계속 돌아도 기록될 값은 repMax를 넘지 않는다', () => {
    // 이 상황이 원래 버그였다 — 30회를 넘겨도 계속 돌았다
    const s = state(COUNT_IN_SEC + 6 * 30, 10)
    expect(s.reps).toBe(10)
    expect(s.complete).toBe(true)
  })

  it('repMax 1이어도 경계가 성립한다 (lastCycle이 먼저, 그다음 complete)', () => {
    expect(state(COUNT_IN_SEC + 0.1, 1)).toMatchObject({ reps: 0, lastCycle: true, complete: false })
    expect(state(COUNT_IN_SEC + 6.1, 1)).toMatchObject({ reps: 1, complete: true })
  })

  it('repMax가 0 이하면 자동 종료를 하지 않는다 (시드 이상값 방어)', () => {
    expect(state(COUNT_IN_SEC + 60, 0)).toEqual({ reps: 0, lastCycle: false, complete: false })
    expect(state(COUNT_IN_SEC + 60, -1)).toEqual({ reps: 0, lastCycle: false, complete: false })
  })

  it('lastCycle과 complete는 동시에 참이 될 수 없다', () => {
    for (let ms = 0; ms <= 80_000; ms += 250) {
      const s = tempoRepState(tempoPositionAt(ms, B), 10)
      expect(s.lastCycle && s.complete).toBe(false)
    }
  })

  it('같은 경과 시간이면 같은 판정이다 (복귀 안전 — 프레임마다 재발화 금지의 근거)', () => {
    const ms = COUNT_IN_SEC * 1000 + 6 * 9 * 1000 + 500
    expect(tempoRepState(tempoPositionAt(ms, B), 10)).toEqual(
      tempoRepState(tempoPositionAt(ms, B), 10),
    )
  })

  it('그룹별 상단이 각각 지켜진다 (사이클 길이가 달라도)', () => {
    // 손계산을 쓰지 않는다 — core를 95초로 적었다가 틀렸다 (5초 × 20 = 100초)
    for (const [name, phases] of Object.entries(TEMPO)) {
      for (const repMax of [6, 10, 20]) {
        const cycle = cycleSeconds(phases)
        const justBefore = (COUNT_IN_SEC + cycle * repMax - 0.1) * 1000
        const justAfter = (COUNT_IN_SEC + cycle * repMax + 0.1) * 1000
        expect(
          tempoRepState(tempoPositionAt(justBefore, phases), repMax).complete,
          `${name} repMax ${repMax} — 상단 직전`,
        ).toBe(false)
        expect(
          tempoRepState(tempoPositionAt(justAfter, phases), repMax).complete,
          `${name} repMax ${repMax} — 상단 도달`,
        ).toBe(true)
      }
    }
  })
})

/**
 * 기록 신뢰도 구분 (V1 — 리뷰어 지시 · W3 이후 두 경로가 생겼다).
 *
 * 자동 종료는 `repMax`까지 완주했으므로 값이 정확하다. 수동 종료는 **가이드가 돈
 * 사이클 수**이고 실제 반복이 아니다 — 가이드보다 느리게 하거나 시트를 열어둔 채 쉬면
 * 실제보다 많이 세어진다. 리뷰어 판정: 자동 입력이 repMax를 넘겨 **증량 판정을 오염시킬
 * 수 있는 유일한 경로**이므로 "값을 보여주고 수정 가능"이 방어선이라는 사실을 남길 것.
 */
describe('가이드 종료 라벨의 신뢰도 표시 (V1)', () => {
  const SOURCES = import.meta.glob('/src/components/TempoGuideSheet.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const sheet = () => {
    const src = SOURCES['/src/components/TempoGuideSheet.tsx']
    expect(src, '시트를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    return src!
  }

  it('수동 종료 라벨에 "약"이 붙는다 (추정값임을 드러낸다)', () => {
    expect(sheet()).toMatch(/종료 — 약 \$\{rep\.reps\}회로 기록/)
  })

  it('넣을 값을 버튼에 미리 보여준다 (방어선 — 리뷰어 지시)', () => {
    // 라벨이 값을 감추면 "마찰 없이 틀린 값이 들어간다"가 된다
    expect(sheet()).toMatch(/rep\.reps\}회로 기록/)
  })

  it('자동 종료는 별도 경로다 (onComplete) — "약"을 지나지 않는다', () => {
    expect(sheet()).toMatch(/onComplete\(rep\.reps\)/)
  })

  it('자동 종료가 프레임마다 재발화하지 않도록 ref로 막는다', () => {
    // 80ms마다 다시 부르면 세트 체크가 토글되어 방금 시작한 휴식 타이머가 꺼진다
    expect(sheet()).toMatch(/fired\.current\.complete/)
  })
})
