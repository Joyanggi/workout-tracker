import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { needsResume } from './beep'
import { stripComments } from './sourceScan'

/**
 * 오디오 복구 판정 (CC1).
 *
 * 피드백: "앱 나갔다 오면 소리가 안 난다. 완전 종료 후 다시 켜면 난다."
 *
 * 원인은 복구 경로 세 곳이 전부 `state === 'suspended'`만 검사한 것이다.
 * **iOS Safari는 앱 전환·전화·시리에서 컨텍스트를 비표준 상태 `'interrupted'`로**
 * 떨어뜨리고, 그 상태는 어디에도 안 걸려서 소리가 죽은 채로 남았다.
 * 재시작하면 새 컨텍스트라 정상 — 증상 서술과 정확히 일치한다.
 */
describe('needsResume', () => {
  it('suspended는 복구 대상이다', () => {
    expect(needsResume('suspended')).toBe(true)
  })

  it('**interrupted도 복구 대상이다** (이 라운드의 결함)', () => {
    // 표준 타입에 없는 값이라 TS가 잡아주지 않는다 — 그래서 테스트가 필요하다
    expect(needsResume('interrupted')).toBe(true)
  })

  it('running은 아니다', () => {
    expect(needsResume('running')).toBe(false)
  })

  it('closed는 아니다 — resume으로 살아나지 않으므로 재생성 대상이다', () => {
    expect(needsResume('closed')).toBe(false)
  })

  it('컨텍스트가 없으면(null·undefined) 아니다', () => {
    expect(needsResume(null)).toBe(false)
    expect(needsResume(undefined)).toBe(false)
  })

  it('모르는 상태도 복구를 시도한다 — 실패 방향이 "소리가 나게"여야 한다', () => {
    /*
      iOS가 다음 버전에서 또 다른 비표준 상태를 내놓아도 복구를 시도해야 한다.
      화이트리스트(suspended·interrupted)로 두면 이번 결함이 그대로 재발한다.
    */
    expect(needsResume('some-future-state')).toBe(true)
  })
})

