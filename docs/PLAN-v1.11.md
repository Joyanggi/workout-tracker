# PLAN v1.11 — "유지"의 이유 (GG1) + 복귀·디로드 세션의 증량 판정 표시 (GG2)

> 작성: Opus 5.5 (설계자), 2026-11-03. 대상 코드: v1.10.0 (`2249b85`).
> 근거: `docs/FIELD-REPORT-2026-08-27.md` 2·5절 (8절 우선순위 1위).
>
> **성격**: 새 규칙 없음. 증량 판정(더블 프로그레션)의 결과는 한 건도 바뀌지 않는다.
> 판정이 이미 알고 있는 **보류 사유**를 판정 함수가 돌려주게 하고, 화면·내보내기가 그 값을 쓴다.

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
| 내보내기 `entryLine` | `nextWeights` 맵 대신 `progressionVerdicts`를 받는다. hold → `다음: 30kg 유지 (<holdReasonText>)`. up은 현행 두 문구(`Xkg로 증량` / `유지 (증량 조건 충족 — 스택 최대)`) 그대로 |
| 요약 화면 카드 | "다음 세션 증량 제안" 카드를 **"다음 세션 무게 (A그룹)"** 카드로 바꾼다. A그룹 판정이 하나라도 있으면 보인다. up 행: 현행 그대로(row-sub `모든 세트 상단 도달 · 보상작용 없음`, accent 색 `formatProgression`). hold 행: row-sub = `holdReasonText`, row-meta = `30kg 유지`(기본 색). 순서는 수행 순서 |
| 세션 카드 (다음 세션) | `prefill.lastVerdict`가 hold `sets`일 때만 칩: `지난번 상단 도달 · 계획 4세트 중 3세트[ · 복귀 세션] — 오늘 4세트 채우면 증량 판정`. 순수 함수 `lastHoldChipText(verdict)` (progression.ts)가 문구를 만들고 그 외 사유에는 `undefined`를 돌려준다. 정상 세션 + `showPrefillHints`일 때만 보인다 |
| 홈 배지 | 변경 없음 (증량 대상만 다룬다) |

세션 카드에 `reps`·`compensation` 사유를 띄우지 않는 이유: 감량기에는 반복 미달이 거의 매 세션
나온다(DESIGN §7 "증량 조건이 감량기에 거의 충족되지 않는다"). 늘 켜진 칩은 아무도 안 본다.
보상작용은 이미 T11 칩이 있다. `sets`는 드물고, 다음에 할 일이 분명하다.

### 검증 (`src/lib/v111.test.ts`, describe `GG1`)

- 사유 우선순위: 보상작용+반복 미달+세트 부족 → `compensation` · 반복 미달+세트 부족 → `reps` · 전 세트 상단+세트 부족 → `sets` · 전부 충족 → `up`.
- **판정 불변 (전수):** 보상작용{없음,있음} × 세트 수{1..planned+1} × 상단 도달 패턴{전부, 하나 미달, 전부 미달} × mode{normal,deload,return}의 모든 조합에서 `judgeProgression(...).kind === 'up'` ⇔ 테스트에 손으로 적은 현행 조건식.
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
- prefill: 복귀 세션(3/4, 전부 상단) 다음 날 `buildPrefill` → `lastVerdict` = hold `sets`/return, `progression` undefined, `lastHoldChipText` = `지난번 상단 도달 · 계획 4세트 중 3세트 · 복귀 세션 — 오늘 4세트 채우면 증량 판정`. 그 다음 정상 세션 4/4 전부 상단 → `progression` up.
- `lastHoldChipText`: `reps`·`compensation`·`phase0`·up·undefined → `undefined`.
- 내보내기: 사유 4종의 `다음:` 줄 · B그룹은 `다음:` 줄 없음(현행).
- **소스 스캔 (초크포인트):** `routineExercise.sets`와 `.length <`를 비교하는 증량 판정이 `progression.ts` 밖(`prefill.ts`, `exportMarkdown.ts`, `SummaryScreen.tsx`)에 없다 · `SummaryScreen.tsx`·`exportMarkdown.ts`가 `holdReasonText`를 import하고 `세트 중`·`반복 상단` 문구 리터럴이 없다 · `ExerciseCard.tsx`의 hold 칩이 `lastHoldChipText`를 거친다.

### 범위 제외

- 세션에 계획 세트 수 저장 — 보고서 4절 몫이다. GG의 "계획 N세트"는 판정과 같은 루틴 정의값(`routineExercise.sets`)이다.
- 홈 배지에 유지 사유 표시 — 배지는 "증량 대상이 있다"는 신호이고, 사유는 요약·내보내기에서 충분하다.
- 사유 여러 개를 함께 표시 — 처음 걸리는 하나가 다음 할 일을 정한다. 둘을 나열하면 ①·② 구분이 다시 흐려진다.

