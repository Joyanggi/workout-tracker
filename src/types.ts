// 데이터 모델 — DESIGN.md §3 기준.
// 설계 문서와의 차이는 주석으로 근거를 남긴다 (임의 변경 금지 원칙, §7).

// ─── 루틴 (교체 가능한 데이터) ───────────────────────────

/** 부위 키는 하드코딩하지 않는다 (v2.5+ 루틴이 부위를 추가할 수 있음, §3) */
export type MuscleKey = string

export interface MuscleTarget {
  /** 주간 목표 세트 수 */
  target: number
  /** 부족분 충족 점수 가중치 (§4) */
  weight: number
}

export interface RoutineTemplate {
  id: string // "physique-v2.4"
  name: string // "피지크형 상체 루틴 v2.4"
  version: string
  /**
   * 번들 시드의 **내용** 리비전 (R2). `ensureSeed`가 이 값으로 재주입을 판단한다.
   *
   * `version`(루틴 문서 버전)으로 판단하면 안 된다 — 실제로 그래서 뚫렸다.
   * recordDayId를 마일스톤 2에서 fallbackDays에 추가하면서 version 2.4를 유지했고,
   * 그 결과 마일스톤 1 설치본이 낡은 루틴을 영구히 들고 있었다.
   * **시드 JSON을 고치면 이 숫자를 올린다.** 해시 스냅샷 테스트가 기계적으로 강제한다.
   */
  seedRevision: number
  createdAt: string // ISO
  isActive: boolean // 활성 루틴은 하나
  /**
   * DESIGN.md §3 인터페이스에는 없지만 §8 시드 JSON에는 존재한다.
   * §4 볼륨 예산 로직이 반드시 필요로 하므로 타입에 추가했다.
   */
  muscleTargets: Record<MuscleKey, MuscleTarget>
  days: RoutineDay[]
  fallbackDays: RoutineDay[] // 하한 모드 (Push 축소 / Pull 축소)
  rules: RoutineRules
}

export interface RoutineDay {
  id: string // "d1"
  name: string // "Day 1 — Push"
  subtitle: string // "상부가슴 / 측면어깨 / 삼두"
  /** D3 = true (완충일 UI 라벨용 — 제안 로직은 §4 볼륨 예산이 담당) */
  isBuffer: boolean
  /**
   * 이 Day가 제공하는 부위별 세트 수 (§4 제안 로직·대시보드 공용).
   * exercises[].muscle × sets의 합과 일치해야 한다 (validateRoutine이 검사).
   */
  muscleSets: Record<MuscleKey, number>
  /**
   * 하한 모드(fallback) 전용. 이 Day의 기록을 어느 정규 Day의 라인으로 남길지.
   *
   * DESIGN.md §8: "fallback 세션의 recordKey는 정규 Day를 따른다 — fallback은 같은
   * 운동의 축소 수행이지 다른 운동이 아님". 문서는 이 규칙만 있고 어느 Day인지 지정하는
   * 필드가 없어서 추가했다. 정규 Day는 자기 자신을 가리키므로 비워둔다.
   */
  recordDayId?: string
  exercises: RoutineExercise[]
}

/** 기록을 남길 Day id. fallback이면 대응하는 정규 Day. */
export function recordDayIdOf(day: RoutineDay): string {
  return day.recordDayId ?? day.id
}

export interface RoutineExercise {
  exerciseId: string // catalog 참조
  group: 'A' | 'B' | 'core'
  /**
   * 이 종목이 기여하는 주 부위.
   * DESIGN.md §4는 Day 단위 muscleSets로 집계하라고 했지만, 세션을 중간에
   * 끊으면 Day 단위 집계는 실제 수행량을 과대계상한다. §7의 "종목→부위 매핑"
   * 요구와 합치기 위해 종목별 부위를 시드에 명시하고, muscleSets는 그 합으로
   * 검증만 한다. (v2.4 전 Day에서 종목 1개 = 부위 1개로 합이 정확히 맞는다)
   */
  muscle: MuscleKey
  sets: number
  repMin: number
  repMax: number
  restSec: number
  plannedOrder: number
  optional: boolean // Day 4의 컬/푸쉬다운 = true
  note: string // "이 날의 1순위. 가장 무겁게"
  weightHint?: string // "Day 1 무게의 60~70%"
}

