import { useState } from 'react'
import { unlockAudio } from '../lib/beep'
import { mmss } from '../lib/dates'

/**
 * 휴식 타이머 단독 시작 (CC3).
 *
 * 피드백: "휴식시간만 단독으로 타이머 기능 킬 수 있으면 좋겠음."
 *
 * **새 타이머 개념을 만들지 않는다.** App이 소유한 `useRestTimer` 하나를 그대로 쓰고
 * (Z5에서 단일 소유로 정리한 그것), 이 시트는 `start(sec, label)`을 부르는 진입점일 뿐이다.
 * 두 번째 타이머를 만들면 "어느 타이머의 차임인가"가 생긴다.
 *
 * 홈·다른 탭에는 넣지 않는다 — 사용 맥락이 세션 중(자리 이동, 스트레칭)이다.
 * 세션 밖 요구가 나오면 그때 진입점을 늘린다.
 */

/** 프리셋 — 루틴의 휴식 규정(60~180초) 범위를 덮는다 */
export const TIMER_PRESETS = [60, 90, 120, 150, 180] as const

export default function ManualTimerSheet({
  /** 열려 있는 종목의 휴식 초 — 기본 선택 (지금 하려는 것이 대개 그 휴식이다) */
  defaultSec,
  /** 기본 선택의 출처를 라벨에 쓴다 ("인클라인 프레스 휴식") */
  defaultLabel,
  onStart,
  onClose,
}: {
  defaultSec?: number
  defaultLabel?: string
  onStart: (seconds: number, label: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<number>(defaultSec ?? 90)

  const startNow = () => {
    /*
      시트의 탭이 제스처다 — 여기서 컨텍스트를 열어야 90초 뒤 차임이 울린다
      (`beep.ts` 주석: iOS는 제스처 없이 AudioContext를 시작할 수 없다).
    */
    unlockAudio()
    const isDefault = defaultSec !== undefined && selected === defaultSec && defaultLabel
    onStart(selected, isDefault ? `${defaultLabel} 휴식` : '휴식')
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="휴식 타이머">
        <div className="sheet-grip" />
        <div className="card-label">휴식 타이머</div>
        <p className="row-sub" style={{ whiteSpace: 'normal' }}>
          세트 체크와 무관하게 시작합니다. 시작한 뒤에는 바에서 ±30초·건너뛰기가 됩니다.
        </p>

        <div className="segment" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {TIMER_PRESETS.map((sec) => (
            <button key={sec} aria-pressed={selected === sec} onClick={() => setSelected(sec)}>
              {mmss(sec)}
              {sec === defaultSec && (
                <span className="row-sub" style={{ marginLeft: 4 }}>
                  기본
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 종목 휴식이 프리셋에 없는 값이면 그 값도 고를 수 있어야 한다 */}
        {defaultSec !== undefined && !TIMER_PRESETS.includes(defaultSec as never) && (
          <button
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            aria-pressed={selected === defaultSec}
            onClick={() => setSelected(defaultSec)}
          >
            {defaultLabel ? `${defaultLabel} · ` : ''}
            {mmss(defaultSec)} (기본)
          </button>
        )}

        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={startNow}>
          {mmss(selected)} 시작
        </button>
        <div style={{ height: 8 }} />
        <button className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
