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
  exercises: RoutineExercise[]
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
  compensationSigns: string[] // 루틴 문서 12장 보상작용 체크리스트
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
  gistToken?: string // PAT (gist scope) — localStorage에만 저장, Dexie에는 넣지 않는다
  gistId?: string
  lastBackupAt?: string
  onboardingDone: boolean
  /** 시드 마이그레이션 판단용 — 마지막으로 주입한 시드 버전 */
  seededRoutineVersion?: string
}

/** settings 테이블은 key-value (§3) */
export interface SettingRow {
  key: string
  value: unknown
}

/** 보상작용 빈칸 금지 규칙의 기본값 (루틴 문서) */
export const NO_COMPENSATION = '없음'
