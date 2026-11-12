/**
 * UI 검사 함수 모음 (PLAN v1.19 QQ0). import해도 아무것도 실행하지 않는다.
 * `inPage*`는 page.evaluate로 브라우저 안에서 돈다(바깥 변수를 못 본다. 보이는 요소 판정은 window.__vis).
 * 판정 모양은 glass-check.mjs와 같다: `{ ok, detail }` 또는 `{ skip, detail }`.
 */

/** 눌림 반응을 재는 요소 선택자 */
export const PRESS_SELECTOR = 'button, [role="button"], a[href]'

/** 화면에서 눌러 볼 요소의 가운데 점. 가려졌거나 disabled면 null. 요소마다 0부터 번호를 붙여 돌려준다 */
export const inPagePressTargets = () => {
  const out = []
  // 앞 호출이 남긴 번호를 지운다 — 같은 페이지에서 장면을 이어 재면 옛 번호가 남아 엉뚱한 요소를 집는다 (QQ2에서 발견)
  document.querySelectorAll('[data-uic]').forEach((el) => el.removeAttribute('data-uic'))
  document.querySelectorAll('button, [role="button"], a[href]').forEach((el) => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return
    if (!window.__vis(el)) return
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return
    const hit = document.elementFromPoint(x, y)
    if (!hit || !(el === hit || el.contains(hit))) return
    el.setAttribute('data-uic', String(out.length))
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 14)
    out.push({ i: out.length, x, y, label, cls: el.className.toString().split(' ').slice(0, 2).join('.') })
  })
  return out
}

/** 눌림 판정에 쓰는 계산 스타일 여섯 */
export const inPagePressStyle = (i) => {
  const el = document.querySelector(`[data-uic="${i}"]`)
  if (!el) return null
  const cs = getComputedStyle(el)
  return {
    transform: cs.transform,
    opacity: cs.opacity,
    backgroundColor: cs.backgroundColor,
    backgroundImage: cs.backgroundImage,
    boxShadow: cs.boxShadow,
    filter: cs.filter,
    // 띠 안 버튼(탭바·재개 스트립)은 면이 아니라 안의 아이콘·글자만 옅어진다 (QQ2)
    childOpacity: [...el.children].map((c) => getComputedStyle(c).opacity).join(','),
  }
}

/** 시트 장면(legacy 시트·막만 — Astryx 시트의 움직임은 Astryx가 정한다): 움직임 줄이기 뒤 시트 요소의 animation/transition 길이가 0.01s 이하인가 */
export const inPageMotionDurations = () => {
  const bad = []
  let n = 0
  const secs = (v) => v.split(',').map((x) => Number.parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1))
  for (const el of document.querySelectorAll('.sheet, .sheet-backdrop')) {
    if (!window.__vis(el)) continue
    n++
    const cs = getComputedStyle(el)
    const worst = Math.max(...secs(cs.animationDuration), ...secs(cs.transitionDuration))
    if (worst > 0.01) bad.push(`${el.className.toString().split(' ')[0]} ${worst}s`)
  }
  if (n === 0) return { skip: true, detail: '시트가 없다' }
  return { ok: bad.length === 0, detail: bad.length ? bad.join(' · ') : `${n}개 0.01s 이하` }
}

/** 여백 격자: 계산된 padding·margin-top/bottom·gap이 0이거나 2px의 배수 */
export const inPageSpacing = () => {
  const props = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']
  const bad = new Map()
  let n = 0
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg')) continue
    if (el.parentElement?.closest('[class*="astryx-"]') && el.closest('[class*="astryx-"]')) continue
    if (el.matches('[class*="astryx-"]')) continue
    if (!window.__vis(el)) continue
    n++
    const cs = getComputedStyle(el)
    for (const p of props) {
      const raw = cs[p]
      if (raw === 'normal' || raw === 'auto') continue
      const v = Number.parseFloat(raw)
      if (!Number.isFinite(v) || v === 0) continue
      const r = Math.round(v * 2) / 2 // 0.5px 안이면 반올림
      if (Math.abs(v - r) < 0.5 && r % 2 === 0) continue
      const key = `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0] || '-'} ${p} ${+v.toFixed(2)}px`
      bad.set(key, (bad.get(key) ?? 0) + 1)
    }
  }
  const list = [...bad.entries()].map(([k, c]) => `${k}${c > 1 ? ` ×${c}` : ''}`)
  return { ok: list.length === 0, detail: list.length ? list.slice(0, 4).join(' · ') + (list.length > 4 ? ` 외 ${list.length - 4}` : '') : `${n}개 요소 격자 안` }
}

/**
 * 눌림 반응 (Node에서 page로 돈다).
 * 가운데 점에 mouse.move → down → holdMs(기본: --duration-fast + 한 프레임) 뒤 스타일 비교 → 요소 밖으로 끌고 나가 up → 원래대로 돌아왔는지.
 * `opts.skipClass`가 있으면 그 클래스를 가진 요소는 센다(건너뛰지 않는다). 돌려주는 것: { changed: [...], same: [...], stuck: [...], transformed: [...] }
 */
