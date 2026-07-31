# 운동 기록 PWA — 설계 문서 v1.0

> **이 문서는 구현 세션(Opus)이 이 문서만 읽고 개발을 시작할 수 있도록 작성됐다.**
> 이 설계가 참조하는 운동 루틴 원본 문서를 이하 "루틴 문서"로 표기한다 (레포에 포함하지 않음).
> — 이 설계의 운동학 수정(완충 D3 이동, D1/D2 종목 추가, 휴식 90초, 복귀 프로토콜, Phase 0 증량, 진전 지표)이 v2.4로 역반영되어 **앱 시드와 루틴 문서가 1:1로 일치한다.** v2.3은 구버전.
> 설계 확정일: 2026-07-31
>
> *(공개용 사본: 개인 건강 정보에 해당하는 서술 일부를 일반화했다. 설계 근거·알고리즘·시드는 원본과 동일하다.)*

---

## 1. 목적과 비목적

### 목적

- 사용자 1인(본인)용 운동 기록 앱. v2.4 루틴의 기록 방식(세트별 반복수 + 감각 점수 + 보상작용 + 수행 순서)을 헬스장에서 실시간 입력
- 기록을 Markdown으로 내보내 Claude에게 붙여넣으면 바로 분석 가능한 형식
- 실서비스 헬스 앱 수준의 UI/UX (다크 테마, 세트 체크, 휴식 타이머, 이전 기록 표시)

### 비목적 (v1에서 하지 않는 것)

- 다중 사용자, 로그인, 서버 백엔드
- 체중/식단 기록 (인바디 앱과 별도 관리 중)
- 소셜/공유 기능
- 앱스토어 배포

### 사용자 컨텍스트 (설계 근거)

- 개발자, 아이폰 사용, Apple Developer 미등록
- 훈련: 주 3~4회 목표 (Phase 0 진행 중 — 주 3회 × 8주 연속이 목표)
- 과거 16개월간 기록 부재가 핵심 문제였음 → **입력 마찰 최소화가 최우선 설계 기준**
- GitHub Pages 배포 경험 있음

---

## 2. 플랫폼과 스택

### 플랫폼: GitHub Pages + PWA

- Safari에서 열고 **"홈 화면에 추가"** → standalone 전체화면 앱. Apple Developer 불필요
- 홈 화면 웹앱은 Safari의 7일 미사용 스토리지 삭제(ITP) 대상에서 제외
- 서비스워커 오프라인 캐싱 → 헬스장 신호 무관하게 동작
- **첫 실행 온보딩에 "홈 화면에 추가" 안내 화면 필수** (Safari 탭으로 쓰면 데이터 유실 위험 안내)

### 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite + TypeScript | |
| UI | React 18 | 구현 효율, 생태계 |
| 상태 | zustand | 가벼움. Redux 불필요 |
| 저장 | Dexie (IndexedDB) | 구조화 쿼리, 용량 여유 |
| PWA | vite-plugin-pwa | manifest + SW 자동화 |
| 차트 | recharts | 분석 탭 라인차트용 |
| 배포 | GitHub Actions → gh-pages | push 시 자동 배포 |

- 레포: `workout-log` (public — 코드만 공개, 데이터는 전부 로컬)
- Vite `base` 설정을 `/workout-log/`로 (Pages 하위 경로 주의)
- iOS 전용 고려: `viewport-fit=cover`, safe-area inset, `-webkit-tap-highlight-color` 제거, 입력 필드 `font-size ≥ 16px` (자동 줌 방지), `apple-mobile-web-app-status-bar-style`

---

## 3. 데이터 모델

