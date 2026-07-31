import { createBackup } from './backup'
import { createGist, GistError, updateGist } from './gist'
import { getGistToken } from './secrets'
import { daysBetween, todayLocal } from './dates'
import { getSetting, setSettings } from '../db'

/**
 * Gist 동기화 (DESIGN.md §5.5).
 * "이후 세션 종료마다 debounce 동기화. 마지막 백업 시각 표시."
 *
 * 백업 본문은 `createBackup()`을 그대로 쓴다 — 이미 비밀값이 걸러져 있으므로(마일스톤 6)
 * Gist에 토큰이 올라갈 경로가 없다.
 */

/** 세션 종료 후 이만큼 기다렸다가 올린다. 연속 종료(같은 날 두 세션)를 하나로 합친다 */
export const SYNC_DEBOUNCE_MS = 8_000

/** §11: 주 1회 백업 리마인드 */
export const BACKUP_REMINDER_DAYS = 7

export type SyncState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'syncing' }
  | { status: 'done'; at: string }
  | { status: 'error'; message: string }

type Listener = (state: SyncState) => void

let timer: number | undefined
let state: SyncState = { status: 'idle' }
const listeners = new Set<Listener>()

function emit(next: SyncState): void {
  state = next
  for (const l of listeners) l(next)
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isGistConfigured(): boolean {
  return getGistToken() !== null
}

/**
 * 실제 업로드. gistId가 없으면 private gist를 새로 만들고 id를 저장한다.
 * 반환값은 성공 여부 — 호출자가 화면 상태를 갱신할 수 있게.
 */
export async function syncNow(): Promise<SyncState> {
  const token = getGistToken()
  if (!token) {
    const next: SyncState = { status: 'error', message: 'Gist 토큰이 설정되지 않았습니다.' }
    emit(next)
    return next
  }

  emit({ status: 'syncing' })
  try {
    const content = JSON.stringify(await createBackup(), null, 2)
    const existingId = await getSetting<string | null>('gistId', null)

    let info
    if (existingId) {
      try {
        info = await updateGist(token, existingId, content)
      } catch (err) {
        // gist를 GitHub에서 지운 경우 — 새로 만들어 이어간다.
        // 여기서 그냥 실패하면 사용자가 설정을 초기화하는 방법을 알 수 없다
        if (err instanceof GistError && err.kind === 'notFound') {
          info = await createGist(token, content)
        } else {
          throw err
        }
      }
    } else {
      info = await createGist(token, content)
    }

    await setSettings({ gistId: info.gistId, lastBackupAt: info.updatedAt })
    const next: SyncState = { status: 'done', at: info.updatedAt }
    emit(next)
    return next
  } catch (err) {
    const message =
      err instanceof GistError ? err.message : err instanceof Error ? err.message : String(err)
    const next: SyncState = { status: 'error', message }
    emit(next)
    return next
  }
}

/**
 * 세션 종료 시 호출. debounce로 묶어서 올린다.
 * 토큰이 없으면 아무것도 하지 않는다 — 백업을 설정하지 않은 사용자에게
 * 실패 알림을 띄우는 것은 소음이다.
 */
export function requestSync(delayMs: number = SYNC_DEBOUNCE_MS): void {
  if (!isGistConfigured()) return
  window.clearTimeout(timer)
  emit({ status: 'pending' })
  timer = window.setTimeout(() => {
    void syncNow()
  }, delayMs)
}

export function cancelPendingSync(): void {
  window.clearTimeout(timer)
  timer = undefined
  if (state.status === 'pending') emit({ status: 'idle' })
}

// ─── 백업 리마인드 (§11) ─────────────────────────────────

export interface ReminderInfo {
  show: boolean
  /** 마지막 백업으로부터 며칠. 백업한 적 없으면 null */
  daysSince: number | null
  configured: boolean
}

/**
 * §11 리스크 대응: "주 1회 백업 리마인드 배너".
 *
 * 기록이 하나도 없으면 띄우지 않는다 — 잃을 것이 없는데 경고하면
 * 배너에 대한 신뢰만 떨어진다.
 */
export function backupReminder(args: {
  sessionCount: number
  lastBackupAt: string | null
  configured: boolean
  today?: string
}): ReminderInfo {
  const { sessionCount, lastBackupAt, configured, today = todayLocal() } = args
  const daysSince = lastBackupAt ? daysBetween(lastBackupAt.slice(0, 10), today) : null

  if (sessionCount === 0) return { show: false, daysSince, configured }
  if (!configured) return { show: true, daysSince, configured }
  if (daysSince === null) return { show: true, daysSince, configured }
  return { show: daysSince >= BACKUP_REMINDER_DAYS, daysSince, configured }
}
