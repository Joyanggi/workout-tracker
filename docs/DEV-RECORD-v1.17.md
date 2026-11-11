# 개발·테스트 내역 (검토용) — v1.17 (OO)


> PLAN-v1.17의 구현 기록. OO0부터 쓴다 (OO1~OO3은 해당 작업 때 덧붙인다).

## 이 환경에서 확인된 제약 (누적 — v1.16 목록을 이어받는다)


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
14. **새로 확인 (OO0 라운드):** 사람이 iOS 27(17.5 이상)을 확인했다 — Astryx 지원 조건 통과. Playwright 1.65.0 + chromium은 이 환경에서 받아졌고 `iPhone 14` 흉내(390×844, 터치, `pointer: coarse`)로 찍힌다(엔진은 chromium. webkit 아님). Playwright 기기 목록의 `iPhone 14` 뷰포트는 390×664라 844로 덮어썼다.
15. **새로 확인 (OO0 라운드):** `page.evaluate`로 보내는 함수는 바깥 스코프의 도우미를 못 본다 → 공유 도우미는 `addInitScript`로 `window.__vis`·`__scrollEnd`에 올려 쓴다.

16. **새로 확인 (OO3 라운드):** 스크린샷은 Playwright의 Chromium으로 찍는다. iOS Safari가 아니라서 `light-dark()`·`@scope`·`@starting-style`·safe-area·`<dialog>`·`dvh`·화면 키보드는 실기기 확인으로만 본다. `package-lock.json`에 `lucide-react`가 들어온다(theme-neutral의 의존성).
17. **새로 확인 (OO3 라운드):** 이 환경에서 Python으로 파일을 읽고 쓰면 CRLF로 저장된다(`git`이 "CRLF will be replaced" 경고를 내고, `v117` 소스 스캔 정규식이 `\n}\n`에서 깨진다). 고치면 `sed -i 's/\r$//'`로 LF로 되돌리거나, 파일 편집은 Edit 도구로 한다. 시트 `--check`는 5분 안팎이라 Bash 포그라운드 한도(10분)에 둘을 이어 돌리면 넘친다 → 하나씩 백그라운드로 돌린다.

---

## OO0. 스크린샷 도구와 "바꾸기 전" 스크린샷

앱 코드 무변경. 새 파일 `scripts/screenshots.mjs`, `devDependencies`에 `playwright` `1.65.0`(정확한 버전).

| 항목 | 내용 |
|---|---|
| 바뀐 파일 | `package.json`, `package-lock.json`, `scripts/screenshots.mjs`, `docs/screenshots/v1.17/before-*-dark*.png` 12장, 이 문서 |
| 장면 | home · settings · editor-full · line-sheet · line-sheet-end · picker-sheet · picker-form · editor-leave · editor-problems · editor-long (390) + editor-full · line-sheet (375) |
| 라이트 | 다크와 바이트 같음 확인 후 버림(전 장면). `before` 12장만 커밋 |
| 검사 | 모양 검사 여덟 열 + 흐름 검사 넷(`after --check`에서만 돈다. 아직 돌려 보지 못했다 — 화면이 `after`가 될 OO3에서 처음 돈다) |

### PLAN 검증 ↔ 확인

| PLAN 검증 | 확인 |
|---|---|
| `before`가 다크·라이트로 찍고 둘이 같다 | 전 장면 바이트 동일(불일치 시 스크립트가 종료 코드 1과 `✗ before 라이트가 다크와 다르다`를 낸다. 안 나옴) |
| `before-editor-full-dark.png`에 세 깨짐이 보인다 | 눈으로 확인: 제목 `루`/`틴`/`편`/`집`이 세로로 쌓임, Day 이름 `Day 1 — \|` 잘림, 종목 `1. 인…` + ▲▼가 폭 차지 |
| `before --check` 종료 코드 1, `editor-full`에서 `제목 한 줄`·`글자 잘림` 실패 | 종료 코드 1. editor-full 390·375 × 다크·라이트 모두 두 열 ✗ (아래 표) |
| `npm test`·`npm run build`·`quality-scan --ci` 통과 | 아래 실행 결과 |

### `node scripts/screenshots.mjs before --check` 출력 (다크 · 요약)

| 장면 | 폭 | 가로 넘침 | 제목 한 줄 | 머리 줄 | 글자 잘림 | 입력 글자 | 마지막 줄 | 탭 영역 |
|---|---|---|---|---|---|---|---|---|
| editor-full | 390 | ✓ | **✗** | ✓ | **✗** | ✓ | · | ✓ |
| line-sheet | 390 | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ |
| line-sheet-end | 390 | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ |
| picker-sheet | 390 | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ |
| picker-form | 390 | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ |
| editor-leave | 390 | ✓ | · | · | ✗ | ✓ | · | ✓ |
| editor-problems | 390 | ✓ | ✗ | ✓ | ✗ | ✓ | · | ✓ |
| editor-long | 390 | ✓ | ✗ | ✓ | ✗ | ✓ | · | ✓ |
| editor-full | 375 | ✓ | ✗ | ✓ | ✗ | ✓ | · | ✓ |
| line-sheet | 375 | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ |

`home`·`settings`는 표본이라 검사하지 않는다(`·`). 버튼 높이 열은 `after`만. 라이트 행도 다크와 같다. 실패 상세 예: `editor-full 390 · 제목 한 줄: 제목 높이 162 / 줄 41`, `글자 잘림: input "Day 1 — Push" (104>72) · div "1. 인클라인 프레스 A" (150>46)`, `line-sheet · 탭 영역: "팔" 36×44 왼쪽·오른쪽 · "등" 36×44 · 체크박스 13×13`.

### 알려 둘 것

- `머리 줄`은 `before`에서 ✓다(세 요소가 세로로 쌓여 서로 안 겹친다). 깨짐은 `제목 한 줄`이 잡는다. PLAN 기준대로 둔다.
- `탭 영역`은 체크박스(13×13)도 잰다. 예외 없음 규칙이라 OO3에서 통과시켜야 한다.
- `after`의 `버튼 높이`·흐름 검사 네 개는 아직 한 번도 실행하지 못했다(대상 화면이 아직 없다). OO3 구현자가 처음 돌릴 때 선택자가 안 맞으면 스크립트를 고친다.

### 실행 결과

- `npm test`: Test Files 60 passed (60), Tests 1538 passed (1538)
- `npm run build` 통과, `node scripts/quality-scan.mjs --ci` 통과
- 결함 복원: 해당 없음(앱 코드 무변경). 검사가 깨짐을 잡는다는 증거는 `before --check` 실패가 대신한다.

---

## OO1. React 18.3 → 19

| 항목 | 내용 |
|---|---|
| 바뀐 파일 | `package.json`, `package-lock.json`, `src/components/TabBar.tsx`, `src/screens/HomeScreen.tsx`, `README.md`, 이 문서 (6개) |
| 버전 | `react`·`react-dom` `^19.3.1`, `@types/react`·`@types/react-dom` `^19.3.0` |
| 코드 변경 | 전역 `JSX` 두 곳에 `import type { JSX } from 'react'` 추가. 그 밖 타입 오류 없음 |
| 테스트 | 추가·수정 없음(순수 함수·소스 스캔 테스트라 React 버전 무관) → 새 describe 없어 결함 복원 0건 |

### PLAN 검증 ↔ 확인

| PLAN 검증 | 확인 |
|---|---|
| `npm run build` 통과 | 통과 |
| `npm test` 수정 없이 통과 | 60 파일 / 1538 테스트 통과 |
| `home`·`settings`·`editor-full`(다크) `cmp` | `before`와 바이트 동일 3/3 (같은 날 2026-11-11). `after` 파일은 커밋하지 않고 지웠다 |
| 손으로 한 번씩(세션·분석·저장, 콘솔 경고) | **사람 확인 필요** — 이 구현자는 실기기·수동 흐름을 못 돌렸다 |

실행 결과: `Test Files 60 passed (60)` · `Tests 1538 passed (1538)` · 빌드 성공 · `quality-scan` 통과.

---

## OO2. Astryx 바탕

| 항목 | 내용 |
|---|---|
| 바뀐 파일 | `package.json`, `package-lock.json`, `src/main.tsx`, `src/lib/inputProps.ts`, `README.md`, 새 `src/styles/index.css`, `src/ax/index.tsx`, `src/ax/ax.css`, `src/ax/clampStep.ts`, `src/lib/v117.test.ts`, 이 문서 |
| 버전 | `@astryxdesign/core`·`@astryxdesign/theme-neutral` `0.7.13`, `@stylexjs/stylex` `0.19.1` (모두 정확한 버전). `astryx init`·`@astryxdesign/cli` 안 씀 |
| 화면 | 쓰는 화면이 없다 → 번들에 안 실린다. `home`·`settings`·`editor-full`(다크) `after`를 `before`와 `cmp`: 3/3 바이트 동일. `after` 파일은 지웠다 |

### PLAN 검증 ↔ 테스트 (`src/lib/v117.test.ts`, describe `OO2`, 11개)

