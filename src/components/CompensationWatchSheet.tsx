import type { CompensationWatch } from '../lib/compensationWatch'
import { WATCH_WINDOW } from '../lib/compensationWatch'
import { describeScale, stepDown, type WeightScale } from '../lib/weightScale'

/**
 * 반복 보상작용 → 무게 하향 제안 (T11).
 *
 * 자동으로 낮추지 않는 이유: A그룹 원칙이 "자극을 찾으려고 무게를 내리지 않는다"이므로
 * 하향은 항상 사용자 결정이다. 앱이 할 수 있는 것은 **셈을 보여주는 것**까지다.
 *
 * 하향 폭은 종목별 무게 단위(T9)를 따른다 — 5kg 머신에서 2.5kg를 제안하면
 * 존재하지 않는 무게가 된다.
 */
export default function CompensationWatchSheet({
  exerciseName,
  watch,
  scale,
  currentWeight,
  onApply,
  onClose,
}: {
  exerciseName: string
  watch: CompensationWatch
  scale: WeightScale
  currentWeight: number
  onApply: (weight: number) => void
  onClose: () => void
}) {
  const lowered = stepDown(currentWeight, scale)
  const canLower = lowered < currentWeight

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="보상작용 반복 — 무게 하향"
      >
        <div className="sheet-grip" />
        <div className="card-label">보상작용 반복 · {exerciseName}</div>
        <p className="row-sub">
          최근 {WATCH_WINDOW}회 수행 중 {watch.count}회에서 기록됐습니다. 루틴 문서 13장:
          세트 중 이 신호가 보이면 무게가 과한 것입니다.
        </p>

        <div className="check-list" style={{ marginTop: 12 }}>
          {watch.notes.map((note) => (
            <div className="row" key={note}>
              <div className="row-main">
                <div className="row-title" style={{ color: 'var(--warn)' }}>
                  {note}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="row-sub" style={{ marginTop: 12 }}>
          {canLower ? (
            <>
              한 단위 하향: <strong>{currentWeight}kg → {lowered}kg</strong> ({describeScale(scale)})
              <br />
              체크하지 않은 세트에만 적용됩니다. 이미 기록한 세트는 그대로입니다.
            </>
          ) : (
            <>더 낮출 단위가 없습니다 ({describeScale(scale)}).</>
          )}
        </p>

        <button
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          disabled={!canLower}
          onClick={() => {
            onApply(lowered)
            onClose()
          }}
        >
          {lowered}kg로 낮추기
        </button>
        <div style={{ height: 8 }} />
        <button className="btn" onClick={onClose}>
          그대로 두기
        </button>
      </div>
    </div>
  )
}
