# PLAN v1.20 — Astryx 테마 한 벌: 테마 고르기·앱 틀·탭·홈·세션·요약 (RR)

> 작성: Claude Fable 5.2 (설계자), 2026-11-13. 대상 코드: v1.19.0 (`main` `e270af9`).
> 근거: 이슈 #48 (구조 변경). 이슈 #41(닫음)의 남은 끝 기준 1을 이어받는다. 기준 문서는 `docs/DESIGN.md` 9절(2026-11-13 개정, Astryx 우선).
>
> **성격:** 화면만 바꾼다. 저장 구조(Dexie 3, 백업 `SCHEMA_VERSION` 3)·판정·내보내기는 바꾸지 않는다. `src/db/`·`src/store/`와 `src/lib/`의 판정 파일은 고치지 않는다.
> **범위:** (1) 테마 고르기 (2) 앱 틀과 탭 (3) 홈 → 세션 → 요약과 그 화면들이 여는 시트 10개. 식단·기록·분석·설정·온보딩 화면은 Astryx 부품으로 **옮기지 않는다**(다음 기획). 다만 그 화면들의 **색**은 테마를 따르게 잇는다(RR2 — 이유는 그 절).
> **사람이 고를 것 둘**(테마, 유리/표면)은 스크린샷과 함께 끝의 "사람이 정할 것"에 있다. 고르기 전에도 RR0~RR9는 진행할 수 있고, 선택에 따라 달라지는 코드는 RRT·RRM 두 작업에만 있다.
> 화면에 보이는 문구와 접근성 이름(`aria-label`)은 그대로다. 달라지는 것은 "과거 판정 불변"의 표에 있다.

---

## 이슈 끝 기준과 작업

