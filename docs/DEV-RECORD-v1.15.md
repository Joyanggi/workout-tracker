# 개발·테스트 내역 (검토용) — v1.15 (MM)

> PLAN-v1.15의 구현 기록. MM1부터 이어서 쓴다 (MM2·MM3은 해당 작업 때 같은 파일에 덧붙인다). MM0 골든은 `50ded6e`.

## 이 환경에서 확인된 제약 (누적 — v1.14 목록을 이어받는다)


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

---

## MM1. 내 음식 목록

범위 (선행 단계 MM0 골든은 별도 커밋 `50ded6e`):

| 파일 | 바뀐 것 |
|---|---|
| `src/types.ts` | `Food`, `FoodLogEntry`, `DietDay.log?`(타입만), `Settings.userFoods?` |
| `src/lib/foods.ts` (신규) | `foodKey`·`planFoods`·`foodCatalog`·`validateFood`·`applyAdd/Update/RemoveFood` |
| `src/lib/useDiet.ts` | `mutateUserFoods`, `useDiet()`가 `userFoods`를 함께 읽음 |
| `src/lib/v115.test.ts` | describe `MM1` 14건 추가 (v115 전체 17건) |
| `src/lib/dietBackup.test.ts` | 수정 ①: 쓰기 함수 3 → 4 (주석 `MM1(PLAN-v1.15)`) |
| `README.md` | 기능 표 식단 줄, 데이터 모델 문단, Limitations — PLAN "README 반영"대로 |

화면 변화 없음(MM2부터). Dexie 버전·`SCHEMA_VERSION`·시드 무변경.

PLAN 검증 ↔ 테스트

| PLAN 검증 | 테스트 |
|---|---|
| foodKey 공백 무시 | `MM1 foodKey는 앞뒤 공백을 무시한다` |
| planFoods 변형·중복 | `MM1 planFoods는 기본·대체 변형을 모두 내고…` |
| legacy 제외 | `MM1 planFoods는 legacy 플랜의 품목을 내지 않는다` |
| 최근 순·같은 날 시각 | `MM1 foodCatalog: 먹은 것이 맨 위, 더 최근이 먼저…` |
| 내 음식이 플랜보다 앞 | `MM1 foodCatalog: 적힌 적 없는 내 음식이…` |
| 같은 key는 한 줄·user | `MM1 foodCatalog: …foodKey가 같으면 한 줄이고 source는 user다` |
| 같은 이름·다른 분량 두 줄 | `MM1 foodCatalog: 같은 이름·다른 분량…` · `…이름만 같고 분량이 다른 내 음식은 둘 다 남는다` |
| validateFood | `MM1 validateFood` 3건 |
| apply* 불변 | `MM1 applyUpdateFood·applyRemoveFood·applyAddFood는…` |
| 스캔 ① mutateUserFoods·scheduleBackup 4 | `MM1 스캔: useDiet.ts에…` + 수정 ① |
| 스캔 ② 키 조립 foodKey 전용 | `MM1 스캔: foodKey를 거치지 않고…` |

결함 복원

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| `mutateUserFoods`에서 `.then(scheduleBackup)` 삭제 (PLAN ①) | `dietBackup.test.ts 식단 쓰기 함수가 전부 예약한다`, `v115 MM1 스캔: useDiet.ts…` | `cmp` 동일 |
| `foodCatalog` 중복 제거를 이름만으로 (PLAN ②) | `MM1 foodCatalog: …이름만 같고 분량이 다른 내 음식은 둘 다 남는다` (처음엔 못 잡아 이 테스트를 보강) | `cmp` 동일 |

수정표 밖 테스트 변경: 없음.

실행 결과: `Test Files 59 passed (59)` · `Tests 1436 passed (1436)` · 빌드 통과 · `quality-scan 통과`.
하지 않은 것: 화면·`log` 연산·합계(MM2), 내보내기(MM3), 버전 상향(기록 커밋).

---

## MM2. 먹은 것 시간별 기록

범위:

