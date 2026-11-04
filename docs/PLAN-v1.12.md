# PLAN v1.12 — 복귀·디로드가 깎은 세트 수를 세션이 기억한다 (JJ)

> 작성: Opus 5.5 (설계자), 2026-11-04. 대상 코드: v1.11.2 (`f31ef87`).
> 근거: `docs/FIELD-REPORT-2026-08-27.md` 4절 ("복귀·디로드가 깎은 세트 수가 그 자리에서 계획이 된다"), 8절 우선순위 3.
> 선행: PLAN-v1.11 GG2가 **진행 중 세션 카드**(`modeSetNotice`)와 다음 세션 칩을 이미 해결했다.
> 이번에는 남은 두 자리, **지나간 세션의 내보내기**와 **종료 시트**만 다룬다.
>
> **성격**: 저장 필드 둘(`Session.modeAdjust`, `SessionEntry.plannedSets`)을 더하고, 나머지는 파생한다. 증량 판정(`judgeProgression`)·
> 세트 생성 결과(행 수·무게)·PR·볼륨은 한 건도 바뀌지 않는다. 바뀌는 것은 복귀·디로드 세션의
> 내보내기 줄과 종료 시트 표시다(끝의 "과거 판정 불변" 표).
>
> **보장 범위**: 새 줄(`복귀 조정:`·`세트:`)의 "계획 P"는 JJ 이후 세션이면 **생성 당시** 계획 세트 수(저장값)다.
> 루틴이 나중에 바뀌어도 그날의 P·G가 바뀌지 않는다. 저장값이 없는 JJ 이전 세션은 현재 루틴으로 재계산하고
> 문구가 `현재 루틴 계획`이라고 밝힌다. 증량 판정 사유(GG1 `계획 N세트 중 M세트`)는 지금처럼 현재 루틴 정의다(JJ1 범위 제외).

---

## 공통 진단 — 세션에 남는 것과 사라지는 것

한 종목에는 숫자가 넷 있다. 2026-08-26 리어델트로 보면:

| 숫자 | 뜻 | 08-26 리어델트 | 지금 세션에 남는가 |
|---|---|---|---|
| P 계획 | 생성 당시 루틴 정의 `routineExercise.sets` | 2 | **아니다.** 현재 루틴에서 다시 읽을 뿐이라, 시드 리비전·루틴 가져오기로 `sets`가 바뀌면 과거 P도 바뀐다 |
| G 생성 | 앱이 만든 행 `max(1, round(P × (1 + setPct/100)))` | 1 | **아니다.** `setPct`가 저장되지 않는다 (`sessionFactory.ts:69-70`, `:93`) |
| R 작업 행 | 지금 있는 작업 세트 행 (워밍업 제외) | 1 | 남는다 (사용자가 더하거나 지울 수 있다) |
| D 완료 | `doneSets(entry).length` | 1 | 남는다 |

사용자가 "내가 1세트만 했나, 앱이 1세트만 줬나"를 구분하지 못한 것은 **G가 없어서**다. P·D만 있으면
"계획 2 중 1 완료"까지는 말할 수 있지만, 그 1이 앱의 조정인지 사용자의 선택인지는 말할 수 없다.

**G를 파생으로 되짚을 수 있는가** — 디로드는 상수(`DELOAD_SET_PCT`)라 된다. 복귀는 불안정하다.

| 복귀 `setPct`를 되짚는 법 | 값이 바뀌는 경우 |
|---|---|
| 직전 근력 세션과의 공백 → `returnStepFor(routine, gap)` (`suggestNextDay.ts:77-87`) | ① 루틴의 `returnProtocol` 변경(시드 리비전·루틴 가져오기) ② 직전 세션 삭제·편집(체크를 모두 풀면 근력 세션에서 빠진다) ③ 그 사이에 기록이 끼어듦 |

보고서 4절이 짚은 "파생이 불안정한 드문 경우"가 코드로 확인된다. 그래서 **조정률을 저장**한다.

**P를 루틴에서 다시 읽어도 되는가** — 안 된다. 배포 루틴의 `sets`는 실제로 바뀌어 왔다(`git log -p src/data/routine-v2.4.json`:
`02d3b4b`·`89e90ac`). 시드 리비전이 올라가면 `seed.ts:60-93`이 루틴을 갈아 끼우고, 사용자가 `RoutineIoPanel`로 가져와도 바뀐다.
P가 바뀌면 G(`adjustedSetCount(P, setPct)`)도 따라 바뀌어 "15세트 생성"이 과거 사실이 아니게 된다. 그래서 **종목별 P도 저장**한다.
G는 저장된 조정률과 P에서 파생하므로 같은 공식이 한 곳(`adjustedSetCount`)에만 있다.

---

## JJ1. 세션이 적용된 조정률과 계획 세트 수를 기억한다 · 세트 계획 초크포인트

### 진단

| 사실 | 근거 |
|---|---|
| 조정률은 세션 생성 때 계산되고 버려진다 | `sessionFactory.ts:69-70` (지역 변수 `setPct`·`weightPct`) |
| 세트 수 공식이 `buildSession` 안에만 있다 — 나중에 G를 말하려면 공식을 복제해야 한다 | `sessionFactory.ts:93` |
| 모드는 생성 뒤 바뀌지 않는다 (`mode`를 쓰는 곳은 `buildSession` 한 곳) | `grep "mode:"` — 나머지는 읽기만 |
| 계획 세트 수는 세션에 없다 — `SessionEntry`·`Session`에 P 필드가 없다 | `types.ts:225-280` |
| 세션 편집·Day 변경·마감은 세션을 펼쳐 복사한다 → 새 필드가 보존된다 | `dayChange.ts:96` · `sessionOps.ts:20` · `store/session.ts:110` |
| 대체·Day 변경은 **entry도** 펼쳐 복사한다 → entry 필드가 보존된다. 대체는 행을 새로 만들지만 원 종목의 계획 자리를 잇고, Day 변경은 행을 그대로 둔 채 키만 옮긴다 | `sessionOps.ts:154-180` `applySubstitute` · `dayChange.ts:81-93` |
| 얹은 종목은 새 entry를 만든다 → 계획이 없다 | `sessionOps.ts:132-151` `applyAddExercise` (`extra: true`) |
| 백업·Gist는 세션 필드를 검사하지 않고 그대로 싣는다 | `backup.ts` (세션 필드 검증 없음) · CC15 `extra`와 같은 additive 경로 |

