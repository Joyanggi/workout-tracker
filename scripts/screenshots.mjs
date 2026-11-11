#!/usr/bin/env node
/**
 * 화면 스크린샷 + 모양·흐름 검사 (PLAN v1.17 OO0).
 *
 * 사용: node scripts/screenshots.mjs <before|after> [--check]
 *   before  바꾸기 전 화면. 다크만 저장한다(라이트는 다크와 바이트로 같은지 보고 버린다)
 *   after   바꾼 뒤 화면. 다크·라이트 둘 다 저장한다
 *   --check 장면마다 모양 검사를 재서 표로 찍고, 하나라도 어기면 종료 코드 1.
 *           after면 이어서 흐름 검사도 돈다(스크린샷 없이 판정만)
 *
 * 브라우저: `npx playwright install chromium` (레포에 넣지 않는다, CI는 받지 않는다).
 * 요소는 글자와 aria-label로만 고른다 → 문구가 같으면 같은 스크립트가 전·후에 모두 돈다.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import { preview } from 'vite'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs', 'screenshots', 'v1.17')
const BASE = '/workout-tracker/'
const LONG_NAME = '스크린샷용 아주 긴 이름의 인클라인 덤벨 벤치 프레스 변형'

const [phase, ...flags] = process.argv.slice(2)
if (phase !== 'before' && phase !== 'after') {
  console.error('사용: node scripts/screenshots.mjs <before|after> [--check]')
  process.exit(2)
}
const CHECK = flags.includes('--check')

// ───────────────────────── 기기 ─────────────────────────
const IPHONE = { ...devices['iPhone 14'] }
delete IPHONE.defaultBrowserType // 엔진은 chromium으로 흉내 낸다(터치·모바일·pointer: coarse는 켜진다)
const SE = { ...devices['iPhone SE (3rd gen)'] }
delete SE.defaultBrowserType
const VIEWPORTS = [
  { tag: '', label: '390', device: { ...IPHONE, viewport: { width: 390, height: 844 } } },
  { tag: '-375', label: '375', device: { ...SE, viewport: { width: 375, height: 667 } } },
]
/** 375는 이 둘만 더 찍는다 */
const SCENES_375 = new Set(['editor-full', 'line-sheet'])

// ───────────────────────── 서버 ─────────────────────────
function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

// ───────────────────────── 모양 검사 (브라우저 안에서 도는 함수들) ─────────────────────────
/** 가로 넘침 */
const inPageOverflow = () => ({
  ok: document.documentElement.scrollWidth <= innerWidth,
  detail: `scrollWidth ${document.documentElement.scrollWidth} > ${innerWidth}`,
})

/** 보이는 요소만 (크기 1px 이하·display none·visibility hidden은 뺀다) */
const inPageVisibleDef = (el) => {
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1
}

/** 제목 한 줄 · 머리 줄 */
const inPageHeader = () => {
  const leaf = (text) =>
    [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === text)
  const btn = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
  const title = leaf('루틴 편집')
  const cancel = btn('‹ 취소')
  const save = btn('저장')
  if (!title) return { title: null, header: null }
  const cs = getComputedStyle(title)
  const lh = Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.2
  const h = title.getBoundingClientRect().height
  const out = { title: { ok: h < lh * 1.5, detail: `제목 높이 ${h.toFixed(0)} / 줄 ${lh.toFixed(0)}` }, header: null }
  if (cancel && save) {
    const rs = [cancel, title, save].map((e) => e.getBoundingClientRect())
    const inside = rs.every((r) => r.left >= 0 && r.right <= innerWidth)
    const apart = (a, b) => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5
    const noOverlap = apart(rs[0], rs[1]) && apart(rs[1], rs[2]) && apart(rs[0], rs[2])
    out.header = {
      ok: inside && noOverlap,
      detail: `${inside ? '' : '화면 밖 '}${noOverlap ? '' : '겹침 '}취소 ${Math.round(rs[0].width)}px · 제목 ${Math.round(rs[1].width)}px · 저장 ${Math.round(rs[2].width)}px`,
    }
  }
  return out
}

