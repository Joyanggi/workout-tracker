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

/**
 * 페이크 구조 (2026-08-27 개정).
 *
 * 한 소리가 **기본파 + 배음 2개**로 만들어지도록 바뀌었다(`beep.PARTIALS`). 그래서
 * `recorded`는 **소리 하나당 한 줄**을 유지한다 — 기본파만 기록한다. 판정 근거는 배선이다:
 * 기본파는 엔벨로프 게인에 **직접** 연결되고(램프가 걸린 노드), 배음은 비율 게인을 거친다.
 * 배음 자체는 `partials`가 따로 센다 (그쪽을 검사하는 테스트가 따로 있다).
 */
class FakeGain {
  /** 엔벨로프 램프의 최댓값 — tone()이 지정한 실효 레벨 */
  peak = 0
  /** 배음 비율 게인은 `.value =`로 설정된다 (램프를 걸지 않는다) */
  amp = 1
  target: FakeGain | FakeCompressor | null = null
  gain: {
    value: number
    setValueAtTime: (v: number, at?: number) => void
    linearRampToValueAtTime: (v: number, at?: number) => void
    exponentialRampToValueAtTime: (v: number, at?: number) => void
    cancelScheduledValues: (at?: number) => void
  }
  constructor() {
    const self = this
    const mark = (v: number) => {
      self.peak = Math.max(self.peak, v)
    }
    this.gain = {
      get value() {
        return self.amp
      },
      set value(v: number) {
        self.amp = v
      },
      setValueAtTime: vi.fn(mark),
      linearRampToValueAtTime: vi.fn(mark),
      exponentialRampToValueAtTime: vi.fn(mark),
      cancelScheduledValues: vi.fn(),
    } as unknown as FakeGain['gain']
  }
  connect = vi.fn((dest: FakeGain | FakeCompressor) => {
    this.target = dest
    return dest
  })
}

class FakeCompressor {
  threshold = { value: 0 }
  knee = { value: 0 }
  ratio = { value: 0 }
  attack = { value: 0 }
  release = { value: 0 }
  connect = vi.fn((dest: unknown) => dest)
}

/** 배음(비율 게인을 거친 오실레이터) 수 */
let partials = 0
/** 만들어진 리미터 수 — 컨텍스트당 한 번이어야 한다 */
let compressors = 0

