#!/usr/bin/env node
/**
 * 스크린샷을 Argos에 올린다 (PLAN v1.19 QQ0). 판정하지 않는다: 건너뜀·실패여도 종료 코드 0.
 *
 * 사용: node scripts/argos-upload.mjs <before|after> [--ver=v1.20]  (없으면 package.json 버전의 앞 두 자리)
 *   before  docs/screenshots/v1.19/before를 main의 빌드로(ARGOS_BRANCH=main, ARGOS_COMMIT=merge-base) 올린다 — 기준이 된다
 *   after   docs/screenshots/v1.19/after를 지금 브랜치·HEAD로 올리되 기준을 merge-base로 못 박는다
 * 토큰은 환경 변수 ARGOS_TOKEN으로만 읽는다(명령줄 인자로 넘기지 않는다 — 로그에 남지 않게).
 */
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const phase = process.argv[2]
if (phase !== 'before' && phase !== 'after') {
  console.error('사용: node scripts/argos-upload.mjs <before|after>')
  process.exit(2)
}
if (!process.env.ARGOS_TOKEN) {
  console.log('Argos 건너뜀: ARGOS_TOKEN 없음')
  process.exit(0)
}
const verFlag = process.argv.find((a) => a.startsWith('--ver='))
const verAt = process.argv.indexOf('--ver')
const VER = verFlag ? verFlag.slice(6) : verAt >= 0 ? String(process.argv[verAt + 1]) : 'v' + JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version.split('.').slice(0, 2).join('.')
if (!/^v\d+\.\d+$/.test(VER)) {
  console.error(`--ver는 v1.20 모양이어야 한다: ${VER}`)
  process.exit(2)
}
const dir = join('docs', 'screenshots', VER, phase)
if (!existsSync(join(ROOT, dir))) {
  console.log(`Argos 건너뜀: ${dir} 없음`)
  process.exit(0)
}
const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT }).toString().trim()
const base = git('merge-base main HEAD')
const env = { ...process.env }
const args = ['argos', 'upload', dir]
if (phase === 'before') {
  env.ARGOS_BRANCH = 'main'
  env.ARGOS_COMMIT = base
} else {
  args.push('--reference-branch', 'main', '--reference-commit', base)
}
const r = spawnSync('npx', args, { cwd: ROOT, env, encoding: 'utf8', shell: true })
const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
if (r.status === 0) console.log(out)
else console.log(`Argos 올리기 실패: ${out.split('\n').filter(Boolean).at(-1) ?? '출력 없음'}`)
process.exit(0)
