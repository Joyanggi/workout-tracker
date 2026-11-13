// scripts/check.mjs — 로컬 검사(npm run check)와 CI가 같은 것을 같은 순서로 돌리는지 잠근다.
// 한쪽에만 검사를 더하면 "내 자리에선 통과했는데 CI에서 실패"가 생긴다(문제 대장 npm-lock-ci-version과 같은 종류).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STEPS } from './check.mjs'

describe('check: CI와 같은 목록', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const ciRuns = [...ci.matchAll(/^\s+- run: (.+)$/gm)].map((m) => m[1].trim()).filter((c) => c !== 'npm ci')

  it('ci.yml의 run 단계가 STEPS와 같은 명령, 같은 순서다', () => {
    expect(ciRuns).toEqual(STEPS.map((s) => s.cmd))
  })

  it('빌드만 --fast에서 빠진다', () => {
    expect(STEPS.filter((s) => s.slow).map((s) => s.cmd)).toEqual(['npm run build'])
  })
})
