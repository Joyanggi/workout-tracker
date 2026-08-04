import { useState } from 'react'
import { parseCompensation, serializeCompensation } from '../lib/compensation'
import { NO_COMPENSATION } from '../types'
import { NO_AUTOFILL } from '../lib/inputProps'

/**
 * 보상작용 입력 (DESIGN.md §5.2).
 * "보상작용: [없음] (탭하면 종목별 체크리스트 + 직접 입력)"
 *
 * 체크리스트는 카탈로그의 `Exercise.compensationSigns` — 루틴 문서 12장에서 온 종목별 신호다.
 * 체크리스트가 비어 있는 종목도 있어서 자유 입력은 항상 제공한다.
 */
export default function CompensationSheet({
  exerciseName,
  signs,
  current,
  onSave,
  onClose,
}: {
  exerciseName: string
  signs: string[]
  current: string
  onSave: (next: string) => void
  onClose: () => void
}) {
  const initial = parseCompensation(current, signs)
  const [selected, setSelected] = useState<string[]>(initial.signs)
  const [free, setFree] = useState(initial.free)

  const toggle = (sign: string) =>
    setSelected((prev) => (prev.includes(sign) ? prev.filter((s) => s !== sign) : [...prev, sign]))

  const preview = serializeCompensation({ signs: selected, free })

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="보상작용 입력"
      >
        <div className="sheet-grip" />
        <div className="card-label">보상작용 · {exerciseName}</div>

        {signs.length > 0 ? (
          <div className="check-list">
            {signs.map((sign) => (
              <button
                key={sign}
                className={`check-item${selected.includes(sign) ? ' check-item-on' : ''}`}
                onClick={() => toggle(sign)}
                aria-pressed={selected.includes(sign)}
              >
                <span className="check-box" aria-hidden="true">
                  {selected.includes(sign) ? '✓' : ''}
                </span>
                <span>{sign}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="row-sub">이 종목에는 등록된 체크리스트가 없습니다. 직접 입력하세요.</p>
        )}

        <div className="card-label" style={{ marginTop: 16 }}>
          직접 입력
        </div>
        <input
          {...NO_AUTOFILL}
          className="field"
          value={free}
          onChange={(e) => setFree(e.target.value)}
          placeholder="예: 마지막 세트 엉덩이 살짝 뜸"
          aria-label="보상작용 직접 입력"
        />

        <p className="row-sub" style={{ marginTop: 12 }}>
          저장될 값: <strong style={{ color: preview === NO_COMPENSATION ? 'var(--text-dim)' : 'var(--warn)' }}>{preview}</strong>
        </p>

        <button
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          onClick={() => {
            onSave(preview)
            onClose()
          }}
        >
          저장
        </button>
        <div style={{ height: 8 }} />
        <div className="btn-row">
          {/*
            X9 — **지울 것이 있을 때만** 보인다. 이미 '없음'인 상태에서 "없음으로 비우기"는
            아무 일도 하지 않는 버튼이고, 그런 버튼이 있으면 자기 존재를 설명하지 못한다.
            기준은 저장된 현재 값이다 (편집 중인 선택이 아니다) — 편집 중 값으로 판단하면
            체크를 다 풀자마자 버튼이 사라져서 "되돌리기"를 못 한다.
          */}
          {current.trim() !== '' && current !== NO_COMPENSATION && (
            <button
              className="btn"
              onClick={() => {
                setSelected([])
                setFree('')
              }}
            >
              없음으로 비우기
            </button>
          )}
          <button className="btn" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
