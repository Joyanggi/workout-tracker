# PLAN v1.11 — "유지"의 이유 (GG1) + 복귀·디로드 세션의 증량 판정 표시 (GG2)

> 작성: Opus 5.5 (설계자), 2026-11-03. 대상 코드: v1.10.0 (`2249b85`).
> 근거: `docs/FIELD-REPORT-2026-08-27.md` 2·5절 (8절 우선순위 1위).
> 수정: 2026-11-04, 검토(Codex·Antigravity)와 사람의 답 반영 — 끝의 "검토 반영 기록".
>
> **성격**: 새 규칙 없음. **같은 입력**(같은 세션 기록·루틴 정의·Phase·무게 단위)에서 증량 판정
> (더블 프로그레션)의 up/hold 결과는 한 건도 바뀌지 않는다.
> 판정이 이미 알고 있는 **보류 사유**를 판정 함수가 돌려주게 하고, 화면·내보내기가 그 값을 쓴다.
>
> **보장 범위**: 판정은 지금도 앞으로도 과거 세션을 **현재** 루틴 정의(계획 세트·반복 상단)와 Phase로
> 다시 계산한다. 사람이 루틴·Phase를 바꾸거나 과거 세션을 편집하면 과거 기록의 표시가 바뀔 수 있다.
> 이것은 현행 동작이고 이번에 바꾸지 않는다. "불변"은 고정한 설정·픽스처 위에서만 주장한다.

---

## GG1. 보류 사유를 판정 함수가 돌려준다

### 진단

| 사실 | 근거 |
|---|---|
| 같은 규칙이 두 곳에 따로 구현돼 있다 (주석이 "동일 규칙"이라고만 약속) | `progression.ts:41-56` `progressionSuggestions` · `prefill.ts:218-224` `computeProgression` |
| 두 곳 모두 조건을 만나면 `[]`/`undefined`로 빠진다 — 어느 조건에서 빠졌는지가 버려진다 | 같은 줄 |
| 내보내기는 사유를 스택 최대일 때만 적고, 나머지는 `다음: Xkg 유지` 한 줄이다 | `exportMarkdown.ts:185-193` |
| 화면(요약·세션 카드)은 증량일 때만 말하고 유지일 때는 아무 말도 하지 않는다 | `SummaryScreen.tsx:194-209` · `ExerciseCard.tsx:390-394` |
| 2026-08-26 재현: 인클라인 4세트 계획 → 복귀 3세트 10/10/10 (상단 10) · 체스트·숄더 3세트 계획 → 2세트 12/12 (상단 12) → 셋 다 `sets.length < routineExercise.sets`에서 빠짐 | `progression.ts:55` · `sessionFactory.ts:93` (4×0.7→3, 3×0.7→2) |

### 설계

**1. 판정 초크포인트 `judgeProgression`** — `src/lib/progression.ts`

```ts
export type HoldReason =
  | { kind: 'phase0' }                                         // Phase 0 + allowProgressionInPhase0=false
  | { kind: 'compensation' }                                   // 보상작용 있음
  | { kind: 'reps'; reached: number; total: number; repMax: number } // 상단 도달 세트 수 / 수행 세트 수
  | { kind: 'sets'; done: number; planned: number; mode: SessionMode } // 전 세트 상단, 세트 부족

export type ProgressionVerdict =
  | { kind: 'up'; from: number; to: number | null }   // to=null → 스택 최대 (현행 의미 그대로)
  | { kind: 'hold'; from: number; reason: HoldReason }

export function judgeProgression(args: {
  routine: RoutineTemplate
  routineExercise: RoutineExercise
  phase: Phase
  sets: SetRef[]            // doneSets 결과 (워밍업 제외)
  compensation?: string     // 없으면 NO_COMPENSATION
  mode?: SessionMode        // 기본 'normal'. 사유 문구에만 쓰고 판정에는 쓰지 않는다
  scale?: WeightScale       // 없으면 { step: routine.rules.weightIncrementKg }
}): ProgressionVerdict | undefined   // undefined = 판정 대상 아님
```