```typescript
// ─── 루틴 (교체 가능한 데이터) ───────────────────────────

interface RoutineTemplate {
  id: string;                    // "physique-v2.4"
  name: string;                  // "피지크형 상체 루틴 v2.4"
  version: string;
  createdAt: string;             // ISO
  isActive: boolean;             // 활성 루틴은 하나
  days: RoutineDay[];
  fallbackDays: RoutineDay[];    // 하한 모드 (Push 축소 / Pull 축소)
  rules: RoutineRules;
}

interface RoutineDay {
  id: string;                    // "d1"
  name: string;                  // "Day 1 — Push"
  subtitle: string;              // "상부가슴 / 측면어깨 / 삼두"
  isBuffer: boolean;             // D3 = true (완충일: 주 3회 주에 빠지는 날. UI 라벨용 — 제안 로직은 §4 볼륨 예산이 담당)
  muscleSets: Record<string, number>;  // 이 Day가 제공하는 부위별 세트 수 (§4 제안 로직·대시보드 공용)
  exercises: RoutineExercise[];
}

interface RoutineExercise {
  exerciseId: string;            // catalog 참조
  group: "A" | "B" | "core";
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  plannedOrder: number;
  optional: boolean;             // Day 4의 컬/푸쉬다운 = true
  note: string;                  // "이 날의 1순위. 가장 무겁게"
  weightHint?: string;           // "Day 1 무게의 60~70%"
}

interface RoutineRules {
  progressionNote: string;       // 더블 프로그레션 요약
  weightIncrementKg: number;     // 2.5
  allowProgressionInPhase0: boolean;  // true (v2.4)
  deloadEveryPerformedWeeks: number;  // 8
  deloadMinSessionsPerWeek: number;   // 3 (이 미만 주는 디로드 카운트 제외)
  lowerBodyMaxGapDays: number;        // 10 (§4 하체 최소 보장)
  returnProtocol: { gapWeeksMin: number; weightPct: number; setPct: number; targetRIR: number; rampWeeks: number }[];
  // v2.4: 무게는 소폭(−5~−20%), 세트·RIR 중심으로 조절. 시드 §8 참조
}

// 세션의 dayId가 isBuffer=false인 정규 Day인데 muscleTargets에 없는 부위를 제공해도 무시하고 집계만 한다
// (v2.5+ 루틴이 부위를 추가할 수 있으므로 부위 키는 하드코딩하지 않는다)

// ─── 종목 카탈로그 ───────────────────────────────────────

interface Exercise {
  id: string;                    // "incline-chest-press"
  name: string;                  // "인클라인 체스트프레스 머신"
  shortName: string;             // "인클라인 프레스"
  compensationSigns: string[];   // 루틴 문서 12장 보상작용 체크리스트
}

// 기록 라인 키: `${exerciseId}@${dayId}`
// 루틴 문서 원칙 "같은 기계라도 무게대와 목적이 다르면 다른 운동" →
// (종목, Day) 조합별로 기록·프리필·증량판단을 전부 분리한다.
// 예: incline-chest-press@d1 (A그룹 기록) vs incline-chest-press@d4 (B그룹 감각)

// ─── 세션 (기록) ─────────────────────────────────────────

interface Session {
  id: string;                    // uuid
  date: string;                  // "2026-08-04" (로컬 기준)
  dayId: string;                 // "d1" | ... | "fallback-push" 등
  routineId: string;
  mode: "normal" | "deload" | "return";  // 디로드/복귀 주간 표시
  startedAt: string; endedAt?: string;
  entries: SessionEntry[];
  cardio?: { type: string; minutes: number; note?: string };  // "마이마운틴 25/3.8"
  sessionNote?: string;
}

interface SessionEntry {
  recordKey: string;             // "lat-pulldown@d2"
  plannedOrder: number;
  performedOrder: number | null; // 첫 세트 입력 시각 순으로 자동 부여
  firstSetAt?: string;           // 순서 분석용 타임스탬프
  sets: SetRecord[];
  sensoryScore?: 0 | 1 | 2 | 3;  // B그룹
  sensoryNote?: string;          // "가슴 바깥쪽 — 벌릴 때 느낌 옴"
  compensation: string;          // 기본값 "없음". 비우기 불가(루틴 문서 규칙)
  skipped: boolean;
}

interface SetRecord {
  weight: number;                // kg
  reps: number;
  done: boolean;
  doneAt?: string;
}

// ─── 설정 ────────────────────────────────────────────────

interface Settings {
  activeRoutineId: string;
  currentPhase: 0 | 1 | 2 | 3;   // 수동 전환 (조건 충족은 앱이 표시만)
  gistToken?: string;            // PAT (gist scope), localStorage
  gistId?: string;
  lastBackupAt?: string;
  onboardingDone: boolean;
}
```

**Dexie 테이블:** `routines`, `exercises`, `sessions`, `settings(key-value)`.
디로드 카운터·streak·Phase 0 진행률은 저장하지 않고 sessions에서 **파생 계산**한다 (단일 진실 원천).

---

## 4. Day 자동 제안 로직 (설계 확정 사항)

### 왜 순환이 아니라 볼륨 예산인가

초기 설계는 "순수 순환(마지막 Day의 다음) + Day 4 조건부"였다. 두 가지 이유로 폐기했다.

**① 순환은 부위 빈도를 보장하지 못한다.** v2.3은 Push/Pull/Lower/Upper-full 구조라 D4가 상체 우선부위 전체의 **주 2회차 노출을 혼자 담당**한다. D4가 빠지면 측면어깨·상부가슴·광배·후면어깨가 모두 주 1회로 떨어진다. 볼륨을 맞춰도 주 2회가 주 1회보다 근비대에 유리하다는 근거(빈도 메타분석)를 감안하면 이 손실이 볼륨 감소보다 크다.

**② 사전 선언(주 시작에 "이번 주 몇 회?" 질문)은 예측이 틀리면 양방향으로 깨진다.** 3회로 선언 후 4회 하면 볼륨 초과, 4회로 선언 후 3회 하면 원래 문제 그대로. 사용자의 실제 이력(수행 횟수 변동이 큼)에서 예측은 신뢰할 수 없다.

→ **예측을 제거하고, 매 세션 시작 시점의 실제 수행 상태에 반응하는 방식으로 전환.**

### 알고리즘

```
suggestNextDay(sessions, routine, today):
  last = 가장 최근 완료 세션
  if last 없음 → D1
  gap = today - last.date

  // 1. 장기 공백 우선 처리
  if gap ≥ 14일:
    → D1 + 복귀 배너 (§7 복귀 프로토콜)

  // 2. 하체 최소 보장 (계속 밀리는 것 방지)
  if 마지막 하체 세션(D3)이 10일 이상 전 → D3

  // 3. 이번 주(월~일) 부위별 수행 세트 집계
  performed = { 측면어깨: n, 상부가슴: n, 광배: n, 후면어깨: n, 팔: n, 하체: n, 코어: n }

  // 4. 각 Day의 부족분 충족 점수
  for each day in [D1, D2, D3, D4]:
    score = Σ over 부위 (
      weight[부위] × min(target[부위] − performed[부위], day가 제공하는 세트)
    )
    // 회복 제약: 직전 세션과 24시간 이내 + 주요 부위 겹침 → score × 0.3
  
  → 최고 점수 Day 제안
```

**부위 우선순위 가중치** (루틴 문서 1장 순위 기반):

