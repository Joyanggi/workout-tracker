# PLAN v1.11.2 — 내보내기 식단 마크가 화면과 다르다 (II)

> 작성: Opus 5.5 (설계자), 2026-11-04. 대상 코드: v1.11.1 (`935bc95`).
> 근거: `docs/FIELD-REPORT-2026-08-27.md` 1절 ("내보내기 슬롯 마크가 화면과 다른 말을 한다"), 8절 우선순위 2.
> 수정: 검토 반영 (`.reports/v1.11.2-codex.md`, `.reports/v1.11.2-antigravity.md`, 검토 커밋 `7cb6a68`), 2026-11-04. 끝의 "검토 반영 기록" 참고.
>
> **성격**: 표시 수정. 새 규칙·새 저장값 없음. 슬롯 점수(`slotScore`)·하루 판정(`summarizeDietDay`)은
> 한 건도 바뀌지 않는다. 바뀌는 것은 **식단 내보내기 문자열**(슬롯 마크, 하루 헤더, 범례)뿐이고,
> 화면은 공용 함수로 옮기기만 해서 보이는 글자가 그대로다.

---

## 공통 진단 — Z6이 화면만 고쳤다

Z6은 식단 표시에서 두 가지를 고쳤다. 둘 다 화면에만 들어가고 내보내기에는 들어가지 않았다.

| Z6이 고친 것 | 화면 (고쳐짐) | 내보내기 (그대로) |
|---|---|---|
| 슬롯 마크 3단 → 5단 | `src/components/DietDayEditor.tsx:190-191` `SLOT_MARK[slotGrade(score)]` | `src/lib/exportMarkdown.ts:69-72` 자체 3단 `score >= 1 ? '●' : score > 0 ? '◐' : '✗'` |
| 하루 마크에 퍼센트 병기 ("마크만으로는 0.86과 1.0이 같아 보인다") | `src/components/DietDayEditor.tsx:158-167` `준수 ◐ 72%` / 3슬롯 미만이면 `기록 1/5슬롯` | `src/lib/exportMarkdown.ts:63-67` `준수 ${ADHERENCE_MARK[…]}` 마크만, 3슬롯 미만이면 `준수 —` |

결함 B(같은 사실을 두 경로가 각자 계산)다. 보고서 1절은 슬롯 마크만 짚었지만 같은 날(8/24) 하루 헤더도
화면은 `기록 1/5슬롯`, 내보내기는 `준수 —`로 다르게 말한다. 같은 원인이라 함께 고친다(II2).

실측 (보고서 사례 재현, `cut-1800-u` 아침 = 반숙란 225/20 · 멀티비타민 0/0 · 오메가3 10/0):
가중 `305 / 325 = 0.938` → 화면 `◕`(high), 내보내기 `◐`.

---

## II1. 내보내기 슬롯 마크를 `slotGrade`·`SLOT_MARK`로

### 진단

| 사실 | 근거 |
|---|---|
| 내보내기 슬롯 줄은 로컬 `markOf`가 3단으로 마크를 정한다 | `src/lib/exportMarkdown.ts:69-73` |
| 화면은 `diet.ts`의 5단 `slotGrade`·`SLOT_MARK`를 쓴다 ("임계값을 여기 한 곳에 둔다") | `src/lib/diet.ts:333-360` · `src/components/DietDayEditor.tsx:186-191` |
| `slotGrade`의 임계값 0.8·0.45가 함수 본문 리터럴이다 — 범례(II3)가 같은 값을 말하려면 이름이 필요하다 | `src/lib/diet.ts:357-358` |
| 내보내기 슬롯 줄에는 기록된 슬롯만 들어가므로 점수가 `null`인 경우가 없다 (`'—'` 분기는 죽은 코드) | `src/lib/exportMarkdown.ts:53` `logged` 필터 · `src/lib/diet.ts:278` |

점수별로 마크가 달라지는 구간:

| 점수 | 생기는 경우 | 내보내기 지금 | 화면·바뀐 뒤 |
|---|---|---|---|
| 1 | 전부 체크 · 비슷한 구성 대체 | ● | ● |
| 0.8 ≤ s < 1 | 보충제만 누락 (0.938) | ◐ | **◕** |
| 0.45 ≤ s < 0.8 | 그냥 다른 음식 대체 0.5 · 안 먹음 0.5 · 치팅 추가 상한 0.5 · 다른 음식 추가 상한 0.75 | ◐ | ◐ |
| 0 < s < 0.45 | 훈련 전·직후·보충 블록 안 먹음 0.25 · 주식을 뺀 체크 | ◐ | **◔** |
| 0 | 치팅 대체 | ✗ | ✗ |

