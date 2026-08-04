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
const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** 컴포넌트만 세는 검사용 (lib의 .ts는 입력을 그리지 않는다) */
const files = Object.keys(sources)
  .filter((f) => f.endsWith('.tsx'))
  .sort()

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

/**
 * X5·Y2 종결 — **모든 입력이 같은 처방을 쓴다.**
 *
 * 실험대(6칸, 대조군 포함)에서 여섯 조합 모두 제안이 떴다 → 속성 레벨 처방은 무효로 확정.
 * 그래서 이 필드만 달랐던 두 처방을 지웠다: 비표준 토큰(`autocomplete="nope"`)과
 * readOnly 트릭. 리뷰어 판정: "무효가 실증된 처방을 남기면 '왜 이 필드만 다르지'가
 * 다음 사람의 조사 대상이 된다." 지금은 `NO_AUTOFILL` 하나뿐이고 그 사실 자체가 문서다.
 */
describe('X5·Y2 종결 — 예외 없는 단일 처방', () => {
  it('autoComplete를 따로 덮어쓰는 필드가 없다', () => {
    const offenders = files.filter((f) => /autoComplete=/.test(sources[f]))
    expect(
      offenders,
      `속성 레벨 처방은 무효로 확정됐습니다 (실험대 6칸 전부 제안이 떴다).\n` +
        `필드별 예외를 두면 "왜 이 필드만 다르지"가 다음 조사 대상이 됩니다:\n` +
        offenders.map((f) => `  ${f}`).join('\n'),
    ).toEqual([])
  })

  it('readOnly 트릭이 남아 있지 않다', () => {
    /*
      기대 이익이 거의 0인데(해제가 한 macrotask 뒤라 readOnly 창이 사실상 0) 그 경로에는
      **필드가 영구히 readOnly로 남아 입력이 불가능해지는** 실패 모드가 있었다
      (검증에서 재현했다 — 창에 OS 포커스가 없으면 activeElement는 설정되지만 focus
      이벤트가 배달되지 않는다). 운동 중 유일하게 타이핑하는 필드에 남길 값이 없다.

      되살리려면 이 테스트를 지워야 하는데, 그때 위 이유를 다시 읽게 된다.
    */
    const src = sources['/src/components/ExerciseCard.tsx']
    expect(src).not.toMatch(/readOnly=\{/)
    expect(src).not.toMatch(/setSetupLocked/)
  })

  it('종결 사실이 코드에 기록돼 있다 (다음 사람이 다시 파지 않게)', () => {
    // 실험을 되살리려는 사람이 먼저 읽어야 하는 문장
    expect(sources['/src/lib/inputProps.ts'] ?? '').toMatch(/여섯 칸 모두 제안이 떴다/)
  })
})
