import type { RoutineDay, RoutineTemplate } from '../types'
import { dayTotalSets } from '../lib/useRoutine'

/**
 * Day 선택 바텀시트 (DESIGN.md §4).
 * "홈 화면에서 제안 Day를 크게 표시하되, 탭하면 모든 Day + 하한 모드 선택 시트가 열림
 *  (요구사항: 잘못된 경우 변경 가능)"
 */
export default function DayPickerSheet({
  routine,
  suggestedDayId,
  onPick,
  onClose,
}: {
  routine: RoutineTemplate
  suggestedDayId?: string
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
