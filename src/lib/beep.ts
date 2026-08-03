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

/** 이 환경이 오디오 세션 종류를 지정할 수 있는가 (설정 화면 진단용) */
export function audioSessionSupported(): boolean {
  return (navigator as AudioSessionNavigator).audioSession !== undefined
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

  const at = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  // 시작·끝을 램프로 감싸 클릭 노이즈를 없앤다
  env.gain.setValueAtTime(0.0001, at)
  env.gain.linearRampToValueAtTime(gain, at + Math.min(0.02, duration / 4))
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(env).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration + 0.02)
}

/**
 * 카운트다운 틱 (G1) · 템포 가이드 카운트인 (G7).
 * **짧고 낮게** — 종료 차임과 소리만으로 구분돼야 한다.
 */
export function tick(): void {
  tone({ freq: 330, duration: 0.08, gain: 0.16 })
}

/**
 * 휴식 종료 차임 (G1). 상행 2음 — "완전 종료"가 틱과 명확히 다르게 들려야 한다.
 * 틱이 낮고 짧은 단음이므로 이쪽은 높고 길고 두 음이다.
 */
export function chime(): void {
  tone({ freq: 880, duration: 0.18 })
  tone({ freq: 1320, duration: 0.26, delay: 0.18 })
}

/** iOS는 미지원. 지원하는 환경에서는 소리와 함께 진동도 준다 */
export function vibrate(pattern: number | number[] = [120, 60, 120]): void {
  navigator.vibrate?.(pattern)
}
