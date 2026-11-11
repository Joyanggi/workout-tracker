# 개발·테스트 내역 (검토용) — v1.16 (NN)

> PLAN-v1.16의 구현 기록. NN1부터 이어서 쓴다 (NN2~NN4와 "배포 영향"은 해당 작업 때 같은 파일에 덧붙인다). NN0 골든은 `a67a6ca`(+`2c3ac98`).

## 이 환경에서 확인된 제약 (누적 — v1.15 목록을 이어받는다)


1. `npx tsc --noEmit`은 `src`를 검사하지 않는다 → **`npm run build`로 타입 확인**.
2. 개발 브라우저 창은 `visibilityState`가 항상 `hidden`이다 → 소리가 들리지 않고, rAF·focus
   이벤트가 발화하지 않고, 250ms/80ms 인터벌이 ~1Hz로 스로틀된다.
3. vitest에서 `.css`를 `?raw`로 읽으면 **빈 문자열**이 온다 → 색·크기는 브라우저
   `getComputedStyle` 실측으로 확인한다 (이번 라운드에서 diff 줄 대비 6.28:1을 그렇게 쟀다).
4. `computer` 클릭은 pane이 hidden이면 타임아웃된다 → 조작은 `javascript_tool`로 한다.
   **단 `screenshot`은 hidden에서도 찍힌다** (이번에 ▾ 버튼 판정에 그게 결정적이었다).
5. React 렌더 테스트(RTL)가 없다 → 화면 규칙은 **순수 함수 + 소스 스캔** 2층으로 잠근다.
6. `javascript_tool`로 React 이벤트 일부를 재현할 수 없다: `.click()`은 `onPointerDown/Up`을
   발화시키지 않고(→ `PointerEvent` 디스패치), `blur()`는 포커스 없는 문서에서 이벤트를
   만들지 않는다(→ 버블링 `focusout`). **이번 라운드의 버튼들은 `onClick`이라 `.click()`으로
   충분했다.**
7. 소리는 이 창에서 들을 수 없다 (제약 2) → 오디오는 단위 스펙 + `createOscillator` 후킹.
8. `git checkout <파일>`은 커밋되지 않은 작업을 버린다 → 되돌리기는 `cp` 백업으로 한다
   (v1.9에서도 시드 편집 전에 백업을 먼저 떴다).
9. **새로 확인:** `innerText` 부분 문자열 매칭으로 요소를 고르면 안 된다. `find(c =>
   c.innerText.includes('올리브오일'))`이 **닭다리살 칩**을 잡았다 — 그 칩의 문구가
   "200g · 그날 올리브오일 생략"이기 때문이다. 한 번 잘못된 측정값(kcal 330)을 만들었고
   그건 앱 결함이 아니라 **내 선택자 결함**이었다. 인덱스나 정확 일치로 고른다.

10. **새로 확인 (EE3 라운드):** 이 브랜치에 들어올 때 EE3 구현과 테스트는 **이미 `e2d7093`에
    커밋돼 있었다.** 이번 작업은 구현이 아니라 PLAN 검증 항목 대조 · 결함 복원 확인 · 기록이다.
    작업 시작 전에 `git log`와 `grep returnChoiceReason`으로 먼저 확인했다.
11. **새로 확인 (EE2 라운드):** 이 환경의 Bash 도구에서 `python - <<'EOF'` heredoc 본문이 길고
    작은따옴표·백슬래시가 섞이면 셸 파싱이 깨진다(`unexpected EOF while looking for matching`).
12. **새로 확인 (NN1 라운드):** 11번이 또 났다 — 한 Bash 호출에 heredoc을 둘 이상 넣어도 깨진다. 파일은 Write 도구로 쓰고 Bash에는 짧은 명령만 둔다.
13. **새로 확인 (NN1 라운드):** 테스트에서 `node:fs`를 import하면 `npm run build`(타입 확인)가 실패한다(vitest는 통과). 소스 스캔은 `import.meta.glob(..., { query: '?raw' })`로 읽는다.

---

## NN1. 뼈대 — 저장 형태, 보관, 시드, 쓰기

화면이 없다. 이 작업만 배포돼도 보이는 변화가 없다. NN0 골든 커밋: `a67a6ca`(+`2c3ac98` 시각 정규화).

### 범위

