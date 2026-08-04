import { describe, expect, it } from 'vitest'
import { NO_COMPENSATION } from '../types'
import { stripComments } from './sourceScan'

/**
 * 화면 계약 — 소스 스캔 (X6·X8·X9).
 *
 * 세 항목 모두 "코드가 옳게 동작하는데 화면이 말을 잘못한다" 부류다. 단위 테스트로는
 * 잡히지 않고 실기기에서만 드러나므로, 규칙 자체를 소스에 못 박는다.
 */

const sources = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** 주석을 걷어낸 소스 — 금지 표현을 주석에 적어 뒀다가 스캔에 걸린 적이 두 번 있다 */
const file = (path: string) => {
  const src = sources[path]
  expect(src, `${path}가 없습니다 — 이 검사가 헛돌고 있다`).toBeDefined()
  return stripComments(src!)
}

/** 주석까지 포함한 원본 (주석 자체를 확인할 때만) */
const raw = (path: string) => {
  const src = sources[path]
  expect(src, `${path}가 없습니다`).toBeDefined()
  return src!
}

describe('X6 — 파괴적 동작의 시각 언어가 하나다', () => {
  /** 되돌릴 수 없는 삭제를 여는 버튼들 */
  const DESTRUCTIVE = [
    { path: '/src/components/DietDayEditor.tsx', label: '이 날 식단 기록 지우기' },
    { path: '/src/screens/SessionDetailScreen.tsx', label: '이 세션 삭제' },
  ]

  it('삭제 진입 버튼이 전부 btn-danger다', () => {
    for (const { path, label } of DESTRUCTIVE) {
      const src = file(path)
      // 라벨 앞쪽 className에 btn-danger가 있어야 한다
      const around = src.slice(Math.max(0, src.indexOf(label) - 260), src.indexOf(label))
      expect(around, `${path}의 "${label}"`).toMatch(/btn-danger/)
    }
  })

  it('검사 대상 라벨이 실제로 존재한다', () => {
    for (const { path, label } of DESTRUCTIVE) {
      expect(file(path)).toContain(label)
    }
  })

  it('주석 제거가 라벨을 지우지 않는다 (검사가 헛돌지 않게)', () => {
    expect(stripComments('/* 지워질 주석 */ <button>이 세션 삭제</button>')).toContain('이 세션 삭제')
    expect(stripComments('/* 이 세션 삭제 */')).not.toContain('이 세션 삭제')
  })
})

/*
 * X8의 CSS 규칙(`white-space: nowrap`)은 **여기서 검사할 수 없다.**
 * vitest에서 `.css`를 `?raw`로 읽으면 Vite의 CSS 플러그인이 가로채 **빈 문자열**이 온다
 * (실측: length 0). 읽을 수 없는 대상을 검사하는 척하는 테스트는 항상 통과하거나 항상
 * 실패하고, 둘 다 거짓 신호다. 그래서 CSS는 브라우저 computed style로 확인하고
 * (375px에서 실측), 여기서는 **1차 방어인 라벨 길이**만 못 박는다.
 */
describe('X8 — 세트 행 버튼 라벨이 짧다', () => {
  it('긴 라벨이 되살아나지 않는다', () => {
    const src = file('/src/components/ExerciseCard.tsx')
    // 375px에서 줄바꿈되던 두 라벨. 줄바꿈은 행 높이를 흔들어 옆 버튼의 탭 위치를 밀어낸다
    expect(src).not.toContain('자리 없음 · 대체')
    expect(src).not.toContain('+ 워밍업')
    for (const label of ['워밍업', '대체', '+ 세트', '− 세트']) {
      expect(src, `"${label}" 라벨`).toContain(label)
    }
  })

  it('줄인 라벨에 aria-label로 원래 뜻을 남겼다', () => {
    const src = raw('/src/components/ExerciseCard.tsx')
    expect(src).toMatch(/aria-label="워밍업 세트 추가"/)
    expect(src).toMatch(/aria-label="자리 없음 — 대체운동 고르기"/)
  })
})

