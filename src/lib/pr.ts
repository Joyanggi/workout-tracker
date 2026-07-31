import type { RecordKey, Session } from '../types'
import { completedSessions, doneSets, e1rm } from './derive'

/**
 * 개인 기록(PR) 감지 (PLAN-v1.1 T5).
 *
 * **감량기에는 증량 조건(전 세트 repMax + 보상작용 없음)이 거의 충족되지 않는다**(§7).
 * 그래서 e1RM·반복수 PR이 진전을 보여주는 주 채널이 된다 — "무게가 안 올랐다"와
 * "진전이 없다"는 다르고, 이 구분이 감량기에 계속하게 만드는 신호다.
 *
 * 저장하지 않고 매번 파생 계산한다 (기록을 고치면 PR도 같이 맞춰져야 한다).
 */

export type PrKind = 'weight' | 'e1rm' | 'reps'

export interface PrHit {
  recordKey: RecordKey
  kind: PrKind
  /** 이번 세션의 값 */
  value: number
  /** 이전 최고값. 첫 기록이면 null */
  previous: number | null
  /** reps PR일 때 그 무게 */
  atWeight?: number
}

/**
 * 디로드·복귀 세션은 PR 판정에서 제외한다.
 *
 * 세트 수가 절반이고 무게도 낮춘 상태라 "이번이 최고"가 나올 수 없거나,
 * 반대로 반복수 PR이 쉽게 뜬다(가벼운 무게로 많이 하니까). 어느 쪽이든 왜곡이다.
 */
export function isPrEligible(session: Session): boolean {
  return session.mode === 'normal'
}

interface Best {
  weight: number
  e1rm: number
  /** 무게 → 그 무게에서의 최다 반복수 */
  repsAt: Map<number, number>
}

/** 대상 세션 **이전**의 히스토리 최고값 (같은 날 이전 세션도 포함) */
function bestBefore(
  sessions: Session[],
  recordKey: RecordKey,
  target: Session,
): Best | null {
  let best: Best | null = null
  for (const session of completedSessions(sessions)) {
    if (session.id === target.id) continue
    // 같은 날이라도 시작 시각이 뒤면 "이후"다
    if (session.startedAt >= target.startedAt) continue
    if (!isPrEligible(session)) continue
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry) continue
    const sets = doneSets(entry)
    if (sets.length === 0) continue

    best ??= { weight: -Infinity, e1rm: -Infinity, repsAt: new Map() }
    for (const set of sets) {
      best.weight = Math.max(best.weight, set.weight)
      best.e1rm = Math.max(best.e1rm, e1rm(set.weight, set.reps))
      best.repsAt.set(set.weight, Math.max(best.repsAt.get(set.weight) ?? 0, set.reps))
    }
  }
  return best
}

/** 소수 오차로 PR이 뜨는 것을 막는 최소 개선폭 */
const EPS = 0.01

/**
 * 이 세션에서 달성한 PR 목록.
 *
 * **첫 기록은 PR로 보지 않는다.** 모든 종목이 첫 세션에 PR 뱃지를 달면 뱃지가
 * 아무 의미도 갖지 못한다 (§ 경고·뱃지는 흔해지면 무시된다).
 *
 * `isInverse` 종목(T8 어시스티드)은 **무게·e1RM PR을 판정하지 않는다** — 표시 무게가
 * 클수록 쉬우므로 보조를 늘린 것이 "최고 무게 PR"로 뜬다. 거짓 PR은 뱃지 신뢰를
 * 가장 빠르게 깎는다. **반복수 PR은 그대로 둔다** — 같은 보조 무게에서 반복이 늘어난
 * 것은 어시스티드에서도 실제 진전이고 방향이 이미 맞다.
 */
export function detectPrs(
  sessions: Session[],
  target: Session,
  isInverse?: (recordKey: RecordKey) => boolean,
): PrHit[] {
  if (!isPrEligible(target)) return []

  const hits: PrHit[] = []
  for (const entry of target.entries) {
    const sets = doneSets(entry)
    if (sets.length === 0) continue

    const prev = bestBefore(sessions, entry.recordKey, target)
    if (prev === null) continue // 첫 기록

    const topWeight = Math.max(...sets.map((s) => s.weight))
    const topE1rm = Math.max(...sets.map((s) => e1rm(s.weight, s.reps)))
    const inverse = isInverse?.(entry.recordKey) ?? false

    if (!inverse && topWeight > prev.weight + EPS) {
      hits.push({ recordKey: entry.recordKey, kind: 'weight', value: topWeight, previous: prev.weight })
    }
    if (!inverse && topE1rm > prev.e1rm + EPS) {
      hits.push({
        recordKey: entry.recordKey,
        kind: 'e1rm',
        value: Math.round(topE1rm * 10) / 10,
        previous: Math.round(prev.e1rm * 10) / 10,
      })
    }

    // 반복수 PR — **같은 무게에서** 최다 반복. 무게가 다르면 비교 대상이 아니다
    for (const weight of new Set(sets.map((s) => s.weight))) {
      const reps = Math.max(...sets.filter((s) => s.weight === weight).map((s) => s.reps))
      const before = prev.repsAt.get(weight)
      if (before === undefined) continue // 그 무게를 해본 적이 없으면 비교 불가
      if (reps > before) {
        hits.push({
          recordKey: entry.recordKey,
          kind: 'reps',
          value: reps,
          previous: before,
          atWeight: weight,
        })
      }
    }
  }
  return hits
}

/** recordKey별로 묶고, 종목당 가장 의미 있는 하나만 남긴다 */
export function topPrPerRecord(hits: PrHit[]): PrHit[] {
  // 무게 > e1RM > 반복수 순. 무게가 올랐으면 e1RM도 대개 오르므로 둘 다 보여주면 중복이다
  const rank: Record<PrKind, number> = { weight: 0, e1rm: 1, reps: 2 }
  const byKey = new Map<RecordKey, PrHit>()
  for (const hit of hits) {
    const current = byKey.get(hit.recordKey)
    if (!current || rank[hit.kind] < rank[current.kind]) byKey.set(hit.recordKey, hit)
  }
  return [...byKey.values()]
}

export const PR_LABEL: Record<PrKind, string> = {
  weight: '최고 무게',
  e1rm: '최고 e1RM',
  reps: '최다 반복',
}
