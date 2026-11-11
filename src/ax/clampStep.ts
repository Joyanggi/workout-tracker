import { stepDown, stepUp } from '../lib/weightScale'

/**
 * `Stepper`의 − ＋ 버튼이 만드는 다음 값. 더하기·빼기는 `weightScale`의 `stepUp`·`stepDown`을 쓴다
 * (`NumberStepper`와 같은 계산 — 사본을 만들지 않는다). Astryx를 import하지 않아 테스트가 패키지를 읽지 않는다.
 */
export function clampStep(
  value: number,
  dir: -1 | 1,
  step: number,
  min: number,
  max: number,
): number {
  return Math.min(
    max,
    Math.max(min, dir === 1 ? stepUp(value, { step }) : stepDown(value, { step })),
  )
}