### 설계

**1. 저장 필드** — `src/types.ts`

```ts
/** 세션 생성 때 앱이 적용한 조정 (JJ1). 단위 %, 음수가 감량 */
export interface SessionAdjust { setPct: number; weightPct: number }

export interface Session {
  // …
  /**
   * 복귀·디로드 세션에만 있다. normal이면 없다.
   * 없는 복귀·디로드 세션은 JJ 이전 기록이다 → `resolveSessionAdjust`가 되짚는다.
   * 복귀 조정률은 공백 주수에 따라 달라지고 나중에 공백을 다시 계산하면 값이 바뀔 수 있어서 저장한다.
   */
  modeAdjust?: SessionAdjust
}

export interface SessionEntry {
  // …
  /**
   * 세션 생성 때의 계획 세트 수 P = 그때의 `routineExercise.sets` (JJ1). 복귀·디로드 세션의 루틴 종목 entry에만 있다.
   * 루틴의 `sets`는 시드 리비전·루틴 가져오기로 바뀌므로, 그날 앱이 몇 세트를 계획·생성했는지는 이 값이 말한다.
   * 대체·Day 변경은 entry를 펼쳐 복사하므로 그대로 따라간다. 얹은 종목·normal 세션·JJ 이전 기록에는 없다.
   */
  plannedSets?: number
}
```

- Dexie 인덱스가 아니므로 `version()` 추가 없음. `SCHEMA_VERSION` 그대로(필드 추가는 하위 호환 — `extra` 선례).
- `ReturnProtocolStep` 전체를 저장하지 않는다. 행 수·무게를 정하는 두 값만 사실이고, `targetRIR`·`rampWeeks`는 세트 생성에 쓰이지 않는다.
- G는 저장하지 않는다. `adjustedSetCount(plannedSets, setPct)`로 정확히 나온다(같은 식, 같은 입력).
- `plannedSets`를 `modeAdjust` 안에 recordKey 표로 두지 않는다. 대체·Day 변경이 recordKey를 바꾸므로 키가 끊긴다. entry에 두면 펼쳐 복사로 저절로 따라간다.
- normal 세션에는 두 필드 모두 만들지 않는다. normal 내보내기가 쓰지 않으니 저장 형태를 바꿀 이유가 없다(나중에 normal 세션에도 `세트:` 줄을 붙이기로 하면 그때 normal에도 저장을 시작한다).

**2. 초크포인트 모듈 `src/lib/setPlan.ts` (신설)**

| 함수 | 반환 | 규칙 |
|---|---|---|
| `DELOAD_SET_PCT` | `-50` | `sessionFactory.ts`에서 **옮긴다**(값 그대로). `sessionFactory`가 이 모듈을 import하므로 반대로 두면 순환이 생긴다. 다른 import처는 없다 |
| `adjustedSetCount(planned, setPct)` | `number` | `Math.max(1, Math.round(planned * (1 + setPct / 100)))` — `sessionFactory.ts:93`의 식을 그대로 옮긴다 |
| `modeAdjustFor(mode, returnStep?)` | `SessionAdjust \| undefined` | normal → `undefined` · deload → `{ setPct: DELOAD_SET_PCT, weightPct: 0 }` · return → `{ setPct: step?.setPct ?? 0, weightPct: step?.weightPct ?? 0 }` (현행 `?? 0`과 같다) |
| `resolveSessionAdjust(session, routine, sessions?)` | `ResolvedAdjust` | 아래 표 |
| `workSetRows(entry)` — **`derive.ts`에 둔다** | `number` | `entry.sets.filter((s) => !s.warmup).length`. `doneSets` 옆, 행 수 세기의 유일한 자리 |
| `entrySetPlan(entry, routine, adjust)` | `EntrySetPlan \| undefined` | `entry.extra` → `undefined`. P = `entry.plannedSets`(있으면, `plannedFrom:'stored'`) → 없으면 `routineExerciseOfEntry(routine, entry)?.sets`(`plannedFrom:'routine'`, 대체 종목은 원 종목의 `sets`) → 둘 다 없으면 `undefined` |
| `sessionSetPlan(session, routine, adjust)` | `SessionSetPlan \| undefined` | `entrySetPlan`이 있는 entry의 합. skipped·미수행 entry도 P·G에 들어가고 D는 0. **한 entry라도 `given === null`이면 합의 `given`도 `null`**(`unknown`이면 전부 null). `routinePlanned` = 한 entry라도 `plannedFrom === 'routine'`. 대상 entry가 없으면 `undefined` |

```ts
export type ResolvedAdjust =
  | { kind: 'none' }                                                  // normal
  | { kind: 'known'; setPct: number; weightPct: number;
      source: 'stored' | 'derived'; gapDays?: number }                // gapDays: 복귀 되짚기일 때만
  | { kind: 'unknown' }                                               // 복귀인데 저장값 없고 되짚기 실패

export interface EntrySetPlan {
  planned: number          // P — entry.plannedSets ?? routineExercise.sets
  plannedFrom: 'stored' | 'routine'
  given: number | null     // G — none이면 planned, known이면 adjustedSetCount(P, setPct), unknown이면 null
  done: number             // D — doneSets(entry).length
  workRows: number         // R — workSetRows(entry)
}

export interface SessionSetPlan {
  planned: number
  given: number | null
  done: number
  routinePlanned: boolean  // 현재 루틴에서 읽은 P가 섞였다 → 문구가 `현재 루틴 계획`이라고 밝힌다
}
```

`resolveSessionAdjust` 순서 (처음 걸리는 것):

