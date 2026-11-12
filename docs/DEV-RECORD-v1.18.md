# 개발·테스트 내역 (검토용) — v1.18 (PP)


> PLAN-v1.18의 구현 기록. PP0 → PP1 → PP2 순서로 쓴다. 맨 끝 "배포 영향"·"실기기 확인"이 사람이 볼 것이다.

## 이 환경에서 확인된 제약 (누적 — v1.17 목록을 이어받는다)



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

18. **새로 확인 (PP0 라운드):** Chromium의 CDP `Emulation.setEmulatedMedia`로 `prefers-reduced-transparency: reduce`와 `prefers-contrast: more`가 **둘 다 먹는다**(흉내 뒤 `matchMedia`가 `true`). 그래서 `투명도 줄이기`·`대비 증가` 검사는 건너뛰지 않고 실제로 잰다. 이 호출은 Playwright가 건 `prefers-color-scheme`을 덮으므로 `features`에 다크를 같이 넣는다.
19. **새로 확인 (PP0 라운드):** WebKit(Playwright webkit v2388, WebKit 27.2)은 `npx playwright install webkit`으로 받아졌고 Windows에서 `before-*-webkit.png` 열 장이 찍힌다. 흐림이 실제로 그려지는지는 PP1·PP2 뒤 `after-*-webkit.png`에서 본다(지금 앱은 시트가 불투명이라 가릴 것이 없다).
20. **새로 확인 (PP0 라운드):** vitest의 `.css` 읽기 결과(`?inline`)는 PP1에서 `glass.css`를 만든 뒤 확인한다. PP0은 CSS를 건드리지 않아 아직 모른다.
    → **PP1에서 확인:** `?inline`도 **빈 문자열**이다(`global.css`·`glass.css`·`index.css` 길이 0). 그래서 CSS 규칙 검사는 `screenshots-glass.mjs --check`의 정적 검사만 두고, `v118.test.ts`에는 `.tsx` 스캔만 둔다.
21. **새로 확인 (PP0 라운드):** Windows에서 Python으로 파일을 읽고 쓰면 CRLF가 된다(제약 17과 같다). 이번에도 스크립트 세 개가 CRLF로 바뀌어 `sed -i 's/\r$//'`로 되돌렸다. 파일 편집은 Edit 도구로 한다.

22. **새로 확인 (PP2 라운드):** 이 환경의 Playwright WebKit(Windows)은 `backdrop-filter`를 **그리지 않는다.** `after-*-webkit.png`에서 탭바·재개 스트립·시트 뒤의 글자가 흐려지지 않고 또렷하게 비친다(`after-home-resume-webkit.png`, `after-sheet-finish-webkit.png`). 계산된 스타일은 값을 갖고 있다. 그래서 WebKit 스크린샷은 "반투명, 흐림 없음"일 때의 모습이지 iOS Safari의 모습이 아니다. 흐림이 실제로 그려지는지는 Chromium 스크린샷과 실기기로만 본다.
23. **새로 확인 (PP2 라운드):** Astryx 입력칸(`TextInput`·`NumberInput`)의 면을 칠하는 것은 `input`이 아니라 감싸는 `div.astryx-text-input`이고 **알파 1**이다. 루틴 편집 시트의 `내용은 불투명`이 처음부터 통과했고(23·19·21개), PLAN이 예비로 둔 `ax.css`의 입력칸 규칙은 **넣지 않았다.**
24. **새로 확인 (PP2 라운드):** `screenshots.mjs`의 `--check` 장면 폭 375에서 시트 가운데 점이 입력칸 위에 떨어지면 `유리 켜짐`이 "안쪽이 면을 칠한다: div.astryx-text-input"로 거짓 실패했다. 입력칸 자체의 면은 의도한 불투명이라 `glass-check.mjs`가 `input`·`textarea`·`astryx-text-input`·`astryx-number-input`을 이 검사에서 센다고 하지 않게 고쳤다(스크롤 영역이 면을 칠하는 결함은 그대로 잡힌다 — 결함 복원 ⑤).

---

## PP0. 유리 스크린샷·검사 도구와 "바꾸기 전" 스크린샷

### 범위

