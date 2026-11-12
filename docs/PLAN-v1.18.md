# PLAN v1.18 — 유리 재질: 탭바·떠 있는 띠·바텀시트 (PP)

> 작성: Fable 5.2 (설계자), 2026-11-12. 대상 코드: v1.17.0 (`main` `fc16b52`).
> 근거: 이슈 #41 (개선).
>
> **성격:** CSS만 바꾼다. `.tsx`·`.ts` 앱 코드, 저장 구조(Dexie 3, 백업 `SCHEMA_VERSION` 3), 판정·내보내기는 한 줄도 바꾸지 않는다.
> 화면 문구·버튼 순서·누르면 일어나는 일은 그대로다. 달라지는 것은 "과거 판정 불변"의 표가 전부다.
>
> **이 PLAN이 이슈에서 뺀 것:** 끝 기준 1의 "운동 중 화면을 Astryx 부품으로 그린다". 유리(끝 기준 2~5)는 이 PLAN으로 네 군데(탭바·상단 바·하단 바·시트)에 다 들어간다.
> 뺀 이유는 "단계 지도"와 "사람이 정할 것 1". 그래서 이 PLAN만으로는 이슈 #41이 닫히지 않는다(PR 본문은 `Refs #41`).

---

## 단계 지도

| 단계 | 내용 | 상태 |
|---|---|---|
| ① | 유리 토큰 한 벌 + 탭바·재개 스트립·세션 상단 바·휴식 바·바텀시트(legacy 14개 + Astryx 2개) | **이 PLAN (v1.18)** |
| ② | 운동 중 화면(세션 화면·세트 카드·세션 시트 8개)을 Astryx 부품으로 | **설계 안 함 — 사람의 답이 먼저다** ("사람이 정할 것 1") |
| ③ | 나머지 화면 | 이슈대로 다음 기획 |

**②를 지금 설계하지 않는 이유 — 코드로 확인한 세 가지**

| 걸리는 것 | 근거 |
|---|---|
| README "핵심 설계 결정"의 한 줄과 정면으로 부딪친다: "Astryx 화면은 지연 로딩해서 헬스장 경로(홈 → 세션)가 Astryx 코드를 읽지 않습니다." 세션 화면이 Astryx가 되면 헬스장 경로가 Astryx 청크(JS 651KB·gzip 211KB, CSS 299KB·gzip 48KB — 메인 번들 gzip 184KB보다 크다)를 읽는다 | `README.md:249`, `docs/DEV-RECORD-v1.17.md` "빌드 출력". 설계자 규칙: 이 결정을 뒤집는 설계는 사람의 승인 표시가 있을 때만 한다 |
| 세트 카드(`ExerciseCard`)를 **과거 세션 수정 화면(기록 탭)도 쓴다.** 카드를 Astryx로 옮기면 그 화면도 같이 옮겨야 한다(카드를 두 벌로 둘 수는 없다). 이슈 "안 할 것: 이번 범위 밖의 화면"과 닿는다 | `src/screens/SessionDetailScreen.tsx:5`·`:133`, `src/screens/SessionScreen.tsx:3` |
| v1.17 루틴 편집 화면의 실기기 확인이 기록에 없다. 특히 시트 안 36px 버튼의 탭 영역이 44px에 1~4px 못 미친 채 "사람 확인 필요"로 넘어갔다. 세션 화면은 운동 중에 쓰는 화면이라, 이 결과를 모르고 버튼 크기를 정할 수 없다 | `docs/DEV-RECORD-v1.17.md` "사람 확인 필요 (실기기)" |

①은 ②와 무관하게 쓸모가 있다. ②를 하게 되면 ①의 토큰을 그대로 쓴다.

---

## 확인한 것 (이슈의 "모르는 것")

`@astryxdesign/core@0.7.13`·`@astryxdesign/theme-neutral@0.7.13`의 소스·타입 선언·CSS를 읽었다(실행은 하지 않았다). iOS Safari는 2026-11-12에 웹 검색으로 확인했고 실기기에서는 못 봤다.

**Astryx 테마로 유리 표면을 만들 수 있나 — 절반만 된다**

| 물음 | 답 | 근거 |
|---|---|---|
| 테마가 부품의 배경·`backdrop-filter`를 바꿀 수 있나 | 된다. `defineTheme({ extends, components: { 'bottom-sheet': { base: { backgroundColor, backdropFilter } } } })`. `astryx-theme` 레이어에 `@scope`로 나간다 | `dist/theme/defineTheme.d.ts:152`(`ComponentStyleMap`)·`components` 주석, `src/theme/Theme.tsx:145-168` |
| 테마가 "투명도 줄이기"에 반응할 수 있나 | **안 된다.** 테마의 조건 어휘가 닫혀 있다: 폭·`pointer`·`contrast`·`motion` 넷뿐이다 | `dist/theme/themeAdaptations.d.ts:69-78` |
| 시트 전체가 테마 타깃인가 | **아니다.** 테마 타깃(`.astryx-bottom-sheet`)은 바깥 패널뿐이고, 그 안의 스크롤 영역이 표면색을 한 번 더 불투명하게 칠한다(타깃 없음). 패널만 반투명으로 바꾸면 아무것도 안 비친다 | `src/BottomSheet/BottomSheetPanel.tsx:319`·`:462-470`·`:1226` |
| 맞춤 테마를 쓰는 비용 | `astryx theme build`(v1.17에서 안 들이기로 한 `@astryxdesign/cli`)로 CSS를 미리 만들거나, 빌드 안 된 테마(30KB)를 실어 런타임에 `<style>`을 만들어 넣어야 한다. 지금은 미리 빌드된 `theme-neutral/built` + `theme.css`를 쓴다 | `theme-neutral/package.json` `exports`, `src/ax/index.tsx:6`·`:17` |
| Astryx에 유리 재질이 있나 | 없다. `backdrop-filter`는 `Lightbox` 배경(2px)과 `SegmentedControl` 렌즈뿐이다. `Dialog`·`Drawer`·`MobileNav`는 "a full-viewport blur is costly to repaint"라며 일부러 안 쓴다 | `dist/astryx.css`(7곳), `src/Dialog/Dialog.tsx:264`, `src/Drawer/Drawer.tsx:227`, `src/MobileNav/MobileNav.tsx:149` |
| 탭바·상단 바·떠 있는 버튼 부품 | 없다(v1.17 확인과 같다). CHANGELOG에 "Lab's TabBar"가 나오지만 `@astryxdesign/lab`은 npm에 자리만 있다(`0.0.0-bootstrap.0`, "do not install") | `core/CHANGELOG.md:248`, `npm view @astryxdesign/lab` |
| Astryx 최신 | `0.7.14`. 이번에 올리지 않는다(v1.17 "되돌리기": 버전 올리기는 별도 작업) | `npm view @astryxdesign/core` |

