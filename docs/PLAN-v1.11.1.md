# PLAN v1.11.1 — 내보내기 무게가 1.25 단위를 반올림한다 (HH1)

> 작성: Opus 5.5 (설계자), 2026-11-04. 대상 코드: v1.11.0 (`d36632b`).
> 수정: 2026-11-04, 검토 2건(`.reports/v1.11.1-codex.md`, `.reports/v1.11.1-antigravity.md`) 반영 — 끝의 "검토 반영 기록".
> 근거: `docs/DEV-RECORD-v1.11.md` GG2 "하지 않은 것 · 열린 것" 마지막 항목
> ("내보내기 `fmtWeight`가 1.25 단위 무게를 소수 1자리로 반올림한다(8.75→8.8)").
>
> **성격**: 표시 수정 하나. 새 규칙·새 저장값 없음. 증량 판정(up/hold)과 그 결과 무게(`verdict.to`)는
> 한 건도 바뀌지 않는다 — 판정 코드는 손대지 않는다. 바뀌는 것은 **내보내기 문자열에 찍히는 무게 숫자**뿐이다.

---

## HH1. 내보내기 무게를 저장값 그대로(0.01 단위) 적는다

### 진단

| 사실 | 근거 |
|---|---|
| 내보내기의 무게는 전부 `fmtWeight`를 거친다 (종목 헤더 1곳, `다음:` 줄 4곳) | `src/lib/exportMarkdown.ts:150` · `:190` · `:191` · `:196` · `:197` |
| `fmtWeight`는 정수가 아니면 `toFixed(1)` — 소수 둘째 자리를 반올림한다 | `src/lib/exportMarkdown.ts:114-116` |
| 1.25는 무게 단위 프리셋이다. 이 단위로 쌓이는 무게의 절반(x.25 · x.75)이 둘째 자리를 갖는다 | `src/lib/weightScale.ts:35` `STEP_PRESETS = [1, 1.25, 2, 2.5, 5]` |
| 저장값은 이미 0.01 단위다: 직접 입력은 `decimals={2}`로 0.01 반올림, ± 이동·증량 제안·사다리는 `round2` | `src/components/NumberStepper.tsx:93-94` · `src/components/ExerciseCard.tsx:489` · `src/lib/weightScale.ts:38-40` · `:80` · `:99-111` · `:135-152` |
| 화면은 저장값을 그대로 찍는다 (`${weight}kg`) — 화면은 8.75, 내보내기는 8.8 | `src/components/ExerciseCard.tsx:216` · `:219` · `:402` · `src/screens/SummaryScreen.tsx:222` · `:249` |

