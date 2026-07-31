import type { RecordKey, Session, SessionEntry, SetRecord } from '../types'

/**
 * 세션 변형 로직 — 순수 함수. store는 이걸 호출하고 저장만 담당한다.
 * (Dexie 없이 테스트할 수 있어야 performedOrder 규칙을 검증할 수 있다)
 */

/** 다음 performedOrder = 이미 부여된 것들의 최대 + 1 */
export function nextPerformedOrder(entries: SessionEntry[]): number {
  const used = entries.map((e) => e.performedOrder).filter((n): n is number => n !== null)
  return used.length === 0 ? 1 : Math.max(...used) + 1
}

function mapEntry(
  session: Session,
  recordKey: RecordKey,
  fn: (entry: SessionEntry, entries: SessionEntry[]) => SessionEntry,
): Session {
  return {
    ...session,
    entries: session.entries.map((e) => (e.recordKey === recordKey ? fn(e, session.entries) : e)),
  }
}

export function applyPatchSet(
  session: Session,
  recordKey: RecordKey,
  index: number,
  patch: Partial<SetRecord>,
): Session {
  return mapEntry(session, recordKey, (entry) => ({
    ...entry,
    sets: entry.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  }))
}

/**
 * 세트 체크 토글.
 *
 * 첫 세트를 체크한 시각 순으로 performedOrder를 자동 부여한다 (§5.2).
 * 계획 순서와 무관하게 아무 카드나 먼저 해도 되는 것이 이 앱의 요구사항이고,
 * 그 실제 순서가 분석 대상이다.
 *
 * 전부 해제하면 되돌린다 — 잘못 누른 체크가 수행 순서를 영구히 바꾸면 안 된다.
 */
export function applyToggleDone(
  session: Session,
  recordKey: RecordKey,
  index: number,
  now: Date,
): Session {
  const iso = now.toISOString()
  return mapEntry(session, recordKey, (entry, entries) => {
    const sets = entry.sets.map((s, i) =>
      i === index ? { ...s, done: !s.done, doneAt: !s.done ? iso : undefined } : s,
    )
    const anyDone = sets.some((s) => s.done)

    if (anyDone && entry.performedOrder === null) {
      return {
        ...entry,
        sets,
        performedOrder: nextPerformedOrder(entries),
        firstSetAt: iso,
        skipped: false,
      }
    }
    if (!anyDone && entry.performedOrder !== null) {
      return { ...entry, sets, performedOrder: null, firstSetAt: undefined }
    }
    return { ...entry, sets }
  })
}

export function applyAddSet(session: Session, recordKey: RecordKey): Session {
  return mapEntry(session, recordKey, (entry) => {
    const last = entry.sets[entry.sets.length - 1]
    return {
      ...entry,
      sets: [...entry.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 0, done: false }],
    }
  })
}

/** 마지막 1세트는 남긴다 — 세트가 0개인 종목은 표시할 것도 없다 */
export function applyRemoveSet(session: Session, recordKey: RecordKey, index: number): Session {
  return mapEntry(session, recordKey, (entry) =>
    entry.sets.length <= 1 ? entry : { ...entry, sets: entry.sets.filter((_, i) => i !== index) },
  )
}

export function applySkipped(session: Session, recordKey: RecordKey, skipped: boolean): Session {
  return mapEntry(session, recordKey, (entry) => ({ ...entry, skipped }))
}
