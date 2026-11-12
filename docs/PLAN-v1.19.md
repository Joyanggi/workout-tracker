# PLAN v1.19 — 비치는 유리·눌림 반응·여백 한 벌·Astryx 현황 (QQ)

> 작성: Claude Opus 5.5 (설계자), 2026-11-12. 대상 코드: v1.18.0 (`main` `ee7fdfe`).
> 근거: 이슈 #44 (개선). v1.18(PR #43)을 폰에 올려 본 결과의 후속이다.
>
> **성격:** 화면만 바꾼다. 저장 구조(Dexie 3, 백업 `SCHEMA_VERSION` 3)·판정·내보내기는 바꾸지 않는다.
> v1.18과 달리 `.tsx`도 고친다: 시트 틀 하나로 모으기(QQ3), 인라인 여백을 클래스로 옮기기(QQ4), 진단 줄 하나(QQ1), `main.tsx` 한 줄(QQ2).
> 화면 문구·버튼 순서·누르면 일어나는 일은 그대로다. 새 문구는 설정 → 진단의 한 줄(QQ1)뿐이다.
>
> **이 PLAN이 정한 Astryx 범위:** 이번에는 화면을 Astryx로 더 옮기지 않는다. 대신 재질·움직임·여백의 **값을 Astryx 테마의 값과 같게** 맞춰서, legacy 화면과 Astryx 화면이 같은 앱으로 보이게 한다. 이유는 "Astryx 적용 현황"의 끝.

---

## 이슈 끝 기준과 작업

