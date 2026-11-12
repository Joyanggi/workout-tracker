# 개발·테스트 내역 (검토용) — v1.18 (PP)


> PLAN-v1.18의 구현 기록. PP0부터 쓴다 (PP1·PP2는 해당 작업 때 덧붙인다).

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
21. **새로 확인 (PP0 라운드):** Windows에서 Python으로 파일을 읽고 쓰면 CRLF가 된다(제약 17과 같다). 이번에도 스크립트 세 개가 CRLF로 바뀌어 `sed -i 's/\r$//'`로 되돌렸다. 파일 편집은 Edit 도구로 한다.

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
