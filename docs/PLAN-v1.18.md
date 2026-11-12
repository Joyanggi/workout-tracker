# PLAN v1.18 — 유리 재질: 탭바·떠 있는 띠·바텀시트 (PP)

> 작성: Fable 5.2 (설계자), 2026-11-12. 대상 코드: v1.17.0 (`main` `fc16b52`).
> 근거: 이슈 #41 (개선).
> 검토 반영: 2026-11-12, 검토 커밋 `a36f1c4` (codex · claude). 무엇을 반영하고 기각했는지는 끝의 "검토 반영 기록".
>
> **성격:** CSS만 바꾼다. `.tsx`·`.ts` 앱 코드, 저장 구조(Dexie 3, 백업 `SCHEMA_VERSION` 3), 판정·내보내기는 한 줄도 바꾸지 않는다.
> 화면 문구·버튼 순서·누르면 일어나는 일은 그대로다. 달라지는 것은 "과거 판정 불변"의 표가 전부다.
>
> **이 PLAN이 이슈에서 뺀 것:** 끝 기준 1의 "운동 중 화면을 Astryx 부품으로 그린다". 유리(끝 기준 2~5)는 이 PLAN으로 네 군데(탭바·상단 바·하단 바·시트)에 다 들어간다.
> 뺀 이유는 "단계 지도"(두 검토자가 동의해 확정했다). 그래서 이 PLAN만으로는 이슈 #41이 닫히지 않는다(PR 본문은 `Refs #41`).

---

## 단계 지도

| 단계 | 내용 | 상태 |
|---|---|---|
| ① | 유리 토큰 한 벌 + 탭바·재개 스트립·세션 상단 바·휴식 바·바텀시트(legacy 14개 + Astryx 2개) | **이 PLAN (v1.18)** |
| ② | 운동 중 화면(세션 화면·세트 카드·세션 시트 8개)을 Astryx 부품으로 | **설계 안 함 — 사람의 답이 먼저다** ("사람이 정할 것") |
| ③ | 나머지 화면 | 이슈대로 다음 기획 |

**②를 지금 설계하지 않는 이유 — 코드로 확인한 세 가지**

| 걸리는 것 | 근거 |
|---|---|
| README "핵심 설계 결정"의 한 줄과 정면으로 부딪친다: "Astryx 화면은 지연 로딩해서 헬스장 경로(홈 → 세션)가 Astryx 코드를 읽지 않습니다." 세션 화면이 Astryx가 되면 헬스장 경로가 Astryx 청크(JS 651KB·gzip 211KB, CSS 299KB·gzip 48KB — 메인 번들 gzip 184KB보다 크다)를 읽는다 | `README.md:249`, `docs/DEV-RECORD-v1.17.md` "빌드 출력". 설계자 규칙: 이 결정을 뒤집는 설계는 사람의 승인 표시가 있을 때만 한다 |
| 세트 카드(`ExerciseCard`)를 **과거 세션 수정 화면(기록 탭)도 쓴다.** 카드를 Astryx로 옮기면 그 화면도 같이 옮겨야 한다(카드를 두 벌로 둘 수는 없다). 이슈 "안 할 것: 이번 범위 밖의 화면"과 닿는다 | `src/screens/SessionDetailScreen.tsx:5`·`:133`, `src/screens/SessionScreen.tsx:3` |
| v1.17 루틴 편집 화면의 실기기 확인이 기록에 없다. 특히 시트 안 36px 버튼의 탭 영역이 44px에 1~4px 못 미친 채 "사람 확인 필요"로 넘어갔다. 세션 화면은 운동 중에 쓰는 화면이라, 이 결과를 모르고 버튼 크기를 정할 수 없다 | `docs/DEV-RECORD-v1.17.md` "사람 확인 필요 (실기기)" |

①은 ②와 무관하게 쓸모가 있다. ②를 하게 되면 ①의 토큰을 그대로 쓴다.
이번에는 유리만 배포하고, 폰에서 본 뒤 ②를 다음 PLAN으로 한다(확정). 세션 화면 이전은 세션 화면·세트 카드·시트 8개·과거 세션 수정 화면까지 2,700줄 안팎을 다시 그리는 일이고 매 운동마다 쓰는 화면이라, 유리가 폰에서 괜찮은지부터 작은 변경으로 본다.

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
| PP1 | 유리 토큰 + 떠 있는 띠 넷(탭바·재개 스트립·세션 상단 바·휴식 바) + 재개 스트립이 내용을 가리지 않게 | 탭 화면 전부, 세션 화면 | 커밋 하나 |
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
| 재개 스트립이 떠 있어도 탭 화면의 아래 여백은 그대로다. 폰(인디케이터 34px)에서 스트립 위 끝은 바닥에서 56+34+44=134px, 내용 끝은 56+34+24=114px이다 | `global.css:96`·`:946-957`, `App.tsx:188-196` | 지금도 마지막 내용 20px이 스트립에 가린다. 스트립을 8px 띄우면서 여백만 8px 늘리면 그대로 20px이 가린다 |
| legacy 시트는 어두운 막(`.sheet-backdrop`, 검정 0.6)의 **자식**이다. 조상의 배경이 먼저 그려지므로 시트의 흐림이 보는 바탕에는 막이 이미 들어 있다 | `global.css:492-501` | 시트에 비치는 뒤 내용은 `(1 − 시트 알파) × (1 − 막 알파)`다. 시트 알파 0.86이면 0.14 × 0.4 = 5.6%로, 불투명 시트와 눈으로 구별이 안 된다 |
| Astryx 시트의 막은 `::backdrop`의 `--color-overlay`이고 라이트 검정 0.5, 다크 검정 0.8이다 | `core/src/BottomSheet/BottomSheet.tsx:185-186`, `theme-neutral/dist/theme.css`(`light-dark(#00000080, #000000CC)`) | 다크에서는 시트 알파를 0.72로 내려도 0.28 × 0.2 = 5.6%만 비친다 |

---

## PP0. 유리 스크린샷·검사 도구와 "바꾸기 전" 스크린샷

### 진단

- 사람이 폰에서 보기 전에 리뷰어가 볼 것이 필요하다. 유리는 눈으로 봐야 하고, "한 겹"·"투명도 줄이면 불투명"·"글자 대비"는 계산된 스타일로 잴 수 있다.
- vitest에서 `.css`는 빈 문자열로 읽힌다(DEV-RECORD 제약 3). CSS 규칙은 브라우저에서 재야 한다.
- `scripts/screenshots.mjs`는 루틴 편집 장면 전용이고 `docs/screenshots/v1.17/`에만 쓴다(`:23`).
- "바꾸기 전"은 CSS를 바꾸면 다시 찍을 수 없다.

### 설계

