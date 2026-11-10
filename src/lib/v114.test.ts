import { describe, expect, it } from 'vitest'
import { exportMarkdown } from './exportMarkdown'
import { hasCompensation } from './compensation'
import { judgeProgression, progressionVerdicts } from './progression'
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
