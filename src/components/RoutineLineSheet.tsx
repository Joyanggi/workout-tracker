import { useState } from 'react'
import { Button, Heading, HStack, SegmentedControl, SegmentedControlItem, Sheet, Stepper, Switch, Text, TextField, ToggleButton, VStack } from '../ax'
import { MUSCLE_SUGGESTIONS } from '../lib/routineEdit'
import type { RoutineExercise } from '../types'

const GROUPS: { value: RoutineExercise['group']; label: string }[] = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'core', label: '코어' },
]

/** 방식 안내 한 줄 — 선택한 방식의 뜻 */
const GROUP_HINT: Record<RoutineExercise['group'], string> = {
  A: 'A: 무게를 올려 가는 주 종목 (더블 프로그레션)',
  B: 'B: 감각 점수로 보는 고립 종목',
  core: '코어: 코어 보조 종목',
}

/**
 * 종목 줄 시트 (NN2). 고친 값은 곧바로 초안에 반영되고, DB에는 화면의 `저장`이 쓴다.
 * 부위 칩은 이 루틴이 쓰는 부위 → MUSCLE_SUGGESTIONS 순이다. `weightHint`는 입력받지 않고 그대로 둔다.
 */
export default function RoutineLineSheet({
  line,
  name,
  usedMuscles,
  onChange,
  onRemove,
  onClose,
}: {
  line: RoutineExercise
  name: string
  /** 이 루틴의 다른 줄이 쓰는 부위 */
  usedMuscles: string[]
  onChange: (next: RoutineExercise) => void
  onRemove: () => void
  onClose: () => void
}) {
  const chips = [...new Set([...usedMuscles, ...MUSCLE_SUGGESTIONS])]
  const [custom, setCustom] = useState(line.muscle !== '' && !chips.includes(line.muscle))
  const set = (patch: Partial<RoutineExercise>) => onChange({ ...line, ...patch })

  return (
    // 고친 값이 곧바로 초안에 들어가므로 바깥 탭으로 닫혀도 잃는 것이 없다 → purpose="info"
    <Sheet label="종목 줄 편집" purpose="info" height="hug" onClose={onClose}>
      <VStack gap={5} paddingBlockEnd={3}>
        <Heading level={2}>{name}</Heading>

        <Text color="secondary">부위</Text>
        <HStack gap={4} wrap="wrap">
          {chips.map((m) => (
            <ToggleButton
              key={m}
              label={m}
              size="lg"
              isPressed={line.muscle === m && !custom}
              onPressedChange={() => {
                setCustom(false)
                set({ muscle: m })
              }}
            />
          ))}
          <ToggleButton label="직접 입력" size="lg" isPressed={custom} onPressedChange={() => setCustom(true)} />
        </HStack>
        {custom && (
          <TextField label="부위 직접 입력" isLabelHidden value={line.muscle} onChange={(v) => set({ muscle: v })} />
        )}

        <VStack paddingBlock={2}>
          <SegmentedControl label="방식" size="lg" layout="fill" value={line.group} onChange={(v) => set({ group: v as RoutineExercise['group'] })}>
            {GROUPS.map((g) => (
              <SegmentedControlItem key={g.value} value={g.value} label={g.label} />
            ))}
          </SegmentedControl>
        </VStack>
        <Text color="secondary">{GROUP_HINT[line.group]}</Text>

        <HStack gap={2} align="center" justify="between">
          <Text>세트</Text>
          <Stepper value={line.sets} step={1} min={1} max={10} label="세트" inputWidth={160} onChange={(v) => set({ sets: v })} />
        </HStack>
        <HStack gap={2} align="center" justify="between">
          <Text textWrap="nowrap">반복 최소</Text>
          <Stepper value={line.repMin} step={1} min={1} max={50} label="반복 최소" inputWidth={160} onChange={(v) => set({ repMin: v })} />
        </HStack>
        <HStack gap={2} align="center" justify="between">
          <Text textWrap="nowrap">반복 최대</Text>
          <Stepper value={line.repMax} step={1} min={1} max={50} label="반복 최대" inputWidth={160} onChange={(v) => set({ repMax: v })} />
        </HStack>
        <HStack gap={2} align="center" justify="between">
          <Text>휴식(초)</Text>
          <Stepper value={line.restSec} step={15} min={0} max={600} label="휴식" inputWidth={160} onChange={(v) => set({ restSec: v })} />
        </HStack>

        {/* Switch의 탭 영역은 이웃과의 간격 절반까지만 넓어진다(트랙이 24px라 21px 떨어진 점까지 닿으려면 위·아래 18px 이상) */}
        <VStack paddingBlock={2}>
          <Switch label="컨디션 좋을 때만" value={line.optional} onChange={(v) => set({ optional: v })} />
        </VStack>

        <TextField label="메모" value={line.note} onChange={(v) => set({ note: v })} />

        <Button variant="destructive" width="100%" label="이 Day에서 빼기" onClick={onRemove} />
        <Button variant="secondary" width="100%" label="닫기" onClick={onClose} />
      </VStack>
    </Sheet>
  )
}
