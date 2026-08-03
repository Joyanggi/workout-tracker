import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import DietPlanSheet from '../components/DietPlanSheet'
import DietSlotSheet from '../components/DietSlotSheet'
import { addDays, todayLocal } from '../lib/dates'
import { completedSessions } from '../lib/derive'
import {
  ADHERENCE_MARK,
  LOW_KCAL_STREAK_WARN,
  planStreak,
  slotScore,
  slotsFor,
  summarizeDietDay,
} from '../lib/diet'
import {
  applyCheckAllItems,
  applyClearSlot,
  applyNote,
  applyPlan,
  applySkipSlot,
  applySubstitution,
  applyToggleItem,
  applyTrainingDay,
  emptyDietDay,
} from '../lib/dietOps'
import { dietDayFor, findPlan, mutateDietDay, useDiet } from '../lib/useDiet'
import type { DietDay } from '../types'

/**
 * 식단 탭 — 오늘 화면 (D2).
 *
 * 마찰 기준: **정상일이 탭 6~8회로 끝나야 한다.** 그래서 슬롯 오른쪽 원형 버튼이
 * 곧 "전부 먹음"이다 — 훈련일 6슬롯 × 1탭 = 6탭으로 하루가 끝난다.
 * (시트를 거치게 하면 슬롯당 2탭이 되어 12탭이 된다 — 기준을 못 맞춘다)
 * 슬롯 이름을 누르면 시트가 열리고, 거기서 대체·안 먹음 같은 예외를 처리한다.
 *
 * 핵심 지표는 **단백질 진행**이다 (칼로리는 보조 표기) — 감량기에 지켜야 하는 것이
 * 총열량이 아니라 단백질이기 때문이다.
 */
