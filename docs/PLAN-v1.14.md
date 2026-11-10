# PLAN v1.14 — 통증은 통증 칸에, 유산소는 종류와 강도로 (LL)

> 작성: Fable 5.2 (설계자), 2026-11-10. 대상 코드: v1.13.0 (`main` `26bb3d4`).
> 근거: 이슈 #24 (새 기능). 배경은 `docs/FIELD-REPORT-2026-11-04.md` 7절.
>
> **성격**: 새 저장 필드는 **하나**다(`SessionEntry.pain`). 증량 판정에 보류 사유가 하나 늘고(`통증`), 나머지는 표시와 정리다.
> Day 제안·세트 수·복귀 규칙·PR·볼륨·빈도 경고·Phase 조건·홈 배너는 바뀌지 않는다.
>
> **지우는 조건 (이슈 "언제 지울까")**: 배포 후 3개월 동안 `pain`이 있는 entry가 0건이면 LL2·LL3을 지운다.
> `pain`은 선택 필드라 화면·판정을 지워도 남은 데이터는 무해하다. 다음 실사용 보고가 이 건수를 센다.

---

## 작업 개요

| ID | 내용 | 저장 형태 |
|---|---|---|
| LL0 | 골든: v1.13 코드의 내보내기·증량 판정을 고정한다 (테스트만) | 없음 |
| LL1 | "보상작용 있음" 판정을 `hasCompensation` 한 곳으로 모은다 (지금 6곳) | 없음 |
| LL2 | 통증 칸: 저장·입력·증량 보류 판정 | entry에 선택 필드 `pain` |
| LL3 | 통증을 말하는 자리: 다음 세션 카드 칩·내보내기·요약·종목 기록 | 없음 (LL2 값을 읽는다) |
| LL4 | 유산소 종류 목록 한 곳 + 천국의 계단 + 강도 | 없음 (기존 `cardio.note`를 강도로 읽는다) |

---

## LL0. 골든 — v1.13 출력 고정

모든 작업보다 먼저, 테스트만 담아 커밋한다. 이후 고치지 않는다(DEV-RECORD에 해시).

`src/lib/v114.test.ts`에 픽스처 `LL_SESSIONS`를 **이 파일 안에** 만든다(`v113.test.ts`를 import하지 않는다 — 테스트 파일을 import하면 그 파일의 describe가 한 번 더 돈다). `testFixtures.ts`의 `completedSession`·`ROUTINE`만 쓴다.

| 세션 | 내용 | 겨냥 |
|---|---|---|
| 08-03 D1 normal | 체크 0, 유산소 `{마이마운틴, 30}` | 강도 없는 유산소 줄 불변 |
| 08-26 D1 normal | 전 종목 체크, 유산소 `{마이마운틴, 20, note '25/3.8'}` | 강도 있는 과거 유산소 줄 |
| 08-28 D3 normal | 레그 컬 40kg 14/10/7, 보상작용 `보상작용은 아니고 첫세트시 왼쪽 발목 굉장히 찌릿해서 횟수 못채움`. 나머지 종목 임의값 체크 | 과거 보상작용 판정 불변 |
| 11-04 D1 normal | 전 종목 체크, 유산소 `{기타, 16, note '4'}` | `기타 4` |

골든 두 개: `LL_EXPORT_BEFORE`(이 네 세션의 `exportMarkdown` 전문, 시각은 v113 방식대로 `시각`으로 치환) · `LL_VERDICT_BEFORE`(세션별 `progressionVerdicts`를 `recordKey → verdict` 객체로).
이 커밋의 단언은 "지금 코드 출력 = 골든" 둘뿐이다.

---

## LL1. "보상작용 있음" 판정을 한 곳에서

### 진단

| 사실 | 근거 |
|---|---|
| "있음" 판정 함수는 이미 있다 | `compensation.ts:41` `hasCompensation` |
| 그런데 같은 판정을 다섯 곳이 따로 한다 | `progression.ts:84` · `compensationWatch.ts:55`, `:96` · `noteHistory.ts:77` · `phaseReadiness.ts:208` · `CompensationSheet.tsx:100` |
| 기준도 서로 다르다. 빈 문자열을 `progression`·`phaseReadiness`는 "있음", `hasCompensation`·`compensationWatch`는 "없음"으로 본다 | 위 줄들 (`!== NO_COMPENSATION`만 보는 곳과 `trim() !== ''`를 같이 보는 곳) |
| 앱 입력으로는 빈 문자열이 저장되지 않는다. 직접 고친 백업·가져오기로만 들어온다 | `sessionOps.ts:210-218` `applyCompensation` · `compensation.ts:23-26` |
| 08-28 건의 원인은 이 판정이 아니다. 자유 입력은 원래 "적으면 있음"이고, A그룹 카드에 다른 글 칸이 없어서 통증이 여기로 왔다 | `CompensationSheet.tsx:67-76` · `ExerciseCard.tsx:583`(감각 메모는 B그룹만) |

### 설계

