import { Suspense, lazy, useEffect, useState } from 'react'
import TabBar, { type TabId } from './components/TabBar'
import SessionResumeStrip from './components/SessionResumeStrip'
import UpdatePrompt from './components/UpdatePrompt'
import { ensureSeed, type SeedResult } from './db/seed'
import { configureAudioSession } from './lib/beep'
import { flushPendingSync, installSyncLifecycle } from './lib/gistSync'
import { usePwaUpdate } from './lib/usePwaUpdate'
import { useRoutine } from './lib/useRoutine'
import DietScreen from './screens/DietScreen'
import HistoryScreen from './screens/HistoryScreen'
import HomeScreen from './screens/HomeScreen'
import Onboarding from './screens/Onboarding'
import SessionScreen from './screens/SessionScreen'
import SettingsScreen from './screens/SettingsScreen'
import SummaryScreen from './screens/SummaryScreen'
import { useRestTimer } from './lib/useRestTimer'
import { useSessionStore } from './store/session'
import { useSettings } from './store/settings'

/**
 * 분석 탭만 지연 로딩한다.
 *
 * recharts가 gzip 130KB로 앱 나머지(98KB)보다 크다. §2가 지정한 스택이므로 바꾸지 않되,
 * **헬스장에서 쓰는 경로(홈 → 세션)가 차트 코드를 파싱하지 않게** 분리한다.
 * SW는 이 청크도 precache하므로 오프라인에서 분석 탭도 그대로 열린다.
 */
const AnalyzeScreen = lazy(() => import('./screens/AnalyzeScreen'))

type View = 'tabs' | 'session' | 'summary'

export default function App() {
  // 최상위에서 호출해야 온보딩 전에도 서비스워커가 등록된다 (usePwaUpdate 주석 참조)
  const pwa = usePwaUpdate()
  const [seed, setSeed] = useState<SeedResult | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('home')
  const [view, setView] = useState<View>('tabs')
  const { loaded, onboardingDone, load } = useSettings()
  const restoreSession = useSessionStore((s) => s.restore)
  const openSession = useSessionStore((s) => s.session)
  /*
   * 휴식 타이머를 **App이 단일 인스턴스로 소유한다** (Z5 — 이 항목의 핵심 함정).
   *
   * SessionScreen이 소유하면 최소화로 탭에 나갈 때 훅이 언마운트되어 차임·카운트다운 틱이
   * 죽는다. endTime은 localStorage에 있어 복귀 시 표시는 정확하지만, 다른 탭을 보는 동안
   * 휴식이 끝나면 소리가 안 난다 — 최소화 기능을 만드는 이유와 정확히 충돌한다.
   *
   * **인스턴스 두 개 금지**: localStorage는 load 시점에만 읽으므로 라이브 동기화가 안 되고,
   * 두 개면 알림이 두 번 울리거나 한쪽이 낡는다. `timerOwnership.test.ts`가 잠근다.
   */
  const timer = useRestTimer()
  const bundle = useRoutine()

  useEffect(() => {
    // 시드 주입 → 설정 로드 → 진행 중 세션 복구 순서를 지킨다 (시드가 activeRoutineId를 쓴다)
    void (async () => {
      try {
        // Safari 탭 사용 기간의 추가 방어층 (§11 ITP 삭제). 거부돼도 무해하므로 무시한다
        void navigator.storage?.persist?.().catch(() => undefined)

        /*
         * 오디오 세션을 ambient로 (G8). **AudioContext를 만들기 전에** 지정해야
         * iOS가 이 앱을 재생 앱으로 잡아 다른 앱 음악을 끊는 것을 막는다.
         */
        configureAudioSession()

        const result = await ensureSeed()
        setSeed(result)
        await load()
        await restoreSession()

        // 지난 실행에서 debounce 중 폰이 잠겨 밀린 백업이 있으면 지금 올린다
        flushPendingSync()
      } catch (err) {
        setBootError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [load, restoreSession])

  // 백그라운드 전환 직전에 밀린 백업을 flush (P1-3)
  useEffect(() => installSyncLifecycle(), [])

  const banner = <UpdatePrompt {...pwa} />

  if (bootError) {
    return (
      <>
        {banner}
        <div className="screen">
          <h1 className="screen-title">시작 실패</h1>
          <div className="banner banner-danger">
            <span>{bootError}</span>
          </div>
          <p className="row-sub">
            사파리 프라이빗 브라우징에서는 IndexedDB를 쓸 수 없습니다. 일반 탭에서 열어 주세요.
          </p>
        </div>
      </>
    )
  }

  if (!seed || !loaded) {
    return (
      <>
        {banner}
        <div className="center-note">불러오는 중…</div>
      </>
    )
  }

  if (!onboardingDone) {
    return (
      <>
        {banner}
        <Onboarding />
      </>
    )
  }

  // 세션·요약 화면은 탭바를 숨긴다 (§5.2 전체화면 입력)
  if (view === 'session' && bundle) {
    return (
      <SessionScreen
        bundle={bundle}
        timer={timer}
        onMinimize={() => setView('tabs')}
        onFinished={() => setView('summary')}
        onDiscarded={() => setView('tabs')}
      />
    )
  }

  if (view === 'summary' && bundle) {
    return <SummaryScreen bundle={bundle} onDone={() => setView('tabs')} />
  }

  return (
    <div className="app">
      {banner}
      {tab === 'home' && (
        <HomeScreen onEnterSession={() => setView('session')} onOpenDiet={() => setTab('diet')} />
      )}
      {tab === 'diet' && <DietScreen />}
      {tab === 'history' &&
        (bundle ? <HistoryScreen bundle={bundle} /> : <p className="center-note">불러오는 중…</p>)}
      {tab === 'analyze' &&
        (bundle ? (
          <Suspense fallback={<p className="center-note">차트를 불러오는 중…</p>}>
            <AnalyzeScreen bundle={bundle} />
          </Suspense>
        ) : (
          <p className="center-note">불러오는 중…</p>
        ))}
      {tab === 'settings' && <SettingsScreen seed={seed} />}
      {/*
        최소화된 세션의 재개 스트립 (Z5) — 어느 탭에 있든 보인다.
        홈의 "진행 중" 배너를 이것으로 통합했다 (같은 정보가 두 줄 뜨지 않게).
      */}
      {openSession && bundle && (
        <SessionResumeStrip
          dayName={
            [...bundle.routine.days, ...bundle.routine.fallbackDays].find(
              (d) => d.id === openSession.dayId,
            )?.name ?? openSession.dayId
          }
          startedAt={openSession.startedAt}
          timer={timer}
          onResume={() => setView('session')}
        />
      )}
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