| 순서 | 조건 | 결과 |
|---|---|---|
| 1 | `mode === 'normal'` | `none` (`modeAdjust`가 있어도 무시) |
| 2 | `session.modeAdjust` 있음 | `known`, `source:'stored'` |
| 3 | `mode === 'deload'` | `known {DELOAD_SET_PCT, 0}`, `source:'derived'` |
| 4 | `mode === 'return'`, `sessions` 있음, 직전 근력 세션 있음, `returnStepFor(routine, gap)` 있음 | `known {step.setPct, step.weightPct}`, `source:'derived'`, `gapDays: gap` |
| 5 | 그 외 | `unknown` |

- 직전 근력 세션 = `strengthSessions(sessions)`(최신순 — `derive.ts:23-28`)에서 `.find((s) => s.id !== session.id && s.date < session.date)`. gap = `daysBetween(prev.date, session.date)`.
  생성 때와 같은 기준이다(`suggestNextDay.ts:101-127`, 근력 세션·날짜 차). 같은 날 앞 세션이 있었다면 공백 0이라 애초에 복귀 세션이 아니었다.
- 되짚기(3·4)는 JJ 이전 기록 전용이다. JJ 이후 세션은 늘 2에서 끝난다.

**3. `buildSession`이 초크포인트를 쓴다** — `sessionFactory.ts`

- `setPct`·`weightPct`를 `modeAdjustFor(mode, returnStep)`에서 얻는다(없으면 0).
- 행 수는 `adjustedSetCount(routineExercise.sets, setPct)`.
- `mode !== 'normal'`이면 `session.modeAdjust`에 그 값을 넣고, 각 entry에 `plannedSets: routineExercise.sets`를 넣는다. normal이면 두 키 모두 만들지 않는다.
- 행 수·무게·프리필은 바뀌지 않는다(검증 "생성 불변").

### 검증 (`src/lib/v112.test.ts`, describe `JJ1`)

- `adjustedSetCount`: 격자 P{1..6} × setPct{0, −30, −40, −50}가 v1.11.2 식 `max(1, round(P×(1+pct/100)))`과 같다. 보고서 0절 표 7종목(4·3·3·3·4·2·3, −30) → 3·2·2·2·3·1·2, 합 22 → 15.
- **생성 불변 (골든):** 고정 이력·루틴(배포 `routine-v2.4.json`)·Phase로 D1을 normal·deload·return(1·2·3단계)·return(step 없음) 다섯 경우로 만든 `entries`(행 수·무게·반복)를 JJ1 첫 커밋에서 현행 코드로 뽑아 `JJ_BUILD_GOLDEN`으로 붙이고, 이후 `buildSession` 결과의 `entries`가 칸(행 수·무게·반복)마다 같다. 비교는 `sets`만 한다 — 새 필드 `plannedSets`는 골든 밖이다. 골든은 이후 커밋에서 고치지 않는다.
- `modeAdjust` 저장: return 1단계 → `{setPct:-30, weightPct:-5}` · 3단계 → `{-50,-20}` · deload → `{-50,0}` · normal → `'modeAdjust' in session === false` · return인데 step 없음 → `{0,0}`, 행 수 = P.
- `plannedSets` 저장: return·deload 세션의 모든 entry가 `plannedSets === routineExercise.sets` (D1 7종목 4·3·3·3·4·2·3) · normal → 모든 entry에서 `'plannedSets' in entry === false`.
- `plannedSets` 보존: `applySubstitute` 뒤 같은 값 · `applyDayChange` 뒤 같은 값(대상 Day에 없는 종목도) · `applyAddExercise`가 만든 얹은 entry에는 없음.
- `resolveSessionAdjust`:
  - normal(`modeAdjust`를 억지로 넣어도) → `none`
  - 저장값 `{-30,-5}` + 이력상 공백 60일 → 저장값 그대로(`stored`) — **저장값이 되짚기보다 우선**
  - 저장값 있는 세션: 루틴 사본의 `returnProtocol`을 바꾸거나 직전 세션을 지워도 결과가 같다
  - 저장값 없는 deload → `{-50,0}`, `derived`
  - 저장값 없는 return, 직전 근력 세션 21일 전 → `{-30,-5}`, `derived`, `gapDays:21` · 35일 → `{-40,-10}` · 60일 → `{-50,-20}`
  - 저장값 없는 return, `sessions` 미전달 → `unknown`
  - 저장값 없는 return, 그 사이(10일 전)에 세션이 끼어든 이력 → `unknown` (공백 14일 미만)
  - 직전 세션이 유산소만 → 건너뛰고 그 앞 근력 세션으로 잰다 · 자기 자신(`id` 같음)은 제외
- `entrySetPlan`: 얹은 종목 → `undefined` · `plannedSets` 없고 루틴에 없는 키 → `undefined` · `plannedSets` 있고 루틴에 없는 키(Day 변경으로 빠진 종목) → 저장 P로 나온다 · 대체 종목(저장값 없음) → 원 종목 P, `routine` · 워밍업 행(체크 여부 무관)은 `workRows`·`done` 어디에도 안 센다 · `none` → `given === planned` · `unknown` → `given === null` · known `{0,0}` → `given === planned`.
- **루틴 변경 뒤에도 그날 P가 남는다 (회귀):** D1 return 1단계 세션을 루틴 사본으로 만든 뒤, 사본의 인클라인 `sets`를 4 → 5, 리어델트 2 → 3으로 바꿔 `entrySetPlan`을 부른다 → 인클라인 `{planned:4, plannedFrom:'stored', given:3}` · 리어델트 `{planned:2, given:1}`. 같은 entry에서 `plannedSets`를 지우면 `{planned:5, plannedFrom:'routine', given:4}` — 저장값이 결과를 가른다는 것을 같은 테스트에서 함께 보인다.
- `sessionSetPlan`: 08-26 7종목 픽스처(보고서 0절 표, 전부 체크) → `{planned:22, given:15, done:15}` · 한 종목 skipped → planned·given 그대로, done만 준다 · 얹은 종목은 합에 없다 · 저장값 없는 픽스처 → `routinePlanned: true`, `buildSession`으로 만든 세션 → `false` · `unknown` → `given: null`.
- **소스 스캔:** `sessionFactory.ts`에 `Math.max(1, Math.round(`·`DELOAD_SET_PCT =` 없음, `adjustedSetCount(`·`modeAdjustFor(`·`plannedSets:` 있음 · `setPlan.ts` 밖(테스트 제외)에 `1 + setPct / 100` 없음 · `src/` 전체에서 `.filter((s) => !s.warmup).length`는 `derive.ts`의 `workSetRows` 한 곳 · `setPlan.ts`에 `plannedSets ??` 있음(저장값 우선).

