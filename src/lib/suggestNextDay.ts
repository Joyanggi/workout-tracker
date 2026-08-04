import type { MuscleKey, ReturnProtocolStep, RoutineDay, RoutineTemplate, Session } from '../types'
import { daysBetween, hoursBetweenIso } from './dates'
import { daysSinceDay, strengthSessions, weeklyVolume } from './derive'

/**
 * Day 자동 제안 — DESIGN.md §4 볼륨 예산.
 *
 * ⚠ 요일 개념이 이 로직에 존재하지 않는다. 세션을 시작하는 시점의 실제 수행 이력만 본다.
 */

/** 장기 공백 판정 기준 (§4 규칙 1) */
export const RETURN_GAP_DAYS = 14

/**
 * 이번 주 노출 0회인 부위의 기여에 곱하는 보너스.
 *
 * §4 pseudo-code에는 없지만 이게 없으면 §4의 "동작 검증" 표 2행
 * (이력 D1 → 제안 D2)이 성립하지 않는다. 원식으로는 D4=15.40 > D2=14.80이 되어
 * D4가 뽑히고, 문서의 핵심 결론인 "주 4회 완주 시 D1→D2→D4→D3"도 깨진다.
 * (문서 2행 근거 칸은 3행과 달리 점수 계산 없이 "광배·후면어깨 0"이라고만 적혀 있다 —
 *  즉 눈대중으로 채운 칸이고, 표가 아니라 식이 틀린 게 아니라 표의 산술이 누락된 것)
 *
 * 근거는 문서 안에 이미 있다. §7: "부위별 주 2회 노출 우선 — 볼륨을 맞춰도
 * 주 2회 > 주 1회 (빈도 메타분석). 그래서 §4가 볼륨 예산으로 빈도를 방어한다."
 * 원식은 부위별 '남은 세트 수'만 보므로 이 빈도 우선을 표현하지 못한다.
 * 첫 노출에 가중치를 얹는 것이 그 원칙을 점수로 옮기는 최소 변경이다.
 *
 * 1.5를 고른 이유: 문서 표 4행이 전부 성립하는 구간은 (1.176, 1.892)이고
 * 1.5는 거의 중앙값이라 경계에서 멀다.
 *   - 2행 성립 조건: 3.4b > 4.0  → b > 1.176 (D2 > D4)
 *   - 3행 성립 조건: 10.50 > 5.55b → b < 1.892 (D4 > D3)
 */
export const FIRST_EXPOSURE_BONUS = 1.5

/** 회복 제약: 직전 세션과 이 시간 이내 + 주요 부위 겹침 → 점수 감쇠 (§4) */
export const RECOVERY_WINDOW_HOURS = 24
export const RECOVERY_PENALTY = 0.3

/** "주요 부위" 정의: 그 Day 총 세트의 이 비율 이상을 차지하는 부위 */
export const MAJOR_MUSCLE_SHARE = 0.25

export type SuggestRule = 'first' | 'returnGap' | 'lowerBodyGuard' | 'volumeBudget'

export interface DayScore {
  dayId: string
  score: number
  /** 회복 감쇠 적용 전 */
  rawScore: number
  penalized: boolean
  /** 점수에 기여한 부위 (기여도 내림차순) */
  contributions: { muscle: MuscleKey; sets: number; points: number; firstExposure: boolean }[]
}

export interface DaySuggestion {
  day: RoutineDay
  rule: SuggestRule
  reason: string
  scores: DayScore[]
  /** 마지막 완료 세션으로부터 며칠. 기록이 없으면 null */
  gapDays: number | null
  /** 14일+ 공백이면 적용할 복귀 프로토콜 단계 */
  returnStep?: ReturnProtocolStep
}

/** 그 Day에서 총 세트의 MAJOR_MUSCLE_SHARE 이상을 차지하는 부위 */
export function majorMuscles(day: RoutineDay): Set<MuscleKey> {
  const total = Object.values(day.muscleSets).reduce((a, b) => a + b, 0)
  const out = new Set<MuscleKey>()
  if (total === 0) return out
  for (const [muscle, sets] of Object.entries(day.muscleSets)) {
    if (sets / total >= MAJOR_MUSCLE_SHARE) out.add(muscle)
  }
  return out
}

/** gap(일)에 해당하는 복귀 프로토콜 단계. 가장 큰 gapWeeksMin이 우선 */
export function returnStepFor(
  routine: RoutineTemplate,
  gapDays: number,
): ReturnProtocolStep | undefined {
  const weeks = gapDays / 7
  let match: ReturnProtocolStep | undefined
  for (const step of routine.rules.returnProtocol) {
    if (weeks >= step.gapWeeksMin) match = step
  }
  return match
}

