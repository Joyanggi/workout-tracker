import { useEffect, useRef, useState, type ReactNode } from 'react'
import { once } from '../lib/once'

/**
 * legacy 시트의 껍데기 하나 (v1.19 QQ3). 막 → 시트 → 손잡이 DOM과 닫히는 움직임을 여기서만 만든다.
 * 막 누름과 `dismiss()`는 `is-closing`을 붙여 내려가며 닫고, 끝나면 `onClose`를 한 번만 부른다.
 * 시트 안의 저장·완료 버튼이 부모 상태를 바꿔 사라지는 길은 움직이지 않고 바로 닫힌다(그대로).
 * Astryx를 import하지 않는다(헬스장 경로).
 */
const SAFETY_MS = 350 // --motion-medium(300ms)보다 조금 길게: animationend가 안 오는 경우(탭 숨김 등)의 안전장치

export function SheetFrame({
  label,
  onClose,
  children,
  className,
}: {
  label: string
  onClose: () => void
  children: ReactNode | ((dismiss: () => void) => ReactNode)
  className?: string
}) {
  const [closing, setClosing] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const finishRef = useRef<(() => void) | undefined>(undefined)
  if (!finishRef.current) finishRef.current = once(() => onCloseRef.current())
  const startedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const finish = () => finishRef.current?.()
  const dismiss = () => {
    if (startedRef.current) return
    startedRef.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    setClosing(true)
    timerRef.current = setTimeout(finish, SAFETY_MS)
  }

  const cls = closing ? ' is-closing' : ''
  return (
    <div className={'sheet-backdrop' + cls} onClick={dismiss}>
      <div
        className={'sheet' + (className ? ' ' + className : '') + cls}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) finish()
        }}
        role="dialog"
        aria-label={label}
      >
        <div className="sheet-grip" />
        {typeof children === 'function' ? children(dismiss) : children}
      </div>
    </div>
  )
}
