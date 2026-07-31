import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db'
import type { EntryActions } from '../components/ExerciseCard'
import { applyDayChange } from './dayChange'
import {
  applyAddSet,
  applyCompensation,
  applyPatchSet,
  applyRemoveSet,
  applySensoryNote,
  applySensoryScore,
  applySkipped,
  applyToggleDone,
} from './sessionOps'
import type { CardioRecord, RoutineTemplate, Session } from '../types'

/**
 * 완료된 세션 편집 (DESIGN.md §5.3 "편집 가능 — 당일 입력 실수 보정").
 *
 * useSessionStore와 같은 순수 함수(lib/sessionOps)를 쓰고 같은 EntryActions 인터페이스를
 * 노출한다. 그래서 ExerciseCard가 두 화면에서 동일하게 동작한다.
 *
 * 저장 버튼은 없다 — 앱 전체가 입력 즉시 IndexedDB에 반영하는 방식이고(§5.2),
 * 편집 화면만 예외로 두면 "저장했나?"를 의심하게 된다.
 */
export interface SessionEditor {
  session: Session | null
  loading: boolean
  actions: EntryActions
  setCardio: (cardio: CardioRecord | undefined) => void
  setNote: (note: string) => void
  changeDay: (routine: RoutineTemplate, toDayId: string) => void
  remove: () => Promise<void>
}

export function useSessionEditor(sessionId: string | null): SessionEditor {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const found = sessionId ? await db.sessions.get(sessionId) : undefined
      if (cancelled) return
      setSession(found ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  /**
   * updater 함수 안에서 저장하지 않는다. React StrictMode는 updater를 두 번 호출하므로
   * 같은 쓰기가 두 번 나가고, 순서가 뒤바뀌면 낡은 값이 나중에 저장될 수 있다.
   * 계산은 updater에서, 쓰기는 밖에서 한다.
   */
  const update = useCallback((mutate: (s: Session) => Session) => {
    setSession((current) => (current ? mutate(current) : current))
  }, [])

  // session이 바뀌면 저장한다 (첫 로드분은 건너뛴다 — 읽은 것을 되쓸 필요가 없다)
  const loadedId = useRef<string | null>(null)
  useEffect(() => {
    if (!session) return
    if (loadedId.current !== session.id) {
      loadedId.current = session.id
      return
    }
    void db.sessions.put(session).catch((err) => console.error('[edit] 저장 실패', err))
  }, [session])

  const actions: EntryActions = {
    patchSet: (key, i, patch) => update((s) => applyPatchSet(s, key, i, patch)),
    // 편집 화면의 체크는 "그 세트를 실제로 했는가"를 정정하는 것이다.
    // performedOrder 재부여 규칙은 세션 중과 동일하게 sessionOps가 처리한다.
    toggleDone: (key, i) => update((s) => applyToggleDone(s, key, i, new Date())),
    addSet: (key) => update((s) => applyAddSet(s, key)),
    removeSet: (key, i) => update((s) => applyRemoveSet(s, key, i)),
    setSkipped: (key, v) => update((s) => applySkipped(s, key, v)),
    setSensoryScore: (key, v) => update((s) => applySensoryScore(s, key, v)),
    setSensoryNote: (key, v) => update((s) => applySensoryNote(s, key, v)),
    setCompensation: (key, v) => update((s) => applyCompensation(s, key, v)),
  }

  return {
    session,
    loading,
    actions,
    setCardio: (cardio) => update((s) => ({ ...s, cardio })),
    setNote: (note) => update((s) => ({ ...s, sessionNote: note.trim() || undefined })),
    changeDay: (routine, toDayId) => update((s) => applyDayChange(s, routine, toDayId)),
    remove: async () => {
      if (!session) return
      await db.sessions.delete(session.id)
      setSession(null)
    },
  }
}