| 부위 | 목표 세트/주 | 가중치 |
|---|---|---|
| 측면어깨 | 11 | 1.00 |
| 상부가슴 | 10 | 0.90 |
| 광배 | 16 | 0.85 |
| 후면어깨 | 7 | 0.70 |
| 팔 | 6 | 0.50 |
| 하체 | 9 | 0.45 |
| 코어 | 5 | 0.30 |

`RoutineDay`에 `muscleSets: Record<string, number>` 필드를 추가해 각 Day가 부위별로 몇 세트를 제공하는지 명시한다 (종목→부위 매핑을 매번 계산하지 않도록).

### 동작 검증

⚠ **요일은 이 로직에 존재하지 않는다.** 아래 표의 "이번 주 상태"는 순전히 수행 이력이고, 제안은 세션을 시작하는 시점이 언제든 그 시점의 부족분 계산으로 정해진다. 순번(몇 번째 세션인가)만 의미가 있다.

| 이번 주 수행 이력 | 다음 제안 | 근거 (부족분 × 가중치 점수) |
|---|---|---|
| (없음) | D1 | 전부 0, 최고 가중치 부위 포함 Day |
| D1 | D2 | 광배·후면어깨 0 |
| D1·D2 | **D4** | D4=10.5 (광배6×0.85 + 상부가슴3×0.90 + 측면2×1.00 + 후면1×0.70) > D3=5.55 (하체9×0.45 + 코어5×0.30) |
| D1·D2·D4 | D3 | 상체 충족, 하체·코어만 남음 |
| 하체를 10일+ 안 함 | D3 | 규칙 2 발동 (점수 무시) |

**귀결: 주 4회 완주 시 순서는 D1→D2→D4→D3가 된다.** v2.3 문서의 월화목토(D1·D2·D3·D4)와 다르며, 의도된 변경이다:

- v2.3에서는 "D4 = 못 하면 버리는 완충"이었으나, 이 로직에서는 **"D3 = 밀려도 되는 날"로 완충의 위치가 이동**했다. 버려도 되는 것은 성장 목표 부위(상체)의 2회차가 아니라 유지 목적 부위(하체)의 빈도이기 때문
- 주 3회로 끝난 주는 자동으로 D1·D2·D4 → 상체 우선부위 전부 2x 확보, 하체는 규칙 2(10일 가드)로 **격주 1회가 하한**
- v2.3이 D3를 목요일에 둔 것은 주중 분산 목적이지 운동학적 제약이 아님 (하체날 유산소 규칙은 Day 내용에 결합돼 있어 순서와 무관)

- 홈 화면에서 제안 Day를 크게 표시하되, 탭하면 **모든 Day + 하한 모드(Push 축소/Pull 축소) 선택 시트**가 열림 (요구사항: 잘못된 경우 변경 가능)
- 제안 근거를 한 줄로 표시: "광배·측면어깨 2회차가 남았어요"
- 같은 날 두 세션 허용 (드묾, 막지 않음)

---

## 5. 화면 명세

### 5.1 홈 (탭 1)

- **오늘 카드**: 제안 Day 이름 + 종목 미리보기 + [운동 시작] 대형 버튼. Day 변경은 카드 탭 → 바텀시트
- **상태 배너** (조건부, 우선순위 순):
  1. 복귀 배너 — 14일+ 공백: "3주 공백 → 세트 −30%, RIR 3~4로 진행할까요?" [적용/무시]
  2. 디로드 배너 — 수행 주차 8주 도달 **또는 2주 연속 A그룹 반복수 하락**: "디로드 권장. 세트 50%, 무게 유지" [디로드 모드로 시작]
  3. 증량 배지 — 직전 세션에서 더블 프로그레션 충족한 A그룹 종목: "랫풀다운 +2.5kg 제안"
- **이번 주 현황**: 월~일 도트 (완료=불꽃, 오늘=링) + "이번 주 2/4회"
- **주간 부위별 볼륨 대시보드** (§4 볼륨 예산의 가시화 — 운동학적으로 v1의 핵심 추가 기능)
  - 부위별 수평 바: `측면어깨 ███████░░░ 7/11` — 우선순위 순 정렬
  - 빈도 표시: `2x` / `1x` 뱃지. 상체 우선부위가 1x면 주의 색상
  - 목표 초과는 문제로 표시하지 않음 (용량-반응 유효 범위 내)
- **Phase 0 진행률**: "주 3회 이상 연속 5/8주" 프로그레스 바 (Phase 0일 때만)
- **디로드 카운터**: "수행 주차 5/8주"

### 5.2 세션 화면 (핵심)

구조: 상단 고정 헤더(Day 이름, 경과 시간, 종료 버튼) + 운동 카드 리스트 + 하단 고정 휴식 타이머 바.

**운동 카드 (접힘 상태)**
```
③ 시티드 케이블 로우          A그룹
   4세트 × 8~12 · 지난번 40kg 12/11/10/9   [완료 2/4]
```
- 계획 순서 번호 표시하되 **아무 카드나 탭해서 펼치고 바로 입력 가능** (수행 순서 자유)
- 첫 세트 입력 시각으로 `performedOrder` 자동 부여. 카드에 "3번째로 수행" 뱃지
- 드래그 핸들로 리스트 재정렬도 가능 (시각적 정리용 — 분석은 performedOrder 기준)

