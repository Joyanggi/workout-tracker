/**
 * 차트 색·툴팁 스타일 — **CSS 토큰이 단일 원천** (BB7).
 *
 * 이전에는 `AnalyzeScreen`이 토큰 값을 hex로 베껴 들고 있었다
 * ("CSS 변수는 SVG 속성에 직접 못 넣는다"는 주석과 함께). 속성에 `var()`를 못 넣는 것은
 * 사실이지만, **읽어서 넣으면 된다**는 길이 남아 있었다. 그 사이에 무슨 일이 일어났나:
 *
 *   G6 가독성 패스에서 `--text-faint`를 #64646f → #8c8c98로 올렸다 (대비 3.09 → 5.43,
 *   WCAG AA 미달을 고친 것). **차트의 사본은 따라가지 않았다** — 실측 결과 차트 축 라벨은
 *   여전히 3.09:1이었다. 앱 전체를 고친 패스가 차트 하나를 비껴간 것이고,
 *   이 프로젝트가 반복해서 잡는 결함 B(같은 사실의 두 사본)의 정확한 형태다.
 *
 * 그래서 런타임에 `getComputedStyle`로 토큰을 읽는다. 폴백은 **현재 토큰 값**이다 —
 * 못 읽었을 때 실패하는 방향이 "지금과 같은 그림"이어야 한다 (X5의 실패 방향 원칙).
 */

/** 폴백 = `global.css`의 현재 값. 토큰을 못 읽는 환경(테스트 등)에서 쓰인다 */
const FALLBACK = {
  accent: '#ff7a1a',
  ok: '#34c759',
  warn: '#ffcc00',
  text: '#f2f2f5',
  dim: '#a8a8b5',
  faint: '#8c8c98',
  line: '#2b2b34',
  surface: '#16161a',
  surface2: '#1f1f26',
} as const

export type ChartColorKey = keyof typeof FALLBACK

const TOKEN: Record<ChartColorKey, string> = {
  accent: '--accent',
  ok: '--ok',
  warn: '--warn',
  text: '--text',
  dim: '--text-dim',
  faint: '--text-faint',
  line: '--line',
  surface: '--surface',
  surface2: '--surface-2',
}

/**
 * 토큰 하나를 읽는다. 값이 없거나 DOM이 없으면 폴백.
 *
 * 매 렌더 호출을 피하려고 캐시하지 않는다 — `getComputedStyle` 8회는 차트 하나 그리는
 * 비용에 비해 무의미하고, 캐시를 두면 그게 **세 번째 사본**이 된다.
 */
export function chartColor(key: ChartColorKey): string {
  if (typeof document === 'undefined') return FALLBACK[key]
  const value = getComputedStyle(document.documentElement).getPropertyValue(TOKEN[key]).trim()
  return value === '' ? FALLBACK[key] : value
}

export interface ChartTheme {
  accent: string
  ok: string
  warn: string
  dim: string
  faint: string
  line: string
  surface: string
  /**
   * 축 tick 공통.
   *
   * **`fill`이어야 한다.** 이전 코드는 `{ stroke: faint }`였는데 SVG `<text>`는 `fill`로
   * 칠해지고 `stroke`는 글자 **윤곽선**이다 — 즉 축 라벨 색이 한 번도 적용된 적이 없고
   * recharts 기본값(#666666)이 그려지고 있었다 (실측 `rgb(102, 102, 102)`).
   * hex 사본이 낡은 것보다 이게 먼저였다: **색을 지정했다고 믿고 있었던 것**이다.
   */
  axis: { fill: string; fontSize: number }
  /** 툴팁 박스 */
  tooltip: {
    background: string
    border: string
    borderRadius: number
    fontSize: number
    color: string
    padding: string
  }
  tooltipLabel: { color: string; marginBottom: number }
  /** 활성점 — 터치 기준으로 키운다 (손가락이 덮으므로 작은 점은 안 보인다) */
  activeDot: { r: number; strokeWidth: number; stroke: string }
}

/**
 * 차트 하나가 쓰는 값 묶음.
 *
 * 툴팁 배경은 `--surface-2`다 — 툴팁은 카드(`--surface`) **위에** 뜨므로 같은 색이면
 * 경계가 테두리 1px에만 의존한다. 한 단 밝은 면이 그 위에 떠 있다는 것을 색이 말해야 한다.
 */
export function chartTheme(): ChartTheme {
  const accent = chartColor('accent')
  const line = chartColor('line')
  const faint = chartColor('faint')
  const dim = chartColor('dim')
  return {
    accent,
    ok: chartColor('ok'),
    warn: chartColor('warn'),
    dim,
    faint,
    line,
    surface: chartColor('surface'),
    axis: { fill: faint, fontSize: 11 },
    tooltip: {
      background: chartColor('surface2'),
      border: `1px solid ${line}`,
      borderRadius: 10,
      fontSize: 12,
      color: chartColor('text'),
      padding: '8px 10px',
    },
    tooltipLabel: { color: dim, marginBottom: 2 },
    activeDot: { r: 5, strokeWidth: 2, stroke: accent },
  }
}