/** 글자 잘림: 보이는 글자 요소 전부 scrollWidth <= clientWidth (inline은 clientWidth가 0이라 뺀다) */
const inPageClip = () => {
  const bad = []
  const skipTag = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'HTML', 'BODY'])
  for (const el of document.querySelectorAll('body *')) {
    if (skipTag.has(el.tagName.toUpperCase())) continue
    if (el.closest('svg')) continue
    const isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
    if (isField && ['checkbox', 'radio', 'hidden', 'button', 'submit'].includes(el.type)) continue
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')
    if (!isField && !hasText) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'inline') continue
    if (!window.__vis(el)) continue
    if (el.scrollWidth > el.clientWidth + 1) {
      const t = isField ? `input "${el.value}"` : `${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 24)}"`
      bad.push(`${t} (${el.scrollWidth}>${el.clientWidth})`)
    }
  }
  return { ok: bad.length === 0, detail: bad.slice(0, 4).join(' · ') + (bad.length > 4 ? ` 외 ${bad.length - 4}` : '') }
}

/** 입력 글자 16px 이상 */
const inPageInputFont = () => {
  const bad = []
  for (const el of document.querySelectorAll('input, textarea')) {
    if (['checkbox', 'radio', 'hidden', 'button', 'submit'].includes(el.type)) continue
    if (!window.__vis(el)) continue
    const fs = Number.parseFloat(getComputedStyle(el).fontSize)
    if (fs < 16) bad.push(`${el.getAttribute('aria-label') ?? el.id ?? el.type} ${fs}px`)
  }
  return { ok: bad.length === 0, detail: bad.slice(0, 4).join(' · ') }
}


/** 시트의 스크롤 가능한 요소를 모두 끝까지 내린다 (el의 조상 + 시트 안 전부) */
const inPageScrollSheetToEndDef = (sheet) => {
  for (const e of [sheet, ...sheet.querySelectorAll('*')]) {
    if (e.scrollHeight > e.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)) {
      e.scrollTop = e.scrollHeight
    }
  }
}

/** 마지막 줄: 시트를 끝까지 스크롤했을 때 맨 아래 버튼의 가운데 점이 그 버튼이다 */
const inPageLastRow = () => {
  const sheet = [...document.querySelectorAll('dialog[open], [role="dialog"]')].find(window.__vis)
  if (!sheet) return null
  window.__scrollEnd(sheet)
  const buttons = [...sheet.querySelectorAll('button')].filter((b) => window.__vis(b))
  const last = buttons[buttons.length - 1]
  if (!last) return { ok: false, detail: '시트에 버튼이 없다' }
  const r = last.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const hit = document.elementFromPoint(x, y)
  const ok = hit !== null && last.contains(hit)
  return { ok, detail: `"${last.textContent.trim().slice(0, 16)}" 가운데 (${Math.round(x)},${Math.round(y)}) → ${hit ? hit.tagName.toLowerCase() + ' "' + hit.textContent.trim().slice(0, 16) + '"' : '화면 밖'}` }
}

/** 탭 영역: 컨트롤 가운데에서 위·아래·좌·우 21px 점이 그 컨트롤(이나 그 안)을 가리킨다. 예외 없음 */
const inPageTapArea = () => {
  const sheet = [...document.querySelectorAll('dialog[open], [role="dialog"]')].find(window.__vis)
  const scope = sheet ?? document.body
  const sel = 'button, [role="switch"], [role="button"], [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"], summary'
  const bad = []
  let n = 0
  for (const el of scope.querySelectorAll(sel)) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue
    if (!window.__vis(el)) continue
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const own = (hit) => hit !== null && (el.contains(hit) || (el.labels ? [...el.labels].some((l) => l.contains(hit)) : false))
    const sides = [[0, -21, '위'], [0, 21, '아래'], [-21, 0, '왼쪽'], [21, 0, '오른쪽']]
    const failed = sides.filter(([dx, dy]) => !own(document.elementFromPoint(cx + dx, cy + dy))).map((s) => s[2])
    n += 1
    if (failed.length > 0) {
      const name = el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 14)
      bad.push(`"${name}" ${Math.round(r.width)}×${Math.round(r.height)} ${failed.join('·')}`)
    }
  }
  return { ok: bad.length === 0, detail: `${n}개 중 ${bad.length}개 실패: ` + bad.slice(0, 5).join(' · ') + (bad.length > 5 ? ` 외 ${bad.length - 5}` : '') }
}

