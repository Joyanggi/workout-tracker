import { variantsOf, visiblePlans } from './diet'
import type { DietDay, DietPlan, Food } from '../types'

/**
 * 내 음식 목록 (MM1) — 순수 함수. React·Dexie 없음.
 *
 * 목록은 두 원천을 합친 것이다: 플랜 품목은 저장하지 않고 플랜에서 파생하고,
 * 사용자가 직접 넣은 음식만 `settings.userFoods`에 저장한다.
 */

export interface CatalogFood {
  source: 'user' | 'plan'
  id?: string // user일 때만
  name: string
  qty: string
  kcal?: number
  proteinG?: number
}

export interface FoodInput {
  name: string
  qty: string
  kcal?: number
  proteinG?: number
}

/** 같은 음식인지 판정하는 **유일한 자리** — 이름·분량의 앞뒤 공백은 무시한다 */
export function foodKey(name: string, qty: string): string {
  return `${name.trim()}|${qty.trim()}`
}

/** 플랜 품목(기본·대체 변형 전부)을 음식으로 편다. `legacy` 플랜은 뺀다 */
export function planFoods(plans: DietPlan[]): CatalogFood[] {
  const seen = new Set<string>()
  const out: CatalogFood[] = []
  for (const plan of visiblePlans(plans)) {
    for (const slot of plan.slots) {
      for (const item of slot.items) {
        for (const v of variantsOf(item)) {
          const key = foodKey(v.name, v.qty)
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ source: 'plan', name: v.name, qty: v.qty, kcal: v.kcal, proteinG: v.proteinG })
        }
      }
    }
  }
  return out
}

/** `foodKey` → 마지막으로 먹은 때 (`날짜 시각`, 사전순 비교가 곧 시간순) */
function lastEaten(days: DietDay[]): Map<string, string> {
  const last = new Map<string, string>()
  for (const day of days) {
    for (const e of day.log ?? []) {
      const key = foodKey(e.name, e.qty)
      const at = `${day.date} ${e.time}`
      const prev = last.get(key)
      if (prev === undefined || at > prev) last.set(key, at)
    }
  }
  return last
}

/**
 * 내 음식 + 플랜 품목. 같은 `foodKey`가 양쪽에 있으면 내 음식을 남긴다.
 * 정렬: ① `log`에 적힌 적 있는 것(최근 순) ② 적힌 적 없는 내 음식(`createdAt` 최신순)
 * ③ 적힌 적 없는 플랜 품목(플랜 순서). "마지막으로 먹은 때"는 `days`에서 찾는다 — 저장하지 않는다.
 */
export function foodCatalog(plans: DietPlan[], userFoods: Food[], days: DietDay[]): CatalogFood[] {
  const userKeys = new Set(userFoods.map((f) => foodKey(f.name, f.qty)))
  const mine = userFoods.map((f) => ({
    createdAt: f.createdAt,
    food: {
      source: 'user',
      id: f.id,
      name: f.name,
      qty: f.qty,
      kcal: f.kcal,
      proteinG: f.proteinG,
    } as CatalogFood,
  }))
  const fromPlans = planFoods(plans).filter((f) => !userKeys.has(foodKey(f.name, f.qty)))

  const last = lastEaten(days)
  const atOf = (f: CatalogFood) => last.get(foodKey(f.name, f.qty))
  const eaten = [...mine.map((m) => m.food), ...fromPlans].filter((f) => atOf(f) !== undefined)
  const myRest = mine.filter((m) => atOf(m.food) === undefined)
  const planRest = fromPlans.filter((f) => atOf(f) === undefined)

  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)
  eaten.sort((a, b) => desc(atOf(a)!, atOf(b)!))
  myRest.sort((a, b) => desc(a.createdAt, b.createdAt))
  return [...eaten, ...myRest.map((m) => m.food), ...planRest]
}

const isBadNumber = (v: number | undefined): boolean =>
  v !== undefined && (!Number.isFinite(v) || v < 0)

/** 등록·수정 입력의 문제 문구. 없으면 빈 배열. `editingId`는 수정 중인 자기 자신을 건너뛴다 */
export function validateFood(
  input: FoodInput,
  plans: DietPlan[],
  userFoods: Food[],
  editingId?: string,
): string[] {
  const problems: string[] = []
  if (input.name.trim().length === 0) problems.push('이름을 적어 주세요')
  if (isBadNumber(input.kcal) || isBadNumber(input.proteinG)) {
    problems.push('칼로리와 단백질은 0 이상의 숫자로 적어 주세요')
  }
  const key = foodKey(input.name, input.qty)
  const dupUser = userFoods.some((f) => f.id !== editingId && foodKey(f.name, f.qty) === key)
  const dupPlan = planFoods(plans).some((f) => foodKey(f.name, f.qty) === key)
  if (input.name.trim().length > 0 && (dupUser || dupPlan)) {
    problems.push('같은 이름·분량의 음식이 이미 목록에 있습니다')
  }
  return problems
}

function clean(input: FoodInput): Pick<Food, 'name' | 'qty' | 'kcal' | 'proteinG'> {
  const out: Pick<Food, 'name' | 'qty' | 'kcal' | 'proteinG'> = {
    name: input.name.trim(),
    qty: input.qty.trim(),
  }
  if (input.kcal !== undefined) out.kcal = input.kcal
  if (input.proteinG !== undefined) out.proteinG = input.proteinG
  return out
}

export function applyAddFood(foods: Food[], food: Food): Food[] {
  return [...foods, food]
}

/** 이름·분량·영양값을 갈아 끼운다. 없는 영양값은 키를 지운다(비운 칸은 "미입력") */
export function applyUpdateFood(foods: Food[], id: string, input: FoodInput): Food[] {
  return foods.map((f) => (f.id === id ? { id: f.id, createdAt: f.createdAt, ...clean(input) } : f))
}

export function applyRemoveFood(foods: Food[], id: string): Food[] {
  return foods.filter((f) => f.id !== id)
}
