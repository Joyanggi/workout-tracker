# 개발·테스트 내역 (검토용) — v1.14 (LL)

> PLAN-v1.14의 구현 기록. LL1부터 이어서 쓴다 (LL2~LL4는 해당 작업 때 같은 파일에 덧붙인다).

## 이 환경에서 확인된 제약 (누적 — v1.13 목록을 이어받는다)


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

## LL1. "보상작용 있음" 판정을 `hasCompensation` 한 곳으로

LL0 골든 커밋: `2bd9770`, 수정 커밋 `7b38cb7` (이후 고치지 않음).

| 항목 | 내용 |
|---|---|
| 바뀐 소스 | `compensation.ts`(`hasCompensation` trim·undefined 처리) · `progression.ts` · `compensationWatch.ts`(2곳) · `noteHistory.ts` · `phaseReadiness.ts` · `CompensationSheet.tsx`(`:79` 미리보기 색, `:100` 비우기 버튼) |
| 바뀐 테스트 | `v114.test.ts`(describe `LL1` 6건) · `uiConsistency.test.ts` X9(수정 ④) |
| README | 반영 없음 (PLAN: LL2에서 같이) |

| PLAN 검증 항목 | 테스트 |
|---|---|
| `hasCompensation` false 5종 / true 2종 | `hasCompensation: 없음·빈 문자열·공백·undefined는 false` · `…적힌 값은 true` |
| `judgeProgression` `''` → up, `'승모 개입'` → hold | `judgeProgression: … compensation '' → up` · `… '승모 개입' → hold compensation` |
| `LL_VERDICT_BEFORE` 일치 | `LL_VERDICT_BEFORE 일치 (08-28 레그 컬은 그대로 hold compensation)` |
| 소스 스캔 | `소스 스캔: compensation.ts 밖에 NO_COMPENSATION 직접 비교가 없다` |
| X9 새 식·정규식 비헛돎 | `uiConsistency` X9 두 건 (`:88-89`→`hasCompensation(current) &&` 한 단언, `:95` 정규식 교체 + `not.toBe('')`) |

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ① `progression.ts`를 `(args.compensation ?? NO_COMPENSATION) !== NO_COMPENSATION`으로 | `judgeProgression … '' → up` · `소스 스캔` | `cmp` 같음 |
| ⑪ `CompensationSheet.tsx:100`을 `(selected.length > 0 \|\| hasCompensation(current)) &&`로 | X9 두 건 둘 다 | `cmp` 같음 |

과거 판정 불변: `LL_VERDICT_BEFORE` 일치(08-28 레그 컬 hold compensation 그대로). 바뀌는 것은 보상작용이 빈 문자열·공백인 기록뿐(앱 입력으로는 안 생김).

수정표 밖 변경: 없음. 구현 중 `node:fs` import는 빌드 타입 오류라 `import.meta.glob ?raw`로 바꿨다(uiConsistency와 같은 방식).

실행: `Test Files 56 passed (56)` · `Tests 1335 passed (1335)` · `npm run build` 통과.

---

## LL2. 통증 칸 — 저장·입력·증량 보류

| 항목 | 내용 |
|---|---|
| 바뀐 소스 | `types.ts`(`pain?`) · 새 `lib/pain.ts`(`hasPain`·`painText`·`painTrail`) · `progression.ts`(`HoldReason pain`, 통증 분기는 Phase 0 뒤·보상작용 앞, `holdReasonText`, `progressionVerdicts`) · `prefill.ts`(`lastPain`, `computeProgression.lastPain`) · `sessionOps.ts`(`applyPain`, `applySubstitute`가 `pain: undefined`) · `store/session.ts`·`useSessionEditor.ts`(`setPain`) · `ExerciseCard.tsx`(통증 칸·접힌 칩) · `CompensationSheet.tsx`(안내 한 줄) · `README.md` |
| 바뀐 테스트 | `v114.test.ts` describe `LL2` 22건 (기존 테스트 수정 없음) |
| 수정표 밖 변경 | 없음 |

