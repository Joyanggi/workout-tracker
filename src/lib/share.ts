/**
 * 내보내기 전달 경로 (DESIGN.md §5.5).
 * "iOS 공유 시트(navigator.share) 우선, 폴백은 파일 다운로드"
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed'

function download(filename: string, text: string, mimeType: string): ShareOutcome {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    // 즉시 revoke하면 Safari에서 다운로드가 시작되기 전에 URL이 사라진다
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

function canShareFiles(files: File[]): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files })
}

/**
 * 파일로 공유 (JSON 백업).
 * 파일을 iOS "파일" 앱이나 iCloud에 그대로 넣을 수 있어야 하므로 파일 공유가 1순위다.
 */
export async function shareFile(args: {
  filename: string
  text: string
  mimeType: string
  title: string
}): Promise<ShareOutcome> {
  const { filename, text, mimeType, title } = args
  try {
    const file = new File([text], filename, { type: mimeType })
    if (canShareFiles([file])) {
      await navigator.share({ files: [file], title })
      return 'shared'
    }
  } catch (err) {
    // 사용자가 공유 시트를 닫으면 AbortError — 실패가 아니다
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
  }
  return download(filename, text, mimeType)
}

/**
 * 텍스트로 공유 (Markdown).
 *
 * Markdown은 **LLM 대화창에 붙여넣는 것이 목적**(§1)이므로 파일보다 텍스트 공유가 낫다.
 * 파일로 주면 사용자가 다시 열어서 전체 선택해 복사해야 한다.
 */
export async function shareText(args: {
  text: string
  title: string
  /** 공유가 불가능할 때 내려받을 파일명 */
  filename: string
}): Promise<ShareOutcome> {
  const { text, title, filename } = args
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text, title })
      return 'shared'
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
  }
  const copied = await copyText(text)
  return copied ? 'copied' : download(filename, text, 'text/markdown')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const OUTCOME_MESSAGE: Record<ShareOutcome, string> = {
  shared: '공유 시트를 열었습니다',
  downloaded: '파일로 저장했습니다',
  copied: '클립보드에 복사했습니다',
  cancelled: '취소했습니다',
  failed: '실패했습니다',
}
