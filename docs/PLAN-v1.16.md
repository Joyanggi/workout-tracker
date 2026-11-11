# PLAN v1.16 — 운동 루틴을 앱에서 만들고 고친다 (NN)

> 작성: Fable 5.2 (설계자), 2026-11-11. 대상 코드: v1.15.0 (`main` `83ab87e`).
> 근거: 이슈 #31 (구조 변경). 이 PLAN은 이슈의 **요청 2만** 설계한다. 요청 3·4는 v1.15에서 끝났고, 요청 1·5는 다음 PLAN이다.
>
> **성격**: Dexie 스키마 버전(3)과 백업 `SCHEMA_VERSION`(3)은 올리지 않는다. 새 테이블이 없다.
> 더하는 것은 선택 필드 넷뿐이다(`RoutineTemplate.retiredDays`, `RoutineDay.retiredExercises`, `MuscleTarget.auto`, `Exercise.custom`).
> 루틴을 한 번도 고치지 않은 설치본은 판정·제안·내보내기가 하나도 바뀌지 않는다(NN0 골든).
> README "핵심 설계 결정"을 뒤집지 않는다. 루틴 JSON 교체 경로는 그대로 남는다.
>
> **이 PLAN으로 이슈 #31은 닫히지 않는다.** PR 본문에 `Closes #31`을 쓰지 않고 `Refs #31`로 적는다.

---

## 단계 지도 (이슈 #31 전체)

| 단계 | 요청 | 내용 | README "핵심 설계 결정" | 상태 |
|---|---|---|---|---|
| ① | 3·4 | 내 음식 목록 + 시간별 먹은 것 기록 | 뒤집지 않는다 | 끝남 (v1.15) |
| ② | 2 | 운동 루틴을 앱에서 만들고 고친다 | 뒤집지 않는다 | **이 PLAN (v1.16)** |
| ③ | 1·5 | 계정·서버 DB·계정별 데이터 분리 | **뒤집는다** | 다음 PLAN. 2026-11-11 이슈 댓글로 사람이 승인했다. 설계 안 함 |

- v1.15 "검토 반영 기록" 확정 표 1번(C. 서버 없이 간다)에 딸려 있던 "Gist 대신 파일 백업을 기본 안내로 바꾼다"는 **다루지 않는다.** 2026-11-11 승인으로 ③을 설계하기로 했으므로 C의 전제가 사라졌다.
- ②가 ③에서 버려지지 않게 지킨 것: 루틴은 한 행에 다 들어 있는 문서 하나이고(`routines` 행), 내 종목은 `exercises` 행에 `custom` 표시로 구분된다. 계정별로 나눌 때 그대로 옮길 수 있다.

---

## 작업 개요

| ID | 내용 | 저장 형태 | 화면 변화 |
|---|---|---|---|
| NN0 | 골든: v1.15 코드의 주간 집계·제안·볼륨 바·내보내기·기록 라인 목록을 고정한다 (테스트만) | 없음 | 없음 |
| NN1 | 뼈대: 저장 형태를 만드는 함수 하나, 뺀 Day·종목 보관, 시드가 활성 루틴을 되돌리지 않게, 쓰기 함수 | 선택 필드 `retiredDays`·`retiredExercises`·`auto` | 없음 |
| NN2 | 루틴 편집 화면: Day·종목·주간 목표 | NN1 것을 쓴다 | 설정 → 활성 루틴 `편집` |
| NN3 | 내 종목: 카탈로그에 없는 종목을 만들고 고친다 | `exercises` 행에 `custom: true` | 종목 고르기 시트 |
| NN4 | 루틴 목록: 새 루틴·전환·삭제 | 없음 (`routines` 행, `activeRoutineId`) | 설정 → 루틴 목록 카드 |

---

## 공통 진단 — 지금 루틴은 어떻게 저장되고 읽히나

설계 전체가 아래 사실에 기대므로 한 번만 적는다. 전부 코드로 확인했다.

| # | 사실 | 근거 |
|---|---|---|
| F1 | 루틴을 바꾸는 길은 설정의 JSON 가져오기뿐이다 | `src/components/RoutineIoPanel.tsx:37-81` |
| F2 | 과거 세션은 **지금 활성 루틴**으로 해석한다. `Session.routineId`는 저장만 하고 어디서도 읽지 않는다 | `src/lib/sessionFactory.ts:130`(쓰기 한 곳) · `src/lib/derive.ts:157-169`(`routineExerciseOfEntry`) |
| F3 | 기록 라인은 `종목id@Dayid`다. Day id가 같으면 루틴 id가 달라도 프리필·증량·PR이 이어진다 | `src/types.ts:208-210` |
| F4 | 루틴에 없는 종목의 과거 기록은 조용히 약해진다: 부위 집계에서 빠지고(`derive.ts:207-208`), 분석 탭 추이 목록에서 빠지고(`analysis.ts:94-95`), 내보내기 그룹이 `?`가 된다(`exportMarkdown.ts:161`) | 왼쪽 |
| F5 | **진행 중 세션**은 더 나쁘다. Day가 없으면 세션 화면이 통째로 안 열리고(`SessionScreen.tsx:169-172`), 종목이 없으면 카드가 사라진다(`:234`) | 왼쪽 |
| F6 | 시드는 번들 리비전이 바뀌면 번들 루틴을 다시 넣고 **활성 루틴을 번들로 되돌린다.** 번들과 같은 id의 저장본이 번들 카탈로그로 검증에 걸려도 번들로 덮는다 | `src/db/seed.ts:60-62`, `:78-81`, `:89-95` |
| F7 | `muscleSets`(Day 합계)·`plannedOrder`·`muscleTargets`는 손으로 맞춰 적는 값이고, 어긋나면 검증이 막는다 | `src/db/validateRoutine.ts:22-24`, `:30-34`, `:43-55` |
| F8 | `rules.lowerBodyDayId`는 실제 정규 Day를 가리켜야 검증을 통과한다. 복원도 모든 루틴을 이 검증에 넣는다 | `validateRoutine.ts:88-91` · `src/lib/backup.ts:240-245` |
| F9 | 종목 카탈로그(`Exercise`)에는 부위가 없다. 부위는 루틴의 종목 줄(`RoutineExercise.muscle`)에만 있다 | `src/types.ts:68-87`, `:123-172` |
| F10 | 카탈로그는 29종이고 부팅마다 번들 것을 `bulkPut`한다(지우지 않는다). 백업은 `exercises` 테이블을 통째로 싣는다 | `seed.ts:87` · `backup.ts:118-141` |
| F11 | 제안·대시보드는 루틴 구조만 읽고 Day·부위 이름을 하드코딩하지 않는다. 다만 `routine.days[0]`을 무조건 쓴다(Day가 0개면 터진다) | `src/lib/suggestNextDay.ts:107`, `:120`, `:130-133` |

**안 만들면 어떻게 되는가:** 루틴을 바꾸려면 JSON 파일을 손으로 고쳐야 한다(F1, F7 — Day 합계와 순서까지 맞춰야 통과한다). 앱 주인은 지금처럼 쓸 수 있지만, 다른 사람은 번들 루틴(특정 헬스장 머신 29종) 말고는 쓸 수 없다. 스쿼트·벤치프레스가 카탈로그에 없다(F10).
**안 만드는 안:** ③(계정)까지 미루고 그때 같이 만든다. 택하지 않았다 — ③의 쓸모가 ②에 달려 있고(각자 자기 루틴이 있어야 계정이 의미가 있다), ②는 서버 없이도 배포해서 쓸 수 있다.

---

## NN0. 골든 — v1.15 출력 고정

모든 작업보다 먼저, 테스트만 담아 커밋한다. 이후 고치지 않는다(DEV-RECORD에 해시).

`src/lib/v116.test.ts`에 픽스처 `NN_SESSIONS`를 **이 파일 안에** 만든다(다른 테스트 파일을 import하지 않는다). 루틴·카탈로그는 `BUNDLED_ROUTINE`·`BUNDLED_EXERCISES`. 모든 세션은 완료 상태(`endedAt` 있음)이고 2026-11-02(월) 주 안에 둔다.

