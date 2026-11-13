// 속성 테스트 (fast-check) — 예시 몇 개가 아니라 "어떤 입력에서도 성립해야 하는 것"을 수백 개의 무작위 입력으로 잠근다.
// 판정·계산 함수에 새 규칙을 더할 때 여기에 속성을 한 줄 더한다(agents/IMPLEMENTER.md 2절).
// 실패하면 fast-check가 가장 작은 반례를 찍어 준다. 그 반례를 이름 붙은 예시 테스트로 옮겨 고정한다.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { clampStep } from '../ax/clampStep'
import { addDays, daysBetween, parseDateStr, weekDates, weekStart } from './dates'
import { STEP_PRESETS, snapDownToScale, stepBelow, stepDown, stepUp } from './weightScale'

/** 0.25kg 단위 무게 (부동소수로 정확히 표현되는 값만) */
const weight = fc.integer({ min: 0, max: 1200 }).map((n) => n / 4)
const step = fc.constantFrom(...STEP_PRESETS)
/** 오름차순, 중복 없는 핀 사다리 */
const ladder = fc.uniqueArray(fc.integer({ min: 1, max: 800 }), { minLength: 1, maxLength: 12 }).map((a) => a.map((n) => n / 4).sort((x, y) => x - y))
const dateStr = fc
  .tuple(fc.integer({ min: 2024, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

const onGrid = (v: number, s: number) => Math.abs(v / s - Math.round(v / s)) < 1e-6

describe('속성: 무게 단위 (weightScale)', () => {
  it('사다리의 ± 는 언제나 사다리 위의 핀이거나 제자리다 — 없는 무게를 만들지 않는다', () => {
    fc.assert(
      fc.property(weight, ladder, (w, l) => {
        for (const next of [stepUp(w, { step: 2.5, ladder: l }), stepDown(w, { step: 2.5, ladder: l })]) {
          expect(next === w || l.includes(next)).toBe(true)
        }
      }),
    )
  })

  it('사다리에서 + 는 내려가지 않고 − 는 올라가지 않으며, 이웃 핀을 건너뛰지 않는다', () => {
    fc.assert(
      fc.property(weight, ladder, (w, l) => {
        const scale = { step: 2.5, ladder: l }
        const up = stepUp(w, scale)
        const down = stepDown(w, scale)
        expect(up).toBeGreaterThanOrEqual(w)
        expect(down).toBeLessThanOrEqual(w)
        expect(l.some((v) => v > w && v < up)).toBe(false)
        expect(l.some((v) => v < w && v > down)).toBe(false)
      }),
    )
  })

  it('사다리 안의 핀(최상단 제외)에서 올렸다 내리면 제자리다', () => {
    fc.assert(
      fc.property(ladder, fc.nat(), (l, i) => {
        fc.pre(l.length > 1)
        const scale = { step: 2.5, ladder: l }
        const at = l[i % (l.length - 1)]
        expect(stepDown(stepUp(at, scale), scale)).toBe(at)
      }),
    )
  })

  it('snapDownToScale은 목표를 넘지 않고(내림), 걸 수 있는 무게이며, 두 번 해도 같다', () => {
    fc.assert(
      fc.property(weight, step, (w, s) => {
        const snapped = snapDownToScale(w, { step: s })
        expect(snapped).toBeLessThanOrEqual(w)
        expect(w - snapped).toBeLessThan(s)
        expect(onGrid(snapped, s)).toBe(true)
        expect(snapDownToScale(snapped, { step: s })).toBe(snapped)
      }),
    )
    fc.assert(
      fc.property(weight, ladder, (w, l) => {
        const snapped = snapDownToScale(w, { step: 2.5, ladder: l })
        expect(l.includes(snapped)).toBe(true)
        // 최하단보다 가벼운 목표만 위로 간다(핀을 안 꽂는 것은 답이 아니다)
        expect(snapped <= w || snapped === l[0]).toBe(true)
        // 목표 이하의 핀 가운데 가장 무거운 것이다 (변이 테스트가 이 줄 없이는 '늘 최하단'을 못 잡는다는 걸 보여 줬다)
        expect(l.some((v) => v > snapped && v <= w)).toBe(false)
        expect(snapDownToScale(snapped, { step: 2.5, ladder: l })).toBe(snapped)
      }),
    )
  })

  it('stepBelow(복귀 "한 단계 내림")는 0보다 무거우면 반드시 더 가볍고, 격자 위이며, 음수가 아니다', () => {
    fc.assert(
      fc.property(weight, step, (w, s) => {
        const below = stepBelow(w, { step: s })
        expect(below).toBeGreaterThanOrEqual(0)
        expect(onGrid(below, s)).toBe(true)
        if (w > 0) expect(below).toBeLessThan(w)
        expect(w - below).toBeLessThanOrEqual(s)
      }),
    )
  })

  it('clampStep(Astryx 스테퍼)은 어떤 값에서도 [min, max]를 벗어나지 않는다', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 500 }), fc.constantFrom(-1 as const, 1 as const), fc.integer({ min: 1, max: 10 }), fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 200 }), (v, dir, s, min, span) => {
        const next = clampStep(v, dir, s, min, min + span)
        expect(next).toBeGreaterThanOrEqual(min)
        expect(next).toBeLessThanOrEqual(min + span)
      }),
    )
  })
})

describe('속성: 날짜 (dates)', () => {
  it('addDays와 daysBetween은 서로 역이다 (DST·월말·윤년 포함)', () => {
    fc.assert(
      fc.property(dateStr, fc.integer({ min: -800, max: 800 }), (d, n) => {
        expect(daysBetween(d, addDays(d, n))).toBe(n)
        expect(addDays(addDays(d, n), -n)).toBe(d)
      }),
    )
  })

  it('weekStart는 그 주의 월요일이다 — 0~6일 앞이고, 두 번 해도 같고, 같은 주의 날은 모두 같은 값이다', () => {
    fc.assert(
      fc.property(dateStr, (d) => {
        const start = weekStart(d)
        expect(parseDateStr(start).getDay()).toBe(1)
        const gap = daysBetween(start, d)
        expect(gap).toBeGreaterThanOrEqual(0)
        expect(gap).toBeLessThanOrEqual(6)
        expect(weekStart(start)).toBe(start)
        const days = weekDates(d)
        expect(days).toHaveLength(7)
        expect(days).toContain(d)
        expect(new Set(days.map(weekStart)).size).toBe(1)
      }),
    )
  })
})
