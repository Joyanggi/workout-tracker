import { describe, expect, it } from 'vitest'
import { stripComments } from './sourceScan'

/**
 * Z5 — **휴식 타이머는 App이 단일 인스턴스로 소유한다.**
 *
 * 이 항목의 핵심 함정이다. 세션 최소화를 만들면서 SessionScreen이 `useRestTimer()`를
 * 계속 소유하면, 탭으로 나갈 때 훅이 언마운트되어 **차임·카운트다운 틱이 죽는다.**
 * endTime은 localStorage에 있어 복귀 시 표시는 정확하지만, 식단 체크하러 나가 있는 동안
 * 휴식이 끝나면 소리가 안 난다 — 최소화를 만드는 이유(운동 중 다른 탭을 본다)와 정확히 충돌한다.
 *
 * **인스턴스 두 개도 안 된다**: localStorage는 `load` 시점에만 읽으므로 라이브 동기화가
 * 안 되고, 두 개면 차임이 두 번 울리거나 한쪽이 낡은 값을 표시한다.
 */

const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const appFiles = Object.entries(sources)
  .filter(([p]) => !p.endsWith('.test.ts'))
  .map(([p, src]) => [p, stripComments(src)] as const)

describe('타이머 단일 소유 (Z5)', () => {
  it('useRestTimer()를 호출하는 곳이 정확히 하나다', () => {
    const callers = appFiles
      .filter(([p]) => p !== '/src/lib/useRestTimer.ts')
      .filter(([, src]) => /\buseRestTimer\s*\(/.test(src))
      .map(([p]) => p)

    expect(
      callers,
      `휴식 타이머 인스턴스가 둘 이상이면 차임이 두 번 울리거나 한쪽이 낡습니다.\n` +
        `App이 소유하고 prop으로 내려주세요:\n` +
        callers.map((f) => `  ${f}`).join('\n'),
    ).toEqual(['/src/App.tsx'])
  })

  it('SessionScreen은 타이머를 prop으로 받는다', () => {
    const src = sources['/src/screens/SessionScreen.tsx']
    expect(src, 'SessionScreen을 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    expect(stripComments(src!)).toMatch(/timer: RestTimer/)
    expect(stripComments(src!)).not.toMatch(/\buseRestTimer\s*\(/)
  })

  it('스캔이 실제로 호출을 찾는다 (정규식이 깨지면 항상 통과한다)', () => {
    const found = appFiles.filter(([, src]) => /\buseRestTimer\s*\(/.test(src))
    expect(found.length).toBeGreaterThan(0)
  })

  it('재개 스트립도 같은 인스턴스를 받는다 (자기 것을 만들지 않는다)', () => {
    const src = sources['/src/components/SessionResumeStrip.tsx']
    expect(src, 'SessionResumeStrip을 찾지 못했다').toBeDefined()
    expect(stripComments(src!)).toMatch(/timer: RestTimer/)
    expect(stripComments(src!)).not.toMatch(/\buseRestTimer\s*\(/)
  })
})

describe('최소화 경로 (Z5)', () => {
  const app = () => stripComments(sources['/src/App.tsx']!)

  it('최소화는 세션을 버리지 않는다 — view만 바꾼다', () => {
    // onMinimize가 discard/finish 경로를 타면 데이터가 사라진다
    const prop = /onMinimize=\{([^}]*)\}/.exec(app())?.[1]
    expect(prop, 'onMinimize를 찾지 못했다').toBeDefined()
    expect(prop).toMatch(/setView\('tabs'\)/)
    expect(prop).not.toMatch(/discard|finish/i)
  })

  it('열린 세션이 있을 때만 스트립을 그린다', () => {
    expect(app()).toMatch(/openSession && bundle && \(/)
  })

  it('홈 배너를 스트립으로 통합했다 (같은 정보가 두 줄 뜨지 않게)', () => {
    const home = stripComments(sources['/src/screens/HomeScreen.tsx']!)
    expect(home).not.toMatch(/진행 중: /)
  })
})
