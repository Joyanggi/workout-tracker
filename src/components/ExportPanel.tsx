import { useMemo, useState } from 'react'
import { createBackup } from '../lib/backup'
import { addDays, addMonths, monthStart, todayLocal } from '../lib/dates'
import { completedSessions } from '../lib/derive'
import { exportMarkdown, type ExportRange } from '../lib/exportMarkdown'
import { OUTCOME_MESSAGE, copyText, shareFile, shareText } from '../lib/share'
import type { RoutineBundle } from '../lib/useRoutine'
import type { Phase, Session } from '../types'

type PresetId = 'w2' | 'w4' | 'month' | 'm3' | 'all'

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'w2', label: '최근 2주' },
  { id: 'w4', label: '최근 4주' },
  { id: 'month', label: '이번 달' },
  { id: 'm3', label: '최근 3개월' },
  { id: 'all', label: '전체' },
]

function rangeFor(preset: PresetId, today: string, sessions: Session[]): ExportRange {
  const done = completedSessions(sessions)
  const oldest = done.length > 0 ? done[done.length - 1].date : today
  switch (preset) {
    case 'w2':
      return { from: addDays(today, -13), to: today }
    case 'w4':
      return { from: addDays(today, -27), to: today }
    case 'month':
      return { from: monthStart(today), to: today }
    case 'm3':
      return { from: addMonths(today, -3), to: today }
    case 'all':
      return { from: oldest, to: today }
  }
}

/**
 * 내보내기 (DESIGN.md §5.5).
 * Markdown = LLM 분석용, JSON = 전체 백업. 전달은 iOS 공유 시트 우선(§5.5).
 */
export default function ExportPanel({
  bundle,
  sessions,
  phase,
}: {
  bundle: RoutineBundle
  sessions: Session[]
  phase: Phase
}) {
  const [preset, setPreset] = useState<PresetId>('w2')
  const [status, setStatus] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const today = todayLocal()

  const range = useMemo(() => rangeFor(preset, today, sessions), [preset, today, sessions])
  const inRange = useMemo(
    () => completedSessions(sessions).filter((s) => s.date >= range.from && s.date <= range.to),
    [sessions, range],
  )

  const buildMd = () =>
    exportMarkdown({
      sessions,
      routine: bundle.routine,
      catalog: bundle.catalog,
      phase,
      range,
    })

  const onShareMd = async () => {
    const text = buildMd()
    const outcome = await shareText({
      text,
      title: `운동 기록 ${range.from} ~ ${range.to}`,
      filename: `workout-${range.from}_${range.to}.md`,
    })
    setStatus(`Markdown — ${OUTCOME_MESSAGE[outcome]}`)
  }

  const onCopyMd = async () => {
    const ok = await copyText(buildMd())
    setStatus(ok ? 'Markdown — 클립보드에 복사했습니다' : 'Markdown — 복사 실패')
  }

  const onShareJson = async () => {
    const file = await createBackup()
    const outcome = await shareFile({
      filename: `workout-backup-${today}.json`,
      text: JSON.stringify(file, null, 2),
      mimeType: 'application/json',
      title: '운동 기록 백업',
    })
    setStatus(`JSON 백업 — ${OUTCOME_MESSAGE[outcome]}`)
  }

  return (
    <div className="card">
      <div className="card-label">내보내기</div>

      <div className="pill-row">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`pill${preset === p.id ? ' pill-on' : ''}`}
            onClick={() => {
              setPreset(p.id)
              setPreview(null)
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="row-sub" style={{ marginTop: 10 }}>
        {range.from} ~ {range.to} · 세션 {inRange.length}개
      </p>

      <div className="card-label" style={{ marginTop: 16 }}>
        Markdown (LLM 분석용)
      </div>
      <div className="btn-row">
        <button className="btn btn-sm btn-primary" onClick={() => void onShareMd()}>
          공유
        </button>
        <button className="btn btn-sm" onClick={() => void onCopyMd()}>
          복사
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setPreview(preview === null ? buildMd() : null)}
        >
          {preview === null ? '미리보기' : '닫기'}
        </button>
      </div>

      {preview !== null && <pre className="preview">{preview}</pre>}

      <div className="card-label" style={{ marginTop: 16 }}>
        JSON (전체 백업)
      </div>
      <button className="btn btn-sm" onClick={() => void onShareJson()}>
        백업 파일 공유
      </button>
      <p className="row-sub" style={{ marginTop: 8 }}>
        기간과 무관하게 전체를 담습니다. Gist 토큰 같은 비밀값은 포함되지 않습니다.
      </p>

      {status && (
        <p className="row-sub" style={{ marginTop: 10, color: 'var(--accent)' }}>
          {status}
        </p>
      )}
    </div>
  )
}
