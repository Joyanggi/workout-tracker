/**
 * 오디오 — 휴식 타이머 신호 (§5.2) · 템포 가이드 톤 (G7).
 *
 * `navigator.vibrate`는 iOS Safari가 지원하지 않으므로 Web Audio가 주 수단이다.
 * iOS는 **사용자 제스처 없이 AudioContext를 시작할 수 없다.** 그래서 세트 체크(✓)를
 * 누르는 순간 unlockAudio()로 컨텍스트를 만들어두고, 90~150초 뒤 제스처 없이 울릴 때는
 * 이미 열려 있는 컨텍스트를 재사용한다.
 *
 * **오디오 세션은 `ambient`다 (G8).** 기본 세션으로 잡히면 iOS가 이 앱을 "재생 앱"으로
 * 보고 다른 앱의 음악을 중단시킨다 — 운동 중 스포티파이가 끊기는 것이 실사용 피드백이었다.
 * ambient는 다른 앱 오디오와 믹스되고 무음 스위치를 존중한다.
 * (무음 스위치 ON이면 소리가 안 나는 것이 ambient의 정상 동작이다)
 */

type Ctor = typeof AudioContext
let ctx: AudioContext | null = null

/**
 * 진단 카운터 (2026-08-27 소리 라운드).
 *
 * "다른 앱 갔다 오면 소리가 안 난다"가 CC1 이후에도 실기기에서 그대로였다. 이 창에서는
 * 앱 전환을 재현할 수 없으므로(누적 제약 2 — visibilityState가 항상 hidden),
 * **실기기에서 무슨 일이 일어났는지 사용자가 읽어서 알려줄 수 있는 값**을 남긴다.
 * 설정 화면 진단 줄이 이것을 보여준다.
 */
const stats = { created: 0, recreated: 0, recovered: 0, droppedNoCtx: 0 }

export interface AudioDiagnostics {
  state: string | null
  /** 컨텍스트를 새로 만든 횟수 */
  created: number
  /** 죽은 컨텍스트를 버리고 다시 만든 횟수 */
  recreated: number
  /** 정지 상태에서 resume 후 소리를 낸 횟수 */
  recovered: number
  /** 컨텍스트가 없어서 울리지 못한 소리 수 (제스처가 한 번도 안 닿음) */
  droppedNoCtx: number
}

export function audioDiagnostics(): AudioDiagnostics {
  return { state: ctx?.state ?? null, ...stats }
}

/** `navigator.audioSession`은 표준 타입에 없다 (iOS 16.4+ / Safari 전용) */
interface AudioSessionNavigator extends Navigator {
  audioSession?: { type: string }
}

/**
 * 다른 앱 오디오를 끊지 않도록 세션 종류를 지정한다 (G8).
 *
 * **부팅 시와 resume 직전 양쪽에서 호출한다** — iOS가 백그라운드 복귀 때 세션을
 * 재협상하는 경우가 있어 한 번만 설정하면 되돌아갈 수 있다.
 * 미지원 브라우저에서는 아무 일도 하지 않는다 (현행 동작 유지).
 */
/**
 * 음악을 잠깐 줄여서 신호음을 뚫는다 (2026-08-27, 기본 **꺼짐**).
 *
 * 피드백의 나머지 절반이 여기다: "폰 볼륨 50%인데 더 올리면 노래가 너무 커진다."
 * 앱 게인은 이미 천장이라(위 볼륨 주석) 남은 방법은 **경쟁 상대를 잠깐 줄이는 것**이다.
 * iOS의 `transient` 세션이 그 동작이다 — 다른 앱 오디오를 **끄지 않고 잠시 덕킹**한다.
 *
 * **기본을 끔으로 두는 이유 (X5 — 실패 방향이 현상 유지여야 한다):** G8의 실사용 피드백이
 * "운동 중 스포티파이가 끊긴다"였고 그래서 `ambient`로 갔다. `transient`가 기기·iOS
 * 버전에 따라 덕킹이 아니라 **중단**으로 동작하면 그 회귀가 그대로 재현된다. 이 창에서는
 * 소리를 들을 수 없어 어느 쪽인지 확인할 방법이 없다 — 그래서 켜는 것은 사용자 판단으로
 * 두고, 설정 문구가 무엇이 일어날 수 있는지 그대로 말한다.
 *
 * 덕킹은 **무음 스위치도 무시할 수 있다** (ambient와 달리). 그것도 문구에 적었다.
 */
