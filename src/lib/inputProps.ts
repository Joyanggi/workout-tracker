/**
 * iOS 자동완성(QuickType 연락처 제안) 억제 (G5).
 *
 * iOS는 이름 없는 텍스트 필드를 연락처 필드로 오인해 키보드 위에 이름·주소 제안을 띄운다.
 * 세트 무게를 입력하는데 연락처가 뜨는 것이 실사용 피드백이었다.
 *
 * **한 객체로 모아 전 필드에 spread한다.** 필드마다 손으로 네 속성을 적으면
 * 새 입력을 추가할 때 반드시 하나를 빠뜨린다 — 이 프로젝트에서 같은 부류를
 * 여러 번 겪었다 (워밍업 제외, 대체 해석, 어시스티드 방향).
 *
 * ⚠ **실험 종결 (X5·Y2): iOS 연락처 제안은 웹 속성으로 막을 수 없다.**
 * 실험대에 여섯 조합을 나란히 세워 실기기에서 확인했다 — 표준 `off` · 비표준 토큰 ·
 * `type="search"` · `type="number"` · `inputMode="numeric"` · **억제 없음(대조군)**.
 * **여섯 칸 모두 제안이 떴다.** 그래서 더 파지 않고 플랫폼 제약으로 수용했다
 * (README Limitations).
 *
 * 이 객체를 남겨 두는 이유: 실패한 것은 "iOS 연락처 제안 억제"라는 **목표**다.
 * `autoCorrect`·`spellCheck` 끄기는 한글 메모 입력에서 여전히 유용하고, 데스크톱
 * 브라우저에서는 `autocomplete="off"`가 실제로 듣는다. 목표 실패가 다른 효용까지 지우지 않는다.
 *
 * (이 주석은 v1.2에 `inputMode`도 이 조합에 든다고 적었는데 **사실이 아니다** — 이 객체는
 * `inputMode`를 설정하지 않는다. 숫자 키패드는 `NumberStepper`가 따로 지정한다.
 * W1 조사에서 발견해 바로잡았다.)
 *
 * `name`은 **일부러 넣지 않는다** — 넣는 순간 iOS가 그 이름으로 필드 종류를 추측한다.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
} as const
