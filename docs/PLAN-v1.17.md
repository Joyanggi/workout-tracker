# PLAN v1.17 — 화면을 Astryx 디자인 시스템으로: 바탕 + 루틴 편집 화면 (OO)

> 작성: Fable 5.2 (설계자), 2026-11-11. 대상 코드: v1.16.0 (`main` `e5ad238`).
> 근거: 이슈 #37 (구조 변경) + 같은 이슈의 2026-11-11 댓글 "요청 수정 (사람)" — **끝 기준 2가 바뀌었다.**
>
> **바뀐 끝 기준 2 (이 PLAN이 따르는 것):** 색·애니메이션은 Astryx 테마를 따른다. 다크 고정·주황 액센트·애니메이션 최소는 지키지 않는다. 라이트/다크는 폰 설정을 따른다.
> 지키는 것은 쓰는 환경에서 나온 셋뿐이다: 운동 중 화면의 세트 입력 숫자는 크게(이번 범위 밖 — 세션 화면은 안 바꾼다) · 터치 타깃 44pt 이상 · 입력칸 글자 16px 이상.
> 이슈 본문의 "다크·주황 테마", `docs/DESIGN.md` 9절 승계는 폐기됐다.
>
> **성격:** 저장 구조(Dexie 3, 백업 `SCHEMA_VERSION` 3)·판정·내보내기 코드는 한 줄도 바꾸지 않는다. 바꾸는 것은 React 버전, CSS를 싣는 방법, 루틴 편집 화면과 그 시트 둘을 그리는 부품이다.
> 화면 문구·버튼 순서·누르면 일어나는 일은 지금 코드 그대로다. 손에 닿는 방식이 달라지는 곳은 "과거 판정 불변"의 표에 전부 적었다. README "핵심 설계 결정"을 뒤집지 않는다.
>
> **검토 반영:** 2026-11-11, 검토 둘(codex · claude). 무엇을 받고 무엇을 기각했는지는 끝의 "검토 반영 기록".
>
> **이 PLAN으로 이슈 #37은 닫힌다**(이슈의 "이번 범위"가 바탕 + 루틴 편집 화면이다). 나머지 화면은 사람이 폰에서 본 뒤 새 기획으로 연다.

---

## 단계 지도

| 단계 | 내용 | 상태 |
|---|---|---|
| ① | 바탕(React 19, Astryx 0.7.13 고정, 테마) + 루틴 편집 화면 | **이 PLAN (v1.17)** |
| ② | 나머지 화면(홈·세션·기록·분석·설정·식단), 하단 탭바, 전역 리셋 전환, 상태바 스타일 | 다음 기획. 사람이 ①을 폰에서 보고 정한다. 설계 안 함 |

---

## 방향 비교 (이슈가 설계자에게 맡긴 것)

| 선택지 | 이번 깨짐을 고치나 | 다음 화면도 안 흐트러지나 | 비용·위험 |
|---|---|---|---|
| **A. Astryx** (이슈의 방향) | 고친다 | 부품이 폭·줄바꿈·터치 영역을 맡는다 | 베타 0.7.x(0.7.13이 2026-11-10 배포, 카나리가 한 시간마다 나온다) · React 19 필요 · iOS 17.5 이상 필요 · CSS 281KB(gzip 44KB) · 안 바꾼 화면과 같이 살게 하는 작업이 든다(OO2) |
| B. 지금 CSS 정리만 | 고친다. 원인이 한 가지라 10줄 안팎이다("공통 진단" 표) | 아니다. 새 화면을 짤 때마다 같은 실수가 가능하다 | 가장 싸다. 의존성 없음 |
| C. 다른 UI 라이브러리 | 고친다 | 부품이 맡는다 | shadcn·Konsta는 Tailwind를 같이 들여야 한다. MUI·Mantine은 런타임 스타일 엔진이 붙는다. 바텀시트의 모바일 키보드 대응·터치 영역 44px·한글 조합 입력 보호를 다 가진 것은 Astryx뿐이었다(아래 "확인한 것") |
| D. 그대로 두기 | 아니다 | 아니다 | 없음 |

**설계자 판단: A로 간다. 단 이슈가 정한 대로 화면 하나만 바꾸는 시험이다.** B는 버리지 않고 되돌리기 경로로 남긴다 — 시험이 실패하면 OO3만 되돌리고 B를 적용한다("되돌리기").

## 확인한 것 (이슈의 "모르는 것")

`@astryxdesign/core@0.7.13`·`@astryxdesign/theme-neutral@0.7.13` 패키지를 받아 안의 타입 선언·문서·CSS를 읽었다(실행은 하지 않았다).

| 물음 | 답 | 근거 (패키지 안 경로) |
|---|---|---|
| 패키지 이름·필요 조건 | `@astryxdesign/core`, 테마 `@astryxdesign/theme-neutral`. peer: `react`·`react-dom` ≥ 19, `@stylexjs/stylex` ^0.19.0. 빌드 플러그인은 필요 없다(미리 빌드된 CSS·JS) | `package.json`, `README.md` |
| CSS 크기 | `astryx.css` 281,374바이트, gzip 44,246바이트. 테마 CSS gzip 4,120바이트 | 직접 쟀다 |
| 주황 액센트·큰 숫자를 테마로 맞출 수 있나 | 된다. `defineTheme({ extends: neutralTheme, tokens: { '--color-accent': [밝을 때, 어두울 때] }, typography: { scale } })`. 크기 토큰(`--size-element-*`)도 테마로 바꾼다. **바뀐 기준 2에서는 필요 없어 쓰지 않는다** | `dist/theme/defineTheme.d.ts` |
| 라이트/다크가 폰 설정을 따르나 | 따른다. `<Theme mode="system">`(기본값). 색은 CSS `light-dark()`로 갈린다 | `src/theme/Theme.tsx` |
| 바텀시트 | **있다.** `BottomSheet`: 네이티브 `<dialog>`, 모바일 키보드 대응, `purpose`(`info`는 바깥 탭·쓸어내리기로 닫힘, `form`은 막음), `height`(`hug`·`capped`·`tall`). `purpose`는 열려 있는 동안 바꿔도 따라온다(닫기 판단이 매번 지금 값을 읽는다) | `src/BottomSheet/BottomSheet.doc.mjs`, `src/BottomSheet/BottomSheet.tsx:549-558`·`:996` |
| 하단 탭바 | **없다.** `TabList`는 위쪽 탭, `MobileNav`는 햄버거 서랍이다. 이번 화면은 탭바가 없어 영향이 없다. ②에서 `TabBar.tsx`를 앱 부품으로 남길지 정한다 | `dist/` 목록, `src/MobileNav/MobileNav.doc.mjs` |
| 터치 타깃 44pt | 버튼의 보이는 높이는 28·32·36px(`sm`·`md`·`lg`)이고, 터치 기기(`pointer: coarse`)에서는 보이지 않는 탭 영역을 44px까지 넓힌다. **넓히는 폭은 이웃 컨트롤과의 간격 절반까지다** → 36px 버튼이 44px가 되려면 이웃과 8px 이상 떨어져야 한다(OO3 "세 파일 공통") | `src/utils/touchHitArea.ts`, `src/utils/hitArea.ts:144-203`, `src/Button/buttonHitArea.ts` |
| 버튼 높이를 정하는 속성 | `Button`은 `height`만 정하고 `min-height`를 정하지 않는다. 터치에서 스스로 `min-height: 44px`를 거는 부품은 따로 있다(`astryx.css`에 4곳) → OO2 "legacy 누수 막기" | `src/Button/Button.tsx:277-287`, `dist/astryx.css` |
| 아이콘만 있는 버튼 | `isIconOnly`면 `label`은 `aria-label`로만 쓰이고, 보이는 것은 `icon`(`ReactNode`)이다. `icon`이 없으면 빈 정사각형이 그려진다 | `dist/Button/Button.d.ts:53-58`·`:108-114` |
| 줄(`Item`) 안의 버튼 | `Item`에 `onClick`을 주면 줄 전체를 덮는 보이지 않는 버튼이 생기고, `endContent`의 버튼을 누르면 줄의 동작은 안 돈다(버튼 안에 버튼이 들어가지 않는다) | `src/Item/Item.tsx:697-720` |
| 폰의 글자 크기 설정 | 맨 바깥 `<Theme>`가 iOS "글자 크기" 설정을 읽어 **Astryx 글자만** 키운다. 안 바꾼 화면은 지금처럼 안 커진다 | `src/theme/dynamicType.ts` |
| 입력칸 글자 16px | neutral 테마는 터치 + 좁은 폭에서 본문 기준 글자를 14→16px로 올린다 | `theme-neutral/src/neutralTheme.ts` `adaptations` |
| 숫자 입력의 − ＋ 버튼 | `NumberInput`의 증감 버튼은 **터치 기기에서 숨는다.** 폰에서는 숫자 키보드 입력만 남는다 → OO2에서 버튼을 붙인 조합 부품을 만든다 | `src/NumberInput/NumberInput.doc.mjs` `hasNumberSteppers` |
| 지원 브라우저 | `astryx.css`에 `light-dark()` 145곳, `@starting-style` 17곳. 테마 CSS는 `@scope`를 쓴다. 셋 다 **iOS Safari 17.5 이상**이어야 한다 | 직접 셌다 |
| 글꼴 | 테마가 Figtree를 이름만 부르고 싣지 않는다. 대체 목록이 `-apple-system`이라 아이폰에서는 시스템 글꼴(한글은 Apple SD Gothic Neo)로 나온다 | `core/README.md` "The webfont itself" |

---

## 작업 개요

| ID | 내용 | 화면 변화 | 되돌리는 단위 |
|---|---|---|---|
| OO0 | 스크린샷 도구와 "바꾸기 전" 스크린샷 (앱 코드 무변경) | 없음 | — |
| OO1 | React 18.3 → 19 | 없음 | 커밋 하나 |
| OO2 | Astryx 바탕: 버전 고정, CSS 레이어, 범위 한정 리셋, 테마 래퍼, 앱 쪽 얇은 부품 | 없음 (쓰는 화면이 아직 없다) | 커밋 하나 |
| OO3 | 루틴 편집 화면·종목 줄 시트·종목 고르기 시트를 Astryx로 | 세 곳 | 커밋 하나 |

---

## 공통 진단 — 왜 깨졌나

원인은 한 가지다. `.btn`이 `width: 100%`이고(`src/styles/global.css:153-164`), 그 버튼을 가로 줄(`.btn-row`, `.row` — `display: flex`)에 다른 것과 나란히 놓았다.

| 깨진 모양 (이슈) | 코드 | 왜 |
|---|---|---|
| 제목이 한 글자씩 세로로 쌓인다 | `RoutineEditorScreen.tsx:207-215` — `‹ 취소`(.btn) · `<h1 style={{flex: 1}}>` · `저장`(.btn) | 두 버튼이 각각 폭 100%를 요구한다. `h1`은 `flex: 1`(기준 폭 0)이라 줄어들 수 있는 데까지 줄고, 한글은 글자마다 줄바꿈이 돼서 최소 폭이 한 글자다 |
| Day 이름 칸이 `Day 1 — F`로 잘린다 | `:247-271` — `.field`(폭 100%) · `▲`(.btn) · `▼`(.btn) | 셋이 같은 비율로 줄어 입력칸이 줄의 1/3이 된다 |
| 종목 이름이 `1. 인…`으로 잘리고 ▲▼가 폭을 다 차지한다 | `:283-311` — `.row-main`(`min-width: 0`, `global.css:226-228`) · `▲` · `▼` | `.row-main`은 0까지 줄 수 있고 버튼 둘은 100%씩 요구한다. `.row-title`은 `nowrap + ellipsis`다(`:230-236`) |

