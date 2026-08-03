import { useEffect, useRef, useState } from 'react'
import {
  PROBE,
  audioDiagnostics,
  chime,
  configureAudioSession,
  lastCycleCue,
  playWithSessionType,
  tick,
  tone,
  unlockAudio,
  type AudioDiagnostics,
} from '../lib/beep'
import { TEMPO, phaseTone } from '../lib/tempo'

/**
 * 소리 진단 (실사용 보고: **모든 소리가 안 들린다**).
 *
 * 개발 브라우저에서는 재현이 불가능하다 — `navigator.audioSession`이 아예 없고,
 * 창이 항상 `visibilityState: hidden`이라 §5.2 가시성 가드에 막힌다.
 * 그래서 **실기기가 직접 사실을 보고**하게 만든다. 짐작으로 고치는 것은 금지다.
 *
 * 실험 순서가 곧 가설 분리다:
 * 1. **즉시** 재생이 들리는가 → 컨텍스트가 살아 있는가
 * 2. **지연** 재생이 들리는가 → 제스처 밖에서 울릴 수 있는가
 *    (휴식 타이머는 90~150초, 템포 가이드는 3초 뒤가 첫 소리다 — 정확히 이 상황이다)
 * 3. **playback 세션**으로는 들리는가 → ambient + 무음 스위치·출력 경로 문제인가
 * 4. 실제 신호 네 개가 각각 들리는가 → 특정 톤만의 문제인가
 */

interface Entry {
  at: string
  what: string
  state: string
}

function fmt(d: AudioDiagnostics): string {
  if (!d.ctxExists) return '컨텍스트 없음'
  return `${d.ctxState} · t=${d.currentTime}s`
}

