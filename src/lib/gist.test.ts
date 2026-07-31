import { afterEach, describe, expect, it, vi } from 'vitest'
import { GIST_FILENAME, GistError, createGist, readGist, updateGist, verifyToken } from './gist'
import { backupReminder, BACKUP_REMINDER_DAYS } from './gistSync'

/**
 * 테스트에는 실제 토큰이 없다. 전부 더미 문자열이고 fetch는 모킹한다.
 * (§11: "토큰은 코드에 없음")
 */
const TOKEN = 'test-token-not-real'

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

function mockFetch(handler: FetchHandler) {
  const spy = vi.fn<FetchHandler>(handler)
  vi.stubGlobal('fetch', spy)
  return spy
}

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Gist 생성/수정', () => {
  it('secret gist로 만든다 (public: false)', async () => {
    let sentBody: string | undefined
    const spy = mockFetch((_url, init) => {
      sentBody = init?.body as string
      return json({ id: 'g1', updated_at: '2026-08-05T10:00:00Z', html_url: 'https://gist.github.com/g1', files: {} })
    })

    const info = await createGist(TOKEN, '{"a":1}')
    expect(info).toEqual({
      gistId: 'g1',
      updatedAt: '2026-08-05T10:00:00Z',
      htmlUrl: 'https://gist.github.com/g1',
    })
    const parsed = JSON.parse(sentBody!)
    expect(parsed.public).toBe(false)
    expect(Object.keys(parsed.files)).toEqual([GIST_FILENAME])
    expect(spy.mock.calls[0][0]).toBe('https://api.github.com/gists')
  })

  it('수정은 PATCH /gists/:id', async () => {
    const spy = mockFetch(() =>
      json({ id: 'g1', updated_at: '2026-08-06T10:00:00Z', html_url: 'u', files: {} }),
    )
    await updateGist(TOKEN, 'g1', '{}')
    expect(spy.mock.calls[0][0]).toBe('https://api.github.com/gists/g1')
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('PATCH')
  })

  it('토큰은 Authorization 헤더로만 전달되고 본문/URL에 들어가지 않는다', async () => {
    let capturedUrl = ''
    let capturedBody = ''
    const spy = mockFetch((url, init) => {
      capturedUrl = url
      capturedBody = (init?.body as string) ?? ''
      return json({ id: 'g1', updated_at: 'x', html_url: 'u', files: {} })
    })
    await createGist(TOKEN, '{"sessions":[]}')
    expect(capturedUrl).not.toContain(TOKEN)
    expect(capturedBody).not.toContain(TOKEN)
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })
})

