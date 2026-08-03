import { describe, expect, it } from 'vitest'
import { AUTOFILL_UNKNOWN_TOKEN, NO_AUTOFILL } from './inputProps'

/**
 * 모든 텍스트 입력에 자동완성 억제가 적용돼 있는지 (G5).
 *
 * 소스 스캔으로 검사하는 이유: 새 `<input>`을 추가할 때 spread를 빠뜨리는 것이
 * 이 프로젝트에서 반복된 실패 방식이다 (워밍업 제외·대체 해석·어시스티드 방향 —
 * 전부 "한 곳만 빠뜨려 조용히 틀린" 사례였다). 관례 주석은 두 번 뚫렸으므로
 * 테스트로 막는다.
 *
 * 예외를 두지 않는다 — 숫자 입력도 iOS가 연락처 필드로 오인할 수 있다
 * (실사용 피드백이 세트 무게 필드에서 나왔다).
 */

/**
 * 소스를 읽는 방법: `import.meta.glob(..., '?raw')`.
 * `node:fs`를 쓰면 앱 tsconfig에 node 타입이 없어 `npm run build`가 깨진다
 * (그 빌드가 유일한 타입 검증 경로다 — DEV-RECORD 주의사항).
 */
const sources = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const files = Object.keys(sources).sort()

describe('자동완성 억제 전수 적용', () => {
  it('input·textarea 개수와 NO_AUTOFILL spread 개수가 같다', () => {
    const counts = files.map((f) => {
      const src = sources[f]
      return {
        file: f,
        fields: (src.match(/<(?:input|textarea)\b/g) ?? []).length,
        spreads: (src.match(/\{\.\.\.NO_AUTOFILL\}/g) ?? []).length,
      }
    })
    const missing = counts.filter((c) => c.fields !== c.spreads)
    expect(
      missing,
      `NO_AUTOFILL이 빠진 입력이 있습니다 (spread를 추가하세요):\n${missing
        .map((m) => `  ${m.file}: 입력 ${m.fields}개 / spread ${m.spreads}개`)
        .join('\n')}`,
    ).toEqual([])

    // 스캔 자체가 헛돌지 않는지 (입력이 하나도 안 잡히면 정규식이 깨진 것)
    expect(counts.reduce((n, c) => n + c.fields, 0)).toBeGreaterThan(10)
  })

  it('name 속성을 쓰지 않는다 — iOS가 그 이름으로 필드 종류를 추측한다', () => {
    const offenders = files.filter((f) => /\sname="/.test(sources[f]))
    expect(offenders).toEqual([])
  })

  it('네 속성이 모두 들어 있다', () => {
    expect(NO_AUTOFILL).toEqual({
      autoComplete: 'off',
      autoCorrect: 'off',
      autoCapitalize: 'off',
      spellCheck: false,
    })
  })
})

/**
 * W1 1차 실험의 **범위**를 고정한다.
 *
 * 조사 결과 머신 세팅 메모는 이미 `NO_AUTOFILL`을 받고 있었다 — 속성 누락이 아니다.
 * 그래서 남은 변수는 `autocomplete` 값 자체이고, 비표준 토큰으로 우회를 시도한다.
 *
 * 이 테스트가 지키는 것은 "고쳤다"가 아니라 **"한 곳만 바꿨다"**다.
 * 여러 곳에 동시에 넣으면 실기기에서 효과가 있어도 무엇이 들었는지 알 수 없다.
 */
describe('W1 1차 실험 — 한 필드만 다르게 둔다', () => {
  const overrides = files.flatMap((f) =>
    (sources[f].match(/autoComplete=\{AUTOFILL_UNKNOWN_TOKEN\}/g) ?? []).map(() => f),
  )

  it('덮어쓴 필드가 정확히 하나다', () => {
    expect(overrides).toEqual(['/src/components/ExerciseCard.tsx'])
  })

  it('비표준 토큰이다 — 표준 값이면 iOS가 필드 종류를 추론한다', () => {
    const STANDARD = ['off', 'on', 'name', 'username', 'email', 'tel', 'new-password']
    expect(STANDARD).not.toContain(AUTOFILL_UNKNOWN_TOKEN)
  })

  it('spread를 대체하지 않고 뒤에서 덮는다 (개수 불변식 유지)', () => {
    const src = sources['/src/components/ExerciseCard.tsx']
    const spreadAt = src.indexOf('{...NO_AUTOFILL}')
    const overrideAt = src.indexOf('autoComplete={AUTOFILL_UNKNOWN_TOKEN}')
    expect(spreadAt).toBeGreaterThan(-1)
    // JSX는 뒤에 온 prop이 이긴다 — 순서가 뒤바뀌면 실험이 무효다
    expect(overrideAt).toBeGreaterThan(spreadAt)
  })
})