- 새 파일 `scripts/screenshots-glass.mjs`. 사용: `node scripts/screenshots-glass.mjs <before|after> [--check] [--engine=webkit] [--sheet-alpha=<값>]`. 뼈대(`vite preview`, `iPhone 14` 흉내 390×844, `ko-KR`, 온보딩 통과, 글자·`aria-label`로만 고르기)는 `screenshots.mjs`와 같다. 저장: `docs/screenshots/v1.18/<before|after>-<이름>.png`. **다크만 찍는다**(장면이 전부 다크 고정 화면이다).
- 검사 함수는 새 파일 `scripts/lib/glass-check.mjs`에 둔다(import해도 아무것도 실행하지 않는 모듈). `screenshots-glass.mjs`와 `screenshots.mjs`가 같이 import한다. `screenshots.mjs`는 맨 위에서 인자를 읽고 `process.exit(2)`를 부르므로(`:27-31`) 스크립트끼리 서로 import하지 않는다.
- `--sheet-alpha=<값>`: 농도 비교용. 페이지에 `:root { --glass-sheet: rgba(22, 22, 26, <값>) }`를 `addStyleTag`로 넣고(레이어 밖이라 `glass.css`를 이긴다) `sheet-finish`·`sheet-home`만 `docs/screenshots/v1.18/compare/<이름>-a<값 두 자리>.png`로 찍는다. 검사는 돌리지 않는다. CSS 파일은 건드리지 않는다(PP2에서 쓴다).
- `scripts/screenshots.mjs`에 `--out=<폴더>` 플래그 하나를 더한다(없으면 지금처럼 `v1.17`). 루틴 편집의 Astryx 시트는 이 스크립트로 `docs/screenshots/v1.18/editor/`에 찍는다(다크·라이트).

| 이름 | 장면 |
|---|---|
| `home` | 홈 (탭바) |
| `home-end` | 홈을 맨 아래까지 스크롤 |
| `home-resume` | 세션 시작 → `세션 최소화` → 홈 (재개 스트립 + 탭바) |
| `home-resume-end` | 위 상태에서 홈을 맨 아래까지 스크롤 (마지막 내용과 스트립) |
| `session` | 세션 화면, 첫 카드 열림 |
| `session-scrolled` | 세션 화면을 300px 스크롤 (카드가 상단 바 뒤로 지나간다) |
| `session-rest` | `1세트 완료`를 눌러 휴식 바가 뜬 화면 |
| `sheet-finish` | `종료`로 연 시트 (아래에 상단 바·휴식 바) |
| `sheet-timer` | `휴식 타이머 시작`으로 연 시트 |
| `sheet-home` | 홈에서 여는 시트 하나 (`DayPickerSheet`를 여는 버튼을 구현자가 코드에서 찾는다. 아래에 탭바) |

- `--check`의 **유리 검사** 아홉. `before`·`after` 어느 쪽에도 돈다. 하나라도 어기면 종료 코드 1. 출력 표는 장면 × 검사마다 `통과`·`실패`·`건너뜀`을 찍고, 하위 항목이 있는 검사(`탭바 자리`)는 어느 항목이 어겼는지를 같이 찍는다. `건너뜀`은 통과로 세지 않고 이유를 한 줄 찍는다.

| 검사 | 기준 |
|---|---|
| 유리 켜짐 | 장면에 있는 유리 층(`.tabbar`·`.resume-strip`·`.session-header`·`.rest-bar`, 시트 장면에서는 `.sheet` / `.astryx-bottom-sheet`)의 계산된 `backdrop-filter`(없으면 `-webkit-backdrop-filter`)가 `none`이 아니고 배경색 알파가 1 미만이다. Astryx 시트는 패널 가운데 점의 `elementsFromPoint`에서 패널에 닿기 전까지의 요소 배경이 전부 투명이어야 한다. **시트 장면의 아래 띠는 이 검사에서 뺀다**(한 겹 규칙으로 꺼진다) |
| 내용은 불투명 | `input`·`textarea`·`.stepper`·`.set-row`마다 조상을 거슬러 처음 만나는 "배경이 투명이 아닌 요소"가 알파 1이다. 시트 안의 입력칸도 같다(칸 자체가 불투명이어야 한다) |
| 한 겹 | 화면에 가로 5 × 세로 12 격자 점을 찍어, 점마다 `elementsFromPoint`로 겹친 요소 가운데 `backdrop-filter`가 `none`이 아닌 것이 1개 이하다 |
| 투명도 줄이기 | `prefers-reduced-transparency: reduce`를 흉내 내면(CDP `Emulation.setEmulatedMedia`의 `features`) 유리 층 전부가 `backdrop-filter: none`이고 배경 알파 1이다. 흉내를 건 뒤 `matchMedia('(prefers-reduced-transparency: reduce)').matches`가 `false`면(이 Chromium이 그 흉내를 못 한다) 이 검사는 `건너뜀`으로 찍는다. 그때 이 규칙을 지키는 것은 정적 검사(규칙이 있고 `대비 증가`와 같은 블록이다)와 `대비 증가` 검사다 — DEV-RECORD에 그렇게 구분해 적는다 |
| 대비 증가 | `prefers-contrast: more`를 흉내 내면 위와 같다 |
| 글자 대비 | 띠 안의 글자 요소마다 WCAG 대비가 4.5:1 이상(24px 이상 굵은 글자는 3:1). **바탕색:** 글자에서 띠까지 조상을 거슬러 올라가다 불투명 배경(알파 1)을 만나면 그 색(`.rest-btn`·`.session-end`처럼 자기 면이 있는 버튼), 못 만나면 띠 배경색을 `--accent`와 `--ok` 위에 각각 알파 합성한 색. 시트 장면에서는 **시트 면에 바로 놓인 글자**(시트까지 불투명 조상이 없는 글자)도 같이 잰다: 바탕은 시트 배경색을 (막 색을 `--accent`·`--ok` 위에 합성한 색) 위에 합성한 색. 합성은 sRGB 채널별 `α·위 + (1−α)·아래`. `disabled`·`aria-hidden` 요소는 뺀다 |
| 시트 비침 | 시트 장면에서 `(1 − 시트 배경 알파) × (1 − 막 배경 알파)`가 **0.10 이상**이다. 막은 legacy가 `.sheet-backdrop`의 배경색, Astryx가 `getComputedStyle(dialog, '::backdrop')`의 배경색. **Astryx 시트는 값만 찍고 기준을 걸지 않는다**(다크의 막 0.8은 Astryx 토큰이다 — PP2 범위 제외) |
| 탭바 자리 | `.tabbar`가 화면 좌·우·아래에서 8px 이상 떨어져 있다 · 탭 버튼 다섯이 각각 폭·높이 44px 이상 · `.resume-strip`과 `.tabbar`의 사각형이 겹치지 않는다 · **가림:** `home-end`·`home-resume-end`에서 `.screen`의 마지막 자식 요소의 아래 끝이 `.tabbar`(스트립이 있으면 스트립) 위 끝보다 위다 |
| 가로 넘침 | `document.documentElement.scrollWidth <= innerWidth` |

- `--check`는 장면을 돌기 전에 **정적 검사**를 한다(Node로 CSS 파일을 직접 읽는다): `src/styles/global.css`·`src/ax/ax.css`에 `blur(` 리터럴이 0건 · 두 파일의 `backdrop-filter` 선언 값이 전부 `var(--glass-`로 시작 · `src/styles/glass.css`에 `prefers-reduced-transparency`·`prefers-contrast`·`:has(`가 있다 · `glass.css`의 유리 끄기 두 블록(`@media`와 `@supports not`)의 선언이 공백을 빼고 글자 그대로 같다. `before`에서는 건너뛴다.
- `--engine=webkit`: Playwright WebKit으로 같은 장면을 `after-<이름>-webkit.png`로 한 번 더 찍는다(검사는 돌리지 않는다). iOS Safari는 아니지만 같은 계열 엔진이라 `-webkit-` 접두사와 시트 흐림이 그려지는지를 미리 본다. `npx playwright install webkit`이 안 되거나 Windows WebKit이 흐림을 안 그리면 DEV-RECORD 제약에 적고 넘어간다(멈추지 않는다).

### 검증

