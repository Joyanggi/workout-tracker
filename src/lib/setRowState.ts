import type { SetRecord } from '../types'

/**
 * 세트 행의 표시 상태 (BB2·BB6).
 *
 * 둘 다 "행이 자기 상태를 말하지 않는다"는 같은 결함의 두 면이다:
 *   - BB2: 체크하면 **체크 버튼만** 초록이 되고 행은 무반응이라 "몇 세트 남았나"를
 *     훑어 읽을 수 없었다.
 *   - BB6: 무게 0인 채로 체크가 조용히 됐다. 프리필이 있는 종목에서는 드물지만
 *     **첫 노출·대체 종목에서는 실수 경로**다.
 *
 * 화면에 인라인 조건으로 두지 않는 이유는 v1.6에서 세운 것과 같다 — 규칙을 함수로 두면
 * 단위 테스트가 규칙을, 소스 스캔이 배선을 잡는다 (2층 잠금).
 */

/**
 * 완료 행 클래스.
 *
 * **워밍업 완료는 틴트를 주지 않는다.** `.set-row-warmup`이 opacity 0.62를 걸어 두므로
 * 그 위의 저알파 틴트는 실측에서 배경과 구분되지 않는다 (계획서 BB2-3이 지목한 겹침).
 * 워밍업은 세트 번호 색만 바뀐다 — 어차피 볼륨·PR에 들어가지 않는 세트라 "남은 작업
 * 세트를 훑는" 목적에도 방해가 되지 않는다.
 */
export function setRowClass(set: SetRecord | undefined): string {
  const done = set?.done === true
  return [
    'set-row',
    set?.warmup ? 'set-row-warmup' : '',
    done ? (set?.warmup ? 'set-row-done-warmup' : 'set-row-done') : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * 무게 미입력 힌트 (BB6).
 *
 * **막지 않는다.** 운동 중 모달·확인은 적대적이고, 맨몸 예외가 없다고 단정할 수 없다 —
 * 실패의 방향은 현상 유지여야 한다 (X5에서 세운 것). 기록은 되고 표시만 한다.
 *
 * **inverse 종목은 제외한다.** 어시스티드 풀업의 보조 무게 0은 실수가 아니라 **최고 난도
 * 달성**이다. 그 구분이 없어서 T11 하향 제안이 어시스티드를 더 어렵게 만든 적이 있다
 * (`weightScale.easierWeight` 주석) — 같은 함정을 여기서 반복하지 않는다.
 *
 * 체크 전에는 띄우지 않는다: 입력 중인 행에 경고를 미리 띄우면 정상 경로가 경고를 지나간다.
 */
export function zeroWeightHint(set: SetRecord | undefined, isInverse: boolean): boolean {
  if (isInverse) return false
  return set?.done === true && set.weight === 0
}
