# 개발·테스트 내역 (검토용) — v1.10 (EE3 · EE1) · 2026-11-03

> EE3(복귀 배너 두 칸 선택)와 EE1(저녁 다리살)을 기록한다. EE2는 아직 범위가 아니며, 끝나면 이 문서에
> 이어서 쓴다. package.json 버전은 EE1·EE2 완료 뒤에 1.10.0으로 올린다 (현재 1.9.1).

## 이 환경에서 확인된 제약 (누적 — 매 라운드 맨 위에 둔다)

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

---

## 1. 범위

| 커밋 | 항목 |
|---|---|
| `e2d7093` | **EE3** — 복귀 배너 `[적용]`/`[안 함]` 2지 선택 + 카드 문구 `returnChoiceReason` |

변경 파일: `HomeScreen.tsx` · `dayChoice.ts` · `dayChoice.test.ts` · `global.css`(`.banner-choice`).
**983 테스트 / 48 파일** (`npm run build` 통과). EE1·EE2 미착수, 버전 미변경.

---

## 2. EE3 — 라벨 문법을 없애고 답을 두 칸으로

진단은 PLAN 그대로였다: 한 칸 토글의 글자가 상태("적용됨")와 동작("무시")을 번갈아 말했고,
눌러도 카드가 "가볍게 복귀합니다"를 유지했다.

- 배너: `.banner-choice`(`role="group"`) 안에 `[적용] [안 함]`. 각 버튼이 값을 그대로 넣는다
  (`setApplyReturn(true|false)`), 고른 쪽이 `aria-pressed`.
- 카드: `returnChoiceReason({ suggestionReason, gapDays, hasReturnStep, applyReturn })`가
  "안 함"이면 `N일 공백 — 복귀 프로토콜 없이 평소 강도로 시작합니다`를 돌려준다.
  제안 없음·`gapDays: null`이면 제안 근거 / 일수 없는 문구로 폴백.
- 상태는 컴포넌트 상태 — 저장하지 않는다 (AA1 `pickedDayId`와 같은 결).

---

## 3. PLAN 검증 항목 ↔ 이름 붙은 테스트 (`src/lib/dayChoice.test.ts`)

| PLAN 검증 | 테스트 |
|---|---|
| `returnChoiceReason` 적용 | 적용 상태면 제안 근거를 그대로 쓴다 |
| 〃 안 함 | "안 함"을 고르면 복귀하지 않는다고 말한다 |
| 〃 제안 없음 | 복귀 제안 자체가 없으면 토글과 무관하게 제안 근거다 |
| 〃 `gapDays: null` | 공백 일수를 모르면 일수 없이 말한다 |
| 한 칸 토글 복원 금지 | 상태와 동작을 번갈아 말하던 한 칸 토글이 없다 |
| 두 버튼 `aria-pressed` 배선 | 두 버튼이 각각 적용 / 안 함을 고르고, 고른 쪽이 aria-pressed다 |
| 카드가 `returnChoiceReason` 경유 | 카드 문구가 returnChoiceReason을 거친다 |

7개 전부 존재하고 통과한다. 소스 스캔 2개는 정규식이 대상을 못 찾으면 `toBeDefined`로
실패하게 해 두어 헛돌지 않는다.

---

## 4. 결함 복원 확인 — 스캔이 실제로 잡는가

`HomeScreen.tsx`를 `cp` 백업 후 결함을 하나씩 되살려 `dayChoice.test.ts`를 돌렸다.
끝난 뒤 `cmp`로 원상복구를 확인했다.

| 복원한 결함 | 실패한 테스트 |
|---|---|
| `setApplyReturn(false)` → `setApplyReturn(!applyReturn)` | 한 칸 토글이 없다 · 두 버튼이 각각 … (2건) |
| `applyReturn ? '적용' : '무시'` 삼항 라벨 | 한 칸 토글이 없다 |
| "안 함" 버튼의 `aria-pressed` 제거 | 두 버튼이 각각 … aria-pressed다 |
| 카드가 `returnChoiceReason`을 우회 | 카드 문구가 returnChoiceReason을 거친다 |

---

## 5. 과거 판정 불변

EE3은 화면 상태와 문구만 바꾼다. 세션 생성 경로(`HomeScreen.create`의 `isReturn`)·DB 스키마·
저장된 기록·내보내기를 건드리지 않았다 (`e2d7093`의 변경 파일에 `db/`·`lib/export*` 없음).

---

## 6. 하지 않은 것 · 열린 것