1. `hasCompensation(stored: string | undefined): boolean` — `const v = (stored ?? '').trim(); return v !== '' && v !== NO_COMPENSATION`.
2. 위 다섯 곳과 `CompensationSheet.tsx:79`(미리보기 색)를 `hasCompensation` 호출로 바꾼다. `judgeProgression`은 `if (hasCompensation(args.compensation))`.
3. **글을 해석하지 않는다.** "보상작용은 아니고…" 같은 부정문을 앱이 읽어내는 규칙은 만들지 않는다(오판하면 안전 쪽이 아니라 증량 쪽으로 틀린다). 08-28 같은 글은 LL2의 통증 칸과 시트 안내 문구가 막는다.

### 검증 (`v114.test.ts`, describe `LL1`)

- `hasCompensation`: `'없음'`·`''`·`'  '`·`' 없음 '`·`undefined` → false · `'승모 개입'`·`'없음, 반동'` → true.
- `judgeProgression`: 전 세트 상단 + `compensation: ''` → `up` (전: hold `compensation`) · `'승모 개입'` → hold `compensation`.
- `LL_VERDICT_BEFORE` 일치 (08-28 레그 컬은 그대로 hold `compensation`).
- **소스 스캔**: `src`의 테스트 아닌 파일 중 `compensation.ts`를 뺀 어디에도 `/[!=]==?\s*NO_COMPENSATION/`이 없다(주석 제거 후).

### 범위 제외

- 자유 입력을 판정에서 빼거나 "판정에 넣지 않기" 구분을 더하는 것 — 체크리스트가 빈 종목은 자유 입력이 유일한 입력이다. "사람이 정할 것" 3.
- 08-28 기록 변환 — 이슈 "안 할 것". 사용자가 기록 탭에서 직접 옮길 수는 있다(LL2).

### README 반영

없음 (LL2에서 한 줄로 같이 적는다).

---

## LL2. 통증 칸 — 저장·입력·증량 보류

### 진단

| 사실 | 근거 |
|---|---|
| 통증을 적을 칸이 없다. entry의 글 칸은 감각 메모(B그룹만)와 보상작용뿐이다 | `types.ts:236-245` · `ExerciseCard.tsx:583`, `:623-633` |
| 보상작용에 적으면 사유가 `보상작용 있음`이 되고, 반복 감시(T11)·Phase 조건 ③에도 보상작용으로 세어진다 | `progression.ts:84` · `compensationWatch.ts:55` · `phaseReadiness.ts:208` |
| 세션 메모에 적으면 종목과 연결되지 않고 증량도 보류되지 않는다 | `types.ts:315` `sessionNote` |
| 증량 판정은 한 곳이고 사유는 순서대로 하나만 낸다 | `progression.ts:62-103` `judgeProgression` |
| 다음 세션 프리필은 "작업 세트를 한 직전 세션"의 entry로 판정한다. 세트를 하나도 못 한 세션은 건너뛴다 | `prefill.ts:122-126` `sessionsForRecord` · `:171`, `:179-187` |
| 대체는 행을 새로 만들며 감각·보상작용을 지운다. Day 변경은 entry를 펼쳐 복사한다 | `sessionOps.ts:157-185` · `dayChange.ts:81` |
| 필드 추가는 백업 하위 호환이다(스키마 버전을 올리지 않는다) | `backup.ts:30` |

**안 만들면:** 통증은 계속 보상작용 칸(틀린 사유)이나 세션 메모(종목과 무관, 보류 없음)로 간다. 내보내기를 LLM에 붙여도 "다음 세션에 올리지 않는다"는 앱 안에서 일어나야 하므로 풀리지 않는다. 안 만드는 안은 "사람이 정할 것" 1.

**파생으로 안 되는 이유:** 통증은 기존 기록(무게·반복·감각)에서 계산할 수 없는 새 사실이다.

### 설계

**1. 저장** — `src/types.ts` `SessionEntry`

```ts
/** 통증 (LL2). **있으면 통증 있음**이다 — note가 비어도. 없으면(v1.14 이전 기록 전부) 통증 기록 없음 */
pain?: { note: string }
```

객체 하나로 둔다. "있음"과 메모를 두 필드로 나누면 메모만 남은 상태가 생긴다. 문자열 하나로 두면 보상작용과 같은 문제("적어야 있음")가 생긴다.

**2. 판정 함수** — 새 파일 `src/lib/pain.ts`

| 함수 | 반환 | 규칙 |
|---|---|---|
| `hasPain(entry)` | `boolean` | `entry.pain !== undefined`. 통증 여부를 묻는 곳은 전부 이것을 쓴다 |
| `painText(entry)` | `string \| undefined` | 없으면 `undefined` · 메모(trim) 있으면 `있음 — {메모}` · 없으면 `있음` |
| `painTrail(sessions, recordKey)` | `{ date: string; note: string; streak: number } \| undefined` | 완료 세션 최신순으로 그 `recordKey` entry 중 **닿은 것**(작업 세트 1개 이상 **또는** 통증 있음)만 본다. 가장 최근에 닿은 entry에 통증이 없으면 `undefined`. 있으면 그 세션의 `date`·`note`(trim)와, 최근부터 연속으로 통증인 닿은 세션 수 `streak`(≥ 1) |

"닿은 것"에 통증만 있는 entry를 넣는 이유: 첫 반복에서 아파서 세트를 하나도 못 한 날이 가장 심한 경우인데, `sessionsForRecord`는 그 세션을 건너뛴다. 그러면 그 전 세션의 판정(증량)이 그대로 다음 프리필이 된다.

**3. 증량 판정** — `progression.ts`

