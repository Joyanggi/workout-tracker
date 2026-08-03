import { useState } from 'react'
import { db, setSettings } from '../db'
import { BUNDLED_DIET_PLANS, BUNDLED_DIET_REVISION } from '../db/seed'
import { validateDietPlan } from '../db/validateDietPlan'
import { formatPlanLabel, planTotals } from '../lib/diet'
import { pickTextFile } from '../lib/pickFile'
import { OUTCOME_MESSAGE, shareFile } from '../lib/share'
import type { DietPlan } from '../types'

/**
 * 식단 플랜 JSON 가져오기/내보내기 (D4).
 *
 * 루틴(`RoutineIoPanel`)과 같은 경로·같은 사상이다: 플랜은 **교체 가능한 데이터**이고
 * 앱은 자유 식단 작성기를 제공하지 않는다. 실제 제품 라벨(kcal·단백질)로 보정하려면
 * 이 경로를 쓴다.
 *
 * **가져오기 전에 validateDietPlan을 통과해야 한다.** 깨진 플랜이 들어오면 단백질 지표와
 * 준수 판정이 서로 다른 숫자를 말하기 시작하고 원인 추적이 어렵다.
 *
 * `kcalLabel`은 파일 값을 쓰지 않고 **항목 합계에서 다시 만든다** — 손으로 적은 라벨이
 * 항목과 어긋난 채 들어오면 화면이 서로 다른 숫자를 말한다 (시드에서 실제로 그랬다).
 */
export default function DietIoPanel({ plans }: { plans: DietPlan[] }) {
  const [problems, setProblems] = useState<string[]>([])
  const [staged, setStaged] = useState<{ name: string; plans: DietPlan[] } | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const onExport = async () => {
    const payload = {
      seedRevision: BUNDLED_DIET_REVISION,
      plans: plans.length > 0 ? plans : BUNDLED_DIET_PLANS,
    }
    const outcome = await shareFile({
      text: `${JSON.stringify(payload, null, 2)}\n`,
      filename: 'diet-plans.json',
      mimeType: 'application/json',
      title: '식단 플랜',
    })
    setStatus(OUTCOME_MESSAGE[outcome])
  }

  const onPick = async () => {
    setProblems([])
    setStatus(null)
    const picked = await pickTextFile('.json,application/json')
    if (!picked) return

    let parsed: unknown
    try {
      parsed = JSON.parse(picked.text)
    } catch {
      setProblems(['JSON 형식이 아닙니다'])
      return
    }
    const list = Array.isArray(parsed)
      ? (parsed as DietPlan[])
      : ((parsed as { plans?: DietPlan[] })?.plans ?? null)
    if (!Array.isArray(list) || list.length === 0) {
      setProblems(['plans 배열이 없습니다'])
      return
    }

    // 라벨은 항목 합계에서 다시 만든다 (파일의 손으로 적은 값을 신뢰하지 않는다)
    const normalized = list.map((plan) => ({
      ...plan,
      seedRevision: plan.seedRevision ?? BUNDLED_DIET_REVISION,
      kcalLabel: formatPlanLabel(plan),
    }))

    const found = normalized.flatMap((plan) =>
      validateDietPlan(plan).map((p) => `${plan.id}: ${p}`),
    )
    if (found.length > 0) {
      setProblems(found)
      return
    }
    setStaged({ name: picked.name, plans: normalized })
  }

  const onApply = async () => {
    if (!staged) return
    await db.dietPlans.bulkPut(staged.plans)
    /*
     * 가져온 플랜을 다음 부팅에 시드가 덮지 않도록 **번들 리비전**을 기록한다
     * (루틴 IO와 같은 규칙 — R2 주석 참조).
     */
    await setSettings({ seededDietRevision: BUNDLED_DIET_REVISION })
    setStaged(null)
    setStatus(`${staged.plans.length}개 플랜 적용됨`)
  }

  const onReset = async () => {
    await db.dietPlans.bulkPut(BUNDLED_DIET_PLANS)
    await setSettings({ seededDietRevision: BUNDLED_DIET_REVISION })
    setStatus('번들 플랜으로 되돌렸습니다')
  }

  return (
    <div className="card">
      <div className="card-label">식단 플랜 JSON</div>

      {problems.length > 0 && (
        <div className="banner banner-danger" style={{ alignItems: 'flex-start' }}>
          <span>
            정합성 검사 실패 — 가져오지 않았습니다
            <br />
            {problems.map((p) => (
              <small key={p}>
                {p}
                <br />
              </small>
            ))}
          </span>
        </div>
      )}

      {staged && (
        <div className="banner banner-info" style={{ alignItems: 'flex-start' }}>
          <span>
            {staged.name}
            <br />
            {staged.plans.map((p) => {
              const { kcal, proteinG } = planTotals(p)
              return (
                <small key={p.id}>
                  {p.name} — {kcal.toLocaleString()}kcal · 단백질 {proteinG}g
                  <br />
                </small>
              )
            })}
          </span>
        </div>
      )}

      {staged ? (
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => void onApply()}>
            적용
          </button>
          <button className="btn" onClick={() => setStaged(null)}>
            취소
          </button>
        </div>
      ) : (
        <div className="btn-row">
          <button className="btn" onClick={() => void onExport()}>
            현재 플랜 내보내기
          </button>
          <button className="btn" onClick={() => void onPick()}>
            플랜 가져오기
          </button>
        </div>
      )}

      <p className="row-sub" style={{ marginTop: 8 }}>
        제품 라벨의 실제 kcal·단백질로 보정할 때 씁니다. 요약 라벨은 항목 합계에서 다시
        계산하므로 파일에 적은 값과 어긋날 수 없습니다.
      </p>
      <div style={{ height: 8 }} />
      <button className="btn btn-sm" onClick={() => void onReset()}>
        번들 플랜으로 되돌리기
      </button>

      {status && (
        <p className="row-sub" style={{ marginTop: 8 }}>
          {status}
        </p>
      )}
    </div>
  )
}