**결론:** 유리는 Astryx 테마가 아니라 **앱의 CSS 토큰 한 벌**(`src/styles/glass.css`)로 만든다. legacy 화면의 띠·시트와 Astryx 시트가 같은 토큰을 읽는다. Astryx 시트에는 `astryx-theme` 레이어에서 안정 클래스에 건다(PP2). `defineTheme`은 쓰지 않는다 — 투명도 대체와 시트 안쪽을 어차피 CSS로 써야 해서, 테마로 옮기면 같은 값이 두 곳에 생긴다.

**iOS Safari에서 어디까지 되나**

| 효과 | 되나 | 근거 |
|---|---|---|
| 흐림 + 채도(`backdrop-filter: saturate() blur()`) | 된다. `-webkit-` 접두사를 같이 적는다. 지금 띠 네 곳이 이미 쓰고 있다 | `src/styles/global.css:286-287`·`:585-586`·`:959-960`·`:1015-1016` |
| 굴절·렌즈·가장자리 빛 번짐(iOS 26의 "리퀴드") | **안 된다.** `backdrop-filter: url(#svg필터)`는 Chromium에서만 그려진다. 웹에서 낼 수 있는 것은 반투명 + 흐림 + 가장자리 선 + 그림자까지다 | [cssscript: Hyalite](https://www.cssscript.com/svg-liquid-glass-hyalite/), [WebKit 313914](https://bugs.webkit.org/show_bug.cgi?id=313914) |
| 폰의 "투명도 줄이기" 알아채기(`prefers-reduced-transparency`) | **iOS Safari는 지원하지 않는다**(Chrome·Edge 118+, Firefox만). 아이폰에서 그 설정을 켜도 웹앱은 모른다 | [web-features](https://web-platform-dx.github.io/web-features-explorer/features/prefers-reduced-transparency), [WebKit 175497](https://bugs.webkit.org/show_bug.cgi?id=175497), [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency) |
| 폰의 "대비 증가" 알아채기(`prefers-contrast: more`) | 된다(Safari 14.1+). iOS도 이 설정을 켜면 자체 화면의 투명도를 줄인다 → 유리를 끄는 두 번째 신호로 쓴다 | MDN `prefers-contrast` |
| `:has()` | 된다(iOS 15.4+). "한 겹" 규칙에 쓴다 | — |
| `color-mix()` | 된다(iOS 16.2+). Astryx 화면은 이미 17.5 이상이 필요하다 | `README.md:507` |

---

## 작업 개요

| ID | 내용 | 화면 변화 | 되돌리는 단위 |
|---|---|---|---|
| PP0 | 유리 스크린샷·검사 도구와 "바꾸기 전" 스크린샷 (앱 코드 무변경) | 없음 | — |
| PP1 | 유리 토큰 + 떠 있는 띠 넷(탭바·재개 스트립·세션 상단 바·휴식 바) | 탭 화면 전부, 세션 화면 | 커밋 하나 |
| PP2 | 바텀시트(legacy `.sheet` + Astryx `Sheet`) + "한 겹" 규칙 | 시트 16개 | 커밋 하나 |

---

## 공통 진단

| 사실 | 근거 | 뜻 |
|---|---|---|
| 띠 넷에 흐림이 이미 걸려 있지만 배경 알파가 0.86~0.96이다 | `global.css:285`(탭바 0.86)·`:584`(세션 상단 0.9)·`:958`(재개 스트립 0.96)·`:1014`(휴식 바 0.94) | 거의 불투명이라 유리로 보이지 않는다 |
| 같은 흐림 값(`saturate(180%) blur(20px)`)과 색이 네 규칙에 따로 적혀 있다 | 위 네 곳 | 농도를 바꾸려면 네 곳을 고쳐야 하고, 끄는 스위치를 걸 자리가 없다 |
| 시트는 불투명이다(`background: var(--surface)`) | `global.css:502-513`. `sheet-backdrop`을 쓰는 파일 14개(`src/components/*Sheet.tsx`) | 이슈의 유리 층에 시트가 들어 있다 |
| Astryx 시트도 불투명이다 | `BottomSheetPanel.tsx:319`·`:470` | 루틴 편집의 시트 둘 |
| 시트가 떠도 아래 띠의 흐림은 그대로 돈다. 시트까지 유리가 되면 같은 자리에서 흐림이 두 번 돈다 | 띠는 `z-index` 10~30, 시트 배경은 40(`global.css:495`) | 끝 기준 4 "겹겹이 쌓지 않는다" |
| 투명도·대비 설정을 읽는 규칙이 없다 | `global.css` 전체에 `prefers-` 0건 | 끝 기준 3 |
| 탭바의 비활성 글자가 `--text-faint`(#8c8c98, 11px)다 | `global.css:299` | 띠가 비치면 밝은 내용(주황 버튼, 초록 체크) 위에서 4.5:1에 못 미친다(계산: 띠 알파 0.78일 때 초록 위 3.6:1, 주황 위 3.8:1) |
| 띠끼리는 자리가 겹치지 않는다: 탭 화면은 탭바(아래) + 재개 스트립(그 위), 세션 화면은 상단 바(위) + 휴식 바(아래) | `global.css:277-289`·`:946-965`·`:575-588`·`:1006-1018`, `App.tsx:145-198` | 띠만으로는 흐림이 겹치지 않는다. 겹치는 것은 시트가 뜰 때뿐이다 |

---

## PP0. 유리 스크린샷·검사 도구와 "바꾸기 전" 스크린샷

### 진단

- 사람이 폰에서 보기 전에 리뷰어가 볼 것이 필요하다. 유리는 눈으로 봐야 하고, "한 겹"·"투명도 줄이면 불투명"·"글자 대비"는 계산된 스타일로 잴 수 있다.
- vitest에서 `.css`는 빈 문자열로 읽힌다(DEV-RECORD 제약 3). CSS 규칙은 브라우저에서 재야 한다.
- `scripts/screenshots.mjs`는 루틴 편집 장면 전용이고 `docs/screenshots/v1.17/`에만 쓴다(`:23`).
- "바꾸기 전"은 CSS를 바꾸면 다시 찍을 수 없다.

### 설계

- 새 파일 `scripts/screenshots-glass.mjs`. 사용: `node scripts/screenshots-glass.mjs <before|after> [--check] [--engine=webkit]`. 뼈대(`vite preview`, `iPhone 14` 흉내 390×844, `ko-KR`, 온보딩 통과, 글자·`aria-label`로만 고르기)는 `screenshots.mjs`와 같다. 저장: `docs/screenshots/v1.18/<before|after>-<이름>.png`. **다크만 찍는다**(장면이 전부 다크 고정 화면이다).
- `scripts/screenshots.mjs`에 `--out=<폴더>` 플래그 하나를 더한다(없으면 지금처럼 `v1.17`). 루틴 편집의 Astryx 시트는 이 스크립트로 `docs/screenshots/v1.18/editor/`에 찍는다(다크·라이트).

| 이름 | 장면 |
|---|---|
| `home` | 홈 (탭바) |
| `home-end` | 홈을 맨 아래까지 스크롤 |
| `home-resume` | 세션 시작 → `세션 최소화` → 홈 (재개 스트립 + 탭바) |
| `session` | 세션 화면, 첫 카드 열림 |
| `session-scrolled` | 세션 화면을 300px 스크롤 (카드가 상단 바 뒤로 지나간다) |
| `session-rest` | `1세트 완료`를 눌러 휴식 바가 뜬 화면 |
| `sheet-finish` | `종료`로 연 시트 (아래에 상단 바·휴식 바) |
| `sheet-timer` | `휴식 타이머 시작`으로 연 시트 |
| `sheet-home` | 홈에서 여는 시트 하나 (`DayPickerSheet`를 여는 버튼을 구현자가 코드에서 찾는다. 아래에 탭바) |

- `--check`의 **유리 검사**. `before`·`after` 어느 쪽에도 돈다. 하나라도 어기면 종료 코드 1.

| 검사 | 기준 |
|---|---|
| 유리 켜짐 | 장면에 있는 유리 층(`.tabbar`·`.resume-strip`·`.session-header`·`.rest-bar`, 시트 장면에서는 `.sheet` / `.astryx-bottom-sheet`)의 계산된 `backdrop-filter`(없으면 `-webkit-backdrop-filter`)가 `none`이 아니고 배경색 알파가 1 미만이다. Astryx 시트는 패널 가운데 점의 `elementsFromPoint`에서 패널에 닿기 전까지의 요소 배경이 전부 투명이어야 한다. **시트 장면의 아래 띠는 이 검사에서 뺀다**(한 겹 규칙으로 꺼진다) |
| 내용은 불투명 | `input`·`textarea`·`.stepper`·`.set-row`마다 조상을 거슬러 처음 만나는 "배경이 투명이 아닌 요소"가 알파 1이다. 시트 안의 입력칸도 같다(칸 자체가 불투명이어야 한다) |
| 한 겹 | 화면에 가로 5 × 세로 12 격자 점을 찍어, 점마다 `elementsFromPoint`로 겹친 요소 가운데 `backdrop-filter`가 `none`이 아닌 것이 1개 이하다 |
| 투명도 줄이기 | `prefers-reduced-transparency: reduce`를 흉내 내면(CDP `Emulation.setEmulatedMedia`의 `features`) 유리 층 전부가 `backdrop-filter: none`이고 배경 알파 1이다 |
| 대비 증가 | `prefers-contrast: more`를 흉내 내면 위와 같다 |
| 글자 대비 | 띠 안의 글자 요소마다: 글자색 vs (띠 배경색을 `--accent`와 `--ok` 위에 각각 알파 합성한 색)의 WCAG 대비가 4.5:1 이상(24px 이상 굵은 글자는 3:1). 합성은 sRGB 채널별 `α·띠 + (1−α)·바탕` |
| 탭바 자리 | `.tabbar`가 화면 좌·우·아래에서 8px 이상 떨어져 있다 · 탭 버튼 다섯이 각각 폭·높이 44px 이상 · `.resume-strip`과 `.tabbar`의 사각형이 겹치지 않는다 · `home-end`에서 화면의 마지막 내용 요소의 아래 끝이 `.tabbar`(스트립이 있으면 스트립) 위 끝보다 위다 |
| 가로 넘침 | `document.documentElement.scrollWidth <= innerWidth` |

- `--check`는 장면을 돌기 전에 **정적 검사**를 한다(Node로 CSS 파일을 직접 읽는다): `src/styles/global.css`·`src/ax/ax.css`에 `blur(` 리터럴이 0건 · 두 파일의 `backdrop-filter` 선언 값이 전부 `var(--glass-`로 시작 · `src/styles/glass.css`에 `prefers-reduced-transparency`·`prefers-contrast`·`:has(`가 있다. `before`에서는 건너뛴다.
- `--engine=webkit`: Playwright WebKit으로 같은 장면을 `after-<이름>-webkit.png`로 한 번 더 찍는다(검사는 돌리지 않는다). iOS Safari는 아니지만 같은 계열 엔진이라 `-webkit-` 접두사와 시트 흐림이 그려지는지를 미리 본다. `npx playwright install webkit`이 안 되거나 Windows WebKit이 흐림을 안 그리면 DEV-RECORD 제약에 적고 넘어간다(멈추지 않는다).

### 검증

- `node scripts/screenshots-glass.mjs before`가 아홉 장면을 찍는다. 커밋한다.
- **검사가 잡는다는 증거:** `before --check`가 종료 코드 1이고, 아래 넷이 실패로 찍힌다. 하나라도 통과로 나오면 검사가 틀린 것이다. 출력 표를 DEV-RECORD에 복사한다.
  - `sheet-finish`의 `유리 켜짐` (지금 시트는 불투명이다)
  - `home`의 `탭바 자리` (지금 탭바는 화면 폭 전체다)
  - `home`의 `글자 대비` (지금 비활성 탭 글자는 `--text-faint`다)
  - `session`의 `대비 증가` (지금은 끄는 규칙이 없다)
- `before`에서 `한 겹`은 통과가 맞다(시트가 불투명이라 흐림은 띠 하나뿐이다). PP2에서 시트가 유리가 된 뒤에야 이 검사가 뜻을 갖는다(결함 복원 ②).
- `npm test`·`npm run build`·`node scripts/quality-scan.mjs --ci` 통과(앱 코드 무변경).

### 범위 제외

- CI에서 스크린샷·유리 검사 돌리기: v1.17과 같은 이유(브라우저 내려받기).
- safe-area가 있는 폰 흉내: Playwright에서는 `env(safe-area-inset-*)`가 0이다. 홈 인디케이터 자리는 실기기로만 본다.

### README 반영

없음.

---

## PP1. 유리 토큰 + 떠 있는 띠 넷

### 진단

"공통 진단"의 1·2·6·7·8번째 줄.

### 설계

**새 파일 `src/styles/glass.css`** — 유리의 재료를 정하는 한 곳. `src/styles/index.css`에 `@import './glass.css' layer(legacy);`를 `global.css` 줄 다음에 더한다(같은 레이어, 나중 순서).

| 토큰 | 값 (`:root`) | 쓰는 곳 |
|---|---|---|
| `--glass-bar` | `rgba(22, 22, 26, 0.78)` | 띠 넷의 배경 |
| `--glass-bar-filter` | `saturate(180%) blur(20px)` | 띠 넷의 흐림 |
| `--glass-sheet` | `rgba(22, 22, 26, 0.86)` | 시트 배경 (PP2). 입력칸이 올라가므로 띠보다 짙다 |
| `--glass-sheet-filter` | `saturate(180%) blur(20px)` | 시트 흐림 (PP2) |
| `--glass-edge` | `rgba(255, 255, 255, 0.14)` | 유리 가장자리 선 1px |
| `--glass-pill` | `rgba(255, 255, 255, 0.08)` | 탭바에서 지금 탭 뒤의 알약 |
| `--glass-shadow` | `0 8px 28px rgba(0, 0, 0, 0.4)` | 떠 있는 캡슐의 그림자 |
| `--glass-solid` | `#16161a` (`--surface`와 같은 값) | 유리를 끌 때의 면 |

같은 파일의 규칙 셋(순서대로):

| 규칙 | 내용 | 왜 |
|---|---|---|
| Astryx 화면일 때 | `html[data-astryx-theme] { --glass-solid: var(--color-background-surface); --glass-sheet: color-mix(in srgb, var(--color-background-surface) 86%, transparent); --glass-edge: var(--color-border); }` | Astryx 시트는 폰의 라이트/다크를 따른다. 색을 따로 적지 않고 Astryx 토큰에서 만든다(파생). 이 선택자는 Astryx 화면이 떠 있는 동안만 걸린다 |
| 유리 끄기 | `@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { html:root { --glass-bar: var(--glass-solid); --glass-sheet: var(--glass-solid); --glass-bar-filter: none; --glass-sheet-filter: none; } }` 그리고 같은 선언을 `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`에도 | 끝 기준 3. 선택자를 `html:root`로 써서 위의 Astryx 규칙을 이긴다. 흐림을 못 그리는 브라우저에서 반투명만 남으면 글자가 묻히므로 같이 끈다 |
| 한 겹 | PP2에서 더한다 | — |

**`src/styles/global.css` — 띠 넷이 토큰을 읽는다**

`:root`(`:31-34`)에 자리 토큰 둘을 더한다: `--tabbar-inset: 12px;` · `--tabbar-bottom: max(var(--safe-b), 8px);`

| 규칙 | 지금 | 바꾼 뒤 |
|---|---|---|
| 넷 공통 (`.tabbar`·`.session-header`·`.resume-strip`·`.rest-bar`) | 색 `rgba(…)`, `backdrop-filter: saturate(180%) blur(20px)` 리터럴 | `background: var(--glass-bar)` · `-webkit-backdrop-filter: var(--glass-bar-filter)` · `backdrop-filter: var(--glass-bar-filter)` |
| `.tabbar` 모양 (`:277-289`) | `left: 0; right: 0; bottom: 0` · `padding-bottom: var(--safe-b)` · `border-top` | **떠 있는 캡슐:** `left`·`right: var(--tabbar-inset)` · `bottom: var(--tabbar-bottom)` · `max-width: 616px` · `margin: 0 auto` · `height: var(--tabbar-h)` · `border-radius: calc(var(--tabbar-h) / 2)` · `border: 1px solid var(--glass-edge)` · `box-shadow: var(--glass-shadow)` · `overflow: hidden`. `padding-bottom`과 `border-top`은 지운다 |
| `.tabbar button` (`:291-302`) | `color: var(--text-faint)` | `color: var(--text-dim)` (글자 대비). `position: relative` |
| `.tabbar button[aria-current='page']` | `color: var(--accent)` | 그대로 + `::before`(`position: absolute; inset: 6px 2px; border-radius: 22px; background: var(--glass-pill); z-index: -1`)로 알약. 버튼 높이는 56px 그대로다(탭 영역을 줄이지 않는다). `.tabbar`에 `isolation: isolate` |
| `.screen` 아래 여백 (`:96`) | `calc(var(--tabbar-h) + var(--safe-b) + 24px)` | `calc(var(--tabbar-h) + var(--tabbar-bottom) + 32px)` |
| `.resume-strip` 모양 (`:946-965`) | `left: 0; right: 0` · `bottom: calc(var(--tabbar-h, 56px) + var(--safe-b))` · `border-top` · `border-radius: 0` · `width: 100%` | `left`·`right: var(--tabbar-inset)` · `width: auto` · `max-width: 616px` · `margin: 0 auto` · `bottom: calc(var(--tabbar-h) + var(--tabbar-bottom) + 8px)` · `border-radius: 22px` · `border: 1px solid var(--glass-edge)` · `box-shadow: var(--glass-shadow)`. `border-top`은 지운다 |
| `.session-header` (`:575-588`) | `border-bottom: 1px solid var(--line)` | `border-bottom: 1px solid var(--glass-edge)`. 자리·크기는 그대로(화면 폭 전체, 상태바 자리까지 덮는다) |
| `.rest-bar` (`:1006-1018`) | `border-top: 1px solid var(--line)` | `border-top: 1px solid var(--glass-edge)`. 자리·크기 그대로 |
| `.rest-bar-done` (`:1020-1023`) | `background: rgba(52, 199, 89, 0.16)` | `background: linear-gradient(rgba(52, 199, 89, 0.16), rgba(52, 199, 89, 0.16)), var(--glass-bar)` (초록을 유리 위에 얹는다 — 지금 규칙은 띠 배경을 초록 16%로 **갈아 끼워서** 유리가 되면 거의 투명해진다) |

- 폰(홈 인디케이터 34px)에서 탭바가 차지하는 높이는 전과 같다(56 + 34). 달라지는 것은 좌우 12px이 비고, 인디케이터 자리에 내용이 비친다는 것이다. 인디케이터가 없는 화면에서는 아래로 8px 뜬다.
- `.tabbar`·`.resume-strip`의 `z-index`(20·25)와 `.rest-bar`(30)는 그대로다.
- 마크업은 바꾸지 않는다. `TabBar.tsx`·`SessionResumeStrip.tsx`·`RestTimerBar.tsx`·`SessionScreen.tsx` 무변경.
- 값은 `글자 대비` 검사를 통과하는 옅은 쪽으로 잡았다(띠 0.78: `--text-dim`이 초록 위 5.1:1, 주황 위 5.4:1. 지금 탭의 주황 글자는 4.6:1·4.9:1). 더 비치게 하고 싶으면 `glass.css`의 알파만 내리면 되지만 0.72에서는 초록 위에서 4.45:1로 못 미친다.

### 검증

`src/lib/v118.test.ts` (describe `PP1`)

- 스캔: `src/**/*.{ts,tsx}`(테스트 제외)에 `backdropFilter`·`WebkitBackdropFilter`·`backdrop-filter`가 없다(유리는 CSS 토큰으로만 건다. 인라인 스타일로 새 유리를 만들지 못하게).
- 스캔: `TabBar.tsx`·`SessionResumeStrip.tsx`·`RestTimerBar.tsx`에 `style=`이 없다(지금도 없다 — 모양은 CSS가 맡는다).
- 구현자가 먼저 한 번 본다: `import.meta.glob('/src/styles/*.css', { query: '?inline', import: 'default', eager: true })`로 CSS 글이 읽히는가. **읽히면** PP0의 정적 검사 셋을 이 테스트에도 둔다(CI가 지킨다). **빈 문자열이면** 스크립트의 정적 검사만 두고 DEV-RECORD 제약에 "`?inline`도 빈 문자열"을 더한다.

`node scripts/screenshots-glass.mjs after --check` — PP1 뒤에는 `home`·`home-end`·`home-resume`·`session`·`session-scrolled`·`session-rest`에서 여덟 검사가 전부 통과한다(시트 장면의 `유리 켜짐`은 PP2 뒤). 출력 표를 DEV-RECORD에 복사한다.

- 빌드 출력(명령과 출력 복사): `dist/assets/index-*.css`에 `--glass-bar`·`prefers-reduced-transparency`·`prefers-contrast`가 있고, `-webkit-backdrop-filter`와 `backdrop-filter`가 둘 다 남아 있다(esbuild가 한쪽을 지우지 않았다).
- 경계: 375px(`iPhone SE`)에서 `home`·`home-resume`을 한 번 더 찍어 탭 다섯의 글자가 잘리지 않는지 본다 · 재개 스트립의 휴식 숫자가 끝난 상태(`resume-rest-done`) · 휴식 바의 끝난 상태(`rest-bar-done` — 타이머를 `휴식 타이머 시작`의 가장 짧은 값으로 돌리거나, 못 기다리면 실기기 확인으로 넘긴다) · 세션 종류 칩(`복귀`·`디로드`)이 상단 바에 있을 때.
- 기존 테스트는 고치지 않는다. `polish.test.ts`(탭바 라벨·아이콘)·`timerOwnership.test.ts`·`useRestTimer.test.ts`가 수정 없이 통과한다.

### 범위 제외

- 탭바를 Astryx 부품으로: 부품이 없다("확인한 것").
- 세션 상단 바·휴식 바를 캡슐로 띄우기: 상단 바는 상태바 자리를 덮어야 하고, 휴식 바는 전체를 누르면 닫히는 영역과 진행 채움이 폭 전체에 걸려 있다(`global.css:1026-1050`). 재질만 바꾼다.
- 카드·버튼·입력칸을 유리로: 끝 기준 2("읽어야 하는 내용은 묻히지 않는다"). `내용은 불투명` 검사가 지킨다.
- 굴절·렌즈 효과: iOS Safari에서 안 된다("확인한 것").
- 업데이트 배너(`UpdatePrompt`): 떠 있는 층이 아니라 흐름 안의 줄이다.

### README 반영

"핵심 설계 결정" → "iOS · PWA"에 한 항목을 더한다:

```
- **유리는 떠 있는 층에만 쓰고, 재료는 토큰 한 벌이다**
  탭바·재개 스트립·세션 상단 바·휴식 바·바텀시트만 반투명 + 흐림(`backdrop-filter`)으로 그립니다.
  카드·입력칸·세트 행은 불투명하게 둡니다 — 읽어야 하는 것이 배경에 묻히면 안 됩니다.
  색·흐림·농도는 `src/styles/glass.css`의 토큰이 정하고, 화면 쪽 CSS와 Astryx 시트가 그 토큰만
  읽습니다. `.tsx`에 `backdrop-filter`를 직접 적지 않습니다.
  시트가 뜨면 아래 띠의 흐림을 끕니다 — 같은 자리에서 흐림이 두 번 돌지 않게 합니다.
  폰이 "대비 증가"나 "투명도 줄이기"를 알려주면, 또는 브라우저가 흐림을 못 그리면 유리 대신
  불투명한 면을 씁니다. 굴절·렌즈 효과는 iOS Safari가 지원하지 않아 만들지 않습니다.
```

Limitations 절 끝에 한 줄: `- iOS Safari는 폰의 "투명도 줄이기" 설정을 웹앱에 알려주지 않습니다. 아이폰에서 유리를 끄려면 "대비 증가"를 켭니다.`

---

## PP2. 바텀시트 + "한 겹" 규칙

### 진단

"공통 진단"의 3·4·5번째 줄.

### 설계

**legacy 시트** (`src/styles/global.css` `.sheet`, `:502-513`) — 규칙 하나로 14개 시트가 같이 바뀐다.

| 속성 | 지금 | 바꾼 뒤 |
|---|---|---|
| `background` | `var(--surface)` | `var(--glass-sheet)` |
| 흐림 | 없음 | `-webkit-backdrop-filter: var(--glass-sheet-filter)` · `backdrop-filter: var(--glass-sheet-filter)` |
| 가장자리 | 없음 | `border-top: 1px solid var(--glass-edge)` |
| 나머지(둥근 모서리, 폭, `max-height`, 올라오는 움직임, `.sheet-backdrop`의 어두운 막) | — | 그대로 |

시트 안의 내용(`.field`·`.btn`·`.check-item`·`.pill`·`.segment`)은 건드리지 않는다. 입력칸과 버튼은 자기 배경(`--surface-2`)이 불투명하다.

**Astryx 시트** (`src/ax/ax.css`, `@layer astryx-theme { … }` 안에 더한다)

| 규칙 | 왜 |
|---|---|
| `html[data-astryx-theme] .astryx-bottom-sheet { background-color: var(--glass-sheet); -webkit-backdrop-filter: var(--glass-sheet-filter); backdrop-filter: var(--glass-sheet-filter); border-block-start-color: var(--glass-edge); }` | 패널을 유리로. `astryx-theme` 레이어라 Astryx 부품 규칙(`astryx-base`)을 이긴다 |
| `html[data-astryx-theme] .astryx-bottom-sheet > :not([aria-hidden='true']) { background-color: transparent; }` | 패널 안의 스크롤 영역이 표면색을 다시 칠하는 것을 끈다("확인한 것"). 패널의 자식은 손잡이(`aria-hidden="true"`)와 스크롤 영역 둘뿐이다(`BottomSheetPanel.tsx:1252-1273`) |

- 규칙 머리에 "`@astryxdesign/core@0.7.13`의 `BottomSheetPanel` 구조에 기대고 있다. 버전을 올리면 `--check`의 `유리 켜짐`으로 다시 확인한다"를 적는다.
- `src/ax/index.tsx`는 바꾸지 않는다. Astryx 시트의 어두운 막(`::backdrop`, `--color-overlay`)·끌어내리기·`purpose`도 그대로다.
- **시트 뒤가 흐려지지 않고 또렷하게 비치면**(`<dialog>` 쪽에 흐림의 기준을 끊는 속성이 있을 때 생긴다. 계산된 스타일로는 안 잡히고 스크린샷에서만 보인다): 원인 속성을 찾아 DEV-RECORD에 적고, `glass.css`의 Astryx 규칙에서 `--glass-sheet`의 `86%`를 `94%`로 올려 반투명만 남긴다. 멈추지 않는다.

**한 겹** (`src/styles/glass.css`, "유리 끄기" 규칙 앞에 더한다)

| 규칙 | 왜 |
|---|---|
| `:root:has(.sheet-backdrop, dialog[open]) { --glass-bar: var(--glass-solid); --glass-bar-filter: none; }` | 시트가 떠 있는 동안 아래 띠를 불투명한 면으로 바꾼다. 흐림은 맨 위 층(시트) 하나만 돈다. 띠는 어두운 막 아래에 있어서 바뀌는 것이 거의 안 보인다 |

legacy 시트는 `.sheet-backdrop`이 그려져 있는 동안, Astryx 시트는 `<dialog open>`인 동안 걸린다.

### 검증

`src/lib/v118.test.ts` (describe `PP2`)

- 스캔: `src/components/*Sheet.tsx` 가운데 `sheet-backdrop`을 쓰는 파일 14개 전부가 `className="sheet"`를 가진다(시트마다 다른 클래스로 갈라지면 규칙 하나가 닿지 않는다).
- 스캔: `src/ax/index.tsx`의 `Sheet`가 `BottomSheet`에 `className`·`style`·`xstyle`을 넘기지 않는다(넘기면 Astryx가 시트 높이를 호출자가 정한 것으로 보고 키보드 대응을 끈다 — `BottomSheetPanel.tsx:848-858`).

`node scripts/screenshots-glass.mjs after --check` 아홉 장면 전부 통과, 종료 코드 0. `sheet-finish`·`sheet-timer`·`sheet-home`에서 `유리 켜짐`(시트)·`한 겹`·`내용은 불투명`이 통과한다. 출력 표를 DEV-RECORD에 복사한다.

`node scripts/screenshots.mjs after --check --out=docs/screenshots/v1.18/editor` — v1.17의 모양 검사 여덟 + 흐름 검사 넷이 그대로 통과한다(종료 코드 0). `line-sheet`·`picker-sheet`·`picker-form`을 다크·라이트로 커밋한다. 이 장면들에 유리 검사 `유리 켜짐`·`내용은 불투명`을 돌리는 방법: `screenshots-glass.mjs`가 내보내는 검사 함수를 `screenshots.mjs`가 시트 장면에서 부른다(같은 함수를 두 번 짜지 않는다).

- 구현자가 장면마다 `before`와 나란히 보고 DEV-RECORD에 적는다: 시트 뒤의 내용이 흐려져 비친다 · 시트 안 글자와 입력칸이 또렷하다 · 시트가 떴을 때 아래 띠가 한 겹으로 보인다 · Astryx 시트가 라이트에서 밝은 유리, 다크에서 어두운 유리다.
- 경계: 시트 위에 시트(루틴 편집의 고르기 → 줄 시트 교체 — v1.17 흐름 검사 `시트 교체`가 본다) · 키보드가 올라온 시트(`picker-form`) · 내용이 길어 시트 안에서 스크롤되는 시트(`picker-sheet`, `sheet-finish`) · 시트를 닫은 직후 아래 띠의 유리가 돌아온다(`sheet-finish`를 닫고 `session`의 `유리 켜짐`을 다시 잰다).

### 범위 제외

- 시트를 화면에서 띄워 네 모서리를 둥글게(iOS 26의 작은 시트): Astryx 시트는 아래로 늘어나는 여유분과 끌기 계산이 화면 아래 끝에 붙어 있는 것을 전제로 한다(`BottomSheetPanel.tsx:338-339`). legacy 시트만 띄우면 두 시트의 모양이 갈린다.
- 어두운 막(`.sheet-backdrop`, `::backdrop`)에 흐림 걸기: 화면 전체 흐림은 비싸다(Astryx도 같은 이유로 안 한다).
- legacy 시트 14개를 Astryx `Sheet`로 옮기기: ②·③.
- 시트 안의 버튼·입력칸 모양: 그대로.

### README 반영

없음(PP1의 항목이 시트까지 적고 있다).

---

## 되돌리기

| 폰에서 본 것 | 방법 |
|---|---|
| 시트를 열거나 끌 때 버벅인다 | `glass.css`에서 `--glass-sheet-filter: none`, `--glass-sheet` 알파를 1로(두 값). Astryx 규칙의 `86%`도 `100%`로. 띠의 유리는 남는다 |
| 세션 화면 스크롤이 끊긴다 | `--glass-bar-filter: none`, `--glass-bar` 알파 1 |
| 탭바 캡슐이 별로다 | "사람이 정할 것 2"의 B로: PP1 표에서 `.tabbar` 모양·`.resume-strip` 모양·`.screen` 여백 세 줄만 되돌린다. 재질은 남는다 |
| 전부 | PP2 → PP1 순서로 커밋 `git revert`. 데이터는 건드린 적이 없다 |

데이터 이전은 없다: IndexedDB·백업·설정·localStorage에 새 키가 없다. 유리를 켜고 끄는 것은 저장하지 않고 폰 설정에서 매번 읽는다(파생).

---

## 과거 판정 불변

바뀌지 않는 것: 전부. `src/lib/`(새 테스트 파일 제외)·`src/db/`·`src/store/`·`src/screens/`·`src/components/`·`src/ax/index.tsx`를 바꾸지 않는다. 골든 테스트(`v113`~`v117`)가 수정 없이 통과한다.

달라지는 것(판정이 아니라 화면):

| 무엇 | 전 | 후 |
|---|---|---|
| 탭바 | 화면 폭 전체, 아래 끝에 붙은 띠 | 좌우 12px 떨어져 떠 있는 캡슐. 지금 탭 뒤에 옅은 알약 |
| 탭바의 비활성 글자색 | `--text-faint` | `--text-dim` (조금 밝다) |
| 재개 스트립 | 화면 폭 전체, 탭바에 붙음 | 캡슐, 탭바 위 8px |
| 세션 상단 바·휴식 바 | 거의 불투명(0.9·0.94) | 뒤가 비친다(0.78) |
| 바텀시트 16개 | 불투명 | 뒤가 흐리게 비친다(0.86). 식단·홈의 시트도 같이 바뀐다("사람이 정할 것 3") |
| 시트가 떠 있는 동안의 아래 띠 | 흐림 켜짐 | 불투명 |
| 폰의 "대비 증가"를 켰을 때 | 변화 없음 | 유리가 전부 불투명한 면이 된다 |

---

## 구현 순서와 검증

**PP0 → PP1 → PP2.** PP0의 "바꾸기 전"은 CSS를 바꾸면 못 찍는다. PP2의 "한 겹"은 PP1의 토큰이 있어야 한다. 단계마다 배포할 수 있다.
커밋은 **도구 1 + 구현 2 + 기록·버전 1 = 4.** 작업끼리 한 커밋에 섞지 않는다.

관례:
- `npm run build`(`tsc` 직접 호출 금지) · 작업 중에는 `npx vitest run src/lib/v118.test.ts src/lib/v117.test.ts src/lib/polish.test.ts src/lib/uiConsistency.test.ts`만 · 마지막에 `npm test` 한 번 · `node scripts/quality-scan.mjs --ci`
- 커밋 개수는 실행 출력을 복사한다(`git log --oneline main..HEAD`) · 커밋 메시지는 `git commit -F - <<'MSG'`
- **기존 테스트는 고치지 않는다.** 깨지면 멈추고 보고한다.
- 스크린샷 검사는 하나씩 백그라운드로 돌린다(DEV-RECORD 제약 17).
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `glass.css`의 끄기 규칙에서 `(prefers-contrast: more)` 삭제 → `--check` `대비 증가` 실패
  ② `glass.css`의 `:root:has(…)` 규칙 삭제 → 시트 장면의 `한 겹` 실패
  ③ `--glass-bar` 알파를 `0.5`로 → `글자 대비` 실패
  ④ `.sheet`의 `background`를 `var(--surface)`로 → `sheet-finish`의 `유리 켜짐` 실패
  ⑤ `ax.css`의 `.astryx-bottom-sheet > …` 투명 규칙 삭제 → 루틴 편집 시트의 `유리 켜짐` 실패
  ⑥ `.resume-strip`의 `bottom`을 옛 식 `calc(var(--tabbar-h, 56px) + var(--safe-b))`로 → `home-resume`의 `탭바 자리`(겹침) 실패
  ⑦ `TabBar.tsx`의 `<nav>`에 `style={{ backdropFilter: 'blur(4px)' }}` 추가 → `v118` PP1 스캔 실패
  ⑧ `global.css`의 `.rest-bar`에 `backdrop-filter: blur(20px)` 리터럴 → 정적 검사 실패
  ⑨ `.field`(`global.css:855-860`)의 `background`를 `transparent`로 → 시트 장면의 `내용은 불투명` 실패
- **과거 판정 불변 확인 절**(DEV-RECORD): ① `git diff --stat main..HEAD -- src`가 `src/styles/glass.css`·`index.css`·`global.css`·`src/ax/ax.css`·`src/lib/v118.test.ts`만 보인다(출력 복사) ② 골든 테스트 수정 없이 통과 ③ 바뀌는 것: "과거 판정 불변" 표.
- 완료 후 `docs/DEV-RECORD-v1.18.md`(맨 위 "이 환경에서 확인된 제약"은 v1.17 목록을 이어받고 새로 확인한 것을 더한다: CSS `?inline` 읽기 결과, WebKit 엔진 결과, `prefers-reduced-transparency` 흉내 방법). "배포 영향" 절에 아래를 남기고 PR 본문 맨 위에도 넣는다:
  - 탭바가 떠 있는 캡슐이 되고, 탭바·재개 스트립·세션 상단 바·휴식 바·바텀시트가 반투명 유리가 된다. 기록·판정·내보내기·백업은 그대로다.
  - 아이폰은 "투명도 줄이기"를 웹앱에 알려주지 않는다. 유리를 끄려면 "대비 증가"를 켠다.
  - 농도·흐림을 고칠 자리는 `src/styles/glass.css` 한 파일이다.
  - 폰에서 볼 것: 아래 실기기 확인 목록.
- README: PP1의 "README 반영"을 PP1 커밋에서 고친다.
- `package.json` **1.18.0**은 기록 커밋에서 올린다.
- PR 본문에 `Refs #41`(닫지 않는다 — 끝 기준 1의 세션 화면 Astryx 이전이 남는다).
- 실기기 확인(구현자가 못 하면 DEV-RECORD에 "사람 확인 필요"로 남긴다) — 홈 화면 앱에서:
  ① 탭바 캡슐이 홈 인디케이터 위에 뜨고, 좌우와 아래로 내용이 비친다. 탭 다섯이 엄지로 잘 눌린다
  ② 홈을 끝까지 내렸을 때 마지막 내용이 탭바(세션이 열려 있으면 재개 스트립)에 가리지 않는다
  ③ 세션 화면을 스크롤하면 카드가 상단 바 뒤로 흐려져 지나가고, Day 이름·경과 시간·세트 수가 읽힌다
  ④ 휴식 바의 남은 시간과 진행 채움이 읽힌다. 끝났을 때 초록이 보인다
  ⑤ 세션 화면을 빠르게 스크롤해도 끊기지 않는다
  ⑥ 시트(`종료`·`휴식 타이머`·대체·템포 가이드, 식단의 먹은 것 추가)를 여닫을 때 버벅이지 않는다. 루틴 편집의 시트를 손가락으로 끌어내릴 때도 같다
  ⑦ 시트 뒤가 흐리게 비친다(또렷하게 비치면 안 된다). 시트 안의 숫자·입력칸이 또렷하다
  ⑧ `설정 → 손쉬운 사용 → 디스플레이 및 텍스트 크기 → 대비 증가`를 켜면 유리가 전부 불투명해진다
  ⑨ 같은 곳의 `투명도 줄이기`는 켜도 안 바뀌는 것이 정상이다(바뀌면 iOS가 지원하기 시작한 것이고, 그것도 정상이다)
  ⑩ 저전력 모드에서 ⑤⑥을 한 번 더

리뷰 단위: 묶음 — 세 작업이 같은 CSS 파일 묶음(`glass.css`·`global.css`·`ax.css`)을 건드리고, PP1의 토큰 없이는 PP2를 볼 수 없다. 리뷰는 `docs/screenshots/v1.18/`의 전·후와 `--check` 출력 표를 보고 판정한다.

---

## 사람이 정할 것

| # | 정할 것 | 선택지 | 설계자 추천 |
|---|---|---|---|
| 1 | **운동 중 화면을 Astryx 부품으로 옮기는 일(끝 기준 1)을 이 PLAN에서 뺐다.** 유리는 이 PLAN으로 그 화면의 상단 바·휴식 바·시트에 들어간다 | (가) 이번에는 유리만 배포하고, 폰에서 본 뒤 세션 화면 이전을 다음 PLAN으로 한다 / (나) 이번에 같이 한다 — 아래 1-a·1-b에 "된다"고 답하면 설계자가 작업을 더한다 | **(가).** 세션 화면 이전은 세션 화면·세트 카드·시트 8개·과거 세션 수정 화면까지 2,700줄 안팎을 다시 그리는 일이고, 매 운동마다 쓰는 화면이다. 유리가 폰에서 괜찮은지부터 작은 변경으로 본다. 어느 쪽이든 다음 세 가지 답이 있어야 설계할 수 있다 |
| 1-a | 세션 화면이 Astryx가 되면 헬스장 경로(홈 → 세션)가 Astryx 코드(JS gzip 211KB + CSS gzip 48KB, 오프라인 캐시에서 읽는다)를 읽는다. README "핵심 설계 결정"의 "헬스장 경로가 Astryx 코드를 읽지 않습니다"를 고쳐야 한다 | 고쳐도 된다 / 안 된다(세션 화면은 Astryx로 옮기지 않고 재질만 맞춘다) | 고쳐도 된다 — 요청이 세션 화면을 이름으로 짚었다. 홈은 계속 Astryx를 읽지 않게 하고, 세션 화면에 들어갈 때만 읽게 설계한다 |
| 1-b | 세트 카드를 과거 세션 수정 화면(기록 탭)이 같이 쓴다. 카드를 옮기면 그 화면도 같이 옮겨야 한다 | 같이 옮긴다 / 카드는 다음에(세션 화면의 틀·시트만 먼저) | 같이 옮긴다 — 카드를 두 벌로 두지 않는다 |
| 1-c | v1.17 루틴 편집 화면을 폰에서 써 본 결과: 시트 안의 `−`·`+`·칩·스위치(보이는 높이 36px)가 엄지로 잘 눌리는가 | 잘 눌린다 / 옆이 눌리거나 안 눌릴 때가 있다 | 사람만 아는 사실이다. "안 눌릴 때가 있다"면 세션 화면에서는 Astryx 버튼의 보이는 높이를 44px로 올려 설계한다 |
| 2 | 탭바·재개 스트립의 모양 | A. 떠 있는 캡슐(좌우 12px, 둥근 끝, 그림자) / B. 지금 자리 그대로 화면 폭 전체 띠에 재질만 유리 | **A.** 요청이 "떠 있는 반투명 유리"다. 폰에서 차지하는 높이는 전과 같다. B는 PP1 표의 모양 세 줄을 빼면 된다 |
| 3 | 시트 규칙 하나(`.sheet`)를 14개 시트가 같이 써서, 이번 범위 밖 화면(식단·홈)의 시트도 유리가 된다 | A. 전부 유리 / B. 세션 화면의 시트 8개만(시트 파일 8개에 클래스를 더해 가른다) | **A.** 화면마다 시트 모양이 갈리는 것이 이슈가 없애려는 것이다. 재질만 바뀌고 안의 내용은 그대로다 |
| 4 | 아이폰은 "투명도 줄이기"를 웹앱에 알려주지 않는다. 끝 기준 3은 "브라우저가 알려주면"이라 충족되지만, 아이폰에서 그 설정으로는 유리가 안 꺼진다 | A. 스위치를 두지 않는다("대비 증가"로 끌 수 있다) / B. 설정 탭에 "유리 효과 끄기" 스위치를 둔다(이 폰에만 저장, 백업에 넣지 않는다) | **A.** 저장하는 설정을 늘리지 않는다. 폰에서 보고 필요하면 그때 B를 작은 작업으로 더한다 |

화면 문구는 새로 생기지 않는다.
