import { describe, expect, it } from 'vitest'
import { exportMarkdown } from './exportMarkdown'
import { hasCompensation } from './compensation'
import { holdReasonText, judgeProgression, progressionVerdicts } from './progression'
import { buildPrefill, defaultSetFor } from './prefill'
import { hasPain, painText, painTrail } from './pain'
import { applyPain, applySubstitute } from './sessionOps'
import { applyDayChange } from './dayChange'
import { scaleFor } from './weightScale'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import { makeRecordKey } from '../types'
import type { Exercise, Phase, Session } from '../types'

/**
 * v1.14 LL — 통증은 통증 칸에, 유산소는 종류와 강도로.
 * 이 파일의 describe는 작업별(LL0…)로 이어 붙는다.
 * LL0 골든은 v1.13 코드의 출력을 고정한다. 이후 고치지 않는다.
 */

const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))
const PHASE: Phase = 1
// v111.test.ts의 같은 이름을 import하지 않는다(테스트 파일 import는 그 describe를 다시 돌린다)
const ASSIST_KEY = makeRecordKey('assisted-pullup', 'd2')
const ASSIST_ORIGIN = ROUTINE.days.find((d) => d.id === 'd2')!.exercises.find((e) => e.exerciseId === 'lat-pulldown')!

// ─── LL0 픽스처 (v113.test.ts를 import하지 않는다) ─────────────────
function llSessions(): Session[] {
  const s0803 = completedSession({ dayId: 'd1', date: '2026-08-03', weight: 40 })
  for (const e of s0803.entries) for (const x of e.sets) x.done = false
  s0803.cardio = { type: '마이마운틴', minutes: 30 }

  const s0826 = completedSession({ dayId: 'd1', date: '2026-08-26', weight: 40 })
  s0826.cardio = { type: '마이마운틴', minutes: 20, note: '25/3.8' }

  const s0828 = completedSession({ dayId: 'd3', date: '2026-08-28', weight: 40 })
  const curl = s0828.entries.find((e) => e.recordKey === makeRecordKey('leg-curl', 'd3'))!
  curl.sets = [14, 10, 7].map((reps) => ({ weight: 40, reps, done: true, doneAt: s0828.startedAt }))
  curl.compensation = '보상작용은 아니고 첫세트시 왼쪽 발목 굉장히 찌릿해서 횟수 못채움'

  const s1104 = completedSession({ dayId: 'd1', date: '2026-11-04', weight: 40 })
  s1104.cardio = { type: '기타', minutes: 16, note: '4' }

  return [s0803, s0826, s0828, s1104]
}

function renderLl(): string {
  return exportMarkdown({
    sessions: llSessions(),
    routine: ROUTINE,
    catalog,
    phase: PHASE,
    range: { from: '2026-08-01', to: '2026-11-30' },
  }).replace(/\[\d\d:\d\d–\d\d:\d\d, /g, '[시각, ')
}

function verdictsLl(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const s of llSessions()) {
    for (const [rk, v] of progressionVerdicts(s, ROUTINE, PHASE, undefined, catalog)) {
      out[`${s.date}|${rk}`] = v
    }
  }
  return out
}

/** v1.13 코드(394c7a8)로 뽑은 내보내기 전문. 시각은 `시각`으로 치환 */
export const LL_EXPORT_BEFORE: string = "# 운동 기록 2026-08-01 ~ 2026-11-30\n\n> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**\n> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)\n\n## 2026-08-03 (월) — 유산소만  [시각, 90분]\n유산소: 마이마운틴 30분\n\n\n## 2026-08-26 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 40kg\n6 / 6 / 6 / 6\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(10회) 미달 — 4세트 중 0세트 도달)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 숄더프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n유산소: 마이마운틴 25/3.8 · 20분\n\n\n## 2026-08-28 (금) — Day 3 하체 + 코어  [시각, 90분]\n수행 순서: 레그 익스텐션 → 레그 컬 → 몬스터 글루트 → 힙 어덕션 → 크런치 → 데드버그\n\n### 레그 익스텐션 (D3/A) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(15회) 미달 — 3세트 중 0세트 도달)\n\n### 레그 컬 (D3/A) 40kg\n14 / 10 / 7\n간격: 0:00 / 0:00\n보상작용: 보상작용은 아니고 첫세트시 왼쪽 발목 굉장히 찌릿해서 횟수 못채움\n다음: 40kg 유지 (보상작용 있음)\n\n### 몬스터 글루트 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 힙 어덕션 (D3/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 크런치 (D3/core) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 데드버그 (D3/core) 40kg\n10 / 10\n간격: 0:00\n보상작용: 없음\n\n\n## 2026-11-04 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 40kg\n6 / 6 / 6 / 6\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(10회) 미달 — 4세트 중 0세트 도달)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 숄더프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n\n유산소: 기타 4 · 16분\n"