판정 순서 (위에서 처음 걸리는 것이 사유):

| 순서 | 조건 | 결과 |
|---|---|---|
| 0 | `group !== 'A'` 또는 `sets.length === 0` | `undefined` |
| 1 | `phase === 0 && !allowProgressionInPhase0` | hold `phase0` |
| 2 | `compensation !== NO_COMPENSATION` | hold `compensation` |
| 3 | 상단 미달 세트가 하나라도 있음 | hold `reps` |
| 4 | `sets.length < routineExercise.sets` | hold `sets` |
| 5 | 그 외 | up (`nextWeightForProgression`) |

- `SetRef`는 `import type { SetRef } from './prefill'`로 가져온다. 이번에 `prefill.ts`가 `progression.ts`의
  `judgeProgression`을 값으로 import하게 되므로, 반대 방향을 값 import로 쓰면 런타임 순환이 생긴다.
  (`SetRef`를 `types.ts`로 옮기지는 않는다 — 타입 전용 import로 충분하고 변경 범위가 작다.)
- `from`은 현행 그대로 `Math.max(...sets.map(s => s.weight))` (어시스트 포함 현행 유지).
- **현행은 4(세트)를 3(반복)보다 먼저 본다. 이번에 순서를 바꾼다.** 조건이 전부 AND라서
  up/hold 결과는 같고 사유만 달라진다. 반복이 모자라면 세트를 채워도 증량이 안 되므로
  "세트 부족"이라고 말하면 틀린 처방이 된다(보고서 ①·② 구분의 핵심).
- 보상작용을 반복보다 먼저 보는 이유: 자세가 무너진 세션은 반복 수와 상관없이 무게를 다시 봐야 한다.

**2. 기존 두 함수는 `judgeProgression`을 감싸기만 한다 (규칙 복제 제거)**

| 함수 | 변경 |
|---|---|
| `progressionSuggestions(session, …)` | 시그니처·반환 불변. 내부에서 entry마다 `judgeProgression({ …, mode: session.mode })`를 부르고 `up`만 남긴다 |
| `progressionVerdicts(session, routine, phase, scales?, catalog?)` **신설** | `Map<recordKey, ProgressionVerdict>`. 내보내기·요약이 쓴다 |
| `computeProgression(args)` (prefill.ts) | 시그니처·반환 불변(기존 테스트 유지). `judgeProgression`을 부르고 `up`이면 `{from,to}`, 아니면 `undefined` |
| `buildPrefill` | `RecordPrefill.lastVerdict?: ProgressionVerdict` 추가 (직전 세션 `history[0].mode`를 넘긴다). `progression`은 `lastVerdict`에서 파생해 그대로 둔다 (`defaultSetFor`·칩이 읽는다) |

**3. 사유 문구 `holdReasonText(reason)`** — `progression.ts`, 문구는 여기 한 곳에만 둔다

| reason | 문구 |
|---|---|
| `phase0` | `Phase 0 — 증량 판정 꺼짐` |
| `compensation` | `보상작용 있음` |
| `reps` | `반복 상단(10회) 미달 — 3세트 중 1세트 도달` |
| `sets`, normal | `반복 상단 도달 · 계획 4세트 중 3세트` |
| `sets`, return | `반복 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션` |
| `sets`, deload | `반복 상단 도달 · 계획 4세트 중 3세트 · 디로드 세션` |

**4. 표시 위치**

