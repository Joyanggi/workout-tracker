import { useEffect, useState } from 'react'
import CompensationSheet from './CompensationSheet'
import NumberStepper from './NumberStepper'
import WeightScaleSheet from './WeightScaleSheet'
import { getExerciseSetting, setExerciseNote, setExerciseWeightScale } from '../db'
import { describeScale, type WeightScale } from '../lib/weightScale'
import { CALIBRATION_RIR, calibratedWeight } from '../lib/substitute'
import CompensationWatchSheet from './CompensationWatchSheet'
import TempoGuideSheet from './TempoGuideSheet'
import type { CompensationWatch } from '../lib/compensationWatch'
import { compensationSummary, hasCompensation } from '../lib/compensation'
import { doneSetsAll } from '../lib/derive'
import type { RecordPrefill } from '../lib/prefill'
import type { RecordKey, RoutineExercise, SessionEntry, SetRecord } from '../types'
import { AUTOFILL_UNKNOWN_TOKEN, NO_AUTOFILL } from '../lib/inputProps'

/** 감각 점수 라벨 (루틴 문서: 목표 부위에 자극이 왔는지) */
const SENSORY_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: '안 느껴짐',
  1: '약함',
  2: '보통',
  3: '확실',
}

/**
 * 세션 화면(§5.2)과 기록 편집(§5.3)이 공유하는 운동 카드.
 *
 * store를 직접 읽지 않고 actions를 받는다 — 진행 중 세션은 useSessionStore가,
 * 과거 세션 편집은 useSessionEditor가 같은 인터페이스를 제공한다.
 * 두 화면의 입력 UI가 갈라지면 "헬스장에서 익힌 조작"이 편집 화면에서 안 통한다.
 */
export interface EntryActions {
  patchSet: (recordKey: RecordKey, index: number, patch: Partial<SetRecord>) => void
  toggleDone: (recordKey: RecordKey, index: number) => void
  addSet: (recordKey: RecordKey, opts?: { warmup?: boolean }) => void
  removeSet: (recordKey: RecordKey, index: number) => void
  setSkipped: (recordKey: RecordKey, skipped: boolean) => void
  setSensoryScore: (recordKey: RecordKey, score: 0 | 1 | 2 | 3) => void
  setSensoryNote: (recordKey: RecordKey, note: string) => void
  setCompensation: (recordKey: RecordKey, value: string) => void
}

function ghostText(prefill: RecordPrefill | undefined, index: number): string {
  if (!prefill) return ''
  const parts: string[] = []
  const last = prefill.lastSets[index]
  if (last) parts.push(`지난 ${last.weight}×${last.reps}`)
  const best = prefill.bestBySet[index]
  if (best && (!last || best.weight !== last.weight || best.reps !== last.reps)) {
    parts.push(`최고 ${best.weight}×${best.reps}`)
  }
  return parts.join(' · ')
}