| 파일 | 바뀐 것 |
|---|---|
| `src/lib/diet.ts` | `logTotals`·`sortedLog`·`hasDietRecord`·`nutritionText`·`logEntryText`, `DietDaySummary`에 `logCount`·`logUnknown`, `summarizeDietDay`가 합계에만 더함, `dietMonthStats` 회색 점을 `hasDietRecord`로 |
| `src/lib/dietOps.ts` | `applyAddLog`·`applyUpdateLog`·`applyRemoveLog` (전부 `{ ...day }`, 빈 `log`는 키 삭제) |
| `src/components/FoodLogSheet.tsx` (신규) | 시각·검색·목록(`foodCatalog`)·행 탭 바로 추가·새 음식 등록/편집/삭제 폼 |
| `src/components/DietDayEditor.tsx` | `먹은 것 (시간별)` 카드, 요약 `먹은 것 n건 포함`, 삭제 문구, `userFoods` prop |
| `src/screens/{DietScreen,HistoryScreen,SessionDetailScreen}.tsx` | `userFoods=` 한 줄씩 |
| `src/lib/v115.test.ts` | describe `MM2 먹은 것 기록` 18건 + `MM2 스캔` 5건 |
| `src/lib/v1112.test.ts` | 수정표 밖 1건 (아래) |
| `README.md` | 기능 표 식단 줄, 기록의 정확성 새 항목, 데이터 모델 한 줄 |

PLAN 검증 ↔ 테스트 (v115.test.ts, 이름은 `MM2 …`로 시작)

| PLAN 검증 | 테스트 |
|---|---|
| 합계 증가·score/adherence/loggedSlots 불변 | `합계: applyAddLog 뒤 …` |
| 210kcal·3g | `합계: count 2, kcal 105 …` |
| 영양 둘 다 없음 | `합계: kcal·proteinG가 둘 다 없는 줄 …` |
| 한쪽만 있음 | `합계: proteinG만 있는 줄은 …` |
| nutritionText 네 경우·(0,0) | `nutritionText: …` |
| logEntryText 표기 표 | `logEntryText: 표기 표 다섯 줄 …` |
| 먹은 것만 있는 날 | `슬롯을 건드리지 않고 먹은 것 1건만 있는 날 …` |
| 11-05 회색 점 없음 | `slots {}이고 log가 없는 날 …` |
| 슬롯 3개+ adherence 불변 | `슬롯 3개 이상 + 먹은 것 여러 건 …` |
| 마지막 줄 삭제 시 키 삭제 | `applyRemoveLog로 마지막 줄을 지우면 …` |
| applyUpdateLog 범위·반올림 | `applyUpdateLog는 time·count만 바꾼다 …` |
| 잘못된 time | `applyAddLog에 time '25:00'이나 ''이면 …` |
| sortedLog | `sortedLog: 09:00, 21:00, 09:00 …` |
| 기존 연산 12종이 log 보존 | `기존 연산이 log를 지우지 않는다 …` |
| 목록 수정·삭제가 기록 불변 | `목록의 음식을 고치거나 지워도 …` |
| 플랜 변경 | `플랜을 바꿔도(applyPlan) …` |
| resolveTrainingDays | `resolveTrainingDays를 거친 날에도 log가 남는다` |
| MM0 골든 | `MM0 골든 셋이 그대로 통과한다` + 기존 MM0 describe 무수정 통과 |
| 스캔 4건 | `MM2 스캔: loggedSlots …` · `requestSync(` · `decimals={2}` · `userFoods=` (+ `logEntryText` 한 자리) |

결함 복원 (PLAN ③④⑤⑥⑦⑪⑫; ⑧⑨⑩은 MM3)

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ③ `summarizeDietDay`가 먹은 것 점수를 `scores`에 | 합계(score·adherence 불변), 슬롯 3개 이상 | `cmp` 동일 |
| ④ `logTotals`에서 `× count` 삭제 | 210kcal·3g, logEntryText | `cmp` 동일 |
| ⑤ `dietMonthStats`를 `loggedSlots > 0`으로 | 먹은 것만 있는 날 회색 점, 스캔 | `cmp` 동일 |
| ⑥ `applyRemoveLog`가 빈 배열을 남김 | `'log' in day` | `cmp` 동일 |
| ⑦ `applyNote`를 필드 나열로 재조립 | 기존 연산이 log를 지우지 않는다 | `cmp` 동일 |
| ⑪ `nutritionText`가 없는 쪽을 0으로 | nutritionText, logEntryText | `cmp` 동일 |
| ⑫ 개수 `NumberStepper`에서 `decimals={2}` 삭제 | 스캔 `decimals={2}` | `cmp` 동일 |

