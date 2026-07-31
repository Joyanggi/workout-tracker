import type { Exercise, RoutineDay, RoutineTemplate } from '../types'

/**
 * 시드 정합성 검사.
 *
 * muscleSets(Day 단위 집계)와 exercises[].muscle × sets(종목 단위)를 이중으로
 * 들고 있으므로, 둘이 어긋나면 §4 제안 로직과 홈 대시보드가 서로 다른 숫자를
 * 말하게 된다. 루틴 JSON을 손으로 고치는 경로(설정 → 루틴 가져오기)가 있으니
 * 로드 시점에 반드시 검사한다.
 */
export function validateRoutine(routine: RoutineTemplate, catalog: Exercise[]): string[] {
  const problems: string[] = []
  const catalogIds = new Set(catalog.map((e) => e.id))
  const targetKeys = new Set(Object.keys(routine.muscleTargets))

  const checkDay = (day: RoutineDay, label: string) => {
    // 1. 종목이 카탈로그에 있는가
    for (const ex of day.exercises) {
      if (!catalogIds.has(ex.exerciseId)) {
        problems.push(`${label}: 카탈로그에 없는 종목 "${ex.exerciseId}"`)
      }
      if (!targetKeys.has(ex.muscle)) {
        problems.push(`${label}/${ex.exerciseId}: muscleTargets에 없는 부위 "${ex.muscle}"`)
      }
      if (ex.repMin > ex.repMax) {
        problems.push(`${label}/${ex.exerciseId}: repMin(${ex.repMin}) > repMax(${ex.repMax})`)
      }
    }

    // 2. plannedOrder 중복
    const orders = day.exercises.map((e) => e.plannedOrder)
    if (new Set(orders).size !== orders.length) {
      problems.push(`${label}: plannedOrder 중복`)
    }

    // 3. (recordKey 충돌) 같은 Day 안에서 같은 종목이 두 번 나오면
    //    recordKey가 겹쳐 기록이 섞인다.
    const exIds = day.exercises.map((e) => e.exerciseId)
    if (new Set(exIds).size !== exIds.length) {
      problems.push(`${label}: 같은 Day에 동일 종목 중복 — recordKey 충돌`)
    }

    // 4. muscleSets == Σ(종목별 sets)
    const derived: Record<string, number> = {}
    for (const ex of day.exercises) {
      derived[ex.muscle] = (derived[ex.muscle] ?? 0) + ex.sets
    }
    const keys = new Set([...Object.keys(derived), ...Object.keys(day.muscleSets)])
    for (const k of keys) {
      const a = derived[k] ?? 0
      const b = day.muscleSets[k] ?? 0
      if (a !== b) {
        problems.push(`${label}: muscleSets["${k}"]=${b} 이지만 종목 합은 ${a}`)
      }
    }
  }

  routine.days.forEach((d) => checkDay(d, `days/${d.id}`))
  routine.fallbackDays.forEach((d) => checkDay(d, `fallbackDays/${d.id}`))

  // 5. 하체 최소 보장 규칙이 가리키는 Day가 실제로 존재하는가 (§4 규칙 2)
  if (!routine.days.some((d) => d.id === routine.rules.lowerBodyDayId)) {
    problems.push(`rules.lowerBodyDayId "${routine.rules.lowerBodyDayId}"에 해당하는 Day가 없음`)
  }

  // 6. 복귀 프로토콜은 gapWeeksMin 오름차순이어야 한다 (가장 큰 구간 우선 매칭 로직 전제)
  const gaps = routine.rules.returnProtocol.map((r) => r.gapWeeksMin)
  if (gaps.some((g, i) => i > 0 && g <= gaps[i - 1])) {
    problems.push('rules.returnProtocol의 gapWeeksMin이 오름차순이 아님')
  }

  return problems
}
