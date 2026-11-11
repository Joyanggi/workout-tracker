import { NO_AUTOFILL } from '../lib/inputProps'
import { useMemo, useState } from 'react'
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
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="종목 고르기">
        <div className="sheet-grip" />
        {form === null ? (
          <>
            <div className="card-label">종목 추가</div>
            <input
              {...NO_AUTOFILL}
              className="field"
              aria-label="종목 검색"
              placeholder="이름으로 찾기"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {rows.length === 0 && <p className="row-sub" style={{ marginTop: 12 }}>맞는 종목이 없습니다.</p>}
            {rows.map((e) => (
              <div className="row sheet-row" key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="row-main"
                  style={{ flex: 1, textAlign: 'left', background: 'none', border: 0, color: 'inherit', padding: 0 }}
                  onClick={() => onPick(e.id)}
                >
                  <div className="row-title">
                    {e.shortName}
                    {e.custom === true && <span className="chip" style={{ marginLeft: 6 }}>내 종목</span>}
                  </div>
                  <div className="row-sub">{e.name}</div>
                </button>
                {e.custom === true && (
                  <button className="btn" onClick={() => setForm(e.id)}>
                    편집
                  </button>
                )}
              </div>
            ))}
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setForm('new')}>
              ＋ 새 종목 만들기
            </button>
            <button className="btn" style={{ marginTop: 16 }} onClick={onClose}>
              닫기
            </button>
          </>
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
      </div>
    </div>
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
    <>
      <div className="card-label">{editing ? '내 종목 편집' : '새 종목 만들기'}</div>
      <label className="row-sub" htmlFor="ex-name">이름</label>
      <input {...NO_AUTOFILL} id="ex-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="row-sub" htmlFor="ex-short" style={{ marginTop: 8, display: 'block' }}>짧은 이름 (선택)</label>
      <input {...NO_AUTOFILL} id="ex-short" className="field" value={shortName} onChange={(e) => setShortName(e.target.value)} />
      <label className="row-sub" htmlFor="ex-cue" style={{ marginTop: 8, display: 'block' }}>자극 팁 (선택)</label>
      <input {...NO_AUTOFILL} id="ex-cue" className="field" value={cueTip} onChange={(e) => setCueTip(e.target.value)} />
      <label className="row-sub" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input {...NO_AUTOFILL} type="checkbox" checked={bodyweight} onChange={(e) => setBodyweight(e.target.checked)} />
        맨몸 운동 (무게 0kg으로 기록)
      </label>
      {problems.map((p) => (
        <p key={p} className="row-sub" role="alert" style={{ color: 'var(--danger, #e5484d)', marginTop: 8 }}>
          {p}
        </p>
      ))}
      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        disabled={busy}
        onClick={() => run(async () => {
          const found = await onSubmit({ name, shortName, cueTip, bodyweight })
          if (found.length === 0) onBack()
          return found
        })}
      >
        {editing ? '저장' : '만들고 추가'}
      </button>
      {editing && onDelete && deletable && (
        <button className="btn btn-danger" style={{ marginTop: 12 }} disabled={busy} onClick={remove}>
          종목 삭제
        </button>
      )}
      {editing && !deletable && (
        <p className="row-sub" style={{ marginTop: 12 }}>루틴이나 기록에서 쓰는 종목은 지울 수 없습니다</p>
      )}
      <button className="btn" style={{ marginTop: 12 }} onClick={onBack}>
        뒤로
      </button>
    </>
  )
}
