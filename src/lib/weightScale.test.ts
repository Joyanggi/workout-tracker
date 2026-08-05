import { describe, expect, it } from 'vitest'
import {
  buildScaleMap,
  formatProgression,
  nextWeightForProgression,
  parseLadder,
  scaleFor,
  stepDown,
  stepUp,
} from './weightScale'
import { exportMarkdown } from './exportMarkdown'
import { computeProgression, defaultSetFor, type RecordPrefill } from './prefill'
import { progressionSuggestions } from './progression'
import { ROUTINE, completedSession } from './testFixtures'
import { makeRecordKey } from '../types'
import type { Exercise, ExerciseSetting } from '../types'

/** 실제 불규칙 스택 예시 — 2.5씩 가다 마지막에 6씩 뛴다 */
const LADDER = [5, 10, 15, 20, 25, 30, 35, 41, 47]

describe('parseLadder', () => {
  it('쉼표·공백·줄바꿈을 모두 구분자로 받고, 정렬·중복 제거한다', () => {
    expect(parseLadder('20, 5\n10  15').ladder).toEqual([5, 10, 15, 20])
    expect(parseLadder('10, 10, 5').ladder).toEqual([5, 10])
  })

  it('숫자로 읽을 수 없는 값·0 이하를 거부한다', () => {
    expect(parseLadder('5, 십, 15').error).toContain('십')
    expect(parseLadder('5, 0').error).toBeDefined()
    expect(parseLadder('5, -3').error).toBeDefined()
  })

  it('핀이 1개거나 비어 있으면 사다리로 쓰지 않는다', () => {
    expect(parseLadder('5').error).toBeDefined()
    expect(parseLadder('  ')).toEqual({})
  })
})

describe('균일 스텝 이동', () => {
  it('부동소수를 누적하지 않는다', () => {
    // 2.5 스텝을 반복하면 40.00000000000001 같은 값이 기록에 남는다
    let w = 0
    for (let i = 0; i < 20; i += 1) w = stepUp(w, { step: 1.25 })
    expect(w).toBe(25)
    expect(stepDown(42.5, { step: 2.5 })).toBe(40)
  })
})

describe('사다리 이동', () => {
  const scale = { step: 2.5, ladder: LADDER }

  it('이웃 핀으로 이동한다 (35 → 41)', () => {
    expect(stepUp(35, scale)).toBe(41)
    expect(stepDown(41, scale)).toBe(35)
  })

  it('경계에서 멈춘다 — 최댓값에서 +, 최솟값에서 −', () => {
    expect(stepUp(47, scale)).toBe(47)
    expect(stepDown(5, scale)).toBe(5)
  })

  it('사다리 밖 값에서도 유효한 핀을 건너뛰지 않는다', () => {
    // "가장 가까운 값으로 스냅 후 이동"이면 36에서 − 이 30으로 가서 35를 잃는다.
    // 이웃 핀 직행이라 양방향 모두 바로 옆 핀을 준다.
    expect(stepUp(36, scale)).toBe(41)
    expect(stepDown(36, scale)).toBe(35)
    expect(stepDown(4, scale)).toBe(4) // 최솟값보다 아래면 그대로
    expect(stepUp(100, scale)).toBe(100) // 최댓값보다 위면 그대로
  })

  it('사다리가 균일 스텝을 이긴다', () => {
    expect(stepUp(35, { step: 2.5, ladder: LADDER })).toBe(41)
    expect(stepUp(35, { step: 2.5 })).toBe(37.5)
  })
})

describe('nextWeightForProgression', () => {
  it('균일 스텝은 한 단위 위', () => {
    expect(nextWeightForProgression(40, { step: 5 })).toBe(45)
  })

  it('사다리는 다음 핀', () => {
    expect(nextWeightForProgression(35, { step: 2.5, ladder: LADDER })).toBe(41)
  })

  it('사다리 최상단이면 null — 존재하지 않는 무게를 제안하지 않는다', () => {
    expect(nextWeightForProgression(47, { step: 2.5, ladder: LADDER })).toBeNull()
    expect(formatProgression(47, null)).toContain('스택 최대')
  })
})

describe('buildScaleMap', () => {
  const key = 'lat-pulldown@d2'

  it('메모만 있는 행은 넣지 않는다 (기본값과 같으므로)', () => {
    const rows: ExerciseSetting[] = [{ recordKey: key, note: '시트 3칸' }]
    expect(buildScaleMap(rows, 2.5).size).toBe(0)
    expect(scaleFor(buildScaleMap(rows, 2.5), key, 2.5)).toEqual({ step: 2.5 })
  })

  it('종목별 스텝과 사다리를 읽는다', () => {
    const rows: ExerciseSetting[] = [
      { recordKey: key, weightStepKg: 5 },
      { recordKey: 'curl@d4', weightLadderKg: LADDER },
    ]
    const map = buildScaleMap(rows, 2.5)
    expect(scaleFor(map, key, 2.5).step).toBe(5)
    expect(scaleFor(map, 'curl@d4', 2.5).ladder).toEqual(LADDER)
    // 미설정 종목은 루틴 전역값
    expect(scaleFor(map, 'pushdown@d4', 2.5)).toEqual({ step: 2.5 })
  })
})

// ─── 적용 지점: 증량 판정 · 프리필 · 내보내기 ───────────

const A_EXERCISE = 'incline-chest-press'
const A_KEY = makeRecordKey(A_EXERCISE, 'd1')

