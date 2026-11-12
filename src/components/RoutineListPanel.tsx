import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { BUNDLED_ROUTINE } from '../db/seed'
import { OPEN_SESSION_BLOCK } from '../lib/routineEdit'
import { activateRoutine, deleteRoutine } from '../lib/routineStore'
import { useSessionStore } from '../store/session'

/**
 * 루틴 목록 (v1.16 NN4) — 새 루틴·전환·삭제.
 * 읽기만 한다(useLiveQuery). 쓰기는 routineStore의 함수로만 한다.
 */
export default function RoutineListPanel({
  activeId,
  onNew,
}: {
  activeId: string
  onNew: () => void
}) {
  const openSession = useSessionStore((s) => s.session)
  const routines = useLiveQuery(() => db.routines.toArray(), [])
  const [pending, setPending] = useState<{ id: string; kind: 'use' | 'delete' } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const run = async (action: () => Promise<string[]>) => {
    const found = await action()
    setProblem(found.length > 0 ? found.join(' · ') : null)
    setPending(null)
  }

  return (
    <div className="card">
      <div className="card-label">루틴 목록</div>
      {(routines ?? []).map((r) => {
        const isActive = r.id === activeId
        const isBundled = r.id === BUNDLED_ROUTINE.id
        const asking = pending?.id === r.id ? pending.kind : null
        return (
          <div key={r.id} style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="row" style={{ borderBottom: 'none' }}>
              <div className="row-main">
                <div className="row-title">{r.name}</div>
                <div className="row-sub">
                  Day {r.days.length}개
                  {isActive && ' · 사용 중'}
                  {!isActive && isBundled && ' · 기본'}
                </div>
              </div>
              {!isActive && asking === null && (
                <button
                  className="btn"
                  disabled={openSession !== null}
                  onClick={() => setPending({ id: r.id, kind: 'use' })}
                >
                  이 루틴 쓰기
                </button>
              )}
              {!isActive && !isBundled && asking === null && (
                <button
                  className="btn btn-danger ml-inline"
                  
                  onClick={() => setPending({ id: r.id, kind: 'delete' })}
                >
                  삭제
                </button>
              )}
            </div>
            {asking === 'use' && (
              <div className="row-confirm">
                <p className="row-sub">
                  루틴을 바꾸면 홈의 제안과 주간 목표가 이 루틴 기준이 됩니다. 지난 기록은 그대로 남지만, 이 루틴에 없는
                  Day·종목은 이름과 그룹 없이 보일 수 있습니다. 다시 바꾸면 원래대로 보입니다.
                </p>
                <button className="btn" onClick={() => void run(() => activateRoutine(r.id))}>
                  바꾸기
                </button>
                <button className="btn ml-inline" onClick={() => setPending(null)}>
                  취소
                </button>
              </div>
            )}
            {asking === 'delete' && (
              <div className="row-confirm">
                <p className="row-sub">
                  이 루틴을 삭제합니다. 운동 기록은 지워지지 않지만, 이 루틴에만 있던 Day·종목의 기록은
                  이름과 그룹을 다시 볼 수 없게 됩니다. 되돌릴 수 없습니다.
                </p>
                <button
                  className="btn btn-danger"
                  onClick={() => void run(() => deleteRoutine(r.id, BUNDLED_ROUTINE.id))}
                >
                  삭제
                </button>
                <button className="btn ml-inline" onClick={() => setPending(null)}>
                  취소
                </button>
              </div>
            )}
          </div>
        )
      })}
      {problem !== null && <p className="row-sub">{problem}</p>}
      <button className="btn mt-row" disabled={openSession !== null} onClick={onNew}>
        ＋ 새 루틴 만들기
      </button>
      {openSession !== null && <p className="row-sub">{OPEN_SESSION_BLOCK.activate}</p>}
    </div>
  )
}