| 항목 | 내용 |
|---|---|
| 커밋 | 이 기록과 같은 커밋 (`feat(NN1): …`) — 해시는 최종 보고에 적는다 |
| 새 파일 | `src/lib/routineEdit.ts` · `src/lib/routineStore.ts` |
| 바뀐 소스 | `types.ts`(`auto`·`retiredDays`·`retiredExercises`) · `derive.ts`(`findDayForRecord`·`plannedInDay`) · `history.ts` · `exportMarkdown.ts` · `dayGap.ts` · `SessionDetailScreen.tsx` · `SummaryScreen.tsx` · `HomeScreen.tsx` · `validateRoutine.ts`(8~10번) · `seed.ts`(`shouldResetActiveRoutine`) |
| 테스트 | `v116.test.ts`에 describe `NN1` 29개 추가(NN0 5개 포함 34개) · `dietBackup.test.ts` 1건 수정(아래) |
| README | "핵심 설계 결정 → 운동학 · 루틴 로직" 세 항목, "데이터 모델" 한 줄 |
| 안 건드림 | `findDay`·`dayChoice.ts`·`dayChange.ts`·`RoutineIoPanel.tsx`·시드 JSON·Dexie 스키마·`package.json` 버전 |

### PLAN 검증 항목 ↔ 테스트

| PLAN 검증 | 테스트 이름(`NN1 …`) |
|---|---|
| 항등 | `아무것도 안 고친 번들 루틴은 …가 r과 같다 (항등)` |
| 배열 순서 ≠ plannedOrder | `배열 순서 ≠ plannedOrder인 루틴도 toDraft가 …` |
| plannedOrder 1·2·4 | `plannedOrder가 1·2·4처럼 빈 루틴은 …` |
| 복사본 골든 | `forkRoutine 복사본을 넣어도 골든 다섯이 같다` |
| uniqueId | `uniqueId는 taken에 있으면 다시 만든다 (user-bbbb)` |
| 종목 뺀다·보관·fallback | `기록이 있으면 d1·fallback-push의 retiredExercises에 보관하고 …` |
| 과거 판정 불변 | `같은 편집 뒤에도 weeklyVolume·sessionToMarkdown이 골든과 같다` |
| 새 세션 제외·known:false | `같은 편집 뒤 새 세션에는 그 종목이 없고 … known:false·group B` |
| 버렸다 | `used에 그 키가 없으면 retiredExercises 키가 없다 (버렸다)` |
| 다시 넣기 | `뺀 종목을 다시 넣으면 exercises에 있고 …` |
| d4 삭제 | `d4를 지우면 retiredDays에 보관되고 …` · `보관한 d4는 findDay에는 없고 findDayForRecord에만 있다 …` |
| d3 삭제 | `d3을 지우면 하체 가드가 꺼지고 …` |
| d2 삭제 | `d2를 지우면(11-03 세션이 fallback-pull) …` |
| d1 삭제 | `d1을 지우면(fallback-push 세션 없음) …` |
| 하한 반복수 | `d2 lat-pulldown 반복수를 6~10으로 바꾸면 …` |
| 주간 목표 | `resolveMuscleTargets: 새 부위는 auto, …` |
| blankRoutine | `blankRoutine에 Day·종목 하나를 넣어 …` |
| nextDayId | `nextDayId는 비어 있는 가장 작은 dN을 낸다` |
| usedKeys | `usedKeys는 대체 키·얹은 종목의 Day·진행 중 세션까지 센다` |
| shouldResetActiveRoutine | `shouldResetActiveRoutine: …` |
| validateRoutine 8·9·10 | `validateRoutine: Day 없음(8)·Day id 중복(9)·…` |
| (NN2 표, 구현은 NN1 표에 있음) | `validateDraft는 번들 루틴 그대로면 빈 배열이다` |
| 스캔 7줄 | describe `스캔` 6개 테스트 (retired 소스 위치 · `findRoutineExercise` 비공개 · export/dayChoice/dayChange · routineStore 문구·`getOpenSession` · `requestSync` 개수·`routines.put/delete` 위치 · seed 조건) |

### 결함 복원 (PLAN ①~⑩·⑮~⑲, 15건)

각각 `cp` 백업 → 결함 → `npx vitest run src/lib/v116.test.ts` → 백업 복구(`cmp`/`git status`로 원상 확인).