| PLAN 검증 | 테스트 |
|---|---|
| 버전 고정·같음·stylex | `package.json: Astryx 두 패키지는 0.7.13 …` |
| `clampStep` 다섯 값 | `clampStep: 경계와 스텝` |
| `clampStep.ts` 무Astryx, 테스트가 ax 진입점을 안 읽음 | `clampStep.ts는 Astryx도 ./index도 …` |
| `AX_NO_AUTOFILL`이 `NO_AUTOFILL`을 따름 | `AX_NO_AUTOFILL은 NO_AUTOFILL을 따른다` · `… 정의는 NO_AUTOFILL.을 네 번 …` |
| `TextInput`·`NumberInput` 재내보내기 없음 | `src/ax/index.tsx는 TextInput·NumberInput을 다시 내보내지 않는다` |
| `isIconOnly`에 `icon=`, 감소·증가 이름 | `isIconOnly 버튼마다 같은 태그 안에 icon=이 있고 …` |
| Astryx import는 `src/ax/`만 | `@astryxdesign/을 import하는 파일은 src/ax/ 밖에 없다` |
| `main.tsx`·`App.tsx` 정적 import 없음, `index.css` | `main.tsx·App.tsx는 Astryx를 정적으로 읽지 않고 …` |
| `mode="system"`, reset/fonts 없음 | `AxRoot는 mode=system만 쓰고 …` |
| `TextField`·`Stepper` 억제 | `TextField·Stepper 정의에 자동완성 억제가 있다` |
| 빌드 출력의 `@layer` | 아래 |
| dev 서버 `legacy` 레이어 | 아래 |

### 빌드 출력 (`npm run build` 뒤 `dist/assets/index-*.css`)

```
@layer reset,legacy,astryx-base,astryx-theme;@layer legacy{:root{--bg: #0b0b0d;...
처음 나오는 @layer = "reset,legacy,astryx-base,astryx-theme"
legacy 블록 안: .btn{ True / .screen{ True  ·  블록 밖: .btn{ False / .screen{ False
```

dev 서버(Playwright, `vite createServer`)의 `document.styleSheets`: `[{"name":"legacy","hasBtn":true}]`.

### PLAN과 다르게 한 것

| PLAN | 실제 | 이유 |
|---|---|---|
| `<SizeProvider size="lg">` | `<SizeProvider value="lg">` | `SizeContext.d.ts`: `Provider<ElementSize \| null>`. 타입 선언이 맞다 |
| `Theme` import 경로 `…/core/Theme` 가정 | `@astryxdesign/core/theme` | `package.json` exports·README가 소문자 `theme` |
| `Stepper`의 `NumberInput`에 `autoComplete="off"` | `{...NUMBER_AUTOFILL}` (`AX_NO_AUTOFILL.autoComplete`에서 파생) | 기존 `inputProps.test.ts`의 X5·Y2 스캔이 소스의 `autoComplete=`를 전부 막는다. 값은 여전히 `NO_AUTOFILL` 한 곳에서 온다. 스캔 테스트는 안 고쳤다 |
| "빌드 확인"(`light-dark(`·`@scope` 남음) | **OO3에서 확인** | PLAN이 지연 청크가 생긴 뒤라고 했다. 지금은 `src/ax/`를 읽는 화면이 없어 Astryx CSS가 번들에 없다(`npm run build`의 `index-*.css`는 `global.css`뿐) |
| 원본의 `[data-astryx-media="dark"\|"light"]` color-scheme 두 규칙 | 옮기지 않음 | PLAN 표에 없고 이 앱은 `data-astryx-media`를 쓰지 않는다. `color-scheme`은 "문서 바탕"이 맡는다 |
| 범위 한정 리셋 | 원본 선택자·값 그대로, `:where([data-astryx-theme])` 범위만 앞에 붙임 (`:where(x)` → `:where([data-astryx-theme]) :where(x)`로 명시도 0 유지) | 리뷰 반려 1: 앞선 사본은 placeholder·`[type=search]`·`[list]` 값이 달랐고 원본에 없는 속성을 더했다. 다시 옮김 |
| "legacy 누수 막기" 대조 | 대조하지 못함 | 쓰는 화면이 없어 계산된 스타일을 못 잰다. OO3 `--check`의 `버튼 높이`와 스크린샷으로 본다. 새는 속성이 보이면 `ax.css`의 같은 블록에 더한다 |

### 결함 복원

| # | 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|---|
| ① | `@astryxdesign/core`를 `^0.7.13`으로 | `package.json: Astryx 두 패키지는 …` | `cmp` 같음 |
| ② | `main.tsx`에 `import '@astryxdesign/core/astryx.css'` | `@astryxdesign/을 import하는 파일은 …` · `main.tsx·App.tsx는 …` | 같음 |
| ③ | `SettingsScreen.tsx`에 Astryx `Button` import | `@astryxdesign/을 import하는 파일은 …` | 같음 |
| ④ | `mode="system"` → `mode="dark"` | `AxRoot는 mode=system만 …` | 같음 |
| ⑤ | `clampStep`에서 `Math.min(max, …)` 삭제 | `clampStep: 경계와 스텝` | 같음 |
| ⑬ | `hasSpellCheck`를 `false` 리터럴로 | `AX_NO_AUTOFILL 정의는 NO_AUTOFILL.을 네 번 …` | 같음 |