**운동 카드 (펼침 상태)**
```
 세트   지난번   최고     무게(kg)   횟수
  1    40×12   42.5×11  [42.5]    [ 11 ]   [✓]
  2    40×11   42.5×10  [42.5]    [  - ]   [ ]
  ...
 [+ 세트 추가]
 ── B그룹만: 감각 점수 [0][1][2][3] + 메모
 ── 보상작용: [없음] (탭하면 종목별 체크리스트 + 직접 입력)
```
- **프리필은 최근 3세션 최고 기록 기준.** 직전 세션만 쓰면 컨디션 나쁜 날의 기록이 다음 기준점이 되어 하향 고착이 생긴다(특히 감량기에는 세션 간 변동이 커진다). 최고 기록을 입력 기본값으로, 직전 기록은 비교용 고스트 텍스트로 병기
- 무게 스테퍼 ±2.5kg 롱프레스 가속, 횟수 스테퍼 ±1. 직접 입력도 가능
- 세트 체크(✓) 시 → 휴식 타이머 자동 시작 (해당 종목의 restSec)
- A그룹 증량 제안 상태면 무게 필드에 `40 → 42.5` 제안 칩
- 보상작용 기본값 "없음" (루틴 문서 규칙: 빈칸 금지 — 기본값으로 마찰 없이 충족)
- optional 종목(D4 컬/푸쉬다운)은 "컨디션 좋을 때만" 라벨 + 기본 접힘·스킵 가능

**휴식 타이머 (하단 고정 바)**
- `endTime = now + restSec`를 저장하고 남은 시간은 **타임스탬프 기준 재계산** (iOS PWA는 화면 잠금 시 JS 정지 → visibilitychange에서 재계산으로 해결)
- 종료 시: 화면 켜져 있으면 진동(navigator.vibrate는 iOS 미지원 → Web Audio 비프음) + 배지
- +30초 / 건너뛰기 버튼
- Notification API(iOS 16.4+ 홈화면 PWA 지원)는 v1.1로 미룸 — 권한 UX 복잡도 대비 효용 낮음

**세션 종료**
- 미완료 종목 확인 다이얼로그 → 요약 화면 (총 세트, 볼륨, 수행 순서 타임라인, 증량 달성 종목)
- 유산소 기록 프롬프트: 종류(마이마운틴/자전거/기타) + 분. 스킵 가능
- 완료 시 자동 저장은 이미 되어 있음 (입력 즉시 IndexedDB 반영 — 앱이 죽어도 유실 없음. "저장 버튼" 없음)

### 5.3 기록 (탭 2)

- 월 달력: 세션 있는 날 불꽃 표시 (기존 앱 UX 재현), 탭하면 해당 세션 상세
- 세션 상세: 수행 순서대로 종목 + 세트 기록 + 감각/보상작용. 편집 가능 (당일 입력 실수 보정)
- 종목별 보기: recordKey 선택 → 세션 히스토리 리스트 (무게·반복수 추이)

### 5.4 분석 (탭 3) — v1 최소

- A그룹 종목별 라인차트: 세션별 `무게 × 최다 반복수` 및 총 볼륨
- B그룹 감각 점수 추이 (종목 × 4주 단위 평균) — "계속 0인 종목" 탐지용
- 주간 수행 횟수 바 차트 (월별)
- 고급 분석(순서 영향 등)은 앱에서 하지 않음 — **내보내기 → Claude 분석**이 설계 의도

### 5.5 설정 (탭 4)

- 루틴 관리: 활성 루틴 표시, JSON으로 루틴 가져오기/내보내기 (v2.4 교체 경로)
- Phase 수동 전환 (0~3) + 각 Phase 조건 요약 표시
- 내보내기: 기간 선택 → **Markdown** (Claude 분석용) / **JSON** (전체 백업)
  - iOS 공유 시트(`navigator.share`) 우선, 폴백은 파일 다운로드
- 가져오기: JSON 복원 (병합 아닌 전체 교체, 확인 2단계)
- Gist 백업: PAT 입력 → private gist 자동 생성, 이후 세션 종료마다 debounce 동기화. 마지막 백업 시각 표시. [지금 백업] [Gist에서 복원]
- 데이터 초기화 (확인 2단계)

---

## 6. 내보내기 형식

### Markdown (Claude 분석용) — 루틴 문서 11장 템플릿 준수 + 순서 정보

```markdown
# 운동 기록 2026-08-04 ~ 2026-08-17

## 2026-08-04 (월) — Day 1 Push  [18:02–19:41, 99분]
수행 순서: 인클라인 프레스 → 레터럴 레이즈 → 펙덱 플라이 → 체스트프레스 → 숄더프레스 → 푸쉬다운
(계획 대비: 레터럴을 2번째로 앞당김)

### 인클라인 프레스 (D1/A) 30kg
12 / 11 / 10 / 9
보상작용: 마지막 세트 엉덩이 살짝 뜸
다음: 30kg 유지

### 레터럴 레이즈 (D1/B) 3kg
18 / 16 / 14 / 13
감각: 3점 — 측면 확실
보상작용: 없음

...

유산소: 마이마운틴 25/3.8 · 20분
메모: (세션 노트)
```

- 증량 판단(`다음: 유지/증량`)은 더블 프로그레션 규칙으로 자동 산출해 포함
- JSON 내보내기는 Dexie 전체 덤프 + 스키마 버전 필드

---

## 7. 파생 계산 로직

