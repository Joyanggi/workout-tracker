// scripts/mutation.mjs — 변이 테스트 대상을 src/lib의 코드로만 좁히고, Stryker 보고서를 살아남은 줄 목록으로 바꾸는지 잠근다.
import { describe, expect, it } from 'vitest'
import { isTarget, render, summarize } from './mutation.mjs'

describe('mutation: 대상', () => {
  it.each([
    ['src/lib/setPlan.ts', true],
    ['src/lib/setPlan.test.ts', false],
    ['src/screens/HomeScreen.tsx', false],
    ['src/lib/sub/deep.ts', false],
    ['scripts/incidents.mjs', false],
  ])('%s → %s', (path, expected) => {
    expect(isTarget(path)).toBe(expected)
  })
})

describe('mutation: 보고서 요약', () => {
  const m = (status, line, mutatorName, replacement) => ({ status, mutatorName, replacement, location: { start: { line } } })
  const report = {
    files: {
      'src/lib/a.ts': { mutants: [m('Killed', 3, 'EqualityOperator', '>='), m('Timeout', 4, 'BlockStatement', '{}'), m('Survived', 9, 'StringLiteral', '""'), m('NoCoverage', 7, 'ConditionalExpression', 'true'), m('Ignored', 1, 'X', '')] },
      'src/lib/b.ts': { mutants: [] },
    },
  }
  const rows = summarize(report)

  it('시간 초과는 잡은 것으로, 테스트가 안 지나간 줄은 구멍으로 세고, 무시된 변이는 뺀다', () => {
    expect(rows[0]).toMatchObject({ killed: 2, survived: 1, noCoverage: 1, score: 50 })
    expect(rows[1].score).toBeNull()
  })

  it('살아남은 변이를 줄 번호 순서로 보인다', () => {
    expect(rows[0].survivors.map((s) => s.line)).toEqual([7, 9])
    const out = render(rows)
    expect(out).toContain('| src/lib/a.ts | 50% | 2 | 1 | 1 |')
    expect(out).toContain('- src/lib/a.ts:9 StringLiteral → ""')
  })
})
