import type {
  ReturnProtocolStep,
  RoutineTemplate,
  Session,
  SessionAdjust,
  SessionEntry,
  SessionMode,
} from '../types'
import { daysBetween } from './dates'
import { doneSets, routineExerciseOfEntry, strengthSessions, workSetRows } from './derive'
import { returnStepFor } from './suggestNextDay'

/**
 * 세트 계획 초크포인트 (JJ1).
 *
 * "그날 앱이 몇 세트를 계획했고(P), 조정 뒤 몇 세트를 만들었고(G), 몇 세트를 끝냈는가(D)"를
 * 묻는 모든 곳이 여기를 지난다. 세트 수 공식과 조정률이 `buildSession`·내보내기·종료 시트에
 * 복제되면 한 곳만 바뀌어 서로 다른 숫자를 말한다.
 */

/**
 * 디로드: 세트 −50%, 무게 유지 (§7 — 강도 감소형보다 볼륨 감소형이 근육·근력
 * 유지에 유리).
 * `sessionFactory`가 이 모듈을 import하므로 상수도 여기에 둔다 (반대로 두면 순환).
 */
export const DELOAD_SET_PCT = -50

/** 세트 수 조절. 최소 1세트는 남긴다 */
export function adjustedSetCount(planned: number, setPct: number): number {
  return Math.max(1, Math.round(planned * (1 + setPct / 100)))
}

/** 모드가 정하는 조정. normal이면 없다 */
export function modeAdjustFor(
  mode: SessionMode,
  returnStep?: ReturnProtocolStep,
): SessionAdjust | undefined {
  if (mode === 'deload') return { setPct: DELOAD_SET_PCT, weightPct: 0 }
  if (mode === 'return') return { setPct: returnStep?.setPct ?? 0, weightPct: returnStep?.weightPct ?? 0 }
  return undefined
}

export type ResolvedAdjust =
  | { kind: 'none' } // normal
  | {
      kind: 'known'
      setPct: number
      weightPct: number
      source: 'stored' | 'derived'
      gapDays?: number // 복귀 되짚기일 때만
    }
  | { kind: 'unknown' } // 복귀인데 저장값 없고 되짚기 실패

/**
 * 세션에 적용된 조정. 저장값(`modeAdjust`)이 먼저고, 없는 JJ 이전 기록만 되짚는다.
 * 되짚기는 복귀 조정률이 공백 주수에 달려 있어 `sessions`(직전 근력 세션)가 있어야 가능하다.
 */
export function resolveSessionAdjust(
  session: Session,
  routine: RoutineTemplate,
  sessions?: Session[],
): ResolvedAdjust {
  if (session.mode === 'normal') return { kind: 'none' }
  if (session.modeAdjust) {
    return { kind: 'known', ...session.modeAdjust, source: 'stored' }
  }
  if (session.mode === 'deload') {
    return { kind: 'known', setPct: DELOAD_SET_PCT, weightPct: 0, source: 'derived' }
  }
  if (session.mode === 'return' && sessions) {
    const prev = strengthSessions(sessions).find((s) => s.id !== session.id && s.date < session.date)
    if (prev) {
      const gapDays = daysBetween(prev.date, session.date)
      const step = returnStepFor(routine, gapDays)
      if (step) {
        return {
          kind: 'known',
          setPct: step.setPct,
          weightPct: step.weightPct,
          source: 'derived',
          gapDays,
        }
      }
    }
  }
  return { kind: 'unknown' }
}

export interface EntrySetPlan {
  planned: number // P — entry.plannedSets ?? routineExercise.sets
  plannedFrom: 'stored' | 'routine'
  given: number | null // G — none이면 planned, known이면 adjustedSetCount(P, setPct), unknown이면 null
  done: number // D — doneSets(entry).length
  workRows: number // R — workSetRows(entry)
}

/** 얹은 종목은 계획이 없다. 저장된 P가 루틴보다 먼저다 — 루틴은 세션 뒤에 바뀐다 */
export function entrySetPlan(
  entry: SessionEntry,
  routine: RoutineTemplate,
  adjust: ResolvedAdjust,
): EntrySetPlan | undefined {
  if (entry.extra) return undefined
  const planned = entry.plannedSets ?? routineExerciseOfEntry(routine, entry)?.sets
  if (planned === undefined) return undefined
  const given =
    adjust.kind === 'none'
      ? planned
      : adjust.kind === 'known'
        ? adjustedSetCount(planned, adjust.setPct)
        : null
  return {
    planned,
    plannedFrom: entry.plannedSets !== undefined ? 'stored' : 'routine',
    given,
    done: doneSets(entry).length,
    workRows: workSetRows(entry),
  }
}