export function suggestNextDay(args: {
  sessions: Session[]
  routine: RoutineTemplate
  today: string
  now?: Date
}): DaySuggestion {
  const { sessions, routine, today, now = new Date() } = args
  /*
   * **근력 세션만 본다** (X3). 유산소만 기록한 세션을 포함하면 회복 감쇠가 오발동해
   * 순위가 뒤집힌다 — 실제로는 아무 근육도 안 썼으므로 감쇠할 회복이 없다.
   * 복귀 gap 판단·하체 가드도 같은 기준을 써야 한다 (기준이 갈리면 제안이 모순된다).
   */
  const done = strengthSessions(sessions)
  const candidates = routine.days
  const last = done[0]

  // 규칙 0 — 기록이 없으면 첫 Day
  if (!last) {
    return {
      day: candidates[0],
      rule: 'first',
      reason: '첫 세션이에요. Day 1부터 시작합니다',
      scores: [],
      gapDays: null,
    }
  }

  const gapDays = daysBetween(last.date, today)

  // 규칙 1 — 장기 공백 우선 처리 (§4)
  if (gapDays >= RETURN_GAP_DAYS) {
    return {
      day: candidates[0],
      rule: 'returnGap',
      reason: `${gapDays}일 공백 — Day 1로 가볍게 복귀합니다`,
      scores: [],
      gapDays,
      returnStep: returnStepFor(routine, gapDays),
    }
  }

  // 규칙 2 — 하체 최소 보장. 계속 밀리는 것 방지 (§4)
  const lowerDayId = routine.rules.lowerBodyDayId
  const lowerDay = candidates.find((d) => d.id === lowerDayId)
  if (lowerDay) {
    const sinceLower = daysSinceDay(sessions, lowerDayId, today)
    // 한 번도 안 했으면 첫 세션 이후 경과일로 판단한다 (기록 없음 ≠ 방금 함)
    const sinceFirst = daysBetween(done[done.length - 1].date, today)
    const effective = sinceLower ?? sinceFirst
    if (effective >= routine.rules.lowerBodyMaxGapDays) {
      return {
        day: lowerDay,
        rule: 'lowerBodyGuard',
        reason:
          sinceLower === null
            ? `하체 기록이 없어요. ${routine.rules.lowerBodyMaxGapDays}일 가드로 ${lowerDay.name}을 넣습니다`
            : `하체를 ${sinceLower}일 안 했어요`,
        scores: [],
        gapDays,
      }
    }
  }

  // 규칙 3~4 — 이번 주 부족분 충족 점수 (§4)
  const week = weeklyVolume(sessions, routine, today)
  const lastMajor = (() => {
    const day = candidates.find((d) => d.id === last.dayId)
    return day ? majorMuscles(day) : new Set<MuscleKey>()
  })()
  const withinRecovery =
    hoursBetweenIso(last.endedAt ?? last.startedAt, now.toISOString()) < RECOVERY_WINDOW_HOURS

  const scores: DayScore[] = candidates.map((day) => {
    const contributions: DayScore['contributions'] = []
    let raw = 0

    for (const [muscle, provided] of Object.entries(day.muscleSets)) {
      const target = routine.muscleTargets[muscle]
      if (!target) continue // 루틴이 목표 없는 부위를 제공하면 집계만 하고 점수엔 안 넣는다 (§3)
      const deficit = target.target - (week.sets[muscle] ?? 0)
      // 목표 초과는 문제로 표시하지 않는다 → 음수는 0으로 클램프 (§5.1)
      const counted = Math.max(0, Math.min(deficit, provided))
      if (counted === 0) continue
      const firstExposure = (week.exposures[muscle] ?? 0) === 0
      const points = target.weight * counted * (firstExposure ? FIRST_EXPOSURE_BONUS : 1)
      raw += points
      contributions.push({ muscle, sets: counted, points, firstExposure })
    }

    contributions.sort((a, b) => b.points - a.points)

    // 회복 제약 (§4): 직전 세션과 24시간 이내 + 주요 부위 겹침 → ×0.3
    const overlaps = [...majorMuscles(day)].some((m) => lastMajor.has(m))
    const penalized = withinRecovery && overlaps
    return {
      dayId: day.id,
      rawScore: raw,
      score: penalized ? raw * RECOVERY_PENALTY : raw,
      penalized,
      contributions,
    }
  })

  const best = scores.reduce((a, b) => (b.score > a.score ? b : a))
  const bestDay = candidates.find((d) => d.id === best.dayId)!

  return {
    day: bestDay,
    rule: 'volumeBudget',
    reason: buildReason(best, week.exposures),
    scores: [...scores].sort((a, b) => b.score - a.score),
    gapDays,
  }
}

/** "광배·측면어깨 2회차가 남았어요" 형태의 한 줄 근거 (§4) */
function buildReason(best: DayScore, exposures: Record<MuscleKey, number>): string {
  const top = best.contributions.slice(0, 2)
  if (top.length === 0) return '이번 주 목표를 채웠어요. 원하는 Day를 골라도 됩니다'

  const names = top.map((c) => c.muscle).join('·')
  // 전부 이미 1회 이상 한 부위면 "2회차", 아니면 그냥 "세트"
  const allExposed = top.every((c) => (exposures[c.muscle] ?? 0) >= 1)
  const suffix = allExposed ? '2회차가 남았어요' : '세트가 남았어요'
  return `${names} ${suffix}`
}
