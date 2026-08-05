import { useEffect, useRef, useState } from 'react'
import { cancelTag, lastCycleCue, tick, tone, unlockAudio } from '../lib/beep'
import {
  BREATH_LABEL,
  PHASE_LABEL,
  cycleSeconds,
  phaseTone,
  tempoPositionAt,
  tempoRepState,
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
 *
 * **상단(`repMax`) 도달 시 스스로 끝낸다 (W3)** — 인클라인 6~10회에서 30회를 넘어도
 * 계속 돌던 것이 실사용 피드백이었다. 자동 종료는 반복수 기록 → 세트 체크 →
 * 휴식 타이머까지 이어지므로 사용자 탭이 0회다.
 *
 * 두 종료 경로의 **기록 신뢰도가 다르다** (동작은 Z2에서 같아졌다):
 * - 자동 = 상단까지 완주했으므로 `repMax`와 정확히 일치한다
 * - 수동 = 사이클 수에서 추정한 값이다. 그래서 라벨에 "약"을 붙인다 (V1).
 *   가이드보다 느리게 하거나 시트를 열어둔 채 쉬면 실제 반복보다 많이 세어진다.
 *
 * **신뢰도는 다르지만 이어지는 동작은 같다** — 둘 다 기록·체크·휴식까지 간다.
 * 수동 종료가 예외 경로가 아니라 문서 13장이 규정한 정상 종료 신호이기 때문이다.
 */
export default function TempoGuideSheet({
  exerciseName,
  setNumber,
  routineExercise,
  phases,
  onDone,
  onComplete,
  onClose,
}: {
  exerciseName: string
  setNumber: number
  routineExercise: RoutineExercise
  /**
   * 이 세트의 템포 (CC5·CC16). **호출부가 정한다** — 종목 오버라이드(레그 컬 1-1-2)와
   * A그룹 이완 설정(1.5/2초)이 갈리는 자리를 한 곳으로 모으기 위해서다.
   * 시트가 `TEMPO[group]`을 직접 읽으면 그 갈림이 두 곳이 된다.
   */
  phases: TempoPhase[]
  /**
   * 수동 종료 — 사이클 수에서 **추정한** 반복수.
   * Z2부터 자동 종료와 **같은 체인**을 탄다 (기록 + 체크 + 휴식). 호출부가 처리한다.
   */
  onDone: (reps: number) => void
  /** 상단 도달 자동 종료 (W3) — 값이 `repMax`와 정확히 일치한다는 점만 다르다 */
  onComplete: (reps: number) => void
  onClose: () => void
}) {
  const [startedAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const lastIndex = useRef<number | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  /** 자동 종료·마지막 큐를 각각 한 번만 발화시킨다 (프레임마다 재발화 금지) */
  const fired = useRef({ complete: false, lastCycle: false })

  /*
   * 시트를 여는 탭이 제스처다 — 여기서 컨텍스트를 열어야 이후 톤이 울린다.
   *
   * 언마운트에서 **예약된 템포 소리를 취소한다** (CC2). `tone()`은 오디오 그래프에
   * 예약하므로 React가 정리해도 이미 올라간 소리는 그대로 울린다 —
   * "가이드를 내린 뒤에도 1틱 남는다"가 그 증상이었다.
   * 태그가 'tempo'라 **동시에 울릴 수 있는 휴식 차임은 건드리지 않는다.**
   */
  useEffect(() => {
    unlockAudio()
    return () => cancelTag('tempo')
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
  const rep = tempoRepState(pos, routineExercise.repMax)

  /*
   * 마지막 사이클 큐 (W3). 자동 종료가 갑자기 끊기는 느낌이 되지 않도록 미리 알린다.
   * 고음 더블 틱 + 링 색 변화 — 소리를 못 듣는 상황(무음 스위치)에서도 보이게 둘 다 쓴다.
   */
  useEffect(() => {
    if (!rep.lastCycle || fired.current.lastCycle) return
    fired.current.lastCycle = true
    lastCycleCue()
  }, [rep.lastCycle])

  /*
   * 상단 도달 자동 종료 (W3). **정확히 한 번** — 80ms 프레임마다 다시 부르면
   * 세트 체크가 토글되어 방금 시작한 휴식 타이머가 꺼진다.
   */
  useEffect(() => {
    if (!rep.complete || fired.current.complete) return
    fired.current.complete = true
    onComplete(rep.reps)
    onClose()
  }, [rep.complete, rep.reps, onComplete, onClose])

  // 페이즈 경계에서만 소리를 낸다
  useEffect(() => {
    if (lastIndex.current === pos.phaseIndex) return
    lastIndex.current = pos.phaseIndex
    if (pos.countIn !== null) {
      // 휴식 타이머 카운트다운과 **같은 함수**를 쓴다. v1.2는 여기에 톤 규격을 손으로
      // 베껴 적어 뒀는데, W2에서 틱 주파수를 고치자 이쪽만 옛 소리로 남을 상황이었다
      tick('tempo')
      return
    }
    /*
      페이즈 경계 단발음 (CC7-R). 연속 글라이드는 실기기에서 "사이렌 같다"로 기각됐고,
      후보 5종을 들려준 결과 "글라이드가 없었던 버전이 최선"이 판정이었다.

      태그는 `'tempo'`다 (CC2) — 가이드를 닫으면 예약된 이 소리도 함께 취소된다.
      "가이드 내린 뒤에도 1틱 남는다"는 결함은 글라이드 이전부터 있었고, 되돌린 경계음도
      같은 방어를 받아야 한다.
    */
    if (pos.phase) tone(phaseTone(pos.phase), 'tempo')
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
        <div className={`tempo-progress${rep.lastCycle ? ' tempo-progress-last' : ''}`}>
          {rep.currentRep} / 최대 {routineExercise.repMax}회{rep.lastCycle && ' · 마지막'}
        </div>

        <div className="tempo-stage">
          <div
            className={`tempo-ring tempo-ring-${pos.phase?.kind ?? 'idle'}${
              rep.lastCycle ? ' tempo-ring-last' : ''
            }`}
            style={{ transform: `scale(${scale.toFixed(3)})` }}
            aria-hidden="true"
          />
          <div className="tempo-center">
            {pos.countIn !== null ? (
              <span className="tempo-count">{pos.countIn}</span>
            ) : (
              <>
                <span className="tempo-phase">{pos.phase ? PHASE_LABEL[pos.phase.kind] : ''}</span>
                {/*
                  호흡 안내 (CC4). 원리는 "힘쓸 때 내쉰다" 하나 — 원본은 문서 3장 표의
                  호흡 열이다. 대칭 호흡(3초 들숨/3초 날숨)이 아니라는 것이 요점이다.
                */}
                <span className="tempo-breath">
                  {pos.phase ? BREATH_LABEL[pos.phase.kind] : ''}
                </span>
                {/*
                  진행 회차를 보여준다 (완료 수가 아니다) — 완료 수만 보여주면 10회짜리에서
                  마지막에 보이는 숫자가 9다. "회째"로 적어 종료 라벨의 "약 N회"와 구분한다.
                */}
                <span className="tempo-reps">{rep.currentRep}회째</span>
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
            onDone(rep.reps)
            onClose()
          }}
        >
          {/*
            "약"을 붙이는 이유 (V1): 이 값은 실제 반복이 아니라 **가이드가 돈 사이클 수**다.
            가이드보다 느리게 하거나 시트를 열어둔 채 쉬면 실제보다 많이 세어진다.
            자동 종료(상단 도달)는 정확한 값이므로 이 경로를 지나지 않는다.
          */}
          {pos.countIn !== null ? '취소' : `종료 — 약 ${rep.reps}회 기록 · 휴식 시작`}
        </button>
        <div style={{ height: 8 }} />
        <p className="row-sub">
          최대 {routineExercise.repMax}회에 닿으면 자동으로 기록하고 휴식이 시작됩니다.
          마지막 2~3회에서 리듬을 못 따라가기 시작하면 그게 세트 종료 신호입니다 (문서 13장) —
          그때는 먼저 종료하세요. 화면이 꺼지면 가이드도 멈춥니다 (iOS PWA 제약).
        </p>
      </div>
    </div>
  )
}
