import type { CardioRecord } from '../types'

/** 유산소 종류 목록 — 세션 종료 시트와 기록 편집이 같이 쓴다 (LL4) */
export const CARDIO_TYPES = [
  { name: '마이마운틴', intensityHint: '25/3.8' },
  { name: '천국의 계단', intensityHint: '4단계' },
  { name: '자전거', intensityHint: '레벨 8' },
  { name: '트레드밀', intensityHint: '6km/h' },
  { name: '기타', intensityHint: '강도' },
] as const

/** 목록에 없는 종류(옛 기록·가져오기)는 '강도' */
export function intensityHintFor(type: string): string {
  return CARDIO_TYPES.find((t) => t.name === type)?.intensityHint ?? '강도'
}

/** 유산소 한 줄 — 내보내기·기록 탭·요약이 같이 쓴다 */
export function cardioText(c: CardioRecord): string {
  const intensity = c.note?.trim()
  return intensity ? `${c.type} · 강도 ${intensity} · ${c.minutes}분` : `${c.type} ${c.minutes}분`
}
