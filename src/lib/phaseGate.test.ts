import { describe, expect, it } from 'vitest'
import { phaseReadiness } from './phaseReadiness'
import { deloadState, earlyDeloadSignal } from './dashboard'
import { ROUTINE, completedSession } from './testFixtures'
import { stripComments } from './sourceScan'
import type { Session } from '../types'

/**
 * Y1 — **Phase 승급·디로드 판정은 근력 기록만 본다** (리뷰 후속).
 *
 * X3에서 `strengthSessions`를 만들 때 이 두 곳을 놓쳤다. 리뷰어 스캔이 잡아냈고
 * (§3.1이 물은 "세 번째 사본"), 재현해 보니 둘 다 **판정을 관대하게** 만들고 있었다 —
 * 유산소만 다닌 기간이 근력 공백인데 "공백 없음"으로 통과했다.
 *
 * ⚠ 리뷰어는 ③(보상작용)을 "안쪽에서 doneSets>0만 보므로 무해"로 판단했는데
 * **재현해 보니 결함이었다.** 안쪽 필터는 분자(`withComp`)만 지키고 분모(`recent.length`)는
 * 전 세션을 센다 — 근력 0회 + 유산소 10회에서 "10세션 모두 없음"으로 met이 됐다.
 */

function cardioOnly(dayId: string, date: string): Session {
  const base = completedSession({ dayId, date, fullReps: true, weight: 30 })
  return {
    ...base,
    entries: base.entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: false })) })),
    cardio: { type: '마이마운틴', minutes: 25, note: '25/3.8' },
  }
}
const S = (dayId: string, date: string) => completedSession({ dayId, date, fullReps: true, weight: 30 })
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const TODAY = '2026-08-08'
const check = (sessions: Session[], label: string) =>
  phaseReadiness(sessions, ROUTINE, 2, TODAY).checks.find((c) => c.label.includes(label))

describe('Y1 ④ — 유산소가 근력 공백을 가리지 않는다', () => {
  /** 6개월 창 안에 근력 0회, 유산소만 5일 간격 */
  const cardioDense = (): Session[] => {
    const out: Session[] = []
    for (let m = 2; m <= 8; m += 1) {
      for (const d of [3, 8, 13, 18, 23, 28]) {
        if (m === 8 && d > 8) continue
        out.push(cardioOnly('d1', iso(2026, m, d)))
      }
    }
    return out
  }

  it('근력이 없으면 유산소가 촘촘해도 "공백 있음"이다', () => {
    expect(check(cardioDense(), '공백')).toMatchObject({ met: false })
  })

  it('근력이 촘촘하면 "공백 없음"이다 (수정이 조건 자체를 막지 않았다)', () => {
    const out: Session[] = []
    for (let m = 2; m <= 8; m += 1) {
      for (const d of [3, 13, 23]) {
        if (m === 8 && d > 8) continue
        out.push(S('d1', iso(2026, m, d)))
      }
    }
    expect(check(out, '공백')).toMatchObject({ met: true })
  })
})

describe('Y1 ③ — 보상작용 판정의 분모도 근력 기준이다', () => {
  it('근력 0회 + 유산소만이면 met이 아니다 (기록 없음으로 본다)', () => {
    const out: Session[] = []
    for (const d of [12, 15, 18, 21, 24, 27, 30]) out.push(cardioOnly('d1', iso(2026, 7, d)))
    for (const d of [2, 5, 8]) out.push(cardioOnly('d1', iso(2026, 8, d)))
    const comp = check(out, '보상작용')
    // 예전에는 met: true / "10세션 모두 없음"이 나왔다 — 분모가 전 세션이었다
    expect(comp).toMatchObject({ met: false, insufficient: true })
  })

  it('근력 세션이 있으면 정상 판정한다', () => {
    const out = [S('d1', iso(2026, 8, 2)), S('d2', iso(2026, 8, 5))]
    expect(check(out, '보상작용')).toMatchObject({ met: true, insufficient: false })
  })
})

describe('Y1 디로드 — 유산소가 4주+ 리셋을 막지 않는다', () => {
  /** 6월에 근력 주 3회 4주 → 카운터가 쌓인 상태 */
  const june = (): Session[] =>
    [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26].map((d) => S('d1', iso(2026, 6, d)))

  it('7월부터 유산소만 다녀도 근력 공백으로 리셋된다', () => {
    const withCardio = [...june()]
    for (const [m, days] of [[7, [2, 9, 16, 23, 30]], [8, [6]]] as [number, number[]][])
      for (const d of days) withCardio.push(cardioOnly('d1', iso(2026, m, d)))

    // 유산소가 없을 때와 같아야 한다 — 유산소는 근력 공백을 메우지 않는다
    expect(deloadState(withCardio, ROUTINE, TODAY).performedWeeks).toBe(
      deloadState(june(), ROUTINE, TODAY).performedWeeks,
    )
    expect(deloadState(withCardio, ROUTINE, TODAY).performedWeeks).toBe(0)
  })

  it('근력을 이어서 하면 카운터가 쌓인다 (수정이 카운터를 죽이지 않았다)', () => {
    const cont = [...june()]
    for (const [m, days] of [[7, [1, 3, 6, 8, 10, 13, 15, 17]]] as [number, number[]][])
      for (const d of days) cont.push(S('d1', iso(2026, m, d)))
    expect(deloadState(cont, ROUTINE, iso(2026, 7, 20)).performedWeeks).toBeGreaterThan(0)
  })

  it('유산소만으로는 조기 디로드 신호가 뜨지 않는다', () => {
    const cardio = [1, 8, 15, 22, 29].map((d) => cardioOnly('d1', iso(2026, 7, d)))
    expect(earlyDeloadSignal(cardio, ROUTINE, TODAY).signal).toBe(false)
  })
})

/**
 * 재유입 방지 — `phaseReadiness`는 파일 전체가 근력 기준이다.
 *
 * 사이트별로 "여기는 괜찮다"를 따지면 새 조건을 추가할 때 또 판단해야 하고, 그 판단이
 * 이번에 한 번 틀렸다 (리뷰어의 ③ 판단). 파일 규칙 하나로 두고 기계로 지킨다.
 */
describe('인바리언트 — Phase 판정에 completedSessions가 다시 들어오지 않는다', () => {
  const sources = import.meta.glob('/src/lib/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('phaseReadiness.ts는 completedSessions를 쓰지 않는다', () => {
    const src = sources['/src/lib/phaseReadiness.ts']
    expect(src, 'phaseReadiness.ts를 찾지 못했다').toBeDefined()
    expect(stripComments(src!)).not.toMatch(/\bcompletedSessions\b/)
  })

  it('phaseReadiness.ts가 실제로 strengthSessions를 쓴다 (검사가 헛돌지 않게)', () => {
    expect(stripComments(sources['/src/lib/phaseReadiness.ts']!)).toMatch(/\bstrengthSessions\(/)
  })

  it('deloadState의 카운터 시작 주가 근력 기준이다', () => {
    const src = stripComments(sources['/src/lib/dashboard.ts']!)
    const fn = /export function deloadState\([\s\S]*?\n\}/.exec(src)?.[0]
    expect(fn, 'deloadState를 찾지 못했다').toBeDefined()
    expect(fn).toMatch(/strengthSessions\(sessions\)/)
    expect(fn).not.toMatch(/completedSessions\(sessions\)/)
  })
})
