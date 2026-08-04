import { describe, expect, it } from 'vitest'
import {
  allSlots,
  buildMealIcs,
  defaultSelectedSlots,
  escapeIcsText,
  isTrainingOnlySlot,
  parseTimeHint,
  slotUid,
} from './mealCalendar'
import { BUNDLED_DIET_PLANS } from '../db/seed'

/**
 * Z4 — 식사 알림을 iOS 캘린더에 위임한다.
 *
 * 형식(RRULE·VALARM·이스케이프)은 눈으로 확인할 수 없고 실기기 가져오기를 해봐야 안다.
 * 그 전에 여기서 잠근다.
 */

const PLAN = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!
const STAMP = '20260804T100000Z'
const ics = (slotIds: string[]) =>
  buildMealIcs({ plan: PLAN, slotIds, from: '2026-08-04', stamp: STAMP })

describe('시각 파싱', () => {
  it('단일 시각을 읽는다', () => {
    expect(parseTimeHint('07:30')).toEqual({ h: 7, m: 30 })
  })

  /*
   * 첫 구현에서 이 형식을 놓쳐 **사용자가 가장 원한 슬롯(보충 블록)에 알림이 안 생겼다.**
   * 시드를 읽어 보고 발견했다 — `timeHint`가 `"15:00~16:00"`이다.
   */
  it('범위 표기는 시작 시각으로 읽는다 (보충 블록이 이 형식이다)', () => {
    expect(parseTimeHint('15:00~16:00')).toEqual({ h: 15, m: 0 })
  })

  it('형식이 어긋나면 null이다 (시드가 바뀌어도 앱이 죽지 않는다)', () => {
    for (const bad of ['', '아침', '7시 30분', '25:00', '07:70']) {
      expect(parseTimeHint(bad), bad).toBeNull()
    }
  })
})

describe('슬롯 합집합', () => {
  it('보충 블록은 휴식일 목록에만 있는데도 나온다', () => {
    // plan.slots만 보면 사용자가 가장 원한 슬롯이 목록에 없다
    expect(PLAN.slots.some((s) => s.id === 'shake')).toBe(false)
    expect(allSlots(PLAN).some((s) => s.id === 'shake')).toBe(true)
  })

  it('중복 id를 한 번만 낸다', () => {
    const ids = allSlots(PLAN).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('훈련일 전용 슬롯을 판별한다 (휴식일에도 울린다는 안내용)', () => {
    expect(isTrainingOnlySlot(PLAN, 'pre')).toBe(true)
    expect(isTrainingOnlySlot(PLAN, 'post')).toBe(true)
    expect(isTrainingOnlySlot(PLAN, 'breakfast')).toBe(false)
    expect(isTrainingOnlySlot(PLAN, 'shake')).toBe(false)
  })
})

describe('기본 선택 — 잊기 쉬운 슬롯만', () => {
  it('오후·보충 블록이 기본이다 (피드백 그대로)', () => {
    expect(defaultSelectedSlots(PLAN).sort()).toEqual(['afternoon', 'shake'])
  })

  it('아침·점심·저녁은 기본 해제다 (알림 피로 방지)', () => {
    const picked = defaultSelectedSlots(PLAN)
    for (const id of ['breakfast', 'lunch', 'dinner']) expect(picked).not.toContain(id)
  })

  it('기본 선택이 비지 않는다 (내보내기 버튼이 처음부터 비활성이면 기능을 못 찾는다)', () => {
    expect(defaultSelectedSlots(PLAN).length).toBeGreaterThan(0)
  })
})

describe('.ics 형식', () => {
  it('매일 반복 + 정시 알람이 들어간다', () => {
    const out = ics(['afternoon'])
    expect(out).toContain('RRULE:FREQ=DAILY')
    expect(out).toContain('BEGIN:VALARM')
    expect(out).toContain('TRIGGER:PT0S')
  })

  it('CRLF로 줄을 나눈다 (RFC 5545)', () => {
    expect(ics(['afternoon'])).toContain('\r\n')
    expect(ics(['afternoon']).split('\r\n').length).toBeGreaterThan(5)
  })

  it('시간대를 박지 않는다 — 여행 중에도 그 지역 시각에 울려야 한다', () => {
    const out = ics(['afternoon'])
    expect(out).toMatch(/DTSTART:20260804T150000\r\n/)
    expect(out).not.toContain('TZID')
  })

  it('보충 블록도 이벤트가 만들어진다 (범위 시각 → 15:00)', () => {
    expect(ics(['shake'])).toMatch(/DTSTART:20260804T150000/)
  })

  it('선택한 슬롯 수만큼 이벤트가 나온다', () => {
    const out = ics(['afternoon', 'shake', 'breakfast'])
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(3)
  })

  it('선택이 없으면 빈 달력이다 (던지지 않는다)', () => {
    const out = ics([])
    expect(out).toContain('BEGIN:VCALENDAR')
    expect(out).not.toContain('BEGIN:VEVENT')
  })

  it('제목에 끼니 이름과 품목 요약이 들어간다', () => {
    const out = ics(['shake'])
    const summary = /SUMMARY:([^\r]*)/.exec(out)?.[1] ?? ''
    expect(summary).toContain('보충 블록')
    expect(summary.length).toBeGreaterThan('보충 블록'.length)
  })

  it('UID가 슬롯 id로 고정된다 (같은 슬롯은 늘 같은 UID)', () => {
    const a = /UID:([^\r]*)/.exec(ics(['afternoon']))?.[1]
    const b = /UID:([^\r]*)/.exec(
      buildMealIcs({ plan: PLAN, slotIds: ['afternoon'], from: '2026-09-01', stamp: 'x' }),
    )?.[1]
    expect(a).toBe(b)
    expect(a).toBe(slotUid(PLAN.id, 'afternoon'))
  })

  it('플랜이 다르면 UID도 다르다 (감량/보정 알림이 서로를 덮지 않게)', () => {
    expect(slotUid('cut-1800', 'afternoon')).not.toBe(slotUid('cut-1500', 'afternoon'))
  })
})

describe('텍스트 이스케이프 (RFC 5545 §3.3.11)', () => {
  it('쉼표·세미콜론·역슬래시·개행을 이스케이프한다', () => {
    expect(escapeIcsText('a,b')).toBe(String.raw`a\,b`)
    expect(escapeIcsText('a;b')).toBe(String.raw`a\;b`)
    expect(escapeIcsText('a\\b')).toBe(String.raw`a\\b`)
    expect(escapeIcsText('a\nb')).toBe(String.raw`a\nb`)
  })

  it('역슬래시를 먼저 처리한다 (순서가 뒤바뀌면 이중 이스케이프된다)', () => {
    // '\,' → 역슬래시가 먼저면 '\\\,' (맞음), 쉼표가 먼저면 '\\\\,' (틀림)
    expect(escapeIcsText('\\,')).toBe(String.raw`\\\,`)
  })

  it('실제 품목 이름이 형식을 깨지 않는다', () => {
    const out = ics(allSlots(PLAN).map((s) => s.id))
    // SUMMARY 줄에 이스케이프되지 않은 쉼표가 남으면 파서가 파라미터로 읽는다
    for (const line of out.split('\r\n').filter((l) => l.startsWith('SUMMARY:'))) {
      expect(line.replace(/\\[,;\\n]/g, '')).not.toMatch(/[,;]/)
    }
  })
})
