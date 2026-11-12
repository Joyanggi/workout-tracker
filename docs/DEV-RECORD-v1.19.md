# 개발·테스트 내역 (검토용) — v1.19 (QQ)

> PLAN-v1.19의 구현 기록. QQ0 → QQ1 → … 순서로 이어 쓴다.

## 이 환경에서 확인된 제약 (누적 — v1.18 목록을 이어받는다)



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


18. **새로 확인 (PP0 라운드):** Chromium의 CDP `Emulation.setEmulatedMedia`로 `prefers-reduced-transparency: reduce`와 `prefers-contrast: more`가 **둘 다 먹는다**(흉내 뒤 `matchMedia`가 `true`). 그래서 `투명도 줄이기`·`대비 증가` 검사는 건너뛰지 않고 실제로 잰다. 이 호출은 Playwright가 건 `prefers-color-scheme`을 덮으므로 `features`에 다크를 같이 넣는다.
19. **새로 확인 (PP0 라운드):** WebKit(Playwright webkit v2388, WebKit 27.2)은 `npx playwright install webkit`으로 받아졌고 Windows에서 `before-*-webkit.png` 열 장이 찍힌다. 흐림이 실제로 그려지는지는 PP1·PP2 뒤 `after-*-webkit.png`에서 본다(지금 앱은 시트가 불투명이라 가릴 것이 없다).
20. **새로 확인 (PP0 라운드):** vitest의 `.css` 읽기 결과(`?inline`)는 PP1에서 `glass.css`를 만든 뒤 확인한다. PP0은 CSS를 건드리지 않아 아직 모른다.
    → **PP1에서 확인:** `?inline`도 **빈 문자열**이다(`global.css`·`glass.css`·`index.css` 길이 0). 그래서 CSS 규칙 검사는 `screenshots-glass.mjs --check`의 정적 검사만 두고, `v118.test.ts`에는 `.tsx` 스캔만 둔다.
21. **새로 확인 (PP0 라운드):** Windows에서 Python으로 파일을 읽고 쓰면 CRLF가 된다(제약 17과 같다). 이번에도 스크립트 세 개가 CRLF로 바뀌어 `sed -i 's/\r$//'`로 되돌렸다. 파일 편집은 Edit 도구로 한다.

22. **새로 확인 (PP2 라운드):** 이 환경의 Playwright WebKit(Windows)은 `backdrop-filter`를 **그리지 않는다.** `after-*-webkit.png`에서 탭바·재개 스트립·시트 뒤의 글자가 흐려지지 않고 또렷하게 비친다(`after-home-resume-webkit.png`, `after-sheet-finish-webkit.png`). 계산된 스타일은 값을 갖고 있다. 그래서 WebKit 스크린샷은 "반투명, 흐림 없음"일 때의 모습이지 iOS Safari의 모습이 아니다. 흐림이 실제로 그려지는지는 Chromium 스크린샷과 실기기로만 본다.
23. **새로 확인 (PP2 라운드):** Astryx 입력칸(`TextInput`·`NumberInput`)의 면을 칠하는 것은 `input`이 아니라 감싸는 `div.astryx-text-input`이고 **알파 1**이다. 루틴 편집 시트의 `내용은 불투명`이 처음부터 통과했고(23·19·21개), PLAN이 예비로 둔 `ax.css`의 입력칸 규칙은 **넣지 않았다.**
24. **새로 확인 (PP2 라운드):** `screenshots.mjs`의 `--check` 장면 폭 375에서 시트 가운데 점이 입력칸 위에 떨어지면 `유리 켜짐`이 "안쪽이 면을 칠한다: div.astryx-text-input"로 거짓 실패했다. 입력칸 자체의 면은 의도한 불투명이라 `glass-check.mjs`가 `input`·`textarea`·`astryx-text-input`·`astryx-number-input`을 이 검사에서 센다고 하지 않게 고쳤다(스크롤 영역이 면을 칠하는 결함은 그대로 잡힌다 — 결함 복원 ⑤).


25. **새로 확인 (QQ0):** `@axe-core/playwright` `4.14.0`(2026-10-15 공개), `@argos-ci/cli` `6.11.0`을 devDependency로 고정했다. `onPointerDown` 요소는 `grep -rn onPointerDown src --include=*.tsx` 결과 2건(스테퍼 둘)으로 PLAN과 같다.
26. **새로 확인 (QQ0):** `reducedMotion: 'reduce'` 흉내(`page.emulateMedia`)가 이 Chromium에서 먹는다(`matchMedia` true). axe는 유리 위 글자 대비를 `incomplete`로 낸다(장면마다 2~59노드) — 그래서 `color-contrast`는 찍기만 하고 실패로 세지 않는다.
27. **새로 확인 (QQ0):** 눌림 검사의 `mouse.up`을 (2,2)에서 하면 legacy 시트의 막이 클릭을 받아 시트가 닫힌다(공통 조상 click). 화면 밖 `(-1,-1)`에서 하면 닫히지 않는다.
28. **새로 확인 (QQ0):** Astryx 화면(`editor`·`line-sheet`)에서는 `mouse.down`이 눌림 추적기를 칠하지 않는다(이 `iPhone 14` 흉내에서 `editor` 21개 중 7개만, `line-sheet` 29개 전부 변화 없음). PLAN 지시대로 두 장면의 `눌림 반응`은 `건너뜀`으로 두고(검사에서 뺀다) 멈추지 않았다.
29. **새로 확인 (QQ0):** `astryx-inventory`의 인라인 여백은 181곳(PLAN "약 180"과 같은 범위), `.tsx` 48개·Astryx 4개·인라인 273곳은 PLAN 표와 같다.

---

## QQ0. UI 검사 도구와 "바꾸기 전" 스크린샷

### 범위

| 커밋 | 바뀐 파일 | 비고 |
|---|---|---|
| (이 커밋) | `scripts/ui-check.mjs` · `scripts/lib/ui-check-lib.mjs` · `scripts/astryx-inventory.mjs` · `scripts/argos-upload.mjs` · `src/lib/v119.test.ts` · `docs/ASTRYX-INVENTORY.md` · `docs/screenshots/v1.19/before/` 20장 · `package.json`(devDependency 둘) · 이 기록 | 앱 코드(`src/`의 앱 파일) 무변경 |

