import { useRef, useState } from 'react'
import { stepDown, stepUp } from '../lib/weightScale'
import { isTap, type TapPoint } from '../lib/tapJudge'
import { NO_AUTOFILL } from '../lib/inputProps'

/**
 * 입력 중 허용 패턴 (T2).
 *
 * 커밋(blur)·스테퍼 증감 시점에는 이미 `Math.round(×100)/100`으로 2자리 반올림하지만,
 * **타이핑 중에는 자유 텍스트**여서 "40.123456"이 그대로 보이고 횟수 필드에도
 * 소수점을 넣을 수 있었다. 반올림은 그대로 두고(이중 방어) 입력 자체를 막는다.
 *
 * 빈 문자열을 허용해야 한다 — 전체 선택 후 지우고 다시 입력하는 흐름이 막히면 안 된다.
 */
const PATTERNS: Record<0 | 2, RegExp> = {
  2: /^$|^\d{0,4}([.,]\d{0,2})?$/,
  0: /^$|^\d{0,4}$/,
}

export function isAllowedInput(text: string, decimals: 0 | 2): boolean {
  return PATTERNS[decimals].test(text)
}

/**
 * 숫자 입력 + **뗄 때 1스텝** 스테퍼 (DESIGN.md §5.2, CC12에서 개정).
 *
 * 롱프레스 가속 반복을 **없앴다.** 설계 가정은 "큰 점프를 빠르게"였는데 실사용 환경
 * (땀·장갑·기구 사이 이동 중 오터치)에서는 가속이 오터치를 증폭했다 — 복구 비용이
 * 이득보다 크다는 것이 피드백이었다. 큰 점프는 가운데 직접 입력이 담당한다.
 *
 * 판정은 `tapJudge.isTap` 한 곳에 있다 (슬롭 초과·버튼 밖 릴리즈·pointercancel = 무발화).
 * 직접 입력도 가능하다. 입력 필드 font-size는 16px 이상이어야 iOS가 자동 줌하지 않는다.
 */
export default function NumberStepper({
  value,
  step,
  min = 0,
  max = 9999,
  onChange,
  ariaLabel,
  /** 소수점 허용 자리수. 무게는 2, 횟수는 0 (§T2) */
  decimals = 0,
  /**
   * 불규칙 스택의 핀 값 (T9). 있으면 ±가 `step`이 아니라 이웃 핀으로 이동한다.
   * 직접 입력은 여전히 자유다 — 사다리는 ± 버튼에만 적용된다.
   */
  ladder,
}: {
  value: number
  step: number
  min?: number
  max?: number
  onChange: (next: number) => void
  ariaLabel: string
  decimals?: 0 | 2
  ladder?: number[]
}) {
  const [text, setText] = useState<string | null>(null)
  /** pointerdown 좌표 — pointerup에서 탭인지 판정한다 (CC12) */
  const down = useRef<TapPoint | null>(null)
  const [pressed, setPressed] = useState<-1 | 1 | null>(null)
  const latest = useRef({ value, step, min, max, onChange, decimals, ladder })
  latest.current = { value, step, min, max, onChange, decimals, ladder }

  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  const bump = (dir: 1 | -1) => {
    const { value: v, step: st, ladder: lad, onChange: cb } = latest.current
    // 부동소수 누적 방지는 stepUp/stepDown이 담당한다 (2.5 스텝에서 40.00000000000001 방지)
    const scale = { step: st, ladder: lad }
    const next = clamp(dir === 1 ? stepUp(v, scale) : stepDown(v, scale))
    if (next !== v) cb(next)
  }

  /** 이 버튼에서 시작해 이 버튼에서 떼고, 슬롭 안일 때만 1스텝 (CC12) */
  const release = (dir: 1 | -1, e: React.PointerEvent) => {
    const started = down.current
    down.current = null
    setPressed(null)
    if (isTap(started, { x: e.clientX, y: e.clientY })) bump(dir)
  }

  const abort = () => {
    down.current = null
    setPressed(null)
  }

  const commitText = () => {
    if (text === null) return
    const parsed = Number(text.replace(',', '.'))
    setText(null)
    if (!Number.isFinite(parsed)) return
    const factor = decimals === 2 ? 100 : 1
    onChange(clamp(Math.round(parsed * factor) / factor))
  }

  return (
    <div className="stepper">
      <button
        type="button"
        className={pressed === -1 ? 'stepper-btn-pressed' : undefined}
        aria-label={`${ariaLabel} 감소`}
        onPointerDown={(e) => {
          e.preventDefault()
          down.current = { x: e.clientX, y: e.clientY }
          setPressed(-1)
        }}
        onPointerUp={(e) => release(-1, e)}
        onPointerCancel={abort}
        onPointerLeave={abort}
      >
        −
      </button>
      {/* 정수 필드는 inputMode=numeric — iOS 키패드에서 소수점 키 자체가 사라진다 */}
      <input
        {...NO_AUTOFILL}
        className="stepper-value"
        inputMode={decimals === 2 ? 'decimal' : 'numeric'}
        aria-label={ariaLabel}
        value={text ?? String(value)}
        onChange={(e) => {
          // 패턴을 통과하지 못하면 이전 값을 유지한다 — 타이핑 자체가 안 된다
          if (isAllowedInput(e.target.value, decimals)) setText(e.target.value)
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <button
        type="button"
        className={pressed === 1 ? 'stepper-btn-pressed' : undefined}
        aria-label={`${ariaLabel} 증가`}
        onPointerDown={(e) => {
          e.preventDefault()
          down.current = { x: e.clientX, y: e.clientY }
          setPressed(1)
        }}
        onPointerUp={(e) => release(1, e)}
        onPointerCancel={abort}
        onPointerLeave={abort}
      >
        +
      </button>
    </div>
  )
}