export interface ReturnProtocolStep {
  gapWeeksMin: number
  weightPct: number
  setPct: number
  targetRIR: number
  rampWeeks: number
}

export interface RoutineRules {
  progressionNote: string // 더블 프로그레션 요약
  weightIncrementKg: number // 2.5
  allowProgressionInPhase0: boolean // true (v2.4)
  deloadEveryPerformedWeeks: number // 8
  deloadMinSessionsPerWeek: number // 3 (이 미만 주는 디로드 카운트 제외)
  lowerBodyMaxGapDays: number // 10 (§4 하체 최소 보장)
  /** 하체 최소 보장 규칙이 감시하는 Day (v2.4에서는 d3) */
  lowerBodyDayId: string
  /** v2.4: 무게는 소폭(−5~−20%), 세트·RIR 중심으로 조절 (§7 근거) */
  returnProtocol: ReturnProtocolStep[]
}

// ─── 종목 카탈로그 ───────────────────────────────────────

export interface Exercise {
  id: string // "incline-chest-press"
  name: string // "인클라인 체스트프레스 머신"
  shortName: string // "인클라인 프레스"
  /**
   * 자극을 어디서 느껴야 하는지 한 줄 요령.
   *
   * `compensationSigns`가 "하지 말 것"이라면 이쪽은 "어떻게 할 것"이다.
   * B그룹은 감각 점수(0~3)를 매기는데, 무엇을 느껴야 하는지 모르면 점수가 무의미해진다.
   */
  cueTip: string
  compensationSigns: string[] // 루틴 문서 12장 보상작용 체크리스트
  /** 자리가 없을 때 쓸 대체 종목 (T8). 없으면 대체 불가 (하체·암 풀다운) */
  substitutes?: SubstituteOption[]
  /**
   * 표시 무게가 **클수록 쉬운** 종목 (어시스티드 풀업의 보조 무게).
   *
   * 증량 방향이 반대다 — 진전은 숫자가 **줄어드는** 것이다. 이 플래그가 없으면
   * 더블 프로그레션이 "+한 단위"를 제안해서 더 쉽게 만들라고 조언한다.
   * 판정은 weightScale.nextWeightForProgression 한 곳에서 갈린다.
   */
  inverseWeight?: boolean
  /**
   * 종목별 템포 예외 (CC5). 없으면 그룹 템포(`tempoFor`)를 쓴다.
   *
   * 레그 컬의 cue가 "수축 지점에서 1초 정지"인데 A그룹 템포에는 정지가 없었다 —
   * **문서 3장 표에 예외 행(1-1-2)이 추가되어** 그것을 담는 자리다.
   * 갈림은 `tempo.tempoPhasesFor` 한 곳에서만 일어난다.
   */
  tempo?: TempoPhaseSeed[]
  /**
   * 맨몸 수행이 정상인 종목 (CC10). 0kg 체크가 실수가 아니다.
   *
   * 오늘 실데이터에서 크런치가 `weight: 0`으로 3세트 체크됐다 — BB6의 "무게 미입력"
   * 힌트가 뜨는 상태이고, 그건 **오탐**이다. 데드버그는 애초에 무게를 얹을 수 없다.
   * `setRowState.zeroWeightHint`가 inverse와 함께 이 플래그를 제외한다.
   */
  allowZeroWeight?: true
  /**
   * 첫 기록 시작 무게 추정 — **체중 대비 비율** (CC13).
   *
   * **검증된 공식이 아니라 코칭 관행 휴리스틱이다** (`SubstituteOption.startFactor`와
   * 같은 표기 수준). 머신 표시 무게는 브랜드·지렛대 구조에 따라 실제 부하가 달라
   * 정밀도가 원리적으로 무의미하고, 본체는 어차피 첫 세트 RIR 3~4 캘리브레이션이다.
   *
   * 값은 **실제보다 가볍게** 잡는다 — 남는 것(올리기)이 부족한 것(내리고 자존심 상하기)
   * 보다 낫고, 문서의 강도 진단 절차와도 맞는다.
   */
  startWeightPctBW?: number
}

/**
 * 시드 JSON에 담기는 템포 페이즈 (CC5).
 *
 * `tempo.ts`의 `TempoPhase`와 같은 모양이지만 타입을 여기 둔다 — `types.ts`가
 * `lib/`를 import하면 의존 방향이 뒤집힌다. 두 타입이 같은 모양임을 테스트가 잠근다.
 */
