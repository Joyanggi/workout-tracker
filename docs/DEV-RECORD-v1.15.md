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
