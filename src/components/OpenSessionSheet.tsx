import { useState } from 'react'
import { doneSets, findDay } from '../lib/derive'
import { formatClock, weekdayKo } from '../lib/dates'
import type { RoutineBundle } from '../lib/useRoutine'
import type { Session } from '../types'

/**
 * 진행 중 세션이 있는데 새 세션을 시작하려 할 때 (§11 관련).
 *
 * 이 시트가 없으면 `begin()`이 기존 open 세션을 그냥 덮어써서 `endedAt` 없는 세션이
 * DB에 남는다. 다음 앱 실행에서 며칠 전 세션이 "진행 중"으로 부활하고,
 * 체크된 세트가 있으면 종료 시트의 "버리기"도 조건에 걸려 지울 수 없다.
 *
 * 셋 다 파괴적이지 않은 선택지를 준다: 이어하기 / 마감하고 새로 / 버리고 새로.
 */
export default function OpenSessionSheet({
  bundle,
  openSession,
  onResume,
  onFinishAndStart,
  onDiscardAndStart,
  onClose,
}: {
  bundle: RoutineBundle
  openSession: Session
  onResume: () => void
  onFinishAndStart: () => void
  onDiscardAndStart: () => void
  onClose: () => void
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const day = findDay(bundle.routine, openSession.dayId)
  const doneCount = openSession.entries.reduce((n, e) => n + doneSets(e).length, 0)
  const hasRecords = doneCount > 0

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="진행 중 세션 처리"
      >
        <div className="sheet-grip" />
        <div className="card-label">진행 중인 세션이 있어요</div>

        <div className="row">
          <div className="row-main">
            <div className="row-title">{day?.name ?? openSession.dayId}</div>
            <div className="row-sub">
              {openSession.date} ({weekdayKo(openSession.date)}){' '}
              {formatClock(openSession.startedAt)} 시작
            </div>
          </div>
          <div className="row-meta">{doneCount}세트</div>
        </div>

        <p className="row-sub" style={{ marginTop: 8 }}>
          {hasRecords
            ? '새로 시작하기 전에 이 세션을 어떻게 할지 정해야 합니다.'
            : '기록된 세트가 없는 세션입니다.'}
        </p>

        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onResume}>
          이어하기
        </button>

        {hasRecords && (
          <>
            <div style={{ height: 8 }} />
            <button className="btn" onClick={onFinishAndStart}>
              마감하고 새로 시작 ({doneCount}세트 기록 유지)
            </button>
          </>
        )}

        <div style={{ height: 8 }} />
        {confirmDiscard ? (
          <>
            <p className="row-sub" style={{ color: 'var(--danger)' }}>
              {hasRecords
                ? `${doneCount}세트 기록이 삭제됩니다. 되돌릴 수 없습니다.`
                : '이 세션을 삭제합니다.'}
            </p>
            <div className="btn-row">
              <button className="btn" onClick={() => setConfirmDiscard(false)}>
                취소
              </button>
              <button className="btn btn-danger" onClick={onDiscardAndStart}>
                버리고 새로 시작
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-danger" onClick={() => setConfirmDiscard(true)}>
            버리고 새로 시작
          </button>
        )}

        <div style={{ height: 8 }} />
        <button className="btn" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  )
}
