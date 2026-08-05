import { describe, expect, it } from 'vitest'
import {
  A_ECCENTRIC_OPTIONS,
  BREATH_LABEL,
  DEFAULT_A_ECCENTRIC,
  PHASE_LABEL,
  TEMPO,
  cycleSeconds,
  tempoFor,
  tempoPhasesFor,
} from './tempo'
import { adjustTotalSec, extendEndTime } from './useRestTimer'
import { TAP_SLOP_PX, isTap } from './tapJudge'
import { homeCardState } from './dayChoice'
import { lastNote, noteHistory, noteLineText } from './noteHistory'
import { startWeightEstimate } from './prefill'
import { snapDownToScale } from './weightScale'
import { applyAddExercise } from './sessionOps'
import { zeroWeightHint } from './setRowState'
import { BUNDLED_ROUTINE, BUNDLED_EXERCISES } from '../db/seed'
import { completedSession } from './testFixtures'
import { dayTotalSets } from './useRoutine'
import { stripComments } from './sourceScan'
import { NO_COMPENSATION, type Session, type SetRecord } from '../types'

const routine = BUNDLED_ROUTINE
const catalog = new Map(BUNDLED_EXERCISES.map((e) => [e.id, e]))

// ─── CC4: 호흡 안내 ───────────────────────────────────────

describe('CC4 — 호흡 라벨', () => {
  it('모든 페이즈에 호흡 라벨이 있다', () => {
    for (const kind of Object.keys(PHASE_LABEL) as (keyof typeof PHASE_LABEL)[]) {
      expect(BREATH_LABEL[kind], kind).toBeTruthy()
    }
  })

  it('원리는 "힘쓸 때 내쉰다" 하나다 — 문서 3장 표가 원본이다', () => {
    // 수축·짜내기 = 내쉬기 / 이완·신장 = 들이쉬기 계열
    expect(BREATH_LABEL.concentric).toBe('내쉬기')
    expect(BREATH_LABEL.squeeze).toBe('마저 내쉬기')
    expect(BREATH_LABEL.eccentric).toBe('들이쉬기')
    expect(BREATH_LABEL.stretch).toBe('들숨 유지')
  })

  it('대칭 호흡(3초 들숨 3초 날숨)이 아니다', () => {
    // 피드백의 "3초 들숨 3초 날숨은 생각보다 길다"는 이 규정이 아니었다
    expect(BREATH_LABEL.concentric).not.toBe(BREATH_LABEL.eccentric)
  })
})

// ─── CC5 · CC16: 템포 오버라이드와 A그룹 설정 ──────────────

describe('CC5 — 레그 컬 템포 예외 (문서 3장 예외 행)', () => {
  const legCurl = catalog.get('leg-curl')!

  it('레그 컬에 종목 템포가 있다', () => {
    expect(legCurl.tempo).toBeDefined()
  })

  it('레그 컬 한 사이클은 4초다 (1-1-2 — 수축 정지가 들어간다)', () => {
    const phases = tempoPhasesFor(legCurl.tempo, 'A')
    expect(cycleSeconds(phases)).toBe(4)
    expect(phases.map((p) => [p.kind, p.seconds])).toEqual([
      ['concentric', 1],
      ['squeeze', 1],
      ['eccentric', 2],
    ])
  })

  it('cue가 말하는 "수축 지점에서 1초 정지"가 템포에 있다', () => {
    // 이 불일치가 CC5의 피드백이었다 — cue는 정지를 말하는데 템포에는 없었다
    expect(legCurl.cueTip).toContain('1초 정지')
    expect(tempoPhasesFor(legCurl.tempo, 'A').some((p) => p.kind === 'squeeze')).toBe(true)
  })

  it('오버라이드가 없는 종목은 그룹 템포를 그대로 받는다', () => {
    const legExt = catalog.get('leg-extension')!
    expect(legExt.tempo).toBeUndefined()
    expect(tempoPhasesFor(legExt.tempo, 'A')).toEqual(TEMPO.A)
  })

  it('**오버라이드는 A그룹 설정을 따르지 않는다** (문서가 고정 수치로 규정했다)', () => {
    const with15 = tempoPhasesFor(legCurl.tempo, 'A', 1.5)
    expect(cycleSeconds(with15)).toBe(4)
    expect(with15.find((p) => p.kind === 'eccentric')?.seconds).toBe(2)
  })
})