| 항목 | 내용 |
|---|---|
| 새 파일 | `scripts/lib/glass-check.mjs`(검사 함수 + 정적 검사), `scripts/screenshots-glass.mjs`(장면 열 + `--check` + `--engine=webkit` + `--sheet-alpha`) |
| 고친 파일 | `scripts/screenshots.mjs`: `--out <폴더>` 플래그 하나. 없으면 지금과 같다(`docs/screenshots/<ver>/`) |
| 스크린샷 | `docs/screenshots/v1.18/before-<장면>.png` 10장 + `before-<장면>-webkit.png` 10장 |
| 앱 코드 | 무변경(`src/` 0줄). `npm test`·`npm run build`·`quality-scan` 통과 |

PLAN과 다르게 한 곳: `screenshots.mjs`는 이미 `--ver`(저장 폴더 버전)가 있었다. PLAN의 `--out=<폴더>`는 `--ver` 아래 하위 폴더로 더했다(`--ver v1.18 --out editor` → `docs/screenshots/v1.18/editor/`). 이 플래그는 PP2에서 루틴 편집 시트를 찍을 때 쓴다.

### 검사를 PLAN 문장에서 구현한 방식 (리뷰어가 확인할 곳)

| 검사 | 구현에서 정한 것 |
|---|---|
| 내용은 불투명 | PLAN 문장 그대로 "처음 만나는 비투명 조상이 알파 1"로 하면 `.set-row`(알파 0.07, 아래는 불투명 카드)가 `before`에서도 실패한다. 그래서 **조상의 알파를 쌓아 가며(`Π(1−α)`) 0.5% 미만이 되면 불투명**으로 본다. **유리 층(`backdrop-filter`가 켜진 요소)에 닿으면 거기서 멈추고 실패**로 본다(그 면 뒤로는 화면이 비친다). 결함 복원 ⑨(`.field`를 투명으로)는 이 규칙으로도 잡힌다(시트 유리가 받침이 못 된다) — PP2에서 확인한다 |
| 글자 대비 | 시트 장면에서는 **자기 면이 있는 버튼 안 글자를 재지 않는다**(PLAN: "시트 면에 바로 놓인 글자"). 재면 `sheet-timer`의 눌린 칩(주황 면) 안 `기본` 라벨이 1.11:1로 실패한다 — 앱 기존 모습이고 PP1·PP2 범위 밖이다(아래 "리뷰어에게") |
| 투명도 줄이기·대비 증가 | 유리 층 전부(시트 장면에서는 아래 띠 포함)가 `backdrop-filter: none` + 알파 1이어야 통과 |
| 탭바 자리 | `home`·`home-end`·`home-resume`·`home-resume-end`에서만 잰다. 가림은 `*-end` 둘에서만 |
| 정적 검사 | `after`에서만 돈다. `before`는 `건너뜀`을 출력한다. 소스를 합성 문자열로 넣어 통과·실패 경로를 손으로 확인했다(`glass.css`가 아직 없어 실제 파일로는 못 돌린다) |

### 증거: `before --check` 출력 (종료 코드 1)

원문은 `.reports/pp0-before-check.txt`(git 제외). 장면 × 검사 표:

| 장면 | 유리 켜짐 | 내용은 불투명 | 한 겹 | 투명도 줄이기 | 대비 증가 | 글자 대비 | 시트 비침 | 탭바 자리 | 가로 넘침 |
|---|---|---|---|---|---|---|---|---|---|
| home | 통과 | 건너뜀 | 통과 | 실패 | 실패 | 통과 | · | 실패 | 통과 |
| home-end | 통과 | 건너뜀 | 통과 | 실패 | 실패 | 통과 | · | 실패 | 통과 |
| sheet-home | 실패 | 건너뜀 | 통과 | 실패 | 실패 | 통과 | 실패 | · | 통과 |
| session | 통과 | 통과 | 통과 | 실패 | 실패 | 통과 | · | · | 통과 |
| session-scrolled | 통과 | 통과 | 통과 | 실패 | 실패 | 통과 | · | · | 통과 |
| home-resume | 통과 | 건너뜀 | 통과 | 실패 | 실패 | 통과 | · | 실패 | 통과 |
| home-resume-end | 통과 | 건너뜀 | 통과 | 실패 | 실패 | 통과 | · | 실패 | 통과 |
| session-rest | 통과 | 통과 | 통과 | 실패 | 실패 | 통과 | · | · | 통과 |
| sheet-finish | 실패 | 통과 | 통과 | 실패 | 실패 | 통과 | 실패 | · | 통과 |
| sheet-timer | 실패 | 통과 | 통과 | 실패 | 실패 | 통과 | 실패 | · | 통과 |