---

## GG2. 복귀·디로드 세션이 증량 판정에서 빠진다는 사실을 그 자리에서 말한다

### 진단 — 보고서 5절의 전제 하나가 코드와 다르다

| 보고서 | 실제 코드 |
|---|---|
| "복귀 램프업이 끝날 때까지 계속 유지" · "복귀 2주차" 표시 제안 | **복귀 모드는 세션 하나에만 걸린다.** `returnStep`은 공백 14일 이상일 때만 나오고(`suggestNextDay.ts:120-127`), 세션 생성은 그 값이 있을 때만 `mode:'return'`이다(`HomeScreen.tsx:153-162`). 복귀 세션 다음 날은 공백 1~2일 → 정상 세션 |
| "`rampWeeks`가 언제 정상으로 돌아오는지 데이터에 이미 있다" | `rampWeeks`를 읽는 곳은 배너 라벨 **한 곳뿐**이다(`HomeScreen.tsx:262` `N주간 램프업`). 램프업은 구현돼 있지 않다 |
| 증량이 구조적으로 나올 수 없다 | 맞다. 다만 기간은 "복귀 세션 + 그 종목의 다음 세션 하나"다. 다음 세션의 칩은 복귀 세션 기록(세트 부족)을 보고 빠지고, 그 세션을 계획 세트로 채우면 그다음부터 판정이 돌아온다 |
| 화면이 칩을 숨긴다 (판단은 맞다) | 맞다 (`SessionScreen.tsx:262` `showProgression={session.mode === 'normal'}`). 숨긴 자리에 아무 말도 없다 |

그래서 "복귀 N주차"는 **존재하지 않는 상태를 표시하는 것**이 된다. GG2는 실제로 있는 사실만 말한다:
① 이 세션은 세트가 줄어서 증량 판정에서 빠진다, ② 다음 정상 세션에서 계획 세트를 채우면 판정이 돌아온다(GG1 칩), ③ 배너가 램프업을 약속하지 않는다.

### 설계

1. **세션 카드 칩 — 복귀·디로드 세션 안에서** (`progression.ts`)
   ```ts
   export function modeSetNotice(
     mode: SessionMode, routineExercise: RoutineExercise, entry: SessionEntry,
   ): string | undefined
   ```
   - 조건: `mode !== 'normal'` · `group === 'A'` · 작업 세트 행 수(`entry.sets.filter(s => !s.warmup).length`) `< routineExercise.sets`.
   - 문구: `복귀 세션 · 계획 4세트 중 3세트 — 증량 판정은 계획 세트를 채운 세션에서` (디로드는 `디로드 세션 · …`).
   - 행 수는 **체크 여부가 아니라 행 수**로 센다. 이 세션이 몇 세트를 내줬는지를 말하는 칩이다. 사용자가 행을 추가해 계획 세트를 채우면 칩이 사라진다. 그 경우 판정도 실제로 돌아오므로(GG1 순서 4 통과) 문구와 사실이 같다.
   - 문구는 세트를 추가하라고 하지 않는다. 복귀 프로토콜에 어긋나는 행동을 앱이 권하지 않는다.
2. **`ExerciseCard`의 `showProgression: boolean`을 `sessionMode: SessionMode`(기본 `'normal'`)로 바꾼다.**
   같은 사실(모드)을 prop 두 개로 받지 않는다. 카드 안에서 증량 칩은 `sessionMode === 'normal'`일 때, `modeSetNotice` 칩은 그 외일 때 보이고, 둘 다 `showPrefillHints`를 거친다.
   `SessionScreen`은 `sessionMode={session.mode}`를 넘긴다. `SessionDetailScreen`(편집)은 넘기지 않는다(`showPrefillHints={false}`라서 어차피 숨는다).
3. **다음 정상 세션** — GG1의 `lastHoldChipText` 칩이 맡는다 (`· 복귀 세션` 접미사 포함). 추가 작업 없음.
4. **복귀 배너 램프업 라벨** — `HomeScreen.tsx:262` `<small>{rampWeeks}주간 램프업</small>`을
   `<small>이번 세션에만 적용 — 다음 세션부터 계획 세트</small>`로 바꾼다 (사람이 정할 것 1, 추천안 기준).
   `rampWeeks` 데이터와 `validateRoutine`은 건드리지 않는다.

### 검증 (`v111.test.ts`, describe `GG2`)