### 설계

1. **`src/lib/diet.ts`**: 임계값에 이름을 붙인다 (값 그대로).
   - `export const SLOT_GRADE_HIGH = 0.8`, `export const SLOT_GRADE_MID = 0.45` — `SLOT_MARK` 바로 위
   - `slotGrade` 본문의 `0.8`·`0.45`를 이 상수로 바꾼다. 다른 줄은 손대지 않는다.
2. **`src/lib/exportMarkdown.ts`**: 로컬 `markOf`를 지우고 슬롯 줄을
   `${s.name} ${SLOT_MARK[slotGrade(slotScore(s, day.slots[s.id]))]}`로 만든다.
   import는 기존 `./diet` import 목록에 `SLOT_MARK`, `slotGrade`를 더한다.
   - `null` → `none`(`○`) 경로는 위 진단대로 도달하지 않는다. 따로 막지 않는다.
3. 슬롯 상세 줄(`안 먹음`, `미섭취:`, `대체:`, `+ 추가:`)은 그대로다.

### 검증 (`src/lib/v1112.test.ts`, describe `II1`)

픽스처는 `dietExport.test.ts` 방식(`BUNDLED_DIET_PLANS`, `dietDay`)을 따른다. 플랜은 `cut-1800-u`(현행 기본),
옛 플랜 헤더 사례만 `cut-1800`(구).

| 테스트 이름 | 확인하는 것 |
|---|---|
| `보고서 사례: 아침 반숙란만 체크하면 아침 ◕` | `cut-1800-u`, `breakfast`에 `boiled-eggs`만 체크 → 슬롯 줄 `- 슬롯: 아침 ◕` · 상세 `- 아침: 미섭취: 멀티비타민, 오메가3` |
| `전부 체크는 ●` | 슬롯 줄의 모든 마크가 `●` |
| `그냥 다른 음식 대체는 ◐` | `lunch` `substitution.quality: 'other'` → `점심 ◐` |
| `안 먹음(일반 슬롯)은 ◐` | `afternoon` `skipped` → `오후 ◐` |
| `보충 블록 안 먹음은 ◔` | `shake` `skipped` (`CRITICAL_SKIP_SLOTS`, 0.25) → `보충 블록 ◔` (기존 `◐`) |
| `주식을 빼면 ◔` | `lunch`에서 `brown-rice`·`chicken-2`를 빼고 체크 (가중 0.186) → `점심 ◔` |
| `치팅 대체는 ✗` | `dinner` `quality: 'cheat'` → `저녁 ✗` |
| `다른 음식 추가 상한 0.75는 ◐` | 전부 체크 + `addition.quality: 'other'` → `◐` (0.75 < 0.8) |
| `경계: 0.8은 ◕, 0.45는 ◐` | `slotGrade(SLOT_GRADE_HIGH) === 'high'` · `slotGrade(SLOT_GRADE_MID) === 'mid'` · 상수값이 0.8·0.45 |
| `내보내기와 화면이 같은 마크를 쓴다` | 위 사례들의 각 슬롯에 대해 내보내기 슬롯 줄 마크 === `SLOT_MARK[slotGrade(slotScore(slot, record))]` |
| 소스 스캔 `exportMarkdown에 슬롯 마크 글자와 점수 비교가 없다` | `stripComments(exportMarkdown.ts)`에 `'●'` `'◕'` `'◐'` `'◔'` `'✗'` `'○'` 문자열 리터럴 없음 · `score >=`·`score >` 없음 · `SLOT_MARK[slotGrade(` 1회 이상 |
| 소스 스캔 `slotGrade에 임계값 리터럴이 없다` | `slotGrade` 함수 본문에 `0.8`·`0.45` 없음 |

**기존 테스트는 고치지 않는다.** `dietExport.test.ts`·`diet.test.ts`·`v19.test.ts`는 수정 없이 통과해야 한다.
하나라도 고쳐야 하면 설계와 다른 것이다 — DEV-RECORD에 적고 멈춘다.

### 범위 제외

| 안 하는 것 | 이유 |
|---|---|
| 임계값(0.8·0.45) 조정 | Z6에서 정한 값이다. 이번 결함은 값이 아니라 두 경로가 다른 값을 쓰는 것이다. |
| 슬롯 마크에 퍼센트 병기 | 화면 슬롯 마크도 퍼센트가 없다. 화면과 같은 말을 하는 것이 목표다. 정밀도는 상세 줄(`미섭취:`)이 준다. |