| 위치 | 변경 |
|---|---|
| 내보내기 `entryLine` | `nextWeights` 맵 대신 `progressionVerdicts`를 받는다. hold → `다음: 30kg 유지 (<holdReasonText>)` — 같은 줄 괄호(사람 결정, 별도 줄로 나누지 않는다). up은 현행 두 문구(`Xkg로 증량` / `유지 (증량 조건 충족 — 스택 최대)`) 그대로 |
| 요약 화면 카드 | "다음 세션 증량 제안" 카드를 **"다음 세션 무게 (A그룹)"** 한 카드로 바꾼다(사람 결정). A그룹 판정이 하나라도 있으면 보인다. up 행: 현행 그대로(row-sub `모든 세트 상단 도달 · 보상작용 없음`, accent 색 `formatProgression`). hold 행: row-sub = `holdReasonText`, row-meta = `30kg 유지`(기본 색). 순서는 수행 순서 |
| 세션 카드 (다음 세션) | `prefill.lastVerdict`가 hold `sets`일 때만 칩: `지난번 상단 도달 · 계획 4세트 중 3세트 완료[ · 복귀 세션] — 오늘 4세트 모두 완료하면 증량 판정`. 숫자는 판정과 같은 완료 작업 세트(`doneSets`) 수다. 순수 함수 `lastHoldChipText(verdict)` (progression.ts)가 문구를 만들고 그 외 사유에는 `undefined`를 돌려준다. 정상 세션 + `showPrefillHints`일 때만 보인다 |
| 홈 배지 | 변경 없음 (증량 대상만 다룬다) |

세션 카드에 `reps`·`compensation` 사유를 띄우지 않는 이유: 감량기에는 반복 미달이 거의 매 세션
나온다(DESIGN §7 "증량 조건이 감량기에 거의 충족되지 않는다"). 늘 켜진 칩은 아무도 안 본다.
보상작용은 이미 T11 칩이 있다. `sets`는 드물고, 다음에 할 일이 분명하다.

### 검증 (`src/lib/v111.test.ts`, describe `GG1`)

- 사유 우선순위: 보상작용+반복 미달+세트 부족 → `compensation` · 반복 미달+세트 부족 → `reps` · 전 세트 상단+세트 부족 → `sets` · 전부 충족 → `up`.
- **판정 불변 (전수, 골든 비교):** 격자 = 보상작용{없음,있음} × 세트 수{1..planned+1} × 상단 도달 패턴{전부, 하나 미달, 전부 미달} × mode{normal,deload,return} × 종목{일반, 어시스트}. 루틴·Phase·무게 단위는 테스트 안에 고정한다.
  - 기대값은 **새 조건식으로 다시 계산하지 않는다.** GG1의 첫 커밋(리팩터링 전, v1.10.0 코드)에서 이 격자를 현행 `progressionSuggestions`·`computeProgression`에 돌린 결과(칸마다 up 여부·`to`)를 테스트 파일 안의 상수 표 `GG1_GOLDEN`으로 붙여 넣고 커밋한다.
  - 리팩터링 뒤 같은 격자의 `judgeProgression`·두 래퍼 결과를 `GG1_GOLDEN`과 칸 단위로 비교한다. `GG1_GOLDEN`은 이후 커밋에서 고치지 않는다(DEV-RECORD에 첫 커밋 해시를 적는다).
