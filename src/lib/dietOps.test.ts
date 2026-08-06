import { describe, expect, it } from 'vitest'
import {
  applyAddition,
  applyCheckAllItems,
  applyClearAddition,
  applyClearSlot,
  applyClearSubstitution,
  applyNote,
  applyPlan,
  applySkipSlot,
  applySubstitution,
  applyToggleItem,
  emptyDietDay,
} from './dietOps'
import { ADDITION_CAP, SCORE, slotScore, summarizeDietDay } from './diet'
import { BUNDLED_DIET_PLANS } from '../db/seed'

const PLAN = BUNDLED_DIET_PLANS.find((p) => p.id === 'cut-1800')!
const LUNCH = PLAN.slots.find((s) => s.id === 'lunch')!
const base = () => emptyDietDay('2026-08-04', PLAN.id, true)

describe('항목 토글', () => {
  it('체크·해제가 왕복한다', () => {
    const on = applyToggleItem(base(), LUNCH.id, LUNCH.items[0].id)
    expect(on.slots[LUNCH.id].checkedItemIds).toEqual([LUNCH.items[0].id])
    const off = applyToggleItem(on, LUNCH.id, LUNCH.items[0].id)
    expect(off.slots[LUNCH.id].checkedItemIds).toEqual([])
  })

  it('안 먹음 상태에서 항목을 체크하면 안 먹음이 풀린다 (모순 제거)', () => {
    const skipped = applySkipSlot(base(), LUNCH.id)
    const checked = applyToggleItem(skipped, LUNCH.id, LUNCH.items[0].id)
    expect(checked.slots[LUNCH.id].skipped).toBeUndefined()
  })

  it('대체는 유지한다 — "일부 대체"가 실제로 흔하다', () => {
    const sub = applySubstitution(base(), LUNCH.id, { text: '제육', quality: 'similar' })
    const checked = applyToggleItem(sub, LUNCH.id, LUNCH.items[0].id)
    expect(checked.slots[LUNCH.id].substitution?.text).toBe('제육')
    expect(checked.slots[LUNCH.id].checkedItemIds).toEqual([LUNCH.items[0].id])
  })
})

describe('전부 먹음 — 정상일의 주 경로', () => {
  it('슬롯 항목 전부를 체크한다', () => {
    const day = applyCheckAllItems(base(), LUNCH)
    expect(day.slots[LUNCH.id].checkedItemIds).toEqual(LUNCH.items.map((i) => i.id))
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(1)
  })

  it('대체·안 먹음을 지운다 (계획대로 먹었다면 둘은 사실이 아니다)', () => {
    let day = applySubstitution(base(), LUNCH.id, { text: '제육', quality: 'cheat' })
    day = applySkipSlot(day, LUNCH.id)
    day = applyCheckAllItems(day, LUNCH)
    expect(day.slots[LUNCH.id].substitution).toBeUndefined()
    expect(day.slots[LUNCH.id].skipped).toBeUndefined()
  })

  it('슬롯마다 한 번씩이면 하루가 끝난다 (마찰 기준 6~8탭)', () => {
    let day = base()
    let taps = 0
    for (const slot of PLAN.slots) {
      day = applyCheckAllItems(day, slot)
      taps += 1 // 시트의 [전부 먹음] 1탭 (슬롯 헤더 탭은 시트를 여는 동작)
    }
    expect(taps).toBe(6)
    const summary = summarizeDietDay(PLAN, day)
    expect(summary.adherence).toBe('good')
    expect(summary.proteinG).toBe(summary.targetProteinG)
  })
})

