import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 오디오 신호 (G1 카운트다운·종료음 / G8 오디오 세션).
 *
 * 브라우저에서 검증하려 했지만 타이머를 3초로 줄이는 조작이 UI에 없고
 * (`+30초`·`건너뛰기`뿐), 개발 브라우저에는 `navigator.audioSession`이 아예 없다.
 * `AudioContext`를 스텁하면 **톤 주파수·길이·순서를 정확히** 확인할 수 있고 반복도 된다.
 *
 * 실기기 확인이 필요한 것은 "다른 앱 음악이 끊기지 않는가" 하나다 (G8 수용 기준).
 */

interface Recorded {
  freq: number
  type: string
  startAt: number
  stopAt: number
  gain: number
}

let recorded: Recorded[] = []
let ctxState: AudioContextState = 'running'
let created = 0

/** 마지막으로 만들어진 게인 노드의 목표값 — tone()이 linearRamp로 지정한다 */
let lastGain = 0

class FakeGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((value: number) => {
      lastGain = value
    }),
    exponentialRampToValueAtTime: vi.fn(),
  }
  connect = vi.fn(() => this)
}

class FakeOsc {
  type = 'sine'
  frequency = { value: 0 }
  private startAt = 0
  connect = vi.fn(() => new FakeGain())
  start = (at: number) => {
    this.startAt = at
  }
  stop = (at: number) => {
    recorded.push({
      freq: this.frequency.value,
      type: this.type,
      startAt: this.startAt,
      stopAt: at,
      gain: lastGain,
    })
  }
}

class FakeCtx {
  currentTime = 0
  get state() {
    return ctxState
  }
  resume = vi.fn(async () => {
    ctxState = 'running'
  })
  createOscillator = () => new FakeOsc() as unknown as OscillatorNode
  createGain = () => new FakeGain() as unknown as GainNode
  destination = {} as AudioDestinationNode
  constructor() {
    created += 1
  }
}

/** 모듈 상태(ctx)가 테스트 간에 새다 — 매번 새로 import한다 */
async function freshModule() {
  vi.resetModules()
  return import('./beep')
}

/**
 * vitest 환경이 node라 `window`가 없다 (다른 테스트는 DOM을 안 건드린다).
 * `beep.ts`가 `window.AudioContext`를 읽으므로 함께 스텁한다.
 */
function stubAudio(Ctor: unknown = FakeCtx) {
  vi.stubGlobal('AudioContext', Ctor)
  vi.stubGlobal('window', { AudioContext: Ctor })
}

