#!/usr/bin/env node
/**
 * 유리 스크린샷 + 유리 검사 (PLAN v1.18 PP0).
 *
 * 사용: node scripts/screenshots-glass.mjs <before|after> [--check] [--engine=webkit] [--sheet-alpha=<값>]
 *   before|after   저장 이름 앞. docs/screenshots/v1.18/<before|after>-<장면>.png (다크만)
 *   --check        장면마다 유리 검사 아홉을 재서 표로 찍는다. 실패가 하나라도 있으면 종료 코드 1.
 *                  after면 먼저 CSS 소스를 읽는 정적 검사도 한다
 *   --engine=webkit  Playwright WebKit으로 같은 장면을 `<phase>-<장면>-webkit.png`로 찍는다(검사 없음)
 *   --sheet-alpha=<값>  시트 농도 비교용. `--glass-sheet`의 알파를 바꿔 sheet-finish·sheet-home만
 *                  docs/screenshots/v1.18/compare/<장면>-a<값 두 자리>.png로 찍는다(검사 없음, CSS 파일은 안 건드린다)
 *
 * 브라우저: `npx playwright install chromium` (WebKit은 `webkit`). 레포에 넣지 않는다, CI는 받지 않는다.
 * 요소는 글자와 aria-label로 고른다(예외: 시작 버튼은 문구가 Day 이름에 따라 달라 `.btn-start`).
 * 검사 함수는 scripts/lib/glass-check.mjs에 있다.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices, webkit } from 'playwright'
import { preview } from 'vite'
import {
  inPageGlassOff,
  inPageGlassOn,
  inPageContentOpaque,
  installScript,
  freePort,
  inPageOneLayer,
  inPageOverflow,
  inPageSheetShow,
  inPageTabbarSpot,
  inPageTextContrast,
  staticChecks,
} from './lib/glass-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/workout-tracker/'
const VER = 'v1.18'

const [phase, ...flags] = process.argv.slice(2)
if (phase !== 'before' && phase !== 'after') {
  console.error('사용: node scripts/screenshots-glass.mjs <before|after> [--check] [--engine=webkit] [--sheet-alpha=<값>] [--width=<px>]')
  process.exit(2)
}
const flagValue = (name) => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3)
const CHECK = flags.includes('--check')
const ENGINE = flagValue('engine')
if (ENGINE !== undefined && ENGINE !== 'webkit') {
  console.error(`--engine은 webkit만 된다: ${ENGINE}`)
  process.exit(2)
}
const ALPHA = flagValue('sheet-alpha')
if (ALPHA !== undefined && !/^(0?\.\d+|1|0)$/.test(ALPHA)) {
  console.error(`--sheet-alpha는 0~1 사이 숫자여야 한다: ${ALPHA}`)
  process.exit(2)
}
const OUT = join(ROOT, 'docs', 'screenshots', VER)
const OUT_DIR = ALPHA !== undefined ? join(OUT, 'compare') : OUT

const IPHONE = { ...devices['iPhone 14'] }
delete IPHONE.defaultBrowserType // 엔진은 아래에서 고른다. 터치·모바일·pointer: coarse는 그대로 켜진다
const WIDTH = Number(flagValue('width') ?? 390) // 경계 확인용(375 = iPhone SE). 파일 이름 뒤에 -w<폭>이 붙는다
const DEVICE = { ...IPHONE, viewport: { width: WIDTH, height: 844 } }

const settle = (page, ms = 600) => page.waitForTimeout(ms)
const btn = (page, name) => page.getByRole('button', { name, exact: true })

// ───────────────────────── 검사 ─────────────────────────
const COLUMNS = ['유리 켜짐', '내용은 불투명', '한 겹', '투명도 줄이기', '대비 증가', '글자 대비', '시트 비침', '탭바 자리', '가로 넘침']
const TAB_SCENES = new Set(['home', 'home-end', 'home-resume', 'home-resume-end'])
const COVER_SCENES = new Set(['home-end', 'home-resume-end'])
const rows = [] // { scene, cells: { col: { status: '통과'|'실패'|'건너뜀', detail, parts? } | null } }

const verdict = (r) => (r.skip ? { status: '건너뜀', detail: r.detail } : { status: r.ok ? '통과' : '실패', detail: r.detail, parts: r.parts })

/** CDP로 미디어 기능을 흉내 낸다. 다크 고정이라 color-scheme도 같이 넣는다(이 호출이 Playwright가 건 값을 덮는다) */
async function emulate(cdp, feature) {
  const features = [{ name: 'prefers-color-scheme', value: 'dark' }]
  if (feature) features.push(feature)
  await cdp.send('Emulation.setEmulatedMedia', { features })
}