### 범위 제외

- **증량 판정이 `modeAdjust`·`plannedSets`를 보게 하기** — 판정 규칙 불변(GG1_GOLDEN). 그래서 루틴이 세션 뒤에 바뀐 경우에만
  같은 블록에 "계획"이 둘 나올 수 있다: A그룹 `다음: … (… 계획 5세트 중 3세트 …)`는 **현재 루틴**(다음 세션을 위한 판정 기준),
  `세트: 계획 4 → …`는 **그날**의 사실이다. 둘의 뜻이 다르므로 고치지 않고 검증으로 고정한다(JJ2 "루틴 변경").
- **G 저장** — 저장된 P와 조정률에서 같은 식으로 정확히 나온다.
- **기존 세션에 `modeAdjust`·`plannedSets`를 채우는 마이그레이션** — 채울 값이 현재 루틴뿐이라 되짚기와 같은 값이고, 옛 백업을 복원하면 어차피 필드 없는 세션이 다시 들어온다. 되짚기 경로가 필요하므로 마이그레이션은 이득이 없다.
- `targetRIR`·`rampWeeks` 저장 — 세트 생성에 쓰이지 않는다(GG2 진단: 램프업 미구현).

---

## JJ2. 지나간 세션의 내보내기가 계획·생성·완료를 말한다

### 진단

| 사실 | 근거 |
|---|---|
| 세션 헤더는 `[복귀]`/`[디로드]` 태그만 단다 — 얼마나 깎였는지 없다 | `exportMarkdown.ts:220-226` |
| 종목 블록은 완료 세트의 반복만 적는다 (`12`) — 계획 2인지 1인지 없다 | `exportMarkdown.ts:148` |
| A그룹은 GG1 사유가 `계획 N세트 중 M세트`를 말하지만 **반복 상단에 도달했을 때만**, B그룹은 아무 데도 없다 | `progression.ts` `holdReasonText` · `exportMarkdown.ts:178` |
| 08-26 세션: B그룹 4종목(펙덱·레터럴·리어델트·푸쉬다운)의 감량이 문서 어디에도 없다 | 보고서 0절 표 |
| `exportMarkdown`은 전체 `sessions`를 받는다 → 옛 복귀 세션의 되짚기가 가능하다 | `ExportPanel.tsx:85-94` · `exportMarkdown.ts:300-311` |

### 설계

**1. 문구 함수** — `setPlan.ts`, 문구는 여기 한 곳에만 둔다. 둘 다 normal 세션이면 `undefined`.

`sessionAdjustText(session, plan, adjust)` — 세션 한 줄. 모드 이름은 `복귀`/`디로드`.

문구는 서로 독립인 두 규칙으로 정해진다.
① **조정률 출처** — `adjust.source === 'derived'`면 조정 부분 뒤에 `(공백 N일로 재계산)`(복귀, `gapDays`) 또는 `(재계산)`(디로드).
② **P 출처** — `plan.routinePlanned`면 `계획` 대신 `현재 루틴 계획`. JJ 이후 세션은 둘 다 해당하지 않는다.

| adjust · plan | 문구 (08-26 기준) |
|---|---|
| known stored · P 저장 (JJ 이후) | `복귀 조정: 세트 −30% · 무게 −5% — 계획 22세트 → 15세트 생성 · 완료 15세트` |
| known derived (복귀) · P 루틴 (JJ 이전) | `복귀 조정: 세트 −30% · 무게 −5% (공백 21일로 재계산) — 현재 루틴 계획 22세트 → 15세트 생성 · 완료 15세트` |
| known derived (디로드) · P 루틴 (JJ 이전) | `디로드 조정: 세트 −50% (재계산) — 현재 루틴 계획 22세트 → 11세트 생성 · 완료 11세트` |
| known, `weightPct === 0` | `· 무게 …` 부분을 뺀다 (디로드는 늘 뺀다) |
| known, `setPct`·`weightPct` 모두 0 (step 없는 복귀) | `복귀 조정: 없음 — 계획 22세트 · 완료 15세트` (G = P라 `→ … 생성`을 뺀다) |
| unknown · P 루틴 | `복귀 조정: 기록 없음 — 현재 루틴 계획 22세트 · 완료 15세트` |

- 퍼센트: 음수는 `−`(U+2212) + 절댓값, 양수는 `+`. 숫자 리터럴을 문구에 박지 않는다.
- `plan`이 `undefined`(대상 entry 없음)면 `— …` 뒤를 생략하고 조정 부분만 쓴다.
- `plan.given === null`이면(unknown) `→ … 생성`을 뺀다. `plan.given === plan.planned`여도 뺀다.

`entrySetLine(plan, mode)` — 종목 한 줄. `mode === 'normal'`이면 `undefined`(호출부 가드와 별개로 함수가 막는다).
P 출처는 세션 줄이 이미 말하므로 종목 줄에는 붙이지 않는다.

| 경우 | 문구 |
|---|---|
| `given === null` | `세트: 계획 2 · 완료 1` |
| `given === planned` — P가 1이라 줄지 않음, 또는 known `{0,0}` | `세트: 계획 1 · 완료 1` · `{0,0}` 복귀의 인클라인 `세트: 계획 4 · 완료 4` |
| 그 외 | `세트: 계획 2 → 복귀 조정 1 · 완료 1` (디로드는 `디로드 조정`) |
| 행을 더해 G보다 많이 완료 | `세트: 계획 4 → 복귀 조정 3 · 완료 4` (규칙 그대로, 별도 분기 없음) |

