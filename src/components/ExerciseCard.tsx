import { useEffect, useState } from 'react'
import CompensationSheet from './CompensationSheet'
import NumberStepper from './NumberStepper'
import { getExerciseNote, setExerciseNote } from '../db'
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
  cueTip,
  compensationSigns,
  prefill,
  actions,
  open,
  onToggleOpen,
  onSetChecked,
  /** 편집 모드에서는 "지난 기록" 고스트와 증량 칩을 숨긴다 (과거 세션 기준이 아니라 혼란만 준다) */
  showPrefillHints = true,
  /**
   * 디로드·복귀 세션에서는 증량 칩을 숨긴다.
   * 프리필 무게가 이미 증량을 무시하는데(defaultSetFor) 칩만 "+2.5kg 제안"이라고
   * 뜨면 화면이 서로 다른 말을 한다.
   */
  showProgression = true,
}: {
  entry: SessionEntry
  routineExercise: RoutineExercise
  name: string
  fullName: string
  cueTip?: string
  compensationSigns: string[]
  prefill?: RecordPrefill
  actions: EntryActions
  open: boolean
  onToggleOpen: () => void
  onSetChecked?: (routineExercise: RoutineExercise) => void
  showPrefillHints?: boolean
  showProgression?: boolean
}) {
  const [editingCompensation, setEditingCompensation] = useState(false)
  // 머신 세팅 메모 (T4). recordKey에 붙는 고정값이라 세션 상태와 별도로 읽고 쓴다
  const [setupNote, setSetupNote] = useState<string | null>(null)
  const [editingSetup, setEditingSetup] = useState(false)
  useEffect(() => {
    let cancelled = false
    void getExerciseNote(entry.recordKey).then((n) => {
      if (!cancelled) setSetupNote(n)
    })
    return () => {
      cancelled = true
    }
  }, [entry.recordKey])
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
          {/*
            자극 요령. 접지 않고 항상 노출한다 — B그룹은 감각 점수를 매겨야 하는데
            무엇을 느껴야 하는지 모르면 점수 자체가 무의미해진다.
          */}
          {cueTip && <p className="ex-cue">💡 {cueTip}</p>}

          {/*
            머신 세팅 메모 (T4). 세션 기록이 아니라 종목에 붙는 고정값이라,
            다음 세션에도 같은 값이 그대로 보인다 — 매번 세팅을 다시 찾지 않는 것이 목적이다.
          */}
          {editingSetup ? (
            <div className="setup-edit">
              <input
                className="field"
                value={setupNote ?? ''}
                onChange={(e) => setSetupNote(e.target.value)}
                placeholder="예: 시트 3칸, 등받이 2"
                aria-label={`${name} 머신 세팅 메모`}
                autoFocus
              />
              <button
                className="btn btn-sm"
                onClick={() => {
                  void setExerciseNote(entry.recordKey, setupNote ?? '')
                  setEditingSetup(false)
                }}
              >
                저장
              </button>
            </div>
          ) : (
            <button className="setup-row" onClick={() => setEditingSetup(true)}>
              <span aria-hidden="true">🔧</span>
              <span className={setupNote ? 'setup-value' : 'setup-empty'}>
                {setupNote || '머신 세팅 메모 추가'}
              </span>
              <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>
                ✎
              </span>
            </button>
          )}
          <div className="ex-chips">
            <span className="chip">{routineExercise.group}그룹</span>
            <span className="chip">휴식 {routineExercise.restSec}초</span>
            {routineExercise.optional && <span className="chip chip-warn">컨디션 좋을 때만</span>}
            {showPrefillHints && showProgression && prefill?.progression && (
              <span className="chip chip-accent">
                증량 제안 {prefill.progression.from} → {prefill.progression.to}kg
              </span>
            )}
          </div>

          <div className="set-head">
            <span>세트</span>
            <span>무게 (kg)</span>
            <span>횟수</span>
          </div>

          {entry.sets.map((set, i) => (
            /*
              체크 버튼을 고스트 줄로 올려 입력 행을 전폭으로 쓴다.
              §9는 숫자 24px+와 터치 타깃 44pt를 동시에 요구하는데, 한 줄에 [스테퍼][스테퍼][체크]를
              넣으면 375px에서 숫자 자리가 32px밖에 안 남아 24px 폰트의 "42.5"가 잘린다.
              무게는 4자("42.5"), 횟수는 2자라 1.3:1로 배분한다.
            */
            /*
              key={i}는 **세트를 끝에서만 제거**하는 현재 UI에서만 안전하다.
              중간 제거를 추가하면 NumberStepper의 편집 중 로컬 상태가 옆 세트로 옮겨 붙는다.
              그때는 SetRecord에 id를 추가해야 한다 (persist되는 타입이라 백업 스키마도 함께).
            */
            <div className="set-row" key={i}>
              <div className="set-no">{i + 1}</div>
              <div className="set-meta">
                <span className="set-ghost">
                  {showPrefillHints ? ghostText(prefill, i) || '기준 기록 없음' : ''}
                </span>
                <button
                  className={`set-check${set.done ? ' set-check-on' : ''}`}
                  onClick={() => onCheck(i, set.done)}
                  aria-pressed={set.done}
                  aria-label={`${i + 1}세트 완료`}
                >
                  ✓
                </button>
              </div>
              <div className="set-inputs">
                <div className="stepper-slot stepper-slot-wide">
                  <NumberStepper
                    value={set.weight}
                    step={2.5}
                    max={500}
                    onChange={(weight) => actions.patchSet(entry.recordKey, i, { weight })}
                    ariaLabel={`${name} ${i + 1}세트 무게`}
                    decimals={2}
                  />
                </div>
                <div className="stepper-slot">
                  <NumberStepper
                    value={set.reps}
                    step={1}
                    max={100}
                    onChange={(reps) => actions.patchSet(entry.recordKey, i, { reps })}
                    ariaLabel={`${name} ${i + 1}세트 횟수`}
                    decimals={0}
                  />
                </div>
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
