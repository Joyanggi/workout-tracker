import { useCallback, useEffect, useRef, useState } from 'react'
import { chime, resumeAudio, tick, vibrate } from './beep'

const STORAGE_KEY = 'workout-tracker.restTimer'
const TICK_MS = 250

/** 이 초부터 카운트다운 틱을 울린다 (G1) */
export const COUNTDOWN_FROM_SEC = 3

/**
 * 지금 울려야 하는 카운트다운 초. 아니면 null.
 *
 * **남은 시간에서 파생시킨다** — 카운터를 누적하면 화면이 잠긴 동안 밀린 틱이
 * 복귀 순간 몰아서 울린다 (타이머 자체를 endTime 기준으로 만든 것과 같은 이유).
 */
export function countdownSecond(remainingMs: number): number | null {
  if (remainingMs <= 0) return null
  const sec = Math.ceil(remainingMs / 1000)
  return sec <= COUNTDOWN_FROM_SEC ? sec : null
}

/**
 * 카운트다운 틱 발화 판정기 (W2 조사에서 뽑아냈다).
 *
 * 훅 안의 useEffect에 있던 판정을 **순수 함수로 꺼냈다** — 화면 없이 "90초 타이머에서
 * 틱이 정말 3·2·1 세 번 울리는가"를 실제 코드로 돌려볼 수 있어야 했다.
 * (W2 증상은 "틱이 안 울린다"였고, 원인이 스케줄링인지 음향인지 가리는 것이 조사의 핵심이었다)
 *
 * `endTime`이 바뀌면 발화 이력을 리셋하고, 같은 초는 두 번 울리지 않는다.
 * **현재 초 하나만** 울린다 — 화면이 꺼져 있다가 남은 1초에 복귀하면 3·2를 소급하지 않는다.
 */
export function createCountdownTicker(): (endTime: number, remainingMs: number) => number | null {
  let forEndTime: number | null = null
  const fired = new Set<number>()
  return (endTime, remainingMs) => {
    const sec = countdownSecond(remainingMs)
    if (sec === null) return null
    if (forEndTime !== endTime) {
      forEndTime = endTime
      fired.clear()
    }
    if (fired.has(sec)) return null
    fired.add(sec)
    return sec
  }
}

export interface Persisted {
  endTime: number
  totalSec: number
  label: string
}

/**
 * 이미 끝난 타이머에 +30초를 누르면 **지금부터** 30초여야 한다.
 * 지나간 endTime에 그냥 더하면 (예: 2분 전에 끝난 타이머 + 30초) 여전히 과거라
 * 누르는 순간 다시 "휴식 완료"가 된다.
 */
export function extendEndTime(endTime: number, now: number, addSec: number): number {
  return Math.max(endTime, now) + addSec * 1000
}

/**
 * 아직 진행 중인 타이머만 복원한다. 지나간 타이머를 "완료" 상태로 되살리면
 * 어제 세션의 알림이 오늘 앱을 열 때 뜬다.
 */
export function isRestorable(p: Persisted, now: number): boolean {
  return p.endTime > now
}

export interface RestTimer {
  /** 카운트다운 중 */
  running: boolean
  /** 0에 도달했고 아직 닫지 않음 */
  finished: boolean
  remainingSec: number
  totalSec: number
  label: string
  start: (seconds: number, label: string) => void
  addSeconds: (seconds: number) => void
  dismiss: () => void
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Persisted
    return isRestorable(parsed, Date.now()) ? parsed : null
  } catch {
    return null
  }
}

function save(value: Persisted | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 프라이빗 모드 등에서 실패해도 타이머 자체는 동작해야 한다 */
  }
}

/**
 * 휴식 타이머 (DESIGN.md §5.2).
 *
 * **남은 초를 감소시키지 않고 종료 시각(endTime)을 저장한 뒤 매 틱마다 재계산한다.**
 * iOS PWA는 화면이 잠기면 JS가 멈춘다. 카운터를 깎는 방식이면 잠긴 동안 시간이 흐르지 않아
 * 복귀했을 때 남은 시간이 실제보다 길게 표시된다. 타임스탬프 기준이면 복귀 즉시 정확하다.
 */
export function useRestTimer(): RestTimer {
  const [state, setState] = useState<Persisted | null>(load)
  const [now, setNow] = useState(() => Date.now())
  /** 이 endTime에 대해 알림을 이미 울렸는가 (중복 방지) */
  const notified = useRef<number | null>(null)
  /** 카운트다운 틱 발화 판정 (중복·소급 방지). 판정 규칙은 순수 함수에 있다 */
  const countdown = useRef(createCountdownTicker())

  // state → localStorage 단방향 미러링. 쓰기가 한 곳이라 중복·역전이 없다
  useEffect(() => {
    save(state)
  }, [state])

  const remainingMs = state ? Math.max(0, state.endTime - now) : 0
  const running = state !== null && remainingMs > 0
  const finished = state !== null && remainingMs === 0

  // 진행 중일 때만 틱을 돈다
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [running])

  // 화면 복귀 시 즉시 재계산 (틱을 기다리며 최대 250ms 낡은 값을 보여주지 않도록)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      resumeAudio()
      setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  /*
   * 카운트다운 틱 (G1). 3·2·1초에 각 1회. 판정은 `createCountdownTicker`가 한다.
   *
   * **템포 가이드 설정과 무관하다** — 이 경로에 설정을 읽는 코드가 없다.
   * W2에서 "가이드를 켜면 틱이 들리는 것 같다"는 보고가 있었고 플래그 공유를 의심했지만,
   * 원인은 음향(330Hz·80ms가 폰 스피커에서 안 들림)이었다 (`beep.ts` 규격 주석).
   * 이 사실은 `audioIndependence.test.ts`가 소스 스캔으로 지킨다.
   */
  useEffect(() => {
    if (!state) return
    if (document.visibilityState !== 'visible') return
    if (countdown.current(state.endTime, remainingMs) !== null) tick()
  }, [state, remainingMs])

  // 0 도달 알림. 화면이 켜져 있을 때만 (§5.2)
  useEffect(() => {
    if (!state || remainingMs > 0) return
    if (notified.current === state.endTime) return
    notified.current = state.endTime
    if (document.visibilityState === 'visible') {
      chime()
      vibrate()
    }
  }, [state, remainingMs])

  const start = useCallback((seconds: number, label: string) => {
    notified.current = null
    setState({ endTime: Date.now() + seconds * 1000, totalSec: seconds, label })
    setNow(Date.now())
  }, [])

  // updater 안에서 save/notified를 만지면 StrictMode 이중 호출로 두 번 실행된다.
  // 계산만 updater에서 하고 저장은 effect가 담당한다.
  const addSeconds = useCallback((seconds: number) => {
    notified.current = null
    setState((prev) =>
      prev
        ? {
            ...prev,
            endTime: extendEndTime(prev.endTime, Date.now(), seconds),
            totalSec: prev.totalSec + seconds,
          }
        : prev,
    )
    setNow(Date.now())
  }, [])

  const dismiss = useCallback(() => {
    setState(null)
  }, [])

  return {
    running,
    finished,
    remainingSec: Math.ceil(remainingMs / 1000),
    totalSec: state?.totalSec ?? 0,
    label: state?.label ?? '',
    start,
    addSeconds,
    dismiss,
  }
}