**2. 표시 위치** — `exportMarkdown.ts`

| 위치 | 변경 |
|---|---|
| `sessionToMarkdown(session, routine, catalog, phase, scales?, sessions?)` | 인자 `sessions?` 추가(끝, 선택). 안에서 `resolveSessionAdjust(session, routine, sessions)`를 **한 번** 부르고 `entryLine`에 넘긴다 |
| 세션 헤더 바로 다음 줄 | 복귀·디로드 세션이면 `sessionAdjustText`. `수행 순서:` 줄보다 앞 |
| `entryLine` | 복귀·디로드 세션이고 `entrySetPlan`이 있으면 반복 줄(`10 / 10 / 10`) **바로 다음**에 `entrySetLine`. `간격:`보다 앞 |
| `exportMarkdown` | `sessionToMarkdown(s, routine, catalog, phase, scales, sessions)` — 전체 `sessions`를 넘긴다 |
| normal 세션 | **변경 없음.** 글자 하나 바뀌지 않는다 |

- A그룹 `다음: … 유지 (반복 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션)`은 그대로 둔다. 루틴이 그 뒤로 안 바뀌었으면 같은 P를 말하고, 새 줄은 G(앱이 준 수)를 더한다.
  루틴이 바뀌었으면 사유는 현재 루틴, `세트:` 줄은 그날 P다(JJ1 범위 제외 — 뜻이 다른 두 숫자).
- 문서 머리 캡션은 더하지 않는다. 줄 자체가 뜻을 말한다(v1112 테스트가 머리 4줄을 고정하고 있다).

예 — 08-26 리어델트 (JJ 이전 기록, 전체 내보내기):

```
## 2026-08-26 (수) — Day 1 Push [복귀]  [18:15–19:40, 85분]
복귀 조정: 세트 −30% · 무게 −5% (공백 21일로 재계산) — 현재 루틴 계획 22세트 → 15세트 생성 · 완료 15세트
수행 순서: …

### 리어델트 (D1/B) 7.5kg
12
세트: 계획 2 → 복귀 조정 1 · 완료 1
보상작용: 없음
```

### 검증 (`v112.test.ts`, describe `JJ2`)

- **08-26 재현 (7종목, 저장값 없음, 21일 전 근력 세션 포함 `exportMarkdown`):** 헤더 다음 줄이 위 예와 같다 · 리어델트 블록이 `12` → `세트: 계획 2 → 복귀 조정 1 · 완료 1` → `보상작용: 없음` 순서 · 인클라인 `세트: 계획 4 → 복귀 조정 3 · 완료 3`.
- 같은 세션에 `modeAdjust {-30,-5}`만 → `(공백 21일로 재계산)` 없음, `현재 루틴 계획` 그대로 (두 규칙이 독립).
- 같은 세션에 `modeAdjust {-30,-5}` + 전 entry `plannedSets` → `복귀 조정: 세트 −30% · 무게 −5% — 계획 22세트 → 15세트 생성 · 완료 15세트`.
- `sessionToMarkdown`에 `sessions` 없이(저장값 없음) → `복귀 조정: 기록 없음 — 현재 루틴 계획 22세트 · 완료 15세트`, 종목 줄 `세트: 계획 2 · 완료 1`.
- 디로드(`buildSession`으로 생성, 저장값 `{-50,0}`) → `디로드 조정: 세트 −50% — 계획 22세트 → 11세트 생성 · 완료 11세트`, `무게` 없음.
- 저장값 없는 디로드 → `디로드 조정: 세트 −50% (재계산) — 현재 루틴 계획 22세트 → 11세트 생성 · 완료 11세트`.
- step 없는 복귀(`{0,0}` 저장) → `복귀 조정: 없음 — 계획 22세트 · 완료 15세트`, 인클라인 `세트: 계획 4 · 완료 4`.
- **루틴 변경 (회귀):** `buildSession`으로 만든 return 1단계 세션(전부 체크)을 내보낸 뒤 루틴 사본의 인클라인 `sets` 4 → 5로 바꿔 다시 내보낸다 → 헤더 다음 줄·인클라인 `세트: 계획 4 → 복귀 조정 3 · 완료 3`이 **두 출력에서 같다**. 같은 사본으로 종료 시트 한 줄(JJ3)도 같다. 인클라인을 반복 상단 픽스처로 두면 `다음:` 사유는 `계획 5세트 중 3세트`(현재 루틴)로 바뀐다 — 그 차이를 함께 단언해 의도된 것임을 고정한다.
- 복귀 세션의 계획 1세트 종목 → `세트: 계획 1 · 완료 1`.
- `entrySetLine(plan, 'normal')` → `undefined`.
- 복귀에서 행을 더해 4/3 완료 → `세트: 계획 4 → 복귀 조정 3 · 완료 4`.
- 얹은 종목 → `세트:` 줄 없음, 세션 줄 합에 없음 · 대체 종목 → 원 종목 P로 줄이 나온다.
- 워밍업만 체크한 종목 → 본문에 없음(현행) · 세션 줄 합에는 P·G로 들어가고 D 0.
- skipped 종목 → 본문에 없음 · 세션 줄 `완료`만 줄어든다.
- **normal 불변 (골든):** JJ1 첫 커밋에서 normal 세션 픽스처 셋(전부 완료 · 한 행 미체크 · 행 하나 삭제)의 현행 `exportMarkdown` 전문을 `JJ_EXPORT_NORMAL_BEFORE`로 붙이고, 이후 출력이 문자 단위로 같다.
- **v111 ② 수정 (유일한 기존 테스트 수정):** `v111.test.ts`의 `after()`가 `복귀 조정:`·`세트:`로 시작하는 줄을 걸러낸다. 주석 `JJ2(PLAN-v1.12)가 더한 줄 — GG1의 diff 범위 확인은 그 줄을 뺀 나머지로 한다`. 단언 본문은 고치지 않는다. 같은 픽스처의 JJ 이후 전문은 `v112.test.ts`가 따로 고정한다.
- **소스 스캔:** `exportMarkdown.ts`에 `조정`·`생성` 문구 리터럴과 `Math.round(` 세트 수 계산이 없고 `sessionAdjustText`·`entrySetLine`·`resolveSessionAdjust`를 import한다 · `resolveSessionAdjust(` 호출이 `sessionToMarkdown` 안에 한 번 · `exportMarkdown`이 `sessionToMarkdown(`에 `sessions`를 넘긴다.

