import { NO_AUTOFILL } from '../lib/inputProps'
import { useState } from 'react'
import NumberStepper from './NumberStepper'
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
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="종목 줄 편집">
        <div className="sheet-grip" />
        <div className="card-label">{name}</div>

        <div className="card-label" style={{ marginTop: 12 }}>부위</div>
        <div className="pill-row">
          {chips.map((m) => (
            <button
              key={m}
              className={line.muscle === m && !custom ? 'chip chip-accent' : 'chip'}
              onClick={() => {
                setCustom(false)
                set({ muscle: m })
              }}
            >
              {m}
            </button>
          ))}
          <button className={custom ? 'chip chip-accent' : 'chip'} onClick={() => setCustom(true)}>
            직접 입력
          </button>
        </div>
        {custom && (
          <input
            {...NO_AUTOFILL}
            className="field"
            style={{ marginTop: 8 }}
            aria-label="부위 직접 입력"
            value={line.muscle}
            onChange={(e) => set({ muscle: e.target.value })}
          />
        )}

        <div className="card-label" style={{ marginTop: 12 }}>방식</div>
        <div className="segment">
          {GROUPS.map((g) => (
            <button key={g.value} aria-pressed={line.group === g.value} onClick={() => set({ group: g.value })}>
              {g.label}
            </button>
          ))}
        </div>
        <p className="row-sub" style={{ whiteSpace: 'normal' }}>{GROUP_HINT[line.group]}</p>

        <div className="row">
          <div className="row-main"><div className="row-title">세트</div></div>
          <NumberStepper value={line.sets} step={1} min={1} max={10} ariaLabel="세트" onChange={(v) => set({ sets: v })} />
        </div>
        <div className="row">
          <div className="row-main"><div className="row-title">반복 최소</div></div>
          <NumberStepper value={line.repMin} step={1} min={1} max={50} ariaLabel="반복 최소" onChange={(v) => set({ repMin: v })} />
        </div>
        <div className="row">
          <div className="row-main"><div className="row-title">반복 최대</div></div>
          <NumberStepper value={line.repMax} step={1} min={1} max={50} ariaLabel="반복 최대" onChange={(v) => set({ repMax: v })} />
        </div>
        <div className="row">
          <div className="row-main"><div className="row-title">휴식(초)</div></div>
          <NumberStepper value={line.restSec} step={15} min={0} max={600} ariaLabel="휴식" onChange={(v) => set({ restSec: v })} />
        </div>

        <label className="row" style={{ cursor: 'pointer' }}>
          <div className="row-main"><div className="row-title">컨디션 좋을 때만</div></div>
          <input {...NO_AUTOFILL} type="checkbox" checked={line.optional} onChange={(e) => set({ optional: e.target.checked })} />
        </label>

        <div className="card-label" style={{ marginTop: 12 }}>메모</div>
        <input {...NO_AUTOFILL} className="field" aria-label="메모" value={line.note} onChange={(e) => set({ note: e.target.value })} />

        <button className="btn btn-danger" style={{ marginTop: 16 }} onClick={onRemove}>
          이 Day에서 빼기
        </button>
        <button className="btn" style={{ marginTop: 8 }} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