export default function ExerciseCard({
  entry,
  routineExercise,
  name,
  fullName,
  cueTip,
  compensationSigns,
  prefill,
  defaultStep,
  substituteForName,
  inverseWeight = false,
  onRequestSubstitute,
  compensationWatch,
  tempoGuide = false,
  actions,
  open,
  onToggleOpen,
  onSetChecked,
  /** 편집 모드에서는 "지난 기록" 고스트와 증량 칩을 숨긴다 (과거 세션 기준이 아니라 혼란만 준다) */
  showPrefillHints = true,
  /**
   * 디로드·복귀 세션에서는 증량 칩을 숨긴다.
   * 프리필 무게가 이미 증량을 무시하는데(defaultSetFor) 칩만 "+2.5kg 제안"이라고
   * 뜨면 화면이 서로 다른 말을 한다.
   */
  showProgression = true,
}: {
  entry: SessionEntry
  routineExercise: RoutineExercise
  name: string
  fullName: string
  cueTip?: string
  compensationSigns: string[]
  prefill?: RecordPrefill
  /** 무게 단위 기본값 = 루틴의 weightIncrementKg. 종목별 설정(T9)이 이 값을 덮는다 */
  defaultStep: number
  /** 대체 수행 중이면 원 종목 이름 (T8) */
  substituteForName?: string
  /** 표시 무게가 클수록 쉬운 종목 (T8 어시스티드). 하향 제안 방향이 반대다 */
  inverseWeight?: boolean
  /** 대체 요청 (T8). 넘기지 않으면 버튼이 안 보인다 — 과거 세션 편집에는 의미가 없다 */
  onRequestSubstitute?: () => void
  /** 반복 보상작용 경고 (T11). 과거 세션 편집에서는 넘기지 않는다 */
  compensationWatch?: CompensationWatch
  /** 템포 가이드 사용 (G7). 꺼져 있으면 세트 행에 버튼이 없다 */
  tempoGuide?: boolean
  actions: EntryActions
  open: boolean
  onToggleOpen: () => void
  onSetChecked?: (routineExercise: RoutineExercise) => void
  showPrefillHints?: boolean
  showProgression?: boolean
}) {
  const [editingCompensation, setEditingCompensation] = useState(false)
  // 종목별 고정 설정 — 세팅 메모(T4) + 무게 단위(T9).
  // recordKey에 붙는 값이라 세션 상태와 별도로 읽고 쓴다. 한 행이므로 한 번만 읽는다.
  const [setupNote, setSetupNote] = useState<string | null>(null)
  const [editingSetup, setEditingSetup] = useState(false)
  const [scaleRow, setScaleRow] = useState<{
    weightStepKg?: number
    weightLadderKg?: number[]
  }>({})
  const [editingScale, setEditingScale] = useState(false)
  const [showingWatch, setShowingWatch] = useState(false)
  /** 템포 가이드를 띄운 세트 인덱스 (G7) */
  const [guideSet, setGuideSet] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void getExerciseSetting(entry.recordKey).then((row) => {
      if (cancelled) return
      setSetupNote(row?.note ?? '')
      setScaleRow({ weightStepKg: row?.weightStepKg, weightLadderKg: row?.weightLadderKg })
    })
    return () => {
      cancelled = true
    }
  }, [entry.recordKey])

  const weightScale: WeightScale = {
    step: scaleRow.weightStepKg ?? defaultStep,
    ...(scaleRow.weightLadderKg?.length ? { ladder: scaleRow.weightLadderKg } : {}),
    // 설정 행이 없는 종목도 inverse를 잃지 않도록 카탈로그 값을 여기서 합친다
    ...(inverseWeight ? { inverse: true } : {}),
  }
  const scaleIsCustom = scaleRow.weightStepKg !== undefined || !!scaleRow.weightLadderKg?.length
  const done = doneSetsAll(entry)
  const complete = done.length >= entry.sets.length
  const isB = routineExercise.group === 'B'

  /*
    대체운동 캘리브레이션 (T8).
    처음 하는 대체 종목(prefill.best 없음)은 시작 무게가 검증되지 않은 계수 추정이다.
    첫 세트를 RIR 3~4로 수행한 실측에서 e1RM을 역산해 남은 세트 무게를 다시 계산한다 —
    2세트부터는 추정이 아니라 그날의 실제 능력이 기준이 된다.
    자동으로 바꾸지 않는다: "앱은 판단을 대신하지 않고 제안만 한다"(§1).
  */
  const firstExposure = Boolean(entry.substituteFor) && !prefill?.best
  const firstWork = entry.sets.find((set) => !set.warmup)
  const pending = entry.sets
    .map((set, i) => ({ set, i }))
    .filter(({ set }) => !set.done && !set.warmup)
  const calibrated =
    firstExposure && firstWork?.done && firstWork.reps > 0
      ? calibratedWeight({
          firstSetWeight: firstWork.weight,
          firstSetReps: firstWork.reps,
          targetReps: routineExercise.repMax,
        })
      : undefined
  const showCalibration =
    calibrated !== undefined && pending.some(({ set }) => set.weight !== calibrated)

  // 세트 표시 라벨: 워밍업은 'W', 작업 세트는 1부터
  let workCount = 0
  const setLabels = entry.sets.map((set) => (set.warmup ? 'W' : String((workCount += 1))))

  const summary = showPrefillHints
    ? prefill?.lastSets.length
      ? `지난번 ${prefill.lastSets[0].weight}kg ${prefill.lastSets.map((s) => s.reps).join('/')}`
      : '첫 기록'
    : done.length > 0
      ? `${done[0].weight}kg ${done.map((s) => s.reps).join('/')}`
      : '기록 없음'

  const onCheck = (index: number, wasDone: boolean) => {
    actions.toggleDone(entry.recordKey, index)
    if (!wasDone) onSetChecked?.(routineExercise)
  }

  return (
    <div
      className={`ex-card${complete ? ' ex-card-done' : ''}${entry.skipped ? ' ex-card-skipped' : ''}`}
    >
      <button className="ex-head" onClick={onToggleOpen} aria-expanded={open}>
        <span className="ex-order" aria-hidden="true">
          {routineExercise.plannedOrder}
        </span>
        <span className="ex-head-main">
          <span className="ex-name">
            {name}
            {substituteForName && (
              <span className="chip chip-warn" style={{ marginLeft: 6 }}>
                대체
              </span>
            )}
            {entry.performedOrder !== null && (
              <span className="chip" style={{ marginLeft: 6 }}>
                {entry.performedOrder}번째 수행
              </span>
            )}
          </span>
          <span className="ex-sub">
            {entry.sets.length}세트 × {routineExercise.repMin}~{routineExercise.repMax} · {summary}
          </span>
          {substituteForName && <span className="ex-sub">{substituteForName} 대신 · 자리 없음</span>}
          {(isB && entry.sensoryScore !== undefined) || hasCompensation(entry.compensation) ? (
            <span className="ex-sub">
              {isB && entry.sensoryScore !== undefined && (
                <span className="chip chip-accent">감각 {entry.sensoryScore}</span>
              )}
              {hasCompensation(entry.compensation) && (
                <span className="chip chip-warn" style={{ marginLeft: 4 }}>
                  {compensationSummary(entry.compensation)}
                </span>
              )}
            </span>
          ) : null}
        </span>
        <span className={`ex-count${complete ? ' ex-count-done' : ''}`}>
          {entry.skipped ? '스킵' : `${done.length}/${entry.sets.length}`}
        </span>
      </button>

      {open && (
        <div className="ex-body">
          {routineExercise.note && <p className="ex-note">{routineExercise.note}</p>}
          {routineExercise.weightHint && (
            <p className="ex-note">무게 기준: {routineExercise.weightHint}</p>
          )}
          {/*
            자극 요령. 접지 않고 항상 노출한다 — B그룹은 감각 점수를 매겨야 하는데
            무엇을 느껴야 하는지 모르면 점수 자체가 무의미해진다.
          */}
          {cueTip && <p className="ex-cue">💡 {cueTip}</p>}

          {/*
            머신 세팅 메모 (T4). 세션 기록이 아니라 종목에 붙는 고정값이라,
            다음 세션에도 같은 값이 그대로 보인다 — 매번 세팅을 다시 찾지 않는 것이 목적이다.
          */}
          <div className="setting-rows">
          {editingSetup ? (
            <div className="setup-edit">
              <input
                {...NO_AUTOFILL}
                /*
                  X5 종결 — **iOS 연락처 제안은 웹으로 막을 수 없다** (README Limitations).
                  실험대 6칸(대조군 포함)에서 전부 제안이 떴고, 마지막 카드였던
                  "readOnly로 열고 포커스 시 해제"도 지웠다: 해제가 한 macrotask 뒤라
                  readOnly 창이 사실상 0이어서 기대 이익이 거의 없는데, 그 경로에
                  "필드가 영구히 readOnly로 남아 입력 불가"라는 실패 모드가 있었다.
                  운동 중 유일하게 타이핑하는 필드에 그 위험을 남길 값이 없다.

                  비표준 토큰은 남겨 둔다 — 실험대에서 이것도 무효로 나왔으니 지워도
                  되지만, 그 판단은 이 수정의 범위가 아니다 (한 단어면 빠진다).
                */
                autoComplete={AUTOFILL_UNKNOWN_TOKEN}
                className="field"
                value={setupNote ?? ''}
                onChange={(e) => setSetupNote(e.target.value)}
                placeholder="예: 시트 3칸, 등받이 2"
                aria-label={`${name} 머신 세팅 메모`}
                autoFocus
              />
              <button
                className="btn btn-sm"
                onClick={() => {
                  void setExerciseNote(entry.recordKey, setupNote ?? '')
                  setEditingSetup(false)
                }}
              >
                저장
              </button>
            </div>
          ) : (
            <button className="setup-row" onClick={() => setEditingSetup(true)}>
              <span aria-hidden="true">🔧</span>
              <span className={setupNote ? 'setup-value' : 'setup-empty'}>
                {setupNote || '머신 세팅 메모 추가'}
              </span>
              <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>
                ✎
              </span>
            </button>
          )}

          {/*
            무게 단위 (T9). 루틴 문서 10장의 증량은 "머신 한 핀"인데 한 핀이 몇 kg인지는
            머신마다 다르다. 미설정 종목은 루틴 전역값이라 표시를 흐리게 둔다.
          */}
          <button className="setup-row" onClick={() => setEditingScale(true)}>
            <span aria-hidden="true">⚖</span>
            <span className={scaleIsCustom ? 'setup-value' : 'setup-empty'}>
              무게 단위 · {describeScale(weightScale)}
            </span>
            <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>
              ✎
            </span>
          </button>
          </div>
          <div className="ex-chips">
            <span className="chip">{routineExercise.group}그룹</span>
            <span className="chip">휴식 {routineExercise.restSec}초</span>
            {routineExercise.optional && <span className="chip chip-warn">컨디션 좋을 때만</span>}
            {/*
              B그룹 무게 회복/복귀 (T10, Phase 2+). 복귀는 프리필이 이미 내려간 상태이므로
              칩은 "왜 내려갔는지"를 설명하는 역할이다.
            */}
            {prefill?.bGroup?.kind === 'recover' && (
              <span className="chip chip-accent">
                감각 3점 유지 + 상단 도달 — 무게 회복 시도 가능
              </span>
            )}
            {prefill?.bGroup?.kind === 'revert' && (
              <span className="chip chip-warn">
                감각 {1}점 이하 — {prefill.bGroup.from} → {prefill.bGroup.to}kg 복귀 (문서 9장)
              </span>
            )}
            {compensationWatch && (
              <button className="chip chip-warn chip-tap" onClick={() => setShowingWatch(true)}>
                보상작용 {compensationWatch.count}/{3}회 — 무게 하향 검토 ▸
              </button>
            )}
            {firstExposure && !firstWork?.done && (
              <span className="chip chip-warn">첫 세트는 {CALIBRATION_RIR}로</span>
            )}
            {showPrefillHints && showProgression && prefill?.progression && (
              <span className="chip chip-accent">
                증량 제안 {prefill.progression.from} → {prefill.progression.to}kg
              </span>
            )}
          </div>

          <div className="set-head">
            <span>세트</span>
            <span>무게 (kg)</span>
            <span>횟수</span>
          </div>

          {/*
            워밍업은 번호를 받지 않는다(W) — 작업 세트가 1부터 시작해야 계획 세트 수와 맞는다.
            라벨을 미리 계산해 map 안에서 누적 변수를 쓰지 않는다.
          */}
          {setLabels.map((label, i) => {
            const set = entry.sets[i]
            return (
            /*
              체크 버튼을 고스트 줄로 올려 입력 행을 전폭으로 쓴다.
              §9는 숫자 24px+와 터치 타깃 44pt를 동시에 요구하는데, 한 줄에 [스테퍼][스테퍼][체크]를
              넣으면 375px에서 숫자 자리가 32px밖에 안 남아 24px 폰트의 "42.5"가 잘린다.
              무게는 4자("42.5"), 횟수는 2자라 1.3:1로 배분한다.
            */
            /*
              key={i}는 **세트를 끝에서만 제거**하는 현재 UI에서만 안전하다.
              중간 제거를 추가하면 NumberStepper의 편집 중 로컬 상태가 옆 세트로 옮겨 붙는다.
              그때는 SetRecord에 id를 추가해야 한다 (persist되는 타입이라 백업 스키마도 함께).
            */
            <div className={`set-row${set.warmup ? ' set-row-warmup' : ''}`} key={i}>
              <div className="set-no">{label}</div>
              <div className="set-meta">
                <span className="set-ghost">
                  {showPrefillHints ? ghostText(prefill, i) || '기준 기록 없음' : ''}
                </span>
                {/* 템포 가이드 (G7). 기본 꺼짐이라 켠 사람만 이 버튼을 본다 */}
                {tempoGuide && (
                  <button
                    className="set-tempo"
                    onClick={() => setGuideSet(i)}
                    aria-label={`${i + 1}세트 템포 가이드`}
                  >
                    ♩
                  </button>
                )}
                <button
                  className={`set-check${set.done ? ' set-check-on' : ''}`}
                  onClick={() => onCheck(i, set.done)}
                  aria-pressed={set.done}
                  aria-label={`${i + 1}세트 완료`}
                >
                  ✓
                </button>
              </div>
              <div className="set-inputs">
                <div className="stepper-slot stepper-slot-wide">
                  <NumberStepper
                    value={set.weight}
                    step={weightScale.step}
                    ladder={weightScale.ladder}
                    max={500}
                    onChange={(weight) => actions.patchSet(entry.recordKey, i, { weight })}
                    ariaLabel={`${name} ${i + 1}세트 무게`}
                    decimals={2}
                  />
                </div>
                <div className="stepper-slot">
                  <NumberStepper
                    value={set.reps}
                    step={1}
                    max={100}
                    onChange={(reps) => actions.patchSet(entry.recordKey, i, { reps })}
                    ariaLabel={`${name} ${i + 1}세트 횟수`}
                    decimals={0}
                  />
                </div>
              </div>
            </div>
            )
          })}

          {showCalibration && (
            <button
              className="btn btn-sm btn-warn"
              style={{ marginTop: 10 }}
              onClick={() =>
                pending.forEach(({ i }) =>
                  actions.patchSet(entry.recordKey, i, { weight: calibrated }),
                )
              }
            >
              첫 세트 결과로 남은 세트 {calibrated}kg 적용
            </button>
          )}

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => actions.addSet(entry.recordKey)}>
              + 세트
            </button>
            {/*
              워밍업 세트 (T7). 볼륨·증량·PR에서 제외된다.
              계획서는 "+ 세트" 롱프레스를 제안했지만 롱프레스는 어포던스가 없어 존재를
              모르게 된다. 작은 버튼으로 두되 앞에 내세우지 않는다.
            */}
            <button
              className="btn btn-sm"
              onClick={() => actions.addSet(entry.recordKey, { warmup: true })}
              aria-label="워밍업 세트 추가"
            >
              워밍업
            </button>
            {entry.sets.length > 1 && (
              <button
                className="btn btn-sm"
                onClick={() => actions.removeSet(entry.recordKey, entry.sets.length - 1)}
              >
                − 세트
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => actions.setSkipped(entry.recordKey, !entry.skipped)}
            >
              {entry.skipped ? '스킵 해제' : '스킵'}
            </button>
            {/*
              교체는 세트를 새로 만들므로 이미 체크한 기록이 사라진다. applySubstitute가
              거부하지만 누를 수 있는 버튼을 두면 "왜 안 되지"가 된다 — 아예 감춘다.
            */}
            {onRequestSubstitute && done.length === 0 && (
              /*
                X8 — 라벨을 "대체"로 줄였다. "자리 없음 · 대체"가 375px에서 줄바꿈됐고,
                줄바꿈된 버튼은 세트 행 높이를 흔들어 옆 버튼들의 탭 위치를 밀어낸다.
                시트를 열면 "머신이 사용 중일 때" 설명이 나오므로 라벨에 사유까지 담지 않는다.
              */
              <button
                className="btn btn-sm"
                onClick={onRequestSubstitute}
                aria-label="자리 없음 — 대체운동 고르기"
              >
                대체
              </button>
            )}
          </div>

          {/* B그룹 감각 점수 (§5.2). 목표 부위에 자극이 왔는지 — "계속 0인 종목" 탐지용 */}
          {isB && (
            <div className="sub-field">
              <div className="card-label">감각 점수</div>
              <div className="segment">
                {([0, 1, 2, 3] as const).map((score) => (
                  <button
                    key={score}
                    aria-pressed={entry.sensoryScore === score}
                    onClick={() => actions.setSensoryScore(entry.recordKey, score)}
                  >
                    {score}
                  </button>
                ))}
              </div>
              <p className="row-sub">
                {entry.sensoryScore === undefined
                  ? '미입력 — 목표 부위에 자극이 왔는지'
                  : SENSORY_LABELS[entry.sensoryScore]}
              </p>
              <input
                {...NO_AUTOFILL}
                className="field"
                value={entry.sensoryNote ?? ''}
                onChange={(e) => actions.setSensoryNote(entry.recordKey, e.target.value)}
                placeholder="어디에 어떻게 느껴졌는지 (선택)"
                aria-label={`${name} 감각 메모`}
              />
            </div>
          )}

          {/* 보상작용 — 기본값 "없음". 빈칸으로 둘 수 없다 (루틴 문서 규칙) */}
          <div className="sub-field">
            <div className="card-label">보상작용</div>
            <button
              className={`btn btn-sm${hasCompensation(entry.compensation) ? ' btn-warn' : ''}`}
              onClick={() => setEditingCompensation(true)}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ textAlign: 'left' }}>{entry.compensation}</span>
              <span aria-hidden="true">▸</span>
            </button>
          </div>
        </div>
      )}

      {guideSet !== null && (
        <TempoGuideSheet
          exerciseName={name}
          setNumber={guideSet + 1}
          routineExercise={routineExercise}
          onDone={(reps) => {
            // 0회면 기록을 건드리지 않는다 (카운트인 중 취소한 경우)
            if (reps > 0) actions.patchSet(entry.recordKey, guideSet, { reps })
          }}
          onComplete={(reps) => {
            /*
             * 상단 도달 자동 종료 (W3) — 탭 0회로 기록·체크·휴식까지 간다.
             * `onCheck`를 쓰는 이유: 세트 체크 → 휴식 타이머 자동 시작이 그 경로에 있다.
             * 이미 체크된 세트라면 다시 부르지 않는다 (토글이라 풀려 버린다).
             */
            actions.patchSet(entry.recordKey, guideSet, { reps })
            if (!entry.sets[guideSet]?.done) onCheck(guideSet, false)
          }}
          onClose={() => setGuideSet(null)}
        />
      )}

      {showingWatch && compensationWatch && (
        <CompensationWatchSheet
          exerciseName={fullName}
          watch={compensationWatch}
          scale={weightScale}
          currentWeight={pending[0]?.set.weight ?? entry.sets[0]?.weight ?? 0}
          onApply={(weight) =>
            pending.forEach(({ i }) => actions.patchSet(entry.recordKey, i, { weight }))
          }
          onClose={() => setShowingWatch(false)}
        />
      )}

      {editingScale && (
        <WeightScaleSheet
          exerciseName={fullName}
          defaultStep={defaultStep}
          current={scaleRow}
          onSave={(next) => {
            setScaleRow(next)
            void setExerciseWeightScale(entry.recordKey, next)
          }}
          onClose={() => setEditingScale(false)}
        />
      )}

      {editingCompensation && (
        <CompensationSheet
          exerciseName={fullName}
          signs={compensationSigns}
          current={entry.compensation}
          onSave={(next) => actions.setCompensation(entry.recordKey, next)}
          onClose={() => setEditingCompensation(false)}
        />
      )}
    </div>
  )
}