| 날짜 | Day | 내용 | 겨냥 |
|---|---|---|---|
| 11-02 | `d1` | 전 종목 전 세트 체크. `incline-chest-press`만 `smith-incline-press@d1`로 대체(`substituteFor`) | 대체 되짚기 |
| 11-03 | `fallback-pull` | 전 세트 체크 (기록 라인은 `@d2`) | 하한 모드 되짚기 |
| 11-05 | `d3` | 전 세트 체크 + 얹은 종목 `lateral-raise@d1`(`extra: true`) 2세트 | 얹기 |
| 11-06 | `d4` | 앞 두 종목만 체크 | 부분 수행 |

골든 다섯 개 (기준일 `2026-11-07`, `now`는 고정 시각):

| 이름 | 값 |
|---|---|
| `NN_WEEK_BEFORE` | `weeklyVolume(NN_SESSIONS, 루틴, '2026-11-07')` 전체 |
| `NN_SUGGEST_BEFORE` | `suggestNextDay(...)`의 `{ dayId: day.id, rule, reason, scores }` |
| `NN_BARS_BEFORE` | `muscleBars(...)` 전체 |
| `NN_EXPORT_BEFORE` | 세션별 `sessionToMarkdown(...)` 줄 배열 |
| `NN_KEYS_BEFORE` | `allRecordKeys(NN_SESSIONS, 루틴)` 전체 |

이 커밋의 단언은 "지금 코드 출력 = 골든" 다섯뿐이다. 다섯 계산을 `nnOutputs(routine)` 한 함수로 묶어 둔다 — NN1이 같은 함수에 복사본 루틴을 넣어 다시 비교한다.

---

## NN1. 뼈대 — 저장 형태, 보관, 시드, 쓰기

화면이 없다. 이 작업만 배포돼도 보이는 변화가 없다.

### 진단

- 앱에서 고친 루틴을 번들과 같은 id로 저장하면 시드가 덮는다(F6). 번들 카탈로그에 없는 종목을 쓰면 **다음 부팅에 바로** 덮인다(`seed.ts:78-81`).
- 다른 id로 저장해도, 번들 리비전이 오르는 배포가 나가면 활성 루틴이 번들로 돌아간다(`seed.ts:92-95`).
- 종목이나 Day를 루틴에서 지우면 그 기록이 약해진다(F4). 편집 화면이 생기면 이 일이 자주 일어난다.
- `muscleSets`·`plannedOrder`를 사람이 맞추게 둘 수 없다(F7).

### 설계

**타입** (`src/types.ts`) — 전부 선택 필드다. 옛 코드는 모르는 필드를 읽지도 지우지도 않는다.

```ts
export interface MuscleTarget { target: number; weight: number; auto?: true }      // auto: target이 플랜 합계를 따라간다
export interface RoutineTemplate { /* 기존 */ retiredDays?: RoutineDay[] }          // 뺀 Day (기록이 있는 것만)
export interface RoutineDay { /* 기존 */ retiredExercises?: RoutineExercise[] }     // 뺀 종목 (기록이 있는 것만)
```

**왜 보관을 저장하나 (파생으로 안 되는 이유):** "이 종목이 그때 어느 부위·어느 그룹·몇 회 범위였나"는 세션에 없다(F2). 루틴에서 지우면 계산할 원천이 사라진다. 세션마다 계획을 복사해 두는 안은 "사람이 정할 것" 2번의 B다.

**새 파일 `src/lib/routineEdit.ts`** (순수 함수, React·Dexie 없음)

| 함수 | 반환 | 규칙 |
|---|---|---|
| `deriveMuscleSets(exercises)` | `Record<MuscleKey, number>` | 부위별 `sets` 합. `muscleSets`를 만드는 **유일한 자리** |
| `usedKeys(sessions)` | `{ dayIds: Set<string>; recordKeys: Set<string> }` | 모든 세션(진행 중 포함)에서: `dayIds` = `session.dayId` ∪ 모든 `recordKey`·`substituteFor`의 Day 부분. `recordKeys` = 모든 `recordKey` ∪ `substituteFor` |
| `resolveMuscleTargets(draft)` | `Record<MuscleKey, MuscleTarget>` | 아래 "주간 목표" 표. 편집 화면의 미리보기와 저장이 같이 쓴다 |
| `finalizeRoutine(draft, saved, used)` | `RoutineTemplate` | 아래 6단계. **저장되는 루틴을 만드는 유일한 자리** |
| `forkRoutine(routine, newId, now)` | `RoutineTemplate` | `{ ...routine, id: newId, name: routine.name + ' (수정)', createdAt: now, isActive: true }` |
| `blankRoutine(newId, now, rules)` | `RoutineTemplate` | `name: '내 루틴'`, `version: '1'`, `seedRevision: 0`, `muscleTargets: {}`, `days: []`, `fallbackDays: []`, `rules: { ...rules }`(번들 루틴의 규칙을 복사) |
| `nextDayId(taken)` | `string` | `d1`, `d2`… 중 `taken`에 없는 가장 작은 것 |
| `validateDraft(draft, catalog)` | `string[]` | NN2의 표 |
| `shouldForkOnEdit(routineId, bundledId)` | `boolean` | `routineId === bundledId` |

상수: `NEW_MUSCLE_WEIGHT = 0.5`, `NO_GUARD_GAP_DAYS = 100000`, `USER_ROUTINE_PREFIX = 'user-'`.

**`finalizeRoutine` 6단계** (`saved`는 고치기 전 저장본. 새 루틴이면 `undefined`)

| 단계 | 하는 일 |
|---|---|
| 1 | 모든 Day(`days`·`fallbackDays`)의 `plannedOrder`를 배열 순서대로 1부터 다시 매긴다 |
| 2 | **종목 보관.** `saved`의 Day에 있던 종목이 `draft`의 같은 Day(`id`)에 없으면: `used.recordKeys`에 `종목@Day`가 있으면 그 Day의 `retiredExercises`에 넣고, 없으면 버린다. `saved`에 이미 있던 `retiredExercises`는 이어받는다. `draft`에 다시 들어온 종목은 `retiredExercises`에서 뺀다 |
| 3 | **Day 보관.** `saved.days`·`saved.fallbackDays`에 있던 Day가 `draft`에 없으면: `used.dayIds`에 그 id가 있으면 `retiredDays`에 통째로(그 Day의 `retiredExercises` 포함) 넣고, 없으면 버린다. `saved.retiredDays`는 이어받는다 |
| 4 | **하한 모드 맞춤.** `fallbackDays`마다: `recordDayId`의 정규 Day가 없으면 3단계와 같은 규칙으로 뺀다. 있으면 그 정규 Day의 `exercises`에 없는 종목을 지우고, 남은 종목의 `repMin`·`repMax`·`muscle`·`group`을 정규 Day 것으로 덮는다. 종목이 0개가 되면 뺀다 |
| 5 | 모든 Day의 `muscleSets = deriveMuscleSets(exercises)`. `muscleTargets = resolveMuscleTargets(…)` |
| 6 | `rules.lowerBodyDayId`가 `days`에 없으면 `lowerBodyDayId = days[0].id`, `lowerBodyMaxGapDays = NO_GUARD_GAP_DAYS` (F8 — 옛 검증을 통과하면서 가드가 걸리지 않게) |

빈 배열은 저장하지 않는다: `retiredDays`·`retiredExercises`가 비면 키를 만들지 않는다. 그래서 **아무것도 안 고친 루틴은 `finalizeRoutine(r, r, used)`가 `r`과 같다**(번들 루틴으로 테스트).

**주간 목표** (`resolveMuscleTargets`). "쓰는 부위" = `days`·`fallbackDays`의 `exercises`에 나오는 부위. "플랜 합계" = 정규 Day(`days`)의 그 부위 `sets` 합.

| `draft.muscleTargets[부위]` | 결과 |
|---|---|
| 있고 `auto`가 없다 (번들·JSON 루틴의 값, 또는 사용자가 직접 정한 값) | 그대로 |
| 있고 `auto: true` | `target` = 플랜 합계. `weight` 그대로 |
| 없다 (편집으로 새로 생긴 부위) | `{ target: 플랜 합계, weight: NEW_MUSCLE_WEIGHT, auto: true }` |
| 쓰지 않는 부위의 항목 | 지운다 (남기면 홈에 채울 수 없는 막대가 남는다 — `dashboard.ts:123`) |

**조회** (`src/lib/derive.ts`) — 보관한 것은 **되짚을 때만** 보인다.

