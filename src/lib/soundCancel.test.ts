import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stripComments } from './sourceScan'

/**
 * 예약 취소와 연속 글라이드 (CC2·CC7).
 *
 * `beep.test.ts`의 페이크는 `stop()` 시점에 기록하도록 만들어져 있어서, **취소도 stop을
 * 부르는** 이 항목을 그 위에 얹으면 기록이 오염된다. 그래서 노드 수명을 추적하는
 * 페이크를 따로 둔다 — 같은 것을 두 방식으로 재는 것이 아니라, **다른 것**을 잰다
 * (한쪽은 톤 규격, 이쪽은 노드의 생사).
 */

interface Node {
  id: number
  /** tone()/glide()가 붙인 onended를 테스트가 직접 발화시키려고 들고 있는다 */
  fireEnded?: () => void
  tagHint: string
  freqs: { at: number; value: number; ramp: boolean }[]
  stoppedAt: number | null
  gainRampTargets: number[]
  cancelled: boolean
}

let nodes: Node[] = []
let now = 0
let seq = 0

class FakeGain {
  node: Node
  constructor(node: Node) {
    this.node = node
  }
  gain = {
    value: 0.2,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((v: number) => {
      this.node.gainRampTargets.push(v)
    }),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(() => {
      this.node.cancelled = true
    }),
  }
  connect = vi.fn(() => this)
}

class FakeOsc {
  node: Node
  type = 'sine'
  #onended: (() => void) | null = null
  get onended() {
    return this.#onended
  }
  set onended(fn: (() => void) | null) {
    this.#onended = fn
    this.node.fireEnded = () => fn?.()
  }
  constructor(node: Node) {
    this.node = node
  }
  frequency = {
    value: 0,
    setValueAtTime: vi.fn((v: number, at: number) => {
      this.node.freqs.push({ at, value: v, ramp: false })
    }),
    linearRampToValueAtTime: vi.fn((v: number, at: number) => {
      this.node.freqs.push({ at, value: v, ramp: true })
    }),
  }
  connect = vi.fn(() => new FakeGain(this.node))
  start = vi.fn()
  stop = vi.fn((at: number) => {
    // 두 번째 stop(취소)이 첫 예약을 덮어쓴다 — 실제 Web Audio도 마지막 stop이 이긴다
    this.node.stoppedAt = at
  })
}

class FakeCtx {
  get currentTime() {
    return now
  }
  state: AudioContextState = 'running'
  resume = vi.fn(async () => undefined)
  createOscillator = () => {
    seq += 1
    const node: Node = {
      id: seq,
      tagHint: '',
      freqs: [],
      stoppedAt: null,
      gainRampTargets: [],
      cancelled: false,
    }
    nodes.push(node)
    return new FakeOsc(node) as unknown as OscillatorNode
  }
  createGain = () => new FakeGain(nodes[nodes.length - 1]) as unknown as GainNode
  destination = {} as AudioDestinationNode
}

async function freshModule() {
  vi.resetModules()
  const mod = await import('./beep')
  mod.unlockAudio()
  return mod
}