describe('복구 판정이 한 곳에만 있다 (CC1)', () => {
  const src = () => {
    const files = import.meta.glob('/src/lib/beep.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const raw = files['/src/lib/beep.ts']
    expect(raw, 'beep.ts를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    return stripComments(raw!)
  }

  it("state === 'suspended' 비교가 남아 있지 않다", () => {
    /*
      세 곳(unlockAudio·resumeAudio·tone)이 각자 조건을 들고 있던 것이 이번 결함의 형태다.
      한 곳만 고치면 나머지가 조용히 남으므로, **비교 자체를 금지**한다.
    */
    expect(src()).not.toMatch(/state === 'suspended'/)
  })

  it('resume 호출 지점이 둘뿐이고 각각 이유가 다르다 (2026-08-27)', () => {
    const s = src()
    /*
      ① `tryResume` — 제스처 경로(unlockAudio)에서 되살린다.
      ② `tone` — 정지 상태로 들어온 소리를 **되살린 뒤에** 예약한다 (그러지 않으면
         재개 전 시각으로 예약돼 첫 소리가 유실된다).
      셋 이상으로 늘어나면 조건이 또 갈라진다 — 그래서 개수를 못 박는다.
    */
    expect(s).toMatch(/function tryResume\(\)[\s\S]*?needsResume\(ctx\.state\)/)
    const calls = s.match(/\.resume\(\)/g) ?? []
    expect(calls).toHaveLength(2)
  })

  it('resume이 거부되면 컨텍스트를 버린다 — 죽은 컨텍스트를 붙들지 않는다', () => {
    expect(src()).toMatch(/ctx\.resume\(\)\.catch\(\(\) => discardContext\(\)\)/)
  })

  it('closed 컨텍스트는 재생성 경로로 간다', () => {
    // unlockAudio가 closed를 버리지 않으면 new Ctor()가 실행되지 않아 영구히 무음이 된다
    expect(src()).toMatch(/if \(ctx && ctx\.state === 'closed'\) discardContext\(\)/)
  })
})

/**
 * 2026-08-27 — **CC1 이후에도 남아 있던 무음.**
 *
 * 실사용 보고: "다른 앱 갔다가 복귀하면 소리 안 나오는 건 아직도 그대로더라."
 * CC1은 판정(`needsResume`)을 고쳤지만 원인이 두 겹 더 있었다:
 *
 *   ① **배선이 없었다** — `resumeAudio`를 부르는 곳이 `useRestTimer`의 visibilitychange
 *      하나뿐이라 **휴식 타이머가 떠 있는 동안에만** 복구가 돌았다.
 *   ② **첫 소리가 유실됐다** — 정지된 컨텍스트에서 `resume()`을 부르고 **곧바로**
 *      `currentTime` 기준으로 예약하면, 재개된 뒤 그 시각은 이미 과거다.
 *
 * 이 창에서는 앱 전환을 재현할 수 없다 (누적 제약 2 — visibilityState가 항상 hidden).
 * 그래서 **정지 상태 자체를 만들어** 두 성질을 기계로 잠근다.
 */
describe('복귀 후 첫 소리 (2026-08-27)', () => {
  interface Sched {
    freq: number
    at: number
  }
  let sched: Sched[] = []
  let state: AudioContextState = 'running'
  let clock = 0

  class Gain {
    peak = 0
    gain = {
      value: 1,
      setValueAtTime: (v: number) => {
        this.peak = Math.max(this.peak, v)
      },
      linearRampToValueAtTime: (v: number) => {
        this.peak = Math.max(this.peak, v)
      },
      exponentialRampToValueAtTime: () => undefined,
      cancelScheduledValues: () => undefined,
    }
    connect = (dest: unknown) => dest
  }
  class Osc {
    frequency = { value: 0 }
    type = 'sine'
    connect = (dest: unknown) => dest
    start = (at: number) => sched.push({ freq: this.frequency.value, at })
    stop = () => undefined
  }
  class Comp {
    threshold = { value: 0 }
    knee = { value: 0 }
    ratio = { value: 0 }
    attack = { value: 0 }
    release = { value: 0 }
    connect = (dest: unknown) => dest
  }
  class Ctx {
    get currentTime() {
      return clock
    }
    get state() {
      return state
    }
    resume = async () => {
      // 실제 iOS처럼 **시계가 멈춰 있다가** 재개된다 — 정지 중 시각으로 예약하면 과거가 된다
      state = 'running'
      clock += 5
    }
    close = async () => undefined
    createOscillator = () => new Osc() as unknown as OscillatorNode
    createGain = () => new Gain() as unknown as GainNode
    createDynamicsCompressor = () => new Comp() as unknown as DynamicsCompressorNode
    destination = {} as AudioDestinationNode
  }

  const load = async () => {
    vi.resetModules()
    vi.stubGlobal('AudioContext', Ctx)
    vi.stubGlobal('window', { AudioContext: Ctx, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' })
    return import('./beep')
  }

  beforeEach(() => {
    sched = []
    state = 'running'
    clock = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('정지 상태에서 낸 소리가 **재개 후 시각**으로 예약된다 (과거로 예약하지 않는다)', async () => {
    const mod = await load()
    mod.unlockAudio()
    state = 'suspended'
    clock = 10
    mod.tick()
    // resume이 비동기라 이 시점엔 아직 예약되지 않았다 — 예전 코드는 여기서 10초에 예약했다
    expect(sched).toHaveLength(0)
    await Promise.resolve()
    await Promise.resolve()
    // 소리 하나 = 기본파 + 배음 2개 (전부 같은 시각에 시작한다)
    expect(sched).toHaveLength(3)
    expect(new Set(sched.map((x) => x.at)).size).toBe(1)
    // resume이 시계를 15로 밀었다. 예약 시각이 그보다 앞이면 소리가 유실된다
    expect(sched[0].at).toBeGreaterThanOrEqual(15)
    expect(mod.audioDiagnostics().recovered).toBe(1)
  })

  it('컨텍스트가 없으면 유실로 센다 (제스처가 한 번도 안 닿은 상태를 구분한다)', async () => {
    const mod = await load()
    mod.tick()
    expect(sched).toHaveLength(0)
    expect(mod.audioDiagnostics().droppedNoCtx).toBe(1)
  })

  it('복귀 배선이 제스처와 가시성 양쪽에 걸린다', async () => {
    const mod = await load()
    const docAdd = (globalThis.document.addEventListener as unknown as ReturnType<typeof vi.fn>)
    const winAdd = (globalThis.window.addEventListener as unknown as ReturnType<typeof vi.fn>)
    const off = mod.installAudioRecovery()
    const docEvents = docAdd.mock.calls.map((c: unknown[]) => c[0])
    expect(docEvents).toContain('visibilitychange')
    expect(docEvents).toContain('pointerdown')
    expect(winAdd.mock.calls.map((c: unknown[]) => c[0])).toContain('pageshow')
    // 정리 함수가 같은 수만큼 뗀다 (배선이 새면 컨텍스트가 여러 개 만들어질 수 있다)
    off()
    const docRemove = (globalThis.document.removeEventListener as unknown as ReturnType<typeof vi.fn>)
    expect(docRemove.mock.calls).toHaveLength(docAdd.mock.calls.length)
  })
})

describe('배선이 한 곳에 모여 있다 (2026-08-27)', () => {
  const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('복구 배선은 App에서만 건다 — 화면·훅이 각자 걸지 않는다', () => {
    const callers = Object.entries(sources)
      .filter(([p]) => !p.includes('.test.'))
      .filter(([p]) => p !== '/src/lib/beep.ts')
      .filter(([, src]) => /installAudioRecovery\(/.test(stripComments(src)))
      .map(([p]) => p)
    expect(callers).toEqual(['/src/App.tsx'])
  })

  it('useRestTimer가 오디오 복구를 다시 부르지 않는다 (타이머가 떠 있을 때만 돌던 결함)', () => {
    const src = stripComments(sources['/src/lib/useRestTimer.ts'] ?? '')
    expect(src).not.toMatch(/resumeAudio/)
  })

  it('그 스캔이 실제로 위반을 잡는다 (검사가 헛돌지 않게)', () => {
    expect(/resumeAudio/.test(stripComments('const x = () => resumeAudio()'))).toBe(true)
    expect(/resumeAudio/.test(stripComments('// resumeAudio()'))).toBe(false)
  })
})
