import { useState } from 'react'
import type { DietSlot, SlotQuality, SlotRecord } from '../types'
import { additionNote, QUALITY_LABEL, substitutionNote } from '../lib/diet'
import { NO_AUTOFILL } from '../lib/inputProps'

/**
 * 자가 태그 기준 — 앱이 음식을 판단하지 않으므로 기준을 사용자에게 그대로 보여준다.
 *
 * 라벨은 `diet.QUALITY_LABEL`에서 가져온다 (AA3) — 카드·내보내기와 같은 말이어야 한다.
 * 기준 문구(hint)는 입력 시점에만 필요하므로 여기 둔다.
 */
const QUALITY: { id: SlotQuality; hint: string }[] = [
  { id: 'similar', hint: '단백질원이 있었고 튀김·설탕 위주가 아니면 이쪽' },
  { id: 'other', hint: '계획과 다르지만 치팅은 아님' },
  { id: 'cheat', hint: '치팅인 걸 알고 먹음' },
]

/**
 * 슬롯 하나의 벌크 액션 (D2).
 *
 * 정상일의 주 경로는 **[전부 먹음]** 한 번이다 — 슬롯 6개 × 1탭으로 하루가 끝나야 한다
 * (마찰 기준 6~8탭). 대체·스킵은 예외 경로이므로 한 단계 안쪽에 둔다.
 */
/**
 * 대체와 추가는 **입력 형태가 같고 의미만 다르다** (텍스트 + 품질 3단).
 * 그래서 편집 폼 하나를 모드로 나눈다 — 두 벌로 만들면 기준 문구·검증이 갈라진다.
 */
type EditMode = 'substitution' | 'addition'

const MODE_COPY: Record<EditMode, { title: string; placeholder: string; hint: string }> = {
  substitution: {
    title: '무엇으로 대체했나요',
    placeholder: '예: 회사 근처 서브웨이 15cm 터키',
    hint: '계획된 끼니 **대신** 먹은 것',
  },
  addition: {
    title: '무엇을 더 먹었나요',
    placeholder: '예: 라면 반 개',
    hint: '계획을 먹은 **위에** 추가로 먹은 것',
  },
}

