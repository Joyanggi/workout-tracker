import { NO_AUTOFILL } from '../lib/inputProps'
import { useMemo, useState } from 'react'
import type { Exercise } from '../types'

/**
 * 종목 고르기 시트 (NN2): 검색(이름·짧은 이름) + 카탈로그 목록.
 * 이 Day에 이미 있는 종목은 감춘다 — 같은 Day에 같은 종목은 기록 라인이 겹친다.
 */
export default function ExercisePickerSheet({
  catalog,
  inDay,
  onPick,
  onClose,
}: {
  catalog: Exercise[]
  inDay: Set<string>
  onPick: (exerciseId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter(
      (e) => !inDay.has(e.id) && (q === '' || e.name.toLowerCase().includes(q) || e.shortName.toLowerCase().includes(q)),
    )
  }, [catalog, inDay, query])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="종목 고르기">
        <div className="sheet-grip" />
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
          <button className="row sheet-row" key={e.id} onClick={() => onPick(e.id)}>
            <div className="row-main">
              <div className="row-title">{e.shortName}</div>
              <div className="row-sub">{e.name}</div>
            </div>
          </button>
        ))}
        <button className="btn" style={{ marginTop: 16 }} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
