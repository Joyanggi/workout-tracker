import { describe, expect, it } from 'vitest'
import { sessionToMarkdown } from './exportMarkdown'
import { buildScaleMap, formatWeight } from './weightScale'
import { stripComments } from './sourceScan'
import { ROUTINE } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import { NO_COMPENSATION, makeRecordKey } from '../types'
import type { Exercise, Phase, RoutineExercise, Session, SessionEntry, SessionMode } from '../types'

// v111.test.ts를 import하면 그 파일의 테스트가 이 파일에서 또 돈다 → 같은 픽스처를 로컬로 둔다
const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))
const planned = (dayId: string, exerciseId: string): RoutineExercise =>
  ROUTINE.days.find((d) => d.id === dayId)!.exercises.find((e) => e.exerciseId === exerciseId)!
const NORMAL_RE = planned('d1', 'incline-chest-press')
const ASSIST_ORIGIN = planned('d2', 'lat-pulldown')
const NORMAL_KEY = makeRecordKey('incline-chest-press', 'd1')
const ASSIST_KEY = makeRecordKey('assisted-pullup', 'd2')
const ASSIST_ORIGIN_KEY = makeRecordKey('lat-pulldown', 'd2')
const PHASE: Phase = 1

/** v1.11.1 HH1 — 내보내기 무게를 저장값(0.01 단위) 그대로 적는다 */

const sets = (weight: number, reps: number[]) =>
  reps.map((r) => ({ weight, reps: r, done: true, doneAt: '2026-08-26T09:10:00.000Z' }))
const TOP = Array(NORMAL_RE.sets).fill(NORMAL_RE.repMax) as number[]

function md(opts: {
  weight: number
  reps?: number[]
  mode?: SessionMode
  assist?: boolean
  scale?: { step?: number; ladder?: number[] }
}): string {
  const key = opts.assist ? ASSIST_KEY : NORMAL_KEY
  const reps = opts.reps ?? (opts.assist ? Array(ASSIST_ORIGIN.sets).fill(ASSIST_ORIGIN.repMax) : TOP)
  const entry: SessionEntry = {
    recordKey: key, plannedOrder: 1, performedOrder: 1,
    sets: sets(opts.weight, reps), compensation: NO_COMPENSATION, skipped: false,
    ...(opts.assist ? { substituteFor: ASSIST_ORIGIN_KEY } : {}),
  }
  const s: Session = {
    id: 'h', date: '2026-08-26', dayId: opts.assist ? 'd2' : 'd1', routineId: ROUTINE.id,
    mode: opts.mode ?? 'normal', startedAt: '2026-08-26T09:00:00.000Z', endedAt: '2026-08-26T10:30:00.000Z',
    entries: [entry],
  }
  const rows = opts.scale
    ? [{ recordKey: key, ...(opts.scale.step !== undefined ? { weightStepKg: opts.scale.step } : {}),
         ...(opts.scale.ladder ? { weightLadderKg: opts.scale.ladder } : {}) }]
    : []
  return sessionToMarkdown(s, ROUTINE, catalog, PHASE, buildScaleMap(rows, ROUTINE.rules.weightIncrementKg))
}
const next = (m: string) => m.split('\n').find((l) => l.startsWith('다음:'))
const header = (m: string) => m.split('\n').find((l) => l.startsWith('### '))
const S125 = { step: 1.25 }