먹은 것 추가 시트(`FoodLogSheet.tsx`)의 폭·가림 문제는 이번 범위가 아니다(이슈 "이번 범위"). ②에서 다룬다.

**바탕을 까는 데 걸리는 것 — 안 바꾼 화면과 같이 살기**

| 사실 | 근거 | 그대로 들이면 |
|---|---|---|
| Astryx CSS는 전부 캐스케이드 레이어 안에 있다(`reset` → `astryx-base` → `astryx-theme`). 레이어 밖 CSS가 항상 이긴다 | `core/src/reset.css` 머리말 | `global.css:68-76`의 `button { border: none; background: none; min-height: 44px }`와 `:78-84`의 `input { font-size: 16px }`가 레이어 밖이라 **Astryx 버튼·입력의 배경·테두리를 전부 지운다** |
| 레이어 순서는 **양쪽이 같은 속성을 정했을 때만** 승부를 낸다. Astryx `Button`은 `min-height`를 정하지 않는다 | `core/src/Button/Button.tsx:277-287` | `global.css`를 낮은 레이어에 넣어도 `button { min-height: 44px }`(`:75`)는 살아남는다. Astryx 버튼이 36이 아니라 44px로 그려지고 아이콘 버튼의 정사각이 깨진다(36×44) |
| Astryx `reset.css`는 문서 전체에 건다: `p`·`h1~h6` 여백 0, `button`·`input` 안쪽 여백 0, 모든 요소 테두리 폭 0, `svg` `display: block` | `core/src/reset.css` | 안 바꾼 화면이 흔들린다. `<p>`가 137곳인데 `global.css`에 `p` 여백 규칙이 없다(브라우저 기본값에 기대고 있다) |
| `<Theme>`는 감싼 `div`에 글자색·글꼴을 건다(상속된다). 맨 바깥 `<Theme>`는 떠 있는 동안 `<html>`에 `data-astryx-theme`를 달고, 내려가면 뗀다 | `core/src/theme/Theme.tsx` | 앱 전체를 감싸면 안 바꾼 화면의 글자색·글꼴이 바뀐다 |
| `astryx.css`의 전역 선택자는 `:root`(토큰 선언)뿐이다. `global.css`의 사용자 정의 속성 19개·키프레임 2개와 이름이 겹치지 않는다 | 직접 대조했다 (겹침 0) | 문제없다 |
| 홈 → 세션이 헬스장 경로다. recharts는 그래서 지연 로딩한다 | `README.md:233-241` | Astryx를 `main.tsx`에서 부르면 운동 중 경로가 281KB CSS와 부품 코드를 읽는다 |
| `routineEdit` 화면이 떠 있을 때 `App`은 그 화면만 그린다(탭바·배너·재개 스트립 없음) | `src/App.tsx:151-153` | 그 화면만 `<Theme>`로 감싸면 다른 화면과 겹치지 않는다 |

---

## OO0. 스크린샷 도구와 "바꾸기 전" 스크린샷

### 진단

- 끝 기준 3: 구현자가 iPhone 크기로 바꾸기 전·후 스크린샷을 찍고, 리뷰어가 그것을 보고 판정한다.
- 지금 환경의 브라우저 도구는 창 크기만 줄인다. `pointer: coarse`가 아니라서 Astryx의 터치 적응(글자 16px, 탭 영역 44px, 증감 버튼 숨김)이 **켜지지 않은 화면**이 찍힌다. 라이트/다크도 바꿀 수 없다.
- "바꾸기 전"은 코드를 바꾸면 다시 찍을 수 없다. 그래서 다른 작업보다 먼저 커밋돼야 한다.

### 설계

- `devDependencies`에 `playwright`(설치 시점 최신 1.x를 **정확한 버전**으로). 브라우저는 `npx playwright install chromium`으로 받는다(레포에 넣지 않는다, CI는 받지 않는다).
- 새 파일 `scripts/screenshots.mjs`. 사용: `node scripts/screenshots.mjs <before|after> [--check]`. `npm run build` 뒤 `vite preview`를 띄우고(포트는 스크립트가 고른다) 찍는다.
- 기기 흉내: Playwright `devices['iPhone 14']`(390×844, 터치, 모바일) + `locale: 'ko-KR'`. `colorScheme`은 `dark`·`light` 둘 다. 폭 375(`iPhone SE`)는 `editor-full`·`line-sheet`만 더 찍는다.
- 매번 새 브라우저 컨텍스트(빈 IndexedDB) → 온보딩 통과 → 설정 탭 → `편집`. 요소는 **글자와 `aria-label`로만** 고른다. 문구가 전·후 같으므로 같은 스크립트가 전·후에 모두 돈다(이것이 "문구·동작 그대로"의 확인이기도 하다).
- 저장 위치: `docs/screenshots/v1.17/<before|after>-<이름>-<dark|light>[-375].png`. 커밋한다(리뷰어와 사람이 본다). **`before`는 다크만 커밋한다** — 바꾸기 전 화면은 다크 고정이라 라이트가 같다. 스크립트가 라이트도 찍어 다크와 바이트로 같은지 확인만 하고 지운다. `after`는 다크·라이트 둘 다 커밋한다.

| 이름 | 장면 |
|---|---|
| `editor-full` | 번들 루틴 편집 화면 전체(세로 전체 캡처) |
| `editor-long` | `＋ 종목 추가` → `＋ 새 종목 만들기`로 이름 `스크린샷용 아주 긴 이름의 인클라인 덤벨 벤치 프레스 변형`인 내 종목을 만들어 첫 Day에 넣고, 이어서 열리는 줄 시트를 `닫기`로 닫은 편집 화면. 번들 종목 이름은 두 줄이 안 될 수 있어서 **줄바꿈은 이 장면이 증명한다** |
| `editor-leave` | Day 이름을 한 글자 고친 뒤 `‹ 취소` → `저장하지 않고 나가기` · `계속 편집` |
| `editor-problems` | 루틴 이름을 비우고 `저장` → 문제 목록 |
| `line-sheet` | 첫 Day 첫 종목 줄을 눌러 연 시트(끝까지 스크롤한 것도 한 장: `line-sheet-end`) |
| `picker-sheet` | `＋ 종목 추가`로 연 시트 |
| `picker-form` | `＋ 새 종목 만들기` 폼 |
| `home` · `settings` | 안 바꾼 화면 표본 둘 (OO1·OO2가 건드리지 않았는지 보는 용도) |

- `--check`는 장면마다 아래 **모양 검사**를 재서 표로 찍고, 하나라도 어기면 종료 코드 1이다. `before`·`after` 어느 쪽에도 돌릴 수 있다(`before`는 실패해야 한다 — 아래 "검증").

| 모양 검사 | 기준 |
|---|---|
| 가로 넘침 | `document.documentElement.scrollWidth <= innerWidth` |
| 제목 한 줄 | `루틴 편집` 제목 요소의 높이 < 줄 높이 × 1.5 |
| 머리 줄 | `‹ 취소` · `루틴 편집` · `저장` 세 요소의 사각형이 서로 겹치지 않고 셋 다 화면 폭 안에 있다(390·375 둘 다) |
| 글자 잘림 | 화면에 보이는 글자 요소 전부 `scrollWidth <= clientWidth`(말줄임표로 잘린 것이 없다). `input`도 잰다(값이 칸보다 길면 넘친다 — Day 이름 칸). 화면에서 숨긴 요소(크기 1px 이하, `clip`으로 가린 라벨)는 뺀다 |
| 입력 글자 | `input`·`textarea` 전부 계산된 `font-size` ≥ 16px |
| 마지막 줄 | 시트를 끝까지 스크롤했을 때 맨 아래 버튼의 가운데 점에서 `elementFromPoint`가 그 버튼(이나 그 안)이다 |
| 탭 영역 | 버튼·스위치·토글마다 가운데에서 위·아래·좌·우 21px 떨어진 네 점의 `elementFromPoint`가 그 컨트롤(이나 그 안)이다. **예외를 두지 않는다.** 실패하면 그 자리의 간격을 넓힌다(OO3 "세 파일 공통"). 넓힐 수 없는 자리가 나오면 구현자가 멈추고 보고한다 |
| 버튼 높이 (`after`만) | 글자 버튼(`‹ 취소`·`저장`·`＋ 종목 추가`·`Day 삭제`·`＋ Day 추가`·`닫기`)의 `getBoundingClientRect().height`가 36px이다(44px이면 `legacy`의 `min-height`가 샌 것이다). 아이콘 버튼(`Day 위로`·`Day 아래로`·`종목 위로`·`종목 아래로`·`… 감소`·`… 증가`)은 폭 = 높이 = 36px이고 안에 보이는 글자가 있다(`innerText`가 비어 있지 않다) |

- `after --check`는 이어서 **흐름 검사**를 돈다(스크린샷 없이 판정만. `before`에서는 돌지 않는다). `editor-long`을 찍은 브라우저 컨텍스트에서 이어서 돈다(내 종목이 하나 있는 상태). 시트는 `getByRole('dialog', { name })`으로 찾는다.

| 흐름 검사 | 기준 |
|---|---|
| 시트 교체 | 고르기 시트에서 종목을 고르면 `종목 줄 편집` 시트가 열려 있고 `종목 고르기` 시트는 없다. `닫기` 뒤: 열린 `dialog`가 없고, `<html>`·`<body>`·`#root`에 `inert`가 없고, `저장` 버튼 가운데 점의 `elementFromPoint`가 그 버튼이고, 화면이 세로로 스크롤된다(`scrollTo` 뒤 `scrollY > 0`) |
| 바깥 탭 | 고르기 시트의 목록에서 시트 바깥(화면 맨 위, y=20)을 탭하면 닫힌다. `＋ 새 종목 만들기` 폼에서 같은 곳을 탭하면 **안 닫힌다.** `뒤로`로 목록에 돌아와 다시 탭하면 닫힌다 |
| 편집 → 뒤로 → 고르기 | (그 내 종목으로) 목록의 `편집` → 폼 → `뒤로` → 목록이 다시 보이고, 그 종목을 고르면 줄 시트가 열린다 |
| 긴 검색어 | `종목 검색`에 40자를 넣어도 가로 넘침이 없고 `맞는 종목이 없습니다.`가 보인다. 지우면 목록이 돌아온다 |

### 검증

- `node scripts/screenshots.mjs before`가 위 장면을 다크·라이트로 찍는다(바꾸기 전 화면은 다크 고정이라 둘이 같아야 한다 — 같지 않으면 스크립트가 틀린 것이다).
- `before-editor-full-dark.png`에 이슈의 세 깨짐(세로로 쌓인 제목, 잘린 Day 이름, `1. 인…`)이 보인다. 안 보이면 장면이 틀린 것이다.
- **검사가 깨짐을 잡는다는 증거:** `node scripts/screenshots.mjs before --check`가 종료 코드 1이고, `editor-full`에서 `제목 한 줄`과 `글자 잘림`이 실패로 찍힌다. 둘 중 하나라도 통과로 나오면 검사가 틀린 것이다. 출력 표를 DEV-RECORD에 복사한다.
- `npm test`·`npm run build`·`node scripts/quality-scan.mjs --ci`가 그대로 통과한다(앱 코드 무변경).