describe('CC16 — A그룹 이완 초 설정', () => {
  it('선택지는 문서 범위(1.5~2)뿐이다', () => {
    expect([...A_ECCENTRIC_OPTIONS]).toEqual([2, 1.5])
    expect(DEFAULT_A_ECCENTRIC).toBe(2)
  })

  it('설정이 A그룹 이완에 반영된다', () => {
    expect(tempoFor('A', 2).find((p) => p.kind === 'eccentric')?.seconds).toBe(2)
    expect(tempoFor('A', 1.5).find((p) => p.kind === 'eccentric')?.seconds).toBe(1.5)
  })

  it('사이클 초도 함께 바뀐다 (화면 표기가 자동 반영된다)', () => {
    expect(cycleSeconds(tempoFor('A', 2))).toBe(3)
    expect(cycleSeconds(tempoFor('A', 1.5))).toBe(2.5)
  })

  it('**B그룹·코어는 설정의 영향을 받지 않는다** (감각 점수 체계의 전제)', () => {
    for (const group of ['B', 'core'] as const) {
      expect(tempoFor(group, 1.5)).toEqual(TEMPO[group])
      expect(tempoFor(group, 2)).toEqual(TEMPO[group])
    }
  })

  it('기본값을 생략하면 문서 기본(2초)이다', () => {
    expect(tempoFor('A')).toEqual(TEMPO.A)
  })
})

// ─── CC6: −30초 ──────────────────────────────────────────

describe('CC6 — 휴식 −30초', () => {
  const now = 1_000_000

  it('진행 중인 타이머에서 30초를 뺀다', () => {
    const end = now + 90_000
    expect(extendEndTime(end, now, -30)).toBe(now + 60_000)
  })

  it('남은 시간이 30초 미만이면 즉시 종료된다 (차임 + 자동 닫힘 경로)', () => {
    const end = now + 5_000
    expect(extendEndTime(end, now, -30)).toBe(now)
  })

  it('과거로 내려가지 않는다 — 음수 남은 시간은 만들지 않는다', () => {
    expect(extendEndTime(now + 1_000, now, -600)).toBe(now)
  })

  it('이미 끝난 타이머에서 빼도 now다', () => {
    expect(extendEndTime(now - 60_000, now, -30)).toBe(now)
  })

  it('+30초는 그대로 동작한다 (같은 함수를 쓴다)', () => {
    expect(extendEndTime(now + 90_000, now, 30)).toBe(now + 120_000)
    // 이미 끝난 타이머에 +30 → 지금부터 30초 (기존 규칙 유지)
    expect(extendEndTime(now - 60_000, now, 30)).toBe(now + 30_000)
  })

  it('총 시간은 0 아래로 가지 않는다 (진행 바 폭이 뒤집힌다)', () => {
    expect(adjustTotalSec(90, -30)).toBe(60)
    expect(adjustTotalSec(10, -30)).toBe(0)
    expect(adjustTotalSec(0, -30)).toBe(0)
  })
})

// ─── CC12: 탭 판정 ────────────────────────────────────────

describe('CC12 — 뗄 때 1스텝', () => {
  it('제자리에서 떼면 탭이다', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true)
  })

  it('슬롭 안이면 탭이다 (손가락은 미세하게 움직인다)', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100 + TAP_SLOP_PX - 1, y: 100 })).toBe(true)
  })

  it('슬롭을 넘으면 무발화다 — 스크롤 중 스친 것이 값을 바꾸지 않는다', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 + TAP_SLOP_PX + 1 })).toBe(false)
  })

  it('대각선 이동도 거리로 판정한다 (축별로 재면 √2배까지 통과한다)', () => {
    // 10,10은 축별로는 슬롭 안이지만 거리는 14.1 > 12
    expect(isTap({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false)
  })

  it('이 버튼에서 시작하지 않은 릴리즈는 무발화다', () => {
    expect(isTap(null, { x: 100, y: 100 })).toBe(false)
  })
})