| # | 되살린 결함 | 실패한 테스트 |
|---|---|---|
| ① | `findDayForRecord`의 `retiredDays` 조회 삭제 | d4·d2 삭제 3건 (`dayName` 포함) |
| ② | `plannedInDay`의 `retiredExercises` 조회 삭제 | 과거 판정 불변(골든)·known:false 2건 |
| ③ | 2단계가 `used`를 안 보고 항상 보관 | 버렸다 |
| ④ | 빈 `retiredDays: []`를 남김 | 항등 |
| ⑤ | 4단계 하한 모드 맞춤(종목 제거) 삭제 | 종목 뺀다·fallback-push |
| ⑥ | 6단계 삭제 | d3 삭제 · blankRoutine |
| ⑦ | `auto` 없는 항목도 플랜 합계로 덮음 | 항등 · resolveMuscleTargets |
| ⑧ | 쓰지 않는 부위의 목표를 남김 | d3 삭제 (`하체` 없음) |
| ⑨ | `seed.ts`가 `activeRoutineId`를 조건 없이 씀 | 스캔(seed) |
| ⑩ | `deleteRoutine`에서 `requestSync()` 삭제 | 스캔(requestSync 개수) |
| ⑮ | `exportMarkdown.ts` Day 조회를 `[...days, ...fallbackDays].find`로 | d4·d2 삭제의 내보내기 단언 + 스캔 |
| ⑯ | `findDay`가 `retiredDays`도 찾음 | `displayDay`·`planDayChange`·`known:false` |
| ⑰ | `toDraft`가 정렬하지 않음 | 배열 순서 ≠ plannedOrder |
| ⑱ | 하한 Day를 버릴 때 `used.dayIds`를 안 봄 (`retireDay`) | d1 삭제 (fallback-push 버림) |
| ⑲ | `uniqueId`가 `taken`을 안 봄 | `user-bbbb` |

⑩은 스캔을 `node:fs`에서 `import.meta.glob`으로 바꾼 뒤 한 번 더 확인했다(같이 실패, 복구 `cmp` 일치).

### 과거 판정 불변 확인 (테스트 안에 고정한 루틴 `routine-v2.4.json`·픽스처 `NN_SESSIONS` 한정)

| # | 확인 | 결과 |
|---|---|---|
| ① | 골든 다섯 (NN0 `a67a6ca`) | 통과 |
| ② | 복사본 루틴(`forkRoutine`)으로 골든 다섯 | 통과 |
| ③ | `suggestNextDay`·`dashboard`·`export`·`history`·`dayChoice`·`seedRepair`·`seedRevision`·`v113`·`v114`·`v115` 테스트 | 수정 없이 통과 |
| ④ | 바뀌는 것 | 없음(NN1은 화면이 없고 루틴을 고친 설치본만 영향. 시드는 다른 id의 활성 루틴이 있을 때만 활성 루틴을 유지) |

### 실행 결과

- `npm test`: `Test Files 60 passed (60)` · `Tests 1503 passed (1503)`
- `npm run build`: `✓ built in 3.46s`
- `node scripts/quality-scan.mjs --ci`: `통과`
- `git rev-list --count main..HEAD`: 커밋 전 2 (NN0 두 개) → 이 커밋 포함 3

### 수정표 밖

- `src/lib/dietBackup.test.ts` "requestSync를 부르는 곳이 …뿐이다": 허용 목록에 `src/lib/routineStore.ts`를 더하고 이름에 "루틴 쓰기"를 덧붙였다. PLAN이 정한 새 파일 `routineStore.ts`가 `requestSync()`를 부르는 기계적 결과이며 동작은 바뀌지 않는다. (PLAN 관례 "기존 테스트 수정 금지"와 IMPLEMENTER 2절 "기계적 결과는 수정, 보고"가 부딪혀 후자를 따랐다 — 리뷰어 확인 요청.)

### 하지 않은 것 · 리뷰어에게

- `HomeScreen.tsx:594`는 PLAN 표대로 `findDayForRecord`로 바꿨지만, 실제로는 제안 점수 목록(후보 Day)의 이름이다. 후보에는 보관 Day가 없어 동작 차이는 없다.
- 실기기 확인 해당 없음(화면 없음).

---

## NN2. 루틴 편집 화면 — Day·종목·주간 목표

### 범위