- `modeSetNotice`: return 3행/계획 4 → `복귀 세션 · 계획 4세트 중 3세트 — 증량 판정은 계획 세트를 채운 세션에서` · deload 2행/계획 4 → `디로드 세션 · …` · normal → undefined · B그룹 → undefined · 행 수 = 계획(계획 1세트 종목의 복귀 `max(1, …)` 경우) → undefined · 워밍업 행은 세지 않는다 · 사용자가 행을 추가해 계획에 도달 → undefined.
- 대체 종목: 대체 entry도 원 종목의 계획 세트로 비교한다(`routineExerciseOfEntry` 결과를 넘긴다는 것을 스캔으로 확인).
- **복귀는 세션 하나 (사실 고정):** 복귀 세션 다음 날 `suggestNextDay` → `returnStep` undefined. 배너 문구가 이 사실 위에 서 있으므로 이 테스트가 깨지면 문구도 다시 봐야 한다는 주석을 단다.
- 경계 — 계획 세트가 줄지 않은 복귀 세션(계획 1세트)에서 전 세트 상단이면 `up`이 나온다(현행 그대로, 판정에 mode가 끼지 않는다는 확인).
- 디로드 다음 정상 세션: 디로드 2/4 전부 상단 → 다음 세션 `lastHoldChipText`에 `· 디로드 세션`.
- 소스 스캔: `ExerciseCard.tsx`에 `showProgression` 없음 · `SessionScreen.tsx`가 `sessionMode={session.mode}`를 넘김 · 카드가 `modeSetNotice`를 거침 · `HomeScreen.tsx`에 `주간 램프업` 없음.

### 범위 제외

- **램프업 구현** (복귀 후 N주 동안 세트를 단계적으로 회복): 새 규칙이다. DESIGN §7은 "1주 램프"라는 이름만 있고 곡선(주차별 세트 %)이 정의돼 있지 않다. 정의는 문서 쪽 결정이 먼저다 (사람이 정할 것 1의 B안).
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
- **새 스캔 결함 복원 확인:** GG1·GG2의 소스 스캔마다 결함을 일부러 되살려(`cp` 백업 뒤) 스캔이 실패하는 것을 보고 되돌린다. 최소: prefill.ts에 `lastSets.length < routineExercise.sets` 복제 · Summary에 사유 문구 리터럴 · `showProgression` prop 복원 · `주간 램프업` 복원
- **과거 판정 불변 확인 절** (DEV-RECORD): ① GG1 전수 조합 테스트 결과 ② 2026-08-26 세션 픽스처(보고서 0·2절의 숫자로 재구성, 테스트 파일에 둔다)의 내보내기에서 바뀐 줄이 A그룹 `다음: … 유지` 세 줄뿐이고 괄호 안 사유만 늘었다는 diff ③ 홈 배지·요약 증량 행·프리필 무게(`defaultSetFor`)가 같다
- 완료 후 `docs/DEV-RECORD-v1.11.md` (맨 위 "이 환경에서 확인된 제약"은 v1.10 목록을 이어받는다)
- `package.json` **1.11.0**은 GG2까지 끝난 마지막 커밋에서 올린다

---

## 사람이 정할 것

1. **복귀 배너의 `N주간 램프업` 라벨** — 앱은 램프업을 하지 않는다(복귀 모드 = 세션 하나).
   - A. 사실대로 바꾼다: `이번 세션에만 적용 — 다음 세션부터 계획 세트` **(추천: 표시가 동작과 같아진다. 비용이 가장 작다)**
   - B. 램프업을 구현한다: 다음 라운드. DESIGN §7에 주차별 세트 % 곡선을 먼저 정의해야 한다
   - C. 그대로 둔다: 지금처럼 화면이 하지 않는 일을 약속한다
2. **요약 화면 카드 구성** — 
   - A. 한 카드 "다음 세션 무게 (A그룹)"에 증량·유지 행을 함께 둔다 **(추천: ①·② 구분이 세션 직후에 바로 보인다)**
   - B. 기존 "증량 제안" 카드는 그대로 두고 "유지 — 세트 부족" 카드를 따로 둔다(`sets` 사유만)
   - C. 화면은 그대로, 내보내기만 고친다
3. **문구** — `holdReasonText` 표(GG1 설계 3)와 칩 두 개
   (`지난번 상단 도달 · 계획 4세트 중 3세트 — 오늘 4세트 채우면 증량 판정`,
   `복귀 세션 · 계획 4세트 중 3세트 — 증량 판정은 계획 세트를 채운 세션에서`).
   **추천: 표 그대로.** 바꿀 문구가 있으면 그 칸만 알려주면 된다.
4. **과거 내보내기와 달라지는 점** — 이미 내보낸 기간을 다시 내보내면 A그룹 `다음: Xkg 유지` 줄
   끝에 `(사유)`가 붙는다. 판정(증량/유지)은 한 건도 바뀌지 않는다. 예전 내보내기와 문자열로
   비교하는 분석이 있다면 그 줄만 다르다.
   - A. 그대로 받아들인다 **(추천: 같은 줄에 정보가 늘 뿐이고, 스택 최대 줄이 이미 같은 형식이다)**
   - B. 사유를 별도 줄(`유지 사유: …`)로 분리해 기존 줄을 문자 그대로 둔다
