import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import NumberStepper from '../components/NumberStepper'
import FinishSheet from '../components/FinishSheet'
import { db } from '../db'
import { formatElapsed } from '../lib/dates'
import { doneSets, findDay } from '../lib/derive'
import { buildPrefill, type RecordPrefill } from '../lib/prefill'
import type { RoutineBundle } from '../lib/useRoutine'
import { useSessionStore } from '../store/session'
import { useSettings } from '../store/settings'
import type { RecordKey, RoutineExercise, SessionEntry } from '../types'

export default function SessionScreen({
  bundle,
  onFinished,
}: {
  bundle: RoutineBundle
  onFinished: () => void
}) {
  const session = useSessionStore((s) => s.session)
  const phase = useSettings((s) => s.currentPhase)
  const [openKey, setOpenKey] = useState<RecordKey | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // 경과 시간은 매 틱마다 startedAt에서 다시 계산한다.
  // 화면 잠금으로 타이머가 멈춰도 복귀 시 값이 정확하다 (§5.2 타임스탬프 원칙).
  useEffect(() => {
    if (!session) return
    const tick = () => setElapsed(Date.now() - new Date(session.startedAt).getTime())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [session?.startedAt, session])

  const allSessions = useLiveQuery(() => db.sessions.toArray(), [], [])

  // 프리필은 저장하지 않고 매번 파생 계산한다 (앱 재시작 후 이어하기에서도 동일하게 나와야 함).
  // buildPrefill은 완료 세션만 보므로 진행 중인 현재 세션은 자동으로 제외된다.
  const prefills = useMemo(() => {
    const map = new Map<RecordKey, RecordPrefill>()
    if (!session) return map
    const day = findDay(bundle.routine, session.dayId)
    if (!day) return map
    for (const entry of session.entries) {
      const routineExercise = day.exercises.find(
        (e) => entry.recordKey.startsWith(`${e.exerciseId}@`),
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
        }),
      )
    }
    return map
  }, [session, allSessions, bundle.routine, phase])

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
          const routineExercise = day.exercises.find((e) =>
            entry.recordKey.startsWith(`${e.exerciseId}@`),
          )
          if (!routineExercise) return null
          return (
            <ExerciseCard
              key={entry.recordKey}
              entry={entry}
              routineExercise={routineExercise}
              name={bundle.catalog.get(routineExercise.exerciseId)?.shortName ?? routineExercise.exerciseId}
              prefill={prefills.get(entry.recordKey)}
              open={openKey === entry.recordKey}
              onToggleOpen={() =>
                setOpenKey(openKey === entry.recordKey ? null : entry.recordKey)
              }
            />
          )
        })}
        <p className="row-sub" style={{ textAlign: 'center', padding: '4px 0 8px' }}>
          휴식 타이머 · 감각 점수 · 보상작용 체크리스트는 마일스톤 3에서 붙습니다.
        </p>
      </div>

      {finishing && (
        <FinishSheet
          bundle={bundle}
          onClose={() => setFinishing(false)}
          onFinished={onFinished}
        />
      )}
    </div>
  )
}

function ghostText(prefill: RecordPrefill | undefined, index: number): string {
  if (!prefill) return ''
  const parts: string[] = []
  const last = prefill.lastSets[index]
  if (last) parts.push(`지난 ${last.weight}×${last.reps}`)
  const best = prefill.bestBySet[index]
  if (best && (!last || best.weight !== last.weight || best.reps !== last.reps)) {
    parts.push(`최고 ${best.weight}×${best.reps}`)
  }
  return parts.join(' · ')
}

function ExerciseCard({
  entry,
  routineExercise,
  name,
  prefill,
  open,
  onToggleOpen,
}: {
  entry: SessionEntry
  routineExercise: RoutineExercise
  name: string
  prefill: RecordPrefill | undefined
  open: boolean
  onToggleOpen: () => void
}) {
  const { patchSet, toggleDone, addSet, removeSet, setSkipped } = useSessionStore()
  const done = doneSets(entry)
  const complete = done.length >= entry.sets.length

  const summary = prefill?.lastSets.length
    ? `지난번 ${prefill.lastSets[0].weight}kg ${prefill.lastSets.map((s) => s.reps).join('/')}`
    : '첫 기록'

  return (
    <div className={`ex-card${complete ? ' ex-card-done' : ''}${entry.skipped ? ' ex-card-skipped' : ''}`}>
      <button className="ex-head" onClick={onToggleOpen} aria-expanded={open}>
        <span className="ex-order" aria-hidden="true">
          {routineExercise.plannedOrder}
        </span>
        <span className="ex-head-main">
          <span className="ex-name">
            {name}
            {entry.performedOrder !== null && (
              <span className="chip" style={{ marginLeft: 6 }}>
                {entry.performedOrder}번째 수행
              </span>
            )}
          </span>
          <span className="ex-sub">
            {entry.sets.length}세트 × {routineExercise.repMin}~{routineExercise.repMax} · {summary}
          </span>
        </span>
        <span className={`ex-count${complete ? ' ex-count-done' : ''}`}>
          {entry.skipped ? '스킵' : `${done.length}/${entry.sets.length}`}
        </span>
      </button>

      {open && (
        <div className="ex-body">
          {routineExercise.note && <p className="ex-note">{routineExercise.note}</p>}
          {routineExercise.weightHint && (
            <p className="ex-note">무게 기준: {routineExercise.weightHint}</p>
          )}
          <div className="ex-chips">
            <span className="chip">{routineExercise.group}그룹</span>
            <span className="chip">휴식 {routineExercise.restSec}초</span>
            {routineExercise.optional && <span className="chip chip-warn">컨디션 좋을 때만</span>}
            {prefill?.progression && (
              <span className="chip chip-accent">
                증량 제안 {prefill.progression.from} → {prefill.progression.to}kg
              </span>
            )}
          </div>

          <div className="set-head">
            <span>세트</span>
            <span>무게 (kg)</span>
            <span>횟수</span>
            <span />
          </div>

          {entry.sets.map((set, i) => (
            <div className="set-row" key={i}>
              <div className="set-no">{i + 1}</div>
              <div className="set-ghost">{ghostText(prefill, i) || '기준 기록 없음'}</div>
              <div className="set-inputs">
                <NumberStepper
                  value={set.weight}
                  step={2.5}
                  max={500}
                  onChange={(weight) => patchSet(entry.recordKey, i, { weight })}
                  ariaLabel={`${name} ${i + 1}세트 무게`}
                />
                <NumberStepper
                  value={set.reps}
                  step={1}
                  max={100}
                  onChange={(reps) => patchSet(entry.recordKey, i, { reps })}
                  ariaLabel={`${name} ${i + 1}세트 횟수`}
                />
                <button
                  className={`set-check${set.done ? ' set-check-on' : ''}`}
                  onClick={() => toggleDone(entry.recordKey, i)}
                  aria-pressed={set.done}
                  aria-label={`${i + 1}세트 완료`}
                >
                  ✓
                </button>
              </div>
            </div>
          ))}

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => addSet(entry.recordKey)}>
              + 세트
            </button>
            {entry.sets.length > 1 && (
              <button
                className="btn btn-sm"
                onClick={() => removeSet(entry.recordKey, entry.sets.length - 1)}
              >
                − 세트
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => setSkipped(entry.recordKey, !entry.skipped)}
            >
              {entry.skipped ? '스킵 해제' : '스킵'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
