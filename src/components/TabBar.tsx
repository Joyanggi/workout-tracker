export type TabId = 'home' | 'history' | 'analyze' | 'settings'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'home', label: '홈', icon: '🔥' },
  { id: 'history', label: '기록', icon: '📅' },
  { id: 'analyze', label: '분석', icon: '📈' },
  { id: 'settings', label: '설정', icon: '⚙️' },
]

export default function TabBar({
  active,
  onChange,
}: {
  active: TabId
  onChange: (tab: TabId) => void
}) {
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span className="tab-icon" aria-hidden="true">
            {tab.icon}
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