let duckOthers = false

export function setDuckOthers(on: boolean): void {
  duckOthers = on
  configureAudioSession()
}

export function getDuckOthers(): boolean {
  return duckOthers
}

/** 지금 적용할 세션 종류 — 판정을 한 곳에 둔다 (두 곳에서 갈리면 켠 적 없는데 켜진다) */
export function audioSessionType(): string {
  return duckOthers ? 'transient' : 'ambient'
}

export function configureAudioSession(): void {
  const nav = navigator as AudioSessionNavigator
  if (!nav.audioSession) return
  try {
    nav.audioSession.type = audioSessionType()
  } catch {
    /* 읽기 전용으로 막힌 환경이면 무시 — 소리 자체는 나야 한다 */
  }
}

/**
 * 컨텍스트 상태 한 줄 (설정 → 진단).
 *
 * v1.3에 "모든 소리가 안 들린다"는 보고가 있었고, 원인을 가리려고 **진단 화면을 만들어
 * 배포하고 사용자 확인을 받은 뒤 지우는** 한 라운드를 썼다. 결론은 코드가 아니었다
 * (배포 순서상 톤 수정은 이미 나가 있었고, 회복 시점에 오디오 동작을 바꾼 커밋이 없다 —
 * 출력 경로·무음 스위치 쪽이다).
 *
 * 그때 필요했던 것은 화면 하나가 아니라 **이 값 하나**였다:
 *   `null`      — 컨텍스트가 만들어진 적 없다 (제스처가 한 번도 안 닿았다)
 *   `running`   — 앱의 오디오는 살아 있다 → 무음 스위치·볼륨·출력 경로를 본다
 *   `suspended` / `interrupted` — 앱 쪽 문제다
 *
 * 패널을 되살리지 않고 이 한 줄만 둔다 (X10의 "유지 대상을 늘리지 않는다"와 양립한다).
 */
export function audioContextState(): string | null {
  return ctx?.state ?? null
}

/**
 * 출력 체인 — **모든 소리가 리미터를 지난다.**
 *
 * 왜 리미터인가: 디지털 오디오의 진폭 천장은 1.0이고 v1.8까지 이미 0.79를 쓰고 있었다
 * (차임 0.36 × 배율 2.2). 즉 **게인을 더 올릴 자리가 사실상 없었다** — "가장 크게 해도
 * 작다"는 보고가 정확히 그 상태다. 남은 지렛대는 피크가 아니라 **RMS(지속 진폭)**이고,
 * 리미터가 피크를 눌러 주면 그 아래 구간을 훨씬 크게 유지할 수 있다.
 *
 * 임계값을 −2dB로 높게 잡은 이유: 여기서 강하게 압축하면 볼륨 3단의 차이가 뭉개진다
 * (계산해 보면 threshold −18·ratio 8에서 loud 0.62 vs max 0.67로 사실상 같아진다).
 * 이 리미터는 **음량 조절이 아니라 클리핑 방어**다 — 하모닉이 쌓여 1.0을 넘을 때만 작동한다.
 */
let masterIn: GainNode | null = null
/** 마스터 체인이 어느 컨텍스트의 것인가 — 노드의 `.context`를 읽지 않는다 (컨텍스트를
 *  버리고 새로 만들면 옛 체인을 재사용하면 안 되고, 판정 근거를 모듈이 들고 있어야 한다) */
let masterCtx: AudioContext | null = null

