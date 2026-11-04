# PLAN v1.13 — 복귀 무게는 기구에 있는 무게로, 화면·내보내기는 저빈도의 결과를 말한다 (KK)

> 작성: Opus 5.5 (설계자), 2026-11-04. 대상 코드: v1.12.0 (`main` `25ee510`).
> 근거: `docs/FIELD-REPORT-2026-11-04.md` 4·5·6절, 9-1·9-2절, **12절 사용자 답과 "Q2 설계 쟁점에 대한 답"**.
> 12절은 브랜치 `Joyanggi/field-report-2026-11`(`8dcd506`)에 있고, 이 PLAN을 쓴 시점에는 `main`에 머지되지 않았다.
>
> **성격**: 규칙이 바뀌는 곳은 **복귀 무게 하나**다(Q2 답). 나머지 넷은 규칙을 두고 표시만 더한다(Q8 답 "곧 주 3~4회로 돌아간다").
> Day 제안(`suggestNextDay`의 Day 선택)·증량 판정(`judgeProgression`)·세트 수(`adjustedSetCount`)·PR·볼륨·빈도 경고는 바뀌지 않는다.
>
> **범위에서 뺀 것 (12절)**: 저빈도용 Day 제안 규칙·Day 단위 복귀(4·5절 "규칙"), 7절 통증 칸(Q7 미답), 7절 유산소 종류(소형, 다음 라운드),
> 8절 데드버그(Q4 "그대로 둔다"), 9-3과 식단 전반(Q5 식단 재설계).

---

## 작업 개요

| ID | 내용 | 보고서 | 저장 형태 |
|---|---|---|---|
| KK1 | 복귀 무게 규칙: 4주 이하 유지 · 4주 초과 한 단계 · 8주 이상 −20%를 기구 무게로. 정확히 28일은 4주 이하 | 6절, Q2 | 루틴 단계에 선택 필드 2개, 세션 `modeAdjust`에 선택 필드 2개, entry에 `returnWeight` |
| KK2 | 복귀 세션이 실제 적용분과 여유 반복을 말한다 (내보내기 헤더·종목 줄·종목 카드), KK 이전 세션은 `(당시 규칙)` | 6절, Q2 | 없음 (KK1 저장값을 읽는다) |
| KK3 | Day별 마지막 수행일: Day 선택 시트에 나오고, 홈 카드에 "오래 안 한 Day" 한 줄 | 4절 | 없음 (파생) |
| KK4 | 정상 세션이 그 Day 자체의 긴 공백을 말한다 (홈 카드·내보내기) + 세트 부족 보류 사유 문구 | 5절 | 없음 (파생) |
| KK5 | 내보내기 잡음: 유산소만 한 세션 · 내용 없는 식단 날짜 | 9-1·9-2 | 없음 |

---

## KK1. 복귀 무게 규칙: 기구에 있는 무게만 쓴다

### 진단

| 사실 | 근거 |
|---|---|
| 복귀 무게 = `roundToHalf(base × (1 + weightPct/100))`, 0.5kg 단위. 종목 무게 단위(T9)를 보지 않는다 → 28.5·24·19처럼 기구에 없는 무게가 나온다 | `sessionFactory.ts:15-18`, `:94-96` |
| 단위에 맞춰 내리는 함수는 이미 있다 | `weightScale.ts:126` `snapDownToScale` · `:111` `stepDown` · `:178` `easierWeight`(어시스티드면 보조를 올린다) |
| 어시스티드(`inverse`)에도 같은 곱셈이 걸린다 → 보조 무게가 줄어 **더 어려워진다**. 지금 루틴 Day에는 어시스티드가 없어 실제로 일어나지 않았다 (대체 종목으로만 있다) | `sessionFactory.ts:96` · `exercises.json:342` · `routine-v2.4.json`에 `assisted-pullup` 없음 |
| 단계 선택은 `공백/7 >= gapWeeksMin` → 정확히 28일이 4주 단계(−40%·−10%)에 들어간다. 답은 "28일은 4주 이하" | `suggestNextDay.ts:77-87` |
| `ReturnProtocolStep`은 `weightPct` 숫자 하나뿐이다 → "단위 한 칸"을 표현할 수 없다 | `types.ts:89-95` |
| 단계 데이터는 스캐폴드(`3023571`) 이후 한 번도 바뀌지 않았다 (−5/−10/−20, 2/4/8주) | `git log -S weightPct -- src/data/routine-v2.4.json` |
| 홈 복귀 배너가 `무게 {weightPct}%`를 그대로 찍는다 → 새 규칙에서는 `무게 0%`가 된다 | `HomeScreen.tsx:259-260` |
| 세션은 `modeAdjust {setPct, weightPct}`만 저장한다 (JJ1). 어떤 무게 규칙으로 만들었는지는 없다 | `types.ts:277-298` · `setPlan.ts:34-41` |
| 루틴은 시드·루틴 가져오기·Gist 복원으로 들어온다. 복원·가져오기된 옛 형식 루틴에 새 필드가 없을 수 있다 | `seed.ts:60-99` · `RoutineIoPanel.tsx:58-68` · `backup.ts:242-283` |

### 설계

**결정: 루틴 데이터에 선택 필드를 더한다(코드 상수로 두지 않는다).** 새 필드가 없는 루틴(옛 백업·가져오기)은 옛 의미로 읽으므로 마이그레이션이 없다.
코드에 둘째 단계 규칙을 박으면 루틴 JSON의 `weightPct`가 앱이 하지 않는 일을 말하게 된다.

**1. 루틴 형식** — `src/types.ts`

```ts
/** 복귀 무게 규칙 (KK1). 'keep' 그대로 · 'oneStep' 종목 무게 단위로 한 칸 · 'pctSnapDown' weightPct만큼 줄인 값 이하의 기구 무게 */
export type ReturnWeightRule = 'keep' | 'oneStep' | 'pctSnapDown'

export interface ReturnProtocolStep {
  gapWeeksMin: number
  /** KK1. 있으면 단계 선택이 이 값(일, 이상)을 쓴다. 없으면 gapWeeksMin × 7 (옛 루틴) */
  gapDaysMin?: number
  weightPct: number
  /** KK1. 없으면 weightPct === 0 ? 'keep' : 'pctSnapDown' (옛 루틴) */
  weightRule?: ReturnWeightRule
  setPct: number
  targetRIR: number
  rampWeeks: number
}
```

**2. 배포 루틴** — `routine-v2.4.json` `returnProtocol`, `seedRevision` 2 → **3**

| 단계 | gapWeeksMin | gapDaysMin | weightPct | weightRule | setPct · targetRIR · rampWeeks |
|---|---|---|---|---|---|
| 1 | 2 | **14** | **0** (−5에서) | `keep` | −30 · 3 · 1 (그대로) |
| 2 | 4 | **29** | **0** (−10에서) | `oneStep` | −40 · 3 · 2 (그대로) |
| 3 | 8 | **56** | −20 | `pctSnapDown` | −50 · 4 · 3 (그대로) |

