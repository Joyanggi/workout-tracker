import type { RecordKey, Session, SessionEntry } from '../types'
import { completedSessions, doneSets } from './derive'
import type { ProgressionVerdict } from './progression'

/**
 * 통증 (LL2). "통증 있음"을 묻는 곳은 전부 `hasPain` 하나를 쓴다.
 * `pain` 키가 없는 것과 값이 `undefined`인 것은 같다 — `'pain' in entry`로 묻지 않는다.
 */
export function hasPain(entry: Pick<SessionEntry, 'pain'>): boolean {
  return entry.pain !== undefined
}

/** 통증 문구. 없으면 undefined · 메모 있으면 `있음 — {메모}` · 없으면 `있음` */
export function painText(entry: Pick<SessionEntry, 'pain'>): string | undefined {
  if (entry.pain === undefined) return undefined
  const note = entry.pain.note.trim()
  return note === '' ? '있음' : `있음 — ${note}`
}

export interface PainTrail {
  date: string
  note: string
  /** 최근부터 연속으로 통증인 "닿은" 세션 수 (>= 1) */
  streak: number
}

/**
 * 그 종목에서 가장 최근에 "닿은" 세션에 통증이 있었는가.
 *
 * 닿은 것 = 작업 세트 1개 이상 **또는** 통증 있음. 통증만 적고 세트를 못 한 날이
 * 가장 심한 경우인데 `sessionsForRecord`는 그 세션을 건너뛴다 — 여기서는 건너뛰지 않는다.
 * 가장 최근에 닿은 entry에 통증이 없으면 `undefined`.
 */
export function painTrail(sessions: Session[], recordKey: RecordKey): PainTrail | undefined {
  let first: { date: string; note: string } | undefined
  let streak = 0
  for (const session of completedSessions(sessions)) {
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry) continue
    const pain = hasPain(entry)
    if (!pain && doneSets(entry).length === 0) continue // 닿지 않은 세션
    if (!pain) break
    if (!first) first = { date: session.date, note: (entry.pain?.note ?? '').trim() }
    streak++
  }
  return first ? { ...first, streak } : undefined
}

/**
 * 다음 세션 카드 칩 문구 (LL3). 연속 통증은 `painTrail` 하나에서 나온다.
 * ` · 증량 보류`는 normal 세션이고 판정이 hold `pain`일 때만 붙는다
 * (B그룹·코어·작업 세트 기록 없는 종목은 판정이 없어 안 붙는다).
 */
export function lastPainChipText(
  trail: PainTrail | undefined,
  verdict: ProgressionVerdict | undefined,
  mode: Session['mode'],
): string | undefined {
  if (!trail) return undefined
  let text = trail.streak >= 2 ? `통증 ${trail.streak}세션 연속` : '지난번 통증'
  if (trail.note !== '') text += ` — ${trail.note}`
  if (mode === 'normal' && verdict?.kind === 'hold' && verdict.reason.kind === 'pain') {
    text += ' · 증량 보류'
  }
  return text
}