// ─── CC11: 홈 카드 세션 모드 ───────────────────────────────

describe('CC11 — 진행 중 세션이면 카드가 그 세션을 가리킨다', () => {
  const suggested = routine.days[0]
  const other = routine.days[2]
  const base = {
    routine,
    suggested,
    suggestionReason: '광배가 밀렸어요',
    pickedDayId: null,
    openDayId: null,
  }

  it('세션이 없으면 제안 모드다', () => {
    const card = homeCardState(base)
    expect(card.resuming).toBe(false)
    expect(card.day.id).toBe(suggested.id)
    expect(card.reason).toBe('광배가 밀렸어요')
    expect(card.cta).toBe(`${suggested.name} 시작`)
  })

  it('세션이 있으면 그 Day를 보여주고 버튼이 "이어서 하기"다', () => {
    const card = homeCardState({ ...base, openDayId: other.id })
    expect(card.resuming).toBe(true)
    expect(card.day.id).toBe(other.id)
    expect(card.reason).toBe('진행 중인 세션이 있어요')
    expect(card.cta).toBe('이어서 하기')
  })

  it('**직접 선택이 세션 모드를 이긴다** — 고른 결과가 화면에 나타나야 한다', () => {
    const card = homeCardState({
      ...base,
      openDayId: routine.days[1].id,
      pickedDayId: other.id,
    })
    expect(card.resuming).toBe(false)
    expect(card.day.id).toBe(other.id)
    expect(card.cta).toBe(`${other.name} 시작`)
  })

  it('세션의 Day를 못 찾으면 제안으로 되돌린다 (실패 방향이 현상 유지)', () => {
    const card = homeCardState({ ...base, openDayId: 'no-such-day' })
    expect(card.day.id).toBe(suggested.id)
    expect(card.resuming).toBe(true)
  })

  it('하한 모드 세션도 찾는다 (routine.days에 없다)', () => {
    const fb = routine.fallbackDays[0]
    expect(homeCardState({ ...base, openDayId: fb.id }).day.id).toBe(fb.id)
  })
})

// ─── CC13: 시작 무게 추정 ─────────────────────────────────

