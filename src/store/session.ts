import { create } from 'zustand'
import { db, getOpenSession } from '../db'
import {
  applyAddSet,
  applyPatchSet,
  applyRemoveSet,
  applySkipped,
  applyToggleDone,
} from '../lib/sessionOps'
import type { CardioRecord, RecordKey, Session, SetRecord } from '../types'

/**
 * 진행 중 세션의 작업 사본 + write-through 저장.
 *
 * DESIGN.md §5.2: "완료 시 자동 저장은 이미 되어 있음 — 입력 즉시 IndexedDB 반영.
 * 앱이 죽어도 유실 없음. 저장 버튼 없음."
 *
 * useLiveQuery로 IndexedDB를 직접 읽지 않는 이유: 스테퍼를 누를 때마다 쓰기 →
 * 알림 → 재조회 → 리렌더를 왕복하면 입력 반응이 늦다. 화면은 이 store를 보고,
 * 저장은 백그라운드로 따라간다.
 *
 * 변형 로직은 전부 lib/sessionOps.ts의 순수 함수에 있다 (테스트 가능하도록).
 */

function persist(session: Session): void {
  void db.sessions.put(session).catch((err) => {
    console.error('[session] 저장 실패', err)
  })
}

interface SessionState {
  session: Session | null
  /** 방금 종료한 세션 (요약 화면용) */
  lastFinished: Session | null
  restored: boolean

  restore: () => Promise<void>
  begin: (session: Session) => void
  discard: () => Promise<void>
  finish: (now?: Date) => Promise<Session | null>

  patchSet: (recordKey: RecordKey, index: number, patch: Partial<SetRecord>) => void
  toggleDone: (recordKey: RecordKey, index: number, now?: Date) => void
  addSet: (recordKey: RecordKey) => void
  removeSet: (recordKey: RecordKey, index: number) => void
  setSkipped: (recordKey: RecordKey, skipped: boolean) => void
  setNote: (note: string) => void
  setCardio: (cardio: CardioRecord | undefined) => void
}

export const useSessionStore = create<SessionState>((set, get) => {
  const update = (mutate: (session: Session) => Session) => {
    const current = get().session
    if (!current) return
    const next = mutate(current)
    set({ session: next })
    persist(next)
  }

  return {
    session: null,
    lastFinished: null,
    restored: false,

    restore: async () => {
      const open = await getOpenSession()
      set({ session: open ?? null, restored: true })
    },

    begin: (session) => {
      set({ session })
      persist(session)
    },

    discard: async () => {
      const current = get().session
      if (current) await db.sessions.delete(current.id)
      set({ session: null })
    },

    finish: async (now = new Date()) => {
      const current = get().session
      if (!current) return null
      const finished: Session = { ...current, endedAt: now.toISOString() }
      await db.sessions.put(finished)
      set({ session: null, lastFinished: finished })
      return finished
    },

    patchSet: (recordKey, index, patch) =>
      update((s) => applyPatchSet(s, recordKey, index, patch)),

    toggleDone: (recordKey, index, now = new Date()) =>
      update((s) => applyToggleDone(s, recordKey, index, now)),

    addSet: (recordKey) => update((s) => applyAddSet(s, recordKey)),

    removeSet: (recordKey, index) => update((s) => applyRemoveSet(s, recordKey, index)),

    setSkipped: (recordKey, skipped) => update((s) => applySkipped(s, recordKey, skipped)),

    setNote: (note) => update((s) => ({ ...s, sessionNote: note || undefined })),

    setCardio: (cardio) => update((s) => ({ ...s, cardio })),
  }
})