| 자리 | 바꿈 |
|---|---|
| `findDay` (`:127-129`) | `days` → `fallbackDays` → `retiredDays` 순으로 찾는다 |
| 새 `plannedInDay(day, exerciseId)` (export) | `day.exercises.find(…) ?? day.retiredExercises?.find(…)` |
| `findRoutineExercise` (`:137-143`, 비공개 유지) | `plannedInDay`를 쓴다 |
| `src/lib/history.ts:151-161` (`allRecordKeys`) | `group`은 `plannedInDay`로, `known`은 지금처럼 `day.exercises`에 있을 때만 `true` (보관 종목은 종목 히스토리에 "루틴에 없음"으로 뜨되 그룹은 남는다) |
| `src/screens/SessionDetailScreen.tsx:112` | `plannedInDay`를 쓴다 (보관 종목의 과거 세트를 계속 고칠 수 있다) |

`routine.days`·`fallbackDays`·`day.exercises`를 **훑는** 코드(제안 후보, Day 고르기, 세션 생성, 종목 얹기, 볼륨 바, 디로드 기준 종목)는 고치지 않는다. 그래서 보관한 것은 새 세션·제안·목표에 나오지 않는다.

**검증** (`src/db/validateRoutine.ts`) — 기존 7개 검사는 그대로. 더한다:

| # | 조건 | 문구 |
|---|---|---|
| 8 | `days`가 비었다 (F11) | `정규 Day가 없음` |
| 9 | `days`·`fallbackDays`·`retiredDays`의 id가 겹친다 | `Day id 중복 "<id>"` |
| 10 | `retiredExercises`의 종목이 같은 Day의 `exercises`에도 있다 | `<Day>: 보관 종목 "<id>"가 현재 종목과 겹침` |

보관 종목의 부위는 `muscleTargets`에 없어도 된다(집계만 되고 막대는 없다 — `derive.ts:207-208`과 `suggestNextDay.ts:165-166`이 이미 그렇게 다룬다).

**시드** (`src/db/seed.ts:89-99`)

```ts
/** 시드를 다시 넣을 때 활성 루틴을 번들로 돌릴 것인가 (NN1) */
export function shouldResetActiveRoutine(activeId: string | null, bundledId: string, activeExists: boolean): boolean {
  return activeId === null || activeId === bundledId || !activeExists
}
```

`needsSeed` 블록에서 `activeRoutineId`는 이 함수가 `true`일 때만 번들로 쓴다. `db.routines.put(BUNDLED_ROUTINE)`과 `seededRoutineRevision` 쓰기는 지금처럼 항상 한다. 번들 행은 지우지 않으므로 "기본 루틴으로 돌아가기"가 언제나 된다.

**쓰기** — 새 파일 `src/lib/routineStore.ts`. 모두 성공한 뒤 `requestSync()`를 부른다(`useDiet.ts:155-157`과 같은 이유).

| 함수 | 반환 | 동작 |
|---|---|---|
| `saveRoutineDraft(draft, savedId)` | `Promise<string[]>` (문제 문구, 성공이면 빈 배열) | `db.transaction('rw', [routines, settings, sessions, exercises])` 안에서: ① `endedAt` 없는 세션이 있으면 `['진행 중인 세션을 마치거나 버린 뒤에 저장할 수 있습니다']` ② `saved = savedId ? routines.get(savedId) : undefined` ③ `finalizeRoutine(draft, saved, usedKeys(전체 세션))` ④ `validateRoutine(결과, 전체 exercises)`에 문제가 있으면 그 문구를 돌려주고 쓰지 않는다 ⑤ `routines.put(결과)` + `activeRoutineId = 결과.id` |
| `activateRoutine(id)` | `Promise<string[]>` | 진행 중 세션이 있으면 위 ①의 문구(끝을 `바꿀 수 있습니다`로). 없으면 `activeRoutineId = id` |
| `deleteRoutine(id, bundledId)` | `Promise<string[]>` | 활성 루틴이거나 `id === bundledId`면 거절. 아니면 `routines.delete(id)` |

`RoutineIoPanel.tsx`는 고치지 않는다(JSON 경로는 지금 그대로).

### 검증 (`v116.test.ts`, describe `NN1`)

- `finalizeRoutine(BUNDLED_ROUTINE, BUNDLED_ROUTINE, 빈 used)`가 `BUNDLED_ROUTINE`과 같다(`toEqual`). `'retiredDays' in 결과`는 `false`, 어느 `muscleTargets` 값에도 `auto`가 없다.
- `forkRoutine(BUNDLED_ROUTINE, 'user-x', now)`를 넣은 `nnOutputs`가 골든 다섯과 같다 (복사본으로 바꿔도 판정이 같다).
- `d1`에서 `pec-deck-fly`를 뺀다, `used`에 `pec-deck-fly@d1` 있음 → `d1.retiredExercises`에 그 종목이 있고 `d1.exercises`에는 없다. `d1.muscleSets.상부가슴`은 4. `plannedOrder`는 1~6. `fallback-push`에서도 빠져 종목 2개, `muscleSets.상부가슴`은 3.
- 같은 편집 뒤 `weeklyVolume`·세션별 `sessionToMarkdown`이 `NN_WEEK_BEFORE`·`NN_EXPORT_BEFORE`와 같다 (과거 판정 불변).
- 같은 편집 뒤 `buildSession`으로 만든 `d1` 세션에 `pec-deck-fly@d1` entry가 없다. `allRecordKeys`의 그 라인은 `known: false`, `group: 'B'`.
- 같은 편집, `used`에 그 키가 없음 → `retiredExercises` 키가 없다 (버렸다).
- 뺀 종목을 다시 넣으면 `exercises`에 있고 `retiredExercises`에는 없다. `validateRoutine`이 빈 배열이다.
- `d4`를 지운다, `used.dayIds`에 `d4` 있음 → `retiredDays`에 `d4`. `suggestNextDay`의 `scores`에 `d4`가 없다. `summarize(11-06 세션, 결과).dayName`이 `Day 4 — 피지크 보완`이다. `d4`에서만 쓰던 부위가 없으므로 `muscleTargets` 키는 그대로다.
- `d3`을 지운다 → `rules.lowerBodyDayId === 'd1'`, `lowerBodyMaxGapDays === NO_GUARD_GAP_DAYS`, `muscleTargets`에 `하체`·`내전근`·`코어`가 없다. `validateRoutine`이 빈 배열이다. 하체 기록이 없는 13일치 세션으로 `suggestNextDay`를 불러도 `rule`이 `lowerBodyGuard`가 아니다.
- `d1`을 지운다 → `fallback-push`가 `fallbackDays`에 없다. `used.dayIds`에 `fallback-push`가 있으면 `retiredDays`에 있다.
- `d2`의 `lat-pulldown` 반복수를 6~10으로 바꾼다 → `fallback-pull`의 같은 종목도 6~10이다 (기존 검사 `validateRoutine.ts:79-84` 통과).
- `resolveMuscleTargets`: 새 부위 `둔근`을 3세트·2세트 두 Day에 넣으면 `{ target: 5, weight: 0.5, auto: true }`. 기존 `측면어깨`(11, `auto` 없음)는 세트를 늘려도 11. `auto: true`로 바꾸면 플랜 합계(13).
- `blankRoutine`에 Day 하나·종목 하나를 넣어 `finalizeRoutine(draft, undefined, 빈 used)` → `validateRoutine`이 빈 배열, `lowerBodyMaxGapDays === NO_GUARD_GAP_DAYS`.
- `nextDayId(new Set(['d1','d2','d4','fallback-push']))`는 `d3`. `d1`~`d4`가 다 있으면 `d5`.
- `usedKeys`: 대체 entry의 `substituteFor` 키와 얹은 종목의 Day(`d1`)가 들어간다. 진행 중 세션도 센다.
- `shouldResetActiveRoutine`: `(null, b, false)`·`(b, b, true)`·`('user-x', b, false)`는 `true`, `('user-x', b, true)`는 `false`.
- `validateRoutine`: `days: []` → 8번 문구. `retiredDays`에 `d1`과 같은 id → 9번. `retiredExercises`와 `exercises`에 같은 종목 → 10번.
- 스캔: `retiredDays`·`retiredExercises`가 나오는 소스는 `types.ts`·`routineEdit.ts`·`derive.ts`·`validateRoutine.ts`뿐이다(테스트 제외).
- 스캔: `derive.ts`가 `findRoutineExercise`를 export하지 않는다(지금 그대로).
- 스캔: `routineStore.ts`의 `export async function` 개수와 `requestSync()` 호출 개수가 같다(NN3이 둘을 더한 뒤에도). `db.routines.put`·`db.routines.delete`는 `routineStore.ts`·`seed.ts`·`RoutineIoPanel.tsx`에만 있다.
- 스캔: `seed.ts`에서 `activeRoutineId: BUNDLED_ROUTINE.id`가 `shouldResetActiveRoutine` 조건 안에만 있다.

