import { describe, expect, it } from 'vitest'
import { chartColor, chartTheme } from './chartTheme'
import { stripComments } from './sourceScan'

/**
 * 마감 라운드의 소스 계약 (BB1·BB3·BB5·BB7).
 *
 * 넷 다 "값 자체는 CSS이거나 SVG라서 vitest로 볼 수 없다" (누적 제약 3) — 그래서
 * **규칙만** 소스에 못 박고 색·크기는 브라우저 실측으로 확인한다 (DEV-RECORD 부록).
 */
const tsx = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const file = (path: string) => {
  const src = tsx[path]
  expect(src, `${path}가 없습니다 — 이 검사가 헛돌고 있다`).toBeDefined()
  return stripComments(src!)
}

describe('BB1 — 탭바가 이모지를 쓰지 않는다', () => {
  /** 이모지 범위 (그림문자·기호). 텍스트 화살표(▸▾)나 한글은 걸리지 않는다 */
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u

  it('TabBar에 이모지 리터럴이 없다', () => {
    expect(EMOJI.test(file('/src/components/TabBar.tsx'))).toBe(false)
  })

  it('검사가 실제로 이모지를 잡는다', () => {
    // 정규식이 헛돌면 "이모지가 없다"가 항상 통과한다
    expect(EMOJI.test('🔥')).toBe(true)
    expect(EMOJI.test('🍽️')).toBe(true)
    expect(EMOJI.test('⚙️')).toBe(true)
    expect(EMOJI.test('다른 알림 2개 ▾')).toBe(false)
  })

  it('아이콘이 컴포넌트로 들어간다 (색을 입힐 수 있어야 한다)', () => {
    const src = file('/src/components/TabBar.tsx')
    expect(src).toMatch(/Icon: IconFlame/)
    expect(src).toMatch(/<Icon \/>/)
  })

  it('라벨을 유지한다 — 아이콘 단독 탭바는 발견 가능성을 해친다', () => {
    const src = file('/src/components/TabBar.tsx')
    for (const label of ['홈', '식단', '기록', '분석', '설정']) {
      expect(src, `"${label}" 라벨`).toContain(label)
    }
  })
})

