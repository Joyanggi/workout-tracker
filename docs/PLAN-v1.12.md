# PLAN v1.12 — 복귀·디로드가 깎은 세트 수를 세션이 기억한다 (JJ)

> 작성: Opus 5.5 (설계자), 2026-11-04. 대상 코드: v1.11.2 (`f31ef87`).
> 근거: `docs/FIELD-REPORT-2026-08-27.md` 4절 ("복귀·디로드가 깎은 세트 수가 그 자리에서 계획이 된다"), 8절 우선순위 3.
> 선행: PLAN-v1.11 GG2가 **진행 중 세션 카드**(`modeSetNotice`)와 다음 세션 칩을 이미 해결했다.
> 이번에는 남은 두 자리, **지나간 세션의 내보내기**와 **종료 시트**만 다룬다.
>
> **성격**: 저장 필드 하나(`Session.modeAdjust`)를 더하고, 나머지는 파생한다. 증량 판정(`judgeProgression`)·
> 세트 생성 결과(행 수·무게)·PR·볼륨은 한 건도 바뀌지 않는다. 바뀌는 것은 복귀·디로드 세션의
> 내보내기 줄과 종료 시트 표시다(끝의 "과거 판정 불변" 표).
>
> **보장 범위**: GG와 같다. "계획 N세트"는 **현재** 루틴 정의(`routineExercise.sets`)다. 저장하는 것은
> 그 시점의 **조정률**뿐이고, 계획 세트 수 자체는 고정하지 않는다(JJ1 범위 제외).

---

## 공통 진단 — 세션에 남는 것과 사라지는 것

한 종목에는 숫자가 넷 있다. 2026-08-26 리어델트로 보면:

| 숫자 | 뜻 | 08-26 리어델트 | 지금 세션에 남는가 |
|---|---|---|---|
| P 계획 | 루틴 정의 `routineExercise.sets` | 2 | 루틴에서 파생 (GG와 같은 값) |
| G 생성 | 앱이 만든 행 `max(1, round(P × (1 + setPct/100)))` | 1 | **아니다.** `setPct`가 저장되지 않는다 (`sessionFactory.ts:69-70`, `:93`) |
| R 작업 행 | 지금 있는 작업 세트 행 (워밍업 제외) | 1 | 남는다 (사용자가 더하거나 지울 수 있다) |
| D 완료 | `doneSets(entry).length` | 1 | 남는다 |

사용자가 "내가 1세트만 했나, 앱이 1세트만 줬나"를 구분하지 못한 것은 **G가 없어서**다. P·D만 있으면
"계획 2 중 1 완료"까지는 말할 수 있지만, 그 1이 앱의 조정인지 사용자의 선택인지는 말할 수 없다.

**G를 파생으로 되짚을 수 있는가** — 디로드는 상수(`DELOAD_SET_PCT`)라 된다. 복귀는 불안정하다.

| 복귀 `setPct`를 되짚는 법 | 값이 바뀌는 경우 |
|---|---|
| 직전 근력 세션과의 공백 → `returnStepFor(routine, gap)` (`suggestNextDay.ts:77-87`) | ① 루틴의 `returnProtocol` 변경(시드 리비전·루틴 가져오기) ② 직전 세션 삭제·편집(체크를 모두 풀면 근력 세션에서 빠진다) ③ 그 사이에 기록이 끼어듦 |

보고서 4절이 짚은 "파생이 불안정한 드문 경우"가 코드로 확인된다. 그래서 **조정률만 저장**한다.
G는 저장값과 P에서 파생하므로 같은 공식이 한 곳(`adjustedSetCount`)에만 있다.

---

## JJ1. 세션이 적용된 조정률을 기억한다 · 세트 계획 초크포인트

### 진단

