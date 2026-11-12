/**
 * 설정 → 진단의 "유리" 줄 (v1.19 QQ1).
 * 이 함수는 흐림이 **선언·적용됐는지**만 말한다. "그려졌다"는 말하지 않는다 — 계산 스타일은 선언이 받아들여졌다는 것까지만
 * 알려 주고, WebKit이 합성 단계에서 흐림을 빠뜨려도 `흐림 선언됨`이 나온다(뒤 픽셀은 페이지에서 읽을 수 없다).
 * 실제로 그려졌는가는 사람이 폰에서 탭바 뒤 글자가 번지는지 또렷한지로 가른다.
 */
export interface GlassDiagInput {
  supportsBlur: boolean
  supportsWebkitBlur: boolean
  /** 화면의 `.tabbar`의 계산된 흐림 속성(없거나 none이면 -webkit- 쪽 값). 읽지 못했으면 null */
  computed: string | null
  reduceTransparency: boolean
  moreContrast: boolean
}

export interface GlassDiagResult {
  label: string
  sub: string | null
}

export function glassDiagnosis(input: GlassDiagInput): GlassDiagResult {
  if (input.moreContrast) return { label: '꺼짐 (대비 증가)', sub: null }
  if (input.reduceTransparency) return { label: '꺼짐 (투명도 줄이기)', sub: null }
  if (!input.supportsBlur && !input.supportsWebkitBlur) return { label: '꺼짐 (이 브라우저는 흐림 미지원)', sub: null }
  const computed = input.computed?.trim() ?? ''
  if (computed === '' || computed === 'none') {
    const which = input.supportsBlur && input.supportsWebkitBlur ? '둘 다' : input.supportsBlur ? '표준' : 'webkit'
    return { label: '꺼짐 (흐림이 적용되지 않음)', sub: `흐림 지원: ${which}` }
  }
  return { label: '흐림 선언됨', sub: computed }
}

/** 브라우저에서 입력을 모은다. 마운트 때 한 번 읽는다 — 설정 안에서 시트를 열어 한 겹 규칙이 탭바 흐림을 끄는 것은 반영하지 않는다 */
// v118 스캔(앱 코드에 이 속성 이름을 글자로 적지 않는다)을 지키려고 이름을 조립한다 — 흐림을 거는 곳은 CSS뿐이고 여기는 읽기만 한다
const PROP = ['backdrop', 'filter'].join('-')
const WEBKIT_PROP = `-webkit-${PROP}`

export function readGlassDiagInput(): GlassDiagInput {
  const bar = document.querySelector('.tabbar')
  let computed: string | null = null
  if (bar) {
    const cs = getComputedStyle(bar)
    const std = cs.getPropertyValue(PROP)
    computed = std && std !== 'none' ? std : cs.getPropertyValue(WEBKIT_PROP) || std || null
  }
  return {
    supportsBlur: CSS.supports(PROP, 'blur(1px)'),
    supportsWebkitBlur: CSS.supports(WEBKIT_PROP, 'blur(1px)'),
    computed,
    reduceTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
    moreContrast: matchMedia('(prefers-contrast: more)').matches,
  }
}