function clock(): string {
  const now = new Date()
  return `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

export default function AudioDiagnosticsPanel() {
  const [diag, setDiag] = useState<AudioDiagnostics>(() => audioDiagnostics())
  const [log, setLog] = useState<Entry[]>([])
  const timers = useRef<number[]>([])

  // 상태는 계속 변한다 (suspended로 떨어지는 순간을 보려면 갱신돼야 한다)
  useEffect(() => {
    const id = window.setInterval(() => setDiag(audioDiagnostics()), 500)
    return () => window.clearInterval(id)
  }, [])

  /* 예약한 재생이 화면을 벗어난 뒤 울리면 혼란스럽다 — 떠날 때 전부 취소하고 세션을 원복한다 */
  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout)
      timers.current = []
      configureAudioSession()
    },
    [],
  )

  const record = (what: string) => setLog((prev) => [{ at: clock(), what, state: fmt(audioDiagnostics()) }, ...prev].slice(0, 12))

  const playNow = (what: string, fn: () => void) => {
    unlockAudio() // 탭이 제스처다
    fn()
    record(what)
  }

  /** 제스처 밖에서 울린다 — 휴식 타이머·템포 가이드와 같은 조건 */
  const playLater = (sec: number) => {
    unlockAudio()
    record(`${sec}초 후 재생 예약`)
    const id = window.setTimeout(() => {
      tone(PROBE)
      record(`${sec}초 후 — 재생 시도`)
    }, sec * 1000)
    timers.current.push(id)
  }

  const bySession = (type: string) => {
    const after = playWithSessionType(type, PROBE)
    setLog((prev) =>
      [{ at: clock(), what: `${type} 세션으로 재생`, state: fmt(after) }, ...prev].slice(0, 12),
    )
  }

  return (
    <div className="card">
      <div className="card-label">소리 진단</div>
      <p className="row-sub" style={{ whiteSpace: 'normal', marginBottom: 8 }}>
        소리가 안 들리는 원인을 좁히기 위한 것입니다. 버튼을 누르고 <b>들렸는지 여부</b>와
        아래 기록을 알려주세요. 무음 스위치는 <b>끈 상태</b>로 시작하세요.
      </p>

      <div className="row">
        <div className="row-main">
          <div className="row-title">오디오 세션 API</div>
        </div>
        <div className="row-meta">
          {diag.sessionSupported ? (diag.sessionType ?? '?') : '미지원'}
        </div>
      </div>
      <div className="row">
        <div className="row-main">
          <div className="row-title">컨텍스트 상태</div>
        </div>
        <div className="row-meta">{diag.ctxExists ? diag.ctxState : '없음 (아직 안 열림)'}</div>
      </div>
      <div className="row">
        <div className="row-main">
          <div className="row-title">컨텍스트 시간</div>
          <div className="row-sub">멈춰 있으면 suspended입니다</div>
        </div>
        <div className="row-meta">{diag.currentTime ?? '—'}</div>
      </div>

      <div className="card-label" style={{ marginTop: 14 }}>
        1. 즉시 재생 — 컨텍스트가 살아 있는가
      </div>
      <button className="btn" onClick={() => playNow('즉시 — 확인음 1초', () => tone(PROBE))}>
        🔊 확인음 (880Hz · 1초)
      </button>

      <div className="card-label" style={{ marginTop: 14 }}>
        2. 지연 재생 — 제스처 밖에서 울리는가
      </div>
      <p className="row-sub" style={{ whiteSpace: 'normal' }}>
        휴식 타이머는 90~150초 뒤, 템포 가이드는 3초 뒤가 첫 소리입니다. <b>이 화면을 켜 둔
        채</b> 기다려 주세요.
      </p>
      <div className="btn-row">
        <button className="btn" onClick={() => playLater(3)}>
          3초 후
        </button>
        <button className="btn" onClick={() => playLater(15)}>
          15초 후
        </button>
        <button className="btn" onClick={() => playLater(60)}>
          60초 후
        </button>
      </div>

      <div className="card-label" style={{ marginTop: 14 }}>
        3. 세션 종류 비교 — 무음 스위치·출력 경로인가
      </div>
      <p className="row-sub" style={{ whiteSpace: 'normal' }}>
        <b>ambient는 안 들리는데 playback은 들린다</b>면 원인은 무음 스위치나 출력 경로입니다
        (ambient는 무음 스위치를 존중합니다). 둘 다 안 들리면 컨텍스트 쪽입니다. playback은
        다른 앱 음악을 끊을 수 있으니 <b>테스트용으로만</b> 쓰고, 재생 후 자동으로 되돌립니다.
      </p>
      <div className="btn-row">
        <button className="btn" onClick={() => bySession('ambient')}>
          ambient로
        </button>
        <button className="btn" onClick={() => bySession('playback')}>
          playback으로
        </button>
      </div>

      <div className="card-label" style={{ marginTop: 14 }}>
        4. 실제 신호 — 특정 톤만의 문제인가
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => playNow('틱 (784Hz)', tick)}>
          틱
        </button>
        <button className="btn" onClick={() => playNow('마지막 큐 (1319Hz×2)', lastCycleCue)}>
          마지막 큐
        </button>
        <button className="btn" onClick={() => playNow('차임 (880·1175·1568)', chime)}>
          차임
        </button>
        <button
          className="btn"
          onClick={() =>
            playNow('템포 톤 (올림 660 / 내림 440)', () => {
              tone(phaseTone(TEMPO.B[0]))
              tone({ ...phaseTone(TEMPO.B[2]), delay: 0.5 })
            })
          }
        >
          템포 톤
        </button>
      </div>

      <div className="card-label" style={{ marginTop: 14 }}>
        기록 (최근 12건)
      </div>
      {log.length === 0 ? (
        <p className="row-sub">아직 없습니다 — 위 버튼을 눌러보세요.</p>
      ) : (
        log.map((e, i) => (
          <div className="row" key={`${e.at}-${i}`}>
            <div className="row-main">
              <div className="row-title" style={{ whiteSpace: 'normal' }}>
                {e.what}
              </div>
              <div className="row-sub">{e.at}</div>
            </div>
            <div className="row-meta">{e.state}</div>
          </div>
        ))
      )}
    </div>
  )
}