(⑤는 처음에 sed가 문법을 깨서 파일 로드 실패였다 → 유효한 결함으로 다시 만들어 위 결과를 얻었다.) ⑥~⑫·⑭는 OO3 몫이다. ⑩(레이어 순서)은 화면이 없어 여기서는 빌드 출력 확인만 한다.

### 리셋 대조 (리뷰 반려 1) — 선언 `속성: 값`을 뽑아 정렬한 `diff 원본 사본` (`<` = 원본에만 있음)

```
16,21d15
< color-scheme: dark;
< color-scheme: dark;
< color-scheme: light dark;
< color-scheme: light dark;
< color-scheme: light;
< color-scheme: light;
38d31
< line-height: 1.5;
40d32
< line-height: inherit;
46d37
< margin: 0;
48d38
< -moz-osx-font-smoothing: grayscale;
58d47
< tab-size: 4;
66,68d54
< -webkit-font-smoothing: antialiased;
< -webkit-tap-highlight-color: transparent;
< -webkit-text-size-adjust: 100%;
```

빠진 것은 전부 "안 옮긴다" 행이다: `html`(`color-scheme`·`line-height: 1.5`·`tab-size`·`-webkit-text-size-adjust`·탭 하이라이트), `body`(`margin: 0`·`line-height: inherit`·글자 다듬기 둘), `html[data-theme=…]`·`[data-astryx-media]`의 `color-scheme`. 사본에만 있는 선언은 없다.

### 과거 판정 불변

`git diff --stat main..HEAD -- src/lib src/db`는 이 커밋 전까지 아무것도 없다(OO0·OO1은 `src/lib`을 안 건드림). 이 커밋에서 `src/lib`은 `inputProps.ts`(추가만)·`v117.test.ts`(새)만 바뀐다. 기존 테스트는 수정하지 않았다.

### 실행 결과

- `npm test`: Test Files 61 passed (61), Tests 1549 passed (1549)
- `npm run build` 통과, `node scripts/quality-scan.mjs --ci` 통과
- `package-lock.json`에 `lucide-react`가 들어왔다(theme-neutral의 의존성). 번들에 실리는지는 OO3 청크 표로 본다.
- 리뷰 반영: 반려 1 `ax.css` 리셋을 원본 `reset.css`와 대조해 다시 옮김(위 "리셋 대조"). 반려 6의 `git diff --stat` 출력은 최종 기록 커밋에서 붙인다.

---

## OO3. 루틴 편집 화면을 Astryx로

**결과: 완료 — 사람 결정 C로 시트의 탭 영역 기준을 완화해 `after --check` 종료 코드 0(최종 코드로 한 번, 같은 코드에서 앞서 세 번 더 0). 결함 복원 ⑩⑪⑭ 확인, `반복 최소/최대` 꺾임은 고쳤고, `package.json` 1.17.0으로 올렸다. 시트의 44px 미달 목록은 "사람 확인 필요"로 넘겼다.**

| 항목 | 내용 |
|---|---|
| 바뀐 파일 | `src/screens/RoutineEditorScreen.tsx`, `src/components/RoutineLineSheet.tsx`, `src/components/ExercisePickerSheet.tsx`, `src/App.tsx`(lazy+Suspense), `src/ax/index.tsx`(`Sheet`에 `SizeProvider`, `Stepper`에 `inputWidth`), `src/lib/v116.test.ts`(표의 두 줄), `src/lib/v117.test.ts`(describe `OO3`, 10개), `scripts/screenshots.mjs`(검사 보정), `README.md`(Limitations 한 줄), 이 문서, `docs/screenshots/v1.17/after-*` 22장 |
| 기존 테스트 | `v116.test.ts` 1064·1169줄만 `/btn-danger\|variant="destructive"/`로. 그 밖에는 안 고쳤다(NN4 `RoutineListPanel` 줄은 건드리지 않음) |
| 실행 결과 | `npm test`: Test Files 61 passed (61), Tests 1559 passed (1559) · `npm run build` 통과 · `quality-scan --ci` 통과 |
| 과거 판정 불변 | 아래 "과거 판정 불변 확인" 절 |

### PLAN과 다르게 한 것

