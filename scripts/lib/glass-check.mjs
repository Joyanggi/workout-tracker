/**
 * 유리 검사 함수 모음 (PLAN v1.18 PP0). import해도 아무것도 실행하지 않는다.
 *
 * - `inPage*` 함수는 `page.evaluate`로 브라우저 안에서 돈다. 직렬화되므로 바깥 변수를 쓰지 않고,
 *   색 계산 도우미는 `inPageInstall`이 `window.__glass`에 먼저 깔아 둔다.
 * - `staticChecks`는 Node에서 CSS 소스 글자를 읽어 규칙이 있는지 본다(vitest는 .css를 빈 문자열로 읽는다).
 * - 판정 모양은 모두 `{ ok, detail }`. 하위 항목이 있으면 `{ ok, detail, parts: [{ name, ok, detail }] }`.
 */
import { createServer } from 'node:net'

/** 유리 층 선택자. 시트는 따로 */
export const BAR_SELECTOR = '.tabbar, .resume-strip, .session-header, .rest-bar'
export const SHEET_SELECTOR = '.sheet, .astryx-bottom-sheet'

/** 보이는 요소만 (크기 1px 이하·display none·visibility hidden은 뺀다). 판정은 여기 한 곳. 페이지에는 window.__vis로 깔린다 */
export const inPageVisibleDef = (el) => {
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1
}

/** addInitScript에 넘길 글: window.__vis와 window.__glass를 함께 깐다 */
export const installScript = () => `window.__vis = ${inPageVisibleDef}; (${inPageInstall})()`

/** 빈 포트 하나 (Node) */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

/** 색 도우미를 페이지에 깐다 (addInitScript 또는 evaluate로 한 번) */
export const inPageInstall = () => {
  const parse = (s) => {
    s = (s ?? '').trim()
    if (s === '' || s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
    let m = s.match(/^rgba?\(([^)]+)\)$/)
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? (Number.parseFloat(x) / 100) : Number.parseFloat(x)))
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    m = s.match(/^color\(srgb ([^)]+)\)$/)
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number.parseFloat)
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }
    }
    m = s.match(/^#([0-9a-f]{3,8})$/i)
    if (m) {
      let h = m[1]
      if (h.length <= 4) h = [...h].map((c) => c + c).join('')
      const n = (i) => Number.parseInt(h.slice(i, i + 2), 16)
      return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
    }
    throw new Error(`색을 못 읽는다: ${s}`)
  }
  /** sRGB 채널별 α·위 + (1−α)·아래. 결과 알파는 1(아래가 불투명이라고 본다) */
  const over = (top, under) => ({
    r: top.a * top.r + (1 - top.a) * under.r,
    g: top.a * top.g + (1 - top.a) * under.g,
    b: top.a * top.b + (1 - top.a) * under.b,
    a: 1,
  })
  const lum = (c) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const bg = (el, pseudo) => parse(getComputedStyle(el, pseudo).backgroundColor)
  const filterOf = (el) => {
    const cs = getComputedStyle(el)
    const v = cs.backdropFilter && cs.backdropFilter !== '' ? cs.backdropFilter : cs.webkitBackdropFilter
    return v && v !== '' ? v : 'none'
  }
  const visible = (el) => window.__vis(el)
  const fmt = (c) => `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${(+c.a.toFixed(3))})`
  const cssVar = (name) => parse(getComputedStyle(document.documentElement).getPropertyValue(name))
  const sheetOf = () => [...document.querySelectorAll('.sheet, .astryx-bottom-sheet')].find(visible) ?? null
  /** 시트 막: legacy는 .sheet-backdrop의 배경, Astryx는 dialog의 ::backdrop 배경 */
  const backdropOf = (sheet) => {
    if (sheet.matches('.sheet')) {
      const b = sheet.closest('.sheet-backdrop')
      return b ? { color: bg(b), kind: 'legacy' } : null
    }
    const d = sheet.closest('dialog') ?? sheet
    return { color: bg(d, '::backdrop'), kind: 'astryx' }
  }
  /** 지금 화면의 유리 층 요소들. all이 거짓이고 시트가 떠 있으면 시트만(아래 띠는 한 겹 규칙으로 꺼진다) */
  const layersOf = (all) => {
    const sheet = sheetOf()
    const bars = [...document.querySelectorAll('.tabbar, .resume-strip, .session-header, .rest-bar')].filter(visible)
    return all ? [...bars, ...(sheet ? [sheet] : [])] : sheet ? [sheet] : bars
  }
  /** 흐림 값의 brightness(b). 없으면 1 (v1.19 QQ1: 뒤 밝기를 낮춰 비치는 양을 늘린다 — 비침·대비 계산에 곱한다) */
  const brightnessOf = (el) => {
    const m = filterOf(el).match(/brightness\(([\d.]+)(%?)\)/)
    return m ? Number.parseFloat(m[1]) / (m[2] ? 100 : 1) : 1
  }
  const scale = (c, k) => ({ r: c.r * k, g: c.g * k, b: c.b * k, a: c.a })
  window.__glass = { parse, over, ratio, bg, filterOf, visible, fmt, cssVar, sheetOf, backdropOf, layersOf, brightnessOf, scale }
}

