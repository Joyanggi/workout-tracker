import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { compensationSummary, hasCompensation } from '../lib/compensation'
import { progressionSuggestions } from '../lib/progression'
import { revertWarning } from '../lib/bGroupGuide'
import { sessionsForRecord } from '../lib/prefill'
import { routineExerciseOfEntry } from '../lib/derive'
import { buildScaleMap, formatProgression, isInverseKey } from '../lib/weightScale'
import { useExerciseSettings } from '../lib/useExerciseSettings'
import { PR_LABEL, detectPrs, topPrPerRecord } from '../lib/pr'
import { formatClock, formatElapsed } from '../lib/dates'
import { doneSets, e1rm, findDay, totalDoneSets, totalVolume } from '../lib/derive'
import type { RoutineBundle } from '../lib/useRoutine'
import { useSessionStore } from '../store/session'
import { useSettings } from '../store/settings'
import { parseRecordKey, type Session } from '../types'

/** 계획 순서 대비 수행 순서가 얼마나 어긋났는지 (§5.2 수행 순서 타임라인) */
function orderDeviations(session: Session) {
  const performed = session.entries
    .filter((e) => e.performedOrder !== null)
    .sort((a, b) => a.performedOrder! - b.performedOrder!)
  const byPlan = [...performed].sort((a, b) => a.plannedOrder - b.plannedOrder)
  return performed.map((entry) => {
    const expected = byPlan.indexOf(entry) + 1
    return { entry, shift: entry.performedOrder! - expected }
  })
}