| 사실 | 근거 |
|---|---|
| 조정률은 세션 생성 때 계산되고 버려진다 | `sessionFactory.ts:69-70` (지역 변수 `setPct`·`weightPct`) |
| 세트 수 공식이 `buildSession` 안에만 있다 — 나중에 G를 말하려면 공식을 복제해야 한다 | `sessionFactory.ts:93` |
| 모드는 생성 뒤 바뀌지 않는다 (`mode`를 쓰는 곳은 `buildSession` 한 곳) | `grep "mode:"` — 나머지는 읽기만 |
| 세션 편집·Day 변경·마감은 세션을 펼쳐 복사한다 → 새 필드가 보존된다 | `dayChange.ts:96` · `sessionOps.ts:20` · `store/session.ts:110` |
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
```

- Dexie 인덱스가 아니므로 `version()` 추가 없음. `SCHEMA_VERSION` 그대로(필드 추가는 하위 호환 — `extra` 선례).
- `ReturnProtocolStep` 전체를 저장하지 않는다. 행 수·무게를 정하는 두 값만 사실이고, `targetRIR`·`rampWeeks`는 세트 생성에 쓰이지 않는다.

**2. 초크포인트 모듈 `src/lib/setPlan.ts` (신설)**

| 함수 | 반환 | 규칙 |
|---|---|---|
| `DELOAD_SET_PCT` | `-50` | `sessionFactory.ts`에서 **옮긴다**(값 그대로). `sessionFactory`가 이 모듈을 import하므로 반대로 두면 순환이 생긴다. 다른 import처는 없다 |
| `adjustedSetCount(planned, setPct)` | `number` | `Math.max(1, Math.round(planned * (1 + setPct / 100)))` — `sessionFactory.ts:93`의 식을 그대로 옮긴다 |
| `modeAdjustFor(mode, returnStep?)` | `SessionAdjust \| undefined` | normal → `undefined` · deload → `{ setPct: DELOAD_SET_PCT, weightPct: 0 }` · return → `{ setPct: step?.setPct ?? 0, weightPct: step?.weightPct ?? 0 }` (현행 `?? 0`과 같다) |
| `resolveSessionAdjust(session, routine, sessions?)` | `ResolvedAdjust` | 아래 표 |
| `workSetRows(entry)` — **`derive.ts`에 둔다** | `number` | `entry.sets.filter((s) => !s.warmup).length`. `doneSets` 옆, 행 수 세기의 유일한 자리 |
| `entrySetPlan(entry, routine, adjust)` | `EntrySetPlan \| undefined` | `entry.extra` 또는 `routineExerciseOfEntry` 없음 → `undefined`. 대체 종목은 원 종목의 `sets` |
| `sessionSetPlan(session, routine, adjust)` | `{ planned; given: number \| null; done } \| undefined` | `entrySetPlan`이 있는 entry의 합. skipped·미수행 entry도 P·G에 들어가고 D는 0. 대상 entry가 없으면 `undefined` |

```ts
export type ResolvedAdjust =
  | { kind: 'none' }                                                  // normal
  | { kind: 'known'; setPct: number; weightPct: number;
      source: 'stored' | 'derived'; gapDays?: number }                // gapDays: 복귀 되짚기일 때만
  | { kind: 'unknown' }                                               // 복귀인데 저장값 없고 되짚기 실패

