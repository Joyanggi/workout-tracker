import { describe, expect, it } from 'vitest'
import { dayChoiceReason, displayDay, pickedIdFor } from './dayChoice'
import { BUNDLED_ROUTINE } from '../db/seed'
import { stripComments } from './sourceScan'

/**
 * 선택과 시작의 분리 (AA1·AA2).
 *
 * 규칙 자체는 순수 함수로 잠그고(아래), 화면이 그 함수를 쓰는지는 소스 스캔으로 잠근다 —
 * 이 프로젝트에는 React 렌더 테스트가 없고, 결함이 있던 자리도 **화면의 배선**이었다
 * (`onPick={(day) => start(day)}`).
 */
const routine = BUNDLED_ROUTINE
const suggested = routine.days[0]
const other = routine.days[1]
const fallback = routine.fallbackDays[0]

describe('override 값 결정 (pickedIdFor)', () => {
  it('다른 Day를 고르면 그 Day가 override다', () => {
    expect(pickedIdFor(other.id, suggested.id)).toBe(other.id)
  })

  it('제안 Day를 다시 고르면 override가 풀린다 — 되돌리기 행을 따로 만들지 않는다', () => {
    expect(pickedIdFor(suggested.id, suggested.id)).toBeNull()
  })

  it('하한 모드 Day도 같은 규칙이다', () => {
    expect(pickedIdFor(fallback.id, suggested.id)).toBe(fallback.id)
  })
})

describe('보이는 Day (displayDay)', () => {
  it('override가 없으면 제안이다', () => {
    expect(displayDay(routine, null, suggested).id).toBe(suggested.id)
  })

  it('override가 있으면 그 Day다', () => {
    expect(displayDay(routine, other.id, suggested).id).toBe(other.id)
  })

  it('하한 모드 Day도 찾는다 (routine.days에 없다)', () => {
    expect(routine.days.some((d) => d.id === fallback.id)).toBe(false)
    expect(displayDay(routine, fallback.id, suggested).id).toBe(fallback.id)
  })

  it('없는 id면 제안으로 되돌린다 — 실패 방향이 현상 유지여야 한다', () => {
    // 시드 교체로 Day id가 사라진 경우. 빈 화면이나 예외가 아니라 "제안 Day 시작"이 맞다
    expect(displayDay(routine, 'no-such-day', suggested).id).toBe(suggested.id)
  })
})

describe('카드 문구 (dayChoiceReason)', () => {
  it('제안 상태에서는 제안 근거를 그대로 쓴다', () => {
    expect(dayChoiceReason(null, suggested, '상부가 3일 밀렸어요')).toBe('상부가 3일 밀렸어요')
  })

  it('직접 선택 상태에서는 제안이 보류됐음을 말한다', () => {
    // 제안 근거를 그대로 두면 **다른 Day의 근거**가 이 Day의 근거처럼 읽힌다
    const text = dayChoiceReason(other.id, suggested, '상부가 3일 밀렸어요')
    expect(text).toBe(`직접 선택 — 제안은 ${suggested.name}`)
    expect(text).not.toContain('3일')
  })
})

/**
 * 화면 배선 — 고른 순간 시작되던 결함이 되살아나지 않게 (AA1).
 */
describe('AA1 — 시트가 세션을 만들지 않는다', () => {
  const sources = import.meta.glob('/src/**/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const home = () => {
    const src = sources['/src/screens/HomeScreen.tsx']
    expect(src, 'HomeScreen을 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    return stripComments(src!)
  }

  it('onPick이 start를 부르지 않는다', () => {
    const src = home()
    const onPick = /onPick=\{([\s\S]*?)\n\s*onClose=/.exec(src)?.[1]
    expect(onPick, 'onPick을 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    expect(onPick).not.toMatch(/\bstart\(/)
    expect(onPick).toMatch(/pickedIdFor/)
  })

  it('카드와 시작 버튼이 같은 파생 상태를 쓴다', () => {
    /*
      suggestion.day를 카드나 시작 버튼이 직접 읽으면 보이는 Day와 시작되는 Day가 갈라진다.
      CC11에서 판정이 `homeCardState` 하나로 합쳐졌으므로(제안 / 직접 선택 / 진행 중 세션),
      화면은 그 결과(card.*, displayed)만 읽어야 한다.
    */
    const src = home()
    const card = /className="card today-card[\s\S]*?<\/button>/.exec(src)?.[0]
    expect(card, '카드를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    expect(card).not.toMatch(/suggestion\.day\./)
    expect(card).toMatch(/displayed\./)
    expect(card).toMatch(/card\.reason/)

    const startBtn = /className="btn-row start-row"[\s\S]*?<\/div>/.exec(src)?.[0]
    expect(startBtn, '시작 버튼 행을 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    expect(startBtn).toMatch(/start\(displayed\)/)
    // 라벨도 파생값이다 (CC11: 진행 중이면 "이어서 하기")
    expect(startBtn).toMatch(/\{card\.cta\}/)
  })

  it('시작하면 override를 지운다', () => {
    const startFn = /const start = \(day: RoutineDay[\s\S]*?\n  \}/.exec(home())?.[0]
    expect(startFn, 'start를 찾지 못했다 — 이 검사가 헛돌고 있다').toBeDefined()
    expect(startFn).toMatch(/setPickedDayId\(null\)/)
  })

  it('선택 상태를 저장하지 않는다 (다음 날 낡은 선택이 남는 실패가 더 나쁘다)', () => {
    const src = home()
    // 스토어·DB가 아니라 컴포넌트 상태로만 둔다
    expect(src).toMatch(/const \[pickedDayId, setPickedDayId\] = useState<string \| null>\(null\)/)
    expect(src).not.toMatch(/pickedDayId.*db\.|db\..*pickedDayId|useUi.*picked/)
  })
})

describe('AA2 — 변경이 보이는 버튼이다', () => {
  const sources = import.meta.glob('/src/**/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const home = () => stripComments(sources['/src/screens/HomeScreen.tsx']!)

  it('[변경] 버튼이 시트를 연다', () => {
    const src = home()
    const idx = src.indexOf('변경')
    expect(idx, '"변경" 버튼이 없다').toBeGreaterThan(-1)
    expect(src.slice(idx - 160, idx)).toMatch(/setPicking\(true\)/)
  })

  it('텍스트 힌트를 지웠다 — 보이는 버튼이 생겼으므로 중복이다', () => {
    expect(home()).not.toContain('탭해서 다른 Day 선택')
  })

  it('카드 탭 지름길은 남아 있다', () => {
    const src = home()
    const card = /className="card today-card[^"]*"\s*onClick=\{([^}]*)\}/.exec(src)?.[1]
    expect(card).toMatch(/setPicking\(true\)/)
  })
})