| PLAN 검증 항목 | 테스트 |
|---|---|
| 통증 → hold pain · 통증+보상작용 · 통증+반복 미달 · Phase 0 | `judgeProgression: …` 4건 |
| `{ note: '' }`도 hold | `progressionVerdicts: 통증 { note: '' }…` |
| B그룹 키 없음 | `B그룹 entry에 통증…` |
| `buildPrefill` 기본 | `buildPrefill: 직전 세션 전 세트 상단 + 통증…` |
| 세트 0 통증 / 기록 없는 종목 / `sets: []` / 키 없음 | `세트 0 통증…` · `기록 없는 종목의 세트 0 통증…` · `judgeProgression({ sets: [], pain: true })…` · `progressionVerdicts: 세트 0 통증…` |
| 통증 없이 수행 뒤 · 디로드 · 대체 · 어시스티드 · 얹은 종목 · Day 변경 | 같은 이름 테스트 6건 |
| `applyPain` · `hasPain` · `painTrail` | 같은 이름 테스트 3건 |
| `LL_VERDICT_BEFORE` | `LL_VERDICT_BEFORE 일치 (통증 없는 기록의 판정 불변)` (`GG1_GOLDEN`은 `v111.test.ts` 통과) |
| 소스 스캔 | `소스 스캔: pain.ts 밖의…` |

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ② 통증 분기를 보상작용 분기 뒤로 | `통증 + 보상작용 → pain` | `cmp` 같음 |
| ③ `painTrail` "닿은 것"에서 통증 조건 삭제 | `세트 0 통증…` · `기록 없는 종목의 세트 0 통증…` | `cmp` 같음 |
| ④ `applySubstitute`의 `pain: undefined` 삭제 | `대체…` | `cmp` 같음 |
| ⑩ 통증 분기를 `sets.length === 0` 검사 앞으로 | `sets: []` · 기록 없는 종목 · 세트 0 키 없음 · Phase 0 | `cmp` 같음 |

과거 판정 불변: `LL_VERDICT_BEFORE`·`GG1_GOLDEN` 일치. 통증 없는 기록(v1.14 이전 전부)은 `pain` 키가 없어 판정이 바뀌지 않는다.

실행: `Test Files 56 passed (56)` · `Tests 1357 passed (1357)` · `npm run build` 통과.
실기기 확인: 카드의 통증 없음↔있음 토글·메모 입력, 접힌 카드 `통증` 칩, 보상작용 시트 안내 줄.

---

## LL3. 통증을 말하는 자리

| 항목 | 내용 |
|---|---|
| 바뀐 소스 | `pain.ts`(`lastPainChipText`) · `exportMarkdown.ts`(`통증:` 줄, `cardioNoteLines` → `sessionTailLines`에 세트 0 통증 줄) · `ExerciseCard.tsx`(칩) · `SummaryScreen.tsx`(` · 통증`) · `history.ts`(`HistoryPoint.pain`) · `ExerciseHistoryScreen.tsx`(` · 통증`) · `README.md` |
| 바뀐 테스트 | `v114.test.ts` describe `LL3` 12건 (기존 테스트 수정 없음) |
| 수정표 밖 변경 | 없음 |

| PLAN 검증 항목 | 테스트 |
|---|---|
| `lastPainChipText` 표의 여섯 줄 | `lastPainChipText: 표의 여섯 줄` |
| deload · phase0 · verdict undefined | `lastPainChipText: mode 'deload'면…` |
| 기록 없는 종목의 세트 0 통증 칩 | `기록 없는 종목의 세트 0 통증 → 칩은…` |
| 내보내기 순서 · 메모 없음 · 통증 없는 entry | `내보내기: 통증 + 메모…` · `메모 없음…` |
| 보상작용 + 통증 | `내보내기: 보상작용 + 통증…` |
| B그룹 통증 | `내보내기: B그룹 통증…` |
| 세트 0 통증 (근력·워밍업만·유산소만) | `내보내기: 세트 0 통증(근력 세션)…` |
| 대체 entry | `내보내기: 대체 entry 통증…` |
| `LL_EXPORT_BEFORE` 일치 · `JJ_EXPORT_NORMAL_BEFORE` | `새 출력이 LL_EXPORT_BEFORE와 같다…` (JJ는 `v112.test.ts` 통과) |
| `exerciseHistory` pain | `exerciseHistory: 통증 entry…` |
| 소스 스캔 | `소스 스캔: exportMarkdown · SummaryScreen · history…` |

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ⑤ `lastPainChipText`의 `mode === 'normal'` 조건 삭제 | `mode 'deload'면…` | `cmp` 같음 |
| ⑥ 내보내기에 `통증: 없음`도 내게 | `메모 없음…` · `LL_EXPORT_BEFORE 일치` | `cmp` 같음 |
| ⑦ `sessionTailLines`의 세트 0 통증 줄 삭제 | `세트 0 통증(근력 세션)…` | `cmp` 같음 |

