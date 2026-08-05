/**
 * 인덱스를 바꾸는 조작 **전에** 편집 중인 입력을 커밋시킨다 (v1.7 후속 1).
 *
 * 왜 필요한가. `ExerciseCard`는 세트 행을 `key={i}`로 렌더하고, 워밍업 추가는
 * `applyAddSet(opts.warmup)`이 `[set, ...entry.sets]`로 **앞에 삽입**한다 —
 * 즉 모든 인덱스가 하나씩 밀린다. `NumberStepper`는 타이핑 중 값을 **로컬 `text` 상태**에
 * 들고 있다가 blur에서 커밋하므로, 커밋 전에 인덱스가 밀리면 그 로컬 상태가 원래 세트를
 * 떠나 **새로 들어온 워밍업 행의 숫자로 보인다.** 실측에서 화면 40 / DB 0이었다 (v1.7 §3.2).
 *
 * 지금까지 이것이 사고로 이어지지 않은 이유는 "버튼을 탭하면 입력이 먼저 blur된다"였는데,
 * 그건 **브라우저 동작에 대한 추정**이었다. 특히 Safari는 버튼 탭에 포커스를 주지 않는
 * 것으로 알려져 있어, 입력이 포커스를 유지한 채 click이 도는 경로가 있을 수 있다.
 * 한 줄로 추정을 사실로 바꾼다: 우리가 직접 blur시키고, 그 다음에 배열을 바꾼다.
 *
 * **순서가 이 함수의 전부다.** `blur()`는 focusout을 동기적으로 발생시키고 React가 같은
 * 태스크에서 `onBlur`를 호출하므로, 반환 시점에는 커밋(store 쓰기)이 이미 끝나 있다.
 * 세션 스토어의 `update`는 매번 `get().session`을 다시 읽으므로 뒤따르는 배열 변경이
 * 그 커밋 위에 얹힌다.
 *
 * 왜 `+ 세트`·`− 세트`에는 안 붙이나: 둘 다 **끝**을 만지므로 앞선 인덱스가 밀리지 않는다.
 * 규칙은 "인덱스를 미는 조작"이지 "세트 수를 바꾸는 조작"이 아니다.
 */
/*
 * `instanceof HTMLElement`를 쓰지 않는다 — DOM이 없는 환경(vitest는 node)에서는
 * **HTMLElement 자체가 없어서** `null instanceof HTMLElement`가 ReferenceError를 던진다.
 * 존재 여부를 확인하는 코드가 확인하려는 그 부재로 죽는 형태였고, 테스트가 잡았다.
 */
export function commitPendingEdits(): void {
  if (typeof document === 'undefined') return
  const active = document.activeElement as { blur?: () => void } | null
  active?.blur?.()
}
