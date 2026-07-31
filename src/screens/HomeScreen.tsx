import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import DayPickerSheet from '../components/DayPickerSheet'
import { db } from '../db'
import { todayLocal } from '../lib/dates'
import { completedSessions, findDay } from '../lib/derive'
import { storageAtRisk } from '../lib/platform'
import { buildSession } from '../lib/sessionFactory'
import { suggestNextDay } from '../lib/suggestNextDay'
import { exerciseLabel, useRoutine } from '../lib/useRoutine'
import { useSessionStore } from '../store/session'
import { useSettings } from '../store/settings'
import type { RoutineDay, SessionMode } from '../types'

export default function HomeScreen({ onEnterSession }: { onEnterSession: () => void }) {
  const bundle = useRoutine()
  const currentPhase = useSettings((s) => s.currentPhase)
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const openSession = useSessionStore((s) => s.session)
  const begin = useSessionStore((s) => s.begin)
  const [picking, setPicking] = useState(false)
  const [applyReturn, setApplyReturn] = useState(true)

  const today = todayLocal()

  const suggestion = useMemo(() => {
    if (!bundle) return undefined
    return suggestNextDay({ sessions, routine: bundle.routine, today })
  }, [bundle, sessions, today])

  if (!bundle || !suggestion) {
    return (
      <div className="screen">
        <p className="center-note">루틴을 불러오는 중…</p>
      </div>
    )
  }

  const { routine, catalog } = bundle
  const done = completedSessions(sessions)

  const start = (day: RoutineDay) => {
    const isReturn = Boolean(suggestion.returnStep) && applyReturn && day.id === suggestion.day.id
    const mode: SessionMode = isReturn ? 'return' : 'normal'
    const { session } = buildSession({
      routine,
      day,
      mode,
      sessions,
      phase: currentPhase,
      today,
      returnStep: isReturn ? suggestion.returnStep : undefined,
    })
    begin(session)
    setPicking(false)
    onEnterSession()
  }

  const openDay = openSession ? findDay(routine, openSession.dayId) : undefined

  return (
    <div className="screen">
      {storageAtRisk() && (
        <div className="banner banner-danger">
          <span>
            홈 화면에 추가하지 않으면 기록이 삭제될 수 있어요. Safari 공유 → 홈 화면에 추가.
          </span>
        </div>
      )}

      <h1 className="screen-title">운동 기록</h1>
      <p className="screen-sub">
        <span className="chip chip-accent">{routine.name}</span>{' '}
        <span className="chip">Phase {currentPhase}</span>{' '}
        <span className="chip">누적 {done.length}세션</span>
      </p>

      {/* §11 리스크 대응: 세션 도중 앱이 죽어도 이어서 진행할 수 있게 한다 */}
      {openSession && (
        <div className="banner banner-info">
          <span>진행 중: {openDay?.name ?? openSession.dayId}</span>
          <button onClick={onEnterSession}>
            <span>이어하기</span>
          </button>
        </div>
      )}

      {suggestion.returnStep && (
        <div className="banner banner-info" style={{ alignItems: 'flex-start' }}>
          <span>
            {suggestion.gapDays}일 공백 — 무게 {suggestion.returnStep.weightPct}%, 세트{' '}
            {suggestion.returnStep.setPct}%, RIR {suggestion.returnStep.targetRIR}로 복귀할까요?
            <br />
            <small>{suggestion.returnStep.rampWeeks}주간 램프업</small>
          </span>
          <button onClick={() => setApplyReturn(!applyReturn)}>
            <span>{applyReturn ? '적용됨' : '무시'}</span>
          </button>
        </div>
      )}

      <button className="card today-card today-card-btn" onClick={() => setPicking(true)}>
        <div className="card-label">다음 운동</div>
        <div className="today-day">{suggestion.day.name}</div>
        <div className="today-sub">{suggestion.day.subtitle}</div>
        <div className="today-reason">{suggestion.reason}</div>
        <div className="today-sub" style={{ marginTop: 8 }}>
          {suggestion.day.exercises
            .slice()
            .sort((a, b) => a.plannedOrder - b.plannedOrder)
            .map((ex) => exerciseLabel(catalog, ex.exerciseId))
            .join(' · ')}
        </div>
        <div className="today-change">탭해서 다른 Day 선택 ▸</div>
      </button>

      <button className="btn btn-primary" onClick={() => start(suggestion.day)}>
        {suggestion.day.name} 시작
      </button>

      {suggestion.scores.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-label">제안 근거 (부족분 점수)</div>
          {suggestion.scores.map((s) => (
            <div className="row" key={s.dayId}>
              <div className="row-main">
                <div className="row-title">
                  {findDay(routine, s.dayId)?.name ?? s.dayId}
                  {s.penalized && (
                    <span className="chip chip-warn" style={{ marginLeft: 6 }}>
                      회복 감쇠
                    </span>
                  )}
                </div>
                <div className="row-sub">
                  {s.contributions.length === 0
                    ? '목표 충족'
                    : s.contributions
                        .map((c) => `${c.muscle} ${c.sets}${c.firstExposure ? '★' : ''}`)
                        .join(' · ')}
                </div>
              </div>
              <div className="row-meta">{s.score.toFixed(1)}</div>
            </div>
          ))}
          <p className="row-sub" style={{ marginTop: 8 }}>
            ★ = 이번 주 첫 노출 (주 2회 빈도 확보 우선)
          </p>
        </div>
      )}

      <p className="row-sub" style={{ textAlign: 'center', marginTop: 8 }}>
        주간 도트 · 부위별 볼륨 바 · 디로드 카운터는 마일스톤 4에서 붙습니다.
      </p>

      {picking && (
        <DayPickerSheet
          routine={routine}
          suggestedDayId={suggestion.day.id}
          onPick={start}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