과거 판정·출력 불변: `LL_EXPORT_BEFORE`(통증 줄 0개) 일치.

실행: `Test Files 56 passed (56)` · `Tests 1369 passed (1369)` · `npm run build` 통과.
실기기 확인: 통증 기록 후 다음 세션 카드 칩, 요약·종목 기록의 ` · 통증`, 내보내기 `통증:`/`통증(작업 세트 없음):` 줄.

---

## LL4. 유산소 종류 한 곳 · 천국의 계단 · 강도

| 항목 | 내용 |
|---|---|
| 바뀐 소스 | 새 `lib/cardio.ts`(`CARDIO_TYPES`·`intensityHintFor`·`cardioText`) · `FinishSheet.tsx`(지역 목록 삭제, 강도 칸 placeholder) · `exportMarkdown.ts` · `HistoryScreen.tsx` · `SummaryScreen.tsx` · `SessionDetailScreen.tsx`(`src/screens/`) · `types.ts`(주석) · `README.md` |
| 바뀐 테스트 | `v114.test.ts` describe `LL4` 10건 · 기존 수정 ①`export.test.ts:141` ②`v113.test.ts` KK5 단언 3곳 ③`v113.test.ts` 허용 접두사 (PLAN 수정표 ①~③) |
| 수정표 밖 변경 | `v114.test.ts` `LL0`·`LL3`의 `LL_EXPORT_BEFORE` 단언(`renderLl()` → `llCardioAsV113(renderLl())`). LL4 검증 "`LL_EXPORT_BEFORE`와 다른 줄이 정확히 둘"과 `toBe(LL_EXPORT_BEFORE)`는 양립할 수 없다. `llCardioAsV113`은 두 유산소 줄 문자열 치환만 한다(나머지 줄은 그대로 견줌). 테스트 이름은 그대로. |

| PLAN 검증 항목 | 테스트 |
|---|---|
| `cardioText` 천국의 계단 + `4단계` | `cardioText: 천국의 계단 + 4단계 → 강도 4단계` |
| `기타` + `4` | `cardioText: 기타 + 4 → 기타 · 강도 4 · 16분` |
| 강도 없음 | `cardioText: 강도 없음 → 지금과 같은 모양` |
| `note ''`·`'  '` | `cardioText: note '' · '  ' → 강도 없는 모양` |
| 목록에 없는 종류 | `cardioText: 목록에 없는 종류 → 그대로` |
| `intensityHintFor` | `intensityHintFor: 천국의 계단 → 4단계 · 목록에 없음 → 강도` |
| `CARDIO_TYPES` 이름 | `CARDIO_TYPES 이름 순서` |
| 내보내기 다른 줄 정확히 둘 | `내보내기: LL_EXPORT_BEFORE와 다른 줄이 정확히 둘…` |
| 소스 스캔 두 건 | `소스 스캔: cardio.ts만 '마이마운틴'…` · `소스 스캔: 내보내기·기록·요약은 cardio.minutes 대신 cardioText…` |
| 옛 표기 단언 갱신 | `export.test.ts` · `v113.test.ts` KK5 (수정 ①~③) |

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ⑧ `FinishSheet.tsx`에 지역 `CARDIO_TYPES` 복원 | `소스 스캔: cardio.ts만 '마이마운틴' 리터럴을 가진다` | `cmp` 같음 |
| ⑨ `cardioText`를 `${type} ${note} · ${minutes}분`으로 | `cardioText: 천국의 계단 + 4단계…` · `cardioText: 기타 + 4…` · `내보내기: …다른 줄이 정확히 둘…` | `cmp` 같음 |

과거 출력 불변: 강도(note) 없는 유산소 줄(`마이마운틴 30분`)은 그대로. 바뀐 것은 note 있는 두 줄뿐이다.

실행: `Test Files 56 passed (56)` · `Tests 1379 passed (1379)` · `npm run build` 통과 · `git rev-list --count main..HEAD` 6 (이 반영 커밋 전).
실기기 확인: 종료 시트의 `천국의 계단` 선택·강도 placeholder(`4단계`), 기록 탭·요약·내보내기의 `· 강도 N ·` 표기.

리뷰 반영: ① LL4 절 추가 ② 수정표 밖 변경 명시 ③ 결함 ⑧·⑨ 실행 기록. 코드·테스트 변경 없음.

---

## 과거 판정 불변 확인

범위: 테스트 안에 고정한 루틴(배포 `routine-v2.4.json`)·Phase·픽스처로 한정한다. 저장된 실기기 데이터는 보지 않았다.

