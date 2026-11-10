# PLAN v1.15 — 내 음식 목록과 시간별 "먹은 것" 기록 (MM)

> 작성: Fable 5.2 (설계자), 2026-11-10. 대상 코드: v1.14.0 (`main` `4e94855`).
> 근거: 이슈 #31 (구조 변경). 이 PLAN은 이슈의 **요청 3·4만** 설계한다. 요청 1·2·5는 아래 "단계 지도"대로 나눈다.
>
> **성격**: 새 저장 자리는 **둘**이다(`settings.userFoods` 행, `DietDay.log` 선택 필드). Dexie 스키마 버전과 백업 `SCHEMA_VERSION`은 올리지 않는다.
> 플랜·슬롯 체크, 슬롯 점수, 준수 판정(●◐○), 연속 저칼로리 경고, 홈 칩, 식사 알림은 바뀌지 않는다.
>
> **이 PLAN으로 이슈 #31은 닫히지 않는다.** PR 본문에 `Closes #31`을 쓰지 않고 `Refs #31`로 적는다.

---

## 단계 지도 (이슈 #31 전체)

이슈의 요청 5가지를 배포 가능한 단계로 나눈다. 각 단계는 앞 단계 없이도 쓸 수 있는 상태로 끝난다.

| 단계 | 요청 | 내용 | README "핵심 설계 결정" | 상태 |
|---|---|---|---|---|
| ① | 3·4 | 내 음식 목록 + 시간별 먹은 것 기록 | 뒤집지 않는다 | **이 PLAN (v1.15)** |
| ② | 2 | 운동 플랜을 앱에서 만들고 고친다 | 뒤집지 않는다 (루틴 JSON 교체는 남는다) | 다음 PLAN (v1.16). 설계 안 함 |
| ③ | 1·5 | 계정·서버 DB·계정별 데이터 분리 | **뒤집는다** | **중단(사람 필요)** — 이슈에 승인 표시가 없다 |

- **①을 먼저 하는 이유:** 요청 3·4만 이유가 "지금 기록이 어렵다"이고(요청 1·2·5의 이유는 "여러 사람이 쓰게"), 서버 결정과 무관하게 지금 쓰는 사람에게 바로 쓸모가 있다.
- **②를 이 PLAN에 넣지 않은 이유:** 크기가 크고(루틴에는 Day·하한 모드·부위 목표·복귀 규칙이 얽혀 있다), 쓸모가 ③의 결정에 달려 있다(혼자 쓰면 JSON 교체로 충분하다). 설계 때 반드시 다룰 사실 하나만 적어 둔다: `ensureSeed`는 번들 `seedRevision`이 바뀌면 `db.routines.put(BUNDLED_ROUTINE)`으로 덮어쓰고 `activeRoutineId`도 번들로 되돌린다(`src/db/seed.ts:89-95`). 앱에서 고친 루틴은 번들과 다른 id로 저장해야 하고, 시드가 활성 루틴을 되돌리지 않게 고쳐야 한다.
- **③이 뒤집는 줄:** `README.md:29` "서버를 두지 않는다", `README.md:11` "서버도 로그인도 없고, 데이터는 전부 기기 안(IndexedDB)", `README.md:221` "백업 · 비밀값" 절(Gist), `README.md:458` "1인용입니다". 이슈 양식의 승인 칸(`.github/ISSUE_TEMPLATE/3-restructure.yml:30`)이 체크돼 있지 않아 설계하지 않았다. 선택지와 추천은 "사람이 정할 것" 1번에 있다.

---

## 작업 개요

| ID | 내용 | 저장 형태 |
|---|---|---|
| MM0 | 골든: v1.14 코드의 식단 요약·월 집계·내보내기를 고정한다 (테스트만) | 없음 |
| MM1 | 내 음식 목록: 등록·수정·삭제, 플랜 품목과 합친 목록, 정렬 | `settings` 행 `userFoods` |
| MM2 | 먹은 것 시간별 기록: 저장·입력 시트·하루 합계·달력 회색 점 | `DietDay`에 선택 필드 `log` |
| MM3 | 내보내기에 `먹은 것` 줄 | 없음 (MM2 값을 읽는다) |

---

## MM0. 골든 — v1.14 출력 고정

모든 작업보다 먼저, 테스트만 담아 커밋한다. 이후 고치지 않는다(DEV-RECORD에 해시).

`src/lib/v115.test.ts`에 픽스처 `MM_DAYS`를 **이 파일 안에** 만든다(다른 테스트 파일을 import하지 않는다). 플랜은 `BUNDLED_DIET_PLANS`의 기본 플랜(`isDefault`)을 쓴다.

| 날짜 | 내용 | 겨냥 |
|---|---|---|
| 11-02 | 전 슬롯 전부 체크 | 준수 ● 불변 |
| 11-03 | 슬롯 3개: 전부 체크 / 일부 체크 + 대체(`other`) / 안 먹음 | 판정·상세 줄 불변 |
| 11-04 | 슬롯 1개 전부 체크 + 추가(`cheat`), 메모 있음 | 판정 전(회색 점)·`+ 추가`·메모 줄 불변 |
| 11-05 | `slots: {}` (기록 행만 있고 슬롯 없음) | 내보내기 빈 배열·회색 점 없음 불변 |

골든 세 개: `MM_SUMMARY_BEFORE`(날짜별 `summarizeDietDay` 반환 객체 전체) · `MM_MONTH_BEFORE`(`dietMonthStats`의 `byDate`·`logged`·`good`·`partialDates`를 평범한 객체·정렬 배열로) · `MM_EXPORT_BEFORE`(날짜별 `dietSectionMarkdown` 줄 배열).
이 커밋의 단언은 "지금 코드 출력 = 골든" 셋뿐이다.

MM2가 `DietDaySummary`에 필드를 더하므로, MM2 이후에는 골든과의 비교를 **골든에 있는 키만** 놓고 한다(`toMatchObject`). 이 비교 방식은 MM0 커밋에서 처음부터 그렇게 쓴다 — 나중에 골든 테스트를 고치지 않기 위해서다.

---

## MM1. 내 음식 목록

### 진단