- `node scripts/screenshots-glass.mjs before`가 열 장면을 찍는다. 커밋한다.
- **검사가 잡는다는 증거:** `before --check`가 종료 코드 1이고, 아래 넷이 실패로 찍힌다. 하나라도 통과로 나오면 검사가 틀린 것이다. 출력 표를 DEV-RECORD에 복사한다.
  - `sheet-finish`의 `유리 켜짐` (지금 시트는 불투명이다)
  - `home`의 `탭바 자리` — 하위 항목 "좌·우·아래 8px" (지금 탭바는 화면 폭 전체다)
  - `home-resume-end`의 `탭바 자리` — 하위 항목 "가림" (지금 스트립이 마지막 내용 20px을 덮는다)
  - `session`의 `대비 증가` (지금은 끄는 규칙이 없다)
- `before`에서 `home`의 `글자 대비`는 **통과가 맞다**: 지금 탭바 배경 `rgba(11, 11, 13, 0.86)`을 합성하면 `--text-faint`가 주황 위 4.97:1, 초록 위 4.84:1이다. 이 검사가 잡는다는 증거는 결함 복원 ③·⑩이 맡는다. `before`의 `시트 비침`은 시트가 불투명이라 0으로 실패한다(증거 목록에는 넣지 않는다 — `유리 켜짐`과 같은 원인이다).
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

"공통 진단"의 1·2·6·7·8·9번째 줄.

### 설계

**새 파일 `src/styles/glass.css`** — 유리의 재료를 정하는 한 곳. `src/styles/index.css`에 `@import './glass.css' layer(legacy);`를 `global.css` 줄 다음에 더한다(같은 레이어, 나중 순서).

| 토큰 | 값 (`:root`) | 쓰는 곳 |
|---|---|---|
| `--glass-bar` | `rgba(22, 22, 26, 0.78)` | 띠 넷의 배경 |
| `--glass-bar-filter` | `saturate(180%) blur(20px)` | 띠 넷의 흐림 |
| `--glass-sheet` | `rgba(22, 22, 26, 0.72)` | 시트 배경 (PP2). 띠보다 옅다 — 시트 뒤에는 어두운 막(0.6)이 이미 깔려 있어서, 이 값이어야 뒤가 11% 비친다(PP2 "농도") |
| `--glass-sheet-filter` | `saturate(180%) blur(20px)` | 시트 흐림 (PP2) |
| `--glass-edge` | `rgba(255, 255, 255, 0.14)` | 유리 가장자리 선 1px |
| `--glass-pill` | `rgba(255, 255, 255, 0.08)` | 탭바에서 지금 탭 뒤의 알약 |
| `--glass-shadow` | `0 8px 28px rgba(0, 0, 0, 0.4)` | 떠 있는 캡슐의 그림자 |
| `--glass-solid` | `#16161a` (`--surface`와 같은 값) | 유리를 끌 때의 면 |

같은 파일의 규칙 셋(순서대로):

| 규칙 | 내용 | 왜 |
|---|---|---|
| Astryx 화면일 때 | `html[data-astryx-theme] { --glass-solid: var(--color-background-surface); --glass-sheet: color-mix(in srgb, var(--color-background-surface) 72%, transparent); --glass-edge: var(--color-border); }` | Astryx 시트는 폰의 라이트/다크를 따른다. 색을 따로 적지 않고 Astryx 토큰에서 만든다(파생). 이 선택자는 Astryx 화면이 떠 있는 동안만 걸린다 |
| 유리 끄기 | `@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { html:root { --glass-bar: var(--glass-solid); --glass-sheet: var(--glass-solid); --glass-bar-filter: none; --glass-sheet-filter: none; } }` 그리고 같은 선언을 `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`에도 | 끝 기준 3. `html:root`와 위의 `html[data-astryx-theme]`는 명시도가 같다(0,1,1). **파일에서 뒤에 있어서** 이긴다 — 규칙 머리에 "Astryx 규칙보다 뒤에 둔다. 순서를 바꾸면 Astryx 화면에서 유리가 안 꺼진다"를 주석으로 적는다. 흐림을 못 그리는 브라우저에서 반투명만 남으면 글자가 묻히므로 같이 끈다. 두 블록의 선언은 글자 그대로 같게 둔다(정적 검사가 본다) |
| 한 겹 | PP2에서 더한다 | — |

**`src/styles/global.css` — 띠 넷이 토큰을 읽는다**

`:root`(`:31-34`)에 자리 토큰 셋을 더한다: `--tabbar-inset: 12px;` · `--tabbar-bottom: max(var(--safe-b), 8px);` · `--resume-strip-h: 44px;`

| 규칙 | 지금 | 바꾼 뒤 |
|---|---|---|
| 넷 공통 (`.tabbar`·`.session-header`·`.resume-strip`·`.rest-bar`) | 색 `rgba(…)`, `backdrop-filter: saturate(180%) blur(20px)` 리터럴 | `background: var(--glass-bar)` · `-webkit-backdrop-filter: var(--glass-bar-filter)` · `backdrop-filter: var(--glass-bar-filter)` |
| `.tabbar` 모양 (`:277-289`) | `left: 0; right: 0; bottom: 0` · `padding-bottom: var(--safe-b)` · `border-top` | **떠 있는 캡슐:** `left`·`right: var(--tabbar-inset)` · `bottom: var(--tabbar-bottom)` · `max-width: 616px` · `margin: 0 auto` · `height: var(--tabbar-h)` · `border-radius: calc(var(--tabbar-h) / 2)` · `border: 1px solid var(--glass-edge)` · `box-shadow: var(--glass-shadow)` · `overflow: hidden`. `padding-bottom`과 `border-top`은 지운다 |
| `.tabbar button` (`:291-302`) | `color: var(--text-faint)` | `color: var(--text-dim)` (글자 대비). `position: relative` |
| `.tabbar button[aria-current='page']` | `color: var(--accent)` | 그대로 + `::before`(`position: absolute; inset: 6px 2px; border-radius: 22px; background: var(--glass-pill); z-index: -1`)로 알약. 버튼 높이는 56px 그대로다(탭 영역을 줄이지 않는다). `.tabbar`에 `isolation: isolate` |
| `.screen` 아래 여백 (`:96`) | `calc(var(--tabbar-h) + var(--safe-b) + 24px)` | `calc(var(--tabbar-h) + var(--tabbar-bottom) + 32px)` |
| 스트립이 있을 때의 아래 여백 (새 규칙, `.screen` 바로 아래) | 없음 — 스트립이 마지막 내용 20px을 덮는다 | `.app:has(.resume-strip) .screen { padding-bottom: calc(var(--tabbar-h) + var(--tabbar-bottom) + 8px + var(--resume-strip-h) + 32px); }` — 스트립 자리(8 + 44)만큼 더 비운다. 탭 화면은 전부 `.app` 안의 `.screen`이다(`App.tsx:160`). `:has()`를 모르는 브라우저에서는 지금과 같다 |
| `.resume-strip` 모양 (`:946-965`) | `left: 0; right: 0` · `bottom: calc(var(--tabbar-h, 56px) + var(--safe-b))` · `border-top` · `border-radius: 0` · `width: 100%` · `min-height: 44px` | `left`·`right: var(--tabbar-inset)` · `width: auto` · `min-height: var(--resume-strip-h)` · `max-width: 616px` · `margin: 0 auto` · `bottom: calc(var(--tabbar-h) + var(--tabbar-bottom) + 8px)` · `border-radius: 22px` · `border: 1px solid var(--glass-edge)` · `box-shadow: var(--glass-shadow)`. `border-top`은 지운다 |
| `.session-header` (`:575-588`) | `border-bottom: 1px solid var(--line)` | `border-bottom: 1px solid var(--glass-edge)`. 자리·크기는 그대로(화면 폭 전체, 상태바 자리까지 덮는다) |
| `.rest-bar` (`:1006-1018`) | `border-top: 1px solid var(--line)` | `border-top: 1px solid var(--glass-edge)`. 자리·크기 그대로 |
| `.rest-bar-done` (`:1020-1023`) | `background: rgba(52, 199, 89, 0.16)` | `background: linear-gradient(rgba(52, 199, 89, 0.16), rgba(52, 199, 89, 0.16)), var(--glass-bar)` (초록을 유리 위에 얹는다 — 지금 규칙은 띠 배경을 초록 16%로 **갈아 끼워서** 유리가 되면 거의 투명해진다) |