- 두 경계의 방향이 다르다는 것(4주 단계는 "28일 **초과**", 8주 단계는 "56일 **이상**")을 `gapDaysMin` 값 29·56이 담는다. 비교는 늘 `>=` 하나다.
- `gapWeeksMin`은 남긴다(옛 루틴 호환, `validateRoutine` 6번 검사). 2단계가 29일인데 4주로 적힌 것은 의도다 — JSON 옆 주석 대신 `types.ts` 주석에 적는다.

**3. 단계 선택** — `suggestNextDay.ts` `returnStepFor`: `if (gapDays >= (step.gapDaysMin ?? step.gapWeeksMin * 7)) match = step`. 나머지 그대로.
`RETURN_GAP_DAYS`(14)와 복귀 진입 규칙은 바꾸지 않는다.

**4. 무게 계산 초크포인트** — `setPlan.ts`

| 함수 | 반환 | 규칙 |
|---|---|---|
| `returnWeightRuleOf(step?)` | `ReturnWeightRule` | `step === undefined` → `'keep'` · `step.weightRule` 있으면 그것 · 없으면 `weightPct === 0 ? 'keep' : 'pctSnapDown'` |
| `modeAdjustFor(mode, step?)` (수정) | `SessionAdjust \| undefined` | normal → `undefined` · deload → `{ setPct: -50, weightPct: 0 }` (**그대로, 새 키 없음**) · return → `{ setPct: step?.setPct ?? 0, weightPct: rule === 'pctSnapDown' ? step!.weightPct : 0, weightRule: rule, ...(step ? { targetRIR: step.targetRIR } : {}) }` |
| `returnWeightFor(base, adjust, scale)` | `number` | `adjust.weightRule`로 갈린다. `base <= 0` → `base` · `keep`·키 없음 → `base` · `oneStep` → `scale.inverse ? easierWeight(base, scale) : stepBelow(base, scale)` · `pctSnapDown` → `scale.inverse ? easierWeight(base, scale) : snapDownToScale(base × (1 + weightPct/100), scale)` |

`weightScale.ts`에 `stepBelow(current, scale)` 추가: **`current`보다 작은 기구 무게 중 가장 큰 것.** 사다리면 `stepDown`과 같다(최하단이면 그대로).
균일 단위면 `round2(Math.max(0, Math.ceil(current / step − 1e-9) × step − step))` — 30 → 27.5, 31 → 30(단위 밖 값에서도 한 칸 아래 격자), 2.5 → 0.
`stepDown`은 바꾸지 않는다(스테퍼 동작, 음수 가능 — 이번 범위 밖).

- 어시스티드는 두 감량 규칙 모두 **한 칸 쉽게**(`easierWeight`)다. −20%를 보조 무게로 옮기는 식은 체중을 알아야 해서 만들지 않는다. 현재 루틴 Day에는 해당 종목이 없다.
- `pctSnapDown`이 사다리 최하단보다 작으면 `snapDownToScale`의 기존 규칙대로 최하단을 준다(`≤ base`는 지켜진다).

**5. 세션 저장** — `types.ts`

```ts
export interface SessionAdjust {
  setPct: number
  weightPct: number
  /** KK1. 복귀 세션에만. **있으면 KK 이후 세션**이다 — 없는 복귀 세션의 weightPct는 당시 규칙(× 0.5kg 반올림)으로 적용됐다 */
  weightRule?: ReturnWeightRule
  /** KK1. 복귀 세션이고 단계가 있었을 때만. 종목 카드·내보내기가 "반복 N회 남기기"로 쓴다 */
  targetRIR?: number
}

export interface SessionEntry {
  // …
  /**
   * KK1. 복귀 세션이고 무게 규칙이 keep이 아닐 때, 루틴 종목 entry에만.
   * base = 생성 때 세트별 프리필 기준 무게 중 최댓값, given = returnWeightFor(base). 기준 무게는 이력·Phase·단위에 달려 나중에 되짚을 수 없어서 저장한다.
   * Day 변경은 펼쳐 복사로 따라가고, 대체는 행을 새로 만들므로 지운다.
   */
  returnWeight?: { base: number; given: number }
}
```

**6. `buildSession`** — `sessionFactory.ts`
- 세트 무게: `weight = returnWeightFor(base.weight, modeAdjust, scale)`, `scale = { ...scaleFor(args.scales, recordKey, routine.rules.weightIncrementKg), inverse: args.isInverse?.(recordKey) ?? false }`. normal·deload는 지금처럼 `base` 그대로.
- `mode === 'return'`이고 `weightRule !== 'keep'`이면 entry에 `returnWeight` (위 정의). 그 외에는 키를 만들지 않는다.
- `roundToHalf`를 **이 파일에서 지운다**(호출처가 복귀 무게 하나뿐이다). `substitute.ts`의 같은 이름 함수는 대체 무게용이라 그대로.
- 행 수·반복·`plannedSets`는 그대로.

**7. 대체** — `sessionOps.ts` `applySubstitute`: 다른 원 종목 값(`sensoryScore` 등)과 같이 `returnWeight: undefined`. 새 행의 무게는 앱의 복귀 무게가 아니다.

**8. 홈 복귀 배너** — `HomeScreen.tsx:259-260`의 숫자 조립을 `setPlan.ts` `returnStepText(step)`으로 바꾼다.
`{gapDays}일 공백 — {returnStepText(step)}로 복귀할까요?` 문구 부품은 KK2 표와 같은 함수(`returnWeightText`·`returnRirText`)에서 나온다.

| 단계 | `returnStepText` |
|---|---|
| 1 | `세트 −30% · 무게 유지 · 반복 3회 남기기` |
| 2 | `세트 −40% · 무게 한 단계 내림 · 반복 3회 남기기` |
| 3 | `세트 −50% · 무게 −20% (기구 무게로 내림) · 반복 4회 남기기` |

**9. 검증용 루틴 검사** — `validateRoutine.ts`에 7번: ① `gapDaysMin`은 모든 단계에 있거나 모두 없다, 있으면 오름차순 ② `weightRule`이 `keep`·`oneStep`이면 `weightPct === 0`, `pctSnapDown`이면 `weightPct < 0`.

**10. 문서** — 같은 커밋에서 `README.md` "복귀 시 무게보다 세트·RIR을 깎는다"의 마지막 문장과 `docs/DESIGN.md` §7 복귀 표(414-417줄)·§8 시드 예시(563-565줄)를 새 값으로 고친다.
결정의 방향(무게보다 세트·RIR)은 그대로이고 무게 폭만 사용자 답(Q2)으로 바뀐다. DESIGN 머리의 "앱 시드와 루틴 문서가 1:1"을 지키기 위해서다.

### 검증 (`src/lib/v113.test.ts`, describe `KK1`)