/** 유리 켜짐 */
export const inPageGlassOn = () => {
  const g = window.__glass
  const layers = g.layersOf(false)
  if (layers.length === 0) return { ok: false, detail: '유리 층이 없다' }
  const bad = []
  const seen = []
  for (const el of layers) {
    const name = el.className.toString().split(' ')[0]
    const f = g.filterOf(el)
    const a = g.bg(el).a
    seen.push(`${name} ${f === 'none' ? 'filter 없음' : 'filter'} α${+a.toFixed(2)}`)
    if (f === 'none') bad.push(`${name} backdrop-filter 없음`)
    if (a >= 1) bad.push(`${name} 배경 알파 ${+a.toFixed(2)}`)
    if (el.matches('.astryx-bottom-sheet')) {
      const r = el.getBoundingClientRect()
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const upto = stack.slice(0, stack.indexOf(el))
      // 가운데 점이 입력칸 위면 칸 자체의 면(.astryx-text-input 등)은 의도한 불투명이다 — 시트 안쪽이 면을 칠하는 것이 아니다
      const opaque = upto.filter((x) => g.bg(x).a > 0 && !x.matches('input, textarea, [class*="astryx-text-input"], [class*="astryx-number-input"]'))
      if (opaque.length > 0) bad.push(`${name} 안쪽이 면을 칠한다: ${opaque.map((x) => x.tagName.toLowerCase() + '.' + x.className.toString().split(' ')[0]).slice(0, 3).join(', ')}`)
    }
  }
  return { ok: bad.length === 0, detail: bad.length ? bad.join(' · ') : seen.join(' · ') }
}

/** 내용은 불투명 */
export const inPageContentOpaque = () => {
  const g = window.__glass
  const bad = []
  let n = 0
  for (const el of document.querySelectorAll('input, textarea, .stepper, .set-row')) {
    if (!g.visible(el)) continue
    if (['checkbox', 'radio', 'hidden'].includes(el.type)) continue
    n++
    // 조상을 거슬러 올라가며 면의 알파를 쌓는다. 반투명 면(.set-row의 0.07 등)은 아래 불투명 면이 받쳐 주면 괜찮다.
    // 유리 층(backdrop-filter가 켜진 요소)에 닿으면 멈춘다 — 그 면 뒤로는 화면 내용이 비치므로 받침이 못 된다.
    let see = 1
    let cur = el
    while (cur && see >= 0.005) {
      if (cur !== el && g.filterOf(cur) !== 'none') break
      see *= 1 - g.bg(cur).a
      cur = cur.parentElement
    }
    if (see >= 0.005) bad.push(`${el.tagName.toLowerCase()}${el.className ? '.' + el.className.toString().split(' ')[0] : ''} 비침 ${+see.toFixed(2)}`)
  }
  if (n === 0) return { skip: true, detail: '입력칸·스테퍼·세트 줄이 없다' }
  return { ok: bad.length === 0, detail: bad.slice(0, 4).join(' · ') + (bad.length > 4 ? ` 외 ${bad.length - 4}` : '') || `${n}개 불투명` }
}

