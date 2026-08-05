import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteSettings } from '../db'
import { parseBackup, restoreBackup, summarizeBackup, type BackupSummary } from '../lib/backup'
import { GistError, readGist, verifyToken } from '../lib/gist'
import {
  getSyncState,
  isGistConfigured,
  subscribeSync,
  syncNow,
  type SyncState,
} from '../lib/gistSync'
import { getGistToken, maskToken, setGistToken } from '../lib/secrets'
import { NO_AUTOFILL } from '../lib/inputProps'
import { formatDateTimeLocal } from '../lib/dates'

const TOKEN_HELP = 'https://github.com/settings/tokens/new?scopes=gist&description=workout-tracker'

function stateLabel(s: SyncState): string {
  switch (s.status) {
    case 'idle':
      return ''
    case 'pending':
      return '잠시 후 자동 백업합니다…'
    case 'syncing':
      return '백업 중…'
    case 'done':
      /*
        스킵과 업로드를 **문구로** 구분한다 (Z7). 스킵은 lastBackupAt을 갱신하지 않으므로
        "백업 완료 <옛 시각>"이 뜨면 방금 올린 것과 구분되지 않는다.
      */
      return s.skipped
        ? `변경 없음 — 마지막 백업 ${formatDateTimeLocal(s.at)}`
        : `백업 완료 ${formatDateTimeLocal(s.at)}`
    case 'error':
      return `실패: ${s.message}`
  }
}

/**
 * Gist 백업 (DESIGN.md §5.5).
 *
 * §11: "토큰은 코드에 없음, 사용자 입력 후 localStorage만."
 * 입력 필드는 저장 후 즉시 비운다. 저장된 토큰은 마스킹해서만 보여주고
 * 다시 읽어 표시하지 않는다 — 화면 캡처나 공유 시트로 새는 경로를 줄인다.
 */