export default function DietScreen() {
  const today = todayLocal()
  const { plans, days, defaultPlanId, loading } = useDiet()
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [])
  const [slotSheet, setSlotSheet] = useState<string | null>(null)
  const [planSheet, setPlanSheet] = useState(false)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)

  /**
   * 오늘 완료 세션이 있으면 훈련일로 **고정**한다 (수동 토글보다 사실이 우선).
   * 없으면 저장된 값을 쓰고, 사용자가 토글할 수 있다.
   */
  const trainedToday = completedSessions(sessions).some((s) => s.date === today)

  if (loading) return <p className="center-note">불러오는 중…</p>
  if (plans.length === 0) return <p className="center-note">식단 플랜이 없습니다.</p>

  const stored = days.find((d) => d.date === today)
  const plan = findPlan(plans, stored?.planId ?? defaultPlanId)
  if (!plan) return <p className="center-note">식단 플랜이 없습니다.</p>

  const isTrainingDay = trainedToday || (stored?.isTrainingDay ?? false)
  const day: DietDay = stored
    ? { ...stored, isTrainingDay }
    : dietDayFor(days, today, plan.id, isTrainingDay)
  const slots = slotsFor(plan, isTrainingDay)
  const summary = summarizeDietDay(plan, stored ? day : undefined)

  /**
   * 변형은 렌더 시점의 `day`가 아니라 **DB의 최신 상태**를 기준으로 적용한다
   * (useDiet.mutateDietDay 주석 — 연타 시 앞선 쓰기가 유실됐다).
   * `isTrainingDay`는 파생값이므로 fallback에 현재 계산값을 실어 보낸다.
   */
  const mutate = (fn: (d: DietDay) => DietDay) =>
    mutateDietDay(today, { ...day, isTrainingDay }, fn)

  const streak = planStreak(days, plan.id, today)
  const isLowPlan = !plan.isDefault
  const showStreakWarning = isLowPlan && streak >= LOW_KCAL_STREAK_WARN

  const openSlot = slots.find((s) => s.id === slotSheet)

  return (
    <div className="screen">
      <h1 className="screen-title">식단</h1>

      {/* 핵심 지표를 제목 바로 아래 둔다 — 이 화면에서 가장 자주 확인하는 숫자다 */}
      <div className="card">
        <div className="diet-head">
          <button className="btn btn-sm" onClick={() => setPlanSheet(true)}>
            {plan.name} ▾
          </button>
          <button
            className="btn btn-sm"
            disabled={trainedToday}
            title={trainedToday ? '오늘 완료 세션이 있어 훈련일로 고정됩니다' : undefined}
            onClick={() => mutate((d) => applyTrainingDay(d, !isTrainingDay))}
          >
            {isTrainingDay ? '훈련일' : '휴식일'} ⇄
          </button>
        </div>
        <div className="diet-protein">
          <span className="diet-protein-value">
            {summary.proteinG}
            <span className="diet-protein-unit">/{summary.targetProteinG}g</span>
          </span>
          <span className="row-sub">단백질 (추정)</span>
        </div>
        <div className="diet-bar" aria-hidden="true">
          <div
            className="diet-bar-fill"
            style={{
              width: `${Math.min(100, Math.round((summary.proteinG / Math.max(1, summary.targetProteinG)) * 100))}%`,
            }}
          />
        </div>
        <p className="row-sub" style={{ marginTop: 8 }}>
          {summary.kcal.toLocaleString()} / {summary.targetKcal.toLocaleString()}kcal ·{' '}
          {summary.adherence === 'unlogged'
            ? `기록 ${summary.loggedSlots}/${summary.totalSlots}슬롯`
            : `준수 ${ADHERENCE_MARK[summary.adherence]}`}
        </p>
      </div>

      {showStreakWarning && (
        <div className="banner banner-warn" style={{ alignItems: 'flex-start' }}>
          <span>
            {plan.name} {streak}일 연속
            <br />
            <small>
              루틴 문서 15장: 전날 초과분을 만회하려고 덜 먹지 않는다. 소폭 보정은 괜찮지만
              장기화는 만회성 절식입니다 — 기본 플랜으로 돌아오세요.
            </small>
          </span>
        </div>
      )}

      {slots.map((slot) => {
        const record = day.slots[slot.id]
        const score = slotScore(slot, record)
        const mark = score === null ? '○' : score >= 1 ? '●' : score > 0 ? '◐' : '✗'
        return (
          <div className="card diet-slot" key={slot.id}>
            <div className="diet-slot-head">
              <button className="diet-slot-name-btn" onClick={() => setSlotSheet(slot.id)}>
                <span className="diet-slot-name">
                  {slot.name}
                  <span className="row-sub"> {slot.timeHint}</span>
                </span>
                <span className="row-sub" aria-hidden="true">
                  대체·안 먹음 ▸
                </span>
              </button>
              {/*
                일괄 체크를 여기 직접 둔다 (주 경로). 이미 전부 체크된 상태에서 다시 누르면
                기록을 지운다 — 잘못 누른 것을 한 번에 되돌릴 수 있어야 한다.
              */}
              <button
                className={`diet-mark-btn diet-mark-${score === null ? 'none' : score >= 1 ? 'full' : score > 0 ? 'part' : 'zero'}`}
                aria-label={`${slot.name} 전부 먹음`}
                aria-pressed={score !== null && score >= 1}
                onClick={() =>
                  mutate((d) =>
                    record && !record.substitution && !record.skipped && score !== null && score >= 1
                      ? applyClearSlot(d, slot.id)
                      : applyCheckAllItems(d, slot),
                  )
                }
              >
                {mark}
              </button>
            </div>

            <div className="diet-items">
              {slot.items.map((item) => {
                const on = record?.checkedItemIds.includes(item.id) ?? false
                return (
                  <button
                    key={item.id}
                    className={`diet-item${on ? ' diet-item-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => mutate((d) => applyToggleItem(d, slot.id, item.id))}
                  >
                    <span aria-hidden="true">{on ? '☑' : '☐'}</span>
                    <span>
                      {item.name} <span className="row-sub">{item.qty}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {record?.skipped && <p className="row-sub diet-note">안 먹음</p>}
            {record?.substitution && (
              <p className="row-sub diet-note">
                대체: “{record.substitution.text}” ·{' '}
                {record.substitution.quality === 'similar'
                  ? '비슷한 구성'
                  : record.substitution.quality === 'other'
                    ? '다른 음식'
                    : '치팅'}
              </p>
            )}
          </div>
        )
      })}

      <div className="card">
        <div className="card-label">메모 (선택)</div>
        <input
          className="field"
          value={noteDraft ?? day.note ?? ''}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if (noteDraft !== null) mutate((d) => applyNote(d, noteDraft))
            setNoteDraft(null)
          }}
          placeholder="회식·컨디션 같은 맥락"
          aria-label="식단 메모"
        />
      </div>

      {openSlot && (
        <DietSlotSheet
          slot={openSlot}
          record={day.slots[openSlot.id]}
          onCheckAll={() => mutate((d) => applyCheckAllItems(d, openSlot))}
          onSkip={() => mutate((d) => applySkipSlot(d, openSlot.id))}
          onSubstitute={(sub) => mutate((d) => applySubstitution(d, openSlot.id, sub))}
          onClear={() => mutate((d) => applyClearSlot(d, openSlot.id))}
          onClose={() => setSlotSheet(null)}
        />
      )}

      {planSheet && (
        <DietPlanSheet
          plans={plans}
          currentPlanId={plan.id}
          onPickToday={(planId) => mutate((d) => applyPlan(d, planId))}
          onPickAhead={(planId, count) => {
            // 미리 잡은 날은 빈 기록으로 만든다 — planId만 정해두는 것이므로
            // 판정은 여전히 "미기록"이다 (슬롯 기록이 없으므로)
            for (let i = 1; i <= count; i += 1) {
              const date = addDays(today, i)
              mutateDietDay(date, emptyDietDay(date, planId, false), (d) => applyPlan(d, planId))
            }
          }}
          onClose={() => setPlanSheet(false)}
        />
      )}
    </div>
  )
}