| PLAN | 실제 | 이유 |
|---|---|---|
| `Item`의 `description`은 문자열 | `<>…</>`(ReactNode)로 감쌈 | 문자열 description은 Astryx가 한 줄로 자른다(`Item.tsx` `isStringDescription`). 잘림 검사가 잡았다. 문자열 `label`은 모두 짧아 그대로 |
| 나가기 확인 두 버튼 `width="100%"` 반반 | `style={{flex:'1 1 auto'}}` | 390px에서 `저장하지 않고 나가기`가 2px 모자라 잘렸다. 글자 폭이 먼저, 남는 폭만 나눈다 |
| `SegmentedControl`·`ToggleButton` 기본 크기 | `size="lg"`, 줄 시트 `방식`은 `layout="fill"` | 기본 28·32px라 탭 영역이 44에 못 닿는다. 붙어 있는 세그먼트는 가로로 못 늘어 `fill`로 폭을 키움 |
| 시트 안 버튼 크기 | `ax`의 `Sheet`가 `SizeProvider value="lg"`를 다시 건다 | 시트 안은 크기 기본값이 새로 시작해 `닫기`·`−`·`+`가 32px로 나왔다 |
| 간격 | 줄 시트 `VStack gap={5}`·칩 `gap={4}`·`Switch`는 `paddingBlock={2}`, 주간 목표 `gap={3}`, 고르기 목록 `gap={4}` | "붙은 컨트롤 8px 이상"을 넘겨 탭 영역을 얻으려고 넓힘 |
| 흐름 검사 4개 스크립트 | 아래 "스크립트 보정" | OO0 때 한 번도 못 돌려 본 선택자·타이밍 |
| `<Banner status="error">` (PLAN에 prop 없음) | `collapsible={false}`를 더함(편집 화면·종목 고르기 시트) | 리뷰 반려 1: 기본값이 접힘이라 `루틴 이름을 적어 주세요` 같은 문제 문구가 가려졌다 |

### PLAN과 다르게 한 것 — 사람 결정 (A)

| PLAN | 실제 | 이유 |
|---|---|---|
| `탭 영역`은 장면마다 가운데에서 21px 네 점의 `elementFromPoint` | **시트 장면(`line-sheet`·`line-sheet-end`·`picker-form`)만** 보이는 박스를 `--astryx-hit-inset-*`만큼 키운 상자(Astryx가 터치에서 넓혀 주는 누를 수 있는 영역)가 가로·세로 44px 이상인지 잰다. 값·위치가 400ms 가만해질 때까지 기다린 뒤 잰다. 편집 화면 본체의 기준(44px, 붙은 컨트롤 8px)은 그대로 | 사람 결정 A. 시트 안 측정이 실행마다 달라 판정이 흔들렸다 |

결정 A 직후의 결과(완화 전, 두 번 실행): 본체 장면 ✓. 시트 장면은 **여전히 실패, 단 1~4px 모자람**이고 `--check` 종료 코드 1이었다. 실패 목록(390 다크, 2회째): `햄스트링`·`둔근` 칩 → 41.3px(위 4/아래 1.3) · `세트 감소` 40.7 · `세트 증가` 42.7 · `휴식 증가` 42.0 · 스위치(트랙 40×24) 40.3 / `picker-form` 스위치 39.7. 375 다크: 칩 `상부가슴`·`가슴`·`측면어깨` 40.3, `직접 입력` 40.7, 방식 `A`·`B`·`코어`(28px) 41.6, 스위치 41.2. 1회째에는 `A`·`B`·`코어` 42.9 등 다른 자리가 걸렸다. 위·아래 inset의 한쪽이 4·8px 대신 0.3~2.7px 같은 소수로 줄어 있고 실행마다 어느 컨트롤이 그런지 바뀐다(값이 가만해진 뒤에도). 간격을 넓혀도 같았다(앞 기록). 이 부분이 Astryx 측정 쪽 동작인지 시트 배치 탓인지는 확인하지 못했다.

### PLAN과 다르게 한 것 — 사람 결정 (C) (결정 A를 이어서 완화)

| PLAN | 실제 | 이유 |
|---|---|---|
| `탭 영역` 모든 장면에서 44px, 예외 없음 | **시트 장면(`line-sheet`·`line-sheet-end`·`picker-form`)만:** 히트 영역(보이는 박스 + `--astryx-hit-inset-*`) 가로·세로 중 하나라도 **36px 미만이면 ✗**(눈에 보이는 박스 수준 = 진짜 깨짐), **36px 이상 44px 미만은 표에 `주의 n`으로 찍고 실패로 세지 않는다.** 측정값은 `주의 상세`에 그대로 찍는다. 종료 코드는 ✗만 센다. 편집 화면 본체(44px, 붙은 컨트롤 8px)는 그대로 엄격 | 사람 결정 C. 시트의 소수 inset이 실행마다 다른 컨트롤에서 1~4px 모자라 종료 코드가 흔들렸다. 실제 탭은 `pointerdown`에서 다시 재므로 손가락에는 영향이 작을 수 있어 실기기 확인(⑨)으로 넘긴다 |

