import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import ExerciseCard from '../components/ExerciseCard'
import FinishSheet from '../components/FinishSheet'
import AddExerciseSheet from '../components/AddExerciseSheet'
import ManualTimerSheet from '../components/ManualTimerSheet'
import RestTimerBar from '../components/RestTimerBar'
import { db } from '../db'
import { unlockAudio } from '../lib/beep'
import { formatElapsed } from '../lib/dates'
import { doneSets, findDay, routineExerciseOfEntry } from '../lib/derive'
import { requestSync } from '../lib/gistSync'
import { lastNote } from '../lib/noteHistory'
import { buildPrefill, sessionsForRecord, type RecordPrefill } from '../lib/prefill'
import { previewSubstitutes, type SubstitutePreview } from '../lib/substitute'
import { compensationWatches, watchFor } from '../lib/compensationWatch'
import SubstituteSheet from '../components/SubstituteSheet'
import { buildScaleMap, isInverseKey } from '../lib/weightScale'
import { useExerciseSettings } from '../lib/useExerciseSettings'
import type { RestTimer } from '../lib/useRestTimer'
import type { RoutineBundle } from '../lib/useRoutine'
import { useSessionStore } from '../store/session'
import { tempoPhasesFor } from '../lib/tempo'
import { useSettings } from '../store/settings'
import { parseRecordKey, type RecordKey } from '../types'