- `returnStepFor` (배포 루틴): 13 → 없음 · 14 → 1단계 · **28 → 1단계** · **29 → 2단계** · 55 → 2단계 · **56 → 3단계** · 60 → 3단계.
- `returnStepFor` (옛 루틴 — 사본에서 `gapDaysMin`·`weightRule`을 지우고 weightPct −5/−10/−20으로 되돌림): 28 → 2단계(옛 의미 유지).
- `returnWeightRuleOf`: 배포 1·2·3단계 → keep·oneStep·pctSnapDown · 옛 루틴 1단계(−5, 필드 없음) → pctSnapDown · `undefined` → keep.
- `stepBelow`: 단위 2.5 — 30 → 27.5 · 31 → 30 · 2.5 → 0 · 0 → 0 / 단위 5 — 25 → 20 / 사다리 [15,20,25,30] — 30 → 25 · 15 → 15 · 22 → 20.
- `returnWeightFor`:
  - keep: 30 → 30 · 키 없음(v1.12 저장값 모양) → 30
  - oneStep: 단위 2.5 30 → 27.5 (보고서 Q2 예) · 단위 5 25 → 20 (보고서 Q2 예) · 사다리 최하단 15 → 15 · base 0 → 0
  - pctSnapDown −20: 단위 2.5 30 → 22.5(24에서 내림) · 40 → 30(32에서) · 단위 5 25 → 20 · 사다리 [35,41] 41 → 35
  - 어시스티드(`inverse`, 단위 2.5) 20: oneStep → 22.5 · pctSnapDown → 22.5 (**보조가 줄지 않는다**)
  - **결과가 단위 격자 위에 있다**: 단위 2.5 × base {12.5..60, 2.5 간격} × 세 규칙 → 모든 결과가 2.5의 배수이고 `≤ base`
- `buildSession` (v112 `GOLDEN_HISTORY` — d1 40kg, 오늘 10-07):
  - return 1단계: 모든 세트 40 (v1.12는 38) · 2단계: 37.5 (v1.12는 36) · 3단계: 30 (v1.12는 32) · step 없음: 40 · 행 수·반복은 `JJ_BUILD_GOLDEN`과 같다
  - 인클라인 단위 5(`scales`) · 2단계 → 인클라인만 35, 나머지 37.5
  - normal·deload: `JJ_BUILD_GOLDEN` 전 칸 그대로
- `modeAdjust` 저장: 1단계 `{-30, 0, 'keep', 3}` · 2단계 `{-40, 0, 'oneStep', 3}` · 3단계 `{-50, -20, 'pctSnapDown', 4}` · step 없음 `{0, 0, 'keep'}`(`targetRIR` 키 없음) · deload `{-50, 0}`(`'weightRule' in` false).
- `returnWeight` 저장: 1단계·normal·deload → 키 없음 · 2단계 → 모든 루틴 종목 entry `{base: 40, given: 37.5}` · 3단계 → `{40, 30}` · `applyDayChange` 뒤 같은 값 · `applySubstitute` 뒤 `undefined` · `applyAddExercise` entry에 없음.
- 홈 배너 문구: `returnStepText` 세 단계가 위 표와 같다.
- `validateRoutine`: 배포 루틴 문제 0건 · `gapDaysMin` 29 ↔ 14 뒤바꿈 → 문제 · 한 단계에서만 `gapDaysMin` 삭제 → 문제 · `oneStep` + weightPct −10 → 문제 · `pctSnapDown` + weightPct 0 → 문제.
- **소스 스캔**: `sessionFactory.ts`에 `roundToHalf`·`weightPct / 100` 없음, `returnWeightFor(` 있음 · `setPlan.ts`·`weightScale.ts` 밖(테스트 제외)에 `snapDownToScale(` 호출이 `prefill.ts`(CC13)와 `setPlan.ts`뿐 · `HomeScreen.tsx`에 `returnStep?.weightPct`·`returnStep?.setPct` 없음, `returnStepText(` 있음.

### 범위 제외

- 램프업(`rampWeeks`) — 지금도 구현돼 있지 않다(GG2 진단). 복귀 다음 세션은 정상이다.
- 8주+ "Phase 1 복귀 안내"(DESIGN §7 417줄) — 구현돼 있지 않고 이번 답에 없다.
- 세트 조정률·`targetRIR` 값 — 답이 바꾸라고 하지 않았다(12절 "짚을 점" 3).
- 어시스티드의 −20% 등가 환산 — 체중 입력이 필요하고 루틴 Day에 해당 종목이 없다.
- `stepDown`의 음수 가능성 — 스테퍼 동작이고 이번 경로는 `stepBelow`를 쓴다.

---

## KK2. 복귀 세션이 실제 적용분과 여유 반복을 말한다

### 진단

| 사실 | 근거 |
|---|---|
| 내보내기 헤더는 조정률을 퍼센트로만 말한다 — 4주 초과의 "한 칸"은 퍼센트가 아니다 | `setPlan.ts:159-186` `sessionAdjustText` |
| 종목 줄에 무게 조정 사실이 없다 — 세트는 `세트: 계획 → 조정 → 완료`가 있는데 무게는 없다 | `exportMarkdown.ts:157-161` |
| KK 이전 복귀 세션(08-26·09-21·10-06)은 `무게 −5%`로 생성됐고 사용자가 원래 무게로 고쳤다 — 지금 줄은 그 규칙이 결과처럼 읽힌다 | 보고서 6절 |
| `targetRIR`을 말하는 곳은 홈 복귀 배너 하나뿐 — 세션 화면·내보내기에는 없다 | `HomeScreen.tsx:260` |
| JJ 이전 세션의 조정률 되짚기는 **현재 루틴**의 단계를 읽는다 → KK1이 단계 값을 바꾸면 08-26이 `무게 −5%`를 잃는다 | `setPlan.ts:70-84` |
| 종료 시트는 내보내기와 같은 `sessionAdjustText`를 쓴다 → 고치면 같이 바뀐다 | `FinishSheet.tsx` (JJ3) |

### 설계

**1. JJ 이전 되짚기는 "당시 규칙" 표를 읽는다** — `setPlan.ts`

```ts
/** KK 이전 복귀 단계 (seedRevision 2, 스캐폴드 이후 불변). 저장값 없는 JJ 이전 세션 되짚기 전용 */
export const LEGACY_RETURN_PROTOCOL = [
  { gapWeeksMin: 2, weightPct: -5, setPct: -30 },
  { gapWeeksMin: 4, weightPct: -10, setPct: -40 },
  { gapWeeksMin: 8, weightPct: -20, setPct: -50 },
] as const
```

`resolveSessionAdjust` 4번(저장값 없는 return)의 단계 = 이 표에서 `공백/7 >= gapWeeksMin`(옛 경계)인 마지막 것. `routine` 인자는 그대로 받되 이 경로에서 쓰지 않는다.
**그날 실제로 쓰인 표**이므로 현재 루틴보다 정확하다(루틴 가져오기로 단계를 바꿔 쓴 적이 있다면 예외 — 1인 앱에서 기록 없음).

`ResolvedAdjust`의 `known`에 선택 필드 `weightRule?`·`targetRIR?`를 더한다. 저장값이면 펼쳐 복사로 따라오고, 되짚기에는 없다.

**2. 문구** — `setPlan.ts` 한 곳

