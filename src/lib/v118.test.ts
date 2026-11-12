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

describe("PP2 — 시트는 규칙 하나로 유리가 된다", () => {
  const sheetFiles = () =>
    Object.entries(SOURCES).filter(([path, text]) => /^\/src\/components\/[^/]*Sheet\.tsx$/.test(path) && /sheet-backdrop/.test(stripComments(text)))

  it("sheet-backdrop을 쓰는 시트 파일 14개 전부가 className=\"sheet\"를 가진다 (다른 클래스로 갈라지면 .sheet 규칙이 닿지 않는다)", () => {
    const files = sheetFiles()
    expect(files.length).toBe(14)
    const offenders = files.filter(([, text]) => !/className="sheet"/.test(stripComments(text))).map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it("ax/index.tsx의 Sheet가 BottomSheet에 className·style·xstyle을 넘기지 않는다 (넘기면 키보드 대응이 꺼진다)", () => {
    const text = stripComments(SOURCES["/src/ax/index.tsx"])
    const start = text.indexOf("<BottomSheet")
    const end = text.indexOf("</BottomSheet>")
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = text.slice(start, end)
    expect(block).not.toMatch(/\b(className|style|xstyle)\s*=/)
  })
})
