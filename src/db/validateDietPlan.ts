import type { DietPlan, DietSlot } from '../types'
import { planTotals, restDaySlotsOf, variantsOf } from '../lib/diet'

/**
 * 식단 플랜 정합성 검사 (D1).
 *
 * 루틴(`validateRoutine`)과 같은 이유로 둔다: 깨진 플랜이 들어오면 단백질 지표와
 * 준수 판정이 서로 다른 숫자를 말하기 시작하고 원인 추적이 매우 어렵다.
 * 시드 주입과 사용자 JSON 가져오기가 **같은 검사**를 통과해야 한다.
 */
export function validateDietPlan(plan: DietPlan): string[] {
  const problems: string[] = []
  const need = (cond: boolean, message: string) => {
    if (!cond) problems.push(message)
  }

  need(typeof plan.id === 'string' && plan.id.length > 0, 'id가 없습니다')
  need(typeof plan.name === 'string' && plan.name.length > 0, 'name이 없습니다')
  need(Number.isInteger(plan.seedRevision) && plan.seedRevision > 0, 'seedRevision이 양의 정수가 아닙니다')

  /*
   * `restDaySlots`는 **옛 플랜에만** 있다 (DD2). 있으면 계속 검사한다 — 백업에서 돌아온
   * 플랜이 과거 날짜를 판정하므로, 검사를 빼면 깨진 옛 플랜이 조용히 통과한다.
   */
  const restDaySlots = restDaySlotsOf(plan)
  const groups: [string, DietSlot[] | undefined][] = [
    ['slots', plan.slots],
    ...(restDaySlots ? ([['restDaySlots', restDaySlots]] as [string, DietSlot[]][]) : []),
  ]
  for (const [key, slots] of groups) {
    if (!Array.isArray(slots) || slots.length === 0) {
      problems.push(`${key}가 비어 있습니다`)
      continue
    }
    const slotIds = new Set<string>()
    for (const slot of slots) {
      if (slotIds.has(slot.id)) problems.push(`${key}: 슬롯 id 중복 "${slot.id}"`)
      slotIds.add(slot.id)
      if (!Array.isArray(slot.items) || slot.items.length === 0) {
        problems.push(`${key}/${slot.id}: 항목이 없습니다`)
        continue
      }
      // 항목 id는 슬롯 안에서 유일해야 한다 — checkedItemIds가 id로 매칭하므로
      // 중복되면 한 번 체크에 둘이 켜지고 단백질이 두 번 더해진다
      const itemIds = new Set<string>()
      for (const item of slot.items) {
        if (itemIds.has(item.id)) problems.push(`${key}/${slot.id}: 항목 id 중복 "${item.id}"`)
        itemIds.add(item.id)
        if (!Number.isFinite(item.kcal) || item.kcal < 0) {
          problems.push(`${key}/${slot.id}/${item.id}: kcal이 올바르지 않습니다`)
        }
        if (!Number.isFinite(item.proteinG) || item.proteinG < 0) {
          problems.push(`${key}/${slot.id}/${item.id}: proteinG가 올바르지 않습니다`)
        }
        /*
         * 변형도 같은 검사를 받는다 (DD3) — 변형의 kcal이 깨지면 그 변형을 고른 날의
         * 마크로만 조용히 틀린다 (기본 변형만 검사하면 잡히지 않는다).
         */
        for (const [i, variant] of variantsOf(item).entries()) {
          const where = `${key}/${slot.id}/${item.id}/변형${i}`
          if (variant.name.length === 0 || variant.qty.length === 0) {
            problems.push(`${where}: 이름·수량이 비어 있습니다`)
          }
          if (!Number.isFinite(variant.kcal) || variant.kcal < 0) {
            problems.push(`${where}: kcal이 올바르지 않습니다`)
          }
          if (!Number.isFinite(variant.proteinG) || variant.proteinG < 0) {
            problems.push(`${where}: proteinG가 올바르지 않습니다`)
          }
        }
      }
    }
  }

  /*
   * 훈련일과 휴식일의 총량이 같아야 한다 (루틴 문서 15장 — 휴식일은 훈련 전·직후를
   * 한 블록으로 합치는 것이지 총량을 줄이는 것이 아니다).
   * 이 검사가 없으면 휴식일에 조용히 덜 먹는 플랜이 통과한다.
   */
  if (problems.length === 0 && restDaySlots) {
    const t = planTotals(plan, true)
    const r = planTotals(plan, false)
    if (t.kcal !== r.kcal || t.proteinG !== r.proteinG) {
      problems.push(
        `훈련일/휴식일 총량 불일치: ${t.kcal}kcal·${t.proteinG}g vs ${r.kcal}kcal·${r.proteinG}g`,
      )
    }
  }

  return problems
}
