import { useState } from 'react'
import DietPlanSheet from './DietPlanSheet'
import DietSlotSheet from './DietSlotSheet'
import { addDays } from '../lib/dates'
import {
  ADHERENCE_MARK,
  LOW_KCAL_STREAK_WARN,
  planStreak,
  slotScore,
  slotsFor,
  summarizeDietDay,
} from '../lib/diet'
import {
  applyAddition,
  applyCheckAllItems,
  applyClearAddition,
  applyClearSlot,
  applyNote,
  applyPlan,
  applySkipSlot,
  applySubstitution,
  applyToggleItem,
  applyTrainingDay,
  emptyDietDay,
} from '../lib/dietOps'
import { dietDayFor, findPlan, mutateDietDay, removeDietDay } from '../lib/useDiet'
import type { DietDay, DietPlan } from '../types'
import { NO_AUTOFILL } from '../lib/inputProps'

/**
 * 하루 식단 기록 편집기 (D2 오늘 화면 · D3 과거 보정 공용).
 *
 * 오늘과 과거가 **같은 컴포넌트를 쓴다.** 따로 만들면 "당일 입력 누락 보정"(§5.3와 같은
 * 요구)에서 조작이 달라지고, 한쪽에 고친 규칙이 다른 쪽에 빠진다 — 운동 쪽에서
 * ExerciseCard를 세션·편집 화면이 공유하게 만든 것과 같은 이유다.
 *
 * 마찰 기준: **정상일이 탭 6~8회로 끝나야 한다.** 그래서 슬롯 오른쪽 원형 버튼이
 * 곧 "전부 먹음"이다 (훈련일 6슬롯 × 1탭). 슬롯 이름을 누르면 시트가 열리고
 * 거기서 대체·안 먹음 같은 예외를 처리한다.
 */
/** 자가 태그 표시 문구 — 카드·시트·내보내기가 같은 말을 써야 한다 */
const QUALITY_LABEL: Record<'similar' | 'other' | 'cheat', string> = {
  similar: '비슷한 구성',
  other: '다른 음식',
  cheat: '치팅',
}