function output(c: AudioContext): AudioNode {
  if (masterIn && masterCtx === c) return masterIn
  const input = c.createGain()
  input.gain.value = 1
  const limiter = c.createDynamicsCompressor()
  limiter.threshold.value = -2
  limiter.knee.value = 3
  limiter.ratio.value = 20
  limiter.attack.value = 0.003
  limiter.release.value = 0.1
  input.connect(limiter).connect(c.destination)
  masterIn = input
  masterCtx = c
  return input
}

function audioCtor(): Ctor | undefined {
  const w = window as Window & { webkitAudioContext?: Ctor }
  return window.AudioContext ?? w.webkitAudioContext
}

/**
 * 복구가 필요한 상태인가 (CC1).
 *
 * **`'suspended'`만 보면 안 된다.** iOS Safari는 앱 전환·전화·시리에서 컨텍스트를
 * 비표준 상태 **`'interrupted'`**로 떨어뜨린다. 복구 경로 세 곳이 전부
 * `state === 'suspended'`만 검사하고 있었고, 그래서 `interrupted`가 되면 소리가 죽은 채로
 * 남았다 — "앱 나갔다 오면 소리가 안 나고, 완전 종료 후 다시 켜면 난다"는 보고가
 * 정확히 이 상태다 (재시작하면 새 컨텍스트라 정상).
 *
 * `'closed'`는 제외한다 — resume으로 살아나지 않으므로 **재생성 대상**이다.
 *
 * 판정을 이 함수 하나로 모으는 이유: 세 곳이 각자 조건을 들고 있으면 다음에 또 한 곳만
 * 고쳐진다 (이번 결함이 정확히 그 형태다).
 */
export function needsResume(state: string | undefined | null): boolean {
  return state !== null && state !== undefined && state !== 'running' && state !== 'closed'
}

/**
 * 죽은 컨텍스트를 버린다 (CC1).
 *
 * **"죽은 컨텍스트를 붙들고 있는 것"이 지금의 실패 모드다.** resume이 거부되면 그
 * 컨텍스트로는 다시 소리가 나지 않으므로, 버리고 다음 사용자 제스처에서 새로 만든다
 * (세트 체크가 `unlockAudio()`를 부른다). 실패하는 방향이 "다음 제스처에서 복구"여야 한다.
 */
function discardContext(): void {
  const dead = ctx
  ctx = null
  // 마스터 체인은 컨텍스트에 묶여 있다 — 같이 버리지 않으면 죽은 그래프에 연결된다
  masterIn = null
  masterCtx = null
  void dead?.close().catch(() => undefined)
}

/** resume 시도 — 거부되면 컨텍스트를 버린다 (CC1) */
function tryResume(): void {
  if (!ctx || !needsResume(ctx.state)) return
  void ctx.resume().catch(() => discardContext())
}

/** 사용자 제스처 핸들러 안에서 호출해야 한다 */
export function unlockAudio(): void {
  const Ctor = audioCtor()
  if (!Ctor) return
  configureAudioSession()
  if (ctx && ctx.state === 'closed') discardContext()
  if (!ctx) {
    ctx = new Ctor()
    stats.created += 1
  }
  tryResume()
}

/**
 * 앱 복귀 — **resume을 기다리지 않고 버린다** (2026-08-27).
 *
 * CC1은 `interrupted` 판정을 고쳤지만 실기기에서 증상이 그대로였다("다른 앱 갔다가
 * 복귀하면 소리 안 나오는 건 아직도 그대로"). 원인이 두 겹이었다:
 *
 * ① **배선이 없었다.** `resumeAudio`를 부르는 곳이 `useRestTimer`의 visibilitychange
 *    하나뿐이었다 — **휴식 타이머가 떠 있는 동안에만** 복구가 돌았다. 세트 중이거나
 *    타이머가 없을 때 앱을 나갔다 오면 아무도 복구를 시도하지 않았다.
 * ② **resume이 성공해도 소리가 안 나는 경우가 있다.** iOS는 인터럽트 뒤 컨텍스트를
 *    살려는 주지만 출력 경로가 죽어 있는 사례가 알려져 있다. 그 상태를 붙들고 있으면
 *    "상태는 running인데 무음"이 되어 진단조차 어긋난다.
 *
 * 그래서 복귀 시에는 **resume을 시도하지 않고 곧바로 버린다.** 다음 사용자 제스처
 * (전역 pointerdown → `unlockAudio`)가 새 컨텍스트를 만든다. 새로 만든 컨텍스트는
 * 인터럽트 이력이 없어 확실히 살아 있다.
 *
 * 컨텍스트 누수 걱정: iOS는 동시 AudioContext 수를 제한하므로 **만들기 전에 닫는다**
 * (`discardContext`가 close를 부른다). 항상 최대 하나다.
 */