export interface TempoPhaseSeed {
  kind: 'concentric' | 'squeeze' | 'eccentric' | 'stretch'
  seconds: number
}

/** 대체 종목 후보 (T8) */
export interface SubstituteOption {
  exerciseId: string
  /**
   * 시작 무게 추정 계수. **검증된 공식이 아니라 코칭 관행 휴리스틱이다.**
   * 머신 표시 무게는 브랜드·지렛대 구조에 따라 실제 부하가 달라, 종목 간 하중 전이에
   * 검증된 공식은 원리적으로 존재하지 않는다. 이 값은 첫 세트 시작점일 뿐이고
   * RIR 3~4 캘리브레이션(lib/substitute.ts)이 본체다.
   */
  startFactor?: number
  /** 어시스티드 머신 — 보조 무게는 체중에서 역산한다 (startFactor를 쓰지 않는다) */
  assisted?: boolean
  /** 한쪽 무게로 기록 (덤벨 한 개 / 케이블 한쪽 스택) */
  perSide?: boolean
}

/**
 * 기록 라인 키: `${exerciseId}@${dayId}`
 * 루틴 문서 원칙 "같은 기계라도 무게대와 목적이 다르면 다른 운동" →
 * (종목, Day) 조합별로 기록·프리필·증량판단을 전부 분리한다.
 */
export type RecordKey = string

export function makeRecordKey(exerciseId: string, dayId: string): RecordKey {
  return `${exerciseId}@${dayId}`
}

export function parseRecordKey(key: RecordKey): { exerciseId: string; dayId: string } {
  const at = key.lastIndexOf('@')
  return { exerciseId: key.slice(0, at), dayId: key.slice(at + 1) }
}

// ─── 세션 (기록) ─────────────────────────────────────────

export type SessionMode = 'normal' | 'deload' | 'return'

export interface SetRecord {
  weight: number // kg
  reps: number
  done: boolean
  doneAt?: string
  /**
   * 워밍업 세트 (T7). 볼륨·증량 판정·PR·Phase 조건에서 **제외**된다.
   *
   * 제외는 `derive.doneSets()` 한 곳에서 이뤄진다 — 분석 경로 전부가 그 함수를
   * 거치므로, 새 분석을 추가해도 자동으로 올바르게 동작한다.
   * 화면의 "완료 n세트" 같은 표시는 `doneSetsAll()`을 써서 실제로 한 것을 보여준다.
   */
  warmup?: boolean
}

export interface SessionEntry {
  recordKey: RecordKey // "lat-pulldown@d2"
  plannedOrder: number
  performedOrder: number | null // 첫 세트 입력 시각 순으로 자동 부여
  firstSetAt?: string // 순서 분석용 타임스탬프
  sets: SetRecord[]
  sensoryScore?: 0 | 1 | 2 | 3 // B그룹
  sensoryNote?: string // "가슴 바깥쪽 — 벌릴 때 느낌 옴"
  compensation: string // 기본값 "없음". 비우기 불가(루틴 문서 규칙)
  skipped: boolean
  /**
   * 대체 수행 (T8). **원 종목의 recordKey.**
   *
   * `recordKey`는 대체 종목 자신의 것이라 프리필·증량 판정·PR이 원 종목 라인을
   * 오염시키지 않는다. 반대로 부위 집계·목표 반복수·그룹은 원 종목의 계획을 따라야
   * 하므로 이 값으로 되짚는다 — 해석은 `derive.routineExerciseOfEntry` 한 곳에서 한다.
   * 각 호출부에서 풀면 한 군데만 빠뜨려도 대체한 세트의 볼륨이 조용히 사라진다.
   */
  substituteFor?: RecordKey
  /**
   * 이 세션에 **얹은** 종목 (CC15). 계획에 없던 것이다.
   *
   * 피드백: "그 Day 머신이 다 차 있으면 루틴의 다른 운동이라도 가볍게 하고 싶다."
   * 대체(T8)와 다른 경로다 — 대체는 "이 종목 **대신**", 이것은 "**얹기**".
   *
   * `recordKey`는 **원소속 Day의 라인**이다 (`pec-deck@d1`). 기록 라인 연속성 원칙
   * 그대로여서 프리필·PR·증량 판단이 그 종목의 본 라인에 이어진다.
   *
   * 주간 볼륨은 **정상 산입한다** — 실제로 수행한 자극이고 제안 점수·회복 감쇠도 사실
   * 기반이어야 한다. "몸 풀기 수준이라 빼고 싶다"는 기존 **워밍업 토글**이 세트 단위로
   * 이미 하는 일이다 (`doneSets` 초크포인트가 자동 처리). 새 규칙을 만들지 않는다.
   *
   * 백업은 additive 추가라 `SCHEMA_VERSION`을 올리지 않는다 (필드 추가는 하위 호환 —
   * `backup.ts`의 원칙). 구버전 백업을 복원하면 이 필드가 없고, 그건 "얹은 것 아님"으로
   * 읽혀 정확하다.
   */
  extra?: true
}

