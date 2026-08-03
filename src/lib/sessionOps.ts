import { NO_COMPENSATION, type RecordKey, type Session, type SessionEntry, type SetRecord } from '../types'

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

export function applyAddSet(
  session: Session,
  recordKey: RecordKey,
  opts: { warmup?: boolean } = {},
): Session {
  return mapEntry(session, recordKey, (entry) => {
    const last = entry.sets[entry.sets.length - 1]
    const set: SetRecord = {
      weight: last?.weight ?? 0,
      reps: last?.reps ?? 0,
      done: false,
      ...(opts.warmup ? { warmup: true } : {}),
    }
    // 워밍업은 앞에 붙인다 — 실제 수행 순서가 그렇고, 세트 번호도 작업 세트가 1부터 시작해야 한다
    return { ...entry, sets: opts.warmup ? [set, ...entry.sets] : [...entry.sets, set] }
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

/**
 * 대체 종목으로 교체 (T8).
 *
 * recordKey를 대체 종목 자신의 것으로 바꾸고 `substituteFor`에 원 라인을 남긴다 —
 * 프리필·증량 판정·PR은 분리되고, 부위 집계·목표 반복수는
 * `derive.routineExerciseOfEntry`가 원 종목을 되짚는다.
 *
 * 원 종목으로 되돌리는 경우(대체 → 원래대로)에는 `substituteFor`를 **지운다.**
 * 그러지 않으면 `substituteFor === recordKey`인 "자기 자신의 대체" entry가 남아,
 * 내보내기에 "(대체: 자기이름)"이 찍히고 분석이 무의미한 되짚기를 한다.
 *
 * **이미 체크된 세트가 있으면 거부한다.** 교체는 세트를 새로 만들므로 기록이 사라지고,
 * 루틴 문서 규칙("대체한 날은 그걸로 끝 — 원 종목 세트를 나중에 추가하지 않는다")과도
 * 어긋난다. 자리가 없어서 바꾸는 상황이므로 아직 아무것도 수행하지 않은 것이 정상이다.
 * 세트 수·반복수는 원 종목 계획을 그대로 쓴다 (같은 운동의 다른 수행이므로).
 */
export function applySubstitute(
  session: Session,
  recordKey: RecordKey,
  next: { recordKey: RecordKey; setCount: number; weight: number; reps: number },
): Session {
  const target = session.entries.find((e) => e.recordKey === recordKey)
  if (!target || target.sets.some((s) => s.done)) return session
  if (session.entries.some((e) => e.recordKey === next.recordKey)) return session

  return mapEntry(session, recordKey, (entry) => ({
    ...entry,
    recordKey: next.recordKey,
    substituteFor:
      next.recordKey === (entry.substituteFor ?? entry.recordKey)
        ? undefined
        : (entry.substituteFor ?? entry.recordKey),
    sets: Array.from({ length: next.setCount }, () => ({
      weight: next.weight,
      reps: next.reps,
      done: false,
    })),
    // 교체 시점에는 아직 수행하지 않았다. 감각·보상작용도 원 종목 것을 물려받지 않는다
    performedOrder: null,
    firstSetAt: undefined,
    sensoryScore: undefined,
    sensoryNote: undefined,
    compensation: NO_COMPENSATION,
    skipped: false,
  }))
}

/** B그룹 감각 점수 (§5.2). 같은 점수를 다시 누르면 해제한다 */
export function applySensoryScore(
  session: Session,
  recordKey: RecordKey,
  score: 0 | 1 | 2 | 3,
): Session {
  return mapEntry(session, recordKey, (entry) => ({
    ...entry,
    sensoryScore: entry.sensoryScore === score ? undefined : score,
  }))
}

export function applySensoryNote(session: Session, recordKey: RecordKey, note: string): Session {
  return mapEntry(session, recordKey, (entry) => ({
    ...entry,
    sensoryNote: note.trim() === '' ? undefined : note,
  }))
}

/**
 * 보상작용. 빈 문자열로 만들 수 없다 — 루틴 문서가 빈칸을 금지한다.
 * 호출자는 serializeCompensation()의 결과를 넘기고, 그 함수가 "없음"을 보장한다.
 */
export function applyCompensation(
  session: Session,
  recordKey: RecordKey,
  compensation: string,
): Session {
  return mapEntry(session, recordKey, (entry) => ({
    ...entry,
    compensation: compensation.trim() === '' ? NO_COMPENSATION : compensation,
  }))
}