export function resumeAudio(): void {
  configureAudioSession()
  if (!ctx) return
  if (needsResume(ctx.state)) {
    stats.recreated += 1
    discardContext()
  }
}

/**
 * 전역 복구 배선 (2026-08-27). **App에서 한 번 부른다.**
 *
 * 두 경로를 함께 건다:
 *   - 복귀 신호(`visibilitychange`·`pageshow`) → 죽은 컨텍스트를 버린다
 *   - **모든 사용자 제스처(`pointerdown`)** → 필요하면 새로 만든다
 *
 * 제스처 경로가 핵심이다. iOS는 제스처 안에서만 컨텍스트를 확실히 열어 주는데,
 * 운동 중 사용자는 끊임없이 화면을 만진다 — 세트 체크든 스크롤이든. 그래서
 * "복귀 후 첫 터치"에 오디오가 살아난다. 상태가 `running`이면 비용은 조건 검사 하나다.
 *
 * `capture: true`인 이유: 앱 코드가 이벤트를 멈춰도 복구는 돌아야 한다.
 * `passive: true`는 스크롤 성능을 위해서다 (preventDefault를 부르지 않는다).
 */
export function installAudioRecovery(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') resumeAudio()
  }
  const onGesture = () => {
    if (ctx === null || needsResume(ctx.state)) unlockAudio()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onVisible)
  document.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onVisible)
    document.removeEventListener('pointerdown', onGesture, { capture: true })
  }
}

/*
 * ─── 볼륨 배율 (Z1 → 2026-08-27 재설계) ────────────────────
 *
 * 피드백: **"가장 크게 해도 작다. 폰 볼륨은 50%인데 더 올리면 노래가 너무 커진다."**
 *
 * 먼저 천장을 확인했다: v1.8의 실효 피크는 차임 0.36 × 2.2 = **0.79 / 1.0**이었다.
 * **게인으로 올릴 자리가 사실상 없었다** — 남은 헤드룸이 +2dB뿐이다. 그래서 이번에는
 * 피크가 아니라 **귀에 닿는 양**을 올린다. 네 가지가 실제 지렛대다:
 *
 *   1. **RMS** — 엔벨로프를 지수 감쇠에서 **유지(sustain) 구간**으로 바꿨다.
 *      지수 감쇠는 재생 시간의 대부분을 낮은 진폭으로 보낸다. 같은 피크에서
 *      평균 진폭이 2~3배(+6~10dB) 오른다. **이번 라운드에서 가장 큰 이득이다.**
 *   2. **하모닉** — 배음(2배·3배)을 얹으면 폰 스피커가 잘 내는 대역으로 에너지가
 *      퍼진다. 특히 템포 정지음(290Hz)처럼 낮은 음은 기본파가 스피커에서 −13dB
 *      손해를 보는데(W2 분석), 배음이 그 손실을 메운다. **음정은 그대로다** —
 *      기본파를 유지하므로 "높아진 소리"가 아니라 "두꺼워진 소리"다.
 *   3. **길이** — 틱 0.11초는 귀의 적분 창(~200ms)보다 짧아 손해를 봤다 (W2 표의
 *      "시간 적분 −4dB"). 0.18초로 늘렸다.
 *   4. **배율 상한** — 2.2 → 3.0. 리미터가 클리핑을 막으므로 올릴 수 있다.
 *
 * 앱이 넘을 수 없는 선도 분명히 해 둔다: **기기 볼륨과 무음 스위치는 앱 밖이다.**
 * 음악과 경쟁하는 문제의 나머지 절반은 iOS 오디오 세션(덕킹)이고, 그건 다른 앱 음악을
 * 건드리므로 **설정에서 켜는 선택지**로 뒀다 (`setDuckOthers`).
 */