- 폰(홈 인디케이터 34px)에서 탭바가 차지하는 높이는 전과 같다(56 + 34). 달라지는 것은 좌우 12px이 비고, 인디케이터 자리에 내용이 비친다는 것이다. 인디케이터가 없는 화면에서는 아래로 8px 뜬다.
- `.tabbar`·`.resume-strip`의 `z-index`(20·25)와 `.rest-bar`(30)는 그대로다.
- 마크업은 바꾸지 않는다. `TabBar.tsx`·`SessionResumeStrip.tsx`·`RestTimerBar.tsx`·`SessionScreen.tsx` 무변경.
- 탭바·재개 스트립의 모양은 **떠 있는 캡슐로 확정**했다(요청이 "떠 있는 반투명 유리"다). 화면 폭 전체 띠로 되돌리는 방법은 "되돌리기"에 있다. 스트립이 있을 때의 아래 여백 규칙은 어느 모양이든 필요하다.
- 값은 `글자 대비` 검사를 통과하는 옅은 쪽으로 잡았다(띠 0.78: `--text-dim`이 초록 위 5.1:1, 주황 위 5.4:1. 지금 탭의 주황 글자는 4.6:1·4.9:1). 더 비치게 하고 싶으면 `glass.css`의 알파만 내리면 되지만 0.72에서는 초록 위에서 4.45:1로 못 미친다.

### 검증

`src/lib/v118.test.ts` (describe `PP1`)

- 스캔: `src/**/*.{ts,tsx}`(테스트 제외)에 `backdropFilter`·`WebkitBackdropFilter`·`backdrop-filter`가 없다(유리는 CSS 토큰으로만 건다. 인라인 스타일로 새 유리를 만들지 못하게).
- 소스는 `v117.test.ts:13`과 같은 방식(`import.meta.glob`의 `?raw`)으로 읽는다(`node:fs`는 제약 13).
- 구현자가 먼저 한 번 본다: `import.meta.glob('/src/styles/*.css', { query: '?inline', import: 'default', eager: true })`로 CSS 글이 읽히는가. **읽히면** PP0의 정적 검사 셋을 이 테스트에도 둔다(CI가 지킨다). **빈 문자열이면** 스크립트의 정적 검사만 두고 DEV-RECORD 제약에 "`?inline`도 빈 문자열"을 더한다.

`node scripts/screenshots-glass.mjs after --check` — PP1 뒤에는 `home`·`home-end`·`home-resume`·`home-resume-end`·`session`·`session-scrolled`·`session-rest`에서 검사가 전부 통과한다(`시트 비침`은 시트 장면에만 돈다. 시트 장면의 `유리 켜짐`·`시트 비침`은 PP2 뒤). 출력 표를 DEV-RECORD에 복사한다.

- 빌드 출력(명령과 출력 복사): `dist/assets/index-*.css`에 `--glass-bar`·`prefers-reduced-transparency`·`prefers-contrast`가 있고, `-webkit-backdrop-filter`와 `backdrop-filter`가 둘 다 남아 있다(esbuild가 한쪽을 지우지 않았다).
- 경계: 375px(`iPhone SE`)에서 `home`·`home-resume`을 한 번 더 찍어 탭 다섯의 글자가 잘리지 않는지 본다 · 재개 스트립의 휴식 숫자가 끝난 상태(`resume-rest-done`) · 휴식 바의 끝난 상태(`rest-bar-done` — 타이머를 `휴식 타이머 시작`의 가장 짧은 값으로 돌리거나, 못 기다리면 실기기 확인으로 넘긴다) · 세션 종류 칩(`복귀`·`디로드`)이 상단 바에 있을 때.
- 기존 테스트는 고치지 않는다. `polish.test.ts`(탭바 라벨·아이콘)·`timerOwnership.test.ts`·`useRestTimer.test.ts`가 수정 없이 통과한다.

### 범위 제외

- 탭바를 Astryx 부품으로: 부품이 없다("확인한 것").
- 세션 상단 바·휴식 바를 캡슐로 띄우기: 상단 바는 상태바 자리를 덮어야 하고, 휴식 바는 전체를 누르면 닫히는 영역과 진행 채움이 폭 전체에 걸려 있다(`global.css:1026-1050`). 재질만 바꾼다.
- 카드·버튼·입력칸을 유리로: 끝 기준 2("읽어야 하는 내용은 묻히지 않는다"). `내용은 불투명` 검사가 지킨다.
- 굴절·렌즈 효과: iOS Safari에서 안 된다("확인한 것").
- 업데이트 배너(`UpdatePrompt`): 떠 있는 층이 아니라 흐름 안의 줄이다.
- 설정 탭의 "유리 효과 끄기" 스위치(확정): 두지 않는다. 저장하는 설정을 늘리지 않고, 아이폰에서는 "대비 증가"로 끌 수 있다(README Limitations에 적는다). 폰에서 보고 필요하면 그때 작은 작업으로 더한다(이 폰에만 저장, 백업에 넣지 않는다).

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

"공통 진단"의 3·4·5·10·11번째 줄.

### 설계

**legacy 시트** (`src/styles/global.css` `.sheet`, `:502-513`) — 규칙 하나로 14개 시트가 같이 바뀐다. 이번 범위 밖 화면(식단·홈)의 시트도 같이 유리가 된다(확정: 화면마다 시트 모양이 갈리는 것이 이슈가 없애려는 것이다. 재질만 바뀌고 안의 내용은 그대로다. 식단의 입력칸은 `.field`라 불투명하다 — `global.css:855-860`).

| 속성 | 지금 | 바꾼 뒤 |
|---|---|---|
| `background` | `var(--surface)` | `var(--glass-sheet)` |
| 흐림 | 없음 | `-webkit-backdrop-filter: var(--glass-sheet-filter)` · `backdrop-filter: var(--glass-sheet-filter)` |
| 가장자리 | 없음 | `border-top: 1px solid var(--glass-edge)` |
| 나머지(둥근 모서리, 폭, `max-height`, 올라오는 움직임, `.sheet-backdrop`의 어두운 막) | — | 그대로 |

시트 안의 내용(`.field`·`.btn`·`.check-item`·`.pill`·`.segment`)은 건드리지 않는다. 입력칸과 버튼은 자기 배경(`--surface-2`)이 불투명하다.

**농도** — 시트 알파는 띠와 따로 정한다. 막이 뒤를 이미 40%로 어둡게 하기 때문이다.

| 시트 알파 | 뒤가 비치는 비율 (막 0.6) | 시트 면의 `--text-faint` 글자 대비 (막 뒤가 주황 / 초록일 때) |
|---|---|---|
| 0.86 (처음 설계) | 5.6% | 5.16 / 5.11 |
| **0.72 (확정)** | **11.2%** | **4.86 / 4.75** |
| 0.66 | 13.6% | 4.72 / 4.59 |
| 0.60 | 16.0% | 4.58 / **4.43 (미달)** |

