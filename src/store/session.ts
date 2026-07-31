import { create } from 'zustand'
import { db, getOpenSession } from '../db'
import {
  applyAddSet,
  applyCompensation,
  applyPatchSet,
  applyRemoveSet,
  applySensoryNote,
  applySensoryScore,
  applySkipped,
  applySubstitute,
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
  begin: (session: Session) => boolean
  discard: () => Promise<void>
  finish: (now?: Date) => Promise<Session | null>

  patchSet: (recordKey: RecordKey, index: number, patch: Partial<SetRecord>) => void
  toggleDone: (recordKey: RecordKey, index: number, now?: Date) => void
  addSet: (recordKey: RecordKey, opts?: { warmup?: boolean }) => void
  removeSet: (recordKey: RecordKey, index: number) => void
  setSkipped: (recordKey: RecordKey, skipped: boolean) => void
  substitute: (
    recordKey: RecordKey,
    next: { recordKey: RecordKey; setCount: number; weight: number; reps: number },
  ) => void
  setSensoryScore: (recordKey: RecordKey, score: 0 | 1 | 2 | 3) => void
  setSensoryNote: (recordKey: RecordKey, note: string) => void
  setCompensation: (recordKey: RecordKey, compensation: string) => void
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

    /**
     * 새 세션 시작. **기존 진행 중 세션이 있으면 거부한다.**
     * 그냥 덮어쓰면 endedAt 없는 세션이 DB에 남아 다음 실행에서 "진행 중"으로 부활한다.
     * 호출자가 OpenSessionSheet로 처리 방법을 물은 뒤 finish/discard를 먼저 불러야 한다.
     */
    begin: (session) => {
      if (get().session) return false
      set({ session })
      persist(session)
      return true
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

    addSet: (recordKey, opts) => update((s) => applyAddSet(s, recordKey, opts)),

    removeSet: (recordKey, index) => update((s) => applyRemoveSet(s, recordKey, index)),

    setSkipped: (recordKey, skipped) => update((s) => applySkipped(s, recordKey, skipped)),

    substitute: (recordKey, next) => update((s) => applySubstitute(s, recordKey, next)),

    setSensoryScore: (recordKey, score) => update((s) => applySensoryScore(s, recordKey, score)),

    setSensoryNote: (recordKey, note) => update((s) => applySensoryNote(s, recordKey, note)),

    setCompensation: (recordKey, compensation) =>
      update((s) => applyCompensation(s, recordKey, compensation)),

    setNote: (note) => update((s) => ({ ...s, sessionNote: note || undefined })),

    setCardio: (cardio) => update((s) => ({ ...s, cardio })),
  }
})
