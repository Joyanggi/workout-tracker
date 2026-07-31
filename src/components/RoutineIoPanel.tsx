import { useState } from 'react'
import { db, setSettings } from '../db'
import { validateRoutine } from '../db/validateRoutine'
import { pickTextFile } from '../lib/pickFile'
import { OUTCOME_MESSAGE, shareFile } from '../lib/share'
import type { Exercise, RoutineTemplate } from '../types'

/**
 * 루틴 JSON 가져오기/내보내기 (DESIGN.md §5.5 — v2.4 교체 경로).
 *
 * **가져오기 전에 validateRoutine을 통과해야 한다.** muscleSets 합이 어긋난 루틴을
 * 넣으면 §4 제안 로직과 §5.1 대시보드가 서로 다른 숫자를 말하기 시작하고,
 * 원인을 찾기 매우 어려워진다. 검증 실패 시 아예 넣지 않는다.
 */
export default function RoutineIoPanel({
  routine,
  catalog,
}: {
  routine: RoutineTemplate
  catalog: Map<string, Exercise>
}) {
  const [problems, setProblems] = useState<string[]>([])
  const [staged, setStaged] = useState<{ name: string; routine: RoutineTemplate } | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const onExport = async () => {
    const outcome = await shareFile({
      filename: `routine-${routine.id}.json`,
      text: JSON.stringify(routine, null, 2),
      mimeType: 'application/json',
      title: routine.name,
    })
    setStatus(`루틴 내보내기 — ${OUTCOME_MESSAGE[outcome]}`)
  }

  const onPick = async () => {
    setProblems([])
    setStaged(null)
    setStatus(null)
    const picked = await pickTextFile('application/json,.json')
    if (!picked) return

    let parsed: RoutineTemplate
    try {
      parsed = JSON.parse(picked.text) as RoutineTemplate
    } catch (err) {
      setProblems([`JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`])
      return
    }
    if (!parsed?.id || !Array.isArray(parsed.days) || !parsed.rules || !parsed.muscleTargets) {
      setProblems(['루틴 파일 형태가 아닙니다 (id / days / rules / muscleTargets 필요)'])
      return
    }

    // 카탈로그는 현재 종목 + 가져올 루틴이 참조하는 종목 기준으로 검사한다
    const catalogList = [...catalog.values()]
    const found = validateRoutine(parsed, catalogList)
    if (found.length > 0) {
      setProblems(found)
      return
    }
    setStaged({ name: picked.name, routine: parsed })
  }

  const onApply = async () => {
    if (!staged) return
    await db.routines.put(staged.routine)
    await setSettings({
      activeRoutineId: staged.routine.id,
      seededRoutineVersion: staged.routine.version,
    })
    setStaged(null)
    setStatus(`${staged.routine.name} 적용됨`)
  }

  return (
    <div className="card">
      <div className="card-label">루틴 JSON</div>

      {problems.length > 0 && (
        <div className="banner banner-danger" style={{ alignItems: 'flex-start' }}>
          <span>
            정합성 검사 실패 — 가져오지 않았습니다
            <br />
            {problems.map((p) => (
              <small key={p}>
                · {p}
                <br />
              </small>
            ))}
          </span>
        </div>
      )}

      {staged ? (
        <>
          <div className="row">
            <div className="row-main">
              <div className="row-title">{staged.routine.name}</div>
              <div className="row-sub mono">
                {staged.routine.id} · v{staged.routine.version}
              </div>
            </div>
            <div className="row-meta">
              Day {staged.routine.days.length}+{staged.routine.fallbackDays?.length ?? 0}
            </div>
          </div>
          <p className="row-sub">
            정합성 검사 통과. 적용하면 활성 루틴이 이 루틴으로 바뀝니다. 세션 기록은 그대로
            유지됩니다 (기록 키 기준).
          </p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => setStaged(null)}>
              취소
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => void onApply()}>
              적용
            </button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => void onExport()}>
            현재 루틴 내보내기
          </button>
          <button className="btn btn-sm" onClick={() => void onPick()}>
            루틴 가져오기
          </button>
        </div>
      )}

      {status && (
        <p className="row-sub" style={{ marginTop: 10, color: 'var(--accent)' }}>
          {status}
        </p>
      )}
    </div>
  )
}
