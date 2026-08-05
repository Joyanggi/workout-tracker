import { useMemo } from 'react'
import { dayTotalSets } from '../lib/useRoutine'
import type { RoutineBundle } from '../lib/useRoutine'
import { makeRecordKey, recordDayIdOf, type RecordKey } from '../types'

/**
 * 종목 얹기 (CC15) — "그 Day 머신이 다 차 있을 때".
 *
 * **대체(T8)와 다른 경로다.** 대체는 "이 종목 대신 다른 것", 이것은 "루틴의 다른 운동을
 * 얹기"다. 그래서 후보가 전 Day의 종목이고, 기존 종목은 그대로 남는다.
 *
 * recordKey는 **원소속 Day의 라인**이다 (`pec-deck@d1`) — 기록 라인 연속성 원칙 그대로여서
 * 프리필·PR·증량 판단이 그 종목의 본 라인에 이어진다. D3 세션에서 D1 종목을 해도
 * 그 기록은 D1 라인에 쌓인다.
 */
export default function AddExerciseSheet({
  bundle,
  /** 이미 세션에 있는 recordKey — 목록에서 제외한다 (중복은 집계를 이중 계상한다) */
  existing,
  onAdd,
  onClose,
}: {
  bundle: RoutineBundle
  existing: RecordKey[]
  onAdd: (args: { recordKey: RecordKey; setCount: number; repMin: number }) => void
  onClose: () => void
}) {
  const groups = useMemo(() => {
    const have = new Set(existing)
    return bundle.routine.days
      .map((day) => ({
        day,
        items: day.exercises
          .slice()
          .sort((a, b) => a.plannedOrder - b.plannedOrder)
          .map((ex) => ({
            ex,
            recordKey: makeRecordKey(ex.exerciseId, recordDayIdOf(day)),
            name: bundle.catalog.get(ex.exerciseId)?.shortName ?? ex.exerciseId,
          }))
          .filter((row) => !have.has(row.recordKey)),
      }))
      .filter((g) => g.items.length > 0)
  }, [bundle, existing])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="종목 추가">
        <div className="sheet-grip" />
        <div className="card-label">종목 추가</div>
        <p className="row-sub" style={{ whiteSpace: 'normal' }}>
          루틴의 다른 종목을 이 세션에 얹습니다. 기록은 <b>그 종목의 원래 Day 라인</b>에
          남고, 주간 볼륨에 정상 반영됩니다. 몸 풀기 수준이면 세트를 워밍업으로 표시하세요.
        </p>

        {groups.length === 0 ? (
          <p className="row-sub" style={{ marginTop: 12 }}>
            추가할 수 있는 종목이 없습니다 (전부 이 세션에 있습니다).
          </p>
        ) : (
          groups.map(({ day, items }) => (
            <div key={day.id}>
              <div className="card-label" style={{ marginTop: 16 }}>
                {day.name} · {day.exercises.length}종목 {dayTotalSets(day)}세트
              </div>
              {items.map(({ ex, recordKey, name }) => (
                <button
                  className="row sheet-row"
                  key={recordKey}
                  onClick={() => {
                    onAdd({ recordKey, setCount: ex.sets, repMin: ex.repMin })
                    onClose()
                  }}
                >
                  <div className="row-main">
                    <div className="row-title">{name}</div>
                    <div className="row-sub mono">{recordKey}</div>
                  </div>
                  <div className="row-meta">
                    {ex.group}그룹
                    <br />
                    {ex.sets}×{ex.repMin}~{ex.repMax}
                  </div>
                </button>
              ))}
            </div>
          ))
        )}

        <button className="btn" style={{ marginTop: 16 }} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