### 범위 제외

- **normal 세션의 `세트:` 줄** (완료 ≠ 계획일 때) — 붙이지 않는다(검토 뒤 확정). 정상 세션은 앱이 늘 계획대로 만들어 "앱이 줄였나"라는 질문이 없고, 정상 세션 내보내기가 글자 하나 바뀌지 않는다.
- **기록 탭 세션 상세·요약 화면 표시** — 오독이 일어난 곳은 LLM 분석 경로(내보내기)다. 같은 함수로 나중에 붙일 수 있다.
- **세션 화면 상단 복귀 상태 한 줄** (GG2 범위 제외에서 넘어온 것) — 진행 중 카드는 GG2 `modeSetNotice`가 이미 종목마다 말한다. 이제 `modeAdjust`가 있으니 다음 라운드에 비용 없이 가능하다.
- 헤더 태그 `[복귀]`·`[디로드]` 형식 변경 — 기존 테스트·분석 프롬프트가 태그를 기대한다(`export.test.ts:102-111`).

---

## JJ3. 종료 시트 — 미완료 판정은 행 기준을 지키고, 조정 사실을 말한다

### 진단

| 사실 | 근거 |
|---|---|
| "세트가 남은 종목" = `doneSets(e).length < e.sets.length` | `FinishSheet.tsx:43-45`, 표시 `:88` |
| 08-26 리어델트: G=1 행, 1 완료 → 완료로 보인다. 계획 2는 어디에도 없다 | 보고서 4절 |
| **분자는 워밍업을 빼고 분모는 워밍업 행을 센다** → 워밍업을 넣은 종목은 작업 세트를 다 해도 `3/4`로 "남은 종목"에 뜬다 | `derive.ts:37-39` `doneSets` (워밍업 제외) · `e.sets.length` (전체 행) · 워밍업 행 추가 `ExerciseCard.tsx:538` → `sessionOps.ts:86` |
| 종료 시트는 루틴(`bundle.routine`)을 받지만 세션 목록은 받지 않는다 | `FinishSheet.tsx:15-31` |

**판정 기준을 무엇으로 할 것인가**

| 기준 | 08-26 리어델트 | 판단 |
|---|---|---|
| P 계획 | 1/2 → 남음 | **기각.** 복귀·디로드 세션마다 거의 모든 종목이 "남은 종목"이 된다. 앱이 복귀 프로토콜보다 더 하라고 말하는 셈이다(GG2 "세트를 추가하라고 하지 않는다") |
| G 생성 | 1/1 → 완료 | **기각.** 행을 지운 것은 사용자의 결정이다. JJ 이전 복귀 세션은 G를 모를 수 있다 |
| R 작업 행 | 1/1 → 완료 | **채택.** 이 경고의 목적은 "체크를 빠뜨린 행"이다(DESIGN §5.2 미완료 확인). 워밍업 결함만 고친다 |

빠진 것은 판정이 아니라 **계획 사실**이다. 그것은 경고가 아니라 정보 한 줄로 준다.

### 설계

1. **`partialEntries(session)`** — `setPlan.ts`, 순수 함수
   `{ recordKey; done; rows }[]`, 조건 `!e.skipped && done > 0 && done < rows`, `done = doneSets(e).length`, `rows = workSetRows(e)`.
   얹은 종목도 대상이다(행 기준이라 계획이 필요 없다). `FinishSheet`의 `partial`과 표시 `${done}/${rows}`가 이 값을 쓴다.
2. **조정 한 줄** — 복귀·디로드 세션이면 시트 맨 위(`세션 종료` 라벨 다음, 경고 상자 앞)에 `row-sub`로
   `sessionAdjustText(session, sessionSetPlan(session, bundle.routine, adj), adj)`,
   `adj = resolveSessionAdjust(session, bundle.routine)` (세션 목록 없이). **내보내기 헤더 줄과 같은 문자열이다.**
   - JJ 이후 세션은 늘 저장값(조정률·P)이 있어, 시트가 받는 루틴이 그 뒤에 바뀌었어도 그날 P·G를 말한다.
     업데이트 전에 시작한 진행 중 복귀 세션만 `기록 없음 — 현재 루틴 계획 …`이 된다(드문 경계, 그대로 둔다).
   - 경고 색을 쓰지 않는다. 판단이 아니라 사실이다.
3. **`incomplete`(손대지 않은 종목)는 바꾸지 않는다.**

### 검증 (`v112.test.ts`, describe `JJ3`)

- `partialEntries`:
  - 워밍업 1(체크) + 작업 3(전부 체크) → 빈 목록 (**v1.11.2 식 `doneSets < sets.length`로는 `3/4`로 뜬다는 것을 같은 테스트에서 함께 보여 결함을 고정한다**)
  - 워밍업 1(미체크) + 작업 3(전부 체크) → 빈 목록 (v1.11.2 식은 `3/4`)
  - 작업 3 중 2 체크 → `{done:2, rows:3}`
  - 08-26 리어델트(1행 1체크, 복귀) → 빈 목록
  - 복귀 인클라인 3행 중 2 체크 → `{done:2, rows:3}` (계획 4가 아니다)
  - 얹은 종목 4행 중 3 체크 → 포함 · skipped → 제외 · 완료 0 → 제외(손대지 않은 종목 쪽)