/** v1.13 코드로 뽑은 세션별 증량 판정 (날짜|recordKey → verdict) */
export const LL_VERDICT_BEFORE: Record<string, unknown> = {"2026-08-26|incline-chest-press@d1":{"kind":"hold","from":40,"reason":{"kind":"reps","reached":0,"total":4,"repMax":10}},"2026-08-26|flat-chest-press@d1":{"kind":"hold","from":40,"reason":{"kind":"reps","reached":0,"total":3,"repMax":12}},"2026-08-26|shoulder-press@d1":{"kind":"hold","from":40,"reason":{"kind":"reps","reached":0,"total":3,"repMax":12}},"2026-08-28|leg-extension@d3":{"kind":"hold","from":40,"reason":{"kind":"reps","reached":0,"total":3,"repMax":15}},"2026-08-28|leg-curl@d3":{"kind":"hold","from":40,"reason":{"kind":"compensation"}},"2026-11-04|incline-chest-press@d1":{"kind":"hold","from":40,"reason":{"kind":"reps","reached":0,"total":4,"repMax":10}},"2026-11-04|flat-chest-press@d1":{"kind":"hold","from":40,"reason":{"kind":"reps","reached":0,"total":3,"repMax":12}},"2026-11-04|shoulder-press@d1":{"kind":"hold","from":40,"reason":{"kind":"reps","reached":0,"total":3,"repMax":12}}}

describe('LL0 골든 — v1.13 출력', () => {
  it('LL_SESSIONS는 네 세션', () => {
    expect(llSessions().map((s) => s.date)).toEqual(['2026-08-03', '2026-08-26', '2026-08-28', '2026-11-04'])
  })
  it('LL_EXPORT_BEFORE: 지금 내보내기 = 골든', () => {
    expect(renderLl()).toBe(LL_EXPORT_BEFORE)
  })
  it('LL_VERDICT_BEFORE: 지금 증량 판정 = 골든', () => {
    expect(verdictsLl()).toEqual(LL_VERDICT_BEFORE)
  })
})

// ─── LL1 — "보상작용 있음" 판정 한 곳 ──────────────────────────────

const LL1_RE = ROUTINE.days.find((d) => d.id === 'd1')!.exercises.find((e) => e.exerciseId === 'incline-chest-press')!
const ll1Judge = (compensation: string | undefined) =>
  judgeProgression({
    routine: ROUTINE,
    routineExercise: LL1_RE,
    phase: PHASE,
    sets: [10, 10, 10, 10].map((reps) => ({ weight: 30, reps })),
    compensation,
  })

const ll1Sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('LL1', () => {
  it('hasCompensation: 없음·빈 문자열·공백·undefined는 false', () => {
    for (const v of ['없음', '', '  ', ' 없음 ', undefined]) expect(hasCompensation(v), String(v)).toBe(false)
  })
  it('hasCompensation: 적힌 값은 true', () => {
    for (const v of ['승모 개입', '없음, 반동']) expect(hasCompensation(v), v).toBe(true)
  })
  it("judgeProgression: 전 세트 상단 + compensation '' → up (전: hold compensation)", () => {
    expect(ll1Judge('')?.kind).toBe('up')
    expect(ll1Judge('없음')?.kind).toBe('up')
  })
  it("judgeProgression: '승모 개입' → hold compensation", () => {
    expect(ll1Judge('승모 개입')).toMatchObject({ kind: 'hold', reason: { kind: 'compensation' } })
  })
  it('LL_VERDICT_BEFORE 일치 (08-28 레그 컬은 그대로 hold compensation)', () => {
    expect(verdictsLl()).toEqual(LL_VERDICT_BEFORE)
    expect(LL_VERDICT_BEFORE['2026-08-28|leg-curl@d3']).toMatchObject({ reason: { kind: 'compensation' } })
  })
  it('소스 스캔: compensation.ts 밖에 NO_COMPENSATION 직접 비교가 없다', () => {
    const offenders = Object.entries(ll1Sources)
      .filter(([p]) => !p.includes('.test.') && !p.endsWith('/src/lib/compensation.ts'))
      .filter(([, src]) => {
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        return /[!=]==?\s*NO_COMPENSATION/.test(code)
      })
      .map(([p]) => p)
    expect(offenders).toEqual([])
  })
})