### 범위 제외

- 세션별 계획 스냅샷, 세션을 만든 루틴(`routineId`)으로 과거를 해석하기: "사람이 정할 것" 2번. `routineExerciseOfEntry(routine, entry)`를 부르는 모든 계산의 인자가 바뀌는 큰 일이다. ③에서 데이터 모델을 다시 짤 때 본다.
- `RoutineIoPanel`의 가져오기에 `requestSync`·진행 중 세션 확인 붙이기: 지금 동작을 바꾸는 일이고 요청 2가 아니다.
- 보관한 것을 비우는 기능: 기록이 있는 라인만 보관하므로 늘어나는 양이 기록 라인 수를 넘지 않는다.

### README 반영

"핵심 설계 결정 → 운동학 · 루틴 로직" 끝에 세 항목을 더한다:

```
- **앱에서 고친 루틴은 번들과 다른 id로 저장한다**
  번들 루틴과 같은 id로 저장하면 시드가 덮습니다 — 번들 리비전이 오를 때, 그리고 번들 카탈로그에 없는
  종목을 넣은 다음 부팅에. 그래서 번들 루틴을 처음 고칠 때 복사본을 만들고, 시드는 사용자가 고른
  루틴이 있으면 활성 루틴을 건드리지 않습니다. Day id를 그대로 두므로 기록 라인(종목@Day)은 이어집니다.
  복사본은 이후 번들 루틴의 수정을 받지 않습니다.

- **루틴에서 뺀 Day·종목은 기록이 있으면 지우지 않고 보관한다**
  과거 세션은 지금 루틴으로 해석합니다. 종목을 지우면 그 기록이 부위 집계와 분석에서 조용히 빠집니다.
  보관한 것은 되짚을 때만 읽히고 제안·새 세션·주간 목표에는 나오지 않습니다.

- **Day 합계·계획 순서·주간 목표는 저장할 때 한 함수가 다시 만든다**
  `muscleSets`와 종목 합이 어긋나면 제안과 대시보드가 다른 숫자를 말합니다. 편집 화면은 이 값들을
  입력받지 않고 `finalizeRoutine`이 종목 목록에서 계산합니다. 저장된 루틴은 언제나 옛 검증을 통과합니다.
```

"데이터 모델" 문단(`README.md:263-267`) 끝에 한 줄: `루틴에서 뺀 Day·종목(retiredDays·retiredExercises)과 직접 만든 종목(exercises의 custom)도 테이블·스키마 버전을 늘리지 않는 선택 필드입니다.`

---

## NN2. 루틴 편집 화면

### 진단

- 설정의 "활성 루틴" 카드는 읽기 전용이다(`src/screens/SettingsScreen.tsx:155-213`).
- 설정 화면 안에서 편집 상태를 들면 탭을 옮길 때 사라진다(`src/App.tsx:165` — 탭이 바뀌면 화면이 언마운트된다).

### 설계

**진입:** "활성 루틴" 카드의 이름 줄에 `편집` 버튼. 누르면 `App`의 `View`에 더한 `'routineEdit'`로 간다(`App.tsx:30`). 세션 화면처럼 탭 바 없는 전체 화면이다. `SettingsScreen`은 `onEditRoutine(target: 'active' | 'blank')` props를 받는다(`'blank'`는 NN4).
진행 중 세션이 있으면 버튼을 `disabled`로 두고 아래에 `진행 중인 세션을 마치거나 버린 뒤에 고칠 수 있습니다`를 보인다(F5).

**새 화면 `src/screens/RoutineEditorScreen.tsx`.** 초안(`draft: RoutineTemplate`)은 화면의 `useState`에만 있다. `저장`을 눌러야 DB에 쓴다.

| 처음 초안 | `savedId` |
|---|---|
| 활성 루틴이 번들(`shouldForkOnEdit`) → `forkRoutine(routine, 'user-' + uuid 앞 8자, now)` | 번들 id |
| 활성 루틴이 사용자 루틴 → 그 루틴 그대로 | 그 id |
| 새 루틴(NN4) → `blankRoutine(…)` | 없음 |

**화면 구성** (위에서 아래로)

| 자리 | 내용 |
|---|---|
| 머리 | `‹ 취소` · 제목 `루틴 편집` · `저장`(바뀐 것이 없으면 `disabled`). 바뀐 것이 있을 때 `취소`는 `저장하지 않고 나가기`(btn-danger)·`계속 편집` 두 버튼으로 바뀐다 |
| 안내 (번들에서 시작한 때만) | `기본 루틴은 그대로 두고 복사본을 만들어 고칩니다. 지금까지의 기록은 이어집니다.` |
| 이름 카드 | 루틴 이름 입력 |
| Day 카드 (Day마다) | Day 이름 입력 · 설명(`subtitle`) 입력 · `▲` `▼`(Day 순서) · 종목 줄들 · `＋ 종목 추가` · `Day 삭제`(btn-danger, 한 번 더 눌러 확인) |
| 종목 줄 | `1. 인클라인 프레스` `A` · `상부가슴 · 4×6~10 · 150초` · `▲` `▼`. 누르면 종목 줄 시트 |
| | `＋ Day 추가` → `{ id: nextDayId(…), name: 'Day n', subtitle: '', isBuffer: false, muscleSets: {}, exercises: [] }` |
| 하한 모드 카드 (`fallbackDays`가 있을 때만) | Day마다 이름·종목 요약(읽기 전용) · `삭제`. 안내: `정규 Day에서 뺀 종목은 여기서도 빠지고, 반복수는 정규 Day를 따라갑니다.` |
| 주간 목표 카드 | 부위마다: 이름 · `플랜 합계 n세트` · 고르기 `플랜 합계` / `직접` · `직접`이면 세트 스테퍼(1~60). 표시 값은 `resolveMuscleTargets(draft)` |
| 문제 목록 | `저장`을 눌렀을 때 `validateDraft`나 `saveRoutineDraft`가 돌려준 문구(banner-danger) |

`nextDayId`의 `taken` = DB의 모든 루틴의 `days`·`fallbackDays`·`retiredDays` id ∪ 초안의 Day id ∪ `usedKeys(sessions).dayIds`. 다른 루틴이 쓰던 Day id를 다시 쓰면 그 기록 라인에 얹히기 때문이다(F3).

**종목 줄 시트** (`src/components/RoutineLineSheet.tsx`)

| 칸 | 입력 | 기본값(새로 넣을 때) |
|---|---|---|
| 부위 | 칩에서 고른다: 이 루틴의 부위 → `MUSCLE_SUGGESTIONS` 순. 끝에 `직접 입력` | `defaultLineFor`의 값, 없으면 비움 |
| 방식 (`group`) | `A` / `B` / `코어`. 안내 한 줄(아래 문구) | `defaultLineFor`의 값, 없으면 `A` |
| 세트 | 스테퍼 1~10 | 3 |
| 반복 최소 / 최대 | 스테퍼 1~50 | 8 / 12 |
| 휴식 | 스테퍼 0~600초, 15초 단위 | 90 |
| 컨디션 좋을 때만 (`optional`) | 체크 | 꺼짐 |
| 메모 (`note`) | 한 줄 입력 | 비움 |
| | `이 Day에서 빼기`(btn-danger) | |

`weightHint`는 입력받지 않고 있던 값을 그대로 둔다.

`defaultLineFor(exerciseId, draft, bundled, catalog)` (`routineEdit.ts`): ① 초안의 다른 Day에 같은 종목이 있으면 그 줄의 부위·방식·세트·반복·휴식 ② 번들 루틴에 있으면 그 줄 ③ 카탈로그에서 이 종목을 `substitutes`로 가진 원 종목이 ①·②에 있으면 그 부위·방식(세트·반복·휴식은 표의 기본값) ④ 없으면 표의 기본값. 여러 줄이 맞으면 `days` 배열 순서로 **처음 나오는 줄**을 쓴다(`incline-chest-press`는 `d1`의 A). 저장하지 않고 매번 계산한다(F9 — 카탈로그에 부위를 더하지 않는다).