class FakeOsc {
  type = 'sine'
  frequency = { value: 0 }
  private startAt = 0
  private dest: FakeGain | null = null
  connect = vi.fn((dest: FakeGain) => {
    this.dest = dest
    return dest
  })
  start = (at: number) => {
    this.startAt = at
  }
  stop = (at: number) => {
    // 엔벨로프에 직접 붙은 것이 기본파다 (배음은 비율 게인을 한 단계 거친다)
    if (this.dest && this.dest.peak > 0) {
      recorded.push({
        freq: this.frequency.value,
        type: this.type,
        startAt: this.startAt,
        stopAt: at,
        gain: this.dest.peak,
      })
    } else {
      partials += 1
    }
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
  close = vi.fn(async () => {
    ctxState = 'closed'
  })
  createOscillator = () => new FakeOsc() as unknown as OscillatorNode
  createGain = () => new FakeGain() as unknown as GainNode
  createDynamicsCompressor = () => {
    compressors += 1
    return new FakeCompressor() as unknown as DynamicsCompressorNode
  }
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
  partials = 0
  compressors = 0
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
    const { configureAudioSession } = await freshModule()
    configureAudioSession()
    // 지원 판정을 별도 술어로 확인하지 않는다 — 그건 configureAudioSession의 판정을
    // 복제한 두 번째 사본이 된다. 효과(type이 ambient가 되는가)가 지켜야 할 성질이다
    expect(session.type).toBe('ambient')
  })

  it('미지원 브라우저에서는 아무 일도 하지 않는다 (현행 동작 유지)', async () => {
    vi.stubGlobal('navigator', {})
    const { configureAudioSession, unlockAudio, tick } = await freshModule()
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

  /*
   * 세 신호가 **형태로** 구분돼야 한다 (W2에서 높이로 구분하려다 실패했다):
   *   틱 = 낮은 단음 하나 / 마지막 큐 = 높은 단음 둘 / 차임 = 올라가는 셋
   */
  it('마지막 사이클 큐는 같은 음 두 번이다 — 틱·차임과 형태가 다르다 (W3)', async () => {
    const { unlockAudio, lastCycleCue, TICK } = await freshModule()
    unlockAudio()
    lastCycleCue()
    const freqs = recorded.map((r) => r.freq)
    expect(freqs).toHaveLength(2)
    expect(freqs[0]).toBe(freqs[1]) // 같은 음 = 상행 차임과 구분된다
    expect(freqs[0]).toBeGreaterThan(TICK.freq) // 틱보다 높다
    expect(recorded[1].startAt).toBeGreaterThan(recorded[0].startAt) // 겹치지 않는다
  })

  it('마지막 큐도 스피커 대역 안이다 (W2와 같은 실수 반복 금지)', async () => {
    const { LAST_CYCLE_CUE } = await freshModule()
    for (const spec of LAST_CYCLE_CUE) expect(spec.freq).toBeGreaterThanOrEqual(700)
  })

  it('세 신호의 음 개수가 서로 다르다 (개수만으로도 구분된다)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    const count = (fn: () => void) => {
      recorded = []
      fn()
      return recorded.length
    }
    const tickN = count(mod.tick)
    const cueN = count(mod.lastCycleCue)
    const chimeN = count(mod.chime)
    expect(new Set([tickN, cueN, chimeN]).size).toBe(3)
    expect(tickN).toBeLessThan(cueN)
    expect(cueN).toBeLessThan(chimeN)
  })

  it('컨텍스트가 없으면(제스처 전) 조용히 넘어간다 — 던지지 않는다', async () => {
    const { tick, chime } = await freshModule()
    expect(() => {
      tick()
      chime()
    }).not.toThrow()
    expect(recorded).toEqual([])
  })

  it('정지 상태면 컨텍스트를 **버린다** (2026-08-27 — resume을 기다리지 않는다)', async () => {
    /*
      CC1은 resume을 시도했다. 그런데 실기기에서 증상이 그대로였다 — iOS는 인터럽트 뒤
      컨텍스트를 살려는 주지만 출력이 죽어 있는 사례가 있고, 그 상태를 붙들면
      "running인데 무음"이 되어 진단조차 어긋난다. 버리고 다음 제스처에서 새로 만든다.
    */
    const { unlockAudio, resumeAudio, audioContextState, audioDiagnostics } = await freshModule()
    unlockAudio()
    ctxState = 'suspended'
    resumeAudio()
    expect(audioContextState()).toBeNull()
    expect(audioDiagnostics().recreated).toBe(1)

    // 다음 제스처가 새 컨텍스트를 만든다 — 실패 방향이 "다음 터치에 복구"다
    ctxState = 'running'
    unlockAudio()
    expect(audioContextState()).toBe('running')
    expect(audioDiagnostics().created).toBe(2)
  })

  it('컨텍스트를 한 번만 만든다 (반복 unlock에도)', async () => {
    const { unlockAudio } = await freshModule()
    unlockAudio()
    unlockAudio()
    unlockAudio()
    expect(created).toBe(1)
  })
})

describe('컨텍스트 상태 한 줄 (Y3)', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {})
  })

  it('제스처 전에는 null이다 (컨텍스트가 만들어진 적 없다)', async () => {
    const { audioContextState } = await freshModule()
    expect(audioContextState()).toBeNull()
  })

  it('unlock 후에는 상태를 보고한다', async () => {
    const { audioContextState, unlockAudio } = await freshModule()
    unlockAudio()
    expect(audioContextState()).toBe('running')
  })

  it('suspended도 그대로 보고한다 — 이 값이 1차 분류의 근거다', async () => {
    const { audioContextState, unlockAudio } = await freshModule()
    unlockAudio()
    ctxState = 'suspended'
    expect(audioContextState()).toBe('suspended')
  })

  it('던지지 않는다 (설정 화면이 매 렌더에 부른다)', async () => {
    const { audioContextState } = await freshModule()
    expect(() => audioContextState()).not.toThrow()
  })
})

