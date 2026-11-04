# 개발·테스트 내역 (검토용) — v1.11.1 (HH1) · 2026-11-04

> PLAN-v1.11.1의 구현 기록. HH1.

## 이 환경에서 확인된 제약 (누적 — v1.11 목록을 이어받는다)


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

## HH1. 내보내기 무게를 저장값 그대로(0.01 단위) 적는다

### 범위

| 항목 | 내용 |
|---|---|
| 구현 커밋 | `506434a` fix(export) — 바뀐 파일 3개 |
| 바뀐 파일 | `src/lib/weightScale.ts`(`formatWeight` 추가) · `src/lib/exportMarkdown.ts`(로컬 `fmtWeight` 삭제, 호출 5곳 교체) · `src/lib/v1111.test.ts`(신규) |
| 테스트 | `v1111.test.ts` 16개 (HH1 14 + 소스 스캔 2). 전체 51파일/1068개 |
| 버전 | `package.json` 1.11.0 → 1.11.1 (기록 커밋) |

### 테스트 ↔ PLAN 검증 항목

PLAN 검증표 16행과 테스트 이름이 1:1로 같다 (`formatWeight` 2 · 1.25 단위 5 · 직접 입력 1 · 복귀 1 · 디로드 1 · 대체+어시스트 2 · 사다리 1 · 스택 최대 1 · 소스 스캔 2).
`v111.test.ts`를 import하면 그 파일의 테스트가 중복 실행되므로 픽스처(카탈로그·키·루틴 종목)를 로컬로 뒀다.

### 결함 복원

| 되살린 결함 | 실패한 테스트 | 원상복구 |
|---|---|---|
| ① `formatWeight` 본문을 `toFixed(1)` 방식으로 | 13개 (formatWeight 2 · 1.25 단위 5 · 직접 입력 · 복귀 · 디로드 · 어시스트 2 등) | `cmp` 동일 |
| ② 헤더 한 곳을 `${weight}kg`로 | 스캔 `kg 보간은 모두 formatWeight를 거친다` | `cmp` 동일 |
| ③ 로컬 `function fmtWeight`(toFixed) 복원 | 스캔 `toFixed와 로컬 fmtWeight가 없다` | `cmp` 동일 |

### 과거 판정 불변 확인

범위는 테스트 안에 고정한 루틴·Phase·무게 단위와 픽스처로 한정한다.

| # | 확인 | 결과 |
|---|---|---|
| ① | `v111.test.ts` `GG1_GOLDEN`·`GG1_EXPORT_BEFORE` 비교 | 수정 없이 통과 |
| ② | `export.test.ts`·`weightScale.test.ts` | 수정 없이 통과 (정수·`.5` 무게 문자열 불변) |
| ③ | `git diff main -- src/lib/progression.ts src/lib/prefill.ts` | 0줄 |
| ④ | 바뀌는 것 | 둘째 자리 무게(x.25·x.75, 직접 입력 0.01)의 내보내기 표기만 (확정 사항) |

기존 테스트는 하나도 고치지 않았다.

### 실행 결과

- `Test Files 51 passed (51)` · `Tests 1068 passed (1068)`
- `npm run build` 성공
- `git rev-list --count main..HEAD` = 2

### 하지 않은 것

PLAN 범위 제외 그대로 (화면 표기 통일, `formatProgression`, e1RM `toFixed`, 저장값 정규화, 캡션).