| 함수 | 반환 |
|---|---|
| `returnWeightText(rule, weightPct)` | `keep` → `무게 유지` · `oneStep` → `무게 한 단계 내림` · `pctSnapDown` → `무게 −20% (기구 무게로 내림)` |
| `returnRirText(rir)` | `반복 3회 남기기` |
| `returnStepText(step)` | KK1 표 (배너) |
| `sessionReturnRirText(session)` | `mode === 'return'`이고 `modeAdjust?.targetRIR !== undefined`면 `복귀 — 반복 3회 남기기`, 아니면 `undefined` (종목 카드) |
| `entryWeightLine(entry, mode)` | 아래 표. `mode !== 'return'`·`returnWeight` 없음·`substituteFor` 있음·`extra` → `undefined` |

`sessionAdjustText`의 조정 부분(`head`)을 이렇게 바꾼다. 나머지(`— 계획 … 생성 · 완료 …`, `재계산`, `현재 루틴 계획`)는 JJ 규칙 그대로.

| 세션 | 조정 부분 (예) |
|---|---|
| KK 이후 복귀, 1단계 | `복귀 조정: 세트 −30% · 무게 유지 · 반복 3회 남기기` |
| KK 이후 복귀, 2단계 | `복귀 조정: 세트 −40% · 무게 한 단계 내림 · 반복 3회 남기기` |
| KK 이후 복귀, 3단계 | `복귀 조정: 세트 −50% · 무게 −20% (기구 무게로 내림) · 반복 4회 남기기` |
| KK 이후 복귀, step 없음 `{0,0,'keep'}` | `복귀 조정: 없음` (JJ와 같다) |
| v1.12 복귀 (저장값 `{-30,-5}`, `weightRule` 없음) | `복귀 조정: 세트 −30% · 무게 −5% (당시 규칙)` |
| JJ 이전 복귀 (되짚기 21일) | `복귀 조정: 세트 −30% · 무게 −5% (당시 규칙) (공백 21일로 재계산)` |
| 디로드 (저장·되짚기) | JJ 그대로 — `디로드 조정: 세트 −50%`[` (재계산)`] |

- 판정: `weightRule`이 있으면 KK 문구, 없으면 JJ 문구에 `(당시 규칙)`을 `무게 −N%` 바로 뒤에 붙인다(`mode === 'return' && weightPct !== 0`일 때만).
- `반복 N회 남기기`는 `targetRIR`이 있을 때만. KK 이전 세션에는 붙이지 않는다(그때 세션 화면은 이 값을 말하지 않았다).

`entryWeightLine` — 종목 줄, `세트:` 줄 바로 다음 (`간격:`보다 앞). `수행` = 그 종목 완료 세트의 최고 무게(헤더 무게와 같은 값).

| 경우 | 문구 |
|---|---|
| `given < base` (일반) / `given > base` (어시스티드) | `무게: 기준 40 → 복귀 37.5 · 수행 40` |
| `given === base` (사다리 최하단·0kg) | `무게: 기준 15 · 내릴 무게 없음 · 수행 15` |

1단계(keep)는 `returnWeight`가 없어 종목 줄이 없다 — 헤더 `무게 유지`가 말한다.

**3. 표시 위치**

| 위치 | 변경 |
|---|---|
| `exportMarkdown.ts` `entryLine` | `setLine` 다음에 `entryWeightLine` |
| 내보내기 헤더 다음 줄·종료 시트 한 줄 | `sessionAdjustText` 변경이 그대로 반영된다(호출부 수정 없음) |
| `ExerciseCard.tsx` | 새 prop `modeIntensity?: string`. `showPrefillHints && modeIntensity`면 칩 줄 맨 앞에 `<span className="chip">`. A·B·코어 모두 |
| `SessionScreen.tsx` | `modeIntensity={sessionReturnRirText(session)}` |

### 검증 (`v113.test.ts`, describe `KK2`)

- 헤더 (D1 7종목 전부 체크, `buildSession`으로 생성): 1단계 → `복귀 조정: 세트 −30% · 무게 유지 · 반복 3회 남기기 — 계획 22세트 → 15세트 생성 · 완료 15세트` · 2단계·3단계 → 조정 부분이 위 표와 같다.
- v1.12 모양(`modeAdjust {-30,-5}` + `plannedSets`) → `복귀 조정: 세트 −30% · 무게 −5% (당시 규칙) — 계획 22세트 → 15세트 생성 · 완료 15세트`.
- JJ 이전 모양(저장값 없음, 21일 전 근력 세션) → `복귀 조정: 세트 −30% · 무게 −5% (당시 규칙) (공백 21일로 재계산) — 현재 루틴 계획 22세트 → 15세트 생성 · 완료 15세트`.
- JJ 이전 모양, 공백 **28일** → `세트 −40% · 무게 −10% (당시 규칙) (공백 28일로 재계산)` — 옛 경계로 되짚는다(그날 실제로 그렇게 만들어졌다).
- JJ 이전 모양 + 루틴 사본의 `returnProtocol`을 `[]`로 → 결과가 같다(되짚기가 현재 루틴을 읽지 않는다).
- 디로드(저장·되짚기) · step 없는 복귀 → JJ 문자열 그대로.
- `entryWeightLine`: 2단계 인클라인 40 → 37.5, 수행 40 → `무게: 기준 40 → 복귀 37.5 · 수행 40` · 수행 37.5 → `· 수행 37.5` · 사다리 최하단 → `무게: 기준 15 · 내릴 무게 없음 · 수행 15` · 1단계 → `undefined` · v1.12 세션 → `undefined` · 대체 entry → `undefined` · 얹은 종목 → `undefined` · normal → `undefined`.
- 종목 블록 순서 (2단계): 반복 줄 → `세트:` → `무게:` → `간격:` → `보상작용:`.
- `sessionReturnRirText`: KK 1단계 → `복귀 — 반복 3회 남기기` · 3단계 → `반복 4회` · step 없음 → `undefined` · v1.12 복귀 → `undefined` · normal·deload → `undefined`.
- 종료 시트 한 줄 = 내보내기 헤더 다음 줄 (KK 1단계 세션, JJ3 테스트와 같은 방식).
- **소스 스캔**: `exportMarkdown.ts`·`ExerciseCard.tsx`·`HomeScreen.tsx`에 `남기기`·`당시 규칙`·`한 단계`·`무게 유지` 리터럴 없음 · `ExerciseCard.tsx`가 `targetRIR`을 읽지 않는다 · `setPlan.ts`에 `LEGACY_RETURN_PROTOCOL` 있고 `resolveSessionAdjust` 안에 `returnStepFor(` 없음.

### 범위 제외

- KK 이전 세션에 RIR 붙이기 — 그때 세션 화면이 말하지 않았다. 배너는 말했지만 기록에 남지 않았다.
- 기록 탭 세션 상세 화면 — JJ2와 같은 이유(오독 경로는 내보내기).
- 종목 카드에 "기준 40 → 37.5" 표시 — 카드의 세트 행이 이미 그 무게를 보여 준다.

---

## KK3. Day별 마지막 수행일을 보인다

### 진단

