import { describe, expect, it } from "vitest"

/**
 * v1.19 QQ — 유리·움직임·여백. 이 파일의 describe는 작업별(QQ0, QQ1…)로 이어 붙는다.
 * 소스는 import.meta.glob(?raw)로 읽는다(`node:fs`는 DEV-RECORD 제약 13).
 */
const SCRIPTS = import.meta.glob("/scripts/*.mjs", { query: "?raw", import: "default", eager: true }) as Record<string, string>
const WORKFLOWS = import.meta.glob("/.github/workflows/*.yml", { query: "?raw", import: "default", eager: true }) as Record<string, string>

describe("QQ0 — UI 검사 도구", () => {
  it("argos-upload.mjs는 토큰을 명령줄(--token)로 넘기지 않는다", () => {
    const text = SCRIPTS["/scripts/argos-upload.mjs"]
    expect(text).toBeTruthy()
    // 주석의 설명 문장은 빼고 코드만 본다
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/--token/)
    expect(code).toMatch(/process\.env\.ARGOS_TOKEN/)
  })

  it("CI 워크플로에 argos가 없다 (CI에 넣지 않는다 — v1.17 결정)", () => {
    const offenders = Object.entries(WORKFLOWS)
      .filter(([, text]) => /argos/i.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

const SCREENS = import.meta.glob("/src/screens/SettingsScreen.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>

describe("QQ1 — 유리 재료", () => {
  it("SettingsScreen이 glassDiagnosis를 부르고 '유리' 줄을 가진다", () => {
    const text = SCREENS["/src/screens/SettingsScreen.tsx"]
    expect(text).toMatch(/glassDiagnosis\(readGlassDiagInput\(\)\)/)
    expect(text).toMatch(/row-title">유리</)
  })
})
