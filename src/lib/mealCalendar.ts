import type { DietPlan, DietSlot } from '../types'

/**
 * 식사 알림 → iOS 캘린더 위임 (Z4).
 *
 * **앱이 스스로 예약 알림을 울릴 방법이 없다** (T6 조사와 같은 계열): 로컬 예약 알림 API
 * (Notification Triggers)는 폐기됐고, Web Push는 서버가 매일 정시에 쏴줘야 한다 —
 * 무서버가 이 프로젝트의 전제다. 앱 안에 "알림 켜기" 토글을 만들면 **켜져 있는데 안 울리는
 * 거짓 UI**가 된다. 그래서 알림은 캘린더에 위임하고, 앱은 그 일정을 만들어 준다.
 *
 * 순수 함수로 두는 이유: RRULE·VALARM·이스케이프·UID 고정성은 눈으로 확인할 수 없고
 * 실기기에서 가져오기를 해봐야 알 수 있다 — 그 전에 형식을 테스트로 잠근다.
 */

/** RFC 5545 §3.3.11 — 쉼표·세미콜론·역슬래시·개행을 이스케이프한다 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * `"07:30"` → `{ h: 7, m: 30 }`. 형식이 어긋나면 `null`.
 *
 * **범위 표기도 받는다** (`"15:00~16:00"` → 15:00). 보충 블록의 `timeHint`가 범위이고,
 * 그게 바로 사용자가 "까먹는다"고 한 슬롯이다 — 첫 구현에서 이 형식을 놓쳐 **가장 필요한
 * 알림이 안 만들어졌다** (시드를 읽어 보고 발견했다). 시작 시각에 울리는 것이 맞다:
 * 범위의 끝에 울리면 이미 지난 알림이 된다.
 *
 * 시드 JSON이 바뀌어도(문서 교체) 앱이 죽지 않아야 하므로 파싱 실패를 값으로 다룬다.
 */
export function parseTimeHint(hint: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hint.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return { h, m: min }
}

/**
 * 훈련일·휴식일 슬롯의 합집합.
 *
 * `shake`(보충 블록)는 **휴식일 목록에만** 있다 — 훈련일에는 훈련 전·직후로 나뉘기 때문이다.
 * `plan.slots`만 보면 사용자가 가장 원한 슬롯이 목록에 나타나지 않는다.
 */
export function allSlots(plan: DietPlan): DietSlot[] {
  const byId = new Map<string, DietSlot>()
  for (const slot of [...plan.slots, ...plan.restDaySlots]) {
    if (!byId.has(slot.id)) byId.set(slot.id, slot)
  }
  return [...byId.values()]
}

/**
 * 슬롯 하나의 UID. **슬롯 id로 고정한다** — 같은 슬롯을 다시 내보내면 같은 UID다.
 *
 * 다만 iOS 캘린더 가져오기는 UID가 같아도 갱신이 아니라 **중복 생성**될 수 있다.
 * 그래서 안내 문구가 "시간을 바꿔 다시 내보냈다면 기존 알림을 지우고 추가하세요"를 말한다 —
 * 코드가 보장할 수 없는 것은 UI가 말해야 한다.
 */
export function slotUid(planId: string, slotId: string): string {
  return `${slotId}.${planId}@workout-tracker`
}

/** 품목 요약 — 제목에 붙여 "무엇을 먹는 시간인지"를 알림에서 바로 보이게 한다 */
function itemSummary(slot: DietSlot): string {
  const names = slot.items.map((i) => i.name)
  if (names.length === 0) return ''
  // 셋을 넘으면 잘라낸다 — 알림 제목이 잘리면 시각 정보가 먼저 사라진다
  const shown = names.slice(0, 3).join('·')
  return names.length > 3 ? `${shown} 외 ${names.length - 3}` : shown
}

/**
 * 선택한 슬롯들의 **매일 반복** VEVENT + VALARM(정시)을 담은 .ics 본문.
 *
 * `DTSTART`에 날짜를 넣지 않고 `TZID` 없이 로컬 시간(floating time)으로 쓴다 —
 * 시간대를 박으면 여행 중에 어긋나고, 이 알림은 "그 지역의 07:30"이 맞다.
 */
export function buildMealIcs(args: {
  plan: DietPlan
  slotIds: string[]
  /** 반복 시작일 (YYYY-MM-DD). 보통 오늘 */
  from: string
  /** 파일 안의 DTSTAMP — 호출부가 넘긴다 (테스트 결정성) */
  stamp: string
}): string {
  const { plan, slotIds, from, stamp } = args
  const dateBase = from.replace(/-/g, '')

  const events = allSlots(plan)
    .filter((slot) => slotIds.includes(slot.id))
    .flatMap((slot) => {
      const time = parseTimeHint(slot.timeHint)
      // 시각을 못 읽으면 이벤트를 만들지 않는다 — 엉뚱한 시간에 울리는 것보다 없는 게 낫다
      if (!time) return []
      const hhmm = `${String(time.h).padStart(2, '0')}${String(time.m).padStart(2, '0')}00`
      const summary = itemSummary(slot)
      return [
        [
          'BEGIN:VEVENT',
          `UID:${slotUid(plan.id, slot.id)}`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${dateBase}T${hhmm}`,
          'DURATION:PT15M',
          'RRULE:FREQ=DAILY',
          `SUMMARY:${escapeIcsText(summary ? `${slot.name} — ${summary}` : slot.name)}`,
          'BEGIN:VALARM',
          'TRIGGER:PT0S',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeIcsText(slot.name)}`,
          'END:VALARM',
          'END:VEVENT',
        ].join('\r\n'),
      ]
    })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//workout-tracker//meal-reminders//KO',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

/**
 * 기본 선택 — **잊기 쉬운 슬롯만** (피드백: "오후·보충 블록은 까먹는다").
 *
 * 아침·점심·저녁은 기본 해제다. 끼니 시간이 이미 몸에 박혀 있는 것에 알림을 걸면
 * 알림 피로만 생기고, 그러면 정작 필요한 알림도 무시하게 된다.
 *
 * 훈련일 전용 슬롯(훈련 전·직후)도 기본 해제다 — 요일이 유동이라 매일 울리면 휴식일에도
 * 울린다. 선택은 허용하고 그 사실을 캡션이 말한다.
 */
export const FORGETTABLE_SLOT_IDS: readonly string[] = ['afternoon', 'shake']

export function defaultSelectedSlots(plan: DietPlan): string[] {
  return allSlots(plan)
    .filter((s) => FORGETTABLE_SLOT_IDS.includes(s.id))
    .map((s) => s.id)
}

/** 훈련일 전용 슬롯 — 매일 반복이므로 휴식일에도 울린다 (캡션으로 알린다) */
export function isTrainingOnlySlot(plan: DietPlan, slotId: string): boolean {
  return (
    plan.slots.some((s) => s.id === slotId) && !plan.restDaySlots.some((s) => s.id === slotId)
  )
}