describe('CC13 — 첫 기록 시작 무게 추정', () => {
  const scale = { step: 2.5 }

  it('체중 × 계수를 스택 단위로 내림한다', () => {
    // 70 × 0.3 = 21 → 2.5 단위 내림 = 20
    expect(startWeightEstimate({ hasHistory: false, bodyWeightKg: 70, startWeightPctBW: 0.3, scale }))
      .toBe(20)
  })

  it('**기록이 하나라도 있으면 추정하지 않는다**', () => {
    expect(
      startWeightEstimate({ hasHistory: true, bodyWeightKg: 70, startWeightPctBW: 0.3, scale }),
    ).toBeUndefined()
  })

  it('체중이 없으면 추정하지 않는다 (현행 0kg 유지)', () => {
    expect(startWeightEstimate({ hasHistory: false, startWeightPctBW: 0.3, scale })).toBeUndefined()
  })

  it('계수가 없으면 추정하지 않는다', () => {
    expect(startWeightEstimate({ hasHistory: false, bodyWeightKg: 70, scale })).toBeUndefined()
  })

  it('어시스티드(inverse)는 추정하지 않는다 — 방향이 반대인 별도 규칙이 있다', () => {
    expect(
      startWeightEstimate({
        hasHistory: false,
        bodyWeightKg: 70,
        startWeightPctBW: 0.3,
        scale: { step: 2.5, inverse: true },
      }),
    ).toBeUndefined()
  })

  it('내림 결과가 0이면 추정하지 않는다 (0을 "추정"이라고 말하지 않는다)', () => {
    expect(
      startWeightEstimate({ hasHistory: false, bodyWeightKg: 70, startWeightPctBW: 0.01, scale }),
    ).toBeUndefined()
  })

  it('사다리에서는 실제 핀으로 내린다', () => {
    // 70 × 0.5 = 35 → [30, 41] 중 35 이하 최대 = 30
    expect(
      startWeightEstimate({
        hasHistory: false,
        bodyWeightKg: 70,
        startWeightPctBW: 0.5,
        scale: { step: 5, ladder: [30, 41] },
      }),
    ).toBe(30)
  })

  it('내림이 규칙이다 — 남는 것이 부족한 것보다 낫다', () => {
    expect(snapDownToScale(21, { step: 2.5 })).toBe(20)
    expect(snapDownToScale(40, { step: 5, ladder: [35, 41] })).toBe(35)
    // 최하단보다 작으면 최하단 (핀을 안 꽂는 것은 이 함수의 답이 아니다)
    expect(snapDownToScale(10, { step: 5, ladder: [35, 41] })).toBe(35)
  })

  it('시드의 계수가 전부 체중 비율로 그럴듯한 범위다', () => {
    // 검증된 공식이 아니므로 값 자체는 못 박지 않는다. 오타(3.0 같은 것)만 잡는다
    for (const ex of BUNDLED_EXERCISES) {
      if (ex.startWeightPctBW === undefined) continue
      expect(ex.startWeightPctBW, ex.id).toBeGreaterThan(0)
      expect(ex.startWeightPctBW, ex.id).toBeLessThanOrEqual(0.6)
    }
  })

  it('어시스티드 종목에는 계수를 두지 않았다', () => {
    for (const ex of BUNDLED_EXERCISES) {
      if (ex.inverseWeight) expect(ex.startWeightPctBW, ex.id).toBeUndefined()
    }
  })
})

// ─── CC10: 맨몸 종목 오탐 ─────────────────────────────────

describe('CC10 — 맨몸 종목은 무게 미입력이 아니다', () => {
  const zero: SetRecord = { weight: 0, reps: 15, done: true }

  it('맨몸 크런치는 무게 미입력이 아니다 (오늘 실데이터의 오탐)', () => {
    expect(catalog.get('crunch')?.allowZeroWeight).toBe(true)
    expect(zeroWeightHint(zero, false, true)).toBe(false)
  })

  it('데드버그도 마찬가지다 — 애초에 무게를 얹을 수 없다', () => {
    expect(catalog.get('dead-bug')?.allowZeroWeight).toBe(true)
  })

  it('일반 종목은 힌트가 그대로 뜬다', () => {
    expect(catalog.get('leg-extension')?.allowZeroWeight).toBeUndefined()
    expect(zeroWeightHint(zero, false, false)).toBe(true)
  })
})

// ─── CC9: 루틴 미러링 ─────────────────────────────────────