- 음식을 등록할 자리가 없다. 플랜에 없는 음식은 슬롯 시트의 대체·추가에 **글자와 태그 3단**으로만 적는다(`src/types.ts:492-508`). 영양값이 없어 그날 단백질 합계에 들어가지 않는다(`src/lib/diet.ts:448-454` — `similar` 대체만 계획값으로 인정).
- 같은 음식을 다시 먹어도 매번 새로 타이핑한다. 저장된 목록이 없다.
- 플랜을 바꾸려면 JSON을 교체해야 한다(`src/components/DietIoPanel.tsx`). `README.md:461`이 "자유 식단은 플랜 JSON 교체로 다룹니다"라고 적고 있다.
- 플랜 품목(이름·분량·kcal·단백질)은 이미 음식 목록 구실을 할 수 있다(`DietItem`·`DietItemVariant`, `src/types.ts:401-424`).

### 설계

**목록은 두 원천을 합친 것이다.** 플랜 품목은 저장하지 않고 플랜에서 파생한다. 사용자가 새로 넣은 음식만 저장한다(파생할 원천이 없다).

**타입** (`src/types.ts`)

```ts
export interface Food {
  id: string          // crypto.randomUUID()
  name: string        // 필수, trim 후 1자 이상
  qty: string         // "1개" | "100g" | "" (선택)
  kcal?: number       // 비우면 "영양 미입력" — 0과 다르다
  proteinG?: number
  createdAt: string   // ISO
}
```

`Settings`에 `userFoods?: Food[]`를 더한다.

**저장 자리: `settings` 테이블의 `userFoods` 행 하나**(값이 `Food[]`). 새 Dexie 테이블을 만들지 않는다.

| 안 | Dexie 버전 | 백업 `SCHEMA_VERSION` | 배포 후 이전 버전으로 되돌리기 |
|---|---|---|---|
| **`settings` 행 (채택)** | 3 그대로 | 3 그대로 | 가능. 옛 코드는 모르는 행을 건드리지 않는다 |
| 새 테이블 `foods` | 4 | 4 (`backup.ts:30-35` 원칙: 새 테이블은 상향) | 불가. 낮은 버전으로 여는 Dexie가 실패하고, v4 백업은 v3 앱이 거부한다 |

목록은 수십~수백 건이라 한 행으로 충분하다. ③에서 서버로 옮길 때 어차피 다시 나눈다.

**새 파일 `src/lib/foods.ts`** (순수 함수, React·Dexie 없음)

| 함수 | 반환 | 규칙 |
|---|---|---|
| `foodKey(name, qty)` | `string` | `name.trim()` + `'|'` + `qty.trim()`. 같은 음식인지 판정하는 **유일한 자리** |
| `planFoods(plans)` | `CatalogFood[]` | `visiblePlans(plans)`의 모든 슬롯·품목에 `variantsOf(item)`을 펴서 `{name, qty, kcal, proteinG}`. `foodKey`로 중복 제거(먼저 나온 것 유지). `legacy` 플랜은 뺀다 |
| `foodCatalog(plans, userFoods, days)` | `CatalogFood[]` | 내 음식 + 플랜 품목. 같은 `foodKey`가 양쪽에 있으면 내 음식을 남긴다. 아래 순서로 정렬 |
| `validateFood(input, plans, userFoods, editingId?)` | `string[]` (문제 문구, 없으면 빈 배열) | 아래 표 |
| `applyAddFood` / `applyUpdateFood` / `applyRemoveFood` | `Food[]` | 배열을 받아 새 배열을 준다 |

```ts
export interface CatalogFood {
  source: 'user' | 'plan'
  id?: string         // user일 때만
  name: string; qty: string; kcal?: number; proteinG?: number
}
```

**정렬** (`foodCatalog`): ① MM2의 `log`에 적힌 적 있는 음식을 **마지막으로 먹은 때(날짜+시각)가 가까운 순**으로. ② 적힌 적 없는 내 음식을 `createdAt` 최신순으로. ③ 적힌 적 없는 플랜 품목을 플랜에 나오는 순서로. "마지막으로 먹은 때"는 `days`의 `log`에서 `foodKey`로 찾는다 — 저장하지 않는다.

**검증** (`validateFood`)

| 조건 | 문구 |
|---|---|
| 이름이 비었다 | `이름을 적어 주세요` |
| kcal·단백질이 숫자가 아니거나 음수 (빈칸은 통과) | `칼로리와 단백질은 0 이상의 숫자로 적어 주세요` |
| 같은 `foodKey`가 내 음식(자기 자신 제외)이나 플랜 품목에 있다 | `같은 이름·분량의 음식이 이미 목록에 있습니다` |

**쓰기** (`src/lib/useDiet.ts`): `mutateUserFoods(fn: (foods: Food[]) => Food[]): void`. `rememberVariantDefault`(`useDiet.ts:82-94`)와 같은 꼴이다 — `db.transaction('rw', db.settings)` 안에서 `userFoods` 행을 읽어 `fn`을 적용해 `put`하고, 성공 뒤 `.then(scheduleBackup)`. 결과가 빈 배열이면 행을 지운다(`deleteSettings`와 같은 이유). `useDiet()`가 `userFoods`를 함께 읽어 돌려준다(없으면 모듈 상수 빈 배열).

**화면**: 등록·수정·삭제는 MM2의 "먹은 것 추가" 시트 안에서 한다. 설정 탭에 따로 관리 화면을 두지 않는다.

- 시트 아래 `새 음식 등록` 버튼 → 폼: 이름 / 분량(선택) / 칼로리 kcal(선택) / 단백질 g(선택) / `등록하고 추가` 버튼. 눌리면 목록에 등록하고 같은 시각으로 `log`에도 1개 추가한다.
- 폼 안내 한 줄: `칼로리·단백질을 모르면 비워 두세요. 비운 음식은 합계에 들어가지 않습니다.`
- 내 음식 행에는 `편집` 버튼이 있다(플랜 품목 행에는 없다) → 같은 폼 + `저장` / `목록에서 삭제`.
- 수정·삭제는 **이미 적은 `log`를 바꾸지 않는다**(MM2에서 값을 복사해 담는다).

### 검증 (`v115.test.ts`, describe `MM1`)