beforeEach(() => {
  recorded = []
  lastGain = 0
  ctxState = 'running'
  created = 0
  stubAudio()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('G8 오디오 세션', () => {
  it('지원하면 ambient로 설정한다 — 다른 앱 음악을 끊지 않기 위해', async () => {
    const session = { type: 'auto' }
    vi.stubGlobal('navigator', { audioSession: session })
    const { configureAudioSession, audioSessionSupported } = await freshModule()
    expect(audioSessionSupported()).toBe(true)
    configureAudioSession()
    expect(session.type).toBe('ambient')
  })

  it('미지원 브라우저에서는 아무 일도 하지 않는다 (현행 동작 유지)', async () => {
    vi.stubGlobal('navigator', {})
    const { configureAudioSession, audioSessionSupported, unlockAudio, tick } = await freshModule()
    expect(audioSessionSupported()).toBe(false)
    expect(() => configureAudioSession()).not.toThrow()
    // 소리는 여전히 나야 한다
    unlockAudio()
    tick()
    expect(recorded).toHaveLength(1)
  })

  it('읽기 전용으로 막혀 있어도 소리를 죽이지 않는다', async () => {
    const session = {}
    Object.defineProperty(session, 'type', {
      get: () => 'auto',
      set: () => {
        throw new Error('readonly')
      },
    })
    vi.stubGlobal('navigator', { audioSession: session })
    const { configureAudioSession } = await freshModule()
    expect(() => configureAudioSession()).not.toThrow()
  })

  it('unlockAudio가 컨텍스트 생성 **전에** 세션을 지정한다', async () => {
    const order: string[] = []
    const session = {} as { type: string }
    Object.defineProperty(session, 'type', {
      get: () => 'auto',
      set: () => order.push('session'),
    })
    vi.stubGlobal('navigator', { audioSession: session })
    class Ordered extends FakeCtx {
      constructor() {
        super()
        order.push('ctx')
      }
    }
    stubAudio(Ordered)
    const { unlockAudio } = await freshModule()
    unlockAudio()
    // 순서가 뒤바뀌면 iOS가 이미 기본 세션으로 잡은 뒤에 바꾸는 셈이 된다
    expect(order).toEqual(['session', 'ctx'])
  })
})

describe('G1 카운트다운 틱 · 종료 차임', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {})
  })

  it('틱은 단음 하나다', async () => {
    const { unlockAudio, tick } = await freshModule()
    unlockAudio()
    tick()
    expect(recorded).toHaveLength(1)
    expect(recorded[0].freq).toBe(784)
  })

  /*
   * W2 회귀 방지. v1.2의 330Hz · 80ms는 폰 스피커에서 들리지 않았다 —
   * 저역 롤오프(−13dB) + A가중(−6dB) + 200ms 미만 시간적분(−4dB)이 겹쳤다.
   * 게인만 올려서는 못 넘는 차이였으므로 주파수와 길이를 되돌리면 안 된다.
   */
  it('틱이 폰 스피커 대역 안에 있고 귀의 적분 창에 걸린다 (W2)', async () => {
    const { unlockAudio, tick, TICK } = await freshModule()
    unlockAudio()
    tick()
    // 소형 스피커는 공진(수백 Hz) 아래로 12dB/oct 떨어진다
    expect(TICK.freq).toBeGreaterThanOrEqual(700)
    // 80ms는 귀의 적분 창(~200ms)보다 너무 짧아 4dB를 잃었다
    expect(TICK.duration).toBeGreaterThanOrEqual(0.1)
  })

  it('차임은 상행 3음이다 — 형태로 틱과 구분한다', async () => {
    const { unlockAudio, chime } = await freshModule()
    unlockAudio()
    chime()
    const freqs = recorded.map((r) => r.freq)
    expect(freqs).toEqual([880, 1175, 1568])
    // 상행이어야 한다 (내려가면 "종료"로 들리지 않는다)
    expect(freqs).toEqual([...freqs].sort((a, b) => a - b))
    // 순차적이어야 한다 — 동시에 울리면 화음이 되어 "상행"으로 안 들린다
    expect(recorded[1].startAt).toBeGreaterThan(recorded[0].startAt)
    expect(recorded[2].startAt).toBeGreaterThan(recorded[1].startAt)
  })

  /*
   * 구분 근거가 v1.2와 **달라졌다**: 예전에는 "틱이 낮고 차임이 높다"였고,
   * 그 낮음이 곧 안 들리는 이유였다. 이제 둘 다 스피커가 잘 내는 대역에 두고
   * **형태**로 구분한다 — 틱은 같은 음 하나, 차임은 올라가는 세 음.
   */
  it('차임이 틱보다 길고 음이 많다 (구분 근거를 수치로 고정)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.tick()
    const t = recorded[0]
    recorded = []
    mod.chime()
    expect(recorded.length).toBeGreaterThan(1)
    const totalChime = recorded[recorded.length - 1].stopAt - recorded[0].startAt
    expect(totalChime).toBeGreaterThan((t.stopAt - t.startAt) * 3)
    // 차임 최고음이 틱보다 위에 있다 (상행의 도착점이 더 높아야 "끝"으로 들린다)
    expect(Math.max(...recorded.map((r) => r.freq))).toBeGreaterThan(t.freq)
  })

  it('차임이 틱보다 크게 울린다 — 음악 위로 뚫려야 한다 (W2 ②③)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.tick()
    const tickGain = recorded[0].gain
    recorded = []
    mod.chime()
    expect(tickGain).toBeGreaterThan(0.16) // v1.2 값보다 올렸다
    for (const r of recorded) expect(r.gain).toBeGreaterThan(tickGain)
  })

  it('컨텍스트가 없으면(제스처 전) 조용히 넘어간다 — 던지지 않는다', async () => {
    const { tick, chime } = await freshModule()
    expect(() => {
      tick()
      chime()
    }).not.toThrow()
    expect(recorded).toEqual([])
  })

  it('suspended 상태면 resume을 시도한다 (백그라운드 복귀)', async () => {
    const { unlockAudio, resumeAudio } = await freshModule()
    unlockAudio()
    ctxState = 'suspended'
    resumeAudio()
    expect(ctxState).toBe('running')
  })

  it('컨텍스트를 한 번만 만든다 (반복 unlock에도)', async () => {
    const { unlockAudio } = await freshModule()
    unlockAudio()
    unlockAudio()
    unlockAudio()
    expect(created).toBe(1)
  })
})
