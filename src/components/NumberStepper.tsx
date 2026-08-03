import { useEffect, useRef, useState } from 'react'
import { stepDown, stepUp } from '../lib/weightScale'
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

const HOLD_DELAY_MS = 400
const REPEAT_MS = 110
const ACCEL_AFTER = 8
const ACCEL_MS = 55

/**
 * 숫자 입력 + 롱프레스 가속 스테퍼 (DESIGN.md §5.2).
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
  const timers = useRef<{ delay?: number; repeat?: number }>({})
  // 롱프레스 반복은 콜백을 다시 만들지 않도록 최신 값을 ref로 읽는다
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

  const stop = () => {
    window.clearTimeout(timers.current.delay)
    window.clearInterval(timers.current.repeat)
    timers.current = {}
  }

  const start = (dir: 1 | -1) => {
    bump(dir)
    timers.current.delay = window.setTimeout(() => {
      let ticks = 0
      const tick = () => {
        bump(dir)
        ticks += 1
        if (ticks === ACCEL_AFTER) {
          window.clearInterval(timers.current.repeat)
          timers.current.repeat = window.setInterval(tick, ACCEL_MS)
        }
      }
      timers.current.repeat = window.setInterval(tick, REPEAT_MS)
    }, HOLD_DELAY_MS)
  }

  useEffect(() => stop, [])

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
        aria-label={`${ariaLabel} 감소`}
        onPointerDown={(e) => {
          e.preventDefault()
          start(-1)
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
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
        aria-label={`${ariaLabel} 증가`}
        onPointerDown={(e) => {
          e.preventDefault()
          start(1)
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      >
        +
      </button>
    </div>
  )
}