---

## II2. 내보내기 하루 헤더를 화면과 같은 문구로

### 진단

| 사실 | 근거 |
|---|---|
| 화면 하루 줄: 판정 있으면 `준수 ◐ 72%`, 3슬롯 미만이면 `기록 1/5슬롯` — 같은 문구를 JSX 안에서 직접 만든다 | `src/components/DietDayEditor.tsx:160-166` |
| 내보내기 하루 헤더: `준수 ${ADHERENCE_MARK[…]}` — 퍼센트 없음, 3슬롯 미만이면 `준수 —` | `src/lib/exportMarkdown.ts:63-67` · `src/lib/diet.ts:488-493` |
| 3슬롯 미만은 `unlogged`(판정 안 함) | `src/lib/diet.ts:63` `MIN_SLOTS_FOR_VERDICT = 3` · `:466-469` |

보고서 8/24 사례(1슬롯)에서 내보내기는 `준수 —`라고 써서 "기록 없음"과 구분되지 않는다. 화면은 `기록 1/5슬롯`이라고 말한다.

### 설계

1. **`src/lib/diet.ts`**: `ADHERENCE_MARK` 아래에 하루 상태 문구 함수를 둔다.
   ```ts
   export function dietDayStatusText(summary: DietDaySummary): string
   ```
   - `summary.adherence === 'unlogged'` → `` `기록 ${loggedSlots}/${totalSlots}슬롯` ``
   - 그 밖 → `` `준수 ${ADHERENCE_MARK[adherence]} ${Math.round((score ?? 0) * 100)}%` ``
   - 화면의 현행 문구와 글자 하나까지 같다(옮기기만 한다).
2. **`src/components/DietDayEditor.tsx:160-166`**: 삼항식을 `dietDayStatusText(summary)` 호출로 바꾼다.
   Z6 주석("퍼센트를 함께 낸다")은 `dietDayStatusText` 위로 옮긴다. `ADHERENCE_MARK` import가 남지 않으면 지운다.
3. **`src/lib/exportMarkdown.ts:63-67`**: 헤더를
   `` `### 식단 — ${plan.name} · ${dayType}${dietDayStatusText(summary)} (단백질 추정 …g / …g)` ``로 만든다.
   - 예: `### 식단 — 감량 1,800 · 준수 ● 100% (단백질 추정 166g / 166g)`
   - 예: `### 식단 — 감량 1,800 · 기록 1/5슬롯 (단백질 추정 20g / 166g)`
4. 홈 칩(`src/screens/HomeScreen.tsx:461` `오늘 식단 ●`)은 그대로다 (범위 제외).

### 검증 (`src/lib/v1112.test.ts`, describe `II2`)

| 테스트 이름 | 확인하는 것 |
|---|---|
| `dietDayStatusText: 판정이 있으면 마크와 퍼센트` | 전부 체크 → `준수 ● 100%` · `breakfast`·`lunch`·`afternoon`·`dinner`만 안 먹음 기록(각 0.5) → `준수 ◐ 50%` |
| `dietDayStatusText: 3슬롯 미만은 기록 n/m슬롯` | 아침만 기록 → `기록 1/5슬롯` · 2슬롯 → `기록 2/5슬롯` |
| `dietDayStatusText: 퍼센트 반올림` | 보고서 사례 아침(0.938) + 나머지 4슬롯 전부 체크 → 평균 0.9877 → `준수 ● 99%` |
| `dietDayStatusText: 반올림 경계는 마크가 판정을 따른다` | `DietDaySummary`를 직접 만들어 `score: 0.846, adherence: 'mid'` → `준수 ◐ 85%` (마크는 반올림 전 점수로 정해지고, 퍼센트만 반올림한다 — 현행 화면 그대로) |
| `내보내기 헤더: 보고서 사례(1슬롯)` | 8/24 재현 → 헤더에 `기록 1/5슬롯` 포함, `준수 —` 없음 |
| `내보내기 헤더: 판정 있음` | 전부 체크 → 헤더에 `준수 ● 100% (단백질 추정 166g / 166g)` |
| `내보내기 헤더: 치팅 추가 상한` | `dietExport.test.ts:233`과 같은 구성(전 슬롯 치팅 추가) → `준수 ◐ 50%` |
| `옛 플랜 헤더: 훈련일 표기와 함께` | `cut-1800`, 훈련일, 전부 체크 → `### 식단 — 감량 1,800 (구) · 훈련일 · 준수 ● 100%` 로 시작 |
| `내보내기와 화면이 같은 문구를 쓴다` | 위 사례 각각에서 헤더가 `dietDayStatusText(summarizeDietDay(plan, day))`를 포함 |
| 소스 스캔 `화면과 내보내기가 하루 문구를 직접 만들지 않는다` | `stripComments(DietDayEditor.tsx)`·`stripComments(exportMarkdown.ts)`에 `ADHERENCE_MARK[` 없음, `summary.score` 없음(단백질 막대의 `* 100`은 남는다), 둘 다 `dietDayStatusText(` 포함 |