describe('안 먹음 · 대체 · 기록 지우기', () => {
  it('안 먹음은 체크와 대체를 비운다', () => {
    let day = applyCheckAllItems(base(), LUNCH)
    day = applySubstitution(day, LUNCH.id, { text: 'x', quality: 'other' })
    day = applySkipSlot(day, LUNCH.id)
    expect(day.slots[LUNCH.id]).toEqual({
      checkedItemIds: [],
      substitution: undefined,
      skipped: true,
    })
  })

  it('기록 지우기는 키를 제거한다 — 미기록과 0점은 다르다', () => {
    const day = applyClearSlot(applyCheckAllItems(base(), LUNCH), LUNCH.id)
    expect(LUNCH.id in day.slots).toBe(false)
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBeNull()
  })

  it('지운 슬롯은 하루 판정의 분모에서도 빠진다', () => {
    let day = base()
    for (const slot of PLAN.slots) day = applyCheckAllItems(day, slot)
    const cleared = applyClearSlot(day, LUNCH.id)
    expect(summarizeDietDay(PLAN, cleared).loggedSlots).toBe(PLAN.slots.length - 1)
  })
})

describe('플랜 전환', () => {
  it('플랜은 그 날짜만 바꾼다', () => {
    const day = applyPlan(base(), 'cut-1500-u')
    expect(day.planId).toBe('cut-1500-u')
    expect(day.date).toBe('2026-08-04')
  })

  /*
   * `applyTrainingDay`는 DD2에서 삭제했다 (매일 같은 5끼 — 전환 UI 자체가 없다).
   * 옛 플랜을 쓰는 날의 구성은 저장값 그대로 판정되고, 그 성질은 diet.test.ts가 잠근다.
   * "op가 없다"는 사실은 v19.test.ts의 소스 스캔이 지킨다 (여기서 부르면 컴파일이 깨진다).
   */
  it('옛 플랜의 훈련일 전용 슬롯 기록은 휴식일 판정에서 무시된다 (키는 남는다)', () => {
    const withPre = applyCheckAllItems(base(), PLAN.slots.find((s) => s.id === 'pre')!)
    const rest = { ...withPre, isTrainingDay: false }
    expect(rest.slots.pre).toBeDefined()
    expect(summarizeDietDay(PLAN, rest).totalSlots).toBe(5)
    expect(summarizeDietDay(PLAN, withPre).loggedSlots).toBe(1)
  })
})

describe('메모', () => {
  it('빈 문자열은 저장하지 않는다', () => {
    expect(applyNote(base(), '  ').note).toBeUndefined()
    expect(applyNote(base(), '회식').note).toBe('회식')
  })
})

// ─── G2 추가로 먹었어요 ─────────────────────────────────

