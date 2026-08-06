import type { Exercise, Phase, RoutineTemplate, Session, SessionEntry } from '../types'
import { parseRecordKey } from '../types'
import { hasCompensation } from './compensation'
import { formatClock, weekdayKo } from './dates'
import { withObjectParticle } from './korean'
import { completedSessions, doneSets, routineExerciseOfEntry, orderDeviations } from './derive'
import { progressionSuggestions } from './progression'
import { buildScaleMap, type WeightScaleMap } from './weightScale'
import {
  ADHERENCE_MARK,
  hasVariants,
  itemVariant,
  QUALITY_LABEL,
  slotScore,
  slotsFor,
  splitsByTrainingDay,
  summarizeDietDay,
} from './diet'
import type { DietDay, DietPlan, ExerciseSetting } from '../types'

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

/**
 * 식단 섹션 (D4).
 *
 * **대체 텍스트를 그대로 싣는다** — 이게 없으면 LLM이 "회식 다음 날 아침 스킵이 반복"
 * 같은 패턴을 잡을 수 없다. 앱이 음식을 판단하지 않으므로, 판단의 재료를 그대로 넘기는
 * 것이 이 경로의 목적이다.
 *
 * 운동 섹션과 **같은 날짜 아래** 붙는다 — 훈련 품질과 전날 식단의 상관을 보려면
 * 날짜가 붙어 있어야 한다.
 *
 * 계획서 예시는 깨끗한 슬롯을 한 줄에 묶었는데, 여기서는 마크 요약 한 줄 + 예외만
 * 상세 줄로 뺀다. 파싱이 쉽고 짧으면서 대체 문구는 그대로 남는다.
 */