export interface CardioRecord {
  type: string
  minutes: number
  note?: string // "마이마운틴 25/3.8"
}

export interface Session {
  id: string // uuid
  date: string // "2026-08-04" (로컬 기준)
  dayId: string // "d1" | ... | "fallback-push" 등
  routineId: string
  mode: SessionMode // 디로드/복귀 주간 표시
  startedAt: string
  endedAt?: string
  entries: SessionEntry[]
  cardio?: CardioRecord
  sessionNote?: string
}

// ─── 설정 ────────────────────────────────────────────────

export type Phase = 0 | 1 | 2 | 3

export interface Settings {
  activeRoutineId: string
  currentPhase: Phase // 수동 전환 (조건 충족은 앱이 표시만)
  /**
   * gistToken은 **이 인터페이스에 없다.** localStorage(lib/secrets.ts)에만 저장한다.
   * Dexie settings에 두면 JSON 백업 덤프(§5.5)에 GitHub PAT가 섞여 나간다.
   * db.setSetting이 런타임에서도 거부한다.
   */
  gistId?: string
  lastBackupAt?: string
  onboardingDone: boolean
  /** 시드 마이그레이션 판단용 — 마지막으로 주입한 시드 리비전 (R2) */
  seededRoutineRevision?: number
  /** Phase별 전환 시각 (T3). Phase가 바뀌면 목표 반복수·볼륨 기준도 바뀌므로 추이 해석에 필요 */
  phaseChangedAt?: Partial<Record<Phase, string>>
  /** 체중 (T8) — 어시스티드 풀업 보조 무게 역산 전용. 추이는 저장하지 않는다 */
  bodyWeightKg?: number
  /** 기본 식단 플랜 (D1). 날짜별 변경은 DietDay.planId가 담당한다 */
  defaultDietPlanId?: string
  /** 마지막으로 주입한 식단 시드 리비전 (D1 — 루틴과 같은 규칙) */
  seededDietRevision?: number
  /** 템포 가이드 사용 (G7). 기본 꺼짐 — 세트 행에 버튼이 늘어나므로 원할 때만 */
  tempoGuide?: boolean
  /** 신호 볼륨 (Z1) — 'normal' | 'loud' | 'max' */
  soundVolume?: string
  /**
   * 마지막으로 고른 단백질원 변형 (DD3 5-b). 키는 `${slotId}.${itemId}`, 값은 변형 인덱스.
   *
   * 사용자는 하나에 꽂히면 오래 먹는다("다리살 한 달 어때?"가 그 증거). 매일 ▾ 2탭은
   * 불필요한 마찰이므로 한 번 고르면 그 뒤로는 슬롯당 1탭이 유지된다.
   * **과거에 소급하지 않는다** — 기록된 `SlotRecord.variantChoices`가 항상 우선한다.
   */
  variantDefaults?: Record<string, number>
}

/**
 * recordKey별 고정 설정 — 머신 세팅 메모(T4)와 무게 단위(T9).
 *
 * 세션 기록이 아니라 **종목에 붙는 고정값**이다. 내보내기 Markdown에는 넣지 않는다 —
 * 세팅값은 분석 대상이 아니고, LLM에 붙여넣는 문서를 길게 만들 이유가 없다.
 * JSON 백업에는 포함한다 (기기를 바꾸면 같이 옮겨져야 한다).
 *
 * Dexie 테이블 이름은 `exerciseNotes`로 남겨둔다 — T4가 이미 스키마 v2로 배포됐고,
 * 이름만 바꾸려면 두 단계 마이그레이션으로 실제 기록을 옮겨야 한다.
 * 얻는 것이 이름뿐이라 사용자 데이터를 건드릴 이유가 되지 않는다.
 */