`MUSCLE_SUGGESTIONS`(`routineEdit.ts`): `['가슴', '상부가슴', '등', '광배', '어깨', '측면어깨', '후면어깨', '이두', '삼두', '팔', '하체', '대퇴사두', '햄스트링', '둔근', '종아리', '내전근', '코어']`.

**종목 고르기 시트** (`src/components/ExercisePickerSheet.tsx`): 검색 입력(이름·짧은 이름에 포함) + 카탈로그 목록. 이 Day에 이미 있는 종목은 감춘다(같은 Day에 같은 종목은 기록 라인이 겹친다 — `validateRoutine.ts:36-41`). 고르면 `defaultLineFor`로 줄을 만들어 Day 끝에 넣고 종목 줄 시트를 연다. 종목을 새로 만드는 것은 NN3.

**`validateDraft`**

| 조건 | 문구 |
|---|---|
| 루틴 이름이 비었다 | `루틴 이름을 적어 주세요` |
| Day가 없다 | `Day를 하나 이상 만들어 주세요` |
| Day 이름이 비었다 | `Day 이름을 적어 주세요` |
| 종목 없는 Day | `<Day 이름>: 종목을 하나 이상 넣어 주세요` |
| 부위가 빈 줄 | `<Day 이름> · <종목>: 부위를 골라 주세요` |
| 반복 최소 > 최대 | `<Day 이름> · <종목>: 반복 최소가 최대보다 큽니다` |

통과하면 `saveRoutineDraft(draft, savedId)`. 빈 배열이 오면 설정 탭으로 돌아간다.

**순서 바꾸기는 `▲` `▼` 버튼이다.** 끌어서 옮기기는 터치 드래그 라이브러리가 필요하고 스크롤과 싸운다.

**설정의 "활성 루틴" 카드**는 `편집` 버튼만 더한다. 펼쳐 보는 목록은 그대로 둔다.

### 검증 (`v116.test.ts`, describe `NN2`)

- `validateDraft`: 표의 여섯 조건이 각각 문구 하나를 낸다. 번들 루틴 그대로는 빈 배열.
- `defaultLineFor('lateral-raise', 초안, 번들, 카탈로그)`: 초안의 `d1` 줄 값(측면어깨·B·4세트·12~20·90초).
- `defaultLineFor('smith-incline-press', …)`(대체 전용 종목): 부위 `상부가슴`, 방식 `A`, 세트 3·반복 8~12·휴식 90.
- `defaultLineFor('없는-종목', …)`: 부위 `''`, 방식 `A`.
- Day 순서를 바꿔 저장해도 `rules.lowerBodyDayId`는 `d3` 그대로다. `days[0]`이 바뀐다(첫 세션·복귀 제안이 그 Day가 된다 — `suggestNextDay.ts:107`, `:120`).
- 종목 순서를 바꿔 `finalizeRoutine`한 뒤, 골든 세션의 `sessionToMarkdown`이 `NN_EXPORT_BEFORE`와 같다(과거 세션은 `entry.plannedOrder`를 들고 있다).
- 스캔: `RoutineEditorScreen.tsx`·`RoutineLineSheet.tsx`·`ExercisePickerSheet.tsx`에 `db.`이 없다(쓰기는 `routineStore`만). `muscleSets`·`plannedOrder`를 대입하는 코드가 `routineEdit.ts` 밖의 `src/screens`·`src/components`에 없다.
- 스캔: `SettingsScreen.tsx`의 `편집` 버튼 근처에 `disabled`와 진행 중 세션 문구가 있다. `App.tsx`의 `View`에 `'routineEdit'`가 있다.
- 스캔: `Day 삭제`·`이 Day에서 빼기`·`저장하지 않고 나가기` 앞 260자 안에 `btn-danger`가 있다(`uiConsistency.test.ts:39-46`과 같은 방식).

### 범위 제외

- 하한 모드 Day를 만들거나 구성을 고치기: 정규 Day와 종목·반복수가 묶여 있어(`validateRoutine.ts:61-86`) 편집 규칙이 따로 필요하다. 자동 맞춤과 삭제만 한다. JSON 경로는 남아 있다.
- 부위 가중치, 디로드·복귀 규칙, 하체 가드, 완충일(`isBuffer`), `weightHint` 편집: 번들 루틴 문서에서 온 코칭 값이다. 있던 값을 지킨다. JSON 경로는 남아 있다.
- 끌어서 순서 바꾸기, 종목을 다른 Day로 옮기기(빼고 다시 넣으면 된다 — 단, 기록 라인은 Day별이라 새 라인이 된다).
- 초안 임시 저장: 편집 중 앱이 꺼지면 저장 전 변경은 사라진다.
- Phase 체계(0~3)와 B그룹 규칙: 그대로다.

### README 반영

- 기능 표 설정 줄(`README.md:40`): `루틴·식단 플랜 JSON 교체` → `루틴 편집(Day·종목·주간 목표), 루틴·식단 플랜 JSON 교체`
- Limitations(`README.md:467`): `루틴 자체는 JSON으로 교체할 수 있지만` → `루틴은 앱에서 고치거나 JSON으로 교체할 수 있지만`

---

## NN3. 내 종목

### 진단

- 카탈로그는 번들 29종뿐이고 더할 길이 없다(F10). 번들에 없는 종목은 루틴에 넣을 수 없다(`validateRoutine.ts:18-21`).
- `exercises` 테이블은 번들 밖의 행을 지우지 않고(`seed.ts:83-87`), 백업·복원이 통째로 싣는다(`backup.ts:118-141`, `:281-285`). 새 저장 자리가 필요 없다.

### 설계

**타입:** `Exercise`에 `custom?: true`를 더한다. 내 종목은 `{ id: 'custom-' + uuid 앞 8자, name, shortName, cueTip, compensationSigns: [], custom: true, allowZeroWeight?: true }`.

**순수 함수** (`routineEdit.ts`)

| 함수 | 규칙 |
|---|---|
| `validateExercise(input, catalog, editingId?)` | 이름이 비면 `종목 이름을 적어 주세요`. `trim`한 이름이 다른 종목의 `name`·`shortName`과 같으면 `같은 이름의 종목이 이미 있습니다` |
| `exerciseInUse(exerciseId, routines, used)` | 어느 루틴의 `days`·`fallbackDays`·`retiredDays`(각 `exercises`·`retiredExercises`)에 있거나 `used.recordKeys`의 종목 부분에 있으면 `true` |

**쓰기** (`routineStore.ts`)

| 함수 | 동작 |
|---|---|
| `saveCustomExercise(exercise)` | `custom === true`가 아니면 거절. `db.exercises.put` |
| `deleteCustomExercise(id)` | 트랜잭션 안에서 `exerciseInUse`면 거절. 번들 id면 거절. `db.exercises.delete` |

**화면** (종목 고르기 시트 안)

- 목록 아래 `＋ 새 종목 만들기` → 폼: 이름 / 짧은 이름(선택, 비우면 이름) / 자극 팁(선택) / 체크 `맨몸 운동 (무게 0kg으로 기록)` / `만들고 추가`. 누르면 종목을 **바로 저장**하고 그 Day에 넣는다.
- 내 종목 줄에는 `내 종목` 칩과 `편집` 버튼 → 같은 폼 + `저장` / `종목 삭제`(btn-danger). 쓰이는 종목이면 삭제 버튼 대신 `루틴이나 기록에서 쓰는 종목은 지울 수 없습니다`.
- 종목은 루틴 초안과 따로 저장된다. 루틴 편집을 취소해도 만든 종목은 남는다(쓰이지 않으므로 지울 수 있다).
- 이름을 고치면 과거 기록의 표시 이름도 바뀐다(id는 그대로).

**내 종목이 못 받는 것:** 대체 종목 목록(`substitutes` 없음 → 대체 불가로 뜬다), 보상작용 체크리스트(직접 입력만), 시작 무게 추정, 종목별 템포. 전부 지금 코드가 "없음"을 다루는 경로다(`ExerciseCard.tsx:315`, `CompensationSheet.tsx:45`).

### 검증 (`v116.test.ts`, describe `NN3`)

