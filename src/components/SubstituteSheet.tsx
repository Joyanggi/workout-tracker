import { useState } from 'react'
import { CALIBRATION_RIR, type SubstitutePreview } from '../lib/substitute'
import { NO_AUTOFILL } from '../lib/inputProps'

/**
 * 대체운동 선택 (T8).
 *
 * 머신 자리가 없을 때 쓴다. 후보별 **예상 시작 무게**를 미리 보여주는 것이 핵심 —
 * 무게를 모르면 기계 앞에서 다시 고민하게 되고, 그게 기록을 포기하는 지점이다.
 *
 * 표시 문구가 "예상"임을 숨기지 않는다. 종목 간 하중 전이에 검증된 공식은 없고
 * (lib/substitute.ts 주석), 실제 보정은 첫 세트를 RIR 3~4로 수행한 결과로 한다.
 */
export default function SubstituteSheet({
  originalName,
  previews,
  bodyWeightKg,
  onSaveBodyWeight,
  onSelect,
  onClose,
}: {
  originalName: string
  previews: SubstitutePreview[]
  bodyWeightKg?: number
  onSaveBodyWeight: (kg: number) => void
  onSelect: (preview: SubstitutePreview) => void
  onClose: () => void
}) {
  const [bodyWeightText, setBodyWeightText] = useState(
    bodyWeightKg === undefined ? '' : String(bodyWeightKg),
  )
  const needsBodyWeight = previews.some((p) => p.blocked === 'no-bodyweight')
  const parsedBodyWeight = Number(bodyWeightText.replace(',', '.'))
  const bodyWeightValid = Number.isFinite(parsedBodyWeight) && parsedBodyWeight > 20

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="대체운동 선택"
      >
        <div className="sheet-grip" />
        <div className="card-label">자리 없음 · {originalName} 대체</div>

        {previews.length === 0 ? (
          <p className="row-sub" style={{ marginTop: 12 }}>
            이 종목에는 등록된 대체가 없습니다. 순서를 바꿔 다른 종목을 먼저 하세요.
          </p>
        ) : (
          <>
            <p className="row-sub">
              첫 세트는 <strong>{CALIBRATION_RIR}</strong>로 — 그 결과로 2세트 무게를 다시
              계산합니다. 아래 무게는 시작점 추정이고, 기록은 대체 종목 자신의 라인에 남습니다.
            </p>

            {needsBodyWeight && (
              <div className="sub-field">
                <div className="card-label">체중 (kg)</div>
                <p className="row-sub">
                  어시스티드 머신은 보조 무게를 체중에서 역산합니다. 이 값만 여기에 쓰입니다.
                </p>
                <div className="setup-edit">
                  <input
                    {...NO_AUTOFILL}
                    className="field"
                    inputMode="decimal"
                    value={bodyWeightText}
                    onChange={(e) => setBodyWeightText(e.target.value)}
                    aria-label="체중 (kg)"
                    placeholder="예: 72"
                  />
                  <button
                    className="btn btn-sm"
                    disabled={!bodyWeightValid}
                    onClick={() => onSaveBodyWeight(Math.round(parsedBodyWeight * 10) / 10)}
                  >
                    저장
                  </button>
                </div>
              </div>
            )}

            <div className="check-list" style={{ marginTop: 12 }}>
              {previews.map((preview) => {
                const { option, exercise } = preview
                const notes: string[] = []
                if (option.perSide) notes.push('한쪽 무게로 기록')
                if (option.assisted) notes.push('보조 무게 — 클수록 쉽다')
                if (preview.lastRecord) notes.push('기록 있음 — 지난 무게 사용')

                return (
                  <button
                    key={option.exerciseId}
                    className="check-item"
                    disabled={preview.startWeight === undefined}
                    onClick={() => onSelect(preview)}
                  >
                    {/* row-title/row-sub는 블록 전제 스타일이라 span 안에서는 한 줄로 붙는다 */}
                    <span
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <span className="row-title">{exercise.shortName}</span>
                      {notes.length > 0 && <span className="row-sub">{notes.join(' · ')}</span>}
                      {preview.blocked === 'no-history' && (
                        <span className="row-sub">
                          원 종목 기록이 없어 시작 무게를 추정할 수 없습니다
                        </span>
                      )}
                      {preview.blocked === 'no-bodyweight' && (
                        <span className="row-sub">체중을 입력하면 보조 무게를 계산합니다</span>
                      )}
                    </span>
                    {preview.startWeight !== undefined && (
                      <span className="row-meta" style={{ color: 'var(--accent)' }}>
                        {preview.startWeight}kg
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div style={{ height: 8 }} />
        <button className="btn" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  )
}
