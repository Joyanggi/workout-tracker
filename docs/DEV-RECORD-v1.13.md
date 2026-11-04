# 개발·테스트 내역 (검토용) — v1.13 (KK) · 2026-11-04

> PLAN-v1.13의 구현 기록. KK1부터 이어서 쓴다 (KK2~KK5는 해당 작업 때 같은 파일에 덧붙인다).

## 이 환경에서 확인된 제약 (누적 — v1.12 목록을 이어받는다)


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

---

## KK1. 복귀 무게 규칙: 기구에 있는 무게만 쓴다

### 범위

| 커밋 | 내용 | 바뀐 파일 |
|---|---|---|
| KK1 (이 커밋) | `ReturnWeightRule`·`gapDaysMin`·`weightRule`, `SessionAdjust.weightRule/targetRIR`, `SessionEntry.returnWeight`, `stepBelow`, `returnWeightFor`·`returnWeightRuleOf`·`returnStepText`, `returnStepFor` 경계, `buildSession` 복귀 무게, `applySubstitute`가 `returnWeight` 지움, 홈 배너, `validateRoutine` 7번, 시드 `seedRevision` 3, README·DESIGN | 아래 17개 |

바뀐 파일: `src/types.ts` · `src/data/routine-v2.4.json` · `src/lib/{setPlan,sessionFactory,sessionOps,suggestNextDay,weightScale}.ts` · `src/db/validateRoutine.ts` · `src/screens/HomeScreen.tsx` · `README.md` · `docs/DESIGN.md` · `src/lib/{prefill,suggestNextDay,seedRevision,v112}.test.ts` · `src/lib/v113.test.ts`(신설) · 이 문서.

- `roundToHalf`는 `sessionFactory.ts`에서 지웠다(`substitute.ts`의 같은 이름은 별개).
- **PLAN 밖이지만 KK1이 필요로 한 것 (KK2에서 이어받는다):** `LEGACY_RETURN_PROTOCOL`과 `resolveSessionAdjust` 되짚기가 이 표를 읽는 부분(옛 경계 `공백/7 >= gapWeeksMin`). 이게 없으면 KK1이 단계 값을 바꾸는 순간 JJ 이전 세션 되짚기(v112 테스트 4건)가 `무게 −5%`를 잃는다. 값은 지금까지와 같다. 문구(`(당시 규칙)`, `반복 N회`)·`ResolvedAdjust` 사용은 KK2다. `routine` 인자는 `_routine`으로 남겼다.
- **골든 커밋(`FIELD_1104`·`KK_EXPORT_BEFORE`)은 이 작업에 없다.** KK1 검증이 쓰지 않는다(KK2~KK5가 쓴다). 지정받은 작업이 KK1뿐이라 만들지 않았다.
- `package.json` 버전은 올리지 않았다(PLAN: 기록 커밋에서 1.13.0).

### 기존 테스트 수정 (PLAN 수정표)

| # | 파일 · 자리 | 수정 |
|---|---|---|
| ① | `prefill.test.ts` "복귀 모드는 세트를 깎고…" | 기대 32 → 30, 주석 `KK1(PLAN-v1.13)` |
| ② | `prefill.test.ts` P0-1 (인클라인 `returnProtocol[0]`) | 기대 38 → 40, 주석 |
| ③ | `prefill.test.ts` `describe('roundToHalf')`·import | 삭제 |
| ④ | `suggestNextDay.test.ts` 28일 | 4 → 2, 29 → 4 단언 추가 |
| ⑤ | `v112.test.ts` `modeAdjustFor('return')`·`modeAdjust 저장` 2건·`저장값 … 우선` | 기대값을 KK1 모양으로 (단언의 뜻 그대로) |
| ⑥ | `v112.test.ts` `JJ_BUILD_GOLDEN` 비교 | `return1~3` 칸은 무게를 빼고 비교. 골든 데이터 그대로 |
| ⑩ | `seedRevision.test.ts` | 리비전 3, 해시 `9f679e9d` |
| (표 밖) | `suggestNextDay.test.ts` "14일 이상 공백이면 …" `toEqual` | 2단계 객체 리터럴을 새 배포 값으로. **같은 원인(배포 단계 값 변경)**이라 고쳤고, 설계와 어긋난 것은 아니다 — 리뷰어 확인 요청 |
| (표 밖) | `v112.test.ts` JJ2 "modeAdjust + 전 entry plannedSets"·JJ3 "08-26 픽스처" 문구 | `buildSession` 산출(1단계 무게 유지)이라 `무게 −5%`가 빠진 현행 문구로. KK2가 문구를 바꿀 때 다시 고친다(⑧) |

⑦·⑧(문구)·⑨는 KK2·KK4 몫이라 건드리지 않았다.

