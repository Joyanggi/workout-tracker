import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../db'
import {
  SENSORY_BUCKET_WEEKS,
  sensoryTrend,
  strengthRecordKeys,
  strengthTrend,
  weeklyBars,
} from '../lib/analysis'
import { todayLocal } from '../lib/dates'
import type { RoutineBundle } from '../lib/useRoutine'

const WEEKS_SHOWN = 12

/** 다크 테마에 맞춘 차트 공통 색 (CSS 변수는 SVG 속성에 직접 못 넣는다) */
const C = {
  accent: '#ff7a1a',
  ok: '#34c759',
  warn: '#ffcc00',
  dim: '#9a9aa8',
  faint: '#64646f',
  line: '#2b2b34',
  surface: '#16161a',
}

const AXIS = { stroke: C.faint, fontSize: 11 }
const TOOLTIP_STYLE = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  fontSize: 12,
}

/**
 * 분석 탭 (DESIGN.md §5.4 — v1 최소).
 * 세 가지만 있다: A그룹 추이 / B그룹 감각 / 주간 수행 횟수.
 * "고급 분석(순서 영향 등)은 앱에서 하지 않음 — 내보내기 → Claude 분석이 설계 의도"
 */
export default function AnalyzeScreen({ bundle }: { bundle: RoutineBundle }) {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const today = todayLocal()
  const [selected, setSelected] = useState<string | null>(null)
  const [metric, setMetric] = useState<'topLoad' | 'volume' | 'e1rm'>('topLoad')

  const aKeys = useMemo(() => strengthRecordKeys(sessions, bundle.routine), [sessions, bundle.routine])
  const activeKey = selected ?? aKeys[0]?.recordKey ?? null
  const trend = useMemo(
    () => (activeKey ? strengthTrend(sessions, activeKey) : []),
    [sessions, activeKey],
  )
  const sensory = useMemo(
    () => sensoryTrend(sessions, bundle.routine, today),
    [sessions, bundle.routine, today],
  )
  const bars = useMemo(
    () => weeklyBars(sessions, today, WEEKS_SHOWN, bundle.routine.rules.deloadMinSessionsPerWeek),
    [sessions, today, bundle.routine],
  )

  const nameOf = (exerciseId: string) => bundle.catalog.get(exerciseId)?.shortName ?? exerciseId
  const nameOfKey = (recordKey: string) => {
    const at = recordKey.lastIndexOf('@')
    return `${nameOf(recordKey.slice(0, at))} (${recordKey.slice(at + 1).toUpperCase()})`
  }

  if (sessions.length === 0) {
    return (
      <div className="screen">
        <h1 className="screen-title">분석</h1>
        <p className="center-note">
          기록이 쌓이면 추이가 표시됩니다.
          <br />
          깊은 분석은 설정 → 내보내기의 Markdown을 LLM에 붙여넣으세요.
        </p>
      </div>
    )
  }

  const metricLabel = { topLoad: '무게 × 최다 반복수', volume: '총 볼륨', e1rm: 'e1RM 추정' }[metric]

  return (
    <div className="screen">
      <h1 className="screen-title">분석</h1>
      <p className="screen-sub">
        깊은 분석은 설정 → 내보내기 → Markdown을 LLM에 붙여넣는 것이 이 앱의 설계입니다.
      </p>

      {/* ① A그룹 종목별 추이 */}
      <div className="card">
        <div className="card-label">A그룹 추이</div>
        {aKeys.length === 0 ? (
          <p className="row-sub">A그룹 기록이 없습니다.</p>
        ) : (
          <>
            <div className="chip-scroll">
              {aKeys.map((k) => (
                <button
                  key={k.recordKey}
                  className={`pill${activeKey === k.recordKey ? ' pill-on' : ''}`}
                  onClick={() => setSelected(k.recordKey)}
                >
                  {nameOf(k.exerciseId)}
                  <span style={{ opacity: 0.6, marginLeft: 4 }}>{k.dayId.toUpperCase()}</span>
                </button>
              ))}
            </div>

            <div className="segment" style={{ marginTop: 10 }}>
              {(['topLoad', 'volume', 'e1rm'] as const).map((m) => (
                <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}>
                  {{ topLoad: '무게×횟수', volume: '볼륨', e1rm: 'e1RM' }[m]}
                </button>
              ))}
            </div>

            {trend.length < 2 ? (
              <p className="row-sub" style={{ marginTop: 12 }}>
                세션이 2개 이상 쌓이면 추이가 그려집니다 (현재 {trend.length}개).
              </p>
            ) : (
              <div className="chart" style={{ marginTop: 12 }}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trend} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(5)}
                      tick={AXIS}
                      axisLine={{ stroke: C.line }}
                      tickLine={false}
                    />
                    <YAxis tick={AXIS} axisLine={false} tickLine={false} width={38} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: C.dim }}
                      formatter={(value) => [String(value), metricLabel]}
                    />
                    <Line
                      type="monotone"
                      dataKey={metric}
                      stroke={C.accent}
                      strokeWidth={2}
                      dot={{ r: 3, fill: C.accent }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {trend.length > 0 && (
              <p className="row-sub" style={{ marginTop: 8 }}>
                {nameOfKey(activeKey!)} · 최근 {trend[trend.length - 1].topWeight}kg ×{' '}
                {trend[trend.length - 1].maxReps}회
                {trend.some((p) => p.mode !== 'normal') && ' · 디로드/복귀 세션 포함'}
              </p>
            )}
            <p className="row-sub">
              감량기에는 <strong>볼륨 유지 = 성공</strong>입니다. 무게가 평평해도 볼륨·e1RM이
              유지되면 후퇴가 아닙니다.
            </p>
          </>
        )}
      </div>

      {/* ② B그룹 감각 점수 추이 */}
      <div className="card">
        <div className="card-label">감각 점수 ({SENSORY_BUCKET_WEEKS}주 평균)</div>
        {sensory.buckets.length === 0 ? (
          <p className="row-sub">감각 점수가 입력된 B그룹 기록이 없습니다.</p>
        ) : (
          <>
            {sensory.recordKeys.map((key) => {
              const values = sensory.buckets.map((b) => ({
                label: b.label,
                score: b.scores[key] ?? null,
              }))
              const filled = values.filter((v) => v.score !== null)
              if (filled.length === 0) return null
              const latest = filled[filled.length - 1].score!
              return (
                <div className="srow" key={key}>
                  <div className="srow-head">
                    <span className="mbar-name">{nameOfKey(key)}</span>
                    <span
                      className={`chip${latest <= 1 ? ' chip-warn' : ''}`}
                      style={{ marginLeft: 'auto' }}
                    >
                      {latest.toFixed(1)}
                    </span>
                  </div>
                  <div className="sdots">
                    {values.map((v) => (
                      <div
                        key={v.label}
                        className="sdot"
                        title={`${v.label} ${v.score ?? '기록 없음'}`}
                        style={{
                          background:
                            v.score === null
                              ? C.line
                              : v.score <= 1
                                ? C.warn
                                : v.score < 2.5
                                  ? C.accent
                                  : C.ok,
                          opacity: v.score === null ? 0.4 : 0.35 + (v.score / 3) * 0.65,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {sensory.weak.length > 0 && (
              <div className="warn-box" style={{ marginTop: 12 }}>
                <strong>계속 감각이 약한 종목</strong>
                <br />
                {sensory.weak
                  .map((w) => `${nameOfKey(w.recordKey)} 평균 ${w.average}점 (${w.count}회)`)
                  .join(', ')}
                <br />
                무게·자세·기계를 바꿔볼 신호입니다.
              </div>
            )}
          </>
        )}
      </div>

      {/* ③ 주간 수행 횟수 */}
      <div className="card">
        <div className="card-label">주간 수행 횟수 (최근 {WEEKS_SHOWN}주)</div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={bars} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS}
                axisLine={{ stroke: C.line }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS}
                axisLine={false}
                tickLine={false}
                width={26}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: C.dim }}
                formatter={(value) => [`${value}회`, '수행']}
              />
              <ReferenceLine
                y={bundle.routine.rules.deloadMinSessionsPerWeek}
                stroke={C.ok}
                strokeDasharray="4 4"
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {bars.map((b) => (
                  <Cell key={b.weekStart} fill={b.met ? C.ok : C.accent} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="row-sub" style={{ marginTop: 8 }}>
          점선 = 주 {bundle.routine.rules.deloadMinSessionsPerWeek}회 목표. 초록 막대가 달성한 주입니다.
        </p>
      </div>
    </div>
  )
}