- 필드리포트 재현: 인클라인 30kg 10/10/10, 계획 4, mode return → `sets {done:3, planned:4, mode:'return'}`, 문구 `반복 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션`. 체스트프레스 25kg 12/12, 계획 3 → `계획 3세트 중 2세트`.
- 디로드: 같은 입력, mode deload → `· 디로드 세션`.
- 반복 미달 문구: 10/8/7, repMax 10 → `반복 상단(10회) 미달 — 3세트 중 1세트 도달`.
- Phase 0 꺼진 루틴 사본 → `phase0` (배포 루틴은 `allowProgressionInPhase0: true`라서 나오지 않는다는 것도 확인).
- 대체 종목: 대체 entry는 원 종목의 `sets`·`repMax`로 판정한다.
- 어시스트(inverse): hold 사유는 같다. 스택 최대 up은 `formatProgression`의 "보조 없이" 그대로.
- 얹은 종목(`extra`): 판정이 현행 `progressionSuggestions`와 같다.
- 워밍업: 워밍업 세트는 `done`·`total`·`planned` 비교 어디에도 세지 않는다.
- 스택 최대: up `to:null` → 내보내기 줄이 현행 문자열과 같다.
- `computeProgression`·`progressionSuggestions`의 기존 테스트는 고치지 않고 통과한다.
- prefill: 복귀 세션(3/4, 전부 상단) 다음 날 `buildPrefill` → `lastVerdict` = hold `sets`/return, `progression` undefined, `lastHoldChipText` = `지난번 상단 도달 · 계획 4세트 중 3세트 완료 · 복귀 세션 — 오늘 4세트 모두 완료하면 증량 판정`. 그 다음 정상 세션 4/4 완료·전부 상단 → `progression` up.
- prefill, 미체크 행: 복귀 세션에 4행이 있으나 3행만 체크(전부 상단) → `lastVerdict` = hold `sets {done:3}`, 칩 숫자 `3세트 완료`(행 수 4가 아니다).
- `lastHoldChipText`: `reps`·`compensation`·`phase0`·up·undefined → `undefined`.
- 내보내기: 사유 4종의 `다음:` 줄 · B그룹은 `다음:` 줄 없음(현행).
- **소스 스캔 (초크포인트):** `routineExercise.sets`와 `.length <`를 비교하는 증량 판정이 `progression.ts` 밖(`prefill.ts`, `exportMarkdown.ts`, `SummaryScreen.tsx`)에 없다 · `SummaryScreen.tsx`·`exportMarkdown.ts`가 `holdReasonText`를 import하고 `세트 중`·`반복 상단` 문구 리터럴이 없다 · `ExerciseCard.tsx`의 hold 칩이 `lastHoldChipText`를 거친다.

### 범위 제외

- 세션에 계획 세트 수 저장 — 보고서 4절 몫이다. GG의 "계획 N세트"는 판정과 같은 루틴 정의값(`routineExercise.sets`)이다.
- 홈 배지에 유지 사유 표시 — 배지는 "증량 대상이 있다"는 신호이고, 사유는 요약·내보내기에서 충분하다.
- 과거 세션 판정을 당시 설정으로 고정 — 루틴·Phase 변경이나 과거 세션 편집 뒤 과거 표시가 바뀌는 것은 현행 동작이다(머리말 "보장 범위"). 고정하려면 세션에 계획값을 저장해야 하고 이는 보고서 4절 몫이다.
- `lastHoldChipText`의 `· 복귀 세션`/`· 디로드 세션` 접미사는 직전 세션 기록의 `mode`에서만 나온다. 직전 이력이 아닌 더 이전 세션의 모드는 되짚지 않는다.
- 사유 여러 개를 함께 표시 — 처음 걸리는 하나가 다음 할 일을 정한다. 둘을 나열하면 ①·② 구분이 다시 흐려진다.

---

## GG2. 복귀·디로드 세션이 증량 판정에서 빠진다는 사실을 그 자리에서 말한다

### 진단 — 보고서 5절의 전제 하나가 코드와 다르다

| 보고서 | 실제 코드 |
|---|---|
| "복귀 램프업이 끝날 때까지 계속 유지" · "복귀 2주차" 표시 제안 | **복귀 모드는 세션 하나에만 걸린다.** `returnStep`은 공백 14일 이상일 때만 나오고(`suggestNextDay.ts:120-127`), 세션 생성은 그 값이 있을 때만 `mode:'return'`이다(`HomeScreen.tsx:153-162`). 복귀 세션 다음 날은 공백 1~2일 → 정상 세션 |
| "`rampWeeks`가 언제 정상으로 돌아오는지 데이터에 이미 있다" | `rampWeeks`를 읽는 곳은 배너 라벨 **한 곳뿐**이다(`HomeScreen.tsx:262` `N주간 램프업`). 램프업은 구현돼 있지 않다 |
| 증량이 구조적으로 나올 수 없다 | 맞다. 다만 기간은 "복귀 세션 + 그 종목의 다음 세션 하나"다. 다음 세션의 칩은 복귀 세션 기록(세트 부족)을 보고 빠지고, 그 세션에서 계획 세트를 모두 완료(체크)하면 그다음부터 판정이 돌아온다 |
| 화면이 칩을 숨긴다 (판단은 맞다) | 맞다 (`SessionScreen.tsx:262` `showProgression={session.mode === 'normal'}`). 숨긴 자리에 아무 말도 없다 |