describe('BB1 — 아이콘이 색 결정을 갖지 않는다', () => {
  const icons = () => file('/src/components/icons.tsx')

  it('currentColor만 쓴다 (리터럴 색 금지)', () => {
    const src = icons()
    expect(src).toMatch(/stroke="currentColor"/)
    // hex·rgb·CSS 변수 어느 것도 아이콘 안에 있으면 안 된다 —
    // 색은 놓이는 자리가 정한다 (탭바 active, 세팅 행의 흐린 색)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/rgba?\(/)
    expect(src).not.toMatch(/var\(--/)
  })

  it('규격이 하나다 — 모든 아이콘이 같은 Svg 래퍼를 지난다', () => {
    const src = icons()
    const svgTags = src.match(/<svg/g) ?? []
    expect(svgTags).toHaveLength(1)
    expect(src).toMatch(/viewBox="0 0 24 24"/)
    expect(src).toMatch(/strokeWidth=\{1\.8\}/)
  })

  it('장식이므로 접근성 트리에서 감춘다', () => {
    expect(icons()).toMatch(/aria-hidden="true"/)
  })
})

describe('BB3 — 세팅 진입 행이 점선이 아니다', () => {
  it('카드가 이모지 대신 아이콘을 쓴다', () => {
    const src = file('/src/components/ExerciseCard.tsx')
    expect(src).toMatch(/<IconSliders size=\{16\} \/>/)
    expect(src).toMatch(/<IconScale size=\{16\} \/>/)
    expect(src).not.toContain('🔧')
    expect(src).not.toContain('⚖')
  })

  it('빈 상태와 채운 상태를 텍스트 색으로 구분한다 (테두리가 아니라)', () => {
    const src = file('/src/components/ExerciseCard.tsx')
    expect(src).toMatch(/setupNote \? 'setup-value' : 'setup-empty'/)
    expect(src).toMatch(/scaleIsCustom \? 'setup-value' : 'setup-empty'/)
  })
})

describe('BB5 — 버전을 손으로 적지 않는다', () => {
  /*
    계획서는 `/v\d+\.\d+/`를 소스 전체에서 금지하라고 했지만 **그러면 안 된다**:
    같은 화면에 "v2.4 규칙"(루틴 문서 버전)이 본문으로 들어 있다. 앱 버전과 루틴 버전은
    다른 축이고, 루틴 버전은 문서를 가리키는 고유명사라 리터럴이 맞다.
    그래서 **버전을 표시하는 그 줄**만 본다.
  */
  const versionLine = () => {
    const src = file('/src/screens/SettingsScreen.tsx')
    const line = /<p className="screen-sub">([^<]*)<\/p>/.exec(src)?.[1]
    expect(line, '버전 표시 줄을 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    return line!
  }

  it('버전 표시가 리터럴이 아니다', () => {
    expect(versionLine()).toBe('v{__APP_VERSION__}')
    expect(versionLine()).not.toMatch(/v\d+\.\d+/)
  })

  it('검사가 실제로 리터럴을 잡는다', () => {
    expect(/v\d+\.\d+/.test('v1.1')).toBe(true)
    expect(/v\d+\.\d+/.test('v{__APP_VERSION__}')).toBe(false)
  })

  it('루틴 문서 버전은 그대로 둔다 (다른 축이다)', () => {
    expect(file('/src/screens/SettingsScreen.tsx')).toContain('v2.4 규칙')
  })

  it('define이 주입된다 — 값이 있고 형식이 semver다', () => {
    // vite.config.ts의 define이 빠지면 여기서 ReferenceError가 난다
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('BB7 — 차트 색이 CSS 토큰에서 온다', () => {
  it('AnalyzeScreen에 hex 사본이 없다', () => {
    const src = file('/src/screens/AnalyzeScreen.tsx')
    // G6에서 --text-faint를 올렸을 때 이 사본이 따라가지 않아 축 라벨만 3.09:1로 남았다
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}/)
    expect(src).toMatch(/const C = chartTheme\(\)/)
  })

  it('테마가 한 곳에서 나온다 — 툴팁·축·활성점이 같은 함수를 지난다', () => {
    const src = file('/src/screens/AnalyzeScreen.tsx')
    expect(src).toMatch(/tick=\{C\.axis\}/)
    expect(src).toMatch(/contentStyle=\{C\.tooltip\}/)
    expect(src).toMatch(/activeDot=\{C\.activeDot\}/)
  })

  it('DOM이 없으면 폴백이 현재 토큰 값이다 — 실패 방향이 현상 유지', () => {
    // vitest는 node 환경이라 document가 없다: 이 경로가 실제로 도는 자리다
    expect(chartColor('faint')).toBe('#8c8c98')
    expect(chartColor('dim')).toBe('#a8a8b5')
  })

  it('폴백이 G6 이전 값으로 되돌아가지 않는다', () => {
    // #64646f / #9a9aa8은 G6이 대비 미달로 교체한 값이다
    const theme = chartTheme()
    expect(theme.faint).not.toBe('#64646f')
    expect(theme.dim).not.toBe('#9a9aa8')
  })

  it('활성점이 터치 기준을 넘는다 (r ≥ 5)', () => {
    expect(chartTheme().activeDot.r).toBeGreaterThanOrEqual(5)
  })

  it('축 라벨은 fill로 칠한다 — stroke는 글자 윤곽선이라 색이 적용되지 않는다', () => {
    /*
      실측으로 발견한 것: 이전 `{ stroke: faint }`에서 축 라벨은 recharts 기본색
      #666666(rgb(102,102,102))으로 그려지고 있었다. 색을 지정했다고 믿고 있었을 뿐이다.
      `fill`로 바꾼 뒤 실측 rgb(140,140,152) = --text-faint, 대비 5.43:1.
    */
    const axis = chartTheme().axis as Record<string, unknown>
    expect(axis.fill).toBe('#8c8c98')
    expect(axis).not.toHaveProperty('stroke')
  })
})
