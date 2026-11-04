# 개발·테스트 내역 (검토용) — v1.12 (JJ) · 2026-11-04

> PLAN-v1.12의 구현 기록. 골든 커밋 + JJ1부터 이어서 쓴다 (JJ2·JJ3은 해당 작업 때 같은 파일에 덧붙인다).

## 이 환경에서 확인된 제약 (누적 — v1.11.2 목록을 이어받는다)


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


## JJ1. 세션이 적용된 조정률과 계획 세트 수를 기억한다

### 범위

| 커밋 | 내용 | 바뀐 파일 |
|---|---|---|
| `21ba3d8` | 골든만: `JJ_BUILD_GOLDEN`(6경우×7종목)·`JJ_EXPORT_NORMAL_BEFORE`(normal 3픽스처). v1.11.2 코드 그대로, 이후 고치지 않음 | `src/lib/v112.test.ts`(신설) |
| JJ1 (이 커밋) | `SessionAdjust`·`Session.modeAdjust`·`SessionEntry.plannedSets`, `setPlan.ts` 신설, `workSetRows`, `buildSession`이 초크포인트를 쓰고 두 필드를 저장 | `src/types.ts` · `src/lib/setPlan.ts`(신설) · `src/lib/derive.ts` · `src/lib/sessionFactory.ts` · `src/lib/v112.test.ts` · 이 문서 |

- 기존 테스트 수정 없음. `DELOAD_SET_PCT`는 `sessionFactory.ts`에서 `setPlan.ts`로 옮겼고 다른 import처는 없었다.
- 골든의 시각 `[HH:MM–HH:MM, N분]`은 실행 환경 시간대를 따르므로 `[시각, N분]`으로 치환해 비교한다(TZ=America/New_York에서도 통과 확인). `oneUnchecked`와 `rowDeleted` 출력은 같다 — 미체크 행과 삭제된 행은 내보내기에서 둘 다 빠지는 현행 동작이다.

### PLAN 검증 항목 ↔ 테스트

| PLAN 검증 | 테스트 (`v112.test.ts`) |
|---|---|
| `adjustedSetCount` 격자 · 7종목 22→15 | `JJ1 › adjustedSetCount: 격자…` · `…보고서 0절 표 7종목…` |
| 생성 불변 (골든) | `JJ1 — 생성 불변 (골든)` |
| `modeAdjust` 저장 | `JJ1 › modeAdjust 저장` 4건 (+ `modeAdjustFor` 1건) |
| `plannedSets` 저장 | `JJ1 › plannedSets 저장` 2건 |
| `plannedSets` 보존 | `JJ1 › plannedSets 보존` 3건 (대체·Day 변경·얹기) |
| `resolveSessionAdjust` | `JJ1 › resolveSessionAdjust` 8건 (none·저장값 우선·사본 불변·deload·21/35/60일·미전달·10일·유산소/자기 제외) |
| `entrySetPlan` | `JJ1 › entrySetPlan` 6건 |
| 루틴 변경 뒤에도 그날 P (회귀) | `JJ1 › 루틴 변경 뒤에도 그날 P가 남는다 (회귀)` |
| `sessionSetPlan` | `JJ1 › sessionSetPlan` 5건 |
| 소스 스캔 | `JJ1 › 소스 스캔` 4건 |
| (JJ2 검증) normal 불변 골든 | `JJ2 — normal 불변 (골든)` — JJ2 구현 전에 이미 통과 상태로 고정 |

### 결함 복원 (JJ1 해당 ①②③⑦⑧; ④⑤⑥은 JJ2·JJ3)

| # | 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|---|
| ① | `sessionFactory.ts`에 `Math.max(1, Math.round(…(1 + setPct / 100)))` 복원 | 소스 스캔 2건 (골든은 식이 같아 통과 — 스캔이 막는 결함) | `cmp` 같음 |
| ② | `modeAdjust` 저장을 지움 | `modeAdjust 저장`·`resolveSessionAdjust`·`루틴 변경` 등 6건 이상 | `cmp` 같음 |
| ③ | `resolveSessionAdjust`에서 저장값을 되짚기 뒤로 | `저장값이 되짚기보다 우선` · `루틴 사본…결과가 같다` | `cmp` 같음 |
| ⑦ | `plannedSets` 저장을 지움 | `plannedSets 저장`·`보존`·`루틴 변경`·`sessionSetPlan`·스캔 7건 | `cmp` 같음 |
| ⑧ | `entrySetPlan`이 루틴 `sets`를 먼저 읽게 | `루틴 변경 뒤에도 그날 P가 남는다` · `plannedSets ??` 스캔 | `cmp` 같음 |

### 실행 결과