```
주간 수행 횟수: 월~일 기준, 정규 Day + fallback 모두 카운트
주간 부위별 볼륨: 세션 entries → recordKey → 종목 → 부위 매핑으로 집계 (§4 대시보드·제안 로직 공용)
디로드 카운터: 주 3회 이상인 주만 +1. 마지막 세션과 4주+ 공백 발생 시 0으로 리셋. 8 도달 시 배너
조기 디로드 신호: A그룹 주요 3종목에서 2주 연속 총 반복수 하락 → 디로드 배너 조기 표시
Phase 0 진행: 최근 주부터 거슬러 "주 3회 이상" 연속 주 수. 주 2회(fallback) 주는 8주 중 1회까지 허용

증량 제안 (A그룹, Phase 0부터 활성):
  직전 세션 같은 recordKey에서 모든 세트 reps ≥ repMax
  AND compensation == "없음"
  → 다음 세션 프리필에 +2.5kg 제안 칩 (강제 아님)

진전 지표 (증량 조건이 감량기에 거의 충족되지 않으므로 보조 지표 필수):
  총 볼륨 = Σ(무게 × 반복수) — 세트 상단을 못 채워도 상승이 보임
  e1RM 추정 = 무게 × (1 + reps/30)  // Epley. 최고 세트 기준
  → 종목별 카드와 분석 탭에 추이 표시. 감량기에는 "볼륨 유지 = 성공" 프레이밍

복귀 프로토콜 (무게보다 볼륨·RIR을 조절):
  gap 2~4주  → 무게 −5%,  세트 −30%, RIR 3~4, 1주 램프
  gap 4~8주  → 무게 −10%, 세트 −40%, RIR 3~4, 2주 램프
  gap 8주+   → 무게 −20%, 세트 −50%, RIR 3~4, 3주 램프 + Phase 1 복귀 안내
```

### 이 로직들의 운동학적 근거

구현 시 임의로 바꾸면 안 되는 이유를 남긴다. v2.4 루틴 교체 시에도 이 원칙은 유지.

| 로직 | 근거 |
|---|---|
| **복귀 시 무게보다 세트·RIR을 깎는다** | 2~4주 공백에서 근력 손실은 매우 작다(detraining 문헌 일관). 무게를 −25% 하면 자극이 역치 아래로 떨어져 복귀가 오히려 길어진다. 실제 리스크는 반복부하효과(RBE) 소실로 인한 근손상·DOMS 폭증이고, 이는 볼륨과 실패 근접도가 지배한다. **조절 변수를 무게에서 볼륨/RIR로 교체한 것이 이 수정의 핵심** |
| **Phase 0에서도 증량 허용** | progressive overload는 근비대의 1차 드라이버다. 8주 무게 고정은 repMax를 채운 종목의 진전을 0으로 만든다. v2.3 문서 v2.2 변경점 1번이 "더블 프로그레션 조건 자체가 과욕을 막는 장치"라는 근거로 Phase 1 증량을 허용했고, 같은 논리가 Phase 0에 그대로 적용된다 |
| **프리필을 최근 3세션 최고치로** | 직전 세션 기준은 컨디션 변동을 그대로 상속해 하향 나선을 만든다. 감량기에는 세션 간 변동이 더 커진다 |
| **고정 디로드 + 자가조절 병행** | 디로드의 근비대 이득은 문헌상 명확하지 않고 피로 관리 목적이다. 주 3회 초보의 축적 피로는 크지 않아 고정 8주는 momentum 손실 위험이 있다. 다만 과거 루틴 중단 이력을 감안하면 고정 주기가 심리적 안전판이므로 유지하고, 수행 저하 신호에 반응하는 조기 디로드를 추가 |
| **볼륨 감소형 디로드 (세트 −50%, 무게 유지)** | 강도 감소형보다 근육·근력 유지에 유리 |
| **부위별 주 2회 노출 우선** | 볼륨을 맞춰도 주 2회 > 주 1회 (빈도 메타분석). 그래서 §4가 볼륨 예산으로 빈도를 방어한다 |
| **부위당 주 10~20세트** | 용량-반응 곡선의 유효 구간. 목표 초과를 경고하지 않는 이유 |
| **RIR 1~2 목표 (실패까지 안 감)** | 실패 도달이 비실패보다 근비대에 유리하다는 근거는 약하고, 피로 비용은 확실히 크다 |
| **B그룹 휴식 90초 이상** | 짧은 휴식은 후속 세트 반복수를 떨어뜨려 총 볼륨을 줄인다. 긴 휴식이 근비대·근력에 유리(휴식 간격 연구). v2.3의 60초 하한을 90초로 상향 |
| **머신 중심 구성 유지** | 머신 vs 자유중량의 근비대 차이는 미미하고, 초보 기술 학습·감각 형성에는 머신이 유리 |
| **하체 주 1회~격주도 허용** | 유지에 필요한 볼륨은 성장 볼륨보다 훨씬 적다. v2.3이 하체를 "유지 목적"으로 규정했으므로 상체 우선부위 빈도와 경합할 때 양보 가능 |

## 8. v2.4 시드 데이터

구현 시 `src/data/routine-v2.4.json`으로 포함. 종목 카탈로그 + 루틴 정의:

