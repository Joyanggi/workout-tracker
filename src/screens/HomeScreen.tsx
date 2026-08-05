import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import DayPickerSheet from '../components/DayPickerSheet'
import MuscleVolumeBars from '../components/MuscleVolumeBars'
import OpenSessionSheet from '../components/OpenSessionSheet'
import WeekDots from '../components/WeekDots'
import { db } from '../db'
import {
  deloadState,
  lastSessionOf,
  muscleBars,
  phase0Progress,
  strengthCountThisWeek,
  weekDots,
} from '../lib/dashboard'
import { todayLocal } from '../lib/dates'
import { phaseReadiness } from '../lib/phaseReadiness'
import { backupReminder, isGistConfigured } from '../lib/gistSync'
import { completedSessions, findDay } from '../lib/derive'
import { ADHERENCE_MARK, nextUnloggedSlot, summarizeDietDay } from '../lib/diet'
import { findPlan, useDiet } from '../lib/useDiet'
import { storageAtRisk } from '../lib/platform'
import { progressionSuggestions } from '../lib/progression'
import { bannerWatches, compensationWatches } from '../lib/compensationWatch'
import { buildScaleMap, formatProgression, isInverseKey } from '../lib/weightScale'
import { useExerciseSettings } from '../lib/useExerciseSettings'
import { buildSession, withJustFinished } from '../lib/sessionFactory'
import { bannerQueue, type BannerId } from '../lib/bannerQueue'
import { dayChoiceReason, displayDay, pickedIdFor } from '../lib/dayChoice'
import { suggestNextDay } from '../lib/suggestNextDay'
import { exerciseLabel, useRoutine } from '../lib/useRoutine'
import { useSessionStore } from '../store/session'
import { useSettings } from '../store/settings'
import { BANNER_BACKUP, BANNER_COMPENSATION, BANNER_DELOAD, BANNER_PHASE, useUi } from '../store/ui'
import { parseRecordKey, type Phase, type RoutineDay, type Session, type SessionMode } from '../types'