export default function SessionScreen({
  bundle,
  timer,
  onMinimize,
  onFinished,
  onDiscarded,
}: {
  bundle: RoutineBundle
  onFinished: () => void
  /** App이 소유한 단일 인스턴스 (Z5) */
  timer: RestTimer
  /** 세션을 열어둔 채 탭으로 나간다 (Z5) */
  onMinimize: () => void
  onDiscarded: () => void
}) {
  const session = useSessionStore((s) => s.session)
  const actions = useSessionStore()
  const phase = useSettings((s) => s.currentPhase)
  /*
   * 타이머를 **App이 소유한다** (Z5). 여기서 `useRestTimer()`를 부르면 최소화로 탭에
   * 나갈 때 훅이 언마운트되어 **차임·카운트다운 틱이 죽는다** — endTime은 localStorage에
   * 있어 복귀 시 표시는 정확하지만, 식단 체크하러 나가 있는 동안 휴식이 끝나면 소리가 안 난다.
   * 그건 최소화 기능을 만드는 이유와 정확히 충돌한다.
   */
  const [openKey, setOpenKey] = useState<RecordKey | null>(null)
  const [finishing, setFinishing] = useState(false)
  /** 휴식 타이머 단독 시작 시트 (CC3) */
  const [manualTimer, setManualTimer] = useState(false)
  /** 종목 얹기 시트 (CC15) */
  const [addingExercise, setAddingExercise] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // 경과 시간은 매 틱마다 startedAt에서 다시 계산한다.
  // 화면 잠금으로 타이머가 멈춰도 복귀 시 값이 정확하다 (§5.2 타임스탬프 원칙).
  // 의존성은 startedAt만. session 객체 전체를 넣으면 세트를 하나 누를 때마다
  // (store가 새 객체를 만들므로) 인터벌이 해제·재생성된다.
  const startedAt = session?.startedAt
  useEffect(() => {
    if (!startedAt) return
    const tick = () => setElapsed(Date.now() - new Date(startedAt).getTime())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  const allSessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const exerciseSettings = useExerciseSettings()
  // 대체운동 (T8). 후보 계산에 세션 이력·카탈로그가 필요하므로 카드가 아니라 화면이 소유한다
  const [substituting, setSubstituting] = useState<RecordKey | null>(null)
  // 반복 보상작용 (T11). 이번 세션은 아직 완료가 아니므로 과거 기록만 본다
  const watches = useMemo(() => compensationWatches(allSessions), [allSessions])
  const bodyWeightKg = useSettings((st) => st.bodyWeightKg)
  const tempoGuide = useSettings((st) => st.tempoGuide)
  const aEccentricSec = useSettings((st) => st.aEccentricSec)
  const setBodyWeight = useSettings((st) => st.setBodyWeight)

  // 프리필은 저장하지 않고 매번 파생 계산한다 (앱 재시작 후 이어하기에서도 동일하게 나와야 함).
  // buildPrefill은 완료 세션만 보므로 진행 중인 현재 세션은 자동으로 제외된다.
  // 프리필은 **완료 세션**에서만 파생되므로 진행 중 세션의 입력과 무관하다.
  // 의존성에 session 전체를 넣으면 스테퍼를 누를 때마다 전 종목 프리필을 다시 계산한다.
  const sessionId = session?.id
  const sessionDayId = session?.dayId
  const entryKeys = session?.entries.map((e) => e.recordKey).join(',')
  const prefills = useMemo(() => {
    const map = new Map<RecordKey, RecordPrefill>()
    if (!session) return map
    const day = findDay(bundle.routine, session.dayId)
    if (!day) return map
    for (const entry of session.entries) {
      /*
        얹은 종목(CC15)은 **다른 Day의 recordKey**를 갖는다 — 이 Day의 exercises에서
        찾으면 못 찾아서 프리필이 비고, 그러면 카드가 "기준 기록 없음"을 띄운다
        (추정 시작 무게도, 지난 기록도 안 보인다). 실측에서 확인한 뒤 고쳤다.

        대체 수행(T8)의 프리필 부재는 **기존 동작이라 건드리지 않는다** —
        `firstExposure`·캘리브레이션 칩이 "prefill.best가 없다"를 신호로 쓰고 있어서,
        여기서 채우면 그 판정이 바뀐다. 이 라운드의 범위가 아니다.
      */
      const routineExercise =
        day.exercises.find((e) => entry.recordKey.startsWith(`${e.exerciseId}@`)) ??
        (entry.extra ? routineExerciseOfEntry(bundle.routine, entry) : undefined)
      if (!routineExercise) continue
      map.set(
        entry.recordKey,
        buildPrefill({
          sessions: allSessions,
          routine: bundle.routine,
          recordKey: entry.recordKey,
          routineExercise,
          phase,
          scales: buildScaleMap(exerciseSettings, bundle.routine.rules.weightIncrementKg),
          inverse: isInverseKey(bundle.catalog, entry.recordKey),
          // 첫 기록 시작 무게 추정 (CC13) — 둘 중 하나가 없으면 추정하지 않는다
          bodyWeightKg,
          startWeightPctBW: bundle.catalog.get(routineExercise.exerciseId)?.startWeightPctBW,
        }),
      )
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session은 id/dayId/키 목록으로 대표한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionId,
    sessionDayId,
    entryKeys,
    allSessions,
    bundle.routine,
    bundle.catalog,
    phase,
    exerciseSettings,
    bodyWeightKg,
  ])

  // 첫 진입 시 아직 손대지 않은 첫 종목을 펼쳐둔다.
  // openKey를 조건으로 쓰면 사용자가 카드를 접을 때(openKey → null) 다른 카드가
  // 즉시 열려서 "접기"가 동작하지 않는 것처럼 보인다. 세션당 한 번만 실행한다.
  const autoOpened = useRef<string | null>(null)
  useEffect(() => {
    if (!session || autoOpened.current === session.id) return
    autoOpened.current = session.id
    const next = session.entries.find((e) => !e.skipped && doneSets(e).length === 0)
    if (next) setOpenKey(next.recordKey)
  }, [session])

  /** 대체 종목의 직전 기록 — 있으면 환산하지 않고 그 무게를 쓴다 (계획서 규칙 1) */
  const lastRecordOf = (recordKey: RecordKey) => {
    const found = sessionsForRecord(allSessions, recordKey)[0]
    const entry = found?.entries.find((e) => e.recordKey === recordKey)
    const sets = entry ? doneSets(entry) : []
    if (sets.length === 0) return undefined
    return { weight: Math.max(...sets.map((x) => x.weight)), reps: sets[sets.length - 1].reps }
  }

  if (!session) {
    return <p className="center-note">진행 중인 세션이 없습니다.</p>
  }

  const day = findDay(bundle.routine, session.dayId)
  if (!day) {
    return <p className="center-note">이 세션의 Day 정의를 찾을 수 없습니다 ({session.dayId}).</p>
  }

  /*
    열려 있는 카드의 휴식·이름 (CC3 기본값). 카드가 안 열려 있으면 undefined —
    시트가 90초를 기본으로 쓴다.
  */
  const openEntry = session.entries.find((e) => e.recordKey === openKey)
  const openRoutineExercise = openEntry
    ? routineExerciseOfEntry(bundle.routine, openEntry)
    : undefined
  const openRestSec = openRoutineExercise?.restSec
  const openExerciseName = openRoutineExercise
    ? (bundle.catalog.get(openRoutineExercise.exerciseId)?.shortName ??
      openRoutineExercise.exerciseId)
    : undefined

  const totalPlanned = session.entries.reduce((n, e) => n + e.sets.length, 0)
  const totalDone = session.entries.reduce((n, e) => n + doneSets(e).length, 0)

  return (
    <div className="session">
      <header className="session-header">
        {/*
          최소화 (Z5) — 세션을 열어둔 채 탭으로 나간다. 파괴적 동작이 아니므로
          종료 버튼과 시각적으로 구분한다. 세션 상태는 store + Dexie에 있어
          화면을 떠나는 것 자체는 데이터에 아무 위험이 없다.
        */}
        <button className="session-minimize" onClick={onMinimize} aria-label="세션 최소화">
          ‹
        </button>
        <div>
          <div className="session-day">{day.name}</div>
          <div className="session-meta">
            {formatElapsed(elapsed)} · {totalDone}/{totalPlanned}세트
            {session.mode !== 'normal' && (
              <span className="chip chip-warn" style={{ marginLeft: 6 }}>
                {session.mode === 'return' ? '복귀' : '디로드'}
              </span>
            )}
          </div>
        </div>
        {/*
          휴식 타이머 단독 시작 (CC3). 세트 체크와 무관하게 쓰는 맥락(자리 이동·스트레칭)이
          세션 중이므로 여기 둔다. App이 소유한 타이머 하나를 그대로 시작시킨다.
        */}
        <button
          className="session-timer-btn"
          onClick={() => setManualTimer(true)}
          aria-label="휴식 타이머 시작"
        >
          ⏱
        </button>
        <button className="session-end" onClick={() => setFinishing(true)}>
          종료
        </button>
      </header>

      <div className="session-body">
        {session.entries.map((entry) => {
          // 대체 수행(T8)은 루틴에 없는 종목이므로 day.exercises에서 찾으면 카드가 사라진다.
          // routineExerciseOfEntry가 원 종목 계획을 되짚어 준다.
          const routineExercise = routineExerciseOfEntry(bundle.routine, entry)
          if (!routineExercise) return null
          const exercise = bundle.catalog.get(routineExercise.exerciseId)
          const originName = entry.substituteFor
            ? (bundle.catalog.get(parseRecordKey(entry.substituteFor).exerciseId)?.shortName ??
              parseRecordKey(entry.substituteFor).exerciseId)
            : undefined
          return (
            <ExerciseCard
              key={entry.recordKey}
              entry={entry}
              routineExercise={routineExercise}
              name={exercise?.shortName ?? routineExercise.exerciseId}
              fullName={exercise?.name ?? routineExercise.exerciseId}
              cueTip={exercise?.cueTip}
              compensationSigns={exercise?.compensationSigns ?? []}
              defaultStep={bundle.routine.rules.weightIncrementKg}
              substituteForName={originName}
              isExtra={entry.extra === true}
              inverseWeight={isInverseKey(bundle.catalog, entry.recordKey)}
              allowZeroWeight={exercise?.allowZeroWeight === true}
              /* 직전 메모 (CC14) — 저장된 감각 메모에서 파생, 새 저장소 없음 */
              previousNote={lastNote(allSessions, entry.recordKey)}
              onRequestSubstitute={() => setSubstituting(entry.recordKey)}
              compensationWatch={watchFor(watches, entry.recordKey)}
              tempoGuide={tempoGuide}
              /* 종목 오버라이드(CC5) + A그룹 이완 설정(CC16)의 갈림은 tempoPhasesFor 한 곳 */
              tempoPhases={tempoPhasesFor(exercise?.tempo, routineExercise.group, aEccentricSec)}
              prefill={prefills.get(entry.recordKey)}
              showProgression={session.mode === 'normal'}
              actions={actions}
              open={openKey === entry.recordKey}
              onToggleOpen={() => setOpenKey(openKey === entry.recordKey ? null : entry.recordKey)}
              onSetChecked={(ex) => {
                // AudioContext는 사용자 제스처 안에서만 열 수 있다. 90~150초 뒤 비프음이
                // 제스처 없이 울리므로 여기서 미리 열어둔다 (lib/beep.ts 주석 참조).
                unlockAudio()
                timer.start(ex.restSec, exercise?.shortName ?? ex.exerciseId)
              }}
            />
          )
        })}

        {/*
          종목 얹기 (CC15). 카드 목록 **끝**에 둔다 — 계획된 종목을 먼저 보고 나서
          "머신이 차 있다"를 판단하는 순서이고, 상단에 두면 계획을 밀어낸다.
        */}
        <button className="btn btn-sm" onClick={() => setAddingExercise(true)}>
          + 종목 추가
        </button>
      </div>

      <RestTimerBar timer={timer} />

      {substituting !== null &&
        (() => {
          const entry = session.entries.find((e) => e.recordKey === substituting)
          const planned = entry ? routineExerciseOfEntry(bundle.routine, entry) : undefined
          if (!entry || !planned) return null
          // 후보는 **원 종목**의 것을 쓴다 — 대체를 또 대체하는 경우에도 기준은 원 종목이다
          const originKey = entry.substituteFor ?? entry.recordKey
          const originId = parseRecordKey(originKey).exerciseId
          const prefill = prefills.get(entry.recordKey)
          const previews = previewSubstitutes({
            originalRecordKey: originKey,
            originalBest: prefill?.best ?? lastRecordOf(originKey),
            originalRepMax: planned.repMax,
            options: bundle.catalog.get(originId)?.substitutes ?? [],
            catalog: bundle.catalog,
            lastRecordOf,
            bodyWeightKg,
          }).filter((p) => p.option.exerciseId !== parseRecordKey(entry.recordKey).exerciseId)

          const apply = (preview: SubstitutePreview) => {
            actions.substitute(entry.recordKey, {
              recordKey: preview.recordKey,
              setCount: planned.sets,
              weight: preview.startWeight ?? 0,
              reps: planned.repMin,
            })
            setSubstituting(null)
            setOpenKey(preview.recordKey)
          }

          return (
            <SubstituteSheet
              originalName={bundle.catalog.get(originId)?.shortName ?? originId}
              previews={previews}
              bodyWeightKg={bodyWeightKg}
              onSaveBodyWeight={(kg) => void setBodyWeight(kg)}
              onSelect={apply}
              onClose={() => setSubstituting(null)}
            />
          )
        })()}

      {addingExercise && (
        <AddExerciseSheet
          bundle={bundle}
          existing={session.entries.map((e) => e.recordKey)}
          onAdd={({ recordKey, setCount, repMin }) => {
            /*
              무게는 그 종목의 프리필에서 온다 (CC15+CC13) — 세션 생성과 같은 규칙이라
              얹은 종목도 "지난 기록" 또는 "추정 시작 무게"를 그대로 받는다.
            */
            const routineEx = bundle.routine.days
              .flatMap((d) => d.exercises)
              .find((e) => recordKey.startsWith(`${e.exerciseId}@`))
            const prefill = routineEx
              ? buildPrefill({
                  sessions: allSessions,
                  routine: bundle.routine,
                  recordKey,
                  routineExercise: routineEx,
                  phase,
                  scales: buildScaleMap(exerciseSettings, bundle.routine.rules.weightIncrementKg),
                  inverse: isInverseKey(bundle.catalog, recordKey),
                  bodyWeightKg,
                  startWeightPctBW: bundle.catalog.get(routineEx.exerciseId)?.startWeightPctBW,
                })
              : undefined
            const base = prefill
              ? (prefill.bestBySet[0] ?? prefill.best)
              : undefined
            actions.addExercise({
              recordKey,
              setCount,
              weight: base?.weight ?? prefill?.startEstimate ?? 0,
              reps: base?.reps ?? repMin,
            })
            setOpenKey(recordKey)
          }}
          onClose={() => setAddingExercise(false)}
        />
      )}

      {manualTimer && (
        <ManualTimerSheet
          /* 열려 있는 종목의 휴식이 기본값이다 — 지금 쓰려는 것이 대개 그 휴식이다 (CC3) */
          defaultSec={openRestSec}
          defaultLabel={openExerciseName}
          onStart={(sec, label) => timer.start(sec, label)}
          onClose={() => setManualTimer(false)}
        />
      )}

      {finishing && (
        <FinishSheet
          bundle={bundle}
          onClose={() => setFinishing(false)}
          onFinished={() => {
            // 타이머는 localStorage에 남아 있으므로 세션이 끝날 때 반드시 지운다.
            // 그냥 두면 다음 세션을 시작할 때 이전 세션의 휴식이 되살아난다
            // (endTime이 아직 미래인 경우 — 마지막 세트 직후에 종료하면 흔하다).
            timer.dismiss()
            // §5.5 "세션 종료마다 debounce 동기화". 토큰이 없으면 아무것도 하지 않는다
            requestSync()
            onFinished()
          }}
          onDiscarded={() => {
            timer.dismiss()
            onDiscarded()
          }}
        />
      )}
    </div>
  )
}