- 0.72로 정한다: `시트 비침` 기준(0.10)을 넘고, 시트 면에서 가장 옅은 글자(`--text-faint`)가 4.5:1에 여유를 둔다. `--text-dim`은 6.87 / 6.72, 주황 글자는 6.19 / 6.05다.
- 구현자는 `--sheet-alpha=0.86`·`0.72`·`0.60`으로 `sheet-finish`·`sheet-home`을 찍어 `docs/screenshots/v1.18/compare/`에 커밋하고 PR 본문에 나란히 붙인다. **값을 고르는 일이 아니다**(값은 0.72다) — 사람이 PR에서 보고 바꾸고 싶을 때 볼 것을 남기는 일이다.
- `after --check`에서 시트 면 글자의 `글자 대비`가 미달로 나오면(여기서 계산하지 않은 글자색이 있을 때): `--glass-sheet` 알파를 0.75까지만 올려 본다(0.75에서 `시트 비침`이 정확히 0.10이다). 그래도 미달이면 멈추고 보고한다.
- legacy 막은 `fade-in`으로 0.15초 동안 `opacity`가 0에서 1로 간다(`global.css:500`·`:528-530`). `opacity`가 1 미만인 조상은 흐림의 기준을 끊으므로(Backdrop Root), Chromium에서는 그 0.15초 동안 시트에 뒤 내용이 안 비치다가 끝나면서 비친다. 비치는 양이 11%라 눈에 안 띌 것으로 본다. 실기기에서 "툭" 하고 바뀌는 것이 보이면 DEV-RECORD에 적는다(이번에 움직임은 바꾸지 않는다).

**Astryx 시트** (`src/ax/ax.css`, `@layer astryx-theme { … }` 안에 더한다)

| 규칙 | 왜 |
|---|---|
| `html[data-astryx-theme] .astryx-bottom-sheet { background-color: var(--glass-sheet); -webkit-backdrop-filter: var(--glass-sheet-filter); backdrop-filter: var(--glass-sheet-filter); border-block-start-color: var(--glass-edge); }` | 패널을 유리로. `astryx-theme` 레이어라 Astryx 부품 규칙(`astryx-base`)을 이긴다 |
| `html[data-astryx-theme] .astryx-bottom-sheet > :not([aria-hidden='true']) { background-color: transparent; }` | 패널 안의 스크롤 영역이 표면색을 다시 칠하는 것을 끈다("확인한 것"). 패널의 자식은 손잡이(`aria-hidden="true"`)와 스크롤 영역 둘뿐이다(`BottomSheetPanel.tsx:1252-1273`) |

- 규칙 머리에 "`@astryxdesign/core@0.7.13`의 `BottomSheetPanel` 구조에 기대고 있다. 버전을 올리면 `--check`의 `유리 켜짐`으로 다시 확인한다"를 적는다.
- `src/ax/index.tsx`는 바꾸지 않는다. Astryx 시트의 어두운 막(`::backdrop`, `--color-overlay`)·끌어내리기·`purpose`도 그대로다.
- **시트 뒤가 흐려지지 않고 또렷하게 비치면**(`<dialog>` 쪽에 흐림의 기준을 끊는 속성이 있을 때 생긴다. 계산된 스타일로는 안 잡히고 스크린샷에서만 보인다): 원인 속성을 찾아 DEV-RECORD에 적고, `glass.css`의 Astryx 규칙에서 `--glass-sheet`의 `72%`를 `94%`로 올려 반투명만 남긴다. 멈추지 않는다.
- **Astryx 입력칸:** `TextInput`·`NumberInput`의 `input` 자체는 배경이 `transparent`다(`core/src/TextInput/TextInput.tsx:81`, `NumberInput/NumberInput.tsx:132`). 칸의 면을 칠하는 것이 감싸는 요소인지, 그 색이 알파 1인지는 소스만으로 확정하지 못했다. 루틴 편집 시트에 `내용은 불투명`을 처음 돌릴 때 확인한다. 실패하면(입력칸 뒤로 시트가 비친다) `ax.css`의 `astryx-theme` 레이어에 `html[data-astryx-theme] .astryx-bottom-sheet :is(input, textarea) { background-color: var(--color-background-surface); }`를 더하고 DEV-RECORD에 적는다. 멈추지 않는다.
- **Astryx 다크 시트는 거의 안 비친다**(막 0.8 → 5.6%). 라이트는 14%다. `시트 비침`은 값만 찍는다. Astryx 시트 면의 글자는 72%에서도 읽힌다: `--color-text-secondary`가 라이트 6.6:1(면 `#ffffff`, 막 뒤 `#f1f1f1`), 다크 5.4:1(면 `#262626`, 막 뒤가 흰색일 때).

**한 겹** (`src/styles/glass.css`, "유리 끄기" 규칙 앞에 더한다)

| 규칙 | 왜 |
|---|---|
| `:root:has(.sheet-backdrop) { --glass-bar: var(--glass-solid); --glass-bar-filter: none; }` | 시트가 떠 있는 동안 아래 띠를 불투명한 면으로 바꾼다. 흐림은 맨 위 층(시트) 하나만 돈다. 띠는 어두운 막 아래에 있어서 바뀌는 것이 거의 안 보인다 |

`.sheet-backdrop`이 그려져 있는 동안 걸린다. 명시도가 (0,2,0)이라 유리 끄기·Astryx 규칙과 순서에 상관없이 이기는데, 셋이 같은 토큰을 다른 값으로 정하는 일이 없어 부딪치지 않는다.
**Astryx 시트(`dialog[open]`)에는 걸지 않는다.** Astryx 시트가 뜨는 화면은 루틴 편집뿐이고 그 화면에는 띠가 없다(`App.tsx:151-157`). 걸어도 재 볼 장면이 없는 규칙이 된다. ②에서 띠와 Astryx 시트가 한 화면에 생기면 그때 선택자에 `dialog[open]`을 더하고 장면으로 잰다.

### 검증

`src/lib/v118.test.ts` (describe `PP2`)

- 스캔: `src/components/*Sheet.tsx` 가운데 `sheet-backdrop`을 쓰는 파일 14개 전부가 `className="sheet"`를 가진다(시트마다 다른 클래스로 갈라지면 규칙 하나가 닿지 않는다).
- 스캔: `src/ax/index.tsx`의 `Sheet`가 `BottomSheet`에 `className`·`style`·`xstyle`을 넘기지 않는다(넘기면 Astryx가 시트 높이를 호출자가 정한 것으로 보고 키보드 대응을 끈다 — `BottomSheetPanel.tsx:848-858`).

`node scripts/screenshots-glass.mjs after --check` 열 장면 전부 통과, 종료 코드 0. `sheet-finish`·`sheet-timer`·`sheet-home`에서 `유리 켜짐`(시트)·`한 겹`·`내용은 불투명`·`시트 비침`(0.112)·`글자 대비`(시트 면 글자 포함)가 통과한다. 출력 표를 DEV-RECORD에 복사한다.

`node scripts/screenshots.mjs after --check --out=docs/screenshots/v1.18/editor` — v1.17의 모양 검사 여덟 + 흐름 검사 넷이 그대로 통과한다(종료 코드 0). `line-sheet`·`picker-sheet`·`picker-form`을 다크·라이트로 커밋한다. 이 장면들에 유리 검사 `유리 켜짐`·`내용은 불투명`·`시트 비침`(값만)을 돌리는 방법: `scripts/lib/glass-check.mjs`의 검사 함수를 `screenshots.mjs`가 시트 장면에서 부른다(같은 함수를 두 번 짜지 않는다).

