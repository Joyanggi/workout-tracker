import { NO_AUTOFILL } from '../lib/inputProps'
import { useMemo, useState } from 'react'
import ExercisePickerSheet from '../components/ExercisePickerSheet'
import NumberStepper from '../components/NumberStepper'
import RoutineLineSheet from '../components/RoutineLineSheet'
import { BUNDLED_ROUTINE } from '../db/seed'
import {
  blankRoutine,
  defaultLineFor,
  deriveMuscleSets,
  forkRoutine,
  nextDayId,
  resolveMuscleTargets,
  shouldForkOnEdit,
  toDraft,
  uniqueId,
  USER_ROUTINE_PREFIX,
  takenDayIds,
  validateDraft,
} from '../lib/routineEdit'
import { saveRoutineDraft } from '../lib/routineStore'
import { useRoutineEditContext, type RoutineEditContext } from '../lib/useRoutineEditContext'
import { exerciseLabel, type RoutineBundle } from '../lib/useRoutine'
import type { RoutineDay, RoutineExercise, RoutineTemplate } from '../types'

/** 처음 초안과 저장 전 id (NN2 표). 저장된 루틴은 toDraft를 거쳐야만 초안이 된다 */
function startDraft(
  target: 'active' | 'blank',
  active: RoutineTemplate,
  ctx: RoutineEditContext,
): { draft: RoutineTemplate; savedId: string | undefined; forked: boolean } {
  const taken = new Set(ctx.routines.map((r) => r.id))
  const now = new Date().toISOString()
  if (target === 'blank') {
    const id = uniqueId(USER_ROUTINE_PREFIX, taken)
    return { draft: blankRoutine(id, now, BUNDLED_ROUTINE.rules), savedId: undefined, forked: false }
  }
  if (shouldForkOnEdit(active.id, BUNDLED_ROUTINE.id)) {
    const id = uniqueId(USER_ROUTINE_PREFIX, taken)
    return { draft: toDraft(forkRoutine(active, id, now)), savedId: active.id, forked: true }
  }
  return { draft: toDraft(active), savedId: active.id, forked: false }
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const next = list.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export default function RoutineEditorScreen({
  bundle,
  target,
  onDone,
}: {
  bundle: RoutineBundle
  target: 'active' | 'blank'
  onDone: () => void
}) {
  const ctx = useRoutineEditContext()
  if (!ctx) return <div className="center-note">불러오는 중…</div>
  return <Editor bundle={bundle} target={target} ctx={ctx} onDone={onDone} />
}

function Editor({
  bundle,
  target,
  ctx,
  onDone,
}: {
  bundle: RoutineBundle
  target: 'active' | 'blank'
  ctx: RoutineEditContext
  onDone: () => void
}) {
  const [start] = useState(() => startDraft(target, bundle.routine, ctx))
  const [initial] = useState(() => JSON.stringify(start.draft))
  const [draft, setDraft] = useState<RoutineTemplate>(start.draft)
  const [problems, setProblems] = useState<string[]>([])
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDay, setConfirmDay] = useState<string | null>(null)
  const [lineAt, setLineAt] = useState<{ dayId: string; index: number } | null>(null)
  const [pickDay, setPickDay] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(draft) !== initial
  const label = (id: string) => exerciseLabel(bundle.catalog, id)
  const targets = useMemo(() => resolveMuscleTargets(draft), [draft])
  const planSum = useMemo(() => deriveMuscleSets(draft.days.flatMap((d) => d.exercises)), [draft])

  const editDay = (dayId: string, fn: (day: RoutineDay) => RoutineDay) =>
    setDraft((d) => ({ ...d, days: d.days.map((day) => (day.id === dayId ? fn(day) : day)) }))

  const addDay = () => {
    const taken = takenDayIds(ctx.routines, ctx.sessions, draft)
    const day: RoutineDay = {
      id: nextDayId(taken),
      name: `Day ${draft.days.length + 1}`,
      subtitle: '',
      isBuffer: false,
      muscleSets: {},
      exercises: [],
    }
    setDraft((d) => ({ ...d, days: [...d.days, day] }))
  }

  const removeDay = (dayId: string) => {
    setDraft((d) => ({ ...d, days: d.days.filter((day) => day.id !== dayId) }))
    setConfirmDay(null)
  }

  const addExercise = (dayId: string, exerciseId: string) => {
    const base = defaultLineFor(exerciseId, draft, BUNDLED_ROUTINE, ctx.catalog)
    const added: RoutineExercise = { ...base, exerciseId, plannedOrder: 0, optional: false, note: '' }
    const index = draft.days.find((d) => d.id === dayId)?.exercises.length ?? 0
    editDay(dayId, (day) => ({ ...day, exercises: [...day.exercises, added] }))
    setPickDay(null)
    setLineAt({ dayId, index })
  }

  const setTarget = (muscle: string, patch: { mode?: 'plan' | 'manual'; target?: number }) =>
    setDraft((d) => {
      const cur = resolveMuscleTargets(d)[muscle]
      if (!cur) return d
      const next = { ...cur }
      if (patch.mode === 'plan') next.auto = true
      if (patch.mode === 'manual') delete next.auto
      if (patch.target !== undefined) {
        next.target = patch.target
        delete next.auto
      }
      return { ...d, muscleTargets: { ...d.muscleTargets, [muscle]: next } }
    })

  const save = async () => {
    const found = validateDraft(draft, ctx.catalog)
    if (found.length > 0) {
      setProblems(found)
      return
    }
    setSaving(true)
    const result = await saveRoutineDraft(draft, start.savedId)
    setSaving(false)
    if (result.length === 0) onDone()
    else setProblems(result)
  }

  const lineDay = lineAt ? draft.days.find((d) => d.id === lineAt.dayId) : undefined
  const line = lineDay && lineAt ? lineDay.exercises[lineAt.index] : undefined
  const usedMuscles = [
    ...new Set([...draft.days, ...draft.fallbackDays].flatMap((d) => d.exercises.map((e) => e.muscle))),
  ].filter((m) => m !== '')

  return (
    <div className="screen">
      <div className="btn-row" style={{ alignItems: 'center' }}>
        {confirmLeave ? (
          <>
            <button className="btn btn-danger" onClick={onDone}>
              저장하지 않고 나가기
            </button>
            <button className="btn" onClick={() => setConfirmLeave(false)}>
              계속 편집
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => (dirty ? setConfirmLeave(true) : onDone())}>
              ‹ 취소
            </button>
            <h1 className="screen-title" style={{ margin: 0, flex: 1, textAlign: 'center' }}>
              루틴 편집
            </h1>
            <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
              저장
            </button>
          </>
        )}
      </div>

      {start.forked && (
        <p className="row-sub" style={{ whiteSpace: 'normal' }}>
          기본 루틴은 그대로 두고 복사본을 만들어 고칩니다. 지금까지의 기록은 이어집니다.
        </p>
      )}

      {problems.length > 0 && (
        <div className="banner banner-danger" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          {problems.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-label">루틴 이름</div>
        <input
            {...NO_AUTOFILL}
          className="field"
          aria-label="루틴 이름"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>

      {draft.days.map((day, di) => (
        <div className="card" key={day.id}>
          <div className="btn-row" style={{ alignItems: 'center' }}>
            <input
            {...NO_AUTOFILL}
              className="field"
              aria-label="Day 이름"
              value={day.name}
              onChange={(e) => editDay(day.id, (x) => ({ ...x, name: e.target.value }))}
            />
            <button
              className="btn"
              aria-label="Day 위로"
              disabled={di === 0}
              onClick={() => setDraft((d) => ({ ...d, days: move(d.days, di, -1) }))}
            >
              ▲
            </button>
            <button
              className="btn"
              aria-label="Day 아래로"
              disabled={di === draft.days.length - 1}
              onClick={() => setDraft((d) => ({ ...d, days: move(d.days, di, 1) }))}
            >
              ▼
            </button>
          </div>
          <input
            {...NO_AUTOFILL}
            className="field"
            style={{ marginTop: 8 }}
            aria-label="Day 설명"
            placeholder="설명 (예: 상부가슴 / 측면어깨)"
            value={day.subtitle}
            onChange={(e) => editDay(day.id, (x) => ({ ...x, subtitle: e.target.value }))}
          />

          {day.exercises.map((ex, i) => (
            <div className="row" key={ex.exerciseId} style={{ borderBottom: 'none', padding: '6px 0' }}>
              <button
                className="row-main"
                style={{ textAlign: 'left' }}
                onClick={() => setLineAt({ dayId: day.id, index: i })}
              >
                <div className="row-title" style={{ fontSize: 14 }}>
                  {i + 1}. {label(ex.exerciseId)} <span className="chip">{ex.group === 'core' ? '코어' : ex.group}</span>
                </div>
                <div className="row-sub">
                  {ex.muscle || '부위 없음'} · {ex.sets}×{ex.repMin}~{ex.repMax} · {ex.restSec}초
                </div>
              </button>
              <button
                className="btn"
                aria-label="종목 위로"
                disabled={i === 0}
                onClick={() => editDay(day.id, (x) => ({ ...x, exercises: move(x.exercises, i, -1) }))}
              >
                ▲
              </button>
              <button
                className="btn"
                aria-label="종목 아래로"
                disabled={i === day.exercises.length - 1}
                onClick={() => editDay(day.id, (x) => ({ ...x, exercises: move(x.exercises, i, 1) }))}
              >
                ▼
              </button>
            </div>
          ))}

          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => setPickDay(day.id)}>
              ＋ 종목 추가
            </button>
            {confirmDay === day.id ? (
              <>
                <button className="btn btn-danger" onClick={() => removeDay(day.id)}>
                  정말 삭제
                </button>
                <button className="btn" onClick={() => setConfirmDay(null)}>
                  취소
                </button>
              </>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmDay(day.id)}>
                Day 삭제
              </button>
            )}
          </div>
        </div>
      ))}

      <button className="btn" onClick={addDay}>
        ＋ Day 추가
      </button>

      {draft.fallbackDays.length > 0 && (
        <div className="card">
          <div className="card-label">하한 모드</div>
          <p className="row-sub" style={{ whiteSpace: 'normal' }}>
            정규 Day에서 뺀 종목은 여기서도 빠지고, 반복수는 정규 Day를 따라갑니다.
          </p>
          {draft.fallbackDays.map((day) => (
            <div className="row" key={day.id}>
              <div className="row-main">
                <div className="row-title">{day.name}</div>
                <div className="row-sub">{day.exercises.map((e) => label(e.exerciseId)).join(' · ')}</div>
              </div>
              <button
                className="btn"
                onClick={() => setDraft((d) => ({ ...d, fallbackDays: d.fallbackDays.filter((x) => x.id !== day.id) }))}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-label">주간 목표</div>
        {Object.entries(targets).map(([muscle, t]) => (
          <div key={muscle} style={{ padding: '8px 0' }}>
            <div className="row" style={{ borderBottom: 'none', padding: 0 }}>
              <div className="row-main">
                <div className="row-title">{muscle}</div>
                <div className="row-sub">플랜 합계 {planSum[muscle] ?? 0}세트</div>
              </div>
              <div className="row-meta">{t.target}세트</div>
            </div>
            <div className="segment" style={{ marginTop: 6 }}>
              <button aria-pressed={t.auto === true} onClick={() => setTarget(muscle, { mode: 'plan' })}>
                플랜 합계
              </button>
              <button aria-pressed={t.auto !== true} onClick={() => setTarget(muscle, { mode: 'manual' })}>
                직접
              </button>
            </div>
            {t.auto !== true && (
              <div style={{ marginTop: 6 }}>
                <NumberStepper
                  value={t.target}
                  step={1}
                  min={1}
                  max={60}
                  ariaLabel={`${muscle} 주간 목표`}
                  onChange={(v) => setTarget(muscle, { target: v })}
                />
              </div>
            )}
          </div>
        ))}
        {Object.keys(targets).length === 0 && <p className="row-sub">종목을 넣으면 부위가 나타납니다.</p>}
      </div>

      {pickDay && (
        <ExercisePickerSheet
          catalog={ctx.catalog}
          inDay={new Set(draft.days.find((d) => d.id === pickDay)?.exercises.map((e) => e.exerciseId))}
          onPick={(id) => addExercise(pickDay, id)}
          onClose={() => setPickDay(null)}
        />
      )}
      {line && lineAt && (
        <RoutineLineSheet
          line={line}
          name={label(line.exerciseId)}
          usedMuscles={usedMuscles}
          onChange={(next) =>
            editDay(lineAt.dayId, (x) => ({ ...x, exercises: x.exercises.map((e, i) => (i === lineAt.index ? next : e)) }))
          }
          onRemove={() => {
            editDay(lineAt.dayId, (x) => ({ ...x, exercises: x.exercises.filter((_, i) => i !== lineAt.index) }))
            setLineAt(null)
          }}
          onClose={() => setLineAt(null)}
        />
      )}
    </div>
  )
}