### PLAN 검증 대응

| PLAN 검증 항목 | 확인 |
|---|---|
| `before`가 장면 전부를 찍는다 | `스크린샷 20장 → docs/screenshots/v1.19/before/` (다크 18 + `editor-light`·`line-sheet-light`) |
| Argos 올리기 + 토큰 없을 때 | 이 환경에 `ARGOS_TOKEN`이 없다 → `Argos 건너뜀: ARGOS_TOKEN 없음`, 종료 코드 0 확인. 올리기는 **사람 확인 필요**(토큰 준비 후 `node scripts/argos-upload.mjs before`) |
| 스캔 `v119.test.ts` describe `QQ0` | `argos-upload.mjs는 토큰을 명령줄(--token)로 넘기지 않는다` · `CI 워크플로에 argos가 없다` |
| `before --check`가 종료 코드 1 | 종료 코드 1. 아래 표 |
| 눌림 반응(`home`) 실패 | `home` 9/9건 실패(legacy 버튼 전부 변화 없음) |
| 움직임 줄이기(`sheet-finish`) 실패 | `sheet-backdrop 0.15s · sheet 0.2s` |
| 여백 격자(`session`) 실패 | `session`은 버튼 `padding 1px`·`.session-meta margin-top 1px` 등으로 실패. `.chip`(`padding 3px 9px`)은 `home`·`home-end`·`home-resume` 등에서 잡힌다 |
| `editor` 눌림 | 통과가 아니라 `건너뜀` — 제약 28 |
| axe 결과 복사 | 아래 |
| `astryx-inventory --write` 수 일치 | 제약 29 |
| `npm test`·`build`·`quality-scan` | 아래 실행 결과 |

### `before --check` 출력 (종료 코드 1)

| 장면 | 접근성 | 눌림 반응 | 움직임 줄이기 | 여백 격자 | 가로 넘침 | 유리 |
|---|---|---|---|---|---|---|
| home | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| home-end | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| sheet-home | 통과 | 실패 | 실패 | 실패 | 통과 | 통과 |
| session | 실패 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| home-resume | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| session-rest | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| sheet-finish | 통과 | 실패 | 실패 | 실패 | 통과 | 통과 |
| sheet-timer | 통과 | 실패 | 실패 | 실패 | 통과 | 통과 |
| summary | 통과 | 실패 | 건너뜀 | 실패 | 통과 | · |
| history | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| history-detail | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| analyze | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| diet | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| sheet-food | 실패 | 실패 | 실패 | 실패 | 통과 | 통과 |
| settings | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| settings-end | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| editor | 통과 | 건너뜀 | 건너뜀 | 통과 | 통과 | · |
| line-sheet | 통과 | 건너뜀 | 실패 | 통과 | 통과 | 통과 |

axe `serious`·`critical`(color-contrast 제외) — `before`에 이미 있는 위반이다. 고치지 않는다(범위 제외), `after`가 이보다 늘면 실패:

- `session`: `label-content-name-mismatch` 1건 (`button[aria-label="자리 없음 — 대체운동 고르기"]`)
- `sheet-food`: `label-content-name-mismatch` 10건 (`button[aria-label="반숙란 3개 추가"]` 등)

유리 칸의 상세(`--check` 출력 `상세:`에 장면마다 찍힌다. `내용은 불투명 건너뜀`은 그 장면에 해당 요소가 없다는 뜻, `탭바 자리`는 홈 장면 4곳에서만, `시트 비침`은 시트 장면에서만):

| 장면 | 유리 켜짐 · 내용은 불투명 · 한 겹 · 글자 대비 · 투명도 줄이기 · 대비 증가 · 탭바 자리/시트 비침 |
|---|---|
| home · home-end · home-resume | 통과 · 건너뜀 · 통과 · 통과 · 통과 · 통과 · 탭바 자리 통과 |
| sheet-home · sheet-finish · sheet-timer · sheet-food · line-sheet | (불투명은 sheet-home만 건너뜀) 나머지 통과 · 시트 비침 통과 |
| session · session-rest · history · history-detail · analyze · diet · settings · settings-end | 불투명은 history·analyze만 건너뜀, 나머지 전부 통과 (탭바 자리·시트 비침 칸 없음) |

### 결함 복원

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| `argos-upload.mjs`에 `--token` 인자 추가 | `v119 QQ0 argos-upload.mjs는 토큰을 명령줄(--token)로 넘기지 않는다` | `cp` 백업에서 되돌리고 `cmp` 같음 |

### 리뷰 반영 (반려 1·2)

- 1) `glassVerdict`가 `screenshots-glass.mjs`와 같은 방식(CDP `Emulation.setEmulatedMedia`)으로 투명도 줄이기·대비 증가·탭바 자리를 더한다. 표 결과는 이전과 같다(전부 통과).
- 제약: CDP 미디어 흉내를 한 번 걸었다 풀면 `line-sheet`(Astryx)의 글자 대비가 1.6:1로 잘못 잴 수 있다 → 글자 대비는 흉내를 걸기 전에 잰다.
- 2) `measurePress` 기본 대기를 160ms 고정에서 `--duration-fast`(계산값, 읽지 못하면 175ms) + 20ms로 바꿨다. `home`은 그대로 `변화 없음`으로 실패한다.

### 실행 결과

- `npm test`: `Test Files  64 passed (64)` · `Tests  1573 passed (1573)`
- `npm run build` 통과, `node scripts/quality-scan.mjs --ci` → `[quality-scan] 통과`

### 하지 않은 것 · 사람 확인 필요

- Argos 올리기: `ARGOS_TOKEN` 없음 → 건너뜀.
- `package.json` 버전은 기록 커밋(마지막)에서 올린다.
- `--press-shot` 옵션은 QQ2의 일이다.

---

## QQ1. 유리 재료 다시 잡기

### 새로 확인 (QQ1)