- `HoldReason`에 `{ kind: 'pain' }`. `judgeProgression` 인자에 `pain?: boolean`.
- 순서: 0 대상 아님 → 1 Phase 0 → **2 통증** → 3 보상작용 → 4 반복 미달 → 5 세트 부족 → 증량. 통증과 보상작용이 둘 다 있으면 사유는 통증이다(둘 다 내보내기 종목 줄에는 따로 나온다).
- `holdReasonText`: `통증 있음`.
- `progressionVerdicts`: `pain: hasPain(entry)`.
- `prefill.ts` `buildPrefill`: `const trail = painTrail(sessions, recordKey)` → `judgeProgression({ …, pain: trail !== undefined })`. `RecordPrefill`에 `lastPain?: { date; note; streak }`(= `trail`)를 싣는다. `computeProgression`에는 `lastPain?: boolean`을 더해 그대로 넘긴다.
- 효과: 보류면 `progression`이 없어 프리필 무게는 지금의 보류와 같이 "최근 3세션 최고"다. 무게를 내리지는 않는다(내릴지는 사용자가 정한다).
- B그룹·코어는 증량 판정이 없으므로 통증은 표시만 된다. `bGroupGuide`는 건드리지 않는다.

**4. 기록 연산** — `sessionOps.ts`

- `applyPain(session, recordKey, pain: { note: string } | undefined): Session`. `undefined`면 `pain` 키를 지운다.
- `applySubstitute`: `pain: undefined`를 더한다(감각·보상작용과 같은 줄). 통증은 그 종목 기록 라인에 붙는 사실이고, 새 행은 다른 종목이다.
- Day 변경·얹기(`applyAddExercise`)는 고치지 않는다(펼쳐 복사로 따라가고, 새 entry에는 없다).
- `store/session.ts`·`useSessionEditor.ts`에 `setPain`, `ExerciseCard`의 `EntryActions`에 `setPain`.

**5. 입력** — `ExerciseCard.tsx`, 보상작용 칸 바로 아래 (모든 그룹)

```
통증
[ 없음 ]                      ← btn btn-sm, aria-pressed. 누르면 [ 있음 ](btn-warn)
[ 부위·상황 (예: 왼쪽 발목 찌릿) ]   ← 있음일 때만. NO_AUTOFILL, aria-label "{종목} 통증 메모"
```

- 없음 → 있음: `setPain(key, { note: '' })`. 있음 → 없음: `setPain(key, undefined)`(메모도 지워진다).
- 메모는 입력하는 대로 저장한다(감각 메모와 같다). 기본값이 없음이라 통증이 없는 날은 입력이 늘지 않는다.
- 접힌 카드: 보상작용 칩 옆에 `통증` 칩(`chip chip-warn`).
- 기록 탭의 세션 편집도 같은 카드라 과거 세션에 통증을 적을 수 있다(사용자가 직접 하는 수정이다).

**6. 보상작용 시트 안내** — `CompensationSheet.tsx` 직접 입력 칸 아래 `row-sub` 한 줄(항상 보임):

`여기에 적으면 "보상작용 있음"으로 기록되고 다음 증량이 보류됩니다. 통증은 카드의 통증 칸에 적어 주세요.`

### 검증 (`v114.test.ts`, describe `LL2`)

- 전 세트 상단 + 통증 → hold `pain` · 통증 + 보상작용 → `pain` · 통증 + 반복 미달 → `pain` · Phase 0 + `allowProgressionInPhase0: false` + 통증 → `phase0`.
- 통증 `{ note: '' }`(메모 없음)도 hold `pain`.
- B그룹 entry에 통증 → `progressionVerdicts`에 그 키가 없다.
- `buildPrefill`: 직전 세션 전 세트 상단 + 통증 → `progression` 없음, `defaultSetFor` 무게 = 직전 무게, `lastVerdict.reason.kind === 'pain'`, `lastPain.streak === 1`.
- **세트 0 통증**: S1 전 세트 상단(통증 없음) → S2 같은 종목 통증만, 체크 0 → `lastVerdict` hold `pain`, `progression` 없음. S2가 없으면 `up`.
- 통증 다음 세션에 통증 없이 수행 → 그다음 프리필은 통증과 무관하게 판정(`lastPain` 없음).
- **디로드·복귀**: 디로드 세션(세트 절반, 전 세트 상단) + 통증 → 다음 normal 프리필 사유는 `pain`(`sets`가 아니다).
- **대체**: 대체 entry(`substituteFor` 있음)에 통증 → 대체 종목 라인만 보류, 원 종목 라인의 `buildPrefill`은 `lastPain` 없음. 통증 표시 후 `applySubstitute` → 새 행에 `pain` 키 없음.
- **어시스티드**: `inverse` 종목 전 세트 상단 + 통증 → hold `pain`, `from`은 수행 무게.
- **얹은 종목**: `extra` entry 통증 → 그 종목 본 라인(`@원소속 Day`)의 다음 프리필이 보류.
- **Day 변경**: `applyDayChange` 뒤에도 `pain`이 그대로다.
- `applyPain`: 설정 → `{ note }` · `undefined` → `'pain' in entry === false` · 없는 `recordKey` → 세션 그대로.
- `painTrail`: 통증·통증·정상(최신순) → `streak 2` · 통증·(안 한 세션)·통증 → `streak 2` · 정상·통증 → `undefined` · 진행 중 세션은 세지 않는다.
- `LL_VERDICT_BEFORE` 일치 · `GG1_GOLDEN` 통과.
- **소스 스캔**: `pain.ts` 밖의 테스트 아닌 파일에 `.pain !== undefined`·`.pain === undefined`·`!entry.pain`이 없다(입력 칸의 `entry.pain.note` 읽기는 허용).

