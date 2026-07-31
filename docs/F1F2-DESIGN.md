# F1+F2 설계 — 패턴 결함 해소 + inverseWeight 전 경로 정합 (2026-07-31)

> REVIEW-VERDICT.md의 F1·F2 구현 설계. **반드시 한 커밋으로** — 현재 assisted-pullup이
> 분석에 안 나타나는 것은 F1 버그가 F2를 우연히 가리고 있는 것이라, F1만 먼저 고치면
> 방향이 뒤집힌 차트·PR이 사용자에게 노출된다.

## 0. 문제의 뿌리와 구조적 처방

이번 라운드에서 같은 패턴이 두 번(recordDayId, inverse), 검증에서 세 번 더(아래 F1) 나왔다.
공통 뿌리: **entry의 계획을 조회하는 올바른 경로(`routineExerciseOfEntry`)와 틀린 경로
(`parseRecordKey` + `findRoutineExercise`)가 둘 다 열려 있고, 틀린 경로가 겉보기에 자연스럽다.**

처방은 스팟 수정이 아니라 틀린 경로의 봉쇄다:

1. 3곳 수정 후 `findRoutineExercise`의 **derive 외부 소비자를 0으로** 만들고 export를 제거한다
   (구현 시점에 잔존 소비자를 grep으로 확인 — 정당한 recordKey-only 소비자가 남으면
   제거 대신 JSDoc에 `@deprecated entry가 있으면 routineExerciseOfEntry를 쓸 것` 경고)
2. `muscleOfRecordKey`(derive.ts:83)는 소비자 0 확인됨 — **삭제**
3. `isKnownRecord`(dashboard.ts:360)는 소비자 0 확인됨 — **삭제**
4. 대체 수행이 전 파생 경로에 나타나는지를 검증하는 **인바리언트 테스트 파일**을 신설한다 (§3)

## 1. F1 — 패턴 재발 3곳 수정

세 곳 모두 entry 순회 중이므로 drop-in이다.

### 1a. `analysis.ts` `strengthRecordKeys` (현재 :84-91)

```ts
for (const entry of session.entries) {
  if (doneSets(entry).length === 0) continue
  const plan = routineExerciseOfEntry(routine, entry)          // ← 교체
  const group = plan?.group
  if (group !== 'A' && !(opts.includeB && group === 'B')) continue
  if (opts.isInverse?.(entry.recordKey)) continue               // ← F2 §2c: inverse는 차트 제외
  counts.set(entry.recordKey, ...)
  groups.set(entry.recordKey, ...)
  if (entry.substituteFor) originOf.set(entry.recordKey, entry.substituteFor)  // ← 정렬용
}
```

- 시그니처: `opts: { includeB?: boolean; isInverse?: (rk: RecordKey) => boolean }`
- **차트 정렬**: 대체 recordKey는 루틴 순서 map에 없어 맨 뒤로 밀린다. `originOf`를 이용해
  `order.get(rk) ?? order.get(originOf.get(rk)) + 0.5 ?? MAX` — 원 종목 바로 뒤에 오게 한다
- AnalyzeScreen: `isInverse` 술어 전달 (§2a), 그 외 UI 변경 불요 (칩에 대체 종목이 자기
  이름으로 나타나는 것이 올바른 동작)

### 1b. `analysis.ts` `sensoryTrend` (현재 :150-157)

그룹 판정만 교체:
```ts
if (routineExerciseOfEntry(routine, entry)?.group !== 'B') continue
```
inverse 무관 (감각 점수에는 방향이 없다).

### 1c. `phaseReadiness.ts` B그룹 키 수집 (현재 :64)

동일 교체. 효과: 대체 세션의 감각 기록이 Phase 1→2·2→3 조건 판정에 포함된다.

### 1d. 삭제

- `dashboard.ts` `isKnownRecord` — 소비자 0
- `derive.ts` `muscleOfRecordKey` — 소비자 0 (`muscleOfEntry`가 대체)
- 위 수정 후 `findRoutineExercise` 외부 소비자 재확인 → 0이면 export 제거

## 2. F2 — inverseWeight 전 경로 정합

### 2a. 공용 술어 — 한 곳에만 둔다

```ts
// weightScale.ts (WeightScale.inverse 문서 옆이 제자리)
export function isInverseKey(
  catalog: Map<string, Exercise>,
  recordKey: RecordKey,
): boolean {
  return catalog.get(parseRecordKey(recordKey).exerciseId)?.inverseWeight === true
}
```

- **entry 자신의 exerciseId 기준** (substituteFor 아님) — inverse는 실제로 쓴 기계의 속성이다
- progression.ts가 사적으로 하고 있는 동일 해석을 이 함수로 통일 (중복 제거)
- 순수 lib 함수들은 카탈로그를 직접 받지 않고 `isInverse?: (rk) => boolean` 술어를 받는다.
  화면 호출부는 전부 `bundle.catalog`를 가지므로 `(rk) => isInverseKey(bundle.catalog, rk)` 전달

### 2b. `pr.ts` — 무게·e1RM PR 제외, 반복수 PR 유지

```ts
export function detectPrs(sessions, target, isInverse?: (rk) => boolean): PrHit[]
```
- entry 루프에서 `const inv = isInverse?.(entry.recordKey) ?? false`
- `inv`면 `weight`·`e1rm` PR 블록 스킵. **반복수 PR 블록은 그대로** — 같은 보조 무게에서
  반복 증가는 어시스트에서도 실제 진전이고 이미 방향이 정확하다
- 호출처: SummaryScreen:92 (catalog 있음 ✓)

### 2c. 분석 차트 — 제외 + 안내