30. 흐림 값은 `var()` 없이 글자 그대로 적었다(`glass.css` 띠 `saturate(180%) blur(20px) brightness(0.6)`, 시트 `… brightness(0.5)`). `dist/assets/index-*.css`에서 `backdrop-filter`는 `-webkit-` 줄과 접두사 없는 줄이 둘 다 남고(아래 출력), `var(`는 선언 값에 없다. grep에 `var(` 1건이 나오는 것은 `@supports not (…) {html:root{--glass-bar: var(…)` 조건 글자가 걸린 것이다.
31. 진단 줄은 `SettingsScreen`이 마운트 때 한 번만 읽는다(`useState` 초기화). 설정 안에서 시트를 열면 한 겹 규칙이 탭바 흐림을 `none`으로 바꾸지만 줄은 안 바뀐다 — 선언 상태를 마운트 시점 그대로 보여 주는 것이 목적이다.
32. `glassDiag.ts`는 `backdrop-filter`를 글자로 적지 않는다: v118 PP1 스캔이 앱 코드 전체(주석 포함)에서 그 글자를 막기 때문이다. 속성 이름을 `['backdrop','filter'].join('-')`로 만들어 읽기만 한다. v118 테스트는 고치지 않았다.
33. 라이트 Astryx 시트: Astryx `Theme mode="system"`은 `data-theme`를 지우고 `color-scheme: light dark`로 둔다 → 라이트/다크를 `@media (prefers-color-scheme: light)`로 가른다. 뒤를 안 어둡게 하므로 면을 70%로 두껍게 해야 글자 4.5:1이 선다(50%에서는 `부위` 4.09:1 실패). 라이트 시트 면이 legacy 끄기 블록보다 위 레이어(`astryx-theme`)가 되므로 `ax.css` 끄기 블록 둘에도 `--glass-sheet: var(--glass-solid)`를 더했다(없으면 `대비 증가`에서 라이트 시트가 반투명으로 남는다).
34. `::backdrop`이 사용자 정의 속성을 물려받는지 못 믿어 `ax.css` 바텀 시트 막은 `rgba(0, 0, 0, 0.4)` 리터럴이다. 정적 검사가 `glass.css`의 `--glass-scrim` 알파와 같은지 본다. `dialog:has(.astryx-bottom-sheet)::backdrop`로 `astryx-theme` 레이어에 걸었다 — `line-sheet`의 `시트 비침`이 기준을 넘는 것으로 먹었음을 확인했다.
35. 정적 검사를 다시 쓰면서 `scripts/screenshots-glass.mjs --check`(v1.18 재현 도구)의 `staticChecks`도 바뀐다 — 같은 함수를 쓰기 때문이다. v1.18 시점 CSS에는 이제 맞지 않는다. 그 도구는 v1.19에서 쓰지 않는다(코드는 그대로 둠).
36. 새 검사 함수를 쓰다가 템플릿 문자열 안 정규식 백슬래시가 사라지는 일이 두 번 났다(`/brightness\(` → `/brightness(`). 검사 스크립트를 고칠 때는 Edit 도구로 직접 고치고, 고친 뒤 `staticChecks`를 실제 CSS에 한 번 돌려 `ALL PASS`와 결함 복원 실패를 눈으로 본다.

### 범위

| 커밋 | 바뀐 파일 | 비고 |
|---|---|---|
| (이 커밋) | `src/styles/glass.css` · `src/styles/global.css` · `src/ax/ax.css` · `src/lib/glassDiag.ts` · `src/lib/glassDiag.test.ts` · `src/lib/v119.test.ts` · `src/screens/SettingsScreen.tsx` · `scripts/lib/glass-check.mjs` · `scripts/ui-check.mjs` · `README.md` · `docs/DEV-RECORD-v1.19.md` · `docs/screenshots/v1.19/compare/` 9장 | 새 테스트 파일 1(`glassDiag.test.ts`) · 기존 `v119.test.ts`에 describe `QQ1` |

`docs/screenshots/v1.19/after/`는 QQ6까지 계속 덮어써지므로 이 커밋에 넣지 않았다(로컬에 20장 있다).

### 고른 값과 잰 값

| 무엇 | 값 | 잰 값 |
|---|---|---|
| 띠 | `--glass-bar: rgba(6, 6, 8, 0.5)` · 흐림 `saturate(180%) blur(20px) brightness(0.6)` | `띠 비침` 0.300 (기준 0.30) |
| 시트 (legacy·Astryx 다크) | `--glass-sheet: rgba(22, 22, 26, 0.5)` / Astryx는 `color-mix(… 50%)` · 흐림 `… brightness(0.5)` | `시트 비침` 0.50 × 0.60 × 0.5 = 0.150 (기준 0.15) |
| Astryx 라이트 시트 | 면 70%, 흐림 `saturate(180%) blur(20px)` | 0.30 × 0.60 × 1 = 0.180 |
| 막 | `--glass-scrim: rgba(0, 0, 0, 0.4)` (끄기에서 0.6) | — |
| 가장자리 빛 | `--glass-highlight: rgba(255, 255, 255, 0.22)` (끄기에서 transparent) | — |
| 지금 탭 알약 | `--glass-pill: rgba(0, 0, 0, 0.3)` + `border: 1px solid var(--glass-highlight)` | `알약 구별` 카드색 1.04:1 · 주황 1.29:1 → **테두리 쪽을 골랐다**(대비 1.2:1은 카드색 위에서 못 채운다). 정적 검사 `알약에 --glass-highlight 테두리가 있다`와 `알약 구별`이 테두리를 본다 |

- 띠 색을 카드색(22,22,26)에서 (6,6,8)로 낮춘 이유: 카드색이면 `이어서 ›`(주황 글자)가 초록 뒤에서 4.09:1로 4.5를 못 넘는다(`home-resume` 실패로 확인). 같은 비침(0.30)에서 띠 색이 어두울수록 합성이 어두워져 4.5 이상이 된다.
- 가장 낮은 `글자 대비`의 수치는 `--check`가 통과/실패로만 내보낸다(기준 4.5:1). 실패하는 방향의 수치는 결함 복원 표에 있다.

### PLAN 검증 대응

