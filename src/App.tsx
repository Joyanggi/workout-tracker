import { Suspense, lazy, useEffect, useState } from 'react'
import TabBar, { type TabId } from './components/TabBar'
import UpdatePrompt from './components/UpdatePrompt'
import { ensureSeed, type SeedResult } from './db/seed'
import { usePwaUpdate } from './lib/usePwaUpdate'
import { useRoutine } from './lib/useRoutine'
import HistoryScreen from './screens/HistoryScreen'
import HomeScreen from './screens/HomeScreen'
import Onboarding from './screens/Onboarding'
import SessionScreen from './screens/SessionScreen'
import SettingsScreen from './screens/SettingsScreen'
import SummaryScreen from './screens/SummaryScreen'
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
  const bundle = useRoutine()

  useEffect(() => {
    // 시드 주입 → 설정 로드 → 진행 중 세션 복구 순서를 지킨다 (시드가 activeRoutineId를 쓴다)
    void (async () => {
      try {
        const result = await ensureSeed()
        setSeed(result)
        await load()
        await restoreSession()
      } catch (err) {
        setBootError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [load, restoreSession])

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
        onFinished={() => setView('summary')}
      />
    )
  }

  if (view === 'summary' && bundle) {
    return <SummaryScreen bundle={bundle} onDone={() => setView('tabs')} />
  }

  return (
    <div className="app">
      {banner}
      {tab === 'home' && <HomeScreen onEnterSession={() => setView('session')} />}
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
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
