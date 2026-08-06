import { itemVariant, variantsOf } from '../lib/diet'
import type { DietItem, DietSlot } from '../types'

/**
 * 단백질원 고르기 (DD3) — 변형 선택 시트.
 *
 * **예외 경로다.** 정상일의 마찰 기준(슬롯당 1탭)은 그대로여야 하므로, 품목을 길게 누르는
 * 제스처나 매일 고르는 단계를 만들지 않았다. 품목 옆 작은 "▾"만 이 시트를 연다.
 * 한 번 고르면 다음 날의 기본이 되므로(5-b) 실제로 여는 빈도는 "먹는 걸 바꿀 때"뿐이다.
 *
 * 앱은 판단하지 않는다: 다리살의 "올리브오일 생략" 조건은 **강제하지 않고 문구로만** 말한다.
 * 어긴 날은 kcal 합계가 정직하게 초과를 보여준다 (그게 이 앱의 방식이다).
 */
export default function DietVariantSheet({
  slot,
  item,
  choice,
  onPick,
  onClose,
}: {
  slot: DietSlot
  item: DietItem
  /** 현재 선택 (기록 → 기억된 기본값 → 0) */
  choice: number
  onPick: (index: number) => void
  onClose: () => void
}) {
  const variants = variantsOf(item)
  const base = itemVariant(item, 0)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${slot.name} 단백질원 고르기`}
      >
        <div className="sheet-grip" />
        <div className="card-label">
          {slot.name} · 단백질원
        </div>
        <p className="row-sub" style={{ whiteSpace: 'normal' }}>
          루틴 문서 15장 로테이션 — <b>등가 기준은 단백질</b>입니다. 어느 것을 골라도 준수
          점수는 같습니다 (물림이 이행률을 깎기 때문에 셋 다 허용됩니다).
        </p>

        <div className="check-list" style={{ marginTop: 10 }}>
          {variants.map((variant, index) => {
            const kcalDelta = variant.kcal - base.kcal
            const proteinDelta = variant.proteinG - base.proteinG
            return (
              <button
                key={index}
                className={`check-item${index === choice ? ' check-item-on' : ''}`}
                aria-pressed={index === choice}
                onClick={() => {
                  onPick(index)
                  onClose()
                }}
              >
                <span className="check-box" aria-hidden="true">
                  {index === choice ? '✓' : ''}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span className="row-title">
                    {variant.name} {variant.qty}
                  </span>
                  {/* 차이는 기본 변형 대비로 파생시킨다 — 손으로 적으면 시드를 고칠 때 낡는다 */}
                  <span className="row-sub">
                    {variant.kcal}kcal · 단백질 {variant.proteinG}g
                    {index > 0 && (kcalDelta !== 0 || proteinDelta !== 0)
                      ? ` (기본 대비 ${kcalDelta >= 0 ? '+' : '−'}${Math.abs(kcalDelta)}kcal${
                          proteinDelta !== 0
                            ? ` · 단백질 ${proteinDelta >= 0 ? '+' : '−'}${Math.abs(proteinDelta)}g`
                            : ''
                        })`
                      : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <p className="row-sub" style={{ marginTop: 10, whiteSpace: 'normal' }}>
          고른 것이 <b>다음 날의 기본</b>이 됩니다. 이미 적어 둔 날의 기록은 바뀌지 않습니다.
        </p>
        <div style={{ height: 8 }} />
        <button className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