| PLAN 검증 항목 | 확인 |
|---|---|
| `glassDiag.test.ts` 다섯 갈래·우선순위·`none`/`null`/`''`·`흐림 선언됨`+sub·`켜짐` 없음 | `glassDiag.test.ts` (`it.each`로 `none`·`null`·`''`·공백 4건 포함) |
| v118 PP1 스캔 그대로 | `v118.test.ts` 통과(고치지 않음, 제약 32) |
| 스캔: `SettingsScreen`이 `glassDiagnosis`를 부르고 `유리` 줄 | `v119.test.ts` `QQ1 — 유리 재료 › SettingsScreen이 glassDiagnosis를 부르고 '유리' 줄을 가진다` |
| 정적 검사 6항목 | `ui-check.mjs after --check`의 `정적 검사 (QQ1)` 11줄 전부 통과 — 아래 |
| `--check` 장면 검사 | 아래 표: 유리 칸 전 장면 통과(`editor`·`summary`는 띠·시트 없음 `·`) |
| 빌드 출력 | 아래 |
| 눈으로 | 아래 |
| 비교 스크린샷 | `compare/` 9장: 고른 값 `0.5,0.5,0.4`, 띠만 `0.4`·`0.6` (`node scripts/ui-check.mjs after --glass=<띠>,<시트>,<막> --only=home,session,sheet-finish`, 파일 이름 `<장면>-b<띠>-s<시트>-m<막>.png`) |

### 정적 검사 출력 (`ui-check.mjs after --check`)

```
정적 검사 (QQ1):
- 통과 global.css·ax.css에 backdrop-filter는 none뿐(ax.css .astryx-bottom-sheet 규칙 예외)
- 통과 backdrop-filter 값에 var( 0건 (src/**/*.css 전체): 4개 파일 0건
- 통과 같은 규칙의 -webkit-backdrop-filter와 backdrop-filter 값이 같다
- 통과 시트 흐림: glass.css = ax.css 다크 (글자 그대로): saturate(180%) blur(20px) brightness(0.5)
- 통과 Astryx 라이트 시트 흐림 = 다크에서 brightness만 뺀 것: … → saturate(180%) blur(20px)
- 통과 막 농도: glass.css --glass-scrim = ax.css 바텀 시트 ::backdrop: glass 0.4 / ax 0.4
- 통과 glass.css 규칙 어휘 · 끄기 @media에 대비 증가 포함 · 끄기 블록 쌍 · 끄기 블록 넷의 조건이 같다 · 알약 테두리
```

### `after --check` 표 (눌림·움직임·여백 실패는 QQ2·QQ4 몫이라 남는다. 이 작업은 `유리`·`접근성` 칸을 책임진다)

| 장면 | 접근성 | 눌림 반응 | 움직임 줄이기 | 여백 격자 | 가로 넘침 | 유리 |
|---|---|---|---|---|---|---|
| home · home-end · home-resume | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| sheet-home | 통과 | 실패 | 실패 | 실패 | 통과 | 통과 |
| session | 실패(전부터, `label-content-name-mismatch` 1건) | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| session-rest · history · history-detail · analyze · diet · settings · settings-end | 통과 | 실패 | 건너뜀 | 실패 | 통과 | 통과 |
| sheet-finish · sheet-timer | 통과 | 실패 | 실패 | 실패 | 통과 | 통과 |
| summary | 통과 | 실패 | 건너뜀 | 실패 | 통과 | · |
| sheet-food | 실패(전부터 10건) | 실패 | 실패 | 실패 | 통과 | 통과 |
| editor | 통과 | 건너뜀 | 건너뜀 | 통과 | 통과 | · |
| line-sheet | 통과 | 건너뜀 | 실패 | 통과 | 통과 | 통과 |
| line-sheet-light | · | · | · | · | · | 통과 (라이트 장면은 유리 칸만 잰다 — `ui-check`에 새로 더함) |

axe `serious`·`critical`은 `before`와 같다(`session` 1건, `sheet-food` 1건. QQ0 목록 그대로, 늘지 않음). 종료 코드 1은 QQ2·QQ4 몫 칸 때문이다.

### 빌드 출력

```
$ grep -oE "(-webkit-)?backdrop-filter:[^;}]*" dist/assets/index-*.css | sort | uniq -c
      3 backdrop-filter:none
      1 backdrop-filter:saturate(180%) blur(20px) brightness(.5)
      1 backdrop-filter:saturate(180%) blur(20px) brightness(.6)
      3 -webkit-backdrop-filter:none
      1 -webkit-backdrop-filter:saturate(180%) blur(20px) brightness(.5)
      1 -webkit-backdrop-filter:saturate(180%) blur(20px) brightness(.6)
```

### 눈으로 (Chromium, `after/*.png`)

- `home`: 탭바 뒤로 아래쪽 카드의 오른쪽 숫자가 아주 희미하게 번져 보인다. 대부분 카드색이라 거의 안 보인다 — 비침이 보이는 것은 주황·초록 요소가 뒤에 올 때다.
- `session`: 스크롤 0이라 상단 바 뒤에 아무것도 없어 안 보인다(스크롤한 장면은 사람이 폰으로 본다).
- `sheet-finish`: 시트 뒤의 세션 화면이 덜 어둡고 카드·상단 바 윤곽이 어렴풋이 비친다. 오른쪽에 초록 체크 버튼이 희미한 초록 얼룩으로, 아래쪽에 주황 번짐이 보인다. 시트 위쪽 가장자리에 1px 밝은 선이 보인다.
- 이 Chromium 캡처는 iOS Safari가 아니다(제약 16). 실제로 그려지는지는 사람이 폰에서 `compare/`와 함께 본다.

### 결함 복원

| 되살린 결함 | 실패한 검사 | 원상복구 |
|---|---|---|
| ① `glass.css` 띠 흐림 값을 `var(--x)`로 | 정적 `backdrop-filter 값에 var( 0건` | `cp` 백업 + `cmp` 같음 |
| ② `global.css` `.tabbar`에 `backdrop-filter: blur(4px)` | 정적 `none뿐` · `두 접두사 값이 같다` | 〃 |
| ③ `--glass-bar` 알파를 0.78로 | `home` `띠 비침`: `(1−0.78)×0.6=0.132` | 〃 |
| ④ `--glass-scrim`을 0.6으로 | `sheet-finish` `시트 비침`: 0.100 | 〃 |
| ⑤ `--glass-pill`을 흰빛 0.08로 | `home` `글자 대비`(알약 위): "홈" 3.88:1 | 〃 |
| ⑤-2 `--glass-pill`을 띠 배경색과 같게 + 테두리 삭제 | `home` `알약 구별`: 카드색 1.01:1 · 테두리 없음 | 〃 |
| ⑤-3 `ax.css` 라이트 시트 흐림에 `brightness(0.5)` | 정적 `Astryx 라이트 시트 흐림 = 다크에서 brightness만 뺀 것` | 〃 |
| 알약 `border` 삭제 | 정적 `알약에 --glass-highlight 테두리가 있다` | 〃 |
| `ax.css` 끄기 블록 한쪽 선언 변경 | 정적 `끄기 블록 쌍` | 〃 |
| `glassDiag`가 `흐림 선언됨` 대신 `켜짐`을 냄 | `glassDiag.test.ts` 2개 | 〃 |
| `SettingsScreen`에서 `glassDiagnosis` 호출 제거 | `v119.test.ts` `QQ1` | 〃 |