| 사실 | 근거 |
|---|---|
| 13주 동안 앱은 D2·D4를 한 번도 제안하지 않았다 (규칙 세 개의 겹침, 각각은 문서대로) | 보고서 4절 재생 표 · `suggestNextDay.ts:119-149`, `:172` |
| 홈의 부위 막대는 이번 주만 보고, 빈도 경고는 주 3회 이상일 때만 켠다 → 13주 내내 켜질 수 없었다 | `dashboard.ts:121` |
| Day 선택 시트는 Day 이름·부제·종목 수·세트 수만 보인다 | `DayPickerSheet.tsx:27-55` |
| Day별 경과일 함수는 이미 있다 (근력 기준, fallback 세션은 정규 Day로 센다) | `derive.ts:219-229` `daysSinceDay` |
| Day 표기 "Day 1 — Push" → "Day 1 Push" 변환이 내보내기 안에만 있다 | `exportMarkdown.ts:121-123` `dayLabel` |

### 설계

**모듈 `src/lib/dayGap.ts` (신설)** — "그 Day를 얼마나 안 했나"를 묻는 곳(KK3·KK4)은 여기를 지난다. 기준 일수는 `RETURN_GAP_DAYS`(14, 장기 공백의 기존 정의)를 import해 쓴다. 새 상수를 만들지 않는다.

| 함수 | 반환 | 규칙 |
|---|---|---|
| `dayLabel(name)` | `string` | `exportMarkdown.ts`에서 **옮긴다**(값 그대로). 내보내기는 import |
| `dayLastDone(sessions, routine, today)` | `{ day: RoutineDay; days: number \| null }[]` | `routine.days`(정규 Day만) 순서. `days = daysSinceDay(sessions, day.id, today)` |
| `lastDoneText(days)` | `string` | `null` → `기록 없음` · 0 → `오늘` · 그 외 `마지막 N일 전` |
| `staleDaysLine(sessions, routine, today, displayedDay)` | `string \| undefined` | 아래 |

`staleDaysLine`:
1. 근력 세션이 없으면 `undefined`.
2. 대상 = `dayLastDone` 중 `recordDayIdOf(displayedDay)`가 아닌 Day 가운데 `days >= 14`, 또는 `days === null`이면서 **첫 근력 세션이 14일 이상 전**인 것.
   (기록 없음 ≠ 오래 안 함 — 처음 2주는 모든 Day가 기록 없음이라 소음이 된다. `suggestNextDay.ts:135-137` 하체 가드와 같은 판단.)
3. 대상이 없으면 `undefined`. 있으면 `기록 없음`이 먼저, 그다음 일수 큰 순. `오래 안 한 Day — Day 4 피지크 보완 기록 없음 · Day 2 Pull 19일`.

**표시 위치**

| 위치 | 변경 |
|---|---|
| `HomeScreen.tsx` `dash` memo | `lastDone: dayLastDone(sessions, routine, today)` (한 번) |
| 홈 카드 (`today-reason` 다음) | `!card.resuming`이면 `staleDaysLine(sessions, routine, today, displayed)`을 `<div className="today-sub">`로. 경고 색 없음 |
| `DayPickerSheet.tsx` | 새 prop `lastDone?: Map<string, number \| null>`. 정규 Day 행의 `row-sub`를 `{subtitle} · {lastDoneText(days)}`로. 하한 모드 행은 그대로(기록 라인을 정규 Day와 공유한다) |

빈도 경고(`judgeable`)·부위 막대·제안 점수는 건드리지 않는다.

### 검증 (`v113.test.ts`, describe `KK3`) — 픽스처 `FIELD_1104` (아래 "구현 순서" 첫 커밋)

- `dayLastDone` @ 11-04(그날 세션 전): D1 29 · D2 19 · D3 6 · D4 `null`.
- `staleDaysLine` @ 11-04, 표시 D1 → `오래 안 한 Day — Day 4 피지크 보완 기록 없음 · Day 2 Pull 19일`.
- @ 10-29, 표시 D3 → `오래 안 한 Day — Day 4 피지크 보완 기록 없음 · Day 1 Push 23일` (D2는 13일이라 빠진다).
- @ 10-16, 표시 D1 → `… Day 2 Pull 기록 없음 · Day 4 피지크 보완 기록 없음` (둘 다 기록 없음, `routine.days` 순서) · 표시를 D2로 바꾸면 D2가 빠진다.
- 표시가 `fallback-pull`이면 D2가 빠진다(기록 라인 d2).
- 경계: 다른 Day 13일 → 빠짐 · 14일 → 포함.
- 기록 없음 + 첫 근력 세션 10일 전 → 빠짐 · 14일 전 → 포함.
- 주 4회 픽스처(D1 월 · D2 화 · D4 목 · D3 토, 3주) → 어느 날이든 `undefined`.
- 세션 없음 · 유산소만 세션뿐 → `undefined` (근력 기준).
- `lastDoneText`: `null` → `기록 없음` · 0 → `오늘` · 19 → `마지막 19일 전`.
- **소스 스캔**: `DayPickerSheet.tsx`·`HomeScreen.tsx`에 `daysSinceDay(` 없음 · `HomeScreen.tsx`에 `dayLastDone(` 한 번 · `exportMarkdown.ts`에 `function dayLabel` 없음 · `dashboard.ts`의 `judgeable` 줄 무변경(`git diff`로 DEV-RECORD에 확인).

### 범위 제외

- 저빈도용 Day 제안 규칙(오래 안 한 Day 우선 등) — Q8 답, DESIGN §4 결정.
- 부위별 "마지막 노출 N일 전" — Day 단위로 결손을 이미 말한다. 부위는 Day 둘 이상에 걸쳐 문구가 길어진다.
- 내보내기 머리에 Day별 횟수 — v1112 테스트가 머리 줄을 고정하고, 본문에서 셀 수 있다.

---

## KK4. 정상 세션이 그 Day 자체의 긴 공백을 말한다 · 세트 부족 보류 사유

### 진단

| 사실 | 근거 |
|---|---|
| 복귀는 "마지막 근력 세션"과의 공백으로만 판정한다 → 공백 뒤 첫 세션(늘 D1)만 복귀, 다음 날의 하체는 자기 공백 23·25·15일에도 정상 | `suggestNextDay.ts:116-127` · 보고서 5절 |
| 그 사실을 화면·내보내기 어디에서도 말하지 않는다. 카드 근거는 `하체를 N일 안 했어요`뿐 | `suggestNextDay.ts:145` |
| 세트 부족 보류 사유 `반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션`이 "복귀만 아니었으면 올렸다"로 읽혔을 수 있다 (11-04 체스트 30kg, 11/6/7) | `progression.ts:122-123` · 보고서 5절 |
| 사유 문구는 `holdReasonText` 한 곳 (Summary·내보내기가 import) | `progression.ts:113-125` · `v111.test.ts:625` |

### 설계

**1. Day 자기 공백** — `dayGap.ts`