① 골든 일치 (LL0 커밋 `2bd9770`, 수정 `7b38cb7`)

| 골든 | 확인 테스트 | 결과 |
|---|---|---|
| `GG1_GOLDEN` | `v111.test.ts` | 통과 |
| `JJ_BUILD_GOLDEN` | `v112.test.ts` | 통과 |
| `JJ_EXPORT_NORMAL_BEFORE` | `v112.test.ts` | 통과 |
| `LL_VERDICT_BEFORE` | `v114.test.ts` LL1·LL2 | 통과 (08-28 레그 컬 `hold compensation` 그대로) |

② 기존 테스트 수정 ①~④ — diff는 `git diff -U0 7b38cb7 HEAD -- src/lib/export.test.ts src/lib/v113.test.ts src/lib/uiConsistency.test.ts`

```
export.test.ts:141
-    expect(text).toContain('유산소: 마이마운틴 25/3.8 · 20분')
+    expect(text).toContain('유산소: 마이마운틴 · 강도 25/3.8 · 20분')            (수정 ①)
v113.test.ts:960,966,993
-    유산소: 유산소 마이마운틴 · 30분
+    유산소: 유산소 · 강도 마이마운틴 · 30분                                        (수정 ②)
v113.test.ts:1037
-    l.startsWith('유산소: 유산소 마이마운틴') ||
+    l.startsWith('유산소: 유산소 · 강도 마이마운틴') ||                            (수정 ③)
uiConsistency.test.ts:88-89
-    expect(src).toMatch(/current\.trim\(\) !== ''/)
-    expect(src).toMatch(/current !== NO_COMPENSATION/)
+    expect(src).toMatch(/\{hasCompensation\(current\) &&/)                         (수정 ④)
uiConsistency.test.ts:95
-    /\{(current[^}]*?) &&\s*\(\s*<button/
+    /\{([^{}]*\bcurrent\b[^{}]*?) &&\s*\(\s*<button/  + expect(cond).not.toBe('')
```

③ `LL_EXPORT_BEFORE`와 새 출력의 diff는 유산소 두 줄뿐이다 (`v114.test.ts` `내보내기: LL_EXPORT_BEFORE와 다른 줄이 정확히 둘…`이 잠근다)

```
 ## 2026-08-26 (수) — Day 1 Push
-유산소: 마이마운틴 25/3.8 · 20분
+유산소: 마이마운틴 · 강도 25/3.8 · 20분
 ## 2026-11-04 (수) — Day 1 Push
-유산소: 기타 4 · 16분
+유산소: 기타 · 강도 4 · 16분
```
(`2026-08-03`의 `유산소: 마이마운틴 30분`은 강도가 없어 그대로. 이 밖의 줄은 한 글자도 안 바뀐다.)

④ 바뀌는 것: PLAN "과거 판정 불변" 표의 일곱 자리(유산소 강도 표기 3곳 · 빈 문자열 보상작용 · 통증 신규·과거 세션 직접 입력 · 유산소 종류 5개). 통증 없는 v1.14 이전 기록의 판정·세션 생성·내보내기는 불변.

## 배포 영향

- 강도를 적은 과거 유산소 기록의 내보내기·기록 탭 표기에 `강도`가 붙는다(11-04 `기타 4 · 16분` → `기타 · 강도 4 · 16분`).
- 통증 칸의 삭제 조건: 배포 후 3개월 동안 `pain` 기록이 0건이면 LL2·LL3을 지운다.

## 완료 요약 (v1.14)

| 작업 | 커밋 |
|---|---|
| LL0 골든 | `2bd9770`, 수정 `7b38cb7` |
| LL1 `hasCompensation` 한 곳 | `dd01001` |
| LL2 통증 칸 | `75d5810` |
| LL3 통증을 말하는 자리 | `aefa8cd` |
| LL4 유산소 종류·강도 | `02e9c51` (기록 `8741482`) |
| 기록·버전 | 이 커밋 · `package.json` 1.14.0 |

실행: `Test Files 56 passed (56)` · `Tests 1379 passed (1379)` · `npm run build` 통과 · 결함 복원 11건 중 ①②③④⑤⑥⑦⑧⑨⑩⑪ 모두 작업 절에 기록(LL1 ①⑪, LL2 ②③④⑩, LL3 ⑤⑥⑦, LL4 ⑧⑨) · `git rev-list --count main..HEAD` 8 (이 커밋 포함).
실기기 확인: 각 작업 절 목록.