- `validateExercise`: 공백뿐인 이름 → 문구. 번들 종목의 `shortName`과 같은 이름 → 문구. 편집 중인 자기 자신과 같은 이름은 통과.
- `exerciseInUse`: 보관 종목(`retiredExercises`)에만 있어도 `true`. 세션의 `substituteFor`에만 있어도 `true`. 어디에도 없으면 `false`.
- 번들 카탈로그에 `custom-`으로 시작하는 id가 없다. 번들 종목에 `custom` 필드가 없다.
- 내 종목 하나를 넣은 루틴을 `finalizeRoutine` → `validateRoutine(결과, [...번들, 내 종목])`이 빈 배열. `validateRoutine(BUNDLED_ROUTINE, BUNDLED_EXERCISES)`는 여전히 빈 배열(시드의 번들 검증 `seed.ts:78`은 번들 행만 본다).
- 그 루틴과 내 종목을 담은 백업 객체를 `parseBackup`에 넣으면 통과한다.
- `zeroWeightHint`가 `allowZeroWeight`인 내 종목에 `false`를 준다(기존 함수 — `setRowState.ts:56-61`).
- 스캔: `db.exercises.put`·`db.exercises.delete`는 `routineStore.ts`에만 있다(`seed.ts`·`backup.ts`의 `bulkPut`·`clear`는 그대로).

### 범위 제외

- 내 종목의 대체 종목·보상작용 신호·템포·시작 무게 계수 편집: 폼이 길어지고, 없어도 기록은 된다.
- 번들 종목 고치기: 부팅마다 번들이 덮는다(`seed.ts:87`).
- 루틴 JSON 내보내기에 내 종목 싣기: 다른 기기에서 그 파일을 가져오면 `카탈로그에 없는 종목`으로 거절된다. 기기를 옮길 때는 전체 백업을 쓴다(내 종목이 실린다). DEV-RECORD "배포 영향"에 적는다.
- 종목 사진·영상, 운동 DB 검색: 서버나 큰 데이터가 필요하다.

### README 반영

- Limitations에 한 줄 더한다: `- 직접 만든 종목에는 대체 종목·보상작용 체크리스트·시작 무게 추정이 없습니다. 루틴 JSON 내보내기에는 직접 만든 종목이 실리지 않으므로 기기를 옮길 때는 전체 백업을 씁니다.`

---

## NN4. 루틴 목록 — 새 루틴·전환·삭제

### 진단

- `routines` 테이블은 여러 행을 담을 수 있지만 고르는 화면이 없다. 활성 루틴은 `activeRoutineId` 하나다(`src/db/index.ts:115-122`).
- NN2로 번들을 고치면 행이 둘이 된다(번들 + 복사본). 번들로 돌아갈 길이 필요하다.
- 처음부터 만드는 길이 없다(요청 원문: "직접 생성 및 수정").
- Day 고르기 시트는 하한 모드 Day가 없어도 `하한 모드 · 30분` 머리말을 그린다(`src/components/DayPickerSheet.tsx:76-82`).

### 설계

**새 카드 `src/components/RoutineListPanel.tsx`** — 설정 탭, "활성 루틴" 카드 바로 아래.

| 줄 | 내용 |
|---|---|
| 루틴마다 | 이름 · `Day n개` · 칩 `사용 중`(활성) / `기본`(번들 id) |
| 활성이 아닌 줄 | `이 루틴 쓰기` → 안내(아래 문구) + `바꾸기`·`취소` |
| 활성도 번들도 아닌 줄 | `삭제`(btn-danger) → `이 루틴을 삭제합니다. 운동 기록은 지워지지 않습니다.` + `삭제`·`취소` |
| 맨 아래 | `＋ 새 루틴 만들기` → `onEditRoutine('blank')` |

- 진행 중 세션이 있으면 `이 루틴 쓰기`·`＋ 새 루틴 만들기`를 `disabled`로 두고 NN2와 같은 문구를 보인다.
- 새 루틴은 편집 화면에서 `저장`해야 생기고, 저장하면 활성 루틴이 된다(`saveRoutineDraft`).
- 목록은 `useLiveQuery(() => db.routines.toArray())`로 읽는다(읽기만. 쓰기는 `routineStore`).

**전환하면 과거 기록이 어떻게 보이나 (F2):** 과거 세션은 새 활성 루틴으로 해석된다. 번들과 그 복사본처럼 Day id가 같으면 달라지는 것이 없다. Day id가 다른 루틴(새로 만든 루틴)으로 바꾸면 전 루틴의 기록은 지금 "JSON 교체"와 똑같이 보인다 — 제목이 Day 이름 대신 id, 그룹 `?`, 분석 추이 목록에서 빠짐, 이번 주 볼륨 바에서 빠짐. 기록은 그대로 있고, 원래 루틴으로 다시 바꾸면 원래대로 보인다(저장이 아니라 파생이기 때문이다).

**Day 고르기 시트:** `routine.fallbackDays.length === 0`이면 하한 모드 머리말·설명을 그리지 않는다.

### 검증 (`v116.test.ts`, describe `NN4`)

- `blankRoutine`의 `rules`가 번들 `rules`와 같은 값이고 다른 객체다(복사).
- 새 루틴(Day id `d5`, 번들 종목 사용)으로 `nnOutputs`의 `weeklyVolume`을 구하면 `sets`가 빈 객체다. 같은 세션을 다시 번들 루틴으로 구하면 `NN_WEEK_BEFORE`와 같다(전환은 기록을 바꾸지 않는다).
- `deleteRoutine`·`activateRoutine`은 Dexie가 필요해 단위 테스트하지 않는다. 대신 스캔: `routineStore.ts`의 `deleteRoutine` 본문에 `bundledId`와 `activeRoutineId` 비교가 둘 다 있다.
- 스캔: `RoutineListPanel.tsx`에 `db.routines.put`·`db.settings`·`setSettings`가 없다.
- 스캔: `DayPickerSheet.tsx`에서 `하한 모드 · 30분`이 `fallbackDays.length > 0` 조건 안에 있다.
- 스캔: `RoutineListPanel.tsx`의 `삭제` 진입 버튼 앞에 `btn-danger`가 있다.

### 범위 제외

- 사용자 루틴을 복사해 새 루틴 만들기, 루틴 이름만 바꾸기(편집 화면에서 한다), 루틴 공유.
- 전환한 뒤에도 전 루틴의 기록을 전 루틴 정의로 해석하기: NN1 범위 제외 첫 줄과 같은 일이다.
- 온보딩에서 루틴 고르기: 온보딩(`src/screens/Onboarding.tsx`)은 그대로다. 새 사용자는 번들 루틴으로 시작해 설정에서 바꾼다.

### README 반영

- 기능 표 설정 줄에 NN2에서 넣은 글자 뒤로: `, 루틴 목록(새 루틴·전환·삭제)`
- Limitations(`README.md:467`)에 문장을 잇는다: `Day 구성이 다른 루틴으로 바꾸면 전 루틴의 기록은 Day 이름·그룹 없이 보입니다(기록은 남고, 되돌리면 원래대로 보입니다).`

---

## 데이터 이전

| 대상 | 어떻게 되나 |
|---|---|
| 기존 IndexedDB | 그대로. Dexie 버전 3 유지, `upgrade()` 없음. 번들 루틴 행·`activeRoutineId`는 사용자가 편집을 저장하기 전까지 바뀌지 않는다 |
| 처음 편집을 저장할 때 | `routines`에 `user-…` 행이 하나 생기고 `activeRoutineId`가 그 id가 된다. 번들 행은 남는다. 세션·세팅 메모(`exerciseNotes`, 키가 `종목@Day`)는 손대지 않는다 — Day id가 같아 그대로 이어진다 |
| 기존 Gist·JSON 백업 (v1.15 이전) | 그대로 복원된다 |
| v1.16이 만든 백업 | `SCHEMA_VERSION` 3 그대로. `routines`에 사용자 루틴(선택 필드 포함)이, `exercises`에 내 종목이 실린다 |
| 시드 | `routine-v2.4.json`·`exercises.json`·`seedRevision` 무변경. `seedRevision.test.ts`의 해시가 그대로다 |
| JSON으로 가져온 루틴(번들과 다른 id)을 쓰던 설치본 | 편집하면 복사 없이 그 행을 고친다. 앞으로 번들 리비전이 올라도 활성 루틴이 유지된다(전에는 번들로 돌아갔다 — F6) |