```jsonc
// exercises (카탈로그, 발췌 — 전 종목 이 형식으로)
[
  { "id": "incline-chest-press", "name": "인클라인 체스트프레스 머신", "shortName": "인클라인 프레스",
    "compensationSigns": ["엉덩이가 시트에서 뜸", "어깨가 앞으로 말림"] },
  { "id": "pec-deck-fly", "name": "펙덱 플라이", "shortName": "펙덱 플라이",
    "compensationSigns": ["팔꿈치를 접어서 당김(프레스가 됨)"] },
  { "id": "flat-chest-press", "name": "체스트프레스 머신 (플랫)", "shortName": "체스트프레스", "compensationSigns": [] },
  { "id": "shoulder-press", "name": "숄더프레스 머신", "shortName": "숄더프레스", "compensationSigns": [] },
  { "id": "lateral-raise", "name": "덤벨/케이블 레터럴 레이즈", "shortName": "레터럴 레이즈",
    "compensationSigns": ["어깨가 귀 쪽으로 올라감", "무릎 반동", "몸통 좌우 흔들림"] },
  { "id": "lat-pulldown", "name": "랫풀다운 (일반 그립)", "shortName": "랫풀다운",
    "compensationSigns": ["상체가 크게 젖혀짐", "등보다 이두가 먼저 지침"] },
  { "id": "neutral-lat-pulldown", "name": "뉴트럴그립 랫풀다운", "shortName": "뉴트럴 랫풀", "compensationSigns": [] },
  { "id": "seated-cable-row", "name": "시티드 케이블 로우", "shortName": "시티드 로우",
    "compensationSigns": ["발판을 세게 밀고 있음", "상체 앞뒤 노 젓기"] },
  { "id": "arm-pulldown", "name": "암 풀다운", "shortName": "암 풀다운", "compensationSigns": [] },
  { "id": "rear-delt-fly", "name": "펙덱 리어델트", "shortName": "리어델트",
    "compensationSigns": ["팔꿈치가 펴졌다 굽었다 함", "승모로 당김"] },
  { "id": "curl", "name": "케이블/덤벨 컬", "shortName": "컬",
    "compensationSigns": ["팔꿈치가 앞으로 나감", "어깨 같이 올라감"] },
  { "id": "pushdown", "name": "케이블 푸쉬다운", "shortName": "푸쉬다운", "compensationSigns": [] },
  { "id": "leg-extension", "name": "레그 익스텐션", "shortName": "레그 익스텐션", "compensationSigns": ["반동"] },
  { "id": "leg-curl", "name": "시티드/라잉 레그 컬", "shortName": "레그 컬", "compensationSigns": [] },
  { "id": "hip-abduction", "name": "힙 어브덕션 머신", "shortName": "힙 어브덕션", "compensationSigns": [] },
  { "id": "crunch", "name": "머신/케이블 크런치", "shortName": "크런치", "compensationSigns": ["허리 과신전"] },
  { "id": "dead-bug", "name": "데드버그", "shortName": "데드버그", "compensationSigns": [] }
]
```

시드는 루틴 문서 v2.4와 1:1로 일치한다 (운동학 수정이 v2.4에 역반영 완료).

