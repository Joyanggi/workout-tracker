import type { Phase, RecordKey, RoutineTemplate, Session } from '../types'
import { NO_COMPENSATION, parseRecordKey } from '../types'
import { keyARecordKeys, phase0Progress } from './dashboard'
import { addDays, daysBetween, todayLocal } from './dates'
import { doneSets, routineExerciseOfEntry, strengthSessions } from './derive'

/**
 * Phase 전환 조건 감지 (PLAN-v1.1 T3).
 *
 * **완전 자동 전환은 하지 않는다.** 루틴 문서의 전환 조건에 주관 판단("안정적으로",
 * "대부분")이 섞여 있고 문서가 전환을 사용자 결정으로 규정한다. 조건 충족을 감지해
 * 제안하고, 전환은 사용자가 누른다. (DESIGN.md §3: "수동 전환 — 조건 충족은 앱이 표시만")
 *
 * 조건의 계량화는 PLAN-v1.1 T3의 정의를 따른다. 주관 서술을 숫자로 옮긴 것이므로
 * 임의로 느슨하게/엄하게 바꾸면 제안 시점이 달라진다.
 */

/** 최근성 판단 창 */
export const RECENT_WEEKS = 4
/** 2→3의 "무게 증가 이벤트" 최소 횟수 */
export const MIN_WEIGHT_INCREASES = 3
/** 감각 "안정적" 기준점 */
export const SENSORY_STABLE = 2
/** 2→3의 공백 없음 판정 기간 */
export const NO_GAP_MONTHS = 6
/** 공백으로 간주하는 일수 */
export const GAP_DAYS = 28

export interface ReadinessCheck {
  label: string
  met: boolean
  /** 현재 상태를 사람이 읽을 수 있게 (예: "3/5종목") */
  detail: string
  /** 판정에 필요한 기록이 부족함 — 배너를 띄우지 않는 사유 */
  insufficient?: boolean
}

export interface PhaseReadiness {
  from: Phase
  to: Phase | null
  checks: ReadinessCheck[]
  /** 전 조건 충족 + 데이터 충분 */
  allMet: boolean
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/*
 * **이 파일은 근력 기록만 본다** (Y1 — 리뷰 후속).
 *
 * Phase 승급 조건은 전부 "근력 수행"에 대한 진술이다. 유산소만 기록한 세션도 완료 세션이라
 * 두 조건이 과대평가됐다:
 *
 * - ④ "6개월 내 4주+ 공백 없음": 근력이 창 안에 **하나도 없고** 유산소만 촘촘한 상태에서
 *   `met: true / "공백 없음"`이 나왔다 (재현 확인)
 * - ③ "최근 4주 보상작용 없음": 안쪽에서 `doneSets > 0` 엔트리만 세지만 **`recent.length`는
 *   전 세션을 센다.** 근력 0회 + 유산소 10회에서 `met: true / "10세션 모두 없음"`이 나왔다.
 *   (리뷰어는 ③을 무해로 판단했는데 재현해 보니 아니었다 — 안쪽 필터가 분자만 지켰다)
 *
 * 사이트별로 "여기는 괜찮다"를 따지지 않고 **파일 규칙 하나**로 둔다. 나머지 세 곳은
 * 어차피 `doneSets > 0` 엔트리만 보므로 결과가 같고, 규칙이 하나면 새 조건을 추가할 때
 * 판단할 것이 없다. `phaseGate.test.ts`가 `completedSessions` 재유입을 막는다.
 */

/** B그룹이면서 최근 창 안에 기록이 있는 recordKey */
function recentBKeys(
  sessions: Session[],
  routine: RoutineTemplate,
  from: string,
): RecordKey[] {
  const keys = new Set<RecordKey>()
  for (const session of strengthSessions(sessions)) {
    if (session.date < from) continue
    for (const entry of session.entries) {
      if (doneSets(entry).length === 0) continue
      // 대체 수행이 빠지면 Phase 1→2·2→3 조건이 과소평가된다 (분모에서 사라짐)
      if (routineExerciseOfEntry(routine, entry)?.group !== 'B') continue
      keys.add(entry.recordKey)
    }
  }
  return [...keys]
}

/** 그 recordKey의 최근 n개 감각 점수 (최신순) */
function recentSensory(sessions: Session[], recordKey: RecordKey, n: number): number[] {
  const out: number[] = []
  for (const session of strengthSessions(sessions)) {
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry || entry.sensoryScore === undefined) continue
    out.push(entry.sensoryScore)
    if (out.length >= n) break
  }
  return out
}

/**
 * 무게 증가 이벤트 횟수.
 *
 * Phase 시작일을 저장하지 않고도 파생할 수 있게, **전 히스토리에서 최고 무게가
 * 갱신된 횟수**로 센다. 세션별 최고 무게를 시간순으로 훑으며 러닝 최고를 넘을 때마다 +1.
 * (같은 무게 반복은 세지 않는다 — "증가"가 조건이다)
 */
export function weightIncreaseCount(sessions: Session[], recordKey: RecordKey): number {
  let running = -Infinity
  let count = 0
  for (const session of strengthSessions(sessions).slice().reverse()) {
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry) continue
    const sets = doneSets(entry)
    if (sets.length === 0) continue
    const top = Math.max(...sets.map((s) => s.weight))
    if (running === -Infinity) {
      running = top
      continue // 첫 기록은 증가가 아니다
    }
    if (top > running) {
      count += 1
      running = top
    }
  }
  return count
}

