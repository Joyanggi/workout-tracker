import { useMemo, useState } from 'react'
import ExercisePickerSheet, { type ExerciseForm } from '../components/ExercisePickerSheet'
import RoutineLineSheet from '../components/RoutineLineSheet'
import { BUNDLED_ROUTINE } from '../db/seed'
import {
  blankRoutine,
  defaultLineFor,
  CUSTOM_EXERCISE_PREFIX,
  deriveMuscleSets,
  exerciseInUse,
  forkRoutine,
  nextDayId,
  resolveMuscleTargets,
  shouldForkOnEdit,
  toDraft,
  uniqueId,
  USER_ROUTINE_PREFIX,
  takenDayIds,
  usedKeys,
  validateDraft,
  validateExercise,
} from '../lib/routineEdit'
import { deleteCustomExercise, saveCustomExercise, saveRoutineDraft } from '../lib/routineStore'
import { useRoutineEditContext, type RoutineEditContext } from '../lib/useRoutineEditContext'
import { exerciseLabel, type RoutineBundle } from '../lib/useRoutine'
import {
  AxRoot,
  Badge,
  Banner,
  Button,
  Card,
  Heading,
  HStack,
  Item,
  SegmentedControl,
  SegmentedControlItem,
  Stepper,
  Text,
  TextField,
  VStack,
} from '../ax'
import type { Exercise, RoutineDay, RoutineExercise, RoutineTemplate } from '../types'

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

