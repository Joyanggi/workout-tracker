import { describe, expect, it } from 'vitest'
import { NO_AUTOFILL } from './inputProps'

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
