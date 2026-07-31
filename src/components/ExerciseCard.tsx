import { useState } from 'react'
import CompensationSheet from './CompensationSheet'
import NumberStepper from './NumberStepper'
import { compensationSummary, hasCompensation } from '../lib/compensation'
import { doneSets } from '../lib/derive'
import type { RecordPrefill } from '../lib/prefill'
import type { RecordKey, RoutineExercise, SessionEntry, SetRecord } from '../types'

/** 감각 점수 라벨 (루틴 문서: 목표 부위에 자극이 왔는지) */
const SENSORY_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: '안 느껴짐',
  1: '약함',
  2: '보통',
  3: '확실',
}

/**
 * 세션 화면(§5.2)과 기록 편집(§5.3)이 공유하는 운동 카드.
 *
 * store를 직접 읽지 않고 actions를 받는다 — 진행 중 세션은 useSessionStore가,
 * 과거 세션 편집은 useSessionEditor가 같은 인터페이스를 제공한다.
 * 두 화면의 입력 UI가 갈라지면 "헬스장에서 익힌 조작"이 편집 화면에서 안 통한다.
 */
export interface EntryActions {
  patchSet: (recordKey: RecordKey, index: number, patch: Partial<SetRecord>) => void
  toggleDone: (recordKey: RecordKey, index: number) => void
  addSet: (recordKey: RecordKey) => void
  removeSet: (recordKey: RecordKey, index: number) => void
  setSkipped: (recordKey: RecordKey, skipped: boolean) => void
  setSensoryScore: (recordKey: RecordKey, score: 0 | 1 | 2 | 3) => void
  setSensoryNote: (recordKey: RecordKey, note: string) => void
  setCompensation: (recordKey: RecordKey, value: string) => void
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

export default function ExerciseCard({
  entry,
  routineExercise,
  name,
  fullName,
  compensationSigns,
  prefill,
  actions,
  open,
  onToggleOpen,
  onSetChecked,
  /** 편집 모드에서는 "지난 기록" 고스트와 증량 칩을 숨긴다 (과거 세션 기준이 아니라 혼란만 준다) */
  showPrefillHints = true,
}: {
  entry: SessionEntry
  routineExercise: RoutineExercise
  name: string
  fullName: string
  compensationSigns: string[]
  prefill?: RecordPrefill
  actions: EntryActions
  open: boolean
  onToggleOpen: () => void
  onSetChecked?: (routineExercise: RoutineExercise) => void
  showPrefillHints?: boolean
}) {
  const [editingCompensation, setEditingCompensation] = useState(false)
  const done = doneSets(entry)
  const complete = done.length >= entry.sets.length
  const isB = routineExercise.group === 'B'

  const summary = showPrefillHints
    ? prefill?.lastSets.length
      ? `지난번 ${prefill.lastSets[0].weight}kg ${prefill.lastSets.map((s) => s.reps).join('/')}`
      : '첫 기록'
    : done.length > 0
      ? `${done[0].weight}kg ${done.map((s) => s.reps).join('/')}`
      : '기록 없음'

  const onCheck = (index: number, wasDone: boolean) => {
    actions.toggleDone(entry.recordKey, index)
    if (!wasDone) onSetChecked?.(routineExercise)
  }

  return (
    <div
      className={`ex-card${complete ? ' ex-card-done' : ''}${entry.skipped ? ' ex-card-skipped' : ''}`}
    >
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
          {(isB && entry.sensoryScore !== undefined) || hasCompensation(entry.compensation) ? (
            <span className="ex-sub">
              {isB && entry.sensoryScore !== undefined && (
                <span className="chip chip-accent">감각 {entry.sensoryScore}</span>
              )}
              {hasCompensation(entry.compensation) && (
                <span className="chip chip-warn" style={{ marginLeft: 4 }}>
                  {compensationSummary(entry.compensation)}
                </span>
              )}
            </span>
          ) : null}
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
            {showPrefillHints && prefill?.progression && (
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
              <div className="set-ghost">
                {showPrefillHints ? ghostText(prefill, i) || '기준 기록 없음' : ''}
              </div>
              <div className="set-inputs">
                <NumberStepper
                  value={set.weight}
                  step={2.5}
                  max={500}
                  onChange={(weight) => actions.patchSet(entry.recordKey, i, { weight })}
                  ariaLabel={`${name} ${i + 1}세트 무게`}
                />
                <NumberStepper
                  value={set.reps}
                  step={1}
                  max={100}
                  onChange={(reps) => actions.patchSet(entry.recordKey, i, { reps })}
                  ariaLabel={`${name} ${i + 1}세트 횟수`}
                />
                <button
                  className={`set-check${set.done ? ' set-check-on' : ''}`}
                  onClick={() => onCheck(i, set.done)}
                  aria-pressed={set.done}
                  aria-label={`${i + 1}세트 완료`}
                >
                  ✓
                </button>
              </div>
            </div>
          ))}

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => actions.addSet(entry.recordKey)}>
              + 세트
            </button>
            {entry.sets.length > 1 && (
              <button
                className="btn btn-sm"
                onClick={() => actions.removeSet(entry.recordKey, entry.sets.length - 1)}
              >
                − 세트
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => actions.setSkipped(entry.recordKey, !entry.skipped)}
            >
              {entry.skipped ? '스킵 해제' : '스킵'}
            </button>
          </div>

          {/* B그룹 감각 점수 (§5.2). 목표 부위에 자극이 왔는지 — "계속 0인 종목" 탐지용 */}
          {isB && (
            <div className="sub-field">
              <div className="card-label">감각 점수</div>
              <div className="segment">
                {([0, 1, 2, 3] as const).map((score) => (
                  <button
                    key={score}
                    aria-pressed={entry.sensoryScore === score}
                    onClick={() => actions.setSensoryScore(entry.recordKey, score)}
                  >
                    {score}
                  </button>
                ))}
              </div>
              <p className="row-sub">
                {entry.sensoryScore === undefined
                  ? '미입력 — 목표 부위에 자극이 왔는지'
                  : SENSORY_LABELS[entry.sensoryScore]}
              </p>
              <input
                className="field"
                value={entry.sensoryNote ?? ''}
                onChange={(e) => actions.setSensoryNote(entry.recordKey, e.target.value)}
                placeholder="어디에 어떻게 느껴졌는지 (선택)"
                aria-label={`${name} 감각 메모`}
              />
            </div>
          )}

          {/* 보상작용 — 기본값 "없음". 빈칸으로 둘 수 없다 (루틴 문서 규칙) */}
          <div className="sub-field">
            <div className="card-label">보상작용</div>
            <button
              className={`btn btn-sm${hasCompensation(entry.compensation) ? ' btn-warn' : ''}`}
              onClick={() => setEditingCompensation(true)}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ textAlign: 'left' }}>{entry.compensation}</span>
              <span aria-hidden="true">▸</span>
            </button>
          </div>
        </div>
      )}

      {editingCompensation && (
        <CompensationSheet
          exerciseName={fullName}
          signs={compensationSigns}
          current={entry.compensation}
          onSave={(next) => actions.setCompensation(entry.recordKey, next)}
          onClose={() => setEditingCompensation(false)}
        />
      )}
    </div>
  )
}
