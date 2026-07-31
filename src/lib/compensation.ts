import { NO_COMPENSATION } from '../types'

/**
 * 보상작용은 `SessionEntry.compensation: string` 한 필드에 저장한다 (§3).
 * 입력은 종목별 체크리스트 + 자유 입력이므로, 그 둘을 문자열 하나로 접었다 펴야 한다.
 *
 * **빈 문자열이 되지 않게 하는 것이 규칙이다** — 루틴 문서가 보상작용 칸을 비워두는 것을
 * 금지한다. 아무것도 선택하지 않으면 "없음"이 된다 (기본값으로 마찰 없이 규칙 충족, §5.2).
 */

export const SEPARATOR = ', '

export interface CompensationValue {
  /** 종목 체크리스트에서 고른 항목 */
  signs: string[]
  /** 직접 입력 */
  free: string
}

export const EMPTY_COMPENSATION: CompensationValue = { signs: [], free: '' }

export function serializeCompensation(value: CompensationValue): string {
  const parts = [...value.signs, value.free.trim()].filter((p) => p.length > 0)
  return parts.length === 0 ? NO_COMPENSATION : parts.join(SEPARATOR)
}

export function parseCompensation(stored: string, knownSigns: string[]): CompensationValue {
  if (!stored || stored === NO_COMPENSATION) return EMPTY_COMPENSATION
  const known = new Set(knownSigns)
  const signs: string[] = []
  const rest: string[] = []
  for (const part of stored.split(SEPARATOR)) {
    const trimmed = part.trim()
    if (trimmed.length === 0) continue
    if (known.has(trimmed)) signs.push(trimmed)
    else rest.push(trimmed)
  }
  return { signs, free: rest.join(SEPARATOR) }
}

export function hasCompensation(stored: string): boolean {
  return Boolean(stored) && stored !== NO_COMPENSATION
}

/** 접힌 카드에 넣을 짧은 표기 */
export function compensationSummary(stored: string): string {
  if (!hasCompensation(stored)) return NO_COMPENSATION
  const parts = stored.split(SEPARATOR)
  return parts.length <= 1 ? parts[0] : `${parts[0]} +${parts.length - 1}`
}