### 테스트 이름과 PLAN 검증 항목 (`v113.test.ts` describe `KK1`, 38건)

| PLAN 검증 | 테스트 |
|---|---|
| 배포 `returnProtocol` 고정 | `배포 returnProtocol` |
| `returnStepFor` 배포·옛 루틴 | `returnStepFor 경계` 2건 |
| `returnWeightRuleOf` | `returnWeightRuleOf` 2건 |
| `stepBelow` | `stepBelow` 3건 |
| `returnWeightFor` (keep·oneStep·pctSnapDown·어시스티드·격자) | `returnWeightFor` 6건 |
| `buildSession` 1·2·3단계, 단위 5, deload/normal, 0kg, 기록 없는 종목(+기록 추가), 사다리 최하단 | `buildSession 복귀 무게` 9건 |
| `modeAdjust` 저장 | `modeAdjust 저장` |
| `returnWeight` 저장 · Day 변경 · 대체 · 얹기 | `returnWeight 저장` 3건 |
| 홈 배너 문구 | `홈 배너 문구` |
| `validateRoutine` | `validateRoutine 복귀 단계` 6건 |
| 소스 스캔 | `소스 스캔` 4건 |

### 결함 복원 (PLAN ①②③④⑦⑪⑫ — ⑤⑥는 KK2, ⑧⑨⑩⑬는 KK3~KK5)

| # | 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|---|
| ① | `sessionFactory`가 반올림 곱셈으로 복원 | 1·2·3단계 무게, 단위 5, 기록 추가, 어시스티드, 소스 스캔 (5건) | `cmp` 같음 |
| ② | `returnStepFor`를 `gapDays / 7 >= gapWeeksMin`으로 | `returnStepFor 경계` 28 → 1단계 | `cmp` 같음 |
| ③ | `returnWeightFor` oneStep의 `inverse` 분기 삭제 | `returnWeightFor` 어시스티드 | `cmp` 같음 |
| ④ | `stepBelow`를 `current − step`으로 | `stepBelow` 31 → 30 | `cmp` 같음 |
| ⑦ | `applySubstitute`의 `returnWeight: undefined` 삭제 | `returnWeight 저장` 대체 단언 | `cmp` 같음 |
| ⑪ | `returnWeight` 조건의 `baseMax > 0` 삭제 | 0kg 종목 `returnWeight` 키 없음 | `cmp` 같음 |
| ⑫ | `applies`의 `startEstimate === undefined` 삭제 | 기록 없는 종목 2건 | `cmp` 같음 |

### 과거 판정 불변 (범위: 배포 `routine-v2.4.json`·Phase 1·테스트 픽스처)

- `GG1_GOLDEN`·`JJ_BUILD_GOLDEN`(normal·deload·returnNoStep 전 칸, return 칸은 행 수·반복)·`JJ_EXPORT_NORMAL_BEFORE` 일치 — v112 테스트가 통과한다(골든 데이터 무변경, 골든 커밋 `21ba3d8`).
- JJ 이전 복귀 세션 되짚기(21일 → −30/−5, 35일 → −40/−10, 60일 → −50/−20)가 값 그대로 — `LEGACY_RETURN_PROTOCOL`.
- 바뀌는 것: PLAN "과거 판정 불변" 표 중 KK1 행(새 복귀 세션 무게 · 정확히 28일 단계 · 저장값 · 배너 · seedRevision).

### 배포 영향

- `seedRevision` 3: 다음 실행 때 저장된 루틴이 배포 루틴으로 교체된다. 루틴 가져오기로 넣은 루틴도, Gist 백업에서 복원한 옛 루틴도(설정 `seededRoutineRevision`이 같이 복원되므로) 같은 경로로 교체된다.

### 실행 결과

```
Test Files  54 passed (54)
Tests  1201 passed (1201)
npm run build: 성공 (tsc -b && vite build, precache 24 entries)
```

---

## KK2. 복귀 세션이 실제 적용분과 여유 반복을 말한다

### 범위

| 커밋 | 내용 | 바뀐 파일 |
|---|---|---|
| `5b187e1` (골든, KK2 앞) | `FIELD_1104`(보고서 0절 11세션·식단 5건)·`KK_EXPORT_BEFORE`(**v1.12 코드 `609072f`를 별도 worktree에 체크아웃해** `exportMarkdown`으로 뽑은 전문). 이후 고치지 않는다 | `v113.test.ts` |
| KK2 (이 커밋) | `sessionAdjustText` KK 문구·`(당시 규칙)`, `entryWeightLine`, `sessionReturnRirText`, 내보내기 `무게:` 줄, 카드 `modeIntensity` 칩 | `setPlan.ts` · `exportMarkdown.ts` · `ExerciseCard.tsx` · `SessionScreen.tsx` · `v112.test.ts` · `v113.test.ts` · 이 문서 |

