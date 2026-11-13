/**
 * QQ4 여백 한 벌 — ui-check.mjs가 쓰는 정적 검사와 장면 사이 비교.
 * 장면 하나의 계산된 여백 격자(`inPageSpacing`)는 ui-check-lib.mjs에 있다.
 */

const STEPS = new Set([0, 2, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48])
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** 정적 검사: global.css 여백 값이 Astryx 단계에 든다 · 틀의 좌우가 --inset-을 쓴다 · space.css 토큰 순서 */
export function spaceStaticChecks(allCss) {
  const out = []
  const add = (name, ok, detail) => out.push({ name, ok, detail })
  const g = allCss['styles/global.css']
  const ax = allCss['ax/ax.css']
  const sp = allCss['styles/space.css']
  const idx = allCss['styles/index.css']
  add('space.css가 index.css에 layer(legacy)로 import', !!idx && /@import\s+['"]\.\/space\.css['"]\s+layer\(legacy\)/.test(idx), idx ? 'layer(legacy)' : 'index.css 없음')
  if (g === undefined) return [...out, { name: 'global.css 있음', ok: false, detail: '없음' }]
  // 1. 여백 선언의 px 숫자가 단계 안 (1px는 그 줄에 이유 주석이 있을 때만)
  const bad = []
  for (const [i, line] of g.split('\n').entries()) {
    const m = line.match(/^\s*(?:margin|padding|gap|row-gap|column-gap)[a-z-]*:\s*([^;]*);(.*)$/)
    if (!m) continue
    for (const n of m[1].matchAll(/(?<![\w.#-])(\d+(?:\.\d+)?)px/g)) {
      const v = Number(n[1])
      if (STEPS.has(v)) continue
      if (v === 1 && /\/\*.+\*\//.test(m[2])) continue
      bad.push(`${i + 1}행 ${v}px`)
    }
  }
  add('global.css 여백 값이 전부 Astryx 단계(0·2·4·6·8·12·16·20·24·28·32·36·40·44·48)', bad.length === 0, bad.length ? bad.slice(0, 6).join(' · ') + (bad.length > 6 ? ` 외 ${bad.length - 6}` : '') : '단계 밖 0건')
  // 2. 틀의 좌우 여백이 var(--inset-
  const body = (css, sel) => (css === undefined ? null : (strip(css).match(new RegExp(`(?:^|\\n)\\s*${sel.replace('.', '\\.')}\\s*\\{([^{}]*)\\}`))?.[1] ?? null))
  const miss = ['.screen', '.card', '.sheet'].filter((s) => !/var\(--inset-/.test(body(g, s) ?? ''))
  const axBody = ax === undefined ? null : (strip(ax).match(/\.ax-screen\s*\{([^{}]*)\}/)?.[1] ?? null)
  if (!/var\(--inset-/.test(axBody ?? '')) miss.push('.ax-screen')
  add('.screen·.ax-screen·.card·.sheet의 좌우 여백이 var(--inset-)', miss.length === 0, miss.length ? `안 씀: ${miss.join(', ')}` : '넷 다 씀')
  add('.ax-screen 좌우가 --inset-screen (두 체계가 같은 값)', /var\(--inset-screen\)/.test(axBody ?? ''), /var\(--inset-screen\)/.test(axBody ?? '') ? 'var(--inset-screen)' : '안 씀')
  // 3. space.css 토큰 값 순서
  if (sp === undefined) return [...out, { name: 'space.css 있음', ok: false, detail: '없음' }]
  const t = {}
  for (const m of strip(sp).matchAll(/--([\w-]+)\s*:\s*(\d+)px/g)) t[m[1]] = Number(m[2])
  const need = ['space-tight', 'space-inline', 'space-row', 'space-group', 'space-card', 'space-section', 'inset-screen', 'inset-card']
  const lack = need.filter((k) => t[k] === undefined)
  const orderOk = lack.length === 0 && t['space-tight'] < t['space-row'] && t['space-row'] < t['space-group'] && t['space-group'] <= t['space-card'] && t['space-card'] < t['space-section']
  const stepOk = lack.length === 0 && need.every((k) => STEPS.has(t[k]))
  add('space.css 토큰 여덟 개가 단계 안이고 tight < row < group ≤ card < section', orderOk && stepOk, lack.length ? `없음: ${lack.join(', ')}` : `${t['space-tight']}<${t['space-row']}<${t['space-group']}≤${t['space-card']}<${t['space-section']}`)
  return out
}

/** 장면 하나의 여백 재기 (page.evaluate용): 화면 첫 줄 왼쪽 x · 이웃한 .card 사이 세로 간격 · 시트 안 첫 글자의 시트 왼쪽에서 떨어진 거리 */
export const inPageLayout = () => {
  const vis = (el) => window.__vis(el)
  const half = (v) => Math.round(v * 2) / 2
  const res = { screenX: null, cardGaps: [], sheetInset: null }
  const sheet = [...document.querySelectorAll('.sheet, .astryx-bottom-sheet')].find(vis)
  if (sheet) {
    const sr = sheet.getBoundingClientRect()
    const w = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim() || !n.parentElement || !vis(n.parentElement)) continue
      const r = document.createRange()
      r.selectNodeContents(n)
      const rect = r.getBoundingClientRect()
      if (rect.width < 1) continue
      res.sheetInset = half(rect.left - sr.left - sheet.clientLeft) // 테두리(Astryx 시트 1px)는 여백이 아니다
      break
    }
    return res
  }
  const frame = [...document.querySelectorAll('.screen, .ax-screen, .session-body')].find(vis)
  if (!frame) return res
  const first = frame.querySelector('.card') ?? [...frame.children].find(vis)
  if (first) res.screenX = half(first.getBoundingClientRect().left)
  const cards = [...frame.querySelectorAll('.card')].filter(vis)
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].previousElementSibling !== cards[i - 1]) continue
    res.cardGaps.push(half(cards[i].getBoundingClientRect().top - cards[i - 1].getBoundingClientRect().bottom))
  }
  return res
}

/** 장면 사이 비교(`여백 한 벌`): layouts = { 장면: inPageLayout() 결과 }. [{ name, ok, detail }] */
export function spaceSetVerdicts(layouts) {
  const same = (xs) => xs.every((x) => Math.abs(x - xs[0]) < 0.5)
  const SCREENS = ['home', 'session', 'summary', 'history', 'analyze', 'diet', 'settings', 'editor']
  const SHEETS = ['sheet-finish', 'sheet-home', 'sheet-food', 'line-sheet']
  const fmt = (pairs) => pairs.map(([k, v]) => `${k} ${v}`).join(' · ')
  const x = SCREENS.filter((s) => layouts[s]?.screenX != null).map((s) => [s, layouts[s].screenX])
  const gaps = SCREENS.flatMap((s) => (layouts[s]?.cardGaps ?? []).map((g) => [s, g]))
  const gapSet = [...new Set(gaps.map((p) => p[1]))]
  const sh = SHEETS.filter((s) => layouts[s]?.sheetInset != null).map((s) => [s, layouts[s].sheetInset])
  return [
    { name: '화면 좌우', ok: x.length >= 2 && same(x.map((p) => p[1])), detail: fmt(x) || '잰 장면 없음' },
    { name: '카드 사이', ok: gaps.length > 0 && gapSet.length === 1, detail: gaps.length ? `간격 ${gapSet.join('·')}px (${[...new Set(gaps.map((p) => `${p[0]} ${p[1]}`))].join(' · ')})` : '카드가 둘 이상인 장면 없음' },
    { name: '시트 좌우', ok: sh.length >= 2 && same(sh.map((p) => p[1])), detail: fmt(sh) || '잰 장면 없음' },
  ]
}
