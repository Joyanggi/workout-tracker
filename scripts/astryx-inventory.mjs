#!/usr/bin/env node
/**
 * Astryx 적용 현황 표 (PLAN v1.19 QQ0). 판정하지 않는다(종료 코드 항상 0).
 *
 * 사용: node scripts/astryx-inventory.mjs [--write]
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
const total = rows.reduce((a, r) => ({ ax: a.ax + (r.isAx ? 1 : 0), inline: a.inline + r.inlineCount, sp: a.sp + r.spacing }), { ax: 0, inline: 0, sp: 0 })
lines.push('', `합계: \`.tsx\` ${rows.length}개 가운데 Astryx를 읽는 것 ${total.ax}개, 인라인 스타일 ${total.inline}곳(여백 ${total.sp}).`)

let head = ''
if (process.argv.includes('--write')) {
  const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  head = `# Astryx 적용 현황\n\n> ${new Date().toISOString().slice(0, 10)}, 커밋 ${sha}. \`node scripts/astryx-inventory.mjs --write\`가 만든다. 판정하지 않는다.\n\n`
  writeFileSync(join(ROOT, 'docs', 'ASTRYX-INVENTORY.md'), head + lines.join('\n') + '\n')
  console.log('docs/ASTRYX-INVENTORY.md 씀')
}
console.log(lines.join('\n'))
