#!/usr/bin/env node
/**
 * Astryx 적용 현황 표 (PLAN v1.19 QQ0).
 *
 * 사용: node scripts/astryx-inventory.mjs [--write | --check]
 *   --check면 docs/ASTRYX-INVENTORY.md의 합계 줄과 견줘 **뒷걸음만 막는다**(종료 코드 1): Astryx를 안 읽는 화면 파일이 늘었거나,
 *   인라인 스타일·legacy 클래스 쓰임이 늘었을 때. 줄어든 것은 통과하고 `--write`로 표를 새로 쓰라고 알린다.
 *   새 화면은 Astryx로 짓는다(docs/DESIGN.md 9절)를 글이 아니라 장치로 지키는 것이다. CI와 npm run check에서 돈다.
 *   src/**\/*.tsx(테스트 제외)마다: Astryx import 유무 · style={ 수 · 그 가운데 여백 속성 수 · legacy 클래스 수.
 *   --write면 docs/ASTRYX-INVENTORY.md에 쓴다(맨 위에 만든 날짜와 커밋).
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

const css = readFileSync(join(ROOT, 'src/styles/global.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const legacy = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]))

const SPACING = /\b(?:margin(?:Top|Bottom|Left|Right)?|padding(?:Top|Bottom|Left|Right)?|gap|rowGap|columnGap)\s*:/g
const rows = []
for (const file of walk(join(ROOT, 'src')).filter((f) => f.endsWith('.tsx') && !/\.test\.tsx$/.test(f)).sort()) {
  const src = readFileSync(file, 'utf8')
  const isAx = /from\s+['"](?:\.\.?\/)+ax(?:\/[^'"]*)?['"]|from\s+['"]\.\/ax['"]|@astryxdesign\//.test(src)
  const styles = [...src.matchAll(/style=\{\{([\s\S]*?)\}\}/g)]
  const spacing = styles.reduce((n, m) => n + (m[1].match(SPACING)?.length ?? 0), 0)
  const classes = new Set()
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    for (const w of (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (legacy.has(w)) classes.add(w)
  }
  const inlineCount = (src.match(/style=\{/g) ?? []).length
  rows.push({ file: relative(ROOT, file).replaceAll('\\', '/'), isAx, inlineCount, spacing, legacyN: classes.size })
}

const lines = ['| 파일 | Astryx | 인라인 | 인라인 여백 | legacy 클래스 |', '|---|---|---|---|---|']
for (const r of rows) lines.push(`| ${r.file} | ${r.isAx ? '예' : '—'} | ${r.inlineCount} | ${r.spacing} | ${r.legacyN} |`)
const total = rows.reduce((a, r) => ({ ax: a.ax + (r.isAx ? 1 : 0), inline: a.inline + r.inlineCount, sp: a.sp + r.spacing, legacy: a.legacy + r.legacyN }), { ax: 0, inline: 0, sp: 0, legacy: 0 })
lines.push('', `합계: \`.tsx\` ${rows.length}개 가운데 Astryx를 읽는 것 ${total.ax}개, 인라인 스타일 ${total.inline}곳(여백 ${total.sp}), legacy 클래스 쓰임 ${total.legacy}곳.`)

if (process.argv.includes('--check')) {
  const doc = readFileSync(join(ROOT, 'docs', 'ASTRYX-INVENTORY.md'), 'utf8')
  const m = /합계: `\.tsx` (\d+)개 가운데 Astryx를 읽는 것 (\d+)개, 인라인 스타일 (\d+)곳\(여백 \d+\), legacy 클래스 쓰임 (\d+)곳/.exec(doc)
  if (!m) {
    console.error('docs/ASTRYX-INVENTORY.md에 합계 줄이 없다. `node scripts/astryx-inventory.mjs --write`로 다시 쓴다.')
    process.exit(1)
  }
  const [files, ax, inline, legacyUse] = m.slice(1).map(Number)
  const checks = [
    ['Astryx를 안 읽는 화면 파일', files - ax, rows.length - total.ax],
    ['인라인 스타일', inline, total.inline],
    ['legacy 클래스 쓰임', legacyUse, total.legacy],
  ]
  const worse = checks.filter(([, was, now]) => now > was)
  for (const [name, was, now] of checks) console.log(`${now > was ? '✗' : '✓'} ${name}: ${was} → ${now}`)
  if (worse.length > 0) {
    console.error('\nAstryx 뒷걸음: 새 화면·부품은 src/ax의 Astryx 부품으로 짓는다(docs/DESIGN.md 9절). 손으로 짠 클래스·인라인 스타일을 늘리지 않는다.')
    process.exit(1)
  }
  if (checks.some(([, was, now]) => now < was)) console.log('줄었다. `node scripts/astryx-inventory.mjs --write`로 표를 새로 쓴다(다음부터 이 값이 기준이 된다).')
  process.exit(0)
}

let head = ''
if (process.argv.includes('--write')) {
  const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  head = `# Astryx 적용 현황\n\n> ${new Date().toISOString().slice(0, 10)}, 커밋 ${sha}. \`node scripts/astryx-inventory.mjs --write\`가 만든다. \`--check\`가 맨 아래 합계 줄을 기준으로 뒷걸음을 막는다.\n\n`
  writeFileSync(join(ROOT, 'docs', 'ASTRYX-INVENTORY.md'), head + lines.join('\n') + '\n')
  console.log('docs/ASTRYX-INVENTORY.md 씀')
}
console.log(lines.join('\n'))
