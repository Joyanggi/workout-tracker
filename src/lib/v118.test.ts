import { describe, expect, it } from "vitest"
import { stripComments } from "./sourceScan"

/**
 * v1.18 PP — 유리 재질. 이 파일의 describe는 작업별(PP1, PP2)로 이어 붙는다.
 * 소스는 import.meta.glob(?raw)로 읽는다(`node:fs`는 DEV-RECORD 제약 13).
 * .css는 vitest에서 빈 문자열이라(제약 3) 규칙 검사는 scripts/screenshots-glass.mjs --check가 맡는다.
 */
const SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>

describe("PP1 — 유리는 CSS 토큰으로만 건다", () => {
  it("앱 코드(테스트 제외)에 backdropFilter·WebkitBackdropFilter·backdrop-filter가 없다", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !/\.test\.tsx?$/.test(path))
      .filter(([, text]) => /backdropFilter|WebkitBackdropFilter|backdrop-filter/i.test(stripComments(text)))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