### 과거 판정 불변

QQ1은 `src/db`·`src/store`·기록 해석 규칙을 건드리지 않았다. `src/lib`에는 새 파일(`glassDiag.ts`·`glassDiag.test.ts`)만 더했다.

### 실행 결과

- `npm test`: `Test Files  65 passed (65)` · `Tests  1585 passed (1585)`
- `npm run build` 통과 · `node scripts/quality-scan.mjs --ci` → `[quality-scan] 통과`
- `git rev-list --count main..HEAD` → 4 (이 커밋 포함)

### 사람 확인 필요

- 실기기 ①②③⑤⑥⑧(PLAN "실기기 확인") — 폰에서 `compare/` 세 벌과 함께 본다. 특히 ②: 탭바 뒤 글자가 번지는지(목표)·또렷한지(안 그려짐)·안 보이는지.
- Argos는 QQ0 결과 그대로(`ARGOS_TOKEN` 없음).

---

## QQ2. 움직임 토큰 + 눌림 반응 + 시트 들어오는 움직임 + 동작 줄이기

### 범위

| 파일 | 바뀐 것 |
|---|---|
| `src/styles/motion.css` (새) | 토큰 여섯(`--motion-fast` 125ms·`--motion-medium` 300ms·`--ease-enter`·`--ease-leave`·`--press-scale` 0.98·`--press-overlay`), 눌림 기본 규칙 하나, 알약·버튼 무리(크기 + 덮개), 띠 안 무리(안쪽 글자만 옅게), 시트·막 키프레임(`sheet-enter`·`scrim-enter`), `prefers-reduced-motion` 블록 |
| `src/styles/index.css` | `motion.css`를 `glass.css` 다음에 `layer(legacy)`로 |
| `src/styles/global.css` | 옛 `fade-in`·`slide-up` 키프레임과 두 `animation:` 줄 삭제(다른 곳에서 안 쓴다) |
| `src/main.tsx` | `document`에 빈 수동 `touchstart` 처리기 |
| `scripts/lib/ui-check-lib.mjs` | `motionStaticChecks`(정적 검사 다섯) 추가 · `inPagePressTargets`가 옛 `data-uic` 번호를 먼저 지움 · 눌림 스타일에 `childOpacity` 추가 · 시트 길이 검사는 legacy `.sheet`·`.sheet-backdrop`만 |
| `scripts/ui-check.mjs` | 정적 검사에 `motionStaticChecks` 이어 붙임 · 시트 길이 검사가 `skip`이면 실패로 세지 않음 |
| `src/lib/v119.test.ts` | describe `QQ2` 1개(스캔) |
| `README.md` | "iOS · PWA"에 눌림·움직임 항목 |

테스트 65 파일 / 1586개(QQ1 때 1585 → +1).

### 설계에서 어긋난 곳과 이유

- **띠 안 무리는 기본 규칙의 제외 목록에 넣었다.** PLAN은 "덮어쓰며 `background-image: none`"이라고 했지만, 같은 결과를 제외로 얻으면 `none`이 그 요소 자신의 배경 이미지를 지우는 일이 없다. 제외: `.tabbar button` `.resume-strip` `.rest-dismiss` `.session-minimize` `.back-link`.
- **띠 안 눌림 검사.** 탭바·재개 스트립은 버튼 자신이 아니라 안쪽 요소의 `opacity`가 바뀐다 → `inPagePressStyle`에 `childOpacity`를 더해 검사가 본다.
- **QQ0 도구 결함을 고쳤다.** 같은 페이지에서 장면을 이어 재면 앞 장면이 남긴 `data-uic` 번호가 남아 `querySelector`가 엉뚱한 요소를 집었다(전체 실행에서만 `home-end`·`sheet-*`·`settings-end`가 `변화 없음`으로 실패, 단독 실행은 통과). 호출 시작에 옛 번호를 지운다.
- **Astryx 시트의 움직임 줄이기는 검사 밖.** `line-sheet`에서 `.astryx-bottom-sheet`가 0.2s를 남겼다. Astryx가 자기 `reduced-motion` 규칙 65개로 정하는 부분이라 `ax.css`를 건드리지 않았고, 검사는 legacy `.sheet`·`.sheet-backdrop`만 잰다(PLAN QQ2의 규칙도 legacy 시트뿐). 폰에서 Astryx 시트가 거슬리면 새 작업.
- **움직임 줄이기에서 `transform: none`.** `--press-scale: 1`만으로는 계산값이 `matrix(1,…)`이라 검사가 크기 변화로 센다 → 블록에서 무리의 `:active` 변형을 `none`으로 둔다.

### 테스트·검사 이름과 PLAN 검증 대응

| PLAN 검증 | 어디서 |
|---|---|
| `main.tsx`에 `touchstart`·`passive: true` | `v119.test.ts` `QQ2 — 눌림·움직임` |
| 기본 규칙 `:where(button, [role=button])` + `.ax-screen`·`astryx-`·`.stepper` 제외 | 정적 검사 두 줄 |
| `prefers-reduced-motion` 있음 | 정적 검사 |
| 시트·막 키프레임이 `opacity`를 안 움직임 | 정적 검사(`sheet-enter`·`scrim-enter`) |
| `will-change` 0건 | 정적 검사(5개 파일) |
| 전 장면 `눌림 반응`·`움직임 줄이기` | 아래 표 |
| 기존 테스트 수정 없이 통과 | `timerOwnership`·`useRestTimer`·`polish`·`uiConsistency` 4파일 68개 통과 |