- `npm test`: Test Files 53 passed (53), Tests 1135 passed (1135) — 이 중 `v112.test.ts` 38건
- `npm run build`: 성공 (`✓ built in 3.89s`)
- 과거 판정 불변: `JJ_BUILD_GOLDEN`(6경우 전 칸)·`JJ_EXPORT_NORMAL_BEFORE`(3픽스처 전문) 일치, 골든 커밋 `21ba3d8`

### 하지 않은 것

- 내보내기·종료 시트 문구(JJ2·JJ3), v111 ② `after()` 필터, `package.json` 버전 — PLAN 순서상 후속 작업/기록 커밋.


---


## JJ2. 지나간 세션의 내보내기가 계획·생성·완료를 말한다

### 범위

| 커밋 | 내용 | 바뀐 파일 |
|---|---|---|
| JJ2 (이 커밋) | `sessionAdjustText`·`entrySetLine`(문구는 `setPlan.ts` 한 곳), `sessionToMarkdown(…, sessions?)`, 헤더 다음 줄·종목 반복 줄 다음 줄, v111 ② `after()` 필터 | `src/lib/setPlan.ts` · `src/lib/exportMarkdown.ts` · `src/lib/v111.test.ts` · `src/lib/v112.test.ts` · 이 문서 |

- 기존 테스트 수정: v111 `after()`가 `복귀 조정:`·`세트:` 줄을 거른다 (주석 `JJ2(PLAN-v1.12)가 더한 줄 …`). 단언 본문은 그대로.
- **PLAN 수치 정정:** 디로드 예시 `22세트 → 11세트`는 `ROUTINE` d1에서 `adjustedSetCount`를 종목별로 적용하면 **13세트**다(P 3 → round(1.5)=2 등 종목별 반올림 합). 식은 PLAN 그대로이고 예시의 산수만 어긋나 테스트는 13으로 단언한다. 복귀 22→15는 PLAN과 같다.

### PLAN 검증 항목 ↔ 테스트 (`describe JJ2`)

| PLAN 검증 | 테스트 |
|---|---|
| 08-26 재현 | `08-26 재현: 저장값 없음 + 21일 전 근력 세션 …` |
| 두 규칙 독립 (modeAdjust만) | `modeAdjust만 저장 → 공백 재계산 문구 없음 …` |
| modeAdjust + plannedSets | `modeAdjust + 전 entry plannedSets → 계획 22세트 …` |
| sessions 없이 | `sessions 없이(저장값 없음) → 기록 없음 …` |
| 디로드 저장 / 저장 없음 | `디로드(buildSession, 저장값 {−50,0}) …` · `저장값 없는 디로드 → (재계산)` |
| step 없는 복귀 | `step 없는 복귀({0,0} 저장) …` |
| 루틴 변경 (회귀) | `루틴 변경 (회귀) …` (종료 시트 한 줄은 JJ3에서) |
| 계획 1세트 · normal undefined · 행 추가 | `계획 1세트 종목 …` · `entrySetLine(plan, "normal") → undefined` · `복귀에서 행을 더해 …` |
| 얹은 종목 · skipped · 워밍업만 | `얹은 종목 …` · `skipped 종목 …` · `워밍업만 체크한 종목 …` |
| normal 불변 (골든) | `JJ2 — normal 불변 (골든)` (JJ1에서 고정, 통과 유지) |
| 08-26 diff: 1줄 + 7줄 | `08-26 픽스처 diff …` |
| 소스 스캔 | `JJ2 › 소스 스캔` 2건 |

### 결함 복원 (④⑥⑦)

| # | 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|---|
| ④ | `exportMarkdown`이 `sessions`를 넘기지 않음 | `08-26 재현` · 소스 스캔 `sessions를 넘긴다` | `cmp` 같음 |
| ⑥ | `exportMarkdown.ts`에 `'복귀 조정'` 리터럴 | 12건 (골든·재현·스캔 등) | `cmp` 같음 |
| ⑦ | `buildSession`에서 `plannedSets` 저장 지움 | 11건 (JJ1 저장·보존, JJ2 `루틴 변경`·`modeAdjust + plannedSets` 등) | `git status`로 `sessionFactory.ts` 무변경 확인 |

### 실행 결과

- `npm test`: Test Files 53 passed (53), Tests 1152 passed (1152)
- `npm run build`: 성공 (`✓ built in 3.95s`)
- 과거 판정 불변: `JJ_BUILD_GOLDEN`·`JJ_EXPORT_NORMAL_BEFORE` 일치, `GG1_GOLDEN`(v111) 통과

### 하지 않은 것

- 종료 시트(JJ3), `package.json` 버전. 이 PLAN의 "08-26 픽스처의 v1.11.2 출력 diff" 대조는 `fieldSession`(3종목)이 아니라 `ROUTINE` d1 7종목 복귀 세션으로 했다(`세트:` 7줄 + `복귀 조정:` 1줄 추가뿐).
