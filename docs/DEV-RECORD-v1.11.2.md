# 개발·테스트 내역 (검토용) — v1.11.2 (II) · 2026-11-04

> PLAN-v1.11.2의 구현 기록. II1~II3 + 기록.

## 이 환경에서 확인된 제약 (누적 — v1.11.1 목록을 이어받는다)


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
    긴 테스트 코드·스크립트는 **파일로 먼저 쓰고**(scratchpad) 그 파일을 실행·`cat >>`한다.


---

## II. 내보내기 식단 마크를 화면과 맞춘다 (II1·II2·II3 + 기록)

### 범위

| 커밋 | 내용 | 바뀐 파일 |
|---|---|---|
| `8fabc5d` | II1 슬롯 마크를 `slotGrade`·`SLOT_MARK`로 | diet.ts · exportMarkdown.ts · v1112.test.ts |
| `696ddd5` | II2 하루 헤더를 `dietDayStatusText`로 | diet.ts · DietDayEditor.tsx · exportMarkdown.ts · v1112.test.ts |
| `de8f125` | II3 머리에 범례 두 줄 (`dietMarkLegend`) | diet.ts · exportMarkdown.ts · v1112.test.ts |
| 이 커밋 | 기록 · `package.json` 1.11.2 · 리뷰 반영 2건 | DEV-RECORD · package.json · v1112.test.ts · exportMarkdown.ts |

새 테스트 파일 `src/lib/v1112.test.ts` 1개, 29건. 전체 52 파일 / 1097 테스트.

### 리뷰 반영

| 지적 | 처리 |
|---|---|
| `v1112.test.ts` II2 주석이 PLAN 픽스처를 잘못 설명 | 주석을 바로잡고 PLAN 픽스처 단언 추가: `breakfast·lunch·afternoon·dinner`만 안 먹음(shake 기록 없음) → 각 슬롯 0.5 → `준수 ◐ 50%`. PLAN 그대로 맞다 |
| `exportMarkdown.ts` "간격" 캡션 주석이 `head`에서 멀다 | 주석을 `const head` 바로 위로 옮김 (동작 무변경) |

### PLAN 검증 항목과 테스트 (v1112.test.ts)

| 묶음 | 대응 |
|---|---|
| `II1` | 보고서 사례 ◕ · 보충 블록 안 먹음 ◔ · 주식을 빼면 ◔ · 내보내기와 화면이 같은 마크 |
| `II1 — 소스 스캔` | 슬롯 마크 글자·점수 비교 없음 · `slotGrade`에 임계값 리터럴 없음 |
| `II2` | `dietDayStatusText` 판정 있음(● 100% · ◐ 50% · ○ 45%) · 3슬롯 미만 `기록 n/m슬롯` · 반올림 경계 · 내보내기 헤더 보고서 사례(1슬롯) |
| `II2 — 소스 스캔` | 화면과 내보내기가 하루 문구를 직접 만들지 않는다 |
| `II3` / `II3 — 소스 스캔` | 식단 있을 때만 범례 두 줄 · 식단 없는 내보내기 불변 · `dietMarkLegend`에 마크 글자·임계 숫자 리터럴 없음 |

### 결함 복원 (5건 모두 `cp` 백업 → 되살림 → 실패 확인 → 복구 → `cmp` 동일)

| # | 되살린 결함 | 실패한 테스트 |
|---|---|---|
| ① | `exportMarkdown.ts`에 로컬 3단 마크 계산 복원 | `보충 블록 안 먹음은 ◔` · `주식을 빼면 ◔` · `내보내기와 화면이 같은 마크를 쓴다` · `exportMarkdown에 슬롯 마크 글자와 점수 비교가 없다` (4건) |
| ② | `slotGrade`의 `SLOT_GRADE_HIGH`를 `0.8` 리터럴로 | `slotGrade에 임계값 리터럴이 없다` |
| ③ | `DietDayEditor.tsx`에 원래 삼항식 복원 | `화면과 내보내기가 하루 문구를 직접 만들지 않는다` |
| ④ | 내보내기 헤더를 `준수 ${ADHERENCE_MARK[...]}`로 | 헤더 테스트 다수 (`플랜·훈련일·준수·단백질을 헤더에 담는다` 외) |
| ⑤ | `dietMarkLegend`의 한 퍼센트를 `80%` 리터럴로 | `dietMarkLegend에 마크 글자와 임계 숫자 리터럴이 없다` |

복구 후 `git status`는 이 커밋의 의도된 변경만 보인다.

### 과거 판정 불변 확인

범위: 테스트 픽스처(번들 식단 플랜 4종)로 한정한다.

| 확인 | 결과 |
|---|---|
| ① `diet.test.ts`·`v19.test.ts`·`dietExport.test.ts` 수정 없이 통과 | 통과 (이 3개 파일은 `git diff main`에 없다) |
| ② `export.test.ts`·`v111.test.ts`(골든)·`v1111.test.ts` 수정 없이 통과 | 통과 (diff 없음). ①②의 6개 파일 합계 236 테스트 |
| ③ `git diff main -- src/lib/diet.ts` | 상수 2개 추가 · `slotGrade` 리터럴 치환 · `dietDayStatusText`·`dietMarkLegend` 추가뿐. `slotScore`·`baseSlotScore`·`summarizeDietDay`·`ADDITION_CAP`·`SCORE` 무변경 |
| ④ 바뀌는 것 | PLAN "과거 판정 불변" 표의 다섯 자리 (◕ 신설 · ◔ 신설 · 하루 헤더 퍼센트 · 3슬롯 미만 문구 · 범례 2줄) |

③의 diff (diet.ts 전체, 점수 함수 줄 없음):

```diff
+/** `slotGrade`의 임계값 — 범례 등 다른 표시도 이 이름으로 같은 값을 말한다 */
+export const SLOT_GRADE_HIGH = 0.8
+export const SLOT_GRADE_MID = 0.45
+
 export function slotGrade(score: number | null): SlotGrade {
-  if (score >= 0.8) return 'high'
-  if (score >= 0.45) return 'mid'
+  if (score >= SLOT_GRADE_HIGH) return 'high'
+  if (score >= SLOT_GRADE_MID) return 'mid'
+export function dietDayStatusText(summary: DietDaySummary): string { … }   // 화면 문구를 그대로 옮김
+export function dietMarkLegend(): string[] { … }                          // 상수·마크 표에서 생성
```

### 실행 결과

```
Test Files  52 passed (52)
Tests  1097 passed (1097)
npm run build: ✓ built in 4.64s
git rev-list --count main..HEAD: 6   (PLAN 2 + 구현 3 + 기록 1)
```

### 하지 않은 것

PLAN "범위 제외" 전부. `package.json` 외 버전 표기 변경 없음. 실기기 확인: 식단 있는 기간을 내보내 머리 범례 2줄과 하루 헤더 퍼센트를 확인한다.