/** 한 겹: 5×12 격자 점마다 backdrop-filter가 켜진 겹친 요소가 1개 이하 */
export const inPageOneLayer = () => {
  const g = window.__glass
  let worst = 0
  const bad = []
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 12; j++) {
      const x = ((i + 0.5) / 5) * innerWidth
      const y = ((j + 0.5) / 12) * innerHeight
      const on = document.elementsFromPoint(x, y).filter((e) => g.filterOf(e) !== 'none')
      worst = Math.max(worst, on.length)
      if (on.length > 1) bad.push(`(${Math.round(x)},${Math.round(y)}) ${on.map((e) => e.className.toString().split(' ')[0] || e.tagName.toLowerCase()).join('+')}`)
    }
  }
  return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join(' · ') + (bad.length > 3 ? ` 외 ${bad.length - 3}점` : '') : `점당 최대 ${worst}겹` }
}

/** 유리 끄기: 흉내를 건 뒤에 부른다. 유리 층 전부가 filter 없음 + 배경 알파 1 */
export const inPageGlassOff = (feature) => {
  const g = window.__glass
  const layers = g.layersOf(true)
  if (layers.length === 0) return { ok: false, detail: '유리 층이 없다' }
  const bad = layers
    .map((el) => ({ name: el.className.toString().split(' ')[0], f: g.filterOf(el), a: g.bg(el).a }))
    .filter((x) => x.f !== 'none' || x.a < 1)
    .map((x) => `${x.name} ${x.f !== 'none' ? 'filter 남음' : ''} α${+x.a.toFixed(2)}`)
  const matches = matchMedia(`(${feature})`).matches
  return { ok: bad.length === 0, matches, detail: bad.join(' · ') || `${layers.length}층 꺼짐` }
}

/** 글자 대비 (띠 안의 글자, 시트 장면에서는 시트 면에 바로 놓인 글자) */
export const inPageTextContrast = () => {
  const g = window.__glass
  const sheet = g.sheetOf()
  const accent = g.cssVar('--accent')
  const okC = g.cssVar('--ok')
  const roots = sheet ? [sheet] : [...document.querySelectorAll('.tabbar, .resume-strip, .session-header, .rest-bar')].filter(g.visible)
  if (roots.length === 0) return { skip: true, detail: '재볼 면이 없다' }
  const bad = []
  let n = 0
  let min = Infinity
  for (const root of roots) {
    // 뒤 밝기: 흐림 값의 brightness(b)가 뒤(막까지 합성한 색)에 곱해진다
    const bright = g.brightnessOf(root)
    const base = (under) => {
      let c = g.bg(root)
      if (sheet) {
        const b = g.backdropOf(root)
        const behind = b ? g.over(b.color, under) : under
        return g.over(c, g.scale(behind, bright))
      }
      return g.over(c, g.scale(under, bright))
    }
    for (const el of root.querySelectorAll('*')) {
      if (!g.visible(el)) continue
      if (el.disabled || el.closest('[disabled], [aria-hidden="true"]')) continue
      if (![...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim() !== '')) continue
      // 글자에서 root까지 거슬러 올라가며 불투명 면을 만나면 그 색이 바탕이다
      let face = null
      for (let cur = el; cur && cur !== root; cur = cur.parentElement) {
        const c = g.bg(cur)
        if (c.a >= 1) {
          face = c
          break
        }
      }
      // 시트 장면은 면에 바로 놓인 글자만 잰다(자기 면이 있는 버튼 안 글자는 시트와 무관하다)
      if (sheet && face) continue
      const cs = getComputedStyle(el)
      const fg = g.parse(cs.color)
      const size = Number.parseFloat(cs.fontSize)
      const need = size >= 24 && Number.parseInt(cs.fontWeight, 10) >= 700 ? 3 : 4.5
      // 지금 탭 글자는 알약(::before) 위에 한 번 더 합성한 색이 바탕이다
      const pillBtn = el.closest('button[aria-current="page"]')
      const onPill = (c) => (pillBtn && !sheet ? g.over(g.bg(pillBtn, '::before'), c) : c)
      const unders = face ? [['면', face]] : [['accent', onPill(base(accent))], ['ok', onPill(base(okC))]]
      for (const [label, under] of unders) {
        const r = g.ratio(fg.a < 1 ? g.over(fg, under) : fg, under)
        n++
        min = Math.min(min, r)
        if (r < need) bad.push(`"${el.textContent.trim().slice(0, 10)}" ${r.toFixed(2)}:1 (${label} 위, 기준 ${need})`)
      }
    }
  }
  if (n === 0) return { skip: true, detail: '글자가 없다' }
  return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join(' · ') + (bad.length > 3 ? ` 외 ${bad.length - 3}` : '') : `${n}건 최소 ${min.toFixed(2)}:1` }
}

