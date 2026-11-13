import { useMemo, useState } from 'react'
import { nutritionText } from '../lib/diet'
import {
  applyAddFood,
  applyRemoveFood,
  applyUpdateFood,
  foodCatalog,
  foodKey,
  validateFood,
  type CatalogFood,
  type FoodInput,
} from '../lib/foods'
import { NO_AUTOFILL } from '../lib/inputProps'
import { mutateUserFoods } from '../lib/useDiet'
import type { DietDay, DietPlan, Food, FoodLogEntry } from '../types'
import { SheetFrame } from './SheetFrame'

/**
 * "먹은 것 추가" 시트 (MM2).
 *
 * 행을 누르면 그 시각·개수 1로 **바로 추가**하고 시트는 닫지 않는다 (여러 개를 이어 넣는다).
 * 저장은 `onAdd`(편집기의 `mutate`)와 `mutateUserFoods`가 맡는다 — 둘 다 쓰기 함수가
 * 백업을 예약하므로 이 파일은 동기화를 부르지 않는다.
 */

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 빈 칸은 미입력(undefined), 숫자가 아니면 NaN으로 넘겨 `validateFood`가 잡게 한다 */
function parseNum(text: string): number | undefined {
  const t = text.trim().replace(',', '.')
  if (t === '') return undefined
  return Number(t)
}

function toEntry(food: FoodInput, time: string): FoodLogEntry {
  const entry: FoodLogEntry = {
    id: crypto.randomUUID(),
    time,
    name: food.name.trim(),
    qty: food.qty.trim(),
    count: 1,
  }
  if (food.kcal !== undefined) entry.kcal = food.kcal
  if (food.proteinG !== undefined) entry.proteinG = food.proteinG
  return entry
}

interface Draft {
  editingId?: string
  name: string
  qty: string
  kcal: string
  proteinG: string
}

const EMPTY_DRAFT: Draft = { name: '', qty: '', kcal: '', proteinG: '' }

