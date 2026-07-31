/**
 * 파일 선택 (JSON 복원 · 루틴 가져오기).
 *
 * `<input type="file">`을 DOM에 붙였다 떼는 방식. iOS Safari는 input이 document에
 * 연결돼 있지 않으면 파일 선택창을 열지 않는 경우가 있어서 body에 붙인 뒤 제거한다.
 */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)

    let settled = false
    const finish = (value: { name: string; text: string } | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(value)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      void file
        .text()
        .then((text) => finish({ name: file.name, text }))
        .catch(() => finish(null))
    })

    // 사용자가 선택창을 취소하면 change가 오지 않는다. 창이 닫히는 시점을 알 수 없으니
    // 포커스 복귀로 추정해 정리한다 (남겨두면 input이 계속 쌓인다).
    window.addEventListener(
      'focus',
      () => window.setTimeout(() => finish(null), 500),
      { once: true },
    )

    input.click()
  })
}