- 조정 한 줄: 08-26 픽스처 + `modeAdjust {-30,-5}` + 전 entry `plannedSets` → `복귀 조정: 세트 −30% · 무게 −5% — 계획 22세트 → 15세트 생성 · 완료 15세트` · normal → `undefined` · 같은 세션의 내보내기 헤더 다음 줄과 문자열이 같다 · 루틴 사본의 `sets`를 바꿔도 같다(JJ2 "루틴 변경"과 같은 픽스처).
- **소스 스캔:** `FinishSheet.tsx`에 `e.sets.length`·`.sets.length` 없음 · `partialEntries(`·`sessionAdjustText(`·`resolveSessionAdjust(` 있음 · `FinishSheet.tsx`에 `조정` 리터럴 없음.

### 범위 제외

- "손대지 않은 종목" 경고 문구(`그대로 종료하면 기록되지 않습니다`)가 워밍업만 체크한 종목에서 부정확한 문제 — 워밍업 행은 저장되지만 내보내기 본문에서 빠진다. 문구 결정이 따로 필요하다(다음 라운드 후보).
- 종료 시트에 종목별 계획 세트 나열 — 한 줄 요약과 내보내기 종목 줄로 충분하다. 종료 시트는 마찰 최소가 원칙이다(`FinishSheet.tsx:10-14`).

---

## 과거 판정 불변

바뀌지 않는 것: `judgeProgression`·`progressionSuggestions`·`progressionVerdicts`(GG1_GOLDEN) · `buildSession`의 행 수·무게·프리필(JJ_BUILD_GOLDEN) · PR·볼륨·Phase 조건(`doneSets` 무변경) · normal 세션 내보내기(JJ_EXPORT_NORMAL_BEFORE) · "손대지 않은 종목" 경고.

달라지는 것:

| 자리 | 전 | 후 |
|---|---|---|
| 복귀·디로드 세션 내보내기, 헤더 다음 | 없음 | `복귀 조정: …` 한 줄 |
| 복귀·디로드 세션 내보내기, 종목 반복 줄 다음 | 없음 | `세트: 계획 P[ → 복귀 조정 G] · 완료 D` |
| 종료 시트, 복귀·디로드 세션 | 없음 | 내보내기와 같은 `복귀 조정: …` 한 줄 |
| 종료 시트 "세트가 남은 종목", 워밍업 행이 있는 종목 | 작업 세트를 다 해도 `3/4`로 뜸 | 뜨지 않음. 분모가 작업 행 |
| 새로 만드는 복귀·디로드 세션 | `modeAdjust` 없음 | `modeAdjust` 저장 |
| 새로 만드는 복귀·디로드 세션의 루틴 종목 entry | `plannedSets` 없음 | `plannedSets` 저장 |

JJ 이전 복귀·디로드 세션은 **내보내기 때마다 현재 루틴과 이력으로 되짚는다** — 조정률은 `(공백 N일로 재계산)`·`(재계산)`, P는 `현재 루틴 계획`으로 표시한다.
그 사이 이력·루틴이 바뀌면 값이 바뀌거나 `기록 없음`이 될 수 있다. JJ 이후 세션은 조정률·P 모두 저장값이라 루틴이 바뀌어도 바뀌지 않는다.

---

## 구현 순서와 검증

**JJ1 → JJ2 → JJ3.** JJ2·JJ3이 JJ1의 `resolveSessionAdjust`·`sessionSetPlan`·`workSetRows`에 기댄다.
커밋은 **골든 1 + 구현 3 + 기록·버전 1**. 작업끼리 한 커밋에 섞지 않는다.

관례:
- `npm run build` (타입 확인 포함, `tsc` 직접 호출 금지) · 작업 중에는
  `npx vitest run src/lib/v112.test.ts src/lib/v111.test.ts src/lib/export.test.ts src/lib/prefill.test.ts src/lib/finishAndStart.test.ts`만 · 마지막에 `npm test` 한 번
- 커밋 개수는 실행 출력을 복사한다 (`git log --oneline main..HEAD`)
- 커밋 메시지는 `git commit -F - <<'MSG'`
- **첫 커밋은 골든만 담는다:** v1.11.2 코드 그대로 `JJ_BUILD_GOLDEN`(JJ1 검증 "생성 불변")·`JJ_EXPORT_NORMAL_BEFORE`(JJ2 검증 "normal 불변")를 `v112.test.ts`에 붙여 커밋한 뒤 구현을 시작한다. 이후 고치지 않는다(DEV-RECORD에 해시).
- 기존 테스트 수정은 **v111 ② `after()` 필터 하나뿐**이다(JJ2 검증). 다른 기존 테스트가 깨지면 설계와 어긋난 것이므로 고치지 말고 멈춰서 보고한다.
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `sessionFactory.ts`에 `Math.max(1, Math.round(routineExercise.sets * (1 + setPct / 100)))` 복원 → JJ1 스캔 실패
  ② `buildSession`에서 `modeAdjust` 저장을 지움 → `modeAdjust 저장` 실패
  ③ `resolveSessionAdjust`의 1·2 순서를 바꿔 되짚기를 먼저 → `저장값이 되짚기보다 우선` 실패
  ④ `exportMarkdown.ts`가 `sessions`를 넘기지 않게 → `08-26 재현` 실패(`기록 없음`이 나온다)
  ⑤ `FinishSheet.tsx`의 `partial`을 `doneSets(e).length < e.sets.length`로 복원 → JJ3 스캔 실패
  ⑥ `exportMarkdown.ts`에 `'복귀 조정'` 리터럴 → JJ2 스캔 실패
  ⑦ `buildSession`에서 `plannedSets` 저장을 지움 → `plannedSets 저장`·JJ2 `루틴 변경` 실패
  ⑧ `entrySetPlan`이 `plannedSets`를 무시하고 `routineExercise.sets`만 읽게 → JJ1 `루틴 변경 뒤에도 그날 P가 남는다` 실패
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 테스트 안에 고정한 루틴(배포 `routine-v2.4.json`)·Phase·픽스처로 한정한다고 첫 줄에 적는다:
  ① `GG1_GOLDEN`·`JJ_BUILD_GOLDEN`·`JJ_EXPORT_NORMAL_BEFORE` 전 칸 일치 (골든 커밋 해시)
  ② v111 ② 수정 diff를 붙인다 — `after()` 필터 추가뿐
  ③ 08-26 픽스처의 v1.11.2 내보내기와 새 내보내기의 diff가 `복귀 조정:` 1줄 + `세트:` 7줄 추가뿐이다
  ④ 바뀌는 것: 위 "과거 판정 불변" 표의 여섯 자리