| 끝 기준 (이슈 #48) | 이 PLAN에서 |
|---|---|
| 1. 모든 화면이 `src/ax`의 Astryx 부품과 테마 한 벌로, `global.css`·`legacy` 레이어는 옮긴 만큼 삭제 | 앱 틀·탭·홈·세션·요약·시트 10개까지 (RR1·RR3~RR9). 옮긴 파일이 쓰던 `global.css` 선택자는 그 작업에서 지운다 |
| 2. 라이트/다크가 폰 설정을 따른다 | RR1(테마를 앱 뿌리에) + RR2(안 옮긴 화면의 색을 테마에 잇기) |
| 3. 기록·판정·내보내기 결과와 세트 하나를 적는 탭 수는 그대로 | "과거 판정 불변" + RR7의 탭 수 표 |
| 4. `node scripts/astryx-inventory.mjs --check`의 세 숫자가 작업마다 줄어든다 | 아래 표의 "세 숫자" 칸. 화면 파일을 고치는 작업(RR1·RR3~RR9)마다 줄어든다. **화면 파일을 안 고치는 작업(RR0·RR2·RRT·RRM·RR10)은 "늘지 않는다"만 성립한다** — 숨기지 않고 여기 적는다 |

세 숫자의 시작값(`docs/ASTRYX-INVENTORY.md`, 2026-11-13): Astryx를 안 읽는 화면 파일 **45**, 인라인 스타일 **97**, legacy 클래스 쓰임 **520**.

| ID | 내용 | 화면 변화 | 세 숫자 (안 읽는 파일 / 인라인 / legacy) | 선택에 따라 달라지나 |
|---|---|---|---|---|
| RR0 | 도구·기준선: `before` 스크린샷(라이트·다크)과 배치 기록, 첫 화면 시간 재기, 검사 항목 더하기, 안 쓰는 legacy 선택자 세기 | 없음 | 그대로 | 아니오 |
| RR1 | 테마를 앱 뿌리에. Astryx를 헬스장 경로에서 정적으로 읽기. legacy 규칙의 범위 가두기 | 다크: 문서 배경과 legacy 시트 면의 색만. 요소의 자리·크기는 같아야 한다 | 45→44 / 97 / 520 | 아니오(지금 깔린 Neutral 그대로) |
| RR2 | 안 옮긴 화면의 색을 테마 토큰에 잇기(legacy 색 다리) | 전 legacy 화면의 색, 라이트 모드 | 그대로 | 아니오 |
| RR3 | 앱 틀·아래 탭·재개 줄·업데이트 알림·시작 화면 | 탭바, 재개 줄, 알림, 불러오는 중 | 44→41 / 97→94 / 520→504 | 아니오 |
| RR4 | 홈 | 홈 | 41→38 / 94→72 / 504→447 | 아니오 |
| RR5 | 홈의 시트 2개 + `Sheet`에 닫기 넘겨주기 | Day 선택, 진행 중 세션 처리 | 38→36 / 72→71 / 447→426 | 아니오 |
| RR6 | 세션 화면 틀 + 휴식 바 | 세션 상단 바, 휴식 바 | 36→34 / 71→70 / 426→404 | 아니오 |
| RR7 | 운동 카드 + 스테퍼 | 세션의 카드, 기록 편집의 카드 | 34→32 / 70→66 / 404→363 | 아니오 |
| RR8 | 세션의 시트 8개 | 종료·종목 추가·타이머·대체·보상작용 둘·무게 단위·템포 | 32→24 / 66→55 / 363→288 | 아니오 |
| RR9 | 요약 | 요약 | 24→23 / 55→51 / 288→270 | 아니오 |
| RRT | 테마 확정 (`src/ax/theme.ts` 한 파일) | 전 화면의 색·모서리 | 그대로 | **예 — 사람이 테마를 고른 뒤** |
| RRM | 재질 확정 (띠와 시트: 유리 다시 맞추기 또는 Astryx 표면으로) | 띠 넷, 시트 | 그대로 | **예 — 사람이 재질을 고른 뒤** |
| RR10 | 사본 정리(`motion.css`·`space.css`에서 안 쓰게 된 것), README·DEV-RECORD·버전 | 없음 | 그대로 | 아니오 |

숫자는 인벤토리 표의 파일별 값을 더한 **예상**이다(옮긴 파일은 legacy 클래스 0, 인라인 0). 구현자는 작업 커밋마다 `--check` 출력을 DEV-RECORD에 복사하고 `--write`로 표를 새로 쓴다. 예상보다 덜 줄면 이유를 적는다.

---

## 확인한 것

**1. Astryx 0.7.13 부품 (`node_modules/@astryxdesign/core/dist/<부품>/*.d.ts`로 확인)**

| 부품 | 확인한 사실 | 설계에 미친 것 |
|---|---|---|
| `AppShell`·`MobileNav` | 위 내비·옆 내비·본문 틀이고, 좁은 화면에서는 햄버거 버튼 + 옆에서 나오는 서랍이다. 아래 탭 자리가 없다 | 쓰지 않는다. 탭을 서랍에 넣으면 탭 바꾸기가 1탭 → 2탭이 되고 엄지가 화면 위로 가야 한다 |
| `TabList`·`Tab` | `value`·`onChange`·`layout="fill"`·`size`, `Tab`은 `value`·`label`·`icon`·`selectedIcon`. `role`을 안 주면 `<nav>` + `aria-current` | 아래 탭은 이것으로 짓는다(RR3) |
| `Layout` | `header`·`content`·`footer` 칸, `height="fill"`이면 본문이 틀 안에서 스크롤 | 쓰지 않는다 — 띠 아래로 내용이 지나가지 않아 유리를 고를 수 없게 되고, iOS에서 문서 스크롤(상태바 탭 → 맨 위)을 잃는다. 띠는 `src/ax`의 `Bar`로 짓는다(RR3) |
| `BottomSheet` | `isOpen`·`onOpenChange`·`label`·`purpose('required'\|'form'\|'info')`·`height`. 닫힘이 끝났다는 콜백이 없다 | `Sheet`의 닫기는 타이머로 기다린다(RR5) |
| `Banner` | `status(info\|warning\|error\|success)`·`title`·`description`·`endContent`·`isDismissable`·`collapsible` | 배너의 버튼은 `endContent`에 넣는다("나중에" 글자를 지키려고 `isDismissable`의 × 단추를 쓰지 않는다) |
| `ProgressBar` | `value`·`max`·`label`(필수)·`isLabelHidden`·`variant(accent\|success\|warning\|neutral\|error)` | 주간 볼륨·Phase·디로드·휴식 진행 |
| `Timer` | `startTime`에서 **올려 세기**만(`format: 'elapsed'\|'clock'`) | 휴식(내려 세기)에는 못 쓴다. 경과 시간도 지금 코드(`formatElapsed`)를 그대로 둔다 |
| `Collapsible` | `trigger`·`isOpen`·`onOpenChange`·`chevronPosition` | 운동 카드, 홈의 제안 근거 |
| `Card`·`ClickableCard` | `padding`·`variant(default\|muted\|…)`·`elevation`. `ClickableCard`는 `label`(필수)·`onClick` | 카드 |
| `List`·`ListItem`·`Item` | `label`·`description`·`startContent`·`endContent`·`onClick` | 줄 |
| `Badge` | `variant(neutral\|info\|success\|warning\|error\|색 이름)`·`label` | 칩. "강조 칩"에 맞는 `accent` 단계는 없다 → `info` |
| `Button`·`ToggleButton` | `variant(primary\|secondary\|ghost\|destructive)`·`size(sm\|md\|lg)`·`isIconOnly`+`icon`·`label`(필수). `ToggleButton`은 `isPressed`·`onPressedChange` | 버튼, 켜고 끄기 |
| `SegmentedControl` | `value: string`(필수)·`onChange`·`label` — 늘 하나가 골라져 있다 | "아무것도 안 고름"이 있는 자리(감각 점수)에는 쓰지 않는다 |
| `TextInput`·`NumberInput` | `label`(필수)·`isLabelHidden`·`controlStyle`. `SizeProvider`의 가장 큰 단계는 `lg` | `src/ax`의 `TextField`·`Stepper`를 거친다 |
| 테마 | `defineTheme({ name, extends, tokens, adaptations })`. `extends`로 깔린 테마를 잇고 토큰만 덮을 수 있다. `adaptations`의 규칙은 `when: { pointer: 'coarse' }`일 때 `tokens`를 바꿀 수 있다. 빌드하지 않은 테마는 실행 중에 `<style>`로 들어간다 | 테마는 `src/ax/theme.ts` 한 파일(RR1·RRT) |
| 테마 패키지 | `@astryxdesign/theme-neutral`(깔려 있음) 말고 `stone`·`matcha`·`gothic`·`chocolate`·`butter`·`y2k`가 0.7.13으로 npm에 있다(`npm view`, 2026-11-13) | 후보 |

**2. 시제품으로 잰 것** (스크래치 폴더의 Vite 시제품, Chromium, 터치 흉내 `hasTouch`·`isMobile`. 앱 코드가 아니다)

| 잰 것 | 결과 | 설계에 미친 것 |
|---|---|---|
| `Button`에 `onPointerDown`·`onPointerUp`·`onPointerLeave`를 주고 탭 | 셋 다 불린다 | 스테퍼의 탭 판정(`tapJudge`)을 그대로 둘 수 있다(RR7) |
| `TextInput`에 `inputMode="decimal"`·`onFocus`·`onBlur` | 속성이 입력칸에 붙고 둘 다 불린다 | 스테퍼의 입력칸을 `TextField`로 그릴 수 있다 |
| 터치에서 `Button`(`lg`)의 크기 | 보이는 크기 36×36, 누르는 영역은 중심에서 21px 떨어진 곳까지(위·아래·왼쪽) | Astryx가 터치에서 누르는 영역을 스스로 넓힌다. 앱이 `min-height`를 다시 걸지 않는다 |
| 터치에서 `Tab`의 누르는 영역 | 보이는 높이뿐(위쪽 3px에서 안 눌림) | 탭이 띠 높이 전체로 눌리게 `Bar`가 책임진다(RR3) |
| 아이콘 + 글자 탭 다섯(홈·식단·기록·분석·설정) | `lg`: 375 폭에서 382 > 375로 넘쳐 스크롤 화살표가 생긴다. `md`: 375에 들어간다(360은 넘친다) | 탭은 `size="md"` |
| `matcha` 테마 | 390 폭에서 다섯째 탭과 뱃지 글자가 잘린다 | 후보에서 뺀다 |
| `gothic` 테마 | 라이트로 지정해도 어둡다 | 후보에서 뺀다 |

**3. 번들과 첫 화면** (끝 기준 — DESIGN 9.2 "PLAN이 재어 적는다". `npm run build`, v1.19.0)

| 무엇 | 지금 | 이 PLAN 뒤 |
|---|---|---|
| 헬스장 경로가 읽는 것(홈 → 세션) | `index.js` gzip 183.5KB + `index.css` 6.5KB = **약 190KB** | Astryx 청크(`RoutineEditorScreen` JS gzip 210.3KB + CSS 48.6KB = 약 259KB)가 합쳐진다. **위쪽 한계 약 449KB**(legacy CSS가 줄어드는 만큼 작아진다) |
| 서비스워커 precache | 28개, 2,569.51KiB — Astryx 청크가 **이미 들어 있다** | 총량은 거의 그대로다. 오프라인에서 여는 데 새로 필요한 것이 없다 |
| 첫 화면까지(Chromium, CPU 4배 느리게, localhost, 5번의 중앙값) | 캐시 없이 **923ms**, 서비스워커 캐시로 다시 열기 **271ms** | RR1에서 같은 방법으로 다시 잰다. 기준은 RR1 "검증" |

README의 "헬스장 경로가 Astryx 코드를 읽지 않는다"를 뒤집는 대가가 이것이다. 헬스장에서는 두 번째 줄(다시 열기)이 실제 경험이다.

**4. 테마를 앱 뿌리에 올리면 번지는 것** (코드로 확인)

| 무엇 | 근거 | 그대로 두면 |
|---|---|---|
| Astryx 리셋 사본 | `src/ax/ax.css:13-160` — 전부 `:where([data-astryx-theme])` 안에 건다. `Theme`은 이 속성을 `<html>`에 단다 | 지금은 루틴 편집이 떠 있을 때만 걸린다. 뿌리에 올리면 **안 옮긴 화면의 `<p>` 여백·제목 크기·테두리**까지 리셋된다 |
| 버튼 높이 끄기 | `src/ax/ax.css:167-171` `[data-astryx-theme] button { min-height: 0 }` (legacy 레이어) | 안 옮긴 화면의 버튼이 전부 44px 최소 높이를 잃는다(`global.css:78`) |
| legacy 눌림 규칙 | `src/styles/motion.css:26-30` — `[class*='astryx-']`로 Astryx 버튼을 이미 뺀다 | 그대로 쓴다 |

RR1이 이 둘을 CSS `@scope`로 가둔다(Safari 17.4부터 — 앱의 조건 iOS 17.5 안이다. Astryx도 `@scope`를 쓴다).

**5. 화면 마크업에 묶인 스캔 테스트** (`src/lib/*.test.ts`가 `.tsx`를 글자로 읽는 것)

옮길 파일을 읽는 테스트 파일: `v18`·`v111`·`v112`·`v113`·`v114`·`v117`·`v119`·`polish`·`uiConsistency`·`timerOwnership`·`dayChoice`·`bannerQueue`·`guideFinish`·`warmupInsert`·`inputProps`·`setRowState`·`useRestTimer`·`audioIndependence`·`audioRecovery`·`tempo`·`soundCancel`.
대부분은 **로직 줄**을 본다(`queue.slice(0, bannersOpen ? queue.length : 1)`, `card.resuming ? onEnterSession() : start(displayed)`, `timer.start(sec, label)`, `commitPendingEdits()` 뒤 `addSet`). 마크업 글자에 묶인 것은 확인된 것만 아래다.

| 테스트 | 묶인 글자 | 처리 |
|---|---|---|
| `v117.test.ts:93` | `main.tsx`·`App.tsx`가 Astryx를 정적으로 읽지 않는다 | **뜻이 뒤집힌다**(README 결정 2). RR1이 "App이 `./ax`의 `AppRoot`를 정적으로 읽는다"로 바꾼다 |
| `v117.test.ts:105`·`:147` | `AxRoot`가 `mode="system"`, 루틴 편집의 맨 바깥이 `AxRoot`이고 App은 `lazy`로만 | RR1: `mode="system"` 검사는 `AppRoot`로 옮긴다. 루틴 편집은 계속 `AxRoot`(화면 틀)로 감싸고 `lazy`다 — 그 줄은 그대로 통과해야 한다 |
| `v119.test.ts:60`·`:76` | legacy 시트 14개가 `SheetFrame`을 쓴다 | RR5·RR8: 목록을 남은 legacy 시트(식단 4개)로 줄이고, 옮긴 10개는 "`../ax`의 `Sheet`를 쓰고 `SheetFrame`을 안 읽는다"로 옮긴다 |
| `v119.test.ts:90` | `SheetFrame.tsx`가 `../ax`를 안 읽는다(헬스장 경로) | 그대로 통과(SheetFrame은 안 고친다). 괄호 설명만 낡는다 — 고치지 않는다 |
| `polish.test.ts:39-48` | `TabBar.tsx`: `Icon: IconFlame`, `<Icon />`, 라벨 다섯 | RR3: `TABS` 배열과 `<Icon />`을 그대로 둬서 통과시킨다 |
| `polish.test.ts:90-91` | `ExerciseCard.tsx`: `setupNote ? 'setup-value' : 'setup-empty'` | RR7: 뜻(빈 값과 채운 값을 글자 색으로 구분)을 새 마크업으로 옮긴다 |
| `setRowState.test.ts:77` | `className={setRowClass(set)}` | RR7: 그대로 둬서 통과(세트 행은 직접 짓는다) |
| `useRestTimer.test.ts:190` | `<button className="rest-dismiss"` | RR6: 새 클래스 이름으로 옮긴다. `aria-label="휴식 완료 — 닫기"`는 그대로 |
| `dayChoice.test.ts:205-206` | `aria-pressed={applyReturn}` … `setApplyReturn(true)` | RR4: `ToggleButton` 두 개의 `isPressed={applyReturn}`·`isPressed={!applyReturn}`로 옮긴다 |
| `uiConsistency.test.ts:96` | `CompensationSheet.tsx`: 비우기 버튼의 조건식 뒤 `<button` | RR8: `<Button`으로 옮긴다(조건식이 저장된 값 `current`만 본다는 뜻은 그대로). X6(`btn-danger`)은 식단·기록 편집 파일만 보므로 이번에 안 걸린다 |
| `v18.test.ts:719-726` | `NumberStepper.tsx`: `onPointerUp={(e) => release(1, e)}`, `isTap(started` | RR7: 로직을 안 바꿔서 통과 |
| `v112.test.ts:815` | `FinishSheet.tsx`: `{adjustLine && <p className="row-sub">{adjustLine}</p>}` | RR8: `Text`로 옮긴다 |

규칙은 "구현 순서와 검증"의 "스캔 테스트" 항목에 있다.

---

## 테마 후보 (사람이 고른다)

스크린샷은 시제품(스크래치 폴더, 앱 코드 아님)이 홈·세션 화면을 Astryx 부품으로 다시 그린 것이다. iPhone 14 흉내(390 폭), Chromium, 예시 데이터. **실제 구현과 배치가 조금 다를 수 있고, 색·모서리·버튼 모양을 비교하는 용도다.** 글꼴은 셋 다 시스템 글꼴이다(테마가 이름 붙인 글꼴은 따로 받아야 하고, 오프라인 앱이라 받지 않는다 — 지금 루틴 편집 화면과 같다).

한눈에 보기: `docs/screenshots/v1.20/candidates/theme-home.png`(홈, 위 줄 다크·아래 줄 라이트), `docs/screenshots/v1.20/candidates/theme-session.png`(세션).

| 후보 | 무엇 | 낱장 (`docs/screenshots/v1.20/candidates/theme/`) | 새 의존성 | 특징 |
|---|---|---|---|---|
| **A. Neutral** | 지금 루틴 편집 화면이 쓰는 테마 그대로. 따뜻한 회색, 강조색이 검정/흰색 | `neutral-home-dark.png` `neutral-home-light.png` `neutral-session-dark.png` `neutral-session-light.png` | 없음 | 가장 조용하다. 주 버튼(시작·건너뛰기)이 흰색/검정이라 색으로는 안 튄다 |
| **B. Stone** | 차가운 회청색, 알약 모양 버튼 | `stone-home-dark.png` `stone-home-light.png` `stone-session-dark.png` `stone-session-light.png` | `@astryxdesign/theme-stone@0.7.13` 하나 | 버튼·입력칸이 둥글다. 강조색은 A처럼 무채색 |
| **C. Neutral + 주황 강조** (가칭 `ember`) | A를 `defineTheme`의 `extends`로 잇고 강조색 토큰 다섯 개만 테마 팔레트의 주황 단계로 덮는다 | `ember-home-dark.png` `ember-home-light.png` `ember-session-dark.png` `ember-session-light.png` | 없음 | 주 버튼·진행 막대·오늘 표시·제안 이유가 주황이다. 지금 앱의 인상(불꽃)이 남는다 |

C의 주황은 앱 CSS가 아니라 **테마 안**에 있다(DESIGN 9.1의 2 "Astryx 테마 도구로 한 벌을 만든다"). 값은 hex를 적지 않고 `@astryxdesign/theme-neutral`이 내보내는 `neutralPalettes.orange`의 단계 이름으로 고른다(시제품이 쓴 것: 강조 라이트 45·다크 70, 강조 글자 라이트 40·다크 75, 옅은 강조 라이트 90·다크 25, 강조 위 글자 라이트 흰색·다크 주황 5).

참고(후보 밖): 일곱 테마를 한 장에 — `docs/screenshots/v1.20/candidates/all-themes-home-dark.png`, `all-themes-session-light.png`. `matcha`·`gothic`은 "확인한 것" 2의 이유로, `chocolate`·`butter`는 색이 강해 읽기(뱃지·세트 행)가 흐려져 뺐다. 이 가운데서 고르고 싶으면 그렇게 답하면 된다(RRT는 어느 쪽이든 한 파일이다).

## 재질 비교: 유리 / Astryx 표면 (사람이 고른다)

같은 화면을 띠(탭바·세션 상단 바·휴식 바)와 시트만 바꿔 찍었다. 테마는 후보 C다. 유리가 보이도록 화면을 조금 스크롤한 상태다.

한눈에 보기: `docs/screenshots/v1.20/candidates/material-dark.png`, `docs/screenshots/v1.20/candidates/material-light.png` (왼쪽부터 홈 유리·표면, 세션 유리·표면, 종료 시트 유리·표면).
낱장: `docs/screenshots/v1.20/candidates/material/ember-{home,session,sheet}-{dark,light}-{glass,surface}.png` (12장).

| | 유리 (지금) | Astryx 표면 |
|---|---|---|
| 모습 | 띠와 시트 뒤로 내용이 흐리게 비친다 | 띠와 시트가 불투명한 테마 표면색 + 선 |
| 코드 | `glass.css`(토큰·흐림·끄기 규칙) + `ax.css`의 시트 유리 + 검사 `scripts/lib/glass-check.mjs` + 설정 → 진단의 "유리" 줄을 계속 가진다. 라이트 모드 값도 새로 잡아야 한다 | 위 전부 지운다. Astryx가 정한 표면·막을 그대로 쓴다 |
| 읽힘 | 뒤에 무엇이 오든 글자 4.5:1을 지키도록 값을 맞추고 검사로 지킨다(v1.19가 한 일을 라이트에서도) | 테마가 보장한다 |
| iOS | v1.19에서 "선언은 됐는데 흐림이 안 그려지는" 경우를 실기기에서만 알 수 있었다. 저전력 모드에서도 다시 봐야 한다 | 해당 없음 |
| 주의 | 스크린샷은 Chromium이다. iOS의 흐림은 더 진하거나 다르게 보인다 | — |

---

## 뒤집는 README 결정 (사람이 볼 목록)

전부 `docs/DESIGN.md` 9.2절 표가 승인한 것이다. 문장은 각 작업의 "README 반영"에 있다.

| # | README의 지금 결정 (`README.md` 줄) | 바뀌는 방향 | 작업 |
|---|---|---|---|
| 1 | Astryx는 화면 단위로 들이고, 안 바꾼 화면과 `legacy` CSS 레이어로 나눈다 (242-248) | 테마가 앱 뿌리에 한 번 걸리고, 옮긴 화면은 legacy 규칙의 범위 밖이다. `global.css`는 옮긴 만큼 지운다 | RR1, RR3~RR9 |
| 2 | Astryx 화면은 지연 로딩해서 헬스장 경로가 Astryx 코드를 읽지 않는다 (249) | 헬스장 경로도 Astryx. 대가는 "확인한 것" 3 | RR1 |
| 3 | 나머지 화면은 아직 다크 고정 (534, Limitations) | 전 화면이 폰의 라이트/다크를 따른다(안 옮긴 화면은 색만) | RR1, RR2 |
| 4 | 눌림·움직임·여백 값을 Astryx에서 옮겨 적은 사본(`motion.css`·`space.css`) (262-275) | 옮긴 화면은 사본을 안 쓴다. 사본은 안 옮긴 화면이 쓰는 만큼만 남는다(이번에 다 없애지 못한다 — RR10 범위 제외) | RR10 |
| 5 | 유리는 떠 있는 층에만, 재료는 `glass.css` 토큰 (250-261) | **사람의 선택에 따른다.** 유리면 테마 색 위에서 다시 맞추고, 표면이면 절 전체를 지운다 | RRM |

뒤집지 **않는** 것: 휴식 타이머의 종료 시각 저장·단일 소유(App), 서비스워커 수동 업데이트, AudioContext 미리 열기, recharts 지연 로딩, 스테퍼의 "뗄 때 1스텝", 입력 즉시 저장, 자동완성 억제 한 곳(`NO_AUTOFILL`).

---

## RR0. 도구와 기준선

### 진단

- `scripts/ui-check.mjs`는 다크만 찍고(루틴 편집만 라이트), 시작 버튼을 `.btn-start` 클래스로 고른다(`ui-check.mjs` 머리말 "예외: 시작 버튼 `.btn-start`, 재개 스트립, 휴식 바"). 옮기면 그 클래스가 없어진다.
- 첫 화면이 뜨는 시간을 재는 장치가 없다. DESIGN 9.2가 재라고 했다.
- "옮긴 만큼 지운다"를 확인할 장치가 없다. `global.css`에 쓰는 곳이 없어진 선택자가 남아도 아무것도 실패하지 않는다.

### 설계

| 무엇 | 어떻게 |
|---|---|
| `scripts/ui-check.mjs` | ① 전 장면을 **다크와 라이트 두 벌**로 찍는다(`<장면>.png`, `<장면>-light.png`). 지금 다크 고정인 화면의 라이트는 다크와 같게 나오는 것이 정상이다(RR1까지). ② 요소를 클래스로 고르는 세 곳(시작 버튼·재개 줄·휴식 바)을 글자·역할로 바꾼다: 시작 버튼은 `getByRole('button', { name: /시작$|이어서 하기/ })`, 재개 줄은 `name: /진행 중/`, 휴식 바는 `getByRole('timer')`. ③ 새 장면: `home-375`·`session-375`(375 폭), `session-open-b`(B그룹 카드를 펼친 상태 — 감각 점수가 보인다), `history-detail-edit`(기록 편집에서 카드를 펼친 상태), `boot-loading`은 찍지 않는다(순간이라 못 잡는다) |
| 새 검사 (`scripts/lib/ui-check-lib.mjs`) | `inPageTabHit`: 아래 탭마다 글자 중심에서 위·아래로 띠의 끝 2px 안쪽 지점에 `elementFromPoint`를 쏴서 그 탭(또는 그 자손)이 나오는가. `inPageSetNumber`: 세트 행 입력칸의 계산된 글자 크기가 같은 화면 본문(`ghost` 글자)보다 큰가. `inPageLastVisible`: 화면을 끝까지 스크롤했을 때 본문의 마지막 요소 아래 끝이 아래 띠의 위 끝보다 위인가. 셋 다 `before`에서는 "기록만"(실패로 세지 않음), RR3·RR7부터 `after --check`에서 판정 |
| 새 파일 `scripts/first-screen.mjs` | 사용: `node scripts/first-screen.mjs`. `dist`를 `vite preview`로 띄우고, iPhone 14 흉내 + CDP `Emulation.setCPUThrottlingRate` 4로 ① 캐시 없는 첫 방문 ② 서비스워커가 precache를 끝낸 뒤 `reload` — 각각 `#root`의 글자가 20자를 넘고 "불러오는 중"이 없을 때까지의 ms를 5번 재서 중앙값을 찍는다. 판정하지 않는다(종료 코드 0). `npm run build` 뒤에 돌린다 |
| `scripts/astryx-inventory.mjs` — 넷째 숫자 | `global.css`의 클래스 선택자 가운데 `src/**/*.{ts,tsx}`(테스트 제외) 어디에도 **낱말로** 안 나오는 이름의 수("안 쓰는 legacy 선택자")를 센다(주석 제거 뒤). `--write`가 합계 줄 끝에 `, 안 쓰는 legacy 선택자 N개.`를 더하고, `--check`가 이 수도 **늘면 실패**로 본다(지금의 세 숫자와 같은 방식 — 화면을 옮기고 CSS를 안 지우면 걸린다). `--unused`는 그 이름 목록을 찍는다. 템플릿 문자열로 조립하는 이름(`banner-${…}` 같은 것)이 있으면 그 접두사를 스크립트의 허용 목록에 이유와 함께 적는다. RR0에서 `--write`해 기준선을 커밋한다 |
| 배치 기록 (`scripts/lib/ui-check-lib.mjs`의 새 `inPageRects`) | 장면마다 보이는 버튼·입력칸·제목(`h1`~`h3`)·문단·카드의 사각형(x·y·폭·높이, 0.5px로 반올림)을 문서 순서대로 모은다. `before`는 `docs/screenshots/v1.20/before/layout.json`에 남기고, `after --check --same-layout=<장면,…>`은 그 장면들의 사각형이 `before`와 같은지 본다(개수가 다르거나 하나라도 다르면 실패, 처음 다른 요소를 찍는다) |
| `before` 스크린샷 | `node scripts/ui-check.mjs before --ver=v1.20`으로 `docs/screenshots/v1.20/before/`에 찍어 커밋한다. `node scripts/argos-upload.mjs before`(토큰 없으면 "Argos 건너뜀") |
| 새 파일 `src/lib/v120.test.ts` | 이 PLAN의 스캔을 모으는 곳. RR0에서는 아래 "검증" 두 줄만 |

### 검증

- `v120` RR0: `scripts/ui-check.mjs`에 `.btn-start`·`.resume-strip`·`.rest-bar` 글자가 없다.
- `v120` RR0: `scripts/first-screen.mjs`가 `setCPUThrottlingRate`와 `serviceWorker.ready`를 쓴다.
- 사람 눈: `before` 폴더에 장면마다 다크·라이트 두 장이 있다.
- `v120` RR0: `docs/ASTRYX-INVENTORY.md`의 합계 줄에 `안 쓰는 legacy 선택자`가 있고, `astryx-inventory.mjs`의 `--check`가 그 수를 견준다(스크립트 글자 스캔).
- DEV-RECORD: `first-screen.mjs` 출력(바꾸기 전 — 이 PLAN의 "확인한 것" 3과 견줄 수 있게), `--unused` 목록, `layout.json`의 장면 수.

### 범위 제외

- 첫 화면 시간을 CI에 넣지 않는다 — 러너마다 값이 흔들려 판정에 못 쓴다. 사람이 읽는 숫자다.
- Argos를 CI에 넣지 않는다(v1.17 결정 그대로).

### README 반영

없음.

---

## RR1. 테마를 앱 뿌리에

### 진단

- 테마는 루틴 편집 화면 안에만 있다: `src/ax/index.tsx:28-36`의 `AxRoot`가 `Theme` + `SizeProvider` + 화면 틀을 한 몸으로 갖고, `App.tsx:30`이 그 화면을 `lazy`로 읽는다. 다른 화면은 Astryx 부품을 쓸 수 없다.
- `index.html:11`이 `color-scheme`을 `dark`로, `global.css:40`이 `color-scheme: dark`로 고정한다.
- 뿌리에 올리면 번지는 것 둘: "확인한 것" 4.

### 설계

**`src/ax`를 이렇게 나눈다**

| 이름 | 무엇 | 비고 |
|---|---|---|
| `src/ax/theme.ts` (새 파일) | `export const appTheme = defineTheme({ name: 'workout', extends: neutralTheme })`. 지금은 덮는 토큰이 없다 — 지금 깔린 Neutral과 같다 | 테마에 관한 것은 이 파일에만 있다. RRT가 이 파일만 고친다 |
| `AppRoot` | `<Theme theme={appTheme} mode="system"><SizeProvider value="lg">{children}</SizeProvider></Theme>` | `App.tsx`가 **모든 반환 갈래**(시작 실패·불러오는 중·온보딩·세션·요약·루틴 편집·탭)의 맨 바깥에 한 번 감싼다 |
| `AxRoot` | 화면 틀만: `<div className="ax-screen">`. `Theme`·`SizeProvider`를 뺀다 | 루틴 편집 화면은 고치지 않는다(계속 `AxRoot`로 감싼다) |

- `App.tsx`가 `./ax`를 **정적으로** import한다. `RoutineEditorScreen`은 `lazy` 그대로 둔다(그 청크에는 이제 화면 코드만 남는다). `AnalyzeScreen`도 그대로.
- `index.html`의 `<meta name="color-scheme">`를 `light dark`로. `theme-color` 메타와 매니페스트의 색은 그대로 둔다(범위 제외).
- `global.css:40`의 `color-scheme: dark`와 색 토큰은 **그대로** 둔다(RR2가 잇는다).
- 테마가 늘 걸리면서 저절로 달라지는 색이 둘 있다: 문서 배경(`ax.css:174-181`의 "문서 바탕" 규칙 — legacy `--bg` 대신 테마의 본문 배경)과 legacy 시트의 면·테두리(`glass.css:26-30`). 다크에서는 비슷한 어두운 색이다. **라이트에서는 문서 배경만 밝아지고 안 옮긴 화면의 글자는 아직 밝은 색이라 읽히지 않는다 — RR1은 RR2와 떼어 배포하지 않는다**("구현 순서와 검증"의 배포 단위).

**legacy 규칙의 범위를 가둔다** — legacy 쪽을 표시한다(옮긴 화면은 표시가 없으면 자동으로 벗어난다).

| 무엇 | 어떻게 |
|---|---|
| legacy 뿌리 목록 | `.app`, `.screen`, `.session`, `.onboarding`, `.sheet-backdrop`, `.center-note` — 지금 legacy 마크업이 사는 맨 바깥 클래스 전부다. 구현자가 `grep`으로 빠진 뿌리가 없는지 확인하고 DEV-RECORD에 적는다 |
| Astryx 섬 | `.ax-scope` — legacy 화면 **안에** Astryx 부품이 들어갈 때 그 부품의 맨 바깥에 붙이는 클래스(RR7의 운동 카드가 기록 편집 화면 안에 들어간다) |
| `global.css`의 맨 요소 규칙 | `button { … min-height: 44px … }`(71-81줄), `input, textarea, select { … }`(83-88줄)을 `@scope (<legacy 뿌리 목록>) to (.ax-scope) { … }` 안으로 옮긴다. `*`·`html, body`·`#root` 규칙은 그대로 |
| `ax.css`의 버튼 높이 끄기 | `[data-astryx-theme] button { min-height: 0 }` 블록(167-171줄)을 지운다. 위에서 legacy 규칙이 더는 새지 않는다 |
| `ax.css`의 리셋 사본 | 선택자 앞머리 `:where([data-astryx-theme])`를 걷고 블록 전체를 `@scope (html, .ax-scope) to (<legacy 뿌리 목록>) { … }`로 감싼다. 선언은 한 글자도 안 바꾼다. 뜻: legacy 뿌리 밖 전부 + legacy 안의 Astryx 섬에만 리셋이 걸린다 |
| 두 목록 | `global.css`와 `ax.css`의 legacy 뿌리 목록은 글자 그대로 같다(`v120` 스캔이 본다). 화면을 옮겨 뿌리가 없어지면 그 작업에서 두 곳을 같이 줄인다 |

`motion.css`의 눌림 규칙은 고치지 않는다(이미 `[class*='astryx-']`를 뺀다).

### 검증

- `v120` RR1: `App.tsx`가 `./ax`에서 `AppRoot`를 정적으로 import하고, `return` 문마다 `<AppRoot>`가 있다(또는 반환을 한 곳에서 감싼다 — 어느 쪽이든 `<AppRoot` 밖에서 화면을 반환하는 갈래가 0).
- `v120` RR1: `src/ax/index.tsx`에서 `<Theme`은 `AppRoot` 안에 한 번, `mode="system"`이다. `AxRoot`의 본문에 `Theme`·`SizeProvider`가 없다.
- `v120` RR1: `@astryxdesign/…/built`와 `defineTheme`을 import하는 파일은 `src/ax/theme.ts` 하나다.
- `v120` RR1: `global.css`에 `@scope` 밖의 맨 `button {`·`input,` 규칙이 없다. `ax.css`에 `[data-astryx-theme] button`이 없다. 두 파일의 legacy 뿌리 목록이 글자 그대로 같다.
- `v117.test.ts:93`("Astryx를 정적으로 읽지 않고")을 "`main.tsx`는 Astryx를 직접 읽지 않고 `styles/index.css`를 읽는다, `App.tsx`는 `./ax`만 읽는다"로 옮긴다. `:105`는 `AppRoot`를 보게 옮긴다. `:147`은 안 고치고 통과해야 한다.
- **자리와 크기가 안 바뀐다:** `node scripts/ui-check.mjs after --check --ver=v1.20 --same-layout=<전 장면>` — 다크의 전 장면에서 요소의 사각형이 `before/layout.json`과 같다(RR0의 `inPageRects`). 리셋이 새면 문단 여백·제목 크기가, 버튼 규칙이 새면 버튼 높이가 달라져 여기서 걸린다. 색은 위의 둘(문서 배경, legacy 시트의 면)만 달라진다 — 화면 검증자가 `home`·`session`·`settings`·`diet`·`history`·`summary`·`editor`·`sheet-finish`를 `before`와 짝으로 보고 그 밖에 달라진 것이 있으면 적는다.
- `ui-check`의 기존 검사(`줄 안 버튼`의 높이 44, `여백 한 벌`, `눌림 반응`)가 전 장면에서 그대로 통과한다 — 리셋·버튼 규칙이 새지 않았다는 증거다.
- **첫 화면:** `npm run build && node scripts/first-screen.mjs`를 돌려 RR0의 값과 나란히 DEV-RECORD에 적는다. **다시 열기 중앙값이 RR0 값의 3배를 넘거나, 첫 방문 중앙값이 RR0 값의 3배를 넘으면 멈추고 보고한다**(값을 기준에 맞추려고 무언가를 지연 로딩으로 되돌리지 않는다 — 그것은 사람이 정한다).
- **오프라인:** `ui-check`의 흐름 끝에 한 단계: precache가 끝난 뒤 `context.setOffline(true)`로 `reload` → 홈이 뜨고 시작 → 세트 체크가 된다. `npm run build` 출력의 precache 줄(개수·KiB)을 DEV-RECORD에 복사한다.

### 범위 제외

- `theme-color` 메타·매니페스트의 `theme_color`·`background_color`·스플래시 이미지: 다크 고정 그대로. 매니페스트는 색을 하나만 받고 스플래시는 그림이다. 라이트에서 앱을 여는 순간 어두운 스플래시가 잠깐 보인다 — "되돌리기"와 배포 영향에 적는다.
- 상태바: `black-translucent` 그대로. 라이트에서 상태바 자리를 어둡게 받치는 `ax.css:189-201`의 규칙은 RR2가 전 화면으로 넓힌다.
- 글꼴 받기(`fonts.css`): 하지 않는다. 오프라인 앱이고 `v117`이 막고 있다.

### README 반영

- "Astryx는 화면 단위로 들이고, 안 바꾼 화면과 CSS 레이어로 나눈다" 항목의 제목과 본문을 바꾼다: 제목 **"Astryx 테마는 앱 뿌리에 한 번 걸고, 안 옮긴 화면의 CSS는 범위를 가둔다"**. 본문: "테마(`src/ax/theme.ts`)와 기본 크기는 `AppRoot`가 앱 전체에 한 번 겁니다. 화면은 `src/ax/`의 부품만 가져다 쓰고, Astryx 버전은 정확한 값으로 고정합니다(베타). 아직 안 옮긴 화면의 CSS(`global.css`)는 `legacy` 레이어에 있어 Astryx 부품에 지고, 맨 요소 규칙(`button`의 최소 높이 등)은 `@scope`로 legacy 화면 안에만 걸립니다. Astryx의 리셋은 반대로 legacy 화면 밖에만 걸립니다. 화면을 옮기면 그 화면이 쓰던 `global.css` 규칙을 지웁니다."
- 같은 항목의 마지막 문장 "Astryx 화면은 지연 로딩해서 헬스장 경로(홈 → 세션)가 Astryx 코드를 읽지 않습니다."를 지우고 넣는다: "헬스장 경로(홈 → 세션)도 Astryx를 읽습니다. 서비스워커가 전부 precache하므로 오프라인에서 그대로 열리고, 처음 여는 순간 읽는 코드는 늘었습니다(`npm run build` 출력과 `node scripts/first-screen.mjs`)."
- "Tech Stack"의 `(…베타 — 버전 고정. 지금은 루틴 편집 화면만)`을 `(…베타 — 버전 고정. 앱 틀·홈·세션·요약·루틴 편집)`으로(RR9 커밋에서).

---

## RR2. 안 옮긴 화면의 색을 테마에 잇기

### 진단

- RR1 뒤에 폰이 라이트면: 옮긴 화면(RR3부터)은 밝고, 식단·기록·분석·설정은 `global.css:3-41`의 고정 색(`--bg: #0b0b0d` 등)이라 어둡다. 탭을 누를 때마다 밝기가 뒤집힌다. 끝 기준 2("라이트/다크가 폰 설정을 따른다")도 그 화면들에서는 성립하지 않는다.
- 그 화면들을 Astryx 부품으로 옮기는 것은 이번 범위가 아니다. **색만** 잇는 것은 CSS 한 파일의 일이다: `global.css`의 색은 뿌리 토큰 12개와 리터럴 약 50곳(`grep -c "rgba(\|#[0-9a-fA-F]"` = 50)뿐이다.
- 안 하면: 라이트 모드에서 앱이 반반으로 보인다. 다크 고정으로 되돌리는 안(`mode="dark"`)은 끝 기준 2를 버린다.

### 설계

`global.css`의 `:root` 색 토큰을 Astryx 토큰으로 잇는다(값을 지우고 `var()`로 — 테마는 RR1부터 늘 걸려 있다).

| legacy 토큰 | Astryx 토큰 | 비고 |
|---|---|---|
| `--bg` | `--color-background-body` | |
| `--surface` | `--color-background-card` | |
| `--surface-2` | `--color-background-muted` | |
| `--line` | `--color-border` | |
| `--text` | `--color-text-primary` | |
| `--text-dim`·`--text-faint`·`--text-placeholder` | `--color-text-secondary` | 셋이 한 단계가 된다(대비는 테마가 보장) |
| `--accent` | `--color-accent` | 면(버튼)과 글자 양쪽에 쓰인다 — 아래 줄 |
| `--accent-soft` | `--color-accent-muted` | |
| `--ok`·`--warn`·`--danger` | `--color-text-success`·`--color-text-warning`·`--color-text-error` | 대부분 글자·테두리로 쓰인다. 면으로 쓰는 곳은 아래 줄 |

- **면으로 쓰는 곳:** `background: var(--ok|--warn|--danger)`인 규칙은 `--color-success|warning|error`로, 그 위의 글자 리터럴(`#16100a`·`#06210d`)은 `--color-on-accent`·`--color-on-success`·`--color-on-warning`으로 바꾼다. `background: var(--accent)` 위의 글자도 `--color-on-accent`.
- **색 리터럴 약 50곳:** 반투명 색조(`rgba(52, 199, 89, 0.12)` 꼴)는 `color-mix(in srgb, var(--color-success) 12%, transparent)` 꼴로(농도 숫자는 그대로), 밝은 글자 리터럴(`#ffe08a`·`#ffcfa8`)은 `--color-text-warning`·`--color-text-accent`로. `.tsx`의 인라인 색(`rgba(52,199,89,.35)` — `Onboarding.tsx:22`)은 안 옮긴 화면이라 그대로 둔다(반투명이라 양쪽에서 보인다).
- `color-scheme: dark`(40줄)를 지운다(`ax.css`의 `color-scheme: light dark`가 맡는다). `index.html`의 메타는 RR1에서 바꿨다.
- `glass.css`의 띠 토큰: 이 작업에서는 **읽히는 최소한만** 한다 — `html[data-astryx-theme]` 블록(26-30줄)에 `--glass-bar: color-mix(in srgb, var(--color-background-surface) 50%, transparent)`를 더하고, 라이트에서는 띠의 흐림에서 `brightness()`를 뺀다(시트가 이미 그렇게 한다 — `ax.css:226-234`). 값을 다시 잡는 일은 RRM이다(유리를 고르면). 지금의 결정(유리)을 유지하는 것이지 새로 정하는 것이 아니다.
- 상태바 받침: 홈 화면 앱의 상태바 글자는 늘 흰색이라 라이트에서 상태바 자리를 어둡게 받치는 규칙이 `.ax-screen::before`에만 있다(`ax.css:189-201`). 안 옮긴 화면도 라이트가 되므로 이 규칙을 `body::before`로 옮겨 전 화면에 한 번 건다(값은 그대로).
- `src/lib/chartTheme.ts`는 고치지 않는다 — 토큰 이름으로 계산된 값을 읽으므로 따라온다. 폴백 값(다크)도 그대로(`polish.test.ts` BB7).

### 검증

- `v120` RR2: `global.css`의 `:root` 색 토큰 12개의 값이 전부 `var(--color-`로 시작한다. `:root` 밖에 `#`으로 시작하는 색 리터럴과 `rgba(`·`rgb(`가 0건이다(`color-mix(` 안의 `transparent`는 허용). `color-scheme: dark`가 없다.
- `ui-check after --check`: 전 장면 × 다크·라이트에서 axe의 심각 위반 수와 대비 위반 수가 `before`(다크)보다 늘지 않는다. 라이트 장면이 실제로 밝다(문서 배경의 밝기가 다크 장면보다 높다 — `inPageLayout`에 `bodyLuminance` 한 칸을 더해 견준다).
- 화면 검증자: `diet`·`history`·`history-detail`·`analyze`·`settings`·`settings-end`·`sheet-food`를 다크·라이트로 본다 — 글자가 배경에 묻힌 곳, 색조 상자(경고·성공)가 사라진 곳, 달력의 점, 차트의 축·선.
- 과거 판정: 색만 바뀐다. `npm test` 전체 통과(스캔 포함).

### 범위 제외

- 안 옮긴 화면의 모서리·여백·글자 크기·버튼 모양: 그대로(legacy 값). 테마와 다를 수 있다 — 다음 기획에서 화면을 옮기며 없어진다.
- 차트 색을 라이트/다크 전환 순간에 다시 계산하기: `chartTheme()`은 그릴 때 한 번 읽는다. 분석 탭을 다시 열면 맞는다.

### README 반영

- Limitations의 "루틴 편집 화면은 Astryx 부품으로 그리며 폰의 라이트/다크 설정을 따릅니다. 나머지 화면은 아직 다크 고정입니다. Astryx 화면은 iOS 17.5 이상이 필요합니다."를 바꾼다: "앱 전체가 폰의 라이트/다크 설정을 따릅니다. 식단·기록·분석·설정 화면은 아직 Astryx 부품으로 옮기지 않아 색만 테마를 따르고 모양(모서리·여백)은 예전 그대로입니다. 앱을 여는 순간의 스플래시는 늘 어둡습니다. iOS 17.5 이상이 필요합니다."

---

## RR3. 앱 틀과 아래 탭

### 진단

- 탭바는 손으로 짠 `<nav className="tabbar">` + `<button>` 다섯(`src/components/TabBar.tsx:38-51`), 재개 줄은 `<button className="resume-strip">`(`SessionResumeStrip.tsx:41`), 업데이트 알림은 인라인 `position: sticky`가 있는 `.banner`(`UpdatePrompt.tsx:11-14`), 시작 실패·불러오는 중은 `.screen`·`.center-note`(`App.tsx:99-124`)다.
- 안 옮긴 화면은 아래 여백을 탭바의 고정 높이로 잡는다(`global.css:101` `--tabbar-h`, `:336` `.app:has(.resume-strip) .screen`).

### 설계

**새 부품 `Bar` (`src/ax/index.tsx` 안에 둔다 — 새 `.tsx` 파일을 만들지 않는다. 인벤토리가 파일 단위로 세서, Astryx를 import하지 않는 새 파일은 "안 읽는 파일"을 하나 늘린다)** — 화면 위나 아래에 떠 있는 띠. Astryx에 없는 것이라 직접 짓는다(이유: "확인한 것" 1의 `Layout` 줄).

| 속성 | 뜻 |
|---|---|
| `position: 'top' \| 'bottom'` | 고정 자리. 안전 영역(`env(safe-area-inset-*)`)을 스스로 띄운다 |
| `children` | 띠 안의 줄들(위에서 아래로 쌓인다) |
| `role`·`aria-label` | 그대로 넘긴다 |

- 띠의 **재질은 한 곳**이다: `src/ax/parts.css`의 `.ax-bar` 규칙 하나. 이 작업에서는 지금의 결정을 유지한다 — `.ax-bar`를 `glass.css`의 띠 선택자 목록(33-39줄, 한 겹 규칙 49-58줄, 끄기 규칙)에 더하고 배경은 `--glass-bar`다. RRM이 이 규칙만 고친다.
- 띠는 자기 높이를 문서에 알린다: `--ax-bar-top`·`--ax-bar-bottom`(없으면 0). `ResizeObserver`로 `Bar` 안 한 곳에서 `document.documentElement.style.setProperty`. `.ax-screen`의 위·아래 여백과 legacy `.screen`의 아래 여백(`global.css:101`·`:336`)이 이 변수를 쓴다 — `--tabbar-h`·`--resume-strip-h`·`--tabbar-inset`·`--tabbar-bottom`과 `.app:has(.resume-strip)` 규칙은 지운다.

**새 파일 `src/ax/parts.css`** (`src/ax/index.tsx`가 `ax.css` 다음에 import) — 이 앱만의 부품(띠, 요일 점, 세트 행, 템포 무대)의 CSS를 두는 한 곳. `@layer astryx-theme` 안. **색 리터럴 0건, 길이는 Astryx 토큰(`var(--spacing-*)` 등)·`%`·`fr`·`1px`(선)·`0`·`env()`·`100dvh`만.** 클래스 이름은 `ax-`로 시작한다(예외: RR7의 `set-row*`).

**자리마다**

| 자리 | 지금 | Astryx |
|---|---|---|
| 탭 화면의 맨 바깥 | `<div className="app">` | 지운다(Fragment). `.app` 규칙과 legacy 뿌리 목록의 `.app`도 지운다 |
| 아래 띠 | `.tabbar` + `.resume-strip`(따로 고정) | `Bar position="bottom"` 하나. 안에 [재개 줄(있을 때), 탭] 순서 |
| 탭 | `<button aria-current>` ×5 | `TabList value={tab} onChange={…} layout="fill" size="md" aria-label="화면"` + `Tab value label icon={<Icon />}` ×5. `role`은 주지 않는다(`<nav>` + `aria-current` — 지금과 같다). `TABS` 배열(아이콘 컴포넌트 + 라벨)은 그대로. 탭이 띠의 높이 전체로 눌리게 `parts.css`가 탭을 띠 안에서 늘린다 |
| 재개 줄 | `<button className="resume-strip">` | `Item onClick={onResume}` — `label`: `🏋️ {dayName} 진행 중 · {n}분`(이모지는 지금처럼 `aria-hidden` span), `endContent`: 휴식이 돌면 `Badge variant="neutral" label="휴식 m:ss"`, 끝났으면 `Badge variant="success" label="휴식 완료"`, 그리고 `Text`로 `이어서 ›` |
| 업데이트 알림 | `.banner.banner-info.update-prompt` + 인라인 sticky | `Banner status="info" title="새 버전이 준비됐어요" collapsible={false}` + `endContent`: `Button label="업데이트"`, `Button variant="ghost" label="나중에"`. 화면 위에 붙어 있게 하는 것은 `parts.css`의 `.ax-sticky-top`(인라인 스타일 0) |
| 불러오는 중 (`App.tsx`·탭 안 3곳) | `.center-note` | `Center` + `Spinner` + `Text color="secondary"`(문구 그대로: "불러오는 중…", "차트를 불러오는 중…") |
| 시작 실패 | `.screen` + `h1` + `.banner-danger` + `p` | `AxRoot` + `VStack`: `Heading level={1}` "시작 실패", `Banner status="error" title={bootError} collapsible={false}`, `Text color="secondary"`(문구 그대로) |

- `App.tsx`의 로직(시드 → 설정 → 세션 복구 순서, `useRestTimer()` 단일 소유, `openSession && bundle && (`, 오디오·동기화 배선)은 한 줄도 안 바꾼다.
- `TabList`의 `onChange`는 `string`을 준다 → `setTab(v as TabId)`.
- `src/ax/index.tsx`에 더 내보낼 것: `TabList`·`Tab`·`Center`·`Spinner`·`Bar`. 이 뒤의 작업도 필요한 부품을 여기서만 더한다.
- **여백:** 옮긴 화면의 카드 사이 간격과 화면 좌우 여백은 안 옮긴 화면과 같아야 한다(`ui-check`의 `여백 한 벌`이 `home`·`session`·`summary`를 `history`·`diet`·`settings`와 견준다 — `scripts/lib/ui-space.mjs:84-95`). `VStack`의 `gap`은 `space.css`의 역할 토큰과 같은 단계를 고른다(RR3~RR9 공통). 화면 좌우는 `.ax-screen`이 이미 같은 값을 쓴다.

### 검증

- `v120` RR3: `App.tsx`·`TabBar.tsx`·`SessionResumeStrip.tsx`·`UpdatePrompt.tsx`에 `className=`·`style=`·`<button`이 0건이고 `../ax`(또는 `./ax`)만 쓴다.
- `v120` RR3: `src/ax/parts.css`에 색 리터럴(`#…`, `rgb(`, `rgba(`)이 0건이고, `px` 값은 `1px`뿐이다. `.ax-bar`의 배경·흐림을 정하는 규칙이 `parts.css`와 `glass.css`를 합쳐 한 무리다(다른 파일에 `.ax-bar` 재질 선언 없음).
- `v120` RR3: `global.css`에 `.app`·`.tabbar`·`.tab-icon`·`.resume-`·`.update-prompt`·`--tabbar-`·`--resume-strip-h`가 없다.
- `polish.test.ts` BB1(이모지 없음·`Icon: IconFlame`·`<Icon />`·라벨 다섯), `timerOwnership.test.ts` 전부: **안 고치고** 통과.
- `ui-check after --check`: `탭 누름`(RR0의 `inPageTabHit`)이 `home`·`home-375`·`settings`에서 통과. `마지막 요소`(`inPageLastVisible`)가 `home`·`home-resume`·`diet`·`history`·`analyze`·`settings-end`에서 통과(재개 줄이 있을 때와 없을 때).
- 흐름: 탭 다섯을 차례로 한 번씩 눌러 화면 제목이 바뀐다(탭 바꾸기는 1탭). 세션을 최소화하면 재개 줄이 어느 탭에서나 보이고 1탭으로 세션에 돌아간다.
- 375 폭에서 탭 다섯이 한 줄에 다 보이고 스크롤 화살표가 없다(`home-375`: 아래 띠 안의 버튼이 정확히 5개 + 재개 줄).

### 범위 제외

- 탭 구성(다섯 개, 순서)을 바꾸지 않는다 — DESIGN 9.1의 5가 허용하지만, 식단·기록·분석·설정을 사람이 폰에서 본 뒤 다음 기획에서 정한다.
- 온보딩 화면: 옮기지 않는다(이슈 범위 밖, 한 번 보고 마는 화면). RR2로 색은 따른다.
- `Toast`로 알림 바꾸기: 업데이트 알림은 누를 때까지 남아 있어야 해서 `Banner`다.

### README 반영

"핵심 설계 결정"에 바뀌는 줄 없음(유리 항목의 "탭바·재개 스트립…"은 RRM에서). "프로젝트 구조"의 `components/` 설명은 RR9 커밋에서 한 번에.

---

## RR4. 홈

### 진단

`src/screens/HomeScreen.tsx`(legacy 클래스 38, 인라인 20), `WeekDots.tsx`(9, 1), `MuscleVolumeBars.tsx`(10, 1). 배너 여섯 종류가 `.banner` + 인라인 `alignItems`·`background: 'transparent'`·`color: 'var(--warn)'`로 그려진다(`HomeScreen.tsx:272-400`).

### 설계

로직(`dash` 계산, `create`·`start`·`startPending`, `homeCardState`, `bannerQueue`, `BANNER_VIEW`가 큐에서 그림을 고르는 구조, `queue.slice(0, bannersOpen ? queue.length : 1)`)은 한 줄도 안 바꾼다. 바꾸는 것은 JSX가 그리는 부품뿐이다.

| 자리 | 지금 | Astryx |
|---|---|---|
| 화면 틀 | `.screen` | `AxRoot` + `VStack` |
| 저장소 위험 | `.banner-danger` | `Banner status="error" title={문구} collapsible={false}` |
| 제목 | `h1.screen-title` | `Heading level={1}` |
| 루틴 이름·Phase·누적 | `.chip`·`.chip-accent` | `Badge` — 루틴 이름 `info`, 나머지 `neutral` |
| 배너(큐 6종 + 백업 미설정) | `.banner-info/warn/ok` | `Banner collapsible={false}` — `status`: 복귀 `info`, 디로드·백업·보상작용 `warning`, Phase `success`, 증량 `info`. `title`: 지금의 첫 줄, `description`: 지금의 `<small>` 줄, `endContent`: 버튼들(문구 그대로 — `디로드로 시작`, `Phase N로 전환`, `나중에`는 `Button variant="ghost"`) |
| 복귀 적용/안 함 | `.banner-choice` 안 `<button aria-pressed>` 둘 | `ToggleButton label="적용" isPressed={applyReturn} onPressedChange={() => setApplyReturn(true)}`, `ToggleButton label="안 함" isPressed={!applyReturn} onPressedChange={() => setApplyReturn(false)}`를 `HStack`에. 묶음의 `role="group"`·`aria-label="복귀 프로토콜 적용 여부"`는 `HStack`에 그대로 |
| 다른 알림 N개 / 알림 접기 | `.banner-more` | `Button variant="ghost"`(문구 그대로) |
| 식단 한 줄 | `button.diet-chip` | `ClickableCard onClick={onOpenDiet}` + `HStack justify="between"`: `Text color="secondary"`, `Text weight="semibold"`. `label`은 보이는 두 글귀를 이은 문자열(접근성 이름이 지금과 같게) |
| 다음 운동 카드 | `button.card.today-card` | `ClickableCard onClick={() => setPicking(true)}` + `VStack`: `Text type="supporting" color="secondary"` "다음 운동", `Heading level={2}`(Day 이름), `Text color="secondary"`(부제 / 진행 상황), `Text color="accent" weight="semibold"`(`card.reason`), `Text color="secondary"`(공백 알림·오래된 Day 줄), `Text type="supporting" color="secondary"`(종목 목록). `label`은 `다음 운동 ${displayed.name}` |
| 시작 / 변경 | `.btn-primary.btn-start` / `.btn-change` | `HStack`: `Button variant="primary" label={card.cta} width="100%"`(남는 폭을 다 쓴다), `Button variant="secondary" label="변경"` |
| 이번 주 | `WeekDots` `.card` | `Card` + `HStack justify="between"`(`Text` "이번 주", `Text weight="bold"` `n/m회`) + 요일 점 일곱. **점은 직접 짓는다**(Astryx에 요일 점이 없다): `parts.css`의 `.ax-week-dot`(완료·오늘·미래 상태는 `data-state` 속성, 색은 `--color-accent`·`--color-background-muted`·`--color-border`). 🔥와 `×2`는 그대로 |
| 주간 부위별 볼륨 | `.mbar` | `Card` + 부위마다 `HStack`(`Text` 부위, `Badge variant={underFrequency ? 'warning' : 'neutral'} label="{n}x"`, `Text color="secondary" hasTabularNumbers` `n/m`) + `ProgressBar label="{부위} 주간 볼륨" isLabelHidden value={min(performed, target)} max={target} variant={met ? 'success' : 'accent'}`. 뱃지의 `title`(기대/실제 횟수)은 그대로 넘긴다 |
| Phase 0 진행 / 디로드 카운터 | `.card` + `.mbar-track` | `Card` + 머리 `HStack` + `ProgressBar`(Phase: 달성이면 `success`, 디로드: `due`면 `warning`, 아니면 `accent`) + `Text color="secondary"`(문구 그대로) |
| 제안 근거 | `<details className="card">` | `Card` + `Collapsible trigger={<Text>제안 근거 (부족분 점수)</Text>}` + `List`/`ListItem`(`label`: Day 이름 + `Badge variant="warning" label="회복 감쇠"`, `description`: 기여 목록, `endContent`: 점수) + `Text`(★ 설명) |
| 루틴 불러오는 중 | `p.center-note` | `Center` + `Spinner` + `Text`(문구 그대로) |

`global.css`에서 이 세 파일만 쓰던 선택자(`.today-*`, `.start-row`, `.btn-start`, `.btn-change`, `.diet-chip*`, `.banner-choice`, `.banner-more`, `.week-*`, `.mbar*` 가운데 다른 파일이 안 쓰는 것)를 지운다. 기준은 인벤토리의 넷째 숫자(안 쓰는 legacy 선택자)가 늘지 않는 것이다 — `--check`가 본다(RR3~RR9 공통).

### 검증

- `v120` RR4: 세 파일에 `className=`은 `ax-week-dot`뿐이고 `style=`·`<button`·`<details`가 0건, `var(--`가 0건이다.
- `bannerQueue.test.ts`·`dayChoice.test.ts`(205-206줄 제외)·`v113`·`v18`·`v111`·`timerOwnership`의 `HomeScreen.tsx` 스캔: **안 고치고** 통과. `dayChoice.test.ts:205-206`만 `isPressed={applyReturn}`·`isPressed={!applyReturn}` 꼴로 옮긴다(뜻: 두 답이 나란히 있고 고른 쪽이 눌린 상태다).
- 화면 문구가 그대로다: `v120` RR4가 문구 목록(배너 제목 7개, `나중에`, `디로드로 시작`, `변경`, `다음 운동`, `이번 주`, `주간 부위별 볼륨`, `디로드 카운터`, `제안 근거 (부족분 점수)`)이 `HomeScreen.tsx`·`WeekDots.tsx`·`MuscleVolumeBars.tsx`에 있는지 본다.
- 흐름(`ui-check`): 홈에서 시작 1탭으로 세션에 들어간다. 카드 1탭으로 Day 선택 시트가 열린다. 식단 줄 1탭으로 식단 탭.
- 경계: 기록 0건(새 프로필 — 배너 없음, 볼륨 전부 0), 14일 공백(복귀 배너 + 적용/안 함), 배너 3개 이상(첫 번째만 펼침), 진행 중 세션(카드가 "이어서 하기"), 같은 날 두 세션(`×2`), 유산소만 한 날(안내 줄).

### 범위 제외

- 홈의 카드 순서·내용을 바꾸지 않는다(기능은 그대로 — DESIGN 9.1의 5).
- 요일 점을 Astryx `StatusDot`·`Indicator`로: 점 안에 🔥·`×2`·오늘 테두리가 들어가야 해서 맞지 않는다.

### README 반영

없음.

---

## RR5. 홈의 시트 2개 + `Sheet`의 닫기

### 진단

- 옮긴 홈이 여는 시트 둘(`DayPickerSheet.tsx`, `OpenSessionSheet.tsx`)이 `SheetFrame`(손으로 짠 막 + 시트)이다.
- `src/ax/index.tsx:98-113`의 `Sheet`는 `onClose`만 받는다. `SheetFrame`은 자식에게 `dismiss`를 넘겨 "닫기 버튼도 내려가며 닫힌다"를 지킨다(`SheetFrame.tsx:34-43`, v1.19 QQ3).

### 설계

**`Sheet` 확장** (`src/ax/index.tsx`)

- `children`이 `ReactNode | ((dismiss: () => void) => ReactNode)`다(`SheetFrame`과 같은 모양).
- 안에 `open` 상태를 둔다(처음 `true`). `dismiss()`와 `BottomSheet`의 `onOpenChange(false)`(막 누름·끌어내림·Esc)가 같은 길을 지난다: `open`을 `false`로 → `BottomSheet`가 스스로 내려간다 → 끝나면 `onClose`를 **한 번만**(`src/lib/once.ts`) 부른다.
- `BottomSheet`에 닫힘 끝 콜백이 없으므로 타이머로 기다린다. 길이는 구현자가 `BottomSheet`가 실제로 사라지는 시간을 재서 그보다 조금 길게 잡고 DEV-RECORD에 적는다(`SheetFrame`의 `SAFETY_MS`와 같은 방식). `prefers-reduced-motion`이면 기다리지 않는다.
- `BottomSheet`에 `className`·`style`·`xstyle`을 넘기지 않는다(`v118.test.ts:24` — 넘기면 키보드 대응이 꺼진다).

**시트 공통 규칙** (RR5·RR8의 열 개에 같이 쓴다)

| 자리 | 지금 | Astryx |
|---|---|---|
| 틀 | `SheetFrame label onClose` | `Sheet label onClose` — `label` 그대로(`ui-check`가 `getByRole('dialog', { name })`으로 찾는다). `purpose`: 입력칸이 있으면 `'form'`, 고르기·읽기만이면 `'info'` |
| 제목 | `.card-label` | `Heading level={2}` |
| 설명 | `p.row-sub` | `Text color="secondary"` (위험 문구는 `color="error"`) |
| 고르는 줄 | `button.row.sheet-row` | `List` + `ListItem label description endContent onClick` |
| 읽는 줄 | `.row` | `Item label description endContent` |
| 칩 | `.chip`·`.chip-accent`·`.chip-warn` | `Badge` `neutral`·`info`·`warning` |
| 하나 고르기(늘 하나가 골라짐) | `.pill`·`.segment`의 `aria-pressed` | `SegmentedControl` + `SegmentedControlItem` |
| 켜고 끄기, 여러 개 고르기, 안 고를 수 있는 고르기 | `aria-pressed` 버튼, `.check-item` | `ToggleButton isPressed` |
| 글 입력 | `input.field`·`textarea.field` | `TextField`(한 줄), `src/ax`에 더하는 `TextAreaField`(여러 줄 — `TextField`처럼 `AX_NO_AUTOFILL`과 16px 하한을 빠뜨릴 수 없게 감싼다). `label`은 지금의 `aria-label`, `isLabelHidden`, `placeholder` 그대로 |
| 버튼 | `.btn-primary`·`.btn`·`.btn-danger` | `Button` `primary`·`secondary`·`destructive`, 폭은 `width="100%"` |
| 2단계 확인(버리기·삭제) | 버튼 → 문구 + [취소][확인] | 같은 구조 그대로, 부품만 `Button`(`destructive`)과 `Text color="error"` |
| 경고 상자 | `.warn-box` | `Banner status="warning" collapsible={false}` |
| 닫기 | `onClick={dismiss}` | 그대로 `dismiss`(위 렌더 프롭) |

**두 시트:** `DayPickerSheet`(고르는 줄: `label`에 Day 이름 + 제안·선택·오래됨 `Badge`, `description`에 부제, `endContent`에 마지막 수행 며칠 전), `OpenSessionSheet`(읽는 줄 하나 + 버튼 넷 + 버리기 2단계 확인). 로직은 그대로.

### 검증

- `v120` RR5: 두 파일이 `../ax`의 `Sheet`를 쓰고 `SheetFrame`·`className=`·`style=`·`<button`이 0건이다.
- `v119.test.ts` QQ3(60·76줄)의 시트 목록에서 둘을 빼고, `v120` RR5에 "옮긴 시트의 닫기 버튼은 `dismiss`를 부른다(`onClick={onClose}` 0건)"를 둔다.
- `once`를 거친다: 닫기 버튼을 빠르게 두 번 눌러도 `onClose`가 한 번(`ui-check` 흐름 "두 번 누르기" — v1.19의 것을 이 두 시트로도 돌린다).
- `v113`의 `DayPickerSheet.tsx` 스캔: 안 고치고 통과. `v120` RR5: `OpenSessionSheet.tsx`의 버리기 문구 앞 260자 안에 `variant="destructive"`가 있다(`v117`의 OO3 검사와 같은 모양).
- 흐름: Day 선택 → 줄 1탭으로 시트가 닫히고 카드가 바뀐다(세션은 안 만들어진다). 진행 중 세션이 있을 때 다른 Day 시작 → 시트 → `마감하고 시작` / `버리고 시작`(2단계) / `이어서`.
- 움직임 줄이기를 켜면 닫기가 바로 끝난다.

### 범위 제외

- `AlertDialog`로 확인 바꾸기: 하지 않는다. 시트 위에 대화상자를 겹치는 것을 실기기에서 본 적이 없고, 루틴 편집 화면(v1.17)이 같은 인라인 2단계를 쓴다. 탭 수는 같다.
- 식단 시트 4개(`DietPlanSheet`·`DietSlotSheet`·`DietVariantSheet`·`FoodLogSheet`): 식단 화면과 함께 다음 기획. `SheetFrame.tsx`는 그 넷이 쓰므로 남는다.

### README 반영

없음.

---

## RR6. 세션 화면 틀과 휴식 바

### 진단

`SessionScreen.tsx:193-227`의 상단 바는 글자 기호 버튼(`‹`, `⏱`)과 `.session-*` 클래스, `RestTimerBar.tsx:20-48`은 `.rest-*` 클래스 + 인라인 `transform: scaleX()` 진행 막대다.

### 설계

로직(프리필 `useMemo`, `autoOpened`, `lastRecordOf`, 대체·종목 추가·수동 타이머·종료의 처리기, `timer` prop)은 한 줄도 안 바꾼다.

| 자리 | 지금 | Astryx |
|---|---|---|
| 화면 틀 | `.session` | Fragment + `AxRoot`(본문). legacy 뿌리 목록에서 `.session`을 뺀다 |
| 상단 바 | `header.session-header` | `Bar position="top"` + `HStack justify="between"` |
| 최소화 | `button.session-minimize` `‹` | `Button variant="ghost" isIconOnly icon={…} label="세션 최소화"` |
| Day 이름·경과·세트 수 | `.session-day`·`.session-meta` | `VStack`: `Text weight="bold"`, `Text type="supporting" color="secondary" hasTabularNumbers`(`{formatElapsed(elapsed)} · {done}/{planned}세트`) + 모드가 있으면 `Badge variant="warning" label="복귀"\|"디로드"` |
| 타이머 | `button.session-timer-btn` `⏱` | `Button variant="ghost" isIconOnly icon={…} label="휴식 타이머 시작"` |
| 종료 | `button.session-end` | `Button variant="secondary" label="종료"` |
| 카드 목록 | `.session-body` | `VStack` |
| + 종목 추가 | `.btn.btn-sm` | `Button variant="secondary" label="+ 종목 추가"` |
| 세션 없음·Day 없음 문구 | `p.center-note` | `Center` + `Text color="secondary"`(문구 그대로) |
| 휴식 바 | `.rest-bar` | `Bar position="bottom" role="timer" aria-live="off"` |
| 진행 | `.rest-progress` 인라인 `scaleX` | `ProgressBar label="휴식 진행" isLabelHidden value={totalSec − remainingSec} max={totalSec} variant={finished ? 'success' : 'accent'}` |
| 남은 시간 | `.rest-time` | `Heading level={2}`(`mmss(remainingSec)` / `휴식 완료`) — 팔 뻗은 거리에서 읽는 숫자다 |
| 라벨 | `.rest-label` | `Text type="supporting" color="secondary"`(문구 그대로) |
| −30초 / +30초 / 건너뛰기 | `.rest-btn`·`.rest-btn-strong` | `Button variant="secondary"` 둘, `Button variant="primary" label="건너뛰기"`. 보이는 조건(`!timer.finished`)은 그대로 |
| 끝난 바를 탭해서 닫기 | 내용 뒤에 깔린 `<button className="rest-dismiss">` | **같은 구조를 직접 짓는다**(Astryx에 "띠 전체가 버튼"인 부품이 없고, 버튼 안에 버튼을 넣을 수 없다): `<button className="ax-bar-dismiss" aria-label="휴식 완료 — 닫기">`, 모양은 `parts.css` |

기호는 Astryx `Icon`의 테마 아이콘 이름을 쓴다(구현자가 `Icon/defaultIcons.d.ts`에서 뒤로·시계·체크·더하기·빼기·오른쪽 꺾쇠·연필에 맞는 이름을 확인). 테마 아이콘에 없는 것은 `src/components/icons.tsx`에 같은 규격(`Svg` 래퍼, `currentColor`)으로 더한다 — `polish.test.ts` BB1의 규격 검사를 지킨다.

### 검증

- `v120` RR6: `SessionScreen.tsx`·`RestTimerBar.tsx`에 `className=`은 `ax-bar-dismiss`뿐, `style=` 0건, `<button`은 그 닫기 버튼 하나.
- `timerOwnership`·`v18`(700-717줄: 수동 타이머, `addSeconds(-30)`이 `!timer.finished` 안)·`audioIndependence`·`dietBackup`·`v111`의 스캔: 안 고치고 통과. `useRestTimer.test.ts:190`만 `<button className="ax-bar-dismiss"`로 옮긴다(191줄 `aria-label`은 그대로 통과).
- `ui-check`: `session`·`session-rest`·`session-375`에서 `마지막 요소`(맨 아래 카드와 "+ 종목 추가"가 휴식 바에 가리지 않는다), 상단 바 아래로 첫 카드가 가리지 않는다.
- 흐름: 세트 체크 → 휴식 바가 뜨고 남은 시간이 준다 → `+30초` → `건너뛰기`로 사라진다. 끝난 바는 아무 데나 1탭으로 닫힌다. 최소화 → 재개 줄에 남은 휴식이 보인다(같은 타이머).
- 움직임 줄이기에서도 휴식 진행 막대는 움직인다(v1.19의 약속 — `ProgressBar`가 값으로 그리므로 성립하는지 `움직임 줄이기` 검사로 본다. 안 움직이면 멈추고 보고).
- 팔 뻗은 거리: 화면 검증자가 `session-rest`에서 남은 시간·Day 이름·세트 수가 스크린샷을 50%로 줄여도 읽히는지 본다.

### 범위 제외

- 경과 시간을 Astryx `Timer`로: 표시 형식이 `formatElapsed`와 같은지 확인되지 않았고, 타임스탬프에서 다시 계산하는 코드가 이미 있다.
- 세션 화면의 구성(탭바 숨김, 카드 하나씩 펼침)을 바꾸지 않는다.

### README 반영

없음.

---

## RR7. 운동 카드와 스테퍼

### 진단

`ExerciseCard.tsx`(legacy 클래스 39 — 인벤토리에서 가장 많다, 인라인 4)와 `NumberStepper.tsx`. 세트 하나를 적는 자리다. 이 카드는 기록 편집 화면(`SessionDetailScreen.tsx` — legacy, 범위 밖)도 쓴다.

### 설계

**탭 수가 그대로인 이유** — 구조를 안 바꾼다.

| 하는 일 | 지금 | 뒤 |
|---|---|---|
| 프리필 그대로 세트 완료 | ✓ 1탭 | ✓ 1탭 (`ToggleButton`) |
| 무게 한 단계 조절 | `+`/`−` 1탭 (뗄 때, 12px 슬롭 — `tapJudge`) | 같은 처리기, 같은 판정 |
| 직접 입력 | 숫자 칸 1탭 → 입력 → 다른 곳 탭 | 같다 |
| 카드 펼치기 | 머리 1탭 | 머리 1탭 (`Collapsible`의 `trigger`) |

**`NumberStepper.tsx` — 로직은 그대로, 그리는 것만.** `text` 상태, `isAllowedInput` 패턴, `commitText`, `bump`·`release`·`abort`, `latest` ref, `ladder`를 한 줄도 안 바꾼다.

| 자리 | 지금 | Astryx |
|---|---|---|
| `−` `+` | `<button onPointerDown onPointerUp onPointerCancel onPointerLeave>` | `Button variant="secondary" isIconOnly icon={…} label={`${ariaLabel} 감소`\|`증가`}` + **같은 네 처리기**(Astryx `Button`이 넘겨준다 — "확인한 것" 2). `onClick`은 달지 않는다(두 번 세지 않게) |
| 눌린 표시 | `pressed` 상태 + `.stepper-btn-pressed` | Astryx `Button`의 눌림 표시를 쓴다. `pressed` 상태와 `setPressed`를 지운다(쓰는 곳이 없어진다) |
| 숫자 칸 | `<input className="stepper-value" inputMode …>` | `TextField label={ariaLabel} isLabelHidden value={text ?? String(value)} inputMode onChange onFocus onBlur onKeyDown` — 처리기 본문은 그대로(`TextInput`의 `onChange`는 첫 인자가 문자열이다). 글자는 가운데, 표 숫자(`tabular-nums`), 크기는 **테마의 제목 글자 단계 토큰**(`TextField`에 `isProminent` 속성을 더해 `controlStyle`로 — 구현자가 `astryx.css`에서 제목 2단계 크기 토큰 이름을 확인한다. px를 적지 않는다) |
| 경고 색(무게 0) | 바깥 `.stepper-slot-warn` | `NumberStepper`에 `status?: 'warning'` 속성을 더해 `TextField`의 `status`로 넘긴다(구현자가 `TextInput.d.ts`의 `InputStatus` 모양을 확인) |

`pointerdown`의 `e.preventDefault()`(입력칸의 포커스를 안 뺏는다)는 그대로 둔다. 이것이 Astryx의 눌림 표시를 막으면 눌림 표시를 포기하지 않고 멈춰서 보고한다.

**`ExerciseCard.tsx`** — 로직(`weightScale`, `firstExposure`·`calibrated`, `setLabels`, `onCheck`, `finishGuideSet`, 자식 시트 넷을 여는 상태)은 그대로. 맨 바깥에 `ax-scope` 클래스를 붙인다(기록 편집 화면 안에서 legacy 규칙을 벗어나는 섬 — RR1).

| 자리 | 지금 | Astryx |
|---|---|---|
| 카드 | `.ex-card`·`-done`·`-skipped` | `Card`(스킵이면 `variant="muted"`) |
| 머리 | `button.ex-head aria-expanded` | `Collapsible isOpen={open} onOpenChange={onToggleOpen} trigger={…}`. 본문은 지금처럼 `open`일 때만 넘긴다(닫힌 카드의 스테퍼를 그리지 않는다) |
| 머리 안 | `.ex-order`, `.ex-name` + `.chip`들, `.ex-sub`, `.ex-count` | `HStack`: 순번 `Badge variant="neutral"`, `VStack`(`Text weight="bold"` 이름 + `Badge` — 대체 `warning`, 추가 `info`, N번째 수행 `neutral`; `Text type="supporting" color="secondary"` 부제 줄들; 감각·보상작용·통증 `Badge`), 개수: 다 했으면 `Badge variant="success"`, 스킵이면 `Badge variant="neutral" label="스킵"`, 아니면 `Text hasTabularNumbers` |
| 메모·무게 기준 | `p.ex-note` | `Text color="secondary"` |
| 자극 요령 | `p.ex-cue` | `Card variant="muted"` + `Text`(💡 그대로) |
| 세팅 메모 줄·무게 단위 줄 | `button.setup-row` + `.setup-value`/`.setup-empty` | `List` + `ListItem startContent={<IconSliders size={16} />\|<IconScale size={16} />} label={…} endContent={연필 아이콘} onClick`. 빈 값은 `label`을 `Text color="secondary"`로, 채운 값은 `Text`로(글자 색으로 구분 — BB3) |
| 세팅 메모 편집 | `input.field` + `.btn-sm` | `TextField label={`${name} 머신 세팅 메모`} isLabelHidden hasAutoFocus placeholder` + `Button variant="secondary" label="저장"` |
| 칩 줄 | `.ex-chips` | `HStack wrap` + `Badge`(그룹·휴식·복귀 강도 `neutral`, 증량 제안·무게 회복 `info`, 경고류 `warning`). 누르는 칩(보상작용 n/3회 ▸)은 `Button variant="secondary" size="sm"` |
| 세트 표 머리 | `.set-head` | `Text type="supporting" color="secondary"` 셋 |
| **세트 행** | `<div className={setRowClass(set)}>` | **직접 짓는다**(Astryx에 세트 표가 없다 — DESIGN 9.1의 1). `className={setRowClass(set)}`와 `src/lib/setRowState.ts`는 그대로. `.set-row`·`.set-row-done`·`.set-row-warmup` 규칙을 `global.css`에서 지우고 `parts.css`에 토큰만으로 다시 쓴다. 안: 세트 라벨 `Text weight="bold"`, 고스트 `Text type="supporting" color="secondary"` / 무게 미입력 `Text color="warning"`, 템포 `Button variant="ghost" isIconOnly label={`${i + 1}세트 템포 가이드`}`, 완료 `ToggleButton isIconOnly icon={체크} size="lg" label={`${i + 1}세트 완료`} isPressed={set.done} onPressedChange={() => onCheck(i, set.done)}`, `NumberStepper` 둘(폭 배분은 지금처럼 무게가 넓다) |
| 캘리브레이션 적용 | `.btn-sm.btn-warn` | `Button variant="secondary"`(문구 그대로) |
| 세트 조작 | `.btn-row` + `.btn-sm` 다섯 | `HStack wrap` + `Button variant="secondary"`(`+ 세트`, `워밍업`, `− 세트`, `스킵`/`스킵 해제`, `대체`). `aria-label` 둘 그대로. 워밍업의 `commitPendingEdits()` → `addSet` 순서 그대로 |
| 감각 점수 | `.segment` 안 `aria-pressed` 넷 | `ToggleButton label="0"…"3" isPressed={entry.sensoryScore === score}` 넷을 `HStack`에. `SegmentedControl`을 안 쓰는 이유: 미입력(아무것도 안 고른 상태)이 있다 |
| 감각 메모·통증 메모 | `input.field` | `TextField isLabelHidden`(`label`은 지금의 `aria-label`, `placeholder` 그대로) |
| 보상작용 | `.btn-sm`(값 + `▸`) | `ListItem label={entry.compensation} endContent={꺾쇠} onClick`. 있음이면 `label`을 `Text color="warning"`으로 |
| 통증 | `.btn-sm aria-pressed` | `ToggleButton label={hasPain(entry) ? '있음' : '없음'} isPressed={hasPain(entry)}` |
| 작은 제목(감각 점수·보상작용·통증) | `.card-label` | `Text type="supporting" color="secondary"` |

기록 편집 화면(`SessionDetailScreen.tsx`)은 고치지 않는다. 카드만 새 모습으로 그 화면 안에 들어간다.

### 검증

- `v120` RR7: `ExerciseCard.tsx`의 `className=`은 `ax-scope`와 `{setRowClass(set)}`, 그리고 `parts.css`에 있는 `ax-` 이름뿐. `style=`·`<button`·`<input` 0건. `NumberStepper.tsx`에 `className=`·`<button`·`<input` 0건이고 `onClick`이 없다.
- 안 고치고 통과해야 하는 스캔: `v18`(CC12 두 개, `firstExposure`), `warmupInsert`, `guideFinish`, `inputProps`(`ExerciseCard`·전 `.tsx`의 `<input` 검사 — 이제 `<input`이 없어 조건이 비지 않는지 확인하고, 비면 "`TextField`만 쓴다"로 옮긴다), `setRowState`, `uiConsistency` X8(짧은 라벨·`aria-label` 둘), `v111`(`modeSetNotice`), `v113`·`v114`의 `ExerciseCard` 스캔, `NumberStepper.test.ts`(`isAllowedInput`).
- 옮기는 스캔: `polish.test.ts:90-91`(빈 값·채운 값의 구분 — 새 마크업의 `color="secondary"` 조건으로), `setRowState.test.ts:101`(`stepper-slot-warn` → `status` 속성).
- **탭 수(흐름, `ui-check`):** 새 세션에서 첫 카드의 `1세트 완료`를 1탭 → 세트가 완료되고 휴식 바가 뜬다. `… 1세트 무게 증가`를 1탭 → 값이 정확히 한 단계 오른다. 그 버튼 위에서 시작해 세로로 끌어 스크롤하면 값이 안 바뀐다. 숫자 칸에 `40.123456`을 치면 `40.12`까지만 들어가고, 횟수 칸에는 소수점이 안 들어간다. 타이핑 중에 `워밍업`을 누르면 친 값이 원래 세트에 남는다(v1.7 §3.2).
- `ui-check`: `세트 숫자`(RR0의 `inPageSetNumber`)가 `session`·`session-375`·`history-detail-edit`에서 통과. `−`·`+`·`✓`의 누르는 영역(`elementFromPoint`로 중심에서 위·아래·왼쪽·오른쪽 21px)이 자기 자신이거나, 이웃 버튼과 맞닿아 있으면 두 버튼의 중간선까지다.
- 375 폭에서 세트 행이 가로로 넘치지 않고(`가로 넘침`), 무게 `142.5`와 횟수 `12`가 잘리지 않는다.
- 기록 편집(`history-detail-edit`): 카드가 legacy 화면 안에서 깨지지 않는다(버튼이 44px로 부풀지 않는다 — `.ax-scope` 섬). 편집 → 저장 흐름이 그대로다.
- 경계: 대체 수행 카드(대체 칩 + "첫 세트는 RIR…" 칩 + 캘리브레이션 버튼), 얹은 종목(추가 칩), 워밍업 세트(`W` 라벨), 어시스트 종목(무게 0 경고 없음), 맨몸 종목, B그룹(감각 점수·직전 메모), 디로드·복귀 세션(증량 칩 대신 모드 안내), 긴 종목 이름 + 칩 셋, 템포 가이드 켠 상태(세트 행에 버튼 하나 더).
- 속성(`src/lib/properties.test.ts`): 판정·계산 함수를 만들거나 고치지 않는다 — 더할 속성 없음.

### 범위 제외

- 스테퍼를 `src/ax`의 `Stepper`(`NumberInput` 기반)로 바꾸기: 하지 않는다. `NumberInput`에는 핀 사다리(`ladder`)와 타이핑 중 패턴 제한이 없고, `onClick`으로 바꾸면 "뗄 때 1스텝 + 12px 슬롭" 판정이 브라우저에 넘어간다. 입력 마찰은 DESIGN 9.3이 지키라고 한 것이다.
- 세트 행의 `key={i}` 문제(v1.7 §3.2의 근본 수정 — `SetRecord`에 id): 저장 구조를 바꾸는 일이라 범위 밖.
- 길게 눌러 메뉴(`MoreMenu`)로 세트 조작 버튼 줄이기: 탭 수가 늘어난다.

### README 반영

"기능" 표(36줄)의 "롱프레스 가속 스테퍼"는 v1.8(CC12)부터 사실이 아니다. 이 작업이 스테퍼를 다시 그리므로 같이 고친다: "뗄 때 한 단계 스테퍼".

---

## RR8. 세션의 시트 8개

### 진단

세션 화면과 운동 카드가 여는 시트 여덟이 `SheetFrame` + legacy 클래스다: `FinishSheet`(10) · `AddExerciseSheet`(9) · `ManualTimerSheet`(6) · `SubstituteSheet`(11) · `CompensationSheet`(9) · `CompensationWatchSheet`(8) · `WeightScaleSheet`(10) · `TempoGuideSheet`(12).

### 설계

RR5의 "시트 공통 규칙"을 그대로 쓴다. 로직(저장·취소·계산)은 안 바꾼다. 시트마다 따로 정할 것만 적는다.

| 시트 | `purpose` | 따로 정하는 것 |
|---|---|---|
| `FinishSheet` | `form` | 유산소 종류(`.pill-row`): 안 고를 수 있으므로 `ToggleButton` 묶음. 시간·강도 `TextField`(`inputMode`·`aria-label` 그대로), 메모 `TextAreaField`. 미완료 경고 `.warn-box` → `Banner status="warning"`. `adjustLine`은 `Text color="secondary"`. 버리기는 2단계 그대로 |
| `AddExerciseSheet` | `info` | 종목 줄 `ListItem`(`label` 이름, `description` recordKey — 지금 `.mono`인 것은 `Text type`의 코드 글꼴 단계가 있으면 그것, 없으면 보통 글꼴), `endContent` 세트×반복 |
| `ManualTimerSheet` | `info` | 초 고르기: 프리셋과 "이 종목 휴식" 버튼이 **한 선택을 나눠 갖고**, 고른 값이 프리셋 밖일 수 있다(`ManualTimerSheet.tsx:57-81`) → 전부 `ToggleButton`(`isPressed={selected === sec}`). "기본" 꼬리표는 `label`에 그대로. `시작` `Button primary` |
| `SubstituteSheet` | `form` | 후보 줄 `ListItem`(`description`에 시작 무게 근거, `endContent`에 무게). 체중 입력 `TextField` + `저장` |
| `CompensationSheet` | `form` | 징후 목록(`.check-item`, 여러 개): `ToggleButton` 세로 묶음. 직접 입력 `TextField`. 미리보기 문구는 있음이면 `Text color="warning"`, 없으면 `color="secondary"` |
| `CompensationWatchSheet` | `info` | 읽는 줄 + 하향 후보 `ListItem` + `적용` `Button primary` |
| `WeightScaleSheet` | `form` | 방식 고르기(단위/핀 목록): `SegmentedControl`. 프리셋 칩(`.chip-btn`): `ToggleButton`. 단위 `TextField`, 핀 목록 `TextAreaField`. 오류 문구 `Text color="warning"` |
| `TempoGuideSheet` | `required` (도는 중에 막을 눌러 닫히면 안 된다 — 구현자가 지금 동작과 같은지 확인하고, 지금 막 누름으로 닫힌다면 `info`) | **무대는 직접 짓는다**(Astryx에 박자 표시가 없다): 큰 카운트 `Heading level={1}`, 단계 이름 `Text`, 호흡 `Text color="secondary"`, 반복 수 `Text`, 진행은 `ProgressBar`. 배치만 `parts.css`의 `.ax-tempo-*`. 종료 버튼 문구(`종료 — 약 N회 기록 · 휴식 시작`) 그대로. 소리·타이밍 코드는 건드리지 않는다 |

### 검증

- `v120` RR8: 여덟 파일이 `../ax`의 `Sheet`를 쓰고 `SheetFrame` 0건, `className=`은 `ax-tempo-`로 시작하는 것뿐, `style=`·`<button`·`<input`·`<textarea` 0건.
- `v119.test.ts` QQ3의 목록이 식단 시트 넷만 남는다. `v120` RR8: 열 시트(RR5의 둘 포함) 전부 닫기가 `dismiss`를 지난다.
- 안 고치고 통과: `guideFinish`(종료 버튼 문구 스캔), `tempo`·`soundCancel`·`audioIndependence`의 `TempoGuideSheet` 스캔, `v18`(742-744줄), `uiConsistency` X9의 첫 검사(`{hasCompensation(current) &&`), `v112`(815줄 제외). 옮기는 것 둘: `v112.test.ts:815`(`Text`로), `uiConsistency.test.ts:96`(`<Button`으로). `v120` RR8: `FinishSheet.tsx`의 버리기 문구 앞 260자 안에 `variant="destructive"`가 있다.
- 흐름(`ui-check`): 종료 시트 → `기록하고 종료` → 요약. 종료 시트 → 버리기 2단계 → 홈. 수동 타이머 → 초 고르기 → 시작 → 휴식 바. 대체 → 후보 1탭 → 카드가 대체 종목으로. 보상작용 → 징후 둘 고르기 → 저장 → 카드 머리에 뱃지. 무게 단위 → 핀 목록 입력 → 저장 → `+`가 다음 핀으로. 템포 가이드 → 자동 종료 → 세트 체크 + 휴식 시작(Z2 체인).
- 화면 검증: 시트마다 끝까지 스크롤, 키보드가 올라온 상태에서 입력칸이 가리지 않는다(`sheet-finish`의 메모, `WeightScaleSheet`의 핀 목록 — Chromium에서는 키보드가 없으므로 "실기기 확인"에 넣는다).
- 경계: 종료 시트에서 완료 세트 0개(경고), 대체 후보 없음(빈 목록 문구), 체중 미입력(대체 시트의 입력), 보상작용 "없음"에서 열기, 핀 목록이 잘못된 형식(오류 문구).

### 범위 제외

- 시트를 화면으로 바꾸기(DESIGN 9.1의 5가 허용): 하지 않는다. 운동 중에는 뒤 화면(세트 표)이 보이는 채로 잠깐 띄우는 것이 맞다.
- `TempoGuideSheet`의 진행 표시를 박자에 맞춘 움직임으로 다듬기: 모양만 옮긴다.

### README 반영

없음.

---

## RR9. 요약

### 진단

`SummaryScreen.tsx`(legacy 18, 인라인 4 — `color: 'var(--warn)'`·`'var(--accent)'`, `whiteSpace`).

### 설계

계산(`progressionVerdicts`, `revertWarning`, `detectPrs`, `orderDeviations`, 볼륨·최고 세트)은 안 바꾼다.

| 자리 | 지금 | Astryx |
|---|---|---|
| 화면 틀 | `.screen` | `AxRoot` + `VStack` |
| 제목·부제 | `h1.screen-title`, `p.screen-sub` | `Heading level={1}`(`수고했어요 🔥` 그대로), `Text color="secondary"` |
| 숫자 셋 | `.stat-grid` + `.stat-value`/`.stat-label` | `Card` + `Grid`(세 칸 — 구현자가 `Grid.d.ts`로 열 속성 확인) 안에 `VStack`: `Heading level={2}`(값), `Text type="supporting" color="secondary"`(라벨, "어시스트 종목 제외" 포함) |
| 최고 세트 | `p.row-sub` | `Text color="secondary"` |
| 카드 다섯(개인 기록·감각 저하 복귀·다음 세션 무게·수행 순서·감각이 약했던 종목) | `.card` + `.card-label` + `.row` | `Card` + `Text type="supporting" color="secondary"`(제목, 이모지 그대로) + `List`/`ListItem`: `label`(이름 + `Badge` — PR 종류 `info`, 앞당김 `info`, 미룸 `neutral`), `description`(지금의 `.row-sub`), `endContent`(지금의 `.row-meta` — 경고색은 `Text color="warning"`, 증량은 `Text color="accent"`) |
| 유산소·메모 | `.card` + `.row` | `Card` + `Item`(메모는 여러 줄: `labelLines`를 넉넉히 — 잘리지 않게) |
| 홈으로 | `.btn.btn-primary` | `Button variant="primary" label="홈으로" width="100%"` |
| 세션 없음 | `p.center-note` + `.btn` | `Center` + `Text` + `Button variant="secondary"` |

### 검증

- `v120` RR9: `SummaryScreen.tsx`에 `className=`·`style=`·`<button`·`var(--` 0건.
- 안 고치고 통과: `v111`·`v114`의 `SummaryScreen.tsx` 스캔(같은 판정 함수를 쓴다, `hasPain`, `cardioText(`).
- 흐름: 세션 종료 → 요약 → `홈으로` 1탭 → 홈.
- 경계: 체크 0세트로 종료(수행 순서 "체크된 세트가 없습니다."), PR 셋 이상, 증량 대상 없음(카드가 안 보인다), 어시스트 종목만 한 세션(볼륨 0 + 제외 안내), 긴 세션 메모(세 줄 이상), 유산소만 한 세션, 디로드 세션.
- `ui-check`: `summary`·`summary-light`에서 가로 넘침 없음, 긴 메모가 잘리지 않는다.

### 범위 제외

- 요약의 카드 순서·내용: 그대로.

### README 반영

- "Tech Stack"의 Astryx 줄(RR1에 적은 문장).
- "프로젝트 구조"의 `components/` 설명에서 "바텀시트"를 그대로 두되, `ax/` 줄을 "Astryx를 쓰는 한 곳 — 테마(`theme.ts`), 앱 뿌리, 띠, 시트, 이 앱만의 부품 CSS(`parts.css`)"로.

---

## RRT. 테마 확정 (사람이 고른 뒤)

### 진단

RR1이 `src/ax/theme.ts`에 지금 깔린 Neutral을 그대로 뒀다. 어떤 테마인지는 사람이 고른다(DESIGN 9.1의 2).

### 설계

고치는 파일은 `src/ax/theme.ts` 하나다(B면 `package.json`·`src/ax/index.tsx`의 CSS import 한 줄도).

| 고른 것 | 할 일 |
|---|---|
| A. Neutral | 고칠 것 없음. `theme.ts`의 주석에 "2026-…에 사람이 고름"만 적는다 |
| B. Stone | `@astryxdesign/theme-stone`을 `0.7.13` 정확한 버전으로 더한다(core와 같은 버전 — `v117.test.ts:20`의 검사에 이 패키지를 더한다). `extends: stoneTheme`, `src/ax/index.tsx`의 `theme-neutral/theme.css`를 `theme-stone/theme.css`로. `@astryxdesign/theme-neutral` 의존성을 지운다 |
| C. Neutral + 주황 | `extends: neutralTheme` + `tokens`: `--color-accent`·`--color-accent-muted`·`--color-text-accent`·`--color-icon-accent`·`--color-on-accent`를 `neutralPalettes.orange`의 단계로("테마 후보" 절의 단계가 출발점). 단계는 아래 검증을 지키는 것으로 구현자가 확정하고 DEV-RECORD에 표로 적는다. hex를 `theme.ts`에 직접 적지 않는다 |
| 후보 밖의 테마 | B와 같은 절차 |

어느 쪽이든 터치에서 부품이 작다고 판단되면(RR7의 화면 검증·실기기) 고칠 자리도 이 파일이다: `adaptations`에 `when: { pointer: 'coarse' }` 규칙으로 크기 토큰을 올린다. 이번에는 올리지 않고 시작한다(Astryx가 누르는 영역을 이미 넓힌다 — "확인한 것" 2).

### 검증

- `v120` RRT: `theme.ts`에 `#`으로 시작하는 색 리터럴이 없다. `defineTheme`의 `name`이 `'workout'`이다.
- C일 때: 강조 면 위 글자(`--color-on-accent` / `--color-accent`), 본문 배경 위 강조 글자(`--color-text-accent` / `--color-background-body`·`-card`)의 대비가 라이트·다크 모두 4.5:1 이상 — `ui-check`의 axe 대비 위반 0(주 버튼·`Text color="accent"`가 있는 `home`·`session-rest`·`summary`).
- 전 장면을 다시 찍는다(`after`, 다크·라이트). 화면 검증자가 후보 스크린샷과 견줘 고른 테마가 맞는지 본다.
- legacy 화면(식단·기록·분석·설정)이 RR2의 다리로 같은 색을 따른다 — `settings`·`diet`의 주 버튼 색이 `home`의 주 버튼 색과 같다.

### 범위 제외

- 테마 글꼴 받기. 아이콘을 테마 아이콘(lucide)으로 전부 바꾸기 — 탭 아이콘은 `icons.tsx` 그대로.

### README 반영

"핵심 설계 결정"의 iOS · PWA 묶음에 한 항목을 더한다: **"모양은 테마 한 벌이 정한다"** — "색·글자 크기·간격·모서리·그림자·움직임은 Astryx 테마(`src/ax/theme.ts`)가 정하고, 앱이 따로 고정하는 색은 없습니다. 테마는 <고른 것 한 줄: 예 — Astryx Neutral을 잇고 강조색만 주황으로 바꾼 것>입니다. 라이트/다크는 폰 설정을 따릅니다. 이 앱만의 부품(세트 행, 요일 점, 띠)의 CSS는 `src/ax/parts.css`에 있고 값은 테마 토큰에서만 가져옵니다."

---

## RRM. 재질 확정 (사람이 고른 뒤)

### 진단

RR2·RR3이 지금의 결정(유리)을 "읽히는 최소한"으로만 유지했다. 라이트 모드의 유리 값은 아직 잡지 않았고, 띠의 재질은 `.ax-bar` 규칙 한 무리와 `ax.css`의 시트 규칙에 모여 있다.

### 설계

| 고른 것 | 할 일 |
|---|---|
| **유리를 남긴다** | `glass.css`의 띠·시트 토큰을 테마 색 위에서 다시 잡는다. 기준은 v1.19와 같다: 뒤가 통째로 강조색이어도 띠·시트 위 글자 4.5:1, 띠 비침 0.30 이상·시트 비침 0.15 이상(`scripts/lib/glass-check.mjs`의 계산 그대로), **라이트와 다크 각각**. 흐림 값은 글자 그대로(`var()` 금지), 끄기 규칙(대비 증가·흐림 미지원) 유지, 시트가 뜨면 띠의 흐림을 끈다 — `:root:has(.sheet-backdrop)` 선택자에 Astryx 시트(`dialog:has(.astryx-bottom-sheet)`가 열린 상태)를 더한다. 고정 색 토큰(`--glass-bar: rgba(6, 6, 8, 0.5)` 등 `:root` 블록의 리터럴)은 전부 테마 토큰에서 만든 값으로 바꾼다. `ui-check`의 유리 검사를 라이트 장면에서도 돌린다. 설정 → 진단의 "유리" 줄은 그대로 |
| **Astryx 표면으로** | 지운다: `src/styles/glass.css`와 `index.css`의 import, `ax.css`의 시트 유리 블록(204-271줄), `src/lib/glassDiag.ts`와 테스트, 설정 → 진단의 "유리" 줄(`SettingsScreen.tsx` — 범위 밖 화면이지만 줄 하나를 지우는 것), `scripts/lib/glass-check.mjs`와 `ui-check.mjs`의 유리 칸, `scripts/screenshots-glass.mjs`, `v118.test.ts`·`v119.test.ts`의 유리 스캔(QQ1). `.ax-bar`는 `background: var(--color-background-surface)` + 맞닿는 쪽 `1px` 선(`--color-border`). 남은 legacy 시트(식단 넷)의 `.sheet`·`.sheet-backdrop`도 같은 표면색과 테마의 막 색(`--color-overlay`)으로 |

### 검증

- 유리: `ui-check after --check`의 `유리` 칸이 다크·라이트 전 장면에서 통과. v1.19의 결함 복원 확인 ①~⑤(흐림 `var()`, 탭바 흐림 중복, 띠·시트 비침, 알약 대비) 가운데 지금도 뜻이 있는 것을 `.ax-bar` 기준으로 다시 한다.
- 표면: `v120` RRM — `src`·`scripts`에 `backdrop-filter`·`--glass-` 글자가 0건, `glass.css`가 없다. `npm run knip`이 지운 파일을 가리키는 것이 없다. 설정 → 진단에 "유리" 줄이 없다.
- 어느 쪽이든: 띠 아래로 지나가는 내용 때문에 띠의 글자가 안 읽히는 장면이 없다(화면 검증자: `home`을 300px 스크롤, `session`을 300px 스크롤, 다크·라이트).

### 범위 제외

- 굴절·렌즈 효과(iOS Safari가 못 그린다 — README 그대로).

### README 반영

- 유리: "유리는 떠 있는 층에만 쓰고, 재료는 토큰 한 벌이다" 항목에서 "탭바·재개 스트립·세션 상단 바·휴식 바·바텀시트만"을 "아래 띠(탭과 재개 줄)·세션 상단 바·휴식 바·바텀시트만"으로, "뒤가 통째로 주황이어도"를 "뒤가 통째로 테마 강조색이어도"로, 끝에 "라이트와 다크에서 각각 값을 잡습니다."를 더한다.
- 표면: 그 항목 전체와 Limitations의 "iOS Safari는 폰의 '투명도 줄이기' 설정을…" 줄을 지우고, RRT가 더한 "모양은 테마 한 벌이 정한다" 항목 끝에 한 문장: "떠 있는 띠와 시트도 테마의 표면색입니다(v1.20에서 유리를 걷었습니다)."

---

## RR10. 사본 정리와 기록

### 진단

`motion.css`(눌림·시트 움직임)·`space.css`(여백 역할 토큰·유틸 클래스)는 Astryx 값을 옮겨 적은 사본이다(README 262-275). 옮긴 화면은 이제 안 쓴다.

### 설계

- `space.css`의 유틸 클래스(`.mt-row` 등 여덟) 가운데 남은 `.tsx`가 안 쓰는 것을 지운다(`v119.test.ts:179`의 "쓰이는 이름만 있다"가 이미 지킨다 — 그 검사가 요구하는 대로).
- `motion.css`에서 선택자가 가리키는 요소가 없어진 규칙(`.tabbar`·`.rest-*`·`.stepper` 무리)을 지운다.
- `global.css`: 인벤토리의 넷째 숫자가 **RR0 기준선에 있던 것까지 포함해 0**이 되게 지운다(허용 목록 제외).
- `docs/ASTRYX-INVENTORY.md`를 `--write`로 새로 쓴다.
- `docs/DEV-RECORD-v1.20.md`, `package.json` 1.20.0.

### 검증

- `v120` RR10: `docs/ASTRYX-INVENTORY.md`의 합계 줄이 `안 쓰는 legacy 선택자 0개.`로 끝난다(그 뒤로는 `--check`가 0을 지킨다).
- `ui-check after --check` 전 장면 통과. 안 옮긴 화면의 `눌림 반응`·`여백 한 벌`이 그대로 통과(사본을 너무 많이 지우지 않았다).
- `npm run check` 통과.

### 범위 제외

- `motion.css`·`space.css`·`global.css` 자체를 없애기: 식단·기록·분석·설정이 아직 쓴다. 다음 기획에서 화면을 다 옮기면 없어진다.

### README 반영

- "눌림과 움직임은 Astryx 테마의 값을 따르고…" 항목: "legacy 화면의 버튼은"을 "아직 안 옮긴 화면(식단·기록·분석·설정)의 버튼은"으로, "값은 Astryx 테마에서 옮겨 적었습니다 — legacy 화면은 헬스장 경로라 Astryx CSS를 읽지 않습니다."를 "옮긴 화면은 Astryx 부품의 눌림·움직임을 그대로 씁니다. `motion.css`의 값은 안 옮긴 화면을 위해 Astryx 테마에서 옮겨 적은 사본이고, 화면을 다 옮기면 없어집니다."로.
- "여백은 역할 토큰 한 벌이다" 항목 끝에: "옮긴 화면은 Astryx의 간격 단계를 부품 속성(`gap`·`padding`)으로 직접 쓰고, `space.css`는 안 옮긴 화면이 씁니다."

---

## 화면 검증 (화면 검증자 — `agents/SCREEN-CHECKER.md`)

작업마다 `node scripts/ui-check.mjs after --check --ver=v1.20 --only=<장면>`의 표와 스크린샷(다크·라이트), v1.19의 "visual review 목록"을 채운다. 구현자는 작업 커밋마다 `after`를 찍고 `node scripts/argos-upload.mjs after`를 돌려 출력(빌드 주소나 `Argos 건너뜀: …`)을 DEV-RECORD와 화면 검증 보고에 적는다. **RRT·RRM 전의 스크린샷은 임시 테마(Neutral)·임시 재질이다** — 그때는 배치·넘침·읽힘을 보고, 색과 재질의 최종 판단은 RRT·RRM 뒤에 전 장면으로 한 번 더 한다.

| 작업 | 장면 (각각 다크·라이트) | 상태 |
|---|---|---|
| RR1 | 전 장면 (다크만 — 라이트는 RR2 뒤에 본다) | 문서 배경과 legacy 시트 면의 색 말고 `before`와 달라진 것이 있는가(있으면 자리를 적는다) |
| RR2 | `diet` `sheet-food` `history` `history-detail` `analyze` `settings` `settings-end` `settings-routines` `home` `session` `summary` | 라이트에서 글자가 묻힌 곳, 색조 상자, 달력 점, 차트 축·선, 입력칸의 테두리 |
| RR3 | `home` `home-375` `home-resume` `diet` `history` `analyze` `settings-end` | 탭 다섯이 한 줄, 지금 탭의 표시가 보이는가, 재개 줄이 있을 때·없을 때 마지막 요소가 가리지 않는가, 업데이트 알림이 떠 있을 때(`ui-check`가 알림 상태를 흉내 낸다), 긴 Day 이름의 재개 줄 |
| RR4 | `home` `home-375` `home-end` `home-resume` | 기록 0건, 배너 하나·셋(펼침·접힘), 복귀 배너의 적용/안 함, 긴 루틴 이름 뱃지, 볼륨 목표 초과(막대가 100%에서 멈춘다), 제안 근거 펼침 |
| RR5 | `sheet-home`(Day 선택) + 진행 중 세션 처리 시트 | 끝까지 스크롤, 버리기 확인 상태, 닫히는 중 한 장 |
| RR6 | `session` `session-rest` `session-375` | 300px 스크롤(카드가 상단 바 아래로), 휴식 끝난 상태, 복귀·디로드 뱃지, 긴 Day 이름 |
| RR7 | `session` `session-375` `session-open-b` `history-detail-edit` | 세트 행: 완료·워밍업·무게 미입력, 숫자 `142.5`·`12`, 템포 버튼 켠 상태, 대체·추가 칩이 있는 머리, 버튼을 누른 채 한 장(`--press-shot`: `+`, `✓`), 스킵한 카드 |
| RR8 | `sheet-finish` `sheet-timer` + 나머지 여섯 시트(장면을 더한다: `sheet-add` `sheet-substitute` `sheet-compensation` `sheet-watch` `sheet-scale` `sheet-tempo`) | 끝까지 스크롤, 고른 상태, 오류 문구, 템포 무대가 도는 중 한 장 |
| RR9 | `summary` | PR·복귀·증량 카드가 있는 세션, 체크 0세트, 긴 메모 |
| RRT | 전 장면 | 고른 테마와 후보 스크린샷이 같은 인상인가, legacy 화면과 옮긴 화면의 주 버튼 색이 같은가 |
| RRM | `home` `home-resume` `session` `session-rest` 전 시트 장면 | 300px 스크롤 상태에서 띠 위 글자, 시트 뒤 막의 농도(어두운 곳에서 눈부시지 않은가) |

**팔 뻗은 거리(RR6·RR7·RRT 뒤):** `session`·`session-rest`를 50%로 줄여 본다 — 세트 행의 무게·횟수, 휴식 남은 시간, 완료한 세트와 안 한 세트의 구분이 읽히는가. 안 읽히면 구현자가 값을 고치지 않고 보고한다(고칠 자리는 `theme.ts`의 `adaptations` — 사람이 정한다).

---

## 데이터 이전

없다. IndexedDB(Dexie 3)·Gist 백업(`SCHEMA_VERSION` 3)·설정·localStorage(휴식 타이머의 종료 시각, 밀린 백업 표시)에 새 키도, 바뀌는 값도 없다. 테마·재질 선택은 코드에 있고 저장하지 않는다.
옛 백업을 복원하거나, 이 버전에서 만든 백업을 v1.19로 가져가도 그대로 읽힌다.

## 되돌리기

| 폰에서 본 것 | 방법 |
|---|---|
| 테마가 마음에 안 든다 | `src/ax/theme.ts`만 고친다(다른 후보로). 데이터와 무관하다 |
| 유리를 걷었는데 다시 원한다 / 남겼는데 지저분하다 | RRM 커밋을 `git revert`하고 다른 쪽으로 다시 한다. RRM은 다른 작업 위에 얹은 마지막 커밋 가운데 하나라 혼자 되돌려진다 |
| 버튼·숫자가 작아 잘 안 눌리고 안 읽힌다 | `theme.ts`의 `adaptations`에 터치용 크기 토큰 규칙을 더한다(한 곳에서 전 화면) |
| 앱을 여는 데 오래 걸린다 | 수치를 `node scripts/first-screen.mjs`로 다시 재고 이슈로. 급하면 PR 전체를 되돌린다(아래) |
| 라이트 모드에서 식단·기록·설정의 어딘가가 안 읽힌다 | `global.css`의 그 규칙 하나를 고친다(RR2의 표). 급하면 폰을 다크로 — 다크는 v1.19와 같은 구성이다 |
| 탭이 잘 안 눌린다 | `parts.css`의 탭 늘리기 규칙. 그래도 안 되면 `TabList`의 `size`를 올리고 375 폭 넘침을 다시 본다 |
| 세트 입력이 이상하다(값이 튄다, 두 번 오른다) | RR7 커밋을 `git revert`(카드와 스테퍼가 legacy로 돌아간다 — `global.css`의 지운 규칙도 같이 돌아온다). 기록은 건드린 적이 없다 |
| 전부 | PR을 되돌린다(`git revert -m 1 <머지 커밋>`을 PR로). 서비스워커가 다음 실행에서 "새 버전이 준비됐어요"로 예전 화면을 다시 받는다. 데이터는 그대로다 |
| 폰이 iOS 17.5 미만이다 | 이 버전은 화면이 깨진다(DESIGN 9.4 — 사람이 알고 있다). 서비스워커는 **누를 때만** 업데이트하므로, 그런 폰에서는 "업데이트"를 누르지 않으면 v1.19가 계속 돈다 |

작업별로는 RR10 → RRM → RRT → RR9 → … → RR1 순서로 `git revert`할 수 있다(각 작업이 커밋 하나).

---

## 과거 판정 불변

바뀌지 않는 것: 기록·판정·내보내기·백업 전부. `git diff --stat main..HEAD -- src/db src/store`가 비어 있다. `src/lib`에서 바뀌는 것은 새 파일 `v120.test.ts`, "확인한 것" 5의 표에 적은 스캔 테스트의 옮김, 그리고 (RRM에서 표면을 고르면) `glassDiag.ts`와 그 테스트의 삭제뿐이다. 골든 테스트(`v113`~`v117`의 내보내기 글자)는 **한 글자도 안 고치고** 통과한다.

달라지는 것(판정이 아니라 화면):

| 무엇 | 전 | 후 |
|---|---|---|
| 라이트/다크 | 루틴 편집만 폰 설정, 나머지 다크 고정 | 전 화면이 폰 설정을 따른다 |
| 색·모서리·버튼 모양 | 앱이 정한 값(주황 `#ff7a1a` 등) | 테마가 정한 값(사람이 고른 테마) |
| 식단·기록·분석·설정 | 다크 고정 | 색만 테마를 따른다. 구조·모양은 그대로 |
| 탭바 | 알약 모양 띠 안에 아이콘 위·글자 아래 | Astryx 탭(아이콘 옆 글자, 지금 탭에 밑줄) |
| 재개 줄 | 탭바 위에 따로 뜬 띠 | 아래 띠 안의 한 줄 |
| 배너 | 앱이 그린 색 상자 | Astryx 배너(상태 아이콘이 붙는다) |
| 기호 버튼(`‹` `⏱` `✓` `−` `+` `▸` `✎` `♩`) | 글자 | 아이콘(접근성 이름은 그대로) |
| 세트 행의 숫자 | 앱이 정한 큰 글자 | 테마의 제목 글자 단계(지금보다 작을 수 있다 — 화면 검증에서 본다) |
| 버튼의 보이는 높이 | 44px 이상 | Astryx 기본(터치에서 누르는 영역은 Astryx가 넓힌다) |
| 스테퍼를 누르고 있을 때 | 앱이 그린 눌림 표시 | Astryx 버튼의 눌림 표시 |
| 시트 | 앱이 그린 유리 시트 | Astryx 바텀시트(끌어내려 닫기가 된다) |
| 홈의 "제안 근거" | 브라우저 기본 접힘(`<details>`) | Astryx 접힘 |
| 처음 여는 순간 읽는 코드 | 약 190KB(gzip) | 약 449KB 이하 |
| 앱을 여는 순간(라이트) | — | 어두운 스플래시가 잠깐 보인 뒤 밝은 화면 |
| 띠와 시트의 재질 | 유리 | 사람이 고른 쪽 |

---

## 구현 순서와 검증

**RR0 → RR1 → RR2 → RR3 → RR4 → RR5 → RR6 → RR7 → RR8 → RR9 → RRT → RRM → RR10.**
RR0의 `before`는 다른 작업 뒤에 못 찍는다. RR1이 테마를 뿌리에 올려야 화면들이 Astryx 부품을 쓸 수 있고, RR2가 색을 이어야 RR3부터 라이트 스크린샷이 뜻이 있다. RR3이 `.app`을 없애야 RR4의 홈이 legacy 범위 밖에 놓인다(순서를 바꾸면 홈의 Astryx 버튼에 legacy 규칙이 걸린다). RR5가 `Sheet`의 `dismiss`를 만들어야 RR8이 쓴다. RR6의 `Bar`·세션 틀이 있어야 RR7의 카드를 그 안에서 본다.
**RRT·RRM은 사람의 답이 있어야 한다.** 답이 먼저 오면 RRT는 RR1 뒤 어디서든, RRM은 RR3·RR6·RR8 뒤 어디서든 할 수 있다(앞당기면 그 뒤 작업의 스크린샷이 최종 모습이 된다). 답이 안 왔으면 RR9까지 하고 **RRT 앞에서 멈춘다** — 추천안으로 대신 정하지 않는다. PR은 RR10 뒤에 올린다.
커밋은 **작업마다 하나, 13개.** 작업끼리 한 커밋에 섞지 않는다.

관례:
- `npm run check`(마무리), 작업 중에는 `npm run check -- --fast`와 관련 테스트만: `npx vitest run src/lib/v120.test.ts <그 작업이 고친 스캔 테스트>`. `tsc`를 직접 부르지 않는다.
- 커밋 개수는 실행 출력을 복사한다(`git log --oneline main..HEAD`). 커밋 메시지는 `git commit -F - <<'MSG'`.
- **세 숫자:** 작업 커밋마다 `node scripts/astryx-inventory.mjs --check`의 출력을 DEV-RECORD에 복사하고 `--write`한 표를 같은 커밋에 넣는다. 머리의 작업 표와 다르면 이유를 적는다. RR0이 더한 넷째 숫자(안 쓰는 legacy 선택자)도 같이 적는다 — 화면을 옮기는 작업마다 늘지 않아야 하고 RR10에서 0이 된다.
- **배포 단위:** RR0+RR1+RR2가 첫 묶음이다(RR1만으로는 라이트 모드가 온전하지 않다). 그 뒤 RR3~RR9는 작업 하나가 끝날 때마다 배포할 수 있는 상태다(임시 테마 Neutral, 임시 재질 유리로도 앱은 온전히 돈다). 실제 배포는 PR 하나다.
- **스캔 테스트** (v1.19까지의 "기존 테스트는 고치지 않는다"를 이 PLAN에서 이렇게 바꾼다):
  1. 판정·계산·내보내기를 재는 테스트(골든 포함)는 고치지 않는다. 깨지면 멈추고 보고한다.
  2. `.tsx`를 글자로 읽는 스캔이 깨지면 먼저 **코드 쪽에서** 통과시킨다(로직 줄을 그대로 두면 대부분 통과한다).
  3. 마크업 글자에 묶여 통과시킬 수 없는 것만 **같은 뜻으로 옮긴다.** 지우지 않는다. "확인한 것" 5의 표에 없는 것을 옮기게 되면 DEV-RECORD의 "옮긴 스캔" 표에 테스트 이름·전·후·같은 뜻인 이유를 적는다.
  4. `npm test`의 테스트 개수가 작업마다 줄지 않는다(RRM에서 표면을 고른 경우의 유리 테스트 삭제만 예외 — 지운 테스트 이름을 적는다).
- 스크린샷 검사는 하나씩 백그라운드로 돌린다(DEV-RECORD 제약 17). 파일 편집은 Edit 도구로(제약 17·21).
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `App.tsx`의 한 반환 갈래에서 `<AppRoot>`를 뺀다 → `v120` RR1 실패
  ② `global.css`의 `button` 규칙을 `@scope` 밖으로 꺼낸다 → `v120` RR1 실패 + `ui-check`에서 Astryx 버튼 높이가 44로 부푼다
  ③ `ax.css`의 리셋에서 `to (…)` 한계를 뺀다 → `--same-layout`이 `settings`에서 실패한다(안 깨지면 DEV-RECORD에 "이 검사가 못 잡는다"를 적고 `v120`에 선택자 스캔을 더한다)
  ④ `global.css`의 `:root`에 색 리터럴 하나를 되살린다 → `v120` RR2 실패
  ⑤ `TabList`의 `size="md"`를 뺀다 → `home-375`의 탭 개수 검사 실패
  ⑥ `parts.css`의 탭 늘리기 규칙을 지운다 → `탭 누름` 실패
  ⑦ `Bar`가 `--ax-bar-bottom`을 안 쓰게 한다 → `마지막 요소` 실패
  ⑧ `parts.css`에 `#ff7a1a`와 `12px`를 하나씩 넣는다 → `v120` RR3 실패
  ⑨ `HomeScreen.tsx`에 `className="card"`를 하나 되살린다 → `v120` RR4 실패 + `astryx-inventory --check` 실패(legacy 클래스 늘어남)
  ⑩ 옮긴 시트 하나의 닫기를 `onClick={onClose}`로 → `v120` RR5 실패
  ⑪ `Sheet`의 `once` 감싸기를 뺀다 → 흐름 "두 번 누르기" 실패
  ⑫ `NumberStepper`의 `+`에 `onClick={() => bump(1)}`을 더한다 → `v120` RR7 실패 + 흐름에서 1탭에 두 단계 오른다
  ⑬ `TextField`의 `isProminent`를 세트 행에서 뺀다 → `세트 숫자` 실패
  ⑭ `ExerciseCard`의 `ax-scope`를 뺀다 → `history-detail-edit`의 버튼 높이 검사 실패
  ⑮ `theme.ts`에 hex 하나 → `v120` RRT 실패
  ⑯ (유리) 라이트의 띠 알파를 0.9로 → `띠 비침` 실패 / (표면) `parts.css`에 `backdrop-filter` 한 줄 → `v120` RRM 실패
  ⑰ `global.css`에 쓰는 곳 없는 `.zz-unused {}`를 더한다 → `astryx-inventory --check` 실패(넷째 숫자)
- **과거 판정 불변 확인 절**(DEV-RECORD): ① `git diff --stat main..HEAD -- src/db src/store` 출력이 비어 있다(복사) ② `git diff --stat main..HEAD -- src/lib` 출력(복사)에 판정 파일이 없다 — 새 파일·스캔 테스트·(표면이면) `glassDiag`뿐 ③ 골든 테스트 수정 없이 통과 ④ 달라지는 것: "과거 판정 불변" 표.
- **변이 테스트:** `src/lib`의 판정 파일을 안 고치므로 `npm run mutation`의 대상이 없다. DEV-RECORD에 "대상 없음"과 `git diff --stat`의 근거를 적는다.
- 완료 후 `docs/DEV-RECORD-v1.20.md`(맨 위 "이 환경에서 확인된 제약"은 v1.19 목록을 이어받고 새로 확인한 것을 더한다: `@scope`가 이 Chromium과 iOS에서 리셋을 가두는지, `Sheet`의 닫힘 대기 길이, `Button`의 `preventDefault`와 눌림 표시, `TextField`의 `status` 모양, 쓴 테마 아이콘 이름, 제목 글자 단계 토큰 이름, `first-screen.mjs`의 전·후 값, precache 개수·KiB, 옮긴 스캔 표). "배포 영향" 절에 아래를 남기고 PR 본문 맨 위에도 넣는다:
  - 앱 틀·탭·홈·세션·요약과 그 시트 10개가 Astryx 부품과 테마 한 벌로 바뀌었다. 테마: <고른 것>, 띠와 시트: <유리/표면>. 기록·판정·내보내기·백업은 그대로다.
  - 앱 전체가 폰의 라이트/다크를 따른다. 식단·기록·분석·설정은 색만 따르고 모양은 예전 그대로다(다음 기획). 라이트에서 앱을 여는 순간 어두운 스플래시가 잠깐 보인다.
  - 세트 하나를 적는 탭 수는 그대로다(✓ 1탭, `+`·`−` 1탭 — 뗄 때 한 단계).
  - **iOS 17.5 미만에서는 화면이 깨진다.** 그런 폰에서는 "업데이트"를 누르지 않는다.
  - 처음 여는 순간 읽는 코드가 늘었다: <전 → 후 gzip KB>, 첫 화면 <전 → 후 ms>(Chromium, CPU 4배 느리게). 오프라인은 그대로다(precache <개수·KiB>).
  - 화면 비교: Argos 빌드 주소(작업마다), `docs/screenshots/v1.20/before`·`after`. 후보 비교는 `docs/screenshots/v1.20/candidates/`.
  - 고칠 자리: 테마 `src/ax/theme.ts`, 이 앱만의 부품 `src/ax/parts.css`, 안 옮긴 화면의 색 `src/styles/global.css`의 `:root`.
  - Astryx 적용 현황: `docs/ASTRYX-INVENTORY.md`(안 읽는 파일 45 → <n>, 인라인 97 → <n>, legacy 클래스 520 → <n>).
- README: 각 작업의 "README 반영"을 그 작업의 커밋에서 고친다.
- `package.json` **1.20.0**은 RR10 커밋에서 올린다. Astryx 버전(0.7.13)은 올리지 않는다(npm에 0.7.15가 있지만 이 PLAN의 확인은 전부 0.7.13이다 — 올리는 것은 따로).
- PR 본문에 `Closes #48`.
- 실기기 확인(구현자가 못 하면 DEV-RECORD에 "사람 확인 필요") — 홈 화면 앱에서:
  ① 폰을 라이트 ↔ 다크로 바꾸면 앱 전체가 따라 바뀐다(홈·세션·요약·식단·기록·분석·설정). 글자가 묻힌 곳이 있으면 화면과 자리를 적는다
  ② 헬스장에서 세션 하나를 끝까지: ✓ 1탭으로 세트가 완료되고 휴식 바가 뜬다. `+`·`−`가 한 번에 한 단계씩만 오른다. 목록을 끌어 스크롤할 때 손가락 아래 `+`·`−`·✓가 눌리지 않는다
  ③ 팔 뻗은 거리에서 세트 행의 무게·횟수, 휴식 남은 시간이 읽힌다. 땀 난 손가락으로 ✓와 `+`·`−`가 한 번에 눌린다(작으면 그렇게 적는다 — 고칠 자리는 테마다)
  ④ 숫자 칸을 눌러 직접 입력: 키패드가 숫자(무게는 소수점 있음)로 뜨고 화면이 확대되지 않는다. 메모 칸에서도 확대되지 않는다
  ⑤ 아래 탭 다섯이 엄지로 한 번에 눌린다. 띠의 위·아래 가장자리를 눌러도 탭이 바뀐다
  ⑥ 시트(종료·대체·보상작용·무게 단위)가 아래에서 올라오고, 끌어내리거나 막을 누르면 내려가며 닫힌다. 키보드가 올라와도 입력칸이 가리지 않는다
  ⑦ 세션을 최소화하고 식단 탭에 갔다가 재개 줄로 돌아온다. 그 사이 휴식이 끝나면 소리가 난다(타이머 단일 소유)
  ⑧ 비행기 모드에서 앱을 완전히 닫았다 연다: 홈이 뜨고 세션을 시작·기록·종료할 수 있다
  ⑨ 앱을 완전히 닫았다 열 때 첫 화면이 뜨기까지 v1.19보다 눈에 띄게 느린가(느리면 대략 몇 초인지)
  ⑩ "동작 줄이기"를 켜면 시트·눌림의 움직임이 줄고, 휴식 진행 막대는 계속 간다
  ⑪ "대비 증가"를 켜면 글자·선이 더 또렷해지고(유리를 남겼으면 유리가 불투명해진다) 깨지는 화면이 없다
  ⑫ (유리를 남겼으면) 홈을 스크롤하며 아래 띠 뒤를, 세션을 스크롤하며 상단 바 뒤를 본다 — 라이트와 다크 각각. 저전력 모드에서 한 번 더

리뷰 단위: 작업별 — 앱 뿌리의 CSS 범위(RR1), 전 화면의 색(RR2), 화면 다섯 묶음과 시트 열 개(RR3~RR9)가 서로 다른 파일을 건드리고 각각 실제로 쓰는 화면을 통째로 다시 그린다. RR7(세트 입력)은 따로 꼼꼼히 봐야 하고, RRT·RRM은 사람의 선택이 들어간 뒤라 따로 본다.

---

## 사람이 정할 것

둘 다 스크린샷을 보고 고르는 것이다. 답이 오기 전에도 RR0~RR9는 진행할 수 있고, 답은 RRT·RRM에만 쓰인다.

**1. 테마** — `docs/screenshots/v1.20/candidates/theme-home.png`, `theme-session.png` (낱장은 `candidates/theme/`)

| 선택지 | 한 줄 |
|---|---|
| A. Neutral | 지금 루틴 편집 화면과 같은 무채색. 새 의존성 없음 |
| B. Stone | 차가운 회청색, 알약 모양 버튼. 테마 패키지 하나 추가 |
| **C. Neutral + 주황 강조 (추천)** | A에 강조색만 주황. 새 의존성 없음 |
| 그 밖 | `candidates/all-themes-home-dark.png`의 다른 테마를 가리키면 그것으로 |

추천 C: 헬스장에서 흘끗 볼 때 주 동작(시작·건너뛰기)과 진행(막대·오늘·완료)이 색으로 먼저 눈에 들어온다. A·B는 주 버튼이 흰색/검정이라 옆의 보조 버튼과 밝기로만 갈린다. 지금 앱의 인상(주황, 불꽃)이 이어지고, 주황은 앱 CSS가 아니라 테마 안에 있어서 DESIGN 9.1의 "앱이 고정하는 색은 없다"를 지킨다. C가 싫으면 A가 가장 위험이 적다(지금 깔린 그대로).

**2. 띠와 시트의 재질** — `docs/screenshots/v1.20/candidates/material-dark.png`, `material-light.png` (낱장은 `candidates/material/`)

| 선택지 | 한 줄 |
|---|---|
| 유리를 남긴다 | 지금처럼 띠·시트 뒤가 흐리게 비친다. 라이트용 값을 새로 잡고, 유리 CSS·검사·진단 줄을 계속 가진다 |
| **Astryx 표면으로 (추천)** | 띠·시트가 불투명한 테마 표면. 유리 CSS·검사·진단 줄을 지운다 |

추천 표면: ① 유리는 테마 밖에서 앱이 따로 맞추는 값이라 "모양은 테마 한 벌이 정한다"에서 혼자 벗어나고, 라이트·다크 두 벌을 검사로 지켜야 한다. ② v1.18·v1.19 두 번에 걸쳐 iOS에서 흐림이 기대와 다르게 그려졌고 실기기에서만 확인된다. ③ 스크린샷에서 다크의 차이는 작다(띠 뒤로 글자가 어렴풋이 지나가는 정도). 유리의 깊이감이 좋으면 남기면 된다 — 그 경우 할 일은 RRM의 "유리" 줄이고, 실기기 확인 ⑫가 붙는다.

**알려 둘 것** (정하는 것이 아니라 설계자가 정한 것 — 뒤집으려면 말하면 된다)

- 식단·기록·분석·설정을 옮기지 않지만 **색은 테마를 따르게 했다**(RR2). 안 하면 라이트 모드에서 탭을 누를 때마다 밝기가 뒤집힌다.
- 끝 기준 4("세 숫자가 작업마다 줄어든다")는 화면 파일을 고치는 작업에서만 성립한다. 도구·색 다리·테마·재질·정리 작업(RR0·RR2·RRT·RRM·RR10)에서는 "늘지 않는다"다.
- 세트 행의 숫자와 버튼의 **보이는** 크기가 지금보다 작아질 수 있다(Astryx 기본 크기를 쓴다 — DESIGN 9.1의 4). 누르는 영역은 Astryx가 넓힌다. 화면 검증과 실기기 확인 ③에서 작다고 판단되면 테마 한 곳(`theme.ts`)에서 키운다.