describe('HH1', () => {
  it('formatWeight: 정수·0.5·0.25·0.75 단위를 저장값 그대로 적는다', () => {
    expect(formatWeight(30)).toBe('30')
    expect(formatWeight(32.5)).toBe('32.5')
    expect(formatWeight(8.75)).toBe('8.75')
    expect(formatWeight(8.25)).toBe('8.25')
    expect(formatWeight(11.25)).toBe('11.25')
    expect(formatWeight(0)).toBe('0')
  })

  it('formatWeight: 부동소수 잡음을 감춘다', () => {
    expect(formatWeight(40.00000000000001)).toBe('40')
    expect(formatWeight(0.1 + 0.2)).toBe('0.3')
    expect(formatWeight(8.125)).toBe('8.13')
  })

  it('1.25 단위 종목: 헤더 무게가 8.75kg', () => {
    const h = header(md({ weight: 8.75, scale: S125 }))!
    expect(h).toContain(' 8.75kg')
    expect(h).not.toContain('8.8kg')
  })

  it('1.25 단위 종목: 유지 줄이 8.75kg', () => {
    const m = md({ weight: 8.75, reps: [10, 8, 7, 7], scale: S125 })
    expect(next(m)).toMatch(/^다음: 8\.75kg 유지 \(반복 상단\(10회\) 미달/)
  })

  it('1.25 단위 종목: 증량 목표가 8.75kg', () => {
    expect(next(md({ weight: 7.5, scale: S125 }))).toBe('다음: 8.75kg로 증량')
  })

  it('1.25 단위 종목: 8.75에서 증량하면 10kg', () => {
    expect(next(md({ weight: 8.75, scale: S125 }))).toBe('다음: 10kg로 증량')
  })

  it('1.25 단위 종목: x.25도 반올림하지 않는다', () => {
    expect(next(md({ weight: 10, scale: S125 }))).toBe('다음: 11.25kg로 증량')
  })

  it('직접 입력한 0.01 단위 무게: 헤더 그대로', () => {
    const h = header(md({ weight: 12.34 }))!
    expect(h).toContain(' 12.34kg')
    expect(h).not.toContain('12.3kg')
  })

  it('복귀 세션: 사유 접미사와 무게가 같이 맞다', () => {
    const m = md({ weight: 8.75, reps: [10, 10, 10], mode: 'return', scale: S125 })
    expect(next(m)).toBe(`다음: 8.75kg 유지 (반복 상단 도달 · 계획 ${NORMAL_RE.sets}세트 중 3세트 · 복귀 세션)`)
  })

  it('디로드 세션: 헤더 무게', () => {
    const m = md({ weight: 8.75, mode: 'deload', scale: S125 })
    expect(header(m)).toContain(' 8.75kg')
    expect(m).toContain('[디로드]')
  })

  it('대체 + 어시스트(inverse): 헤더와 보조 감소 목표', () => {
    const m = md({ weight: 8.75, assist: true, scale: S125 })
    expect(header(m)).toMatch(/ 8\.75kg \(대체: 랫풀다운 — 자리 없음\)/)
    expect(next(m)).toBe('다음: 7.5kg로 증량')
  })

  it('대체 + 어시스트: 보조 감소가 x.75로 떨어진다', () => {
    expect(next(md({ weight: 10, assist: true, scale: S125 }))).toBe('다음: 8.75kg로 증량')
  })

  it('사다리 종목: 핀 값 그대로', () => {
    expect(next(md({ weight: 7.5, scale: { ladder: [7.5, 8.75, 10] } }))).toBe('다음: 8.75kg로 증량')
  })

  it('스택 최대: 무게 그대로', () => {
    expect(next(md({ weight: 8.75, scale: { ladder: [7.5, 8.75] } }))).toBe(
      '다음: 8.75kg 유지 (증량 조건 충족 — 스택 최대)',
    )
  })
})

describe('HH1 — 소스 스캔', () => {
  const raw = import.meta.glob('/src/lib/exportMarkdown.ts', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const src = () => {
    expect(raw['/src/lib/exportMarkdown.ts'], '파일을 찾지 못했다 — 검사가 헛돌고 있다').toBeDefined()
    return stripComments(raw['/src/lib/exportMarkdown.ts'])
  }

  it('exportMarkdown에 toFixed와 로컬 fmtWeight가 없다', () => {
    expect(src()).not.toContain('toFixed(')
    expect(src()).not.toContain('function fmtWeight')
  })

  it('exportMarkdown의 kg 보간은 모두 formatWeight를 거친다', () => {
    const s = src()
    expect(s.match(/\$\{(?!formatWeight\()[^}]*\}kg/g) ?? []).toHaveLength(0)
    expect((s.match(/formatWeight\(/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })
})
