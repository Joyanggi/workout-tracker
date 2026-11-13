/** 첫 호출만 통과시킨다. 시트가 막 누름·타이머·animationend 어느 쪽으로 닫혀도 onClose가 한 번만 불리게 한다 (v1.19 QQ3). */
export function once<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let called = false
  return (...args: A) => {
    if (called) return
    called = true
    fn(...args)
  }
}
