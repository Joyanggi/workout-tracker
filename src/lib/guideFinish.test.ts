import { describe, expect, it } from 'vitest'
import { stripComments } from './sourceScan'

/**
 * Z2 — **템포 가이드의 두 종료 경로가 같은 체인을 지난다.**
 *
 * v1.4까지는 비대칭이었다: 자동 종료(상단 도달)는 기록→체크→휴식까지 가고, 수동 종료는
 * 반복수만 적었다. 수동 값이 추정치라 사용자 확인을 남겨둔 설계였는데, **수동 종료의
 * 대다수가 "세트가 거기서 끝났다"다** — 루틴 문서 13장의 세트 종료 신호가 "리듬을 못
 * 따라가기 시작하는 순간"이고 시트 안내문도 그때 먼저 종료하라고 한다.
 * 즉 설계된 정상 경로이고, 정상 경로가 자동보다 탭이 2회 많을 이유가 없다.
 *
 * 체인을 함수 하나(`finishGuideSet`)로 모은 것이 핵심이다 — 두 곳에 같은 세 동작을
 * 각각 적으면 한쪽만 고쳐져 갈라진다. v1.4의 비대칭이 정확히 그 형태였다.
 */

const sources = import.meta.glob('/src/components/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const card = () => {
  const src = sources['/src/components/ExerciseCard.tsx']
  expect(src, 'ExerciseCard를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
  return stripComments(src!)
}
const sheet = () => {
  const src = sources['/src/components/TempoGuideSheet.tsx']
  expect(src, 'TempoGuideSheet를 찾지 못했다').toBeDefined()
  return src!
}

describe('Z2 — 두 경로가 한 함수를 지난다', () => {
  it('onDone과 onComplete가 같은 함수를 부른다', () => {
    const src = card()
    expect(src).toMatch(/onDone=\{\(reps\) => finishGuideSet\(reps\)\}/)
    expect(src).toMatch(/onComplete=\{\(reps\) => finishGuideSet\(reps\)\}/)
  })

  it('체인이 기록 → 미체크면 체크 순서다 (휴식은 체크 경로에 딸려 있다)', () => {
    const fn = /const finishGuideSet = \(reps: number\) => \{([\s\S]*?)\n  \}/.exec(card())?.[1]
    expect(fn, 'finishGuideSet을 찾지 못했다').toBeDefined()
    const patchAt = fn!.indexOf('patchSet')
    const checkAt = fn!.indexOf('onCheck')
    expect(patchAt).toBeGreaterThan(-1)
    expect(checkAt).toBeGreaterThan(patchAt)
  })

  it('0회는 아무것도 하지 않는다 (카운트인 중 취소)', () => {
    const fn = /const finishGuideSet = \(reps: number\) => \{([\s\S]*?)\n  \}/.exec(card())?.[1]
    expect(fn).toMatch(/reps <= 0\) return/)
  })

  it('이미 체크된 세트를 다시 토글하지 않는다 (풀려 버린다)', () => {
    const fn = /const finishGuideSet = \(reps: number\) => \{([\s\S]*?)\n  \}/.exec(card())?.[1]
    expect(fn).toMatch(/!entry\.sets\[guideSet\]\?\.done/)
  })

  it('두 경로에 patchSet이 각각 적혀 있지 않다 (갈라짐 방지)', () => {
    // 가이드 종료 경로에서 patchSet을 부르는 곳은 finishGuideSet 하나여야 한다
    const src = card()
    const guideBlock = /guideSet !== null && \([\s\S]*?onClose=\{\(\) => setGuideSet\(null\)\}/.exec(src)?.[0]
    expect(guideBlock, '가이드 블록을 찾지 못했다').toBeDefined()
    expect(guideBlock).not.toMatch(/patchSet/)
  })
})

describe('Z2 — 라벨이 일어날 일을 말한다', () => {
  it('수동 종료 버튼이 기록과 휴식 시작을 함께 알린다', () => {
    expect(sheet()).toMatch(/종료 — 약 \$\{rep\.reps\}회 기록 · 휴식 시작/)
  })

  it('"약"이 유지된다 — 값의 신뢰도 구분은 여전히 유효하다 (V1)', () => {
    expect(sheet()).toMatch(/약 \$\{rep\.reps\}회/)
  })

  it('신뢰도는 다르지만 동작은 같다는 사실이 주석에 있다', () => {
    expect(sheet()).toMatch(/신뢰도는 다르지만 이어지는 동작은 같다/)
  })
})