(`건너뜀` = 그 장면에 입력칸·스테퍼·세트 줄이 없다.)

| PLAN이 요구한 실패 | 출력 | 판정 |
|---|---|---|
| `sheet-finish`의 `유리 켜짐` | `sheet backdrop-filter 없음 · sheet 배경 알파 1` | 실패 ✓ |
| `home`의 `탭바 자리` 좌·우·아래 8px | `좌 0 · 우 0 · 아래 0` | 실패 ✓ |
| `home-resume-end`의 `탭바 자리` 가림 | `마지막 내용 아래 752 · 스트립 위 744 (8px 가림)` | 실패 ✓ |
| `session`의 `대비 증가` | `session-header filter 남음 α0.9` | 실패 ✓ |

| PLAN이 "통과가 맞다"고 한 것 | 출력 | 판정 |
|---|---|---|
| `home`의 `글자 대비` | 10건 최소 4.84:1(PLAN 계산: 초록 위 4.84, 주황 위 4.97) | 통과 ✓ |
| `before`의 `한 겹` | 전 장면 통과 | ✓ |
| `before`의 `시트 비침` | 시트 α1 · 막 α0.6 → 0.000 (실패) | PLAN 예상대로 |

`home-resume-end`의 가림은 PLAN 진단이 말한 20px이 아니라 **8px**로 잰다. Playwright에서는 `.screen` 마지막 자식의 아래 끝(여백 제외)과 스트립 위 끝을 재기 때문이다. 검사가 실패를 잡는다는 증거로는 충분하다. 실기기 수치(20px)와 다른 것은 PP1의 "여백 52px 늘어남" 판단에 영향이 없다.

### 결함 복원

PP0은 테스트 묶음을 새로 만들지 않았다(검사 도구 자체가 산출물). 도구가 결함을 잡는다는 증거는 위 `before --check`의 실패 넷이다. PLAN의 결함 복원 ①~⑬은 `glass.css`·`global.css`가 생긴 PP1·PP2에서 한다.

### 실행 결과

| 항목 | 결과 |
|---|---|
| `npm test` | `Test Files  62 passed (62)` · `Tests  1568 passed (1568)` |
| `npm run build` | 통과 |
| `node scripts/quality-scan.mjs --ci` | `[quality-scan] 통과` |
| `git diff --stat main..HEAD -- src` | 출력 없음(앱 코드 무변경) |

### 하지 않은 것

- `--sheet-alpha`로 비교 스크린샷(`compare/`)은 아직 안 찍었다. PLAN은 PP2에서 농도를 정할 때 쓰는 도구로 둔다(CSS의 `--glass-sheet`가 생긴 뒤에야 비교가 뜻을 갖는다).
- `after-*` 스크린샷, `--engine=webkit`의 `after`는 PP1·PP2 뒤.

### 리뷰어에게

- 위 "검사를 PLAN 문장에서 구현한 방식"의 첫 둘(`내용은 불투명`의 알파 누적, `글자 대비`의 시트 면 글자만)은 PLAN 문장을 그대로 따르면 `before`에서 PLAN이 예상하지 못한 실패가 나서 한 해석이다. 틀렸으면 알려 달라.
- `sheet-timer`의 눌린 칩 안 `기본` 라벨(`.row-sub`가 주황 면 위 1.11:1)은 앱의 기존 문제다. 이 PLAN의 범위 밖이라 고치지 않았다.

---

## PP1. 유리 토큰 + 떠 있는 띠 넷

### 범위

| 항목 | 내용 |
|---|---|
| 새 파일 | `src/styles/glass.css`(토큰 8 + Astryx 규칙 + 끄기 `@media`·`@supports not`), `src/lib/v118.test.ts`(describe `PP1`, 테스트 1) |
| 고친 파일 | `src/styles/global.css`(띠 넷이 토큰을 읽음 · 탭바 캡슐 · 알약 · 스트립 캡슐 · 아래 여백 · `.rest-bar-done` 그라디언트), `src/styles/index.css`(`@import './glass.css'`), `README.md`(핵심 설계 결정 항목 + Limitations 한 줄), `scripts/screenshots-glass.mjs`(`--width=<px>` 플래그, 375px 경계 확인용) |
| 마크업 | 무변경(`.tsx` 0줄) |
| 스크린샷 | `docs/screenshots/v1.18/after-<장면>.png` 10장 |

### PLAN 검증 항목 대응