### 범위 제외

- 부위 선택 UI — 이슈의 가장 작은 버전은 "있음/없음 + 짧은 메모"다. 부위는 메모에 적는다.
- 통증 때 무게를 자동으로 내리기 — 보류까지만. 앱은 제안한다.
- 종료 시트(`FinishSheet`)의 통증 요약 줄 — 방금 직접 누른 값이고, 요약 화면의 "다음 세션 무게"가 `통증 있음`을 말한다.
- Phase 조건 ③·반복 보상작용 감시(T11)에 통증 넣기 — 둘은 보상작용의 규칙이다. 섞지 않는다.
- B그룹 "무게 회복 시도" 칩을 통증 때 숨기기 — Phase 2 이상에서만 뜨고 지금은 Phase 0이다.

### README 반영

"기록의 정확성"의 "반복 보상작용의 판정 창…" 항목 앞에 더한다:

```
- **통증은 보상작용과 다른 칸이고, 증량 판정에서는 같은 급이다**
  통증(`entry.pain`)이 기록된 종목은 다음 세션 증량을 보류하고 사유를 `통증 있음`으로 적습니다
  (순서: Phase 0 → 통증 → 보상작용 → 반복 미달 → 세트 부족). 세트를 하나도 못 하고 통증만 적은
  세션도 직전 기록으로 봅니다 — 가장 심한 경우가 판정에서 빠지지 않게 하기 위해서입니다.
  "있음" 여부는 `hasPain`·`hasCompensation` 두 함수만 답하고, 앱은 적힌 글을 해석하지 않습니다.
```

"Why" 목록의 `- **보상작용** — …` 다음 줄에: `- **통증** — 종목별 있음/없음과 짧은 메모. 보상작용과 섞이지 않게 따로 받습니다.`

---

## LL3. 통증을 말하는 자리

### 진단

| 사실 | 근거 |
|---|---|
| 다음 세션 카드는 보류 사유 중 세트 부족만 말한다 | `progression.ts:128-132` `lastHoldChipText` · `ExerciseCard.tsx:398` |
| 카드의 "지난번" 줄은 B그룹 감각 칸 안에만 있다. A그룹 카드는 지난 기록의 글을 보여 주지 않는다 | `ExerciseCard.tsx:583-611` |
| 내보내기 종목 블록은 작업 세트를 한 entry만 나온다. 세트 0인 entry는 `미수행:`이거나 아예 빠진다 | `exportMarkdown.ts:307`, `:313-317` |
| 유산소만 한 세션은 유산소·메모 줄만 낸다 | `exportMarkdown.ts:258-264` |
| 홈 카드에는 이미 추가 줄이 최대 두 줄 있다(KK3·KK4) | `PLAN-v1.13.md` 검토 반영 기록 |

**연속 통증 경고의 필요성 (이슈가 설계자에게 맡긴 것):** 홈 카드 줄은 만들지 않는다. 대신 그 종목 카드의 칩이 연속 횟수를 말한다.
- 경고가 쓰이는 순간은 그 종목을 하려는 때다. 홈 카드는 Day를 고르는 자리다.
- 칩은 `painTrail` 하나에서 나온다. 홈 줄은 전 종목을 훑는 함수와 KK3·KK4 줄과의 자리 규칙이 더 든다.
- 13주에 통증 1건이다. 3개월 뒤 지울 수도 있는 기능에 홈 자리를 먼저 쓰지 않는다. 선택지는 "사람이 정할 것" 2.

### 설계

**1. 다음 세션 카드 칩** — `pain.ts` `lastPainChipText(trail, verdict, mode): string | undefined`

| 조건 | 문구 |
|---|---|
| `trail` 없음 | `undefined` |
| `streak === 1` | `지난번 통증` |
| `streak >= 2` | `통증 {streak}세션 연속` |
| 메모 있음 | 뒤에 ` — {메모}` |
| `mode === 'normal'`이고 `verdict`가 hold `pain` | 뒤에 ` · 증량 보류` |

예: `지난번 통증 — 왼쪽 발목 찌릿 · 증량 보류` · `통증 2세션 연속 — 왼쪽 발목 찌릿 · 증량 보류` · (B그룹) `지난번 통증 — 손목`.
`ExerciseCard`의 칩 줄(보상작용 감시 칩 다음)에 `chip chip-warn`으로, `showPrefillHints`일 때만(과거 세션 편집에는 안 뜬다). 인자는 `prefill.lastPain`·`prefill.lastVerdict`·`sessionMode`.

**2. 내보내기** — `exportMarkdown.ts`

- 종목 블록: `보상작용:` 줄 다음에 `통증: {painText}`. **통증이 있을 때만** 낸다(`통증: 없음` 줄은 없다 → 과거 내보내기가 안 바뀐다).
  ```
  ### 레그 컬 (D3/A) 40kg
  14 / 10 / 7
  보상작용: 없음
  통증: 있음 — 첫 세트 왼쪽 발목 찌릿
  다음: 40kg 유지 (통증 있음)
  ```