### 범위 제외

- CI에서 스크린샷 찍기·픽셀 비교 자동화: 브라우저 내려받기가 CI 시간을 늘린다. 사람이 눈으로 보는 것이 끝 기준이다.
- Playwright를 쓸 수 없는 환경이면(내려받기 차단 등): 브라우저 도구로 390px 창에서 같은 장면을 찍고, DEV-RECORD "이 환경에서 확인된 제약"에 "터치 적응·라이트 모드는 찍지 못했다"를 적고 "사람 확인 필요"로 넘긴다. `--check`의 수치는 `getComputedStyle`로 잰다.

### README 반영

없음.

---

## OO1. React 18.3 → 19

### 진단

- Astryx는 React 19 이상이 필요하다(peer `>=19.0.0`). 지금 `react`·`react-dom` `^18.3.1`, `@types/react` `^18.3.12`(`package.json`).
- 다른 의존성은 이미 19를 받는다: `dexie-react-hooks@1.1.7`(react ≥16), `zustand@4.5.5`(≥16.8), `recharts@3.10.1`(^19 포함), `@vitejs/plugin-react@4.3.4`. `package-lock.json`의 `react-is`는 이미 19.2.8이다.
- 코드에서 19에 걸리는 것은 전역 `JSX` 이름공간 두 곳뿐이다(`@types/react` 19에서 없어졌다): `src/components/TabBar.tsx:20`, `src/screens/HomeScreen.tsx:271`. `forwardRef`·`defaultProps`·`propTypes`·`ReactDOM.render`·인자 없는 `useRef()`·값을 돌려주는 ref 콜백은 없다(grep 0건).
- React 렌더 테스트가 없다(DEV-RECORD 제약 5). 테스트는 순수 함수와 소스 스캔이라 React 버전의 영향을 받지 않는다.

### 설계

| 파일 | 바꾸는 것 |
|---|---|
| `package.json` | `react`·`react-dom` → `^19`(설치 시점 최신 19.x), `@types/react`·`@types/react-dom` → `^19` |
| `TabBar.tsx:20`, `HomeScreen.tsx:271` | `JSX.Element` → `import type { JSX } from 'react'`를 더해 그대로 쓴다 |
| 그 밖 | `npm run build`가 타입 오류를 내면 그 자리만 고친다. 동작을 바꾸는 수정이 필요해지면 멈추고 보고한다 |

`createRoot`·`StrictMode`는 그대로다(`src/main.tsx`). `zustand`·`dexie-react-hooks`·`recharts` 버전은 올리지 않는다.

### 검증

- `npm run build` 통과(타입 확인 경로). `npm test` 전체가 **테스트 수정 없이** 통과.
- `node scripts/screenshots.mjs after`의 `home`·`settings`·`editor-full`(다크)을 OO0의 `before`와 **`cmp`로 먼저 비교한다**(같은 스크립트·같은 Chromium. 홈에는 날짜·주차가 있으니 `before`와 같은 날에 찍는다). 바이트가 다르면 눈으로 보고 어디가 다른지 DEV-RECORD에 적는다. 이 단계의 `after` 파일은 커밋하지 않는다(OO3에서 다시 찍는다).
- 손으로 한 번씩: 홈 → 세션 시작 → 세트 체크 → 휴식 타이머 → 세션 종료, 분석 탭(recharts 지연 로딩) 열림, 설정 → 루틴 편집 → 저장. 콘솔에 React 경고·오류가 없다.

### 범위 제외

- React 19의 새 API(`use`, Actions, ref를 props로) 도입: 필요가 없다.
- `zustand` 5·Vite 6 올리기: 이 작업과 무관하다.

### README 반영

- `README.md:5` 배지 줄과 `:352` Tech Stack: `React 18` → `React 19`

---

## OO2. Astryx 바탕

### 진단

"공통 진단"의 두 번째 표. 요약하면 그대로 들일 때 네 가지가 깨진다: ① 레이어 밖 `global.css`가 Astryx 부품을 지운다 ② 레이어에 넣어도 Astryx가 정하지 않는 속성(`button`의 `min-height: 44px`)은 샌다 ③ 전역 리셋이 안 바꾼 화면을 흔든다 ④ 운동 중 경로가 Astryx를 읽는다.

### 설계

**의존성** (`package.json` `dependencies`, 캐럿 없이 정확한 버전)

| 패키지 | 버전 |
|---|---|
| `@astryxdesign/core` | `0.7.13` |
| `@astryxdesign/theme-neutral` | `0.7.13` (core와 같은 버전이어야 한다 — peer가 `0.7.13` 고정) |
| `@stylexjs/stylex` | 설치 시점 최신 `0.19.x`를 정확한 버전으로 |

`@astryxdesign/cli`는 넣지 않는다. 부품 문서는 `node_modules/@astryxdesign/core/src/<부품>/<부품>.doc.mjs`와 `dist/<부품>/*.d.ts`를 읽는다. **`astryx init`은 실행하지 않는다**(`CLAUDE.md`·`AGENTS.md`를 고친다 — 규칙 파일은 규칙 정비자 것이다).

**CSS를 싣는 방법**

| 파일 | 내용 | 언제 읽히나 |
|---|---|---|
| 새 `src/styles/index.css` | `@layer reset, legacy, astryx-base, astryx-theme;` 한 줄, 그 아래 `@import './global.css' layer(legacy);` | 앱 시작 (`main.tsx`가 `global.css` 대신 이것을 import) |
| `src/styles/global.css` | **무변경** | 위 파일을 통해 `legacy` 레이어로 |
| 새 `src/ax/index.tsx`의 import 세 줄 | `@astryxdesign/core/astryx.css` → `@astryxdesign/theme-neutral/theme.css` → `./ax.css` | 루틴 편집 화면을 처음 열 때 (지연 청크) |
| 새 `src/ax/ax.css` | 아래 "범위 한정 리셋"·"legacy 누수 막기"·"문서 바탕" | 위와 같이 |

- 레이어 순서는 처음 선언된 대로 굳는다. `index.css`가 먼저 읽히므로 `legacy`가 `reset`과 `astryx-base` 사이에 들어간다. Astryx CSS가 나중에 `@layer reset, astryx-base, astryx-theme;`를 다시 선언해도 순서는 안 바뀐다.
- 결과: 안 바꾼 화면은 전과 같다(같은 레이어 안에서 규칙 순서가 그대로다). Astryx 부품의 규칙(`astryx-base`)은 **같은 속성을 정한 곳에서** `global.css`의 `button`·`input` 규칙(`legacy`)을 이긴다. Astryx가 정하지 않는 속성은 `legacy` 값이 남는다 → 아래 "legacy 누수 막기".
- `@import … layer(legacy)`는 Vite(설치된 5.4.21)의 postcss-import가 `@layer legacy { … }`로 풀어 준다. 가정으로 두지 않고 빌드 출력과 dev 서버 둘 다에서 확인한다("검증").
- `@astryxdesign/core/reset.css`는 **import하지 않는다.** `@astryxdesign/theme-neutral/fonts.css`도 import하지 않는다(Google Fonts를 부른다 — 오프라인 앱이다).

**범위 한정 리셋** (`src/ax/ax.css`, `@layer reset { … }` 안)

Astryx `reset.css`의 규칙 가운데 아래 것만, 선택자 앞에 `[data-astryx-theme]` 범위를 붙여 옮긴다. 명시도는 원본처럼 `:where()`로 0을 지킨다. 파일 머리에 "`@astryxdesign/core@0.7.13` `src/reset.css`에서 옮김. 버전을 올리면 다시 대조한다"를 적는다.

| 원본 규칙 | 옮기나 |
|---|---|
| `*`·`::before`·`::after`의 `box-sizing`, 테두리 폭 0·`solid`·`currentColor` | 옮긴다 |
| 제목 `font-size`·`font-weight: inherit`, 제목·`p`·`blockquote`·`figure`·`pre`·`dl`·`dd` 여백 0 | 옮긴다 |
| `a` 색 상속, `b`·`strong`, `code`류, `small`, `sub`·`sup` | 옮긴다 |
| `ol`·`ul`·`menu` 목록 모양·여백 0 | 옮긴다 |
| `img`·`svg`·… `display: block`, `img`·`video` 최대 폭 | 옮긴다 |
| `button`·`input`·… 글꼴·색 상속과 여백 0, 버튼 배경 투명, 커서, `:disabled` 커서, `textarea` 크기 조절, placeholder, `[list]`, `[type=search]`, `fieldset`·`legend` | 옮긴다 |
| `table`, `hr`, `summary`, `dialog` 여백·윤곽선, `[hidden]` | 옮긴다 |
| `html`의 `line-height`·`text-size-adjust`·`tab-size`·`color-scheme`·탭 하이라이트, `body` 여백·글자 다듬기, `html[data-theme=…]`의 `color-scheme` | **안 옮긴다** — 문서 단위는 `global.css:40-66`이 이미 맡고 있고, `color-scheme`은 아래 "문서 바탕"이 맡는다 |

맨 바깥 `<Theme>`가 떠 있는 동안에는 `<html>`에도 `data-astryx-theme`가 붙으므로 이 리셋이 문서 전체에 걸린다. 그때 떠 있는 것은 Astryx 화면뿐이다(`App.tsx:151-153`). 화면이 내려가면 속성이 떨어져 리셋도 걸리지 않는다.

**legacy 누수 막기** (`src/ax/ax.css`, `@layer legacy { … }` 안)

| 규칙 | 왜 |
|---|---|
| `[data-astryx-theme] button { min-height: 0; }` | `global.css:75`의 `button { min-height: 44px }`가 Astryx `Button`·`ToggleButton`·`SegmentedControlItem`에 걸려 보이는 높이가 44px가 된다(`min-height`가 `height`를 이긴다). 같은 `legacy` 레이어 안에서 명시도(0,1,1)로 (0,0,1)을 이긴다 |

- **`astryx-theme`·`astryx-base` 레이어에 두지 않는다.** 높은 레이어의 `min-height: 0`은 Astryx가 터치에서 스스로 건 `min-height: 44px`(목록 줄 등)까지 덮는다. `legacy` 안에 두면 `global.css` 규칙만 끄고 Astryx 규칙에는 진다.
- `global.css`에서 클래스 없이 요소에 거는 규칙은 `*`·`html, body`·`body`·`#root`·`button`·`input, textarea, select` 여섯뿐이다(`:40-84`). 구현자는 `button`·`input`의 나머지 속성(`font`·`color`·`border`·`background`·`cursor`·`font-size`)이 Astryx `Button`·`ToggleButton`·`SegmentedControlItem`·`Switch`·`TextInput`·`NumberInput`·`Item`의 계산된 스타일에 남는지 한 번 대조한다. 새는 것이 있으면 이 블록에 같은 방식으로 더하고 DEV-RECORD에 적는다(멈추지 않는다).
- 보이는 높이는 Astryx 기본(36px)으로 둔다. 44px 탭 영역은 Astryx가 맡는다("확인한 것").

**문서 바탕** (`src/ax/ax.css`, `@layer astryx-theme { … }` 안)

