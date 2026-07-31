/**
 * GitHub Gist API 클라이언트 (DESIGN.md §5.5).
 * "PAT 입력 → private gist 자동 생성, 이후 세션 종료마다 debounce 동기화"
 *
 * §11: "토큰은 코드에 없음, 사용자 입력 후 localStorage만."
 * 이 파일에는 토큰 문자열이 하나도 없다. 전부 인자로 받는다.
 *
 * **토큰을 로그에 남기지 않는다.** 에러 메시지는 status와 GitHub의 message만 담는다.
 * 토큰은 헤더에만 들어가고 어떤 경로로도 문자열에 합성되지 않는다.
 */

const API = 'https://api.github.com'
const FILENAME = 'workout-tracker-backup.json'
const DESCRIPTION = 'workout-tracker 백업 (앱이 자동 생성)'

export type GistErrorKind = 'auth' | 'scope' | 'notFound' | 'rateLimit' | 'network' | 'unknown'

export class GistError extends Error {
  constructor(
    message: string,
    readonly kind: GistErrorKind,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GistError'
  }
}

export interface GistInfo {
  gistId: string
  updatedAt: string
  htmlUrl: string
}

interface GistFile {
  truncated?: boolean
  content?: string
  raw_url?: string
}

interface GistResponse {
  id: string
  updated_at: string
  html_url: string
  files: Record<string, GistFile | undefined>
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

/** GitHub 응답을 사용자가 무엇을 해야 하는지 알 수 있는 에러로 바꾼다 */
async function toError(res: Response): Promise<GistError> {
  let apiMessage = ''
  try {
    const body = (await res.json()) as { message?: string }
    apiMessage = body?.message ?? ''
  } catch {
    /* 본문이 JSON이 아닐 수 있다 */
  }

  if (res.status === 401) {
    return new GistError('토큰이 유효하지 않습니다. 새 토큰을 발급해 주세요.', 'auth', 401)
  }
  if (res.status === 403) {
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      return new GistError('GitHub API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.', 'rateLimit', 403)
    }
    return new GistError(
      `권한이 없습니다. 토큰에 gist 권한이 있는지 확인하세요. (${apiMessage})`,
      'scope',
      403,
    )
  }
  if (res.status === 404) {
    return new GistError(
      'Gist를 찾을 수 없습니다. 삭제됐거나 다른 계정의 토큰일 수 있습니다.',
      'notFound',
      404,
    )
  }
  return new GistError(`GitHub 오류 ${res.status}${apiMessage ? `: ${apiMessage}` : ''}`, 'unknown', res.status)
}

async function send(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<GistResponse> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: headers(token) })
  } catch {
    // 네트워크 실패는 헬스장에서 흔하다. 토큰 문제와 구분해서 알려야 한다
    throw new GistError('네트워크에 연결할 수 없습니다.', 'network')
  }
  if (!res.ok) throw await toError(res)
  return (await res.json()) as GistResponse
}

function toInfo(res: GistResponse): GistInfo {
  return { gistId: res.id, updatedAt: res.updated_at, htmlUrl: res.html_url }
}

function body(content: string): string {
  return JSON.stringify({
    description: DESCRIPTION,
    // secret gist — URL을 아는 사람만 볼 수 있다. GitHub에 완전 비공개 gist는 없다
    public: false,
    files: { [FILENAME]: { content } },
  })
}

/** 토큰 확인. 저장 전에 계정을 보여주기 위한 것 */
export async function verifyToken(token: string): Promise<{ login: string; hasGistScope: boolean | null }> {
  let res: Response
  try {
    res = await fetch(`${API}/user`, { headers: headers(token) })
  } catch {
    throw new GistError('네트워크에 연결할 수 없습니다.', 'network')
  }
  if (!res.ok) throw await toError(res)
  const user = (await res.json()) as { login: string }
  // classic PAT만 이 헤더를 준다. fine-grained PAT은 null → 실제 호출로 판단할 수밖에 없다
  const scopeHeader = res.headers.get('x-oauth-scopes')
  const hasGistScope =
    scopeHeader === null ? null : scopeHeader.split(',').some((s) => s.trim() === 'gist')
  return { login: user.login, hasGistScope }
}

export async function createGist(token: string, content: string): Promise<GistInfo> {
  return toInfo(await send(token, '/gists', { method: 'POST', body: body(content) }))
}

export async function updateGist(token: string, gistId: string, content: string): Promise<GistInfo> {
  return toInfo(
    await send(token, `/gists/${gistId}`, { method: 'PATCH', body: body(content) }),
  )
}

/**
 * Gist 내용 읽기.
 *
 * **1MB를 넘으면 API 응답의 content가 잘린다** (`truncated: true`). 세션이 쌓이면
 * 백업 파일은 반드시 1MB를 넘는다(현재 38KB, 세션당 ~9KB → 100세션쯤에서 도달).
 * 잘린 내용을 그대로 파싱하면 "복원했는데 최근 기록이 없다"가 된다 —
 * 조용히 데이터를 잃는 최악의 실패다. raw_url로 전체를 다시 받는다.
 */
export async function readGist(token: string, gistId: string): Promise<{ content: string; info: GistInfo }> {
  const res = await send(token, `/gists/${gistId}`)
  const file = res.files[FILENAME]
  if (!file) {
    throw new GistError(
      `Gist에 ${FILENAME} 파일이 없습니다. 다른 gist를 가리키고 있을 수 있습니다.`,
      'notFound',
    )
  }

  if (file.truncated && file.raw_url) {
    try {
      const raw = await fetch(file.raw_url)
      if (!raw.ok) throw new Error(String(raw.status))
      return { content: await raw.text(), info: toInfo(res) }
    } catch {
      throw new GistError('Gist 내용이 커서 전체를 받지 못했습니다.', 'network')
    }
  }

  if (typeof file.content !== 'string') {
    throw new GistError('Gist 내용을 읽을 수 없습니다.', 'unknown')
  }
  return { content: file.content, info: toInfo(res) }
}

export const GIST_FILENAME = FILENAME
