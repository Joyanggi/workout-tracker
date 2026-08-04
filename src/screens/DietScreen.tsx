import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import DietDayEditor from '../components/DietDayEditor'
import { todayLocal } from '../lib/dates'
import { strengthDates } from '../lib/derive'
import { useDiet } from '../lib/useDiet'

/**
 * 식단 탭 — 오늘 화면 (D2).
 *
 * 화면 자체는 얇다: 하루 편집은 `DietDayEditor`가 담당하고, 기록 탭의 과거 보정(D3)도
 * 같은 컴포넌트를 쓴다 — 따로 만들면 한쪽에 고친 규칙이 다른 쪽에 빠진다.
 */
export default function DietScreen() {
  const today = todayLocal()
  const { plans, days, defaultPlanId, loading } = useDiet()
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])

  if (loading) return <p className="center-note">불러오는 중…</p>
  if (plans.length === 0) return <p className="center-note">식단 플랜이 없습니다.</p>

  // 근력 기준 (X3) — 유산소만 한 날은 훈련일로 고정하지 않는다
  const trainedToday = strengthDates(sessions).has(today)

  return (
    <div className="screen">
      <h1 className="screen-title">식단</h1>
      <DietDayEditor
        date={today}
        today={today}
        plans={plans}
        days={days}
        defaultPlanId={defaultPlanId}
        trainedThatDay={trainedToday}
        showStreakWarning
      />
    </div>
  )
}
