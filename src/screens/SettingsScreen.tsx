import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import ExportPanel from '../components/ExportPanel'
import GistPanel from '../components/GistPanel'
import ImportPanel from '../components/ImportPanel'
import RoutineIoPanel from '../components/RoutineIoPanel'
import { db } from '../db'
import type { SeedResult } from '../db/seed'
import { dayTotalSets, exerciseLabel, useRoutine } from '../lib/useRoutine'
import { isStandalone } from '../lib/platform'
import { useSettings } from '../store/settings'
import type { Phase } from '../types'

const PHASES: { value: Phase; label: string; desc: string }[] = [
  { value: 0, label: '0', desc: '습관 형성 — 주 3회 × 8주 연속' },
  { value: 1, label: '1', desc: '기본 볼륨 정착' },
  { value: 2, label: '2', desc: '강도 확장' },
  { value: 3, label: '3', desc: '피지크 마감' },
]

export default function SettingsScreen({ seed }: { seed: SeedResult }) {
  const bundle = useRoutine()
  const { currentPhase, setPhase, setOnboardingDone } = useSettings()
  const sessionCount = useLiveQuery(() => db.sessions.count(), [], 0)
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const [openDayId, setOpenDayId] = useState<string | null>(null)
  const [resetStep, setResetStep] = useState(0)
  const [quota, setQuota] = useState<string | null>(null)

  useEffect(() => {
    void navigator.storage?.estimate?.().then((est) => {
      if (est.usage === undefined) return
      const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`
      setQuota(est.quota ? `${mb(est.usage)} / ${mb(est.quota)}` : mb(est.usage))
    })
  }, [])

  const resetAll = async () => {
    await db.delete()
    window.location.reload()
  }

  return (
    <div className="screen">
      <h1 className="screen-title">설정</h1>
      <p className="screen-sub">v1 · 마일스톤 7</p>

      {seed.problems.length > 0 && (
        <div className="banner banner-danger">
          <span>
            루틴 시드 정합성 문제 {seed.problems.length}건 — 아래 “진단”에서 확인하세요.
          </span>
        </div>
      )}

      <div className="card">
        <div className="card-label">Phase (수동 전환)</div>
        <div className="segment">
          {PHASES.map((p) => (
            <button
              key={p.value}
              aria-pressed={currentPhase === p.value}
              onClick={() => void setPhase(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="row-sub" style={{ marginTop: 10 }}>
          {PHASES.find((p) => p.value === currentPhase)?.desc}
        </p>
        <p className="row-sub">
          Phase 0에서도 더블 프로그레션 증량을 허용합니다 (v2.4 규칙).
        </p>
      </div>

      <div className="card">
        <div className="card-label">활성 루틴</div>
        {bundle ? (
          <>
            <div className="row">
              <div className="row-main">
                <div className="row-title">{bundle.routine.name}</div>
                <div className="row-sub">{bundle.routine.id}</div>
              </div>
              <div className="row-meta">v{bundle.routine.version}</div>
            </div>
            {[...bundle.routine.days, ...bundle.routine.fallbackDays].map((day) => (
              <div key={day.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <button
                  className="row"
                  style={{ width: '100%', textAlign: 'left', borderBottom: 'none' }}
                  onClick={() => setOpenDayId(openDayId === day.id ? null : day.id)}
                >
                  <div className="row-main">
                    <div className="row-title">{day.name}</div>
                    <div className="row-sub">
                      {Object.entries(day.muscleSets)
                        .map(([m, n]) => `${m} ${n}`)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="row-meta">
                    {dayTotalSets(day)}세트 {openDayId === day.id ? '▾' : '▸'}
                  </div>
                </button>
                {openDayId === day.id && (
                  <div style={{ padding: '0 0 12px 4px' }}>
                    {day.exercises
                      .slice()
                      .sort((a, b) => a.plannedOrder - b.plannedOrder)
                      .map((ex) => (
                        <div className="row" key={ex.exerciseId} style={{ borderBottom: 'none', padding: '6px 0' }}>
                          <div className="row-main">
                            <div className="row-title" style={{ fontSize: 14 }}>
                              {ex.plannedOrder}. {exerciseLabel(bundle.catalog, ex.exerciseId)}{' '}
                              <span className="chip">{ex.group}</span>
                              {ex.optional && <span className="chip chip-warn">선택</span>}
                            </div>
                            <div className="row-sub">
                              {ex.muscle} · {ex.note || '—'}
                            </div>
                          </div>
                          <div className="row-meta">
                            {ex.sets}×{ex.repMin}~{ex.repMax}
                            <br />
                            {ex.restSec}초
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}

          </>
        ) : (
          <p className="row-sub">루틴 없음</p>
        )}
      </div>

      {bundle && (
        <ExportPanel bundle={bundle} sessions={sessions} phase={currentPhase} />
      )}

      <GistPanel />

      <ImportPanel />

      {bundle && <RoutineIoPanel routine={bundle.routine} catalog={bundle.catalog} />}

      <div className="card">
        <div className="card-label">진단</div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">종목 카탈로그</div>
          </div>
          <div className="row-meta">{seed.exerciseCount}개</div>
        </div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">저장된 세션</div>
          </div>
          <div className="row-meta">{sessionCount}개</div>
        </div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">홈 화면 앱</div>
          </div>
          <div className="row-meta">{isStandalone() ? '예' : '아니오 (Safari 탭)'}</div>
        </div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">저장 공간</div>
          </div>
          <div className="row-meta">{quota ?? '—'}</div>
        </div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">시드 주입</div>
          </div>
          <div className="row-meta">{seed.didSeed ? '이번 실행에 적용' : '기존 유지'}</div>
        </div>
        {seed.problems.map((p) => (
          <div className="row" key={p}>
            <div className="row-main">
              <div className="row-title" style={{ color: 'var(--danger)', whiteSpace: 'normal' }}>
                {p}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-label">위험 구역</div>
        <button className="btn" onClick={() => void setOnboardingDone(false)}>
          온보딩 안내 다시 보기
        </button>
        <div style={{ height: 8 }} />
        {resetStep === 0 && (
          <button className="btn btn-danger" onClick={() => setResetStep(1)}>
            모든 데이터 초기화
          </button>
        )}
        {resetStep === 1 && (
          <>
            <p className="row-sub" style={{ color: 'var(--danger)' }}>
              세션 기록 {sessionCount}개와 설정이 모두 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="btn-row">
              <button className="btn" onClick={() => setResetStep(0)}>
                취소
              </button>
              <button className="btn btn-danger" onClick={() => void resetAll()}>
                정말 삭제
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