| 함수 | 반환 | 규칙 |
|---|---|---|
| `dayGapNotice({ sessions, routine, day, today, returnSuggested })` | `string \| undefined` | `returnSuggested`면 `undefined`(복귀 배너·EE3 문구가 말한다). `own = daysSinceDay(sessions, recordDayIdOf(day), today)`. `own === null` 또는 `own < 14` → `undefined`. 아니면 `last` = 마지막 근력 세션과의 일수 → `이 Day는 ${own}일 만이에요 — 복귀 조정은 마지막 운동(${last}일 전) 기준이라 적용되지 않습니다` |
| `sessionDayGapLine(session, routine, sessions?)` | `string \| undefined` | `sessions` 없음 · `mode !== 'normal'` · `!hasStrengthWork(session)` → `undefined`. `before = sessions.filter((s) => s.date < session.date)`, 기록 Day = `recordDayIdOf(findDay(routine, session.dayId))` (없으면 `session.dayId`). `own = daysSinceDay(before, 기록 Day, session.date)`, `last` = `strengthSessions(before)[0]`과의 일수. `own === null` 또는 `own < 14` → `undefined`. 아니면 `Day 공백 ${own}일 — 복귀 조정 없음 (직전 근력 세션 ${last}일 전 기준)` |

| 위치 | 변경 |
|---|---|
| 홈 카드 (`today-reason` 다음, KK3 줄보다 위) | `!card.resuming`이면 `dayGapNotice({ …, day: displayed, returnSuggested: Boolean(suggestion.returnStep) })`, `today-sub` |
| `sessionToMarkdown` | 헤더 다음, `sessionAdjustText` 자리(정상 세션에는 그 줄이 없다)에 `sessionDayGapLine`. `수행 순서:`보다 앞 |

- 직접 고른 Day에도 나온다(`displayed`). 복귀 공백이면 어느 Day를 골라도 복귀 세션이 되므로(`HomeScreen.tsx:151-154`) 그때는 나오지 않는다.
- 내보내기 줄은 `sessions`를 받을 때만 나온다 → 세션 하나만 넣는 `JJ_EXPORT_NORMAL_BEFORE` 픽스처는 그대로다.

**2. 세트 부족 보류 사유** — `progression.ts` `holdReasonText`의 `sets` 분기만:

`반복 상단 도달 · 계획 ${planned}세트 중 ${done}세트${MODE_SUFFIX[mode]} — ${planned}세트로는 아직 시험 안 됨`

- 앞부분은 GG1 문구 그대로 두고 뒤에 붙인다 → `toContain('계획 N세트 중 M세트')` 단언과 분석 프롬프트가 깨지지 않는다.
- 모든 모드에 붙인다. 정상 세션에서 세트를 지운 경우도 같은 사실이다(규칙 하나).
- 판정(`HoldReason`)·`lastHoldChipText`·`modeSetNotice`는 바꾸지 않는다. 칩은 이미 "오늘 N세트 모두 완료하면 증량 판정"이라고 다음 할 일을 말한다.

### 검증 (`v113.test.ts`, describe `KK4`)

- `dayGapNotice` (`FIELD_1104`): @ 10-29 D3 → `이 Day는 22일 만이에요 — 복귀 조정은 마지막 운동(13일 전) 기준이라 적용되지 않습니다` · @ 08-28 D3 → `23일 만 … 마지막 운동(2일 전)` · @ 09-21 (복귀 제안) D3를 골라도 → `undefined` · own 13 → `undefined` · 기록 없는 Day → `undefined` · `fallback-push` → d1의 공백.
- `sessionDayGapLine` (`FIELD_1104` 전체를 넘긴 내보내기):
  - 08-28 D3 → `Day 공백 23일 — 복귀 조정 없음 (직전 근력 세션 2일 전 기준)` · 09-22 → `25일 … 1일 전` · 10-07 → `15일 … 1일 전` · 10-29 → `22일 … 13일 전` · 11-04 D1 → `29일 … 6일 전`
  - 08-26·09-21·10-06(복귀) → 없음 · 10-16 D2(이전 D2 없음) → 없음 · 08-03(유산소만) → 없음 · 08-05 D3(이전 D3 없음) → 없음
  - 같은 세션을 `sessions` 없이 → 없음 · 디로드 → 없음
  - 줄 위치: 헤더 바로 다음, `수행 순서:` 앞
- `holdReasonText`: 복귀 `{sets, done:2, planned:3}` → `반복 상단 도달 · 계획 3세트 중 2세트 · 복귀 세션 — 3세트로는 아직 시험 안 됨` · normal 3/4 → `반복 상단 도달 · 계획 4세트 중 3세트 — 4세트로는 아직 시험 안 됨` · 디로드 · `reps`·`compensation`·`phase0` → 이전 문구 그대로.
- `GG1_GOLDEN` 전 칸 통과(판정 불변) · `JJ_EXPORT_NORMAL_BEFORE` 문자 단위 통과.
- **소스 스캔**: `HomeScreen.tsx`·`exportMarkdown.ts`에 `일 만이에요`·`Day 공백` 리터럴 없음, `dayGapNotice(`·`sessionDayGapLine(` 각 한 번 · `progression.ts`에 `아직 시험 안 됨`이 한 번.

### 범위 제외

- Day 단위 복귀(Day별 공백으로 복귀 판정) — Q8 답, DESIGN §4·§7 결정.
- "복귀 hold N회 연속" 집계 — 사유 문구가 다음 시험을 말하면 충분하다. 연속 집계는 이력 판정이 필요하다.
- 11-04 체스트프레스 30kg(Q3) — 답이 없고, 프리필은 규칙대로였다(`prefill.ts:266`).

---

## KK5. 내보내기 잡음 — 유산소만 한 세션 · 내용 없는 식단 날짜

### 진단

| 사실 | 근거 |
|---|---|
| 유산소만 한 세션도 `Day 1 Push` 헤더 + `미수행:` 7종목으로 나온다 → "Push를 통째로 건너뛰었다"로 읽힌다 (08-03) | `exportMarkdown.ts:238-240`, `:283-286` |
| 앱은 이런 세션을 근력 세션이 아니라고 정의한다 — 제안·빈도·훈련일은 그 정의를 쓴다 | `derive.ts:62-64` `hasStrengthWork` (X3) |
| 날짜 목록에 식단 레코드가 있는 날을 다 넣는데 기록 슬롯이 없으면 식단 절이 비어 빈 날짜 줄이 남는다 (08-12) | `exportMarkdown.ts:353`, `:65` · `hasDiet`는 이미 `dietLines(d).length > 0` (`:355`) |

### 설계

**1. `sessionToMarkdown`** — `!hasStrengthWork(session)`이면 이른 반환:

```
## 2026-08-03 (월) — 유산소만  [22:09–22:09, 0분]
유산소: 마이마운틴 30분
메모: …            ← 있으면
```

- 라벨: `session.cardio`가 있으면 `유산소만`, 없으면 `근력 기록 없음`. Day 이름·모드 태그·`복귀 조정:`·`Day 공백`·`수행 순서:`·종목 블록·`미수행:`을 내지 않는다.
- 유산소·메모 줄은 지금 코드(`:288-292`)를 함수로 빼서 두 경로가 같이 쓴다.

**2. `exportMarkdown` 날짜 목록** — 식단 날짜는 `dietLines(date).length > 0`인 것만 넣는다. `hasDiet`는 그대로 둔다(결과가 같다).

### 검증 (`v113.test.ts`, describe `KK5`)

