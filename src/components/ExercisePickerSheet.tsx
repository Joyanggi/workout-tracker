import { useMemo, useState } from 'react'
import { Badge, Banner, Button, Heading, Item, Sheet, Switch, Text, TextField, VStack } from '../ax'
import type { Exercise } from '../types'

export interface ExerciseForm {
  name: string
  shortName: string
  cueTip: string
  bodyweight: boolean
}

/**
 * 종목 고르기 시트 (NN2): 검색(이름·짧은 이름) + 카탈로그 목록.
 * 이 Day에 이미 있는 종목은 감춘다 — 같은 Day에 같은 종목은 기록 라인이 겹친다.
 * NN3: 목록 아래에서 내 종목을 만들고, 내 종목 줄에서 고치거나 지운다. 저장은 부른 쪽(onCreate·onUpdate·onDelete)이 한다 —
 * 돌려주는 문구가 있으면 그대로 보이고 시트는 닫히지 않는다.
 */
export default function ExercisePickerSheet({
  catalog,
  inDay,
  inUse,
  onPick,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: {
  catalog: Exercise[]
  inDay: Set<string>
  /** 루틴이나 기록에서 쓰는 종목 id — 이 종목은 지울 수 없다 */
  inUse: (exerciseId: string) => boolean
  onPick: (exerciseId: string) => void
  onCreate: (form: ExerciseForm) => Promise<string[]>
  onUpdate: (id: string, form: ExerciseForm) => Promise<string[]>
  onDelete: (id: string) => Promise<string[]>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  /** null: 목록 · 'new': 새로 만들기 · 종목 id: 그 종목 고치기 */
  const [form, setForm] = useState<null | 'new' | string>(null)
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter(
      (e) => !inDay.has(e.id) && (q === '' || e.name.toLowerCase().includes(q) || e.shortName.toLowerCase().includes(q)),
    )
  }, [catalog, inDay, query])

  const editing = form && form !== 'new' ? catalog.find((e) => e.id === form) : undefined

  return (
    // 폼이 열려 있을 때만 바깥 탭으로 안 닫힌다(적던 이름을 한 번 탭으로 잃지 않게). 목록일 때는 닫혀도 잃는 것이 없다
    <Sheet label="종목 고르기" purpose={form === null ? 'info' : 'form'} height="tall" onClose={onClose}>
      {form === null ? (
        <VStack gap={4}>
          <Heading level={2}>종목 추가</Heading>
          <TextField label="종목 검색" isLabelHidden placeholder="이름으로 찾기" value={query} onChange={setQuery} />
          {rows.length === 0 && <Text color="secondary">맞는 종목이 없습니다.</Text>}
          {rows.map((e) => (
            <Item
              key={e.id}
              label={
                <>
                  {e.shortName} {e.custom === true && <Badge label="내 종목" />}
                </>
              }
              description={<>{e.name}</>}
              onClick={() => onPick(e.id)}
              endContent={
                e.custom === true ? <Button variant="secondary" label="편집" onClick={() => setForm(e.id)} /> : undefined
              }
            />
          ))}
          <Button variant="secondary" width="100%" label="＋ 새 종목 만들기" onClick={() => setForm('new')} />
          <Button variant="secondary" width="100%" label="닫기" onClick={onClose} />
        </VStack>
      ) : (
        <ExerciseFormView
          key={form}
          editing={editing}
          deletable={editing ? !inUse(editing.id) : false}
          onSubmit={(f) => (editing ? onUpdate(editing.id, f) : onCreate(f))}
          onDelete={editing ? () => onDelete(editing.id) : undefined}
          onBack={() => setForm(null)}
        />
      )}
    </Sheet>
  )
}

function ExerciseFormView({
  editing,
  deletable,
  onSubmit,
  onDelete,
  onBack,
}: {
  editing: Exercise | undefined
  deletable: boolean
  onSubmit: (form: ExerciseForm) => Promise<string[]>
  onDelete: (() => Promise<string[]>) | undefined
  onBack: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [shortName, setShortName] = useState(editing && editing.shortName !== editing.name ? editing.shortName : '')
  const [cueTip, setCueTip] = useState(editing?.cueTip ?? '')
  const [bodyweight, setBodyweight] = useState(editing?.allowZeroWeight === true)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<string[]>) => {
    setBusy(true)
    const found = await fn()
    setBusy(false)
    setProblems(found)
  }

  const remove = () =>
    run(async () => {
      const found = onDelete ? await onDelete() : []
      if (found.length === 0) onBack()
      return found
    })

  return (
    <VStack gap={3}>
      <Heading level={2}>{editing ? '내 종목 편집' : '새 종목 만들기'}</Heading>
      <TextField label="이름" value={name} onChange={setName} />
      <TextField label="짧은 이름 (선택)" value={shortName} onChange={setShortName} />
      <TextField label="자극 팁 (선택)" value={cueTip} onChange={setCueTip} />
      {/* Switch의 탭 영역은 이웃과의 간격 절반까지만 넓어진다 → 위·아래로 간격을 더 둔다 */}
      <VStack paddingBlock={2}>
        <Switch label="맨몸 운동 (무게 0kg으로 기록)" value={bodyweight} onChange={setBodyweight} />
      </VStack>
      {problems.length > 0 && (
        <Banner status="error" title="저장할 수 없습니다" collapsible={false}>
          <VStack gap={1}>
            {problems.map((p) => (
              <Text key={p}>{p}</Text>
            ))}
          </VStack>
        </Banner>
      )}
      <Button
        variant="primary"
        width="100%"
        label={editing ? '저장' : '만들고 추가'}
        isDisabled={busy}
        onClick={() =>
          run(async () => {
            const found = await onSubmit({ name, shortName, cueTip, bodyweight })
            if (found.length === 0) onBack()
            return found
          })
        }
      />
      {editing && onDelete && deletable && (
        <Button variant="destructive" width="100%" label="종목 삭제" isDisabled={busy} onClick={remove} />
      )}
      {editing && !deletable && <Text color="secondary">루틴이나 기록에서 쓰는 종목은 지울 수 없습니다</Text>}
      <Button variant="secondary" width="100%" label="뒤로" onClick={onBack} />
    </VStack>
  )
}
