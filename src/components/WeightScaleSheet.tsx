import { useState } from 'react'
import {
  STEP_PRESETS,
  formatLadder,
  parseLadder,
  round2,
  type WeightScale,
} from '../lib/weightScale'
import { NO_AUTOFILL } from '../lib/inputProps'

/**
 * 종목별 무게 단위 설정 (T9).
 *
 * 루틴 문서 10장의 증량 규칙은 "머신은 한 핀"인데, 한 핀이 몇 kg인지는 머신마다 다르고
 * 균일하지도 않다. 균일 머신은 스텝 하나로 끝나지만, 불규칙 스택은 실제 핀 값을
 * 나열해야 한다 (2.5씩 가다 3씩 뛰는 머신이 흔하다).
 *
 * 한 번 설정하면 recordKey에 영구 저장되므로, 같은 머신을 다시 설정할 일은 없다.
 */
export default function WeightScaleSheet({
  exerciseName,
  defaultStep,
  current,
  onSave,
  onClose,
}: {
  exerciseName: string
  defaultStep: number
  current: { weightStepKg?: number; weightLadderKg?: number[] }
  onSave: (next: { weightStepKg?: number; weightLadderKg?: number[] }) => void
  onClose: () => void
}) {
  const hasLadder = (current.weightLadderKg?.length ?? 0) > 0
  const [mode, setMode] = useState<'step' | 'ladder'>(hasLadder ? 'ladder' : 'step')
  const [stepText, setStepText] = useState(String(current.weightStepKg ?? defaultStep))
  const [ladderText, setLadderText] = useState(
    current.weightLadderKg?.length ? formatLadder(current.weightLadderKg) : '',
  )

  const parsedStep = Number(stepText.replace(',', '.'))
  const stepValid = Number.isFinite(parsedStep) && parsedStep > 0
  const ladderResult = parseLadder(ladderText)

  const preview: WeightScale | undefined =
    mode === 'ladder'
      ? ladderResult.ladder
        ? { step: defaultStep, ladder: ladderResult.ladder }
        : undefined
      : stepValid
        ? { step: round2(parsedStep) }
        : undefined

  const error =
    mode === 'ladder'
      ? (ladderResult.error ?? (ladderResult.ladder ? undefined : '핀 값을 입력하세요'))
      : stepValid
        ? undefined
        : '0보다 큰 숫자를 입력하세요'

  const save = () => {
    if (!preview) return
    onSave(
      mode === 'ladder'
        ? { weightLadderKg: preview.ladder }
        : { weightStepKg: preview.step },
    )
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="무게 단위 설정"
      >
        <div className="sheet-grip" />
        <div className="card-label">무게 단위 · {exerciseName}</div>
        <p className="row-sub">
          이 종목의 머신 한 핀이 몇 kg인지. 증량 제안과 ± 버튼이 이 값을 따릅니다.
        </p>

        <div className="segment" style={{ marginTop: 12 }}>
          <button aria-pressed={mode === 'step'} onClick={() => setMode('step')}>
            균일 간격
          </button>
          <button aria-pressed={mode === 'ladder'} onClick={() => setMode('ladder')}>
            불규칙 (핀 목록)
          </button>
        </div>

        {mode === 'step' ? (
          <>
            <div className="chip-row" style={{ marginTop: 12 }}>
              {STEP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  className={`chip chip-btn${parsedStep === preset ? ' chip-btn-on' : ''}`}
                  aria-pressed={parsedStep === preset}
                  onClick={() => setStepText(String(preset))}
                >
                  {preset}kg
                </button>
              ))}
            </div>
            <input
              {...NO_AUTOFILL}
              className="field"
              style={{ marginTop: 10 }}
              inputMode="decimal"
              value={stepText}
              onChange={(e) => setStepText(e.target.value)}
              aria-label="무게 단위 직접 입력 (kg)"
              placeholder="직접 입력 (kg)"
            />
          </>
        ) : (
          <>
            <p className="row-sub" style={{ marginTop: 12 }}>
              머신에 적힌 핀 값을 순서 상관없이 나열하세요. 예: 5, 10, 15, 20, 25, 30, 35, 41, 47
            </p>
            <textarea
              {...NO_AUTOFILL}
              className="field"
              rows={3}
              value={ladderText}
              onChange={(e) => setLadderText(e.target.value)}
              aria-label="핀 목록"
              placeholder="5, 10, 15, 20, 25, 30, 35, 41, 47"
            />
          </>
        )}

        <p className="row-sub" style={{ marginTop: 10 }}>
          {error ? (
            <strong style={{ color: 'var(--warn)' }}>{error}</strong>
          ) : mode === 'ladder' && preview?.ladder ? (
            <>
              핀 {preview.ladder.length}개 · {formatLadder(preview.ladder)}
            </>
          ) : (
            <>± 버튼과 증량 제안이 {preview?.step}kg 단위로 움직입니다</>
          )}
        </p>

        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={save} disabled={!preview}>
          저장
        </button>
        <div style={{ height: 8 }} />
        <div className="btn-row">
          <button
            className="btn"
            onClick={() => {
              onSave({})
              onClose()
            }}
          >
            기본값({defaultStep}kg)으로
          </button>
          <button className="btn" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