export default function FoodLogSheet({
  date,
  today,
  plans,
  days,
  userFoods,
  onAdd,
  onClose,
}: {
  date: string
  today: string
  plans: DietPlan[]
  days: DietDay[]
  userFoods: Food[]
  onAdd: (entry: FoodLogEntry) => void
  onClose: () => void
}) {
  // 오늘이면 지금 시각, 과거 날짜면 빈 값 — 과거 보정에서 엉뚱한 시각이 조용히 들어가지 않게
  const [time, setTime] = useState(date === today ? nowHHMM() : '')
  const [query, setQuery] = useState('')
  const [last, setLast] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const catalog = useMemo(() => foodCatalog(plans, userFoods, days), [plans, userFoods, days])
  const q = query.replace(/\s/g, '').toLowerCase()
  const shown = catalog.filter((f) => f.name.replace(/\s/g, '').toLowerCase().includes(q))
  const noTime = time === ''

  const input: FoodInput | null = draft
    ? {
        name: draft.name,
        qty: draft.qty,
        kcal: parseNum(draft.kcal),
        proteinG: parseNum(draft.proteinG),
      }
    : null
  const problems = input && draft ? validateFood(input, plans, userFoods, draft.editingId) : []

  const add = (food: FoodInput) => {
    onAdd(toEntry(food, time))
    setLast(food.name.trim())
  }

  const save = (alsoAdd: boolean) => {
    if (!input || !draft || problems.length > 0) return
    const clean: FoodInput = { ...input, name: input.name.trim(), qty: input.qty.trim() }
    if (draft.editingId) {
      mutateUserFoods((foods) => applyUpdateFood(foods, draft.editingId!, clean))
    } else {
      const food: Food = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...clean }
      mutateUserFoods((foods) => applyAddFood(foods, food))
    }
    if (alsoAdd) add(clean)
    setDraft(null)
    setConfirmRemove(false)
  }

  const edit = (f: CatalogFood) => {
    setDraft({
      editingId: f.id,
      name: f.name,
      qty: f.qty,
      kcal: f.kcal === undefined ? '' : String(f.kcal),
      proteinG: f.proteinG === undefined ? '' : String(f.proteinG),
    })
  }

  return (
    <SheetFrame label="먹은 것 추가" onClose={onClose}>
      {(dismiss) => (
        <>
          <div className="card-label">먹은 것 추가</div>

          {draft ? (
            <>
              <div className="card-label mt-row">
                {draft.editingId ? '음식 수정' : '새 음식 등록'}
              </div>
              <input
                {...NO_AUTOFILL}
                className="field"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="이름 (예: 서브웨이 터키)"
                aria-label="음식 이름"
              />
              <input
                {...NO_AUTOFILL}
                className="field mt-row"
                
                value={draft.qty}
                onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                placeholder="분량 (예: 15cm, 1개)"
                aria-label="분량"
              />
              <div className="btn-row mt-row">
                <input
                  {...NO_AUTOFILL}
                  className="field"
                  inputMode="decimal"
                  value={draft.kcal}
                  onChange={(e) => setDraft({ ...draft, kcal: e.target.value })}
                  placeholder="kcal (1개 기준)"
                  aria-label="칼로리"
                />
                <input
                  {...NO_AUTOFILL}
                  className="field"
                  inputMode="decimal"
                  value={draft.proteinG}
                  onChange={(e) => setDraft({ ...draft, proteinG: e.target.value })}
                  placeholder="단백질 g"
                  aria-label="단백질"
                />
              </div>
              <p className="row-sub">영양값을 비워 두면 “영양 미입력”으로 기록됩니다.</p>
              {draft.name.trim() !== '' && problems.length > 0 && (
                <p className="row-sub" style={{ color: 'var(--danger)' }}>
                  {problems.join(' · ')}
                </p>
              )}
              <div className="btn-row mt-row">
                <button className="btn" onClick={() => setDraft(null)}>
                  취소
                </button>
                {draft.editingId ? (
                  <button
                    className="btn btn-primary"
                    disabled={problems.length > 0}
                    onClick={() => save(false)}
                  >
                    저장
                  </button>
                ) : (
                  <>
                    <button className="btn" disabled={problems.length > 0} onClick={() => save(false)}>
                      등록
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={problems.length > 0 || noTime}
                      onClick={() => save(true)}
                    >
                      등록하고 추가
                    </button>
                  </>
                )}
              </div>
              {!draft.editingId && noTime && (
                <p className="row-sub">먹은 시각을 먼저 골라 주세요</p>
              )}
              {draft.editingId && (
                <div className="mt-row">
                  {confirmRemove ? (
                    <>
                      <p className="row-sub" style={{ color: 'var(--danger)' }}>
                        목록에서 지웁니다. 이미 적은 먹은 것 기록은 그대로입니다.
                      </p>
                      <div className="btn-row">
                        <button className="btn btn-sm" onClick={() => setConfirmRemove(false)}>
                          취소
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            mutateUserFoods((foods) => applyRemoveFood(foods, draft.editingId!))
                            setDraft(null)
                            setConfirmRemove(false)
                          }}
                        >
                          정말 삭제
                        </button>
                      </div>
                    </>
                  ) : (
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmRemove(true)}>
                      목록에서 삭제
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <label className="row-sub" htmlFor="food-log-time">
                먹은 시각
              </label>
              <input
                {...NO_AUTOFILL}
                id="food-log-time"
                className="field"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-label="먹은 시각"
              />
              {noTime && <p className="row-sub">먹은 시각을 먼저 골라 주세요</p>}
              {last && <p className="row-sub">방금 추가: {last}</p>}
              <input
                {...NO_AUTOFILL}
                className="field mt-row"
                
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="음식 검색"
                aria-label="음식 검색"
              />

              <div className="check-list mt-row" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                {shown.map((f) => (
                  <div className="diet-item-group" key={`${f.source}:${foodKey(f.name, f.qty)}`}>
                    <button
                      className="diet-item"
                      disabled={noTime}
                      onClick={() => add(f)}
                      aria-label={`${f.name} ${f.qty} 추가`}
                    >
                      <span>
                        {f.name} <span className="row-sub">{f.qty}</span>
                        {f.source === 'plan' && <span className="row-sub"> 플랜</span>}
                      </span>
                      <span className="row-sub">{nutritionText(f.kcal, f.proteinG)}</span>
                    </button>
                    {f.source === 'user' && (
                      <button
                        className="diet-variant-btn"
                        aria-label={`${f.name} 편집`}
                        onClick={() => edit(f)}
                      >
                        편집
                      </button>
                    )}
                  </div>
                ))}
                {shown.length === 0 && <p className="row-sub">맞는 음식이 없습니다.</p>}
              </div>

              <p className="row-sub">플랜에서 체크한 음식을 여기에도 적으면 합계에 두 번 들어갑니다.</p>
              <button className="btn" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                새 음식 등록
              </button>
            </>
          )}

          <button className="btn mt-row" onClick={dismiss}>
            닫기
          </button>
        </>
      )}
    </SheetFrame>
  )
}