/** 버튼 높이 (after만) */
const inPageButtonHeight = () => {
  const TEXT = ['‹ 취소', '저장', '＋ 종목 추가', 'Day 삭제', '＋ Day 추가', '닫기']
  const ICON_LABELS = ['Day 위로', 'Day 아래로', '종목 위로', '종목 아래로']
  const bad = []
  let n = 0
  for (const b of document.querySelectorAll('button')) {
    if (!window.__vis(b)) continue
    const text = b.textContent.trim()
    const label = b.getAttribute('aria-label') ?? ''
    const r = b.getBoundingClientRect()
    if (TEXT.includes(text) && label === '') {
      n += 1
      if (Math.abs(r.height - 36) > 0.5) bad.push(`"${text}" 높이 ${r.height.toFixed(1)}`)
    } else if (ICON_LABELS.includes(label) || /( 감소| 증가)$/.test(label)) {
      n += 1
      const square = Math.abs(r.width - 36) <= 0.5 && Math.abs(r.height - 36) <= 0.5
      const shown = b.innerText.trim() !== ''
      if (!square || !shown) bad.push(`"${label}" ${r.width.toFixed(1)}×${r.height.toFixed(1)}${shown ? '' : ' 글자 없음'}`)
    }
  }
  return { ok: bad.length === 0, detail: `${n}개 중 ${bad.length}개 실패: ` + bad.slice(0, 5).join(' · ') }
}

/** 검사 뒤 스크롤을 처음으로 (다음 장면 스크린샷이 흔들리지 않게) */
const inPageResetScroll = () => {
  window.scrollTo(0, 0)
  for (const e of document.querySelectorAll('*')) if (e.scrollTop !== 0) e.scrollTop = 0
}

// ───────────────────────── 검사 실행 ─────────────────────────
const CHECK_COLUMNS = ['가로 넘침', '제목 한 줄', '머리 줄', '글자 잘림', '입력 글자', '마지막 줄', '탭 영역', '버튼 높이']
const results = [] // { scene, vp, scheme, cells: {col: {ok, detail}|null} }

async function runChecks(page, scene, vp, scheme, kind) {
  const cells = Object.fromEntries(CHECK_COLUMNS.map((c) => [c, null]))
  if (kind !== 'sample') {
    cells['가로 넘침'] = await page.evaluate(inPageOverflow)
    const h = await page.evaluate(inPageHeader)
    cells['제목 한 줄'] = h.title
    cells['머리 줄'] = h.header
    cells['글자 잘림'] = await page.evaluate(inPageClip)
    cells['입력 글자'] = await page.evaluate(inPageInputFont)
    if (kind === 'sheet') cells['마지막 줄'] = await page.evaluate(inPageLastRow)
    cells['탭 영역'] = await page.evaluate(inPageTapArea)
    if (phase === 'after') cells['버튼 높이'] = await page.evaluate(inPageButtonHeight)
    await page.evaluate(inPageResetScroll)
  }
  results.push({ scene, vp, scheme, cells })
}

function printResults() {
  const mark = (c) => (c === null ? '·' : c.ok ? '✓' : '✗')
  console.log(`\n| 장면 | 폭 | 모드 | ${CHECK_COLUMNS.join(' | ')} |`)
  console.log(`|---|---|---|${CHECK_COLUMNS.map(() => '---').join('|')}|`)
  for (const r of results) {
    console.log(`| ${r.scene} | ${r.vp} | ${r.scheme} | ${CHECK_COLUMNS.map((c) => mark(r.cells[c])).join(' | ')} |`)
  }
  const fails = results.flatMap((r) =>
    CHECK_COLUMNS.filter((c) => r.cells[c] && !r.cells[c].ok).map((c) => `- ${r.scene} ${r.vp} ${r.scheme} · ${c}: ${r.cells[c].detail}`),
  )
  if (fails.length > 0) console.log(`\n실패 상세:\n${fails.join('\n')}`)
  return fails.length
}

// ───────────────────────── 장면 ─────────────────────────
const settle = (page, ms = 700) => page.waitForTimeout(ms)
const btn = (page, name) => page.getByRole('button', { name, exact: true })