- KK1이 이미 넣어 둔 것(`LEGACY_RETURN_PROTOCOL`, `resolveSessionAdjust` 되짚기, `returnWeightText`·`returnRirText`·`returnStepText`)은 재구현하지 않았다.
- 골든은 KK1 커밋 뒤에 들어갔다(KK1 세션에 없었기 때문). 골든 값은 `609072f` 코드로 뽑았으므로 순서와 무관하다.
- `FIELD_1104`의 08-03은 체크 0 + 유산소 30분, 복귀 3건은 저장값 없음(JJ 이전 모양), 08-12는 슬롯 없는 식단 레코드.

### 기존 테스트 수정 (PLAN 수정표 ⑦⑧)

| # | 자리 | 수정 |
|---|---|---|
| ⑦ | `v112.test.ts` JJ2 "08-26 재현"·"modeAdjust만 저장" | `무게 −5%` 뒤 ` (당시 규칙)` 삽입, 주석 `KK2(PLAN-v1.13)` |
| ⑧ | `v112.test.ts` JJ2 "modeAdjust + 전 entry plannedSets"·JJ3 "08-26 픽스처" | `buildSession` 1단계 헤더 리터럴을 `세트 −30% · 무게 유지 · 반복 3회 남기기`로 |

### 테스트 이름과 PLAN 검증 항목 (`v113.test.ts` describe `KK2`, 20건)

| PLAN 검증 | 테스트 |
|---|---|
| 헤더 1·2·3단계 | `헤더` 3건 |
| v1.12 모양 · JJ 이전 21일 · 28일 · 루틴 `[]` 불변 · 디로드/step 없음 | `헤더` 5건 |
| `entryWeightLine` (2단계 40/37.5·사다리·어시스티드·undefined 계열) | `entryWeightLine` 4건 |
| 종목 블록 순서 | `entryWeightLine` 1건 |
| `sessionReturnRirText` | `sessionReturnRirText` 3건 |
| 종료 시트 = 헤더 다음 줄 | `종료 시트 = 내보내기` |
| 소스 스캔 3종 | `소스 스캔` 3건 |

- 스캔 예외: `HomeScreen.tsx`의 디로드 배너 `디로드 권장 — 세트 50%, 무게 유지`는 복귀 문구가 아니라 스캔에서 그 문구만 제외했다(PLAN은 `무게 유지` 리터럴 없음으로 적었으나 기존 디로드 배너와 충돌 — 리뷰어 확인 요청).

### 결함 복원

| # | 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|---|
| ⑤ | 되짚기 무게를 현재 루틴에서 읽게 | `JJ 이전 모양(21일)`·`공백 28일` | `cmp` 같음 |
| ⑥ | `(당시 규칙)` 조건 삭제 | `v1.12 모양`·`JJ 이전 21일`·`28일` | `cmp` 같음 |
| (추가) | 내보내기 `무게:` 줄 삽입 삭제 | `종목 블록 순서` | `cmp` 같음 |

### 과거 판정 불변

`KK_EXPORT_BEFORE`와 새 출력(`renderFieldExport()`)의 diff — 줄 3개뿐(08-26·09-21·10-06 헤더 다음 줄):

```
- 복귀 조정: 세트 −30% · 무게 −5% (공백 21일로 재계산) — …
+ 복귀 조정: 세트 −30% · 무게 −5% (당시 규칙) (공백 21일로 재계산) — …
(24일·14일도 같은 모양)
```

### 실행 결과

```
Test Files  54 passed (54)
Tests  1222 passed (1222)
npm run build: 성공
```

### 하지 않은 것

- 실기기에서 카드 칩 확인(RTL 없음 — 소스 스캔과 `sessionReturnRirText` 순수 함수로만 잠금).

---

## KK3. Day별 마지막 수행일을 보인다

### 범위

| 커밋 | 내용 | 바뀐 파일 |
|---|---|---|
| KK3 (이 커밋) | `src/lib/dayGap.ts` 신설(`dayLabel` 이동·`dayLastDone`·`lastDoneText`·`staleDaysLine`), 홈 카드 `today-sub` 한 줄, Day 선택 시트 `lastDone` prop | `src/lib/dayGap.ts`(신설) · `src/lib/exportMarkdown.ts` · `src/screens/HomeScreen.tsx` · `src/components/DayPickerSheet.tsx` · `src/lib/v113.test.ts` · 이 문서 (6개) |

- 기존 테스트 수정 없음. `dashboard.ts` `judgeable` 줄 무변경(`git diff --stat -- src/lib/dashboard.ts` 출력 없음).
- 홈 카드는 KK4 `dayGapNotice`가 아직 없어 이 줄만 추가한다(KK4에서 그 줄이 먼저 오게 한다).