| PLAN 항목 | 테스트·증거 |
|---|---|
| `.ts(x)`에 `backdrop-filter` 없음 | `v118.test.ts` "앱 코드(테스트 제외)에 backdropFilter·WebkitBackdropFilter·backdrop-filter가 없다" |
| `?inline` 읽기 | 빈 문자열 → 제약 20 갱신, 정적 검사만 |
| `--check` 장면 통과 | 아래 표 (원문 `.reports/pp1-after-check.txt`, git 제외) |
| 빌드 출력 | 아래 |
| 경계 375px | `after --check --width=375`: `home`·`home-resume`·`session` 전 검사 통과. 탭 다섯 글자 잘림 없음(`탭바 자리` 44px·`가로 넘침` 통과). `after-*-w375.png`는 저장하지 않았다 |
| 기존 테스트 무수정 | `polish`·`timerOwnership`·`useRestTimer`·골든 수정 없이 통과 |

`after --check` (종료 코드 1 — 정적 검사 `:has(` 없음과 시트 장면 실패는 PP2 몫):

| 장면 | 유리 켜짐 | 내용은 불투명 | 한 겹 | 투명도 줄이기 | 대비 증가 | 글자 대비 | 시트 비침 | 탭바 자리 | 가로 넘침 |
|---|---|---|---|---|---|---|---|---|---|
| home | 통과 | 건너뜀 | 통과 | 통과 | 통과 | 통과 | · | 통과 | 통과 |
| home-end | 통과 | 건너뜀 | 통과 | 통과 | 통과 | 통과 | · | 통과 | 통과 |
| home-resume | 통과 | 건너뜀 | 통과 | 통과 | 통과 | 통과 | · | 통과 | 통과 |
| home-resume-end | 통과 | 건너뜀 | 통과 | 통과 | 통과 | 통과 | · | 통과 | 통과 |
| session | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 | · | · | 통과 |
| session-scrolled | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 | · | · | 통과 |
| session-rest | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 | · | · | 통과 |
| sheet-home·finish·timer | 실패 | (건너뜀·통과) | 통과 | 통과 | 통과 | 통과 | 실패 | · | 통과 |

글자 대비 최소: 탭 화면 4.61:1, 세션 화면 5.11:1(PLAN 계산 4.5 이상). `투명도 줄이기`는 Chromium이 흉내를 받아서(제약 18) 실제로 쟀고 통과했다.
정적 검사: `blur(` 0건 · `backdrop-filter` 8건 모두 `var(--glass-…)` · 끄기 `@media`에 대비 증가 포함 · 두 블록 같음 → 통과. `glass.css 규칙 어휘`만 `:has(` 없음으로 실패 — PP2의 "한 겹" 규칙이 넣는다.

빌드 출력: `dist/assets/index-*.css`에서 `--glass-bar` 19곳 · `prefers-reduced-transparency` 1 · `prefers-contrast` 1 · `-webkit-backdrop-filter` 5 · 접두사 없는 `backdrop-filter` 5(esbuild가 한쪽을 지우지 않았다).

### 결함 복원 (원문 `.reports/pp1-defects.txt`)

| # | 되살린 결함 | 실패한 검사 | 원상복구 |
|---|---|---|---|
| ① | 끄기 `@media`에서 `(prefers-contrast: more)` 삭제 | 정적 `끄기 @media에 대비 증가 포함` | `cmp` 같음 |
| ③ | `--glass-bar` 알파 0.5 | `home`·`home-end`·`home-resume-end`의 `글자 대비`(2.37~2.95:1) | 같음 |
| ⑥ | `.resume-strip`의 `bottom`을 옛 식으로 | `home-resume-end`의 `탭바 자리` 겹침(스트립 아래 788 · 탭바 위 780) | 같음 |
| ⑦ | `TabBar.tsx` `<nav>`에 `style={{ backdropFilter }}` | `v118` PP1 스캔 실패(1 failed) | 같음 |
| ⑧ | `.rest-bar`에 `backdrop-filter: blur(20px)` 리터럴 | 정적 `blur( 리터럴 0건`·`값이 var(--glass-…)` | 같음 |
| ⑩ | `.tabbar button`의 `color`를 `--text-faint`로 | `home`의 `글자 대비`(3.81:1 / 3.62:1 — PLAN 예상과 같다) | 같음 |
| ⑪ | `.app:has(.resume-strip) .screen` 규칙 삭제 | `home-resume-end`의 `탭바 자리` 가림(8px) | 같음 |
| ⑬ | `@supports not` 블록에서 `--glass-sheet-filter: none` 삭제 | 정적 `끄기 두 블록 선언 같음` | 같음 |

