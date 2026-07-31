import { useEffect, useRef, useState } from 'react'

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
}: {
  value: number
  step: number
  min?: number
  max?: number
  onChange: (next: number) => void
  ariaLabel: string
}) {
  const [text, setText] = useState<string | null>(null)
  const timers = useRef<{ delay?: number; repeat?: number }>({})
  // 롱프레스 반복은 콜백을 다시 만들지 않도록 최신 값을 ref로 읽는다
  const latest = useRef({ value, step, min, max, onChange })
  latest.current = { value, step, min, max, onChange }

  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  const bump = (dir: 1 | -1) => {
    const { value: v, step: st, onChange: cb } = latest.current
    // 부동소수 누적 방지 (2.5 스텝에서 40.00000000000001 같은 값 방지)
    const next = clamp(Math.round((v + dir * st) * 100) / 100)
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
    if (Number.isFinite(parsed)) onChange(clamp(Math.round(parsed * 100) / 100))
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
      <input
        className="stepper-value"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text ?? String(value)}
        onChange={(e) => setText(e.target.value)}
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
