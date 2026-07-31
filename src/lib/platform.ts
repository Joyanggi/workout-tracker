/** 홈 화면에 추가된 standalone 웹앱으로 실행 중인가 */
export function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari 전용 레거시 플래그
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  const ua = window.navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+는 Mac으로 위장한다 (터치 지원 여부로 구분)
  return ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1
}

/**
 * §11 리스크: 홈 화면 미추가 상태의 Safari는 7일 미사용 시 ITP로 IndexedDB를
 * 지울 수 있다. standalone이 아니면 데이터 유실 경고를 계속 노출한다.
 */
export function storageAtRisk(): boolean {
  return isIOS() && !isStandalone()
}