export default function GistPanel() {
  const [tokenInput, setTokenInput] = useState('')
  const [configured, setConfigured] = useState(isGistConfigured)
  const [masked, setMasked] = useState<string | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncState>(getSyncState)
  const [restoreStaged, setRestoreStaged] = useState<{ text: string; summary: BackupSummary } | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const gistId = useLiveQuery(async () => (await db.settings.get('gistId'))?.value as string | undefined, [])
  const lastBackupAt = useLiveQuery(
    async () => (await db.settings.get('lastBackupAt'))?.value as string | undefined,
    [],
  )

  useEffect(() => subscribeSync(setSync), [])
  useEffect(() => {
    const token = getGistToken()
    setMasked(token ? maskToken(token) : null)
  }, [configured])

  const onSaveToken = async () => {
    const value = tokenInput.trim()
    if (!value) return
    setBusy(true)
    setMessage(null)
    try {
      const { login, hasGistScope } = await verifyToken(value)
      if (hasGistScope === false) {
        setMessage('이 토큰에 gist 권한이 없습니다. gist 스코프를 포함해 다시 발급하세요.')
        return
      }
      setGistToken(value)
      setTokenInput('') // 입력값을 화면에 남기지 않는다
      setConfigured(true)
      setAccount(login)
      setMessage(
        hasGistScope === null
          ? `${login} 계정으로 저장했습니다. (fine-grained 토큰은 권한 확인이 불가하니 백업을 한 번 눌러보세요)`
          : `${login} 계정으로 저장했습니다.`,
      )
    } catch (err) {
      setMessage(err instanceof GistError ? err.message : '토큰 확인에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const onRemoveToken = async () => {
    setGistToken(null)
    setConfigured(false)
    setAccount(null)
    setConfirmRemove(false)
    setMessage('토큰을 삭제했습니다. Gist 자체는 GitHub에 남아 있습니다.')
  }

  const onBackupNow = async () => {
    setBusy(true)
    // 결과는 sync 상태 줄이 보여준다. 여기서 message에도 담으면 같은 에러가 두 번 뜬다
    setMessage(null)
    await syncNow()
    setBusy(false)
  }

  const onFetchGist = async () => {
    const token = getGistToken()
    if (!token || !gistId) return
    setBusy(true)
    setMessage(null)
    setRestoreStaged(null)
    setConfirmRestore(false)
    try {
      const { content } = await readGist(token, gistId)
      const parsed = parseBackup(content)
      if ('problems' in parsed) {
        setMessage(`Gist 내용을 쓸 수 없습니다: ${parsed.problems[0]}`)
        return
      }
      setRestoreStaged({ text: content, summary: summarizeBackup(parsed.file) })
    } catch (err) {
      setMessage(err instanceof GistError ? err.message : 'Gist를 읽지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const onRestore = async () => {
    if (!restoreStaged) return
    const parsed = parseBackup(restoreStaged.text)
    if ('problems' in parsed) return
    setBusy(true)
    await restoreBackup(parsed.file)
    window.location.reload()
  }

  const onForgetGist = async () => {
    await deleteSettings(['gistId', 'lastBackupAt'])
    setMessage('연결된 Gist를 잊었습니다. 다음 백업에서 새로 만듭니다.')
  }

  return (
    <div className="card">
      <div className="card-label">Gist 백업</div>

      {!configured ? (
        <>
          <p className="row-sub" style={{ marginBottom: 10 }}>
            <strong>gist</strong> 권한만 있는 개인 액세스 토큰을 붙여넣으세요. 토큰은 이 기기의
            localStorage에만 저장되고 백업 파일이나 코드에는 들어가지 않습니다.
          </p>
          <a className="ext-link" href={TOKEN_HELP} target="_blank" rel="noreferrer">
            GitHub에서 토큰 발급하기 ↗
          </a>
          <input
            {...NO_AUTOFILL}
            className="field"
            style={{ marginTop: 10 }}
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="ghp_… 또는 github_pat_…"
            aria-label="GitHub 개인 액세스 토큰"
          />
          <div style={{ height: 8 }} />
          <button
            className="btn btn-sm btn-primary"
            onClick={() => void onSaveToken()}
            disabled={busy || tokenInput.trim().length === 0}
          >
            {busy ? '확인 중…' : '토큰 저장'}
          </button>
        </>
      ) : (
        <>
          <div className="row">
            <div className="row-main">
              <div className="row-title">토큰 저장됨</div>
              <div className="row-sub mono">{masked ?? '••••'}</div>
            </div>
            {account && <div className="row-meta">{account}</div>}
          </div>
          <div className="row">
            <div className="row-main">
              <div className="row-title">연결된 Gist</div>
              <div className="row-sub mono">{gistId ?? '아직 없음 (첫 백업에서 생성)'}</div>
            </div>
          </div>
          <div className="row">
            <div className="row-main">
              <div className="row-title">마지막 백업</div>
              <div className="row-sub">
                {lastBackupAt ? formatDateTimeLocal(lastBackupAt) : '없음'}
              </div>
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void onBackupNow()} disabled={busy}>
              지금 백업
            </button>
            <button
              className="btn btn-sm"
              onClick={() => void onFetchGist()}
              disabled={busy || !gistId}
            >
              Gist에서 복원
            </button>
          </div>

          {restoreStaged && (
            <>
              <div className="warn-box" style={{ marginTop: 12 }}>
                <strong>Gist 백업 내용</strong>
                <br />
                세션 {restoreStaged.summary.sessions}개 ({restoreStaged.summary.oldestSession ?? '—'} ~{' '}
                {restoreStaged.summary.newestSession ?? '—'})
                <br />
                내보낸 시각 {formatDateTimeLocal(restoreStaged.summary.exportedAt)}
                <br />
                복원하면 현재 데이터를 <strong>전부 교체</strong>합니다.
              </div>
              {!confirmRestore ? (
                <div className="btn-row">
                  <button className="btn btn-sm" onClick={() => setRestoreStaged(null)}>
                    취소
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => setConfirmRestore(true)}>
                    이 내용으로 교체
                  </button>
                </div>
              ) : (
                <div className="btn-row">
                  <button className="btn btn-sm" onClick={() => setConfirmRestore(false)} disabled={busy}>
                    취소
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => void onRestore()} disabled={busy}>
                    {busy ? '복원 중…' : '정말 교체'}
                  </button>
                </div>
              )}
            </>
          )}

          <div className="btn-row" style={{ marginTop: 10 }}>
            {confirmRemove ? (
              <>
                <button className="btn btn-sm" onClick={() => setConfirmRemove(false)}>
                  취소
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => void onRemoveToken()}>
                  토큰 삭제 확인
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-sm" onClick={() => setConfirmRemove(true)}>
                  토큰 삭제
                </button>
                {gistId && (
                  <button className="btn btn-sm" onClick={() => void onForgetGist()}>
                    Gist 연결 해제
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {sync.status !== 'idle' && (
        <p
          className="row-sub"
          style={{ marginTop: 10, color: sync.status === 'error' ? 'var(--danger)' : 'var(--accent)' }}
        >
          {stateLabel(sync)}
        </p>
      )}
      {message && (
        <p className="row-sub" style={{ marginTop: 8, color: 'var(--accent)' }}>
          {message}
        </p>
      )}

      <p className="row-sub" style={{ marginTop: 10 }}>
        secret gist로 만들어집니다 (URL을 아는 사람만 볼 수 있음). 세션을 종료하면 자동으로
        올라갑니다.
      </p>
    </div>
  )
}