export interface SessionSetPlan {
  planned: number
  given: number | null
  done: number
  routinePlanned: boolean // 현재 루틴에서 읽은 P가 섞였다 → 문구가 `현재 루틴 계획`이라고 밝힌다
}

/** 계획이 있는 entry의 합. skipped·미수행 entry도 P·G에 들어가고 D만 0이다 */
export function sessionSetPlan(
  session: Session,
  routine: RoutineTemplate,
  adjust: ResolvedAdjust,
): SessionSetPlan | undefined {
  const plans = session.entries
    .map((e) => entrySetPlan(e, routine, adjust))
    .filter((p): p is EntrySetPlan => p !== undefined)
  if (plans.length === 0) return undefined
  return {
    planned: plans.reduce((n, p) => n + p.planned, 0),
    given: plans.some((p) => p.given === null) ? null : plans.reduce((n, p) => n + (p.given ?? 0), 0),
    done: plans.reduce((n, p) => n + p.done, 0),
    routinePlanned: plans.some((p) => p.plannedFrom === 'routine'),
  }
}

const MODE_NAME: Record<SessionMode, string> = { normal: '', return: '복귀', deload: '디로드' }

/** 퍼센트 표기. 음수는 `−`(U+2212), 양수는 `+` */
function signedPct(n: number): string {
  if (n < 0) return `−${Math.abs(n)}%`
  if (n > 0) return `+${n}%`
  return '0%'
}

/**
 * 세션 한 줄 (JJ2) — 내보내기와 종료 시트(JJ3)가 같은 문자열을 쓴다. normal이면 `undefined`.
 * 조정률 출처(`재계산`)와 P 출처(`현재 루틴 계획`)는 서로 독립이다.
 */
export function sessionAdjustText(
  session: Session,
  plan: SessionSetPlan | undefined,
  adjust: ResolvedAdjust,
): string | undefined {
  if (session.mode === 'normal' || adjust.kind === 'none') return undefined
  const name = MODE_NAME[session.mode]
  let head: string
  if (adjust.kind === 'unknown') {
    head = `${name} 조정: 기록 없음`
  } else {
    const parts =
      adjust.setPct === 0 && adjust.weightPct === 0
        ? '없음'
        : [`세트 ${signedPct(adjust.setPct)}`, ...(adjust.weightPct !== 0 ? [`무게 ${signedPct(adjust.weightPct)}`] : [])].join(' · ')
    const derived =
      adjust.source === 'derived'
        ? adjust.gapDays !== undefined
          ? ` (공백 ${adjust.gapDays}일로 재계산)`
          : ' (재계산)'
        : ''
    head = `${name} 조정: ${parts}${derived}`
  }
  if (!plan) return head
  const generated =
    plan.given !== null && plan.given !== plan.planned ? ` → ${plan.given}세트 생성` : ''
  return `${head} — ${plan.routinePlanned ? '현재 루틴 계획' : '계획'} ${plan.planned}세트${generated} · 완료 ${plan.done}세트`
}

/** 종목 한 줄 (JJ2). normal이면 `undefined` */
export function entrySetLine(plan: EntrySetPlan, mode: SessionMode): string | undefined {
  if (mode === 'normal') return undefined
  if (plan.given === null || plan.given === plan.planned) {
    return `세트: 계획 ${plan.planned} · 완료 ${plan.done}`
  }
  return `세트: 계획 ${plan.planned} → ${MODE_NAME[mode]} 조정 ${plan.given} · 완료 ${plan.done}`
}

export interface PartialEntry {
  recordKey: string
  done: number
  rows: number
}

/**
 * 종료 시트 "세트가 남은 종목" (JJ3). 기준은 작업 **행**이다 — 체크를 빠뜨린 행을 찾는 경고이고,
 * 계획(P)이나 생성(G)과 비교하면 복귀·디로드 세션이 늘 경고를 받는다. 워밍업 행은 분자·분모 모두 뺀다.
 */
export function partialEntries(session: Session): PartialEntry[] {
  return session.entries
    .filter((e) => !e.skipped)
    .map((e) => ({ recordKey: e.recordKey, done: doneSets(e).length, rows: workSetRows(e) }))
    .filter((p) => p.done > 0 && p.done < p.rows)
}