export function dietSectionMarkdown(plan: DietPlan, day: DietDay): string[] {
  const slots = slotsFor(plan, day.isTrainingDay)
  const logged = slots.filter((s) => day.slots[s.id] !== undefined)
  if (logged.length === 0) return []

  const summary = summarizeDietDay(plan, day)
  const out: string[] = []
  /*
   * 훈련일/휴식일 표기는 **옛 플랜에서만** 낸다 (DD2). 새 플랜은 매일 같은 5끼라
   * 이 표기가 식단에 대해 아무것도 말하지 않고, "그날 훈련했는가"는 같은 날짜의
   * 운동 섹션이 이미 말한다 — 아무 의미 없는 라벨을 LLM에 주면 근거 없는 상관을 만든다.
   */
  const dayType = splitsByTrainingDay(plan) ? `${day.isTrainingDay ? '훈련일' : '휴식일'} · ` : ''
  out.push(
    `### 식단 — ${plan.name} · ${dayType}준수 ` +
      `${ADHERENCE_MARK[summary.adherence]} (단백질 추정 ${summary.proteinG}g / ${summary.targetProteinG}g)`,
  )

  const markOf = (slotId: string, slot: (typeof slots)[number]) => {
    const score = slotScore(slot, day.slots[slotId])
    return score === null ? '—' : score >= 1 ? '●' : score > 0 ? '◐' : '✗'
  }
  out.push(`- 슬롯: ${logged.map((s) => `${s.name} ${markOf(s.id, s)}`).join(' · ')}`)

  for (const slot of logged) {
    const record = day.slots[slot.id]
    if (!record) continue
    const details: string[] = []
    if (record.skipped) details.push('안 먹음')
    /*
     * 고른 단백질원을 그대로 적는다 (DD3.6) — LLM이 로테이션 패턴("다리살 주간에 감량이
     * 멈췄다")을 볼 수 있어야 한다. 기본 변형이면 적지 않는다 (문서가 길어질 뿐이다).
     */
    for (const item of slot.items) {
      const choice = record.variantChoices?.[item.id] ?? 0
      if (choice === 0 || !hasVariants(item)) continue
      const variant = itemVariant(item, choice)
      details.push(`단백질원: ${variant.name} ${variant.qty}`)
    }
    const missing = slot.items
      .filter((i) => !record.checkedItemIds.includes(i.id))
      .map((i) => itemVariant(i, record.variantChoices?.[i.id]).name)
    if (!record.skipped && missing.length > 0 && missing.length < slot.items.length) {
      details.push(`미섭취: ${missing.join(', ')}`)
    }
    if (record.substitution) {
      details.push(
        `대체: "${record.substitution.text}" — ${QUALITY_LABEL[record.substitution.quality]}`,
      )
    }
    // 추가는 대체와 별개로 적는다 (G2) — 결식·대체·과식이 구분돼야 분석이 된다
    if (record.addition) {
      details.push(
        `+ 추가: "${record.addition.text}" — ${QUALITY_LABEL[record.addition.quality]}`,
      )
    }
    if (details.length > 0) out.push(`- ${slot.name}: ${details.join(' / ')}`)
  }

  if (day.note) out.push(`- 메모: ${day.note}`)
  return out
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
  nextWeights: Map<string, number | null>,
): string[] {
  const { exerciseId, dayId } = parseRecordKey(entry.recordKey)
  const routineExercise = routineExerciseOfEntry(routine, entry)
  const name = catalog.get(exerciseId)?.shortName ?? exerciseId
  const sets = doneSets(entry)
  const group = routineExercise?.group ?? '?'
  const weight = sets.length > 0 ? Math.max(...sets.map((s) => s.weight)) : 0

  // 대체 수행(T8)은 원 종목을 함께 적는다. 이게 없으면 LLM 분석이 "새 종목이 갑자기
  // 나타나고 원 종목이 사라진" 것으로 읽어서 루틴 이탈로 오해한다
  const origin = entry.substituteFor
    ? (catalog.get(parseRecordKey(entry.substituteFor).exerciseId)?.shortName ??
      parseRecordKey(entry.substituteFor).exerciseId)
    : undefined

  const lines: string[] = []
  /*
    얹은 종목 (CC15)은 그 사실을 적는다 — 이게 없으면 LLM이 "그 Day 구성이 바뀌었다"로
    읽는다. 대체와 같은 이유이고, 둘은 의미가 반대라 문구를 구분한다.
  */
  lines.push(
    `### ${name} (${dayId.toUpperCase()}/${group}) ${fmtWeight(weight)}kg` +
      (origin ? ` (대체: ${origin} — 자리 없음)` : '') +
      (entry.extra ? ' (추가 — 계획 외)' : ''),
  )
  lines.push(sets.map((s) => s.reps).join(' / '))

  /*
   * 세트 간 간격 (Z3) — **파생값만 낸다. 입력 UI는 만들지 않는다.**
   *
   * 계획서가 "세트 간 휴식 기록·차등"을 운동학 근거로 기각했다: 비대 목적에서 휴식 단축은
   * 이 프로그램의 과부하 축이 아니고(짧은 휴식은 다음 세트 반복수를 깎아 세션 볼륨을 줄인다),
   * 종목별 차등은 이미 `restSec`으로 있다. 기록해서 줄이도록 유도하면 프로그램을 해친다.
   *
   * 다만 데이터는 이미 있다 (`doneAt`). 월간 분석에서 "휴식이 점점 길어지는 드리프트"를
   * 잡을 수 있으므로 내보내기에만 한 줄 낸다. 앱 화면에는 아무것도 추가하지 않는다.
   *
   * **순수 휴식이 아니다** — 앞 세트 체크 ~ 이 세트 체크이므로 수행 시간이 포함된다.
   * 그 사실을 캡션에 적어야 LLM 해석이 망가지지 않는다.
   */
  const gaps = setGaps(sets)
  if (gaps.length > 0) lines.push(`간격: ${gaps.join(' / ')}`)

  if (entry.sensoryScore !== undefined) {
    lines.push(
      entry.sensoryNote
        ? `감각: ${entry.sensoryScore}점 — ${entry.sensoryNote}`
        : `감각: ${entry.sensoryScore}점`,
    )
  }
  lines.push(`보상작용: ${entry.compensation}`)

  // 증량 판단은 더블 프로그레션 규칙으로 자동 산출 (§6). A그룹만 판단 대상이다.
  // 증량 폭은 종목별 무게 단위(T9)를 따른다 — 5kg 머신에 +2.5를 적어 보내면
  // LLM 분석도 존재하지 않는 무게를 전제하게 된다.
  if (routineExercise?.group === 'A' && sets.length > 0) {
    if (!nextWeights.has(entry.recordKey)) {
      lines.push(`다음: ${fmtWeight(weight)}kg 유지`)
    } else {
      const next = nextWeights.get(entry.recordKey) ?? null
      lines.push(
        next === null
          ? `다음: ${fmtWeight(weight)}kg 유지 (증량 조건 충족 — 스택 최대)`
          : `다음: ${fmtWeight(next)}kg로 증량`,
      )
    }
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
  scales?: WeightScaleMap,
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

  const nextWeights = new Map(
    progressionSuggestions(session, routine, phase, scales, catalog).map((p) => [p.recordKey, p.to]),
  )
  // 워밍업만 체크한 종목은 작업 세트가 없어 반복수 줄이 비어버린다 — 본문에서 제외한다
  const performed = timeline.map((t) => t.entry).filter((e) => doneSets(e).length > 0)
  for (const entry of performed) {
    out.push(...entryLine(entry, session, routine, catalog, nextWeights))
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

/**
 * 같은 종목 안의 세트 간 간격 (Z3). 첫 세트는 앞이 없으므로 생략한다.
 *
 * `doneAt`이 없는 옛 기록은 `—`로 둔다 — 자리를 비우면 몇 번째 세트의 간격인지 어긋난다.
 * 음수(시계 되감김·수동 편집)는 신뢰할 수 없으므로 `—`로 처리한다.
 */
export function setGaps(sets: { doneAt?: string }[]): string[] {
  const out: string[] = []
  for (let i = 1; i < sets.length; i += 1) {
    const prev = sets[i - 1].doneAt
    const cur = sets[i].doneAt
    if (!prev || !cur) {
      out.push('—')
      continue
    }
    const sec = Math.round((new Date(cur).getTime() - new Date(prev).getTime()) / 1000)
    out.push(sec >= 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '—')
  }
  return out
}

export function exportMarkdown(args: {
  sessions: Session[]
  routine: RoutineTemplate
  catalog: Map<string, Exercise>
  phase: Phase
  range: ExportRange
  /** 종목별 무게 단위 행 (T9). 없으면 루틴 전역 증량폭 */
  exerciseSettings?: ExerciseSetting[]
  /** 식단 (D4) */
  dietPlans?: DietPlan[]
  dietDays?: DietDay[]
}): string {
  const { sessions, routine, catalog, phase, range } = args
  const scales = buildScaleMap(args.exerciseSettings, routine.rules.weightIncrementKg)
  // 오래된 것부터 — 추이를 읽는 문서이므로 시간순이어야 한다
  const inRange = completedSessions(sessions)
    .filter((s) => s.date >= range.from && s.date <= range.to)
    .reverse()

  const planById = new Map((args.dietPlans ?? []).map((p) => [p.id, p]))
  const dietInRange = (args.dietDays ?? []).filter(
    (d) => d.date >= range.from && d.date <= range.to,
  )
  const dietByDate = new Map(dietInRange.map((d) => [d.date, d]))

  const dietLines = (date: string): string[] => {
    const day = dietByDate.get(date)
    const plan = day ? planById.get(day.planId) : undefined
    return day && plan ? dietSectionMarkdown(plan, day) : []
  }

  /*
   * 캡션 (Z3) — "간격"이 순수 휴식이 아니라는 것을 문서 자체가 말해야 한다.
   * LLM이 이걸 휴식 시간으로 읽으면 "휴식을 줄여 밀도를 올리자" 같은 엉뚱한 조언이 나오고,
   * 그건 이 프로그램의 과부하 축(더블 프로그레션)과 경쟁한다.
   */
  const head = [
    `# 운동 기록 ${range.from} ~ ${range.to}`,
    '',
    '> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**',
    '> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)',
  ].join('\n')
  /*
   * 식단만 기록한 날도 내보낸다 — 빼면 "회식 다음 날" 같은 패턴을 LLM이 볼 수 없다.
   * 운동이 있는 날은 운동 섹션 아래에 붙이고, 없는 날은 날짜 헤더만 세워 붙인다.
   */
  const dates = [...new Set([...inRange.map((s) => s.date), ...dietByDate.keys()])].sort()
  if (dates.length === 0) return `${head}\n\n(기간 내 기록 없음)\n`

  const body = dates.flatMap((date) => {
    const daySessions = inRange.filter((s) => s.date === date)
    const diet = dietLines(date)
    if (daySessions.length === 0) {
      return [`## ${date} (${weekdayKo(date)}) — 운동 없음`, '', ...diet, '']
    }
    return daySessions.flatMap((s, i) => [
      sessionToMarkdown(s, routine, catalog, phase, scales),
      '',
      // 같은 날 세션이 여럿이면 식단은 마지막 세션 아래 한 번만 붙인다
      ...(i === daySessions.length - 1 ? [...diet, ''] : []),
    ])
  })

  return [head, '', ...body].join('\n').trimEnd().concat('\n')
}

/** 보상작용이 기록된 종목 수 — 내보내기 미리보기용 */
export function compensationCount(sessions: Session[]): number {
  return sessions.reduce(
    (n, s) => n + s.entries.filter((e) => hasCompensation(e.compensation)).length,
    0,
  )
}