| 규칙 | 왜 |
|---|---|
| `html[data-astryx-theme], html[data-astryx-theme] body { color-scheme: light dark; background: var(--color-background-body); }` | `global.css:37`의 `color-scheme: dark`와 `:49`의 어두운 바탕을 Astryx 화면이 떠 있는 동안만 이긴다. 안 하면 라이트 모드에서 노치·홈 인디케이터 자리가 검게 남고, `<dialog>` 바깥 색이 어긋난다 |
| `.ax-screen`: `min-height: 100dvh`, `max-width: 640px`, 가운데 정렬, 안쪽 여백 `calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 24px)` | 지금 `.screen`(`global.css:94-100`)과 같은 틀. 탭바가 없는 화면이라 `--tabbar-h`는 뺀다 |
| `@media (prefers-color-scheme: light) { .ax-screen::before { … } }`: 화면 위에 고정, 높이 `env(safe-area-inset-top)`, 배경 `#0b0b0d`, `pointer-events: none` | 홈 화면 앱의 상태바는 `black-translucent`(`index.html:21`)라 시계·배터리 글자가 **항상 흰색**이다. 라이트 모드에서 밝은 바탕 위에 안 보이게 된다. 상태바 자리만 어둡게 받친다. **라이트에서만 둔다** — 다크에서는 흰 글자가 그대로 읽히고, 띠 색이 Astryx 바탕색과 달라 경계선만 생긴다. 상태바 스타일 자체는 ②에서 정한다 |

**`src/ax/` — 앱이 Astryx를 쓰는 한 곳** (`index.tsx`, 화면은 여기서만 가져다 쓴다)

| 내보내는 것 | 무엇 | 왜 한 곳에 두나 |
|---|---|---|
| `AxRoot` | `<Theme theme={neutralTheme} mode="system"><SizeProvider size="lg"><div className="ax-screen">{children}</div></SizeProvider></Theme>`. `neutralTheme`은 `@astryxdesign/theme-neutral/built`에서 | 테마·모드·기본 크기·화면 틀을 정하는 자리가 하나다. ②에서 화면을 넓힐 때 이 부품만 쓰면 된다 |
| `TextField` | Astryx `TextInput` + `{...AX_NO_AUTOFILL}` + `controlStyle={{ fontSize: 'max(16px, 1em)' }}` | 자동완성 억제(G5)와 16px 하한을 빠뜨릴 수 없게 |
| `Stepper` | `HStack`(간격 8px 이상): `Button variant="secondary" isIconOnly`(`icon`은 `−`, ``label={`${label} 감소`}``) · `NumberInput`(`label={label}` `isLabelHidden`, `isIntegerOnly`, `min`·`max`·`step`, `autoComplete="off"`, 같은 `controlStyle`) · `Button isIconOnly`(`icon`은 `+`, ``label={`${label} 증가`}``). 버튼은 `onClick`에서 `onChange(clampStep(value, ∓1, step, min, max))`. props: `value`·`step`·`min`·`max`·`label`·`onChange(v: number)` | `NumberInput`의 증감 버튼이 터치에서 숨기 때문("확인한 것"). 접근성 이름(`<이름> 감소`·`<이름>`·`<이름> 증가`)과 글자(`−`·`+`)는 지금 `NumberStepper.tsx:102-144`와 같다 |
| `clampStep(value, dir: -1 \| 1, step, min, max): number` — **새 파일 `src/ax/clampStep.ts`** (import는 `../lib/weightScale`뿐) | `Math.min(max, Math.max(min, dir === 1 ? stepUp(value, { step }) : stepDown(value, { step })))` | `Stepper`의 유일한 계산. 더하기·빼기는 `weightScale`의 `stepUp`·`stepDown`을 그대로 쓴다(지금 `NumberStepper.tsx:65-73`과 같은 계산 — 사본을 만들지 않는다). Astryx를 import하지 않는 파일이라 테스트가 Astryx 패키지를 읽지 않는다 |
| `Sheet` | Astryx `BottomSheet`. props: `label`·`purpose`(기본 `'info'`)·`height`(기본 `'hug'`)·`onClose`·`children`. 항상 `isOpen`으로 그리고 `onOpenChange(false)`에서 `onClose`를 부른다 | 지금 시트는 "있으면 그리고 없으면 안 그린다"(`RoutineEditorScreen.tsx:400-426`). 그 쓰임을 그대로 받는다 |
| Astryx 부품 다시 내보내기 | `Button`·`Card`·`Banner`·`Badge`·`Heading`·`Text`·`VStack`·`HStack`·`Item`·`SegmentedControl`·`SegmentedControlItem`·`Switch`·`ToggleButton` | 화면이 `@astryxdesign/…`를 직접 import하지 않게. 버전을 올릴 때 고칠 자리가 `src/ax/`뿐이다. **`TextInput`·`NumberInput`은 다시 내보내지 않는다** — 화면은 `TextField`·`Stepper`로만 입력칸을 쓴다(자동완성 억제와 16px 하한을 건너뛸 길을 없앤다) |

**아이콘만 있는 버튼:** 글자를 `icon`으로 넣는다 — `<Button isIconOnly icon={<span aria-hidden="true">▲</span>} label="Day 위로" />`. `label`은 `aria-label`로만 쓰인다("확인한 것"). `‹ 취소`·`＋ 종목 추가`·`＋ Day 추가`는 아이콘 버튼이 아니라 `label`이 그대로 보이는 글자 버튼이다.

`src/lib/inputProps.ts`에 `AX_NO_AUTOFILL`을 더한다. **값을 다시 적지 않고 `NO_AUTOFILL`에서 만든다**(한쪽만 고쳐서 갈라지지 않게 — 이 파일이 생긴 이유다, `inputProps.ts:7-9`):

```ts
export const AX_NO_AUTOFILL = {
  autoComplete: NO_AUTOFILL.autoComplete,
  autoCapitalize: NO_AUTOFILL.autoCapitalize,
  hasAutoCorrect: NO_AUTOFILL.autoCorrect !== 'off',
  hasSpellCheck: NO_AUTOFILL.spellCheck,
} as const
```

Astryx `TextInput`의 props 이름이 HTML 속성과 달라서 이름만 옮긴다(`dist/Field/textEntryTraits.d.ts`, `dist/TextInput/TextInput.d.ts:194-199`). `NO_AUTOFILL`은 그대로 둔다.

이 작업에서는 `src/ax/`를 쓰는 화면이 없다. 번들에 실리지 않고, 화면도 바뀌지 않는다.

**빌드 확인** (`vite.config.ts` `build.target: 'es2020'`)

빌드된 CSS에 `light-dark(`·`@starting-style`·`@scope`·`@layer`가 남아 있어야 한다(esbuild가 낮춰 쓰지 않아야 한다). OO3에서 지연 청크가 생긴 뒤 확인한다. 없어졌으면 `build.cssTarget: 'safari17.5'`를 더하고, 그래도 안 되면 멈추고 보고한다.

### 검증 (`src/lib/v117.test.ts`, describe `OO2`)

소스는 `import.meta.glob(…, { query: '?raw' })`로 읽는다(DEV-RECORD 제약 13). `.css`는 이렇게 읽으면 빈 문자열이므로(제약 3) CSS는 빌드 출력으로 확인한다.

- `package.json`의 `@astryxdesign/core`·`@astryxdesign/theme-neutral`이 `0.7.13`이고 `^`·`~`가 없다. 두 값이 같다. `@stylexjs/stylex`도 `^`·`~`가 없다.
- `clampStep`(`../ax/clampStep`에서 import): `(10, 1, 1, 1, 10)` = 10 · `(1, -1, 1, 1, 10)` = 1 · `(90, 1, 15, 0, 600)` = 105 · `(0, -1, 15, 0, 600)` = 0 · `(5, 1, 1, 1, 10)` = `stepUp(5, { step: 1 })`.
- 스캔: `src/ax/clampStep.ts`에 `@astryxdesign`도 `./index`도 없다. `src/lib/v117.test.ts`가 `'../ax'`·`'../ax/index'`를 import하지 않는다(테스트가 Astryx 패키지를 읽지 않는다).
- `AX_NO_AUTOFILL`이 `NO_AUTOFILL`을 따른다: `autoComplete`·`autoCapitalize`가 같고, `hasAutoCorrect` = (`NO_AUTOFILL.autoCorrect !== 'off'`), `hasSpellCheck` = `NO_AUTOFILL.spellCheck`. 스캔: `inputProps.ts`의 `AX_NO_AUTOFILL` 정의 안에 `NO_AUTOFILL.`이 네 번 나오고 `'off'`·`false` 리터럴을 직접 적은 값이 없다.
- 스캔: `src/ax/index.tsx`의 `export { … }`·`export … from` 구문에 `TextInput`·`NumberInput`이 없다.
- 스캔: `src/ax/index.tsx`에서 `isIconOnly`가 있는 `<Button` 태그마다 같은 태그 안에 `icon=`이 있다. `Stepper` 정의에 `` `${label} 감소` ``·`` `${label} 증가` ``가 있다.
- 스캔: `@astryxdesign/`을 import하는 파일이 `src/ax/` 밖에 없다(`src/**/*.{ts,tsx}`).
- 스캔: `src/main.tsx`·`src/App.tsx`에 `@astryxdesign`도, `'./ax'`·`'../ax'`의 정적 import도 없다. `main.tsx`가 `./styles/index.css`를 import하고 `global.css`를 직접 import하지 않는다.
- 스캔: `src/ax/index.tsx`에 `mode="system"`이 있고 `mode="dark"`·`mode="light"`가 없다. `reset.css`·`fonts.css` import가 없다.
- 스캔: `src/ax/index.tsx`의 `TextField`·`Stepper` 정의에 `AX_NO_AUTOFILL` 또는 `autoComplete="off"`가 있다.
- 빌드 출력(DEV-RECORD에 명령과 출력 복사): `dist/assets/index-*.css`에서 처음 나오는 `@layer`가 `@layer reset,legacy,astryx-base,astryx-theme`다. **`@layer legacy{` 블록이 있고 `.btn{`·`.screen{` 규칙이 그 블록 안에 있으며 블록 밖에는 없다**(`global.css`가 정말 레이어에 들어갔는지 — 안 들어가면 OO3에서 Astryx 버튼의 배경·테두리가 지워진다).
- dev 서버도 같다: `npm run dev`로 띄워 `document.styleSheets`에서 이름이 `legacy`인 `CSSLayerBlockRule`을 찾고 그 안에 `.btn` 규칙이 있는 것을 한 번 본다(출력 복사).
- `node scripts/screenshots.mjs after`의 `home`·`settings`·`editor-full`(다크)을 `before`와 `cmp`로 비교한다(OO1과 같은 방법. 커밋하지 않는다).
- "legacy 누수 막기"의 `min-height` 규칙은 쓰는 화면이 없는 이 단계에서는 재지 못한다. OO3의 `--check` `버튼 높이`가 잰다.

### 범위 제외

- 맞춤 테마(`defineTheme`): 바뀐 기준 2가 Astryx 테마를 그대로 따르라고 했다.
- 전역 `reset.css`로 바꾸기, `global.css` 줄이기: 모든 화면이 Astryx로 넘어간 뒤(②)에 한다. 지금 하면 안 바꾼 화면 137곳의 `<p>` 여백부터 흔들린다.
- `index.html`의 `color-scheme`·`theme-color`·상태바 스타일, `vite.config.ts` manifest의 `theme_color`: 안 바꾼 화면이 아직 다크 고정이다. ②에서 정한다.
- Astryx 아이콘(lucide): `▲` `▼` `−` `+` `‹`는 지금처럼 글자로 쓴다. 다만 `@astryxdesign/theme-neutral`이 `lucide-react ^1.66.0`에 의존해서 `package-lock.json`에는 들어온다. 번들에 실리는지는 OO3 청크 표로 확인한다.