| 끝 기준 (이슈 #44) | 작업 |
|---|---|
| 1. 유리 뒤가 눈에 띄게 비친다(읽을 것은 안 묻힌다) | QQ1 |
| 2. 버튼·탭·시트에 눌림·전환 움직임, 버벅이지 않음, "동작 줄이기"에 반응 | QQ2 · QQ3 |
| 3. 여백이 화면 사이에서 균일(간격 단위 하나) | QQ4 |
| 4. Astryx 적용 현황 목록 | 이 PLAN "Astryx 적용 현황" + QQ0 `scripts/astryx-inventory.mjs` |
| 5. Playwright · axe-core · Astryx visual review로 확인하는 절차 | QQ0 (+ 각 작업의 검증) |
| 6. 기록·판정·내보내기 그대로 | "과거 판정 불변" |

| ID | 내용 | 화면 변화 | 되돌리는 단위 |
|---|---|---|---|
| QQ0 | UI 검사 도구(Playwright + axe-core + 눌림·움직임·여백 검사), Astryx 현황 스크립트, "바꾸기 전" 스크린샷 | 없음 | — |
| QQ1 | 유리 재료 다시 잡기: 흐림 선언을 `glass.css` 한 곳의 리터럴로, 비침 목표, 시트 막 옅게, 가장자리 빛, 진단 줄 | 띠 넷·시트 16개, 설정 진단 | 커밋 하나 |
| QQ2 | 움직임 토큰 + 눌림 반응 + 시트·전체 화면 들어오는 움직임 + 동작 줄이기 | 버튼 전부, 시트, 세션·요약 화면 진입 | 커밋 하나 |
| QQ3 | legacy 시트 14개를 틀 하나(`SheetFrame`)로 + 닫히는 움직임 | 시트 14개 | 커밋 하나 |
| QQ4 | 여백 토큰 한 벌 + 인라인 여백 178곳을 클래스로 + 격자 밖 값 정리 | 거의 모든 legacy 화면 | 커밋 하나 |

---

## 확인한 것

**1. iOS에서 유리가 "모양만 비슷한" 이유 — 코드와 자료로 확인한 셋**

| 원인 | 근거 | 뜻 |
|---|---|---|
| 비치는 양이 적다. 띠는 뒤 내용의 22%, 시트는 11%만 지나간다 | `glass.css:7`(띠 0.78)·`:10`(시트 0.72) × 막 0.6(`global.css:521`). v1.18 DEV-RECORD "구현 중에 확인한 것": "이 값에서 유리는 눈에 거의 안 보인다" | 값을 이렇게 잡은 것은 "뒤가 통째로 주황이어도 4.5:1"이라는 최악 가정 때문이다(PLAN-v1.18 PP1 마지막 줄). 이 가정 아래서는 알파만 내려서는 비침을 늘릴 수 없다(아래 계산) |
| 뒤 내용이 어둡다. 카드 `#16161a` 위에 유리 `rgba(22,22,26,…)`가 얹히면 색이 같아 비쳐도 안 보인다. 보이는 것은 주황 버튼·초록 체크·글자뿐이다 | `global.css:3-7`, `glass.css:7` | 비침을 "알아볼 수 있게" 하려면 유리가 뒤와 다른 무엇(가장자리 빛, 채도)을 가져야 한다 |
| `-webkit-backdrop-filter: var(…)`는 WebKit에서 무시된 보고가 있다 | [WebKit 289149](https://bugs.webkit.org/show_bug.cgi?id=289149)(iOS 18.2에서 보고, 18.3+에서 재현 안 됨, INVALID로 닫힘), [289800](https://bugs.webkit.org/show_bug.cgi?id=289800)("-webkit-backdrop-filter ignores css variables", 열림), [297620](https://bugs.webkit.org/show_bug.cgi?id=297620)(macOS 14의 Safari 18~26.1에서 접두사 없는 쪽도 `var()`면 안 됨, 열림). v1.18은 띠 넷·시트 둘 모두 `var(--glass-*-filter)`로 적었다(`global.css` `.tabbar` 등, `ax.css`) | 폰(iOS 27)에서 이 버그가 나는지는 모른다. 확인할 방법이 폰뿐이라 **진단 줄**(QQ1)을 두고, 그와 별개로 흐림 선언을 리터럴로 바꿔 이 위험을 없앤다(비용이 작다) |

**비침과 글자 대비의 맞바꿈 (계산, 최악 가정 = 뒤가 통째로 주황 `#ff7a1a`이나 초록 `#34c759`)**

| 띠 | 지나가는 비율 | `--text-dim` | 지금 탭 주황 글자 |
|---|---|---|---|
| 알파 0.78, 밝기 그대로 (지금) | 22% | 5.11 | 4.61 |
| 알파 0.60, 밝기 그대로 | 40% | 3.34 ✗ | 3.01 ✗ |
| 알파 0.50, 뒤 밝기 0.6 (`backdrop-filter`의 `brightness()`) | 50% | 4.54 | 4.09 ✗ (→ 알약 위에 놓으면 5.52) |

| 시트 | 지나가는 비율 | `--text-faint` | `--text-dim` |
|---|---|---|---|
| 막 0.6, 시트 0.72 (지금) | 11% | 4.86 | — |
| 막 0.4, 시트 0.50, 뒤 밝기 0.5 | 30% | 4.65 | 6.58 |

- 뒤 밝기를 낮추면(`brightness()`를 흐림 안에 넣으면) 뒤의 색과 움직임은 그대로 지나가고 밝기만 줄어든다. iOS 다크 재질이 하는 일과 같다. 이 값들은 **되는 점이 있다는 증거**이지 정한 값이 아니다(값은 QQ1 구현자가 검사로 고른다 — 설계자 규칙 2절).
- 계산 스크립트는 남기지 않는다. 같은 계산을 QQ1이 `glass-check.mjs`의 `글자 대비`에 넣는다.

**2. 눌림 반응**

| 사실 | 근거 |
|---|---|
| legacy CSS에 눌림 규칙이 없다(`:active` 0건), 움직임 줄이기 규칙도 없다(`prefers-reduced-motion` 0건) | `global.css` 전체 grep |
| iOS Safari는 그 요소나 `body`에 `touchstart` 처리기가 없으면 `:active`를 칠하지 않는다 | MDN `:active`, [WebKit 138816](https://bugs.webkit.org/show_bug.cgi?id=138816). React는 루트 컨테이너에 `touchstart`를 다는데 그것이 이 조건을 채우는지는 문서로 확인하지 못했다 → `document`에 빈 수동(passive) 처리기를 단다(QQ2) |
| iOS의 `:active`는 손가락을 끌어 스크롤해도 남는 경우가 있다 | [WebKit 255277](https://bugs.webkit.org/show_bug.cgi?id=255277). Astryx는 그래서 터치에서는 `:active`를 끄고 문서 하나에 다는 눌림 추적기(`usePressFeedback`, `core/src/hooks/usePressFeedback.ts`)를 쓴다 |
| Astryx 부품은 이미 눌림·움직임 줄이기를 가진다: 눌림 `scale(0.98)` + `--color-overlay-pressed`, 움직임 줄이기에서 크기 변화 끔 | `core/src/Button/Button.tsx:144-173`, `astryx.css`의 `prefers-reduced-motion` 65곳 |
| Astryx 테마의 움직임 값: `--duration-fast` 125ms · `--duration-medium` 300ms · `--ease-entrance`·`--ease-standard` `cubic-bezier(0.24, 1, 0.4, 1)` · `--ease-exit` `cubic-bezier(0.3, 0, 0.6, 0.6)` | `theme-neutral/dist/theme.css`, `core/dist/astryx.css`. legacy 화면은 이 CSS를 읽지 않는다(지연 청크) |
| legacy 시트는 아래에서 12px만 올라온다(0.2초). 닫힐 때는 움직임 없이 사라진다(부모가 바로 언마운트) | `global.css:540`·`:560-562`, 시트 14개의 `<div className="sheet-backdrop" onClick={onClose}>` |
| 막의 `fade-in`이 `opacity`를 움직인다. `opacity`가 1 미만인 조상은 흐림의 기준(Backdrop Root)을 끊어 그동안 시트에 뒤가 안 비친다 | `global.css:524`, PLAN-v1.18 PP2 "농도" 마지막 줄 |

**3. 여백**

| 사실 | 근거 |
|---|---|
| `.tsx`의 인라인 스타일 273곳 가운데 여백(`margin*`·`padding*`·`gap`)이 178곳. 같은 역할(카드 안 줄과 줄 사이)에 `marginTop` 8(50곳)·10(28)·12(22)·16(12)·14(2)·4(2)·20(1)이 섞여 있다. 빈 `div` 간격(`height: 8` 24곳, `12` 1곳), 옆 간격 `marginLeft` 0·4·6·8 | `grep -ohE "style=\{\{[^}]*\}\}" -r src --include=*.tsx` |
| `global.css`의 여백 값: 8px(35)·12px(33)·6px(20)·10px(18)·4px(16)·14px(14)·2px(9)·3px(7)·9px·5px·18px 등 | 같은 방법으로 셈 |
| Astryx 간격 단위: `--spacing-*` 0.25rem(4px) 간격(0.5·1·1.5·2·3·4·5·6·8·10·12 …) | `core/dist/astryx.css` |
| 화면 틀: legacy `.screen`과 Astryx `.ax-screen`의 좌우 여백은 둘 다 16px이고, 위 여백은 같고 아래만 다르다(탭바 유무) | `global.css:94-100`, `ax.css:181-186` |

**4. 검증 도구**

| 도구 | 지금 | 이번 |
|---|---|---|
| Playwright | `1.65.0` devDependency. `scripts/screenshots.mjs`(루틴 편집)·`screenshots-glass.mjs`(유리)가 쓴다. 로컬에서만 돈다(CI는 브라우저를 받지 않는다 — v1.17 결정) | 그대로 쓴다. 새 `scripts/ui-check.mjs` |
| axe-core | 없다. `@axe-core/playwright`·`axe-core` 최신은 `4.14.0`(2026-11-12 `npm view`) | `@axe-core/playwright`를 devDependency로 정확한 버전 고정(설치한 날 2주 넘은 판 가운데 최신 — 구현자가 `npm view @axe-core/playwright time`으로 고른다) |
| Astryx "visual review" | **도구가 없다.** `@astryxdesign/cli@0.7.14`의 명령(`blog build component discover docs doctor experimental gap-report hook init integration manifest search swizzle template theme upgrade`)에 화면을 보는 검사가 없다. "visual review"는 `theme-neutral/README.md:68`에서 "팔레트를 바꾸면 영수증·토큰 비교·테스트·visual review를 같이 낸다"는 **사람이 스크린샷을 보는 절차**를 뜻한다 | 절차로 만든다: QQ0의 전·후 스크린샷 짝(390 다크, Astryx 화면은 라이트도) + 아래 "visual review 목록"을 화면 검증자가 채운다. CLI는 v1.17처럼 들이지 않는다 |

---

## Astryx 적용 현황 (끝 기준 4)

2026-11-12, `main` `ee7fdfe`. "인라인"은 `style={` 수. QQ0 스크립트가 같은 표를 다시 만든다.

| 화면·부품 | 그리는 것 | 인라인 | 비고 |
|---|---|---|---|
| 루틴 편집 (`RoutineEditorScreen`) | **Astryx** (`src/ax`) | 5 | 지연 청크. 라이트/다크를 따른다 |
| 종목 고르기 시트 (`ExercisePickerSheet`) · 종목 줄 시트 (`RoutineLineSheet`) | **Astryx** `Sheet` | 0 | 루틴 편집 안에서만 뜬다 |
| 홈 (`HomeScreen`) | legacy CSS | 31 | 헬스장 경로 |
| 세션 (`SessionScreen`) · 세트 카드 (`ExerciseCard`) · 휴식 바 (`RestTimerBar`) | legacy CSS | 1 · 11 · 1 | 헬스장 경로. 세트 카드는 과거 세션 수정 화면도 쓴다 |
| 세션 시트 8개 (`FinishSheet` `SubstituteSheet` `ManualTimerSheet` `TempoGuideSheet` `CompensationSheet` `CompensationWatchSheet` `AddExerciseSheet` `WeightScaleSheet`) | legacy CSS | 4~8 | 헬스장 경로 |
| 홈·식단 시트 6개 (`DayPickerSheet` `OpenSessionSheet` `FoodLogSheet` `DietSlotSheet` `DietPlanSheet` `DietVariantSheet`) | legacy CSS | 5~11 | |
| 요약 (`SummaryScreen`) | legacy CSS | 10 | 헬스장 경로(세션 끝) |
| 기록 · 과거 세션 수정 · 종목 이력 | legacy CSS | 8 · 11 · 10 | |
| 분석 (`AnalyzeScreen`) | legacy CSS + recharts | 12 | 지연 청크 |
| 식단 (`DietScreen` · `DietDayEditor`) | legacy CSS | 0 · 6 | |
| 설정 (`SettingsScreen`) + 패널 7개 (`GistPanel` `ExportPanel` `ImportPanel` `RoutineIoPanel` `RoutineListPanel` `DietIoPanel` `MealReminderPanel`) | legacy CSS | 25 + 3~9 | |
| 탭바 · 재개 스트립 · 업데이트 배너 · 온보딩 | legacy CSS | 0 · 0 · 3 · 4 | 탭바·상단 바에 맞는 Astryx 부품이 없다(PLAN-v1.18 "확인한 것") |
| 작은 부품 (`NumberStepper` `MonthCalendar` `WeekDots` `MuscleVolumeBars` `icons`) | legacy CSS | 0~2 | |

합계: `.tsx` 46개 가운데 Astryx 3개(루틴 편집 묶음), 손으로 짠 CSS 43개. 인라인 스타일 273곳(여백 178).

**남은 곳을 이번에 옮기지 않는 이유 (설계자가 정함)**

| 이유 | 근거 |
|---|---|
| 남은 화면의 대부분이 헬스장 경로(홈·세션·세션 시트·요약)다. 옮기면 README "헬스장 경로가 Astryx 코드를 읽지 않습니다"를 뒤집는다. 이 결정은 v1.18 "사람이 정할 것" 1·2·3으로 물었고 아직 답이 없다 | `README.md:249`, PLAN-v1.18 "사람이 정할 것" |
| 이슈가 짚은 세 가지(비침·눌림·여백)는 부품을 바꾸지 않아도 고칠 수 있다. 오히려 지금 옮기면 legacy와 Astryx가 섞인 채로 세 가지를 두 벌 고쳐야 한다 | 아래 QQ1~QQ4 |
| 그래서 이번에는 **값을 맞춘다**: 움직임(QQ2)·여백(QQ4)의 토큰 값을 Astryx 테마 값과 같게 두고, 유리 토큰은 v1.18처럼 Astryx 시트도 읽는다. 나중에 화면을 옮길 때 값이 바뀌지 않는다 | — |

---

## QQ0. UI 검사 도구와 "바꾸기 전" 스크린샷

### 진단

- 끝 기준 5. axe-core가 없고, 눌림·움직임 줄이기·여백을 재는 검사가 없다.
- `screenshots-glass.mjs`는 유리 장면 열 개만, `screenshots.mjs`는 루틴 편집만 찍는다. 기록·분석·식단·설정 화면은 찍는 도구가 없다.
- "바꾸기 전"은 바꾼 뒤에 다시 찍을 수 없다.

### 설계

**새 파일 `scripts/ui-check.mjs`** — 사용: `node scripts/ui-check.mjs <before|after> [--check] [--only=<장면,…>]`. 뼈대(`vite preview`, 390×844 `iPhone 14` 흉내, `ko-KR`, 온보딩 통과, 글자·`aria-label`로만 고르기, 공유 도우미는 `addInitScript` — DEV-RECORD 제약 15)는 `screenshots-glass.mjs`와 같다. 저장 `docs/screenshots/v1.19/<before|after>-<장면>.png`, 다크. 루틴 편집 장면만 라이트도 찍는다(`-light`).
검사 함수는 새 모듈 `scripts/lib/ui-check-lib.mjs`(import해도 실행 안 함). 유리 검사는 `scripts/lib/glass-check.mjs`를 그대로 import한다(같은 함수를 두 벌 짜지 않는다).

| 장면 | 상태 |
|---|---|
| `home` · `home-end` | 홈, 맨 아래까지 스크롤 |
| `home-resume` | 세션 시작 → `세션 최소화` → 홈 |
| `session` · `session-rest` | 세션 화면 첫 카드 / `1세트 완료` 뒤 휴식 바 |
| `sheet-finish` · `sheet-timer` · `sheet-home` | v1.18 장면과 같다 |
| `summary` | 세션을 끝낸 요약 화면 |
| `history` · `history-detail` | 기록 탭 / 위 세션의 수정 화면 |
| `analyze` | 분석 탭(차트가 그려질 때까지 기다린다) |
| `diet` · `sheet-food` | 식단 탭 / 먹은 것 추가 시트 |
| `settings` · `settings-end` | 설정 탭 / 맨 아래(진단 카드) |
| `editor` · `editor-light` · `line-sheet` · `line-sheet-light` | 루틴 편집 화면 / 줄 시트 (`screenshots.mjs`의 진입 함수와 같은 순서로 들어간다) |

`--check`의 검사 (장면마다, 하나라도 어기면 종료 코드 1, 표는 장면 × 검사 `통과`·`실패`·`건너뜀`):

| 검사 | 기준 |
|---|---|
| 접근성 (axe) | `@axe-core/playwright`의 `AxeBuilder`로 `wcag2a`·`wcag2aa`·`wcag21a`·`wcag21aa` 태그. `impact`가 `serious`·`critical`인 위반이 0건. **`color-contrast`는 이 검사에서 결과를 찍기만 하고 실패로 세지 않는다**(axe는 `backdrop-filter`가 걸린 반투명 면의 바탕을 계산하지 못해 `incomplete`로 낸다. 유리 위 글자 대비는 `glass-check`의 `글자 대비`가 맡는다). 위반은 규칙 id · 요소 선택자 · 개수로 찍는다 |
| 눌림 반응 | 장면에 보이는 `button`·`[role="button"]`·`a[href]`(가려지지 않고 `disabled`가 아닌 것) 전부. 요소마다 가운데 점에 `mouse.move` → `mouse.down` 뒤 `transitionend`를 기다리지 않고 한 프레임 + Astryx `--duration-fast`만큼 기다려, 계산된 `transform`·`opacity`·`background-color`·`background-image`·`box-shadow`·`filter` 가운데 하나라도 누르기 전과 다르면 통과. `mouse.up` 뒤 원래대로 돌아오는지도 본다(안 돌아오면 실패). 요소를 누르면 화면이 바뀌므로 **`mouse.up`은 요소 밖으로 끈 뒤에 한다**(클릭이 되지 않게). 실패는 요소의 글자/`aria-label`과 클래스로 찍는다 |
| 움직임 줄이기 | `page.emulateMedia({ reducedMotion: 'reduce' })` 뒤: 시트 장면의 `.sheet`·`.sheet-backdrop`·`.astryx-bottom-sheet`의 계산된 `animation-duration`·`transition-duration`이 전부 0.01s 이하이고, 눌림 반응 검사를 다시 돌렸을 때 `transform`이 바뀌는 요소가 0개다(눌림은 색·투명도로만 보인다) |
| 여백 격자 | 장면의 보이는 요소마다 계산된 `padding-*`·`margin-top`·`margin-bottom`·`row-gap`·`column-gap`이 0이거나 2px의 배수다(소수는 0.5px 안이면 반올림). `margin-left`·`margin-right`는 재지 않는다(`margin: 0 auto` 가운데 맞춤이 화면 폭에 따라 아무 값이나 된다 — 옆 간격은 정적 검사·QQ4 스캔이 본다). 예외: Astryx 부품 내부(`[class*="astryx-"]`의 자손) |
| 가로 넘침 | `glass-check.mjs`의 `inPageOverflow` |

- **정적 검사** (`--check`, Node로 파일을 읽는다. `before`에서는 건너뛴다): QQ1·QQ2·QQ4가 아래에 하나씩 더한다. 정적 검사 목록과 결과는 표 맨 위에 찍는다.
- `glass-check.mjs`의 기존 검사(`유리 켜짐`·`내용은 불투명`·`한 겹`·`투명도 줄이기`·`대비 증가`·`글자 대비`·`시트 비침`·`탭바 자리`)는 띠·시트가 있는 장면에서 같이 돈다. `screenshots-glass.mjs`는 그대로 둔다(v1.18 기록을 재현하는 도구다).

**새 파일 `scripts/astryx-inventory.mjs`** — `src/**/*.tsx`(테스트 제외)를 읽어 "Astryx 적용 현황" 표를 Markdown으로 찍는다: 파일 · `../ax`나 `./ax` import 유무 · `style={` 수 · 그 가운데 여백 속성 수 · legacy 클래스(`className="…"`의 낱말 가운데 `global.css`에 선택자로 있는 것) 수. `--write`면 `docs/ASTRYX-INVENTORY.md`에 쓴다(맨 위에 만든 날짜와 커밋). 판정하지 않는다(종료 코드 항상 0).

**visual review 목록** — 화면 검증자가 `before`·`after` 짝을 Read로 보고 장면마다 칸을 채운다(`.reports/screen-check-<ID>.md`). Astryx가 말하는 visual review를 이 앱에서 하는 방법이다.

| 칸 | 묻는 것 |
|---|---|
| 재질 | 유리 층 뒤에 무엇이 비치는지 말로 적을 수 있나(예: "주황 버튼이 탭바 뒤로 번져 보인다"). 못 적으면 "안 보인다" |
| 읽힘 | 유리 위 글자·숫자가 팔 뻗은 거리에서 읽히나 |
| 여백 | 같은 역할의 간격(카드 사이, 카드 안 줄 사이, 화면 좌우)이 이 장면과 다른 장면에서 같아 보이나 |
| 두 체계 | 루틴 편집(Astryx) 장면과 legacy 장면을 나란히 놓았을 때 좌우 여백·시트 모양·모서리가 같은 앱으로 보이나 |
| 바뀌지 말 것 | 문구·버튼 순서·숫자가 `before`와 같나 |

### 검증

- `node scripts/ui-check.mjs before`가 장면 전부를 찍는다. 커밋한다.
- **검사가 잡는다는 증거:** `before --check`가 종료 코드 1이고 아래가 실패로 찍힌다(출력 표를 DEV-RECORD에 복사). 하나라도 통과면 검사가 틀린 것이다.
  - `home`의 `눌림 반응` — legacy 버튼 전부(눌림 규칙이 없다)
  - `sheet-finish`의 `움직임 줄이기` — `.sheet`의 `slide-up`이 0.2s
  - `session`의 `여백 격자` — 세트 카드의 `.chip`(`padding: 3px 9px`, `global.css:194`). 인라인 `marginTop: 10`·`14`는 2의 배수라 이 검사로는 안 걸린다(그것은 QQ4 스캔이 잡는다). `session`에 `.chip`이 안 그려지면 `.chip`이 보이는 다른 장면을 찾아 그 장면으로 적는다
- `before`에서 `editor`의 `눌림 반응`은 **통과가 맞다**(Astryx 버튼은 `:active`에 `scale(0.98)` — 이 Chromium의 `pointer`는 흉내로 `coarse`일 수 있다. 그러면 Astryx는 `:active`를 끄고 추적기를 쓴다. 추적기는 `pointerdown`을 들으므로 `mouse.down`으로 칠해진다. 통과하지 않으면 DEV-RECORD 제약에 원인을 적고 Astryx 요소를 이 검사에서 뺀다 — 멈추지 않는다).
- `before`의 axe 결과는 통과·실패 어느 쪽이든 그대로 DEV-RECORD에 복사한다. **이번 작업은 axe 위반을 새로 만들지 않는다**: `after`의 `serious`·`critical` 위반이 `before`보다 늘면 실패다. `before`에 이미 있는 위반은 목록으로 남기고 고치지 않는다(범위 제외).
- `node scripts/astryx-inventory.mjs --write` 결과가 이 PLAN의 표와 수가 같다(다르면 PLAN이 틀린 것 — DEV-RECORD에 적는다).
- `npm test`·`npm run build`·`node scripts/quality-scan.mjs --ci` 통과(앱 코드 무변경).

### 범위 제외

- CI에서 `ui-check` 돌리기: 브라우저 내려받기(v1.17 결정과 같다). `astryx-inventory.mjs`는 판정하지 않으니 CI에 넣을 이유가 없다.
- `@astryxdesign/cli` 들이기: 화면 검사 명령이 없다("확인한 것" 4).
- `before`의 axe 위반 고치기: 무엇이 나올지 모르고, 이 이슈의 끝 기준이 아니다. 나오면 DEV-RECORD 목록을 근거로 새 이슈를 만든다(지휘자).

### README 반영

없음 (도구는 "Getting Started"가 아니라 DEV-RECORD에 적는다).

---

## QQ1. 유리 재료 다시 잡기 — 비치게, 그리고 iOS가 확실히 그리게

### 진단

"확인한 것" 1의 세 줄.

### 설계

**흐림 선언을 `glass.css` 한 곳으로, 리터럴로**

| 파일 | 지금 | 바꾼 뒤 |
|---|---|---|
| `global.css` `.tabbar`·`.session-header`·`.resume-strip`·`.rest-bar`·`.sheet` | `-webkit-backdrop-filter: var(--glass-*-filter)` · `backdrop-filter: var(…)` | 두 줄을 지운다. `background: var(--glass-*)`는 남긴다(배경색의 `var()`는 문제 보고가 없다) |
| `ax.css` `.astryx-bottom-sheet` | 같은 두 줄 | 지운다 |
| `glass.css` (새 규칙 둘) | — | ① `.tabbar, .session-header, .resume-strip, .rest-bar { -webkit-backdrop-filter: <띠 흐림>; backdrop-filter: <띠 흐림>; }` ② `.sheet { … <시트 흐림> }` — 흐림 값은 **글자 그대로** 적는다(`var()` 없이). 두 접두사의 값은 같다 |
| `ax.css` `@layer astryx-theme` 안 (새 규칙 하나) | — | `html[data-astryx-theme] .astryx-bottom-sheet { -webkit-backdrop-filter: <시트 흐림>; backdrop-filter: <시트 흐림>; }` — 아래 첫 줄의 이유로 `glass.css`가 아니라 여기 |
| `glass.css` `--glass-bar-filter`·`--glass-sheet-filter` 토큰 | 있다 | **지운다.** 끄기 규칙(유리 끄기 두 블록, 한 겹 규칙)은 토큰을 `none`으로 바꾸던 것을, 같은 선택자 목록에 `-webkit-backdrop-filter: none; backdrop-filter: none;`을 직접 거는 것으로 바꾼다. 배경색 토큰(`--glass-bar`·`--glass-sheet` → `--glass-solid`)은 그대로 토큰으로 바꾼다 |

- Astryx 시트 규칙은 `astryx-theme` 레이어여야 Astryx 부품 규칙을 이긴다(PLAN-v1.18 PP2). `glass.css`는 `legacy` 레이어로 들어오므로(`index.css:8`) 그 안에 `@layer astryx-theme { … }`를 적으면 **`legacy.astryx-theme`라는 하위 레이어가 되어 이기지 못한다.** 그래서 Astryx 시트의 흐림은 `ax.css`의 `@layer astryx-theme` 안에 리터럴로 둔다. 같은 값이 두 파일에 생기므로 정적 검사가 "두 곳의 시트 흐림 값이 글자 그대로 같다"를 본다.
- 끄기 규칙도 같은 이유로 Astryx 시트 몫은 `ax.css`에 둔다(`@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)` + `@supports not (…)` 두 블록, `astryx-theme` 레이어 안). 끄기 블록 넷(legacy 둘, Astryx 둘)의 미디어 조건이 같은지 정적 검사가 본다.
- 규칙 머리 주석: "흐림 값에 `var()`를 쓰지 않는다 — WebKit이 `-webkit-backdrop-filter`의 사용자 정의 속성을 무시한 보고가 있다(WebKit 289149·289800·297620)."

**비침 목표 (값은 구현자가 고른다)**

| 무엇 | 목표 (`--check`로 잰다) | 손잡이 |
|---|---|---|
| 띠 비침 (새 검사) | 띠 넷마다 `(1 − 띠 배경 알파) ≥ 0.40` | `--glass-bar` 알파, 흐림 안의 `brightness()`·`saturate()`·`blur()` |
| 시트 비침 (기존 검사, 기준을 올린다) | legacy 시트 `(1 − 시트 알파) × (1 − 막 알파) ≥ 0.25`. Astryx 시트는 라이트·다크 각각 같은 기준(v1.18은 값만 찍었다 — 이번에는 막을 바꾸므로 건다) | `--glass-sheet` 알파, 막 농도(새 토큰 `--glass-scrim`), 시트 흐림의 `brightness()` |
| 글자 대비 (기존 검사, 계산을 고친다) | 4.5:1(24px 이상 굵은 글자 3:1). **바탕 합성에 뒤 밝기를 넣는다:** 흐림 값에서 `brightness(b)`를 읽어(없으면 1) `--accent`·`--ok`의 채널에 `b`를 곱한 색 위에 유리를 합성한다. 시트는 (막을 합성한 색 × b) 위에 시트 | 같다 |
| 지금 탭 글자 | 위 대비를 알약 위에서 잰다: 지금 탭 버튼의 `::before` 알약 배경을 띠 합성색 위에 한 번 더 합성한 색이 바탕이다 | `--glass-pill`의 색·알파. 계산상 흰빛 알약(지금 `rgba(255,255,255,0.08)`)으로는 못 미친다(3.24:1) → 어두운 쪽 알약이 된다. 구현자가 검사로 정한다 |

- 띠 넷의 알파·흐림은 하나로 둔다(토큰 하나, 흐림 값 하나). 시트도 legacy·Astryx가 같은 알파·흐림을 쓴다(Astryx 쪽 배경은 v1.18처럼 `color-mix(… var(--color-background-surface) <같은 %> …)`).
- 구현자는 고른 값과 그 값에서의 `띠 비침`·`시트 비침`·가장 낮은 `글자 대비`를 DEV-RECORD에 적는다. 목표를 다 채우는 값이 없으면 멈추고 보고한다(계산상 있다 — "확인한 것" 1의 표).
- `--sheet-alpha` 같은 비교 스크린샷은 이번에 만들지 않는다. 대신 `ui-check.mjs --glass=<띠 알파>,<시트 알파>,<막 알파>`로 `addStyleTag`를 넣어 `home`·`session`·`sheet-finish`를 `docs/screenshots/v1.19/compare/`에 찍는 플래그 하나를 둔다. 구현자는 고른 값과, 띠 알파만 ±0.1 바꾼 두 벌을 찍어 커밋한다(사람이 PR에서 비교한다. 값을 다시 고르는 일이 아니다).

**막 (scrim)**

| 층 | 지금 | 바꾼 뒤 |
|---|---|---|
| legacy `.sheet-backdrop` | `background: rgba(0, 0, 0, 0.6)` | `background: var(--glass-scrim)` — 새 토큰, `glass.css`. 유리 끄기 블록에서는 지금 값(0.6)으로 돌린다(시트가 불투명해지면 막을 옅게 할 이유가 없다) |
| Astryx 바텀 시트의 `::backdrop` | `--color-overlay` (라이트 0.5, 다크 0.8) | 바텀 시트의 `<dialog>`에서만 `::backdrop`의 `background-color`를 `--glass-scrim`과 같은 농도의 검정으로(`ax.css` `astryx-theme` 레이어). 선택자는 구현자가 `BottomSheet.tsx`의 `<dialog>`에 붙는 안정 클래스에서 고른다 — 없으면 `dialog:has(> .astryx-bottom-sheet)::backdrop`(`:has()`는 iOS 15.4+). `Dialog`·`Drawer` 등 다른 겹의 막은 바꾸지 않는다 |

- 막을 옅게 하는 것이 시트를 유리로 보이게 하는 가장 큰 손잡이다(PLAN-v1.18 PP2 범위 제외에서 "폰에서 보고 따로 정한다"고 남긴 것). 폰에서 본 결과가 "비치지 않는다"이므로 이번에 연다. 화면 전체가 덜 어두워지는 변화라 "사람이 정할 것" 1에 남기되, 구현은 이 설계대로 한다(답이 "막은 그대로"면 `--glass-scrim`만 0.6으로 되돌리고 시트 알파를 다시 고른다 — "되돌리기").

**가장자리 빛** — 뒤가 어두워 비침이 덜 보이는 것을 보완한다("확인한 것" 1의 둘째 줄).

| 토큰 | 쓰는 곳 |
|---|---|
| `--glass-highlight` (새) | 띠 넷·legacy 시트·Astryx 시트의 위쪽 안 가장자리에 1px 밝은 선(`box-shadow: inset 0 1px 0 var(--glass-highlight)` — 기존 `box-shadow`가 있는 탭바·재개 스트립은 쉼표로 이어 붙인다). 유리 끄기 블록에서는 `transparent` |
| `--glass-edge` (있음) | 그대로 |

**진단 줄** (설정 → 진단 카드, `오디오` 줄 다음)

- 새 순수 함수 `src/lib/glassDiag.ts`: `glassDiagnosis(input: { supportsBlur: boolean; supportsWebkitBlur: boolean; computed: string | null; reduceTransparency: boolean; moreContrast: boolean }): { label: string; sub: string | null }`.
  - `computed`는 화면에 있는 `.tabbar`의 계산된 `backdrop-filter`(없거나 `none`이면 `-webkit-backdrop-filter`). 탭바는 설정 탭에서 항상 그려져 있다.
  - 반환 (`label` · `sub`): 대비 증가가 켜짐 → `꺼짐 (대비 증가)` · `null` / 투명도 줄이기 → `꺼짐 (투명도 줄이기)` · `null` / 두 `supports`가 다 거짓 → `꺼짐 (이 브라우저는 흐림 미지원)` · `null` / `computed`가 `none`이나 `null` → `꺼짐 (흐림이 적용되지 않음)` · `흐림 지원: <표준|webkit|둘 다>` / 그 밖 → `켜짐` · `computed` 값 그대로.
- `SettingsScreen`이 마운트할 때 한 번 읽어(`CSS.supports`·`getComputedStyle`·`matchMedia`) 함수에 넘긴다. 줄 제목 `유리`, `row-sub`는 함수의 `sub`. 저장하지 않는다.
- 왜: 폰에서 유리가 안 보일 때 "값이 옅어서"인지 "iOS가 흐림을 안 그려서"인지를 사람이 한 번에 가른다(v1.3 오디오 줄과 같은 이유 — `SettingsScreen.tsx:434-438` 주석).

### 검증

`src/lib/glassDiag.test.ts`

- 다섯 갈래 각각 한 사례. 대비 증가와 투명도 줄이기가 둘 다 참이면 대비 증가가 먼저다. `computed`가 `'none'`·`null`·`''` 모두 "적용되지 않음". `computed`가 `'saturate(1.8) blur(20px)'`면 `켜짐`이고 `sub`가 그 값이다.

`src/lib/v119.test.ts` (describe `QQ1`)

- v1.18 PP1 스캔(`.tsx`에 `backdropFilter`·`WebkitBackdropFilter`·`backdrop-filter` 없음)을 그대로 둔다(`v118.test.ts`가 이미 지킨다 — 고치지 않는다).
- 스캔: `SettingsScreen.tsx`가 `glassDiagnosis`를 부르고 `유리` 줄을 가진다.

`ui-check.mjs` 정적 검사 (QQ1이 더한다)

- `global.css`·`ax.css`에 `backdrop-filter` 선언이 `none` 말고는 없다 — 단 `ax.css`의 `.astryx-bottom-sheet` 규칙 하나는 예외.
- 프로젝트 CSS 전체(`src/**/*.css`)의 `backdrop-filter`·`-webkit-backdrop-filter` 값에 `var(`가 0건.
- 같은 규칙 안의 `-webkit-backdrop-filter`와 `backdrop-filter` 값이 글자 그대로 같다.
- `glass.css`의 띠·시트 흐림 값과 `ax.css` Astryx 시트 흐림 값: 시트 둘이 같다.
- 유리 끄기 블록: `glass.css` 둘, `ax.css` 둘. 각 쌍의 선언이 공백을 빼고 같고, 미디어 조건 두 개가 같다(v1.18 검사를 넓힌다).
- `glass.css`에 `prefers-reduced-transparency`·`prefers-contrast`·`:has(`가 있다(v1.18과 같다).

`node scripts/ui-check.mjs after --check` — 띠·시트가 있는 장면에서 `띠 비침`·`시트 비침`(legacy·Astryx 라이트·다크)·`글자 대비`(알약 포함)·`한 겹`·`유리 켜짐`·`내용은 불투명`·`투명도 줄이기`·`대비 증가`가 통과. 출력 표를 DEV-RECORD에 복사.

- 빌드 출력(명령과 출력 복사): `dist/assets/index-*.css`에서 `backdrop-filter` 값에 `var(`가 없고, `-webkit-` 줄과 접두사 없는 줄이 둘 다 남아 있다.
- 결함 복원 (QQ1 몫, "구현 순서와 검증"의 목록): ①~⑤.
- 눈으로(구현자, DEV-RECORD에 한 줄씩): `after-home`·`after-session`·`after-sheet-finish`에서 유리 뒤에 무엇이 비치는지 말로 적는다. 못 적으면 "안 보인다"고 그대로 적는다(멈추지 않는다 — 사람이 `compare/`와 폰으로 본다).

### 범위 제외

- 굴절·렌즈: iOS Safari에서 안 된다(PLAN-v1.18 "확인한 것").
- 카드·입력칸을 유리로: 끝 기준 1의 괄호. `내용은 불투명` 검사가 지킨다.
- 내용 쪽 색을 밝게 바꿔 비침을 돋보이게 하기(카드 색, 배경 무늬): 앱 전체 색이 바뀌는 일이다. 폰에서 이 PLAN의 결과를 본 뒤 정한다.
- 설정의 "유리 끄기" 스위치: v1.18 결정 그대로(두지 않는다).

### README 반영

"iOS · PWA"의 "유리는 떠 있는 층에만 쓰고…" 항목에서 셋째 문장부터를 아래로 바꾼다:

```
  색·농도는 `src/styles/glass.css`의 토큰이 정하고, 흐림 값은 `glass.css`(Astryx 시트는 `src/ax/ax.css`)에
  글자 그대로 적습니다 — WebKit이 `-webkit-backdrop-filter`의 CSS 변수를 무시한 보고가 있어서 `var()`를 쓰지 않습니다.
  `.tsx`에 `backdrop-filter`를 직접 적지 않습니다.
  비침은 "뒤가 통째로 주황이어도 글자가 4.5:1"을 지키는 가장 옅은 값으로 잡고, 뒤 밝기를 낮춰(`brightness()`)
  비치는 양을 늘립니다. 시트 뒤의 어두운 막도 그만큼 옅게 둡니다.
  시트가 뜨면 아래 띠의 흐림을 끕니다 — 같은 자리에서 흐림이 두 번 돌지 않게 합니다.
  폰이 "대비 증가"나 "투명도 줄이기"를 알려주면, 또는 브라우저가 흐림을 못 그리면 유리 대신
  불투명한 면을 씁니다. 굴절·렌즈 효과는 iOS Safari가 지원하지 않아 만들지 않습니다.
  폰에서 흐림이 실제로 걸렸는지는 설정 → 진단의 "유리" 줄이 알려줍니다.
```

---

## QQ2. 움직임 토큰 + 눌림 반응 + 들어오는 움직임 + 동작 줄이기

### 진단

"확인한 것" 2.

### 설계

**새 파일 `src/styles/motion.css`** (`index.css`에서 `glass.css` 다음에 `layer(legacy)`로)

| 토큰 | 값 | 출처 |
|---|---|---|
| `--motion-fast` | Astryx `--duration-fast`와 같은 값 | `theme-neutral/dist/theme.css` |
| `--motion-medium` | `--duration-medium`과 같은 값 | 같다 |
| `--ease-enter` | `--ease-entrance`와 같은 값 | `core/dist/astryx.css` |
| `--ease-leave` | `--ease-exit`와 같은 값 | 같다 |
| `--press-scale` | Astryx `Button`의 눌림 크기(`scale(0.98)`)와 같은 값 | `core/src/Button/Button.tsx:159` |
| `--press-overlay` | 다크의 `--color-overlay-pressed`와 같은 값 | `theme-neutral/dist/theme.css` |

- 파일 머리 주석: "값은 `@astryxdesign/theme-neutral@0.7.13`에서 옮겨 적었다. legacy 화면은 Astryx CSS를 읽지 않아서(헬스장 경로) 변수를 참조할 수 없다. Astryx 버전을 올리면 이 값을 다시 맞춘다." 값을 옮겨 적는 것은 이 파일 하나뿐이다.
- `@media (prefers-reduced-motion: reduce) { html:root { --press-scale: 1; } … }` 와 아래 "움직임 줄이기" 규칙을 같은 파일 끝에 둔다.

**눌림 반응** — legacy 버튼을 세 무리로 나눠 `motion.css`에 규칙 셋. 선택자는 구현자가 `global.css`의 클래스에서 채운다(아래는 무리의 기준과 대표).

| 무리 | 기준 | 대표 클래스 | 눌렸을 때 |
|---|---|---|---|
| 알약·버튼 | 테두리나 면이 있는 독립된 버튼 | `.btn*` `.pill` `.chip*` `.diet-chip` `.rest-btn*` `.session-end` `.stepper` 버튼 `.segment` 버튼 | `transform: scale(var(--press-scale))` + 면 위에 `--press-overlay`(배경 이미지 `linear-gradient`로 얹는다 — 배경색을 갈아 끼우지 않는다) |
| 줄 | 폭 전체를 쓰는 목록 줄·카드 | `.row` `.setup-row` `.sheet-row` `.card`(버튼일 때) `.today-card-btn` `.ex-head` `.check-item` | 크기는 그대로, `--press-overlay`만 (iOS 표의 줄 눌림과 같다) |
| 띠 안 | 탭바 버튼·재개 스트립·휴식 바·세션 상단 바의 버튼 | `.tabbar button` `.resume-strip` `.rest-dismiss` `.session-minimize` `.back-link` | 아이콘·글자만 `opacity`를 내린다(유리 면에 덧칠하면 한 겹 규칙과 상관없이 면 색이 바뀐다) |

- 규칙 모양: `<선택자>:active:not(:disabled):not([aria-disabled='true'])`. 눌림이 **바로** 보이도록 눌릴 때는 전환 없이, 뗄 때만 `--motion-fast` `--ease-leave`로 돌아오게 한다(`transition`을 `:active`가 아닌 쪽에 건다).
- `[data-astryx-theme]` 안의 요소에는 걸지 않는다(`:not([data-astryx-theme] *)` 대신 `.ax-screen`·`.astryx-bottom-sheet` 밖이라는 것을 선택자로 보장 — 구현자가 무리마다 확인). Astryx 부품은 자기 눌림을 가진다.
- 세 무리에 들지 않는 `<button>`이 남으면 안 된다: QQ0 `눌림 반응` 검사가 장면마다 본다. 장면에 없는 버튼은 아래 스캔이 본다.

**`src/main.tsx` 한 줄** — `createRoot` 앞에 `document.addEventListener('touchstart', () => {}, { passive: true })`. 주석: "iOS Safari는 `touchstart` 처리기가 없으면 `:active`를 칠하지 않는다(MDN `:active`, WebKit 138816). 수동 처리기라 스크롤을 막지 않는다."

**들어오는 움직임**

| 무엇 | 지금 | 바꾼 뒤 |
|---|---|---|
| legacy 시트 | `slide-up`: 12px 위로, 0.2s `ease-out` | 화면 아래 밖(`translateY(100%)`)에서 올라온다. `--motion-medium` `--ease-enter` |
| legacy 막 | `fade-in`: `opacity` 0 → 1 | **`opacity`가 아니라 `background-color`를 투명 → `--glass-scrim`으로**(같은 길이·곡선). `opacity`가 흐림 기준을 끊는 문제("확인한 것" 2 끝 줄)가 없어진다 |
| 세션 화면 · 요약 화면 진입 (`App.tsx`의 `view` 전환) | 바로 바뀐다 | 화면 맨 바깥 요소에 들어오는 움직임 하나: 아래에서 올라온다(iOS 전체 화면 모달). `--motion-medium` `--ease-enter`. 클래스는 구현자가 두 화면의 맨 바깥 요소에 건다 |
| 탭 전환 | 바로 바뀐다 | 그대로 (iOS 탭 전환에 움직임이 없다) |
| 루틴 편집 진입 | 바로 | 그대로 — Astryx 화면 틀(`AxRoot`) 안은 Astryx가 정한다. 바꾸면 `src/ax`를 고쳐야 한다 |

- 나가는 움직임(세션 최소화·요약 닫기)은 만들지 않는다(범위 제외). 시트가 닫히는 움직임은 QQ3.
- 움직이는 속성은 `transform`·`opacity`·`background-color`뿐이다(합성 단계에서 끝나 스크롤과 시트 열기가 버벅이지 않는다 — 끝 기준 2). `will-change`는 쓰지 않는다(흐림 기준을 끊는다 — WebKit 289149의 분석).

**움직임 줄이기** (`motion.css` 끝)

`@media (prefers-reduced-motion: reduce)`: `.sheet`·`.sheet-backdrop`·세션·요약 진입 클래스의 `animation-duration`과 위 눌림 규칙의 `transition-duration`을 0.01ms로, `--press-scale: 1`. 눌림 덮개(`--press-overlay`)·투명도는 남는다(눌렸다는 것은 계속 보인다). 휴식 바 진행 채움(`global.css:1062` `transform 0.25s linear`)과 타이머 링은 **그대로 둔다** — 시간이 흐르는 것을 보여 주는 정보다.

### 검증

`src/lib/v119.test.ts` (describe `QQ2`)

- 스캔: `src/main.tsx`에 `addEventListener('touchstart'`과 `passive: true`가 있다.
- 스캔: `src/**/*.tsx`의 `<button`마다 `className`이 있고, 그 클래스 낱말 가운데 하나가 아래 **목록 상수**에 있다. 목록은 `src/lib/pressClasses.ts`의 `PRESS_CLASSES: Record<'pill' | 'row' | 'bar', readonly string[]>`(구현자가 `motion.css`의 세 선택자와 같은 내용으로 채운다). `className`이 조건식이면 문자열 조각 전부에서 찾는다. 예외는 Astryx 화면 파일(`src/ax`를 import하는 파일)과, 클래스 없이 감싼 요소가 무리에 드는 버튼(구현자가 목록 상수 옆 주석에 파일:줄로 적는다).
- vitest는 CSS를 못 읽으므로(DEV-RECORD 제약 3·20) `PRESS_CLASSES`와 `motion.css`의 선택자가 같은지는 `ui-check.mjs` 정적 검사가 본다: `motion.css`의 세 눌림 규칙 선택자에 들어 있는 클래스 집합이 `pressClasses.ts`(Node로 글을 읽어 배열 글자를 뽑는다)와 같다.

`ui-check.mjs` 정적 검사 (QQ2가 더한다)

- `motion.css`에 `prefers-reduced-motion`이 있다. `global.css`·`motion.css`의 `@keyframes` 가운데 `.sheet`·`.sheet-backdrop`·진입 클래스가 쓰는 것이 `opacity`를 움직이지 않는다(막) — 시트 자신의 `opacity`도 움직이지 않는다.
- `src/**/*.css`(Astryx 패키지 제외)에 `will-change` 0건.

`node scripts/ui-check.mjs after --check` — 전 장면 `눌림 반응`·`움직임 줄이기` 통과. 출력 표를 DEV-RECORD에 복사.

- 경계: 비활성(`disabled`) 버튼은 눌려도 바뀌지 않는다(`눌림 반응`이 `disabled`를 빼므로 따로 한 장면에서 확인: `sheet-finish`의 비활성 버튼이 있으면 그것, 없으면 DEV-RECORD에 "장면 없음") · 휴식 바 진행 채움이 움직임 줄이기에서도 움직인다(`session-rest`를 움직임 줄이기로 2초 간격 두 번 찍어 채움 폭이 다르다) · 시트 장면에서 막이 다 칠해진 뒤 `유리 켜짐`·`시트 비침`이 그대로 통과한다.
- 기존 테스트 수정 없이 통과: `timerOwnership`·`useRestTimer`·`polish`·`uiConsistency`.

### 범위 제외

- Astryx식 눌림 추적기(스크롤이 터치를 가져가면 눌림 취소)를 legacy에 만들기: 문서 하나에 다는 추적기 자체는 작지만(`usePressFeedback.ts` 2.4KB + `utils/pressFeedback`) legacy 버튼 200개에 표식을 달아야 한다. iOS의 `:active`가 스크롤 중에 남는 것(WebKit 255277)이 폰에서 거슬리면 그때 작은 작업으로 한다 — 실기기 ④.
- 나가는 화면 움직임(세션 최소화·요약 닫기·뒤로 가기 밀기): 뷰를 바로 언마운트하는 `App.tsx`의 흐름을 바꿔야 하고, 세션 화면을 오가는 길은 타이머 소유(Z5)와 붙어 있다. 들어오는 움직임만으로 "바로 바뀐다"는 느낌을 먼저 없앤다.
- 시트를 손가락으로 끌어내리기(legacy): Astryx 시트에만 있다. legacy 시트 14개를 Astryx로 옮길 때 같이 생긴다("사람이 정할 것" 2).
- 진동(햅틱): iOS PWA는 `navigator.vibrate`를 지원하지 않는다(README Limitations).

### README 반영

"iOS · PWA"에 한 항목을 더한다:

```
- **눌림과 움직임은 Astryx 테마의 값을 따르고, "동작 줄이기"를 존중한다**
  legacy 화면의 버튼은 눌린 순간 바로 작아지거나(버튼·알약) 덮개가 얹히고(목록 줄), 뗄 때 돌아옵니다.
  시트와 세션·요약 화면은 아래에서 올라옵니다. 길이·곡선·눌림 크기는 `src/styles/motion.css`가 정하고,
  값은 Astryx 테마에서 옮겨 적었습니다 — legacy 화면은 헬스장 경로라 Astryx CSS를 읽지 않습니다.
  iOS Safari는 `touchstart` 처리기가 없으면 눌림(`:active`)을 그리지 않아서 `main.tsx`가 빈 처리기를 답니다.
  폰의 "동작 줄이기"가 켜지면 크기 변화와 올라오는 움직임을 끄고, 눌림 덮개와 휴식 타이머의 진행 표시는 남깁니다.
  움직이는 것은 `transform`·`opacity`·`background-color`뿐이고, 시트 뒤 막은 `opacity`로 움직이지 않습니다
  (`opacity`가 1보다 작은 조상은 시트의 흐림을 끊습니다).
```

---

## QQ3. legacy 시트를 틀 하나로 + 닫히는 움직임

### 진단

- 시트 14개가 같은 껍데기(`sheet-backdrop` → `sheet` + `stopPropagation` + `role="dialog"` + `aria-label` + `sheet-grip`)를 각자 적는다(`FinishSheet.tsx:73-75`, `DayPickerSheet.tsx:67-69` 등). v1.18 `v118.test.ts` PP2 스캔이 "14개 전부 `className="sheet"`"를 지키는 것은 이 껍데기가 갈라질 수 있어서다.
- 닫힐 때 움직임이 없다: 막을 누르면 `onClose`가 부모 상태를 바꿔 시트가 그 프레임에 사라진다. iOS 시트는 내려가며 닫힌다(끝 기준 2 "시트에 전환 움직임").

### 설계

**새 파일 `src/components/SheetFrame.tsx`** (Astryx를 import하지 않는다 — 헬스장 경로)

| 내보내는 것 | 형태 |
|---|---|
| `SheetFrame` | `({ label, onClose, children, className? }: { label: string; onClose: () => void; children: ReactNode; className?: string }) => JSX.Element`. 그리는 것: `<div className="sheet-backdrop" …><div className={'sheet' + (className ? ' ' + className : '')} role="dialog" aria-label={label} …><div className="sheet-grip" />{children}</div></div>` — 지금 14개가 그리는 DOM과 같다(클래스·역할·이름 그대로) |
| `useSheetDismiss` | `() => () => void`. 시트 안의 "닫기·취소" 버튼이 부른다. `SheetFrame` 밖에서 부르면 오류를 던진다(개발 중에 잡힌다) |

- **닫히는 흐름:** 막 누름 또는 `useSheetDismiss()` → 상태 `closing = true` → `.sheet`·`.sheet-backdrop`에 `is-closing` 클래스 → 시트는 아래로(`translateY(100%)`), 막은 투명으로, `--motion-fast` `--ease-leave` → 시트의 `animationend`에서 `onClose()`. 안전장치: `animationend`가 안 오면(움직임 줄이기, 탭이 숨겨짐 — DEV-RECORD 제약 2) `--motion-medium`보다 조금 긴 시간 뒤 `setTimeout`으로 `onClose()`. 두 길 가운데 먼저 온 쪽 한 번만 부른다. 움직임 줄이기면 기다리지 않고 바로 부른다(`matchMedia('(prefers-reduced-motion: reduce)')`).
- **닫히는 중의 입력:** `is-closing` 동안 `.sheet`에 `pointer-events: none`(두 번 누르기·닫히는 중에 저장 버튼 누르기를 막는다).
- **움직이지 않는 닫힘:** 시트 안의 "저장·완료·종료" 같은 동작 버튼이 부모 상태를 바꿔 시트가 사라지는 길은 그대로 둔다(바로 사라진다). 동작의 결과가 화면에 바로 보이는 것이 내려가는 움직임보다 중요하고, 그 길은 시트마다 다르다. 바뀌는 것은 막 누름과 "닫기·취소"뿐이다.
- 14개 파일은 껍데기 세 줄을 `<SheetFrame label="…" onClose={onClose}>`로 바꾸고, 안에서 `onClose`를 **그대로 부르는 버튼**(`onClick={onClose}`, `onClick={() => onClose()}`)은 `const dismiss = useSheetDismiss()`의 `dismiss`로 바꾼다. 그 밖의 줄은 바꾸지 않는다.
- Escape 키·뒤로 가기 처리는 지금 없다. 더하지 않는다.

### 검증

`src/lib/v119.test.ts` (describe `QQ3`)

- 스캔: `src/components/*Sheet.tsx` 가운데 Astryx를 쓰지 않는 14개가 `SheetFrame`을 import하고, `sheet-backdrop` 글자가 그 파일들에 0건이다. `sheet-backdrop`·`className="sheet"`·`sheet-grip`이 나오는 `.tsx`는 `SheetFrame.tsx` 하나뿐이다.
- 스캔: 14개 파일에 `onClick={onClose}`·`onClick={() => onClose()}`가 0건(닫기 버튼은 `dismiss`를 부른다).
- 스캔: `SheetFrame.tsx`가 `../ax`·`@astryxdesign`을 import하지 않는다.
- 순수 부분: 닫힘을 한 번만 부르는 장치를 `src/lib/once.ts`의 `once(fn)`(첫 호출만 통과)로 빼서 테스트한다 — 두 번 불러도 `fn`이 한 번, 다른 인자로 불러도 한 번.
- `v118.test.ts` PP2의 스캔 "`sheet-backdrop`을 쓰는 파일 14개가 `className="sheet"`를 가진다"는 **이 작업으로 깨진다**(이제 그 파일은 `SheetFrame.tsx` 하나다). (`expect(files.length).toBe(14)`가 0으로 실패한다). 기존 테스트를 고치지 않는 관례의 예외로, 그 `it` 하나를 지운다(`it.skip`으로 남기지 않는다). 같은 사실("시트 껍데기가 갈라지지 않는다")은 위 첫 스캔이 더 강하게 지킨다. 지운 자리에 "v1.19 QQ3 스캔으로 옮김 — `v119.test.ts`" 주석 한 줄을 남기고, 커밋 메시지와 DEV-RECORD에 같은 말을 적는다. 같은 파일의 나머지 둘(PP1 스캔, `ax/index.tsx`의 `BottomSheet` 스캔)은 고치지 않는다.

`node scripts/ui-check.mjs after --check` — 시트 장면에서 기존 검사 전부 통과. 더해서 흐름 둘(`--check`일 때 시트 장면 뒤에 돈다, 표에 `흐름` 줄):

| 흐름 | 기준 |
|---|---|
| 막 눌러 닫기 | `sheet-finish`에서 시트 밖 위쪽을 누른 직후 `.sheet.is-closing`이 있고, `--motion-medium` 안에 `.sheet-backdrop`이 사라진다. 사라진 뒤 `session`의 `유리 켜짐`(아래 띠)이 다시 통과한다 |
| 움직임 줄이기에서 닫기 | 같은 일을 `reducedMotion: 'reduce'`에서 하면 다음 프레임에 사라진다 |

- 경계: 닫히는 중에 막을 한 번 더 누른다 → `onClose`가 한 번(위 `once` 테스트 + 흐름에서 `sheet-finish`를 두 번 눌러 세션 화면이 한 번만 바뀌는지) · 시트 안 입력칸에 키보드가 올라온 채 막을 누른다(`sheet-food`) · 시트 위에 시트가 없는지(legacy 시트끼리 겹치는 곳이 있는지 구현자가 `grep`으로 확인해 DEV-RECORD에 적는다. 있으면 그 경우를 흐름에 더한다).

### 범위 제외

- legacy 시트를 Astryx `Sheet`로 옮기기: "Astryx 적용 현황" 끝, "사람이 정할 것" 2.
- 끌어내려 닫기: QQ2 범위 제외와 같다.
- 동작 버튼 뒤의 닫히는 움직임: 위 "움직이지 않는 닫힘".

### README 반영

없음 (QQ2 항목이 시트의 움직임까지 적는다).

---

## QQ4. 여백 토큰 한 벌

### 진단

"확인한 것" 3. 같은 역할에 다른 값이 섞인 것이 "여백이 균일하지 않다"의 코드 쪽 원인이다. 값이 파일마다 인라인으로 흩어져 있어 한 곳을 고쳐 맞출 수 없다.

### 설계

**간격 단위:** Astryx `--spacing-*`의 단계(4px 간격, 반 단계 2·6 포함). 새 값은 이 단계에서만 고른다.

**새 파일 `src/styles/space.css`** (`index.css`에서 `motion.css` 다음, `layer(legacy)`)

| 토큰 (역할) | 쓰는 곳 | 지금 섞여 있는 값 |
|---|---|---|
| `--space-inline` | 아이콘·배지와 글자 사이, 줄 안의 옆 간격 | `marginLeft` 4·6·8 |
| `--space-row` | 카드·시트 안의 줄과 줄 사이 | `marginTop` 8·10, `height: 8` 빈 칸 |
| `--space-group` | 카드·시트 안의 묶음과 묶음 사이, 버튼 줄 위 | `marginTop` 12·14·16 |
| `--space-card` | 카드와 카드 사이 | `.card` `margin-bottom` 12 |
| `--space-section` | 화면 안의 섹션 제목 위 | `.screen-sub` 아래 20, 인라인 20 |
| `--inset-screen` | 화면 좌우(탭 화면·세션·요약·루틴 편집) | 16 (`.screen`·`.ax-screen`) |
| `--inset-card` | 카드 안쪽, 시트 안쪽 좌우 | 16 (`.card`·`.sheet`) |

- 값은 구현자가 Astryx 단계에서 고른다. 조건 둘: (1) `--inset-screen`은 `.ax-screen`의 좌우 여백과 같은 값이다(두 체계가 같은 앱으로 보이게 — `ax.css:185`도 이 토큰의 값과 같게 둔다. `ax.css`는 Astryx 화면에서만 읽히지만 `space.css`는 어디서나 읽히므로 `ax.css`가 `var(--inset-screen)`을 쓴다) (2) `--space-row` < `--space-group` ≤ `--space-card` < `--space-section`.
- 토큰이 더 필요하면(역할이 표에 없으면) 이 표에 한 줄 더하고 DEV-RECORD에 이유를 적는다. 역할 이름 없이 단계 숫자만 가진 토큰(`--space-2` 같은)은 만들지 않는다 — 같은 역할에 다른 값이 생기는 길이 다시 열린다.

**인라인 여백 → 클래스**

| 지금 | 바꾼 뒤 |
|---|---|
| `style={{ marginTop: N }}` (107) · `marginBottom` (9) | 역할에 맞는 유틸 클래스 `.mt-row`·`.mt-group`·`.mt-section`·`.mb-row`·`.mb-group` (`space.css`) |
| `<div style={{ height: 8 }} />` (24) · `height: 12` (1) | 빈 칸을 지우고, 형제의 위 여백 클래스로 (`.mt-row`·`.mt-group`) |
| `marginLeft` (26) | `.ml-inline`. `marginLeft: 0`(5)은 원래 값을 되돌리는 것이므로 그 요소의 CSS를 고쳐 인라인을 없앤다 |
| `marginTop: -4` (2) | 앞 요소의 아래 여백을 줄이는 것이다. 그 요소의 클래스에서 고친다(음수 여백을 남기지 않는다) |
| 여백 + 다른 속성 섞인 인라인(`{ marginTop: 8, color: … }` 등) | 여백만 클래스로 빼고 나머지 속성은 그대로 둔다(이번 범위는 여백이다) |
| `padding: 'N N Npx Npx'` (1) · `paddingBottom` (2) | 그 요소의 CSS 규칙으로 |

- 역할 배정은 구현자가 한다. **기준: 지금 값이 아니라 무엇과 무엇 사이인가.** 예: 같은 카드 안의 둘째 줄은 지금 8이든 10이든 `--space-row`다. 판단이 갈리는 곳(10과 12가 같은 화면에서 일부러 다르게 쓰인 듯한 곳)은 DEV-RECORD에 파일:줄과 고른 역할을 적는다.
- `className`을 이미 가진 요소는 낱말을 더한다(조건식이면 템플릿 문자열로).

**`global.css`의 여백 값** — `margin*`·`padding*`·`gap`(`row-gap`·`column-gap`) 선언:

- 화면·카드·시트의 틀(`.screen`·`.card`·`.card-label`·`.sheet`·`.screen-title`·`.screen-sub`·`.row` 사이)은 위 역할 토큰으로.
- 그 밖(버튼 안쪽, 칩 안쪽, 작은 부품)은 Astryx 단계 값으로 숫자를 그대로 둘 수 있다. 단계 밖 값(`3px`·`5px`·`9px`·`10px`·`14px`·`18px` 등)은 가까운 단계로 옮긴다. 버튼 안쪽 여백을 바꿔 버튼 높이가 44px 아래로 내려가면 안 된다(`button { min-height: 44px }`가 지킨다 — 이 규칙은 건드리지 않는다).
- `safe-area`가 들어간 `calc()`는 `env()` 항은 그대로, 더하는 고정 값만 토큰/단계로.

### 검증

`src/lib/v119.test.ts` (describe `QQ4`)

- 스캔: `src/**/*.tsx`(테스트 제외)의 `style={{ … }}` 안에 `margin`·`marginTop`·`marginBottom`·`marginLeft`·`marginRight`·`padding*`·`gap`·`rowGap`·`columnGap` 키가 0건. 빈 칸 `<div style={{ height: N }} />`(자식 없는 `div`에 `height`만) 0건. 예외 목록은 비워 둔다(필요하면 구현자가 파일:줄과 이유로 더하고 리뷰어가 본다).
- 스캔: `space.css`가 `index.css`에 `layer(legacy)`로 import된다(글자 확인).

`ui-check.mjs` 정적 검사 (QQ4가 더한다)

- `global.css`의 여백 선언 값에 쓰인 `px` 숫자가 전부 Astryx 단계(0·2·4·6·8·12·16·20·24·28·32·36·40·44·48)에 든다. `1px`(선 두께와 붙은 여백 보정)는 그 줄의 이유를 주석으로 둔 경우만.
- `.screen`·`.ax-screen`·`.card`·`.sheet`의 좌우 여백 선언이 `var(--inset-`를 쓴다.
- `space.css`의 역할 토큰 값 순서가 위 조건 (2)를 지킨다.

`node scripts/ui-check.mjs after --check` — 전 장면 `여백 격자` 통과. 더해서 장면 사이 비교 하나(`--check`의 맨 끝, 표의 `여백 한 벌` 줄):

| 비교 | 기준 |
|---|---|
| 화면 좌우 | `home`·`session`·`summary`·`history`·`analyze`·`diet`·`settings`·`editor`에서 첫 카드(없으면 화면 틀의 첫 자식)의 왼쪽 끝 x가 모두 같다 |
| 카드 사이 | 위 탭 화면들에서 이웃한 `.card` 둘의 세로 간격이 모두 같다(카드가 둘 이상인 장면만) |
| 시트 좌우 | `sheet-finish`·`sheet-home`·`sheet-food`·`line-sheet`에서 시트 안 첫 글자 요소의 왼쪽 끝이 시트 왼쪽 끝에서 같은 거리다 |

- 화면 검증: 아래 "화면 검증" 표. 특히 긴 이름(직접 만든 종목 이름 40자), 빈 목록(기록 0건 — 새 프로필), 시트를 끝까지 스크롤.
- 결함 복원: ⑬~⑮.

### 범위 제외

- 여백 아닌 인라인 스타일(`color`·`whiteSpace`·`fontSize`·`opacity` 등 95곳): 끝 기준 3이 여백이다. 남은 수는 `astryx-inventory.mjs`가 보여 준다.
- 글자 크기·줄 높이 단위 맞추기: 끝 기준 밖. 폰에서 이 PLAN을 본 뒤 정한다.
- Astryx 화면(루틴 편집) 안의 간격: Astryx 부품이 정한다. `ax-screen`의 틀만 맞춘다.

### README 반영

"iOS · PWA"에 한 항목을 더한다:

```
- **여백은 역할 토큰 한 벌이다**
  간격 단위는 Astryx의 4px 단계이고, 화면 좌우·카드 안쪽·줄 사이·묶음 사이·카드 사이·섹션 위 같은
  역할마다 토큰이 하나씩 있습니다(`src/styles/space.css`). 같은 역할은 어느 화면에서나 같은 값입니다.
  `.tsx`에 여백을 인라인으로 적지 않습니다(`v119.test.ts`가 지킵니다). 화면 좌우 여백은 Astryx 화면(`.ax-screen`)과 같습니다.
```

---

## 화면 검증 (화면 검증자 — `agents/SCREEN-CHECKER.md`)

작업마다 `node scripts/ui-check.mjs after --check --only=<장면>`의 표와 스크린샷, 그리고 QQ0 "visual review 목록"을 채운다. `before`가 QQ0에서 커밋돼 있다.

| 작업 | 장면 | 상태 |
|---|---|---|
| QQ1 | `home` `home-resume` `session` `session-rest` `sheet-finish` `sheet-timer` `sheet-home` `sheet-food` `line-sheet` `line-sheet-light` `settings-end` | 세션 화면 300px 스크롤(카드가 상단 바 뒤로), 시트 끝까지 스크롤, 설정 진단의 `유리` 줄(Chromium에서는 `켜짐`) |
| QQ2 | 위 + `summary` `history` `editor` | 버튼을 누른 채 찍은 한 장(`ui-check`가 `--press-shot=<장면>`으로 `mouse.down` 상태를 찍는다 — `home`의 시작 버튼, `history`의 목록 줄, 탭바 버튼 하나), 움직임 줄이기로 찍은 `sheet-finish` |
| QQ3 | `sheet-finish` `sheet-timer` `sheet-home` `sheet-food` | 닫히는 중 한 장(`is-closing`이 붙은 직후) |
| QQ4 | 전 장면, 375 폭에서 `home` `session` `settings` `sheet-finish` 한 번 더 | 긴 종목 이름, 기록 0건(새 프로필), 식단 플랜 없음, 시트 끝까지 스크롤 |

---

## 되돌리기

| 폰에서 본 것 | 방법 |
|---|---|
| 띠가 너무 비쳐 어수선하다 / 글자가 묻힌다 | `glass.css`의 `--glass-bar` 알파를 올린다(검사가 지키는 쪽이라 올리는 것은 언제나 안전하다) |
| 시트 막이 옅어 시트가 떠 보이지 않는다 | `--glass-scrim`을 0.6으로, 그리고 `--glass-sheet` 알파를 `시트 비침` 0.25를 다시 넘는 값으로(구현자의 DEV-RECORD 표가 짝을 적는다). Astryx 바텀 시트의 막 규칙은 지운다 |
| 진단 줄이 `꺼짐 (흐림이 적용되지 않음)` | 리터럴로 바꾼 뒤에도 그렇다면 원인이 `var()`가 아니다. DEV-RECORD에 iOS 버전과 함께 적고 새 이슈 |
| 스크롤 중 버튼이 눌린 채로 남는다 | QQ2 범위 제외의 눌림 추적기를 새 작업으로. 급하면 `motion.css`의 `pill` 무리에서 `transform`만 빼고 덮개만 남긴다 |
| 시트·세션 화면이 올라오는 움직임이 느리다 / 거슬린다 | `motion.css`의 `--motion-medium`만 줄인다. 끄려면 진입 클래스의 `animation`을 지운다 |
| 시트가 닫히는 중에 반응이 없다 | `SheetFrame`의 닫힘 길이를 `--motion-fast`보다 줄이거나, `is-closing`의 `pointer-events: none`을 지운다 |
| 여백이 전보다 넓어/좁아졌다 | `space.css`의 역할 토큰 하나를 고친다(그 역할 전체가 같이 바뀐다) |
| 전부 | QQ4 → QQ3 → QQ2 → QQ1 순서로 `git revert`. 데이터는 건드린 적이 없다 |

데이터 이전은 없다: IndexedDB·백업·설정·localStorage에 새 키가 없다. 진단 줄은 매번 계산한다(파생).

---

## 과거 판정 불변

바뀌지 않는 것: 기록·판정·내보내기·백업 전부. `src/db/`·`src/store/`와 `src/lib/`의 기존 파일을 바꾸지 않는다(새 파일 `glassDiag.ts`·`pressClasses.ts`·`once.ts`와 테스트만 더한다). 골든 테스트(`v113`~`v117`)가 수정 없이 통과한다. `v118.test.ts`는 QQ3이 말한 스캔 하나만 옮긴다.

달라지는 것(판정이 아니라 화면):

| 무엇 | 전 | 후 |
|---|---|---|
| 띠 넷 | 뒤가 22% 지나감 | 40% 이상, 뒤 밝기를 낮춰서. 위쪽 안 가장자리에 밝은 선 |
| 시트 16개 | 뒤가 11% 지나감, 막 검정 0.6(Astryx 다크 0.8) | 25% 이상, 막이 옅다. Astryx 바텀 시트의 막도 같은 농도 |
| 탭바의 지금 탭 알약 | 흰빛 | 글자 대비를 지키는 색(어두운 쪽) |
| 버튼을 누를 때 | 변화 없음 | 작아지거나 덮개가 얹힌다 |
| 시트 열기 | 12px 올라옴 | 화면 아래에서 올라옴 |
| 시트 닫기(막·닫기·취소) | 바로 사라짐 | 내려가며 사라짐 |
| 세션·요약 화면 진입 | 바로 바뀜 | 아래에서 올라옴 |
| 동작 줄이기를 켰을 때 | 변화 없음 | 크기 변화·올라오는 움직임이 꺼진다 |
| 여백 | 같은 역할에 4~20px이 섞임 | 역할마다 한 값. 화면에 따라 몇 px씩 달라진다 |
| 설정 → 진단 | — | `유리` 줄 하나 |

---

## 구현 순서와 검증

**QQ0 → QQ1 → QQ2 → QQ3 → QQ4.** QQ0의 "바꾸기 전"은 다른 작업 뒤에 못 찍는다. QQ1이 막을 `background-color` 토큰으로 바꿔야 QQ2가 막의 움직임을 색으로 바꿀 수 있다. QQ3은 QQ2의 움직임 토큰을 쓴다. QQ4는 시트 14개의 껍데기가 `SheetFrame`으로 모인 뒤에 해야 같은 줄을 두 번 고치지 않는다. 단계마다 배포할 수 있다.
커밋은 **도구 1 + 구현 4 + 기록·버전 1 = 6.** 작업끼리 한 커밋에 섞지 않는다.

관례:
- `npm run build`(`tsc` 직접 호출 금지) · 작업 중에는 `npx vitest run src/lib/v119.test.ts src/lib/v118.test.ts src/lib/glassDiag.test.ts src/lib/polish.test.ts src/lib/uiConsistency.test.ts`만 · 마지막에 `npm test` 한 번 · `node scripts/quality-scan.mjs --ci`
- 커밋 개수는 실행 출력을 복사한다(`git log --oneline main..HEAD`) · 커밋 메시지는 `git commit -F - <<'MSG'`
- **기존 테스트는 고치지 않는다**(QQ3이 말한 `v118` 스캔 하나만 예외 — 이유를 커밋과 DEV-RECORD에). 그 밖에 깨지면 멈추고 보고한다.
- 스크린샷 검사는 하나씩 백그라운드로 돌린다(DEV-RECORD 제약 17). 파일 편집은 Edit 도구로(제약 17·21 — Python은 CRLF를 만든다).
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `glass.css` 띠 흐림 값을 `var(--x)`로 → 정적 검사(`var(` 0건) 실패
  ② `global.css` `.tabbar`에 `backdrop-filter: blur(4px)` → 정적 검사 실패
  ③ `--glass-bar` 알파를 v1.18 값(0.78)으로 → `띠 비침` 실패
  ④ `--glass-scrim`을 0.6으로(시트 알파는 그대로) → `시트 비침` 실패
  ⑤ `--glass-pill`을 v1.18 값(흰빛 0.08)으로 → `home`의 `글자 대비`(알약) 실패
  ⑥ `main.tsx`의 `touchstart` 줄 삭제 → `v119` QQ2 스캔 실패
  ⑦ `motion.css`의 `pill` 무리에서 `.btn` 삭제 → `home`의 `눌림 반응` 실패 + 정적 검사(`PRESS_CLASSES`와 다름) 실패
  ⑧ `motion.css`의 `prefers-reduced-motion` 블록 삭제 → `움직임 줄이기` 실패
  ⑨ 막의 키프레임을 `opacity`로 되돌림 → 정적 검사 실패
  ⑩ 시트 하나를 `SheetFrame` 없이 옛 껍데기로 되돌림 → `v119` QQ3 스캔 실패
  ⑪ 시트 하나의 닫기 버튼을 `onClick={onClose}`로 → `v119` QQ3 스캔 실패
  ⑫ `SheetFrame`의 `once` 감싸기 제거 → `once` 테스트는 통과하므로, 흐름 "두 번 누르기"가 실패하는지 본다(안 잡히면 DEV-RECORD에 "흐름이 못 잡는다"를 적고 `SheetFrame`에 대한 스캔 한 줄을 더한다)
  ⑬ 아무 화면에 `style={{ marginTop: 10 }}` → `v119` QQ4 스캔 실패
  ⑭ `global.css` `.card`의 `padding`을 `14px`로 → 정적 검사(단계 밖) 실패
  ⑮ `.ax-screen`의 좌우 여백을 `20px`로 → `여백 한 벌`(화면 좌우) 실패
- **과거 판정 불변 확인 절**(DEV-RECORD): ① `git diff --stat main..HEAD -- src/db src/store` 출력이 비어 있다(복사) ② `git diff --stat main..HEAD -- src/lib`에 새 파일만(복사) ③ 골든 테스트 수정 없이 통과 ④ 바뀌는 것: "과거 판정 불변" 표.
- 완료 후 `docs/DEV-RECORD-v1.19.md`(맨 위 "이 환경에서 확인된 제약"은 v1.18 목록을 이어받고 새로 확인한 것을 더한다: axe가 이 Chromium에서 유리 위 대비를 어떻게 내는지, `mouse.down`이 Astryx 눌림 추적기를 칠하는지, `reducedMotion` 흉내가 먹는지, `@axe-core/playwright` 고정 버전). "배포 영향" 절에 아래를 남기고 PR 본문 맨 위에도 넣는다:
  - 유리 띠·시트가 전보다 많이 비치고, 시트 뒤 막이 옅어진다. 기록·판정·내보내기·백업은 그대로다.
  - 버튼을 누르면 반응하고, 시트·세션 화면이 아래에서 올라온다. 폰의 "동작 줄이기"를 켜면 움직임이 줄어든다.
  - 여백이 역할마다 한 값이 되어 화면마다 몇 px씩 달라진다.
  - 설정 → 진단에 `유리` 줄이 생긴다. 폰에서 `켜짐`이 아니면 그 문구를 알려 달라.
  - 고칠 자리: 농도 `src/styles/glass.css`, 움직임 `motion.css`, 여백 `space.css`. 비교 스크린샷 `docs/screenshots/v1.19/compare/`.
  - Astryx 적용 현황: `docs/ASTRYX-INVENTORY.md`.
- README: 각 작업의 "README 반영"을 그 작업의 커밋에서 고친다. "Tech Stack"의 Astryx 줄(`지금은 루틴 편집 화면만`)은 그대로다.
- `package.json` **1.19.0**은 기록 커밋에서 올린다. `@axe-core/playwright`는 QQ0 커밋에서 devDependency로.
- PR 본문에 `Closes #44`.
- 실기기 확인(구현자가 못 하면 DEV-RECORD에 "사람 확인 필요") — 홈 화면 앱에서:
  ① 설정 → 진단 `유리` 줄이 `켜짐`이다(아니면 그 문구를 적는다 — 나머지 유리 확인은 의미가 없다)
  ② 홈을 스크롤하면 탭바 뒤로 카드·주황 버튼이 흐리게 지나가는 것이 보인다. 탭 다섯의 글자가 읽힌다
  ③ 세션 화면 스크롤 시 상단 바 뒤로 카드가 비친다. Day 이름·경과 시간·세트 수, 휴식 바의 남은 시간이 팔 뻗은 거리에서 읽힌다
  ④ 버튼(시작·세트 완료·스테퍼 `−`·`+`·칩)을 누르면 바로 반응한다. 목록을 손가락으로 끌어 스크롤할 때 손가락 아래 버튼이 눌린 채로 남지 않는다(남으면 "되돌리기")
  ⑤ 시트가 아래에서 올라오고, 막을 누르거나 `닫기`를 누르면 내려가며 닫힌다. 여닫을 때·시트 안 스크롤이 버벅이지 않는다. 시트 뒤가 흐리게 비친다
  ⑥ 세션 시작·세션 끝(요약)이 아래에서 올라온다. 운동 중에 거슬리지 않는다
  ⑦ `설정 → 손쉬운 사용 → 동작 → 동작 줄이기`를 켜면 버튼이 작아지지 않고 시트·화면이 올라오지 않는다. 휴식 바의 진행은 계속 움직인다
  ⑧ `대비 증가`를 켜면 유리가 전부 불투명해진다(v1.18과 같다)
  ⑨ 홈·기록·설정·식단·세션·루틴 편집을 오가며 화면 좌우 여백, 카드 사이 간격이 같아 보인다
  ⑩ 저전력 모드에서 ③⑤를 한 번 더

리뷰 단위: 작업별 — QQ1(유리 CSS)·QQ2(움직임 CSS + `main.tsx`)·QQ3(시트 14개 `.tsx`)·QQ4(`.tsx` 40여 개 여백)가 서로 다른 파일 묶음을 건드리고, QQ4 하나만으로도 거의 모든 화면이 바뀐다.

---

## 사람이 정할 것

이 PLAN의 구현을 막는 항목은 없다(1은 추천안대로 구현하고, 다른 답이면 "되돌리기" 한 줄로 돌린다). 2~4는 v1.18에서 넘어온 질문으로, **남은 화면을 Astryx로 옮기는 다음 PLAN**을 쓰기 전에 필요하다. 이슈 #44의 "함께 정한다"에 따라 다시 올린다.

| # | 정할 것 | 선택지 | 설계자 추천 |
|---|---|---|---|
| 1 | 시트 뒤 어두운 막을 옅게 한다(legacy 0.6, Astryx 바텀 시트 라이트 0.5·다크 0.8 → 시트가 25% 비치는 농도. 구현자가 고른다). 시트가 떠 있는 동안 화면 전체가 지금보다 밝게 보인다 | (가) 옅게 한다 / (나) 막은 그대로, 시트 자체만 더 옅게(계산상 시트 비침이 0.16~0.2에서 멈춘다 — 끝 기준 1을 못 채울 수 있다) | (가) — 폰에서 본 결과가 "비치지 않는다"였고, 막이 가장 큰 원인이다(PLAN-v1.18이 열어 둔 손잡이) |
| 2 | (v1.18 1) 세션 화면을 Astryx로 옮기면 헬스장 경로(홈 → 세션)가 Astryx 코드(JS gzip 211KB + CSS gzip 48KB, v1.17 기록)를 읽는다. README "헬스장 경로가 Astryx 코드를 읽지 않습니다"를 고쳐도 되나 | 고쳐도 된다 / 안 된다(헬스장 경로는 legacy로 두고 값만 맞춘다 — 이번 PLAN의 방식을 계속) | 고쳐도 된다 — 단 이번 PLAN의 결과(유리·눌림·여백)를 폰에서 보고 "legacy로도 충분하다"면 "안 된다"가 더 싸다. 이번 결과를 본 뒤에 답해도 된다 |
| 3 | (v1.18 2) 세트 카드(`ExerciseCard`)를 과거 세션 수정 화면이 같이 쓴다. 카드를 옮기면 그 화면도 같이 옮겨야 한다 | 같이 옮긴다 / 카드는 다음에 | 같이 옮긴다 — 카드를 두 벌로 두지 않는다 |
| 4 | (v1.18 3) 루틴 편집 화면(Astryx)의 시트 안 `−`·`+`·칩·스위치(보이는 높이 36px)가 엄지로 잘 눌리는가 | 잘 눌린다 / 옆이 눌리거나 안 눌릴 때가 있다 | 사람만 아는 사실이다. "안 눌릴 때가 있다"면 다음 PLAN에서 Astryx 버튼의 보이는 높이를 올려 설계한다 |

화면 문구 (확정, 사람이 고칠 수 있게 원문을 적는다): 설정 → 진단 줄 제목 `유리`, 값 `켜짐` / `꺼짐 (대비 증가)` / `꺼짐 (투명도 줄이기)` / `꺼짐 (이 브라우저는 흐림 미지원)` / `꺼짐 (흐림이 적용되지 않음)`, 보조 줄 `흐림 지원: 표준` / `webkit` / `둘 다` 또는 계산된 흐림 값.

**규칙 문서에 반영을 제안하는 것** (설계자는 `agents/`를 고치지 않는다 — 지휘자가 규칙 정비자에게 넘긴다): `agents/SCREEN-CHECKER.md` 2절 4번에 `node scripts/ui-check.mjs after --check` 한 줄과 "visual review 목록"을 보고에 채우는 것을 더한다.