### 범위 제외

| 안 하는 것 | 이유 |
|---|---|
| 홈 칩(`오늘 식단 ●`)에 퍼센트 추가 | 칩은 화면 폭이 좁고 이번 결함(화면≠내보내기)과 무관하다. |
| 하루 판정 임계값(0.85·0.5)·`MIN_SLOTS_FOR_VERDICT` 조정 | 판정 규칙은 그대로다. |
| 월 통계(`DietMonthStats`)·달력 표시 | 내보내기에 실리지 않는다. |
| 퍼센트 반올림 방식 변경(`Math.round` → 내림) | 점수 0.845~0.85 미만에서 `준수 ◐ 85%`가 나와 범례 "● 85% 이상"과 어긋나 보인다. 내림으로 바꾸면 화면 글자가 바뀌고(예 0.9877 → 98%) 이 PLAN의 "화면 글자 무변경"이 깨진다. 구간 폭 0.5%p로 드물고, 마크(판정)는 맞다. 동작은 위 경계 테스트로 고정한다. |

---

## II3. 식단 범례를 문서 머리에

### 진단

| 사실 | 근거 |
|---|---|
| 내보내기 머리 캡션은 운동 "간격" 설명 두 줄뿐이다. 식단 마크의 뜻은 문서 어디에도 없다 | `src/lib/exportMarkdown.ts:337-342` |
| 같은 글자 `◐`가 슬롯 마크(0.45~0.8)와 하루 마크(0.5~0.85)에서 다른 구간을 뜻하고, `○`는 하루 마크에서 "낮음"이다 | `src/lib/diet.ts:345-352` · `:488-493` · `:65-66` |
| 이 문서는 LLM 분석 경로다. `◕`·`◔`는 범례 없이 읽기 어렵다 | `src/lib/exportMarkdown.ts:21-24` · 보고서 1절 |

### 설계

1. **`src/lib/diet.ts`**: `export function dietMarkLegend(): string[]` — 두 줄을 돌려준다(`> ` 접두사 없이).
   퍼센트는 상수(`SLOT_GRADE_HIGH`·`SLOT_GRADE_MID`·`ADHERENCE_GOOD`·`ADHERENCE_MID`·`MIN_SLOTS_FOR_VERDICT`)와
   마크 표(`SLOT_MARK`·`ADHERENCE_MARK`)에서 만든다 — 숫자·글자를 문구에 직접 쓰지 않는다.
   문구(확정 — 같은 `◐`가 두 줄에서 다른 구간을 뜻하므로 "슬롯"·"준수"라는 이름과 정의를 함께 말한다.
   "영양 가중"은 보충제 하나가 끼니의 절반을 깎지 않는다는 뜻을 전한다. 기호 축약안(`◕ ≥80`)은 쓰지 않는다):
   - `식단 슬롯 마크 = 그 끼니 이행률(항목 영양 가중): ● 100% · ◕ 80% 이상 · ◐ 45% 이상 · ◔ 45% 미만 · ✗ 0%. 대체·안 먹음은 상세 줄에 적는다.`
   - `식단 준수 = 기록한 슬롯 점수의 평균: ● 85% 이상 · ◐ 50% 이상 · ○ 50% 미만. 3슬롯 미만이면 판정하지 않고 "기록 n/m슬롯"으로 적는다.`
2. **`src/lib/exportMarkdown.ts` `exportMarkdown`**: 기간 안에 식단 섹션이 **하나라도 실제로 나오면**
   (`dates.some((d) => dietLines(d).length > 0)`) 머리 캡션 두 줄 뒤에 `> ` + 범례 두 줄을 붙인다.
   - 머리 문자열은 `dates` 계산 뒤에 만든다(순서만 바꾼다).
   - 식단이 없는 기간은 머리가 지금과 글자 하나까지 같다 — 운동만 쓰는 내보내기와 골든이 바뀌지 않는다.
   - 기록이 없는 기간(`(기간 내 기록 없음)`)도 범례 없음.