- 세트 0 통증: `cardioNoteLines`를 `sessionTailLines(session, nameOf)`로 바꾸고 맨 앞에 한 줄을 더한다. 대상은 `hasPain`이고 `doneSets` 0인 entry(계획 순서), ` · `로 잇는다. 근력 세션에서는 `미수행:` 다음, 유산소만 세션에서는 헤더 다음이다.
  ```
  통증(작업 세트 없음): 레그 컬 — 첫 반복에서 왼쪽 발목 · 숄더프레스
  ```
- 유산소만·`근력 기록 없음` 헤더 문구는 그대로다.

**3. 요약 화면** — `SummaryScreen.tsx`: 수행 순서 줄 끝에 ` · 통증`(보상작용 요약 다음). "다음 세션 무게" 카드는 `holdReasonText`로 자동이다.

**4. 종목 기록 화면** — `history.ts` `HistoryPoint`에 `pain: boolean`(`hasPain`), `ExerciseHistoryScreen.tsx` 줄 끝에 ` · 통증`.

### 검증 (`v114.test.ts`, describe `LL3`)

- `lastPainChipText`: 표의 다섯 줄 각각 · `mode: 'deload'`면 ` · 증량 보류` 없음 · verdict가 `phase0`이면 없음.
- 내보내기: 통증 + 메모 → 블록에 `보상작용: 없음\n통증: 있음 — …\n다음: 40kg 유지 (통증 있음)` 순서 · 메모 없음 → `통증: 있음` · 통증 없는 entry → `통증` 글자가 블록에 없다.
- 보상작용 `승모 개입` + 통증 → 두 줄이 각각 나오고 `다음:` 사유는 `통증 있음`.
- B그룹 통증 → `통증:` 줄은 있고 `다음:` 줄은 없다.
- 세트 0 통증(근력 세션) → `미수행:` 다음 줄이 `통증(작업 세트 없음): …` · 워밍업만 체크 + 통증 → 같은 줄에 나온다 · 유산소만 세션 + 통증 → `## … — 유산소만` 다음 줄.
- 대체 entry 통증 → `### {대체 종목} … (대체: … — 자리 없음)` 블록 안에 `통증:` 줄.
- 새 출력이 `LL_EXPORT_BEFORE`와 같다(통증 줄 0개. LL4 커밋이 이 단언을 "유산소 두 줄만 다르다"로 바꾼다) · `JJ_EXPORT_NORMAL_BEFORE` 통과.
- `exerciseHistory`: 통증 entry → `pain: true`, 과거 entry → `false`.
- **소스 스캔**: `exportMarkdown.ts`·`SummaryScreen.tsx`·`history.ts`가 `hasPain` 또는 `painText`를 import한다.

### 범위 제외

- 홈 카드 연속 통증 줄·홈 배너 — 위 "필요성".
- 종목 메모 이력(CC14 `noteHistory`)에 통증 싣기 — B그룹 카드의 "지난번" 줄과 통증 칩이 같은 말을 두 번 한다. 통증 글은 세션 상세와 내보내기에 있다.
- 내보내기 머리말 범례 — `통증:` 줄은 설명 없이 읽힌다. 범례를 더하면 모든 과거 내보내기가 바뀐다.

### README 반영

"내보내기" 절 예시 아래 문단에 한 줄: `통증:` 줄은 통증을 기록한 종목에만 나오고, 세트 없이 통증만 적은 종목은 `통증(작업 세트 없음):` 줄로 나옵니다.

---

## LL4. 유산소 종류 한 곳 · 천국의 계단 · 강도

### 진단

| 사실 | 근거 |
|---|---|
| 종류 상수가 두 곳에 따로 있다 | `FinishSheet.tsx:9` · `SessionDetailScreen.tsx:17` |
| 천국의 계단이 없어 `기타`를 골랐다 | 보고서 7절 (11-04) |
| 글 칸은 이미 있다. 이름이 "유산소 메모"이고 안내값이 `25/3.8`이라 무엇을 적는 칸인지 말하지 않는다 → `4`만 적혔다 | `FinishSheet.tsx:127-134` · `SessionDetailScreen.tsx:195-202` · `types.ts:292` |
| 내보내기가 그 글을 종류 뒤에 그대로 붙인다 → `기타 4 · 16분` | `exportMarkdown.ts:222-223` |
| 유산소를 글로 만드는 곳이 세 군데고 모양이 다르다(기록 탭은 메모를 뺀다) | `exportMarkdown.ts:223` · `HistoryScreen.tsx:152` · `SummaryScreen.tsx:286-289` |

**안 만들면:** 지금도 메모 칸에 `천국의계단 4단계`라고 쓰면 읽힌다. 다만 실제로는 `4`만 적혔고, 칸이 뜻을 말하지 않는 한 반복된다. 안 만드는 안은 상수 통합 + 천국의 계단 추가만 하는 것이다("사람이 정할 것" 4의 C).

### 설계

**결정: 새 필드를 만들지 않고 `cardio.note`를 강도로 읽는다.** 이 칸은 처음부터 강도를 받았다(타입 주석 `"마이마운틴 25/3.8"`, 안내값 `25/3.8`, 실제 기록 `4`). 저장 키 이름은 그대로 둔다(이전 없음).

