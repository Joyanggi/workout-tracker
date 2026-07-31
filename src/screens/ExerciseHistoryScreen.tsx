import { useMemo, useState } from 'react'
import { hasCompensation } from '../lib/compensation'
import { weekdayKo } from '../lib/dates'
import { allRecordKeys, exerciseHistory } from '../lib/history'
import { isInverseKey } from '../lib/weightScale'
import type { RoutineBundle } from '../lib/useRoutine'
import type { Session } from '../types'

/**
 * 종목별 보기 (DESIGN.md §5.3).
 * "recordKey 선택 → 세션 히스토리 리스트 (무게·반복수 추이)"
 *
 * 차트는 분석 탭(§5.4, 마일스톤 8)이 담당한다. 여기는 원본 숫자를 그대로 보여준다 —
 * (종목, Day) 조합별로 기록이 분리돼 있다는 것을 눈으로 확인하는 화면이기도 하다.
 */
export default function ExerciseHistoryScreen({
  bundle,
  sessions,
  onOpenSession,
}: {
  bundle: RoutineBundle
  sessions: Session[]
  onOpenSession: (sessionId: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)

  const keys = useMemo(() => allRecordKeys(sessions, bundle.routine), [sessions, bundle.routine])
  const history = useMemo(
    () => (selected ? exerciseHistory(sessions, selected) : []),
    [sessions, selected],
  )

  const nameOf = (exerciseId: string) =>
    bundle.catalog.get(exerciseId)?.shortName ?? exerciseId

  if (keys.length === 0) {
    return <p className="center-note">아직 기록이 없습니다.</p>
  }

  if (!selected) {
    return (
      <div className="card">
        <div className="card-label">종목별 기록</div>
        <p className="row-sub" style={{ marginBottom: 8 }}>
          같은 기계라도 Day가 다르면 다른 기록입니다 (무게대와 목적이 다름).
        </p>
        {keys.map((info) => (
          <button className="row" key={info.recordKey} onClick={() => setSelected(info.recordKey)}>
            <div className="row-main">
              <div className="row-title">
                {nameOf(info.exerciseId)}
                <span className="chip" style={{ marginLeft: 6 }}>
                  {info.dayId.toUpperCase()}
                </span>
                {info.group && (
                  <span className="chip" style={{ marginLeft: 4 }}>
                    {info.group}
                  </span>
                )}
                {!info.known && (
                  <span className="chip chip-warn" style={{ marginLeft: 4 }}>
                    현재 루틴에 없음
                  </span>
                )}
              </div>
              <div className="row-sub mono">{info.recordKey}</div>
            </div>
            <div className="row-meta">{info.sessionCount}회 ▸</div>
          </button>
        ))}
      </div>
    )
  }

  const info = keys.find((k) => k.recordKey === selected)
  const best = history.reduce<number>((m, p) => Math.max(m, p.bestE1rm), 0)
  /*
    어시스티드(T8)는 표시 무게가 클수록 쉽다. e1RM·볼륨·"최고" 뱃지는 전부 방향이
    반대가 되므로 숨기고 안내로 바꾼다. 무게·반복수·감각은 사실이라 그대로 보여준다.
  */
  const inverse = isInverseKey(bundle.catalog, selected)

  return (
    <>
      <button className="back-link" onClick={() => setSelected(null)}>
        ‹ 종목 목록
      </button>
      <div className="card">
        <div className="card-label">{info ? nameOf(info.exerciseId) : selected}</div>
        <div className="row">
          <div className="row-main">
            <div className="row-title mono">{selected}</div>
            <div className="row-sub">{history.length}개 세션</div>
          </div>
          {!inverse && <div className="row-meta">최고 e1RM {best.toFixed(1)}kg</div>}
        </div>
        {inverse && (
          <p className="row-sub" style={{ color: 'var(--warn)' }}>
            보조 무게 종목 — 숫자가 <strong>줄어드는 것이 진전</strong>입니다. e1RM·볼륨은
            방향이 반대라 표시하지 않습니다.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-label">세션 히스토리 (최신순)</div>
        {history.map((point) => (
          <button className="row" key={point.sessionId} onClick={() => onOpenSession(point.sessionId)}>
            <div className="row-main">
              <div className="row-title">
                {point.date} ({weekdayKo(point.date)})
                {point.mode !== 'normal' && (
                  <span className="chip chip-warn" style={{ marginLeft: 6 }}>
                    {point.mode === 'return' ? '복귀' : '디로드'}
                  </span>
                )}
                {!inverse && point.bestE1rm >= best && history.length > 1 && (
                  <span className="chip chip-accent" style={{ marginLeft: 4 }}>
                    최고
                  </span>
                )}
              </div>
              <div className="row-sub">
                {point.topWeight}kg · {point.sets.map((s) => s.reps).join(' / ')}
                {point.sensoryScore !== undefined && ` · 감각 ${point.sensoryScore}`}
                {hasCompensation(point.compensation) && ' · 보상작용'}
              </div>
            </div>
            {!inverse && (
              <div className="row-meta">
                {Math.round(point.volume).toLocaleString()}
                <br />
                <span style={{ fontSize: 11 }}>kg·회</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </>
  )
}