②④⑤⑨⑫는 시트(PP2) 몫이다. 복원은 PLAN 번호 그대로이고, 끝에 `cmp`로 `global.css`·`glass.css`·`TabBar.tsx`가 백업과 같음을 확인했다.

### 과거 판정 불변

`git diff --stat main..HEAD -- src`는 `src/styles/glass.css`·`index.css`·`global.css`·`src/lib/v118.test.ts`만 보인다(`.tsx` 0줄). 골든 테스트 수정 없이 통과.

### 실행 결과

| 항목 | 결과 |
|---|---|
| `npm test` | `Test Files  63 passed (63)` · `Tests  1569 passed (1569)` |
| `npm run build` | 통과 |
| `node scripts/quality-scan.mjs --ci` | `[quality-scan] 통과` |

### 하지 않은 것

- `rest-bar-done`(타이머를 짧게 돌려 끝난 상태)와 재개 스트립 `resume-rest-done`의 경계 장면은 찍지 않았다 → 실기기 확인으로 넘긴다.
- 세션 종류 칩(`복귀`·`디로드`) 장면은 찍지 않았다.
- `after-*-webkit.png`는 PP2 뒤 한 번에 찍는다.
- 실기기 확인 ①~⑩은 PP2 뒤 기록 커밋에 모은다.

---

## PP2. 바텀시트 + "한 겹" 규칙

### 범위

| 항목 | 내용 |
|---|---|
| 고친 파일 | `src/styles/global.css`(`.sheet`: `--glass-sheet`·`--glass-sheet-filter`·`border-top: --glass-edge`), `src/styles/glass.css`(`:root:has(.sheet-backdrop)` 한 겹 규칙, 끄기 규칙 앞), `src/ax/ax.css`(`astryx-theme` 레이어: 패널 유리 + 안쪽 스크롤 영역 투명), `src/lib/v118.test.ts`(describe `PP2`, 테스트 2) |
| 도구 | `scripts/screenshots.mjs`(시트 장면에 `유리 켜짐`·`내용은 불투명`·`시트 비침`. `glass-check.mjs` 함수를 그대로 부른다, `after`에서만), `scripts/lib/glass-check.mjs`(제약 24) |
| 스크린샷 | `after-*` 갱신 + `after-*-webkit` + `after-*-w375`, `compare/` 6장(0.86·0.72·0.60 × `sheet-finish`·`sheet-home`), `editor/` 24장(다크·라이트, 375 포함) |
| 마크업 | 무변경(`.tsx` 0줄). `src/ax/index.tsx` 무변경 |
| 커밋 | `d7a2c8a` (파일 54개 = 코드·도구 6 + 스크린샷 48) |

값은 PLAN대로다: 시트 알파 0.72(비교는 `compare/`에 남겼을 뿐 고르지 않았다). Astryx 규칙의 `72%`는 PP1이 `glass.css`에 이미 넣었다. PLAN과 다르게 한 곳은 없다. PLAN이 예비로 둔 Astryx 입력칸 규칙과 `72%` → `94%` 규칙은 필요하지 않아 넣지 않았다(제약 23, 아래 "구현 중에 확인한 것").

### PLAN 검증 항목 대응

| PLAN 항목 | 테스트·증거 |
|---|---|
| 시트 14개 전부 `className="sheet"` | `v118.test.ts` "sheet-backdrop을 쓰는 시트 파일 14개 전부가 className=\"sheet\"를 가진다" (14개를 센다) |
| Astryx `Sheet`가 `BottomSheet`에 `className`·`style`·`xstyle`을 안 넘김 | `v118.test.ts` "ax/index.tsx의 Sheet가 BottomSheet에 className·style·xstyle을 넘기지 않는다" |
| `after --check` 열 장면 통과, 종료 코드 0 | 아래 표. 시트 장면에서 `유리 켜짐`·`한 겹`·`내용은 불투명`·`시트 비침` 0.112·`글자 대비` 통과 |
| `screenshots.mjs after --check --out editor` 통과 | 모양 검사 여덟 + 흐름 검사 넷 통과, 종료 코드 0. 유리 검사 셋도 통과 |
| `line-sheet`·`picker-sheet`·`picker-form` 다크·라이트 커밋 | `docs/screenshots/v1.18/editor/` |
| 경계: 시트 위에 시트 | 흐름 검사 `시트 교체` 통과 |
| 경계: 키보드가 올라온 시트·시트 안 스크롤 | `picker-form`·`picker-sheet`·`sheet-finish`·`line-sheet-end` 통과 |
| 경계: 시트를 닫은 직후 아래 띠의 유리가 돌아온다 | 별도 장면으로는 재지 않았다. `sheet-finish`는 `session-rest` 다음 장면이고 `한 겹` 규칙이 `:has(.sheet-backdrop)`라 시트가 사라지면 같은 규칙이 풀린다는 것이 근거다(실기기 ⑦에서 본다) |

