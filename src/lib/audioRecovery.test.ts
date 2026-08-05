import { describe, expect, it } from 'vitest'
import { needsResume } from './beep'
import { stripComments } from './sourceScan'

/**
 * 오디오 복구 판정 (CC1).
 *
 * 피드백: "앱 나갔다 오면 소리가 안 난다. 완전 종료 후 다시 켜면 난다."
 *
 * 원인은 복구 경로 세 곳이 전부 `state === 'suspended'`만 검사한 것이다.
 * **iOS Safari는 앱 전환·전화·시리에서 컨텍스트를 비표준 상태 `'interrupted'`로**
 * 떨어뜨리고, 그 상태는 어디에도 안 걸려서 소리가 죽은 채로 남았다.
 * 재시작하면 새 컨텍스트라 정상 — 증상 서술과 정확히 일치한다.
 */
describe('needsResume', () => {
  it('suspended는 복구 대상이다', () => {
    expect(needsResume('suspended')).toBe(true)
  })

  it('**interrupted도 복구 대상이다** (이 라운드의 결함)', () => {
    // 표준 타입에 없는 값이라 TS가 잡아주지 않는다 — 그래서 테스트가 필요하다
    expect(needsResume('interrupted')).toBe(true)
  })

  it('running은 아니다', () => {
    expect(needsResume('running')).toBe(false)
  })

  it('closed는 아니다 — resume으로 살아나지 않으므로 재생성 대상이다', () => {
    expect(needsResume('closed')).toBe(false)
  })

  it('컨텍스트가 없으면(null·undefined) 아니다', () => {
    expect(needsResume(null)).toBe(false)
    expect(needsResume(undefined)).toBe(false)
  })

  it('모르는 상태도 복구를 시도한다 — 실패 방향이 "소리가 나게"여야 한다', () => {
    /*
      iOS가 다음 버전에서 또 다른 비표준 상태를 내놓아도 복구를 시도해야 한다.
      화이트리스트(suspended·interrupted)로 두면 이번 결함이 그대로 재발한다.
    */
    expect(needsResume('some-future-state')).toBe(true)
  })
})

describe('복구 판정이 한 곳에만 있다 (CC1)', () => {
  const src = () => {
    const files = import.meta.glob('/src/lib/beep.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const raw = files['/src/lib/beep.ts']
    expect(raw, 'beep.ts를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    return stripComments(raw!)
  }

  it("state === 'suspended' 비교가 남아 있지 않다", () => {
    /*
      세 곳(unlockAudio·resumeAudio·tone)이 각자 조건을 들고 있던 것이 이번 결함의 형태다.
      한 곳만 고치면 나머지가 조용히 남으므로, **비교 자체를 금지**한다.
    */
    expect(src()).not.toMatch(/state === 'suspended'/)
  })

  it('resume 호출이 tryResume 하나를 지난다', () => {
    const s = src()
    // ctx.resume()을 직접 부르는 곳은 tryResume 안뿐이다
    const direct = s.match(/ctx\.resume\(\)/g) ?? []
    expect(direct).toHaveLength(1)
    expect(s).toMatch(/function tryResume\(\)[\s\S]*?needsResume\(ctx\.state\)/)
  })

  it('resume이 거부되면 컨텍스트를 버린다 — 죽은 컨텍스트를 붙들지 않는다', () => {
    expect(src()).toMatch(/ctx\.resume\(\)\.catch\(\(\) => discardContext\(\)\)/)
  })

  it('closed 컨텍스트는 재생성 경로로 간다', () => {
    // unlockAudio가 closed를 버리지 않으면 new Ctor()가 실행되지 않아 영구히 무음이 된다
    expect(src()).toMatch(/if \(ctx && ctx\.state === 'closed'\) discardContext\(\)/)
  })
})