describe('추가 섭취 (G2)', () => {
  const cheatAdd = { text: '라면 반 개', quality: 'cheat' as const }
  const goodAdd = { text: '삶은 달걀 2개', quality: 'similar' as const }

  it('대체와 독립이다 — 동시에 존재할 수 있다', () => {
    let day = applySubstitution(base(), LUNCH.id, { text: '제육', quality: 'other' })
    day = applyAddition(day, LUNCH.id, cheatAdd)
    expect(day.slots[LUNCH.id].substitution?.text).toBe('제육')
    expect(day.slots[LUNCH.id].addition?.text).toBe('라면 반 개')
  })

  it('일괄 체크가 추가 기록을 지우지 않는다', () => {
    // "계획대로 다 먹고 그 위에 더 먹었다"가 흔한 조합이다
    let day = applyAddition(base(), LUNCH.id, cheatAdd)
    day = applyCheckAllItems(day, LUNCH)
    expect(day.slots[LUNCH.id].addition).toEqual(cheatAdd)
    expect(day.slots[LUNCH.id].checkedItemIds).toHaveLength(LUNCH.items.length)
  })

  it('안 먹음은 추가도 지운다 (모순)', () => {
    let day = applyAddition(base(), LUNCH.id, cheatAdd)
    day = applySkipSlot(day, LUNCH.id)
    expect(day.slots[LUNCH.id].addition).toBeUndefined()
  })

  it('추가로 먹었다고 하면 안 먹음이 풀린다', () => {
    let day = applySkipSlot(base(), LUNCH.id)
    day = applyAddition(day, LUNCH.id, cheatAdd)
    expect(day.slots[LUNCH.id].skipped).toBeUndefined()
  })

  it('추가만 따로 지울 수 있다 (체크·대체 유지)', () => {
    let day = applyCheckAllItems(base(), LUNCH)
    day = applyAddition(day, LUNCH.id, cheatAdd)
    day = applyClearAddition(day, LUNCH.id)
    expect(day.slots[LUNCH.id].addition).toBeUndefined()
    expect(day.slots[LUNCH.id].checkedItemIds).toHaveLength(LUNCH.items.length)
  })

  it('건강한 추가는 무벌점 — 완수 점수가 유지된다', () => {
    let day = applyCheckAllItems(base(), LUNCH)
    day = applyAddition(day, LUNCH.id, goodAdd)
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(1)
  })

  it('치팅 추가는 완수했어도 반영된다 — "계획 완수 + 야식"은 완수가 아니다', () => {
    let day = applyCheckAllItems(base(), LUNCH)
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(1)
    day = applyAddition(day, LUNCH.id, cheatAdd)
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(ADDITION_CAP.cheat)
  })

  it('상한으로만 작용한다 — 이미 낮은 점수를 더 깎지 않는다', () => {
    /*
      "안 먹음 + 추가"는 조합 자체가 존재하지 않는다 — applyAddition이 skipped를
      해제한다 (안 먹었다면서 더 먹었다는 건 모순이고, 그건 대체로 적을 일이다).
      그래서 상한 검증은 skipped가 아닌 낮은 점수로 한다.
    */
    /*
      Z6에서 체크 경로가 연속값이 됐으므로 "절반 체크 = 0.5"를 단정하지 않는다.
      지켜야 하는 성질은 **추가가 상한으로만 작용한다**는 것이다 —
      상한(similar = 1)보다 낮은 점수는 추가 후에도 그대로여야 한다.
    */
    let day = applyToggleItem(base(), LUNCH.id, LUNCH.items[0].id)
    day = applyToggleItem(day, LUNCH.id, LUNCH.items[1].id)
    const before = slotScore(LUNCH, day.slots[LUNCH.id])!
    expect(before).toBeLessThan(ADDITION_CAP.similar)
    day = applyAddition(day, LUNCH.id, goodAdd)
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(before)

    // 치팅 대체(0)에 치팅 추가(상한 0.5) → 0 유지
    let worse = applySubstitution(base(), LUNCH.id, { text: 'x', quality: 'cheat' })
    worse = applyAddition(worse, LUNCH.id, cheatAdd)
    expect(slotScore(LUNCH, worse.slots[LUNCH.id])).toBe(SCORE.cheat)
  })

  it('기존 기록(필드 없음)은 영향받지 않는다', () => {
    const legacy = applyCheckAllItems(base(), LUNCH)
    expect(legacy.slots[LUNCH.id].addition).toBeUndefined()
    expect(slotScore(LUNCH, legacy.slots[LUNCH.id])).toBe(1)
  })
})

/**
 * 대체와 추가는 **지우기까지 대칭**이어야 한다 (AA3).
 *
 * 피드백: "대체했는데 단백질을 따로 추가했으면 추가 버튼으로 추가할 수 있어야 하는 것
 * 아닌가?" — 모델은 이미 공존을 지원했고 시트가 경로를 가렸다. 그 시트를 고치면서
 * 드러난 두 번째 비대칭이 이것이다: 추가만 따로 지울 수 있고 대체는 슬롯 전체 삭제뿐이었다.
 */