/** 띠 비침 (v1.19 QQ1): 띠마다 보이는 비침 (1 − 띠 배경 알파) × brightness ≥ 0.30. 알파만 보면 brightness를 낮춰도 지표가 그대로라 곱한다 */
export const inPageBarShow = () => {
  const g = window.__glass
  // 시트가 떠 있으면 한 겹 규칙이 아래 띠를 불투명으로 바꾼다 — 그때는 시트 비침이 잰다
  const bars = g.sheetOf() ? [] : [...document.querySelectorAll('.tabbar, .resume-strip, .session-header, .rest-bar')].filter(g.visible)
  if (bars.length === 0) return { skip: true, detail: '띠가 없다(또는 시트가 떠 있다)' }
  const bad = []
  const seen = []
  for (const el of bars) {
    const name = el.className.toString().split(' ')[0]
    const a = g.bg(el).a
    const b = g.brightnessOf(el)
    const show = (1 - a) * b
    seen.push(`${name} (1−${+a.toFixed(2)})×${b}=${show.toFixed(3)}`)
    if (show < 0.3 - 1e-9) bad.push(`${name} ${show.toFixed(3)}`)
  }
  return { ok: bad.length === 0, detail: (bad.length ? bad.join(' · ') + ' (기준 0.30 이상) ' : '') + seen.join(' · ') }
}

/** 시트 비침: (1 − 시트 알파) × (1 − 막 알파) × brightness ≥ 0.15. legacy·Astryx 라이트·다크 같은 기준 (라이트 Astryx는 brightness 1) */
export const inPageSheetShow = () => {
  const g = window.__glass
  const sheet = g.sheetOf()
  if (!sheet) return { skip: true, detail: '시트가 없다' }
  const b = g.backdropOf(sheet)
  const sa = g.bg(sheet).a
  const ba = b ? b.color.a : 0
  const br = g.brightnessOf(sheet)
  const show = (1 - sa) * (1 - ba) * br
  const text = `시트 α${+sa.toFixed(3)} · 막 α${+ba.toFixed(3)} · 밝기 ${br} → 비침 ${show.toFixed(3)}`
  return { ok: show >= 0.15 - 1e-9, detail: `${text} (기준 0.15 이상)` }
}

/**
 * 알약 구별 (v1.19 QQ1): 지금 탭 알약 합성색과 띠 합성색의 대비 ≥ 1.2:1 — 뒤가 카드색일 때와 주황일 때 둘 다.
 * 대비로 못 채우면 알약에 테두리(--glass-highlight)를 두어 채운다: 테두리가 있으면(너비 > 0, 알파 > 0) 통과로 본다.
 */
