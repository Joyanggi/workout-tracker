# v1 코드 리뷰 — 수정 목록 (2026-07-31)

> **처리 완료.** 이 문서의 P0 3건·P1 4건·P2 15건은 모두 반영됐다
> (커밋 `fix: 코드 리뷰 반영`). 아래 두 항목만 근거와 함께 다르게 처리했다:
> - **P2-10** 세트 행 key에 로컬 id 부여 → `SetRecord`가 persist되는 타입이라 백업 스키마
>   변경을 동반한다. 문제 조건("중간 제거 UI")이 아직 없고 두 호출부 모두 끝에서만
>   제거하므로, 스키마 변경 대신 불변식을 코드 주석으로 명시했다
> - **P2-1** 드래그 재정렬 → 문서가 준 두 선택지 중 "DESIGN.md에 v1.1 연기 명시"를 택했다

> **✅ 재검증 완료 (2026-07-31, 커밋 07aa6b2):** P0 3건·P1 4건·P2 15건 전부 수정 확인.
> 테스트 175/175 통과(수정 검증 테스트 6개 추가), tsc·빌드 클린. 아래 목록은 이력용으로 보존.
> 잔여 비차단 1건: 진행 중 세션을 "마감하고 새로 시작"할 때 새 세션 프리필이 방금 마감한
> 세션을 반영하지 못함 (HomeScreen.startPending의 stale sessions 클로저 — 같은 순간에
> 세션 두 개를 연달아 만드는 드문 경로라 실사용 영향 없음. 다음 수정 때 처리 권장).

리뷰 범위: 전체 (코어 로직 정독 + UI 레이어 + 인프라/PWA/백업). 기준: DESIGN.md + 피지크_루틴_v2.4.md.

**총평: 설계 대비 충실하고 품질이 높다.** 테스트 169개 통과, tsc·빌드 클린, 시드는 v2.4 문서와 1:1 일치 검산 완료. 구현 중 설계 문서의 결함 3개(첫 노출 보너스, 디로드 후 카운터 리셋, 조기 디로드 지표)를 스스로 발견해 근거와 함께 고쳤고, 전부 검산으로 확인됨 — **DESIGN.md에 역반영 완료했으므로 이 세 가지는 수정 대상이 아니다.**

아래는 우선순위순 수정 목록. P0는 기록 데이터의 정합성을 깨는 것들이라 실사용 시작 전에 고쳐야 한다.

---

## P0 — 실사용 전 수정 (데이터 정합성)

### P0-1. 디로드·복귀 세션에 증량 무게가 프리필됨
- `src/lib/prefill.ts:118` (`defaultSetFor`), `src/lib/sessionFactory.ts:54-61`, 칩 노출 `src/components/ExerciseCard.tsx:139-143`
- `buildSession`이 mode와 무관하게 `progression.to`를 기본 무게로 쓴다. 디로드는 "세트 −50%, **무게 유지**"가 원칙인데 +2.5kg가 기본값이 되고, 복귀 모드에서는 +2.5kg에 −5%가 곱해져 명세("이전 무게 −5%")와 다른 값이 나온다.
- **수정**: `buildPrefill`/`defaultSetFor`에 session mode를 전달, `mode !== 'normal'`이면 progression 무시 + 칩 숨김.

### P0-2. 증량 판정에 계획 세트 수 조건이 없음
- `src/lib/progression.ts:39`, `src/lib/prefill.ts:105`
- `doneSets.every(reps >= repMax)`만 검사해서 4세트 계획 중 2세트만 하고 둘 다 상단이면 증량이 제안된다. 루틴 문서의 더블 프로그레션 기준은 전 세트(12/12/12/12)다.
- **수정**: 두 곳 모두 `sets.length >= routineExercise.sets` 조건 추가 (`routineExercise.sets`는 정규 Day 기준 — 디로드로 줄어든 세트 수가 아니라 루틴 정의값). 테스트 추가: 부분 수행 시 증량 미제안.

### P0-3. 진행 중 세션이 있는 상태에서 새 세션 시작 시 이전 세션이 고아로 남음
- `src/screens/HomeScreen.tsx:70-89`, `src/store/session.ts:76-79`, `src/db/index.ts:80-85`
- [시작]이 기존 open 세션을 정리하지 않아 `endedAt` 없는 세션이 DB에 남고, 다음 앱 실행에서 며칠 전 세션이 "진행 중"으로 부활한다. 체크된 세트가 있으면 FinishSheet의 "버리기"가 `!anyDone` 조건이라 버릴 수도 없다.
- **수정**: `begin()`에서 기존 open 세션 처리(확인 다이얼로그로 이어하기/버리기/새로 시작 선택). FinishSheet "버리기"를 체크 세트가 있어도 확인 후 가능하게.

## P1 — 빠른 시일 내 수정 (실사용 품질)

### P1-1. 복귀 프로토콜이 제안된 Day로 시작할 때만 적용됨
- `src/screens/HomeScreen.tsx:71-76` — `isReturn`에 `day.id === suggestion.day.id` 조건.
- 14일+ 공백 상태에서 바텀시트로 다른 Day를 고르면 감량 없는 normal 세션이 만들어진다. 공백은 Day와 무관한 상태다.
- **수정**: 복귀 조건 충족 시 어떤 Day를 골라도 return 모드 적용.

### P1-2. 증량 배지가 복귀·디로드 배너와 동시 노출
- `src/screens/HomeScreen.tsx:96-97, 188-200`
- 배너 우선순위(복귀>디로드>증량)가 증량 배지에는 미적용 — 복귀 배너와 "증량 제안"이 동시에 뜨는 모순.
- **수정**: `progressions.length > 0 && !showReturn && !showDeload` 게이트.

