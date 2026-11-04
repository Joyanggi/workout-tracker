import { describe, expect, it } from 'vitest'
import { buildSession } from './sessionFactory'
import { exportMarkdown } from './exportMarkdown'
import { ROUTINE, completedSession } from './testFixtures'
import EXERCISES from '../data/exercises.json'
import type { Exercise, Phase, Session, SessionMode } from '../types'

/**
 * v1.12 JJ — 복귀·디로드가 깎은 세트 수를 세션이 기억한다.
 * 이 파일의 JJ_BUILD_GOLDEN·JJ_EXPORT_NORMAL_BEFORE는 v1.11.2 코드(JJ 구현 전)로 만든 표이고
 * 이후 커밋에서 고치지 않는다.
 */

const catalog = new Map<string, Exercise>((EXERCISES as Exercise[]).map((e) => [e.id, e]))
const PHASE: Phase = 1

// ─── 생성 불변 골든 (JJ1) ────────────────────────────────

const GOLDEN_HISTORY = (): Session[] => [
  completedSession({ dayId: 'd1', date: '2026-08-05', weight: 40, fullReps: true }),
  completedSession({ dayId: 'd1', date: '2026-07-29', weight: 37.5 }),
]

const GOLDEN_CASES: { name: string; mode: SessionMode; step?: number }[] = [
  { name: 'normal', mode: 'normal' },
  { name: 'deload', mode: 'deload' },
  { name: 'return1', mode: 'return', step: 0 },
  { name: 'return2', mode: 'return', step: 1 },
  { name: 'return3', mode: 'return', step: 2 },
  { name: 'returnNoStep', mode: 'return' },
]

/** 칸(행 수·무게·반복)만 문자열로 — 새 필드는 골든 밖이다 */
export function goldenRows(): Record<string, string[]> {
  const day = ROUTINE.days.find((d) => d.id === 'd1')!
  const out: Record<string, string[]> = {}
  for (const c of GOLDEN_CASES) {
    const { session } = buildSession({
      routine: ROUTINE,
      day,
      mode: c.mode,
      sessions: GOLDEN_HISTORY(),
      phase: PHASE,
      today: '2026-10-07',
      returnStep: c.step === undefined ? undefined : ROUTINE.rules.returnProtocol![c.step],
    })
    out[c.name] = session.entries.map(
      (e) => `${e.recordKey}: ${e.sets.map((s) => `${s.weight}x${s.reps}`).join(' ')}`,
    )
  }
  return out
}

// ─── normal 내보내기 골든 (JJ2) ──────────────────────────