### 테스트 이름과 PLAN 검증 항목 (describe `KK3`, 14건)

| PLAN 항목 | 테스트 |
|---|---|
| `dayLastDone` @ 11-04 | `dayLastDone @ 11-04: …` |
| `staleDaysLine` 11-04 · 10-29 · 10-16 | 같은 이름 3건 |
| fallback-pull | `표시가 fallback-pull이면 …` |
| 경계 13/14일 · 첫 세션 10/14일 | `경계: …` · `기록 없음 + 첫 근력 세션 …` |
| 주 4회 · 세션 없음/유산소만 | 2건 |
| `lastDoneText` | 1건 |
| 소스 스캔 4종 | `소스 스캔` 4건 |

### 결함 복원

| # | 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|---|
| ⑧ | `staleDaysLine`에서 첫 세션 14일 조건 삭제 | `첫 근력 세션 10일 전…` · `주 4회 픽스처…` | `cmp` 같음 |
| (추가) | 기록 없음/일수 정렬 순서 반전 | 2건 실패 | `cmp` 같음 |

### 실행 결과

```
Test Files  54 passed (54)
Tests  1236 passed (1236)
npm run build: 성공
```

### 하지 않은 것

- 실기기에서 카드 줄·시트 문구 확인(RTL 없음).

---

## KK4. 정상 세션이 그 Day 자체의 긴 공백을 말한다 · 세트 부족 보류 사유

### 범위

| 커밋 | 내용 | 바뀐 파일 |
|---|---|---|
| KK4 (이 커밋) | `dayGapNotice`·`sessionDayGapLine`(`dayGap.ts`), 홈 카드 `today-sub`(KK3 줄보다 위), `sessionToMarkdown` 헤더 다음 줄, `holdReasonText` `sets` 분기 끝에 ` — N세트로는 아직 시험 안 됨` | `src/lib/dayGap.ts` · `src/lib/exportMarkdown.ts` · `src/lib/progression.ts` · `src/screens/HomeScreen.tsx` · `src/lib/v113.test.ts` · `src/lib/v111.test.ts` · `src/lib/v1111.test.ts` · 이 문서 (8개) |

- 기존 테스트 수정은 PLAN ⑨뿐: `v111.test.ts` 6곳(408·412·417·558·589-591줄), `v1111.test.ts:103`. 모두 주석 `KK4(PLAN-v1.13)`.
- `v111.test.ts` 510·659·664줄(칩·`modeSetNotice`)과 `v112.test.ts` 638-639줄(`toContain`)은 문구가 바뀌지 않아 손대지 않았다.
- 홈 카드: 추가 줄 순서는 `dayGapNotice` → `staleDaysLine`. 복귀 제안 여부는 `Boolean(suggestion.returnStep)`.

### 테스트 이름과 PLAN 검증 항목 (describe `KK4`, 20건)

| PLAN 항목 | 테스트 |
|---|---|
| `dayGapNotice` 10-29 · 08-28 · 09-21 · own 13 · 기록 없음 · fallback-push · 13/14일 | `dayGapNotice` 7건 (`returnSuggested true면 …` 포함) |
| `sessionDayGapLine` 5개 날짜 · 없음 목록 · `sessions` 없음/디로드 · 복귀를 끈 정상 세션 · 줄 위치 | `sessionDayGapLine` 8건 (내보내기 전문 Day 공백 5줄 포함) |
| `holdReasonText` 복귀·정상·디로드 / reps·compensation·phase0 | `holdReasonText 세트 부족` 2건 |
| 소스 스캔 | `소스 스캔` 3건 |
| `GG1_GOLDEN` · `JJ_EXPORT_NORMAL_BEFORE` | 기존 `v111`·`v112` 테스트가 그대로 통과 (수정 없음) |

### 결함 복원

| # | 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|---|
| ⑨ | `dayGapNotice`의 `returnSuggested` 가드 삭제 | `returnSuggested true면 …` | `cmp` 같음 |
| ⑬ | `sessionDayGapLine`의 `last >= 14` 가드 삭제 | `복귀를 끈 정상 세션 …` | `cmp` 같음 |

⑨는 PLAN이 말한 "09-21 실패"가 아니었다. 09-21은 `last >= 14` 가드가 같은 결과를 내서 가드를 지워도 통과한다. 테스트의 구멍이라 `returnSuggested: true`를 직접 넘기는 단언을 보강했다.

### 실행 결과

```
Test Files  54 passed (54)
Tests  1256 passed (1256)
npm run build: 성공
```

### 하지 않은 것

- 실기기에서 홈 카드 두 줄 확인(RTL 없음).