- `strengthRecordKeys`에서 제외 (§1a에 포함)
- `ExerciseHistoryScreen`: 키 목록의 소스를 확인해 inverse recordKey가 표시되는 경우
  무게 추이 프레임 대신 안내 한 줄: **"보조 무게 종목 — 숫자가 줄어드는 것이 진전입니다"**
  (반복수·감각 표시는 유지)

### 2d. `derive.totalVolume` — 제외 + 각주

```ts
export function totalVolume(session, exclude?: (rk: RecordKey) => boolean): number
```
- 호출처 3곳 모두 술어 전달: SummaryScreen:56, SessionDetailScreen:86, history.ts:52
  (history.ts 경유 HistoryScreen도 bundle 보유 확인됨)
- SummaryScreen: 제외된 entry에 체크 세트가 있으면 볼륨 옆에 "어시스트 종목 제외" 캡션

### 2e. `prefill.ts` `better()` — 방향 반전 (기능 성립 조건)

```ts
function better(a: SetRef | undefined, b: SetRef, inverse: boolean): SetRef {
  if (!a) return b
  const heavier = inverse ? b.weight < a.weight : b.weight > a.weight   // inverse: 작은 보조가 우월
  if (heavier) return b
  if (b.weight === a.weight && b.reps > a.reps) return b
  return a
}
```
- `buildPrefill` args에 `inverse?: boolean` 추가, `bestBySet`/`best`/`progression` 판단 전부 통과
- 호출처: SessionScreen:81 (scales·catalog 있음 ✓), `sessionFactory.buildSession` —
  args에 `isInverse?: (rk) => boolean` 추가, entry별 recordKey로 해석해 buildPrefill에 전달.
  buildSession 호출처는 HomeScreen:98 (bundle 있음 ✓)

### 2f. CompensationWatchSheet — "하향 = 더 쉽게"의 방향

- weightScale에 의미 기반 헬퍼 추가:
  ```ts
  /** 한 단위 "더 쉽게" — inverse면 보조 증가(stepUp), 아니면 stepDown */
  export function easierWeight(current: number, scale: WeightScale): number
  ```
  (`WeightScale.inverse`는 buildScaleMap이 채우지 않으므로, CompensationWatchSheet 호출부에서
  `scaleFor(...)` 결과에 `isInverseKey` 값을 병합해 넘기거나 easierWeight의 셋째 인자로 전달 —
  구현 시 더 깔끔한 쪽 선택. **`buildScaleMap`에 카탈로그를 넘겨 inverse를 채우는 방식도 허용**,
  단 그 경우 scaleFor의 기본 경로(설정 없는 종목)도 inverse를 잃지 않는지 테스트로 증명할 것)
- 시트 라벨: inverse면 "보조 +N kg (더 쉽게)"로 표기 — 숫자가 늘어나는 이유를 화면이 설명해야 한다

### 2g. 손대지 않는 것 (확인 완료)

- `progression.ts`/`nextWeightForProgression` — 이미 정확 (이번에 §2a 술어로 통일만)
- `bGroupGuide` 감각 1점 복귀 — 저장된 이전 무게로 되돌리므로 방향 무관
- 스테퍼 ± — 물리적 방향 유지가 맞다 (주석에 이미 명시돼 있음)
- T8 시작 무게(어시스트 특수식) — 별도 경로, 이미 역방향 처리됨

## 3. 테스트 (신규 필수)

### 3a. 인바리언트 — `substituteCoverage.test.ts` (재발 방지의 핵심)

픽스처: `smith-incline-press@d1`(A 대체, substituteFor=incline-chest-press@d1, 체크 세트 있음)
+ `cable-rear-delt@d2`(B 대체, 감각 점수 있음) 포함 세션들.

| 검증 | 기대 |
|---|---|
| `strengthRecordKeys` | A 대체 recordKey 포함, **원 종목 바로 뒤 정렬** |
| `sensoryTrend` | B 대체 recordKey 포함, weak 탐지 대상 |
| `phaseReadiness` 1→2 | B 대체의 감각 기록이 조건 계산에 반영 |
| `weeklyVolume` | 대체 세트가 원 종목 부위로 집계 (기존 테스트 있으면 유지 확인) |
| `exportMarkdown` | "(대체:" 표기 존재 (기존 테스트 확인) |

### 3b. inverse — 각 경로

| 검증 | 기대 |
|---|---|
| `detectPrs` | 보조 증가 시 무게·e1RM PR **미발화** / 같은 보조에서 반복 증가 시 반복 PR **발화** |
| `better()` | inverse에서 작은 보조 채택, 동무게면 반복 우선 |
| `totalVolume` | exclude 술어로 inverse entry 제외 |
| `strengthRecordKeys` | isInverse 술어로 제외 |
| `easierWeight` | 일반: −step / inverse: +step / 사다리: 이웃 핀 |

### 3c. 회귀

기존 326개 유지. `npm run build`로 타입 검증 (tsc 직접 호출 금지 — REVIEW-REQUEST 3.1 주의사항).

## 4. 수용 기준

1. 대체 수행(A그룹)이 분석 차트에 원 종목 옆에 나타난다
2. 대체 수행(B그룹)의 감각 점수가 추이·Phase 판정에 반영된다
3. 어시스티드 풀업에서: 보조를 늘려도 PR·볼륨·차트에 거짓 신호가 없고, 같은 보조에서
   반복이 늘면 반복 PR이 뜨고, 프리필은 가장 적은 보조 세션을 기준으로 잡고,
   보상작용 하향 제안은 보조를 **늘리는** 쪽으로 간다
4. `muscleOfRecordKey`·`isKnownRecord` 삭제, `findRoutineExercise` 외부 소비자 0 (또는 deprecated 문서화)
5. 전 테스트 통과 + §3 신규 테스트