| 항목 | 내용 |
|---|---|
| 커밋 | 이 기록과 같은 커밋 (`feat(NN2): …`) — 해시는 최종 보고에 적는다 |
| 새 파일 | `src/screens/RoutineEditorScreen.tsx` · `src/components/RoutineLineSheet.tsx` · `src/components/ExercisePickerSheet.tsx` · `src/lib/useRoutineEditContext.ts`(읽기 전용 훅 — 화면에 `db.`을 두지 않으려고 분리) |
| 바뀐 소스 | `routineEdit.ts`(`MUSCLE_SUGGESTIONS`·`defaultLineFor`·`takenDayIds`) · `App.tsx`(`View`에 `'routineEdit'`, `editTarget`) · `SettingsScreen.tsx`(`편집` 버튼·`onEditRoutine` props·진행 중 세션 문구) |
| 테스트 | `v116.test.ts`에 describe `NN2` 12개 추가 (NN1까지 34 → 46) |
| README | 기능 표 설정 줄, Limitations 한 줄 (`README.md:40`, `:483` — PLAN의 `:467`은 줄이 밀렸다) |
| 안 건드림 | `routineStore.ts`·`finalizeRoutine`·시드·Dexie 스키마·`RoutineIoPanel.tsx`·`package.json` 버전 |

### PLAN 검증 항목 ↔ 테스트

| PLAN 검증 | 테스트 이름(`NN2 …`) |
|---|---|
| `validateDraft` 여섯 조건 | `validateDraft: 표의 여섯 조건이 각각 문구 하나를 내고…` |
| `defaultLineFor` 세 줄 | `defaultLineFor('lateral-raise')…` · `('smith-incline-press')…` · `('없는-종목')…` |
| Day 순서와 `lowerBodyDayId` | `Day 순서를 바꿔 저장해도 lowerBodyDayId는 d3 그대로…` |
| 종목 순서 + 내보내기 골든 | `종목 순서를 바꿔 finalizeRoutine한 뒤에도 …NN_EXPORT_BEFORE와 같다` |
| 주요 3종목 | `주요 3종목(keyARecordKeys)…` |
| 스캔 넷 | `편집 화면은 toDraft(와 uniqueId(…` · `…db.이 없고 muscleSets·plannedOrder 대입은…` · `설정의 편집 버튼 근처에…` · `Day 삭제·이 Day에서 빼기·저장하지 않고 나가기 앞 260자…` |
| (추가) | `takenDayIds` — 새 Day id가 다른 루틴·보관 Day·세션 id를 피한다 (PLAN "nextDayId의 taken"을 화면에서 순수 함수로 뺐다) |

### 결함 복원

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ⑪ 화면이 `db.routines.put` 직접 호출 | NN2 `db.이 없고…` 스캔 + NN1 `routines.put·delete` 스캔 | `cmp` 일치 |
| ⑫ `defaultLineFor`의 ③ 삭제 | NN2 `smith-incline-press` | `cmp` 일치 |
| `Day 삭제` 버튼에서 `btn-danger` 제거 | NN2 `btn-danger` 스캔 | `cmp` 일치 |
| `takenDayIds`가 `retiredDays`를 안 봄 | NN2 `takenDayIds` | `cmp` 일치 |

처음 쓴 `db.` 스캔은 정규식의 `\b`가 백스페이스 문자로 저장돼 결함 ⑪을 못 잡았다(구멍). 결함 복원으로 발견해 `(^|\W)db\.`로 고쳤다.

### 수정표 밖

- `src/lib/inputProps.test.ts`(`input·textarea 개수와 NO_AUTOFILL spread 개수가 같다`)는 고치지 않았다. 새 `input` 7개에 `{...NO_AUTOFILL}`을 달아 통과시켰다.

### 실행 결과

- `npm test`: `Test Files 60 passed (60)` · `Tests 1515 passed (1515)`
- `npm run build`: `✓ built in 3.40s`
- `node scripts/quality-scan.mjs --ci`: `통과`
- `git rev-list --count main..HEAD`: 커밋 전 3 → 이 커밋 포함 4

### 하지 않은 것 · 사람 확인 필요

- 하한 모드 Day 편집(자동 맞춤·삭제만), `＋ 새 루틴`(NN4)과 `onEditRoutine('blank')` 진입점은 화면 쪽만 준비하고 설정에는 연결하지 않았다.
- `Day 삭제`는 두 단계 버튼(`Day 삭제` → `정말 삭제`)이다. 기존 시트 규약대로 `btn-danger`를 단다.
- 실기기 확인 필요: iOS 홈 화면 앱에서 편집 화면의 safe-area, 시트 입력에 키보드가 올라올 때 `저장` 버튼 가림, `▲▼`·스테퍼 터치 크기. 이 환경에서는 못 했다.

---

## NN3. 내 종목

### 범위