`after --check` (원문 `.reports/pp2-after-check.txt`, git 제외) — 종료 코드 0:

| 장면 | 유리 켜짐 | 내용은 불투명 | 한 겹 | 투명도 줄이기 | 대비 증가 | 글자 대비 | 시트 비침 | 탭바 자리 | 가로 넘침 |
|---|---|---|---|---|---|---|---|---|---|
| home·home-end | 통과 | 건너뜀 | 통과 | 통과 | 통과 | 통과 | · | 통과 | 통과 |
| home-resume·home-resume-end | 통과 | 건너뜀 | 통과 | 통과 | 통과 | 통과 | · | 통과 | 통과 |
| session·session-scrolled·session-rest | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 | · | · | 통과 |
| sheet-home | 통과 | 건너뜀(입력칸 없음) | 통과 | 통과 | 통과 | 통과 | 통과 | · | 통과 |
| sheet-finish·sheet-timer | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 | 통과 | · | 통과 |

정적 검사 다섯 전부 통과(`blur(` 0건 · `backdrop-filter` 12건 모두 `var(--glass-…)` · 규칙 어휘 · 끄기 `@media`에 대비 증가 · 두 블록 같음). `시트 비침`은 세 장면 모두 시트 α0.72 · 막 α0.6 → **0.112**. 글자 대비 최소: `sheet-home`·`sheet-finish`·`sheet-timer` 4.75:1.

루틴 편집 시트(`editor`) 유리 검사 — Chromium, 전부 통과:

| 시트 | 폭·모드 | 유리 켜짐 | 내용은 불투명 | 시트 비침(값만 찍는다) |
|---|---|---|---|---|
| line-sheet · line-sheet-end · picker-sheet · picker-form | 390 다크 | ✓ | ✓ (23·23·19·21개) | α0.72 · 막 α0.8 → 0.056 |
| 같은 넷 | 390 라이트 | ✓ | ✓ | α0.72 · 막 α0.5 → 0.140 |
| line-sheet | 375 다크·라이트 | ✓ | ✓ (23개) | 0.056 · 0.140 |

PLAN 예상대로 Astryx 다크는 5.6%만 비친다(막 0.8 — 범위 제외), 라이트는 14%다. 흐름 검사 `시트 교체`·`바깥 탭`·`편집 → 뒤로 → 고르기`·`긴 검색어` 통과. `탭 영역` 주의(44px 미만 36px 버튼 등)는 v1.17 기록과 같은 참고 항목이다.

빌드 출력(`dist/assets/index-*.css`): `--glass-sheet` 10곳 · `:has(.sheet-backdrop)` 1 · `prefers-reduced-transparency` 1 · `prefers-contrast` 1 · `-webkit-backdrop-filter` 6 · 접두사 없는 `backdrop-filter` 선언 5(그 파일에 두 쓰임이 다 남아 있다. 값이 전부 토큰인지는 `after --check`의 정적 검사 12건이 본다).

### 결함 복원

PLAN 번호 그대로(PP1에서 한 ①③⑥⑦⑧⑩⑪은 PP1 절). 파일은 `cp`로 백업하고 되돌린 뒤 `cmp`가 같음을 확인했다. 끝에 `git status`로 의도 밖 변경이 없음을 봤다.

