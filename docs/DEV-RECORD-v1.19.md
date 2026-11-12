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

### 결함 복원

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| `argos-upload.mjs`에 `--token` 인자 추가 | `v119 QQ0 argos-upload.mjs는 토큰을 명령줄(--token)로 넘기지 않는다` | `cp` 백업에서 되돌리고 `cmp` 같음 |

### 실행 결과

- `npm test`: `Test Files  64 passed (64)` · `Tests  1573 passed (1573)`
- `npm run build` 통과, `node scripts/quality-scan.mjs --ci` → `[quality-scan] 통과`

### 하지 않은 것 · 사람 확인 필요

- Argos 올리기: `ARGOS_TOKEN` 없음 → 건너뜀.
- `package.json` 버전은 기록 커밋(마지막)에서 올린다.
- `--press-shot` 옵션은 QQ2의 일이다.