export default function HomeScreen({
  onEnterSession,
  onOpenDiet,
}: {
  onEnterSession: () => void
  /** 식단 탭으로 이동 (D5 칩) */
  onOpenDiet: () => void
}) {
  const bundle = useRoutine()
  const currentPhase = useSettings((s) => s.currentPhase)
  const setPhase = useSettings((s) => s.setPhase)
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const exerciseSettings = useExerciseSettings()
  const openSession = useSessionStore((s) => s.session)
  const begin = useSessionStore((s) => s.begin)
  const finishSession = useSessionStore((s) => s.finish)
  const discardSession = useSessionStore((s) => s.discard)
  const [picking, setPicking] = useState(false)
  /*
   * 직접 고른 Day (AA1). **저장하지 않는다** — 탭을 옮겼다 돌아오면 제안으로 돌아간다.
   * 다음 날 열었을 때 어제의 수동 선택이 남아 있는 것이 더 나쁜 실패다 (파생값 비저장 원칙).
   */
  const [pickedDayId, setPickedDayId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ day: RoutineDay; forceMode?: SessionMode } | null>(null)
  /*
   * 접힌 배너 전개 (BB4). 컴포넌트 상태로 둔다 — dismiss와 달리 "지금 한 번 펼쳐 본다"는
   * 뜻이고, 탭을 옮겼다 돌아오면 다시 접혀 있는 것이 맞다 (AA1의 선택 상태와 같은 결).
   */
  const [bannersOpen, setBannersOpen] = useState(false)
  const [applyReturn, setApplyReturn] = useState(true)
  // 탭을 옮겨도 dismiss가 유지되도록 스토어에 둔다 (store/ui.ts 주석 참조)
  const dismissed = useUi((s) => s.dismissed)
  const dismiss = useUi((s) => s.dismiss)
  const lastBackupAt = useLiveQuery(
    async () => ((await db.settings.get('lastBackupAt'))?.value as string | undefined) ?? null,
    [],
    null,
  )

  const today = todayLocal()

  /*
   * 식단 한 줄 칩 (D5).
   *
   * **새 카드로 만들지 않았다.** 홈은 배너 없이도 이미 뷰포트 1.7배(1,382px)이고,
   * 계획서가 "홈 과밀이면 뺀다"고 했다. 대신 탭하면 식단 탭으로 가는 40px 한 줄만 둔다 —
   * 정보를 복제하는 것이 아니라 "지금 뭘 먹어야 하나"의 진입점 역할이다.
   */
  const diet = useDiet()
  const dietChip = useMemo(() => {
    const stored = diet.days.find((d) => d.date === today)
    const plan = findPlan(diet.plans, stored?.planId ?? diet.defaultPlanId)
    if (!plan) return null
    /*
     * 훈련일 여부를 **여기서 다시 계산하지 않는다** (X3).
     * `useDiet`가 읽기 경계에서 이미 정규화한다 (`diet.resolveTrainingDays`).
     * 이 자리에 `trained || stored` 사본이 남아 있었는데, 그게 바로 B2 결함의 형태다 —
     * 정규화를 한 곳으로 모았는데 사본 하나가 살아남아 기준이 갈렸다.
     */
    const summary = summarizeDietDay(plan, stored)
    return {
      next: nextUnloggedSlot(plan, stored, stored?.isTrainingDay ?? false),
      summary,
    }
  }, [diet.days, diet.plans, diet.defaultPlanId, today])

  const dash = useMemo(() => {
    if (!bundle) return undefined
    const { routine } = bundle
    const last = lastSessionOf(sessions)
    return {
      suggestion: suggestNextDay({ sessions, routine, today }),
      dots: weekDots(sessions, today),
      strengthWeek: strengthCountThisWeek(sessions, today),
      volume: muscleBars(sessions, routine, today),
      deload: deloadState(sessions, routine, today),
      phase0: phase0Progress(sessions, routine, today),
      progressions: last
        ? progressionSuggestions(
            last,
            routine,
            currentPhase,
            buildScaleMap(exerciseSettings, routine.rules.weightIncrementKg),
            bundle.catalog,
          )
        : [],
      phase: phaseReadiness(sessions, routine, currentPhase, today),
      // 반복 보상작용 (T11) — 연속으로 계속 나오는 것만 배너로
      watches: bannerWatches(compensationWatches(sessions)),
    }
  }, [bundle, sessions, today, currentPhase, exerciseSettings])

  if (!bundle || !dash) {
    return (
      <div className="screen">
        <p className="center-note">루틴을 불러오는 중…</p>
      </div>
    )
  }

  const { routine, catalog } = bundle
  const { suggestion, dots, volume, deload, phase0, progressions, phase, watches } = dash
  const done = completedSessions(sessions)

  /**
   * 새 세션을 만든다.
   *
   * `justFinished`는 **방금 마감한 세션**이다 (R4). `sessions`는 useLiveQuery의 값이라
   * 마감 직후에는 아직 갱신되지 않았고, 그 낡은 목록으로 프리필을 만들면 방금 한 기록이
   * 다음 세션에 반영되지 않는다 — "마감하고 새로 시작"에서 프리필이 한 세션 뒤처진다.
   * id로 중복을 제거해 합류시킨다 (live query가 이미 갱신됐을 수도 있다).
   */
  const create = (day: RoutineDay, forceMode?: SessionMode, justFinished?: Session | null) => {
    // 복귀는 **공백 상태**이지 Day의 속성이 아니다. 바텀시트로 다른 Day를 골라도
    // 14일+ 공백이면 복귀 프로토콜을 적용해야 한다 (이전에는 제안 Day만 적용됐다).
    const isReturn = forceMode === undefined && Boolean(suggestion.returnStep) && applyReturn
    const mode: SessionMode = forceMode ?? (isReturn ? 'return' : 'normal')
    return buildSession({
      routine,
      day,
      mode,
      sessions: withJustFinished(sessions, justFinished),
      phase: currentPhase,
      today,
      returnStep: isReturn ? suggestion.returnStep : undefined,
      isInverse: (rk) => isInverseKey(catalog, rk),
      // 없으면 프리필이 전역 2.5를 써서 칩과 실제 세트 무게가 어긋난다 (F6)
      scales: buildScaleMap(exerciseSettings, routine.rules.weightIncrementKg),
    }).session
  }

  const start = (day: RoutineDay, forceMode?: SessionMode) => {
    setPicking(false)
    // 시작하면 override를 지운다 (AA1) — 다음에 홈으로 돌아왔을 때는 다시 제안이 기준이다
    setPickedDayId(null)
    // 진행 중 세션이 있으면 덮어쓰지 않고 처리 방법을 먼저 묻는다 (store.begin이 거부한다)
    if (openSession) {
      setPending({ day, forceMode })
      return
    }
    begin(create(day, forceMode))
    onEnterSession()
  }

  /** OpenSessionSheet에서 기존 세션을 정리한 뒤 대기 중이던 Day로 시작 */
  const startPending = async (resolve: 'finish' | 'discard') => {
    if (!pending) return
    // finish()가 반환하는 세션을 그대로 넘긴다 — live query 갱신을 기다리지 않는다
    const finished = resolve === 'finish' ? await finishSession() : null
    if (resolve === 'discard') await discardSession()
    begin(create(pending.day, pending.forceMode, finished))
    setPending(null)
    onEnterSession()
  }

  /*
   * 카드·시작 버튼·디로드 시작이 **같은 Day를 가리킨다** (AA1).
   * 각자 고르면 보이는 Day와 시작되는 Day가 갈라진다 — `dayChoice`가 그 한 점이다.
   */
  const displayed = displayDay(routine, pickedDayId, suggestion.day)

  // §11 리스크 대응: "주 1회 백업 리마인드 배너"
  const reminder = backupReminder({
    sessionCount: done.length,
    lastBackupAt,
    configured: isGistConfigured(),
  })

  /*
   * 배너 우선순위·상호 배제를 `bannerQueue`가 판정한다 (BB4).
   *
   * 예전에는 여섯 개 조건식이 `!showReturn && !showDeload && …`를 손으로 이어 붙였고,
   * **몇 개가 동시에 뜨는지 아무도 계산하지 않았다** (백업 + 증량 + 보상작용이 실제로
   * 함께 쌓였다). 규칙은 그대로 옮겼고, 화면은 큐에서 렌더한다.
   */
  const queue = bannerQueue(
    {
      hasReturn: Boolean(suggestion.returnStep),
      deloadDue: deload.due || deload.earlySignal,
      backupDue: reminder.show,
      phaseReady: phase.allMet && phase.to !== null,
      hasWatches: watches.length > 0,
      hasProgressions: progressions.length > 0,
    },
    dismissed,
  )

  /*
   * 배너 본문. 큐가 순서를 정하고 이 맵이 그림을 정한다 — 조건은 이 안에 없다.
   * (조건을 여기 또 적으면 큐와 화면이 서로 다른 답을 낼 수 있다.)
   */
  const BANNER_VIEW: Record<BannerId, JSX.Element> = {
    return: (
      <div className="banner banner-info" style={{ alignItems: 'flex-start' }} key="return">
        <span>
          {suggestion.gapDays}일 공백 — 무게 {suggestion.returnStep?.weightPct}%, 세트{' '}
          {suggestion.returnStep?.setPct}%, RIR {suggestion.returnStep?.targetRIR}로 복귀할까요?
          <br />
          <small>{suggestion.returnStep?.rampWeeks}주간 램프업</small>
        </span>
        <button onClick={() => setApplyReturn(!applyReturn)}>
          <span>{applyReturn ? '적용됨' : '무시'}</span>
        </button>
      </div>
    ),
    deload: (
      <div className="banner banner-warn" style={{ alignItems: 'flex-start' }} key="deload">
        <span>
          디로드 권장 — 세트 50%, 무게 유지
          <br />
          <small>
            {deload.due ? `수행 ${deload.performedWeeks}주 도달` : `조기 신호: ${deload.earlyDetail}`}
          </small>
        </span>
        {/*
          디로드는 그대로 1단이다 (라벨이 이미 "시작"이므로 맞다). 다만 **카드에 보이는
          Day**로 시작한다 — 직접 고른 Day가 있는데 배너가 제안 Day를 시작하면 화면이
          말한 것과 다른 세션이 만들어진다 (AA1).
        */}
        <button onClick={() => start(displayed, 'deload')}>
          <span>디로드로 시작</span>
        </button>
        <button
          onClick={() => dismiss(BANNER_DELOAD)}
          style={{ background: 'transparent', marginLeft: 0 }}
        >
          <span style={{ color: 'var(--warn)' }}>나중에</span>
        </button>
      </div>
    ),
    backup: (
      <div className="banner banner-warn" style={{ alignItems: 'flex-start' }} key="backup">
        <span>
          {reminder.configured
            ? `마지막 백업이 ${reminder.daysSince ?? '—'}일 전이에요`
            : '백업이 설정되지 않았어요'}
          <br />
          <small>설정 → Gist 백업에서 연결하면 세션 종료마다 자동으로 올라갑니다</small>
        </span>
        <button
          onClick={() => dismiss(BANNER_BACKUP)}
          style={{ background: 'transparent', marginLeft: 0 }}
        >
          <span style={{ color: 'var(--warn)' }}>나중에</span>
        </button>
      </div>
    ),
    phase: (
      <div className="banner banner-ok" style={{ alignItems: 'flex-start' }} key="phase">
        <span>
          Phase {phase.from} 조건을 모두 충족했어요
          <br />
          <small>{phase.checks.map((c) => c.detail).join(' · ')}</small>
        </span>
        <button onClick={() => void setPhase(phase.to as Phase)}>
          <span>Phase {phase.to}로 전환</span>
        </button>
        <button
          onClick={() => dismiss(BANNER_PHASE)}
          style={{ background: 'transparent', marginLeft: 0 }}
        >
          <span style={{ color: 'var(--ok)' }}>나중에</span>
        </button>
      </div>
    ),
    compensation: (
      <div className="banner banner-warn" style={{ alignItems: 'flex-start' }} key="compensation">
        <span>
          보상작용 반복 — 무게 하향 검토
          <br />
          <small>
            {watches
              .map(
                (w) =>
                  `${exerciseLabel(catalog, parseRecordKey(w.recordKey).exerciseId)} ${w.streak}회 연속`,
              )
              .join(' · ')}
          </small>
        </span>
        <button
          onClick={() => dismiss(BANNER_COMPENSATION)}
          style={{ background: 'transparent', marginLeft: 'auto' }}
        >
          <span style={{ color: 'var(--warn)' }}>나중에</span>
        </button>
      </div>
    ),
    progression: (
      <div className="banner banner-info" style={{ alignItems: 'flex-start' }} key="progression">
        <span>
          증량 제안
          <br />
          <small>
            {progressions
              .map(
                (p) =>
                  `${exerciseLabel(catalog, p.exerciseId)} ${formatProgression(p.from, p.to, p.inverse)}`,
              )
              .join(' · ')}
          </small>
        </span>
      </div>
    ),
  }

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

      {/*
        §11 리스크 대응(세션 도중 앱이 죽어도 이어서 진행)은 **재개 스트립**이 대신한다 (Z5).
        스트립은 탭바 위에 고정되어 어느 탭에서든 보이므로 홈 전용 배너보다 넓게 커버하고,
        같은 정보가 홈에서만 두 줄로 뜨는 것을 피한다.
      */}

      {/*
        배너는 **첫 번째만 펼친다** (BB4). 나머지는 "다른 알림 N개"로 접어 둔다 —
        조건 배제 규칙이 있어도 백업 + 증량 + 보상작용처럼 축이 다른 배너는 함께 쌓이고,
        첫 화면이 경고로 가득 차면 어느 것도 읽히지 않는다.

        순서·배제 판정은 `bannerQueue`가 한다. 여기서 다시 조건을 쓰지 않는 것이 요점이다.
      */}
      {queue.slice(0, bannersOpen ? queue.length : 1).map((id) => BANNER_VIEW[id])}

      {queue.length > 1 && (
        <button className="banner-more" onClick={() => setBannersOpen(!bannersOpen)}>
          {bannersOpen ? '알림 접기 ▴' : `다른 알림 ${queue.length - 1}개 ▾`}
        </button>
      )}

      {dietChip && (
        <button className="diet-chip" onClick={onOpenDiet}>
          <span>
            {/*
              전부 기록한 날에 "완료"라고 쓰면 안 된다 — 모든 끼니를 치팅으로 기록한 날도
              "완료"가 되어 성공처럼 읽힌다 (실측에서 단백질 0g인데 "기록 완료"가 떴다).
              기록을 다 했으면 **판정 마크**를 보여준다.
            */}
            {dietChip.next
              ? `다음 식단 ${dietChip.next.name} ${dietChip.next.timeHint}`
              : `오늘 식단 ${ADHERENCE_MARK[dietChip.summary.adherence]}`}
          </span>
          <span className="diet-chip-value">
            단백질 {dietChip.summary.proteinG}/{dietChip.summary.targetProteinG}g ▸
          </span>
        </button>
      )}

      {/*
        카드 탭으로 시트가 열리는 경로는 유지한다 (아는 사람의 지름길). 다만 하단
        텍스트 힌트("탭해서 다른 Day 선택 ▸")는 제거했다 (AA2) — 보이는 [변경] 버튼이
        생겼으므로 중복이고, 힌트는 **읽는 사람**에게만 보이고 버튼은 훑는 사람에게도 보인다.
      */}
      <button className="card today-card today-card-btn" onClick={() => setPicking(true)}>
        <div className="card-label">다음 운동</div>
        <div className="today-day">{displayed.name}</div>
        <div className="today-sub">{displayed.subtitle}</div>
        <div className="today-reason">
          {dayChoiceReason(pickedDayId, suggestion.day, suggestion.reason)}
        </div>
        <div className="today-sub" style={{ marginTop: 8 }}>
          {displayed.exercises
            .slice()
            .sort((a, b) => a.plannedOrder - b.plannedOrder)
            .map((ex) => exerciseLabel(catalog, ex.exerciseId))
            .join(' · ')}
        </div>
      </button>

      {/*
        시작이 주 동작이고 [변경]은 곁이다 (AA2). "변경 → 고르기 → 시작"이 AA1의 선택
        모델과 정확히 짝이 맞는다 — 시트는 선택만 바꾸고 시작은 항상 이 버튼이다.
      */}
      <div className="btn-row start-row">
        <button className="btn btn-primary btn-start" onClick={() => start(displayed)}>
          {displayed.name} 시작
        </button>
        <button className="btn btn-change" onClick={() => setPicking(true)}>
          변경
        </button>
      </div>

      <div style={{ height: 12 }} />

      <WeekDots dots={dots} target={routine.days.length} strengthCount={dash.strengthWeek} />

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

      {pending && openSession && (
        <OpenSessionSheet
          bundle={bundle}
          openSession={openSession}
          onResume={() => {
            setPending(null)
            onEnterSession()
          }}
          onFinishAndStart={() => void startPending('finish')}
          onDiscardAndStart={() => void startPending('discard')}
          onClose={() => setPending(null)}
        />
      )}

      {picking && (
        <DayPickerSheet
          routine={routine}
          suggestedDayId={suggestion.day.id}
          pickedDayId={pickedDayId}
          /*
            **시트는 선택만 바꾼다** (AA1) — 세션을 만들지 않는다.
            제안 Day를 다시 고르면 override가 지워진다 (pickedIdFor).
          */
          onPick={(day) => {
            setPickedDayId(pickedIdFor(day.id, suggestion.day.id))
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
