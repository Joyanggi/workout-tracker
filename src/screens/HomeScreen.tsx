import { dayTotalSets, exerciseLabel, useRoutine } from '../lib/useRoutine'
import { storageAtRisk } from '../lib/platform'
import { useSettings } from '../store/settings'

export default function HomeScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const bundle = useRoutine()
  const currentPhase = useSettings((s) => s.currentPhase)

  if (!bundle) {
    return (
      <div className="screen">
        <p className="center-note">루틴을 불러오는 중…</p>
      </div>
    )
  }

  const { routine, catalog } = bundle
  // 세션이 하나도 없는 상태의 제안은 §4 알고리즘상 무조건 D1이다.
  // 이력에 반응하는 전체 제안 로직은 마일스톤 2에서 구현한다.
  const firstDay = routine.days[0]

  return (
    <div className="screen">
      {storageAtRisk() && (
        <div className="banner banner-danger">
          <span>
            홈 화면에 추가하지 않으면 기록이 삭제될 수 있어요. Safari 공유 → 홈 화면에 추가.
          </span>
        </div>
      )}

      <h1 className="screen-title">운동 기록</h1>
      <p className="screen-sub">
        <span className="chip chip-accent">{routine.name}</span>{' '}
        <span className="chip">Phase {currentPhase}</span>
      </p>

      <div className="card today-card">
        <div className="card-label">다음 운동</div>
        <div className="today-day">{firstDay.name}</div>
        <div className="today-sub">{firstDay.subtitle}</div>
        <div className="today-sub" style={{ marginTop: 8 }}>
          {firstDay.exercises
            .slice(0, 4)
            .map((ex) => exerciseLabel(catalog, ex.exerciseId))
            .join(' · ')}
          {firstDay.exercises.length > 4 && ` +${firstDay.exercises.length - 4}`}
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" disabled>
            운동 시작 (마일스톤 2)
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-label">주간 부위별 목표</div>
        {Object.entries(routine.muscleTargets)
          .sort((a, b) => b[1].weight - a[1].weight)
          .map(([muscle, t]) => (
            <div className="row" key={muscle}>
              <div className="row-main">
                <div className="row-title">{muscle}</div>
                <div className="row-sub">가중치 {t.weight.toFixed(2)}</div>
              </div>
              <div className="row-meta">{t.target}세트/주</div>
            </div>
          ))}
        <p className="row-sub" style={{ marginTop: 12 }}>
          실제 수행량 대비 진행 바는 마일스톤 4(홈 대시보드)에서 붙습니다.
        </p>
      </div>

      <div className="card">
        <div className="card-label">루틴 구성</div>
        {[...routine.days, ...routine.fallbackDays].map((day) => (
          <div className="row" key={day.id}>
            <div className="row-main">
              <div className="row-title">
                {day.name}
                {day.isBuffer && <span className="chip chip-warn" style={{ marginLeft: 6 }}>완충</span>}
              </div>
              <div className="row-sub">{day.subtitle}</div>
            </div>
            <div className="row-meta">
              {day.exercises.length}종목 · {dayTotalSets(day)}세트
            </div>
          </div>
        ))}
      </div>

      <button className="btn" onClick={onOpenSettings}>
        설정 · 루틴 상세 보기
      </button>
    </div>
  )
}