**1. 새 파일 `src/lib/cardio.ts`**

```ts
export const CARDIO_TYPES = [
  { name: '마이마운틴', intensityHint: '25/3.8' },
  { name: '천국의 계단', intensityHint: '4단계' },
  { name: '자전거', intensityHint: '레벨 8' },
  { name: '트레드밀', intensityHint: '6km/h' },
  { name: '기타', intensityHint: '강도' },
] as const

/** 목록에 없는 종류(옛 기록·가져오기)는 '강도' */
export function intensityHintFor(type: string): string

/** 유산소 한 줄 — 내보내기·기록 탭·요약이 같이 쓴다 */
export function cardioText(c: CardioRecord): string
```

`cardioText`: 강도 = `c.note?.trim()`.

| 강도 | 반환 |
|---|---|
| 있음 | `{type} · 강도 {강도} · {minutes}분` — `천국의 계단 · 강도 4단계 · 16분` |
| 없음 | `{type} {minutes}분` — `마이마운틴 30분` (지금과 같다) |

**2. 쓰는 곳**

| 파일 | 변경 |
|---|---|
| `FinishSheet.tsx` · `SessionDetailScreen.tsx` | 지역 상수 삭제, `CARDIO_TYPES.map((t) => t.name)`. 글 칸 `aria-label="유산소 강도"`, `placeholder={intensityHintFor(종류)}` |
| `exportMarkdown.ts` | `유산소: ${cardioText(session.cardio)}` |
| `HistoryScreen.tsx:152` | `` ` · ${cardioText(session.cardio)}` `` |
| `SummaryScreen.tsx:282-291` | `row-meta`에 `cardioText`, `row-sub`(메모) 삭제 |
| `types.ts:292` | 주석: `강도(단계·속도·경사). 저장 키는 note 그대로 (LL4)` |

단위는 붙이지 않는다. 사용자가 적은 글 그대로다(`4`면 `강도 4`, `4단계`면 `강도 4단계`). 안내값이 단위까지 적도록 이끈다.

### 검증 (`v114.test.ts`, describe `LL4`)

- `cardioText`: `{천국의 계단, 16, '4단계'}` → `천국의 계단 · 강도 4단계 · 16분` · `{기타, 16, '4'}` → `기타 · 강도 4 · 16분` · `{마이마운틴, 30}` → `마이마운틴 30분` · `note: ''`·`'  '` → 강도 없는 모양 · 목록에 없는 종류 `{걷기, 30}` → `걷기 30분`.
- `intensityHintFor('천국의 계단')` → `4단계` · `'걷기'` → `강도`.
- `CARDIO_TYPES` 이름: `['마이마운틴', '천국의 계단', '자전거', '트레드밀', '기타']`.
- 내보내기: `LL_EXPORT_BEFORE`와 다른 줄이 정확히 둘이다 — 08-26 `유산소: 마이마운틴 · 강도 25/3.8 · 20분`, 11-04 `유산소: 기타 · 강도 4 · 16분`. 08-03 `유산소: 마이마운틴 30분`은 그대로.
- **소스 스캔**: 테스트 아닌 `src` 파일 중 `cardio.ts`만 `'마이마운틴'` 리터럴을 갖는다 · `exportMarkdown.ts`·`HistoryScreen.tsx`·`SummaryScreen.tsx`에 `cardio.minutes`가 없고 `cardioText(`가 있다.

### 범위 제외

- `기타`의 이름 입력 — 천국의 계단이 들어가면 `기타`는 드물다. 숫자에는 `강도`가 붙는다.
- 종류별 단위 자동 부착·직전 강도 프리필·종류별 기본 시간 — 가장 작은 버전은 "강도 한 칸"이다.
- 과거 `기타` 기록을 `천국의 계단`으로 바꾸기 — 이슈 "안 할 것". 사용자가 기록 탭에서 직접 고칠 수 있다.

### README 반영

"기록의 정확성" 끝에 더한다:

```
- **유산소 종류 목록과 한 줄 표기는 `cardio.ts` 한 곳에 둔다**
  강도(단계·속도·경사)는 `cardio.note`에 사용자가 적은 글 그대로이고, 내보내기는
  `천국의 계단 · 강도 4단계 · 16분`처럼 숫자가 무엇인지 말합니다.
```

---

## 과거 판정 불변

바뀌지 않는 것: v1.14 이전 기록에는 `pain`이 없으므로 `judgeProgression`·`progressionVerdicts` 결과(`GG1_GOLDEN`·`LL_VERDICT_BEFORE`) · 세션 생성(`JJ_BUILD_GOLDEN`) · 유산소 강도가 없는 세션의 내보내기 전문(`JJ_EXPORT_NORMAL_BEFORE`·`LL_EXPORT_BEFORE`의 해당 세션) · 08-28 레그 컬의 `다음: 40kg 유지 (보상작용 있음)` · 저장된 기록 전부.

달라지는 것:

