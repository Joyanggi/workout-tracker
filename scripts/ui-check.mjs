#!/usr/bin/env node
/**
 * UI 스크린샷 + 검사 (PLAN v1.19 QQ0).
 *
 * 사용: node scripts/ui-check.mjs <before|after> [--check] [--only=<장면,…>]
 *   before|after  저장 폴더 docs/screenshots/v1.19/<before|after>/<장면>.png (다크. 루틴 편집만 -light도)
 *   --check       장면마다 접근성(axe)·눌림 반응·움직임 줄이기·여백 격자·가로 넘침 + (띠·시트가 있으면) 유리 검사를 재서 표로 찍는다.
 *                 하나라도 실패면 종료 코드 1. 정적 검사는 after에서만(지금은 QQ1~QQ4가 더하는 만큼)
 *   --only=a,b    이 장면만 찍고 잰다(흐름은 앞에서부터 그대로 거친다)
 *
 * 브라우저: `npx playwright install chromium`. 레포에 넣지 않는다, CI는 받지 않는다.
 * 요소는 글자와 aria-label로만 고른다(예외: 시작 버튼 `.btn-start`, 재개 스트립, 휴식 바).
 * 검사 함수: scripts/lib/ui-check-lib.mjs, 유리는 scripts/lib/glass-check.mjs를 그대로 쓴다.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import { preview } from 'vite'
import {
  freePort,
  inPageContentOpaque,
  inPageGlassOn,
  inPageOneLayer,
  inPageOverflow,
  inPageSheetShow,
  inPageTextContrast,
  installScript,
} from './lib/glass-check.mjs'
import { inPageMotionDurations, inPageSpacing, measurePress, pressVerdict } from './lib/ui-check-lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/workout-tracker/'
const VER = 'v1.19'

const [phase, ...flags] = process.argv.slice(2)
if (phase !== 'before' && phase !== 'after') {
  console.error('사용: node scripts/ui-check.mjs <before|after> [--check] [--only=<장면,…>]')
  process.exit(2)
}
const CHECK = flags.includes('--check')
const onlyFlag = flags.find((f) => f.startsWith('--only='))
const ONLY = onlyFlag ? new Set(onlyFlag.slice(7).split(',').filter(Boolean)) : null
const OUT = join(ROOT, 'docs', 'screenshots', VER, phase)

const IPHONE = { ...devices['iPhone 14'] }
delete IPHONE.defaultBrowserType
const DEVICE = { ...IPHONE, viewport: { width: 390, height: 844 } }

const settle = (page, ms = 600) => page.waitForTimeout(ms)
const btn = (page, name) => page.getByRole('button', { name, exact: true })

const ASTRYX_SCENES = new Set(['editor', 'line-sheet'])
const COLUMNS = ['접근성', '눌림 반응', '움직임 줄이기', '여백 격자', '가로 넘침', '유리']
const rows = []
const axeInfo = []
const shots = []

const verdict = (r) => (r.skip ? { status: '건너뜀', detail: r.detail } : { status: r.ok ? '통과' : '실패', detail: r.detail })

async function glassVerdict(page, hasLayers) {
  if (!hasLayers) return null
  const parts = [
    ['유리 켜짐', inPageGlassOn],
    ['내용은 불투명', inPageContentOpaque],
    ['한 겹', inPageOneLayer],
    ['글자 대비', inPageTextContrast],
  ]
  const sheetUp = await page.evaluate(() => window.__glass.sheetOf() !== null)
  if (sheetUp) parts.push(['시트 비침', inPageSheetShow])
  const bad = []
  for (const [name, fn] of parts) {
    const r = await page.evaluate(fn)
    if (!r.skip && !r.ok) bad.push(`${name}: ${r.detail}`)
  }
  return { status: bad.length ? '실패' : '통과', detail: bad.join(' / ') || `${parts.length}개 통과` }
}

async function runChecks(page, scene) {
  const cells = Object.fromEntries(COLUMNS.map((c) => [c, null]))
  // 접근성
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const hard = res.violations.filter((v) => (v.impact === 'serious' || v.impact === 'critical') && v.id !== 'color-contrast')
  const contrast = res.violations.filter((v) => v.id === 'color-contrast')
  const desc = (v) => `${v.id} ${v.nodes.length}건 [${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}]`
  cells['접근성'] = { status: hard.length ? '실패' : '통과', detail: hard.map(desc).join(' / ') || '위반 0건' }
  axeInfo.push({ scene, hard: hard.length, hardList: hard.map(desc), contrast: contrast.reduce((a, v) => a + v.nodes.length, 0), incomplete: res.incomplete.filter((v) => v.id === 'color-contrast').reduce((a, v) => a + v.nodes.length, 0) })
  // 눌림 반응
  // Astryx 화면은 이 Chromium(pointer: coarse 흉내)에서 mouse.down으로 눌림 추적기가 안 칠해진다 → 이 검사에서 뺀다(DEV-RECORD 제약)
  cells['눌림 반응'] = ASTRYX_SCENES.has(scene) ? { status: '건너뜀', detail: 'Astryx 화면: mouse.down으로 눌림이 안 칠해진다(제약)' } : verdict(pressVerdict(await measurePress(page)))
  // 움직임 줄이기 (시트 장면만 판정, 나머지는 눌림 transform만)
  const sheetUp = await page.evaluate(() => window.__glass.sheetOf() !== null)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await settle(page, 150)
  const matches = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  if (!matches) cells['움직임 줄이기'] = { status: '건너뜀', detail: 'reducedMotion 흉내가 안 먹는다' }
  else if (!sheetUp) cells['움직임 줄이기'] = { status: '건너뜀', detail: '시트 장면에서만 잰다' }
  else {
    const dur = await page.evaluate(inPageMotionDurations)
    const press = await measurePress(page)
    const bad = []
    if (!dur.ok) bad.push(dur.detail)
    if (press.transformed.length) bad.push(`크기 변화 ${press.transformed.length}개: ${press.transformed.slice(0, 3).join(', ')}`)
    cells['움직임 줄이기'] = { status: bad.length ? '실패' : '통과', detail: bad.join(' / ') || dur.detail + ' · 크기 변화 0개' }
  }
  await page.emulateMedia({ reducedMotion: null })
  // 여백 격자·가로 넘침
  cells['여백 격자'] = verdict(await page.evaluate(inPageSpacing))
  cells['가로 넘침'] = verdict(await page.evaluate(inPageOverflow))
  const hasLayers = await page.evaluate(() => window.__glass.layersOf(true).length > 0)
  cells['유리'] = await glassVerdict(page, hasLayers)
  rows.push({ scene, cells })
}

async function runScenes(browser, port, scheme) {
  const light = scheme === 'light'
  const ctx = await browser.newContext({ ...DEVICE, locale: 'ko-KR', colorScheme: scheme, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.addInitScript(installScript())
  await page.goto(`http://localhost:${port}${BASE}`)

  const snap = async (scene) => {
    await settle(page, 500)
    const name = light ? `${scene}` : scene
    if (ONLY && !ONLY.has(name)) return
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    shots.push({ name, buf: await page.screenshot() })
    if (CHECK && !light) await runChecks(page, scene)
  }
  const optional = async (label, fn) => {
    try {
      await fn()
    } catch (e) {
      console.log(`장면 건너뜀: ${label} — ${String(e.message).split('\n')[0]}`)
    }
  }
  const toEnd = () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const toTop = () => page.evaluate(() => window.scrollTo(0, 0))
  const closeSheet = async (name) => {
    const dlg = page.getByRole('dialog', { name })
    await dlg.getByRole('button', { name: '닫기', exact: true }).click()
    await dlg.waitFor({ state: 'detached' }).catch(() => {})
    await settle(page, 400)
  }

  await page.getByRole('button', { name: /^(시작하기|확인했어요, 그래도 계속)$/ }).click()
  await page.getByRole('button', { name: '설정', exact: true }).waitFor()
  await settle(page, 800)

  if (!light) {
    await snap('home')
    await toEnd()
    await snap('home-end')
    await toTop()

    await btn(page, '변경').click()
    await page.getByRole('dialog', { name: 'Day 선택' }).waitFor()
    await settle(page)
    await snap('sheet-home')
    await closeSheet('Day 선택')

    await page.locator('.btn-start').click()
    await page.getByRole('button', { name: '세션 최소화', exact: true }).waitFor()
    await settle(page, 800)
    await snap('session')

    await btn(page, '세션 최소화').click()
    await page.locator('.resume-strip').waitFor()
    await settle(page, 600)
    await snap('home-resume')
    await page.locator('.resume-strip').click()
    await page.getByRole('button', { name: '세션 최소화', exact: true }).waitFor()
    await settle(page, 600)

    await page.getByRole('button', { name: '1세트 완료', exact: true }).first().click()
    await page.locator('.rest-bar').waitFor({ timeout: 5000 })
    await settle(page, 600)
    await snap('session-rest')

    await btn(page, '종료').click()
    await page.getByRole('dialog', { name: '세션 종료' }).waitFor()
    await settle(page)
    await snap('sheet-finish')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').first().waitFor({ state: 'detached', timeout: 1500 }).catch(() => {})
    if (await page.getByRole('dialog').count()) {
      await page.mouse.click(195, 30)
      await settle(page, 400)
    }
    await btn(page, '휴식 타이머 시작').click()
    await page.getByRole('dialog').first().waitFor()
    await settle(page)
    await snap('sheet-timer')
    await page.keyboard.press('Escape')
    if (await page.getByRole('dialog').count()) {
      await page.mouse.click(195, 30)
      await settle(page, 400)
    }

    // 세션 끝 → 요약
    await btn(page, '종료').click()
    await page.getByRole('dialog', { name: '세션 종료' }).waitFor()
    await btn(page, '기록 마치기').click()
    await btn(page, '홈으로').waitFor({ timeout: 8000 })
    await settle(page, 800)
    await snap('summary')
    await btn(page, '홈으로').click()
    await page.getByRole('button', { name: '기록', exact: true }).waitFor()
    await settle(page, 600)

    // 기록
    await page.getByRole('button', { name: '기록', exact: true }).click()
    await settle(page, 800)
    await snap('history')
    await optional('history-detail', async () => {
      await page.locator('button.row').first().click({ timeout: 3000 })
      await settle(page, 800)
      await snap('history-detail')
      await page.locator('.back-link').click()
      await settle(page, 400)
    })

    // 분석
    await page.getByRole('button', { name: '분석', exact: true }).click()
    await page.locator('svg.recharts-surface, .recharts-wrapper, .center-note').first().waitFor({ timeout: 8000 }).catch(() => {})
    await settle(page, 1200)
    await snap('analyze')

    // 식단
    await page.getByRole('button', { name: '식단', exact: true }).click()
    await settle(page, 800)
    await snap('diet')
    await optional('sheet-food', async () => {
      await btn(page, '＋ 먹은 것 추가').click({ timeout: 3000 })
      await page.getByRole('dialog', { name: '먹은 것 추가' }).waitFor()
      await settle(page)
      await snap('sheet-food')
      await closeSheet('먹은 것 추가')
    })

    // 설정
    await page.getByRole('button', { name: '설정', exact: true }).click()
    await settle(page, 800)
    await snap('settings')
    await toEnd()
    await snap('settings-end')
    await toTop()
  } else {
    await page.getByRole('button', { name: '설정', exact: true }).click()
    await settle(page, 600)
  }

  // 루틴 편집 (다크·라이트)
  const suffix = light ? '-light' : ''
  await btn(page, '편집').click()
  await page.getByText('루틴 이름', { exact: true }).first().waitFor()
  await settle(page, 800)
  await snap(`editor${suffix}`)
  await page.getByRole('button', { name: /^1\. / }).first().click()
  await page.getByRole('dialog', { name: '종목 줄 편집' }).waitFor()
  await settle(page, 800)
  await snap(`line-sheet${suffix}`)
  await ctx.close()
}

function printResults() {
  let failed = 0
  console.log('\n정적 검사: 없음 (QQ1·QQ2·QQ4가 더한다)')
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
        lines.push(`- 실패 ${r.scene} · ${c}: ${cell.detail}`)
      } else if (cell.status === '건너뜀') lines.push(`- 건너뜀 ${r.scene} · ${c}: ${cell.detail}`)
    }
  }
  if (lines.length) console.log(`\n상세:\n${lines.join('\n')}`)
  console.log('\n접근성(axe) 결과 — color-contrast는 찍기만 한다 (위반 노드 / incomplete 노드):')
  for (const a of axeInfo) console.log(`- ${a.scene}: serious·critical ${a.hard}건, color-contrast 위반 ${a.contrast} · incomplete ${a.incomplete}`)
  return failed
}

console.log('npm run build …')
execSync('npm run build', { cwd: ROOT, stdio: 'ignore' })
const port = await freePort()
const server = await preview({ root: ROOT, preview: { port, strictPort: true, host: 'localhost' }, logLevel: 'silent' })
const browser = await chromium.launch()
let exitCode = 0
try {
  await runScenes(browser, port, 'dark')
  if (!ONLY || [...ONLY].some((s) => s.endsWith('-light'))) await runScenes(browser, port, 'light')
  mkdirSync(OUT, { recursive: true })
  for (const s of shots) writeFileSync(join(OUT, `${s.name}.png`), s.buf)
  console.log(`스크린샷 ${shots.length}장 → docs/screenshots/${VER}/${phase}/`)
  if (CHECK && printResults() > 0) exitCode = 1
} finally {
  await browser.close()
  await server.close()
}
process.exit(exitCode)