### 검증 (`src/lib/v1112.test.ts`, describe `II3`)

| 테스트 이름 | 확인하는 것 |
|---|---|
| `식단이 있으면 범례 두 줄이 간격 캡션 뒤에 온다` | 운동 1 + 식단 1일 → 머리 4·5번째 줄이 `> ` + `dietMarkLegend()` 각 줄 |
| `식단만 있는 기간에도 범례가 있다` | 세션 없음, 식단 1일 → 범례 포함 |
| `식단이 없으면 머리가 그대로다` | 운동만 → 머리 = 현행 두 줄 캡션 (`dietMarkLegend()[0]` 미포함) |
| `기록 슬롯이 0인 식단일만 있으면 범례가 없다` | `slots: {}`인 `DietDay`만 → 범례 미포함 (섹션이 안 나오므로) |
| `범례 퍼센트가 상수와 맞는다` | 범례 1줄에 `${Math.round(SLOT_GRADE_HIGH*100)}%`·`${Math.round(SLOT_GRADE_MID*100)}%`, 2줄에 `ADHERENCE_GOOD`·`ADHERENCE_MID` 퍼센트와 `MIN_SLOTS_FOR_VERDICT` 포함 |
| `범례가 모든 마크를 말한다` | 1줄에 `SLOT_MARK`의 `full·high·mid·low·zero` 글자 전부, 2줄에 `ADHERENCE_MARK`의 `good·mid·poor` 글자 전부 |
| 소스 스캔 `dietMarkLegend에 마크 글자와 임계 숫자 리터럴이 없다` | `dietMarkLegend` 함수 본문(`stripComments`)에 `●◕◐◔✗○` 글자와 `80`·`45`·`85`·`50` 숫자 리터럴 없음 |

### 범위 제외

| 안 하는 것 | 이유 |
|---|---|
| 운동 쪽 범례 추가(`[복귀]` 등) | 이번 주제가 아니다. 보고서 2·4·5절이 다룬다. |
| 범례를 식단 섹션마다 반복 | 문서 길이만 는다. 머리 한 번이면 LLM이 읽는다. |
| 예전 문서와의 차이 안내(`v1.11.2 이전 문서의 ◐는 …`) | 새 마크가 화면과 같고 범례가 뜻을 말한다. 매 내보내기마다 LLM 입력이 늘고 제거 시점 관리가 생긴다 (v1.11.1 HH1과 같은 판단). |

---

## 과거 판정 불변

바뀌지 않는 것: `slotScore`·`baseSlotScore`·`summarizeDietDay`·`ADDITION_CAP`·`SCORE`·임계값 전부. 저장값 무변경.
**화면 글자 무변경** (II2는 같은 문구를 함수로 옮긴다).

이전 내보내기와 달라지는 것 (같은 기간을 다시 내보낼 때):

| 자리 | 전 | 후 |
|---|---|---|
| 점수 0.8~1 미만 슬롯 | `◐` | `◕` |
| 점수 0~0.45 미만 슬롯 | `◐` | `◔` |
| 하루 헤더 (판정 있음) | `준수 ●` | `준수 ● 97%` |
| 하루 헤더 (3슬롯 미만) | `준수 —` | `기록 1/5슬롯` |
| 식단 있는 기간 머리 | 캡션 2줄 | 캡션 2줄 + 범례 2줄 |

운동 부분과 식단 없는 내보내기는 글자 하나 바뀌지 않는다. 예전 문서와의 차이는 문서에 안내하지 않는다(II3 범위 제외).

---

## 구현 순서와 검증

II1 → II2 → II3 (II3 범례가 II1의 상수와 II2의 문구 형식을 말한다). 커밋은 **구현 3 + 기록·버전 1**.

관례:
- `npm run build` (타입 확인 포함, `tsc` 직접 호출 금지) · 작업 중에는
  `npx vitest run src/lib/v1112.test.ts src/lib/dietExport.test.ts src/lib/diet.test.ts src/lib/v19.test.ts src/lib/export.test.ts`만 · 마지막에 `npm test` 한 번
