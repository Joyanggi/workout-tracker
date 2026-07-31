import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import ExerciseCard from '../components/ExerciseCard'
import FinishSheet from '../components/FinishSheet'
import RestTimerBar from '../components/RestTimerBar'
import { db } from '../db'
import { unlockAudio } from '../lib/beep'
import { formatElapsed } from '../lib/dates'
import { doneSets, findDay, routineExerciseOfEntry } from '../lib/derive'
import { requestSync } from '../lib/gistSync'
import { buildPrefill, sessionsForRecord, type RecordPrefill } from '../lib/prefill'
import { previewSubstitutes, type SubstitutePreview } from '../lib/substitute'
import SubstituteSheet from '../components/SubstituteSheet'
import { buildScaleMap } from '../lib/weightScale'
import { useExerciseSettings } from '../lib/useExerciseSettings'
import { useRestTimer } from '../lib/useRestTimer'
import type { RoutineBundle } from '../lib/useRoutine'
import { useSessionStore } from '../store/session'
import { useSettings } from '../store/settings'
import { parseRecordKey, type RecordKey } from '../types'

export default function SessionScreen({
  bundle,
  onFinished,
  onDiscarded,
}: {
  bundle: RoutineBundle
  onFinished: () => void
  onDiscarded: () => void
}) {
  const session = useSessionStore((s) => s.session)
  const actions = useSessionStore()
  const phase = useSettings((s) => s.currentPhase)
  const timer = useRestTimer()
  const [openKey, setOpenKey] = useState<RecordKey | null>(null)
  const [finishing, setFinishing] = useState(false)
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
  const bodyWeightKg = useSettings((st) => st.bodyWeightKg)
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
      const routineExercise = day.exercises.find((e) =>
        entry.recordKey.startsWith(`${e.exerciseId}@`),
      )
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
        }),
      )
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session은 id/dayId/키 목록으로 대표한다
  }, [sessionId, sessionDayId, entryKeys, allSessions, bundle.routine, phase, exerciseSettings])

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

  const totalPlanned = session.entries.reduce((n, e) => n + e.sets.length, 0)
  const totalDone = session.entries.reduce((n, e) => n + doneSets(e).length, 0)

  return (
    <div className="session">
      <header className="session-header">
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
              onRequestSubstitute={() => setSubstituting(entry.recordKey)}
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