export interface ExerciseSetting {
  recordKey: RecordKey
  /** 머신 세팅 메모 (T4). "시트 3칸, 등받이 2" */
  note?: string
  /** 균일 핀 간격 (T9). 미설정 시 루틴의 weightIncrementKg */
  weightStepKg?: number
  /** 불규칙 스택의 실제 핀 값 (T9, 오름차순). 있으면 weightStepKg보다 우선 */
  weightLadderKg?: number[]
}

// ─── 식단 (D1) ───────────────────────────────────────────
//
// DESIGN.md §1의 비목적("식단 기록 없음")은 사용자 요구로 **공식 철회**됐다
// (docs/PLAN-DIET.md). 원칙은 그대로다: 입력 마찰 최소화 · 원데이터는 앱,
// 깊은 판단은 LLM 내보내기 · 파생값 비저장.
//
// 앱은 음식의 좋고 나쁨을 판단하지 않는다. 음식 DB·칼로리 검색도 하지 않는다
// (과설계 + 입력 마찰). 대체 기록은 자가 태그 3단만 받는다.

/**
 * 품목의 **교체 가능한 형태** (DD3 — 단백질원 로테이션).
 *
 * 루틴 문서 15장 "단백질원 로테이션" 표(2026-08-06 신설): 닭가슴살 1년 차 물림에 대한
 * 대응이고, 등가 기준은 **단백질**이다. 물림은 이행률 문제이므로 앱이 다뤄야 한다.
 */
export interface DietItemVariant {
  name: string // "닭안심"
  qty: string // "180g"
  kcal: number
  proteinG: number
}

export interface DietItem {
  id: string // "brown-rice"
  name: string // "현미밥"
  qty: string // "1개" | "2팩"
  kcal: number
  /** 단백질 진행이 식단 화면의 **핵심 지표**다 (칼로리는 보조 표기) */
  proteinG: number
  /**
   * 이 품목의 **대체 변형** (DD3). 없으면 형태가 하나뿐이라는 뜻이다.
   *
   * **기본 변형(0번)은 여기 적지 않는다** — 품목 자신(`name`/`qty`/`kcal`/`proteinG`)이
   * 0번이고, `diet.variantsOf()`가 앞에 합성해 준다. 0번을 JSON에 또 적으면 같은 값이
   * 두 곳에 생겨 하나만 고쳤을 때 갈라진다 (이 프로젝트의 결함 A). 그래서 여기에는
   * **대체안만** 들어가고, 점수 가중(`itemWeight`)은 자동으로 기본 변형 기준이 된다.
   */
  variants?: DietItemVariant[]
}

export interface DietSlot {
  id: string // "breakfast" | ... | "pre" | "post"
  name: string // "아침" | "훈련 전"
  timeHint: string // "07:30"
  items: DietItem[]
}

export interface DietPlan {
  id: string // "cut-1800" | "cut-1500"
  name: string // "감량 1,800"
  /**
   * 사람이 읽는 요약. **항목 합계에서 파생시켜 만든다** — 손으로 적으면
   * 항목을 고칠 때 라벨이 남아 화면이 서로 다른 숫자를 말한다.
   * (실제로 계획 문서의 표기와 항목 합계가 15kcal 어긋나 있었다)
   */
  kcalLabel: string
  isDefault?: boolean
  /**
   * 하루 구성 — **매일 같은 5끼** (DD2, 루틴 문서 15장 2026-08-06 개정).
   *
   * 훈련일 6끼/휴식일 5끼 분기가 있었고 그것을 없앴다. 총량·단백질이 완전히 같았고
   * 차이는 쉐이크 배치뿐인데, 그 분기가 앱에서 반복 혼란원이었다 (G3·X4 계열).
   * 옛 플랜의 `restDaySlots`는 타입에서 뺐지만 읽기는 지원한다 (`diet.restDaySlotsOf`).
   */
  slots: DietSlot[]
  /** 시드 리비전 — 루틴과 같은 규칙 (해시 스냅샷 테스트가 강제) */
  seedRevision: number
  /**
   * 대체된 옛 플랜 (DD2). **삭제하지 않고 숨긴다.**
   *
   * 과거 DietDay는 자기 `planId`로 계속 판정되므로 플랜이 사라지면 과거 날의 마크가
   * 전부 바뀐다 — 이 라운드의 인바리언트("과거 판정이 하나도 바뀌지 않는다")가 곧
   * 이 필드의 존재 이유다. 목록(플랜 시트)에서만 빠진다.
   */
  legacy?: true
  /** 이 플랜을 대신하는 새 플랜 id (DD2) — 기본 플랜 설정 이관에 쓴다 */
  supersededBy?: string
}

