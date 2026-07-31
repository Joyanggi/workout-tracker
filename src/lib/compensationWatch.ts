import type { RecordKey, Session } from '../types'
import { NO_COMPENSATION } from '../types'
import { completedSessions, doneSets } from './derive'

/**
 * 반복 보상작용 감지 (T11).
 *
 * 루틴 문서 13장: "세트 중 이게 보이면 **무게가 과하다**."
 * 사용자가 보상작용을 성실히 기록해도 앱이 아무 반응을 하지 않으면, "같은 종목에서
 * 같은 문제가 반복되는가"라는 판단을 사람의 기억에 맡기게 된다. 그건 기억이 할 일이 아니다.
 *
 * 깊은 분석은 여전히 내보내기 → LLM 경로(§1)다. 여기서 잡는 것은 **셈으로 끝나는
 * 단순 반복 패턴** 하나뿐이다.
 *
 * 하향은 **자동으로 하지 않는다.** A그룹 원칙이 "자극을 찾으려고 무게를 내리지 않는다"
 * 이므로 하향은 항상 사용자 결정이다 (B그룹 감각 1점 복귀(T10)와 달리 강제 규칙이 아니다).
 */

/** 최근 몇 세션을 보는지 */
export const WATCH_WINDOW = 3
/** 그 중 몇 번이면 경고인지 */
export const WATCH_THRESHOLD = 2
/** 홈 배너를 띄우는 연속 횟수 */
export const WATCH_BANNER_STREAK = 3

export interface CompensationWatch {
  recordKey: RecordKey
  /** 최근 WATCH_WINDOW 세션 중 보상작용이 기록된 횟수 */
  count: number
  /** 최신 세션부터 연속으로 기록된 횟수 (홈 배너 조건) */
  streak: number
  /** 기록된 문구 (최신순, 중복 제거) — 무엇이 반복되는지 보여줘야 판단이 된다 */
  notes: string[]
}

/**
 * recordKey별 반복 보상작용.
 *
 * 창(window)은 **그 종목을 수행한 세션** 기준이다. 달력상 최근 3세션으로 세면
 * Day가 다른 세션이 끼어들어 "3세션 중 2회"가 실제로는 "6주 중 2회"가 된다.
 */
export function compensationWatches(sessions: Session[]): CompensationWatch[] {
  const done = completedSessions(sessions) // 최신순

  const perKey = new Map<RecordKey, { compensation: string; had: boolean }[]>()
  for (const session of done) {
    for (const entry of session.entries) {
      // 수행하지 않은 종목은 창에 넣지 않는다 — 스킵한 세션이 "문제 없었다"가 되면
      // 카운트가 희석되어 경고가 늦게 뜬다
      if (doneSets(entry).length === 0) continue
      const list = perKey.get(entry.recordKey) ?? []
      if (list.length >= WATCH_WINDOW) continue
      list.push({
        compensation: entry.compensation,
        had: entry.compensation.trim() !== '' && entry.compensation !== NO_COMPENSATION,
      })
      perKey.set(entry.recordKey, list)
    }
  }

  const out: CompensationWatch[] = []
  for (const [recordKey, list] of perKey) {
    const count = list.filter((x) => x.had).length
    if (count < WATCH_THRESHOLD) continue

    let streak = 0
    for (const item of list) {
      if (!item.had) break
      streak += 1
    }
    const notes = [...new Set(list.filter((x) => x.had).map((x) => x.compensation))]
    out.push({ recordKey, count, streak, notes })
  }
  return out.sort((a, b) => b.streak - a.streak || b.count - a.count)
}

export function watchFor(
  watches: CompensationWatch[],
  recordKey: RecordKey,
): CompensationWatch | undefined {
  return watches.find((w) => w.recordKey === recordKey)
}

/** 홈 배너 대상 — 연속으로 계속 나오는 것만 */
export function bannerWatches(watches: CompensationWatch[]): CompensationWatch[] {
  return watches.filter((w) => w.streak >= WATCH_BANNER_STREAK)
}

/** 이번 세션에서 보상작용이 기록된 종목 (FinishSheet 즉시 인지용) */
export function compensationEntriesOf(session: Session): { recordKey: RecordKey; note: string }[] {
  return session.entries
    .filter(
      (e) =>
        doneSets(e).length > 0 &&
        e.compensation.trim() !== '' &&
        e.compensation !== NO_COMPENSATION,
    )
    .map((e) => ({ recordKey: e.recordKey, note: e.compensation }))
}