```jsonc
{
  "id": "physique-v2.4", "name": "피지크형 상체 루틴 v2.4", "version": "2.4", "isActive": true,

  // 볼륨 예산용 (§4). 부위별 주간 목표와 가중치
  "muscleTargets": {
    "측면어깨": { "target": 11, "weight": 1.00 },
    "상부가슴": { "target": 10, "weight": 0.90 },
    "광배":     { "target": 16, "weight": 0.85 },
    "후면어깨": { "target": 7,  "weight": 0.70 },
    "팔":       { "target": 6,  "weight": 0.50 },
    "하체":     { "target": 9,  "weight": 0.45 },
    "가슴":     { "target": 3,  "weight": 0.40 },  // 플랫 프레스(중간가슴)
    "코어":     { "target": 5,  "weight": 0.30 }
  },

  "days": [
    { "id": "d1", "name": "Day 1 — Push", "subtitle": "상부가슴 / 측면어깨 / 삼두", "isBuffer": false,
      "muscleSets": { "상부가슴": 7, "가슴": 3, "측면어깨": 7, "후면어깨": 2, "팔": 3 },  // 총 22
      "exercises": [
        { "exerciseId": "incline-chest-press", "group": "A", "sets": 4, "repMin": 6,  "repMax": 10, "restSec": 150, "plannedOrder": 1, "optional": false, "note": "이 날의 1순위. 가장 무겁게" },
        { "exerciseId": "pec-deck-fly",        "group": "B", "sets": 3, "repMin": 12, "repMax": 15, "restSec": 90,  "plannedOrder": 2, "optional": false, "note": "팔꿈치 각도 고정, 끝까지 벌리기" },
        { "exerciseId": "flat-chest-press",    "group": "A", "sets": 3, "repMin": 8,  "repMax": 12, "restSec": 120, "plannedOrder": 3, "optional": false, "note": "벤치프레스 대신 머신 고정" },
        { "exerciseId": "shoulder-press",      "group": "A", "sets": 3, "repMin": 8,  "repMax": 12, "restSec": 120, "plannedOrder": 4, "optional": false, "note": "과하게 늘리지 않는다" },
        { "exerciseId": "lateral-raise",       "group": "B", "sets": 4, "repMin": 12, "repMax": 20, "restSec": 90,  "plannedOrder": 5, "optional": false, "note": "무게 대폭 하향. 승모 개입 체크" },
        { "exerciseId": "rear-delt-fly",       "group": "B", "sets": 2, "repMin": 12, "repMax": 20, "restSec": 90,  "plannedOrder": 6, "optional": false, "note": "빈도 확보용 추가 2세트" },
        { "exerciseId": "pushdown",            "group": "B", "sets": 3, "repMin": 10, "repMax": 15, "restSec": 90,  "plannedOrder": 7, "optional": false, "note": "팔꿈치 고정" }
      ] },

    { "id": "d2", "name": "Day 2 — Pull", "subtitle": "광배 / 등 두께 / 후면어깨 / 이두", "isBuffer": false,
      "muscleSets": { "광배": 10, "후면어깨": 4, "측면어깨": 2, "팔": 3 },  // 총 19
      "exercises": [
        { "exerciseId": "arm-pulldown",     "group": "B", "sets": 2, "repMin": 15, "repMax": 15, "restSec": 60,  "plannedOrder": 1, "optional": false, "note": "가볍게. 광배 위치 확인용 프라이머" },
        { "exerciseId": "lat-pulldown",     "group": "A", "sets": 4, "repMin": 8,  "repMax": 12, "restSec": 120, "plannedOrder": 2, "optional": false, "note": "팔꿈치를 뒤·아래로" },
        { "exerciseId": "seated-cable-row", "group": "A", "sets": 4, "repMin": 8,  "repMax": 12, "restSec": 120, "plannedOrder": 3, "optional": false, "note": "발판 밀지 않기" },
        { "exerciseId": "rear-delt-fly",    "group": "B", "sets": 4, "repMin": 12, "repMax": 20, "restSec": 90,  "plannedOrder": 4, "optional": false, "note": "팔꿈치 살짝 굽힌 채 고정" },
        { "exerciseId": "lateral-raise",    "group": "B", "sets": 2, "repMin": 12, "repMax": 20, "restSec": 90,  "plannedOrder": 5, "optional": false, "note": "빈도 확보용 추가 2세트. D1보다 가볍게" },
        { "exerciseId": "curl",             "group": "B", "sets": 3, "repMin": 10, "repMax": 15, "restSec": 90,  "plannedOrder": 6, "optional": false, "note": "팔꿈치 앞으로 나가지 않게" }
      ] },

    { "id": "d3", "name": "Day 3 — 하체 + 코어", "subtitle": "발 조건 하 유지 목적", "isBuffer": false,
      "muscleSets": { "하체": 9, "코어": 5 },  // 총 14
      "exercises": [
        { "exerciseId": "leg-extension", "group": "A",    "sets": 3, "repMin": 10, "repMax": 15, "restSec": 105, "plannedOrder": 1, "optional": false, "note": "무릎 통제, 반동 금지" },
        { "exerciseId": "leg-curl",      "group": "A",    "sets": 3, "repMin": 10, "repMax": 15, "restSec": 105, "plannedOrder": 2, "optional": false, "note": "수축에서 1초 정지" },
        { "exerciseId": "hip-abduction", "group": "B",    "sets": 3, "repMin": 15, "repMax": 20, "restSec": 90,  "plannedOrder": 3, "optional": false, "note": "무게 하향, 수축 정지" },
        { "exerciseId": "crunch",        "group": "core", "sets": 3, "repMin": 10, "repMax": 15, "restSec": 60,  "plannedOrder": 4, "optional": false, "note": "허리 과신전 금지" },
        { "exerciseId": "dead-bug",      "group": "core", "sets": 2, "repMin": 10, "repMax": 12, "restSec": 60,  "plannedOrder": 5, "optional": false, "note": "좌우 10~12. 천천히 통제" }
      ] },

    { "id": "d4", "name": "Day 4 — 피지크 보완", "subtitle": "전 종목 B그룹 방식", "isBuffer": true,
      "muscleSets": { "광배": 6, "상부가슴": 3, "측면어깨": 4, "후면어깨": 3, "팔": 4 },  // 총 20
      "exercises": [
        { "exerciseId": "neutral-lat-pulldown", "group": "B", "sets": 3, "repMin": 10, "repMax": 15, "restSec": 120, "plannedOrder": 1, "optional": false, "note": "10~12회 중심" },
        { "exerciseId": "incline-chest-press",  "group": "B", "sets": 3, "repMin": 10, "repMax": 15, "restSec": 120, "plannedOrder": 2, "optional": false, "note": "", "weightHint": "Day 1 무게의 60~70%" },
        { "exerciseId": "lateral-raise",        "group": "B", "sets": 4, "repMin": 15, "repMax": 20, "restSec": 90,  "plannedOrder": 3, "optional": false, "note": "이 날의 주인공" },
        { "exerciseId": "rear-delt-fly",        "group": "B", "sets": 3, "repMin": 15, "repMax": 20, "restSec": 90,  "plannedOrder": 4, "optional": false, "note": "" },
        { "exerciseId": "seated-cable-row",     "group": "B", "sets": 3, "repMin": 12, "repMax": 15, "restSec": 90,  "plannedOrder": 5, "optional": false, "note": "수축감 중심" },
        { "exerciseId": "curl",                 "group": "B", "sets": 2, "repMin": 12, "repMax": 15, "restSec": 90,  "plannedOrder": 6, "optional": true,  "note": "컨디션 좋을 때만" },
        { "exerciseId": "pushdown",             "group": "B", "sets": 2, "repMin": 12, "repMax": 15, "restSec": 90,  "plannedOrder": 7, "optional": true,  "note": "컨디션 좋을 때만" }
      ] }
  ],

  "fallbackDays": [
    { "id": "fallback-push", "name": "Push 축소", "subtitle": "하한 모드 · 30분", "isBuffer": false,
      "muscleSets": { "상부가슴": 5, "측면어깨": 3 },  // 총 8
      "exercises": [
        { "exerciseId": "incline-chest-press", "group": "A", "sets": 3, "repMin": 6,  "repMax": 10, "restSec": 150, "plannedOrder": 1, "optional": false, "note": "" },
        { "exerciseId": "lateral-raise",       "group": "B", "sets": 3, "repMin": 12, "repMax": 20, "restSec": 90,  "plannedOrder": 2, "optional": false, "note": "" },
        { "exerciseId": "pec-deck-fly",        "group": "B", "sets": 2, "repMin": 12, "repMax": 15, "restSec": 90,  "plannedOrder": 3, "optional": false, "note": "" }
      ] },
    { "id": "fallback-pull", "name": "Pull 축소", "subtitle": "하한 모드 · 30분", "isBuffer": false,
      "muscleSets": { "광배": 6, "후면어깨": 2 },  // 총 8
      "exercises": [
        { "exerciseId": "lat-pulldown",     "group": "A", "sets": 3, "repMin": 8,  "repMax": 12, "restSec": 120, "plannedOrder": 1, "optional": false, "note": "" },
        { "exerciseId": "seated-cable-row", "group": "A", "sets": 3, "repMin": 8,  "repMax": 12, "restSec": 120, "plannedOrder": 2, "optional": false, "note": "" },
        { "exerciseId": "rear-delt-fly",    "group": "B", "sets": 2, "repMin": 12, "repMax": 20, "restSec": 90,  "plannedOrder": 3, "optional": false, "note": "" }
      ] }
  ],

  "rules": {
    "progressionNote": "모든 세트 상단 도달 + 보상작용 없음 → 소폭 증량",
    "weightIncrementKg": 2.5,
    "allowProgressionInPhase0": true,     // §7 근거 참조
    "deloadEveryPerformedWeeks": 8,
    "deloadMinSessionsPerWeek": 3,
    "lowerBodyMaxGapDays": 10,            // §4 하체 최소 보장
    "returnProtocol": [
      { "gapWeeksMin": 2, "weightPct": -5,  "setPct": -30, "targetRIR": 3, "rampWeeks": 1 },
      { "gapWeeksMin": 4, "weightPct": -10, "setPct": -40, "targetRIR": 3, "rampWeeks": 2 },
      { "gapWeeksMin": 8, "weightPct": -20, "setPct": -50, "targetRIR": 4, "rampWeeks": 3 }
    ]
  }
}
```