수정표 밖 테스트 변경: `v1112.test.ts`의 `DietDaySummary` 리터럴(`반올림 경계는 마크가 판정을 따른다`)에 `logCount: 0, logUnknown: 0` 추가 — 새 필수 필드의 기계적 결과(빌드 타입 오류).

과거 판정 불변: MM0 describe 3건 무수정 통과(`toMatchObject`), 새 필드는 log 없는 날에 0.

실행 결과: `Test Files 59 passed (59)` · `Tests 1459 passed (1459)` · 빌드 통과 · `quality-scan 통과`.

하지 않은 것: 내보내기(MM3), 버전 상향(기록 커밋).
사람 확인 필요: iOS 홈 화면 앱에서 `<input type="time">`이 휠로 열리고 `HH:MM`으로 들어오는지(이 레포 첫 `type="time"`). 시트·카드의 실제 모양(CSS 클래스는 기존 `diet-item`·`check-list` 재사용, 실기기 미확인).

---

## MM3. 내보내기에 먹은 것

범위:

| 파일 | 바뀐 것 |
|---|---|
| `src/lib/exportMarkdown.ts` | `dietSectionMarkdown`: `hasDietRecord`로 절 판정, 슬롯 줄은 기록된 슬롯이 있을 때만, 먹은 것 줄(`sortedLog`·`logEntryText`)·합계 줄(2건 이상, 전부 미입력이면 숫자 없이 `영양 미입력 n건`). `exportMarkdown`이 범위 안 `log` 유무를 `dietMarkLegend`에 넘김 |
| `src/lib/diet.ts` | `dietMarkLegend(opts?: { withLog?: boolean })` — 먹은 것 범례 한 줄 추가 |
| `src/lib/v115.test.ts` | describe `MM3` 10건 (v115 전체 50건) |

README 반영: 없음(PLAN). 기존 테스트 수정: 없음. 수정표 밖: 없음.

PLAN 검증 ↔ 테스트 (v115.test.ts, `MM3 …`)

| PLAN 검증 | 테스트 |
|---|---|
| log 없는 날 = MM_EXPORT_BEFORE | `log가 없는 날의 dietSectionMarkdown이 MM_EXPORT_BEFORE와 같다` |
| 먹은 것만 있는 날 | `먹은 것만 있는 날: 머리 '기록 0/5슬롯' …` |
| 슬롯+2건+메모 순서 | `슬롯 + 먹은 것 2건 + 메모: …` |
| 1건이면 합계 없음 | `먹은 것 1건이면 합계 줄이 없다` |
| 미입력 1건 + 값 1건 | `영양 미입력 1건 + 값 있는 1건 …` |
| 미입력 2건뿐 | `영양 미입력 2건뿐 …0kcal이 없다` |
| 시각순 | `21:00을 먼저 넣고 09:00을 나중에 …` |
| 전문 범례 2/3줄·운동 없음 | `exportMarkdown 전문: …범례 2줄/3줄` · `…운동 없음 아래` |
| logEntryText 한 자리 스캔 | `스캔: DietDayEditor.tsx와 exportMarkdown.ts가 둘 다 logEntryText를 부른다` |

결함 복원 (PLAN ⑧⑨⑩)

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ⑧ `- 슬롯:` 줄을 항상 냄 | `MM3 먹은 것만 있는 날 …` | `cmp` 동일 |
| ⑨ 범례가 항상 3줄 | `MM3 exportMarkdown 전문: …범례 2줄, 3줄` | `cmp` 동일 |
| ⑩ `DietDayEditor.tsx`가 `logEntryText`를 안 부름 | `MM3 스캔 …`, `MM2 스캔 …logEntryText 한 자리` | `cmp` 동일 |

과거 판정 불변: `MM0 dietSectionMarkdown 줄 배열이 v1.14와 같다`와 MM3 첫 테스트가 네 날 전부 통과. 먹은 것이 없는 내보내기는 범례 포함 한 글자도 바뀌지 않는다. 바뀌는 것: 먹은 것만 적은 날이 식단 절로 나오고, 먹은 것이 있는 내보내기의 범례가 3줄이다.

실행 결과: `Test Files 59 passed (59)` · `Tests 1469 passed (1469)` · 빌드 통과 · `quality-scan 통과`.
하지 않은 것: JSON 백업·주간/월간 통계(범위 제외), 버전 상향(기록 커밋).