async function runChecks(page, cdp, scene) {
  const cells = Object.fromEntries(COLUMNS.map((c) => [c, null]))
  const sheetUp = await page.evaluate(() => window.__glass.sheetOf() !== null)
  cells['유리 켜짐'] = verdict(await page.evaluate(inPageGlassOn))
  cells['내용은 불투명'] = verdict(await page.evaluate(inPageContentOpaque))
  cells['한 겹'] = verdict(await page.evaluate(inPageOneLayer))
  for (const [col, feature, value] of [
    ['투명도 줄이기', 'prefers-reduced-transparency', 'reduce'],
    ['대비 증가', 'prefers-contrast', 'more'],
  ]) {
    await emulate(cdp, { name: feature, value })
    await settle(page, 150)
    const r = await page.evaluate(inPageGlassOff, `${feature}: ${value}`)
    // 이 Chromium이 흉내를 못 내면 규칙을 잴 수 없다 → 건너뜀 (정적 검사와 대비 증가가 맡는다)
    cells[col] = r.matches ? verdict(r) : { status: '건너뜀', detail: `${feature} 흉내가 안 먹는다(matchMedia false)` }
    await emulate(cdp, null)
    await settle(page, 150)
  }
  cells['글자 대비'] = verdict(await page.evaluate(inPageTextContrast))
  if (sheetUp) cells['시트 비침'] = verdict(await page.evaluate(inPageSheetShow))
  if (TAB_SCENES.has(scene)) cells['탭바 자리'] = verdict(await page.evaluate(inPageTabbarSpot, COVER_SCENES.has(scene)))
  cells['가로 넘침'] = verdict(await page.evaluate(inPageOverflow))
  rows.push({ scene, cells })
}

function printResults(staticRows) {
  let failed = 0
  if (staticRows) {
    console.log('\n| 정적 검사 | 결과 | 상세 |\n|---|---|---|')
    for (const s of staticRows) {
      console.log(`| ${s.name} | ${s.ok ? '통과' : '실패'} | ${s.detail} |`)
      if (!s.ok) failed++
    }
  } else {
    console.log('\n정적 검사: 건너뜀 (before는 glass.css가 아직 없다)')
  }
  const mark = (c) => (c === null ? '·' : c.status)
  console.log(`\n| 장면 | ${COLUMNS.join(' | ')} |\n|---|${COLUMNS.map(() => '---').join('|')}|`)
  for (const r of rows) console.log(`| ${r.scene} | ${COLUMNS.map((c) => mark(r.cells[c])).join(' | ')} |`)
  const lines = []
  for (const r of rows) {
    for (const c of COLUMNS) {
      const cell = r.cells[c]
      if (!cell) continue
      if (cell.status === '실패') {
        failed++
        const sub = cell.parts ? ` [${cell.parts.filter((p) => !p.ok).map((p) => `${p.name}: ${p.detail}`).join(' / ')}]` : ''
        lines.push(`- 실패 ${r.scene} · ${c}: ${cell.parts ? sub.trim() : cell.detail}`)
      } else if (cell.status === '건너뜀') lines.push(`- 건너뜀 ${r.scene} · ${c}: ${cell.detail}`)
    }
  }
  const infos = rows.flatMap((r) => (r.cells['시트 비침']?.status === '통과' ? [`- ${r.scene} · 시트 비침: ${r.cells['시트 비침'].detail}`] : []))
  const contrast = rows.flatMap((r) => (r.cells['글자 대비']?.status === '통과' ? [`- ${r.scene} · 글자 대비: ${r.cells['글자 대비'].detail}`] : []))
  if (lines.length > 0) console.log(`\n상세:\n${lines.join('\n')}`)
  if (contrast.length > 0) console.log(`\n글자 대비 값(최소):\n${contrast.join('\n')}`)
  if (infos.length > 0) console.log(`\n시트 비침 값:\n${infos.join('\n')}`)
  return failed
}

// ───────────────────────── 장면 ─────────────────────────
const suffix = (ENGINE === 'webkit' ? '-webkit' : '') + (WIDTH !== 390 ? `-w${WIDTH}` : '')
const shots = []

async function shoot(page, name) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  const buf = await page.screenshot()
  shots.push({ name, buf })
}

