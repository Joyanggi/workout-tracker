import { useState } from 'react'
import DietPlanSheet from './DietPlanSheet'
import DietSlotSheet from './DietSlotSheet'
import DietVariantSheet from './DietVariantSheet'
import { addDays } from '../lib/dates'
import {
  additionNote,
  ADHERENCE_MARK,
  SLOT_MARK,
  slotGrade,
  hasVariants,
  isReducedPlan,
  itemVariant,
  LOW_KCAL_STREAK_WARN,
  planStreak,
  slotScore,
  slotsFor,
  substitutionNote,
  summarizeDietDay,
  variantChoicesFor,
} from '../lib/diet'
import {
  applyAddition,
  applyCheckAllItems,
  applyClearAddition,
  applyClearSlot,
  applyClearSubstitution,
  applyNote,
  applyPlan,
  applySkipSlot,
  applySubstitution,
  applyToggleItem,
  applyVariantChoice,
  emptyDietDay,
  seedVariantChoices,
} from '../lib/dietOps'
import {
  dietDayFor,
  findPlan,
  mutateDietDay,
  rememberVariantDefault,
  removeDietDay,
} from '../lib/useDiet'
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
export default function DietDayEditor({
  date,
  plans,
  days,
  defaultPlanId,
  /**
   * 그 날짜에 완료 세션이 있었는가.
   *
   * DD2 이후 **화면에는 훈련일/휴식일 조작이 없다** (매일 같은 5끼). 이 값은 새로 만드는
   * 기록의 `isTrainingDay` 기본값으로만 쓴다 — 옛 플랜을 쓰는 과거 날짜의 판정이
   * `useDiet`의 정규화와 같은 답을 내야 하고, 둘 다 `strengthDates`를 원천으로 쓴다.
   */
  trainedThatDay,
  /** 연속 저칼로리 경고는 오늘 화면에서만 의미가 있다 */
  showStreakWarning = false,
  today,
  /** 마지막으로 고른 단백질원 변형 (DD3 5-b) — 미기록 슬롯의 초기 표시에만 쓴다 */
  variantDefaults,
}: {
  date: string
  plans: DietPlan[]
  days: DietDay[]
  defaultPlanId: string | null
  trainedThatDay: boolean
  showStreakWarning?: boolean
  today: string
  variantDefaults: Record<string, number>
}) {
  const [slotSheet, setSlotSheet] = useState<string | null>(null)
  const [variantSheet, setVariantSheet] = useState<{ slotId: string; itemId: string } | null>(null)
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
   *
   * 모든 변경 뒤에 `seedVariantChoices`를 한 번 통과시킨다 (DD3) — 기록이 생기는 순간
   * 화면에 보였던 단백질원이 기록에 새겨져야 한다. op마다 부르면 새 op에서 빠뜨린다.
   */
  const mutate = (fn: (d: DietDay) => DietDay) =>
    mutateDietDay(date, { ...day, isTrainingDay }, (d) =>
      seedVariantChoices(fn(d), slots, variantDefaults),
    )

  const streak = planStreak(days, plan.id, today)
  const warnStreak =
    showStreakWarning && isReducedPlan(plan, plans) && streak >= LOW_KCAL_STREAK_WARN
  const openSlot = slots.find((s) => s.id === slotSheet)
  const openVariant = variantSheet
    ? (() => {
        const slot = slots.find((s) => s.id === variantSheet.slotId)
        const item = slot?.items.find((i) => i.id === variantSheet.itemId)
        return slot && item ? { slot, item } : null
      })()
    : null

  return (
    <>
      <div className="card">
        <button className="btn btn-sm diet-plan-btn" onClick={() => setPlanSheet(true)}>
          {plan.name} ▾
        </button>

        {/*
          훈련일/휴식일 세그먼트가 **없어졌다** (DD2). 루틴 문서 15장이 2026-08-06에
          끼니 배치를 통일했다: 두 구성의 총량·단백질이 완전히 같았고 차이는 쉐이크 배치뿐인데,
          실사용에서 훈련일에 휴식일 식단을 먹는 실수가 났고 생리학적 차이는 없었다.
          "매일 같은 숫자가 지키기 쉽다"는 이행률 원칙을 구성까지 확장한 것이고,
          그래서 화면에서 고를 것도 잠글 것도 없다 — 매일 같은 5끼다.
          (옛 플랜을 쓰는 과거 날짜는 저장된 구성 그대로 판정된다)
        */}
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
            : /*
                 퍼센트를 함께 낸다 (Z6) — 마크만으로는 0.86과 1.0이 같아 보인다.
                 연속 점수를 만들어도 표시가 3단이면 그 정밀도가 화면에 도달하지 않는다.
               */
              `준수 ${ADHERENCE_MARK[summary.adherence]} ${Math.round((summary.score ?? 0) * 100)}%`}
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
        /*
          마크·임계값을 화면이 들고 있지 않는다 (Z6) — `diet.ts`의 `slotGrade`·`SLOT_MARK`가
          단일 기준이다. 화면이 자기 임계값을 가지면 슬롯 마크와 일 요약이 다른 기준으로 말한다.
        */
        const grade = slotGrade(score)
        const mark = SLOT_MARK[grade]
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
              {/*
                품목 표기는 **고른 변형**을 따른다 (DD3). 기록이 있으면 기록의 선택,
                없으면 기억된 기본값 — `variantChoicesFor` 한 곳이 그 우선순위를 정한다.
              */}
              {(() => {
                const choices = variantChoicesFor(slot, record, variantDefaults)
                return slot.items.map((item) => {
                  const on = record?.checkedItemIds.includes(item.id) ?? false
                  const variant = itemVariant(item, choices[item.id])
                  return (
                    <div className="diet-item-group" key={item.id}>
                      <button
                        className={`diet-item${on ? ' diet-item-on' : ''}`}
                        aria-pressed={on}
                        onClick={() => mutate((d) => applyToggleItem(d, slot.id, item.id))}
                      >
                        <span aria-hidden="true">{on ? '☑' : '☐'}</span>
                        <span>
                          {variant.name} <span className="row-sub">{variant.qty}</span>
                        </span>
                      </button>
                      {/*
                        변형 선택은 **예외 경로**다 (DD3.2) — 정상일 마찰(슬롯당 1탭)을
                        건드리지 않도록 별도 버튼 하나로만 열린다.

                        라벨에 글자를 넣는다: 처음엔 "▾"만 뒀는데 375px 실측에서 **빈 칸에
                        점 하나**로 읽혔다 (체크박스처럼 보였다). BB1의 기어 아이콘이
                        해였던 것과 같은 실패 — 아이콘은 그린 것이 아니라 읽히는 것으로
                        판정한다.
                      */}
                      {hasVariants(item) && (
                        <button
                          className="diet-variant-btn"
                          aria-label={`${slot.name} ${item.name} 다른 단백질원으로 바꾸기`}
                          onClick={() => setVariantSheet({ slotId: slot.id, itemId: item.id })}
                        >
                          바꾸기 ▾
                        </button>
                      )}
                    </div>
                  )
                })
              })()}
            </div>

            {/* 문구는 시트의 상태 요약과 공유한다 (AA3) — 같은 사실은 같은 말 */}
            {record?.skipped && <p className="row-sub diet-note">안 먹음</p>}
            {record?.substitution && (
              <p className="row-sub diet-note">{substitutionNote(record.substitution)}</p>
            )}
            {record?.addition && (
              <p className="row-sub diet-note">{additionNote(record.addition)}</p>
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
          onClearSubstitution={() => mutate((d) => applyClearSubstitution(d, openSlot.id))}
          onClearAddition={() => mutate((d) => applyClearAddition(d, openSlot.id))}
          onClear={() => mutate((d) => applyClearSlot(d, openSlot.id))}
          onClose={() => setSlotSheet(null)}
        />
      )}

      {openVariant && (
        <DietVariantSheet
          slot={openVariant.slot}
          item={openVariant.item}
          choice={variantChoicesFor(openVariant.slot, day.slots[openVariant.slot.id], variantDefaults)[
            openVariant.item.id
          ]}
          onPick={(index) => {
            /*
             * 두 곳에 쓴다 (DD3 5-b): 이 날 기록(있을 때만)과 **다음 날의 기본값**.
             * 기록이 없는 슬롯에는 기록을 만들지 않는다 — 먹기 전 선택이 0점으로
             * 집계되면 안 된다 (`applyVariantChoice` 주석).
             */
            mutate((d) => applyVariantChoice(d, openVariant.slot.id, openVariant.item.id, index))
            rememberVariantDefault(openVariant.slot.id, openVariant.item.id, index)
          }}
          onClose={() => setVariantSheet(null)}
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
