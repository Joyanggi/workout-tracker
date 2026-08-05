import type { RecordKey, Session } from '../types'
import { NO_COMPENSATION } from '../types'
import { completedSessions } from './derive'
import { hasCompensation } from './compensation'

/**
 * 종목별 메모 이력 (CC14) — **새 저장소를 만들지 않는다.**
 *
 * 피드백: "운동마다 메모를 남긴 날과 내용이 이력으로 남으면 좋겠다."
 *
 * **데이터는 이미 쌓이고 있었다.** 세션 entry의 감각 메모(`sensoryNote`)가 날짜(세션)와
 * 함께 저장된다 — 없는 것은 그것을 이력으로 **보여주는 화면**뿐이었다. 파생 비저장
 * 원칙이 여기서 배당을 준 셈이다.
 *
 * 머신 세팅 메모(`exerciseNotes`)는 성격이 다르다: "시트 3칸"은 이력이 아니라 **현재 상태**
 * 하나이고, 그래서 이력에 섞지 않는다.
 *
 * 보상작용도 함께 싣는다 — 같은 종목에서 반복되는 "허리 젖힘" 같은 기록이 메모와 같은
 * 축(그 날 그 종목에서 무슨 일이 있었나)이고, LLM 내보내기로 돌아오던 피드백 루프를
 * 현장에서 바로 보는 것이 이 항목의 목적이다.
 */

export interface NoteEntry {
  sessionId: string
  date: string
  /** 감각 메모 (없으면 undefined) */
  note?: string
  /** 감각 점수 0~3 (B그룹만 입력된다) */
  sensoryScore?: 0 | 1 | 2 | 3
  /** 보상작용 ('없음'은 제외돼 여기 오지 않는다) */
  compensation?: string
}

/**
 * 그 종목의 메모·보상작용 이력, **최신순**.
 *
 * 아무것도 적지 않은 세션은 목록에 넣지 않는다 — 빈 줄이 이력을 길게 만들면 실제로
 * 적은 것을 찾기 어려워진다. 완료 세션만 본다 (진행 중 세션의 메모는 아직 "이력"이 아니다).
 */
export function noteHistory(sessions: Session[], recordKey: RecordKey): NoteEntry[] {
  const out: NoteEntry[] = []
  for (const session of completedSessions(sessions)) {
    const entry = session.entries.find((e) => e.recordKey === recordKey)
    if (!entry) continue
    const note = entry.sensoryNote?.trim()
    const compensation = hasCompensation(entry.compensation) ? entry.compensation : undefined
    if (!note && !compensation) continue
    out.push({
      sessionId: session.id,
      date: session.date,
      ...(note ? { note } : {}),
      ...(entry.sensoryScore !== undefined ? { sensoryScore: entry.sensoryScore } : {}),
      ...(compensation ? { compensation } : {}),
    })
  }
  // 완료 세션 목록이 최신순이라는 것에 기대지 않고 날짜로 정렬한다
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/**
 * 카드에 띄울 **직전 메모 한 줄** (CC14-1).
 *
 * 세션 현장에서 보이는 것이 이 항목의 핵심이다 — '리어델트에서 목에 긴장' 같은 메모가
 * 내보내기·LLM을 한 바퀴 돌아 다음 세션에 기억으로만 남던 것을, 그 종목을 펼치는 순간
 * 화면이 말해 준다.
 *
 * 보상작용만 있는 세션도 후보다 (그것도 "지난번에 있었던 일"이다).
 */
export function lastNote(sessions: Session[], recordKey: RecordKey): NoteEntry | undefined {
  return noteHistory(sessions, recordKey)[0]
}

/** 한 줄 표기 — 카드와 이력 화면이 같은 말을 쓴다 */
export function noteLineText(entry: NoteEntry): string {
  const parts: string[] = []
  if (entry.note) parts.push(entry.note)
  if (entry.compensation && entry.compensation !== NO_COMPENSATION) {
    parts.push(`보상작용: ${entry.compensation}`)
  }
  return parts.join(' · ')
}