| 자리 | 전 | 후 | 작업 |
|---|---|---|---|
| 강도(메모)가 있는 과거 유산소의 내보내기 | `유산소: 기타 4 · 16분` | `유산소: 기타 · 강도 4 · 16분` | LL4 |
| 기록 탭 세션 줄의 유산소(강도 있음) | `· 기타 16분` | `· 기타 · 강도 4 · 16분` | LL4 |
| 요약 화면 유산소 줄 | 메모는 왼쪽 아래, `기타 16분`은 오른쪽 | 오른쪽에 `기타 · 강도 4 · 16분` 한 줄 | LL4 |
| 보상작용이 빈 문자열·공백인 기록(앱 입력으로는 안 생긴다)의 증량 판정·Phase 조건 ③ | 있음 | 없음 | LL1 |
| 새 세션: 통증을 적은 종목 | — | 다음 세션 증량 보류, `통증:` 줄, 칩 | LL2·LL3 |
| 사용자가 기록 탭에서 과거 세션에 통증을 직접 적은 경우 | — | 그 세션의 `다음:` 사유와 다음 프리필이 바뀐다(보상작용 편집과 같다) | LL2 |
| 유산소 종류 선택지 | 4개 | 5개(천국의 계단) | LL4 |

실사용 기록으로 보면 v1.13 대비 내보내기 diff는 11-04의 유산소 한 줄뿐이다. **이 밖의 줄은 한 글자도 바뀌지 않는다.**

---

## 구현 순서와 검증

**LL0 → LL1 → LL2 → LL3 → LL4.** LL2는 LL1의 `hasCompensation`을 쓴 `judgeProgression`을 고치고, LL3은 LL2의 `pain.ts`를 읽는다. LL4는 독립이지만 LL3과 같은 함수(`sessionTailLines`)를 고치므로 뒤에 둔다.
커밋은 **골든 1 + 구현 4 + 기록·버전 1 = 6.** 작업끼리 한 커밋에 섞지 않는다.

관례:
- `npm run build` (`tsc` 직접 호출 금지) · 작업 중에는
  `npx vitest run src/lib/v114.test.ts src/lib/v113.test.ts src/lib/v112.test.ts src/lib/v111.test.ts src/lib/export.test.ts src/lib/prefill.test.ts src/lib/compensation.test.ts src/lib/compensationWatch.test.ts src/lib/phaseReadiness.test.ts src/lib/sessionOps.test.ts src/lib/uiConsistency.test.ts`만 · 마지막에 `npm test` 한 번
- 커밋 개수는 실행 출력을 복사한다 (`git log --oneline main..HEAD`) · 커밋 메시지는 `git commit -F - <<'MSG'`
- 새 `input`은 `{...NO_AUTOFILL}`을 받는다(파일별 개수 일치 테스트가 있다).
- **기존 테스트 수정은 아래 목록뿐이다.** 다른 기존 테스트가 깨지면 설계와 어긋난 것이므로 고치지 말고 멈춰서 보고한다. 수정마다 주석 `LLn(PLAN-v1.14): <이유>`.

  | # | 파일·자리 (줄 번호는 참고 — grep으로 다시 맞춘다) | 수정 | 작업 |
  |---|---|---|---|
  | ① | `export.test.ts:141` | `유산소: 마이마운틴 25/3.8 · 20분` → `유산소: 마이마운틴 · 강도 25/3.8 · 20분` | LL4 |
  | ② | `v113.test.ts:960`, `:966`, `:993` | `유산소: 유산소 마이마운틴 · 30분` → `유산소: 유산소 · 강도 마이마운틴 · 30분` (픽스처의 `note`가 강도 자리로 간다. 픽스처는 고치지 않는다) | LL4 |
  | ③ | `v113.test.ts:1037` 허용 접두사 | `유산소: 유산소 마이마운틴` → `유산소: 유산소 · 강도 마이마운틴` | LL4 |

- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `progression.ts`를 `(args.compensation ?? NO_COMPENSATION) !== NO_COMPENSATION`으로 복원 → LL1 스캔·`''` 단언 실패
  ② `judgeProgression`에서 통증 분기를 보상작용 분기 뒤로 → LL2 `통증 + 보상작용 → pain` 실패
  ③ `painTrail`의 "닿은 것"에서 통증 조건 삭제(작업 세트만) → LL2 세트 0 통증 실패
  ④ `applySubstitute`의 `pain: undefined` 삭제 → LL2 대체 단언 실패
  ⑤ `lastPainChipText`의 `mode === 'normal'` 조건 삭제 → LL3 디로드 단언 실패
  ⑥ 내보내기 `통증:` 줄을 `통증: 없음`도 내게 → LL3 `LL_EXPORT_BEFORE` 일치 단언 실패
  ⑦ `sessionTailLines`에서 세트 0 통증 줄 삭제 → LL3 `통증(작업 세트 없음)` 실패
  ⑧ `FinishSheet.tsx`에 지역 `CARDIO_TYPES` 복원 → LL4 스캔 실패
  ⑨ `cardioText`를 `${type} ${note} · ${minutes}분`으로 → LL4 `기타 · 강도 4` 실패
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 테스트 안에 고정한 루틴(배포 `routine-v2.4.json`)·Phase·픽스처로 한정한다고 첫 줄에 적는다:
  ① `GG1_GOLDEN`·`JJ_BUILD_GOLDEN`·`JJ_EXPORT_NORMAL_BEFORE`·`LL_VERDICT_BEFORE` 일치 (LL0 커밋 해시)
  ② 기존 테스트 수정 ①~③의 diff를 붙인다
  ③ `LL_EXPORT_BEFORE`와 새 출력의 diff가 유산소 두 줄뿐이다 (diff 전문을 붙인다)
  ④ 바뀌는 것: "과거 판정 불변" 표의 자리