export function normalExportFixtures(): Record<string, string> {
  const range = { from: '2026-08-01', to: '2026-08-31' }
  const render = (s: Session) =>
    exportMarkdown({ sessions: [s], routine: ROUTINE, catalog, phase: PHASE, range })
      // 시각은 실행 환경 시간대를 따르므로 괄호 안만 고정한다 (소요 분은 유지)
      .replace(/\[\d\d:\d\d–\d\d:\d\d, /g, '[시각, ')

  const allDone = completedSession({ dayId: 'd1', date: '2026-08-12', weight: 40, fullReps: true })

  const oneUnchecked = completedSession({ dayId: 'd1', date: '2026-08-12', weight: 40 })
  oneUnchecked.entries[0].sets[oneUnchecked.entries[0].sets.length - 1].done = false

  const rowDeleted = completedSession({ dayId: 'd1', date: '2026-08-12', weight: 40 })
  rowDeleted.entries[0].sets.pop()

  return {
    allDone: render(allDone),
    oneUnchecked: render(oneUnchecked),
    rowDeleted: render(rowDeleted),
  }
}

export const JJ_BUILD_GOLDEN: Record<string, string[]> = {
  normal: [
    "incline-chest-press@d1: 42.5x10 42.5x10 42.5x10 42.5x10",
    "pec-deck-fly@d1: 40x15 40x15 40x15",
    "flat-chest-press@d1: 42.5x12 42.5x12 42.5x12",
    "shoulder-press@d1: 42.5x12 42.5x12 42.5x12",
    "lateral-raise@d1: 40x20 40x20 40x20 40x20",
    "rear-delt-fly@d1: 40x20 40x20",
    "pushdown@d1: 40x15 40x15 40x15"
  ],
  deload: [
    "incline-chest-press@d1: 40x10 40x10",
    "pec-deck-fly@d1: 40x15 40x15",
    "flat-chest-press@d1: 40x12 40x12",
    "shoulder-press@d1: 40x12 40x12",
    "lateral-raise@d1: 40x20 40x20",
    "rear-delt-fly@d1: 40x20",
    "pushdown@d1: 40x15 40x15"
  ],
  return1: [
    "incline-chest-press@d1: 38x10 38x10 38x10",
    "pec-deck-fly@d1: 38x15 38x15",
    "flat-chest-press@d1: 38x12 38x12",
    "shoulder-press@d1: 38x12 38x12",
    "lateral-raise@d1: 38x20 38x20 38x20",
    "rear-delt-fly@d1: 38x20",
    "pushdown@d1: 38x15 38x15"
  ],
  return2: [
    "incline-chest-press@d1: 36x10 36x10",
    "pec-deck-fly@d1: 36x15 36x15",
    "flat-chest-press@d1: 36x12 36x12",
    "shoulder-press@d1: 36x12 36x12",
    "lateral-raise@d1: 36x20 36x20",
    "rear-delt-fly@d1: 36x20",
    "pushdown@d1: 36x15 36x15"
  ],
  return3: [
    "incline-chest-press@d1: 32x10 32x10",
    "pec-deck-fly@d1: 32x15 32x15",
    "flat-chest-press@d1: 32x12 32x12",
    "shoulder-press@d1: 32x12 32x12",
    "lateral-raise@d1: 32x20 32x20",
    "rear-delt-fly@d1: 32x20",
    "pushdown@d1: 32x15 32x15"
  ],
  returnNoStep: [
    "incline-chest-press@d1: 40x10 40x10 40x10 40x10",
    "pec-deck-fly@d1: 40x15 40x15 40x15",
    "flat-chest-press@d1: 40x12 40x12 40x12",
    "shoulder-press@d1: 40x12 40x12 40x12",
    "lateral-raise@d1: 40x20 40x20 40x20 40x20",
    "rear-delt-fly@d1: 40x20 40x20",
    "pushdown@d1: 40x15 40x15 40x15"
  ]
}

export const JJ_EXPORT_NORMAL_BEFORE: Record<string, string> = {
  allDone: "# 운동 기록 2026-08-01 ~ 2026-08-31\n\n> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**\n> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)\n\n## 2026-08-12 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 40kg\n10 / 10 / 10 / 10\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n다음: 42.5kg로 증량\n\n### 펙덱 플라이 (D1/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 42.5kg로 증량\n\n### 숄더프레스 (D1/A) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 42.5kg로 증량\n\n### 레터럴 레이즈 (D1/B) 40kg\n20 / 20 / 20 / 20\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n20 / 20\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n15 / 15 / 15\n간격: 0:00 / 0:00\n보상작용: 없음\n",
  oneUnchecked: "# 운동 기록 2026-08-01 ~ 2026-08-31\n\n> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**\n> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)\n\n## 2026-08-12 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 40kg\n6 / 6 / 6\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(10회) 미달 — 3세트 중 0세트 도달)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 숄더프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n",
  rowDeleted: "# 운동 기록 2026-08-01 ~ 2026-08-31\n\n> 간격 = 앞 세트 체크 ~ 이 세트 체크. **수행 시간이 포함되므로 순수 휴식이 아니다.**\n> 첫 세트는 앞이 없어 생략한다. (`—`는 그 세트에 타임스탬프가 없는 옛 기록)\n\n## 2026-08-12 (수) — Day 1 Push  [시각, 90분]\n수행 순서: 인클라인 프레스 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 레터럴 레이즈 → 리어델트 → 푸쉬다운\n\n### 인클라인 프레스 (D1/A) 40kg\n6 / 6 / 6\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(10회) 미달 — 3세트 중 0세트 도달)\n\n### 펙덱 플라이 (D1/B) 40kg\n12 / 12 / 12\n간격: 0:00 / 0:00\n보상작용: 없음\n\n### 체스트프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 숄더프레스 (D1/A) 40kg\n8 / 8 / 8\n간격: 0:00 / 0:00\n보상작용: 없음\n다음: 40kg 유지 (반복 상단(12회) 미달 — 3세트 중 0세트 도달)\n\n### 레터럴 레이즈 (D1/B) 40kg\n12 / 12 / 12 / 12\n간격: 0:00 / 0:00 / 0:00\n보상작용: 없음\n\n### 리어델트 (D1/B) 40kg\n12 / 12\n간격: 0:00\n보상작용: 없음\n\n### 푸쉬다운 (D1/B) 40kg\n10 / 10 / 10\n간격: 0:00 / 0:00\n보상작용: 없음\n"
}

describe('JJ1 — 생성 불변 (골든)', () => {
  it('normal·deload·return(1·2·3단계)·return(step 없음)의 entries(행 수·무게·반복)가 JJ_BUILD_GOLDEN과 칸마다 같다', () => {
    expect(goldenRows()).toEqual(JJ_BUILD_GOLDEN)
  })
})

describe('JJ2 — normal 불변 (골든)', () => {
  it('normal 세션 셋(전부 완료 · 한 행 미체크 · 행 하나 삭제)의 exportMarkdown 전문이 JJ_EXPORT_NORMAL_BEFORE와 문자 단위로 같다', () => {
    expect(normalExportFixtures()).toEqual(JJ_EXPORT_NORMAL_BEFORE)
  })
})