- `foodKey(' 바나나 ', '1개 ')`와 `foodKey('바나나', '1개')`가 같다.
- `planFoods`는 변형이 있는 품목에서 기본 변형과 대체 변형을 모두 낸다. 두 슬롯에 같은 이름·분량이 있으면 한 번만 낸다. `legacy` 플랜의 품목은 없다.
- `foodCatalog`: `log`에 적힌 음식이 맨 위, 더 최근에 먹은 것이 먼저. 같은 날이면 시각이 늦은 것이 먼저.
- `foodCatalog`: 적힌 적 없는 내 음식이 적힌 적 없는 플랜 품목보다 앞이다.
- `foodCatalog`: 내 음식과 플랜 품목의 `foodKey`가 같으면 한 줄이고 `source === 'user'`다.
- `validateFood`: 이름 공백뿐 → 문구 1개. kcal `-1` → 문구. kcal·단백질 빈칸 → 통과. 플랜 품목과 같은 이름·분량 → 문구. 편집 중인 자기 자신과 같은 것은 통과.
- `applyUpdateFood`·`applyRemoveFood`는 받은 배열을 바꾸지 않는다(새 배열).
- 스캔: `src/lib/useDiet.ts`에 `export function mutateUserFoods`가 있고 `.then(scheduleBackup)` 개수가 쓰기 함수 4개와 같다(기존 테스트 수정 ①).
- 스캔: `foodKey`를 거치지 않고 `` `${…name}|${…qty}` `` 꼴로 키를 만드는 곳이 `foods.ts` 밖에 없다.

### 범위 제외

- 번들 음식 DB, 칼로리 검색, 바코드·사진 인식: 서버나 큰 데이터가 필요하고 입력 마찰이 는다(`src/types.ts:392-393`).
- 탄수화물·지방: 이 앱의 1급 지표는 단백질이다(`types.ts:413`). 필드를 늘리면 등록 폼이 길어진다.
- 음식 묶음(세트 메뉴)·즐겨찾기 고정: 정렬이 최근 순이라 자주 먹는 것이 위로 온다.
- 플랜 품목을 앱에서 고치기: 플랜 편집은 ②와 같은 종류의 일이라 따로 설계한다.

### README 반영

- 기능 표 식단 줄(`README.md:39`) 끝에 더한다: `, 내 음식 목록(직접 등록)`
- "데이터 모델" 문단(`README.md:256-258`)의 Dexie 테이블 문장 뒤에 한 줄: `직접 등록한 음식은 테이블을 늘리지 않고 settings의 userFoods 행 하나에 둡니다. 스키마 버전을 올리지 않아야 배포를 되돌릴 수 있기 때문입니다.`
- Limitations(`README.md:461`)를 바꾼다: `- 식단은 **정해진 플랜의 준수 여부**와, 플랜 밖에서 먹은 것의 **시간별 기록**을 받습니다. 음식 목록은 플랜 품목과 직접 등록한 음식뿐입니다. 음식 DB·칼로리 검색·사진 인식은 하지 않습니다 (과설계 + 입력 마찰).`

---

## MM2. 먹은 것 시간별 기록

### 진단

- 하루 기록은 플랜의 슬롯 id로만 담긴다(`DietDay.slots: Record<string, SlotRecord>`, `types.ts:530`). 슬롯에 없는 시각에 먹은 것은 어느 슬롯의 "추가"로 끼워 넣어야 한다.
- 추가는 슬롯마다 **하나**이고 글자뿐이다(`types.ts:505-508`). 두 번 먹으면 한 칸에 이어 적어야 하고, 시각이 없다.
- 그날 단백질·칼로리 합계는 체크한 플랜 품목만 센다(`diet.ts:456-467`). 플랜 밖에서 먹은 날은 합계가 실제보다 낮게 나온다.
- 슬롯을 하나도 건드리지 않으면 달력에 아무 표시가 없고(`diet.ts:746` — `loggedSlots > 0`일 때만 회색 점) 내보내기에도 나오지 않는다(`exportMarkdown.ts:75` — 기록된 슬롯이 없으면 빈 배열).

### 설계

**플랜 체크는 그대로 두고, 그 아래에 "먹은 것" 목록을 더한다.** 유동적인 날은 슬롯을 건드리지 않고 먹은 것만 적으면 된다.

**타입** (`src/types.ts`)

```ts
export interface FoodLogEntry {
  id: string        // crypto.randomUUID()
  time: string      // "13:20" (24시간, 로컬)
  name: string      // 적는 순간 목록에서 복사한 값. 이후 목록을 고쳐도 바뀌지 않는다
  qty: string
  kcal?: number     // 1개 분량 기준. 없으면 영양 미입력
  proteinG?: number
  count: number     // 몇 개 먹었나. 0.5 단위, 최소 0.5, 기본 1
}
```

`DietDay`에 `log?: FoodLogEntry[]`를 더한다. 비면 키를 지운다(빈 배열을 저장하지 않는다).

- **값을 복사해 담는 이유:** 목록의 음식을 고치거나 지워도 과거 날의 합계가 바뀌지 않아야 한다. `foodId`로 참조하면 삭제한 음식의 과거 기록이 깨진다. 그래서 `foodId`는 두지 않고, 최근 순 정렬은 `foodKey(name, qty)`로 맞춘다.
- **`DietDay` 안에 두는 이유:** 날짜가 PK인 한 행이라 기존 `mutateDietDay`의 읽고-고쳐-쓰기 트랜잭션과 백업을 그대로 탄다. 하루 삭제도 같이 지워진다.

**연산** (`src/lib/dietOps.ts`)

| 함수 | 동작 |
|---|---|
| `applyAddLog(day, entry)` | `log` 끝에 붙인다 |
| `applyUpdateLog(day, id, patch: { time?, count? })` | 그 id의 시각·개수만 바꾼다. 이름·영양값은 바꾸지 않는다 |
| `applyRemoveLog(day, id)` | 지운다. 남은 게 없으면 `log` 키를 지운다 |

`count`는 연산 안에서 `Math.max(0.5, Math.round(count * 2) / 2)`로 맞춘다. `time`이 `/^([01]\d|2[0-3]):[0-5]\d$/`에 맞지 않으면 그 연산은 `day`를 그대로 돌려준다.