**주간 볼륨 검산 (주 4회 완주 시)**

| 부위 | D1 | D2 | D3 | D4 | 합 | 목표 | 빈도 |
|---|---|---|---|---|---|---|---|
| 측면어깨 | 7 | 2 | — | 4 | **13** | 11 | 3x |
| 상부가슴 | 7 | — | — | 3 | **10** | 10 | 2x |
| 광배 | — | 10 | — | 6 | **16** | 16 | 2x |
| 후면어깨 | 2 | 4 | — | 3 | **9** | 7 | 3x |
| 팔 | 3 | 3 | — | 4 | **10** | 6~10 | 3x |
| 가슴(플랫) | 3 | — | — | — | 3 | 3 | 1x |
| 하체 | — | — | 9 | — | 9 | 9 | 1x |
| 코어 | — | — | 5 | — | 5 | 5 | 1x |
| **세션 세트** | 22 | 19 | 14 | 20 | **75** | | |

**주 3회(D1·D2·D3)로 떨어져도** 측면어깨 9(2x), 후면어깨 6(2x)가 확보된다. 볼륨 예산 로직은 이 경우 다음 세션으로 D4를 제안해 상부가슴·광배의 2회차를 채운다.

- **fallback 세션의 recordKey는 정규 Day를 따른다**: `incline-chest-press@d1`처럼 기록해 프리필·증량 판단이 정규 Day와 이어지게 한다 (fallback은 같은 운동의 축소 수행이지 다른 운동이 아님. 단 D4는 무게대가 달라 분리 유지)
- 세트 수만 fallback 기준으로 렌더

## 9. UI 디자인 방향

- 다크 테마 고정 (헬스장 환경), 액센트 컬러 1개 (주황 계열 — 기존 불꽃 모티프 연속성)
- 타이포 크게: 세트 입력 숫자 24px+, 헬스장에서 팔 뻗은 거리에서 읽힘
- 터치 타깃 최소 44×44pt
- 애니메이션 최소 (세트 체크 시 마이크로 피드백 정도)
- 한국어 UI

## 10. 구현 마일스톤

1. **스캐폴드**: Vite+React+TS+Dexie+PWA 셋업, 시드 로딩, GH Actions 배포 파이프라인 (첫날 배포부터)
2. **세션 코어**: Day 제안 → 세션 시작 → 세트 입력/프리필/체크 → 즉시 저장 → 종료 요약. *(여기까지가 MVP — 이 시점부터 실사용 시작 가능)*
3. **타이머 + B그룹 입력**: 휴식 타이머 바, 감각 점수, 보상작용 체크리스트
4. **홈 대시보드**: 주간 도트, Phase 0 진행률, 디로드 카운터, 복귀/디로드/증량 배너
5. **기록 탭**: 달력 + 세션 상세 + 편집
6. **내보내기/가져오기**: MD, JSON, 공유 시트
7. **Gist 백업**
8. **분석 탭 + PWA 마감**: 차트, 오프라인 검증, 아이콘/스플래시, iOS 실기기 QA

## 11. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| iOS가 홈화면 미추가 상태에서 7일 후 데이터 삭제 | 온보딩에서 홈화면 추가 강제 안내 + Gist 백업 + 주 1회 백업 리마인드 배너 |
| 화면 잠금 중 타이머 정지 | endTime 타임스탬프 방식 (§5.2) |
| Gist 토큰 노출 (public repo) | 토큰은 코드에 없음, 사용자 입력 후 localStorage만. README에 명시 |
| 세션 도중 앱 강제 종료 | 입력 즉시 IndexedDB 저장. 재실행 시 "진행 중 세션 이어하기" 복구 |
| 잘못된 Day 선택 후 기록 | 세션 상세에서 dayId 변경 허용 (recordKey 재매핑 확인 다이얼로그) |
