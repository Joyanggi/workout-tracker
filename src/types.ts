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

export interface DietItem {
  id: string // "brown-rice"
  name: string // "현미밥"
  qty: string // "1개" | "2팩"
  kcal: number
  /** 단백질 진행이 식단 화면의 **핵심 지표**다 (칼로리는 보조 표기) */
  proteinG: number
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
  /** 훈련일 구성 (6슬롯) */
  slots: DietSlot[]
  /** 휴식일 구성 (5슬롯 — 훈련 전·직후를 15시 블록으로 통합, 총량 동일) */
  restDaySlots: DietSlot[]
  /** 시드 리비전 — 루틴과 같은 규칙 (해시 스냅샷 테스트가 강제) */
  seedRevision: number
}

/** 슬롯 하나의 기록 */
export interface SlotRecord {
  checkedItemIds: string[]
  /**
   * 슬롯 전체/일부를 다른 음식으로 대체한 경우.
   * 일부 체크 + 대체 입력 = "일부 대체" — 별도 상태를 두지 않는다 (데이터가 표현한다).
   */
  substitution?: {
    text: string // "회사 근처 서브웨이 15cm 터키"
    /**
     * 자가 태그. `similar`는 "단백질원이 있었고 튀김·설탕 위주가 아님" —
     * 기준을 입력 시트에 그대로 띄운다 (앱이 판단하지 않으므로 기준은 사용자가 적용한다).
     */
    quality: 'similar' | 'other' | 'cheat'
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
    quality: 'similar' | 'other' | 'cheat'
  }
  /** 그 끼니 자체를 안 먹음 */
  skipped?: boolean
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
