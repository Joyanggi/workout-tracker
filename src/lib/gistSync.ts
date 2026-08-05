import { createBackup, fingerprintPayload } from './backup'
import { createGist, GistError, updateGist } from './gist'
import { getGistToken } from './secrets'
import { daysBetween, localDateOf, todayLocal } from './dates'
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
  /**
   * 업로드 성공 또는 **건너뜀**.
   *
   * `skipped`를 구분하는 이유 (Z7): 스킵은 `lastBackupAt`을 갱신하지 않는 것이 맞다
   * (올린 게 없으므로). 그런데 화면 문구가 "백업 완료 <옛 시각>"이면 방금 올린 것과
   * 구분되지 않는다 — 사용자가 버튼을 눌렀을 때 "올라갔다 / 올릴 게 없었다"가
   * **문구만으로** 갈려야 한다. 틀린 것은 시각이 아니라 문구였다.
   */
  | { status: 'done'; at: string; skipped?: boolean }
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
 * SHA-256 hex. 실패하면 `null` — 호출부는 그때 **그냥 올린다** (건너뛰지 않는다).
 *
 * `crypto.subtle`은 보안 컨텍스트(https·localhost)에서만 있다. 배포는 https이고 개발은
 * localhost이므로 정상 경로에서는 항상 있지만, 없을 때 조용히 32비트 해시로 떨어지면
 * 충돌이 "실제 변경을 건너뛰는" 사고가 된다 — 그래서 대체 해시를 두지 않는다.
 */
async function sha256(text: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
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
    const file = await createBackup()
    const content = JSON.stringify(file, null, 2)
    const existingId = await getSetting<string | null>('gistId', null)

    /*
     * 내용이 직전 업로드와 같으면 건너뛴다 (Y4).
     *
     * X7이 식단 쓰기마다 동기화를 예약하면서 업로드 빈도가 크게 올랐다. 같은 내용을 다시
     * 올리는 것은 순수한 낭비다 — 매 업로드가 전체 백업(수십 KB)이다.
     *
     * **건너뛰기는 위험한 방향이므로 보수적으로 만든다:**
     * - 지문 계산이 실패하면(구형 환경 등) `null`이 되고 **그냥 올린다**
     * - gist가 아직 없으면(`existingId` 없음) 비교 대상이 없으니 올린다
     * - 해시는 SHA-256이다. 32비트 해시로는 충돌이 "실제 변경을 건너뛰는" 사고가 된다
     *
     * `lastBackupAt`은 갱신하지 않는다 — 올린 게 없으므로 마지막 백업 시각은 그대로가 사실이다.
     */
    const fingerprint = await sha256(fingerprintPayload(file))
    if (existingId && fingerprint !== null) {
      const lastHash = await getSetting<string | null>('lastBackupHash', null)
      const lastAt = await getSetting<string | null>('lastBackupAt', null)
      // 마지막 백업 시각이 없으면 건너뛰지 않는다 — 보고할 사실이 없으면 올리는 쪽이 안전하다
      if (lastHash === fingerprint && lastAt !== null) {
        clearSyncPending()
        const next: SyncState = { status: 'done', at: lastAt, skipped: true }
        emit(next)
        return next
      }
    }

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

    await setSettings({
      gistId: info.gistId,
      lastBackupAt: info.updatedAt,
      ...(fingerprint !== null ? { lastBackupHash: fingerprint } : {}),
    })
    clearSyncPending()
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
  markSyncPending()
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

// ─── 백그라운드 전환 대비 ────────────────────────────────

/**
 * "올려야 할 변경이 남아 있다" 플래그.
 *
 * 세션 종료 후 8초 debounce 중에 폰을 잠그면 — **헬스장에서 가장 흔한 동작** —
 * iOS가 타이머를 동결시키고, 앱이 그대로 종료되면 그 백업은 영구히 유실된다.
 * 화면이 켜져 있을 때만 동작하는 debounce는 이 경로를 막지 못한다.
 *
 * localStorage에 플래그를 남겨 (1) 백그라운드 진입 직전에 즉시 flush하고
 * (2) 그래도 못 올렸으면 다음 부팅에서 재시도한다.
 */
const PENDING_KEY = 'workout-tracker.gistSyncPending'

function markSyncPending(): void {
  try {
    localStorage.setItem(PENDING_KEY, '1')
  } catch {
    /* 프라이빗 모드 */
  }
}

function clearSyncPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* noop */
  }
}

export function hasPendingSync(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 백그라운드 전환·부팅 시 밀린 백업을 올린다.
 *
 * `visibilitychange → hidden`에서는 비동기 작업이 끝날 보장이 없지만,
 * fetch는 이미 발사됐으므로 브라우저가 대개 완주시킨다. 실패하면 플래그가 남아
 * 다음 부팅에서 다시 시도한다 — 두 겹으로 두는 이유다.
 */
export function flushPendingSync(): void {
  if (!isGistConfigured() || !hasPendingSync()) return
  window.clearTimeout(timer)
  timer = undefined
  void syncNow()
}

/** App 부팅 시 한 번 등록한다 */
export function installSyncLifecycle(): () => void {
  const onHidden = () => {
    if (document.visibilityState === 'hidden') flushPendingSync()
  }
  document.addEventListener('visibilitychange', onHidden)
  // iOS Safari는 앱 종료 시 visibilitychange를 놓치는 경우가 있어 pagehide도 본다
  window.addEventListener('pagehide', flushPendingSync)
  return () => {
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', flushPendingSync)
  }
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
  /*
   * **로컬 날짜로 센다** (Z7). `slice(0, 10)`은 UTC 날짜라 KST 자정~09시 업로드가
   * 하루 어긋나고, 리마인드가 하루 일찍/늦게 뜬다.
   */
  const daysSince = lastBackupAt ? daysBetween(localDateOf(lastBackupAt), today) : null

  if (sessionCount === 0) return { show: false, daysSince, configured }
  if (!configured) return { show: true, daysSince, configured }
  if (daysSince === null) return { show: true, daysSince, configured }
  return { show: daysSince >= BACKUP_REMINDER_DAYS, daysSince, configured }
}