**합계** (`src/lib/diet.ts`)

| 함수 | 반환 | 규칙 |
|---|---|---|
| `logTotals(log)` | `{ kcal, proteinG, count, unknown }` | 줄마다 `Math.round(kcal × count)`·`Math.round(proteinG × count)`를 더한다. `kcal`과 `proteinG`가 **둘 다** 없는 줄은 `unknown`에 센다. 한쪽만 있으면 있는 쪽만 더한다 |
| `sortedLog(log)` | `FoodLogEntry[]` | `time` 오름차순, 같으면 저장 순서. 화면과 내보내기가 이 순서를 쓴다 |
| `hasDietRecord(summary)` | `boolean` | `summary.loggedSlots > 0 || summary.logCount > 0`. "이 날 기록이 있는가"의 **유일한 판정** |
| `logEntryText(entry)` | `string` | 아래 표기 표. 화면과 내보내기가 같은 글자를 쓴다 |

`DietDaySummary`에 `logCount: number`(줄 수)와 `logUnknown: number`를 더한다. `summarizeDietDay`는 `day.log`가 있으면 `logTotals`의 `kcal`·`proteinG`를 기존 `kcal`·`proteinG`에 **더한다**. `score`·`adherence`·`loggedSlots`·`totalSlots`·`target*`는 손대지 않는다.

- **먹은 것은 준수 점수에 넣지 않는다.** 준수는 "플랜을 얼마나 따랐나"이고, 먹은 것에는 좋고 나쁨 태그가 없다(앱은 판단하지 않는다). 점수를 깎는 길은 기존 슬롯 "추가"의 태그가 그대로 맡는다.
- **같은 음식을 슬롯 체크와 먹은 것에 둘 다 적으면 두 번 더해진다.** 앱이 막지 않는다. 시트 안내 문구로만 알린다.

**표기** (`logEntryText`)

| 경우 | 글자 |
|---|---|
| 기본 | `13:20 서브웨이 터키 15cm — 350kcal · 단 25g` |
| 분량 있음, 2개 | `16:00 바나나 1개 ×2 — 210kcal · 단 2g` |
| 단백질만 있음 | `19:00 프로틴바 1개 — 단 20g` |
| 영양 미입력 | `21:10 회식 — 영양 미입력` |

`×n`은 `count !== 1`일 때만, 숫자는 개수를 곱해 반올림한 값이다.

**기록이 있는 날** — `hasDietRecord`를 쓰는 자리

| 자리 | 지금 | 바꾼 뒤 |
|---|---|---|
| `dietMonthStats`의 `partialDates` (`diet.ts:746`) | `loggedSlots > 0` | `hasDietRecord(summary)` → 먹은 것만 적은 날도 달력에 회색 점 |
| `dietSectionMarkdown` 첫 반환 (`exportMarkdown.ts:75`) | 기록된 슬롯 0이면 `[]` | `!hasDietRecord(summary)`이면 `[]` (MM3) |
| 하루 삭제 확인 문구 (`DietDayEditor.tsx:304`) | `이 날 식단 기록(n슬롯)이 삭제됩니다.` | `이 날 식단 기록(n슬롯 · 먹은 것 m건)이 삭제됩니다.` (`m`이 0이면 ` · 먹은 것 m건`을 뺀다) |

달력 범례(`HistoryScreen.tsx:109-110` "회색 점 = 기록 있음 / 판정 전")는 그대로 맞는다.

**화면** (`DietDayEditor.tsx` — 오늘 화면과 기록 탭 과거 보정이 같이 바뀐다)

- 슬롯 카드들 아래, 메모 카드 위에 카드 하나를 더한다. 라벨 `먹은 것 (시간별)`.
  - 줄: `sortedLog` 순서로 `logEntryText`. 줄을 누르면 그 줄이 펼쳐져 시각(`<input type="time">`)·개수(`NumberStepper`, 0.5 단위)·`삭제` 버튼이 나온다. 값은 바꾸는 즉시 저장된다(저장 버튼 없음).
  - 줄이 없으면 한 줄 안내: `플랜에 없는 음식이나 다른 시간에 먹은 것을 적습니다.`
  - 버튼 `＋ 먹은 것 추가` → 시트.
- 위쪽 요약 카드의 kcal 줄(`DietDayEditor.tsx:158-160` 부근) 아래에, `logCount > 0`일 때만 한 줄: `먹은 것 n건 포함` + (`logUnknown > 0`이면) ` · 영양 미입력 m건`.
- 모든 변경은 기존 `mutate`(`DietDayEditor.tsx:111-114`)를 거친다. 저장된 적 없는 날에 먹은 것을 처음 더하면 `slots: {}`인 행이 생긴다.

**새 컴포넌트 `src/components/FoodLogSheet.tsx`** ("먹은 것 추가" 시트)

| 요소 | 동작 |
|---|---|
| 시각 `<input type="time">` | 편집 날짜가 오늘이면 지금 시각, 과거 날짜면 빈 값. 비어 있으면 목록 행과 `등록하고 추가`가 눌리지 않고 `먹은 시각을 먼저 골라 주세요`를 보인다 |
| 검색 input | 이름 부분 일치(공백·대소문자 무시). 비면 전체 |
| 목록 | `foodCatalog` 순서. 행: 이름·분량, 오른쪽에 `350kcal · 단 25g` 또는 `영양 미입력`. 플랜 품목 행에는 작은 글자 `플랜` |
| 행 탭 | 그 시각·개수 1로 **바로 추가**한다. 시트는 닫지 않는다(여러 개를 이어 넣는다). 시트 위쪽에 `방금 추가: 이름` 한 줄 |
| `새 음식 등록` · `편집` | MM1의 폼 |
| 안내 한 줄 | `플랜에서 체크한 음식을 여기에도 적으면 합계에 두 번 들어갑니다.` |
| `닫기` | 시트를 닫는다 |

새 `input`은 모두 `{...NO_AUTOFILL}`을 받는다.

### 검증 (`v115.test.ts`, describe `MM2`)