async function runScenes(browser, port) {
  const ctx = await browser.newContext({ ...DEVICE, locale: 'ko-KR', colorScheme: 'dark', serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const cdp = ENGINE === 'webkit' ? null : await ctx.newCDPSession(page)
  await page.addInitScript(installScript())
  await page.goto(`http://localhost:${port}${BASE}`)
  if (ALPHA !== undefined) await page.addStyleTag({ content: `:root { --glass-sheet: rgba(22, 22, 26, ${ALPHA}) }` })

  const compareOnly = ALPHA !== undefined
  const snap = async (scene, { compare = false } = {}) => {
    await settle(page, 500)
    if (compareOnly && !compare) return
    if (compareOnly) {
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      shots.push({ name: `${scene}-a${String(Math.round(Number(ALPHA) * 100)).padStart(2, '0')}`, buf: await page.screenshot() })
      return
    }
    await shoot(page, scene)
    if (CHECK && cdp) await runChecks(page, cdp, scene)
  }
  const toEnd = () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const toTop = () => page.evaluate(() => window.scrollTo(0, 0))
  const closeSheet = async (name) => {
    const dlg = page.getByRole('dialog', { name })
    await dlg.getByRole('button', { name: '닫기', exact: true }).click()
    await dlg.waitFor({ state: 'detached' }).catch(() => {})
    await settle(page, 400)
  }

  // 온보딩 → 홈
  await page.getByRole('button', { name: /^(시작하기|확인했어요, 그래도 계속)$/ }).click()
  await page.getByRole('button', { name: '설정', exact: true }).waitFor()
  await settle(page, 800)
  await snap('home')
  await toEnd()
  await snap('home-end')
  await toTop()

  // 홈의 시트 (아래에 탭바)
  await btn(page, '변경').click()
  await page.getByRole('dialog', { name: 'Day 선택' }).waitFor()
  await settle(page)
  await snap('sheet-home', { compare: true })
  await closeSheet('Day 선택')

  // 세션 시작
  await page.locator('.btn-start').click()
  await page.getByRole('button', { name: '세션 최소화', exact: true }).waitFor()
  await settle(page, 800)
  await snap('session')
  await page.evaluate(() => window.scrollTo(0, 300))
  await snap('session-scrolled')
  await toTop()

  // 최소화 → 재개 스트립
  await page.getByRole('button', { name: '세션 최소화', exact: true }).click()
  await page.locator('.resume-strip').waitFor()
  await settle(page, 600)
  await snap('home-resume')
  await toEnd()
  await snap('home-resume-end')
  await toTop()
  await page.locator('.resume-strip').click()
  await page.getByRole('button', { name: '세션 최소화', exact: true }).waitFor()
  await settle(page, 600)

  // 휴식 바
  await page.getByRole('button', { name: '1세트 완료', exact: true }).first().click()
  await page.locator('.rest-bar').waitFor({ timeout: 5000 })
  await settle(page, 600)
  await snap('session-rest')

  // 시트 둘
  await btn(page, '종료').click()
  await page.getByRole('dialog').first().waitFor()
  await settle(page)
  await snap('sheet-finish', { compare: true })
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').first().waitFor({ state: 'detached' }).catch(() => {})
  if (await page.getByRole('dialog').count()) {
    await page.mouse.click(195, 30) // 막을 눌러 닫는다
    await settle(page, 400)
  }
  await page.getByRole('button', { name: '휴식 타이머 시작', exact: true }).click()
  await page.getByRole('dialog').first().waitFor()
  await settle(page)
  await snap('sheet-timer')
  await ctx.close()
}

// ───────────────────────── 본체 ─────────────────────────
console.log('npm run build …')
execSync('npm run build', { cwd: ROOT, stdio: 'ignore' })
const port = await freePort()
const server = await preview({ root: ROOT, preview: { port, strictPort: true, host: 'localhost' }, logLevel: 'silent' })
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch()
let exitCode = 0
try {
  await runScenes(browser, port)
  mkdirSync(OUT_DIR, { recursive: true })
  for (const s of shots) {
    const file = ALPHA !== undefined ? `${s.name}${suffix}.png` : `${phase}-${s.name}${suffix}.png`
    writeFileSync(join(OUT_DIR, file), s.buf)
  }
  console.log(`스크린샷 ${shots.length}장 → docs/screenshots/${VER}${ALPHA !== undefined ? '/compare' : ''}/ (${ENGINE === 'webkit' ? 'WebKit' : 'Chromium'})`)
  if (CHECK && ENGINE !== 'webkit' && ALPHA === undefined) {
    let staticRows = null
    if (phase === 'after') {
      const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)
      staticRows = staticChecks({ globalCss: read('src/styles/global.css') ?? '', axCss: read('src/ax/ax.css') ?? '', glassCss: read('src/styles/glass.css') })
    }
    if (printResults(staticRows) > 0) exitCode = 1
  }
} finally {
  await browser.close()
  await server.close()
}
process.exit(exitCode)