### `after --check` 표 (복사)

```
- 통과 눌림 기본 규칙: :where(button, [role=button]):active 하나
- 통과 기본 규칙에 Astryx(.ax-screen·astryx-)·.stepper 제외
- 통과 motion.css에 prefers-reduced-motion
- 통과 .sheet·.sheet-backdrop 키프레임이 opacity를 움직이지 않는다: sheet-enter · scrim-enter
- 통과 src/**/*.css에 will-change 0건: 5개 파일 0건

| 장면 | 접근성 | 눌림 반응 | 움직임 줄이기 | 여백 격자 | 가로 넘침 | 유리 |
| home | 통과 | 통과 | 건너뜀 | 실패 | 통과 | 통과 |
| home-end | 통과 | 통과 | 건너뜀 | 실패 | 통과 | 통과 |
| sheet-home | 통과 | 통과 | 통과 | 실패 | 통과 | 통과 |
| session | 실패 | 통과 | 건너뜀 | 실패 | 통과 | 통과 |
| home-resume | 통과 | 통과 | 건너뜀 | 실패 | 통과 | 통과 |
| session-rest | 통과 | 통과 | 건너뜀 | 실패 | 통과 | 통과 |
| sheet-finish | 통과 | 통과 | 통과 | 실패 | 통과 | 통과 |
| sheet-timer | 통과 | 통과 | 통과 | 실패 | 통과 | 통과 |
| summary | 통과 | 통과 | 건너뜀 | 실패 | 통과 | · |
| history · history-detail · analyze · diet | 통과 | 통과 | 건너뜀 | 실패 | 통과 | 통과 |
| sheet-food | 실패 | 통과 | 통과 | 실패 | 통과 | 통과 |
| settings · settings-end | 통과 | 통과 | 건너뜀 | 실패 | 통과 | 통과 |
| editor | 통과 | 건너뜀 | 건너뜀 | 통과 | 통과 | · |
| line-sheet | 통과 | 건너뜀 | 통과 | 통과 | 통과 | 통과 |
```

남은 실패: `여백 격자`는 QQ4·QQ5 몫. `접근성`의 `session`(`label-content-name-mismatch` 1건)·`sheet-food`(1건, 노드 10개)는 QQ2가 만든 것이 아니다(이 작업은 `aria-label`을 건드리지 않았다). 시트 장면에서 막이 다 칠해진 뒤 `유리 켜짐`·`시트 비침` 통과(위 표의 `유리` 칸).

### 결함 복원

| 되살린 결함 | 실패한 검사 | 원상복구 |
|---|---|---|
| ⑥ `main.tsx`의 `touchstart` 줄 삭제 | `v119` QQ2 스캔 | `cp` 백업 + `cmp` |
| ⑦ 눌림 기본 규칙 삭제 | 정적 `눌림 기본 규칙` + `home` `눌림 반응`(`.card.today-card` 변화 없음, 1/9) | 〃 |
| ⑦-2 기본 규칙에서 Astryx 제외 삭제 | 정적 `Astryx·.stepper 제외` | 〃 |
| ⑧ `prefers-reduced-motion` 블록 이름 바꿔 끔 | 정적 `prefers-reduced-motion` + `sheet-home` `움직임 줄이기`(`sheet 0.3s` · `닫기` 크기 변화) | 〃 |
| ⑨ 막 키프레임을 `opacity`로 | 정적 `키프레임이 opacity를 움직이지 않는다` | 〃 |
| `will-change` 한 줄 추가 | 정적 `will-change 0건` | 〃 |

### 과거 판정 불변

`git diff --stat main..HEAD -- src/db src/store` 출력 비어 있음. QQ2는 `src/lib`에 `v119.test.ts` 한 파일만 고쳤다(기존 파일에 describe 추가).

### 실행 결과

- `npm test`: `Test Files  65 passed (65)` · `Tests  1586 passed (1586)`
- `npm run build` 통과 · `node scripts/quality-scan.mjs --ci` → `[quality-scan] 통과`
- `git rev-list --count main..HEAD` → 6 (이 커밋 포함)

### 하지 않은 것

- 비활성 버튼 경계: `sheet-finish`의 비활성 버튼 장면 없음(검사가 `disabled`를 빼므로 따로 못 쟀다) — 장면 없음.
- `--press-shot` 눌림 스크린샷: 화면 검증자 몫.

### 리뷰 반영

- 휴식 바 진행 채움이 움직임 줄이기에서도 움직이는지 쟀다(`reducedMotion: 'reduce'`, `matchMedia` 일치 확인, `session-rest`에서 2초 간격 두 번). `.rest-progress`:

| 시점 | `transform` | 폭 |
|---|---|---|
| 첫 번째 | `matrix(0, 0, 0, 1, 0, 0)` | 0px |
| 2초 뒤 | `matrix(0.0133333, 0, 0, 1, 0, 0)` | 5.2px |

  두 값이 다르다 → 줄이기에서도 채움이 움직인다(PLAN 경계 충족). 스크린샷 `.reports/qq2-rest-reduce-1.png`·`-2.png`, 측정 스크립트 `.reports/qq2-rest-motion.mjs`(`.reports`는 git 무시).
- `남은 실패`의 `sheet-food` 접근성을 1건(규칙 1개, 노드 10개)으로 맞췄다. `.reports/qq2-after-check.log`의 `sheet-food: serious·critical 1건`, QQ1 절, 화면 검증 보고(1건)와 같다.

### 사람 확인 필요

- 실기기 ④⑤⑦: 버튼을 누르면 바로 반응하는지(iOS `:active`와 빈 `touchstart` 처리기), 목록 스크롤 때 눌린 채 남지 않는지, 시트가 아래에서 올라오는지·버벅이지 않는지, 동작 줄이기에서 작아지지 않고 올라오지 않는지.

---

## QQ3. legacy 시트를 틀 하나로 + 닫히는 움직임

### 범위