- `applyAddLog` 뒤 `summarizeDietDay`의 `proteinG`·`kcal`이 줄 값만큼 늘고, `score`·`adherence`·`loggedSlots`는 더하기 전과 같다.
- `count: 2`, `kcal: 105`, `proteinG: 1.3` → 합계에 210kcal·3g(`Math.round(2.6)`)이 더해진다.
- `kcal`·`proteinG`가 둘 다 없는 줄: 합계 변화 없음, `logUnknown === 1`, `logCount === 1`.
- `proteinG`만 있는 줄: 단백질만 늘고 `logUnknown === 0`.
- 슬롯을 하나도 건드리지 않고 먹은 것 1건만 있는 날: `adherence === 'unlogged'`, `hasDietRecord === true`, `dietMonthStats().partialDates`에 그 날짜가 있다.
- `slots: {}`이고 `log`가 없는 날(MM0의 11-05): `hasDietRecord === false`, `partialDates`에 없다.
- 슬롯 3개 이상 기록 + 먹은 것 여러 건: `adherence`가 먹은 것을 뺀 날과 같다(먹은 것의 kcal이 아무리 커도).
- `applyRemoveLog`로 마지막 줄을 지우면 `'log' in day === false`.
- `applyUpdateLog`는 `time`·`count`만 바꾸고 `name`·`kcal`·`proteinG`·`id`는 그대로다. `count: 0.2` → 0.5, `count: 1.3` → 1.5.
- `applyAddLog`에 `time: '25:00'`이나 `''` → 받은 `day`와 같은 객체를 돌려준다.
- `sortedLog`: `09:00`, `21:00`, `09:00` 순으로 넣으면 `09:00`(먼저 넣은 것), `09:00`, `21:00`.
- **기존 연산이 `log`를 지우지 않는다**: `log`가 있는 날에 `applyToggleItem`·`applyCheckAllItems`·`applySkipSlot`·`applySubstitution`·`applyAddition`·`applyClearAddition`·`applyClearSubstitution`·`applyVariantChoice`·`applyClearSlot`·`applyPlan`·`applyNote`·`seedVariantChoices`를 각각 적용해도 `log`가 같다. (배포를 되돌렸을 때 옛 코드가 기록을 보존하는 근거이기도 하다.)
- 목록의 음식을 `applyUpdateFood`로 고치거나 `applyRemoveFood`로 지워도, 이미 만든 `FoodLogEntry`와 그날 `summarizeDietDay`가 그대로다.
- 플랜을 바꿔도(`applyPlan`) `log`의 합계 기여는 같다.
- `resolveTrainingDays`(`diet.ts:83`)를 거친 날에도 `log`가 남는다.
- MM0 골든 셋이 그대로 통과한다.
- 스캔: `loggedSlots > 0`을 직접 비교하는 곳이 `hasDietRecord` 정의 밖에 없다.
- 스캔: `FoodLogSheet.tsx`·`DietDayEditor.tsx`에 `requestSync(`가 없다(쓰기 함수가 예약한다).

### 범위 제외

- **플랜 없이 기록하는 날 모드**(슬롯 카드 숨김): `planId`가 필수라 저장 형태가 바뀌고, 과거 날의 판정 경로가 갈린다. 슬롯을 안 건드리면 같은 결과를 얻는다. "사람이 정할 것" 2번.
- 기존 슬롯 "추가"·"대체"(글자 + 태그)를 먹은 것으로 옮기기: 과거 기록의 준수 점수가 바뀐다. 두 길을 다 남긴다.
- 먹은 것에 태그(비슷/다름/치팅) 달기: 준수에 넣지 않기로 했으므로 쓸 곳이 없다.
- 홈 칩·식사 알림에 먹은 것 반영: 둘 다 "다음에 먹을 플랜 끼니"를 말한다(`diet.ts:684`).
- 하루 목표 대비 초과 경고: 앱은 판단하지 않는다. 합계 숫자만 보인다.
- 먹은 것만 적은 날이 연속 저칼로리 경고의 연속일에 세어지는 것: 기록 행이 생기면 `planId`가 붙으므로 `planStreak`(`diet.ts:665`)가 센다. 슬롯 하나만 체크한 날과 같은 동작이라 고치지 않는다.

### README 반영

- 기능 표 식단 줄(`README.md:39`)에 더한다: `, 시간별 먹은 것 기록`
- "기록의 정확성" 절, "식단 기록은 read-modify-write 트랜잭션으로 쓴다" 항목(`README.md:116`) 뒤에 새 항목:

  ```
  - **먹은 것 기록은 음식 값을 복사해 담는다**
    목록의 음식을 참조(id)로 걸면, 나중에 칼로리를 고치거나 음식을 지울 때 과거 날의
    합계가 따라 바뀌거나 깨집니다. 적는 순간의 이름·분량·영양값을 그날 기록에 복사하고,
    목록의 "최근 먹은 순" 정렬은 저장하지 않고 이 기록에서 계산합니다.
    먹은 것은 그날 단백질·칼로리 합계에만 들어가고 **플랜 준수 판정에는 들어가지 않습니다.**
  ```

- "데이터 모델" 문단(`README.md:256-258`)에 한 줄: `dietDays의 행은 플랜 슬롯 기록(slots)과 시간별 먹은 것(log)을 함께 담습니다.`

---

## MM3. 내보내기에 먹은 것

### 진단

- LLM 분석이 이 앱의 분석 경로인데(`README.md:28`), 식단 절은 슬롯만 적는다(`exportMarkdown.ts:72-125`). 먹은 것을 적어도 내보내기에 없으면 분석에 닿지 않는다.
- 머리 줄의 `단백질 추정 Xg`는 `summarizeDietDay`에서 오므로 MM2 뒤에는 먹은 것이 포함된 숫자가 된다. 무엇이 더해졌는지 본문에 없으면 숫자를 설명할 수 없다.

### 설계

`dietSectionMarkdown(plan, day)`(`exportMarkdown.ts:72`)만 고친다.