/** 최근 기간 안에 GAP_DAYS 이상 공백이 있었는가 */
export function hasGapWithin(sessions: Session[], from: string, today: string): boolean {
  const asc = strengthSessions(sessions)
    .filter((s) => s.date >= from)
    .slice()
    .reverse()
  if (asc.length === 0) return true // 기록이 없으면 공백으로 본다
  // 구간 시작 ~ 첫 기록, 기록 사이, 마지막 기록 ~ 오늘 전부 검사
  if (daysBetween(from, asc[0].date) >= GAP_DAYS) return true
  for (let i = 1; i < asc.length; i += 1) {
    if (daysBetween(asc[i - 1].date, asc[i].date) >= GAP_DAYS) return true
  }
  return daysBetween(asc[asc.length - 1].date, today) >= GAP_DAYS
}

export function phaseReadiness(
  sessions: Session[],
  routine: RoutineTemplate,
  currentPhase: Phase,
  today: string = todayLocal(),
): PhaseReadiness {
  const recentFrom = addDays(today, -7 * RECENT_WEEKS + 1)

  if (currentPhase === 0) {
    const p0 = phase0Progress(sessions, routine, today)
    return {
      from: 0,
      to: 1,
      checks: [
        {
          label: `주 ${routine.rules.deloadMinSessionsPerWeek}회 이상 ${p0.target}주 연속`,
          met: p0.achieved,
          detail: `${p0.streak}/${p0.target}주`,
        },
      ],
      allMet: p0.achieved,
    }
  }

  // B그룹 감각 안정화 — 1→2와 2→3이 기준선만 다르게 공유한다
  const bKeys = recentBKeys(sessions, routine, recentFrom)
  const stable = bKeys.filter((key) => {
    const scores = recentSensory(sessions, key, 3)
    return scores.length > 0 && median(scores) >= SENSORY_STABLE
  })
  const sensoryCheck = (ratio: number, ratioLabel: string): ReadinessCheck => {
    const need = Math.ceil(bKeys.length * ratio)
    return {
      label: `B그룹 ${ratioLabel} 이상 감각 ${SENSORY_STABLE}점 이상 안정`,
      met: bKeys.length > 0 && stable.length >= need,
      detail:
        bKeys.length === 0
          ? '최근 4주 B그룹 기록 없음'
          : `${stable.length}/${bKeys.length}종목 (필요 ${need})`,
      insufficient: bKeys.length === 0,
    }
  }

  if (currentPhase === 1) {
    const check = sensoryCheck(0.5, '절반')
    return { from: 1, to: 2, checks: [check], allMet: check.met && !check.insufficient }
  }

  if (currentPhase === 2) {
    // ① 주요 3종목 각각 무게 증가 3회 이상
    const keys = keyARecordKeys(routine)
    const counts = keys.map((key) => ({ key, n: weightIncreaseCount(sessions, key) }))
    const weightCheck: ReadinessCheck = {
      label: `주요 3종목 무게 증가 각 ${MIN_WEIGHT_INCREASES}회 이상`,
      met: counts.length > 0 && counts.every((c) => c.n >= MIN_WEIGHT_INCREASES),
      detail: counts.map((c) => `${parseRecordKey(c.key).exerciseId} ${c.n}회`).join(' · '),
      insufficient: counts.length === 0,
    }

    // ② B그룹 2/3 이상 감각 안정
    const sensory = sensoryCheck(2 / 3, '2/3')

    // ③ 최근 4주 전 세션에서 보상작용 없음
    const recent = strengthSessions(sessions).filter((s) => s.date >= recentFrom)
    const withComp = recent.filter((s) =>
      s.entries.some((e) => doneSets(e).length > 0 && e.compensation !== NO_COMPENSATION),
    )
    const compCheck: ReadinessCheck = {
      label: '최근 4주 보상작용 없음 유지',
      met: recent.length > 0 && withComp.length === 0,
      detail:
        recent.length === 0
          ? '최근 4주 기록 없음'
          : withComp.length === 0
            ? `${recent.length}세션 모두 없음`
            : `${withComp.length}세션에 기록됨`,
      insufficient: recent.length === 0,
    }

    // ④ 최근 6개월 내 4주+ 공백 없음
    const gapFrom = addDays(today, -30 * NO_GAP_MONTHS)
    const hasGap = hasGapWithin(sessions, gapFrom, today)
    const gapCheck: ReadinessCheck = {
      label: `최근 ${NO_GAP_MONTHS}개월 내 ${GAP_DAYS / 7}주+ 공백 없음`,
      met: !hasGap,
      detail: hasGap ? '공백 있음' : '공백 없음',
    }

    const checks = [weightCheck, sensory, compCheck, gapCheck]
    return {
      from: 2,
      to: 3,
      checks,
      allMet: checks.every((c) => c.met && !c.insufficient),
    }
  }

  // Phase 3은 마지막 단계
  return {
    from: 3,
    to: null,
    checks: [{ label: '마지막 Phase입니다', met: true, detail: '전환 대상 없음' }],
    allMet: false,
  }
}