- 08-03 (D1, 유산소 마이마운틴 30, 체크 0) → 블록이 정확히 `## 2026-08-03 (월) — 유산소만  [22:09–22:09, 0분]\n유산소: 마이마운틴 30분` · `미수행`·`Day 1`·`수행 순서` 없음.
- 워밍업만 체크 + 유산소 → `유산소만` · 체크 0 + 유산소 없음 + 메모 → `근력 기록 없음` + `메모:` 줄.
- 유산소만 + `mode: 'return'` → `[복귀]`·`복귀 조정:` 없음.
- 슬롯 없는 식단 레코드만 있는 08-12 → `## 2026-08-12` 줄이 없다 · 슬롯 하나 기록한 날 → 지금과 같은 블록 · 그 레코드 하나뿐인 기간 → `(기간 내 기록 없음)`.
- 근력 세션 내보내기 → `JJ_EXPORT_NORMAL_BEFORE` 통과.
- **소스 스캔**: `exportMarkdown.ts`가 `hasStrengthWork`를 import한다.

### 범위 제외

- 기록 탭·요약 화면의 유산소만 세션 표시 — 오독 경로는 내보내기다.
- 유산소 종류 상수 통합·`기타` 표기(7절) — 12절이 소형으로 남겼다. 다음 라운드.

---

## 과거 판정 불변

바뀌지 않는 것: `judgeProgression`·`progressionVerdicts`(`GG1_GOLDEN`) · 세트 수(`adjustedSetCount`, 조정률 값 그대로) · normal·deload·step 없는 복귀 세션의 생성 결과(`JJ_BUILD_GOLDEN`의 해당 칸) · 근력 정상 세션 내보내기 중 아래 표에 없는 줄 전부(`JJ_EXPORT_NORMAL_BEFORE`) · Day 제안 결과(`suggestNextDay`의 `day`·`rule`) · 빈도 경고 · PR·볼륨·Phase 조건.

달라지는 것:

| 자리 | 전 | 후 | 작업 |
|---|---|---|---|
| 새 복귀 세션의 무게 | `roundToHalf(base × 0.95/0.9/0.8)` | 유지 / 한 칸 / −20% 이하 기구 무게 | KK1 |
| 공백 정확히 28일의 복귀 단계 | 2단계 (세트 −40%) | 1단계 (세트 −30%) | KK1 |
| 새 복귀 세션 저장값 | `modeAdjust {setPct, weightPct}` | + `weightRule`·`targetRIR`, entry `returnWeight` | KK1 |
| 홈 복귀 배너 | `무게 −5%, 세트 −30%, RIR 3로 복귀할까요?` | `세트 −30% · 무게 유지 · 반복 3회 남기기로 복귀할까요?` | KK1 |
| 저장된 루틴 | seedRevision 2 | 3 — 다음 실행 때 배포 루틴으로 교체된다(기존 시드 규칙, 가져온 루틴도 덮어쓴다) | KK1 |
| KK 이전 복귀 세션 내보내기·종료 시트 | `무게 −5%` | `무게 −5% (당시 규칙)` | KK2 |
| JJ 이전 복귀 세션 되짚기 | 현재 루틴 단계 | 당시 규칙 표 (값은 지금까지와 같다) | KK2 |
| 복귀 세션 종목 카드 | — | `복귀 — 반복 N회 남기기` 칩 (KK 이후 세션만) | KK2 |
| 홈 카드 · Day 선택 시트 | — | `오래 안 한 Day — …` · `마지막 N일 전` | KK3 |
| 홈 카드 (정상 Day, 자기 공백 14일+) | — | `이 Day는 N일 만이에요 — …` | KK4 |
| 정상 세션 내보내기 (자기 공백 14일+, `sessions` 있음) | — | 헤더 다음 `Day 공백 N일 — …` | KK4 |
| 세트 부족 보류 사유 (내보내기·요약 화면, 과거 세션 포함) | `… 계획 3세트 중 2세트 · 복귀 세션` | 뒤에 ` — 3세트로는 아직 시험 안 됨` | KK4 |
| 유산소만 한 세션 내보내기 | Day 헤더 + `미수행:` | `— 유산소만` + 유산소·메모 | KK5 |
| 슬롯 없는 식단 레코드만 있는 날 | 빈 날짜 줄 | 없음 | KK5 |

보고서 0절 기록(`FIELD_1104`)으로 보면 v1.12 대비 내보내기 diff는: 08-03 블록 교체 · 08-12 줄 삭제 · 08-26·09-21·10-06 헤더 다음 줄의 `무게 −5%` 뒤 `(당시 규칙)` · 사유가 `sets`인 모든 `다음:` 줄 끝 ` — N세트로는 아직 시험 안 됨` · 08-28·09-22·10-07·10-29·11-04 헤더 다음 `Day 공백` 줄. **이 밖의 줄은 한 글자도 바뀌지 않는다.**

---

## 구현 순서와 검증

**KK1 → KK2 → KK3 → KK4 → KK5.** KK2는 KK1의 저장값을, KK4는 KK3의 `dayGap.ts`를 쓴다. KK5는 독립이지만 KK4의 내보내기 줄과 같은 함수(`sessionToMarkdown`)를 고치므로 뒤에 둔다.
커밋은 **골든 1 + 구현 5 + 기록·버전 1 = 7.** 작업끼리 한 커밋에 섞지 않는다.

관례:
- `npm run build` (타입 확인 포함, `tsc` 직접 호출 금지) · 작업 중에는
  `npx vitest run src/lib/v113.test.ts src/lib/v112.test.ts src/lib/v111.test.ts src/lib/v1111.test.ts src/lib/v1112.test.ts src/lib/export.test.ts src/lib/prefill.test.ts src/lib/suggestNextDay.test.ts src/lib/weightScale.test.ts src/lib/seedRevision.test.ts`만 · 마지막에 `npm test` 한 번
- 커밋 개수는 실행 출력을 복사한다 (`git log --oneline main..HEAD`)
- 커밋 메시지는 `git commit -F - <<'MSG'`
- **첫 커밋은 골든만 담는다:** `v113.test.ts`에 픽스처 `FIELD_1104`(보고서 0절 표의 11세션: 날짜·Day·모드·유산소. Push A그룹 무게·반복은 5절 표 값, 나머지 종목은 고정 임의값으로 전부 체크.
  복귀 세션은 저장값 없음 = JJ 이전 모양. 08-03은 체크 0 + 유산소 마이마운틴 30분. 08-12 슬롯 없는 식단 레코드 1건)와
  v1.12 코드 그대로의 `exportMarkdown` 전문 `KK_EXPORT_BEFORE`를 붙여 커밋한다. 이후 고치지 않는다(DEV-RECORD에 해시).
