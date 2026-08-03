import { useState } from 'react'
import { doneSets } from '../lib/derive'
import { compensationEntriesOf } from '../lib/compensationWatch'
import type { RoutineBundle } from '../lib/useRoutine'
import { useSessionStore } from '../store/session'
import { NO_AUTOFILL } from '../lib/inputProps'

const CARDIO_TYPES = ['마이마운틴', '자전거', '트레드밀', '기타']

/**
 * 세션 종료 (DESIGN.md §5.2).
 * 미완료 종목 확인 + 유산소 기록 + 메모를 한 시트에서 처리한다.
 * 단계를 쪼개면 마찰이 늘고, 마찰 최소화가 이 앱의 최우선 기준이다 (§1).
 */
export default function FinishSheet({
  bundle,
  onClose,
  onFinished,
  onDiscarded,
}: {
  bundle: RoutineBundle
  onClose: () => void
  /** 기록을 남기고 종료 → 요약 화면으로 */
  onFinished: () => void
  /**
   * 버리고 종료 → 홈으로.
   * 요약 화면으로 보내면 lastFinished가 없어서 "표시할 세션이 없습니다"가 뜬다.
   * 버린 세션의 요약을 보여줄 것이 애초에 없으므로 경로를 분리한다.
   */
  onDiscarded: () => void
}) {
  const session = useSessionStore((s) => s.session)
  const { finish, setCardio, setNote, discard } = useSessionStore()
  const [cardioType, setCardioType] = useState<string | null>(null)
  const [minutes, setMinutes] = useState('20')
  const [cardioNote, setCardioNote] = useState('')
  const [note, setLocalNote] = useState(session?.sessionNote ?? '')
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  if (!session) return null

  const incomplete = session.entries.filter((e) => !e.skipped && doneSets(e).length === 0)
  const partial = session.entries.filter(
    (e) => !e.skipped && doneSets(e).length > 0 && doneSets(e).length < e.sets.length,
  )
  // 기록 직후에 인지시킨다 (T11) — 다음 세션에 카드를 열 때까지 기다리면
  // "무게가 과했다"는 신호를 판단할 시점이 이미 지나 있다
  const compensated = compensationEntriesOf(session)
  const doneCount = session.entries.reduce((n, e) => n + doneSets(e).length, 0)
  const anyDone = doneCount > 0

  const nameOf = (recordKey: string) => {
    const exerciseId = recordKey.slice(0, recordKey.lastIndexOf('@'))
    return bundle.catalog.get(exerciseId)?.shortName ?? exerciseId
  }

  const submit = async () => {
    if (cardioType) {
      const parsed = Number(minutes)
      setCardio({
        type: cardioType,
        minutes: Number.isFinite(parsed) ? parsed : 0,
        note: cardioNote || undefined,
      })
    }
    setNote(note)
    await finish()
    onFinished()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="세션 종료">
        <div className="sheet-grip" />
        <div className="card-label">세션 종료</div>

        {incomplete.length > 0 && (
          <div className="warn-box">
            <strong>손대지 않은 종목 {incomplete.length}개</strong>
            <br />
            {incomplete.map((e) => nameOf(e.recordKey)).join(', ')}
            <br />
            그대로 종료하면 기록되지 않습니다.
          </div>
        )}
        {partial.length > 0 && (
          <p className="row-sub">
            세트가 남은 종목: {partial.map((e) => `${nameOf(e.recordKey)} ${doneSets(e).length}/${e.sets.length}`).join(' · ')}
          </p>
        )}
        {/* 이번 세션 보상작용 (T11). 루틴 문서 13장 — 보이면 무게가 과한 것 */}
        {compensated.length > 0 && (
          <p className="row-sub">
            보상작용 기록:{' '}
            {compensated.map((c) => `${nameOf(c.recordKey)} — ${c.note}`).join(' · ')}
          </p>
        )}

        <div className="card-label" style={{ marginTop: 16 }}>
          유산소 (선택)
        </div>
        <div className="pill-row">
          {CARDIO_TYPES.map((t) => (
            <button
              key={t}
              className={`pill${cardioType === t ? ' pill-on' : ''}`}
              onClick={() => setCardioType(cardioType === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
        {cardioType && (
          <div className="btn-row" style={{ marginTop: 8 }}>
            <input
              {...NO_AUTOFILL}
              className="field"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-label="유산소 시간(분)"
              placeholder="분"
            />
            <input
              {...NO_AUTOFILL}
              className="field"
              value={cardioNote}
              onChange={(e) => setCardioNote(e.target.value)}
              aria-label="유산소 메모"
              placeholder="25/3.8"
            />
          </div>
        )}

        <div className="card-label" style={{ marginTop: 16 }}>
          메모 (선택)
        </div>
        <textarea
          {...NO_AUTOFILL}
          className="field"
          rows={2}
          value={note}
          onChange={(e) => setLocalNote(e.target.value)}
          placeholder="컨디션, 특이사항"
        />

        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => void submit()}>
          기록 마치기
        </button>
        <div style={{ height: 8 }} />
        <button className="btn" onClick={onClose}>
          계속하기
        </button>

        {/*
          기록이 있어도 버릴 수 있어야 한다. 이전에는 !anyDone 조건이라, 세트를 하나
          체크한 뒤 "잘못된 Day였다"고 깨달으면 버릴 수도 마칠 수도 없는 상태가 됐다.
          (Day 변경은 기록 탭에서 가능하지만 진행 중 세션은 기록 탭에 없다)
          기록이 있을 때는 세트 수를 보여주고 확인을 한 단계 더 받는다.
        */}
        <div style={{ height: 8 }} />
        {confirmDiscard ? (
          <>
            <p className="row-sub" style={{ color: 'var(--danger)' }}>
              {anyDone
                ? `${doneCount}세트 기록이 삭제됩니다. 되돌릴 수 없습니다.`
                : '이 세션을 삭제합니다.'}
            </p>
            <div className="btn-row">
              <button className="btn" onClick={() => setConfirmDiscard(false)}>
                취소
              </button>
              <button className="btn btn-danger" onClick={() => void discard().then(onDiscarded)}>
                정말 버리기
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-danger" onClick={() => setConfirmDiscard(true)}>
            이 세션 버리기
          </button>
        )}
      </div>
    </div>
  )
}