### README 반영

"핵심 설계 결정" → "iOS · PWA"에 한 항목을 더한다:

```
- **Astryx는 화면 단위로 들이고, 안 바꾼 화면과 CSS 레이어로 나눈다**
  Astryx CSS는 캐스케이드 레이어 안에 있어서 레이어 밖 CSS에 항상 집니다. 기존 `global.css`를
  `legacy` 레이어에 넣어(`src/styles/index.css`) Astryx 부품이 이기게 하고, Astryx의 전역
  리셋은 쓰지 않고 `[data-astryx-theme]` 안에만 거는 사본을 둡니다(`src/ax/ax.css`).
  레이어는 같은 속성끼리만 승부가 나서, Astryx가 정하지 않는 속성(`button`의 `min-height`)은
  같은 파일이 `legacy` 레이어 안에서 따로 끕니다.
  화면은 `src/ax/`의 부품만 가져다 쓰고, Astryx 버전은 정확한 값으로 고정합니다(베타).
  Astryx 화면은 지연 로딩해서 헬스장 경로(홈 → 세션)가 Astryx 코드를 읽지 않습니다.
```

Tech Stack(`README.md:349-358`)에 한 줄: `- UI 부품: Astryx 0.7.13 (@astryxdesign/core, 베타 — 버전 고정. 지금은 루틴 편집 화면만)`

---

## OO3. 루틴 편집 화면을 Astryx로

### 진단

"공통 진단"의 첫 표. 대상은 세 파일이고 셋 다 루틴 편집에서만 쓴다: `src/screens/RoutineEditorScreen.tsx`(429줄), `src/components/RoutineLineSheet.tsx`(123줄), `src/components/ExercisePickerSheet.tsx`(185줄).
`NumberStepper.tsx`는 `ExerciseCard`·`DietDayEditor`도 쓰므로 건드리지 않는다.

### 설계

**원칙: 그리는 부품만 바꾼다.** 상태(`useState` 9개), 함수(`startDraft`·`move`·`addDay`·`save`…), props, 문구, `aria-label`(스테퍼의 `세트 감소`·`세트`·`세트 증가` 같은 이름 포함), 버튼 순서, 누르면 일어나는 일은 지금 코드 그대로다. `src/lib/`는 `inputProps.ts`(OO2) 말고는 바꾸지 않는다. 손에 닿는 방식이 달라지는 곳은 "과거 판정 불변"의 표가 전부다.

**`App.tsx`**: `RoutineEditorScreen`을 `lazy(() => import('./screens/RoutineEditorScreen'))`로 바꾸고 `:151-153`을 `<Suspense fallback={<div className="center-note">불러오는 중…</div>}>`로 감싼다(`AnalyzeScreen`과 같은 방식 — `App.tsx:166-168`). 화면 파일의 맨 바깥이 `<AxRoot>`다. fallback은 안 바꾼 화면의 부품이라 어둡다. 폰이 라이트 모드면 청크가 오기 전 한순간 어두웠다가 밝아진다(오프라인 캐시에서 읽으므로 짧다. 받아들인다).

**`RoutineEditorScreen.tsx`** — 맨 바깥 `<AxRoot>` 안에 `VStack`

| 자리 | 지금 | 바꾼 뒤 |
|---|---|---|
| 불러오는 중 | `div.center-note` | `AxRoot` 안 `Text` |
| 머리 | `.btn-row`: `.btn` · `h1` · `.btn-primary` | `HStack`(세로 가운데): `Button variant="ghost" label="‹ 취소"` · `Heading level={1}`(남는 폭, 가운데, 한 줄) · `Button variant="primary" label="저장" isDisabled={!dirty \|\| saving}`. 버튼은 글자 폭만 차지한다 |
| 나가기 확인 | `.btn-danger` · `.btn` | 같은 `HStack`에 `Button variant="destructive" label="저장하지 않고 나가기"` · `Button variant="secondary" label="계속 편집"` (반반 폭) |
| 복사 안내 | `p.row-sub` | `Text color="secondary"` (줄바꿈 허용) |
| 문제 목록 | `.banner-danger` | `Banner status="error"`, `title`은 `저장할 수 없습니다`, 본문에 문제 문구를 한 줄씩 |
| 이름 카드 | `.card` + `.card-label` + `input.field` | `Card` + `TextField label="루틴 이름"` (라벨이 보인다) |
| Day 카드 머리 | `.btn-row`: `input.field` · `▲` · `▼` | `HStack`: `TextField label="Day 이름" isLabelHidden`(남는 폭 전부, `min-width: 0`) · `Button variant="ghost" isIconOnly icon={▲} label="Day 위로"` · `… icon={▼} label="Day 아래로"`. 아이콘 버튼은 정사각이다 |
| Day 설명 | `input.field` | `TextField label="Day 설명" isLabelHidden placeholder="설명 (예: 상부가슴 / 측면어깨)"` |
| 종목 줄 | `.row`: `button.row-main` · `▲` · `▼` | `HStack`: `Item`(남는 폭 전부, `onClick`으로 시트) · 아이콘 `Button` 둘(`icon`은 ▲·▼, `label`은 `종목 위로`·`종목 아래로`). ▲▼는 `Item`의 형제다(`endContent`에 넣지 않는다 — 지금 마크업과 같은 구조). `Item`의 `label`은 `1. 인클라인 프레스` + `Badge`(`A`·`B`·`코어`), `description`은 `상부가슴 · 4×6~10 · 150초`. **이름은 자르지 않고 줄을 바꾼다**(`labelLines`를 걸지 않는다) |
| Day 카드 발 | `.btn-row`: `＋ 종목 추가` · `Day 삭제` → `정말 삭제` · `취소` | `HStack`: `Button variant="secondary" label="＋ 종목 추가"` · `Button variant="destructive" label="Day 삭제"` → 확인 때 `Button variant="destructive" label="정말 삭제"` · `Button variant="secondary" label="취소"` |
| Day 추가 | `.btn` | `Button variant="secondary" width="100%" label="＋ Day 추가"` |
| 하한 모드 카드 | `.card` + `.row` | `Card`: `Heading level={2}` `하한 모드` · 안내 `Text` · Day마다 `Item`(`label` 이름, `description` 종목 요약, `endContent`에 `Button variant="secondary" label="삭제"`) |
| 주간 목표 카드 | `.row` + `.segment` + `NumberStepper` | `Card`: `Heading level={2}` `주간 목표` · 부위마다 `Item`(`label` 부위, `description` `플랜 합계 n세트`, `endContent` `n세트`) · `SegmentedControl label="<부위> 목표 방식"`(`플랜 합계`·`직접`) · `직접`일 때 `Stepper label="<부위> 주간 목표" min={1} max={60} step={1}` |

**`RoutineLineSheet.tsx`** — `Sheet label="종목 줄 편집" purpose="info" height="hug"` (고친 값이 곧바로 초안에 들어가므로 바깥 탭으로 닫혀도 잃는 것이 없다 — 지금과 같다)

| 자리 | 바꾼 뒤 |
|---|---|
| 종목 이름 | `Heading level={2}` |
| 부위 칩 | 줄바꿈되는 `HStack` 안에 부위마다 `ToggleButton label={부위} isPressed={…}` + 끝에 `직접 입력`. 고르는 규칙은 지금과 같다(`:55-64`) |
| 부위 직접 입력 | `TextField label="부위 직접 입력" isLabelHidden` |
| 방식 | `SegmentedControl label="방식"`(`A`·`B`·`코어`) + 안내 `Text`(`GROUP_HINT` 그대로) |
| 세트·반복 최소·반복 최대·휴식(초) | 줄마다 `HStack`: `Text`(이름) · `Stepper`(지금의 `min`·`max`·`step` 그대로: 1~10/1, 1~50/1, 1~50/1, 0~600/15). `Stepper`의 `label`은 지금 `ariaLabel` 그대로 `세트`·`반복 최소`·`반복 최대`·`휴식`이다(보이는 이름은 `휴식(초)`, 접근성 이름은 `휴식` — `RoutineLineSheet.tsx:91-103`). 줄 사이 세로 간격 8px 이상 |
| 컨디션 좋을 때만 | `Switch label="컨디션 좋을 때만" value={line.optional}` |
| 메모 | `TextField label="메모"` |
| 아래 버튼 | `Button variant="destructive" width="100%" label="이 Day에서 빼기"` · `Button variant="secondary" width="100%" label="닫기"` |

**`ExercisePickerSheet.tsx`** — `Sheet label="종목 고르기" height="tall"`, `purpose`는 목록일 때 `'info'`, 폼일 때 `'form'`(적던 이름을 바깥 탭 한 번으로 잃지 않게. `닫기`·`뒤로` 버튼은 그대로 있다). 시트를 연 채 `purpose`만 바꾼다 — Astryx가 닫기 판단 때마다 지금 값을 읽는다("확인한 것"). OO0의 흐름 검사 `바깥 탭`이 이것을 잰다. **실패하면** 시트 전체를 `purpose="form"`으로 고정하고(목록도 `닫기` 버튼으로만 닫힌다) "과거 판정 불변" 표의 그 줄을 고쳐 적는다 — 멈추지 않는다

| 자리 | 바꾼 뒤 |
|---|---|
| 목록 머리 | `Heading level={2}` `종목 추가` · `TextField label="종목 검색" isLabelHidden` |
| 목록 줄 | `Item`: `label` 짧은 이름(+ 내 종목이면 `Badge label="내 종목"`), `description` 이름, `onClick`으로 고르기, 내 종목이면 `endContent`에 `Button variant="secondary" label="편집"` |
| 빈 결과 | `Text color="secondary"` `맞는 종목이 없습니다.` |
| 목록 발 | `Button variant="secondary" width="100%" label="＋ 새 종목 만들기"` · `… label="닫기"` |
| 폼 | `Heading level={2}`(`내 종목 편집`/`새 종목 만들기`) · `TextField label="이름"` · `TextField label="짧은 이름 (선택)"` · `TextField label="자극 팁 (선택)"` · `Switch label="맨몸 운동 (무게 0kg으로 기록)"` · 문제는 `Banner status="error"` · `Button variant="primary"`(`만들고 추가`/`저장`) · `Button variant="destructive" label="종목 삭제"` · 지울 수 없을 때 안내 `Text` · `Button variant="secondary" label="뒤로"` |

**시트 교체:** 종목을 고르면 고르기 시트가 내려가는 같은 렌더에서 줄 시트가 열린다(`addExercise` — `RoutineEditorScreen.tsx:118-125`가 `setPickDay(null)`과 `setLineAt(…)`을 함께 부른다. 지금과 같다). 열린 `<dialog>`가 언마운트되면서 다음 것이 뜨는 경로라, 바깥 스크롤 잠금·`inert`·포커스가 남지 않는지 OO0의 흐름 검사 `시트 교체`가 잰다. **남으면** 두 시트를 조건부로 그리지 않고 계속 마운트한 채 `isOpen`으로 여닫게 바꾼다(`Sheet`가 `isOpen`을 받고, 화면은 마지막 내용을 유지한다). 멈추지 않고 고친 뒤 DEV-RECORD에 적는다.

