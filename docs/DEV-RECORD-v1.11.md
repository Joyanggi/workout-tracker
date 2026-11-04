# 개발·테스트 내역 (검토용) — v1.11 (GG1 · GG2) · 2026-11-04

> PLAN-v1.11의 작업별 구현 기록. 지금은 GG1만 있다.

## 이 환경에서 확인된 제약 (누적 — 매 라운드 맨 위에 둔다)

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
    커밋 메시지 heredoc(`git commit -F - <<'MSG'`)은 문제없었다.

---

## GG1. 보류 사유를 판정 함수가 돌려준다

### 범위

| 커밋 | 내용 | 바뀐 파일 |
|---|---|---|
| `40e7c72` | **골든 표만** — 리팩터링 전(v1.10.0) 코드로 만든 `GG1_GOLDEN`(180칸)·`GG1_EXPORT_BEFORE`. 이후 고치지 않음 | `v111.test.ts` |
| 구현 커밋 (`git log --oneline main..HEAD` 둘째 줄) | `judgeProgression` 초크포인트 · 사유 문구 · 내보내기·요약·세션 카드 배선 · 테스트 | `progression.ts` `prefill.ts` `exportMarkdown.ts` `SummaryScreen.tsx` `ExerciseCard.tsx` `v111.test.ts` `DEV-RECORD-v1.11.md` |

테스트: `v111.test.ts` 26개(1파일). 전체 50파일 / 1038개. `package.json` 버전은 올리지 않음(GG2 끝에서 1.11.0).

### PLAN 검증 항목 ↔ 테스트 (`src/lib/v111.test.ts`)

| PLAN 검증 | 테스트 이름 |
|---|---|
| 사유 우선순위 | `사유 우선순위: 보상작용 > 반복 미달 > 세트 부족 > 증량` · `판정 대상 아님: B그룹 · 수행 세트 없음` |
| 판정 불변(전수, 골든) | `판정 불변(전수, 골든 비교)…` · (골든 커밋) `격자 180칸 전부 현행 … 골든과 같다` |
| 필드리포트 재현 | `필드리포트 재현: 인클라인 30kg 10/10/10 · 복귀 …` |
| 디로드 | `디로드: 같은 입력, mode deload …` |
| 반복 미달 문구 | `반복 미달 문구: 10/8/7 …` · `보상작용·Phase 0 문구` |
| Phase 0 | `Phase 0 꺼진 루틴 사본 → phase0, 배포 루틴은 …` |
| 대체 종목 | `대체 종목: 대체 entry는 원 종목의 sets·repMax로 판정한다` |
| 어시스트 | `어시스트(inverse): hold 사유는 같고 … "보조 없이"` |
| 얹은 종목 | `얹은 종목(extra): 판정이 현행 progressionSuggestions와 같다` |
| 워밍업 | `워밍업 세트는 done·total·planned 비교 어디에도 세지 않는다` |
| 스택 최대 | `스택 최대: up to:null → 내보내기 줄이 현행 문자열과 같다` |
| 기존 테스트 불변 | `computeProgression`·`progressionSuggestions` 기존 테스트 파일은 손대지 않고 통과 |
| prefill | `복귀 세션(3/4 …) 다음 날 …` · `그 다음 정상 세션 4/4 …` · `디로드 직전 세션 …` |
| prefill 미체크 행 | `미체크 행: 4행 중 3행만 체크 …` |
| `lastHoldChipText` | `lastHoldChipText: reps·compensation·phase0·up·undefined → undefined` |
| 내보내기 | `사유 4종의 "다음:" 줄` · `B그룹은 "다음:" 줄이 없다 (현행)` |
| 소스 스캔 | `계획 세트 수와 길이를 비교하는 증량 판정이 progression.ts 밖에 없다` · `Summary·내보내기는 holdReasonText를 import …` · `ExerciseCard의 hold 칩이 lastHoldChipText를 거친다` |

뒤집힌 기존 테스트: 없음.

### 결함 복원 (5건)

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| 세트 부족 검사를 반복 미달보다 앞으로 (옛 순서) | `사유 우선순위…` · `반복 미달 문구…` | cp 복원 + `cmp` 같음 |
| 보상작용 판정 제거 | 골든 격자 · `판정 불변(전수…)` · `사유 우선순위…` · `사유 4종…` | 같음 |
| `prefill.ts`에 `.length < r.sets` 복제 | `계획 세트 수와 길이를 비교하는 증량 판정이 progression.ts 밖에 없다` | 같음 |
| `SummaryScreen`에 사유 문구 리터럴 | `Summary·내보내기는 holdReasonText를 import …` | 같음 |
| `ExerciseCard` 칩을 `lastHoldChipText` 대신 리터럴로 | `ExerciseCard의 hold 칩이 lastHoldChipText를 거친다` | 같음 |

(GG2 몫의 스캔 — `showProgression` 복원 · `modeSetNotice` · `주간 램프업` — 은 GG2에서 한다.)

### 과거 판정 불변 확인

범위: **테스트 안에 고정한 루틴(배포 `routine-v2.4.json`)·Phase 1·무게 단위와 픽스처.** 사용자가 루틴·Phase를 바꾼 뒤의 과거 표시는 보장하지 않는다(PLAN 머리말 "보장 범위").

| 확인 | 결과 |
|---|---|
| ① 격자 180칸 = 종목 2(일반·어시스트) × 보상작용 2 × 세트 수 5(1..계획 4+1) × 패턴 3 × mode 3 → `judgeProgression`·`progressionSuggestions`·`computeProgression` 모두 `GG1_GOLDEN`과 같음 (골든 커밋 `40e7c72`, 증량 12칸) | 통과 |
| ② 2026-08-26 픽스처 새 내보내기 vs `GG1_EXPORT_BEFORE` | diff = A그룹 `다음: … 유지` 3줄뿐, 괄호 사유만 늘었음 |
| ③ 같은 픽스처의 홈 배지 · 요약 증량 행 · 프리필(`defaultSetFor` 30kg) | 같음 (증량 0건, `progression` 없음) |

### 실행 결과

- `npm test`: `Test Files  50 passed (50)` · `Tests  1038 passed (1038)`
- `npm run build`: 성공 (`✓ built in 3.73s`)
- `git rev-list --count main..HEAD`: 2 (골든 + 구현, 이 기록을 커밋한 뒤 값)

### 하지 않은 것 · 열린 것

- GG2 (복귀·디로드 판정 표시) — `showProgression` prop은 그대로 두고 칩이 그것에 기대 있다. GG2에서 정리한다.
- 실기기 확인: 요약 화면 "다음 세션 무게 (A그룹)" 카드와, 복귀 세션 뒤 다음 세션 카드 칩(`지난번 상단 도달 · 계획 4세트 중 3세트 완료 · 복귀 세션 — …`)은 화면에서 직접 보지 않았다(RTL 없음 → 순수 함수 + 소스 스캔).
- 요약 카드 행 순서는 `performedOrder`(없으면 뒤) 기준이다. 현행은 entry 순서였으므로 같은 날 수행 순서가 계획 순서와 다르면 순서가 달라질 수 있다 — 리뷰어 확인 요청.
- 새로 확인된 제약: 이 환경 Bash 도구는 긴 heredoc(작은따옴표·백틱 섞임)을 파싱하다 깨진다(제약 11과 같은 현상) → 파일로 쓰고 실행했다.
