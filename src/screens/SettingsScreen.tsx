import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import ExportPanel from '../components/ExportPanel'
import GistPanel from '../components/GistPanel'
import {
  VOLUME_SCALES,
  audioContextState,
  previewSignals,
  previewTempoTones,
  unlockAudio,
  type SoundVolume,
} from '../lib/beep'
import ImportPanel from '../components/ImportPanel'
import DietIoPanel from '../components/DietIoPanel'
import RoutineIoPanel from '../components/RoutineIoPanel'
import { useDiet } from '../lib/useDiet'
import { db } from '../db'
import type { SeedResult } from '../db/seed'
import { phaseReadiness } from '../lib/phaseReadiness'
import { todayLocal } from '../lib/dates'
import { dayTotalSets, exerciseLabel, useRoutine } from '../lib/useRoutine'
import { isStandalone } from '../lib/platform'
import { A_ECCENTRIC_OPTIONS, phaseTone } from '../lib/tempo'
import { useSettings } from '../store/settings'
import type { Phase } from '../types'

const PHASES: { value: Phase; label: string; desc: string }[] = [
  { value: 0, label: '0', desc: '습관 형성 — 주 3회 × 8주 연속' },
  { value: 1, label: '1', desc: '기본 볼륨 정착' },
  { value: 2, label: '2', desc: '강도 확장' },
  { value: 3, label: '3', desc: '피지크 마감' },
]

/** 세그먼트 라벨. 배율 자체는 beep.ts가 소유한다 */
const VOLUME_LABEL: Record<SoundVolume, string> = {
  normal: '보통',
  loud: '크게',
  max: '가장 크게',
}