**세 파일 공통**
- 부품 import는 `../ax`에서만. `NO_AUTOFILL`·`NumberStepper` import를 지운다.
- **붙어 있는 컨트롤 사이는 8px 이상 띄운다:** ▲와 ▼ 사이, `Item`과 ▲ 사이, `Stepper`의 `−`·입력칸·`+` 사이, 나란한 버튼 사이(`＋ 종목 추가`·`Day 삭제`, `저장하지 않고 나가기`·`계속 편집`), 그리고 컨트롤이 든 줄들 사이의 세로 간격. Astryx의 탭 영역은 이웃과의 간격 절반까지만 넓어져서(36px 버튼은 한쪽에 4px이 필요하다) 이보다 좁으면 44px가 안 된다. `HStack`·`VStack`의 `gap`에 넣을 값 이름은 타입 선언에서 확인한다.
- 아이콘만 있는 버튼(`Day 위로`·`Day 아래로`·`종목 위로`·`종목 아래로`)은 `icon={<span aria-hidden="true">▲</span>}`로 글자를 넣는다(OO2 "아이콘만 있는 버튼").
- `Item`에 `onClick`과 `endContent` 버튼을 같이 쓰는 곳(하한 모드의 `삭제`, 고르기 목록의 `편집`)은 구현 전에 `Item.doc.mjs`로 쓰임을 확인한다. 안쪽 버튼을 눌렀을 때 줄의 동작이 같이 돌면 안 된다(지금도 따로 돈다).
- `<button`·`<input`·`<textarea`·`<h1`·`className=`을 쓰지 않는다. 배치는 `VStack`·`HStack`의 props로 한다. `style`은 폭 조정(`minWidth: 0`, `flex`)에만 쓰고, 색 값(`#…`)과 `var(--bg|--surface|--text|--accent|--line|--danger|--ok|--warn|--r-…)`를 쓰지 않는다.
- 파괴 동작(`Day 삭제`·`정말 삭제`·`이 Day에서 빼기`·`저장하지 않고 나가기`·`종목 삭제`)은 `variant="destructive"`이고, **`variant`를 `label`보다 앞에 적는다**(스캔이 문구 앞 260자를 본다).
- 옛 마크업은 지운다(조건으로 남기지 않는다).

**기존 테스트 가운데 고치는 것 — 이 둘뿐이다**

| 자리 | 지금 | 바꾼 뒤 | 왜 |
|---|---|---|---|
| `src/lib/v116.test.ts:1064` | `.toMatch(/btn-danger/)` | `.toMatch(/btn-danger\|variant="destructive"/)` | 규칙("파괴 동작의 시각 언어가 하나다")은 그대로고 그리는 부품이 바뀐다 |
| `src/lib/v116.test.ts:1169` | 위와 같다 | 위와 같다 | 위와 같다 |

`inputProps.test.ts`는 고치지 않는다 — 세 파일에서 `<input`과 `{...NO_AUTOFILL}`이 같이 0이 된다. 다른 테스트가 깨지면 고치지 말고 멈춰서 보고한다.

### 검증 (`src/lib/v117.test.ts`, describe `OO3`)

- 스캔: 세 파일에 `<button`·`<input`·`<textarea`·`<h1`·`className=`·`NumberStepper`·`NO_AUTOFILL}`이 없다. `from '../ax'`가 있다.
- 스캔: 세 파일에 `#[0-9a-fA-F]{3,8}\b` 색 값과 `var(--`가 없다.
- 스캔: `RoutineEditorScreen.tsx`에 `<AxRoot`가 있다. `App.tsx`에 `lazy(() => import('./screens/RoutineEditorScreen'))`가 있고 `RoutineEditorScreen`의 정적 import가 없다.
- 스캔: 문구가 그대로 있다 — `RoutineEditorScreen.tsx`: `‹ 취소`·`루틴 편집`·`저장하지 않고 나가기`·`계속 편집`·`기본 루틴은 그대로 두고 복사본을 만들어 고칩니다. 지금까지의 기록은 이어집니다.`·`루틴 이름`·`Day 이름`·`Day 설명`·`Day 위로`·`Day 아래로`·`종목 위로`·`종목 아래로`·`＋ 종목 추가`·`Day 삭제`·`정말 삭제`·`＋ Day 추가`·`하한 모드`·`주간 목표`·`플랜 합계`·`직접`. `RoutineLineSheet.tsx`: `종목 줄 편집`·`부위`·`직접 입력`·`방식`·`세트`·`반복 최소`·`반복 최대`·`휴식(초)`·`컨디션 좋을 때만`·`메모`·`이 Day에서 빼기`·`닫기`. `ExercisePickerSheet.tsx`: `종목 고르기`·`종목 검색`·`내 종목`·`＋ 새 종목 만들기`·`맨몸 운동 (무게 0kg으로 기록)`·`종목 삭제`·`루틴이나 기록에서 쓰는 종목은 지울 수 없습니다`·`뒤로`.
- 스캔: 다섯 파괴 문구 앞 260자 안에 `variant="destructive"`가 있다.
- 스캔: `ExercisePickerSheet.tsx`에 `'form'`과 `'info'`가 모두 있다(폼일 때만 바깥 탭을 막는다. 위 "실패하면" 경로로 갔으면 `'form'`만 있다로 고친다).
- 스캔: 세 파일에서 `isIconOnly`가 있는 `<Button` 태그마다 같은 태그 안에 `icon=`이 있다(없으면 빈 정사각형이 그려지고 스크린샷에서만 보인다).
- 스캔: `RoutineLineSheet.tsx`의 `<Stepper` 넷에 `label="세트"`·`label="반복 최소"`·`label="반복 최대"`·`label="휴식"`이 있다. `RoutineEditorScreen.tsx`의 `<Stepper`에 `` `${muscle} 주간 목표` ``가 있다(접근성 이름이 지금과 같다).
- 기존 `v116.test.ts`의 NN2·NN3 스캔(`toDraft(`·`uniqueId(`·`db.` 없음·`muscleSets`/`plannedOrder` 대입 없음)이 위 두 줄 말고는 수정 없이 통과한다.
- `node scripts/screenshots.mjs after --check`가 종료 코드 0이다(OO0의 모양 검사 여덟 + 흐름 검사 넷). 출력 표를 DEV-RECORD에 복사한다.
- 스크린샷 `after-*`를 다크·라이트로 커밋하고, 구현자가 장면마다 `before`와 나란히 보고 DEV-RECORD에 적는다: 세로로 쌓인 제목 없음 · 머리 줄의 `‹ 취소`·제목·`저장`이 겹치지 않음(375 포함) · Day 이름 칸에 `Day 1 — Push`가 다 보임 · 종목 이름이 다 보임(`editor-long`의 긴 이름은 두 줄 이상이고 ▲▼가 화면 안에 있다) · ▲▼·`−`·`+`가 빈 네모가 아니라 글자로 보임 · 시트 마지막 버튼이 가려지지 않음 · 라이트 모드에서 글자가 다 읽힘.
- 빌드 출력(DEV-RECORD에 복사): `npm run build`의 청크 표에서 Astryx가 든 CSS·JS가 `index-*`가 아닌 지연 청크에 있다. 그 CSS에 `light-dark(`·`@starting-style`·`@scope`가 남아 있다(`grep -c`). 메인 `index-*.js`·`index-*.css`의 gzip 크기를 OO1 때와 나란히 적는다. `lucide`가 든 청크가 있는지도 적는다(있으면 크기와 함께. 없애려고 손대지는 않는다).
- 경계: 종목이 0개인 새 Day · 종목 7개인 Day · 내 종목이 0개일 때의 고르기 시트 · `fallbackDays`가 없는 루틴(하한 모드 카드 없음 — 새 루틴 `＋ 새 루틴 만들기`로 확인) · 진행 중 세션이 있을 때 `편집` 버튼이 여전히 막혀 있다(`SettingsScreen` 무변경).

### 범위 제외

- 끌어서 순서 바꾸기(Astryx `List`에 있다), 머리 줄 고정, 나가기 확인을 `AlertDialog`로: 동작을 바꾸는 일이다. 이번에는 그리는 부품만 바꾼다.
- 설정의 "활성 루틴" 카드와 `RoutineListPanel`: 설정 화면의 일부다. ②.
- 세션 화면의 세트 입력 숫자 크기: 세션 화면을 안 바꾼다. ②에서 기준 2의 "크게"를 그 화면에 건다.
- 먹은 것 추가 시트: 이슈 "이번 범위" 밖.
- `global.css`에서 이 세 파일만 쓰던 규칙 지우기: 다른 화면과 같이 쓰는 클래스다. ②.

### README 반영

- Limitations 절 끝에 한 줄: `- 루틴 편집 화면은 Astryx 부품으로 그리며 폰의 라이트/다크 설정을 따릅니다. 나머지 화면은 아직 다크 고정입니다. Astryx 화면은 iOS 17.5 이상이 필요합니다.`

---

## 데이터 이전

| 대상 | 어떻게 되나 |
|---|---|
| 기존 IndexedDB | 그대로. Dexie 버전 3, `upgrade()` 없음. 테이블·행을 읽고 쓰는 코드를 바꾸지 않는다 |
| 기존 Gist·JSON 백업 | 그대로 복원된다. `SCHEMA_VERSION` 3 유지 |
| 설정(`settings`)·localStorage | 새 키 없음. 라이트/다크는 저장하지 않고 폰 설정에서 매번 읽는다(파생) |
| 서비스워커 캐시 | 새 청크(Astryx CSS·JS)가 precache 목록에 더해진다(`vite.config.ts:61`의 glob이 이미 `js`·`css`를 싣는다). 업데이트는 지금처럼 배너를 눌러야 적용된다 |
| 시드 | `routine-v2.4.json`·`exercises.json`·`seedRevision` 무변경 |

## 되돌리기

작업마다 커밋이 하나고, 뒤에서부터 하나씩 되돌릴 수 있다. 어느 지점에서 멈춰도 배포할 수 있는 상태다.

| 되돌리는 것 | 방법 | 되돌린 뒤 |
|---|---|---|
| OO3만 (Astryx 화면이 폰에서 안 좋다) | OO3 커밋 `git revert` | 루틴 편집 화면이 v1.16 모양으로 돌아간다(깨진 채로). 이어서 "방향 비교" B(CSS 10줄)를 적용하면 된다. 바탕(OO2)은 남아도 번들에 실리지 않는다 |
| OO2까지 | OO3·OO2 커밋 revert | Astryx 의존성이 빠진다. React 19는 남는다 |
| 전부 | v1.16.0 코드로 다시 배포 | 데이터는 건드린 적이 없어 그대로다 |

- 폰이 iOS 17.5 미만이면 Astryx 화면의 색이 깨진다(`light-dark()` 미지원). 그때는 OO3을 되돌린다. 앱이 버전을 보고 옛 화면으로 돌아가는 장치는 만들지 않는다(옛 화면을 남겨 두면 같은 화면이 둘이 된다).
- Astryx 버전을 올리는 것은 별도 작업이다: `package.json` 두 줄 + `src/ax/ax.css`의 리셋 사본 대조 + 스크린샷 다시 찍기.

---

## 과거 판정 불변

바뀌지 않는 것: 전부. `src/lib/`의 판정·집계·내보내기·저장 코드와 `src/db/`를 바꾸지 않는다(`inputProps.ts`에 상수 하나를 더하는 것이 `src/lib/`의 유일한 변경이다. `weightScale.ts`는 `src/ax/clampStep.ts`가 불러 쓰기만 한다).

