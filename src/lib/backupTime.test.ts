import { describe, expect, it } from 'vitest'
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

/*
 * **시간대를 mock하지 않는다.**
 *
 * 첫 버전은 `getTimezoneOffset`을 −540(KST)으로 스텁했다. 그런데 `formatDateTimeLocal`은
 * `getHours()`·`getDate()`를 쓰고 그것들은 스텁의 영향을 받지 않는다 — 그래서 **가드는
 * 가짜 오프셋을 읽고 포매터는 실제 시간대를 읽는** 상태가 됐다.
 * 내 기기(KST)에서는 우연히 일치해 통과했고, **UTC인 CI에서 깨졌다.**
 *
 * 피하려던 함정("환경을 가정한 테스트")을 mock으로 직접 만든 셈이다.
 * 이제 기대값과 가드를 **둘 다 실제 환경에서 파생**한다 — 어느 시간대에서 돌려도 맞다.
 */

/** 실행 환경의 로컬 시간으로 기대값을 만든다 (시간대를 가정하지 않는다) */
const expectedLocal = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/*
 * 가드가 둘이다 — **벽시계 차이와 날짜 차이는 다른 질문**이다.
 * 처음에 하나로 합쳤더니 America/New_York(−4)·Asia/Kolkata(+5:30)에서 깨졌다:
 * `15:30Z`는 그 시간대에서 **시각은 다르지만 날짜는 같다.**
 */

/** 로컬 벽시계가 UTC와 다른가 (`formatDateTimeLocal` 비교용) */
const clockDiffersFromUtc = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() !== d.getUTCHours() || d.getMinutes() !== d.getUTCMinutes()
}

/** 로컬 **날짜**가 UTC와 다른가 (`localDateOf` 비교용) */
const dateDiffersFromUtc = (iso: string) => new Date(iso).getDate() !== new Date(iso).getUTCDate()

describe('로컬 시각 변환', () => {
  it('UTC ISO를 로컬 표시로 바꾼다', () => {
    for (const iso of ['2026-08-04T23:56:50Z', '2026-08-05T00:30:00Z', '2026-01-01T12:00:00Z']) {
      expect(formatDateTimeLocal(iso), iso).toBe(expectedLocal(iso))
    }
  })

  it('UTC 문자열을 그대로 자르는 것과 다르다 (그게 이 결함이었다)', () => {
    // 실제 사건의 값. UTC로 자르면 "2026-08-04 23:56"이고 KST로는 8/5 08:56이다
    const iso = '2026-08-04T23:56:50Z'
    const naiveSlice = iso.slice(0, 16).replace('T', ' ')
    // 로컬 벽시계가 UTC와 다른 환경에서만 성립하는 비교다 (UTC 환경에서는 같은 게 정상)
    if (clockDiffersFromUtc(iso)) expect(formatDateTimeLocal(iso)).not.toBe(naiveSlice)
    else expect(formatDateTimeLocal(iso)).toBe(naiveSlice)
  })

  it('파싱 실패는 원문을 돌려준다 (표시가 사라지지 않게)', () => {
    expect(formatDateTimeLocal('없음')).toBe('없음')
    expect(formatDateTimeLocal('')).toBe('')
  })

  it('localDateOf는 로컬 날짜다', () => {
    const iso = '2026-08-04T23:56:50Z'
    expect(localDateOf(iso)).toBe(expectedLocal(iso).slice(0, 10))
  })

  /*
    이 두 테스트가 함수의 실제 결함을 잡았다. 처음엔 `'2026-08-04'`를 "파싱 실패" 사례로
    썼는데 그 문자열은 **파싱된다** — `new Date()`가 UTC 자정으로 읽어서 UTC−4에서는
    하루 밀렸다 (America/New_York에서 8/4 → 8/3). 이 코드베이스에서 `YYYY-MM-DD`는
    이미 로컬 날짜라는 규약이므로, 날짜만 있으면 그대로 돌려주도록 함수를 고쳤다.
  */
  it('날짜만 있는 문자열은 그대로 돌려준다 (이미 로컬 날짜다)', () => {
    expect(localDateOf('2026-08-04')).toBe('2026-08-04')
    expect(localDateOf(' 2026-12-31 ')).toBe('2026-12-31')
  })

  it('정말 파싱 못 하는 값은 앞 10자로 떨어진다', () => {
    expect(localDateOf('없음')).toBe('없음')
    expect(localDateOf('not-a-date-at-all')).toBe('not-a-date')
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
    // 날짜가 UTC와 갈리는 환경에서만 성립한다 (KST가 그렇다). UTC CI에서는 같은 게 정상
    if (dateDiffersFromUtc(iso)) expect(localDateOf(iso)).not.toBe(iso.slice(0, 10))
    else expect(localDateOf(iso)).toBe(iso.slice(0, 10))
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