- **기존 테스트 수정은 아래 목록뿐이다.** 다른 기존 테스트가 깨지면 설계와 어긋난 것이므로 고치지 말고 멈춰서 보고한다. 수정마다 주석 `KKn(PLAN-v1.13): <이유>`.

  | # | 파일·자리 | 수정 | 이유 |
  |---|---|---|---|
  | ① | `prefill.test.ts` "복귀 모드는 세트를 깎고 무게는 소폭만 내린다" | 기대 무게 32 → **30** | KK1 3단계 기구 무게 |
  | ② | `prefill.test.ts` `returnProtocol[0]` 인클라인 (약 340줄) | 기대 38 → **40**, 주석 | KK1 1단계 유지 |
  | ③ | `prefill.test.ts` `describe('roundToHalf')` | 블록과 import 삭제 | KK1 함수 제거 (`substitute.test.ts`의 같은 이름은 별개) |
  | ④ | `suggestNextDay.test.ts:208` | `returnStepFor(ROUTINE, 28)?.gapWeeksMin` 기대 4 → **2**, 29 → 4 단언 추가 | KK1 경계 |
  | ⑤ | `v112.test.ts`에서 `build('return', n)`(= `buildSession`)으로 만든 세션의 `modeAdjust` 기대값과 그 세션의 `resolveSessionAdjust` 기대 객체 (`modeAdjust 저장` 249-250줄, `저장값 {−30,−5}는 … 우선` 305-312줄) | 기대값을 KK1 모양으로. 단언의 뜻(저장값 우선)은 그대로 | KK1 저장 형태 |
  | ⑥ | `v112.test.ts` `JJ_BUILD_GOLDEN` 비교 | `return1`~`return3` 칸은 무게를 빼고(행 수·반복) 비교. **골든 데이터는 고치지 않는다.** 그 칸의 무게는 `v113` KK1이 고정 | KK1 |
  | ⑦ | `v112.test.ts` JJ2·JJ3 기대 문자열 중 `weightRule` 없는 복귀 세션의 `무게 −N%` | 바로 뒤에 ` (당시 규칙)` 삽입. 그 밖의 글자는 그대로 | KK2 |
  | ⑧ | `v112.test.ts`에서 `buildSession`으로 만든 복귀 세션의 헤더 리터럴 | KK2 표의 문구로 | KK2 |
  | ⑨ | `v111.test.ts` 408·412·417·558·589-591줄, `v1111.test.ts:103` | `sets` 사유 기대 문자열 끝에 ` — N세트로는 아직 시험 안 됨` | KK4 |
  | ⑩ | `seedRevision.test.ts` | 그 파일 주석의 절차대로 리비전 3·해시 갱신 | KK1 시드 변경 |

- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `sessionFactory.ts`에 `roundToHalf(base.weight * (1 + weightPct / 100))` 복원 → KK1 스캔·`buildSession` 실패
  ② `returnStepFor`를 `gapDays / 7 >= step.gapWeeksMin`으로 복원 → KK1 `28 → 1단계` 실패
  ③ `returnWeightFor`의 `inverse` 분기 삭제 → KK1 어시스티드 실패
  ④ `stepBelow`를 `round2(current − step)`로 → `31 → 30` 실패
  ⑤ `resolveSessionAdjust` 되짚기를 `returnStepFor(routine, …)`로 복원 → KK2 `무게 −5% (당시 규칙) (공백 21일…)` 실패
  ⑥ `sessionAdjustText`에서 `(당시 규칙)` 조건 삭제 → KK2 v1.12 모양 실패
  ⑦ `applySubstitute`의 `returnWeight: undefined` 삭제 → KK1 대체 단언 실패
  ⑧ `staleDaysLine`에서 첫 세션 14일 조건 삭제 → KK3 `첫 근력 세션 10일 전 → 빠짐` 실패
  ⑨ `dayGapNotice`의 `returnSuggested` 가드 삭제 → KK4 09-21 실패
  ⑩ `exportMarkdown.ts`의 `hasStrengthWork` 이른 반환 삭제 → KK5 08-03 실패
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 테스트 안에 고정한 루틴(배포 `routine-v2.4.json`)·Phase·픽스처로 한정한다고 첫 줄에 적는다:
  ① `GG1_GOLDEN`·`JJ_BUILD_GOLDEN`(normal·deload·returnNoStep 전 칸, return 칸은 행 수·반복)·`JJ_EXPORT_NORMAL_BEFORE` 일치 (골든 커밋 해시)
  ② 기존 테스트 수정 ①~⑩의 diff를 붙인다
  ③ `KK_EXPORT_BEFORE`와 새 출력의 diff가 "과거 판정 불변" 마지막 문단의 줄뿐이다 (diff 전문을 붙인다)
  ④ 바뀌는 것: "과거 판정 불변" 표의 자리
- 완료 후 `docs/DEV-RECORD-v1.13.md` (맨 위 "이 환경에서 확인된 제약"은 v1.12 목록을 이어받는다)
- `package.json` **1.13.0**은 기록 커밋에서 올린다

리뷰 단위: 작업별 — KK1이 루틴 형식·세션 저장 형태를 바꾸고, KK2~KK4가 홈·세션·Day 선택·내보내기 여러 화면에 걸친다.

---

## 사람이 정할 것

| # | 항목 | 선택지 | 설계자 추천 |
|---|---|---|---|
| 1 | 복귀 표시 문구 (KK1 배너 · KK2 헤더·종목 줄·카드 칩) | A: 본문 표 그대로 — `세트 −30% · 무게 유지 · 반복 3회 남기기` / `무게: 기준 40 → 복귀 37.5 · 수행 40` / `복귀 — 반복 3회 남기기` · B: RIR을 숫자로 — `RIR 3` | **A.** 답의 예시(`반복 3회 남기기`)를 따랐고, RIR은 앱의 다른 곳에서 설명 없이 쓰이지 않는다(대체 캘리브레이션 칩만 `RIR 3~4로`) |
| 2 | 홈 카드 "오래 안 한 Day" (KK3) | A: 14일 이상 Day를 카드에 한 줄 + 시트에 전 Day · B: 시트에만 · C: 카드에 가장 오래된 Day 하나만 | **A.** 사용자가 시트를 열지 않으면 결손을 볼 곳이 없다(보고서 4절의 문제 그대로). 주 3~4회로 돌아가면 14일 Day가 없어 줄이 저절로 사라진다 |
| 3 | 정상 Day 공백 문구 (KK4) | A: `이 Day는 22일 만이에요 — 복귀 조정은 마지막 운동(13일 전) 기준이라 적용되지 않습니다` · B: 보고서 원안 `Day 3는 25일 만이에요 — 복귀 조정은 적용되지 않습니다` | **A.** 왜 적용되지 않는지를 같이 말한다. "이 Day는"으로 Day 이름 뒤 조사 문제를 피한다 |
| 4 | 세트 부족 보류 사유 (KK4) — **과거 세션 내보내기 문구도 바뀐다** | A: 뒤에 ` — N세트로는 아직 시험 안 됨` (모든 모드) · B: 복귀·디로드 세션에만 · C: 보고서 원안 `(2세트 상단 도달 · 계획 3세트는 아직 시험 안 됨 · 복귀 세션)`로 교체 | **A.** 앞부분을 그대로 두어 기존 단언·분석 프롬프트가 산다. 정상 세션에서 세트를 지운 경우도 같은 사실이라 규칙을 하나로 둔다 |
| 5 | 유산소만 한 세션 헤더 (KK5) | A: `— 유산소만` (Day 이름 없음) · B: `— 유산소만 (Day 1 Push 화면에서 기록)` | **A.** 어느 Day 화면에서 눌렀는지는 분석에 쓸 데가 없고, Day 이름이 보이면 "Push를 했다"로 읽힐 여지가 남는다 |