| 순서 | 줄 | 조건 |
|---|---|---|
| 1 | `### 식단 — <플랜> · <상태> (단백질 추정 Xg / Yg)` | `hasDietRecord`. 형식은 지금과 같다. 슬롯 0이면 상태는 `기록 0/5슬롯` |
| 2 | `- 슬롯: …` | 기록된 슬롯이 1개 이상일 때만 (지금은 항상) |
| 3 | 슬롯 상세 줄들 | 지금과 같다 |
| 4 | `- 먹은 것: ` + `logEntryText` | `sortedLog` 순서로 **한 건에 한 줄** |
| 5 | `- 먹은 것 합계: 560kcal · 단 27g` + (`unknown > 0`이면 ` · 영양 미입력 n건`) | 먹은 것이 2건 이상일 때만 |
| 6 | `- 메모: …` | 지금과 같다 |

범례(`dietMarkLegend`, `diet.ts:514`) 끝에 한 줄을 더한다: `먹은 것 = 플랜 밖에서 시간별로 적은 음식. 단백질 추정에는 들어가고 준수에는 들어가지 않는다. "영양 미입력"은 값을 모르는 음식이라 합계에서 빠진다.`
이 줄은 **범위 안에 먹은 것이 있는 날이 하나라도 있을 때만** 낸다. 그래서 `dietMarkLegend(opts?: { withLog?: boolean })`로 받고, `exportMarkdown`(`exportMarkdown.ts:414`)이 범위 안 `dietDays`에 `log`가 있는지 보고 넘긴다. 먹은 것이 없는 내보내기는 한 글자도 바뀌지 않는다.

### 검증 (`v115.test.ts`, describe `MM3`)

- `log`가 없는 날의 `dietSectionMarkdown`이 `MM_EXPORT_BEFORE`와 같다(네 날 전부).
- 먹은 것만 있는 날: 줄이 `### 식단 — … · 기록 0/5슬롯 (단백질 추정 25g / …)`, `- 먹은 것: 13:20 …` 순이고 `- 슬롯:` 줄이 없다.
- 슬롯 기록 + 먹은 것 2건 + 메모: 순서가 머리 → 슬롯 → 슬롯 상세 → 먹은 것 2줄 → 먹은 것 합계 → 메모다.
- 먹은 것 1건이면 합계 줄이 없다.
- 영양 미입력 1건 + 값 있는 1건: 합계 줄 끝에 ` · 영양 미입력 1건`.
- 먹은 것 줄은 `21:00`에 먼저 넣고 `09:00`을 나중에 넣어도 `09:00`이 먼저다.
- `exportMarkdown` 전문: 범위에 먹은 것이 없으면 범례가 2줄, 있으면 3줄이다. 식단만 기록하고 먹은 것만 있는 날이 `## <날짜> — 운동 없음` 아래에 나온다.
- 화면의 줄과 내보내기의 줄이 같은 함수에서 온다: `DietDayEditor.tsx`와 `exportMarkdown.ts`가 둘 다 `logEntryText`를 부른다(스캔).

### 범위 제외

- JSON 백업 형식: `DietDay`와 `settings`가 통째로 실리므로 손댈 것이 없다.
- 주간·월간 먹은 것 통계: 분석은 내보내기로 한다.

### README 반영

- "내보내기" 절(`README.md:382` 아래 예시)은 운동 예시뿐이라 고치지 않는다. 없음.

---

## 데이터 이전

| 대상 | 어떻게 되나 |
|---|---|
| 기존 IndexedDB | 그대로. Dexie 버전 3 유지, `upgrade()` 없음. `userFoods` 행과 `log` 필드는 처음 쓸 때 생긴다 |
| 기존 Gist·JSON 백업 (v1.14 이전) | 그대로 복원된다. `userFoods`·`log`가 없을 뿐이다 |
| v1.15가 만든 백업 | `SCHEMA_VERSION` 3 그대로. `settings`에 `userFoods` 행이, `dietDays`에 `log`가 실린다 |
| 시드 | `diet-plans.json`·`seedRevision` 무변경 |

## 되돌리기

배포 뒤 문제가 생기면 v1.14 코드로 다시 배포할 수 있다.

- v1.14 코드는 `settings.userFoods` 행을 읽지 않고 지우지도 않는다(`settings`는 key-value이고 모르는 키를 훑는 코드가 없다).
- v1.14의 식단 연산은 전부 `{ ...day, … }`로 새 객체를 만든다(`dietOps.ts:17-31`, `:196-209`). `log`가 붙은 날을 옛 코드로 고쳐도 `log`가 남는다. MM2의 "기존 연산이 `log`를 지우지 않는다" 테스트가 이 사실을 고정한다.
- v1.14 앱은 v1.15 백업을 받아들인다(같은 `SCHEMA_VERSION`). 복원하면 `userFoods`·`log`가 실린 채 들어가고 화면에만 안 보인다.
- 되돌린 동안 달라지는 것: 먹은 것이 화면·합계·내보내기에서 빠진다. 다시 v1.15를 배포하면 돌아온다.

---

## 과거 판정 불변

바뀌지 않는 것: v1.15 이전 기록에는 `log`가 없으므로 `summarizeDietDay`·`dietMonthStats`·`dietSectionMarkdown` 결과(`MM_SUMMARY_BEFORE`·`MM_MONTH_BEFORE`·`MM_EXPORT_BEFORE`) · 슬롯 점수·준수 마크 · 달력 점 · 연속 저칼로리 경고 · 홈 칩 · 저장된 기록 전부 · 운동 쪽 전부.

달라지는 것:

| 자리 | 전 | 후 | 작업 |
|---|---|---|---|
| 먹은 것을 적은 날의 단백질·kcal 합계(화면·내보내기 머리 줄) | 체크한 플랜 품목만 | 먹은 것을 더한 값 | MM2 |
| 먹은 것만 적은 날의 달력 | 표시 없음 | 회색 점 | MM2 |
| 먹은 것만 적은 날의 내보내기 | 날짜가 나오지 않음 | 식단 절이 나온다 | MM3 |
| 먹은 것이 있는 내보내기의 범례 | 2줄 | 3줄 | MM3 |
| 사용자가 기록 탭에서 **과거 날짜**에 먹은 것을 직접 더한 경우 | — | 그 날의 합계·달력 점·내보내기가 바뀐다(슬롯 보정과 같다). 준수 마크는 안 바뀐다 | MM2 |
| 하루 삭제 확인 문구 | `(n슬롯)` | `(n슬롯 · 먹은 것 m건)` | MM2 |

---

