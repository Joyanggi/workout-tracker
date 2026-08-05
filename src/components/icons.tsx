/**
 * 인라인 SVG 아이콘 (BB1·BB3).
 *
 * **의존성을 추가하지 않는다.** 아이콘 몇 개에 라이브러리 하나는 과하고, 이 앱은
 * recharts까지 지연 로딩해 번들을 아끼고 있다 (§2 스택 결정과 일관).
 *
 * 이모지를 대체하는 이유는 취향이 아니다:
 *   1. **이모지는 `color`를 무시한다** — 탭바의 active 상태(주황)를 표현할 수 없어서
 *      "지금 어느 탭인지"를 라벨 색만으로 말하고 있었다.
 *   2. OS·폰트 버전마다 다르게 렌더되고 획 굵기가 라벨 타이포와 맞지 않는다.
 *
 * 규격 (전부 동일):
 *   `24×24 viewBox` · `fill="none"` · `stroke="currentColor"` · `strokeWidth 1.8` ·
 *   `strokeLinecap/Linejoin "round"` · `aria-hidden`
 *
 * **고정 색을 쓰지 않는다.** `currentColor`만 쓰면 부모의 `color`를 그대로 물려받아
 * active/비활성·경고색 어디에 놓아도 맞는다 — 색 결정을 아이콘이 갖지 않는 것이 요점이고,
 * 소스 스캔이 이 규칙을 강제한다 (fill/stroke에 리터럴 색 금지).
 */

export type IconProps = {
  /** px. 기본 22 — 탭바 20px 이모지보다 약간 크게 잡아야 획이 같은 무게로 보인다 */
  size?: number
  className?: string
}

function Svg({ size = 22, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** 홈 — 불꽃 (앱의 액센트 모티프와 같은 상징) */
export function IconFlame(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.8c1.5 2.4 2.6 3.8 3.6 5.1 1.2 1.6 1.9 3.1 1.9 5A5.5 5.5 0 0 1 6.5 13c0-1.6.5-2.9 1.5-4.1.5.9 1.1 1.5 2 1.8-.6-3.1.3-5.6 2-7.9z" />
      <path d="M12 20.2a2.6 2.6 0 0 0 2.6-2.6c0-1.7-1.4-2.6-2.6-4.4-1.2 1.8-2.6 2.7-2.6 4.4a2.6 2.6 0 0 0 2.6 2.6z" />
    </Svg>
  )
}

/** 식단 — 포크와 나이프 */
export function IconUtensils(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.2 3v4.8a2.6 2.6 0 0 0 5.2 0V3" />
      <path d="M8.8 10.4V21" />
      <path d="M17.6 3v18" />
      <path d="M17.6 3c1.9 1.6 2.7 3.5 2.7 5.6s-.8 3.4-2.7 3.4" />
    </Svg>
  )
}

/** 기록 — 달력 */
export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.2" />
      <path d="M8.2 2.8v4.2M15.8 2.8v4.2M3.5 10.2h17" />
    </Svg>
  )
}

/** 분석 — 꺾은선 그래프 */
export function IconChartLine(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 3.5v15.2a1.3 1.3 0 0 0 1.3 1.3H20.5" />
      <path d="M7.4 15.4l3.4-4 2.9 2.4L19 7.6" />
    </Svg>
  )
}

/**
 * 설정 — 톱니.
 *
 * **처음엔 "원 + 6방향 이"로 단순화했는데 22px에서 해(sun)로 읽혔다** (스크린샷에서 확인).
 * 차이는 이가 **몸통에 붙어 있는지**다: 해의 빛살은 원과 떨어져 있고, 톱니는 붙어 있다.
 * 그래서 몸통 링(r=7)을 그리고 이를 그 링에서 밖으로 내는 구조로 바꿨다 —
 * 안쪽 작은 원이 축 구멍이 되어 "톱니바퀴"의 세 요소(구멍·몸통·이)가 다 있게 된다.
 *
 * 톱니 폴리곤을 실제로 그리는 것은 이 크기에서 이가 서로 뭉쳐 여전히 못 쓴다.
 */
export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 5V2.9M12 19v2.1M18.1 8.5l1.8-1.1M4.1 16.6l1.8-1.1M18.1 15.5l1.8 1.1M4.1 7.4l1.8 1.1" />
    </Svg>
  )
}

/**
 * 머신 세팅 — 슬라이더 (BB3).
 *
 * **계획서는 🔧(렌치) 대체를 지시했는데 슬라이더로 그렸다.** 이 행이 기록하는 것은
 * "시트 3칸, 등받이 2" 같은 **머신의 조절 위치**이고, 슬라이더가 그것을 그대로 그린다.
 * 렌치는 24px·1.8 굵기에서 사선 손잡이와 열린 턱이 뭉쳐 "무언가 도구"로만 읽힌다
 * (그려 보고 판단했다 — DEV-RECORD §4에 기록).
 */
export function IconSliders(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7.5h9M17.5 7.5h2.5M4 16.5h3.5M12 16.5h8" />
      <circle cx="15" cy="7.5" r="2.2" />
      <circle cx="9.5" cy="16.5" r="2.2" />
    </Svg>
  )
}

/** 무게 단위 — 천칭 (BB3) */
export function IconScale(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.6V20M8.4 20h7.2" />
      <path d="M5 8.6h14" />
      <path d="M2.8 8.6 5 13.4l2.2-4.8M16.8 8.6 19 13.4l2.2-4.8" />
      <circle cx="12" cy="4.6" r="1.2" />
    </Svg>
  )
}