그래서 "복귀 N주차"는 **존재하지 않는 상태를 표시하는 것**이 된다. GG2는 실제로 있는 사실만 말한다:
① 이 세션은 완료 세트가 계획보다 적어서 증량 판정에서 빠진다, ② 계획 세트를 모두 완료한 세션에서 판정이 돌아온다(GG1 칩), ③ 배너가 램프업을 약속하지 않는다.

### 설계

1. **세션 카드 칩 — 복귀·디로드 세션 안에서** (`progression.ts`)
   ```ts
   export function modeSetNotice(
     mode: SessionMode, routineExercise: RoutineExercise, entry: SessionEntry,
   ): string | undefined
   ```
   - 조건: `mode !== 'normal'` · `group === 'A'` · **완료 작업 세트 수 `doneSets(entry).length` `< routineExercise.sets`**.
     세는 기준은 GG1 판정(`judgeProgression`의 `sets` = `doneSets` 결과)과 같다. 행 수를 세지 않는다.
   - 문구: `복귀 세션 · 계획 4세트 중 3세트 완료 — 증량 판정은 계획 세트를 모두 완료한 세션에서` (디로드는 `디로드 세션 · …`).
     숫자는 세션 중에 체크할 때마다 바뀐다(시작 직후 `0세트 완료`). 지금까지 완료한 수를 말하는 칩이다.
   - 칩이 사라지는 때 = 완료 세트가 계획 수에 도달한 때 = GG1 순서 4를 통과하는 때. 행만 추가하고 체크하지 않으면 칩은 남고 판정도 여전히 세트 부족이다. 문구와 판정이 같은 수를 본다.
   - 문구는 세트를 추가하라고 하지 않는다. 복귀 프로토콜에 어긋나는 행동을 앱이 권하지 않는다.
2. **`ExerciseCard`의 `showProgression: boolean`을 `sessionMode: SessionMode`(기본 `'normal'`)로 바꾼다.**
   같은 사실(모드)을 prop 두 개로 받지 않는다. 카드 안에서 증량 칩은 `sessionMode === 'normal'`일 때, `modeSetNotice` 칩은 그 외일 때 보이고, 둘 다 `showPrefillHints`를 거친다.
   `SessionScreen`은 `sessionMode={session.mode}`를 넘긴다. `SessionDetailScreen`(편집)은 넘기지 않는다(`showPrefillHints={false}`라서 어차피 숨는다).
3. **다음 정상 세션** — GG1의 `lastHoldChipText` 칩이 맡는다 (`· 복귀 세션` 접미사 포함). 추가 작업 없음.
4. **복귀 배너 램프업 라벨** — `HomeScreen.tsx:262` `<small>{rampWeeks}주간 램프업</small>`을
   `<small>복귀 조정은 이번 세션에만 적용</small>`로 바꾼다 (사람 결정).
   다음 세션의 세트 수는 말하지 않는다. 보장되는 것은 "다음 세션은 정상 모드"뿐이고(`HomeScreen.tsx:153-162`),
   그 세션이 몇 세트로 만들어지는지는 배너가 단정할 사실이 아니다(`sessionFactory.ts:93`).
   `rampWeeks` 데이터와 `validateRoutine`은 건드리지 않는다.

### 검증 (`v111.test.ts`, describe `GG2`)