- 완료 후 `docs/DEV-RECORD-v1.12.md` (맨 위 "이 환경에서 확인된 제약"은 v1.11.2 목록을 이어받는다)
- `package.json` **1.12.0**은 기록 커밋에서 올린다

---

## 사람이 정할 것

없음. 처음 세 항목은 검토 뒤 모두 확정했다(아래 "검토 반영 기록" 3절). 화면·내보내기 문구는 JJ2 설계 1의 두 표가 원문이다.

---

## 검토 반영 기록

검토 대상 커밋 `020f402`. 보고: `.reports/v1.12-codex.md`(수정 필요), `.reports/v1.12-antigravity.md`(그대로 진행 가능).

### 1. 반영

| 지적 | 출처 | 코드 확인 | 반영 |
|---|---|---|---|
| 과거 P가 보존되지 않는다 — 루틴 `sets`가 바뀌면 과거 세션의 "계획 22 → 15세트 생성"과 종료 시트 줄이 새 루틴으로 다시 계산된다 | Codex 고칠 것 1, 항목 2·5 | **맞다.** `types.ts:225-280`에 P 필드가 없고, 배포 루틴의 `sets`는 실제로 바뀌어 왔다(`02d3b4b`·`89e90ac`, `seed.ts:60-93`이 리비전마다 갈아 끼움, `RoutineIoPanel` 가져오기) | `SessionEntry.plannedSets` 저장(JJ1 설계 1·3), `entrySetPlan`이 저장값 우선(`plannedFrom`), 공통 진단·머리말 보장 범위 갱신 |
| 스냅샷 없는 기존 기록의 대체 규칙을 정하라 · `재계산`이 현재 루틴 기준인지 밝혀라 | Codex 항목 5, 사람이 정할 것 3 조건 | 맞다. JJ 이전 세션은 P를 현재 루틴에서만 얻을 수 있다 | `SessionSetPlan.routinePlanned` → `계획` 대신 `현재 루틴 계획`. 조정률 출처(`재계산`)와 P 출처를 독립 규칙 둘로 정리(JJ2 설계 1) |
| 루틴 변경 뒤 과거 내보내기·종료 시트가 원래 P/G를 유지하는 테스트 | Codex 항목 3 | — | JJ1 `루틴 변경 뒤에도 그날 P가 남는다`, JJ2 `루틴 변경 (회귀)`, JJ3 조정 한 줄, 결함 복원 ⑦⑧ |
| known 0%일 때 `given === planned` 문구 예시 | Codex 경미 | — | `{0,0}` 복귀의 세션 줄·종목 줄 예시와 검증 추가. 세션 줄은 `→ … 생성`을 뺀다고 명시 |
| `sessionSetPlan`의 `given`은 unknown이면 `null` | Antigravity 경미 1 | 원안 표에 타입만 있고 합산 규칙이 없었다 | "한 entry라도 null이면 합도 null" 명시, 검증 추가 |
| `entrySetLine`이 normal이면 스스로 `undefined` | Antigravity 경미 2 | 원안은 호출부 가드에만 기댔다 | 함수 규칙과 검증 추가 |
| 직전 근력 세션은 `strengthSessions`가 최신순이므로 `.find`로 충분 | Antigravity 경미 3 | 맞다(`derive.ts:23-28` `completedSessions` 최신순 정렬) | 문구를 `.find(...)`로 구체화 |

### 2. 두 검토가 갈린 지점 — P를 저장할 것인가

Antigravity는 원안이 "P를 저장하지 않아 GG1 골든과의 충돌을 피했다"고 장점으로 봤고, Codex는 같은 결정을 결함으로 봤다. **Codex가 맞다.**
- 새 줄은 "앱이 그날 몇 세트를 만들었나"라는 **과거 사실**을 말하려고 더하는 것이다. 그 숫자가 이후 루틴 편집으로 바뀌면 이번 작업의 목적(보고서 4절 오독 해소)이 무너진다. 루틴 `sets`는 실제로 바뀌어 왔다(위 표).
- Antigravity가 짚은 충돌(같은 블록에 "계획" 숫자가 둘)은 루틴이 세션 뒤에 바뀐 경우에만 생기고, 두 숫자의 뜻이 다르다 — GG1 사유는 다음 세션을 위한 **현재** 판정 기준, `세트:` 줄은 **그날**의 사실. 판정은 손대지 않으므로 GG1_GOLDEN은 그대로다(JJ1 범위 제외, JJ2 검증 `루틴 변경`이 차이를 고정).
- 비용은 entry 필드 하나다. 대체·Day 변경이 entry를 펼쳐 복사하므로(`sessionOps.ts:154-180`, `dayChange.ts:81-93`) 별도 보존 코드가 필요 없다. 오히려 Day 변경 뒤에도 행을 만든 그날의 P를 유지해, 현재 루틴에서 읽는 원안보다 정확하다.

### 3. 사람이 정할 것 → 설계자 확정

| 항목 | 검토 의견 | 확정 |
|---|---|---|
| 1. 내보내기·종료 시트 문구 | 둘 다 A | **A 확정.** 단 3번의 Codex 조건에 맞춰 JJ 이전 세션은 `현재 루틴 계획`을 붙인다 |
| 2. normal 세션 `세트:` 줄 | 둘 다 A | **A 확정** — 붙이지 않는다(JJ2 범위 제외) |
| 3. JJ 이전 복귀 세션 조정률 | Antigravity A · Codex A(조건: 현재 루틴 기준임을 밝히거나 P 보존) | **A 확정, 조건 둘 다 반영** — JJ 이후는 P 저장, JJ 이전은 `(공백 21일로 재계산)` + `현재 루틴 계획` |

### 4. 기각

없음.