/**
 * 옛 플랜의 휴식일 구성 (DD2 읽기 하위호환).
 *
 * `DietPlan`에서 `restDaySlots`를 뺐지만 **백업·DB에 남아 있는 플랜에는 있다.**
 * 과거 날짜가 그 플랜으로 판정되므로 읽기는 유지한다 — 해석은 `diet.restDaySlotsOf`
 * 한 곳에서만 한다 (타입 단정을 여러 곳에 흩으면 새 코드가 옛 필드에 의존하기 시작한다).
 */
export interface LegacyRestDayPlan {
  restDaySlots?: DietSlot[]
}

/**
 * 자가 태그. `similar`는 "단백질원이 있었고 튀김·설탕 위주가 아님" —
 * 기준을 입력 시트에 그대로 띄운다 (앱이 판단하지 않으므로 기준은 사용자가 적용한다).
 *
 * 대체와 추가가 **같은 태그 집합**을 쓴다. 이름을 붙여 둬야 표시 문구
 * (`diet.QUALITY_LABEL`)와 점수 상한(`ADDITION_CAP`)이 같은 3값을 두고 갈라지지 않는다.
 */
export type SlotQuality = 'similar' | 'other' | 'cheat'

/** 슬롯 하나의 기록 */
export interface SlotRecord {
  checkedItemIds: string[]
  /**
   * 슬롯 전체/일부를 다른 음식으로 대체한 경우.
   * 일부 체크 + 대체 입력 = "일부 대체" — 별도 상태를 두지 않는다 (데이터가 표현한다).
   */
  substitution?: {
    text: string // "회사 근처 서브웨이 15cm 터키"
    quality: SlotQuality
  }
  /**
   * 계획 외로 **더 먹은** 것 (G2). `substitution`과 별개이고 동시에 존재할 수 있다.
   *
   * 추가 섭취를 대체로 적으면 의미가 오염된다 — "전부 체크 + 대체 텍스트"는 일부 대체로
   * 해석돼 점수가 부당하게 깎이고, LLM 분석에서 결식·대체·과식을 구분할 수 없다.
   *
   * 필드 추가는 하위 호환이므로 백업 SCHEMA_VERSION을 올리지 않는다
   * (파괴적 변경만 상향 — backup.ts 주석의 원칙).
   */
  addition?: {
    text: string
    quality: SlotQuality
  }
  /** 그 끼니 자체를 안 먹음 */
  skipped?: boolean
  /**
   * 품목별 **고른 변형** (DD3). `itemId → variantsOf() 인덱스`. 0/부재 = 기본 변형.
   *
   * 기록에 담는 이유: 마크로가 정직해야 한다. 다리살 200g은 가슴살 2팩보다 +160kcal이고,
   * 그 날의 kcal 합계가 실제로 그렇게 나와야 한다 (낙관적으로 뭉개면 지표가 거짓말을 한다).
   *
   * **기록된 값이 항상 우선한다** — `settings.variantDefaults`는 아직 기록하지 않은 날의
   * 초기 표시에만 쓴다. 그래서 기본값을 바꿔도 과거 날의 판정이 소급되지 않는다.
   * 필드 추가는 하위 호환이라 백업 SCHEMA_VERSION을 올리지 않는다.
   */
  variantChoices?: Record<string, number>
}

/** 하루 기록. `date`가 PK — 하루 하나 */
export interface DietDay {
  date: string // "2026-08-04"
  planId: string
  isTrainingDay: boolean
  /** slotId → 기록. **손 안 댄 슬롯은 키가 없다** (미기록과 0점을 구분하기 위해) */
  slots: Record<string, SlotRecord>
  note?: string
}

/** settings 테이블은 key-value (§3) */
export interface SettingRow {
  key: string
  value: unknown
}

/** 보상작용 빈칸 금지 규칙의 기본값 (루틴 문서) */
export const NO_COMPENSATION = '없음'