### P1-3. 세션 종료 직후 폰을 잠그면 Gist 백업 유실
- `src/lib/gistSync.ts:16,104-111`, `src/screens/SessionScreen.tsx:155`
- 8초 debounce 중 백그라운드 전환(헬스장에서 가장 흔한 동작) 시 iOS가 타이머를 동결, 밀린 백업을 보정하는 로직도 없음.
- **수정**: `visibilitychange → hidden`에서 pending sync 즉시 flush + "백업 필요" 플래그를 남겨 다음 부팅에서 재시도.

### P1-4. `navigator.storage.persist()` 미호출
- `src/App.tsx` 부팅 경로에 `navigator.storage?.persist?.()` 한 줄 추가 (실패 무시). Safari 탭 사용 기간의 추가 방어층.

## P2 — 여유 있을 때

| # | 항목 | 위치 | 수정 |
|---|---|---|---|
| P2-1 | §5.2 드래그 재정렬 미구현 (분석엔 영향 없음 — performedOrder 기준) | SessionScreen | 구현하거나 DESIGN.md에서 "v1.1로 연기" 명시 |
| P2-2 | 파일 선택 취소 감지 500ms 레이스 — iCloud 미다운로드 파일이 취소 처리될 수 있음 | `src/lib/pickFile.ts:38-42` | change 진입 시 취소 타이머 무효화 |
| P2-3 | 세트 입력 숫자 20px (§9는 24px+) | `global.css` `.stepper-value` | 24px로 |
| P2-4 | 터치 타깃 44pt 미달: 스테퍼 ±(34px), 배너 버튼(32px), "전체 보기" 칩 | global.css, HistoryScreen.tsx:91-97 | 44px로 |
| P2-5 | 세션 화면 매 입력마다 인터벌 재생성 + 전체 prefill 재계산 | `SessionScreen.tsx:35-69` | 의존성을 `session.id`/`dayId`로 축소 |
| P2-6 | setState updater 내부 부수효과 (StrictMode 이중 실행) | `useSessionEditor.ts:54-61`, `useRestTimer.ts:117-130` | 부수효과를 updater 밖으로 |
| P2-7 | 유산소 분 입력이 비우는 순간 0으로 고착 | `SessionDetailScreen.tsx:158-167` | 문자열 로컬 상태, 커밋 시 파싱 |
| P2-8 | 배너 dismiss가 탭 전환마다 리셋 | `HomeScreen.tsx:34-35` | dismiss 상태를 세션 스코프(스토어)로 |
| P2-9 | `useSettings.activeRoutineId` 죽은 상태 (소비처 없음, 루틴 교체 시 낡음) | `src/store/settings.ts:7` | 제거 |
| P2-10 | 세트 행 `key={i}` — 중간 제거 UI가 생기면 스테퍼 내부 상태가 옆 세트로 붙음 | `ExerciseCard.tsx:154` | 세트에 로컬 id 부여 |
| P2-11 | `setSettings({ gistId: undefined })`가 undefined row를 남김 | `GistPanel.tsx:138`, `db/index.ts:34-37` | `bulkDelete(['gistId','lastBackupAt'])` |
| P2-12 | seed.ts 주석과 동작 불일치 — 카탈로그 갱신이 시드 버전 상승 시에만 | `src/db/seed.ts:39-41` | bulkPut을 needsSeed 밖으로 (또는 주석 수정) |
| P2-13 | JSON 복원 시 routines에 `validateRoutine` 미적용 | `src/lib/backup.ts:101-114` | 복원 경로에 검증 추가 |
| P2-14 | deploy.yml `cancel-in-progress: true` — deploy 단계 중단 위험 | `.github/workflows/deploy.yml:16` | `false`로 |
| P2-15 | index.html에 base 경로 8곳 하드코딩, 레포명 변경 가이드에서 누락 | `index.html:18-43`, `vite.config.ts:5` | 주석 보강 |

## 수정하지 않는 것 (의도적 명세 이탈 — 유지)

- **첫 노출 보너스 ×1.5** (`suggestNextDay.ts`) — 원래 명세 공식의 결함 수정. DESIGN.md §4에 역반영 완료
- **디로드 수행 후 카운터 리셋** (`dashboard.ts:counterStartWeek`) — 명세 누락 보완. DESIGN.md §7 역반영 완료
- **조기 디로드 지표 = 주간 세션 최고값** (`dashboard.ts:weeklyBestReps`) — 출석/수행 혼동 제거. 역반영 완료
- **빈도 경고 judgeable 게이트** (`dashboard.ts:103-118`) — 월요일 아침 전 부위 경고 방지. 합리적
- **Phase 0 이번 주 판정 보류** (`dashboard.ts:phase0Progress`) — 합리적
- **내보내기의 `[디로드]`/`미수행:` 줄** — 분석 오독 방지. 합리적

## 검증 통과 확인

- 시드 = v2.4 문서 1:1 (세트·반복·휴식·muscleSets 전부 검산)
- 테스트 169/169, tsc 클린, vite build + PWA precache 정상
- Gist 토큰 3중 방어 (localStorage 분리, Dexie 쓰기 거부, 내보내기·복원 필터) — 백업 파일에 PAT가 실릴 수 없음
- base 경로 `/workout-tracker/` = 레포명 일치, manifest·SW 산출물 확인
- 세트 입력 write-through 저장에 유실/역전 경로 없음
- 휴식 타이머 타임스탬프 방식 엣지 (잠금 복귀, 만료 부활 방지, +30초) 전부 처리