describe('Gist 읽기 — 1MB 절단 처리', () => {
  it('잘리지 않았으면 content를 그대로 쓴다', async () => {
    mockFetch(() =>
      json({
        id: 'g1',
        updated_at: 'x',
        html_url: 'u',
        files: { [GIST_FILENAME]: { content: '{"ok":true}', truncated: false } },
      }),
    )
    const { content } = await readGist(TOKEN, 'g1')
    expect(content).toBe('{"ok":true}')
  })

  it('truncated면 raw_url에서 전체를 다시 받는다', async () => {
    // 이 처리가 없으면 "복원했는데 최근 기록이 없다"가 된다 — 조용히 데이터를 잃는 실패다.
    // 백업은 세션당 ~9KB라 100세션쯤에서 1MB에 도달한다.
    const full = JSON.stringify({ sessions: Array.from({ length: 3 }, (_, i) => ({ id: i })) })
    const spy = mockFetch((url) => {
      if (url.startsWith('https://api.github.com')) {
        return json({
          id: 'g1',
          updated_at: 'x',
          html_url: 'u',
          files: {
            [GIST_FILENAME]: { content: '{"sessions":[{"id":0}', truncated: true, raw_url: 'https://raw/x' },
          },
        })
      }
      return new Response(full, { status: 200 })
    })
    const { content } = await readGist(TOKEN, 'g1')
    expect(content).toBe(full)
    expect(JSON.parse(content).sessions).toHaveLength(3)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('raw_url까지 실패하면 조용히 넘기지 않고 에러를 던진다', async () => {
    mockFetch((url) => {
      if (url.startsWith('https://api.github.com')) {
        return json({
          id: 'g1',
          updated_at: 'x',
          html_url: 'u',
          files: { [GIST_FILENAME]: { content: '잘린', truncated: true, raw_url: 'https://raw/x' } },
        })
      }
      return new Response('nope', { status: 500 })
    })
    await expect(readGist(TOKEN, 'g1')).rejects.toThrow(GistError)
  })

  it('백업 파일이 없는 gist면 무엇이 잘못됐는지 알려준다', async () => {
    mockFetch(() => json({ id: 'g1', updated_at: 'x', html_url: 'u', files: { 'other.txt': { content: 'x' } } }))
    await expect(readGist(TOKEN, 'g1')).rejects.toThrow(/파일이 없습니다/)
  })
})

describe('에러 매핑 — 사용자가 무엇을 해야 하는지 알 수 있게', () => {
  const cases: { status: number; headers?: Record<string, string>; kind: string; match: RegExp }[] = [
    { status: 401, kind: 'auth', match: /토큰이 유효하지 않습니다/ },
    { status: 403, kind: 'scope', match: /gist 권한/ },
    { status: 403, headers: { 'x-ratelimit-remaining': '0' }, kind: 'rateLimit', match: /한도를 초과/ },
    { status: 404, kind: 'notFound', match: /찾을 수 없습니다/ },
    { status: 500, kind: 'unknown', match: /GitHub 오류 500/ },
  ]

  for (const c of cases) {
    it(`${c.status}${c.headers ? ' (rate limit)' : ''} → ${c.kind}`, async () => {
      mockFetch(() => json({ message: 'Bad credentials' }, { status: c.status, headers: c.headers }))
      await expect(createGist(TOKEN, '{}')).rejects.toMatchObject({ kind: c.kind })
      mockFetch(() => json({ message: 'Bad credentials' }, { status: c.status, headers: c.headers }))
      await expect(createGist(TOKEN, '{}')).rejects.toThrow(c.match)
    })
  }

  it('네트워크 실패는 토큰 문제와 구분한다', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(createGist(TOKEN, '{}')).rejects.toMatchObject({ kind: 'network' })
  })

  it('에러 메시지에 토큰이 들어가지 않는다', async () => {
    mockFetch(() => json({ message: 'Bad credentials' }, { status: 401 }))
    await createGist(TOKEN, '{}').catch((err: GistError) => {
      expect(err.message).not.toContain(TOKEN)
    })
  })
})

describe('토큰 확인', () => {
  it('classic PAT은 x-oauth-scopes로 gist 권한을 확인한다', async () => {
    mockFetch(() => json({ login: 'someone' }, { headers: { 'x-oauth-scopes': 'gist, read:user' } }))
    await expect(verifyToken(TOKEN)).resolves.toEqual({ login: 'someone', hasGistScope: true })

    mockFetch(() => json({ login: 'someone' }, { headers: { 'x-oauth-scopes': 'repo' } }))
    await expect(verifyToken(TOKEN)).resolves.toEqual({ login: 'someone', hasGistScope: false })
  })

  it('fine-grained PAT은 스코프 헤더가 없어 판단 불가(null)', async () => {
    mockFetch(() => json({ login: 'someone' }))
    await expect(verifyToken(TOKEN)).resolves.toEqual({ login: 'someone', hasGistScope: null })
  })
})

describe('백업 리마인드 (§11)', () => {
  const today = '2026-08-20'

  it('기록이 없으면 띄우지 않는다 (잃을 것이 없다)', () => {
    expect(backupReminder({ sessionCount: 0, lastBackupAt: null, configured: false, today }).show).toBe(false)
  })

  it('설정하지 않았고 기록이 있으면 띄운다', () => {
    const r = backupReminder({ sessionCount: 3, lastBackupAt: null, configured: false, today })
    expect(r).toMatchObject({ show: true, configured: false, daysSince: null })
  })

  it('7일 이상 지나면 띄운다', () => {
    const before = backupReminder({
      sessionCount: 3,
      lastBackupAt: '2026-08-14T10:00:00Z',
      configured: true,
      today,
    })
    expect(before).toMatchObject({ show: false, daysSince: 6 })

    const after = backupReminder({
      sessionCount: 3,
      lastBackupAt: '2026-08-13T10:00:00Z',
      configured: true,
      today,
    })
    expect(after).toMatchObject({ show: true, daysSince: BACKUP_REMINDER_DAYS })
  })
})