export const VOLUME_SCALES = { normal: 1, loud: 1.8, max: 3 } as const
export type SoundVolume = keyof typeof VOLUME_SCALES

/** 기본값 `loud` — "지금도 들리는데 더 적극적이면 좋겠다"가 피드백이므로 기본 경험을 올린다 */
export const DEFAULT_SOUND_VOLUME: SoundVolume = 'loud'

let volumeScale: number = VOLUME_SCALES[DEFAULT_SOUND_VOLUME]

export function setVolumeScale(scale: number): void {
  // 음수·NaN이 들어오면 소리가 사라진다 — 잘못된 입력은 기본값으로 되돌린다
  volumeScale = Number.isFinite(scale) && scale > 0 ? scale : VOLUME_SCALES[DEFAULT_SOUND_VOLUME]
}

export function getVolumeScale(): number {
  return volumeScale
}

/**
 * 설정값 → 배율. 모르는 값은 기본값으로 (구버전 백업 복원 대비).
 * 이름에 `volume`을 붙인 이유: `progression.ts`에 무게 단위용 `scaleFor`가 이미 있다.
 */
export function volumeScaleFor(volume: string | undefined): number {
  return VOLUME_SCALES[(volume ?? '') as SoundVolume] ?? VOLUME_SCALES[DEFAULT_SOUND_VOLUME]
}

export interface ToneSpec {
  /** Hz */
  freq: number
  /** 초 */
  duration: number
  /** 시작 지연 (초) */
  delay?: number
  /** 0~1 */
  gain?: number
  type?: OscillatorType
}

/*
 * ─── 예약 취소 (CC2) ──────────────────────────────────────
 *
 * 피드백: "마지막 템포가이드 내림 후에도 1틱 사운드 남."
 *
 * 원인은 `tone()`이 `osc.start(at)`으로 **예약**한다는 것이다. delay가 있는 톤(차임 2·3음,
 * 마지막 큐 2음)과 방금 예약된 페이즈 소리는 시트를 닫아도 이미 오디오 그래프에 올라가
 * 있어 그대로 재생된다 — **React 정리는 오디오 예약을 취소하지 않는다.**
 *
 * 그래서 소리에 태그를 붙여 추적하고, 태그 단위로 취소한다. 태그를 나누는 이유는
 * 명확하다: 템포 가이드를 닫는 순간 **동시에 울리고 있을 수 있는 휴식 차임**을 건드리면
 * 안 된다 (자동 종료가 휴식을 시작시키므로 실제로 겹친다).
 */
export type SoundTag = 'tempo' | 'timer'

interface LiveNode {
  /** 기본파 + 배음들 (2026-08-27) — 하나의 소리가 여러 오실레이터로 만들어진다 */
  oscs: OscillatorNode[]
  env: GainNode
}

const live = new Map<SoundTag, Set<LiveNode>>()

function track(tag: SoundTag, node: LiveNode): void {
  const set = live.get(tag) ?? new Set<LiveNode>()
  set.add(node)
  live.set(tag, set)
  // 자연 종료한 노드는 목록에서 빠진다 — 안 빼면 세션 내내 자라는 누수가 된다.
  // 파셜이 여럿이어도 **소리 하나**이므로 기본파가 끝나면 그 소리가 끝난 것이다.
  node.oscs[0].onended = () => set.delete(node)
}

/**
 * 그 태그의 예약·재생 중 소리를 즉시 멈춘다 (CC2).
 *
 * 게인을 20ms 램프로 내린 뒤 정지한다 — 재생 중인 톤을 그냥 끊으면 클릭이 남고,
 * 그건 `tone()`이 엔벨로프를 한 곳에 모아 없앤 바로 그 문제다.
 * 아직 시작 시각이 오지 않은 노드는 `stop(now)`으로 **아예 울리지 않게** 된다
 * (Web Audio: stop 시각이 start 시각보다 앞이면 소리를 내지 않는다).
 */