export default function DietDayEditor({
  date,
  plans,
  days,
  defaultPlanId,
  /** 그 날짜에 완료 세션이 있었는가 — 있으면 훈련일로 고정한다 (사실이 토글보다 우선) */
  trainedThatDay,
  /** 연속 저칼로리 경고는 오늘 화면에서만 의미가 있다 */
  showStreakWarning = false,
  today,
}: {
  date: string
  plans: DietPlan[]
  days: DietDay[]
  defaultPlanId: string | null
  trainedThatDay: boolean
  showStreakWarning?: boolean
  today: string
}) {
  const [slotSheet, setSlotSheet] = useState<string | null>(null)
  const [planSheet, setPlanSheet] = useState(false)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const stored = days.find((d) => d.date === date)
  const plan = findPlan(plans, stored?.planId ?? defaultPlanId)
  if (!plan) return <p className="center-note">식단 플랜이 없습니다.</p>

  const isTrainingDay = trainedThatDay || (stored?.isTrainingDay ?? false)
  const day: DietDay = stored
    ? { ...stored, isTrainingDay }
    : dietDayFor(days, date, plan.id, isTrainingDay)
  const slots = slotsFor(plan, isTrainingDay)
  const summary = summarizeDietDay(plan, stored ? day : undefined)

  /**
   * 변형은 렌더 시점의 `day`가 아니라 **DB의 최신 상태**를 기준으로 적용한다
   * (useDiet.mutateDietDay 주석 — 연타 시 앞선 쓰기가 유실됐다).
   */
  const mutate = (fn: (d: DietDay) => DietDay) =>
    mutateDietDay(date, { ...day, isTrainingDay }, fn)

  const streak = planStreak(days, plan.id, today)
  const warnStreak = showStreakWarning && !plan.isDefault && streak >= LOW_KCAL_STREAK_WARN
  const openSlot = slots.find((s) => s.id === slotSheet)

  return (
    <>
      <div className="card">
        <button className="btn btn-sm diet-plan-btn" onClick={() => setPlanSheet(true)}>
          {plan.name} ▾
        </button>

        {/*
          훈련일/휴식일은 **세그먼트 컨트롤**이다 (G3). 이전엔 "훈련일 ⇄" 한 버튼이라
          현재 상태인지 누르면 바뀌는 값인지 화면에서 읽히지 않았다 (실사용 첫 피드백).
          끼니 수를 함께 적어 무엇이 달라지는지 보이게 하고, 아래 캡션이 규칙을 설명한다.
        */}
        <div className="segment diet-daytype">
          {([true, false] as const).map((training) => (
            <button
              key={String(training)}
              aria-pressed={isTrainingDay === training}
              disabled={trainedThatDay}
              onClick={() => mutate((d) => applyTrainingDay(d, training))}
            >
              {training ? '훈련일' : '휴식일'} · {slotsFor(plan, training).length}끼
            </button>
          ))}
        </div>
        <p className="row-sub diet-daytype-note">
          {trainedThatDay ? (
            <>
              <span aria-hidden="true">🔒 </span>
              운동 기록이 있어 훈련일로 고정됩니다
            </>
          ) : isTrainingDay ? (
            '훈련 전·직후 쉐이크가 별도 끼니입니다'
          ) : (
            '쉐이크·바나나를 오후 간식 한 번으로 합칩니다 (총량 동일)'
          )}
        </p>
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

      {warnStreak && (
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
        const grade = score === null ? 'none' : score >= 1 ? 'full' : score > 0 ? 'part' : 'zero'
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
                className={`diet-mark-btn diet-mark-${grade}`}
                aria-label={`${slot.name} 전부 먹음`}
                aria-pressed={grade === 'full'}
                onClick={() =>
                  mutate((d) =>
                    record && !record.substitution && !record.skipped && grade === 'full'
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
                대체: “{record.substitution.text}” · {QUALITY_LABEL[record.substitution.quality]}
              </p>
            )}
            {record?.addition && (
              <p className="row-sub diet-note">
                + 추가: “{record.addition.text}” · {QUALITY_LABEL[record.addition.quality]}
              </p>
            )}
          </div>
        )
      })}

      <div className="card">
        <div className="card-label">메모 (선택)</div>
        <input
          {...NO_AUTOFILL}
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

      {/*
        기록 삭제 (G4). 날짜 키를 덮어쓰는 편집으로 충분하다고 봤지만, 테스트 기록을
        정리할 방법이 없었다. 세션 삭제와 **같은 2단 확인 패턴**을 쓴다 —
        파괴적 동작의 조작이 화면마다 다르면 안 된다.
      */}
      {stored && (
        <div className="card">
          <div className="card-label">위험 구역</div>
          {confirmDelete ? (
            <>
              <p className="row-sub" style={{ color: 'var(--danger)' }}>
                이 날 식단 기록({summary.loggedSlots}슬롯)이 삭제됩니다. 되돌릴 수 없습니다.
              </p>
              <div className="btn-row">
                <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                  취소
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    removeDietDay(date)
                    setConfirmDelete(false)
                  }}
                >
                  정말 삭제
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>
              이 날 식단 기록 지우기
            </button>
          )}
        </div>
      )}

      {openSlot && (
        <DietSlotSheet
          slot={openSlot}
          record={day.slots[openSlot.id]}
          onCheckAll={() => mutate((d) => applyCheckAllItems(d, openSlot))}
          onSkip={() => mutate((d) => applySkipSlot(d, openSlot.id))}
          onSubstitute={(sub) => mutate((d) => applySubstitution(d, openSlot.id, sub))}
          onAddition={(add) => mutate((d) => applyAddition(d, openSlot.id, add))}
          onClearAddition={() => mutate((d) => applyClearAddition(d, openSlot.id))}
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
            // 미리 잡은 날은 planId만 정해둔다 — 슬롯 기록이 없으므로 판정은 "미기록"이다
            for (let i = 1; i <= count; i += 1) {
              const target = addDays(date, i)
              mutateDietDay(target, emptyDietDay(target, planId, false), (d) =>
                applyPlan(d, planId),
              )
            }
          }}
          onClose={() => setPlanSheet(false)}
        />
      )}
    </>
  )
}