export default function DietSlotSheet({
  slot,
  record,
  onCheckAll,
  onSkip,
  onSubstitute,
  onAddition,
  onClearSubstitution,
  onClearAddition,
  onClear,
  onClose,
}: {
  slot: DietSlot
  record: SlotRecord | undefined
  onCheckAll: () => void
  onSkip: () => void
  onSubstitute: (sub: NonNullable<SlotRecord['substitution']>) => void
  onAddition: (add: NonNullable<SlotRecord['addition']>) => void
  onClearSubstitution: () => void
  onClearAddition: () => void
  onClear: () => void
  onClose: () => void
}) {
  /*
   * **시트는 항상 메뉴로 연다** (AA3).
   *
   * 예전엔 `record?.substitution ? 'substitution' : null`이었다 — 대체 기록이 있으면
   * 대체 편집 폼으로 바로 열려서 "추가로 먹었어요"가 화면에서 사라졌다. 모델은 대체와
   * 추가의 공존을 완전히 지원하는데(독립 필드 + `slotScore`의 합산) **시트가 경로를
   * 가린 것**이다. "뒤로"를 누르면 메뉴가 나오지만, 편집 폼으로 열린 시트에서 뒤로가
   * 메뉴로 간다는 것을 알 방법이 없다 — 사용자는 "무조건 대체에 기록해야 한다"고 읽었다.
   *
   * 초기 mode가 record에 의존하면 안 된다는 것이 이 항목의 규칙이고, 그래서
   * 소스 스캔이 그 의존을 금지한다 (uiConsistency.test.ts).
   */
  const [mode, setMode] = useState<EditMode | null>(null)
  const [text, setText] = useState('')
  const [quality, setQuality] = useState<SlotQuality>('similar')
  const canSave = text.trim().length > 0

  const openMode = (next: EditMode) => {
    const existing = next === 'substitution' ? record?.substitution : record?.addition
    setText(existing?.text ?? '')
    setQuality(existing?.quality ?? 'similar')
    setMode(next)
  }

  const act = (fn: () => void) => {
    fn()
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${slot.name} 기록`}
      >
        <div className="sheet-grip" />
        <div className="card-label">
          {slot.name} · {slot.timeHint}
        </div>

        {mode === null ? (
          <>
            {/*
              지금 기록 상태를 메뉴가 말한다 (AA3) — 무엇이 이미 적혀 있는지 모르면
              "수정"과 "지우기" 버튼이 무엇에 대한 것인지 알 수 없다.
              문구는 카드와 공유한다 (`diet.substitutionNote`) — 같은 사실은 같은 말로.
            */}
            {(record?.substitution || record?.addition || record?.skipped) && (
              <div className="row-sub diet-sheet-state">
                {record.skipped && <div>안 먹음</div>}
                {record.substitution && <div>{substitutionNote(record.substitution)}</div>}
                {record.addition && <div>{additionNote(record.addition)}</div>}
              </div>
            )}

            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => act(onCheckAll)}>
              전부 먹음 ({slot.items.length}개)
            </button>
            <div style={{ height: 8 }} />
            {/*
              대체와 추가가 **같은 모양의 행**을 갖는다 (AA3): [기록/수정] + [지우기].
              예전엔 추가만 지우기가 있었고 대체는 슬롯 전체 삭제밖에 없었다 —
              지우기가 비대칭이면 대체를 고치려고 추가까지 다시 적어야 한다.
            */}
            <div className="btn-row">
              <button className="btn" onClick={() => openMode('substitution')}>
                {record?.substitution ? '대체 수정' : '대체했어요'}
              </button>
              {record?.substitution && (
                <button className="btn" onClick={() => act(onClearSubstitution)}>
                  대체 지우기
                </button>
              )}
            </div>
            <div style={{ height: 8 }} />
            {/*
              추가는 대체와 별개 항목이다 (G2). 추가 섭취를 대체로 적으면
              "일부 대체"로 해석돼 점수가 부당하게 깎이고, 분석에서 결식·대체·과식을
              구분할 수 없다.
            */}
            <div className="btn-row">
              <button className="btn" onClick={() => openMode('addition')}>
                {record?.addition ? '추가 기록 수정' : '추가로 먹었어요'}
              </button>
              {record?.addition && (
                <button className="btn" onClick={() => act(onClearAddition)}>
                  추가 지우기
                </button>
              )}
            </div>
            <div style={{ height: 8 }} />
            <button className="btn" onClick={() => act(onSkip)}>
              안 먹음
            </button>
            {record && (
              <>
                <div style={{ height: 8 }} />
                <button className="btn" onClick={() => act(onClear)}>
                  기록 지우기
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="card-label" style={{ marginTop: 8 }}>
              {MODE_COPY[mode].title}
            </div>
            <p className="row-sub">
              {mode === 'addition' ? '계획을 먹은 위에 추가로' : '계획된 끼니 대신'} 먹은 것을
              그대로 적어주세요. 이 문장이 내보내기에 실려서 LLM이 패턴을 찾습니다
              (앱은 좋고 나쁨을 판단하지 않습니다).
            </p>
            <input
              {...NO_AUTOFILL}
              className="field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={MODE_COPY[mode].placeholder}
              aria-label={MODE_COPY[mode].title}
              autoFocus
            />

            <div className="card-label" style={{ marginTop: 14 }}>
              어느 쪽이었나요
            </div>
            <div className="check-list">
              {QUALITY.map((q) => (
                <button
                  key={q.id}
                  className={`check-item${quality === q.id ? ' check-item-on' : ''}`}
                  aria-pressed={quality === q.id}
                  onClick={() => setQuality(q.id)}
                >
                  <span className="check-box" aria-hidden="true">
                    {quality === q.id ? '✓' : ''}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="row-title">{QUALITY_LABEL[q.id]}</span>
                    <span className="row-sub">{q.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              disabled={!canSave}
              onClick={() =>
                act(() =>
                  mode === 'substitution'
                    ? onSubstitute({ text: text.trim(), quality })
                    : onAddition({ text: text.trim(), quality }),
                )
              }
            >
              저장
            </button>
            <div style={{ height: 8 }} />
            <button className="btn" onClick={() => setMode(null)}>
              뒤로
            </button>
          </>
        )}

        <div style={{ height: 8 }} />
        <button className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