이 기준으로 같은 코드에서 `--check`를 돌린 결과: 종료 코드 0 · ✗ 0개. `주의`는 실행마다 개수와 자리가 달라도(1~9개/장면) 종료 코드는 안 흔들렸다. 구현: `scripts/screenshots.mjs`의 `inPageTapArea`(`bad` 35.5px 미만 / `warn` 43.5px 미만)·`printResults`. 흔들리는 걸 가려 두는 것이 아니라 36px 아래로 떨어지는 진짜 깨짐은 여전히 잡힌다는 근거는 아래 결함 복원 ⑪(스위치가 35.3px로 ✗)다.

### 스크립트 보정 (`scripts/screenshots.mjs`, OO0이 "처음 돌릴 때 고친다"고 한 부분)

- 탭 영역: `scrollIntoView` 직후 바로 재면 Astryx가 아직 탭 영역을 안 잡은 상태(`--astryx-hit-inset-*` = 0)라 거의 다 실패했다. 잡힐 때까지 기다린다(화면 80ms, 시트 800ms — Astryx는 프레임당 4ms 예산으로 조금씩 잰다).
- `Switch`는 보이는 컨트롤이 트랙이고 탭 영역은 `input`이 아니라 `input`+트랙을 감싼 부모에 걸린다 → 그 부모로 포함 여부와 가운데를 잰다(입력칸은 트랙보다 크고 1px 어긋난다).
- 흐름 `시트 교체`: 머리 줄 `저장`을 재기 전에 맨 위로 스크롤(스크롤된 채면 화면 밖 점). 흐름 1·3은 내 종목을 `이 Day에서 빼기`로 닫는다(안 그러면 그 Day 목록에서 내 종목이 숨어 뒤 흐름의 `편집` 버튼이 없다). 실패 메시지는 8줄까지 보인다.

### `after --check` 결과 (마지막 실행)

흐름 검사:

| 흐름 검사 | 결과 | 상세 |
|---|---|---|
| 시트 교체 | ✓ | 교체 true · 닫힘 true · inert false · 저장 가운데 true · 스크롤 true |
| 바깥 탭 | ✓ | 목록 닫힘 true · 폼 유지 true · 뒤로 후 닫힘 true |
| 편집 → 뒤로 → 고르기 | ✓ | 목록 복귀 · 줄 시트 열림 |
| 긴 검색어 | ✓ | 가로 넘침 없음 true · 안내 true · 지우면 목록 true |

모양 검사(최종 코드): `가로 넘침`·`제목 한 줄`·`머리 줄`(375 포함)·`글자 잘림`·`입력 글자`·`마지막 줄`·`버튼 높이`는 **전 장면 ✓**. `editor-full`·`editor-leave`·`editor-problems`·`editor-long`의 `탭 영역`도 ✓(375 포함). 시트 장면의 `탭 영역`: ✗ 0개, `주의`만(아래 "사람 확인 필요"). 종료 코드 0.

### 줄 시트 라이트 — `반복 최소`·`반복 최대` 꺾임

전: 이름이 `반복 최` / `소`로 글자 중간에서 두 줄로 꺾였다(깨짐으로 보고 고침). 스테퍼의 입력칸이 199px로 이름 자리를 먹었다. 고침: 이름 `<Text textWrap="nowrap">`, 줄 시트의 네 스테퍼에 `inputWidth={160}`(`ax`의 `Stepper`에 선택 prop, `NumberInput`의 `width`). 후: 네 줄 모두 이름이 한 줄이고 `−`·입력칸·`+`가 같은 세로선에 선다(`after-line-sheet-end-light.png`로 확인). 처음에 `nowrap`만 넣었더니 입력칸이 안 줄어 두 줄의 `+`가 7px 튀어나와, 폭을 줄이는 것까지 같이 했다. 주간 목표 `Stepper`(편집 화면 본체)는 `inputWidth`를 안 줘서 그대로다.

### 사람 확인 필요 (실기기)

시트의 탭 영역 `주의` 목록(`--check` 마지막 실행, 390 다크 `line-sheet`; 라이트·375·`line-sheet-end`는 같은 컨트롤이 소수 오차만 다르게 나온다). 측정값 = 보이는 박스 + `--astryx-hit-inset-*`, 44px 미만만 적었다. 모두 36px 이상이라 ✗가 아니다.