- 구현자가 장면마다 `before`와 나란히 보고 DEV-RECORD에 적는다: 시트 뒤의 내용이 흐려져 비친다(`sheet-finish`에서 뒤의 주황 버튼·초록 체크 자리가 시트 위쪽에 번져 보이는가. **안 보이면 "이 값에서 유리는 눈에 안 보인다"고 그대로 적는다** — 멈추지 않고, 사람이 `compare/`를 보고 정한다) · 시트 안 글자와 입력칸이 또렷하다 · 시트가 떴을 때 아래 띠가 한 겹으로 보인다 · Astryx 시트가 라이트에서 밝은 유리, 다크에서 어두운 유리다.
- 경계: 시트 위에 시트(루틴 편집의 고르기 → 줄 시트 교체 — v1.17 흐름 검사 `시트 교체`가 본다) · 키보드가 올라온 시트(`picker-form`) · 내용이 길어 시트 안에서 스크롤되는 시트(`picker-sheet`, `sheet-finish`) · 시트를 닫은 직후 아래 띠의 유리가 돌아온다(`sheet-finish`를 닫고 `session`의 `유리 켜짐`을 다시 잰다).

### 범위 제외

- 시트를 화면에서 띄워 네 모서리를 둥글게(iOS 26의 작은 시트): Astryx 시트는 아래로 늘어나는 여유분과 끌기 계산이 화면 아래 끝에 붙어 있는 것을 전제로 한다(`BottomSheetPanel.tsx:338-339`). legacy 시트만 띄우면 두 시트의 모양이 갈린다.
- 어두운 막(`.sheet-backdrop`, `::backdrop`)에 흐림 걸기: 화면 전체 흐림은 비싸다(Astryx도 같은 이유로 안 한다).
- 어두운 막의 농도 바꾸기(legacy 0.6, Astryx 다크 0.8): 막은 "지금은 시트만 누를 수 있다"를 알리는 층이고 Astryx의 막 토큰은 `Dialog` 같은 다른 겹과 같이 쓴다. 시트를 더 유리답게 하는 가장 큰 손잡이이지만 재질이 아니라 화면 전체의 밝기가 바뀌는 일이라, 폰에서 보고 따로 정한다.
- legacy 시트 14개를 Astryx `Sheet`로 옮기기: ②·③.
- 시트 안의 버튼·입력칸 모양: 그대로.

### README 반영

없음(PP1의 항목이 시트까지 적고 있다).

---

## 되돌리기

| 폰에서 본 것 | 방법 |
|---|---|
| 시트를 열거나 끌 때 버벅인다 | `glass.css`에서 `--glass-sheet-filter: none`, `--glass-sheet` 알파를 1로(두 값). Astryx 규칙의 `72%`도 `100%`로. 띠의 유리는 남는다 |
| 시트가 유리로 안 보인다(불투명해 보인다) | `--glass-sheet` 알파를 0.66까지 내릴 수 있다(계산상 시트 면의 `--text-faint`가 4.59:1. 0.60은 4.43:1로 미달). Astryx 규칙의 `72%`도 같은 값으로. 그래도 안 보이면 남은 손잡이는 어두운 막의 농도다(PP2 범위 제외 — 새 이슈로) |
| 시트 뒤가 너무 비쳐 어수선하다 | `--glass-sheet` 알파를 올린다(0.86이면 사실상 불투명) |
| 세션 화면 스크롤이 끊긴다 | `--glass-bar-filter: none`, `--glass-bar` 알파 1 |
| 탭바 캡슐이 별로다 | 화면 폭 전체 띠로: PP1 표에서 `.tabbar` 모양·`.resume-strip` 모양·`.screen` 여백 세 줄만 되돌린다. 재질은 남는다. "스트립이 있을 때의 아래 여백" 규칙은 남기되 식에서 `+ 8px`과 `--tabbar-bottom`을 옛 자리(`--safe-b`)에 맞춘다 |
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
| 바텀시트 16개 | 불투명 | 뒤가 흐리게 비친다(0.72, 막 뒤라 11%). 식단·홈의 시트도 같이 바뀐다. Astryx 다크 시트는 거의 안 비친다(5.6%) |
| 재개 스트립이 떠 있을 때 탭 화면의 아래 여백 | 스트립이 마지막 내용 20px을 덮는다 | 스트립 자리만큼(52px) 더 비워서 안 덮는다 |
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
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). ⑦은 `TabBar.tsx`에 `style=`을 넣어 보는 것이고, `RestTimerBar.tsx:20`의 `style={{ transform }}`(진행 채움)은 원래 있는 것이라 스캔 대상이 아니다. 최소:
  ① `glass.css`의 끄기 규칙에서 `(prefers-contrast: more)` 삭제 → `--check` `대비 증가` 실패
  ② `glass.css`의 `:root:has(.sheet-backdrop)` 규칙 삭제 → 시트 장면의 `한 겹` 실패
  ③ `--glass-bar` 알파를 `0.5`로 → `글자 대비` 실패
  ④ `.sheet`의 `background`를 `var(--surface)`로 → `sheet-finish`의 `유리 켜짐` 실패
  ⑤ `ax.css`의 `.astryx-bottom-sheet > …` 투명 규칙 삭제 → 루틴 편집 시트의 `유리 켜짐` 실패
  ⑥ `.resume-strip`의 `bottom`을 옛 식 `calc(var(--tabbar-h, 56px) + var(--safe-b))`로 → `home-resume`의 `탭바 자리`(겹침) 실패
  ⑦ `TabBar.tsx`의 `<nav>`에 `style={{ backdropFilter: 'blur(4px)' }}` 추가 → `v118` PP1 스캔 실패
  ⑧ `global.css`의 `.rest-bar`에 `backdrop-filter: blur(20px)` 리터럴 → 정적 검사 실패
  ⑨ `.field`(`global.css:855-860`)의 `background`를 `transparent`로 → 시트 장면의 `내용은 불투명` 실패
  ⑩ `.tabbar button`의 `color`를 `var(--text-faint)`로 → `home`의 `글자 대비` 실패(알파 0.78에서 3.81:1 / 3.62:1)
  ⑪ `.app:has(.resume-strip) .screen` 규칙 삭제 → `home-resume-end`의 `탭바 자리`(가림) 실패
  ⑫ `--glass-sheet` 알파를 `0.86`으로 → 시트 장면의 `시트 비침` 실패(0.056)
  ⑬ `glass.css`의 `@supports not` 블록에서 `--glass-sheet-filter: none`만 삭제 → 정적 검사(두 블록 같음) 실패
- **과거 판정 불변 확인 절**(DEV-RECORD): ① `git diff --stat main..HEAD -- src`가 `src/styles/glass.css`·`index.css`·`global.css`·`src/ax/ax.css`·`src/lib/v118.test.ts`만 보인다(출력 복사) ② 골든 테스트 수정 없이 통과 ③ 바뀌는 것: "과거 판정 불변" 표.
- 완료 후 `docs/DEV-RECORD-v1.18.md`(맨 위 "이 환경에서 확인된 제약"은 v1.17 목록을 이어받고 새로 확인한 것을 더한다: CSS `?inline` 읽기 결과, WebKit 엔진 결과, `prefers-reduced-transparency` 흉내가 먹는지와 방법, Astryx 입력칸의 면을 칠하는 요소). "배포 영향" 절에 아래를 남기고 PR 본문 맨 위에도 넣는다:
  - 탭바가 떠 있는 캡슐이 되고, 탭바·재개 스트립·세션 상단 바·휴식 바·바텀시트가 반투명 유리가 된다. 기록·판정·내보내기·백업은 그대로다.
  - 아이폰은 "투명도 줄이기"를 웹앱에 알려주지 않는다. 유리를 끄려면 "대비 증가"를 켠다.
  - 농도·흐림을 고칠 자리는 `src/styles/glass.css` 한 파일이다. 시트 농도 비교는 `docs/screenshots/v1.18/compare/`(0.86 · 0.72 · 0.60).
  - 세션을 최소화했을 때 탭 화면의 아래 여백이 52px 늘어난다(재개 스트립이 마지막 내용을 덮던 것을 고쳤다).
  - 폰에서 볼 것: 아래 실기기 확인 목록.