- 골든(`v116.test.ts`의 `NN_WEEK_BEFORE`·`NN_SUGGEST_BEFORE`·`NN_BARS_BEFORE`·`NN_EXPORT_BEFORE`·`NN_KEYS_BEFORE`, `v113.test.ts`~`v115.test.ts`)이 수정 없이 통과한다.
- 루틴 편집 화면이 저장하는 값도 같다: `validateDraft` → `saveRoutineDraft(draft, savedId)` 경로를 그대로 탄다.

달라지는 것(판정이 아니라 화면):

| 무엇 | 전 | 후 |
|---|---|---|
| 루틴 편집 화면·두 시트의 색 | 다크 고정, 주황 | Astryx neutral 테마, 폰의 라이트/다크 |
| 버튼의 보이는 높이 | 44px 이상 | 36px (탭 영역은 44px) |
| 세트·반복·휴식·주간 목표의 `−` `+` | 앱의 `NumberStepper`: 손을 뗄 때 1스텝. 누른 자리에서 12px 넘게 밀렸거나 버튼 밖에서 떼면 안 바뀐다(`isTap`, CC12의 오터치 방지). 길게 눌러도 반복하지 않는다 | Astryx `Button`의 `onClick`: 탭하면 1스텝. **탭인지의 판정을 앱의 `isTap`(12px) 대신 브라우저의 클릭 판정에 맡긴다.** 버튼 밖에서 떼면 지금처럼 안 바뀐다. 달라지는 것은 버튼 안에서 손가락이 밀렸을 때 어디까지 탭으로 보느냐다(앱이 정한 12px → 브라우저 기준). 길게 눌러도 반복하지 않는 것은 같다 |
| 같은 칸에 숫자 직접 입력 | 칸을 벗어나거나 Enter를 누를 때 확정 | 같다(Astryx `NumberInput`) |
| 긴 종목 이름 | `…`으로 잘림 | 줄바꿈 |
| 종목 만들기 폼이 열린 시트 | 바깥을 누르면 닫힘 | 바깥을 눌러도 안 닫힘(`닫기`·`뒤로`로 닫는다) |
| 시트를 여닫는 움직임 | 0.2초 올라오기 | Astryx 기본(쓸어내려 닫기 포함. 폰의 "동작 줄이기"를 따른다) |
| 폰의 "글자 크기" 설정 | 따르지 않는다 | 루틴 편집 화면과 두 시트만 따른다(Astryx가 읽는다). 나머지 화면은 그대로다 |
| 폰이 라이트 모드일 때 편집 화면에 들어가는 순간 | — | 불러오는 동안 한순간 어둡다가 밝아진다 |

`isTap`을 `Stepper`에 다시 붙이지 않는다. CC12의 이유는 운동 중(땀·장갑·기구 사이 이동)의 오터치였고, 루틴 편집은 운동 중에 쓰는 화면이 아니다. 운동 중 화면(`ExerciseCard`)과 식단(`DietDayEditor`)의 `NumberStepper`는 건드리지 않는다.

---

## 구현 순서와 검증

**OO0 → OO1 → OO2 → OO3.** OO0의 "바꾸기 전" 스크린샷은 코드를 바꾸면 못 찍는다. OO2는 OO1의 React 19가, OO3은 OO2의 `src/ax/`가 있어야 한다. 단계마다 배포할 수 있다: OO0~OO2는 화면이 안 바뀐다.
커밋은 **스크린샷 도구 1 + 구현 3 + 기록·버전 1 = 5.** 작업끼리 한 커밋에 섞지 않는다.

**구현 전 확인 (사람):** "사람이 정할 것"에 남은 한 건(아이폰 iOS 버전). 17.5 미만이면 시작하지 않는다.

관례:
- `npm run build`(`tsc` 직접 호출 금지) · 작업 중에는 `npx vitest run src/lib/v117.test.ts src/lib/v116.test.ts src/lib/inputProps.test.ts src/lib/uiConsistency.test.ts src/lib/polish.test.ts`만 · 마지막에 `npm test` 한 번 · `node scripts/quality-scan.mjs --ci`
- 커밋 개수는 실행 출력을 복사한다(`git log --oneline main..HEAD`) · 커밋 메시지는 `git commit -F - <<'MSG'`
- **기존 테스트는 OO3 표의 두 줄 말고는 수정하지 않는다.** 깨지면 멈추고 보고한다.
- Astryx 부품의 props는 추측하지 않는다. `node_modules/@astryxdesign/core/dist/<부품>/*.d.ts`와 `src/<부품>/*.doc.mjs`를 읽는다. 이 PLAN의 props 이름과 다르면 타입 선언이 맞다(DEV-RECORD에 차이를 적는다).
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `package.json`의 `@astryxdesign/core`를 `^0.7.13`으로 → OO2 버전 스캔 실패
  ② `src/main.tsx`에 `import '@astryxdesign/core/astryx.css'` 추가 → OO2 스캔 실패
  ③ `src/screens/SettingsScreen.tsx`에 `import { Button } from '@astryxdesign/core/Button'` 추가 → OO2 스캔 실패
  ④ `src/ax/index.tsx`의 `mode="system"`을 `mode="dark"`로 → OO2 스캔 실패
  ⑤ `src/ax/clampStep.ts`에서 `Math.min(max, …)` 삭제 → OO2 단언 실패
  ⑥ `RoutineEditorScreen.tsx`에 `<button className="btn">` 한 줄 추가 → OO3 스캔 실패
  ⑦ `Day 삭제` 버튼의 `variant`를 `secondary`로 → OO3 스캔과 `v116` 스캔 실패
  ⑧ `App.tsx`의 `lazy`를 정적 import로 → OO3 스캔 실패
  ⑨ `RoutineLineSheet.tsx`에서 `이 Day에서 빼기`를 `빼기`로 → OO3 문구 스캔 실패
  ⑩ `src/styles/index.css`의 `@layer` 줄에서 `legacy`를 맨 뒤로 → OO2의 "처음 나오는 `@layer`" 빌드 확인이 실패하고, **스크린샷에서 Astryx 버튼의 배경·테두리가 사라진다**(`legacy`의 `background: none`·`border: none`이 이긴다). `--check`의 모양 검사가 이것을 잡는지도 적는다(못 잡으면 "스크린샷으로만 보인다"고 적는다)
  ⑪ `src/ax/ax.css`에서 `[data-astryx-theme] button { min-height: 0; }` 삭제 → `--check`의 `버튼 높이` 실패(44px, 아이콘 버튼 36×44)
  ⑫ `Day 위로` 버튼의 `icon=` 삭제 → OO3 `isIconOnly` 스캔 실패
  ⑬ `AX_NO_AUTOFILL`의 `hasSpellCheck`를 `false` 리터럴로 → OO2 스캔 실패
  ⑭ ▲▼ 사이 간격을 0으로 → `--check`의 `탭 영역` 실패
- **과거 판정 불변 확인 절**(DEV-RECORD): ① `git diff --stat main..HEAD -- src/lib src/db`가 `inputProps.ts`·`v116.test.ts`·`v117.test.ts`만 보인다(출력 복사) ② 골든 테스트 수정 없이 통과 ③ 바뀌는 것: "과거 판정 불변" 표.
- 완료 후 `docs/DEV-RECORD-v1.17.md`(맨 위 "이 환경에서 확인된 제약"은 v1.16 목록을 이어받고, Playwright·Astryx에서 새로 확인한 것을 더한다. 최소 둘: "스크린샷은 Playwright의 Chromium으로 찍는다. iOS Safari가 아니라서 `light-dark()`·`@scope`·`@starting-style`·safe-area·`<dialog>`·`dvh`·화면 키보드는 실기기 확인으로만 본다" · "`package-lock.json`에 `lucide-react`가 들어온다(theme-neutral의 의존성)"). "배포 영향" 절에 네 줄을 남기고 PR 본문 맨 위에도 넣는다:
  - 루틴 편집 화면과 그 시트 둘이 Astryx 부품으로 바뀐다. 이 화면만 폰의 라이트/다크 설정을 따른다. 나머지 화면은 그대로다.
  - React가 19로 올라간다. 기록·판정·내보내기·백업 형식은 그대로다.
  - 아이폰 iOS 17.5 이상이 필요하다(루틴 편집 화면).
  - 폰에서 볼 것: 설정 → 활성 루틴 `편집`. 제목·Day 이름·종목 이름이 잘리지 않는지, 한글 입력이 되는지, 키보드가 올라와도 시트 아래 버튼에 닿는지.
- README: 각 작업의 "README 반영"을 그 작업 커밋에서 고친다.
- `package.json` **1.17.0**은 기록 커밋에서 올린다.
- PR 본문에 `Closes #37`.
- 실기기 확인(구현자가 못 하면 DEV-RECORD에 "사람 확인 필요"로 남긴다): 홈 화면 앱에서 ① safe-area(노치·홈 인디케이터)와 상태바 글자 ② 루틴 이름·Day 이름·종목 검색에 **한글 조합 입력**(받침이 붙고 글자가 두 번 찍히지 않는다) ③ 입력칸을 눌렀을 때 화면이 확대되지 않는다 ④ 시트에서 키보드가 올라와도 `닫기`에 닿는다 ⑤ 폰을 라이트 ↔ 다크로 바꾸면 화면이 따라온다 ⑥ 오프라인(비행기 모드)에서 루틴 편집이 열린다 ⑦ **키보드가 올라온 채로:** 종목 검색에 글자를 넣고 결과를 눌러 고른다 · 내 종목 `편집` → 이름을 고치다가 `뒤로` · 새 종목 폼에 이름을 적다가 시트 바깥을 눌러도 안 닫히고 `뒤로`·`닫기`에 닿는다 ⑧ 폰의 글자 크기를 가장 크게 했을 때 머리 줄(`‹ 취소`·`루틴 편집`·`저장`)이 겹치거나 잘리지 않는다(넘치면 "사람 확인 필요"에 사진과 함께 적는다. 이번에 고치지는 않는다) ⑨ `−`·`+`·▲▼가 엄지로 잘 눌리고 옆 버튼이 대신 눌리지 않는다.

리뷰 단위: 작업별 — OO1은 런타임 전체, OO2는 CSS를 싣는 방법, OO3은 화면이라 보는 것이 서로 다르다. OO3 리뷰는 `docs/screenshots/v1.17/`의 전·후를 보고 판정한다.

---

## 사람이 정할 것

| # | 정할 것 | 선택지 | 설계자 추천 |
|---|---|---|---|
| 1 | **(구현 전 확인)** 쓰는 아이폰의 iOS 버전. 폰에서 `설정 → 일반 → 정보 → iOS 버전`에 나온다 | 17.5 이상이다 / 아니다 | 17.5 이상이어야 진행한다. Astryx의 색이 `light-dark()`에 기대고 있어, 그 아래 버전에서는 루틴 편집 화면의 색이 깨진다. 아니면 이 방향(A) 자체를 다시 정해야 한다 |

이것은 고를 것이 아니라 사람만 아는 사실이라 검토로 확정할 수 없다. 나머지 여섯 건은 검토에서 확정해 본문에 넣었다("검토 반영 기록").

화면 문구는 하나만 새로 생긴다: 문제 목록 배너의 제목 `저장할 수 없습니다`(Astryx `Banner`가 제목을 요구한다). 나머지 문구는 지금 코드 그대로다.