/** 나란한 버튼이 남는 폭을 나눠 갖는다(글자 폭이 먼저라 이름이 잘리지 않는다) */
const GROW = { flex: '1 1 auto' } as const

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
  return (
    <AxRoot>
      {ctx ? <Editor bundle={bundle} target={target} ctx={ctx} onDone={onDone} /> : <Text>불러오는 중…</Text>}
    </AxRoot>
  )
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

  /** 내 종목: 폼 → Exercise. id는 만들 때 한 번만 정하고 고쳐도 바뀌지 않는다 */
  const toExercise = (form: ExerciseForm, id: string): Exercise => {
    const name = form.name.trim()
    const ex: Exercise = {
      id,
      name,
      shortName: form.shortName.trim() === '' ? name : form.shortName.trim(),
      cueTip: form.cueTip.trim(),
      compensationSigns: [],
      custom: true,
    }
    if (form.bodyweight) ex.allowZeroWeight = true
    return ex
  }

  const createExercise = async (dayId: string, form: ExerciseForm): Promise<string[]> => {
    const found = validateExercise(form, ctx.catalog)
    if (found.length > 0) return found
    const id = uniqueId(CUSTOM_EXERCISE_PREFIX, new Set(ctx.catalog.map((e) => e.id)))
    const saved = await saveCustomExercise(toExercise(form, id))
    if (saved.length > 0) return saved
    addExercise(dayId, id)
    return []
  }

  const updateExercise = async (id: string, form: ExerciseForm): Promise<string[]> => {
    const found = validateExercise(form, ctx.catalog, id)
    if (found.length > 0) return found
    return saveCustomExercise(toExercise(form, id))
  }

  const exerciseUsed = (id: string) => exerciseInUse(id, [...ctx.routines, draft], usedKeys(ctx.sessions))

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
    <VStack gap={3}>
      <HStack gap={2} align="center">
        {confirmLeave ? (
          <>
            <Button variant="destructive" label="저장하지 않고 나가기" style={GROW} onClick={onDone} />
            <Button variant="secondary" label="계속 편집" style={GROW} onClick={() => setConfirmLeave(false)} />
          </>
        ) : (
          <>
            <Button variant="ghost" label="‹ 취소" onClick={() => (dirty ? setConfirmLeave(true) : onDone())} />
            <Heading level={1} justify="center" maxLines={1} style={{ flex: 1, minWidth: 0 }}>
              루틴 편집
            </Heading>
            <Button variant="primary" label="저장" isDisabled={!dirty || saving} onClick={() => void save()} />
          </>
        )}
      </HStack>

      {start.forked && (
        <Text color="secondary">기본 루틴은 그대로 두고 복사본을 만들어 고칩니다. 지금까지의 기록은 이어집니다.</Text>
      )}

      {problems.length > 0 && (
        <Banner status="error" title="저장할 수 없습니다" collapsible={false}>
          <VStack gap={1}>
            {problems.map((p) => (
              <Text key={p}>{p}</Text>
            ))}
          </VStack>
        </Banner>
      )}

      <Card>
        <TextField label="루틴 이름" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
      </Card>

      {draft.days.map((day, di) => (
        <Card key={day.id}>
          <VStack gap={3}>
            <HStack gap={2} align="center">
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField
                  label="Day 이름"
                  isLabelHidden
                  value={day.name}
                  onChange={(v) => editDay(day.id, (x) => ({ ...x, name: v }))}
                />
              </div>
              <Button
                variant="ghost"
                isIconOnly
                icon={<span aria-hidden="true">▲</span>}
                label="Day 위로"
                isDisabled={di === 0}
                onClick={() => setDraft((d) => ({ ...d, days: move(d.days, di, -1) }))}
              />
              <Button
                variant="ghost"
                isIconOnly
                icon={<span aria-hidden="true">▼</span>}
                label="Day 아래로"
                isDisabled={di === draft.days.length - 1}
                onClick={() => setDraft((d) => ({ ...d, days: move(d.days, di, 1) }))}
              />
            </HStack>
            <TextField
              label="Day 설명"
              isLabelHidden
              placeholder="설명 (예: 상부가슴 / 측면어깨)"
              value={day.subtitle}
              onChange={(v) => editDay(day.id, (x) => ({ ...x, subtitle: v }))}
            />

            {day.exercises.map((ex, i) => (
              <HStack key={ex.exerciseId} gap={2} align="center">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Item
                    label={
                      <>
                        {i + 1}. {label(ex.exerciseId)} <Badge label={ex.group === 'core' ? '코어' : ex.group} />
                      </>
                    }
                    description={<>{`${ex.muscle || '부위 없음'} · ${ex.sets}×${ex.repMin}~${ex.repMax} · ${ex.restSec}초`}</>}
                    onClick={() => setLineAt({ dayId: day.id, index: i })}
                  />
                </div>
                <Button
                  variant="ghost"
                  isIconOnly
                  icon={<span aria-hidden="true">▲</span>}
                  label="종목 위로"
                  isDisabled={i === 0}
                  onClick={() => editDay(day.id, (x) => ({ ...x, exercises: move(x.exercises, i, -1) }))}
                />
                <Button
                  variant="ghost"
                  isIconOnly
                  icon={<span aria-hidden="true">▼</span>}
                  label="종목 아래로"
                  isDisabled={i === day.exercises.length - 1}
                  onClick={() => editDay(day.id, (x) => ({ ...x, exercises: move(x.exercises, i, 1) }))}
                />
              </HStack>
            ))}

            <HStack gap={2}>
              <Button variant="secondary" label="＋ 종목 추가" onClick={() => setPickDay(day.id)} />
              {confirmDay === day.id ? (
                <>
                  <Button variant="destructive" label="정말 삭제" onClick={() => removeDay(day.id)} />
                  <Button variant="secondary" label="취소" onClick={() => setConfirmDay(null)} />
                </>
              ) : (
                <Button variant="destructive" label="Day 삭제" onClick={() => setConfirmDay(day.id)} />
              )}
            </HStack>
          </VStack>
        </Card>
      ))}

      <Button variant="secondary" width="100%" label="＋ Day 추가" onClick={addDay} />

      {draft.fallbackDays.length > 0 && (
        <Card>
          <VStack gap={3}>
            <Heading level={2}>하한 모드</Heading>
            <Text color="secondary">정규 Day에서 뺀 종목은 여기서도 빠지고, 반복수는 정규 Day를 따라갑니다.</Text>
            {draft.fallbackDays.map((day) => (
              <Item
                key={day.id}
                label={day.name}
                description={<>{day.exercises.map((e) => label(e.exerciseId)).join(' · ')}</>}
                endContent={
                  <Button
                    variant="secondary"
                    label="삭제"
                    onClick={() => setDraft((d) => ({ ...d, fallbackDays: d.fallbackDays.filter((x) => x.id !== day.id) }))}
                  />
                }
              />
            ))}
          </VStack>
        </Card>
      )}

      <Card>
        <VStack gap={3}>
          <Heading level={2}>주간 목표</Heading>
          {Object.entries(targets).map(([muscle, t]) => (
            <VStack key={muscle} gap={3}>
              <Item label={muscle} description={<>{`플랜 합계 ${planSum[muscle] ?? 0}세트`}</>} endContent={`${t.target}세트`} />
              <SegmentedControl
                label={`${muscle} 목표 방식`}
                size="lg"
                value={t.auto === true ? 'plan' : 'manual'}
                onChange={(v) => setTarget(muscle, { mode: v === 'plan' ? 'plan' : 'manual' })}
              >
                <SegmentedControlItem value="plan" label="플랜 합계" />
                <SegmentedControlItem value="manual" label="직접" />
              </SegmentedControl>
              {t.auto !== true && (
                <Stepper
                  value={t.target}
                  step={1}
                  min={1}
                  max={60}
                  label={`${muscle} 주간 목표`}
                  onChange={(v) => setTarget(muscle, { target: v })}
                />
              )}
            </VStack>
          ))}
          {Object.keys(targets).length === 0 && <Text color="secondary">종목을 넣으면 부위가 나타납니다.</Text>}
        </VStack>
      </Card>

      {pickDay && (
        <ExercisePickerSheet
          catalog={ctx.catalog}
          inDay={new Set(draft.days.find((d) => d.id === pickDay)?.exercises.map((e) => e.exerciseId))}
          inUse={exerciseUsed}
          onPick={(id) => addExercise(pickDay, id)}
          onCreate={(f) => createExercise(pickDay, f)}
          onUpdate={updateExercise}
          onDelete={deleteCustomExercise}
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
    </VStack>
  )
}