describe('증량 제안이 종목별 무게 단위를 따른다', () => {
  const session = completedSession({ dayId: 'd1', date: '2026-08-04', fullReps: true, weight: 40 })

  it('5kg 머신에서 +5를 제안한다 (전역 2.5가 아니라)', () => {
    const scales = buildScaleMap([{ recordKey: A_KEY, weightStepKg: 5 }], 2.5)
    const one = progressionSuggestions(session, ROUTINE, 1, scales).find(
      (p) => p.recordKey === A_KEY,
    )
    expect(one).toMatchObject({ from: 40, to: 45 })
    // 설정이 없으면 종전대로 전역값
    expect(
      progressionSuggestions(session, ROUTINE, 1).find((p) => p.recordKey === A_KEY),
    ).toMatchObject({ from: 40, to: 42.5 })
  })

  it('사다리 종목은 다음 핀을 제안한다', () => {
    const at35 = completedSession({ dayId: 'd1', date: '2026-08-04', fullReps: true, weight: 35 })
    const scales = buildScaleMap([{ recordKey: A_KEY, weightLadderKg: LADDER }], 2.5)
    expect(progressionSuggestions(at35, ROUTINE, 1, scales).find((p) => p.recordKey === A_KEY)?.to)
      .toBe(41)
  })

  it('스택 최대에서는 목록에 남기되 to를 null로 준다', () => {
    const at47 = completedSession({ dayId: 'd1', date: '2026-08-04', fullReps: true, weight: 47 })
    const scales = buildScaleMap([{ recordKey: A_KEY, weightLadderKg: LADDER }], 2.5)
    const one = progressionSuggestions(at47, ROUTINE, 1, scales).find((p) => p.recordKey === A_KEY)
    // 조건 충족 자체가 사용자에게 필요한 정보다 — 조용히 빼지 않는다
    expect(one).toBeDefined()
    expect(one?.to).toBeNull()
  })
})

describe('프리필', () => {
  const routineExercise = ROUTINE.days
    .find((d) => d.id === 'd1')!
    .exercises.find((e) => e.exerciseId === A_EXERCISE)!
  const lastSets = Array.from({ length: routineExercise.sets }, () => ({
    weight: 47,
    reps: routineExercise.repMax,
  }))

  it('스택 최대면 프리필 무게가 오르지 않는다', () => {
    const progression = computeProgression({
      routine: ROUTINE,
      routineExercise,
      phase: 1,
      lastSets,
      scale: { step: 2.5, ladder: LADDER },
    })
    expect(progression).toEqual({ from: 47, to: null })

    const prefill: RecordPrefill = {
      recordKey: A_KEY,
      bestBySet: [{ weight: 47, reps: routineExercise.repMax }],
      best: { weight: 47, reps: routineExercise.repMax },
      lastSets,
      hasHistory: true,
      progression,
    }
    // to가 null이면 기준 무게(47)를 그대로 쓴다 — "null kg"이 새어나오지 않는다
    expect(defaultSetFor(prefill, 0, routineExercise).weight).toBe(47)
  })

  it('5kg 머신은 프리필도 +5', () => {
    const progression = computeProgression({
      routine: ROUTINE,
      routineExercise,
      phase: 1,
      lastSets: lastSets.map((s) => ({ ...s, weight: 40 })),
      scale: { step: 5 },
    })
    expect(progression).toEqual({ from: 40, to: 45 })
  })
})

describe('내보내기 Markdown', () => {
  const catalog = new Map<string, Exercise>(
    ROUTINE.days
      .flatMap((d) => d.exercises)
      .map((e) => [
        e.exerciseId,
        { id: e.exerciseId, name: e.exerciseId, shortName: e.exerciseId, cueTip: '', compensationSigns: [] },
      ]),
  )
  const range = { from: '2026-08-01', to: '2026-08-31' }

  /** 한 종목 블록만 떼어낸다 — 설정하지 않은 다른 A그룹 종목까지 검사하지 않도록 */
  function section(md: string, exerciseId: string): string {
    const rest = md.slice(md.indexOf(`### ${exerciseId} (`))
    const end = rest.indexOf('\n###')
    return end === -1 ? rest : rest.slice(0, end)
  }

  it('"다음: N kg로 증량"이 종목별 단위를 따른다', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-08-04', fullReps: true, weight: 40 }),
    ]
    const md = exportMarkdown({
      sessions,
      routine: ROUTINE,
      catalog,
      phase: 1,
      range,
      exerciseSettings: [{ recordKey: A_KEY, weightStepKg: 5 }],
    })
    expect(section(md, A_EXERCISE)).toContain('다음: 45kg로 증량')
    // recordKey별 설정이다 — 설정하지 않은 같은 Day의 A그룹은 전역값(2.5)을 그대로 쓴다
    expect(section(md, 'flat-chest-press')).toContain('다음: 42.5kg로 증량')
  })

  it('스택 최대는 "증량"이 아니라 그 사실을 적는다', () => {
    const sessions = [
      completedSession({ dayId: 'd1', date: '2026-08-04', fullReps: true, weight: 47 }),
    ]
    const md = exportMarkdown({
      sessions,
      routine: ROUTINE,
      catalog,
      phase: 1,
      range,
      exerciseSettings: [{ recordKey: A_KEY, weightLadderKg: LADDER }],
    })
    // LLM 분석이 존재하지 않는 무게를 전제하지 않도록 유지 + 사유를 적는다
    const block = section(md, A_EXERCISE)
    expect(block).toContain('스택 최대')
    expect(block).toContain('다음: 47kg 유지')
    expect(block).not.toMatch(/다음: (49\.5|null)/)
  })
})
