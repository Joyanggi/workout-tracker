import { describe, expect, it } from 'vitest'
import {
  WATCH_WINDOW,
  bannerWatches,
  compensationEntriesOf,
  compensationWatches,
  watchFor,
} from './compensationWatch'
import { stepDown } from './weightScale'
import { completedSession } from './testFixtures'
import { makeRecordKey, type Session } from '../types'

const KEY = makeRecordKey('lateral-raise', 'd1')

/** d1 세션 목록을 날짜 내림차순 시나리오로 만든다. comps[i]는 i번째 최신 세션의 보상작용 */
function history(comps: (string | null)[]): Session[] {
  return comps.map((comp, i) =>
    completedSession({
      dayId: 'd1',
      date: `2026-08-${String(20 - i).padStart(2, '0')}`,
      compensation: comp ?? '없음',
    }),
  )
}

describe('반복 보상작용 감지', () => {
  it('최근 3회 중 2회면 경고한다', () => {
    const watch = watchFor(compensationWatches(history(['목·승모 긴장', null, '목·승모 긴장'])), KEY)
    expect(watch).toBeDefined()
    expect(watch!.count).toBe(2)
    expect(watch!.notes).toEqual(['목·승모 긴장'])
  })

  it('"없음"만 3회면 경고하지 않는다', () => {
    expect(compensationWatches(history([null, null, null]))).toEqual([])
  })

  it('1회뿐이면 경고하지 않는다 — 한 번은 패턴이 아니다', () => {
    expect(watchFor(compensationWatches(history(['반동', null, null])), KEY)).toBeUndefined()
  })

  it(`창은 최근 ${WATCH_WINDOW}회 수행분이다 — 그보다 오래된 기록은 세지 않는다`, () => {
    // 최근 3회는 깨끗하고, 그 앞 2회에 보상작용이 있었다
    const watch = watchFor(
      compensationWatches(history([null, null, null, '반동', '반동'])),
      KEY,
    )
    expect(watch).toBeUndefined()
  })

  it('수행하지 않은 세션은 창에 넣지 않는다', () => {
    // 가운데 세션에서 이 종목을 하지 않았다 → 창은 "수행한" 3회로 채워진다.
    // 달력상 최근 3세션으로 세면 2/3이 되지 못해 경고가 늦게 뜬다.
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-08-20', compensation: '반동' }),
      completedSession({
        dayId: 'd1',
        date: '2026-08-18',
        onlyExercises: ['incline-chest-press'],
      }),
      completedSession({ dayId: 'd1', date: '2026-08-16', compensation: '반동' }),
    ]
    const watch = watchFor(compensationWatches(sessions), KEY)
    expect(watch?.count).toBe(2)
  })

  it('종목 간에 독립적이다', () => {
    const sessions = history(['반동', '반동', null])
    const watches = compensationWatches(sessions)
    // completedSession은 Day의 전 종목에 같은 compensation을 넣으므로 여러 종목이 걸린다.
    // 중요한 것은 각 recordKey가 자기 이력만 본다는 것 — 서로 count가 섞이지 않는다
    expect(watches.every((w) => w.count === 2)).toBe(true)
    const other = watchFor(watches, makeRecordKey('incline-chest-press', 'd1'))
    expect(other?.recordKey).toBe(makeRecordKey('incline-chest-press', 'd1'))
  })

  it('여러 문구를 중복 없이 최신순으로 모은다', () => {
    const watch = watchFor(
      compensationWatches(history(['어깨 으쓱', '반동', '어깨 으쓱'])),
      KEY,
    )
    expect(watch!.notes).toEqual(['어깨 으쓱', '반동'])
  })
})

describe('연속 판정 (홈 배너 조건)', () => {
  it('최신부터 연속이어야 streak로 센다', () => {
    const three = watchFor(compensationWatches(history(['반동', '반동', '반동'])), KEY)!
    expect(three.streak).toBe(3)
    expect(bannerWatches([three])).toHaveLength(1)
  })

  it('최근 세션이 깨끗하면 streak가 0 — 배너를 띄우지 않는다', () => {
    // 문제를 고친 직후에 "반복된다"고 말하면 안 된다
    const watch = watchFor(compensationWatches(history([null, '반동', '반동'])), KEY)!
    expect(watch.count).toBe(2) // 경고 칩은 유지
    expect(watch.streak).toBe(0)
    expect(bannerWatches([watch])).toEqual([])
  })
})

describe('하향 폭은 종목별 무게 단위를 따른다 (T9 연동)', () => {
  it('5kg 머신은 5kg 내린다', () => {
    expect(stepDown(40, { step: 5 })).toBe(35)
  })

  it('사다리 종목은 아래 핀으로 내린다', () => {
    expect(stepDown(41, { step: 2.5, ladder: [5, 10, 15, 20, 25, 30, 35, 41, 47] })).toBe(35)
  })

  it('최소값에서는 더 내리지 않는다 — 시트가 버튼을 막는다', () => {
    expect(stepDown(5, { step: 2.5, ladder: [5, 10] })).toBe(5)
  })
})

describe('세션 종료 시 보상작용 목록', () => {
  it('기록된 종목만 나열한다', () => {
    const session = completedSession({ dayId: 'd1', date: '2026-08-20', compensation: '반동' })
    expect(compensationEntriesOf(session).length).toBe(session.entries.length)
    expect(compensationEntriesOf(session)[0].note).toBe('반동')
  })

  it('"없음"은 나열하지 않는다', () => {
    expect(
      compensationEntriesOf(completedSession({ dayId: 'd1', date: '2026-08-20' })),
    ).toEqual([])
  })

  it('체크한 세트가 없는 종목은 나열하지 않는다', () => {
    const base = completedSession({ dayId: 'd1', date: '2026-08-20', compensation: '반동' })
    const untouched: Session = {
      ...base,
      entries: base.entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: false })) })),
    }
    expect(compensationEntriesOf(untouched)).toEqual([])
  })
})