export default function SettingsScreen({ seed }: { seed: SeedResult }) {
  const diet = useDiet()
  const bundle = useRoutine()
  const {
    currentPhase,
    setPhase,
    setOnboardingDone,
    tempoGuide,
    setTempoGuide,
    soundVolume,
    setSoundVolume,
    aEccentricSec,
    setAEccentricSec,
  } = useSettings()
  const sessionCount = useLiveQuery(() => db.sessions.count(), [], 0)
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const readiness = bundle
    ? phaseReadiness(sessions, bundle.routine, currentPhase, todayLocal())
    : null
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
      {/* 버전은 package.json에서 파생된다 (BB5) — 화면이 손으로 적으면 라운드마다 낡는다 */}
      <p className="screen-sub">v{__APP_VERSION__}</p>

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

        {/* DESIGN.md §5.5 "각 Phase 조건 요약 표시" — 뭐가 남았는지 보이게 (T3) */}
        {readiness && readiness.to !== null && (
          <>
            <div className="card-label" style={{ marginTop: 14 }}>
              Phase {readiness.to} 전환 조건
            </div>
            {readiness.checks.map((c) => (
              <div className="row" key={c.label}>
                <div className="row-main">
                  <div className="row-title" style={{ whiteSpace: 'normal' }}>
                    <span
                      aria-hidden="true"
                      style={{ color: c.met ? 'var(--ok)' : 'var(--text-faint)', marginRight: 6 }}
                    >
                      {c.met ? '✓' : '○'}
                    </span>
                    {c.label}
                  </div>
                  <div className="row-sub">{c.detail}</div>
                </div>
                {c.insufficient && <div className="row-meta">기록 부족</div>}
              </div>
            ))}
            {readiness.allMet && (
              <button
                className="btn btn-sm btn-primary"
                style={{ marginTop: 10 }}
                onClick={() => void setPhase(readiness.to as Phase)}
              >
                Phase {readiness.to}로 전환
              </button>
            )}
          </>
        )}

        <p className="row-sub" style={{ marginTop: 10 }}>
          Phase 0에서도 더블 프로그레션 증량을 허용합니다 (v2.4 규칙). 전환은 조건이 충족돼도
          사용자가 직접 결정합니다 — 루틴 문서의 조건에 주관 판단이 섞여 있습니다.
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

      {/*
        신호 볼륨 (Z1). 배율은 `beep.ts` 한 곳에 있고 여기는 선택지만 보여준다 —
        틱·차임·마지막 큐·템포 톤이 전부 같이 커진다 (소리별 배율을 두지 않는다).
      */}
      <div className="card">
        <div className="card-label">소리 크기</div>
        <div className="segment">
          {(Object.keys(VOLUME_SCALES) as SoundVolume[]).map((v) => (
            <button
              key={v}
              aria-pressed={soundVolume === v}
              onClick={() => void setSoundVolume(v)}
            >
              {VOLUME_LABEL[v]}
            </button>
          ))}
        </div>
        {/*
          미리 듣기 — **실제 신호를 그대로** 낸다 (틱 3회 → 차임).
          휴식이 끝나기를 기다려 확인하는 구조면 설정을 고치는 데 세트 하나가 든다.
          탭이 제스처이므로 여기서 컨텍스트를 연다 (iOS 제약).
        */}
        <button
          className="btn btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => {
            unlockAudio()
            previewSignals()
          }}
        >
          🔊 미리 듣기 (3·2·1 틱 → 종료 차임)
        </button>
        {/*
          템포 경계음 미리 듣기 (CC8 · CC7-R) — 게인 기준이 다른 계열이라 틱·차임만으로는
          "템포 소리가 충분히 큰가"를 판단할 수 없다. 스펙은 `phaseTone`이 소유한다.
        */}
        <button
          className="btn btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => {
            unlockAudio()
            // A그룹 한 사이클의 두 경계음을 그 간격대로 (올림 → 1초 뒤 내림)
            previewTempoTones(
              [phaseTone({ kind: 'concentric', seconds: 1 }), phaseTone({ kind: 'eccentric', seconds: aEccentricSec })],
              1,
            )
          }}
        >
          🔊 템포 경계음 미리 듣기 (올림 → 내림)
        </button>
        <p className="row-sub" style={{ marginTop: 8 }}>
          카운트다운 틱 · 종료 차임 · 템포 가이드 소리가 함께 조절됩니다.
          무음 스위치가 켜져 있으면 어떤 크기로도 소리가 나지 않습니다 (음악을 끊지 않기
          위한 맞바꿈 — README 참조).
        </p>
      </div>

      {/* 템포 가이드 (G7). 기본 꺼짐 — 세트 행에 버튼이 늘어나므로 원할 때만 켠다 */}
      <div className="card">
        <div className="card-label">템포 가이드</div>
        <div className="segment">
          {([false, true] as const).map((on) => (
            <button
              key={String(on)}
              aria-pressed={tempoGuide === on}
              onClick={() => void setTempoGuide(on)}
            >
              {on ? '사용' : '사용 안 함'}
            </button>
          ))}
        </div>
        <p className="row-sub" style={{ marginTop: 8 }}>
          세트 행의 ♩ 버튼으로 수축·이완 리듬을 <b>페이즈 경계음</b>과 링으로 안내합니다
          (A그룹 1-{aEccentricSec}초 · B그룹 3-1-1-1 · 코어 2-1-2, 루틴 문서 3장).
          호흡도 함께 표시됩니다 — 원리는 “힘쓸 때 내쉰다” 하나입니다.
          종료하면 카운트된 반복수가 그 세트에 들어갑니다.
        </p>
        <p className="row-sub">
          마지막 2~3회에서 리듬을 못 따라가기 시작하면 그게 세트 종료 신호입니다 (문서 13장).
        </p>

        {/*
          A그룹 이완 초 (CC16). **문서 3장 표가 "1.5~2초 (기본 2)" 범위로 개정됐다** —
          설정이 문서 범위 안에서만 움직인다. B그룹·코어는 열지 않는다: 그쪽 템포는
          속도가 아니라 감각 점수 체계의 전제이고, 문서에 그 근거까지 적혀 있다.
        */}
        <div className="card-label" style={{ marginTop: 16 }}>
          A그룹 내리는 속도
        </div>
        <div className="segment">
          {A_ECCENTRIC_OPTIONS.map((sec) => (
            <button
              key={sec}
              aria-pressed={aEccentricSec === sec}
              onClick={() => void setAEccentricSec(sec)}
            >
              {sec}초
            </button>
          ))}
        </div>
        <p className="row-sub" style={{ marginTop: 8 }}>
          문서 3장이 규정한 범위(1.5~2초, 기본 2) 안에서만 고를 수 있습니다. 통제를 유지하는
          것이 조건입니다 — 반동이 생기면 느린 쪽이 맞습니다. B그룹·코어는 감각 점수 체계의
          전제라 고정입니다. 레그 컬은 문서의 예외 행(1-1-2)을 따릅니다.
        </p>
      </div>

      {bundle && <RoutineIoPanel routine={bundle.routine} catalog={bundle.catalog} />}
      <DietIoPanel plans={diet.plans} />

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
        {/*
          소리 문제 1차 분류용 한 줄 (Y3). "running인데 안 들린다" = 무음 스위치·볼륨·출력 경로,
          "suspended/없음" = 앱 쪽. v1.3에 이 한 줄이 없어서 진단 화면을 만들고 지우는
          라운드를 한 번 썼다.
        */}
        <div className="row">
          <div className="row-main">
            <div className="row-title">오디오</div>
            <div className="row-sub">running인데 안 들리면 무음 스위치·볼륨·출력 기기 확인</div>
          </div>
          <div className="row-meta">{audioContextState() ?? '아직 안 열림'}</div>
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