| 항목 | 내용 |
|---|---|
| 커밋 | 이 기록과 같은 커밋 (`feat(NN3): …`) — 해시는 최종 보고에 적는다 |
| 바뀐 소스 | `types.ts`(`Exercise.custom`) · `routineEdit.ts`(`validateExercise`·`exerciseInUse`) · `routineStore.ts`(`saveCustomExercise`·`deleteCustomExercise`) · `ExercisePickerSheet.tsx`(새 종목 폼·`내 종목` 칩·`편집`·`종목 삭제`) · `RoutineEditorScreen.tsx`(시트에 저장 함수 연결) |
| 테스트 | `v116.test.ts`에 describe `NN3` 15개 추가 (NN2까지 46 → 61) |
| README | Limitations 한 줄 (`README.md:485`) |
| 안 건드림 | `seed.ts`·`backup.ts`·Dexie 스키마·시드 JSON·`package.json` 버전 |

### PLAN 검증 항목 ↔ 테스트

| PLAN 검증 | 테스트 이름(`NN3 …`) |
|---|---|
| `validateExercise` 네 건 | `…공백뿐인 이름…` · `…번들 종목의 shortName과 같은 이름…` · `…짧은 이름이 번들의 shortName이나 name과 같으면…` · `…자기 자신과 같은 이름은 통과…` |
| `uniqueId('custom-', …)` | `uniqueId('custom-', …): make가 처음 낸 값이 이미 있는 내 종목 id면…` |
| `exerciseInUse` 세 건 | `…보관 종목(retiredExercises)에만…` · `…substituteFor(recordKey)에만…` · `…어디에도 없으면 false` |
| 번들에 `custom-`·`custom` 없음 | `번들 카탈로그에 custom- id와 custom 필드가 없다` |
| 내 종목 루틴 `validateRoutine` | `내 종목을 넣은 루틴은 finalizeRoutine 뒤 validateRoutine(…)이 빈 배열…` |
| `parseBackup` 통과 | `그 루틴과 내 종목을 담은 백업은 parseBackup을 통과한다` |
| `zeroWeightHint` | `zeroWeightHint는 allowZeroWeight인 내 종목에 false를 준다` |
| 스캔 | `db.exercises.put·delete는 routineStore.ts에만…` · `routineStore.ts는 내 종목 쓰기마다 requestSync()…` · `종목 삭제 버튼 앞 260자 안에 btn-danger…, 시트에 db.이 없다` |

### 결함 복원

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ⑬ `exerciseInUse`가 `retiredExercises`를 안 봄 | NN3 `보관 종목…` | `cmp` 일치 |
| `exerciseInUse`가 `recordKeys`를 안 봄 | NN3 `substituteFor…` | `cmp` 일치 |
| `validateExercise`가 짧은 이름을 안 비교 | NN3 `짧은 이름이 번들의…` | `cmp` 일치 |
| 시트에서 `db.exercises.put` 직접 호출 | NN3 `종목 삭제 버튼 앞…, 시트에 db.이 없다` | `cmp` 일치 |

복원 확인 중 `src`에서 vitest를 돌리면 `import.meta.glob("/src/**")`가 빗나가 스캔이 헛실패한다 — 결함 복원도 레포 루트에서 돌린다.

### 수정표 밖

- 기존 테스트는 고치지 않았다. 새 `input` 5개(체크박스 포함)에 `{...NO_AUTOFILL}`을 달아 `inputProps.test.ts`를 통과시켰다.

### 설계 메모

- 편집 중인 초안에 들어 있는 내 종목도 `exerciseInUse`에 넣는다(`[...루틴, draft]`) — 저장 전 초안이 가리키는 종목을 지워 저장이 `카탈로그에 없는 종목`으로 막히는 것을 피한다.
- 배포 영향: 루틴 JSON 내보내기에는 내 종목이 실리지 않는다. 기기를 옮길 때는 전체 백업을 쓴다.

### 실행 결과

- `npm test`: `Test Files 60 passed (60)` · `Tests 1530 passed (1530)`
- `npm run build`: `✓ built in 3.39s`
- `node scripts/quality-scan.mjs --ci`: `통과`
- `git rev-list --count main..HEAD`: 커밋 전 4 → 이 커밋 포함 5

### 하지 않은 것 · 사람 확인 필요

- 내 종목의 대체 종목·보상작용·템포·시작 무게 편집(범위 제외).
- 실기기 확인 필요: iOS에서 종목 폼에 키보드가 올라올 때 `만들고 추가` 버튼에 닿는지.