export const inPagePillSeparation = () => {
  const g = window.__glass
  const btn = document.querySelector('.tabbar button[aria-current="page"]')
  const bar = document.querySelector('.tabbar')
  if (!btn || !bar || !g.visible(bar)) return { skip: true, detail: '지금 탭 알약이 없다' }
  const pill = g.bg(btn, '::before')
  const pcs = getComputedStyle(btn, '::before')
  const border = Number.parseFloat(pcs.borderTopWidth) > 0 && g.parse(pcs.borderTopColor).a > 0
  const bright = g.brightnessOf(bar)
  const parts = []
  let ok = true
  for (const [label, under] of [['카드색', g.cssVar('--surface')], ['주황', g.cssVar('--accent')]]) {
    const face = g.over(g.bg(bar), g.scale(under, bright))
    const r = g.ratio(g.over(pill, face), face)
    parts.push(`${label} ${r.toFixed(2)}:1`)
    if (r < 1.2 && !border) ok = false
  }
  return { ok, detail: parts.join(' · ') + (border ? ' · 알약에 테두리 있음' : ' · 알약에 테두리 없음 (기준 1.2:1)') }
}

/** 탭바 자리 (하위 항목). scene은 'home' 계열만 가림을 잰다 */
export const inPageTabbarSpot = (measureCover) => {
  const g = window.__glass
  const bar = document.querySelector('.tabbar')
  if (!bar) return { skip: true, detail: '탭바가 없다' }
  const strip = document.querySelector('.resume-strip')
  const r = bar.getBoundingClientRect()
  const parts = []
  const gaps = { 좌: r.left, 우: innerWidth - r.right, 아래: innerHeight - r.bottom }
  const tight = Object.entries(gaps).filter(([, v]) => v < 8)
  parts.push({
    name: '좌·우·아래 8px',
    ok: tight.length === 0,
    detail: `좌 ${Math.round(gaps.좌)} · 우 ${Math.round(gaps.우)} · 아래 ${Math.round(gaps.아래)}`,
  })
  const small = [...bar.querySelectorAll('button')].map((b) => b.getBoundingClientRect()).filter((x) => x.width < 44 || x.height < 44)
  const count = bar.querySelectorAll('button').length
  parts.push({
    name: '탭 버튼 44px',
    ok: count === 5 && small.length === 0,
    detail: `${count}개 · 작은 것 ${small.map((x) => `${Math.round(x.width)}×${Math.round(x.height)}`).join(',') || '없음'}`,
  })
  if (strip) {
    const s = strip.getBoundingClientRect()
    const apart = s.bottom <= r.top + 0.5 || r.bottom <= s.top + 0.5 || s.right <= r.left + 0.5 || r.right <= s.left + 0.5
    parts.push({ name: '스트립·탭바 안 겹침', ok: apart, detail: `스트립 아래 ${Math.round(s.bottom)} · 탭바 위 ${Math.round(r.top)}` })
  }
  if (measureCover) {
    const screen = document.querySelector('.screen')
    const last = screen?.lastElementChild
    if (!last) parts.push({ name: '가림', ok: false, detail: '.screen의 마지막 자식을 못 찾았다' })
    else {
      const top = (strip ?? bar).getBoundingClientRect().top
      const bottom = last.getBoundingClientRect().bottom
      parts.push({ name: '가림', ok: bottom < top, detail: `마지막 내용 아래 ${Math.round(bottom)} · ${strip ? '스트립' : '탭바'} 위 ${Math.round(top)}${bottom >= top ? ` (${Math.round(bottom - top)}px 가림)` : ''}` })
    }
  }
  const bad = parts.filter((p) => !p.ok)
  return { ok: bad.length === 0, detail: parts.map((p) => `${p.name} ${p.ok ? '✓' : '✗'}(${p.detail})`).join(' · '), parts }
}

/** 가로 넘침 */
export const inPageOverflow = () => ({
  ok: document.documentElement.scrollWidth <= innerWidth,
  detail: `scrollWidth ${document.documentElement.scrollWidth} / ${innerWidth}`,
})

// ───────────────────────── 정적 검사 (Node) ─────────────────────────

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** `{` 짝을 맞춰 헤더 뒤 블록 본문을 돌려준다. 못 찾으면 null */
const blockAfter = (css, headerRe) => {
  const m = headerRe.exec(css)
  if (!m) return null
  const open = css.indexOf('{', m.index)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return { header: css.slice(m.index, open).trim(), body: css.slice(open + 1, i) }
  }
  return null
}

