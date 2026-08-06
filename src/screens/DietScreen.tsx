import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import DietDayEditor from '../components/DietDayEditor'
import MealReminderPanel from '../components/MealReminderPanel'
import { todayLocal } from '../lib/dates'
import { strengthDates } from '../lib/derive'
import { findPlan, useDiet } from '../lib/useDiet'

/**
 * 식단 탭 — 오늘 화면 (D2).
 *
 * 화면 자체는 얇다: 하루 편집은 `DietDayEditor`가 담당하고, 기록 탭의 과거 보정(D3)도
 * 같은 컴포넌트를 쓴다 — 따로 만들면 한쪽에 고친 규칙이 다른 쪽에 빠진다.
 */
export default function DietScreen() {
  const today = todayLocal()
  const { plans, days, defaultPlanId, variantDefaults, loading } = useDiet()
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])

  if (loading) return <p className="center-note">불러오는 중…</p>
  if (plans.length === 0) return <p className="center-note">식단 플랜이 없습니다.</p>

  // 근력 기준 (X3) — 유산소만 한 날은 훈련일로 고정하지 않는다
  const trainedToday = strengthDates(sessions).has(today)
  // 오늘 고른 플랜 (없으면 기본) — 알림은 그 플랜의 끼니 시각을 쓴다
  const activePlan = findPlan(plans, days.find((x) => x.date === today)?.planId ?? defaultPlanId)

  return (
    <div className="screen">
      <h1 className="screen-title">식단</h1>
      <DietDayEditor
        date={today}
        today={today}
        plans={plans}
        days={days}
        defaultPlanId={defaultPlanId}
        variantDefaults={variantDefaults}
        trainedThatDay={trainedToday}
        showStreakWarning
      />
      {/*
        식사 알림 (Z4) — 오늘 화면 아래에 둔다. 매일 쓰는 편집기가 위, 한 번 설정하는
        내보내기가 아래다. 기록 탭(과거 보정)에는 넣지 않는다 — 알림은 날짜와 무관하다.
      */}
      {activePlan && <MealReminderPanel plan={activePlan} />}
    </div>
  )
}