export function cancelTag(tag: SoundTag): void {
  const set = live.get(tag)
  if (!set || !ctx) return
  const now = ctx.currentTime
  for (const node of set) {
    try {
      node.env.gain.cancelScheduledValues(now)
      node.env.gain.setValueAtTime(node.env.gain.value, now)
      node.env.gain.linearRampToValueAtTime(0.0001, now + 0.02)
      for (const osc of node.oscs) osc.stop(now + 0.03)
    } catch {
      /* 이미 끝난 노드에 stop을 부르면 던지는 구현이 있다 — 취소는 실패해도 조용해야 한다 */
    }
  }
  set.clear()
}

/**
 * 배음 구성 (2026-08-27) — `[주파수 배수, 진폭 비율]`.
 *
 * 사인파 단음은 폰 스피커에서 얇게 들린다. 배음을 얹으면 **음정은 그대로 두고**
 * 에너지를 스피커·귀가 잘 받는 대역으로 퍼뜨릴 수 있다 (오르간 스톱과 같은 원리).
 * 3배음까지만 쓴다 — 더 얹으면 사각파에 가까워져 거슬리고, CC7-R에서 확인했듯
 * **이 프로젝트는 거슬리는 소리를 되돌린 전력이 있다.**
 */
const PARTIALS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 0.45],
  [3, 0.2],
]

/**
 * 리미터에 들어가는 **입력 상한** (2026-08-27).
 *
 * per-tone 1.0 클램프를 없애고 리미터를 뒀지만, 상한 자체는 남긴다 — Web Audio의
 * `DynamicsCompressor`는 진짜 리미터가 아니라 소프트니 컴프레서라 **극단적인 입력은
 * 오버슈트**할 수 있다. 설정이 깨져 배율이 100이 되는 경우까지 방어한다.
 * 2.0이면 리미터 출력이 −1.6dB(≈0.83) 근처로 안착한다 (threshold −2 · ratio 20).
 */
const MAX_LEVEL = 2

/** 엔벨로프 (2026-08-27) — 어택·릴리스는 클릭 방지용 최소값이고 나머지는 **유지**다 */
const ATTACK_SEC = 0.008
const RELEASE_SEC = 0.03

/**
 * 톤 하나. 모든 소리가 이 함수를 지난다 — 게인 엔벨로프를 한 곳에 두면
 * 소리마다 클릭(급격한 진폭 변화) 여부가 갈리지 않는다.
 *
 * **컨텍스트가 정지 상태면 resume이 끝난 뒤에 예약한다** (2026-08-27).
 * 예전에는 `tryResume()`을 부르고 **곧바로** `ctx.currentTime` 기준으로 예약했다.
 * resume은 비동기라 그 시점 `currentTime`은 정지된 시계의 값이고, 재개된 뒤에는
 * 그 시각이 이미 과거다 — **복귀 후 첫 소리가 통째로 유실된다.** 사용자는 그 한 번으로
 * "소리가 안 난다"고 판정한다 (실제 보고가 그랬다).
 */
export function tone(
  { freq, duration, delay = 0, gain = 0.22, type = 'sine' }: ToneSpec,
  tag: SoundTag = 'timer',
): void {
  if (!ctx) {
    stats.droppedNoCtx += 1
    return
  }
  const c = ctx
  if (c.state === 'running') {
    schedule(c, { freq, duration, delay, gain, type }, tag)
    return
  }
  // 정지 상태 — 되살린 **뒤에** 예약한다 (시각을 다시 계산해야 한다)
  void c
    .resume()
    .then(() => {
      if (ctx !== c || c.state !== 'running') return
      stats.recovered += 1
      schedule(c, { freq, duration, delay, gain, type }, tag)
    })
    .catch(() => discardContext())
}