| 파일 | 바뀐 것 |
|---|---|
| `src/components/SheetFrame.tsx` (새) | 막 → 시트 → 손잡이 DOM과 닫히는 흐름. 막 누름·`dismiss()` → `is-closing` → `animationend` 또는 350ms 안전장치 → `once`로 감싼 `onClose`. 움직임 줄이기면 바로 `onClose`. `children`은 노드 또는 `(dismiss) => 노드` |
| `src/lib/once.ts` (새) | `once(fn)` — 첫 호출만 통과 |
| `src/components/*Sheet.tsx` 14개 | 껍데기를 `<SheetFrame label onClose>`로. 닫기·취소 버튼은 `{(dismiss) => (<>…</>)}`로 감싸 `onClick={dismiss}`(13개). `TempoGuideSheet`는 닫기 버튼이 없어 노드 그대로. 동작 버튼의 `onClose()` 호출은 그대로 |
| `src/styles/motion.css` | `.sheet.is-closing`·`.sheet-backdrop.is-closing`(내려감·막 투명, `--motion-fast` `--ease-leave`, 닫히는 중 `pointer-events: none`), 키프레임 `sheet-leave`·`scrim-leave`, 움직임 줄이기 블록 |
| `scripts/ui-check.mjs` | `--check`에서 `sheet-finish` 뒤 흐름 셋(`closeFlows`) + 결과 표 아래 `흐름` 줄 |
| `src/lib/v119.test.ts` | describe `QQ3` 7개 |
| `src/lib/v118.test.ts` | PP2의 `it` 하나 삭제(아래) |

14개: AddExercise·Compensation·CompensationWatch·DayPicker·DietPlan·DietSlot·DietVariant·Finish·FoodLog·ManualTimer·OpenSession·Substitute·TempoGuide·WeightScale.
테스트 65 파일 / 1592개(QQ2 때 1586 → +7 −1).

### v118 PP2 스캔 삭제 (PLAN이 허용한 예외)

`v118.test.ts` PP2의 "`sheet-backdrop`을 쓰는 시트 파일 14개 전부가 `className="sheet"`를 가진다"를 지웠다(`it.skip` 아님). 그 파일이 이제 `SheetFrame.tsx` 하나라 `files.length`가 14 → 0으로 실패한다. 같은 사실은 `v119` QQ3 첫 두 스캔이 더 강하게 지킨다. 지운 자리에 "v1.19 QQ3 스캔으로 옮김 — `v119.test.ts`" 주석을 남겼고 커밋 메시지에도 같은 말을 적는다. 이 때문에 안 쓰게 된 `sheetFiles` 헬퍼도 지웠다. 같은 파일의 나머지 둘은 그대로다.

### PLAN 검증 ↔ 테스트

| PLAN 검증 | 테스트 (`v119.test.ts` QQ3) |
|---|---|
| legacy 14개가 `SheetFrame` import, `sheet-backdrop` 0건 | `legacy 시트 14개가 전부 SheetFrame을 import하고 …` |
| `sheet-backdrop`·`className="sheet"`·`sheet-grip`은 `SheetFrame.tsx` 하나 | `… .tsx는 SheetFrame.tsx 하나뿐이다` |
| `onClick={onClose}`·`() => onClose()` 0건 | `14개 시트에 onClick={onClose}·… 0건이다` |
| `useSheetDismiss` 0건 | `useSheetDismiss라는 이름이 src에 0건이다` |
| `SheetFrame`이 Astryx를 import하지 않음 | `SheetFrame.tsx가 ../ax·Astryx 패키지를 import하지 않는다` (패키지 이름은 쪼개 적었다 — v117 OO2 스캔이 이 파일을 세지 않게) |
| `once` 순수 부분 | `once는 두 번 불러도 한 번, 다른 인자로 불러도 한 번만 …` |
| (⑫ 대비) `once` 감싸기·움직임 줄이기·타이머 | `SheetFrame이 닫힘을 once로 감싸고 움직임 줄이기면 기다리지 않는다` |

`ui-check after --check --only=sheet-finish`: 흐름 `막 눌러 닫기`(`is-closing` 1개·막 사라짐·유리 켜짐) 통과 · `막 두 번 누르기`(오류 0건, 세션 화면 유지) 통과 · `움직임 줄이기에서 닫기`(두 프레임 뒤 막 없음) 통과. 접근성·눌림·움직임 줄이기·가로 넘침·유리 통과. `여백 격자`는 실패(`session-minimize` 1px 등 — 시트와 무관, QQ4·QQ5가 맞출 부분).

### 결함 복원

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ⑩ `DayPickerSheet`에 `sheet-backdrop` 글자 | `legacy 시트 14개가 …`, `… SheetFrame.tsx 하나뿐이다` | `cmp` 같음 |
| ⑪ `FinishSheet` 닫기 버튼을 `onClick={onClose}`로 | `14개 시트에 onClick={onClose}·… 0건이다` | `cmp` 같음 |
| ⑫ `once(…)` 감싸기 제거 | `SheetFrame이 닫힘을 once로 감싸고 …` | `cmp` 같음 |

⑫: **흐름이 못 잡는다.** `FinishSheet`의 `onClose`는 멱등(상태를 닫기로 둘 뿐)이라 두 번 불려도 겉으로 안 보인다. 그래서 PLAN대로 `SheetFrame`에 대한 스캔 한 줄(위 마지막 행)을 더했다.

### 시트 위에 시트가 겹치는지

`grep`으로 14개 시트가 서로를 렌더하는지 확인했다: `*Sheet` 컴포넌트가 다른 `*Sheet`를 import하는 곳은 없다(화면이 시트를 하나씩 띄운다). 겹치는 경우가 없어 흐름을 더하지 않았다.

### 과거 판정 불변

`git diff --stat main..HEAD -- src/db src/store` 출력 비어 있음. `src/lib`에는 새 파일 `once.ts`와 테스트만(`v118.test.ts`는 위 스캔 하나).

### 실행 결과

- `npm test`: `Test Files  65 passed (65)` · `Tests  1592 passed (1592)`
- `npm run build` 통과 · `node scripts/quality-scan.mjs --ci` → `[quality-scan] 통과`

### 하지 않은 것

- 키보드가 올라온 채 `sheet-food` 막 누르기: 장면에서 자동으로 재지 않았다(실기기 확인).
- 작업 트리에 있던 `docs/screenshots/v1.19/before/*.png` 변경(QQ0 이전부터 있던 것)은 커밋하지 않았다. `ui-check`가 덮은 `after/sheet-finish.png`는 되돌렸다.

### 사람 확인 필요