export interface EntrySetPlan {
  planned: number          // P — routineExercise.sets
  given: number | null     // G — none이면 planned, known이면 adjustedSetCount(P, setPct), unknown이면 null
  done: number             // D — doneSets(entry).length
  workRows: number         // R — workSetRows(entry)
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

- 직전 근력 세션 = `strengthSessions(sessions)`에서 `s.id !== session.id && s.date < session.date`인 첫 항목. gap = `daysBetween(prev.date, session.date)`.
  생성 때와 같은 기준이다(`suggestNextDay.ts:101-127`, 근력 세션·날짜 차). 같은 날 앞 세션이 있었다면 공백 0이라 애초에 복귀 세션이 아니었다.
- 되짚기(3·4)는 JJ 이전 기록 전용이다. JJ 이후 세션은 늘 2에서 끝난다.

**3. `buildSession`이 초크포인트를 쓴다** — `sessionFactory.ts`

- `setPct`·`weightPct`를 `modeAdjustFor(mode, returnStep)`에서 얻는다(없으면 0).
- 행 수는 `adjustedSetCount(routineExercise.sets, setPct)`.
- `mode !== 'normal'`이면 `session.modeAdjust`에 그 값을 넣는다. normal이면 키 자체를 만들지 않는다.
- 행 수·무게·프리필은 바뀌지 않는다(검증 "생성 불변").

### 검증 (`src/lib/v112.test.ts`, describe `JJ1`)

- `adjustedSetCount`: 격자 P{1..6} × setPct{0, −30, −40, −50}가 v1.11.2 식 `max(1, round(P×(1+pct/100)))`과 같다. 보고서 0절 표 7종목(4·3·3·3·4·2·3, −30) → 3·2·2·2·3·1·2, 합 22 → 15.
- **생성 불변 (골든):** 고정 이력·루틴(배포 `routine-v2.4.json`)·Phase로 D1을 normal·deload·return(1·2·3단계)·return(step 없음) 다섯 경우로 만든 `entries`(행 수·무게·반복)를 JJ1 첫 커밋에서 현행 코드로 뽑아 `JJ_BUILD_GOLDEN`으로 붙이고, 이후 `buildSession` 결과의 `entries`가 칸마다 같다. 골든은 이후 커밋에서 고치지 않는다.
- `modeAdjust` 저장: return 1단계 → `{setPct:-30, weightPct:-5}` · 3단계 → `{-50,-20}` · deload → `{-50,0}` · normal → `'modeAdjust' in session === false` · return인데 step 없음 → `{0,0}`, 행 수 = P.
- `resolveSessionAdjust`:
  - normal(`modeAdjust`를 억지로 넣어도) → `none`
  - 저장값 `{-30,-5}` + 이력상 공백 60일 → 저장값 그대로(`stored`) — **저장값이 되짚기보다 우선**
  - 저장값 있는 세션: 루틴 사본의 `returnProtocol`을 바꾸거나 직전 세션을 지워도 결과가 같다
  - 저장값 없는 deload → `{-50,0}`, `derived`
  - 저장값 없는 return, 직전 근력 세션 21일 전 → `{-30,-5}`, `derived`, `gapDays:21` · 35일 → `{-40,-10}` · 60일 → `{-50,-20}`
  - 저장값 없는 return, `sessions` 미전달 → `unknown`
  - 저장값 없는 return, 그 사이(10일 전)에 세션이 끼어든 이력 → `unknown` (공백 14일 미만)
  - 직전 세션이 유산소만 → 건너뛰고 그 앞 근력 세션으로 잰다 · 자기 자신(`id` 같음)은 제외
- `entrySetPlan`: 얹은 종목 → `undefined` · 루틴에 없는 키 → `undefined` · 대체 종목 → 원 종목 P · 워밍업 행(체크 여부 무관)은 `workRows`·`done` 어디에도 안 센다 · `none` → `given === planned` · `unknown` → `given === null`.
- `sessionSetPlan`: 08-26 7종목 픽스처(보고서 0절 표, 전부 체크) → `{planned:22, given:15, done:15}` · 한 종목 skipped → planned·given 그대로, done만 준다 · 얹은 종목은 합에 없다.
- **소스 스캔:** `sessionFactory.ts`에 `Math.max(1, Math.round(`·`DELOAD_SET_PCT =` 없음, `adjustedSetCount(`·`modeAdjustFor(` 있음 · `setPlan.ts` 밖(테스트 제외)에 `1 + setPct / 100` 없음 · `src/` 전체에서 `.filter((s) => !s.warmup).length`는 `derive.ts`의 `workSetRows` 한 곳.

### 범위 제외

- **계획 세트 수 P 자체를 저장** — GG 판정이 현재 루틴 정의를 쓰므로, P를 따로 저장하면 같은 내보내기 안에 "계획" 숫자가 둘(판정 사유의 P와 저장된 P) 생길 수 있다. 판정까지 저장값으로 옮기는 것은 GG1 골든을 바꾸는 별도 결정이다.
- **증량 판정이 `modeAdjust`를 보게 하기** — 판정 규칙 불변(GG1_GOLDEN).
- **기존 세션에 `modeAdjust`를 채우는 마이그레이션** — 옛 백업을 복원하면 어차피 필드 없는 세션이 다시 들어온다. 되짚기 경로가 필요하므로 마이그레이션은 이득이 없다.
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

| adjust | 문구 (08-26 기준) |
|---|---|
| known stored | `복귀 조정: 세트 −30% · 무게 −5% — 계획 22세트 → 15세트 생성 · 완료 15세트` |
| known derived (복귀) | `복귀 조정: 세트 −30% · 무게 −5% (공백 21일로 재계산) — 계획 22세트 → 15세트 생성 · 완료 15세트` |
| known derived (디로드) | `디로드 조정: 세트 −50% (재계산) — 계획 22세트 → 11세트 생성 · 완료 11세트` |
| known, `weightPct === 0` | `· 무게 …` 부분을 뺀다 (디로드는 늘 뺀다) |
| known, `setPct`·`weightPct` 모두 0 | `복귀 조정: 없음 — 계획 22세트 · 완료 15세트` |
| unknown | `복귀 조정: 기록 없음 — 계획 22세트 · 완료 15세트` |

- 퍼센트: 음수는 `−`(U+2212) + 절댓값, 양수는 `+`. 숫자 리터럴을 문구에 박지 않는다.
- `plan`이 `undefined`(대상 entry 없음)면 `— …` 뒤를 생략하고 조정 부분만 쓴다.

`entrySetLine(plan, mode)` — 종목 한 줄.

| 경우 | 문구 |
|---|---|
| `given === null` | `세트: 계획 2 · 완료 1` |
| `given === planned` | `세트: 계획 1 · 완료 1` |
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

- A그룹 `다음: … 유지 (반복 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션)`은 그대로 둔다. 같은 P를 말하므로 모순이 없고, 새 줄은 G(앱이 준 수)를 더한다.
- 문서 머리 캡션은 더하지 않는다. 줄 자체가 뜻을 말한다(v1112 테스트가 머리 4줄을 고정하고 있다).

예 — 08-26 리어델트 (JJ 이전 기록, 전체 내보내기):

```
## 2026-08-26 (수) — Day 1 Push [복귀]  [18:15–19:40, 85분]
복귀 조정: 세트 −30% · 무게 −5% (공백 21일로 재계산) — 계획 22세트 → 15세트 생성 · 완료 15세트
수행 순서: …

### 리어델트 (D1/B) 7.5kg
12
세트: 계획 2 → 복귀 조정 1 · 완료 1
보상작용: 없음
```

### 검증 (`v112.test.ts`, describe `JJ2`)

- **08-26 재현 (7종목, 저장값 없음, 21일 전 근력 세션 포함 `exportMarkdown`):** 헤더 다음 줄이 위 예와 같다 · 리어델트 블록이 `12` → `세트: 계획 2 → 복귀 조정 1 · 완료 1` → `보상작용: 없음` 순서 · 인클라인 `세트: 계획 4 → 복귀 조정 3 · 완료 3`.
- 같은 세션에 `modeAdjust {-30,-5}` → `(공백 21일로 재계산)` 없음.
- `sessionToMarkdown`에 `sessions` 없이(저장값 없음) → `복귀 조정: 기록 없음 — 계획 22세트 · 완료 15세트`, 종목 줄 `세트: 계획 2 · 완료 1`.
- 디로드(저장값 `{-50,0}`) → `디로드 조정: 세트 −50% — 계획 22세트 → 11세트 생성 · 완료 11세트`, `무게` 없음.
- 복귀 세션의 계획 1세트 종목 → `세트: 계획 1 · 완료 1`.
- 복귀에서 행을 더해 4/3 완료 → `세트: 계획 4 → 복귀 조정 3 · 완료 4`.
- 얹은 종목 → `세트:` 줄 없음, 세션 줄 합에 없음 · 대체 종목 → 원 종목 P로 줄이 나온다.
- 워밍업만 체크한 종목 → 본문에 없음(현행) · 세션 줄 합에는 P·G로 들어가고 D 0.
- skipped 종목 → 본문에 없음 · 세션 줄 `완료`만 줄어든다.
- **normal 불변 (골든):** JJ1 첫 커밋에서 normal 세션 픽스처 셋(전부 완료 · 한 행 미체크 · 행 하나 삭제)의 현행 `exportMarkdown` 전문을 `JJ_EXPORT_NORMAL_BEFORE`로 붙이고, 이후 출력이 문자 단위로 같다.
- **v111 ② 수정 (유일한 기존 테스트 수정):** `v111.test.ts`의 `after()`가 `복귀 조정:`·`세트:`로 시작하는 줄을 걸러낸다. 주석 `JJ2(PLAN-v1.12)가 더한 줄 — GG1의 diff 범위 확인은 그 줄을 뺀 나머지로 한다`. 단언 본문은 고치지 않는다. 같은 픽스처의 JJ 이후 전문은 `v112.test.ts`가 따로 고정한다.
- **소스 스캔:** `exportMarkdown.ts`에 `조정`·`생성` 문구 리터럴과 `Math.round(` 세트 수 계산이 없고 `sessionAdjustText`·`entrySetLine`·`resolveSessionAdjust`를 import한다 · `resolveSessionAdjust(` 호출이 `sessionToMarkdown` 안에 한 번 · `exportMarkdown`이 `sessionToMarkdown(`에 `sessions`를 넘긴다.

### 범위 제외

- **normal 세션의 `세트:` 줄** (완료 ≠ 계획일 때) — 사람이 정할 것 2.
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
   - JJ 이후 세션은 늘 저장값이 있다. 업데이트 전에 시작한 진행 중 복귀 세션만 `기록 없음`이 된다(드문 경계, 그대로 둔다).
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
- 조정 한 줄: 08-26 픽스처 + `modeAdjust {-30,-5}` → `복귀 조정: 세트 −30% · 무게 −5% — 계획 22세트 → 15세트 생성 · 완료 15세트` · normal → `undefined` · 같은 세션의 내보내기 헤더 다음 줄과 문자열이 같다.
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

JJ 이전 복귀 세션의 조정률은 **내보내기 때마다 공백으로 되짚는다**(`(공백 N일로 재계산)` 표시). 그 사이 이력·루틴이 바뀌면 값이 바뀌거나 `기록 없음`이 될 수 있다. JJ 이후 세션은 저장값이라 바뀌지 않는다.

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
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 테스트 안에 고정한 루틴(배포 `routine-v2.4.json`)·Phase·픽스처로 한정한다고 첫 줄에 적는다:
  ① `GG1_GOLDEN`·`JJ_BUILD_GOLDEN`·`JJ_EXPORT_NORMAL_BEFORE` 전 칸 일치 (골든 커밋 해시)
  ② v111 ② 수정 diff를 붙인다 — `after()` 필터 추가뿐
  ③ 08-26 픽스처의 v1.11.2 내보내기와 새 내보내기의 diff가 `복귀 조정:` 1줄 + `세트:` 7줄 추가뿐이다
  ④ 바뀌는 것: 위 "과거 판정 불변" 표의 다섯 자리
- 완료 후 `docs/DEV-RECORD-v1.12.md` (맨 위 "이 환경에서 확인된 제약"은 v1.11.2 목록을 이어받는다)
- `package.json` **1.12.0**은 기록 커밋에서 올린다

---

## 사람이 정할 것

1. **내보내기·종료 시트 문구** (JJ2 설계 1의 두 표)
   - A (추천): 표 그대로. 세션 줄 `복귀 조정: 세트 −30% · 무게 −5% — 계획 22세트 → 15세트 생성 · 완료 15세트`, 종목 줄 `세트: 계획 2 → 복귀 조정 1 · 완료 1`
   - B: 종목 줄을 분수형 `세트: 1/1 (계획 2, 복귀 조정)` — 짧지만 1/1이 "다 했다"로 먼저 읽혀 이번 오독을 되풀이할 수 있다
2. **normal 세션에도 `세트:` 줄을 붙일까** (완료 ≠ 계획일 때, 예: 행 하나를 지우고 3/4)
   - A (추천): 붙이지 않는다. 정상 세션은 앱이 늘 계획대로 만들어 "앱이 줄였나"라는 질문이 없고, 정상 세션 내보내기가 글자 하나 안 바뀐다
   - B: 붙인다. 계획 대비 이탈이 모든 세션에서 보이지만, 과거 정상 세션 내보내기 다수가 바뀐다
3. **JJ 이전 복귀 세션(08-26 포함)의 조정률**
   - A (추천): 공백으로 되짚고 `(공백 21일로 재계산)`을 붙인다. 보고서 0절이 확인했듯 지금 이력에서는 정확히 맞고, 되짚은 값임을 문서가 말한다
   - B: 되짚지 않고 `복귀 조정: 기록 없음`. 단순하지만 08-26 리어델트가 여전히 "앱이 몇 세트를 줬나"를 말하지 못한다

---

## 검토 반영 기록

(검토 전)
