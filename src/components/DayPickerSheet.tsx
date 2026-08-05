import type { RoutineDay, RoutineTemplate } from '../types'
import { dayTotalSets } from '../lib/useRoutine'

/**
 * Day 선택 바텀시트 (DESIGN.md §4).
 * "홈 화면에서 제안 Day를 크게 표시하되, 탭하면 모든 Day + 하한 모드 선택 시트가 열림
 *  (요구사항: 잘못된 경우 변경 가능)"
 *
 * **시트는 선택만 바꾸고, 시작은 항상 시작 버튼이다** (AA1). 예전에는 행을 탭하는 순간
 * 세션이 만들어졌다 — 제안 Day는 2단(카드 → 시작)인데 다른 Day는 1단이어서 둘러보기가
 * 불가능했고, 잘못 탭하면 세션을 버리거나 강제 마감해야 했다.
 */
export default function DayPickerSheet({
  routine,
  suggestedDayId,
  /** 지금 직접 고른 Day (없으면 제안이 기준) — 무엇이 선택돼 있는지 시트가 말해야 한다 */
  pickedDayId,
  onPick,
  onClose,
}: {
  routine: RoutineTemplate
  suggestedDayId?: string
  pickedDayId?: string | null
  onPick: (day: RoutineDay) => void
  onClose: () => void
}) {
  const renderDay = (day: RoutineDay) => (
    <button className="row sheet-row" key={day.id} onClick={() => onPick(day)}>
      <div className="row-main">
        <div className="row-title">
          {day.name}
          {day.id === suggestedDayId && (
            <span className="chip chip-accent" style={{ marginLeft: 6 }}>
              제안
            </span>
          )}
          {day.id === pickedDayId && day.id !== suggestedDayId && (
            <span className="chip" style={{ marginLeft: 6 }}>
              선택
            </span>
          )}
          {day.isBuffer && (
            <span className="chip chip-warn" style={{ marginLeft: 6 }}>
              완충
            </span>
          )}
        </div>
        <div className="row-sub">{day.subtitle}</div>
      </div>
      <div className="row-meta">
        {day.exercises.length}종목
        <br />
        {dayTotalSets(day)}세트
      </div>
    </button>
  )

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Day 선택">
        <div className="sheet-grip" />
        <div className="card-label">오늘 할 운동</div>
        <p className="row-sub" style={{ marginTop: -4, marginBottom: 4 }}>
          고르면 홈 카드가 바뀝니다. 시작은 시작 버튼으로.
        </p>
        {routine.days.map(renderDay)}

        <div className="card-label" style={{ marginTop: 20 }}>
          하한 모드 · 30분
        </div>
        <p className="row-sub" style={{ marginTop: -4, marginBottom: 4 }}>
          시간이 없거나 컨디션이 나쁜 날. 기록은 정규 Day 라인에 이어서 남습니다.
        </p>
        {routine.fallbackDays.map(renderDay)}

        <button className="btn" style={{ marginTop: 16 }} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
