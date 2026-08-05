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

/**
 * 페이즈 경계음 (CC7-R — 글라이드 기각 후 복원).
 *
 * 실기기 청감에서 연속 글라이드가 "사이렌 같다"로 기각됐고, 후보 5종을 들려준 결과
 * **"글라이드가 없었던 버전이 최선"**이 판정이었다. 여기서 잠그는 것은 되돌린 뒤의
 * 성질이다: **피치가 램프하지 않는다**(그 순간 사이렌이 된다) · 태그는 tempo다.
 */
describe('CC7-R — 페이즈 경계음', () => {
  it('**피치를 램프시키지 않는다** — 램프가 곧 사이렌이었다', async () => {
    const mod = await freshModule()
    mod.tone({ freq: 660, duration: 0.3 }, 'tempo')
    // 경계음은 고정 주파수 한 음이다 (frequency.value 대입 — 램프 호출 없음)
    expect(nodes[0].freqs.filter((f) => f.ramp)).toHaveLength(0)
  })

  it('이완 톤이 이완 초에 비례한다 — "언제까지 내려야 하나"를 귀로 안다', async () => {
    const mod = await freshModule()
    now = 0
    const { phaseTone } = await import('./tempo')
    mod.tone(phaseTone({ kind: 'eccentric', seconds: 3 }), 'tempo')
    // 3초 × 0.9 = 2.7 (+ stop 여유 0.02)
    expect(nodes[0].stoppedAt).toBeCloseTo(2.72, 5)
  })

  it('태그가 tempo다 — 가이드를 닫으면 함께 취소된다', async () => {
    const mod = await freshModule()
    const { phaseTone } = await import('./tempo')
    mod.tone(phaseTone({ kind: 'concentric', seconds: 1 }), 'tempo')
    mod.cancelTag('tempo')
    expect(nodes[0].cancelled).toBe(true)
  })

  it('볼륨 배율이 템포 톤에도 적용된다 (소리별 배율을 두지 않는다)', async () => {
    const mod = await freshModule()
    const { phaseTone } = await import('./tempo')
    mod.setVolumeScale(2)
    mod.tone(phaseTone({ kind: 'eccentric', seconds: 2 }), 'tempo')
    // 0.21 × 2 = 0.42
    expect(nodes[0].gainRampTargets.some((g) => Math.abs(g - 0.42) < 1e-9)).toBe(true)
  })

  it('미리 듣기가 실제 신호를 그대로 낸다 (규격을 베끼지 않는다)', async () => {
    const mod = await freshModule()
    const { phaseTone } = await import('./tempo')
    const specs = [
      phaseTone({ kind: 'concentric', seconds: 1 }),
      phaseTone({ kind: 'eccentric', seconds: 2 }),
    ]
    now = 0
    mod.previewTempoTones(specs, 1)
    expect(nodes).toHaveLength(2)
    // 두 번째 음이 1초 뒤에 시작한다 (stop 시각으로 확인 — 길이 1.8 + 지연 1)
    expect(nodes[1].stoppedAt).toBeCloseTo(1 + 2 * 0.9 + 0.02, 5)
  })
})

/**
 * 글라이드 잔재가 없어야 한다 (CC7-R).
 *
 * 죽은 코드로 남기면 다음 사람이 "왜 두 방식이 있나"를 조사하게 되고, 기각된 설계가
 * 되살아나는 경로가 된다 (X10에서 세운 "유지 대상을 늘리지 않는다"와 같은 이유).
 */
describe('CC7-R — 글라이드 심볼이 소스에 없다', () => {
  const appFiles = Object.entries(
    import.meta.glob('/src/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>,
  ).filter(([p]) => !p.includes('.test.'))

  it('glide·phaseGlide·GLIDE_* 가 어디에도 없다', () => {
    const offenders = appFiles
      .filter(([, src]) => /\bglide\b|phaseGlide|GLIDE_[A-Z]/i.test(stripComments(src)))
      .map(([p]) => p)
    expect(offenders).toEqual([])
  })

  it('검사가 실제로 그 이름을 잡는다 (헛돌지 않게)', () => {
    expect(/\bglide\b|phaseGlide|GLIDE_[A-Z]/i.test('export function glide() {}')).toBe(true)
    expect(/\bglide\b|phaseGlide|GLIDE_[A-Z]/i.test('const GLIDE_LOW = 392')).toBe(true)
    // 경계음 코드는 걸리지 않는다
    expect(/\bglide\b|phaseGlide|GLIDE_[A-Z]/i.test('tone(phaseTone(p), \'tempo\')')).toBe(false)
  })

  it('설정 미리 듣기 버튼이 경계음을 말한다', () => {
    const files = import.meta.glob('/src/screens/SettingsScreen.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const src = stripComments(files['/src/screens/SettingsScreen.tsx']!)
    expect(src).toContain('템포 경계음 미리 듣기')
    expect(src).toMatch(/previewTempoTones\(/)
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
    // 경계음도 태그를 단다 (CC7-R) — "가이드 닫은 뒤 잔여 틱"은 글라이드 이전부터 있던 결함이다
    expect(src).toMatch(/tone\(phaseTone\(pos\.phase\), 'tempo'\)/)
    // 태그 없이 부르면 기본값 timer가 되어 취소 대상에서 빠진다
    expect(src).not.toMatch(/\btick\(\)/)
    expect(src).not.toMatch(/tone\(phaseTone\(pos\.phase\)\)/)
  })
})
