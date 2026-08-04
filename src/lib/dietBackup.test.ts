import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SYNC_DEBOUNCE_MS } from './gistSync'

/**
 * X7 — 식단만 기록한 날도 백업에 올라간다.
 *
 * v1.3까지 `requestSync` 호출처가 **세션 종료 한 곳뿐**이었다. 식단만 기록한 날은
 * 다음 세션을 마쳐야 같이 올라갔고, 실제로 gist 마지막 갱신이 이틀 전이었다.
 *
 * 여기서 지키는 것은 두 가지다:
 * ① 쓰기 chokepoint에서 백업을 예약한다 (화면마다 부르면 새 화면에서 빠뜨린다)
 * ② 연타가 업로드 폭주가 되지 않는다 (debounce가 흡수한다)
 */

describe('연타 흡수 — debounce (X7)', () => {
  let syncCalls: number

  beforeEach(() => {
    vi.useFakeTimers()
    syncCalls = 0
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** `requestSync`의 debounce 규칙을 그대로 재현한다 (호출마다 타이머를 다시 건다) */
  function makeDebounced(delay = SYNC_DEBOUNCE_MS) {
    let timer: ReturnType<typeof setTimeout> | undefined
    return () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        syncCalls += 1
      }, delay)
    }
  }

  it('슬롯 6개를 빠르게 누르면 업로드는 한 번이다', () => {
    const request = makeDebounced()
    // 일괄 체크가 주 경로다 — 60ms 간격 연타는 정상 사용이다 (실측 기준)
    for (let i = 0; i < 6; i += 1) {
      request()
      vi.advanceTimersByTime(60)
    }
    expect(syncCalls).toBe(0) // 아직 debounce 중
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS)
    expect(syncCalls).toBe(1)
  })

  it('debounce 간격을 넘겨 띄엄띄엄 고치면 각각 올라간다', () => {
    const request = makeDebounced()
    request()
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS + 1)
    request()
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS + 1)
    expect(syncCalls).toBe(2)
  })

  it('debounce 시간이 헬스장에서 쓸 만한 범위다', () => {
    // 너무 짧으면 연타마다 올라가고, 너무 길면 앱을 닫을 때까지 안 올라간다
    expect(SYNC_DEBOUNCE_MS).toBeGreaterThanOrEqual(3_000)
    expect(SYNC_DEBOUNCE_MS).toBeLessThanOrEqual(15_000)
  })
})

/**
 * 인바리언트 — 백업 예약이 **쓰기 chokepoint에만** 있다.
 *
 * 화면에서 부르면 새 화면(또는 새 편집 경로)을 추가할 때 반드시 하나를 빠뜨린다.
 * X1에서 세션 상세에 식단 편집기를 하나 더 붙였는데, 그때 아무것도 추가하지 않아도
 * 백업이 동작하는 이유가 이것이다.
 */
describe('인바리언트 — 백업 예약 지점', () => {
  const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  const callers = Object.entries(sources)
    .filter(([p]) => !p.endsWith('.test.ts'))
    .filter(([, src]) => /\brequestSync\s*\(/.test(stripComments(src)))
    .map(([p]) => p)
    .sort()

  it('requestSync를 부르는 곳이 정의·세션 종료·식단 쓰기뿐이다', () => {
    expect(callers).toEqual([
      '/src/lib/gistSync.ts', // 정의
      '/src/lib/useDiet.ts', // X7 — 식단 쓰기 chokepoint
      '/src/screens/SessionScreen.tsx', // 세션 종료
    ])
  })

  it('식단 화면들은 백업을 직접 예약하지 않는다 (쓰기 함수가 한다)', () => {
    for (const screen of [
      '/src/screens/DietScreen.tsx',
      '/src/screens/HistoryScreen.tsx',
      '/src/screens/SessionDetailScreen.tsx',
      '/src/components/DietDayEditor.tsx',
    ]) {
      expect(sources[screen], `${screen}가 없습니다`).toBeDefined()
      expect(stripComments(sources[screen]!), `${screen}`).not.toMatch(/\brequestSync\s*\(/)
    }
  })

  it('식단 쓰기 함수 둘 다 예약한다', () => {
    const src = stripComments(sources['/src/lib/useDiet.ts']!)
    // mutateDietDay(변경) · removeDietDay(삭제) 둘 다 성공 후에 예약해야 한다
    expect((src.match(/\.then\(scheduleBackup\)/g) ?? []).length).toBe(2)
  })
})
