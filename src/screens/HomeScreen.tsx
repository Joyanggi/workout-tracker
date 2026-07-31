import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import DayPickerSheet from '../components/DayPickerSheet'
import MuscleVolumeBars from '../components/MuscleVolumeBars'
import WeekDots from '../components/WeekDots'
import { db } from '../db'
import {
  deloadState,
  lastSessionOf,
  muscleBars,
  phase0Progress,
  weekDots,
} from '../lib/dashboard'
import { todayLocal } from '../lib/dates'
import { backupReminder, isGistConfigured } from '../lib/gistSync'
import { completedSessions, findDay } from '../lib/derive'
import { storageAtRisk } from '../lib/platform'
import { progressionSuggestions } from '../lib/progression'
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
  const [dismissedDeload, setDismissedDeload] = useState(false)
  const [dismissedBackup, setDismissedBackup] = useState(false)
  const lastBackupAt = useLiveQuery(
    async () => ((await db.settings.get('lastBackupAt'))?.value as string | undefined) ?? null,
    [],
    null,
  )

  const today = todayLocal()

  const dash = useMemo(() => {
    if (!bundle) return undefined
    const { routine } = bundle
    const last = lastSessionOf(sessions)
    return {
      suggestion: suggestNextDay({ sessions, routine, today }),
      dots: weekDots(sessions, today),
      volume: muscleBars(sessions, routine, today),
      deload: deloadState(sessions, routine, today),
      phase0: phase0Progress(sessions, routine, today),
      progressions: last ? progressionSuggestions(last, routine, currentPhase) : [],
    }
  }, [bundle, sessions, today, currentPhase])

  if (!bundle || !dash) {
    return (
      <div className="screen">
        <p className="center-note">루틴을 불러오는 중…</p>
      </div>
    )
  }

  const { routine, catalog } = bundle
  const { suggestion, dots, volume, deload, phase0, progressions } = dash
  const done = completedSessions(sessions)

  const start = (day: RoutineDay, forceMode?: SessionMode) => {
    const isReturn =
      forceMode === undefined &&
      Boolean(suggestion.returnStep) &&
      applyReturn &&
      day.id === suggestion.day.id
    const mode: SessionMode = forceMode ?? (isReturn ? 'return' : 'normal')
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

  // §5.1 상태 배너는 우선순위 순. 복귀와 디로드는 **동시에 띄우지 않는다** —
  // 복귀는 이미 볼륨을 줄인 상태이므로 디로드 권고가 중복이고, 두 배너가 서로 다른
  // 숫자를 말하면 어느 쪽을 따라야 하는지 알 수 없다.
  const showReturn = Boolean(suggestion.returnStep)
  const showDeload = !showReturn && !dismissedDeload && (deload.due || deload.earlySignal)

  // §11 리스크 대응: "주 1회 백업 리마인드 배너"
  const reminder = backupReminder({
    sessionCount: done.length,
    lastBackupAt,
    configured: isGistConfigured(),
  })

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

      {showReturn && suggestion.returnStep && (
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

      {showDeload && (
        <div className="banner banner-warn" style={{ alignItems: 'flex-start' }}>
          <span>
            디로드 권장 — 세트 50%, 무게 유지
            <br />
            <small>
              {deload.due
                ? `수행 ${deload.performedWeeks}주 도달`
                : `조기 신호: ${deload.earlyDetail}`}
            </small>
          </span>
          <button onClick={() => start(suggestion.day, 'deload')}>
            <span>디로드로 시작</span>
          </button>
          <button
            onClick={() => setDismissedDeload(true)}
            style={{ background: 'transparent', marginLeft: 0 }}
          >
            <span style={{ color: 'var(--warn)' }}>나중에</span>
          </button>
        </div>
      )}

      {reminder.show && !dismissedBackup && (
        <div className="banner banner-warn" style={{ alignItems: 'flex-start' }}>
          <span>
            {reminder.configured
              ? `마지막 백업이 ${reminder.daysSince ?? '—'}일 전이에요`
              : '백업이 설정되지 않았어요'}
            <br />
            <small>설정 → Gist 백업에서 연결하면 세션 종료마다 자동으로 올라갑니다</small>
          </span>
          <button
            onClick={() => setDismissedBackup(true)}
            style={{ background: 'transparent', marginLeft: 0 }}
          >
            <span style={{ color: 'var(--warn)' }}>나중에</span>
          </button>
        </div>
      )}

      {progressions.length > 0 && (
        <div className="banner banner-info" style={{ alignItems: 'flex-start' }}>
          <span>
            증량 제안
            <br />
            <small>
              {progressions
                .map((p) => `${exerciseLabel(catalog, p.exerciseId)} ${p.from}→${p.to}kg`)
                .join(' · ')}
            </small>
          </span>
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

      <div style={{ height: 12 }} />

      <WeekDots dots={dots} target={routine.days.length} />

      <MuscleVolumeBars
        bars={volume.bars}
        sessionCount={volume.sessionCount}
        minSessionsToJudge={routine.rules.deloadMinSessionsPerWeek}
      />

      {currentPhase === 0 && (
        <div className="card">
          <div className="week-head">
            <div className="card-label" style={{ marginBottom: 0 }}>
              Phase 0 진행
            </div>
            <div className="week-count">
              {phase0.streak}/{phase0.target}주
            </div>
          </div>
          <div className="mbar-track" style={{ marginTop: 8 }}>
            <div
              className={`mbar-fill${phase0.achieved ? ' mbar-fill-met' : ''}`}
              style={{ transform: `scaleX(${Math.min(1, phase0.streak / phase0.target)})` }}
            />
          </div>
          <p className="row-sub" style={{ marginTop: 8 }}>
            주 {routine.rules.deloadMinSessionsPerWeek}회 이상 연속
            {phase0.allowanceUsed > 0 && ` · 주 ${routine.rules.deloadMinSessionsPerWeek - 1}회 통과 ${phase0.allowanceUsed}회 사용`}
            {phase0.achieved && ' · 조건 충족! 설정에서 Phase 1로 전환할 수 있어요'}
          </p>
        </div>
      )}

      <div className="card">
        <div className="week-head">
          <div className="card-label" style={{ marginBottom: 0 }}>
            디로드 카운터
          </div>
          <div className="week-count">
            {deload.performedWeeks}/{deload.target}주
          </div>
        </div>
        <div className="mbar-track" style={{ marginTop: 8 }}>
          <div
            className={`mbar-fill${deload.due ? ' mbar-fill-warn' : ''}`}
            style={{ transform: `scaleX(${Math.min(1, deload.performedWeeks / deload.target)})` }}
          />
        </div>
        <p className="row-sub" style={{ marginTop: 8 }}>
          주 {routine.rules.deloadMinSessionsPerWeek}회 이상인 주만 카운트 · 4주+ 공백이나 디로드
          수행 시 리셋
        </p>
      </div>

      {suggestion.scores.length > 0 && (
        <details className="card">
          <summary className="card-label" style={{ marginBottom: 0, cursor: 'pointer' }}>
            제안 근거 (부족분 점수)
          </summary>
          <div style={{ marginTop: 8 }}>
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
        </details>
      )}

      {picking && (
        <DayPickerSheet
          routine={routine}
          suggestedDayId={suggestion.day.id}
          onPick={(day) => start(day)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
