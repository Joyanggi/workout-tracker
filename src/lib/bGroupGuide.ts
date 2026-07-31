import type { Phase, RecordKey, RoutineExercise, Session } from '../types'
import { doneSets } from './derive'

/**
 * B그룹 무게 회복 가이드 — Phase 2부터 (T10).
 *
 * 루틴 문서 9장 Phase 2: "B그룹 무게를 조금씩 회복. **단, 감각 점수가 1로 떨어지면
 * 즉시 이전 무게로 복귀. 절대 기준이다.**"
 *
 * Phase 0~1에서는 두 기능 모두 비활성이다 — 문서가 그 기간 B그룹 증량을 금지한다.
 * 앱이 Phase 0에서 "무게 올려도 됩니다"를 말하면 문서와 정면으로 어긋난다.
 *
 * 두 신호의 성격이 다르다:
 *   - **회복 힌트**는 제안이다. 프리필 기본값을 바꾸지 않는다 — B그룹의 성공 기준은
 *     기록이 아니라 감각이므로, 무게를 올릴지는 사용자가 결정한다.
 *   - **복귀 경고**는 문서가 "절대 기준"이라고 못 박은 규칙이다. 그래서 이쪽만
 *     프리필을 자동으로 이전 무게로 내린다.
 */

/** 회복 힌트에 필요한 연속 세션 수 */
export const RECOVERY_SESSIONS = 3
/** 그 세션들에서 요구하는 감각 점수 */
export const RECOVERY_SENSORY = 3
/** 이 점수 이하면 즉시 복귀 (문서의 절대 기준) */
export const REVERT_SENSORY_MAX = 1

interface Args {
  /** 해당 recordKey를 수행한 완료 세션, **최신순** */
  history: Session[]
  recordKey: RecordKey
  routineExercise: RoutineExercise
  phase: Phase
}

function topWeightOf(session: Session, recordKey: RecordKey): number | undefined {
  const entry = session.entries.find((e) => e.recordKey === recordKey)
  const sets = entry ? doneSets(entry) : []
  return sets.length > 0 ? Math.max(...sets.map((s) => s.weight)) : undefined
}

function active(args: Args): boolean {
  return args.phase >= 2 && args.routineExercise.group === 'B'
}

/**
 * 무게 회복 시도 힌트.
 *
 * 최근 3세션 연속 감각 3점 **AND** 마지막 세션에서 전 세트가 repMax 도달.
 * 감각만 보면 "가벼워서 편했다"와 구분되지 않고, 반복수만 보면 감각이 죽은 채
 * 숫자만 채운 경우를 잡지 못한다. 둘을 같이 요구해야 회복 신호가 된다.
 */
export function recoveryHint(args: Args): { from: number } | undefined {
  if (!active(args)) return undefined
  const { history, recordKey, routineExercise } = args
  if (history.length < RECOVERY_SESSIONS) return undefined

  const recent = history.slice(0, RECOVERY_SESSIONS)
  for (const session of recent) {
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    // 미입력은 "충족"이 될 수 없다 — 검증되지 않은 것과 통과한 것은 다르다
    if (entry?.sensoryScore !== RECOVERY_SENSORY) return undefined
  }

  const latest = history[0]
  const latestEntry = latest.entries.find((e) => e.recordKey === recordKey)
  const sets = latestEntry ? doneSets(latestEntry) : []
  if (sets.length === 0) return undefined
  if (!sets.every((s) => s.reps >= routineExercise.repMax)) return undefined

  const from = topWeightOf(latest, recordKey)
  return from === undefined ? undefined : { from }
}

/**
 * 이전 무게로 복귀 경고 (문서의 **절대 기준**).
 *
 * 직전 세션에서 무게를 **올렸고** 감각이 1점 이하로 기록됐으면, 그 이전 무게로 돌린다.
 * 무게를 올리지 않았는데 감각이 낮은 것은 다른 문제(피로·자세·머신)이고,
 * 문서가 규정한 것은 "올렸더니 감각이 죽은" 경우다 — 그때만 되돌린다.
 */
export function revertWarning(args: Args): { from: number; to: number } | undefined {
  if (!active(args)) return undefined
  const { history, recordKey } = args
  if (history.length < 2) return undefined

  const latest = history[0]
  const entry = latest.entries.find((e) => e.recordKey === recordKey)
  if (entry?.sensoryScore === undefined || entry.sensoryScore > REVERT_SENSORY_MAX) return undefined

  const from = topWeightOf(latest, recordKey)
  const to = topWeightOf(history[1], recordKey)
  if (from === undefined || to === undefined) return undefined
  if (from <= to) return undefined // 올리지 않았다면 복귀할 곳이 없다

  return { from, to }
}

export interface BGroupGuide {
  kind: 'recover' | 'revert'
  from: number
  /** revert일 때만 — 돌아갈 무게 */
  to?: number
}

/**
 * 카드에 표시할 신호 하나.
 * **복귀가 회복보다 우선한다** — 절대 기준이 제안을 이긴다.
 */
export function bGroupGuide(args: Args): BGroupGuide | undefined {
  const revert = revertWarning(args)
  if (revert) return { kind: 'revert', from: revert.from, to: revert.to }
  const recover = recoveryHint(args)
  if (recover) return { kind: 'recover', from: recover.from }
  return undefined
}