export default function SummaryScreen({
  bundle,
  onDone,
}: {
  bundle: RoutineBundle
  onDone: () => void
}) {
  const session = useSessionStore((s) => s.lastFinished)
  const phase = useSettings((s) => s.currentPhase)
  const allSessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const exerciseSettings = useExerciseSettings()

  if (!session) {
    return (
      <div className="screen">
        <p className="center-note">표시할 세션이 없습니다.</p>
        <button className="btn" onClick={onDone}>
          홈으로
        </button>
      </div>
    )
  }

  const day = findDay(bundle.routine, session.dayId)
  const elapsed =
    session.endedAt ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() : 0
  /*
    어시스티드(T8)는 볼륨에서 뺀다 — 보조 무게 × 반복은 볼륨이 아니고, 보조를 많이
    받을수록 숫자가 커져 방향이 반대가 된다. 뺐다는 사실을 캡션으로 알린다.
  */
  const isInverse = (rk: string) => isInverseKey(bundle.catalog, rk)
  const volume = totalVolume(session, isInverse)
  const volumeExcluded = session.entries.some(
    (e) => isInverse(e.recordKey) && doneSets(e).length > 0,
  )
  const timeline = orderDeviations(session)

  const nameOf = (recordKey: string) =>
    bundle.catalog.get(parseRecordKey(recordKey).exerciseId)?.shortName ??
    parseRecordKey(recordKey).exerciseId

  // 다음 세션 증량 대상 (§7 더블 프로그레션).
  // 홈 배지(§5.1)와 같은 함수를 쓴다 — 두 화면이 다른 답을 말하면 안 된다.
  const progressed = progressionSuggestions(
    session,
    bundle.routine,
    phase,
    buildScaleMap(exerciseSettings, bundle.routine.rules.weightIncrementKg),
    bundle.catalog,
  ).map((p) => ({ ...p, name: nameOf(p.recordKey) }))

  /*
    B그룹 복귀 경고 (T10, Phase 2+). 루틴 문서 9장의 절대 기준 —
    무게를 올렸는데 감각이 1점 이하로 떨어졌으면 즉시 이전 무게로 돌린다.
    다음 세션 프리필은 이미 자동으로 내려가지만(prefill.bGroup), 이유를 여기서 알려야
    "왜 무게가 내려갔지"가 되지 않는다.
  */
  const reverts = session.entries.flatMap((entry) => {
    const routineExercise = routineExerciseOfEntry(bundle.routine, entry)
    if (!routineExercise) return []
    const warning = revertWarning({
      history: sessionsForRecord(allSessions, entry.recordKey),
      recordKey: entry.recordKey,
      routineExercise,
      phase,
    })
    return warning ? [{ recordKey: entry.recordKey, name: nameOf(entry.recordKey), ...warning }] : []
  })

  // PR (T5). 감량기에는 증량 조건이 잘 안 뜨므로 e1RM·반복 PR이 진전을 보여주는 주 채널이다
  const prs = topPrPerRecord(detectPrs(allSessions, session, isInverse))

  const lowSensory = session.entries.filter(
    (e) => e.sensoryScore !== undefined && e.sensoryScore <= 1 && doneSets(e).length > 0,
  )

  /*
    "최고 세트"는 e1RM 기준이라 어시스티드(T8)에서는 **가장 많이 보조받은 세트**를
    최고로 고른다. 설계 문서 F2 목록에 없던 경로지만 거짓 신호라는 성질이 같고,
    수용 기준("보조를 늘려도 거짓 신호가 없다")에 걸리므로 함께 제외한다.
  */
  const bestSet = session.entries
    .filter((e) => !isInverse(e.recordKey))
    .flatMap((e) => doneSets(e).map((s) => ({ ...s, recordKey: e.recordKey })))
    .sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps))[0]

  return (
    <div className="screen">
      <h1 className="screen-title">수고했어요 🔥</h1>
      <p className="screen-sub">
        {session.date} · {day?.name ?? session.dayId}
      </p>

      <div className="card">
        <div className="stat-grid">
          <div>
            <div className="stat-value">{totalDoneSets(session)}</div>
            <div className="stat-label">완료 세트</div>
          </div>
          <div>
            <div className="stat-value">{Math.round(volume).toLocaleString()}</div>
            <div className="stat-label">
              총 볼륨 (kg·회)
              {volumeExcluded && <span className="row-sub"> · 어시스트 종목 제외</span>}
            </div>
          </div>
          <div>
            <div className="stat-value">{formatElapsed(elapsed)}</div>
            <div className="stat-label">소요 시간</div>
          </div>
        </div>
        {bestSet && (
          <p className="row-sub" style={{ marginTop: 12 }}>
            최고 세트: {nameOf(bestSet.recordKey)} {bestSet.weight}kg × {bestSet.reps}회 (e1RM{' '}
            {e1rm(bestSet.weight, bestSet.reps).toFixed(1)}kg)
          </p>
        )}
      </div>

      {prs.length > 0 && (
        <div className="card">
          <div className="card-label">개인 기록 🎉</div>
          {prs.map((pr) => (
            <div className="row" key={`${pr.recordKey}-${pr.kind}`}>
              <div className="row-main">
                <div className="row-title">
                  {nameOf(pr.recordKey)}
                  <span className="chip chip-accent" style={{ marginLeft: 6 }}>
                    {PR_LABEL[pr.kind]}
                  </span>
                </div>
                <div className="row-sub">
                  {pr.kind === 'reps'
                    ? `${pr.atWeight}kg에서 ${pr.previous}회 → ${pr.value}회`
                    : `${pr.previous} → ${pr.value}${pr.kind === 'weight' ? 'kg' : 'kg (추정)'}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reverts.length > 0 && (
        <div className="card">
          <div className="card-label">감각 저하 — 이전 무게로 복귀</div>
          {reverts.map((r) => (
            <div className="row" key={r.recordKey}>
              <div className="row-main">
                <div className="row-title">{r.name}</div>
                <div className="row-sub">
                  무게를 올린 뒤 감각이 1점 이하 — 문서 9장의 절대 기준입니다
                </div>
              </div>
              <div className="row-meta" style={{ color: 'var(--warn)' }}>
                {r.from} → {r.to}kg
              </div>
            </div>
          ))}
          <p className="row-sub" style={{ marginTop: 8 }}>
            다음 세션 프리필이 자동으로 {reverts.map((r) => `${r.to}kg`).join(' · ')}로 내려갑니다.
          </p>
        </div>
      )}

      {progressed.length > 0 && (
        <div className="card">
          <div className="card-label">다음 세션 증량 제안</div>
          {progressed.map((p) => (
            <div className="row" key={p.recordKey}>
              <div className="row-main">
                <div className="row-title">{p.name}</div>
                <div className="row-sub">모든 세트 상단 도달 · 보상작용 없음</div>
              </div>
              <div className="row-meta" style={{ color: 'var(--accent)' }}>
                {formatProgression(p.from, p.to, p.inverse)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-label">수행 순서</div>
        {timeline.length === 0 && <p className="row-sub">체크된 세트가 없습니다.</p>}
        {timeline.map(({ entry, shift }) => (
          <div className="row" key={entry.recordKey}>
            <div className="row-main">
              <div className="row-title">
                {entry.performedOrder}. {nameOf(entry.recordKey)}
                {shift < 0 && (
                  <span className="chip chip-accent" style={{ marginLeft: 6 }}>
                    {-shift}칸 앞당김
                  </span>
                )}
                {shift > 0 && (
                  <span className="chip" style={{ marginLeft: 6 }}>
                    {shift}칸 미룸
                  </span>
                )}
              </div>
              <div className="row-sub">
                {doneSets(entry).map((s) => s.reps).join(' / ')} · {doneSets(entry)[0]?.weight}kg
                {entry.sensoryScore !== undefined && ` · 감각 ${entry.sensoryScore}점`}
                {hasCompensation(entry.compensation) && ` · ${compensationSummary(entry.compensation)}`}
              </div>
            </div>
            <div className="row-meta">{entry.firstSetAt ? formatClock(entry.firstSetAt) : ''}</div>
          </div>
        ))}
      </div>

      {/* 감각 0~1점이 반복되는 종목은 자극이 목표 부위에 안 가고 있다는 신호 (§5.4) */}
      {lowSensory.length > 0 && (
        <div className="card">
          <div className="card-label">감각이 약했던 종목</div>
          {lowSensory.map((entry) => (
            <div className="row" key={entry.recordKey}>
              <div className="row-main">
                <div className="row-title">{nameOf(entry.recordKey)}</div>
                <div className="row-sub">{entry.sensoryNote || '메모 없음'}</div>
              </div>
              <div className="row-meta" style={{ color: 'var(--warn)' }}>
                {entry.sensoryScore}점
              </div>
            </div>
          ))}
          <p className="row-sub" style={{ marginTop: 8 }}>
            같은 종목이 계속 낮으면 무게·자세·기계를 바꿔볼 신호입니다.
          </p>
        </div>
      )}

      {(session.cardio || session.sessionNote) && (
        <div className="card">
          {session.cardio && (
            <div className="row">
              <div className="row-main">
                <div className="row-title">유산소</div>
                <div className="row-sub">{session.cardio.note ?? ''}</div>
              </div>
              <div className="row-meta">
                {session.cardio.type} {session.cardio.minutes}분
              </div>
            </div>
          )}
          {session.sessionNote && (
            <div className="row">
              <div className="row-main">
                <div className="row-title" style={{ whiteSpace: 'normal' }}>
                  {session.sessionNote}
                </div>
                <div className="row-sub">메모</div>
              </div>
            </div>
          )}
        </div>
      )}

      <button className="btn btn-primary" onClick={onDone}>
        홈으로
      </button>
    </div>
  )
}
