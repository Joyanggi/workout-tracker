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

/** 사용자 제스처 핸들러 안에서 호출해야 한다 */
export function unlockAudio(): void {
  const Ctor = audioCtor()
  if (!Ctor) return
  configureAudioSession()
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
}

/** 백그라운드에서 돌아오면 컨텍스트가 suspended로 떨어져 있다 */
export function resumeAudio(): void {
  configureAudioSession()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
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
 * 상한 1.8인 이유: 가장 큰 CHIME 0.26 × 1.8 = 0.47이고, 인접 톤의 램프가 겹쳐도
 * 피크가 1.0을 넘지 않는다 (사인파는 클리핑 전까지 왜곡이 없다).
 * `tone()`에서 한 번 더 1로 클램프해 두는 것은 미래에 게인을 올릴 때의 방어다.
 */
export const VOLUME_SCALES = { normal: 1, loud: 1.4, max: 1.8 } as const
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

/**
 * 톤 하나. 모든 소리가 이 함수를 지난다 — 게인 엔벨로프를 한 곳에 두면
 * 소리마다 클릭(급격한 진폭 변화) 여부가 갈리지 않는다.
 */
export function tone({ freq, duration, delay = 0, gain = 0.22, type = 'sine' }: ToneSpec): void {
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

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
export const TICK: ToneSpec = { freq: 784, duration: 0.11, gain: 0.2 }

/**
 * 휴식 종료 차임 (G1). **상행 3음** A5 → D6 → G6 (총 ~0.62초).
 * 음악 위로 뚫려야 하므로 고음역에 둔다 (음악 에너지는 저·중역에 몰려 있어 마스킹이 덜하다).
 */
export const CHIME: readonly ToneSpec[] = [
  { freq: 880, duration: 0.18, gain: 0.26 },
  { freq: 1175, duration: 0.18, delay: 0.18, gain: 0.26 },
  { freq: 1568, duration: 0.26, delay: 0.36, gain: 0.26 },
]

/**
 * 카운트다운 틱 (G1) · 템포 가이드 카운트인 (G7).
 *
 * **단음 하나** — 세 번 같은 음이 반복되는 것이 "아직 남았다"의 신호이고,
 * 올라가는 차임이 "끝났다"의 신호다. 형태로 구분한다 (위 규격 주석 참조).
 */
export function tick(): void {
  tone(TICK)
}

/**
 * 마지막 사이클 큐 (W3) — **같은 음 두 번, 틱보다 높게.**
 *
 * 형태로 구분한다: 틱은 낮은 단음 하나, 이건 높은 단음 **둘**, 차임은 올라가는 셋.
 * "이번이 마지막"을 미리 알려야 자동 종료가 갑자기 끊기는 느낌이 되지 않는다.
 */
export const LAST_CYCLE_CUE: readonly ToneSpec[] = [
  { freq: 1319, duration: 0.07, gain: 0.22 },
  { freq: 1319, duration: 0.07, delay: 0.12, gain: 0.22 },
]

/** 마지막 사이클 큐 (W3). 고음 더블 — 틱·차임과 형태가 다르다 */
export function lastCycleCue(): void {
  for (const spec of LAST_CYCLE_CUE) tone(spec)
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

/** iOS는 미지원. 지원하는 환경에서는 소리와 함께 진동도 준다 */
export function vibrate(pattern: number | number[] = [120, 60, 120]): void {
  navigator.vibrate?.(pattern)
}
