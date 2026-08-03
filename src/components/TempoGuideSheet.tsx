import { useEffect, useRef, useState } from 'react'
import { tick, tone, unlockAudio } from '../lib/beep'
import {
  PHASE_LABEL,
  TEMPO,
  cycleSeconds,
  phaseTone,
  tempoPositionAt,
  type TempoPhase,
} from '../lib/tempo'
import type { RoutineExercise } from '../types'

const FRAME_MS = 80

/**
 * 템포 가이드 (G7) — 명상앱 호흡 가이드 방식.
 *
 * **페이즈 타이밍을 경과 시간에서 파생**한다 (`tempoPositionAt`). 프레임마다 카운터를
 * 더하면 화면이 잠긴 동안 시간이 멈추고 복귀 시 밀린 페이즈가 몰아서 재생된다 —
 * 휴식 타이머를 endTime 방식으로 만든 것과 같은 이유다.
 *
 * 소리는 `phaseIndex`가 바뀌는 순간에만 낸다 (프레임마다 재생 금지).
 *
 * 종료하면 **카운트된 반복수를 그 세트에 자동 입력**한다 — 가이드가 기록 마찰을
 * 오히려 줄여야 한다. 수정은 스테퍼로 언제든 가능하다.
 */
export default function TempoGuideSheet({
  exerciseName,
  setNumber,
  routineExercise,
  onDone,
  onClose,
}: {
  exerciseName: string
  setNumber: number
  routineExercise: RoutineExercise
  /** 카운트된 반복수를 그 세트에 넣는다 */
  onDone: (reps: number) => void
  onClose: () => void
}) {
  const phases: TempoPhase[] = TEMPO[routineExercise.group]
  const [startedAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const lastIndex = useRef<number | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  // 시트를 여는 탭이 제스처다 — 여기서 컨텍스트를 열어야 이후 톤이 울린다
  useEffect(() => {
    unlockAudio()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), FRAME_MS)
    return () => window.clearInterval(id)
  }, [startedAt])

  /*
   * Screen Wake Lock (iOS 16.4+). 실패는 무시한다 — 화면이 꺼지면 가이드도 멈추는 것이
   * 플랫폼 제약이고(휴식 알림 T6과 같은 이유), 그 사실은 아래 안내 문구가 말한다.
   */
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    let cancelled = false
    void nav.wakeLock
      ?.request('screen')
      .then((lock) => {
        if (cancelled) void lock.release()
        else wakeLock.current = lock
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      void wakeLock.current?.release().catch(() => undefined)
      wakeLock.current = null
    }
  }, [])

  const pos = tempoPositionAt(elapsed, phases)

  // 페이즈 경계에서만 소리를 낸다
  useEffect(() => {
    if (lastIndex.current === pos.phaseIndex) return
    lastIndex.current = pos.phaseIndex
    if (pos.countIn !== null) {
      // 휴식 타이머 카운트다운과 **같은 함수**를 쓴다. v1.2는 여기에 톤 규격을 손으로
      // 베껴 적어 뒀는데, W2에서 틱 주파수를 고치자 이쪽만 옛 소리로 남을 상황이었다
      tick()
      return
    }
    if (pos.phase) tone(phaseTone(pos.phase))
  }, [pos.phaseIndex, pos.countIn, pos.phase])

  /**
   * 링 크기 — 수축에서 커지고 이완에서 작아진다. 정지 구간은 유지한다.
   * 호흡 가이드와 같은 방식으로, 숫자를 읽지 않고도 방향을 알 수 있어야 한다.
   */
  const scale = (() => {
    if (!pos.phase) return 0.5
    const t = pos.phaseProgress
    switch (pos.phase.kind) {
      case 'concentric':
        return 0.5 + 0.5 * t
      case 'eccentric':
        return 1 - 0.5 * t
      case 'squeeze':
        return 1
      case 'stretch':
        return 0.5
    }
  })()

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="템포 가이드"
      >
        <div className="sheet-grip" />
        <div className="card-label">
          템포 가이드 · {exerciseName} {setNumber}세트
        </div>

        <div className="tempo-stage">
          <div
            className={`tempo-ring tempo-ring-${pos.phase?.kind ?? 'idle'}`}
            style={{ transform: `scale(${scale.toFixed(3)})` }}
            aria-hidden="true"
          />
          <div className="tempo-center">
            {pos.countIn !== null ? (
              <span className="tempo-count">{pos.countIn}</span>
            ) : (
              <>
                <span className="tempo-phase">{pos.phase ? PHASE_LABEL[pos.phase.kind] : ''}</span>
                <span className="tempo-reps">{pos.reps}회</span>
              </>
            )}
          </div>
        </div>

        <p className="row-sub" style={{ textAlign: 'center' }}>
          {routineExercise.group}그룹 · 한 사이클 {cycleSeconds(phases)}초 (
          {phases.map((p) => `${PHASE_LABEL[p.kind]} ${p.seconds}`).join(' · ')})
        </p>

        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          onClick={() => {
            onDone(pos.reps)
            onClose()
          }}
        >
          {pos.countIn !== null ? '취소' : `종료 — ${pos.reps}회로 기록`}
        </button>
        <div style={{ height: 8 }} />
        <p className="row-sub">
          마지막 2~3회에서 리듬을 못 따라가기 시작하면 그게 세트 종료 신호입니다 (문서 13장).
          화면이 꺼지면 가이드도 멈춥니다 — iOS PWA의 제약입니다.
        </p>
      </div>
    </div>
  )
}