describe('CC9 — D3 루틴 변경 미러링 (문서 2026-08-05 갱신분)', () => {
  const d3 = routine.days.find((d) => d.id === 'd3')!

  it('D3는 6종목 17세트다 (문서 7장 표)', () => {
    expect(d3.exercises).toHaveLength(6)
    expect(dayTotalSets(d3)).toBe(17)
  })

  it('힙 어브덕션이 사라지고 몬스터 글루트가 들어왔다', () => {
    const ids = d3.exercises.map((e) => e.exerciseId)
    expect(ids).not.toContain('hip-abduction')
    expect(ids).toContain('monster-glute')
    expect(catalog.has('hip-abduction')).toBe(false)
  })

  it('힙 어덕션이 복원됐고 내전근 부위다', () => {
    const add = d3.exercises.find((e) => e.exerciseId === 'hip-adduction')!
    expect(add.muscle).toBe('내전근')
    expect(add.group).toBe('B')
    expect([add.sets, add.repMin, add.repMax, add.restSec]).toEqual([3, 15, 20, 90])
  })

  it('몬스터 글루트는 둔근(하체) 키를 재사용한다', () => {
    const mg = d3.exercises.find((e) => e.exerciseId === 'monster-glute')!
    expect(mg.muscle).toBe('하체')
    expect([mg.sets, mg.repMin, mg.repMax, mg.restSec]).toEqual([3, 15, 20, 90])
  })

  it('두 신규 종목에 cue와 보상작용 신호가 있다', () => {
    for (const id of ['monster-glute', 'hip-adduction']) {
      const ex = catalog.get(id)!
      expect(ex.cueTip.length, id).toBeGreaterThan(10)
      expect(ex.compensationSigns.length, id).toBeGreaterThan(0)
    }
  })

  it('힙 어덕션 cue가 "시작 폭 80%"를 말한다 (과이완 방지 — 문서 0장)', () => {
    expect(catalog.get('hip-adduction')!.cueTip).toContain('80%')
  })

  it('muscleSets가 실제 종목 세트 합과 일치한다', () => {
    const sums = new Map<string, number>()
    for (const ex of d3.exercises) {
      sums.set(ex.muscle, (sums.get(ex.muscle) ?? 0) + ex.sets)
    }
    expect(Object.fromEntries(sums)).toEqual(d3.muscleSets)
  })

  it('내전근이 주간 목표에 있다 (없으면 시드 정합성 검사가 잡는다)', () => {
    expect(routine.muscleTargets['내전근']).toEqual({ target: 3, weight: 0.3 })
  })

  it('plannedOrder가 1..6으로 연속이다', () => {
    expect(d3.exercises.map((e) => e.plannedOrder).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

// ─── CC14: 메모 이력 ──────────────────────────────────────

describe('CC14 — 종목별 메모 이력 (파생, 새 저장소 없음)', () => {
  const withNote = (
    date: string,
    recordKey: string,
    over: { note?: string; score?: 0 | 1 | 2 | 3; comp?: string },
  ): Session => {
    const s = completedSession({ dayId: 'd1', date })
    return {
      ...s,
      entries: [
        {
          recordKey,
          plannedOrder: 1,
          performedOrder: 1,
          sets: [{ weight: 10, reps: 10, done: true }],
          compensation: over.comp ?? NO_COMPENSATION,
          skipped: false,
          ...(over.note !== undefined ? { sensoryNote: over.note } : {}),
          ...(over.score !== undefined ? { sensoryScore: over.score } : {}),
        },
      ],
    }
  }

  const KEY = 'rear-delt-fly@d1'

  it('메모가 있는 세션만 최신순으로 나온다', () => {
    const sessions = [
      withNote('2026-08-01', KEY, { note: '목에 긴장' }),
      withNote('2026-08-03', KEY, {}),
      withNote('2026-08-05', KEY, { note: '오늘은 괜찮음', score: 3 }),
    ]
    const out = noteHistory(sessions, KEY)
    expect(out.map((n) => n.date)).toEqual(['2026-08-05', '2026-08-01'])
    expect(out[0].sensoryScore).toBe(3)
  })

  it('보상작용만 있어도 이력이다 (그 날 그 종목에 있었던 일이다)', () => {
    const sessions = [withNote('2026-08-05', KEY, { comp: '허리 젖힘' })]
    const out = noteHistory(sessions, KEY)
    expect(out).toHaveLength(1)
    expect(out[0].compensation).toBe('허리 젖힘')
  })

  it('"없음"은 이력에 들어가지 않는다', () => {
    const sessions = [withNote('2026-08-05', KEY, {})]
    expect(noteHistory(sessions, KEY)).toEqual([])
  })

  it('공백만 있는 메모는 무시한다', () => {
    const sessions = [withNote('2026-08-05', KEY, { note: '   ' })]
    expect(noteHistory(sessions, KEY)).toEqual([])
  })

  it('다른 종목의 메모는 섞이지 않는다', () => {
    const sessions = [withNote('2026-08-05', 'curl@d1', { note: '팔' })]
    expect(noteHistory(sessions, KEY)).toEqual([])
  })

  it('직전 메모는 가장 최근 것 하나다 (카드에 뜬다)', () => {
    const sessions = [
      withNote('2026-08-01', KEY, { note: '오래된 것' }),
      withNote('2026-08-05', KEY, { note: '최근 것' }),
    ]
    expect(lastNote(sessions, KEY)?.note).toBe('최근 것')
  })

  it('메모와 보상작용이 한 줄로 합쳐진다 (카드·이력이 같은 문구)', () => {
    const line = noteLineText({
      sessionId: 'x',
      date: '2026-08-05',
      note: '목에 긴장',
      compensation: '허리 젖힘',
    })
    expect(line).toBe('목에 긴장 · 보상작용: 허리 젖힘')
  })

  it('진행 중 세션(endedAt 없음)은 이력이 아니다', () => {
    const open = { ...withNote('2026-08-05', KEY, { note: 'x' }), endedAt: undefined }
    expect(noteHistory([open], KEY)).toEqual([])
  })
})

// ─── CC15: 종목 얹기 ─────────────────────────────────────

describe('CC15 — 세션에 종목 얹기', () => {
  const base = (): Session => completedSession({ dayId: 'd3', date: '2026-08-05' })

  it('entry가 추가되고 extra로 표시된다', () => {
    const s = applyAddExercise(base(), {
      recordKey: 'pec-deck-fly@d1',
      setCount: 3,
      weight: 20,
      reps: 12,
    })
    const added = s.entries.find((e) => e.recordKey === 'pec-deck-fly@d1')!
    expect(added.extra).toBe(true)
    expect(added.sets).toHaveLength(3)
    expect(added.sets[0]).toEqual({ weight: 20, reps: 12, done: false })
    expect(added.compensation).toBe(NO_COMPENSATION)
  })

  it('기존 종목은 그대로 남는다 — 대체가 아니라 얹기다', () => {
    const before = base()
    const s = applyAddExercise(before, {
      recordKey: 'pec-deck-fly@d1',
      setCount: 3,
      weight: 20,
      reps: 12,
    })
    expect(s.entries).toHaveLength(before.entries.length + 1)
    for (const e of before.entries) {
      expect(s.entries.some((x) => x.recordKey === e.recordKey)).toBe(true)
    }
  })

  it('이미 있는 종목은 얹지 않는다 (같은 recordKey 두 개는 이중 계상이다)', () => {
    const before = base()
    const existing = before.entries[0].recordKey
    const s = applyAddExercise(before, { recordKey: existing, setCount: 3, weight: 20, reps: 12 })
    expect(s).toBe(before)
  })

  it('plannedOrder는 마지막 + 1이다 (계획 밖이므로 뒤에 온다)', () => {
    const before = base()
    const maxOrder = Math.max(...before.entries.map((e) => e.plannedOrder))
    const s = applyAddExercise(before, {
      recordKey: 'pec-deck-fly@d1',
      setCount: 1,
      weight: 0,
      reps: 10,
    })
    expect(s.entries[s.entries.length - 1].plannedOrder).toBe(maxOrder + 1)
  })

  it('세트 수가 0이어도 최소 1세트는 만든다', () => {
    const s = applyAddExercise(base(), {
      recordKey: 'pec-deck-fly@d1',
      setCount: 0,
      weight: 0,
      reps: 10,
    })
    expect(s.entries[s.entries.length - 1].sets).toHaveLength(1)
  })

  it('**주간 볼륨에 정상 산입된다** — 실제로 한 자극이다', async () => {
    const { weeklyVolume } = await import('./derive')
    const before = weeklyVolume([base()], routine, '2026-08-05')
    const s = applyAddExercise(base(), {
      recordKey: 'pec-deck-fly@d1',
      setCount: 3,
      weight: 20,
      reps: 12,
    })
    // 얹은 세트를 완료로 표시
    const done: Session = {
      ...s,
      entries: s.entries.map((e) =>
        e.recordKey === 'pec-deck-fly@d1'
          ? { ...e, sets: e.sets.map((x) => ({ ...x, done: true })) }
          : e,
      ),
    }
    const after = weeklyVolume([done], routine, '2026-08-05')
    // pec-deck-fly는 D1에서 상부가슴이다 — 그 부위가 3세트 늘어야 한다
    expect((after.sets['상부가슴'] ?? 0) - (before.sets['상부가슴'] ?? 0)).toBe(3)
  })

  it('워밍업으로 표시한 세트는 볼륨에서 빠진다 (기존 초크포인트가 처리한다)', async () => {
    const { doneSets } = await import('./derive')
    const s = applyAddExercise(base(), {
      recordKey: 'pec-deck-fly@d1',
      setCount: 2,
      weight: 20,
      reps: 12,
    })
    const entry = s.entries[s.entries.length - 1]
    const warm = {
      ...entry,
      sets: entry.sets.map((x) => ({ ...x, done: true, warmup: true })),
    }
    // "몸 풀기 수준이라 빼고 싶다"는 새 규칙이 아니라 워밍업 토글이 하는 일이다
    expect(doneSets(warm)).toHaveLength(0)
  })

  it('다른 Day의 recordKey를 세션 안에서 올바르게 해석한다', async () => {
    const { routineExerciseOfEntry } = await import('./derive')
    const s = applyAddExercise(base(), {
      recordKey: 'pec-deck-fly@d1',
      setCount: 3,
      weight: 20,
      reps: 12,
    })
    const added = s.entries[s.entries.length - 1]
    const re = routineExerciseOfEntry(routine, added)
    expect(re?.exerciseId).toBe('pec-deck-fly')
    // D1의 계획을 그대로 받는다 (그룹·목표 반복수가 원 Day 기준이어야 한다)
    const d1 = routine.days.find((d) => d.id === 'd1')!
    const planned = d1.exercises.find((e) => e.exerciseId === 'pec-deck-fly')!
    expect(re?.group).toBe(planned.group)
    expect(re?.repMax).toBe(planned.repMax)
  })
})

// ─── 화면 배선 (2층 잠금) ──────────────────────────────────

describe('화면 배선', () => {
  const tsx = import.meta.glob('/src/**/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const file = (path: string) => {
    const src = tsx[path]
    expect(src, `${path}를 찾지 못했다 — 이 검사가 헛돌고 있다`).toBeDefined()
    return stripComments(src!)
  }

  it('CC3 — 세션 헤더가 타이머 시트를 연다', () => {
    const src = file('/src/screens/SessionScreen.tsx')
    expect(src).toMatch(/setManualTimer\(true\)/)
    expect(src).toMatch(/<ManualTimerSheet/)
    // App이 소유한 타이머를 그대로 시작시킨다 — 새 타이머 개념을 만들지 않는다
    expect(src).toMatch(/onStart=\{\(sec, label\) => timer\.start\(sec, label\)\}/)
    expect(file('/src/components/ManualTimerSheet.tsx')).not.toMatch(/useRestTimer/)
  })

  it('CC6 — 바에 −30초가 있고 진행 중에만 보인다', () => {
    const src = file('/src/components/RestTimerBar.tsx')
    expect(src).toMatch(/addSeconds\(-30\)/)
    const minus = src.indexOf('−30초')
    expect(minus).toBeGreaterThan(-1)
    expect(src.slice(Math.max(0, minus - 200), minus)).toMatch(/!timer\.finished/)
  })

  it('CC12 — 반복 타이머가 남아 있지 않다', () => {
    const src = file('/src/components/NumberStepper.tsx')
    for (const gone of ['HOLD_DELAY_MS', 'REPEAT_MS', 'ACCEL_AFTER', 'ACCEL_MS', 'setInterval']) {
      expect(src, `${gone}가 남아 있다`).not.toContain(gone)
    }
    expect(src).toMatch(/onPointerUp=\{\(e\) => release\(1, e\)\}/)
    expect(src).toMatch(/isTap\(started/)
  })

  it('CC12 — pointerdown에서는 값을 바꾸지 않는다', () => {
    const src = file('/src/components/NumberStepper.tsx')
    const downs = src.match(/onPointerDown=\{\(e\) => \{[\s\S]*?\}\}/g) ?? []
    expect(downs.length).toBe(2)
    for (const d of downs) expect(d).not.toMatch(/bump\(/)
  })

  it('CC4 — 가이드가 호흡 라벨을 보여준다', () => {
    expect(file('/src/components/TempoGuideSheet.tsx')).toMatch(/BREATH_LABEL\[pos\.phase\.kind\]/)
  })

  it('CC5·CC16 — 가이드가 phases를 호출부에서 받는다', () => {
    const sheet = file('/src/components/TempoGuideSheet.tsx')
    // 시트가 TEMPO를 직접 읽으면 오버라이드·설정이 반영되지 않는다
    expect(sheet).not.toMatch(/TEMPO\[/)
    expect(sheet).toMatch(/phases: TempoPhase\[\]/)
    expect(file('/src/screens/SessionScreen.tsx')).toMatch(
      /tempoPhasesFor\(exercise\?\.tempo, routineExercise\.group, aEccentricSec\)/,
    )
  })

  it('CC11 — 카드가 openSession을 본다', () => {
    const src = file('/src/screens/HomeScreen.tsx')
    expect(src).toMatch(/openDayId: openSession\?\.dayId \?\? null/)
    expect(src).toMatch(/card\.resuming \? onEnterSession\(\) : start\(displayed\)/)
  })

  it('CC14 — 카드가 직전 메모를 받고, 이력 화면이 타임라인을 그린다', () => {
    expect(file('/src/screens/SessionScreen.tsx')).toMatch(
      /previousNote=\{lastNote\(allSessions, entry\.recordKey\)\}/,
    )
    expect(file('/src/screens/ExerciseHistoryScreen.tsx')).toMatch(/noteHistory\(sessions, selected\)/)
  })

  it('CC15 — 세션 화면에 종목 추가 버튼과 시트가 있다', () => {
    const src = file('/src/screens/SessionScreen.tsx')
    expect(src).toMatch(/\+ 종목 추가/)
    expect(src).toMatch(/actions\.addExercise\(/)
  })

  it('CC15 — 얹은 종목도 프리필을 받는다 (다른 Day의 recordKey다)', () => {
    /*
      실측에서 발견: 얹은 카드의 고스트가 "기준 기록 없음"이었다. prefills가
      `day.exercises`에서만 찾으므로 다른 Day 키는 못 찾았고, 추정 시작 무게도
      지난 기록도 화면에 닿지 않았다.
    */
    const src = file('/src/screens/SessionScreen.tsx')
    expect(src).toMatch(/entry\.extra \? routineExerciseOfEntry\(bundle\.routine, entry\) : undefined/)
  })

  it('CC10 — 편집 화면도 같은 플래그를 넘긴다 (한쪽만 오탐이 남으면 갈라진다)', () => {
    for (const path of ['/src/screens/SessionScreen.tsx', '/src/screens/SessionDetailScreen.tsx']) {
      expect(file(path), path).toMatch(/allowZeroWeight=\{exercise\?\.allowZeroWeight === true\}/)
    }
  })

  it('CC16 — 설정이 문서 범위에서만 고르게 한다', () => {
    const src = file('/src/screens/SettingsScreen.tsx')
    expect(src).toMatch(/A_ECCENTRIC_OPTIONS\.map/)
    // 임의 숫자를 적으면 문서 범위를 벗어날 수 있다
    expect(src).not.toMatch(/\[2, 1\.5\]/)
  })
})