- 실기기 ⑤: 막을 누르거나 `닫기`를 누르면 시트가 내려가며 닫히는지, 닫히는 중 저장 버튼이 안 눌리는지, 키보드가 올라온 채 막을 눌러도 닫히는지(`sheet-food`).

## QQ4. 여백 토큰 한 벌 (CSS)

### 범위

| 커밋 | 바뀐 파일 | 비고 |
|---|---|---|
| (이 커밋) | `src/styles/space.css`(새) · `src/styles/index.css` · `src/styles/global.css` · `src/ax/ax.css` · `scripts/ui-check.mjs` · `scripts/lib/ui-space.mjs`(새) · `src/lib/v119.test.ts` · `README.md` · 이 기록 | `.tsx` 무변경. `npm test` 65파일/1595테스트 |

토큰 값(Astryx 단계에서 고름): `tight 4 < row 8 < group 12 ≤ card 12 < section 20` · `inline 8` · `inset-screen 16` · `inset-card 16`.
`.card`·`.screen`·`.sheet`·`.session-body`·`.session-header`·`.ax-screen`의 좌우, `.screen-title/.screen-sub/.card-label/.card`의 위아래가 토큰을 쓴다. `global.css` 나머지 여백 값 중 단계 밖(1·3·5·9·10·14·18px)은 가까운 단계로 옮겼다(1→2, 3→4, 5→4, 9→8, 10→8, 14→12, 18→16).

### 기록할 판단

| 항목 | 내용 |
|---|---|
| 표 밖 변경 1: `button { padding-block: 0 }` | 브라우저 기본 버튼 위아래 1px가 `여백 격자`를 20여 장면에서 깨뜨렸다. 높이는 `min-height: 44px`가 지켜 그대로다. 좌우 기본 6px는 단계 안이라 둔다 |
| 표 밖 변경 2: `.row-sub { margin: tight 0 group }` | `<p>`의 기본 아래 여백(1em = 13px)이 단계 밖이었다. 보이는 간격을 유지하려고 가까운 12px(`--space-group`)로 명시했다 |
| 표 밖 변경 3: `.session-body` 좌우 12 → `--inset-screen` | 세션 화면 좌우만 12px라 `화면 좌우` 비교에 걸렸다. PLAN 표가 "화면 좌우(탭 화면·**세션**·요약·루틴 편집)"라 적은 대로 16으로 맞췄다. `.session-header`도 같은 값 |
| `session-body` 아래 `96px` | 단계 밖이라 `48px + 48px`로 적고 이유 주석을 달았다(휴식 바 자리 값 그대로) |
| 정적 검사 위치 | `ui-check.mjs`에 더하지 않고 `scripts/lib/ui-space.mjs`로 뺐다(순수 함수 + 장면 측정). `.css`가 vitest에서 빈 문자열이라(제약 3) vitest 스캔은 그 검사가 `ui-check`에 물려 있는지만 잠근다 |
| `시트 좌우` 측정 | Astryx 시트는 1px 테두리가 있어 `clientLeft`를 빼고 잰다(테두리는 여백이 아니다) |

### PLAN 검증 항목 ↔ 확인

| PLAN 검증 | 어디서 |
|---|---|
| `space.css`가 `index.css`에 `layer(legacy)`로 import | 정적 검사 `space.css가 index.css에 layer(legacy)로 import` + vitest `ui-check 정적 검사가 space.css의 layer(legacy) import를 확인한다` |
| `global.css` 여백 값이 전부 Astryx 단계 | 정적 검사 `global.css 여백 값이 전부 Astryx 단계` (단계 밖 0건) |
| 틀 좌우가 `var(--inset-` | 정적 검사 `.screen·.ax-screen·.card·.sheet의 좌우 여백이 var(--inset-)` + vitest `…여백 값의 Astryx 단계·--inset- 사용·토큰 순서를 모두 본다` |
| 토큰 순서 | 정적 검사 `space.css 토큰 여덟 개가 단계 안이고 tight < row < group ≤ card < section` (4<8<12≤12<20) |
| 전 장면 `여백 격자` 통과 | `ui-check after --check`: 20장면 전부 `여백 격자` 통과 |
| `여백 한 벌` 화면 좌우 | 8장면 모두 x=16 |
| `여백 한 벌` 카드 사이 | 6장면 모두 12px (QQ5로 미루지 않아도 됨) |
| `여백 한 벌` 시트 좌우 | `sheet-finish`·`sheet-home`·`sheet-food`·`line-sheet` 모두 16 |

### 결함 복원

| 되살린 결함 | 실패한 검사 | 원상복구 |
|---|---|---|
| ⑭ `.card`의 `padding`을 `14px`로 | 정적 `여백 값이 단계 안`(126행 14px) · 정적 `var(--inset-)`(.card) | `cmp` 같음 |
| ⑮ `.ax-screen` 좌우를 `20px`로 | 정적 `.ax-screen 좌우가 --inset-screen` · `여백 한 벌 · 화면 좌우`(home 16 · editor 20) | `cmp` 같음 |

### 실행 결과

- `npm test`: `Test Files  65 passed (65)` · `Tests  1595 passed (1595)`
- `npm run build` 통과 · `node scripts/quality-scan.mjs --ci` → `[quality-scan] 통과`
- `ui-check after --check`: 정적 검사 전부 통과, `여백 격자`·`가로 넘침`·`유리` 전 장면 통과. 남은 실패는 QQ2 기록의 `접근성` 둘(`session` 1건, `sheet-food` 9건 — `label-content-name-mismatch`, QQ4와 무관)
- `git rev-list --count main..HEAD`: 11 (이 커밋 포함)

### 하지 않은 것

- `.tsx` 인라인 여백(QQ5).
- `docs/screenshots/v1.19/before/*.png` 작업 트리 변경(QQ0 이전부터)과 `ui-check`가 덮은 `after/*.png`는 커밋하지 않았다(`after`는 화면 검증자가 다시 찍는다).

### 실기기·화면 확인 목록

- 375 폭 `home`·`session`·`settings`·`sheet-finish`에서 여백이 눈에 띄게 달라진 곳(카드 안쪽 14→16, 칩 3·9→4·8)과 시트 끝까지 스크롤, 버튼 높이 44px 유지.