function schedule(
  c: AudioContext,
  { freq, duration, delay = 0, gain = 0.22, type = 'sine' }: ToneSpec,
  tag: SoundTag,
): void {
  // 볼륨 배율은 **여기 한 곳**에서만 적용된다 (Z1 — 위 주석 참조)
  const level = Math.min(MAX_LEVEL, gain * volumeScale)
  const at = c.currentTime + delay
  const env = c.createGain()

  /*
   * 유지(sustain) 엔벨로프 — 지수 감쇠를 버렸다 (2026-08-27).
   * 짧은 어택 → duration의 대부분을 최대 진폭으로 유지 → 짧은 릴리스.
   * 같은 피크에서 평균 진폭(=체감 음량)이 크게 오른다. 클릭은 어택·릴리스가 막는다.
   */
  const attack = Math.min(ATTACK_SEC, duration / 4)
  const release = Math.min(RELEASE_SEC, duration / 3)
  env.gain.setValueAtTime(0.0001, at)
  env.gain.linearRampToValueAtTime(level, at + attack)
  env.gain.setValueAtTime(level, at + Math.max(attack, duration - release))
  env.gain.linearRampToValueAtTime(0.0001, at + duration)
  env.connect(output(c))

  const oscs = PARTIALS.map(([mult, amp]) => {
    const osc = c.createOscillator()
    osc.type = type
    osc.frequency.value = freq * mult
    if (amp === 1) {
      osc.connect(env)
    } else {
      const part = c.createGain()
      part.gain.value = amp
      osc.connect(part).connect(env)
    }
    osc.start(at)
    osc.stop(at + duration + 0.02)
    return osc
  })
  track(tag, { oscs, env })
}

/*
 * ─── 신호 규격 (W2 조사 결과로 재설계) ─────────────────────────────────
 *
 * v1.2의 틱은 330Hz · 80ms · gain 0.16이었고 **실사용에서 들리지 않았다**
 * ("틱은 안 울리고 차임만 울린다"). 스케줄링은 정상이었다 — 재생 로직이 아니라
 * **음향 설계가 원인**이었다. 실효 음량을 계산해 차이를 확인했다:
 *
 *   | 요인 | 330Hz 80ms 틱 | 880/1320Hz 차임 |
 *   |---|---|---|
 *   | 폰 스피커 저역 롤오프 | **−13 dB** | −1.5 / −0.3 dB |
 *   | A-가중 (청감) | **−6 dB** | −0.4 / +0.7 dB |
 *   | 시간 적분 (귀는 ~200ms 창으로 적분) | **−4 dB** | −0.5 / 0 dB |
 *
 * 합계 **차임이 틱보다 약 31 dB 크다** (스피커 공진 가정 500~1000Hz 범위에서 26~36 dB).
 * 즉 게인을 올려도 못 넘는다 — 31 dB 중 23 dB가 **주파수와 길이**에서 온다.
 * 소형 스피커는 공진(수백 Hz) 아래로 12dB/oct 떨어지고, 80ms는 귀의 적분 창보다 짧다.
 *
 * "짧고 낮게 해서 차임과 구분한다"는 v1.2의 결정이 **구분은 성공하고 가청은 실패**했다.
 * 그래서 구분 근거를 **높이(pitch)에서 형태(단음 반복 vs 상행 3음)로 옮긴다** —
 * 둘 다 스피커가 잘 내는 대역에 두고, 틱은 늘 같은 음 하나, 차임은 올라가는 세 음이다.
 */

/** 카운트다운 틱 (G1) · 템포 가이드 카운트인 (G7) — 두 곳이 같은 소리를 써야 한다 */
export const TICK: ToneSpec = { freq: 784, duration: 0.18, gain: 0.42 }

/**
 * 휴식 종료 차임 (G1). **상행 3음** A5 → D6 → G6 (총 ~0.62초).
 * 음악 위로 뚫려야 하므로 고음역에 둔다 (음악 에너지는 저·중역에 몰려 있어 마스킹이 덜하다).
 */
export const CHIME: readonly ToneSpec[] = [
  { freq: 880, duration: 0.2, gain: 0.5 },
  { freq: 1175, duration: 0.2, delay: 0.2, gain: 0.5 },
  { freq: 1568, duration: 0.3, delay: 0.4, gain: 0.5 },
]

