import {
  IconCalendar,
  IconChartLine,
  IconFlame,
  IconGear,
  IconUtensils,
  type IconProps,
} from './icons'

export type TabId = 'home' | 'diet' | 'history' | 'analyze' | 'settings'

/**
 * 아이콘은 **컴포넌트**다 (BB1) — 이모지 문자열이었을 때는 `color`가 통하지 않아
 * active 탭에 색을 입힐 수 없었다. `currentColor`를 쓰는 SVG는 `.tabbar button`의
 * `color`(비활성 `--text-faint` / active `--accent`)를 그대로 물려받는다.
 *
 * **라벨은 유지한다.** 아이콘만 남긴 탭바는 발견 가능성을 해친다 — AA2에서 배운 것과
 * 같은 이유다 (보이는 글자가 훑는 사람에게 닿는다).
 */
const TABS: { id: TabId; label: string; Icon: (props: IconProps) => JSX.Element }[] = [
  { id: 'home', label: '홈', Icon: IconFlame },
  // 식단은 하루 여러 번 열게 되므로 홈 바로 옆에 둔다 (D2)
  { id: 'diet', label: '식단', Icon: IconUtensils },
  { id: 'history', label: '기록', Icon: IconCalendar },
  { id: 'analyze', label: '분석', Icon: IconChartLine },
  { id: 'settings', label: '설정', Icon: IconGear },
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
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          aria-current={active === id ? 'page' : undefined}
        >
          <span className="tab-icon">
            <Icon />
          </span>
          {label}
        </button>
      ))}
    </nav>
  )
}