// ─── LL2 — 통증 칸: 저장·입력·증량 보류 ───────────────────────────

const ICP = makeRecordKey('incline-chest-press', 'd1')
const ICP_RE = LL1_RE // 4세트 · 상단 10
const ll2Judge = (over: Partial<Parameters<typeof judgeProgression>[0]> = {}) =>
  judgeProgression({
    routine: ROUTINE,
    routineExercise: ICP_RE,
    phase: PHASE,
    sets: [10, 10, 10, 10].map((reps) => ({ weight: 30, reps })),
    ...over,
  })

/** d1 완료 세션. `pain`이면 incline-chest-press entry에 통증, `noSets`면 그 종목 세트를 모두 안 한 것으로 */
function ll2Session(
  date: string,
  opts: { pain?: { note: string }; noSets?: boolean; weight?: number; mode?: Session['mode'] } = {},
): Session {
  const s = completedSession({
    dayId: 'd1',
    date,
    fullReps: true,
    weight: opts.weight ?? 40,
    mode: opts.mode,
  })
  const e = s.entries.find((x) => x.recordKey === ICP)!
  if (opts.noSets) for (const x of e.sets) x.done = false
  if (opts.pain) e.pain = opts.pain
  return s
}
const ll2Prefill = (sessions: Session[], key = ICP, re = ICP_RE) =>
  buildPrefill({ sessions, routine: ROUTINE, recordKey: key, routineExercise: re, phase: PHASE })