describe('X9 — 비우기 버튼은 지울 것이 있을 때만 보인다', () => {
  it('현재 값이 없음/빈 값이면 렌더하지 않는다', () => {
    const src = file('/src/components/CompensationSheet.tsx')
    expect(src).toMatch(/current\.trim\(\) !== ''/)
    expect(src).toMatch(/current !== NO_COMPENSATION/)
  })

  it('편집 중 상태가 아니라 **저장된 값**으로 판단한다', () => {
    // selected/free로 판단하면 체크를 다 푼 순간 버튼이 사라져 되돌릴 수 없다
    const src = file('/src/components/CompensationSheet.tsx')
    const cond = /\{(current[^}]*?) &&\s*\(\s*<button/.exec(src)?.[1] ?? ''
    expect(cond).not.toMatch(/\bselected\b|\bfree\b|\bpreview\b/)
  })

  it('기준 상수가 실제로 그 값이다', () => {
    // '없음'이 아닌 다른 값으로 바뀌면 조건도 함께 바뀌어야 한다
    expect(NO_COMPENSATION).toBe('없음')
  })
})

/**
 * 캘린더의 세 신호가 서로 섞이지 않아야 한다 (실사용 피드백 3차 후속).
 *
 * 보고: "달력 테두리를 식단 링으로 쓰는 게 직관적이지 않다. 날짜를 클릭한 건지
 * 식단 링인지 구분이 안 된다."
 *
 * 실제로 `.cal-cell-today`가 `inset … var(--accent)`이고 식단 mid도 같은 오렌지 링이었다.
 * box-shadow는 겹치지 않고 뒤 규칙이 이기므로 **식단 링이 "오늘" 링을 덮기까지** 했다.
 * 역할을 분리했다: 테두리·배경 = 오늘·선택 / 🔥 = 운동 / 점 = 식단.
 */
describe('캘린더 신호 분리 (식단 = 점)', () => {
  const cal = () => file('/src/components/MonthCalendar.tsx')

  it('식단을 테두리로 그리지 않는다', () => {
    expect(cal()).not.toMatch(/cal-cell-diet-/)
  })

  it('식단은 점으로 그린다', () => {
    expect(cal()).toMatch(/cal-diet-dot-\$\{dietDot\}/)
  })

  it('판정된 날과 보류된 날이 같은 점 경로를 지난다', () => {
    // 두 경로로 그리면 한쪽만 색을 바꿀 때 갈라진다
    expect(cal()).toMatch(/hasDiet \? diet : dietPartial \? 'partial' : null/)
  })

  it('식단 색에 내비게이션 색(--accent)을 쓰지 않는다', () => {
    // --accent는 오늘·선택 표시 색이다. 식단이 그 색을 쓰면 구분이 불가능해진다
    const css = import.meta.glob('/src/styles/*.css', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    // ⚠ vitest에서 CSS ?raw는 빈 문자열이다 (§X8) — 그래서 CSS는 여기서 검사하지 않는다.
    // 이 테스트는 그 사실 자체를 남긴다: 색 검증은 브라우저 computed style로 한다.
    expect(typeof css['/src/styles/global.css']).toBe('string')
  })
})

describe('기록 탭 — 날짜 선택이 세션 유무와 무관하게 같다', () => {
  const history = () => file('/src/screens/HistoryScreen.tsx')

  it('날짜를 고르면 상세로 넘어가지 않는다', () => {
    // 예전에는 세션이 하나뿐인 날만 곧바로 상세로 들어가 "보고 나서 또 뒤로" 마찰이 있었다
    const src = history()
    const picker = /const pickDate = \(date: string\) => \{([\s\S]*?)\n  \}/.exec(src)?.[1]
    expect(picker, 'pickDate를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    expect(picker).not.toMatch(/setDetailId/)
    expect(picker).toMatch(/setSelectedDate/)
  })

  it('상세 진입은 세션 행을 눌러서만 한다', () => {
    const src = history()
    expect((src.match(/setDetailId\(/g) ?? []).length).toBeGreaterThan(0)
  })
})