- 완료 후 `docs/DEV-RECORD-v1.14.md` (맨 위 "이 환경에서 확인된 제약"은 v1.13 목록을 이어받는다). "배포 영향" 절에 두 줄을 남기고 PR 본문 맨 위에도 넣는다:
  - 강도를 적은 과거 유산소 기록의 내보내기·기록 탭 표기에 `강도`가 붙는다(11-04 `기타 4 · 16분` → `기타 · 강도 4 · 16분`).
  - 통증 칸의 삭제 조건: 배포 후 3개월 동안 `pain` 기록이 0건이면 LL2·LL3을 지운다.
- README: 각 작업의 "README 반영"을 그 작업 커밋에서 고친다.
- `package.json` **1.14.0**은 기록 커밋에서 올린다

리뷰 단위: 작업별 — LL2가 세션 저장 형태와 증량 판정을 바꾸고, LL3·LL4가 세션·요약·기록·내보내기 여러 화면에 걸친다.

---

## 사람이 정할 것

**1. 통증 칸을 만들 것인가**
- **A (추천)**: LL2·LL3대로 만든다. 통증이 없는 날은 입력이 늘지 않는다(기본 없음). 통증이 있던 날만 한 번 누르고 메모를 적는다.
- B: 만들지 않는다. LL1과 보상작용 시트 안내 문구만 넣고, 통증은 세션 메모에 적는다. 증량 보류가 안 되므로 이슈의 성공 기준 둘째 줄을 못 채운다.

**2. 연속 통증 경고**
- **A (추천)**: 홈 카드 줄은 만들지 않는다. 그 종목 카드의 칩이 `통증 2세션 연속 — {메모} · 증량 보류`로 말한다.
- B: A에 더해 홈 카드에 한 줄(`통증 연속 — 레그 컬 2세션`). 전 종목을 훑는 함수 하나와, KK3·KK4 줄과 합쳐 세 줄이 될 때의 순서 규칙이 더 든다. 고르면 LL5로 설계한다.
- C: 연속 횟수도 세지 않는다. 칩은 늘 `지난번 통증`이다.

**3. 보상작용 자유 입력에 적은 글의 판정**
- **A (추천)**: 지금처럼 "적으면 있음"으로 두고 시트에 안내 문구를 넣는다. 앱은 글을 해석하지 않는다. 08-28 같은 글은 통증 칸이 받는다. 과거 08-28 기록은 `보상작용 있음`으로 남는다(원하면 기록 탭에서 직접 통증 칸으로 옮긴다).
- B: 자유 입력 옆에 "증량 판정에 넣지 않기" 구분을 더한다. 저장 필드와 누를 것이 하나씩 는다.

**4. 유산소 강도를 어디에 저장하나**
- **A (추천)**: 기존 `cardio.note`를 강도로 읽는다. 새 필드가 없다. 대신 강도를 적은 과거 기록의 내보내기에 `강도`가 붙는다(11-04 `기타 4 · 16분` → `기타 · 강도 4 · 16분`).
- B: 새 필드 `intensity`를 만들고 과거 `note`는 옛 모양 그대로 낸다. 과거 내보내기는 안 바뀌지만 11-04는 `기타 4`로 남고, 표기 경로가 둘이 된다.
- C: 강도 표기를 바꾸지 않는다. 상수 통합과 천국의 계단 추가만 한다.

**5. 문구와 목록** (추천안 원문. 고칠 곳이 있으면 고쳐 주세요)

| 자리 | 문구 |
|---|---|
| 카드 통증 칸 | 제목 `통증` · 버튼 `없음` / `있음` · 메모 안내값 `부위·상황 (예: 왼쪽 발목 찌릿)` |
| 접힌 카드 칩 | `통증` |
| 다음 세션 카드 칩 | `지난번 통증 — 왼쪽 발목 찌릿 · 증량 보류` / `통증 2세션 연속 — 왼쪽 발목 찌릿 · 증량 보류` |
| 보류 사유 (내보내기·요약) | `다음: 40kg 유지 (통증 있음)` |
| 내보내기 종목 줄 | `통증: 있음 — 첫 세트 왼쪽 발목 찌릿` (메모 없으면 `통증: 있음`) |
| 내보내기, 세트 없이 통증만 | `통증(작업 세트 없음): 레그 컬 — 첫 반복에서 왼쪽 발목` |
| 보상작용 시트 안내 | `여기에 적으면 "보상작용 있음"으로 기록되고 다음 증량이 보류됩니다. 통증은 카드의 통증 칸에 적어 주세요.` |
| 유산소 종류 (순서대로) | `마이마운틴` · `천국의 계단` · `자전거` · `트레드밀` · `기타` |
| 유산소 강도 안내값 | 마이마운틴 `25/3.8` · 천국의 계단 `4단계` · 자전거 `레벨 8` · 트레드밀 `6km/h` · 기타 `강도` |
| 유산소 내보내기 | `유산소: 천국의 계단 · 강도 4단계 · 16분` (강도 없으면 `유산소: 천국의 계단 16분`) |