## 구현 순서와 검증

**MM0 → MM1 → MM2 → MM3.** MM2의 시트가 MM1의 `foodCatalog`·등록 폼을 쓰고, MM1의 정렬이 MM2의 `log`를 읽는다. MM1 커밋 시점에는 `DietDay.log` **타입만** 먼저 넣고(`types.ts`) 정렬 테스트는 손으로 만든 `log`로 한다. 화면에 닿는 것은 MM2부터다 — MM1만 배포돼도 보이는 변화가 없어 안전하다.
커밋은 **골든 1 + 구현 3 + 기록·버전 1 = 5.** 작업끼리 한 커밋에 섞지 않는다.

관례:
- `npm run build` (`tsc` 직접 호출 금지) · 작업 중에는
  `npx vitest run src/lib/v115.test.ts src/lib/diet.test.ts src/lib/dietOps.test.ts src/lib/dietExport.test.ts src/lib/dietBackup.test.ts src/lib/dietAccess.test.ts src/lib/export.test.ts src/lib/inputProps.test.ts src/lib/uiConsistency.test.ts`만 · 마지막에 `npm test` 한 번 · `node scripts/quality-scan.mjs --ci`
- 커밋 개수는 실행 출력을 복사한다 (`git log --oneline main..HEAD`) · 커밋 메시지는 `git commit -F - <<'MSG'`
- 새 `input`은 `{...NO_AUTOFILL}`을 받는다(`inputProps.test.ts:33` 파일별 개수 일치).
- **기존 테스트 수정은 아래 목록뿐이다.** 다른 기존 테스트가 깨지면 설계와 어긋난 것이므로 고치지 말고 멈춰서 보고한다. 수정마다 주석 `MMn(PLAN-v1.15): <이유>`.

  | # | 파일·자리 (줄 번호는 참고 — grep으로 다시 맞춘다) | 수정 | 작업 |
  |---|---|---|---|
  | ① | `dietBackup.test.ts:120-121` | 쓰기 함수 정규식에 `mutateUserFoods`를 더하고 `toBe(3)` → `toBe(4)` | MM1 |

- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `mutateUserFoods`에서 `.then(scheduleBackup)` 삭제 → 수정 ①의 개수 단언 실패
  ② `foodCatalog`에서 중복 제거를 `name`만으로 → MM1 "같은 이름·다른 분량" 단언 실패(이 단언을 MM1에 포함한다: `바나나|1개`와 `바나나|2개`는 두 줄)
  ③ `summarizeDietDay`가 먹은 것 점수를 `scores`에 넣게 → MM2 `adherence` 불변 단언 실패
  ④ `logTotals`에서 `× count` 삭제 → MM2 210kcal 단언 실패
  ⑤ `dietMonthStats`를 `loggedSlots > 0`으로 복원 → MM2 회색 점 단언·스캔 실패
  ⑥ `applyRemoveLog`가 빈 배열을 남기게 → MM2 `'log' in day` 단언 실패
  ⑦ `applyNote`를 `{ date, planId, isTrainingDay, slots, note }`로 다시 짓게 → MM2 "기존 연산이 `log`를 지우지 않는다" 실패
  ⑧ `dietSectionMarkdown`의 `- 슬롯:` 줄을 항상 내게 → MM3 먹은 것만 있는 날 단언 실패
  ⑨ `dietMarkLegend`가 항상 3줄을 내게 → MM3 범례 2줄 단언 실패
  ⑩ `DietDayEditor.tsx`의 먹은 것 줄을 지역 템플릿 문자열로 → MM3 `logEntryText` 스캔 실패
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 테스트 안에 고정한 플랜(배포 `diet-plans.json`의 기본 플랜)·픽스처로 한정한다고 첫 줄에 적는다:
  ① `MM_SUMMARY_BEFORE`·`MM_MONTH_BEFORE`·`MM_EXPORT_BEFORE` 일치 (MM0 커밋 해시)
  ② 기존 테스트 수정 ①의 diff를 붙인다
  ③ `v113.test.ts`·`v114.test.ts`·`export.test.ts`·`dietExport.test.ts`가 수정 없이 통과한다
  ④ 바뀌는 것: "과거 판정 불변" 표의 자리
- 완료 후 `docs/DEV-RECORD-v1.15.md` (맨 위 "이 환경에서 확인된 제약"은 v1.14 목록을 이어받는다). "배포 영향" 절에 세 줄을 남기고 PR 본문 맨 위에도 넣는다:
  - 식단 탭과 기록 탭 과거 보정에 `먹은 것 (시간별)` 카드가 생긴다. 기존 기록은 바뀌지 않는다.
  - Dexie 스키마와 백업 형식 버전은 그대로다. v1.14로 되돌려 배포해도 데이터가 남는다.
  - 이슈 #31의 요청 3·4만 반영했다. 요청 2는 다음 PLAN, 요청 1·5는 사람의 승인을 기다린다.
- README: 각 작업의 "README 반영"을 그 작업 커밋에서 고친다.
- `package.json` **1.15.0**은 기록 커밋에서 올린다.
- 실기기 확인(구현자가 못 하면 DEV-RECORD에 "사람 확인 필요"로 남긴다): iOS 홈 화면 앱에서 `<input type="time">`이 휠로 열리고 고른 값이 `HH:MM`으로 들어온다. 이 레포에 `type="time"` 입력이 처음이다.

리뷰 단위: 작업별 — MM1·MM2가 저장 자리를 하나씩 더하고, MM2가 편집기·달력·삭제 문구에, MM3이 내보내기에 걸친다.

---

## 사람이 정할 것

### 1. 요청 1·5(계정·서버 DB) — README 결정을 뒤집을지

이슈의 승인 칸이 비어 있어 설계하지 않았다. 아래에서 고르고, A나 B면 이슈 #31의 "README 핵심 설계 결정을 뒤집는다"를 체크해 달라.

