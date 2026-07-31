import type { Exercise, Phase, RoutineTemplate, Session, SessionEntry } from '../types'
import { parseRecordKey } from '../types'
import { hasCompensation } from './compensation'
import { formatClock, weekdayKo } from './dates'
import { withObjectParticle } from './korean'
import { completedSessions, doneSets, findRoutineExercise, orderDeviations } from './derive'
import { progressionSuggestions } from './progression'

/**
 * Markdown 내보내기 (DESIGN.md §6).
 *
 * "루틴 문서 11장 템플릿 준수 + 순서 정보". 이 형식은 **LLM에 붙여넣어 분석시키는 것이
 * 설계된 분석 경로**(§1)이므로 템플릿을 마음대로 바꾸지 않는다.
 *
 * 명세 예시에 없지만 추가한 두 줄 (해석에 필요한 정보라 장식이 아니다):
 *   - 세션 헤더의 `[디로드]` / `[복귀]` 표시 — 세트가 절반인 이유를 모르면
 *     "수행 저하"로 오독한다. §3이 mode를 "디로드/복귀 주간 표시"용으로 정의했다
 *   - `미수행:` 줄 — "안 한 것"과 "루틴에 없는 것"을 구분할 수 있어야 한다
 */

export interface ExportRange {
  from: string
  to: string
}

function fmtWeight(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** "Day 1 — Push" → "Day 1 Push" (§6 예시 표기) */
function dayLabel(name: string): string {
  return name.replace(' — ', ' ')
}

function entryLine(
  entry: SessionEntry,
  session: Session,
  routine: RoutineTemplate,
  catalog: Map<string, Exercise>,
  progressed: Set<string>,
  increment: number,
): string[] {
  const { exerciseId, dayId } = parseRecordKey(entry.recordKey)
  const routineExercise = findRoutineExercise(routine, dayId, exerciseId)
  const name = catalog.get(exerciseId)?.shortName ?? exerciseId
  const sets = doneSets(entry)
  const group = routineExercise?.group ?? '?'
  const weight = sets.length > 0 ? Math.max(...sets.map((s) => s.weight)) : 0

  const lines: string[] = []
  lines.push(`### ${name} (${dayId.toUpperCase()}/${group}) ${fmtWeight(weight)}kg`)
  lines.push(sets.map((s) => s.reps).join(' / '))

  if (entry.sensoryScore !== undefined) {
    lines.push(
      entry.sensoryNote
        ? `감각: ${entry.sensoryScore}점 — ${entry.sensoryNote}`
        : `감각: ${entry.sensoryScore}점`,
    )
  }
  lines.push(`보상작용: ${entry.compensation}`)

  // 증량 판단은 더블 프로그레션 규칙으로 자동 산출 (§6). A그룹만 판단 대상이다
  if (routineExercise?.group === 'A' && sets.length > 0) {
    lines.push(
      progressed.has(entry.recordKey)
        ? `다음: ${fmtWeight(weight + increment)}kg로 증량`
        : `다음: ${fmtWeight(weight)}kg 유지`,
    )
  }
  // 사용하지 않는 인자 경고 방지 겸 명시: session은 호출부 문맥용
  void session
  return lines
}

export function sessionToMarkdown(
  session: Session,
  routine: RoutineTemplate,
  catalog: Map<string, Exercise>,
  phase: Phase,
): string {
  const day = [...routine.days, ...routine.fallbackDays].find((d) => d.id === session.dayId)
  const nameOf = (recordKey: string) =>
    catalog.get(parseRecordKey(recordKey).exerciseId)?.shortName ??
    parseRecordKey(recordKey).exerciseId

  const durationMin = session.endedAt
    ? Math.round(
        (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
      )
    : null
  const time = session.endedAt
    ? `[${formatClock(session.startedAt)}–${formatClock(session.endedAt)}, ${durationMin}분]`
    : `[${formatClock(session.startedAt)}– 진행 중]`
  const modeTag =
    session.mode === 'deload' ? ' [디로드]' : session.mode === 'return' ? ' [복귀]' : ''

  const out: string[] = []
  out.push(
    `## ${session.date} (${weekdayKo(session.date)}) — ${dayLabel(day?.name ?? session.dayId)}${modeTag}  ${time}`,
  )

  const timeline = orderDeviations(session)
  if (timeline.length > 0) {
    out.push(`수행 순서: ${timeline.map((t) => nameOf(t.entry.recordKey)).join(' → ')}`)
    /*
     * 한 종목을 앞당기면 그것이 뛰어넘은 종목들이 **기계적으로 +1씩** 밀린다.
     * 그 +1들은 사용자의 결정이 아니라 결과이므로 보고하지 않는다.
     * 다 적으면 §6 예시("레터럴을 2번째로 앞당김" 한 줄)가 네 줄로 불어나서
     * 실제 결정 하나가 잡음에 묻힌다.
     *
     * 계획 1,2,3,4,5 중 5번을 2번째로 옮긴 경우의 shift: [0, -3, +1, +1, +1]
     * → 앞당김(-3)만 남는다.
     */
    const shifts = timeline.filter((t) => t.shift < 0 || t.shift > 1)
    if (shifts.length > 0) {
      out.push(
        `(계획 대비: ${shifts
          .map(
            (t) =>
              `${withObjectParticle(nameOf(t.entry.recordKey))} ${t.entry.performedOrder}번째로 ${
                t.shift < 0 ? '앞당김' : '미룸'
              }`,
          )
          .join(', ')})`,
      )
    }
  }
  out.push('')

  const progressed = new Set(
    progressionSuggestions(session, routine, phase).map((p) => p.recordKey),
  )
  const performed = timeline.map((t) => t.entry)
  for (const entry of performed) {
    out.push(...entryLine(entry, session, routine, catalog, progressed, routine.rules.weightIncrementKg))
    out.push('')
  }

  // "안 한 것"과 "루틴에 없는 것"을 구분하기 위한 줄
  const notDone = session.entries.filter((e) => e.performedOrder === null)
  if (notDone.length > 0) {
    out.push(`미수행: ${notDone.map((e) => nameOf(e.recordKey)).join(', ')}`)
  }

  if (session.cardio) {
    const note = session.cardio.note ? `${session.cardio.note} · ` : ''
    out.push(`유산소: ${session.cardio.type} ${note}${session.cardio.minutes}분`)
  }
  if (session.sessionNote) out.push(`메모: ${session.sessionNote}`)

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

export function exportMarkdown(args: {
  sessions: Session[]
  routine: RoutineTemplate
  catalog: Map<string, Exercise>
  phase: Phase
  range: ExportRange
}): string {
  const { sessions, routine, catalog, phase, range } = args
  // 오래된 것부터 — 추이를 읽는 문서이므로 시간순이어야 한다
  const inRange = completedSessions(sessions)
    .filter((s) => s.date >= range.from && s.date <= range.to)
    .reverse()

  const head = `# 운동 기록 ${range.from} ~ ${range.to}`
  if (inRange.length === 0) return `${head}\n\n(기간 내 기록 없음)\n`

  return [
    head,
    '',
    ...inRange.flatMap((s) => [sessionToMarkdown(s, routine, catalog, phase), '']),
  ]
    .join('\n')
    .trimEnd()
    .concat('\n')
}

/** 보상작용이 기록된 종목 수 — 내보내기 미리보기용 */
export function compensationCount(sessions: Session[]): number {
  return sessions.reduce(
    (n, s) => n + s.entries.filter((e) => hasCompensation(e.compensation)).length,
    0,
  )
}
