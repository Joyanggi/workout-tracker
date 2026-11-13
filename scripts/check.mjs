#!/usr/bin/env node
/**
 * 기계 검사 전부를 한 번에 — CI(.github/workflows/ci.yml)와 같은 목록, 같은 순서다.
 * 구현자는 이게 통과할 때까지 고치고 다시 돌린다(IMPLEMENTER.md 3절 "검사 루프"), 리뷰어는 한 번 돌려 확인한다.
 *
 * 사용: node scripts/check.mjs [--fast]   (npm run check)
 *   --fast  빌드를 뺀다(작업 중간에). 마무리에는 빼지 않는다.
 * 실패한 단계에서 멈추지 않고 끝까지 돌려, 무엇이 깨졌는지 한 표로 보인다. 하나라도 실패면 종료 코드 1.
 * 출력은 단계마다 끝 12줄만 보인다(토큰). 전체가 필요하면 그 명령을 따로 돌린다.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** CI와 같은 목록. 여기를 고치면 ci.yml도 같이 고친다(scripts/check.test.mjs가 둘이 같은지 본다). */
export const STEPS = [
  { name: '흔적 검사', cmd: 'node scripts/quality-scan.mjs --ci' },
  { name: 'Astryx 뒷걸음', cmd: 'node scripts/astryx-inventory.mjs --check' },
  { name: '린트', cmd: 'npm run lint' },
  { name: '안 쓰는 파일·의존성', cmd: 'npm run knip' },
  { name: '테스트', cmd: 'npm test' },
  { name: '빌드', cmd: 'npm run build', slow: true },
]

function main() {
  const fast = process.argv.includes('--fast')
  const results = []
  for (const step of STEPS) {
    if (fast && step.slow) {
      results.push({ ...step, status: '건너뜀' })
      continue
    }
    const started = Date.now()
    const run = spawnSync(step.cmd, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const ok = run.status === 0
    const sec = Math.round((Date.now() - started) / 1000)
    results.push({ ...step, status: ok ? '통과' : '실패', sec })
    if (!ok) {
      const tail = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim().split(/\r?\n/).slice(-12).join('\n')
      console.log(`\n── ${step.name} 실패 (${step.cmd}) ──\n${tail}`)
    }
  }
  console.log('\n| 검사 | 결과 | 초 | 명령 |\n|---|---|---|---|')
  for (const r of results) console.log(`| ${r.name} | ${r.status} | ${r.sec ?? '-'} | \`${r.cmd}\` |`)
  const failed = results.filter((r) => r.status === '실패')
  console.log(failed.length === 0 ? '\n검사 통과' : `\n검사 실패 ${failed.length}건: ${failed.map((r) => r.name).join(', ')}`)
  process.exit(failed.length === 0 ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
