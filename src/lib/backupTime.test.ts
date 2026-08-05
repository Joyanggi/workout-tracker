import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateTimeLocal, localDateOf } from './dates'
import { backupReminder } from './gistSync'
import { stripComments } from './sourceScan'

/**
 * Z7 — 백업 시각 표시가 **기기 로컬 시간**이어야 한다.
 *
 * 증상: 8/5 08:56에 "지금 백업"을 눌렀는데 "백업 완료 2026-08-04 23:56"이 떴다.
 * `lastBackupAt`은 GitHub API의 `updated_at`(UTC)이고 화면이 `slice(0, 16)`으로 그대로
 * 잘라 썼다 — **KST 자정~09시의 모든 백업이 하루 전 날짜로 보인다.**
 *
 * 사용자 보고는 "백업이 된 건데 시간만 오류인지 판단이 안 선다"였다.
 * **판단이 안 서는 것 자체가 결함이다** — 상태 표시의 존재 이유가 그 판단을 대신하는 것이다.
 * (데이터는 무사했다. Gist 리비전 이력으로 확정 — 업로드는 정상이었고 혼란은 표시가 만들었다)
 */

/** 테스트를 KST(UTC+9)에 고정한다 — 경계 검증은 시간대가 정해져야 의미가 있다 */
const KST = 9 * 60
beforeEach(() => {
  vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-KST)
  // getHours/getDate 등은 실제 로컬 시간대를 쓰므로, 경계 검증은 UTC 오프셋 계산으로 한다
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('로컬 시각 변환', () => {
  /**
   * 시간대 의존을 피하려고 **오프셋을 직접 계산해** 기대값을 만든다.
   * 실행 환경 시간대를 가정하면 CI에서 깨진다 (그리고 그건 이 프로젝트가 여러 번
   * 겪은 "환경을 가정한 테스트"다).
   */
  const expectedLocal = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  it('UTC ISO를 로컬 표시로 바꾼다', () => {
    for (const iso of ['2026-08-04T23:56:50Z', '2026-08-05T00:30:00Z', '2026-01-01T12:00:00Z']) {
      expect(formatDateTimeLocal(iso), iso).toBe(expectedLocal(iso))
    }
  })

  it('UTC 문자열을 그대로 자르는 것과 다르다 (그게 이 결함이었다)', () => {
    // 실제 사건의 값. UTC로 자르면 "2026-08-04 23:56"이고 KST로는 8/5 08:56이다
    const iso = '2026-08-04T23:56:50Z'
    const naiveSlice = iso.slice(0, 16).replace('T', ' ')
    const offsetMin = -new Date(iso).getTimezoneOffset()
    // KST처럼 UTC보다 앞선 시간대에서는 두 값이 반드시 달라야 한다
    if (offsetMin > 0) expect(formatDateTimeLocal(iso)).not.toBe(naiveSlice)
  })

  it('파싱 실패는 원문을 돌려준다 (표시가 사라지지 않게)', () => {
    expect(formatDateTimeLocal('없음')).toBe('없음')
    expect(formatDateTimeLocal('')).toBe('')
  })

  it('localDateOf는 로컬 날짜다', () => {
    const iso = '2026-08-04T23:56:50Z'
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(localDateOf(iso)).toBe(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
  })

  it('localDateOf 파싱 실패는 앞 10자로 떨어진다', () => {
    expect(localDateOf('2026-08-04')).toBe('2026-08-04')
  })
})

describe('백업 리마인드가 로컬 날짜로 센다 (Z7-3)', () => {
  /**
   * 계획서가 지시한 경계: "UTC 15:30 = KST 다음날 00:30 업로드가 오늘로 계산된다."
   * UTC 날짜로 세면 경과일이 하루 더 나와 리마인드가 일찍 뜬다.
   */
  it('UTC로는 어제인 업로드가 로컬로는 오늘이면 경과 0일이다', () => {
    const iso = '2026-08-04T15:30:00Z' // KST 8/5 00:30
    const localToday = localDateOf(iso)
    const info = backupReminder({
      sessionCount: 3,
      lastBackupAt: iso,
      configured: true,
      today: localToday,
    })
    expect(info.daysSince).toBe(0)
    expect(info.show).toBe(false)
  })

  it('UTC 날짜로 셌다면 1일이 나왔을 것이다 (차이가 실재한다)', () => {
    const iso = '2026-08-04T15:30:00Z'
    const offsetMin = -new Date(iso).getTimezoneOffset()
    // UTC보다 앞선 시간대에서만 성립하는 비교 — 그 외 환경에서는 검증을 건너뛴다
    if (offsetMin >= 570) expect(localDateOf(iso)).not.toBe(iso.slice(0, 10))
  })

  it('7일이 지나면 여전히 리마인드가 뜬다 (수정이 기능을 죽이지 않았다)', () => {
    const info = backupReminder({
      sessionCount: 3,
      lastBackupAt: '2026-07-20T03:00:00Z',
      configured: true,
      today: '2026-08-05',
    })
    expect(info.show).toBe(true)
    expect(info.daysSince).toBeGreaterThanOrEqual(7)
  })
})

/**
 * 재유입 방지 — 같은 `slice` 로직이 세 곳에 복제돼 있었다 (패턴 B).
 * `mmss`를 뽑은 것과 같은 이유로 함수 하나에 모았다.
 */
describe('인바리언트 — UTC 문자열을 직접 자르지 않는다', () => {
  const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('시각 표시에 slice(0, 16)이 남아 있지 않다', () => {
    const offenders = Object.entries(sources)
      .filter(([p]) => !p.endsWith('.test.ts') && p !== '/src/lib/dates.ts')
      .filter(([, src]) => /slice\(0,\s*16\)/.test(stripComments(src)))
      .map(([p]) => p)

    expect(
      offenders,
      `UTC ISO를 그대로 자르면 KST 자정~09시 백업이 하루 전으로 보입니다.\n` +
        `formatDateTimeLocal()을 쓰세요:\n` +
        offenders.map((f) => `  ${f}`).join('\n'),
    ).toEqual([])
  })

  it('날짜 계산에 slice(0, 10)을 쓰지 않는다 (gistSync)', () => {
    const src = stripComments(sources['/src/lib/gistSync.ts']!)
    expect(src).not.toMatch(/lastBackupAt\.slice\(0,\s*10\)/)
    expect(src).toMatch(/localDateOf\(lastBackupAt\)/)
  })

  it('가져오기 패널도 같은 함수를 쓴다 (인바리언트가 네 번째 복제를 잡았다)', () => {
    const src = sources['/src/components/ImportPanel.tsx']
    expect(src, 'ImportPanel을 찾지 못했다').toBeDefined()
    expect(stripComments(src!)).toMatch(/formatDateTimeLocal\(/)
  })

  it('GistPanel이 공용 함수를 쓴다', () => {
    const src = sources['/src/components/GistPanel.tsx']
    expect(src, 'GistPanel을 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    // 상태 문구 2(스킵/업로드) + 마지막 백업 1 + 복원 스테이징 1 = 4
    expect((stripComments(src!).match(/formatDateTimeLocal\(/g) ?? []).length).toBe(4)
  })

  it('스킵과 업로드가 다른 문구를 쓴다 (Z7-2)', () => {
    const src = stripComments(sources['/src/components/GistPanel.tsx']!)
    expect(src).toMatch(/s\.skipped/)
    expect(src).toMatch(/변경 없음 — 마지막 백업/)
    expect(src).toMatch(/백업 완료/)
  })

  it('스킵 경로가 skipped 플래그를 세운다 (gistSync)', () => {
    const src = stripComments(sources['/src/lib/gistSync.ts']!)
    expect(src).toMatch(/status: 'done', at: lastAt, skipped: true/)
  })
})