beforeEach(() => {
  nodes = []
  now = 0
  seq = 0
  vi.stubGlobal('AudioContext', FakeCtx)
  vi.stubGlobal('window', { AudioContext: FakeCtx, setTimeout: globalThis.setTimeout })
  // beep.ts가 configureAudioSession에서 navigator를 읽는다 (node 환경에는 없다)
  vi.stubGlobal('navigator', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CC2 — 태그별 예약 취소', () => {
  it('취소하면 그 태그의 노드가 즉시 멈춘다', async () => {
    const mod = await freshModule()
    now = 10
    mod.tone({ freq: 440, duration: 1 }, 'tempo')
    const node = nodes[0]
    expect(node.stoppedAt).toBeCloseTo(10 + 1 + 0.02, 5)

    mod.cancelTag('tempo')
    // now(10)에 가깝게 당겨진다 — 예약 시각(11.02)보다 앞이다
    expect(node.stoppedAt).toBeCloseTo(10.03, 5)
    expect(node.stoppedAt!).toBeLessThan(11)
  })

  it('**다른 태그는 건드리지 않는다** — 가이드를 닫아도 휴식 차임은 울린다', async () => {
    /*
      이것이 태그를 나눈 이유다. 자동 종료가 휴식을 시작시키므로 두 소리가 실제로 겹치고,
      가이드 정리가 차임을 죽이면 "휴식이 끝났는데 소리가 안 난다"가 된다.
    */
    const mod = await freshModule()
    now = 5
    mod.tone({ freq: 440, duration: 1 }, 'tempo')
    mod.tone({ freq: 880, duration: 1 }, 'timer')
    mod.cancelTag('tempo')

    expect(nodes[0].stoppedAt).toBeCloseTo(5.03, 5) // tempo — 취소됨
    expect(nodes[1].stoppedAt).toBeCloseTo(6.02, 5) // timer — 그대로
  })

  it('아직 시작하지 않은 예약도 취소된다 (차임 2·3음, 마지막 큐 2음)', async () => {
    const mod = await freshModule()
    now = 0
    // delay가 있는 톤 — "가이드를 내린 뒤에도 1틱 남는다"의 정체다
    mod.tone({ freq: 1319, duration: 0.07, delay: 0.12 }, 'tempo')
    expect(nodes[0].stoppedAt).toBeGreaterThan(0.12)
    mod.cancelTag('tempo')
    // stop 시각이 start 시각(0.12)보다 앞이면 Web Audio는 소리를 내지 않는다
    expect(nodes[0].stoppedAt!).toBeLessThan(0.12)
  })

  it('취소도 게인을 램프로 내린다 — 끊으면 클릭이 남는다', async () => {
    const mod = await freshModule()
    mod.tone({ freq: 440, duration: 1 }, 'tempo')
    mod.cancelTag('tempo')
    expect(nodes[0].cancelled).toBe(true)
    expect(nodes[0].gainRampTargets).toContain(0.0001)
  })

  it('같은 태그를 두 번 취소해도 던지지 않는다', async () => {
    const mod = await freshModule()
    mod.tone({ freq: 440, duration: 1 }, 'tempo')
    mod.cancelTag('tempo')
    expect(() => mod.cancelTag('tempo')).not.toThrow()
  })

  it('한 번도 쓰지 않은 태그를 취소해도 안전하다', async () => {
    const mod = await freshModule()
    expect(() => mod.cancelTag('timer')).not.toThrow()
  })

  it('자연 종료한 노드는 추적에서 빠진다 (세션 내내 자라지 않게)', async () => {
    /*
      누수 방어. 안 빼면 세션 한 번에 수백 개가 쌓이고, 취소가 이미 끝난 노드 전부에
      stop을 부르게 된다. 검증 방법: 종료를 발화시킨 뒤 취소해도 그 노드는 안 건드려진다.
    */
    const mod = await freshModule()
    now = 0
    mod.tone({ freq: 440, duration: 1 }, 'timer')
    const scheduledStop = nodes[0].stoppedAt
    expect(nodes[0].fireEnded, 'onended가 붙지 않았다 — 이 검사가 헛돌고 있다').toBeDefined()

    nodes[0].fireEnded!()
    mod.cancelTag('timer')

    // 추적에서 빠졌으므로 stop 시각이 그대로다 (당겨지지 않았다)
    expect(nodes[0].stoppedAt).toBe(scheduledStop)
    expect(nodes[0].cancelled).toBe(false)
  })

  it('기본 태그는 timer다 — 휴식 소리가 가이드 정리에 죽지 않는다', async () => {
    const mod = await freshModule()
    mod.tone({ freq: 440, duration: 1 })
    mod.cancelTag('tempo')
    expect(nodes[0].cancelled).toBe(false)
  })
})

describe('CC7 — 연속 글라이드', () => {
  it('주파수가 램프로 연속 변화한다 (톤을 이어 붙이지 않는다)', async () => {
    const mod = await freshModule()
    now = 2
    mod.glide({ from: 392, to: 659, duration: 1 })
    const f = nodes[0].freqs
    expect(f[0]).toMatchObject({ at: 2, value: 392, ramp: false })
    expect(f[1]).toMatchObject({ at: 3, value: 659, ramp: true })
  })

  it('유지 구간은 램프를 걸지 않는다', async () => {
    const mod = await freshModule()
    mod.glide({ from: 659, to: 659, duration: 1 })
    expect(nodes[0].freqs.filter((x) => x.ramp)).toHaveLength(0)
  })

  it('페이즈 길이만큼 지속한다', async () => {
    const mod = await freshModule()
    now = 0
    mod.glide({ from: 392, to: 659, duration: 3 })
    expect(nodes[0].stoppedAt).toBeCloseTo(3.02, 5)
  })

  it('길이가 0이면 아무것도 만들지 않는다 (빈 페이즈 방어)', async () => {
    const mod = await freshModule()
    mod.glide({ from: 392, to: 659, duration: 0 })
    expect(nodes).toHaveLength(0)
  })

  it('기본 태그가 tempo다 — 가이드를 닫으면 함께 취소된다', async () => {
    const mod = await freshModule()
    mod.glide({ from: 392, to: 659, duration: 2 })
    mod.cancelTag('tempo')
    expect(nodes[0].cancelled).toBe(true)
  })

  it('볼륨 배율이 글라이드에도 적용된다 (소리별 배율을 두지 않는다)', async () => {
    const mod = await freshModule()
    mod.setVolumeScale(2)
    mod.glide({ from: 392, to: 659, duration: 1, gain: 0.14 })
    expect(nodes[0].gainRampTargets).toContain(0.28)
  })

  it('1을 넘지 않게 클램프한다', async () => {
    const mod = await freshModule()
    mod.setVolumeScale(100)
    mod.glide({ from: 392, to: 659, duration: 1, gain: 0.14 })
    for (const g of nodes[0].gainRampTargets) expect(g).toBeLessThanOrEqual(1)
  })
})

describe('화면 배선 (2층 잠금)', () => {
  const sheet = () => {
    const files = import.meta.glob('/src/components/TempoGuideSheet.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const raw = files['/src/components/TempoGuideSheet.tsx']
    expect(raw, 'TempoGuideSheet를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    return stripComments(raw!)
  }

  it('가이드 언마운트가 tempo 태그를 취소한다', () => {
    // 이것이 없으면 예약된 소리가 시트를 닫은 뒤에도 울린다 (CC2의 증상)
    expect(sheet()).toMatch(/return \(\) => cancelTag\('tempo'\)/)
  })

  it('가이드의 모든 소리가 tempo 태그를 쓴다', () => {
    const src = sheet()
    expect(src).toMatch(/tick\('tempo'\)/)
    expect(src).toMatch(/glide\(phaseGlide\(pos\.phase\), 'tempo'\)/)
    // 태그 없이 부르면 기본값 timer가 되어 취소 대상에서 빠진다
    expect(src).not.toMatch(/\btick\(\)/)
  })

  it('단발 페이즈 톤(phaseTone)이 되살아나지 않았다', () => {
    expect(sheet()).not.toMatch(/phaseTone/)
  })
})
