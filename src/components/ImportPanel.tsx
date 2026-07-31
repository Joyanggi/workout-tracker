import { useState } from 'react'
import {
  parseBackup,
  restoreBackup,
  summarizeBackup,
  type BackupFile,
  type BackupSummary,
} from '../lib/backup'
import { pickTextFile } from '../lib/pickFile'

/**
 * JSON 복원 (DESIGN.md §5.5).
 * "가져오기: JSON 복원 (병합 아닌 전체 교체, 확인 2단계)"
 *
 * 1단계 = 파일을 읽고 내용 요약을 보여준다 (무엇으로 교체되는지 알려주는 단계)
 * 2단계 = 명시적 확인
 */
export default function ImportPanel() {
  const [staged, setStaged] = useState<{ name: string; file: BackupFile; summary: BackupSummary } | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const onPick = async () => {
    setProblems([])
    setStaged(null)
    setConfirming(false)
    const picked = await pickTextFile('application/json,.json')
    if (!picked) return
    const result = parseBackup(picked.text)
    if ('problems' in result) {
      setProblems(result.problems)
      return
    }
    setStaged({ name: picked.name, file: result.file, summary: summarizeBackup(result.file) })
  }

  const onRestore = async () => {
    if (!staged) return
    setBusy(true)
    await restoreBackup(staged.file)
    // 복원 후에는 화면 상태가 전부 낡았다. 부분 갱신을 시도하기보다 새로 띄운다
    window.location.reload()
  }

  return (
    <div className="card">
      <div className="card-label">가져오기 (JSON 복원)</div>

      {problems.length > 0 && (
        <div className="banner banner-danger" style={{ alignItems: 'flex-start' }}>
          <span>
            불러올 수 없는 파일입니다
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

      {!staged ? (
        <>
          <button className="btn btn-sm" onClick={() => void onPick()}>
            백업 파일 선택
          </button>
          <p className="row-sub" style={{ marginTop: 8 }}>
            현재 데이터를 <strong>전부 교체</strong>합니다. 병합하지 않습니다.
          </p>
        </>
      ) : (
        <>
          <div className="row">
            <div className="row-main">
              <div className="row-title mono">{staged.name}</div>
              <div className="row-sub">
                내보낸 시각 {staged.summary.exportedAt.slice(0, 16).replace('T', ' ')}
              </div>
            </div>
          </div>
          <div className="row">
            <div className="row-main">
              <div className="row-title">세션</div>
              <div className="row-sub">
                {staged.summary.oldestSession ?? '—'} ~ {staged.summary.newestSession ?? '—'}
              </div>
            </div>
            <div className="row-meta">{staged.summary.sessions}개</div>
          </div>
          <div className="row">
            <div className="row-main">
              <div className="row-title">루틴 / 종목</div>
            </div>
            <div className="row-meta">
              {staged.summary.routines} / {staged.summary.exercises}
            </div>
          </div>

          {!confirming ? (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-sm" onClick={() => setStaged(null)}>
                취소
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirming(true)}>
                이 파일로 교체
              </button>
            </div>
          ) : (
            <>
              <p className="row-sub" style={{ marginTop: 12, color: 'var(--danger)' }}>
                현재 기록이 모두 삭제되고 이 파일의 내용으로 대체됩니다. 되돌릴 수 없습니다.
              </p>
              <div className="btn-row">
                <button className="btn btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
                  취소
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => void onRestore()}
                  disabled={busy}
                >
                  {busy ? '복원 중…' : '정말 교체'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