- `modeSetNotice`: return 3행 전부 완료/계획 4 → `복귀 세션 · 계획 4세트 중 3세트 완료 — 증량 판정은 계획 세트를 모두 완료한 세션에서` · deload 2행 완료/계획 4 → `디로드 세션 · 계획 4세트 중 2세트 완료 — …` · normal → undefined · B그룹 → undefined · 완료 수 = 계획(계획 1세트 종목의 복귀 `max(1, …)` 경우, 1행 완료) → undefined · 워밍업 행은 체크돼도 세지 않는다.
- **완료 vs 행 (판정과 같은 수):** 각 경우에 `modeSetNotice`의 표시 여부와 `judgeProgression`의 hold `sets` 여부가 같다는 것을 한 테스트에서 함께 확인한다(전 세트 상단 가정).
  - 3행, 체크 0 → 칩 `0세트 완료` · 판정 `undefined`(완료 세트 없음 — 판정 대상 아님. 칩은 뜬다는 것만 확인)
  - 3행, 체크 3 → 칩 `3세트 완료` · hold `sets {done:3}`
  - 행 추가로 4행, 체크 3 → 칩 `3세트 완료`(사라지지 않음) · 여전히 hold `sets {done:3}`
  - 4행, 체크 4 → 칩 undefined · `up`
- 대체 종목: 대체 entry도 원 종목의 계획 세트로 비교한다(`routineExerciseOfEntry` 결과를 넘긴다는 것을 스캔으로 확인).
- **복귀는 세션 하나 (사실 고정):** 복귀 세션 다음 날 `suggestNextDay` → `returnStep` undefined. 배너 문구가 이 사실 위에 서 있으므로 이 테스트가 깨지면 문구도 다시 봐야 한다는 주석을 단다.
- 경계 — 계획 세트가 줄지 않은 복귀 세션(계획 1세트)에서 전 세트 상단이면 `up`이 나온다(현행 그대로, 판정에 mode가 끼지 않는다는 확인).
- 디로드 다음 정상 세션: 디로드 2/4 완료·전부 상단 → 다음 세션 `lastHoldChipText`에 `· 디로드 세션`.
- 소스 스캔: `ExerciseCard.tsx`에 `showProgression` 없음 · `SessionScreen.tsx`가 `sessionMode={session.mode}`를 넘김 · 카드가 `modeSetNotice`를 거침 · `modeSetNotice` 본문이 `doneSets(`를 쓰고 `!s.warmup).length` 같은 행 수 세기가 없음 · `HomeScreen.tsx`에 `주간 램프업`·`다음 세션부터` 없음, `이번 세션에만 적용` 있음.

### 범위 제외

- **램프업 구현** (복귀 후 N주 동안 세트를 단계적으로 회복): 새 규칙이다. DESIGN §7은 "1주 램프"라는 이름만 있고 곡선(주차별 세트 %)이 정의돼 있지 않다. 정의는 문서 쪽 결정이 먼저다 (다음 라운드 후보).
- B그룹·코어의 줄어든 세트 표시: 증량 판정과 무관하고 보고서 4절(계획 세트 보존) 몫이다.
- 세션 상단의 복귀 상태 한 줄 (`무게 −5% · 세트 −30%`): 세션에 `returnStep`이 저장되지 않는다. 되짚으려면 공백 재계산이 필요하고(보고서 4절이 지적한 "파생이 불안정한" 경우) 그 결정은 4절 설계와 함께 한다. 이번에는 카드별 "계획 N세트 중 M세트"로 같은 정보를 준다.

---

## 구현 순서와 검증

**GG1 → GG2.** GG2의 카드 칩 배선과 다음 세션 칩이 GG1의 `lastVerdict`·`judgeProgression`에 기대어 있다.
커밋은 작업당 하나 이상, GG1·GG2를 한 커밋에 섞지 않는다.