| # | 되살린 결함 | 실패한 검사·테스트 | 원상복구 |
|---|---|---|---|
| ② | `:root:has(.sheet-backdrop)` 선택자를 안 맞게 바꿈(규칙 삭제와 같다) | 시트 3장면 `한 겹` 실패: `sheet+tabbar` 겹침(sheet-home 5점) | `cmp` 같음 |
| ④ | `.sheet`의 `background`를 `var(--surface)`로 | 시트 3장면 `유리 켜짐`("sheet 배경 알파 1")·`시트 비침` 실패 | 같음 |
| ⑤ | `ax.css`의 `background-color: transparent;`를 불투명 면으로 | `line-sheet`·`picker-*`의 `유리 켜짐`("안쪽이 면을 칠한다") 실패, 종료 코드 1 | 같음 |
| ⑨ | `.field`의 `background`를 `transparent`로 | `sheet-finish`의 `내용은 불투명`("textarea.field 비침 1") 실패 | 같음 |
| ⑫ | `--glass-sheet` 알파 0.86 | 시트 3장면 `시트 비침` 실패(0.056) | 같음 |
| ⑬ | `@supports not` 블록에서 `--glass-sheet-filter: none` 삭제 | 정적 `끄기 두 블록 선언 같음` 실패 | 같음 |
| 스캔 ㉠ | `FinishSheet.tsx`의 `className="sheet"`를 `sheet2`로 | `v118` PP2 시트 14개 테스트 실패 | 같음 |
| 스캔 ㉡ | `ax/index.tsx`의 `BottomSheet`에 `style={{ height: 300 }}` | `v118` PP2 Astryx `Sheet` 테스트 실패 | 같음 |

⑤는 `ax.css`의 `background-color: transparent;` 줄을 전부 바꿔 돌렸다(그 파일에 해당 줄이 이 규칙 하나가 아니었다). 의도한 결함이 잡혔고 되돌린 파일은 백업과 같다. ②는 PLAN의 "규칙 삭제" 대신 선택자를 안 맞게 바꿨다(같은 결과).

### 구현 중에 확인한 것 (사람·리뷰어가 볼 것)

- **눈으로 본 유리:** Chromium `after-sheet-finish.png`에서 시트 아래쪽에 뒤 카드의 주황 버튼이 아주 옅게 번져 보인다. 윗부분은 거의 안 보인다. 비침 11%라 불투명 시트와 큰 차이가 없다 — **"이 값에서 유리는 눈에 거의 안 보인다"**가 정직한 평가다. 사람이 `compare/`를 보고 정한다. 시트 안 글자·입력칸·버튼은 또렷하다.
- **WebKit 스크린샷은 흐림이 없다**(제약 22). 시트 뒤 글자가 또렷이 보이는 것은 이 WebKit이 `backdrop-filter`를 안 그리기 때문이다. iOS에서는 흐려질 것으로 기대하지만 확인한 것이 아니다 → 실기기 ⑦.
- **Astryx 시트(라이트):** `editor/after-line-sheet-light.png`에서 위쪽 손잡이 근처 약 70px이 흰색에서 시트 색으로 사라지는 띠로 보인다. 계산된 스타일·`--check`에는 안 잡힌다. 원인은 확인하지 않았다(안쪽 스크롤 영역 위쪽의 그림자일 가능성). 규칙을 더하지 않았다 — 실기기 ⑦에서 거슬리면 새 작업.
- **움직임:** legacy 막의 `fade-in` 0.15초 동안 시트에 뒤가 안 비치다가 끝나면서 비치는 "툭"은 판단하지 않았다(PLAN대로 실기기 ⑦).
- 시트가 뜬 화면에서 아래 띠가 불투명이 되는 것(한 겹)은 `sheet-home`·`sheet-finish`의 `한 겹` 통과와 결함 복원 ②로 확인했다.

### 과거 판정 불변 확인

① `git diff --stat main..HEAD -- src` (실행 출력 복사). `.tsx` 0줄, `src/lib/`는 새 테스트 파일뿐이고 `src/db/`·`src/store/`·`src/screens/`·`src/components/`·`src/ax/index.tsx`는 바뀌지 않았다:

```
 src/ax/ax.css         | 19 +++++++++++
 src/lib/v118.test.ts  | 41 +++++++++++++++++++++++
 src/styles/glass.css  | 55 +++++++++++++++++++++++++++++++
 src/styles/global.css | 91 ++++++++++++++++++++++++++++++++++-----------------
 src/styles/index.css  |  1 +
 5 files changed, 177 insertions(+), 30 deletions(-)
```

PLAN이 적은 다섯 파일(`glass.css`·`index.css`·`global.css`·`ax.css`·`v118.test.ts`)만 보인다.
② 골든 테스트(`v113`~`v117`)와 `polish`·`timerOwnership`·`useRestTimer`가 수정 없이 통과한다(아래 `npm test`).
③ 바뀌는 것은 PLAN "과거 판정 불변" 표가 전부다. 기록·판정·내보내기·백업·설정·localStorage에 새 키도 새 판정도 없다.

