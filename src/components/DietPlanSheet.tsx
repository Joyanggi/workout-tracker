import { useState } from 'react'
import { LOW_KCAL_STREAK_WARN, planTotals } from '../lib/diet'
import type { DietPlan } from '../types'

/** "내일부터 N일"의 상한. 4일째부터 경고 대상이므로 3일까지만 미리 잡을 수 있게 한다 */
const MAX_AHEAD = LOW_KCAL_STREAK_WARN - 1

/**
 * 플랜 전환 (D2).
 *
 * **일 단위 + 벌크 액션만 제공한다.** 주 단위 전환은 두지 않는다 — 회식은 날짜 단위
 * 사건이고, 주 단위 스위치는 "이번 주는 망함" 프레임을 만든다 (PLAN-DIET §0-1,
 * 과거 붕괴의 심리 패턴).
 */
export default function DietPlanSheet({
  plans,
  currentPlanId,
  onPickToday,
  onPickAhead,
  onClose,
}: {
  plans: DietPlan[]
  currentPlanId: string
  onPickToday: (planId: string) => void
  /** 내일부터 N일 동안 이 플랜 */
  onPickAhead: (planId: string, days: number) => void
  onClose: () => void
}) {
  const [ahead, setAhead] = useState<string | null>(null)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="식단 플랜 전환"
      >
        <div className="sheet-grip" />
        <div className="card-label">식단 플랜</div>

        {ahead === null ? (
          <>
            <div className="check-list" style={{ marginTop: 8 }}>
              {plans.map((plan) => {
                const { kcal, proteinG } = planTotals(plan)
                return (
                  <button
                    key={plan.id}
                    className={`check-item${plan.id === currentPlanId ? ' check-item-on' : ''}`}
                    aria-pressed={plan.id === currentPlanId}
                    onClick={() => {
                      onPickToday(plan.id)
                      onClose()
                    }}
                  >
                    <span className="check-box" aria-hidden="true">
                      {plan.id === currentPlanId ? '✓' : ''}
                    </span>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="row-title">{plan.name}</span>
                      <span className="row-sub">
                        {kcal.toLocaleString()}kcal · 단백질 {proteinG}g
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="row-sub" style={{ marginTop: 10 }}>
              고르면 <strong>오늘</strong>만 바뀝니다. 며칠을 미리 정하려면 아래를 쓰세요.
            </p>
            <div className="btn-row" style={{ marginTop: 8 }}>
              {plans
                .filter((p) => p.id !== currentPlanId)
                .map((p) => (
                  <button key={p.id} className="btn btn-sm" onClick={() => setAhead(p.id)}>
                    내일부터 {p.name}
                  </button>
                ))}
            </div>
          </>
        ) : (
          <>
            <p className="row-sub" style={{ marginTop: 8 }}>
              {plans.find((p) => p.id === ahead)?.name}을 <strong>내일부터 며칠</strong> 적용할까요?
            </p>
            <div className="btn-row" style={{ marginTop: 8 }}>
              {Array.from({ length: MAX_AHEAD }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  className="btn btn-sm"
                  onClick={() => {
                    onPickAhead(ahead, n)
                    onClose()
                  }}
                >
                  {n}일
                </button>
              ))}
            </div>
            <p className="row-sub" style={{ marginTop: 10 }}>
              {LOW_KCAL_STREAK_WARN}일 이상 연속되면 경고가 뜹니다 — 루틴 문서 15장이 만회성
              절식을 금지하기 때문입니다.
            </p>
            <div style={{ height: 8 }} />
            <button className="btn" onClick={() => setAhead(null)}>
              뒤로
            </button>
          </>
        )}

        <div style={{ height: 8 }} />
        <button className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
