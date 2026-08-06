import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import DietDayEditor from '../components/DietDayEditor'
import ExerciseCard from '../components/ExerciseCard'
import { db } from '../db'
import { planDayChange } from '../lib/dayChange'
import { formatClock, weekdayKo } from '../lib/dates'
import { doneSets, findDay, strengthDates, totalDoneSets, totalVolume } from '../lib/derive'
import { todayLocal } from '../lib/dates'
import { useDiet } from '../lib/useDiet'
import { useSessionEditor } from '../lib/useSessionEditor'
import { isInverseKey } from '../lib/weightScale'
import type { RoutineBundle } from '../lib/useRoutine'
import { parseRecordKey, type RecordKey } from '../types'
import { NO_AUTOFILL } from '../lib/inputProps'

const CARDIO_TYPES = ['마이마운틴', '자전거', '트레드밀', '기타']

/**
 * 세션 상세 + 편집 (DESIGN.md §5.3).
 * "수행 순서대로 종목 + 세트 기록 + 감각/보상작용. 편집 가능 (당일 입력 실수 보정)"
 */
export default function SessionDetailScreen({
  bundle,
  sessionId,
  onBack,
}: {
  bundle: RoutineBundle
  sessionId: string
  onBack: () => void
}) {
  const editor = useSessionEditor(sessionId)
  const diet = useDiet()
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const [openKey, setOpenKey] = useState<RecordKey | null>(null)
  const [changingDay, setChangingDay] = useState(false)
  const [pendingDayId, setPendingDayId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [minutesText, setMinutesText] = useState<string | null>(null)

  if (editor.loading) return <p className="center-note">불러오는 중…</p>
  if (!editor.session) {
    return (
      <div className="screen">
        <p className="center-note">세션을 찾을 수 없습니다.</p>
        <button className="btn" onClick={onBack}>
          기록으로
        </button>
      </div>
    )
  }

  const { session } = editor
  const day = findDay(bundle.routine, session.dayId)
  const nameOf = (recordKey: string) =>
    bundle.catalog.get(parseRecordKey(recordKey).exerciseId)?.shortName ??
    parseRecordKey(recordKey).exerciseId

  // 수행 순서대로 표시 (§5.3). 수행하지 않은 종목은 계획 순서로 뒤에 붙인다
  const ordered = [...session.entries].sort((a, b) => {
    if (a.performedOrder !== null && b.performedOrder !== null)
      return a.performedOrder - b.performedOrder
    if (a.performedOrder !== null) return -1
    if (b.performedOrder !== null) return 1
    return a.plannedOrder - b.plannedOrder
  })

  const plan = pendingDayId ? planDayChange(session, bundle.routine, pendingDayId) : null
  const allDays = [...bundle.routine.days, ...bundle.routine.fallbackDays]

  return (
    <div className="screen">
      <button className="back-link" onClick={onBack}>
        ‹ 기록
      </button>

      <h1 className="screen-title">{day?.name ?? session.dayId}</h1>
      <p className="screen-sub">
        {session.date} ({weekdayKo(session.date)}) · {formatClock(session.startedAt)}
        {session.endedAt && `–${formatClock(session.endedAt)}`}
        {session.mode !== 'normal' && (
          <span className="chip chip-warn" style={{ marginLeft: 6 }}>
            {session.mode === 'return' ? '복귀' : '디로드'}
          </span>
        )}
      </p>

      <div className="card">
        <div className="stat-grid">
          <div>
            <div className="stat-value">{totalDoneSets(session)}</div>
            <div className="stat-label">완료 세트</div>
          </div>
          <div>
            <div className="stat-value">
              {Math.round(
                totalVolume(session, (rk) => isInverseKey(bundle.catalog, rk)),
              ).toLocaleString()}
            </div>
            <div className="stat-label">총 볼륨</div>
          </div>
          <div>
            <div className="stat-value">
              {session.entries.filter((e) => e.performedOrder !== null).length}
            </div>
            <div className="stat-label">수행 종목</div>
          </div>
        </div>
      </div>

      {ordered.map((entry) => {
        const { exerciseId } = parseRecordKey(entry.recordKey)
        const routineExercise = day?.exercises.find((e) => e.exerciseId === exerciseId)
        const exercise = bundle.catalog.get(exerciseId)
        if (!routineExercise) {
          // Day를 변경해서 이 Day에 없는 종목이 남은 경우 (§11 재매핑). 읽기만 제공한다
          return (
            <div className="ex-card ex-card-orphan" key={entry.recordKey}>
              <div className="ex-head" style={{ cursor: 'default' }}>
                <span className="ex-order">·</span>
                <span className="ex-head-main">
                  <span className="ex-name">{nameOf(entry.recordKey)}</span>
                  <span className="ex-sub">
                    이 Day 구성에 없는 종목 · {doneSets(entry).map((s) => s.reps).join('/')} ·{' '}
                    {doneSets(entry)[0]?.weight ?? 0}kg
                  </span>
                </span>
                <span className="ex-count">{doneSets(entry).length}세트</span>
              </div>
            </div>
          )
        }
        return (
          <ExerciseCard
            key={entry.recordKey}
            entry={entry}
            routineExercise={routineExercise}
            name={exercise?.shortName ?? exerciseId}
            fullName={exercise?.name ?? exerciseId}
            cueTip={exercise?.cueTip}
            compensationSigns={exercise?.compensationSigns ?? []}
            defaultStep={bundle.routine.rules.weightIncrementKg}
            inverseWeight={isInverseKey(bundle.catalog, entry.recordKey)}
            /* 편집 화면도 같은 판정을 받아야 한다 (CC10) — 한쪽만 오탐이 남으면 갈라진다 */
            allowZeroWeight={exercise?.allowZeroWeight === true}
            actions={editor.actions}
            open={openKey === entry.recordKey}
            onToggleOpen={() => setOpenKey(openKey === entry.recordKey ? null : entry.recordKey)}
            showPrefillHints={false}
          />
        )
      })}

      <div className="card">
        <div className="card-label">유산소</div>
        <div className="pill-row">
          {CARDIO_TYPES.map((t) => (
            <button
              key={t}
              className={`pill${session.cardio?.type === t ? ' pill-on' : ''}`}
              onClick={() =>
                editor.setCardio(
                  session.cardio?.type === t
                    ? undefined
                    : { type: t, minutes: session.cardio?.minutes ?? 20, note: session.cardio?.note },
                )
              }
            >
              {t}
            </button>
          ))}
        </div>
        {session.cardio && (
          <div className="btn-row" style={{ marginTop: 8 }}>
            {/*
              문자열 로컬 상태로 받고 blur에서 커밋한다. 값을 직접 파싱하면 지우는 순간
              Number('') → 0이 저장되고, 그 0이 다시 value로 내려와 "0"이 지워지지 않는다.
            */}
            <input
              {...NO_AUTOFILL}
              className="field"
              inputMode="numeric"
              value={minutesText ?? String(session.cardio.minutes)}
              onChange={(e) => setMinutesText(e.target.value)}
              onBlur={() => {
                if (minutesText === null) return
                const parsed = Number(minutesText)
                setMinutesText(null)
                if (Number.isFinite(parsed) && parsed >= 0) {
                  editor.setCardio({ ...session.cardio!, minutes: parsed })
                }
              }}
              aria-label="유산소 시간(분)"
            />
            <input
              {...NO_AUTOFILL}
              className="field"
              value={session.cardio.note ?? ''}
              onChange={(e) => editor.setCardio({ ...session.cardio!, note: e.target.value })}
              aria-label="유산소 메모"
              placeholder="25/3.8"
            />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-label">메모</div>
        <textarea
          {...NO_AUTOFILL}
          className="field"
          rows={2}
          value={session.sessionNote ?? ''}
          onChange={(e) => editor.setNote(e.target.value)}
          placeholder="컨디션, 특이사항"
        />
      </div>

      {/* §11: 잘못된 Day 선택 후 기록 → dayId 변경 + recordKey 재매핑 확인 */}
      <div className="card">
        <div className="card-label">Day 변경</div>
        {!changingDay ? (
          <button className="btn btn-sm" onClick={() => setChangingDay(true)}>
            잘못된 Day로 기록했나요?
          </button>
        ) : !plan ? (
          <>
            <p className="row-sub" style={{ marginBottom: 8 }}>
              이 세션을 어느 Day로 옮길까요? 기록 키(종목@Day)가 함께 재매핑됩니다.
            </p>
            <div className="pill-row">
              {allDays
                .filter((d) => d.id !== session.dayId)
                .map((d) => (
                  <button key={d.id} className="pill" onClick={() => setPendingDayId(d.id)}>
                    {d.name}
                  </button>
                ))}
            </div>
            <div style={{ height: 8 }} />
            <button className="btn btn-sm" onClick={() => setChangingDay(false)}>
              취소
            </button>
          </>
        ) : (
          <>
            <p className="row-sub">
              <strong>{plan.fromDayId} → {plan.toDayId}</strong>
            </p>
            {plan.remapped.length > 0 && (
              <>
                <div className="card-label" style={{ marginTop: 10 }}>
                  기록 키 재매핑 {plan.remapped.length}건
                </div>
                {plan.remapped.map((r) => (
                  <div className="row-sub mono" key={r.from}>
                    {r.from} → {r.to}
                  </div>
                ))}
              </>
            )}
            {plan.unchanged.length > 0 && (
              <p className="row-sub" style={{ marginTop: 10 }}>
                키 유지 {plan.unchanged.length}건 (같은 정규 Day에 기록)
              </p>
            )}
            {plan.kept.length > 0 && (
              <div className="warn-box" style={{ marginTop: 10 }}>
                <strong>{plan.toDayId}에 없는 종목 {plan.kept.length}개</strong>
                <br />
                {plan.kept.map((k) => nameOf(k.from)).join(', ')}
                <br />
                기록은 지우지 않고 원래 키를 유지합니다. 상세에서는 읽기 전용으로 표시됩니다.
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-sm" onClick={() => setPendingDayId(null)}>
                취소
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  editor.changeDay(bundle.routine, plan.toDayId)
                  setPendingDayId(null)
                  setChangingDay(false)
                  setOpenKey(null)
                }}
              >
                변경 적용
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-label">위험 구역</div>
        {confirmDelete ? (
          <>
            <p className="row-sub" style={{ color: 'var(--danger)' }}>
              이 세션 기록이 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="btn-row">
              <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                취소
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => void editor.remove().then(onBack)}
              >
                정말 삭제
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
            이 세션 삭제
          </button>
        )}
      </div>

      {/*
        X1 — 그 **날짜**의 식단 (PLAN-DIET §3이 규정했는데 빠져 있었다).
        세션이 하나뿐인 날은 기록 탭이 이 화면으로 바로 들어오므로, 여기가 없으면
        "식단만 있으면 보이고 운동까지 있으면 운동만 보이는" 상태가 된다.

        **오늘 화면·기록 탭과 같은 편집기를 쓴다** (D3 원칙). 요약만 따로 만들면
        식단 상태를 그리는 코드가 세 벌이 되고, 그게 이 프로젝트의 반복 결함이다.
        DietDayEditor 자체가 상단에 요약(마크·단백질·슬롯 수)을 갖고 있다.

        계획서와 다르게 한 것: "세션 여러 개인 날은 마지막 세션 상세 하단에만" 규칙을
        두지 않았다. 한 번에 한 상세 화면만 보이므로 중복 표시가 생기지 않고, 한쪽에만
        나오면 "왜 여기선 안 보이나"가 된다. 대신 라벨에 날짜를 적어 **세션이 아니라
        그 날짜의 식단**임을 드러낸다.
      */}
      {!diet.loading && diet.plans.length > 0 && (
        <>
          <div className="card-label" style={{ marginTop: 4 }}>
            {session.date} 식단
          </div>
          <DietDayEditor
            date={session.date}
            today={todayLocal()}
            plans={diet.plans}
            days={diet.days}
            defaultPlanId={diet.defaultPlanId}
            variantDefaults={diet.variantDefaults}
            trainedThatDay={strengthDates(sessions).has(session.date)}
          />
        </>
      )}

      <button className="btn" onClick={onBack}>
        기록으로
      </button>
    </div>
  )
}
