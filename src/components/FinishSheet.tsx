import { useState } from 'react'
import { doneSets } from '../lib/derive'
import type { RoutineBundle } from '../lib/useRoutine'
import { useSessionStore } from '../store/session'

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
}: {
  bundle: RoutineBundle
  onClose: () => void
  onFinished: () => void
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
  const anyDone = session.entries.some((e) => doneSets(e).length > 0)

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
              className="field"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-label="유산소 시간(분)"
              placeholder="분"
            />
            <input
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

        {!anyDone && (
          <>
            <div style={{ height: 8 }} />
            {confirmDiscard ? (
              <button
                className="btn btn-danger"
                onClick={() => void discard().then(onFinished)}
              >
                정말 버리기 (기록 없음)
              </button>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmDiscard(true)}>
                이 세션 버리기
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