| 안 | 내용 | 얻는 것 | 치르는 것 |
|---|---|---|---|
| **C. 서버 없이 여러 사람 (추천: 먼저 이것)** | 지금처럼 각자 자기 폰에 설치하고 데이터는 각자 기기에 둔다. ①(이 PLAN)·②(루틴 편집)를 하고, Gist 대신 파일 백업을 기본 안내로 바꾼다 | 뒤집는 결정이 없다. 운영할 서버·남의 건강 데이터 보관 책임·비용이 없다. 오프라인이 그대로다 | 기기를 바꾸면 백업 파일로 옮겨야 한다. 계정 복구가 없다. Gist 백업은 GitHub 토큰이 필요해 개발자가 아닌 사람에게는 어렵다 |
| A. 계정 + 서버 DB, 기기 저장은 유지 | IndexedDB는 그대로 1차 저장소로 두고(저장 버튼 없음·오프라인 유지), 로그인한 사람의 데이터를 서버 DB와 동기화한다. Gist는 없앤다 | 기기 교체·여러 기기가 로그인만으로 된다. "실제 앱"의 모양 | 서버 운영(가입·비밀번호 재설정·탈퇴·데이터 삭제), 남의 식단·운동 기록을 보관하는 책임, 동기화 충돌 규칙, 서비스 장애·요금 정책 의존. 가장 큰 작업이다 |
| B. 계정 + 서버 DB만 | 기기 저장을 없애고 서버에서 읽고 쓴다 | 구조가 단순하다 | 헬스장에서 신호가 약하면 입력이 막힌다. "입력 즉시 반영"(`README.md:26`)과 오프라인 동작을 잃는다. **추천하지 않는다** |

- 추천: **지금은 C로 ①·②를 배포하고, 실제로 다른 사람이 쓰기 시작한 뒤 A를 다시 본다.** "여러 사람이 쓴다"를 막는 것은 지금 서버가 없어서가 아니라 루틴을 JSON으로 고쳐야 하고(요청 2) 백업에 GitHub 토큰이 필요해서다. ①·②는 A로 가더라도 버려지지 않는다.
- A를 고르면 그때 설계에서 정할 것(지금 확인하지 않았다): DB·인증 서비스(Supabase, Firebase 등)와 무료 구간 조건, iOS 홈 화면 앱에서 되는 로그인 방식, 지금 기기에 있는 기록을 처음 로그인한 계정에 올리는 절차, 동기화 충돌 규칙, public 레포에 둘 수 있는 키의 범위.

### 2. 플랜 체크와 먹은 것의 관계 (MM2)

| 안 | 내용 |
|---|---|
| **A. 둘 다 둔다 (추천, 설계 본문)** | 슬롯 카드는 그대로, 아래에 먹은 것 카드. 유동적인 날은 슬롯을 안 건드리고 먹은 것만 적는다. 저장 형태와 과거 판정이 그대로다 |
| B. 날마다 "플랜 없이 기록"을 고를 수 있게 | 그 날은 슬롯 카드를 숨기고 먹은 것만 보인다. 화면은 깔끔해지지만 `DietDay`에 상태가 하나 늘고 준수 판정·달력·내보내기가 그 상태를 전부 처리해야 한다 |
| C. 플랜 체크를 없애고 먹은 것만 | 1탭 일괄 체크(정상일 6~8탭)와 준수 판정을 잃고 과거 기록의 뜻이 바뀐다. 추천하지 않는다 |

### 3. 음식 목록 정렬 (MM1)

| 안 | 내용 |
|---|---|
| **A. 최근에 먹은 순 (추천, 설계 본문)** | 자주 먹는 것이 저절로 위로 온다. 저장하지 않고 기록에서 계산한다 |
| B. 가나다순 | 위치가 고정돼 예측하기 쉽지만 목록이 길어지면 매번 검색해야 한다 |
| C. 많이 먹은 순(횟수) | 한때 많이 먹고 끊은 음식이 계속 위에 남는다 |

### 4. 칼로리·단백질을 비워도 되는가 (MM1)

| 안 | 내용 |
|---|---|
| **A. 비워도 된다 (추천, 설계 본문)** | 모르는 음식(회식 등)을 이름만으로 바로 적는다. 합계에서는 빠지고 `영양 미입력`으로 표시된다 |
| B. 반드시 적는다 | 합계가 항상 완전하지만, 모르면 지어낸 숫자나 0을 넣게 된다 |

### 5. 화면 문구

원문 그대로다. 고칠 것이 있으면 알려 달라.

| 자리 | 문구 |
|---|---|
| 카드 라벨 | `먹은 것 (시간별)` |
| 빈 카드 안내 | `플랜에 없는 음식이나 다른 시간에 먹은 것을 적습니다.` |
| 버튼 | `＋ 먹은 것 추가` |
| 시트 제목 | `먹은 것 추가` |
| 시각이 빈 때 | `먹은 시각을 먼저 골라 주세요` |
| 추가 직후 | `방금 추가: <이름>` |
| 플랜 품목 표시 | `플랜` |
| 영양값 없음 | `영양 미입력` |
| 시트 안내 | `플랜에서 체크한 음식을 여기에도 적으면 합계에 두 번 들어갑니다.` |
| 등록 버튼·폼 | `새 음식 등록` · 이름 / 분량(선택) / 칼로리 kcal(선택) / 단백질 g(선택) · `등록하고 추가` |
| 폼 안내 | `칼로리·단백질을 모르면 비워 두세요. 비운 음식은 합계에 들어가지 않습니다.` |
| 편집 | `편집` · `저장` · `목록에서 삭제` |
| 검증 | `이름을 적어 주세요` · `칼로리와 단백질은 0 이상의 숫자로 적어 주세요` · `같은 이름·분량의 음식이 이미 목록에 있습니다` |
| 요약 카드 | `먹은 것 n건 포함` · ` · 영양 미입력 m건` |
| 삭제 확인 | `이 날 식단 기록(n슬롯 · 먹은 것 m건)이 삭제됩니다. 되돌릴 수 없습니다.` |
| 내보내기 | `- 먹은 것: 13:20 서브웨이 터키 15cm — 350kcal · 단 25g` · `- 먹은 것 합계: 560kcal · 단 27g · 영양 미입력 1건` |
| 내보내기 범례 | `먹은 것 = 플랜 밖에서 시간별로 적은 음식. 단백질 추정에는 들어가고 준수에는 들어가지 않는다. "영양 미입력"은 값을 모르는 음식이라 합계에서 빠진다.` |