- 커밋 개수는 실행 출력을 복사한다 (`git log --oneline main..HEAD`)
- 커밋 메시지는 `git commit -F - <<'MSG'`
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `exportMarkdown.ts`에 로컬 `markOf`(3단) 복원 → `보고서 사례 …◕`·`보충 블록 안 먹음은 ◔`·스캔 `슬롯 마크 글자와 점수 비교가 없다` 실패
  ② `slotGrade`의 `SLOT_GRADE_HIGH`를 `0.8` 리터럴로 → 스캔 `slotGrade에 임계값 리터럴이 없다` 실패
  ③ `DietDayEditor.tsx`에 원래 삼항식 복원 → 스캔 `화면과 내보내기가 하루 문구를 직접 만들지 않는다` 실패
  ④ `exportMarkdown.ts` 헤더를 `준수 ${ADHERENCE_MARK[summary.adherence]}`로 → `내보내기 헤더: 보고서 사례(1슬롯)`·스캔 실패
  ⑤ `dietMarkLegend`의 한 퍼센트를 `'80%'` 리터럴로 → 스캔 `dietMarkLegend에 … 리터럴이 없다` 실패
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 테스트 픽스처(번들 식단 플랜 4종)로 한정한다고 첫 줄에 적는다:
  ① `diet.test.ts`·`v19.test.ts`·`dietExport.test.ts`가 수정 없이 통과한다 (점수·판정·기존 내보내기 단언 불변)
  ② `export.test.ts`·`v111.test.ts`(골든 포함)·`v1111.test.ts`가 수정 없이 통과한다 (운동 내보내기 불변)
  ③ `git diff main -- src/lib/diet.ts`가 상수 2개 추가·`slotGrade` 리터럴 치환·`dietDayStatusText`·`dietMarkLegend` 추가뿐이다 (점수 함수 무변경 — diff를 DEV-RECORD에 붙인다)
  ④ 바뀌는 것: 위 "과거 판정 불변" 표의 다섯 자리
- 완료 후 `docs/DEV-RECORD-v1.11.2.md` (맨 위 "이 환경에서 확인된 제약"은 v1.11.1 목록을 이어받는다)
- `package.json` **1.11.2**는 기록 커밋에서 올린다

---

## 사람이 정할 것

없음. 처음 두 항목(범례 문구, 예전 내보내기와의 차이)은 두 검토 모두 반대가 없어 추천안 A로 확정했고
본문(II3 설계 1, II3 범위 제외, "과거 판정 불변")에 녹였다.

---

## 검토 반영 기록

검토: Codex · Antigravity, 둘 다 "그대로 진행 가능" (검토 커밋 `7cb6a68`). 지적마다 코드를 다시 확인했다.

| 지적 | 출처 | 처리 | 근거 |
|---|---|---|---|
| II3 머리를 `dates`·`dietLines` 계산 뒤로 옮겨야 한다 | Codex 경미 1 | 이미 반영 | II3 설계 2 "머리 문자열은 `dates` 계산 뒤에 만든다". 현재 `head`가 `dates`보다 먼저다 (`src/lib/exportMarkdown.ts:338` · `:348`) — 본문 그대로 |
| 과거 판정 불변 확인의 범위 표기(픽스처 4종)와 다섯 자리 대응을 DEV-RECORD에서 유지 | Codex 경미 2 | 이미 반영 | "구현 순서와 검증" 과거 판정 불변 확인 절 첫 줄과 ④ — 본문 그대로 |
| 점수 0.846이면 `◐`인데 퍼센트는 `85%` | Antigravity 경미 | 일부 반영 | 코드 확인: 판정은 반올림 전 점수(`src/lib/diet.ts:467-474`), 퍼센트는 `Math.round` (`src/components/DietDayEditor.tsx:166`). 검토자는 "수정 불필요"라 했고 방식은 바꾸지 않는다. 다만 이번 PLAN이 범례(● 85% 이상)를 새로 붙이므로 이 경계가 문서 안에서 어긋나 보인다는 점을 II2 범위 제외에 이유와 함께 적고, 경계 테스트를 II2 검증에 더했다 |
| 사람이 정할 것 1 (범례 문구) | Antigravity 안 A 지지 · Codex 의견 없음 | 안 A 확정 | 반대 없음 |
| 사람이 정할 것 2 (예전 내보내기 안내) | Antigravity 안 A 지지 · Codex 의견 없음 | 안 A 확정 | 반대 없음 |

두 검토자가 다르게 본 지점은 없다. 기각한 지적은 없다.