## 되돌리기

배포 뒤 문제가 생기면 v1.15 코드로 다시 배포할 수 있다.

- 저장된 사용자 루틴은 v1.15의 `validateRoutine`을 통과한다. 새 검사 8~10은 더한 것이고, 기존 7개는 `finalizeRoutine`이 맞춘다(Day 합계·순서·부위 목표·하한 모드 반복수·`lowerBodyDayId`). 그래서 v1.15 앱이 v1.16 백업을 복원할 수 있다(`backup.ts:240-245`).
- v1.15의 시드는 번들 리비전이 같으면 아무것도 쓰지 않는다(`seed.ts:80-81`). 활성 루틴이 사용자 루틴인 채로 남는다. 내 종목 행도 남는다(`bulkPut`은 지우지 않는다).
- v1.15 코드는 `retiredDays`·`retiredExercises`·`auto`·`custom`을 읽지 않고 지우지도 않는다(루틴 행을 다시 쓰는 곳이 시드의 번들 행과 JSON 가져오기뿐이다).
- 되돌린 동안 달라지는 것: 편집·목록 화면이 없다. 뺀 종목·Day의 과거 기록이 F4처럼 약하게 보인다. 다시 v1.16을 배포하면 돌아온다.
- 되돌린 동안 조심할 것 하나: v1.15에서 **번들 리비전이 다른 빌드**를 배포하면 활성 루틴이 번들로 돌아간다(사용자 루틴 행은 남으므로 v1.16에서 다시 고를 수 있다).

---

## 과거 판정 불변

바뀌지 않는 것: 루틴을 고치지 않은 설치본의 전부(`NN_WEEK_BEFORE`·`NN_SUGGEST_BEFORE`·`NN_BARS_BEFORE`·`NN_EXPORT_BEFORE`·`NN_KEYS_BEFORE`) · 번들 루틴을 복사본으로 바꾼 직후의 전부(NN1 두 번째 검증) · 저장된 세션·식단 기록 전부.

달라지는 것 — 전부 **사용자가 루틴을 고치거나 바꿨을 때**다:

| 사용자가 한 일 | 과거 기록 | 작업 |
|---|---|---|
| 종목을 Day에서 뺐다 | 판정 그대로(보관). 종목 히스토리에 "루틴에 없음" 표시가 붙는다 | NN1 |
| Day를 지웠다 | 제목·판정 그대로(보관) | NN1 |
| 종목의 반복수 범위를 바꿨다 | 그 라인의 **과거 세션 내보내기 `다음:` 줄**(증량 판정)이 새 범위로 다시 계산된다. 다음 세션 프리필·증량 칩도 새 범위를 쓴다. JSON 교체와 같다 | NN2 |
| 종목의 방식(A/B/코어)을 바꿨다 | 분석 탭 목록, Phase 조건 집계, 내보내기 `(D1/A)` 표기가 새 값을 따른다 | NN2 |
| 종목의 부위를 바꿨다 | 이번 주 볼륨 바·제안 점수가 새 부위로 다시 계산된다 | NN2 |
| 세트 수를 바꿨다 | 복귀·디로드 세션의 계획 세트는 `plannedSets`에 남아 있어 그대로다(`types.ts` JJ1). JJ 이전 기록은 새 값으로 되짚는다 | NN2 |
| 종목 순서를 바꿨다 | 그대로(`entry.plannedOrder`가 세션에 있다) | NN2 |
| Day 이름을 바꿨다 | 과거 세션 제목도 새 이름으로 보인다 | NN2 |
| Day 순서를 바꿨다 | 과거는 그대로. 첫 세션·14일 공백 복귀 제안이 새 첫 Day가 된다 | NN2 |
| 하체 가드가 가리키던 Day를 지웠다 | 과거는 그대로. 앞으로 하체 가드 제안이 나오지 않는다 | NN1 |
| 내 종목 이름을 고쳤다 | 과거 기록의 표시 이름이 바뀐다 | NN3 |
| Day id가 다른 루틴으로 바꿨다 | NN4 "전환하면 과거 기록이 어떻게 보이나"대로. 되돌리면 원래대로 | NN4 |

사용자와 무관하게 달라지는 것 하나: 번들과 다른 id의 루틴을 쓰는 설치본은 번들 리비전이 올라도 활성 루틴이 유지된다(NN1 시드).

---

## 구현 순서와 검증

**NN0 → NN1 → NN2 → NN3 → NN4.** NN2가 NN1의 함수를, NN3이 NN2의 시트를, NN4가 NN2의 화면과 `blankRoutine`을 쓴다. 단계마다 배포할 수 있다: NN1은 화면이 없고, NN2만으로 번들 루틴을 고칠 수 있고, NN3 없이는 번들 29종 안에서만 고친다.
커밋은 **골든 1 + 구현 4 + 기록·버전 1 = 6.** 작업끼리 한 커밋에 섞지 않는다.

관례:
- `npm run build` (`tsc` 직접 호출 금지) · 작업 중에는
  `npx vitest run src/lib/v116.test.ts src/lib/suggestNextDay.test.ts src/lib/dashboard.test.ts src/lib/export.test.ts src/lib/history.test.ts src/lib/seedRepair.test.ts src/lib/seedRevision.test.ts src/lib/inputProps.test.ts src/lib/uiConsistency.test.ts`만 · 마지막에 `npm test` 한 번 · `node scripts/quality-scan.mjs --ci`
- 커밋 개수는 실행 출력을 복사한다 (`git log --oneline main..HEAD`) · 커밋 메시지는 `git commit -F - <<'MSG'`
- 새 `input`·`textarea`는 `{...NO_AUTOFILL}`을 받는다(`inputProps.test.ts:33`). `name` 속성을 쓰지 않는다.
- **기존 테스트는 수정하지 않는다.** 깨지면 설계와 어긋난 것이므로 고치지 말고 멈춰서 보고한다.
- **새 스캔 결함 복원 확인:** `cp` 백업 뒤 결함을 되살려 실패를 보고 되돌린다(`cmp`로 같음 확인). 최소:
  ① `findDay`에서 `retiredDays` 조회 삭제 → NN1 `dayName` 단언 실패
  ② `plannedInDay`에서 `retiredExercises` 조회 삭제 → NN1 `NN_WEEK_BEFORE`·`NN_EXPORT_BEFORE` 단언 실패
  ③ `finalizeRoutine` 2단계가 `used`를 보지 않고 항상 보관 → NN1 "버렸다" 단언 실패
  ④ `finalizeRoutine`이 빈 `retiredDays: []`를 남기게 → NN1 항등 단언 실패
  ⑤ 4단계(하한 모드 맞춤) 삭제 → NN1 `validateRoutine` 빈 배열 단언 실패
  ⑥ 6단계 삭제 → NN1 `d3` 삭제 단언 실패
  ⑦ `resolveMuscleTargets`가 `auto` 없는 항목도 플랜 합계로 덮게 → NN1 `측면어깨` 11 단언 실패
  ⑧ `resolveMuscleTargets`가 안 쓰는 부위를 남기게 → NN1 `하체` 없음 단언 실패
  ⑨ `seed.ts`에서 `activeRoutineId`를 조건 없이 쓰게 → NN1 스캔 실패
  ⑩ `routineStore.ts`의 한 함수에서 `requestSync()` 삭제 → NN1 스캔 실패
  ⑪ `RoutineEditorScreen.tsx`에서 `db.routines.put`을 직접 부르게 → NN2 스캔 실패
  ⑫ `defaultLineFor`의 ③(대체 원 종목) 삭제 → NN2 `smith-incline-press` 단언 실패
  ⑬ `exerciseInUse`가 `retiredExercises`를 보지 않게 → NN3 단언 실패
  ⑭ `DayPickerSheet.tsx`의 하한 모드 머리말을 조건 밖으로 → NN4 스캔 실패
- **과거 판정 불변 확인 절** (DEV-RECORD). 범위는 테스트 안에 고정한 루틴(배포 `routine-v2.4.json`)·픽스처로 한정한다고 첫 줄에 적는다:
  ① 골든 다섯 개 일치 (NN0 커밋 해시)
  ② 복사본 루틴으로 골든 다섯 개 일치
  ③ `suggestNextDay.test.ts`·`dashboard.test.ts`·`export.test.ts`·`history.test.ts`·`seedRepair.test.ts`·`seedRevision.test.ts`·`v113.test.ts`·`v114.test.ts`·`v115.test.ts`가 수정 없이 통과한다
  ④ 바뀌는 것: "과거 판정 불변" 표의 자리