describe('LL2', () => {
  it('judgeProgression: 전 세트 상단 + 통증 → hold pain', () => {
    expect(ll2Judge({ pain: true })).toMatchObject({ kind: 'hold', from: 30, reason: { kind: 'pain' } })
    expect(holdReasonText({ kind: 'pain' })).toBe('통증 있음')
  })
  it('judgeProgression: 통증 + 보상작용 → pain (통증이 먼저)', () => {
    expect(ll2Judge({ pain: true, compensation: '승모 개입' })).toMatchObject({ reason: { kind: 'pain' } })
  })
  it('judgeProgression: 통증 + 반복 미달 → pain', () => {
    const sets = [10, 10, 10, 6].map((reps) => ({ weight: 30, reps }))
    expect(ll2Judge({ pain: true, sets })).toMatchObject({ reason: { kind: 'pain' } })
  })
  it('judgeProgression: Phase 0 + allowProgressionInPhase0 false + 통증 → phase0', () => {
    const routine = { ...ROUTINE, rules: { ...ROUTINE.rules, allowProgressionInPhase0: false } }
    expect(ll2Judge({ routine, phase: 0, pain: true })).toMatchObject({ reason: { kind: 'phase0' } })
  })
  it("progressionVerdicts: 통증 { note: '' }(메모 없음)도 hold pain", () => {
    const s = ll2Session('2026-09-01', { pain: { note: '' } })
    const v = progressionVerdicts(s, ROUTINE, PHASE, undefined, catalog).get(ICP)
    expect(v).toMatchObject({ kind: 'hold', reason: { kind: 'pain' } })
  })
  it('judgeProgression({ sets: [], pain: true }) → undefined (A그룹이어도)', () => {
    expect(ll2Judge({ sets: [], pain: true })).toBeUndefined()
  })
  it('B그룹 entry에 통증 → progressionVerdicts에 그 키가 없다', () => {
    const bEx = ROUTINE.days.flatMap((d) => d.exercises.map((e) => ({ d, e }))).find((x) => x.e.group !== 'A')!
    const s = completedSession({ dayId: bEx.d.id, date: '2026-09-01', fullReps: true })
    const key = s.entries.find((e) => e.recordKey.startsWith(bEx.e.exerciseId + '@'))!.recordKey
    const painted = applyPain(s, key, { note: '' })
    expect(progressionVerdicts(painted, ROUTINE, PHASE, undefined, catalog).has(key)).toBe(false)
  })

  it('buildPrefill: 직전 세션 전 세트 상단 + 통증 → progression 없음 · 무게 유지 · lastVerdict pain · streak 1', () => {
    const p = ll2Prefill([ll2Session('2026-09-01', { pain: { note: '발목' } })])
    expect(p.progression).toBeUndefined()
    expect(defaultSetFor(p, 0, ICP_RE).weight).toBe(40)
    expect(p.lastVerdict).toMatchObject({ kind: 'hold', reason: { kind: 'pain' } })
    expect(p.lastPain).toEqual({ date: '2026-09-01', note: '발목', streak: 1 })
  })
  it('세트 0 통증: S2 통증만 → hold pain, from은 S1 무게, progression 없음 · S2가 없으면 up', () => {
    const s1 = ll2Session('2026-09-01', { weight: 40 })
    const s2 = ll2Session('2026-09-03', { noSets: true, pain: { note: '' } })
    const p = ll2Prefill([s1, s2])
    expect(p.lastVerdict).toMatchObject({ kind: 'hold', from: 40, reason: { kind: 'pain' } })
    expect(p.progression).toBeUndefined()
    expect(ll2Prefill([s1]).lastVerdict?.kind).toBe('up')
  })
  it('기록 없는 종목의 세트 0 통증: lastVerdict undefined · streak 1 · hasHistory false · 둘 이어지면 streak 2', () => {
    const a = ll2Session('2026-09-01', { noSets: true, pain: { note: '' } })
    const p = ll2Prefill([a])
    expect(p.lastVerdict).toBeUndefined()
    expect(p.progression).toBeUndefined()
    expect(p.lastPain?.streak).toBe(1)
    expect(p.hasHistory).toBe(false)
    expect(p.lastSets).toEqual([])
    expect(p.bestBySet).toEqual([])
    const clean = ll2Session('2026-09-01', { noSets: true })
    expect(p.startEstimate).toBe(ll2Prefill([clean]).startEstimate)
    const b = ll2Session('2026-09-03', { noSets: true, pain: { note: '' } })
    const p2 = ll2Prefill([a, b])
    expect(p2.lastPain?.streak).toBe(2)
    expect(p2.lastVerdict).toBeUndefined()
  })
  it('progressionVerdicts: 세트 0 통증 entry의 키가 없다', () => {
    const s = ll2Session('2026-09-01', { noSets: true, pain: { note: '' } })
    expect(progressionVerdicts(s, ROUTINE, PHASE, undefined, catalog).has(ICP)).toBe(false)
  })
  it('통증 다음 세션에 통증 없이 수행 → 그다음 프리필은 통증과 무관 (lastPain 없음)', () => {
    const p = ll2Prefill([ll2Session('2026-09-01', { pain: { note: '' } }), ll2Session('2026-09-03')])
    expect(p.lastPain).toBeUndefined()
    expect(p.lastVerdict?.kind).toBe('up')
  })
  it('디로드·복귀: 디로드 세션(세트 절반, 전 세트 상단) + 통증 → 다음 프리필 사유는 pain (sets 아님)', () => {
    const s = ll2Session('2026-09-01', { pain: { note: '' }, mode: 'deload' })
    const e = s.entries.find((x) => x.recordKey === ICP)!
    e.sets = e.sets.slice(0, 2)
    expect(ll2Prefill([s]).lastVerdict).toMatchObject({ reason: { kind: 'pain' } })
  })
  it('대체: 대체 entry 통증 → 대체 종목 라인만 보류, 원 종목 라인은 lastPain 없음 · applySubstitute 뒤 hasPain false', () => {
    const subKey = makeRecordKey('flat-chest-press', 'd1')
    const s = ll2Session('2026-09-01')
    const e = s.entries.find((x) => x.recordKey === ICP)!
    e.recordKey = subKey
    e.substituteFor = ICP
    e.pain = { note: '' }
    const flatRe = ROUTINE.days.find((d) => d.id === 'd1')!.exercises.find((x) => x.exerciseId === 'flat-chest-press')!
    expect(ll2Prefill([s], subKey, flatRe).lastPain?.streak).toBe(1)
    expect(ll2Prefill([s], ICP).lastPain).toBeUndefined()

    const fresh = completedSession({ dayId: 'd1', date: '2026-09-05' })
    fresh.entries.find((x) => x.recordKey === ICP)!.sets.forEach((x) => (x.done = false))
    const painted = applyPain(fresh, ICP, { note: '' })
    const next = makeRecordKey('dumbbell-press', 'd1')
    const after = applySubstitute(painted, ICP, { recordKey: next, setCount: 3, weight: 10, reps: 10 })
    const row = after.entries.find((x) => x.recordKey === next)!
    expect(row).toBeDefined()
    expect(hasPain(row)).toBe(false)
  })
  it('어시스티드: inverse 종목 전 세트 상단 + 통증 → hold pain, from은 수행 무게', () => {
    const v = judgeProgression({
      routine: ROUTINE,
      routineExercise: { ...ASSIST_ORIGIN, exerciseId: 'assisted-pullup' },
      phase: PHASE,
      sets: [12, 12, 12, 12].map((reps) => ({ weight: 30, reps })),
      pain: true,
      scale: { ...scaleFor(undefined, ASSIST_KEY, ROUTINE.rules.weightIncrementKg), inverse: true },
    })
    expect(v).toMatchObject({ kind: 'hold', from: 30, reason: { kind: 'pain' } })
  })
  it('얹은 종목: extra entry 통증 → 그 종목 본 라인의 다음 프리필이 보류', () => {
    const s = ll2Session('2026-09-01', { pain: { note: '' } })
    s.entries.find((x) => x.recordKey === ICP)!.extra = true
    expect(ll2Prefill([s]).lastVerdict).toMatchObject({ kind: 'hold', reason: { kind: 'pain' } })
  })
  it('Day 변경: applyDayChange 뒤에도 pain이 그대로다', () => {
    const s = ll2Session('2026-09-01', { pain: { note: '발목' } })
    const moved = applyDayChange(s, ROUTINE, 'd2')
    expect(moved.entries.filter((x) => hasPain(x)).map((x) => x.pain)).toEqual([{ note: '발목' }])
  })
  it('applyPain: 설정 → { note } · undefined → hasPain false, painText undefined · 없는 recordKey → 세션 그대로', () => {
    const s = ll2Session('2026-09-01')
    const set = applyPain(s, ICP, { note: '무릎' })
    expect(set.entries.find((x) => x.recordKey === ICP)!.pain).toEqual({ note: '무릎' })
    const e = applyPain(set, ICP, undefined).entries.find((x) => x.recordKey === ICP)!
    expect(hasPain(e)).toBe(false)
    expect(painText(e)).toBeUndefined()
    expect(applyPain(s, makeRecordKey('nope', 'd1'), { note: 'x' })).toEqual(s)
  })
  it("hasPain: pain 키 없음·pain: undefined → false · { note: '' } → true · painText", () => {
    expect(hasPain({})).toBe(false)
    expect(hasPain({ pain: undefined })).toBe(false)
    expect(hasPain({ pain: { note: '' } })).toBe(true)
    expect(painText({ pain: { note: '' } })).toBe('있음')
    expect(painText({ pain: { note: '  발목 ' } })).toBe('있음 — 발목')
  })
  it('painTrail: 통증·통증·정상 → streak 2 · 통증·(안 한 세션)·통증 → streak 2 · 정상·통증 → undefined · 진행 중은 세지 않는다', () => {
    const P = { note: '' }
    const a = ll2Session('2026-09-01')
    const b = ll2Session('2026-09-03', { pain: P })
    const c = ll2Session('2026-09-05', { pain: P })
    expect(painTrail([a, b, c], ICP)?.streak).toBe(2)
    const gap = completedSession({ dayId: 'd1', date: '2026-09-04', onlyExercises: ['flat-chest-press'] })
    expect(painTrail([b, gap, c], ICP)?.streak).toBe(2)
    expect(painTrail([c, ll2Session('2026-09-07')], ICP)).toBeUndefined()
    const live = ll2Session('2026-09-09', { pain: P })
    delete (live as { endedAt?: string }).endedAt
    expect(painTrail([a, live], ICP)).toBeUndefined()
  })
  it('LL_VERDICT_BEFORE 일치 (통증 없는 기록의 판정 불변)', () => {
    expect(verdictsLl()).toEqual(LL_VERDICT_BEFORE)
  })
  it('소스 스캔: pain.ts 밖의 테스트 아닌 파일에 .pain !== undefined · .pain === undefined · !entry.pain 이 없다', () => {
    const offenders = Object.entries(ll1Sources)
      .filter(([p]) => !p.includes('.test.') && !p.endsWith('/src/lib/pain.ts'))
      .filter(([, src]) => {
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        return /\.pain\s*[!=]==?\s*undefined|!\s*entry\.pain\b/.test(code)
      })
      .map(([p]) => p)
    expect(offenders).toEqual([])
  })
})