describe('대체만 지우기 (AA3)', () => {
  const add = { text: '단백질 쉐이크', quality: 'similar' as const }
  const sub = { text: '회사 근처 서브웨이', quality: 'other' as const }

  it('대체만 지우고 추가·체크는 남긴다', () => {
    let day = applyToggleItem(base(), LUNCH.id, LUNCH.items[0].id)
    day = applySubstitution(day, LUNCH.id, sub)
    day = applyAddition(day, LUNCH.id, add)
    day = applyClearSubstitution(day, LUNCH.id)

    const record = day.slots[LUNCH.id]
    expect(record.substitution).toBeUndefined()
    expect(record.addition).toEqual(add)
    expect(record.checkedItemIds).toEqual([LUNCH.items[0].id])
  })

  it('applyClearAddition의 거울이다 — 반대쪽을 지워도 같은 성질', () => {
    let day = applySubstitution(base(), LUNCH.id, sub)
    day = applyAddition(day, LUNCH.id, add)
    expect(applyClearAddition(day, LUNCH.id).slots[LUNCH.id].substitution).toEqual(sub)
    expect(applyClearSubstitution(day, LUNCH.id).slots[LUNCH.id].addition).toEqual(add)
  })

  it('슬롯 키를 지우지 않는다 — 기록 지우기와 다른 동작이다', () => {
    let day = applySubstitution(base(), LUNCH.id, sub)
    day = applyClearSubstitution(day, LUNCH.id)
    // 대체만 걷어낸 "미섭취 기록"은 남는다 (판정 분모에 계속 들어간다)
    expect(day.slots[LUNCH.id]).toBeDefined()
    expect(applyClearSlot(day, LUNCH.id).slots[LUNCH.id]).toBeUndefined()
  })

  it('안 먹음은 건드리지 않는다 (대체가 아닌 사실이다)', () => {
    let day = applySkipSlot(base(), LUNCH.id)
    day = applyClearSubstitution(day, LUNCH.id)
    expect(day.slots[LUNCH.id].skipped).toBe(true)
  })
})

/**
 * 피드백에 이름 붙인 시나리오 — "대체했는데 단백질 쉐이크를 추가로 마셨다" (AA3).
 *
 * G2 테스트가 점수 규칙을 이미 잠갔지만, 그 규칙이 **사용자가 실제로 밟는 조작 순서**로
 * 재현되는지는 별개다 (시트가 막고 있던 것이 정확히 그 순서였다).
 */
describe('시나리오: 대체 + 추가 공존 (AA3)', () => {
  it('대체를 적은 뒤 추가를 적어도 둘 다 남고 점수가 합산된다', () => {
    // 1) 점심을 서브웨이로 대체 (비슷한 구성 → base 1.0)
    let day = applySubstitution(base(), LUNCH.id, {
      text: '회사 근처 서브웨이 15cm 터키',
      quality: 'similar',
    })
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(SCORE.full)

    // 2) 그 위에 단백질 쉐이크를 추가 — 건강한 추가는 무벌점(상한 1.0)
    day = applyAddition(day, LUNCH.id, { text: '단백질 쉐이크', quality: 'similar' })
    expect(day.slots[LUNCH.id].substitution?.quality).toBe('similar')
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(SCORE.full)

    // 3) 치팅을 추가했다면 대체 점수에 상한이 걸린다 (base는 그대로)
    day = applyAddition(day, LUNCH.id, { text: '라면 반 개', quality: 'cheat' })
    expect(day.slots[LUNCH.id].substitution?.text).toContain('서브웨이')
    expect(slotScore(LUNCH, day.slots[LUNCH.id])).toBe(ADDITION_CAP.cheat)
  })

  it('전부 먹음은 대체를 지우지만 추가는 남긴다 (기존 의미 유지)', () => {
    // AA3에서 조작을 넓혔어도 이 규칙은 바뀌지 않는다 — 잠가 둔다
    let day = applySubstitution(base(), LUNCH.id, { text: '서브웨이', quality: 'other' })
    day = applyAddition(day, LUNCH.id, { text: '단백질 쉐이크', quality: 'similar' })
    day = applyCheckAllItems(day, LUNCH)
    expect(day.slots[LUNCH.id].substitution).toBeUndefined()
    expect(day.slots[LUNCH.id].addition?.text).toBe('단백질 쉐이크')
  })
})
