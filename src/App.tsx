import { useEffect, useState } from 'react'
import TabBar, { type TabId } from './components/TabBar'
import UpdatePrompt from './components/UpdatePrompt'
import { ensureSeed, type SeedResult } from './db/seed'
import { usePwaUpdate } from './lib/usePwaUpdate'
import HomeScreen from './screens/HomeScreen'
import Onboarding from './screens/Onboarding'
import PlaceholderScreen from './screens/PlaceholderScreen'
import SettingsScreen from './screens/SettingsScreen'
import { useSettings } from './store/settings'

export default function App() {
  // 최상위에서 호출해야 온보딩 전에도 서비스워커가 등록된다 (usePwaUpdate 주석 참조)
  const pwa = usePwaUpdate()
  const [seed, setSeed] = useState<SeedResult | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('home')
  const { loaded, onboardingDone, load } = useSettings()

  useEffect(() => {
    // 시드 주입 → 설정 로드 순서를 지킨다 (시드가 activeRoutineId를 쓴다)
    void (async () => {
      try {
        const result = await ensureSeed()
        setSeed(result)
        await load()
      } catch (err) {
        setBootError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [load])

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

  return (
    <div className="app">
      {banner}
      {tab === 'home' && <HomeScreen onOpenSettings={() => setTab('settings')} />}
      {tab === 'history' && (
        <PlaceholderScreen
          title="기록"
          milestone="마일스톤 5"
          items={[
            '월 달력 · 세션 있는 날 불꽃 표시',
            '세션 상세 (수행 순서 · 세트 · 감각 · 보상작용)',
            '기록 편집 (당일 입력 실수 보정)',
            '종목별 히스토리 (recordKey 기준)',
          ]}
        />
      )}
      {tab === 'analyze' && (
        <PlaceholderScreen
          title="분석"
          milestone="마일스톤 8"
          items={[
            'A그룹 종목별 무게 × 반복수 라인차트',
            '총 볼륨 · e1RM 추이',
            'B그룹 감각 점수 추이 (4주 평균)',
            '주간 수행 횟수 바 차트',
          ]}
        />
      )}
      {tab === 'settings' && <SettingsScreen seed={seed} />}
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