실측(node): `8.75→"8.8"`, `8.25→"8.3"`, `11.25→"11.3"`, `6.25→"6.3"`. 즉 1.25 단위 종목에서는
**헤더 무게와 `다음: …kg로 증량` 목표가 존재하지 않는 무게**가 된다. T9("5kg 머신에 +2.5를 적어 보내면
LLM 분석도 존재하지 않는 무게를 전제한다", `exportMarkdown.ts:182-183`)가 막으려던 것과 같은 결함이다.

`toFixed(1)`이 그동안 하던 일은 하나 더 있다: 부동소수 잡음(`40.00000000000001`)을 `40.0`으로 감추는 것.
저장 경로가 전부 `round2`를 거치므로 잡음이 생길 일은 드물지만, 새 형식도 이 일을 계속 해야 한다.

### 설계

1. **`formatWeight(n: number): string`을 `src/lib/weightScale.ts`에 둔다** (`round2` 바로 아래, export).
   - 본문: `String(round2(n))`
   - 결과: `30→"30"` · `32.5→"32.5"` · `8.75→"8.75"` · `11.25→"11.25"` · `40.00000000000001→"40"` · `8.125→"8.13"`
   - 뒤 0을 채우지 않는다(`32.50`, `30.0` 아님). 현행 `.5` 표기(`32.5`)와 화면 표기가 이미 그렇다.
   - `kg`는 붙이지 않는다. 호출부 문장이 단위를 붙이는 현행 구조(`${…}kg 유지`, `${…}kg로 증량`)를 그대로 둔다.
   - 왜 `weightScale.ts`인가: 무게 단위(0.01 정밀도 = `round2`)를 아는 곳이 거기다. 정밀도 규칙을
     두 파일이 따로 갖지 않게 한다(판정은 한 곳에서). 또 export라서 단위 테스트로 직접 잠글 수 있다.
2. **`exportMarkdown.ts`의 로컬 `fmtWeight`를 지우고** 다섯 호출부(150 · 190 · 191 · 196 · 197)를
   `formatWeight`로 바꾼다. import는 기존 `import { buildScaleMap, type WeightScaleMap } from './weightScale'`에 붙인다.
3. 그 밖에는 아무것도 바꾸지 않는다. 헤더 무게 선택(`Math.max(...sets.map(s => s.weight))`, `:135`),
   판정(`verdicts`), 사유 문구(`holdReasonText`), 화면 코드는 그대로다.

### 검증 (`src/lib/v1111.test.ts`, describe `HH1`)

테스트 픽스처는 `v111.test.ts`·`weightScale.test.ts`의 방식(카탈로그 + `ROUTINE` + `exerciseSettings`로
종목별 단위 지정)을 따른다. 1.25 단위는 `exerciseSettings: [{ recordKey, weightStepKg: 1.25 }]`로 건다.

| 테스트 이름 | 확인하는 것 |
|---|---|
| `formatWeight: 정수·0.5·0.25·0.75 단위를 저장값 그대로 적는다` | `30→"30"` · `32.5→"32.5"` · `8.75→"8.75"` · `8.25→"8.25"` · `11.25→"11.25"` · `0→"0"` |
| `formatWeight: 부동소수 잡음을 감춘다` | `40.00000000000001→"40"` · `0.1+0.2→"0.3"` · `8.125→"8.13"` |
| `1.25 단위 종목: 헤더 무게가 8.75kg` | 전 세트 8.75kg 세션 → `### <이름> (D?/A) 8.75kg` (기존 `8.8kg` 아님) |
| `1.25 단위 종목: 유지 줄이 8.75kg` | 상단 미달 세트 → `다음: 8.75kg 유지 (반복 상단(…) 미달 — …)` |
| `1.25 단위 종목: 증량 목표가 8.75kg` | 7.5kg 전 세트 상단 → `다음: 8.75kg로 증량` |
| `1.25 단위 종목: 8.75에서 증량하면 10kg` | 8.75kg 전 세트 상단 → `다음: 10kg로 증량` (정수로 떨어지면 `.0` 없음) |
| `1.25 단위 종목: x.25도 반올림하지 않는다` | 10kg 전 세트 상단 → `다음: 11.25kg로 증량` (기존 `11.3kg`) |
| `직접 입력한 0.01 단위 무게: 헤더 그대로` | 기본 단위(설정 없음) 종목, 전 세트 12.34kg(직접 입력 저장값) → 헤더 `12.34kg` (기존 `12.3kg`). 1.25 단위가 아닌 둘째 자리 무게도 범위임을 잠근다 |
| `복귀 세션: 사유 접미사와 무게가 같이 맞다` | `mode: 'return'`, 8.75kg, 상단 도달·계획보다 적은 세트 → `다음: 8.75kg 유지 (반복 상단 도달 · 계획 N세트 중 M세트 · 복귀 세션)` |
| `디로드 세션: 헤더 무게` | `mode: 'deload'`, 8.75kg → 헤더 `8.75kg`, 세션 헤더에 `[디로드]` |
| `대체 + 어시스트(inverse): 헤더와 보조 감소 목표` | `v111.test.ts`의 `ASSIST_KEY`(`assisted-pullup`/d2)가 `ASSIST_ORIGIN_KEY`(`lat-pulldown`)를 대체, `ASSIST_KEY`에 1.25 단위, 전 세트 8.75kg·상단 도달 → 헤더 `8.75kg (대체: <랫풀다운 이름> — 자리 없음)` · `다음: 7.5kg로 증량` (보조를 줄이는 방향, 기존 동작) |
| `대체 + 어시스트: 보조 감소가 x.75로 떨어진다` | 같은 구성, 10kg 상단 → `다음: 8.75kg로 증량` (기존 `8.8kg`) |
| `사다리 종목: 핀 값 그대로` | `weightLadderKg: [7.5, 8.75, 10]`, 7.5kg 상단 → `다음: 8.75kg로 증량` |
| `스택 최대: 무게 그대로` | 사다리 `[7.5, 8.75]`, 8.75kg 상단 → `다음: 8.75kg 유지 (증량 조건 충족 — 스택 최대)` |
| 소스 스캔 `exportMarkdown에 toFixed와 로컬 fmtWeight가 없다` | `stripComments(exportMarkdown.ts)`에 `toFixed(` 없음 · `function fmtWeight` 없음 |
| 소스 스캔 `exportMarkdown의 kg 보간은 모두 formatWeight를 거친다` | `stripComments` 본문에서 `/\$\{(?!formatWeight\()[^}]*\}kg/` 매치 0건, `formatWeight(` 5회 이상 |

**기존 테스트는 고치지 않는다.** `export.test.ts`·`v111.test.ts`(골든 포함)·`weightScale.test.ts`의 무게는
모두 정수 또는 `.5`라서 새 형식에서도 같은 문자열이 나와야 한다. 하나라도 고쳐야 하면 설계와 다른 것이다 —
DEV-RECORD에 적고 멈춘다.

### 범위 제외

| 안 하는 것 | 이유 |
|---|---|
| 화면의 무게 표기를 `formatWeight`로 통일 | 화면은 이미 저장값(0.01 단위)을 그대로 찍어 8.75로 보인다. 결함이 없는 15여 곳을 고치는 비용·위험이 효과보다 크다. 화면에 잡음이 보인 보고도 없다. |
| `formatProgression`(카드 칩 `from → to kg`) 변경 | 같은 이유. 값이 `round2`를 거친 저장값·제안값이다. |
| e1RM·점수의 `toFixed(1)` (`src/screens/SummaryScreen.tsx:154`, `src/screens/ExerciseHistoryScreen.tsx:101` 등) | 추정값의 표시 정밀도로 의도된 것이다. 실제로 걸 수 있는 무게가 아니다. |
| 저장값 정규화(기존 기록을 `round2`로 다시 쓰기) | 저장값은 이미 0.01 단위다. 표시만 고치면 된다(파생 우선). |
| 식단 내보내기 | 무게(kg) 보간이 없다. |
| 이전 내보내기와 달라진 숫자를 문서에 알리는 캡션 | 확정 결정(아래 "이전 내보내기와의 차이"). 1인용 앱이고 사용자가 이 PLAN으로 변경을 안다. 캡션은 매 내보내기마다 LLM 입력을 늘리고 제거 시점 관리가 생긴다. |

### 이전 내보내기와의 차이 (확정)

같은 기간을 다시 내보내면 둘째 자리가 있는 무게가 `8.8kg` → `8.75kg`, `11.3kg` → `11.25kg`, `12.3kg` → `12.34kg`처럼 바뀐다.
정수·`.5` 무게와 증량 판정 결과 자체는 바뀌지 않는다. **그대로 두고 문서에 따로 알리지 않는다.**
새 숫자가 실제로 건 무게이고 화면과 같다. 차이는 0.05kg 이하로 분석 결론을 바꿀 크기가 아니다.

---

## 구현 순서와 검증

작업 하나(HH1), 커밋은 **구현 1 + 기록·버전 1**.

관례:
- `npm run build` (타입 확인 포함, `tsc` 직접 호출 금지) · 작업 중에는 `npx vitest run src/lib/v1111.test.ts src/lib/export.test.ts src/lib/weightScale.test.ts src/lib/v111.test.ts`만 · 마지막에 `npm test` 한 번
- 커밋 개수는 실행 출력을 복사한다 (`git log --oneline main..HEAD`)
- 커밋 메시지는 `git commit -F - <<'MSG'`
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `formatWeight` 본문을 `Number.isInteger(n) ? String(n) : n.toFixed(1)`로 → `formatWeight: …0.25·0.75…`와 1.25 단위 내보내기 테스트들이 실패
  ② `exportMarkdown.ts` 헤더 한 곳을 `${weight}kg`로 → 스캔 `kg 보간은 모두 formatWeight를 거친다` 실패
  ③ `exportMarkdown.ts`에 로컬 `function fmtWeight` 복원 후 한 호출부에 사용 → 스캔 `toFixed와 로컬 fmtWeight가 없다` 실패
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 테스트 안에 고정한 루틴·Phase·무게 단위와 픽스처로 한정한다고 첫 줄에 적는다:
  ① `v111.test.ts`의 `GG1_GOLDEN` 격자와 `GG1_EXPORT_BEFORE` 비교가 수정 없이 통과한다
  ② `export.test.ts`·`weightScale.test.ts`가 수정 없이 통과한다(정수·`.5` 무게의 내보내기 문자열 불변)
  ③ `git diff main -- src/lib/progression.ts src/lib/prefill.ts`가 비어 있다(판정 코드 무변경)
  ④ 바뀌는 것: 둘째 자리가 있는 무게(1.25 단위의 x.25·x.75, 0.01 단위 직접 입력)만 내보내기 표기가 달라진다 — HH1 "이전 내보내기와의 차이 (확정)"
- 완료 후 `docs/DEV-RECORD-v1.11.1.md` (맨 위 "이 환경에서 확인된 제약"은 v1.11 목록을 이어받는다)
- `package.json` **1.11.1**은 기록 커밋에서 올린다

---

## 사람이 정할 것

없음. (검토 전 1건 "예전에 받은 내보내기와 숫자가 달라진다"는 추천안 A로 확정 — HH1 "이전 내보내기와의 차이")

---

## 검토 반영 기록

두 검토 모두 "그대로 진행 가능". 지적은 경미한 것 3건이며 모두 코드로 확인했다.

| 지적 | 출처 | 판단 | 근거·처리 |
|---|---|---|---|
| 1.25의 x.25·x.75 밖의 임의 0.01 무게(직접 입력)도 내보내기 경로에서 확인하는 사례가 없다 | Codex | 반영 | `src/components/NumberStepper.tsx:93-94`가 `decimals === 2`면 0.01로 반올림해 저장한다 — 12.34 같은 값이 실제로 생긴다. 검증표에 `직접 입력한 0.01 단위 무게: 헤더 그대로` 추가 |
| 진단 표·범위 제외의 파일 경로에 `src/…` 접두어가 빠졌다 (`ExerciseCard.tsx`, `SummaryScreen.tsx`, `weightScale.ts`) | Antigravity | 반영 | 실제 위치 `src/components/ExerciseCard.tsx`, `src/screens/SummaryScreen.tsx`, `src/screens/ExerciseHistoryScreen.tsx`, `src/lib/weightScale.ts` 확인. 전체 경로로 고침 |
| 사다리 파싱의 `round2` 호출이 `weightScale.ts:79`가 아니라 `:80` | Antigravity | 반영 | `:79`는 `if (!Number.isFinite(n) …)` 검사, `:80`이 `values.push(round2(n))`. `:80`으로 고침 |
| 사람이 정할 것 1 — 추천 A | Antigravity 동의, Codex 이의 없음 | 확정 | 6절 규칙대로 추천안 A로 확정하고 본문(HH1 "이전 내보내기와의 차이")에 녹임 |

두 검토자가 서로 다르게 본 지점은 없다.