/** 규칙 목록 [{ sel, body }]. @media 같은 중첩은 안쪽 규칙만 나온다 */
const rulesOf = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }))
const declsOf = (body, prop) => [...body.matchAll(new RegExp(`(?:^|[;\\s])(${prop})\\s*:\\s*([^;}]+)`, 'g'))].map((m) => m[2].trim())
const squashWs = (s) => s.replace(/\s+/g, '')

/**
 * @param {{ globalCss: string, axCss: string, glassCss: string | null, allCss?: Record<string, string> }} src CSS 소스 글자
 * @returns {{ name: string, ok: boolean, detail: string }[]}
 */
export function staticChecks(src) {
  const out = []
  const g = stripComments(src.globalCss)
  const a = stripComments(src.axCss)
  const gl = src.glassCss === null ? null : stripComments(src.glassCss)
  const add = (name, ok, detail) => out.push({ name, ok, detail })

  // 1. global.css·ax.css: none 말고 없다 (ax.css의 .astryx-bottom-sheet 규칙은 예외)
  const bd = (css, file, except) =>
    rulesOf(css).flatMap((r) => ['-webkit-backdrop-filter', 'backdrop-filter'].flatMap((p) => declsOf(r.body, p).map((v) => ({ file, sel: r.sel, v, ok: v === 'none' || (except && r.sel.includes('.astryx-bottom-sheet')) }))))
  const stray = [...bd(g, 'global.css', false), ...bd(a, 'ax.css', true)].filter((d) => !d.ok)
  add('global.css·ax.css에 backdrop-filter는 none뿐(ax.css .astryx-bottom-sheet 규칙 예외)', stray.length === 0, stray.length ? stray.slice(0, 3).map((d) => `${d.file} ${d.sel}: ${d.v}`).join(' · ') : '없음')

  // 2. 프로젝트 CSS 전체: backdrop-filter 값에 var( 0건
  const all = src.allCss ?? { 'global.css': src.globalCss, 'ax.css': src.axCss, ...(src.glassCss === null ? {} : { 'glass.css': src.glassCss }) }
  const withVar = Object.entries(all).flatMap(([file, css]) =>
    rulesOf(stripComments(css)).flatMap((r) => ['-webkit-backdrop-filter', 'backdrop-filter'].flatMap((p) => declsOf(r.body, p).filter((v) => v.includes('var(')).map((v) => `${file} ${r.sel}: ${v}`))),
  )
  add('backdrop-filter 값에 var( 0건 (src/**/*.css 전체)', withVar.length === 0, withVar.length ? withVar.slice(0, 3).join(' · ') : `${Object.keys(all).length}개 파일 0건`)

  // 3. 같은 규칙 안 두 접두사 값이 글자 그대로 같다
  const mism = Object.entries(all).flatMap(([file, css]) =>
    rulesOf(stripComments(css)).flatMap((r) => {
      const w = declsOf(r.body, '-webkit-backdrop-filter')
      const p = declsOf(r.body, 'backdrop-filter')
      if (w.length === 0 && p.length === 0) return []
      return w.length === 1 && p.length === 1 && w[0] === p[0] ? [] : [`${file} ${r.sel}`]
    }),
  )
  add('같은 규칙의 -webkit-backdrop-filter와 backdrop-filter 값이 같다', mism.length === 0, mism.length ? mism.slice(0, 3).join(' · ') : '모든 규칙 같다')

  if (gl === null) {
    add('glass.css 있음', false, 'src/styles/glass.css가 없다')
    return out
  }

  // 4. 시트 흐림: glass.css .sheet = ax.css 다크, 라이트 = 다크에서 brightness 항만 뺀 것
  const glSheet = rulesOf(gl).find((r) => r.sel === '.sheet' && declsOf(r.body, 'backdrop-filter').length)
  const glSheetV = glSheet ? declsOf(glSheet.body, 'backdrop-filter')[0] : null
  const axSheetVals = rulesOf(a)
    .filter((r) => r.sel.includes('.astryx-bottom-sheet'))
    .flatMap((r) => declsOf(r.body, 'backdrop-filter'))
    .filter((v) => v !== 'none')
  const dark = axSheetVals.find((v) => v.includes('brightness('))
  const light = axSheetVals.find((v) => !v.includes('brightness('))
  const strip = (v) => v.replace(/\s*brightness\([^)]*\)/g, '').trim()
  add('시트 흐림: glass.css = ax.css 다크 (글자 그대로)', glSheetV !== null && dark !== undefined && glSheetV === dark, `glass ${glSheetV ?? '없음'} / ax 다크 ${dark ?? '없음'}`)
  add('Astryx 라이트 시트 흐림 = 다크에서 brightness만 뺀 것', dark !== undefined && light !== undefined && light === strip(dark), `다크 ${dark ?? '없음'} → 라이트 ${light ?? 'brightness 없는 값이 없다'}`)

  // 5. 막: glass.css --glass-scrim 알파 = ax.css 바텀 시트 ::backdrop 알파
  const scrimA = gl.match(/--glass-scrim:\s*rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/)?.[1]
  const axScrim = rulesOf(a).find((r) => r.sel === 'dialog:has(.astryx-bottom-sheet)::backdrop' && /rgba\(0, 0, 0, ([\d.]+)\)/.test(r.body))
  const axScrimA = axScrim?.body.match(/rgba\(0, 0, 0, ([\d.]+)\)/)?.[1]
  add('막 농도: glass.css --glass-scrim = ax.css 바텀 시트 ::backdrop', scrimA !== undefined && scrimA === axScrimA, `glass ${scrimA ?? '없음'} / ax ${axScrimA ?? '없음'}`)

  // 6. 규칙 어휘
  const need = ['prefers-reduced-transparency', 'prefers-contrast', ':has(']
  const missing = need.filter((k) => !gl.includes(k))
  add('glass.css 규칙 어휘', missing.length === 0, missing.length ? `없음: ${missing.join(', ')}` : need.join(' · '))

  // 7. 끄기 블록 넷 (glass.css 둘, ax.css 둘)
  const gm = blockAfter(gl, /@media[^{]*prefers-reduced-transparency/)
  const gs = blockAfter(gl, /@supports\s+not/)
  const am = blockAfter(a, /@media[^{]*prefers-reduced-transparency/)
  const as = blockAfter(a, /@supports\s+not/)
  add('끄기 @media에 대비 증가 포함', gm !== null && gm.header.includes('prefers-contrast'), gm ? gm.header.replace(/\s+/g, ' ') : '@media 블록이 없다')
  const pairSame = (x, y) => x !== null && y !== null && squashWs(x.body) === squashWs(y.body)
  add('끄기 블록 쌍: glass.css 둘 선언 같음 · ax.css 둘 선언 같음', pairSame(gm, gs) && pairSame(am, as), `glass ${pairSame(gm, gs) ? '같다' : '다르다/없음'} · ax ${pairSame(am, as) ? '같다' : '다르다/없음'}`)
  const hdr = (b) => (b ? squashWs(b.header) : null)
  add('끄기 블록 넷의 미디어·지원 조건이 같다', gm !== null && hdr(gm) === hdr(am) && hdr(gs) === hdr(as) && hdr(gs) !== null, `@media ${hdr(gm) === hdr(am) ? '같다' : '다르다'} · @supports ${hdr(gs) === hdr(as) ? '같다' : '다르다'}`)

  // 8. 알약 테두리 (대비로 못 채운 구별을 테두리로 채운다)
  const pillRule = rulesOf(g).find((r) => r.sel.includes("aria-current='page']::before") || r.sel.includes('aria-current="page"]::before'))
  const pillBorder = pillRule ? declsOf(pillRule.body, 'border').some((v) => v.includes('var(--glass-highlight)')) : false
  add('지금 탭 알약에 --glass-highlight 테두리가 있다', pillBorder, pillRule ? (pillBorder ? 'border: … var(--glass-highlight)' : '테두리 선언 없음') : '알약 규칙을 못 찾았다')
  return out
}