### 실행 결과

| 항목 | 결과 |
|---|---|
| `npm test` | `Test Files  63 passed (63)` · `Tests  1571 passed (1571)` |
| `npm run build` | `✓ built in 8.43s` |
| `node scripts/quality-scan.mjs --ci` | `[quality-scan] 통과` |
| `git rev-list --count main..HEAD` | 4 (PP0·PP1·PP2·기록·버전) |

### 배포 영향 (PR 본문 맨 위에도 넣는다)

- 탭바가 떠 있는 캡슐이 되고, 탭바·재개 스트립·세션 상단 바·휴식 바·바텀시트가 반투명 유리가 된다. 기록·판정·내보내기·백업은 그대로다.
- 아이폰은 "투명도 줄이기"를 웹앱에 알려주지 않는다. 유리를 끄려면 "대비 증가"를 켠다.
- 농도·흐림을 고칠 자리는 `src/styles/glass.css` 한 파일이다. 시트 농도 비교는 `docs/screenshots/v1.18/compare/`(0.86 · 0.72 · 0.60).
- 세션을 최소화했을 때 탭 화면의 아래 여백이 52px 늘어난다(재개 스트립이 마지막 내용을 덮던 것을 고쳤다).
- 폰에서 볼 것: 아래 "사람 확인 필요".
- PR 본문은 `Refs #41`(닫지 않는다 — 끝 기준 1의 세션 화면 Astryx 이전이 남는다).
- `package.json` 버전 **1.18.0**.

### 사람 확인 필요 (실기기, 홈 화면 앱)

① 탭바 캡슐이 홈 인디케이터 위에 뜨고 좌우·아래로 내용이 비친다. 탭 다섯이 엄지로 잘 눌린다.
② 홈을 끝까지 내렸을 때, 세션을 최소화해 재개 스트립이 떠 있을 때(다른 탭도 한 번) 마지막 내용이 안 가려진다.
③ 세션 화면 스크롤 시 카드가 상단 바 뒤로 흐려져 지나가고 Day 이름·경과 시간·세트 수가 읽힌다.
④ 휴식 바의 남은 시간·진행 채움이 읽히고 끝났을 때 초록이 보인다. 주황 `세트 완료` 버튼이 휴식 바 바로 뒤에 오도록 스크롤했을 때 채움 위 작은 글자가 읽힌다(진행 채움은 `글자 대비`에 안 잡힌다).
⑤ 세션 화면을 빠르게 스크롤해도 끊기지 않는다.
⑥ 시트(`종료`·`휴식 타이머`·대체·템포 가이드, 식단의 먹은 것 추가)를 여닫을 때 버벅이지 않는다. 루틴 편집 시트를 손가락으로 끌어내릴 때도 같다.
⑦ 시트 뒤가 흐리게 비친다(또렷하면 안 된다. **불투명해 보이면** PLAN "되돌리기"의 "시트가 유리로 안 보인다" — 위에 적었듯 이 값에서 눈에 거의 안 보일 수 있다). 시트가 올라온 직후 비침이 "툭" 바뀌지 않는다. 시트 안 숫자·입력칸이 또렷하다. 루틴 편집 시트는 라이트에서 비치고 다크에서는 거의 안 비치는 것이 정상이다. 라이트 Astryx 시트 위쪽의 흰 띠가 거슬리지 않는다. 시트를 닫으면 아래 띠의 유리가 돌아온다.
⑧ `설정 → 손쉬운 사용 → 디스플레이 및 텍스트 크기 → 대비 증가`를 켜면 유리가 전부 불투명해진다.
⑨ `투명도 줄이기`는 켜도 안 바뀌는 것이 정상이다.
⑩ 저전력 모드에서 ⑤⑥을 한 번 더.
추가: `rest-bar-done`·`resume-rest-done`·세션 종류 칩(`복귀`·`디로드`) 장면은 찍지 못했다(PP1 "하지 않은 것") → 폰에서 한 번씩 본다.

### 하지 않은 것

- 시트를 닫은 직후 아래 띠가 돌아오는 것을 별도 장면으로 재지 않았다(위 표).
- WebKit에서 흐림이 그려지는지는 이 환경에서 못 본다(제약 22).
- 범위 제외 항목(막 농도, 시트 띄우기, legacy 시트의 Astryx 이전)은 건드리지 않았다.
