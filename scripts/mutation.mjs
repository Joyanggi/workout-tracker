#!/usr/bin/env node
/**
 * 변이 테스트 (StrykerJS) — 코드를 일부러 조금씩 망가뜨려(> 를 >= 로, 조건을 true로, 문자열을 비움)
 * 테스트가 그걸 잡는지 본다. 살아남은 변이 = 그 줄이 틀려도 통과하는 테스트의 구멍이다.
 * 구현자의 "결함 복원 확인"(IMPLEMENTER.md 3절)을 기계가 줄마다 대신 해 주는 것이다.
 *
 * 사용: node scripts/mutation.mjs [<파일>…] [--base origin/main]
 *   파일을 안 주면 <base>...HEAD에서 바뀐 src/lib/*.ts(테스트 제외)만 돌린다. 바뀐 게 없으면 아무것도 안 한다.
 *   전체(src/lib 57개)는 수십 분이 걸려서 기본으로 돌지 않는다. 전체는 `npx stryker run`.
 * 판정하지 않는다(살아남은 변이가 있어도 종료 코드 0). 결과 표는 구현자가 기록에 옮기고 리뷰어가 본다.
 * 화면(.tsx)은 대상이 아니다 — 화면은 ui-check와 화면 검증자가 본다. CI에서 돌지 않는다.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 변이 대상인가: src/lib의 .ts이고 테스트가 아니다 */
export function isTarget(path) {
  return /^src\/lib\/[^/]+\.ts$/.test(path) && !/\.test\.ts$/.test(path)
}

/** Stryker JSON 보고서 → 파일별 { killed, survived, noCoverage, score, survivors: [{ line, mutator, replacement }] } */
export function summarize(report) {
  return Object.entries(report.files ?? {}).map(([file, f]) => {
    const by = (s) => f.mutants.filter((m) => m.status === s)
    const killed = by('Killed').length + by('Timeout').length
    const survived = by('Survived')
    const noCoverage = by('NoCoverage')
    const total = killed + survived.length + noCoverage.length
    return {
      file,
      killed,
      survived: survived.length,
      noCoverage: noCoverage.length,
      score: total === 0 ? null : Math.round((killed / total) * 100),
      survivors: [...survived, ...noCoverage]
        .map((m) => ({ line: m.location.start.line, mutator: m.mutatorName, replacement: (m.replacement ?? '').replace(/\s+/g, ' ').slice(0, 60) }))
        .sort((a, b) => a.line - b.line),
    }
  })
}

export function render(rows) {
  const lines = ['| 파일 | 점수 | 잡음 | 살아남음 | 테스트 없음 |', '|---|---|---|---|---|']
  for (const r of rows) lines.push(`| ${r.file} | ${r.score === null ? '-' : r.score + '%'} | ${r.killed} | ${r.survived} | ${r.noCoverage} |`)
  for (const r of rows) {
    if (r.survivors.length === 0) continue
    lines.push('', `살아남은 변이 — ${r.file} (이 줄이 이렇게 바뀌어도 테스트가 통과한다):`)
    for (const s of r.survivors) lines.push(`- ${r.file}:${s.line} ${s.mutator}${s.replacement ? ` → ${s.replacement}` : ''}`)
  }
  return lines.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  const baseAt = args.indexOf('--base')
  const base = baseAt >= 0 ? args[baseAt + 1] : 'origin/main'
  let files = args.filter((a, i) => !a.startsWith('--') && (baseAt < 0 || i !== baseAt + 1))
  if (files.length === 0) {
    const diff = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`, '--', 'src/lib'], { cwd: ROOT, encoding: 'utf8' })
    files = diff.split('\n').filter(Boolean)
  }
  files = files.map((f) => f.replace(/\\/g, '/')).filter((f) => isTarget(f) && existsSync(join(ROOT, f)))
  if (files.length === 0) {
    console.log(`변이 테스트: 대상 없음 (${base}...HEAD에서 바뀐 src/lib/*.ts가 없다)`)
    return
  }
  console.log(`변이 테스트 대상 ${files.length}개: ${files.join(', ')}`)
  const run = spawnSync('npx', ['stryker', 'run', '--mutate', files.join(','), '--reporters', 'json', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  const reportPath = join(ROOT, 'reports', 'mutation', 'mutation.json')
  if (run.status !== 0 || !existsSync(reportPath)) {
    console.error(`변이 테스트를 못 돌렸다 (종료 코드 ${run.status}). 테스트가 먼저 통과하는지 본다: npm test`)
    process.exit(1)
  }
  console.log(render(summarize(JSON.parse(readFileSync(reportPath, 'utf8')))))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