- 완료 후 `docs/DEV-RECORD-v1.16.md` (맨 위 "이 환경에서 확인된 제약"은 v1.15 목록을 이어받는다). "배포 영향" 절에 네 줄을 남기고 PR 본문 맨 위에도 넣는다:
  - 설정 탭에 루틴 `편집` 버튼과 `루틴 목록` 카드가 생긴다. 편집을 저장하기 전에는 아무것도 바뀌지 않는다.
  - 기본 루틴을 고치면 복사본이 생기고 그 뒤로 복사본은 기본 루틴의 업데이트를 받지 않는다.
  - Dexie 스키마와 백업 형식 버전은 그대로다. v1.15로 되돌려 배포해도 데이터가 남는다.
  - 이슈 #31의 요청 2만 반영했다. 요청 1·5는 다음 PLAN이다. 루틴 JSON 내보내기에는 직접 만든 종목이 실리지 않는다.
- README: 각 작업의 "README 반영"을 그 작업 커밋에서 고친다.
- `package.json` **1.16.0**은 기록 커밋에서 올린다.
- 실기기 확인(구현자가 못 하면 DEV-RECORD에 "사람 확인 필요"로 남긴다): iOS 홈 화면 앱에서 편집 화면이 safe-area를 지키고, 시트 안 입력에 키보드가 올라와도 `저장` 버튼에 닿을 수 있다. 종목 7개인 Day에서 `▲` `▼`가 손가락으로 눌린다(375px).

리뷰 단위: 작업별 — NN1이 저장 형태와 시드·조회를 바꾸고, NN2~NN4가 각각 새 화면이며 설정·App·Day 고르기 시트에 걸친다.

---

## 사람이 정할 것

본문은 추천안으로 쓰여 있다. 다른 안을 고르면 표의 "바뀌는 곳"을 고친다.

| # | 항목 | 추천 | 다른 안 | 바뀌는 곳 |
|---|---|---|---|---|
| 1 | 기본(번들) 루틴을 고칠 때 | **A. 복사본을 만들어 고친다.** 기본 루틴은 남아 언제든 돌아갈 수 있다. 치르는 것: 복사본은 이후 기본 루틴의 수정(리비전)을 받지 않는다 | B. 기본 루틴 행을 그대로 고친다 — 번들 리비전이 오르는 배포마다, 그리고 직접 만든 종목을 넣은 다음 부팅마다 시드가 덮는다(F6). 시드 규칙을 더 크게 바꿔야 한다 | NN1 |
| 2 | 루틴을 고쳤을 때 과거 기록을 어디까지 지키나 | **A. 뺀 Day·종목만 보관한다.** 반복수·방식·부위를 바꾸면 과거 세션도 새 값으로 읽힌다("과거 판정 불변" 표). 지금 JSON 교체와 같은 규칙이고 저장이 가장 적다 | B. 세션을 만들 때 종목별 계획(부위·방식·반복수)을 세션에 복사해 둔다 — 과거가 완전히 고정되지만 저장 필드가 늘고, v1.16 이전 세션에는 복사본이 없어 A의 보관도 여전히 필요하다 · C. 아무것도 안 지킨다(종목을 빼면 그 기록이 분석에서 빠진다) | NN1 |
| 3 | 주간 목표 세트 | **A. 부위마다 `플랜 합계`(자동) / `직접`을 고른다.** 기본 루틴에서 온 값은 `직접`으로 남고(측면어깨 11 등), 새로 생긴 부위는 `플랜 합계`다 | B. 언제나 플랜 합계 — 기본 루틴을 고치는 순간 목표가 바뀐다(측면어깨 11→13, 후면어깨 7→9, 팔 6→10) · C. 편집 화면에 목표를 두지 않는다 — 종목을 크게 바꿔도 옛 목표가 남는다 | NN1·NN2 |
| 4 | 진행 중 세션이 있을 때 | **A. 편집·전환을 막는다.** 세션 중에는 대체·얹기·세트 추가로 조절한다 | B. 허용한다 — 보관 덕에 화면은 안 깨지지만, 세션의 세트 수·프리필이 고친 루틴과 어긋난 채 남는다 | NN1·NN2·NN4 |
| 5 | 새 부위의 우선순위(가중치) | **0.5 고정, 편집 화면에 두지 않는다.** 가중치는 Day 제안 점수에만 쓰인다 | 높음/보통/낮음 3단 고르기 — 기본 루틴의 8단계 값(1.0~0.3)과 맞지 않는다 | NN1·NN2 |
| 6 | 하한 모드 Day | **자동 맞춤과 삭제만.** 새로 만들지 못한다 | 편집 가능하게 — 정규 Day와 묶인 규칙의 편집 화면이 하나 더 필요하다 | NN2 |
| 7 | 화면 문구·목록 | 아래 표 | — | NN2~NN4 |

문구 원문:

| 자리 | 문구 |
|---|---|
| 설정 버튼 | `편집` |
| 진행 중 세션 | `진행 중인 세션을 마치거나 버린 뒤에 고칠 수 있습니다` · (저장) `…저장할 수 있습니다` · (전환) `…바꿀 수 있습니다` |
| 편집 화면 머리 | `‹ 취소` · `루틴 편집` · `저장` · `저장하지 않고 나가기` · `계속 편집` |
| 복사 안내 | `기본 루틴은 그대로 두고 복사본을 만들어 고칩니다. 지금까지의 기록은 이어집니다.` |
| 복사본 이름 | `<기본 루틴 이름> (수정)` |
| 새 루틴 이름 | `내 루틴` |
| Day | `＋ Day 추가` · 새 Day 이름 `Day n` · `＋ 종목 추가` · `Day 삭제` |
| 종목 줄 시트 | `부위` · `방식` · `세트` · `반복 최소` · `반복 최대` · `휴식(초)` · `컨디션 좋을 때만` · `메모` · `이 Day에서 빼기` |
| 방식 안내 | `A: 무게를 올려 가는 종목 (모든 세트가 반복 최대에 닿으면 증량을 제안합니다) · B: 자극 위주 종목 (감각 점수를 적습니다) · 코어` |
| 부위 제안 | `가슴 · 상부가슴 · 등 · 광배 · 어깨 · 측면어깨 · 후면어깨 · 이두 · 삼두 · 팔 · 하체 · 대퇴사두 · 햄스트링 · 둔근 · 종아리 · 내전근 · 코어` · `직접 입력` |
| 하한 모드 안내 | `정규 Day에서 뺀 종목은 여기서도 빠지고, 반복수는 정규 Day를 따라갑니다.` |
| 주간 목표 | `주간 목표` · `플랜 합계 n세트` · `플랜 합계` / `직접` |
| 편집 검증 | `루틴 이름을 적어 주세요` · `Day를 하나 이상 만들어 주세요` · `Day 이름을 적어 주세요` · `<Day 이름>: 종목을 하나 이상 넣어 주세요` · `<Day 이름> · <종목>: 부위를 골라 주세요` · `<Day 이름> · <종목>: 반복 최소가 최대보다 큽니다` |
| 종목 고르기 | `종목 고르기` · 검색 안내 `종목 이름` · `내 종목` · `＋ 새 종목 만들기` |
| 종목 폼 | 이름 / 짧은 이름(선택) / 자극 팁(선택) / `맨몸 운동 (무게 0kg으로 기록)` · `만들고 추가` · `저장` · `종목 삭제` |
| 종목 검증 | `종목 이름을 적어 주세요` · `같은 이름의 종목이 이미 있습니다` · `루틴이나 기록에서 쓰는 종목은 지울 수 없습니다` |
| 루틴 목록 | `루틴 목록` · `사용 중` · `기본` · `이 루틴 쓰기` · `바꾸기` · `삭제` · `＋ 새 루틴 만들기` |
| 전환 안내 | `루틴을 바꾸면 홈의 제안과 주간 목표가 이 루틴 기준이 됩니다. 지난 기록은 그대로 남지만, 이 루틴에 없는 Day·종목은 이름과 그룹 없이 보일 수 있습니다. 다시 바꾸면 원래대로 보입니다.` |
| 삭제 확인 | `이 루틴을 삭제합니다. 운동 기록은 지워지지 않습니다.` |