관례:
- `npm run build` (타입 확인 포함, `tsc` 직접 호출 금지) · 관련 테스트만 돌리다가 마지막에 `npm test` 한 번
- 커밋 개수는 실행 출력을 복사한다 (`git log --oneline main..HEAD`)
- 커밋 메시지는 `git commit -F - <<'MSG'`
- **GG1 첫 커밋은 골든 표만 담는다:** 리팩터링 전 코드로 `GG1_GOLDEN`(GG1 검증 "판정 불변")을 만들어 커밋한 뒤 리팩터링을 시작한다. 같은 커밋에서 2026-08-26 픽스처의 **현행** 내보내기 문자열도 `GG1_EXPORT_BEFORE`로 붙여 넣는다(아래 ②의 비교 기준).
- **새 스캔 결함 복원 확인:** GG1·GG2의 소스 스캔마다 결함을 일부러 되살려(`cp` 백업 뒤) 스캔이 실패하는 것을 보고 되돌린다. 최소: prefill.ts에 `lastSets.length < routineExercise.sets` 복제 · Summary에 사유 문구 리터럴 · `showProgression` prop 복원 · `modeSetNotice`를 행 수 세기로 되돌림 · `주간 램프업` 복원
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 **테스트 안에 고정한 루틴(배포 `routine-v2.4.json`)·Phase·무게 단위와 픽스처**로 한정한다고 절 첫 줄에 적는다. 사용자가 루틴·Phase를 바꾼 뒤의 과거 표시는 보장하지 않는다(머리말 "보장 범위"):
  ① 격자 전 칸이 `GG1_GOLDEN`과 같다(골든 커밋 해시 명시)
  ② 2026-08-26 세션 픽스처(보고서 0·2절의 숫자로 재구성, 테스트 파일에 둔다)의 새 내보내기와 `GG1_EXPORT_BEFORE`의 diff가 A그룹 `다음: … 유지` 세 줄뿐이고 괄호 안 사유만 늘었다
  ③ 같은 픽스처에서 홈 배지·요약 증량 행·프리필 무게(`defaultSetFor`)가 같다
- 완료 후 `docs/DEV-RECORD-v1.11.md` (맨 위 "이 환경에서 확인된 제약"은 v1.10 목록을 이어받는다)
- `package.json` **1.11.0**은 GG2까지 끝난 마지막 커밋에서 올린다

---

## 사람이 정할 것

없음. 1차 설계의 4건은 사람의 답(2026-11-04)으로 정해져 본문에 들어갔다 — 아래 기록 참조.

---

## 검토 반영 기록 (2026-11-04)

검토: `.reports/plan-v1.11-codex.md`(수정 필요), `.reports/plan-v1.11-antigravity.md`(그대로 진행 가능).

| 지적 | 반영 위치 |
|---|---|
| Codex 1 — GG2 칩이 행 수를, 판정이 완료 세트를 센다 | GG2 설계 1(`doneSets` 기준) · GG1 다음 세션 칩 문구 · GG2 검증 "완료 vs 행" · prefill 미체크 행 검증 · 결함 복원 목록 |
| Codex 2 — 배너가 다음 세션 세트 수를 단정한다 | GG2 설계 4 `복귀 조정은 이번 세션에만 적용` · 스캔에 `다음 세션부터` 없음 |
| Codex 3 — 불변 보장 범위 · 전수 테스트 기준이 새 조건식 복제 | 머리말 "보장 범위" · GG1 범위 제외 · GG1 검증 `GG1_GOLDEN` · 구현 순서 "첫 커밋은 골든 표" · 과거 판정 불변 절 범위 한정 |
| Codex 항목 2 — `lastHoldChipText` 모드 접미사는 직전 이력에만 의존 | GG1 범위 제외에 명시 |
| Antigravity 경미 — `SetRef` 순환 import | GG1 설계 1 `import type` |

| 사람이 정할 것 | 답 | 반영 |
|---|---|---|
| 1. 복귀 배너 램프업 라벨 | A. 단 "이번 세션에만 적용"만, 다음 세션 세트 수는 단정하지 않음 | GG2 설계 4 |
| 2. 요약 화면 카드 구성 | A. 한 카드 "다음 세션 무게 (A그룹)" | GG1 설계 4 |
| 3. 문구 | `holdReasonText` 표 그대로. 칩 두 개는 완료 세트 기준으로 | GG1 설계 4 · GG2 설계 1 |
| 4. 과거 내보내기와 달라지는 점 | A. 같은 줄 괄호로 사유 | GG1 설계 4 |

반영하지 않은 지적: 없음. (Antigravity의 `SetRef`를 `types.ts`로 옮기는 대안은 `import type`으로 같은 효과를 얻어 택하지 않았다 — GG1 설계 1.)
