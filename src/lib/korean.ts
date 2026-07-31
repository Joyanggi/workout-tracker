/**
 * 한국어 조사 선택.
 *
 * 내보낸 Markdown은 사용자가 반복해서 읽고 LLM에게 붙여넣는 문서다(§1).
 * "레터럴 레이즈을"처럼 틀린 조사가 매 세션 반복되면 눈에 거슬린다.
 * (§6 예시의 "레터럴을"은 자음으로 끝나서 우연히 맞았을 뿐이다)
 */

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const JONGSEONG_COUNT = 28

/** 마지막 글자에 종성(받침)이 있는가. 한글이 아니면 null */
export function hasFinalConsonant(word: string): boolean | null {
  const last = word.trim().slice(-1)
  if (!last) return null
  const code = last.charCodeAt(0)
  if (code < HANGUL_START || code > HANGUL_END) return null
  return (code - HANGUL_START) % JONGSEONG_COUNT !== 0
}

/**
 * 목적격 조사. 받침 있으면 "을", 없으면 "를".
 * 한글이 아닌 경우(영문 종목명 등)는 "를"로 둔다 — 한국어에서 외래어 뒤 기본형에 가깝다.
 */
export function objectParticle(word: string): '을' | '를' {
  return hasFinalConsonant(word) === true ? '을' : '를'
}

/** 주격 조사. 받침 있으면 "이", 없으면 "가". */
export function subjectParticle(word: string): '이' | '가' {
  return hasFinalConsonant(word) === true ? '이' : '가'
}

export function withObjectParticle(word: string): string {
  return `${word}${objectParticle(word)}`
}