- **실기기/브라우저 화면 확인은 하지 않았다.** 이 라운드는 빌드 + 테스트 + 결함 복원까지다.
  제약 2·4·6에 따라 개발 창에서 확인한다면 `.click()`으로 충분하다 (`onClick` 버튼).
- 범위 제외 유지: 배너 dismiss · 선택의 저장.

## 7. 실기기 확인 목록

1. 19일 이상 공백 상태에서 홈 배너에 `[적용] [안 함]` 두 칸이 나란히 보이고 기본은 `[적용]` 채움.
2. `[안 함]` 탭 → 채움이 옮겨가고 카드 문구가 "복귀 프로토콜 없이 평소 강도로 시작합니다"로 바뀜.
3. `[적용]`으로 되돌리면 카드 문구가 "Day 1로 가볍게 복귀합니다" 계열로 복귀.
4. 각 선택으로 세션을 시작해 복귀 세션/일반 세션이 실제로 갈리는지.


---

## 8. EE1 — 저녁 다리살 변형

작업 전에 구현 여부를 확인했다: 저녁 `chicken-3`에는 안심만 있었고 다리살이 없었다
(`v19.test.ts`가 "저녁은 2택이고 다리살이 없다"를 명시). 미구현으로 판정하고 진행했다.
브랜치에 `git merge main`(fast-forward)으로 EE3 기록을 먼저 받았다.

### 변경
- `src/data/diet-plans.json`: `cut-1800-u`·`cut-1500-u` 저녁 `chicken-3`에 변형 추가 —
  `닭다리살` / `320g · 그날 점심 오일·오후 아몬드 생략` / 544kcal / 51g. 플랜 id 유지.
  `seedRevision` 2 → 3.
- `src/lib/seedRevision.test.ts`: 스냅샷 `dietSeedRevision: 3`, `dietHash: 'f0d4bf77'`.
- `src/lib/v19.test.ts`: 저녁 2택 단정 두 곳을 3택에 맞게 고쳤다 (다리살 부재 단정 →
  앞 두 선택 단정, DD4 그램 표기 목록에 `320g…` 추가).
- `src/lib/v110.test.ts` 신설 (EE1 테스트).
- UI 코드 변경 없음 — `DietVariantSheet`가 `variantsOf`를 일반적으로 돌린다.

### PLAN 검증 항목 ↔ 테스트 (`v110.test.ts`, `EE1 — 저녁 다리살 변형`)
| PLAN 검증 | 테스트 |
|---|---|
| 저녁 3택 문서 1:1 | 저녁은 3택이다 … 두 플랜 모두 |
| 544kcal · 51g | 다리살은 kcal 544 · 단백질 51이다 |
| 실효 +14 | 점심 오일·아몬드를 생략하면 실효 +14kcal다 |
| id 유지 | 플랜 id는 유지된다 |
| 과거 기록 불변 | 변형 추가 전에 기록된 저녁 슬롯의 마크로가 변하지 않는다 (1781kcal·166g) |
| 옛 플랜 불변 | 옛 플랜은 여전히 변형이 없다 |
| 검증기·구조 | 두 플랜이 검증기를 통과하고 … 단백질원뿐이다 |
| 내보내기 | 다리살을 고르면 내보내기에 이름·수량이 그대로 실린다 |
| 강제 금지 / 합계가 말함 | 조건을 어기면 막지 않고 +274가 합계에 그대로 보인다 |

### 검증 출력
- `npm run build` 통과 (tsc -b + vite build).
- `npx vitest run`: **992 passed / 49 files** (EE3 시점 983 → +9).
- 빌드 중 `v110.test.ts`의 미사용 변수(`lunchChicken`)가 TS6133으로 걸려 지웠다.

### 과거 판정 불변
`variantChoices` 부재 = 기본 변형(가슴살)이므로 기존 기록의 하루 요약은 그대로다
(1781kcal·166g 테스트로 고정). 옛 플랜(`cut-1800`/`cut-1500`)은 건드리지 않았다.

### 하지 않은 것
- **결함 복원 확인은 하지 않았다** (변형을 되돌려 테스트가 실패하는지 직접 확인하지 않음).
- 실기기/브라우저 화면 확인은 하지 않았다. EE2(짝 연동)·버전 1.10.0 상향은 범위 밖.
- 실기기 확인 목록: 저녁 변형 시트에 3택이 보이고 다리살 칩 문구가 맞는지, 선택 시 저녁
  kcal가 544로 바뀌는지, 기존 설치본에 seedRevision 3이 전달되는지.