/**
 * 카운트다운 틱 (G1) · 템포 가이드 카운트인 (G7).
 *
 * **단음 하나** — 세 번 같은 음이 반복되는 것이 "아직 남았다"의 신호이고,
 * 올라가는 차임이 "끝났다"의 신호다. 형태로 구분한다 (위 규격 주석 참조).
 */
export function tick(tag: SoundTag = 'timer'): void {
  tone(TICK, tag)
}

/**
 * 마지막 사이클 큐 (W3) — **같은 음 두 번, 틱보다 높게.**
 *
 * 형태로 구분한다: 틱은 낮은 단음 하나, 이건 높은 단음 **둘**, 차임은 올라가는 셋.
 * "이번이 마지막"을 미리 알려야 자동 종료가 갑자기 끊기는 느낌이 되지 않는다.
 */
export const LAST_CYCLE_CUE: readonly ToneSpec[] = [
  { freq: 1319, duration: 0.1, gain: 0.42 },
  { freq: 1319, duration: 0.1, delay: 0.16, gain: 0.42 },
]

/** 마지막 사이클 큐 (W3). 고음 더블 — 틱·차임과 형태가 다르다 */
export function lastCycleCue(): void {
  // 템포 가이드의 소리이므로 'tempo' — 가이드를 닫으면 예약된 둘째 음도 취소된다 (CC2)
  for (const spec of LAST_CYCLE_CUE) tone(spec, 'tempo')
}

/** 휴식 종료 차임 (G1). 상행 3음 — 틱의 단음 반복과 형태가 다르다 */
export function chime(): void {
  for (const spec of CHIME) tone(spec)
}

/**
 * 볼륨 미리 듣기 (Z1) — **실제 신호를 그대로 낸다** (틱 3회 → 차임).
 *
 * 미리 듣기용 톤을 따로 만들지 않는다. 그러면 "미리 듣기는 잘 들리는데 실제는 안 들린다"가
 * 가능해지고, 그게 이 라운드에서 고치려는 문제와 같은 부류다.
 *
 * 휴식 타이머가 끝나기를 기다려 확인하는 구조면 설정을 고치는 데 세트 하나가 든다 —
 * 헬스장에서 음악 틀어둔 채 바로 고를 수 있어야 한다.
 */
export function previewSignals(): void {
  const spacing = 0.55
  for (let i = 0; i < 3; i += 1) tone({ ...TICK, delay: i * spacing })
  for (const spec of CHIME) tone({ ...spec, delay: (spec.delay ?? 0) + 3 * spacing })
}

/**
 * 템포 경계음 미리 듣기 (CC8-3 · CC7-R).
 *
 * 템포 톤은 게인 기준이 다르므로(0.21~0.27) 틱·차임만 들려주는 미리 듣기로는
 * "템포 소리가 충분히 큰가"를 판단할 수 없다. 여기서도 **실제 신호를 그대로** 낸다 —
 * 미리 듣기용 소리를 따로 만들면 "미리 듣기는 들리는데 실제는 안 들린다"가 가능해진다.
 *
 * A그룹 한 사이클(올림 1초 → 내림 2초)의 경계에서 나는 두 음을 그 간격대로 낸다.
 * 스펙은 `tempo.phaseTone`이 소유하고 이 함수는 호출부일 뿐이다 — 규격을 베끼면
 * 미리 듣기와 실제가 갈라진다 (v1.2에서 카운트인 틱이 그렇게 갈라질 뻔했다).
 */
export function previewTempoTones(
  specs: readonly { freq: number; duration: number; gain: number }[],
  gapSec: number,
): void {
  specs.forEach((spec, i) => tone({ ...spec, delay: i * gapSec }, 'tempo'))
}

/** iOS는 미지원. 지원하는 환경에서는 소리와 함께 진동도 준다 */
export function vibrate(pattern: number | number[] = [120, 60, 120]): void {
  navigator.vibrate?.(pattern)
}
