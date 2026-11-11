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
14. **새로 확인 (OO0 라운드):** 사람이 iOS 27(17.5 이상)을 확인했다 — Astryx 지원 조건 통과. Playwright 1.65.0 + chromium은 이 환경에서 받아졌고 `iPhone 14` 흉내(390×844, 터치, `pointer: coarse`)로 찍힌다(엔진은 chromium. webkit 아님). Playwright 기기 목록의 `iPhone 14` 뷰포트는 390×664라 844로 덮어썼다.
15. **새로 확인 (OO0 라운드):** `page.evaluate`로 보내는 함수는 바깥 스코프의 도우미를 못 본다 → 공유 도우미는 `addInitScript`로 `window.__vis`·`__scrollEnd`에 올려 쓴다.

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