| 컨트롤 | 보이는 박스 | 히트 영역 |
|---|---|---|
| 부위 칩 `상부가슴`·`측면어깨` / `가슴` | 88×36 / 56×36 | 43.3 · 40.7(`햄스트링`·`둔근`) |
| 방식 `A`·`B`·`코어` | 115×28 | 114.7×42.8 |
| `세트 감소`·`세트 증가` | 36×36 | 44×40.7 · 44×42.7 |
| `반복 최소 감소`·`증가` | 36×36 | 44×41.2 · 44×43.2 |
| 스위치(`컨디션 좋을 때만`) | 40×24(트랙) | 44×38.2 (`picker-form`의 스위치 44×39.7) |
| 375: 칩 `이두`·`삼두`·`대퇴사두` · `반복 최대 증가` · `이 Day에서 빼기`·`닫기` | 36 높이 | 높이 40.5~43.5 · 41.2 · 42.8 |

어느 컨트롤이 모자라는지, 몇 px 모자라는지는 실행마다 바뀐다(위·아래 inset 한쪽이 4·8px 대신 소수로 줄어 있다. 원인이 Astryx의 4ms 분할 측정인지 시트 배치인지는 확인하지 못했다). 실제 탭은 `pointerdown`에서 다시 재서(`checkAtPress`) 손가락에는 영향이 작을 수 있다. **실기기 확인 ⑨**를 시트까지 넓힌다: 줄 시트의 `−`·`+`, 부위 칩, `A`·`B`·`코어`, 스위치가 엄지로 잘 눌리고 옆 컨트롤이 대신 눌리지 않는다(편집 화면의 ▲▼·`−`·`+`와 함께). 안 눌리는 자리가 있으면 그 컨트롤 간격을 키운다.

그 밖의 실기기 확인은 PLAN ①~⑧ 그대로다(이번에 하나도 못 했다).

### 결함 복원 (PLAN ⑩⑪⑭, `cp` 백업 → 결함 → `after --check` → 원복 → `cmp`)

| # | 되살린 결함 | 결과 | 원상복구 |
|---|---|---|---|
| ⑩ | `src/styles/index.css`의 `@layer reset, legacy, astryx-base, astryx-theme;`에서 `legacy`를 맨 뒤로 | **`--check` 종료 코드 0 — 모양 검사가 못 잡는다**(`버튼 높이`·`머리 줄` 등 전 장면 ✓). 빌드 CSS의 처음 `@layer`는 `@layer reset,astryx-base,astryx-theme,legacy;`로 바뀌어 OO2의 "처음 나오는 `@layer`" 빌드 확인(기대 `reset,legacy,astryx-base,astryx-theme`)이 실패한다. 자동 테스트(`v117`)도 이 줄은 안 잡는다(`npx vitest run src/lib/v117.test.ts` 통과). **스크린샷·빌드 출력 확인으로만 보인다.** Astryx 버튼의 배경·테두리가 사라지는지는 스크린샷을 따로 안 봤다 | `cmp` 같음, `git status` 깨끗 |
| ⑪ | `src/ax/ax.css`에서 `[data-astryx-theme] button { min-height: 0 }` 블록 삭제 | `--check` 종료 코드 1. `버튼 높이`가 전 장면 ✗(`editor-full`: 89개 중 89개, `"‹ 취소" 높이 44.0` · `"Day 위로" 44.0×44.0`). 덤으로 시트 `탭 영역`도 ✗ 1개(스위치 44×35.3 — 36px 미만이라 결정 C 아래서도 잡힌다) | `cmp` 같음 |
| ⑭ | `RoutineEditorScreen.tsx` 종목 줄 `HStack gap={2}`를 `gap={0}`으로(▲▼ 사이·이름과 ▲ 사이 간격 0) | `--check` 종료 코드 1. `editor-full`·`editor-leave`·`editor-problems`·`editor-long`의 `탭 영역` ✗(`editor-full`: 124개 중 44개, `"종목 아래로" 36×36 왼쪽 · "종목 위로" 36×36 오른쪽`) | `cmp` 같음 |

⑦은 앞에서 적은 대로 `v116` 스캔이 못 잡고 `v117` OO3 테스트가 잡는다.

### 과거 판정 불변 확인

`git diff --stat main..HEAD -- src/lib src/db`(이 기록 커밋 전, 출력 그대로):

```
 src/lib/inputProps.ts |  11 +++
 src/lib/v116.test.ts  |   4 +-
 src/lib/v117.test.ts  | 230 ++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 243 insertions(+), 2 deletions(-)
```

`inputProps.ts`·`v116.test.ts`·`v117.test.ts`만이다. 골든 테스트는 수정 없이 통과(`Tests 1559 passed`). 바뀌는 것은 PLAN의 "과거 판정 불변" 표 그대로다. 이 기록 커밋은 `src/lib`을 더 안 건드린다.

### 배포 영향