- README: PP1의 "README 반영"을 PP1 커밋에서 고친다.
- `package.json` **1.18.0**은 기록 커밋에서 올린다.
- PR 본문에 `Refs #41`(닫지 않는다 — 끝 기준 1의 세션 화면 Astryx 이전이 남는다).
- 실기기 확인(구현자가 못 하면 DEV-RECORD에 "사람 확인 필요"로 남긴다) — 홈 화면 앱에서:
  ① 탭바 캡슐이 홈 인디케이터 위에 뜨고, 좌우와 아래로 내용이 비친다. 탭 다섯이 엄지로 잘 눌린다
  ② 홈을 끝까지 내렸을 때 마지막 내용이 탭바에 가리지 않는다. 세션을 최소화해 재개 스트립이 떠 있을 때도 가리지 않는다(다른 탭도 한 번)
  ③ 세션 화면을 스크롤하면 카드가 상단 바 뒤로 흐려져 지나가고, Day 이름·경과 시간·세트 수가 읽힌다
  ④ 휴식 바의 남은 시간과 진행 채움이 읽힌다. 끝났을 때 초록이 보인다. 주황 `세트 완료` 버튼이 휴식 바 바로 뒤에 오도록 스크롤했을 때 채움 위의 작은 글자(종목 이름 줄)가 읽힌다(진행 채움은 `글자 대비` 검사에 안 잡힌다 — "검토 반영 기록")
  ⑤ 세션 화면을 빠르게 스크롤해도 끊기지 않는다
  ⑥ 시트(`종료`·`휴식 타이머`·대체·템포 가이드, 식단의 먹은 것 추가)를 여닫을 때 버벅이지 않는다. 루틴 편집의 시트를 손가락으로 끌어내릴 때도 같다
  ⑦ 시트 뒤가 흐리게 비친다(또렷하게 비치면 안 된다. **불투명해 보이면** "되돌리기"의 "시트가 유리로 안 보인다"). 시트가 올라온 직후 비침이 "툭" 하고 바뀌지 않는다. 시트 안의 숫자·입력칸이 또렷하다. 루틴 편집의 시트는 라이트에서 비치고 다크에서는 거의 안 비치는 것이 정상이다
  ⑧ `설정 → 손쉬운 사용 → 디스플레이 및 텍스트 크기 → 대비 증가`를 켜면 유리가 전부 불투명해진다
  ⑨ 같은 곳의 `투명도 줄이기`는 켜도 안 바뀌는 것이 정상이다(바뀌면 iOS가 지원하기 시작한 것이고, 그것도 정상이다)
  ⑩ 저전력 모드에서 ⑤⑥을 한 번 더

리뷰 단위: 묶음 — 세 작업이 같은 CSS 파일 묶음(`glass.css`·`global.css`·`ax.css`)을 건드리고, PP1의 토큰 없이는 PP2를 볼 수 없다. 리뷰는 `docs/screenshots/v1.18/`의 전·후와 `--check` 출력 표를 보고 판정한다.

---

## 사람이 정할 것

이 PLAN의 구현을 막는 항목은 없다. 아래 셋은 **단계 ②(운동 중 화면을 Astryx 부품으로)를 설계하기 전에** 필요한 답이다. 답이 오면 다음 PLAN을 쓴다.

| # | 정할 것 | 선택지 | 설계자 추천 |
|---|---|---|---|
| 1 | 세션 화면이 Astryx가 되면 헬스장 경로(홈 → 세션)가 Astryx 코드(JS gzip 211KB + CSS gzip 48KB — v1.17 DEV-RECORD의 수치, 오프라인 캐시에서 읽는다)를 읽는다. README "핵심 설계 결정"의 "헬스장 경로가 Astryx 코드를 읽지 않습니다"를 고쳐야 한다 | 고쳐도 된다 / 안 된다(세션 화면은 Astryx로 옮기지 않고 재질만 맞춘다) | 고쳐도 된다 — 요청이 세션 화면을 이름으로 짚었다. 홈은 계속 Astryx를 읽지 않게 하고, 세션 화면에 들어갈 때만 읽게 설계한다 |
| 2 | 세트 카드를 과거 세션 수정 화면(기록 탭)이 같이 쓴다. 카드를 옮기면 그 화면도 같이 옮겨야 한다 | 같이 옮긴다 / 카드는 다음에(세션 화면의 틀·시트만 먼저) | 같이 옮긴다 — 카드를 두 벌로 두지 않는다 |
| 3 | v1.17 루틴 편집 화면을 폰에서 써 본 결과: 시트 안의 `−`·`+`·칩·스위치(보이는 높이 36px)가 엄지로 잘 눌리는가 | 잘 눌린다 / 옆이 눌리거나 안 눌릴 때가 있다 | 사람만 아는 사실이다. "안 눌릴 때가 있다"면 세션 화면에서는 Astryx 버튼의 보이는 높이를 44px로 올려 설계한다 |

화면 문구는 새로 생기지 않는다.

---

## 검토 반영 기록

검토 커밋 `a36f1c4`. 보고: `.reports/v1.18-codex.md`(그대로 진행 가능), `.reports/v1.18-claude.md`(수정 필요). 지적마다 코드를 직접 확인했다.

**반영**

