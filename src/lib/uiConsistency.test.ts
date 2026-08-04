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