- 루틴 편집 화면과 그 시트 둘이 Astryx 부품으로 바뀐다. 이 화면만 폰의 라이트/다크 설정을 따른다. 나머지 화면은 그대로다.
- React가 19로 올라간다. 기록·판정·내보내기·백업 형식은 그대로다.
- 아이폰 iOS 17.5 이상이 필요하다(루틴 편집 화면).
- 폰에서 볼 것: 설정 → 활성 루틴 `편집`. 제목·Day 이름·종목 이름이 잘리지 않는지, 한글 입력이 되는지, 키보드가 올라와도 시트 아래 버튼에 닿는지. 시트의 `−`·`+`·칩·스위치가 엄지로 잘 눌리는지.

### 마무리

- `npm test`: Test Files 61 passed (61), Tests 1559 passed (1559) · `npm run build` 통과 · `node scripts/quality-scan.mjs --ci` 통과
- `package.json`·`package-lock.json` `1.17.0`. `git rev-list --count main..HEAD`: 6(이 기록 커밋 전)
- ⑦: `v116` 스캔이 못 잡는다(앞 버튼의 `destructive`가 260자 창에 걸림 — `v117` OO3 테스트는 같은 `<Button` 태그 안만 보게 고쳐 잡는다).

### 빌드 출력

```
dist/assets/index-uhmhDGvT.css                  23.90 kB │ gzip:   5.28 kB
dist/assets/RoutineEditorScreen-VjYaYryv.css   299.02 kB │ gzip:  48.19 kB
dist/assets/index-j2nd1xWZ.js                  561.80 kB │ gzip: 183.89 kB
dist/assets/RoutineEditorScreen-BYpE6QhZ.js    651.25 kB │ gzip: 210.60 kB
```

Astryx CSS·JS는 지연 청크 `RoutineEditorScreen-*`에만 있다. 그 CSS의 `grep -o -F | wc -l`: `light-dark(` 255 · `@starting-style` 17 · `@scope` 4 · `@layer` 10 (낮춰 쓰지 않았다 — `cssTarget` 변경 불필요). 메인 `index-*` gzip은 OO1 때 값을 이 기록에서 못 찾아 나란히 적지 못했다(지금: js 183.89 kB, css 5.28 kB). `lucide`는 `RoutineEditorScreen-*.js`에 들어 있다(없애려 손대지 않음).

### legacy 누수 (OO2가 넘긴 것)

`버튼 높이` 검사가 전 장면 ✓(글자 버튼 36px, 아이콘 버튼 36×36 정사각, 글자 보임)라 `ax.css`의 `min-height` 규칙이 새는 legacy `.btn` 스타일을 막고 있다. `<button>`의 계산 스타일을 `.btn`과 대조하는 별도 측정은 하지 않았다.

### 장면 확인 (after 다크·라이트, 390; 보이는 것만)

editor-problems: 문제 문구(`루틴 이름을 적어 주세요`)가 배너 안에 보임 · 세로로 쌓인 제목 없음(`루틴 편집` 한 줄) · 머리 줄이 겹치지 않음(검사 ✓) · `Day 1 — Push` 다 보임 · 종목 이름이 줄바꿈되고 ▲▼가 화면 안(`editor-long` 긴 이름 두 줄) · ▲▼·`−`·`+`가 글자로 보임 · 라이트에서 글자 읽힘. 시트 마지막 버튼 가림 없음(`마지막 줄` ✓). 위 `반복 최소` 꺾임만 예외.

### 리뷰 반영 (반려 1)

| 항목 | 내용 |
|---|---|
| 고친 것 | `RoutineEditorScreen.tsx:237`·`ExercisePickerSheet.tsx:135`의 `<Banner>`에 `collapsible={false}`. 스캔 추가: `v117` OO3 "세 파일의 `<Banner` 태그마다 같은 태그 안에 `collapsible={false}`"(OO3 10개) |
| 결함 복원 | `ExercisePickerSheet.tsx`에서 `collapsible={false}` 제거 → 새 스캔 실패(`Tests 1 failed | 20 passed`) → `cp` 원복 → `cmp` 같음, `git status`에 의도한 변경만 |
| 장면 확인 | `after-editor-problems-{dark,light}.png`: 배너 안에 `루틴 이름을 적어 주세요`가 보임. `picker-form`·`settings`도 다시 찍혀 바뀜 |
| 실행 결과 | `npm test`: Test Files 61 passed (61), Tests 1559 passed (1559) · `npm run build` 통과 · `quality-scan --ci` 통과 |
| 경미한 점 | `editor-full`·`editor-long`의 회색 줄(hover)은 스크립트가 마우스를 옮기지 않아 그대로(앱 결함 아님). 메인 `index-*` gzip은 OO1 값을 못 찾음("OO1 때 안 잼"). ⑩ 배경·테두리 스크린샷 확인은 이번에도 안 함. `−` 글자 기준선은 그대로 |
