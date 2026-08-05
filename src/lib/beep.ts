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
export function configureAudioSession(): void {
  const nav = navigator as AudioSessionNavigator
  if (!nav.audioSession) return
  try {
    nav.audioSession.type = 'ambient'
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
  if (!ctx) ctx = new Ctor()
  tryResume()
}

/** 백그라운드에서 돌아오면 컨텍스트가 suspended·interrupted로 떨어져 있다 (CC1) */
export function resumeAudio(): void {
  configureAudioSession()
  tryResume()
}

/*
 * ─── 볼륨 배율 (Z1) ───────────────────────────────────────
 *
 * "노래 들으면서 쓰니 들리긴 하는데 좀 더 적극적이면 좋겠다"가 피드백이었다.
 *
 * **배율을 하나만 둔다.** 모든 소리가 `tone()`을 지나므로(W2에서 만든 초크포인트)
 * 이 한 곳이면 틱·차임·마지막 큐·템포 페이즈 톤이 전부 같이 커진다. 소리별 배율을
 * 따로 저장하지 않는 이유: "틱만 커지고 차임은 안 커지는" 갈라짐이 정확히 이 프로젝트가
 * 반복해서 고쳐 온 형태다.
 *
 * **CC8에서 게인과 배율을 함께 올렸다 — 단계를 더 만드는 것이 답이 아니었다.**
 * 백업의 `soundVolume`이 이미 `max`인데 "아직도 너무 작다"가 피드백이었다. W2 분석대로
 * 주파수·길이는 이미 스피커 유효 대역에 있으므로 남은 것은 게인 헤드룸뿐이다.
 *
 * 실효 피크 (사인파, `tone()`의 per-tone 1.0 클램프 유지):
 *   차임 0.36 × 2.2 = **0.79** (이전 0.26 × 1.8 = 0.47 → +4.6 dB)
 *   틱   0.30 × 2.2 = **0.66** (이전 0.20 × 1.8 = 0.36 → +5.3 dB)
 *
 * 차임 3음은 `delay`가 앞 음의 `duration`과 맞물려, 앞 음이 지수 감쇠 끝(0.0001)에 있을 때
 * 다음 음이 시작한다 — 합산 피크가 개별 피크를 넘지 않는다 (사인파는 클리핑 전까지
 * 왜곡이 없다). 클램프는 다음에 또 올릴 때의 방어로 남겨 둔다.
 */
export const VOLUME_SCALES = { normal: 1, loud: 1.5, max: 2.2 } as const
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
  osc: OscillatorNode
  env: GainNode
}

const live = new Map<SoundTag, Set<LiveNode>>()

function track(tag: SoundTag, node: LiveNode): void {
  const set = live.get(tag) ?? new Set<LiveNode>()
  set.add(node)
  live.set(tag, set)
  // 자연 종료한 노드는 목록에서 빠진다 — 안 빼면 세션 내내 자라는 누수가 된다
  node.osc.onended = () => set.delete(node)
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
      node.osc.stop(now + 0.03)
    } catch {
      /* 이미 끝난 노드에 stop을 부르면 던지는 구현이 있다 — 취소는 실패해도 조용해야 한다 */
    }
  }
  set.clear()
}

/**
 * 톤 하나. 모든 소리가 이 함수를 지난다 — 게인 엔벨로프를 한 곳에 두면
 * 소리마다 클릭(급격한 진폭 변화) 여부가 갈리지 않는다.
 */
export function tone(
  { freq, duration, delay = 0, gain = 0.22, type = 'sine' }: ToneSpec,
  tag: SoundTag = 'timer',
): void {
  if (!ctx) return
  // 복구 판정은 needsResume 하나를 지난다 (CC1) — suspended만 보면 interrupted를 놓친다
  tryResume()
  if (!ctx) return

  // 볼륨 배율은 **여기 한 곳**에서만 적용된다 (Z1 — 위 주석 참조)
  const level = Math.min(1, gain * volumeScale)
  const at = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  // 시작·끝을 램프로 감싸 클릭 노이즈를 없앤다
  env.gain.setValueAtTime(0.0001, at)
  env.gain.linearRampToValueAtTime(level, at + Math.min(0.02, duration / 4))
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(env).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration + 0.02)
  track(tag, { osc, env })
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
export const TICK: ToneSpec = { freq: 784, duration: 0.11, gain: 0.3 }

/**
 * 휴식 종료 차임 (G1). **상행 3음** A5 → D6 → G6 (총 ~0.62초).
 * 음악 위로 뚫려야 하므로 고음역에 둔다 (음악 에너지는 저·중역에 몰려 있어 마스킹이 덜하다).
 */
export const CHIME: readonly ToneSpec[] = [
  { freq: 880, duration: 0.18, gain: 0.36 },
  { freq: 1175, duration: 0.18, delay: 0.18, gain: 0.36 },
  { freq: 1568, duration: 0.26, delay: 0.36, gain: 0.36 },
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
  { freq: 1319, duration: 0.07, gain: 0.3 },
  { freq: 1319, duration: 0.07, delay: 0.12, gain: 0.3 },
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