| 지적 (검토자) | 확인한 것 | 고친 곳 |
|---|---|---|
| PP1 스캔 "`style=`이 없다"가 지금 코드에서 실패한다 (claude 고칠 것 1) | 맞다. `RestTimerBar.tsx:20`에 `style={{ transform: scaleX(…) }}`가 있다 | PP1 검증에서 그 스캔을 지웠다. 인라인으로 유리를 만드는 것은 첫 스캔(`backdropFilter` 금지)이 이미 막는다. 결함 복원 ⑦은 그대로 유효하다 |
| `before`에서 `home`의 `글자 대비`는 실패하지 않는다 (claude 고칠 것 2) | 맞다. 다시 계산해 4.97:1 / 4.84:1. `--text-faint`가 모자라는 것은 알파가 0.78로 내려간 뒤다(3.81 / 3.62) | PP0 검증의 실패 증거에서 뺐다. 결함 복원 ⑩을 더했다 |
| 재개 스트립이 홈 마지막 내용 20px을 가린다 (claude 고칠 것 3) | 맞다. 지금 134 대 114px, 처음 설계 뒤 142 대 122px | 공통 진단 9번째 줄, PP1 `--resume-strip-h`와 `.app:has(.resume-strip) .screen` 규칙, 장면 `home-resume-end`, `탭바 자리`의 "가림", 결함 복원 ⑪. 검토자는 규칙과 장면 가운데 하나를 권했는데 둘 다 넣었다(규칙을 지키는 검사가 있어야 한다) |
| 시트가 유리로 안 보인다: 막 0.6 위에 0.86 시트 (claude 고칠 것 4) | 맞다. `.sheet`는 `.sheet-backdrop`의 자식이라 비치는 양이 5.6%다. Astryx 막은 라이트 0.5 · 다크 0.8이다 | 공통 진단 10·11번째 줄, `--glass-sheet` 0.86 → 0.72(PP2 "농도"), 검사 `시트 비침`, `글자 대비`를 시트 면 글자까지, `--sheet-alpha` 비교 스크린샷, 되돌리기 두 줄, 결함 복원 ⑫ |
| `screenshots.mjs`는 import하는 순간 실행된다 (claude 경미 1) | 맞다(`:27-31`) | 검사 함수를 `scripts/lib/glass-check.mjs`로 |
| `html:root`가 이기는 이유는 명시도가 아니라 순서다 (claude 경미 2) | 맞다. 둘 다 (0,1,1) | PP1 "유리 끄기" 설명과 주석 요구. 한 겹 규칙의 명시도도 적었다 |
| Astryx 입력칸의 배경이 알파 1이라는 전제 (claude 경미 4) | `input` 자체는 `transparent`다. 감싸는 면은 소스만으로 확정하지 못했다 | PP2에 첫 실행 확인과 실패했을 때의 규칙 한 줄 |
| Astryx 시트의 "한 겹"은 검증할 장면이 없다 (claude 2절) | 맞다. 루틴 편집 화면에는 띠가 없다(`App.tsx:151-157`) | 한 겹 선택자에서 `dialog[open]`을 뺐다 |
| 새 스캔이 소스를 읽는 방식 (claude 3절) | `v117.test.ts:13`이 `?raw`로 읽는다 | PP1 검증에 한 줄 |
| 투명도 흉내가 이 Chromium에서 되는지 기록하고, 안 되면 결과를 구분한다 (codex 경미) | Playwright 1.65.0. 실행은 하지 않아 되는지는 모른다 | `투명도 줄이기` 검사에 `matchMedia` 확인과 `건너뜀`. DEV-RECORD 제약에 결과 |

**기각**

| 지적 (검토자) | 이유 |
|---|---|
| 유리 끄기 두 블록을 `--glass-on` 한 토큰으로 합친다 (claude 경미 3, "필수 아님") | CSS는 커스텀 속성 값으로 선언을 갈라 쓸 수 없다(스타일 질의는 iOS 18부터이고 legacy 화면은 그보다 낮은 iOS에서도 돈다). `@media`와 `@supports`를 한 블록으로 묶는 문법도 없다. 걱정한 것(한 곳만 고치기)은 정적 검사 "두 블록의 선언이 같다"와 결함 복원 ⑬으로 막는다 |
| "비친다"를 픽셀 밝기 검사로 (claude 고칠 것 4의 일부, "가능하면") | PNG를 풀어 읽는 코드와 시트 뒤에 밝은 띠를 끼워 넣는 장치가 필요하고, Chromium의 결과가 iOS Safari를 보장하지 않는다. 검토자가 손으로 한 계산을 그대로 검사로 만든 `시트 비침`이 같은 것을 정해진 값으로 잰다. 흐림이 끊기는 경우는 계산으로 못 잡으므로 스크린샷 눈 확인과 실기기 ⑦에 남겼다 |
| 시트 농도를 구현자가 두세 값 가운데 고른다 (같은 지적) | 값은 설계가 정한다(0.72 — 계산표가 PP2에 있다). 구현자는 비교 스크린샷을 남기기만 한다. 갈림길을 구현 단계로 넘기지 않는다 |
| PP0 도구가 크다 (claude 4절) | 검토자도 "그대로 두되"라고 했다. 장면 하나와 검사 하나가 늘었지만 검사 함수를 모듈 하나로 모아 두 스크립트가 같이 쓴다. 커밋은 그대로 넷이다 |

**두 검토자가 다르게 본 곳**

codex는 "그대로 진행 가능", claude는 "수정 필요"였다. 코드로는 claude가 맞다: codex는 검증 항목을 "구체적임"이라고 봤지만 그 가운데 둘(PP1의 `style=` 스캔, `before`의 `글자 대비` 실패 증거)이 지금 코드에서 설계서와 반대로 나온다. codex는 "놓치는 경우 — 충분히 고려함"이라고 했지만 재개 스트립의 가림과 시트의 비침은 빠져 있었다. codex는 이슈 원문을 읽지 못한 채 검토했다고 적었다.

**검토자가 틀린 곳:** claude 경미 2는 한 겹 규칙의 명시도를 (0,2,0)이라고 했다. 처음 설계의 `:root:has(.sheet-backdrop, dialog[open])`은 (0,2,1)이었다(`:has()`는 인자 가운데 가장 높은 것을 따른다). 결론(둘 다 이긴다)은 같았고, `dialog[open]`을 뺀 지금은 (0,2,0)이다.

**지적을 확인하다 설계자가 찾은 것**

| 무엇 | 처리 |
|---|---|
| `글자 대비` 검사가 "띠 안의 글자마다 띠 합성색과 비교"였다. `.rest-btn-strong`(주황 면 위 `#16100a` 글자, `global.css:1100-1103`)처럼 자기 면이 있는 버튼의 글자를 띠와 비교하면 거짓 실패가 난다 | 바탕색을 "띠까지 가는 길의 불투명 조상, 없으면 띠 합성색"으로 고쳤다 |
| 휴식 바의 진행 채움(`.rest-progress`, 주황 14%)은 글자의 조상이 아니라 형제라서 `글자 대비`에 안 잡힌다. 채움 위의 `.rest-label`(12px, `--text-dim`)은 띠 바로 뒤가 온통 주황일 때 4.3:1로 계산된다 | 검사는 넓히지 않았다. 뒤의 주황은 버튼 하나 크기이고 20px 흐림으로 주변의 어두운 면과 섞이므로 실제 바탕은 이보다 어둡다. 실기기 ④에 볼 것으로 적었다. 폰에서 안 읽히면 `--glass-bar` 알파를 0.82로 올린다(그 최악의 경우에도 4.61:1) |
| legacy 막의 `fade-in`(opacity)이 0.15초 동안 시트 흐림의 기준을 끊는다 | PP2 "농도"에 적고 실기기 ⑦에 볼 것으로 넣었다. 움직임은 바꾸지 않는다 |

**사람이 정할 것의 처리**

| 처음 번호 | 검토 | 처리 |
|---|---|---|
| 1 (세션 화면 이전을 이번에 뺀다) | 둘 다 동의 | (가)로 확정 → "단계 지도" |
| 1-a · 1-b · 1-c | claude: 이번 PLAN과 무관하게 ②를 열 때 필요한 답. 반대 근거 없음. 1-a의 청크 크기는 v1.17 기록을 믿은 수치 | **사람에게 남긴다**(지금의 1 · 2 · 3). README "핵심 설계 결정"을 고치는 일과 사람만 아는 실기기 결과라 설계자가 확정할 수 없다. 1에 수치의 출처를 적었다 |
| 2 (탭바 모양) | claude 동의(조건: 스트립 여백은 어느 쪽이든 필요), codex 반대 없음 | A(떠 있는 캡슐)로 확정. 조건은 PP1에 반영했다 |
| 3 (시트 14개 전부 유리) | claude 동의, codex 반대 없음 | A로 확정 → PP2 |
| 4 ("유리 효과 끄기" 스위치) | claude 동의, codex 반대 없음 | A(두지 않는다)로 확정 → PP1 범위 제외 |