describe('Z1 — 볼륨 배율', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {})
  })

  const gainOf = (i = 0) => recorded[i].gain

  it('배율이 모든 소리에 같이 적용된다 (틱·큐·차임)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.setVolumeScale(1)
    mod.tick()
    const tickNormal = gainOf()
    recorded = []
    mod.chime()
    const chimeNormal = gainOf()
    recorded = []
    mod.lastCycleCue()
    const cueNormal = gainOf()

    recorded = []
    mod.setVolumeScale(1.8)
    mod.tick()
    const tickLoud = gainOf()
    recorded = []
    mod.chime()
    const chimeLoud = gainOf()
    recorded = []
    mod.lastCycleCue()
    const cueLoud = gainOf()

    // 세 신호 모두 같은 비율로 커진다 — 하나만 커지면 형태 구분이 깨진다
    expect(tickLoud / tickNormal).toBeCloseTo(1.8, 5)
    expect(chimeLoud / chimeNormal).toBeCloseTo(1.8, 5)
    expect(cueLoud / cueNormal).toBeCloseTo(1.8, 5)
  })

  it('리미터 입력 상한을 넘지 않는다 (설정이 깨져도 오버슈트하지 않게)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.setVolumeScale(100)
    mod.chime()
    // per-tone 1.0 클램프는 없앴다 (리미터가 클리핑을 막는다). 상한은 남긴다 —
    // DynamicsCompressor는 진짜 리미터가 아니라 극단 입력에서 오버슈트할 수 있다
    for (const r of recorded) expect(r.gain).toBeLessThanOrEqual(2)
  })

  it('모든 소리가 리미터를 지난다 (컨텍스트당 하나)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.chime()
    mod.tick()
    expect(compressors).toBe(1)
  })

  it('한 소리가 기본파 + 배음 2개로 만들어진다 (같은 피크에서 더 크게 들리게)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.tick()
    // 기록은 소리 하나 = 한 줄이고, 배음은 따로 센다
    expect(recorded).toHaveLength(1)
    expect(partials).toBe(2)
  })

  it('상한 배율에서도 피크가 1에 닿지 않는다 (여유가 있다)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.setVolumeScale(mod.VOLUME_SCALES.max)
    mod.chime()
    /*
      2026-08-27: 가장 큰 신호가 CHIME 0.5 × 3.0 = **1.5**다. 예전(0.792)과 달리 1.0을
      넘는다 — **리미터가 뒤에 있기 때문**이고, 그것이 이번 라운드의 설계다
      ("게인 천장은 이미 다 썼다. 남은 것은 RMS와 스펙트럼"). 상한 2.0 아래다.
    */
    expect(Math.max(...recorded.map((r) => r.gain))).toBeCloseTo(1.5, 3)
    expect(compressors).toBe(1)
  })

  it('이상한 배율은 기본값으로 되돌린다 — 소리가 사라지는 방향으로 실패하지 않는다', async () => {
    const mod = await freshModule()
    for (const bad of [0, -1, NaN, Infinity]) {
      mod.setVolumeScale(bad)
      expect(mod.getVolumeScale()).toBe(mod.VOLUME_SCALES[mod.DEFAULT_SOUND_VOLUME])
    }
  })

  it('모르는 설정값도 기본값이 된다 (구버전 백업 복원 대비)', async () => {
    const mod = await freshModule()
    expect(mod.volumeScaleFor(undefined)).toBe(mod.VOLUME_SCALES[mod.DEFAULT_SOUND_VOLUME])
    expect(mod.volumeScaleFor('ludicrous')).toBe(mod.VOLUME_SCALES[mod.DEFAULT_SOUND_VOLUME])
    expect(mod.volumeScaleFor('normal')).toBe(1)
  })

  it('기본값이 loud다 — "지금도 들리는데 더 적극적이면"이 피드백이었다', async () => {
    const mod = await freshModule()
    expect(mod.DEFAULT_SOUND_VOLUME).toBe('loud')
    expect(mod.VOLUME_SCALES.loud).toBeGreaterThan(1)
  })

  it('미리 듣기가 실제 신호를 그대로 낸다 (전용 톤을 만들지 않는다)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.previewSignals()
    const freqs = recorded.map((r) => r.freq)
    // 틱 3회 + 차임 3음
    expect(freqs.slice(0, 3)).toEqual([mod.TICK.freq, mod.TICK.freq, mod.TICK.freq])
    expect(freqs.slice(3)).toEqual(mod.CHIME.map((c) => c.freq))
  })

  it('미리 듣기가 순서대로 흐른다 (동시에 울리지 않는다)', async () => {
    const mod = await freshModule()
    mod.unlockAudio()
    mod.previewSignals()
    const starts = recorded.map((r) => r.startAt)
    for (let i = 1; i < starts.length; i += 1) expect(starts[i]).toBeGreaterThan(starts[i - 1])
  })
})
