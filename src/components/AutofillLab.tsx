import { useState } from 'react'
import { AUTOFILL_UNKNOWN_TOKEN, NO_AUTOFILL } from '../lib/inputProps'

/**
 * 자동완성 억제 실험대 (W1).
 *
 * 두 번의 실사용 보고로 **내 분석이 반박됐다**:
 * - 1차 보고: 머신 세팅 메모(순수 텍스트)에 연락처 제안이 뜬다
 * - 2차 보고: **유산소 "분" 입력에도** 뜬다 — 이 필드는 `inputMode="numeric"`이다.
 *   나는 "숫자 키패드에는 제안 바가 없으니 숫자 입력은 원래 안전하다"고 적었는데
 *   **사실이 아니었다.** 종류를 가리지 않는다는 뜻이다.
 *
 * 한 번에 여러 처방을 배포하고 "고쳐졌나"를 묻는 것은 정보가 없다. 그래서 처방마다
 * 필드를 하나씩 두고 **한 화면에서 비교**한다. 특히 **대조군(F)** 이 중요하다 —
 * F에서만 제안이 뜨면 `NO_AUTOFILL`이 일하고 있다는 뜻이고, A와 F가 같으면 아무 일도
 * 안 하고 있다는 뜻이다. 그걸 모르면 다음 수를 정할 수 없다.
 *
 * ⚠ 이 화면의 입력은 **아무것도 저장하지 않는다.** 키보드를 띄워 보는 용도다.
 */

interface Probe {
  key: string
  label: string
  hint: string
  props: Record<string, unknown>
}

/** 대조군 F는 억제 속성을 일부러 하나도 주지 않는다 */
const PROBES: Probe[] = [
  {
    key: 'A',
    label: 'A · 현행 (텍스트)',
    hint: '머신 세팅 메모와 같은 조건',
    props: { ...NO_AUTOFILL },
  },
  {
    key: 'B',
    label: 'B · 비표준 토큰',
    hint: `autocomplete="${AUTOFILL_UNKNOWN_TOKEN}" — 1차 실험과 같은 조건`,
    props: { ...NO_AUTOFILL, autoComplete: AUTOFILL_UNKNOWN_TOKEN },
  },
  {
    key: 'C',
    label: 'C · type=search',
    hint: '검색 필드에는 제안이 안 붙는 경향 (계획서 2차)',
    props: { ...NO_AUTOFILL, type: 'search' },
  },
  {
    key: 'D',
    label: 'D · type=number',
    hint: '순수 숫자 키패드 — "분" 입력의 대안',
    props: { ...NO_AUTOFILL, type: 'number' },
  },
  {
    key: 'E',
    label: 'E · inputMode=numeric (현행)',
    hint: '유산소 "분" 입력과 같은 조건 — 재현용',
    props: { ...NO_AUTOFILL, inputMode: 'numeric' },
  },
  {
    key: 'F',
    label: 'F · 억제 없음 (대조군)',
    hint: '여기서만 뜬다면 A가 일하고 있다는 뜻',
    props: {},
  },
]

export default function AutofillLab() {
  const [values, setValues] = useState<Record<string, string>>({})

  return (
    <div className="card">
      <div className="card-label">입력 자동완성 실험 (W1)</div>
      <p className="row-sub" style={{ whiteSpace: 'normal', marginBottom: 8 }}>
        각 칸을 탭해 키보드를 띄워 보고, <b>연락처·이름 제안이 뜨는 칸의 글자</b>를 알려주세요
        (예: &quot;A와 E에서 뜨고 나머지는 안 뜬다&quot;). 특히 <b>F(대조군)</b>에서 뜨는지가
        중요합니다 — F에서만 뜨면 현행 억제가 효과가 있다는 뜻입니다.
        이 칸들은 아무것도 저장하지 않습니다.
      </p>
      {PROBES.map((p) => (
        <div key={p.key} style={{ marginTop: 10 }}>
          <div className="row-sub" style={{ whiteSpace: 'normal' }}>
            <b>{p.label}</b> — {p.hint}
          </div>
          <input
            {...p.props}
            className="field"
            value={values[p.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
            aria-label={`자동완성 실험 ${p.key}`}
            placeholder={`${p.key} — 탭해서 키보드 확인`}
          />
        </div>
      ))}
    </div>
  )
}