export async function measurePress(page, holdMs) {
  // 전이가 끝나도록 Astryx --duration-fast(175ms) + 한 프레임(약 16ms) 이상 기다린다. 계산된 값을 읽고, 못 읽으면 175ms
  if (holdMs === undefined) {
    const fastMs = await page.evaluate(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--duration-fast').trim()
      const n = parseFloat(v)
      return Number.isFinite(n) ? (v.endsWith('ms') ? n : n * 1000) : 175
    })
    holdMs = Math.ceil(fastMs) + 20
  }
  const targets = await page.evaluate(inPagePressTargets)
  const same = []
  const stuck = []
  const transformed = []
  let changedN = 0
  for (const t of targets) {
    const before = await page.evaluate(inPagePressStyle, t.i)
    if (!before) continue
    await page.mouse.move(t.x, t.y)
    await page.mouse.down()
    await page.waitForTimeout(holdMs)
    const during = await page.evaluate(inPagePressStyle, t.i)
    // mouse.up은 요소 밖에서 한다(클릭이 되지 않게)
    await page.mouse.move(-1, -1)
    await page.mouse.up()
    await page.waitForTimeout(holdMs)
    const after = await page.evaluate(inPagePressStyle, t.i)
    if (!during) continue
    const diff = Object.keys(before).filter((k) => before[k] !== during[k])
    const name = `"${t.label}" .${t.cls}`
    if (diff.length === 0) same.push(name)
    else {
      changedN++
      if (diff.includes('transform')) transformed.push(name)
    }
    if (after && Object.keys(before).some((k) => before[k] !== after[k]) && diff.length > 0) stuck.push(name)
  }
  return { total: targets.length, changedN, same, stuck, transformed }
}

export const pressVerdict = (r) => {
  if (r.total === 0) return { skip: true, detail: '누를 요소가 없다' }
  const bad = [...r.same.map((n) => `${n} 변화 없음`), ...r.stuck.map((n) => `${n} 안 돌아옴`)]
  return {
    ok: bad.length === 0,
    detail: bad.length ? `${bad.length}/${r.total}건: ` + bad.slice(0, 4).join(' · ') + (bad.length > 4 ? ` 외 ${bad.length - 4}` : '') : `${r.total}개 모두 반응`,
  }
}

/**
 * 움직임 정적 검사 (QQ2). Node에서 CSS 소스 글자를 읽는다.
 * @param {Record<string, string>} allCss `src/**\/*.css` 경로 → 글자
 * @returns {{ name: string, ok: boolean, detail: string }[]}
 */
export function motionStaticChecks(allCss) {
  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  const add = (name, ok, detail) => out.push({ name, ok, detail })
  const motion = allCss['styles/motion.css'] === undefined ? null : strip(allCss['styles/motion.css'])
  if (motion === null) {
    add('motion.css 있음', false, 'src/styles/motion.css가 없다')
    return out
  }
  // 1. 눌림 기본 규칙: :where( 로 시작, button·[role="button"], :active, 제외 셋
  const base = [...motion.matchAll(/(:where\(\s*button[^{]*?)\{/g)].map((m) => m[1]).find((s) => s.includes(':active')) ?? null
  const q = (s) => s.replace(/"/g, "'")
  const baseOk = base !== null && q(base).includes("[role='button']")
  add('눌림 기본 규칙: :where(button, [role=button]):active 하나', baseOk, baseOk ? ':where( … ):active' : '없음')
  const miss = ['.ax-screen', 'astryx-', '.stepper'].filter((k) => base === null || !base.includes(k))
  add('기본 규칙에 Astryx(.ax-screen·astryx-)·.stepper 제외', miss.length === 0, miss.length ? `없음: ${miss.join(', ')}` : '.ax-screen · astryx- · .stepper')
  // 2. 움직임 줄이기
  add('motion.css에 prefers-reduced-motion', motion.includes('prefers-reduced-motion'), motion.includes('prefers-reduced-motion') ? '있음' : '없음')
  // 3. 시트·막 키프레임이 opacity를 움직이지 않는다
  const names = new Set()
  const sheetUse = Object.values(allCss).flatMap((css) =>
    [...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /(^|[\s,])\.(sheet|sheet-backdrop)(?![\w-])/.test(m[1]))
      .flatMap((m) => [...m[2].matchAll(/animation(?:-name)?\s*:\s*([\w-]+)/g)].map((a) => a[1])),
  )
  sheetUse.forEach((n) => names.add(n))
  const badKf = []
  for (const css of Object.values(allCss)) {
    for (const m of strip(css).matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
      if (names.has(m[1]) && /(^|[^-\w])opacity\s*:/.test(m[2])) badKf.push(m[1])
    }
  }
  add('.sheet·.sheet-backdrop 키프레임이 opacity를 움직이지 않는다', names.size > 0 && badKf.length === 0, badKf.length ? `opacity: ${badKf.join(', ')}` : `${[...names].join(' · ') || '키프레임 없음'}`)
  // 4. will-change 0건 (Astryx 패키지는 src 밖이라 애초에 없다)
  const wc = Object.entries(allCss).filter(([, css]) => /will-change\s*:/.test(strip(css))).map(([f]) => f)
  add('src/**/*.css에 will-change 0건', wc.length === 0, wc.length ? wc.join(' · ') : `${Object.keys(allCss).length}개 파일 0건`)
  return out
}
