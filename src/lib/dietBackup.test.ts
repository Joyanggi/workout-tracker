import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SYNC_DEBOUNCE_MS } from './gistSync'
import { fingerprintPayload } from './backup'
import { stripComments } from './sourceScan'

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

/**
 * Y4 — 같은 내용을 다시 올리지 않는다 (리뷰 승인).
 *
 * X7이 식단 쓰기마다 동기화를 예약하면서 업로드 빈도가 크게 올랐다. 매 업로드가 전체
 * 백업(수십 KB)이므로 같은 내용 재업로드는 순수한 낭비다.
 *
 * **함정이 하나 있었다**: 백업 파일 전체를 해시하면 영원히 달라진다 — `exportedAt`이 매
 * 호출마다 바뀌고 `settings`에 업로드마다 갱신되는 부기 키가 들어 있다. 그것들을 빼야
 * "사용자 데이터가 바뀌었는가"를 물을 수 있다.
 */
describe('Y4 — 백업 지문', () => {
  const row = (key: string, value: unknown) => ({ key, value })
  const base = () => ({
    app: 'workout-tracker',
    schemaVersion: 3,
    exportedAt: '2026-08-08T10:00:00.000Z',
    routines: [],
    exercises: [],
    sessions: [],
    settings: [row('currentPhase', 0), row('gistId', 'abc'), row('lastBackupAt', '2026-08-08T09:00:00.000Z')],
    exerciseNotes: [],
    dietPlans: [],
    dietDays: [],
  })

  it('내보낸 시각이 달라도 지문은 같다', () => {
    const a = fingerprintPayload(base() as never)
    const b = fingerprintPayload({ ...base(), exportedAt: '2026-08-09T23:59:00.000Z' } as never)
    expect(a).toBe(b)
  })

  it('동기화 부기 키가 달라도 지문은 같다 (업로드마다 바뀌는 값들)', () => {
    const changed = {
      ...base(),
      settings: [
        row('currentPhase', 0),
        row('gistId', 'zzz'),
        row('lastBackupAt', '2026-08-09T09:00:00.000Z'),
        row('lastBackupHash', 'deadbeef'),
      ],
    }
    expect(fingerprintPayload(changed as never)).toBe(fingerprintPayload(base() as never))
  })

  it('사용자 데이터가 바뀌면 지문이 달라진다', () => {
    const withDiet = { ...base(), dietDays: [{ date: '2026-08-08', planId: 'cut-1800', isTrainingDay: false, slots: {} }] }
    expect(fingerprintPayload(withDiet as never)).not.toBe(fingerprintPayload(base() as never))
  })

  it('실제 설정이 바뀌면 지문이 달라진다 (부기 키만 무시한다)', () => {
    const phase = { ...base(), settings: [row('currentPhase', 2), row('gistId', 'abc'), row('lastBackupAt', '2026-08-08T09:00:00.000Z')] }
    expect(fingerprintPayload(phase as never)).not.toBe(fingerprintPayload(base() as never))
  })

  it('설정 순서가 흔들려도 지문은 같다 (불필요한 업로드 방지)', () => {
    const reordered = { ...base(), settings: [...base().settings].reverse() }
    expect(fingerprintPayload(reordered as never)).toBe(fingerprintPayload(base() as never))
  })

  it('건너뛰기는 보수적이다 — 지문 실패·gist 없음·시각 없음이면 올린다', () => {
    const src = stripComments(
      (import.meta.glob('/src/lib/gistSync.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
        '/src/lib/gistSync.ts'
      ]!,
    )
    // 세 가지 안전 조건이 모두 코드에 있어야 한다
    expect(src).toMatch(/existingId && fingerprint !== null/)
    expect(src).toMatch(/lastAt !== null/)
    // 대체 해시를 두지 않는다 — 충돌이 "실제 변경을 건너뛰는" 사고가 된다
    expect(src).toMatch(/SHA-256/)
    expect(src).not.toMatch(/fnv|djb2|charCodeAt/i)
  })
})
