/**
 * 유리 검사 함수 모음 (PLAN v1.18 PP0). import해도 아무것도 실행하지 않는다.
 *
 * - `inPage*` 함수는 `page.evaluate`로 브라우저 안에서 돈다. 직렬화되므로 바깥 변수를 쓰지 않고,
 *   색 계산 도우미는 `inPageInstall`이 `window.__glass`에 먼저 깔아 둔다.
 * - `staticChecks`는 Node에서 CSS 소스 글자를 읽어 규칙이 있는지 본다(vitest는 .css를 빈 문자열로 읽는다).
 * - 판정 모양은 모두 `{ ok, detail }`. 하위 항목이 있으면 `{ ok, detail, parts: [{ name, ok, detail }] }`.
 */

/** 유리 층 선택자. 시트는 따로 */
export const BAR_SELECTOR = '.tabbar, .resume-strip, .session-header, .rest-bar'
export const SHEET_SELECTOR = '.sheet, .astryx-bottom-sheet'

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
  const visible = (el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1
  }
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
  window.__glass = { parse, over, ratio, bg, filterOf, visible, fmt, cssVar, sheetOf, backdropOf, layersOf }
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
      const opaque = upto.filter((x) => g.bg(x).a > 0)
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
    const base = (under) => {
      let c = g.bg(root)
      if (sheet) {
        const b = g.backdropOf(root)
        const behind = b ? g.over(b.color, under) : under
        return g.over(c, behind)
      }
      return g.over(c, under)
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
      const unders = face ? [['면', face]] : [['accent', base(accent)], ['ok', base(okC)]]
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

/** 시트 비침: (1 − 시트 알파) × (1 − 막 알파). Astryx는 값만 찍는다 */
export const inPageSheetShow = () => {
  const g = window.__glass
  const sheet = g.sheetOf()
  if (!sheet) return { skip: true, detail: '시트가 없다' }
  const b = g.backdropOf(sheet)
  const sa = g.bg(sheet).a
  const ba = b ? b.color.a : 0
  const show = (1 - sa) * (1 - ba)
  const text = `시트 α${+sa.toFixed(3)} · 막 α${+ba.toFixed(3)} → 비침 ${show.toFixed(3)}`
  if (b?.kind === 'astryx') return { ok: true, info: true, detail: `${text} (Astryx: 값만 찍는다)` }
  return { ok: show >= 0.1, detail: `${text} (기준 0.10 이상)` }
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

/**
 * @param {{ globalCss: string, axCss: string, glassCss: string | null }} src CSS 소스 글자
 * @returns {{ name: string, ok: boolean, detail: string }[]}
 */
export function staticChecks(src) {
  const out = []
  const g = stripComments(src.globalCss)
  const a = stripComments(src.axCss)
  const gl = src.glassCss === null ? null : stripComments(src.glassCss)

  const blurs = [['global.css', g], ['ax.css', a]].flatMap(([n, css]) => (css.match(/blur\(/g) ?? []).map(() => n))
  out.push({ name: 'blur( 리터럴 0건', ok: blurs.length === 0, detail: blurs.length ? `${blurs.length}건: ${[...new Set(blurs)].join(', ')}` : 'global.css·ax.css 0건' })

  const decls = [['global.css', g], ['ax.css', a]].flatMap(([n, css]) =>
    [...css.matchAll(/(?:-webkit-)?backdrop-filter\s*:\s*([^;}]+)/g)].map((m) => ({ n, v: m[1].trim() })),
  )
  const notVar = decls.filter((d) => !d.v.startsWith('var(--glass-'))
  out.push({ name: 'backdrop-filter 값이 var(--glass-…)', ok: notVar.length === 0, detail: notVar.length ? notVar.map((d) => `${d.n}: ${d.v}`).slice(0, 3).join(' · ') : `${decls.length}건 모두 var(--glass-…)` })

  if (gl === null) {
    out.push({ name: 'glass.css 있음', ok: false, detail: 'src/styles/glass.css가 없다' })
    return out
  }
  const need = ['prefers-reduced-transparency', 'prefers-contrast', ':has(']
  const missing = need.filter((k) => !gl.includes(k))
  out.push({ name: 'glass.css 규칙 어휘', ok: missing.length === 0, detail: missing.length ? `없음: ${missing.join(', ')}` : need.join(' · ') })

  const media = blockAfter(gl, /@media[^{]*prefers-reduced-transparency/)
  const supports = blockAfter(gl, /@supports\s+not/)
  const sameHeader = media !== null && media.header.includes('prefers-contrast')
  out.push({ name: '끄기 @media에 대비 증가 포함', ok: sameHeader, detail: media ? media.header.replace(/\s+/g, ' ') : '@media 블록이 없다' })
  const squash = (s) => s.replace(/\s+/g, '')
  const same = media !== null && supports !== null && squash(media.body) === squash(supports.body)
  out.push({ name: '끄기 두 블록 선언 같음', ok: same, detail: !media || !supports ? `${media ? '' : '@media 없음 '}${supports ? '' : '@supports not 없음'}` : same ? '공백 빼고 같다' : '두 블록이 다르다' })
  return out
}
