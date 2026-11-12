import { describe, expect, it } from 'vitest'
import { glassDiagnosis, type GlassDiagInput } from './glassDiag'

const base: GlassDiagInput = {
  supportsBlur: true,
  supportsWebkitBlur: true,
  computed: 'saturate(1.8) blur(20px) brightness(0.6)',
  reduceTransparency: false,
  moreContrast: false,
}

describe('glassDiagnosis — QQ1 진단 줄 다섯 갈래', () => {
  it('대비 증가가 켜짐 → 꺼짐 (대비 증가)', () => {
    expect(glassDiagnosis({ ...base, moreContrast: true })).toEqual({ label: '꺼짐 (대비 증가)', sub: null })
  })
  it('투명도 줄이기 → 꺼짐 (투명도 줄이기)', () => {
    expect(glassDiagnosis({ ...base, reduceTransparency: true })).toEqual({ label: '꺼짐 (투명도 줄이기)', sub: null })
  })
  it('대비 증가와 투명도 줄이기가 둘 다 참이면 대비 증가가 먼저다', () => {
    expect(glassDiagnosis({ ...base, moreContrast: true, reduceTransparency: true }).label).toBe('꺼짐 (대비 증가)')
  })
  it('두 supports가 다 거짓 → 이 브라우저는 흐림 미지원', () => {
    expect(glassDiagnosis({ ...base, supportsBlur: false, supportsWebkitBlur: false })).toEqual({ label: '꺼짐 (이 브라우저는 흐림 미지원)', sub: null })
  })
  it.each(['none', null, '', '  '])('computed가 %j → 흐림이 적용되지 않음', (computed) => {
    expect(glassDiagnosis({ ...base, computed }).label).toBe('꺼짐 (흐림이 적용되지 않음)')
  })
  it('적용되지 않음의 sub는 지원 종류를 말한다 (표준·webkit·둘 다)', () => {
    expect(glassDiagnosis({ ...base, computed: 'none' }).sub).toBe('흐림 지원: 둘 다')
    expect(glassDiagnosis({ ...base, computed: 'none', supportsWebkitBlur: false }).sub).toBe('흐림 지원: 표준')
    expect(glassDiagnosis({ ...base, computed: 'none', supportsBlur: false }).sub).toBe('흐림 지원: webkit')
  })
  it("computed가 'saturate(1.8) blur(20px)'면 흐림 선언됨이고 sub가 그 값이다", () => {
    expect(glassDiagnosis({ ...base, computed: 'saturate(1.8) blur(20px)' })).toEqual({ label: '흐림 선언됨', sub: 'saturate(1.8) blur(20px)' })
  })
  it('어떤 입력에도 label이 "켜짐"을 내지 않는다 (그려졌다고 말하지 않는다)', () => {
    for (const moreContrast of [true, false])
      for (const reduceTransparency of [true, false])
        for (const supportsBlur of [true, false])
          for (const supportsWebkitBlur of [true, false])
            for (const computed of [null, 'none', 'blur(4px)']) {
              const { label } = glassDiagnosis({ moreContrast, reduceTransparency, supportsBlur, supportsWebkitBlur, computed })
              expect(label).not.toMatch(/켜짐/)
            }
  })
})