---

## 검토 반영 기록

2026-11-11. 검토 대상 커밋 `4ac1641`. 검토자: codex(`.reports/v1.17-codex.md`) · claude(`.reports/v1.17-claude.md`). 둘 다 "수정 필요".
지적마다 코드(`src/`)와 `@astryxdesign/core@0.7.13` 패키지를 다시 열어 확인했다.

### 반영한 지적

| 지적 | 검토자 | 확인한 근거 | 고친 곳 |
|---|---|---|---|
| `legacy`의 `button { min-height: 44px }`가 Astryx 버튼에 샌다 | claude | `global.css:75`. Astryx `Button.tsx:277-287`은 `height`만 정한다 | "공통 진단" 표, OO2 "legacy 누수 막기", `--check` `버튼 높이`, 결함 복원 ⑪, README 문단 |
| "길게 누르면 반복"은 사실이 아니다. 사라지는 것은 `isTap` 판정이다 | claude | `NumberStepper.tsx:27-31`·`:75-81`, `v18.test.ts:719-734` | "과거 판정 불변" 표, 머리말, "유일한 동작 변화" 문구 삭제 |
| `Stepper`의 접근성 이름이 `줄이기`·`늘리기`로 바뀐다 | claude | `NumberStepper.tsx:102`·`:119`·`:134`, `RoutineLineSheet.tsx:91-103` | OO2 `Stepper`, OO3 표·스캔 (`감소`·`증가`, `휴식`) |
| `clampStep`을 Astryx를 import하지 않는 파일에. 계산은 사본을 만들지 않게 | claude | `weightScale.ts:104-117`, `NumberStepper.tsx:65-73` | `src/ax/clampStep.ts` + `stepUp`·`stepDown` 재사용(검토자의 두 안을 합쳤다) |
| 탭 영역 검사가 예외를 표에 적으면 통과한다. 붙은 버튼의 간격이 안 정해져 있다 | claude | `hitArea.ts:144-203`(이웃과의 간격 절반까지만 넓힌다) | `--check` `탭 영역`(예외 없음), OO3 "8px 이상", 결함 복원 ⑭. "Astryx가 깐 탭 영역 층" 표현 삭제 |
| 아이콘만 있는 버튼의 보이는 글자를 넣는 방법이 없다 | claude | `Button.d.ts:53-58`·`:108-114` | OO2 "아이콘만 있는 버튼", OO3 표·스캔, 결함 복원 ⑫ |
| `global.css`가 정말 `legacy` 레이어에 들어갔는지 확인이 없다 | claude | Vite 5.4.21 설치 확인. `layer()` 처리는 빌드 출력으로 보는 것이 맞다 | OO2 검증(빌드 출력 + dev 서버), 결함 복원 ⑩ 기대값 |
| `--check`가 깨짐을 잡는다는 증거가 없다 | claude | — | OO0 검증(`before --check`가 실패해야 한다) |
| 안 바꾼 화면 비교가 "눈으로"다 | claude | — | OO1·OO2 검증(`cmp` 먼저) |
| 긴 종목 이름 장면이 실제로 두 줄이 되는지 모른다 | claude | — | 장면 `editor-long` |
| 시트 교체(고르기 → 줄 편집) 검증이 없다 | claude | `RoutineEditorScreen.tsx:118-125` | 흐름 검사 `시트 교체`, OO3 "시트 교체"(남으면 고치는 방법까지) |
| `purpose`를 연 채 바꾸는 것의 검증이 없다 | claude | `BottomSheet.tsx:549-558`·`:996` — 코드로는 따라온다 | 흐름 검사 `바깥 탭`, 실패할 때의 대안 |
| `AX_NO_AUTOFILL`이 `NO_AUTOFILL`의 손 사본이다 | claude | `inputProps.ts:7-9`·`:27-32` | OO2 정의(파생)·테스트·스캔, 결함 복원 ⑬ |
| `TextInput`·`NumberInput`을 직접 다시 내보내지 않는다는 스캔이 없다 | claude | — | OO2 표·스캔 |
| 폼 진입·복귀, 선택 → 편집 → 뒤로 → 선택, 폼 입력 중 바깥 탭 흐름이 검증에 없다 | codex | `ExercisePickerSheet.tsx`의 목록 ↔ 폼 전환 | 흐름 검사 `바깥 탭`·`편집 → 뒤로 → 고르기`·`긴 검색어`, 실기기 확인 ⑦ |
| 좁은 화면에서 머리 줄의 제목·취소·저장이 겹치거나 잘리지 않는지 판정 기준에 없다 | codex | `RoutineEditorScreen.tsx:207-215` | `--check` `머리 줄`(390·375), OO3 스크린샷 확인 문장 |
| 스크린샷 용량(`before`를 다크·라이트 둘 다 커밋) | claude | — | `before`는 다크만 커밋 |
| Playwright Chromium은 iOS Safari가 아니다 · `lucide-react`가 잠금 파일에 들어온다 | claude | `theme-neutral@0.7.13`의 `dependencies` | DEV-RECORD 제약 두 줄, OO3 청크 표 확인 |
| iOS 큰 글자 설정을 Astryx 글자만 따른다 | claude | `theme/dynamicType.ts` | "확인한 것", "과거 판정 불변" 표, 실기기 확인 ⑧ |
| `Item`의 `onClick`과 안쪽 버튼 | claude | `Item.tsx:697-720`(안쪽 컨트롤을 누르면 줄의 동작은 안 돈다) | "확인한 것", OO3 "세 파일 공통" |

### 기각했거나 방향을 바꾼 지적

| 지적 | 검토자 | 판단 | 이유 |
|---|---|---|---|
| `min-height: 0`을 `@layer astryx-theme`에 넣는다 | claude | 지적은 받고 자리를 바꿨다 → `@layer legacy` | `astryx-theme`는 `astryx-base`보다 높아서 Astryx가 터치에서 스스로 건 `min-height: 44px`(`astryx.css`에 4곳)까지 0으로 덮는다. `legacy` 안에서 명시도로 이기면 `global.css` 규칙만 꺼진다 |
| 탭 영역을 못 넓히는 자리는 "사람이 정할 것"에 올려 허용 목록을 둔다 | claude | 기각 | 간격 8px을 설계로 못 박았으므로 못 넓힐 자리가 없어야 한다. 그래도 나오면 구현자가 멈추고 보고한다. 미리 허용 목록을 두면 검사가 다시 예외를 갖는다 |
| "Day 이름이 긴 경우" 장면 | claude | 기각 | Day 이름은 입력칸이다. 입력칸은 줄을 바꾸지 못하고 값이 길면 칸 안에서 스크롤되는 것이 정상이라, 넣으면 `글자 잘림`이 맞는 화면에서 실패한다. 이슈의 깨짐(`Day 1 — F`)은 번들 Day 이름으로 `editor-full`의 `글자 잘림`이 잰다 |
| Playwright WebKit으로 한 장 더 | claude | 기각 | Windows의 Playwright WebKit은 최신 WebKit이지 iOS Safari 17.5가 아니다. `light-dark()` 같은 최저 버전 문제를 판정하지 못하고, 브라우저 내려받기가 하나 더 든다. 끝 기준은 실기기 확인이다 |
| `lazy` fallback이 라이트 모드에서 한순간 어둡다 | claude | 안 고친다(기록만) | fallback을 Astryx로 그리면 메인 번들이 Astryx를 읽는다(헬스장 경로 보호가 깨진다). "과거 판정 불변" 표에 적었다 |
| 큰 글자에서 머리 줄이 넘칠 수 있다 | claude | 확인만 더하고 이번에 고치지 않는다 | Playwright로 찍을 수 없고, 넘치는지는 폰에서 봐야 안다. 실기기 확인 ⑧로 넘겼다 |
| "긴 루틴 제목"에서 제목 한 줄이 안 지켜질 수 있다 | codex | 일부 기각 | 제목은 루틴 이름이 아니라 고정 문구 `루틴 편집`이다(`RoutineEditorScreen.tsx:210-212`). 좁은 화면·버튼 폭 쪽은 받아 `머리 줄` 검사로 넣었다 |
| 키보드가 열린 상태의 선택·편집 흐름을 구현 검증에 넣는다 | codex | 나눠서 반영 | Playwright의 Chromium은 화면 키보드를 띄우지 않는다. 키보드 없는 흐름은 흐름 검사로 자동화하고, 키보드가 올라온 상태는 실기기 확인 ⑦로 넣었다 |
| 사람이 정할 것 5를 바꾼 설명으로 사람에게 다시 묻는다 | claude | 확정하고 설명을 고쳤다 | 추천안(A)에는 두 검토자 모두 반대가 없다. 틀린 것은 선택지가 아니라 설명이었다. 고친 설명은 "과거 판정 불변" 표에 있고 최종 보고에 그대로 적는다 |

### 두 검토자가 다르게 본 곳

| 지점 | codex | claude | 코드로 본 결론 |
|---|---|---|---|
| 진단의 정확성 | 대체로 맞음(틀린 곳 지적 없음) | 틀린 곳 둘 | claude가 맞다. `NumberStepper.tsx:27-31`은 반복을 없앴다고 적고 있고, Astryx `Button`에는 `min-height`가 없다 |
| `clampStep` | "값 제한을 한 곳에 모았다"(원칙 지킴) | 같은 계산의 세 번째 사본 | claude가 맞다. `NumberStepper.tsx:65-73`이 이미 `stepUp`·`stepDown` + `clamp`로 같은 일을 한다. `stepUp`·`stepDown`을 불러 쓰게 고쳤다 |
| OO3 검증의 빈 곳 | 폼 진입·복귀와 키보드 흐름 | 시트 교체·`purpose` 전환·버튼 높이·탭 영역 예외 | 서로 겹치지 않는다. 둘 다 받았다 |

### 확정한 "사람이 정할 것"

| # | 정한 것 | 검토 의견 | 본문 위치 |
|---|---|---|---|
| 2 | 루틴 편집 화면은 폰의 라이트/다크 설정을 따른다(`mode="system"`). 다크로 고정하지 않는다 | codex 반대 없음, claude 동의 | OO2 `AxRoot`. 불러오는 순간의 깜빡임은 "과거 판정 불변" 표 |
| 3 | 상태바 자리를 어두운 띠(`#0b0b0d`)로 받친다 | claude 동의 + 조건(라이트에서만, `pointer-events: none`) → 조건을 넣어 확정 | OO2 "문서 바탕" |
| 4 | 버튼의 보이는 높이는 Astryx 기본 36px(탭 영역 44px) | claude 동의 + 조건(`min-height` 누수를 고쳐야 36px이 나온다) → 고쳐서 확정 | OO2 "legacy 누수 막기" |
| 5 | 숫자 입력은 `−` · 입력칸 · `+` 조합(`Stepper`) | 둘 다 반대 없음. 설명만 고쳤다 | OO2 `Stepper`, "과거 판정 불변" 표 |
| 6 | `playwright`를 `devDependencies`에 정확한 버전으로 넣는다 | claude 동의 | OO0 설계 |
| 7 | 종목 만들기 폼이 열려 있을 때는 시트 바깥을 눌러도 안 닫힌다 | claude 동의 + 조건(`purpose` 전환 확인이 먼저) → 흐름 검사와 대안을 넣어 확정 | OO3 `ExercisePickerSheet` |

1번(iOS 버전)은 사람만 아는 사실이라 남겼다.