async function shoot(page, name, scheme, tag, { full }, store) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  const buf = await page.screenshot({ fullPage: full })
  store.push({ name, scheme, tag, buf })
}

async function enterEditor(page) {
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await btn(page, '편집').click()
  await page.getByText('루틴 이름', { exact: true }).first().waitFor()
  await settle(page, 400)
}

/** 한 컨텍스트(폭·모드 하나)에서 장면을 순서대로 지난다. 반환: 컨텍스트에 남은 page(흐름 검사용) */
async function runContext(browser, vp, scheme, store) {
  const only375 = vp.tag === '-375'
  const ctx = await browser.newContext({ ...vp.device, locale: 'ko-KR', colorScheme: scheme, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.addInitScript(`window.__vis = ${inPageVisibleDef}; window.__scrollEnd = (sheet) => (${inPageScrollSheetToEndDef})(sheet)`)
  const url = `http://localhost:${runContext.port}${BASE}`
  await page.goto(url)

  const want = (scene) => !only375 || SCENES_375.has(scene)
  const snap = async (scene, kind, full) => {
    if (!want(scene)) return
    await shoot(page, scene, scheme, vp.tag, { full }, store)
    if (CHECK) await runChecks(page, scene, vp.label, scheme, kind)
  }

  // 온보딩 → 홈
  await page.getByRole('button', { name: /^(시작하기|확인했어요, 그래도 계속)$/ }).click()
  await page.getByRole('button', { name: '설정', exact: true }).waitFor()
  await settle(page, 600)
  await snap('home', 'sample', false)

  await page.getByRole('button', { name: '설정', exact: true }).click()
  await btn(page, '편집').waitFor()
  await settle(page, 400)
  await snap('settings', 'sample', false)

  // 편집 화면 전체
  await btn(page, '편집').click()
  await page.getByText('루틴 이름', { exact: true }).first().waitFor()
  await settle(page, 400)
  await snap('editor-full', 'editor', true)

  // 줄 시트
  await page.getByRole('button', { name: /^1\. / }).first().click()
  await page.getByRole('dialog', { name: '종목 줄 편집' }).waitFor()
  await settle(page)
  await snap('line-sheet', 'sheet', false)
  if (want('line-sheet-end')) {
    await page.evaluate((el) => window.__scrollEnd(el), await page.getByRole('dialog', { name: '종목 줄 편집' }).elementHandle())
    await settle(page, 300)
    await snap('line-sheet-end', 'sheet', false)
  }
  if (!only375) {
    const line = page.getByRole('dialog', { name: '종목 줄 편집' })
    await line.getByRole('button', { name: '닫기', exact: true }).click()
    await line.waitFor({ state: 'detached' }).catch(() => {})
    await settle(page)

    // 고르기 시트와 새 종목 폼
    await btn(page, '＋ 종목 추가').first().click()
    const picker = page.getByRole('dialog', { name: '종목 고르기' })
    await picker.waitFor()
    await settle(page)
    await snap('picker-sheet', 'sheet', false)
    await picker.getByRole('button', { name: '＋ 새 종목 만들기', exact: true }).click()
    await picker.getByRole('button', { name: '뒤로', exact: true }).waitFor()
    await settle(page, 400)
    await snap('picker-form', 'sheet', false)
    await picker.getByRole('button', { name: '뒤로', exact: true }).click()
    await picker.getByRole('button', { name: '닫기', exact: true }).click()
    await picker.waitFor({ state: 'detached' }).catch(() => {})
    await settle(page)

    // 나가기 확인
    await page.getByLabel('Day 이름', { exact: true }).first().fill('Day 1 — 수정')
    await btn(page, '‹ 취소').click()
    await btn(page, '계속 편집').waitFor()
    await settle(page, 400)
    await snap('editor-leave', 'editor', true)
    await btn(page, '저장하지 않고 나가기').click()
    await btn(page, '편집').waitFor()
    await enterEditor(page)

    // 문제 목록
    await page.getByLabel('루틴 이름', { exact: true }).fill('')
    await btn(page, '저장').click()
    await page.locator('.banner-danger, [role="alert"]').first().waitFor({ timeout: 3000 }).catch(() => {})
    await settle(page, 400)
    await snap('editor-problems', 'editor', true)
    await btn(page, '‹ 취소').click()
    await btn(page, '저장하지 않고 나가기').click()
    await btn(page, '편집').waitFor()
    await enterEditor(page)

    // 긴 이름의 내 종목을 첫 Day에 넣는다 → 이어서 열리는 줄 시트를 닫는다
    await btn(page, '＋ 종목 추가').first().click()
    await picker.waitFor()
    await picker.getByRole('button', { name: '＋ 새 종목 만들기', exact: true }).click()
    await picker.getByLabel('이름', { exact: true }).fill(LONG_NAME)
    await picker.getByRole('button', { name: '만들고 추가', exact: true }).click()
    const lineAgain = page.getByRole('dialog', { name: '종목 줄 편집' })
    await lineAgain.waitFor()
    await settle(page)
    await lineAgain.getByRole('button', { name: '닫기', exact: true }).click()
    await lineAgain.waitFor({ state: 'detached' }).catch(() => {})
    await settle(page)
    await snap('editor-long', 'editor', true)
  }
  return { ctx, page }
}

// ───────────────────────── 흐름 검사 (after만, 스크린샷 없이 판정) ─────────────────────────
const flows = []
const flow = (name, ok, detail = '') => flows.push({ name, ok, detail })

async function runFlows(page) {
  const picker = page.getByRole('dialog', { name: '종목 고르기' })
  const line = page.getByRole('dialog', { name: '종목 줄 편집' })
  const openPicker = async () => {
    await btn(page, '＋ 종목 추가').nth(1).click() // 둘째 Day: 내 종목이 아직 안 들어 있다
    await picker.waitFor({ timeout: 3000 })
    await settle(page, 500)
  }
  const gone = async (loc) => {
    await settle(page, 800)
    return (await loc.count()) === 0
  }
  const pickCustom = () => picker.getByRole('button', { name: /스크린샷용/ }).first().click()
  const tapOutside = () => page.mouse.click(page.viewportSize().width / 2, 20)

  // 1. 시트 교체
  try {
    await openPicker()
    await pickCustom()
    await line.waitFor({ timeout: 3000 })
    await settle(page, 500)
    const swapped = (await line.count()) === 1 && (await picker.count()) === 0
    await line.getByRole('button', { name: '닫기', exact: true }).click()
    const closed = await gone(page.locator('dialog[open], [role="dialog"]').filter({ visible: true }))
    const after = await page.evaluate(() => {
      const inert = ['html', 'body', '#root'].some((s) => document.querySelector(s)?.hasAttribute('inert'))
      const save = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '저장')
      let hit = false
      if (save) {
        const r = save.getBoundingClientRect()
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        hit = el !== null && save.contains(el)
      }
      window.scrollTo(0, 300)
      return { inert, hit, scrolls: window.scrollY > 0 }
    })
    flow('시트 교체', swapped && closed && !after.inert && after.hit && after.scrolls,
      `교체 ${swapped} · 닫힘 ${closed} · inert ${after.inert} · 저장 가운데 ${after.hit} · 스크롤 ${after.scrolls}`)
  } catch (e) {
    flow('시트 교체', false, String(e.message).split('\n')[0])
  }

  // 2. 바깥 탭
  try {
    await page.evaluate(() => window.scrollTo(0, 0))
    await openPicker()
    await tapOutside()
    const listClosed = await gone(picker)
    await openPicker()
    await picker.getByRole('button', { name: '＋ 새 종목 만들기', exact: true }).click()
    await settle(page, 500)
    await tapOutside()
    await settle(page, 800)
    const formStays = (await picker.count()) === 1
    await picker.getByRole('button', { name: '뒤로', exact: true }).click()
    await settle(page, 500)
    await tapOutside()
    const backClosed = await gone(picker)
    flow('바깥 탭', listClosed && formStays && backClosed, `목록 닫힘 ${listClosed} · 폼 유지 ${formStays} · 뒤로 후 닫힘 ${backClosed}`)
    if ((await picker.count()) > 0) await picker.getByRole('button', { name: '닫기', exact: true }).click().catch(() => {})
  } catch (e) {
    flow('바깥 탭', false, String(e.message).split('\n')[0])
  }

  // 3. 편집 → 뒤로 → 고르기
  try {
    await openPicker()
    await picker.getByRole('button', { name: '편집', exact: true }).first().click()
    await page.getByText('내 종목 편집', { exact: true }).waitFor({ timeout: 3000 })
    await picker.getByRole('button', { name: '뒤로', exact: true }).click()
    await picker.getByLabel('종목 검색', { exact: true }).waitFor({ timeout: 3000 })
    await pickCustom()
    await line.waitFor({ timeout: 3000 })
    flow('편집 → 뒤로 → 고르기', true, '목록 복귀 · 줄 시트 열림')
    await line.getByRole('button', { name: '닫기', exact: true }).click()
    await settle(page, 800)
  } catch (e) {
    flow('편집 → 뒤로 → 고르기', false, String(e.message).split('\n')[0])
  }

  // 4. 긴 검색어
  try {
    await openPicker()
    const search = picker.getByLabel('종목 검색', { exact: true })
    await search.fill('x'.repeat(40))
    await settle(page, 300)
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    const empty = await page.getByText('맞는 종목이 없습니다.').isVisible()
    await search.fill('')
    await settle(page, 300)
    const back = await picker.getByRole('button', { name: /스크린샷용/ }).first().isVisible()
    flow('긴 검색어', noOverflow && empty && back, `가로 넘침 없음 ${noOverflow} · 안내 ${empty} · 지우면 목록 ${back}`)
    await picker.getByRole('button', { name: '닫기', exact: true }).click().catch(() => {})
  } catch (e) {
    flow('긴 검색어', false, String(e.message).split('\n')[0])
  }
}

// ───────────────────────── 본체 ─────────────────────────
console.log('npm run build …')
execSync('npm run build', { cwd: ROOT, stdio: 'ignore' })
const port = await freePort()
runContext.port = port
const server = await preview({ root: ROOT, preview: { port, strictPort: true, host: 'localhost' }, logLevel: 'silent' })
const browser = await chromium.launch()
let exitCode = 0
try {
  mkdirSync(OUT, { recursive: true })
  const shots = { dark: [], light: [] }
  let flowPage = null
  for (const vp of VIEWPORTS) {
    for (const scheme of ['dark', 'light']) {
      const { ctx, page } = await runContext(browser, vp, scheme, shots[scheme])
      if (phase === 'after' && CHECK && vp.tag === '' && scheme === 'dark') flowPage = { ctx, page }
      else await ctx.close()
    }
  }

  // 저장
  const file = (s) => join(OUT, `${phase}-${s.name}-${s.scheme}${s.tag}.png`)
  for (const s of shots.dark) writeFileSync(file(s), s.buf)
  if (phase === 'after') {
    for (const s of shots.light) writeFileSync(file(s), s.buf)
  } else {
    // before: 다크 고정이라 라이트와 같아야 한다. 같지 않으면 스크립트가 틀린 것이다
    for (const l of shots.light) {
      const d = shots.dark.find((x) => x.name === l.name && x.tag === l.tag)
      if (!d || !d.buf.equals(l.buf)) {
        console.error(`✗ before 라이트가 다크와 다르다: ${l.name}${l.tag}`)
        writeFileSync(file(l), l.buf) // 눈으로 볼 수 있게 남긴다
        exitCode = 1
      }
      else {
        const p = file(l)
        if (existsSync(p)) rmSync(p)
      }
    }
  }
  console.log(`스크린샷 ${shots.dark.length + (phase === 'after' ? shots.light.length : 0)}장 → docs/screenshots/v1.17/`)

  if (CHECK) {
    const failed = printResults()
    if (failed > 0) exitCode = 1
    if (flowPage) {
      await runFlows(flowPage.page)
      await flowPage.ctx.close()
      console.log('\n| 흐름 검사 | 결과 | 상세 |\n|---|---|---|')
      for (const f of flows) console.log(`| ${f.name} | ${f.ok ? '✓' : '✗'} | ${f.detail} |`)
      if (flows.some((f) => !f.ok)) exitCode = 1
    }
  }
} finally {
  await browser.close()
  await server.close()
}
process.exit(exitCode)
