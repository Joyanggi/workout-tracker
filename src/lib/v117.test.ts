import { describe, expect, it } from "vitest"
import { clampStep } from "../ax/clampStep"
import { AX_NO_AUTOFILL, NO_AUTOFILL } from "./inputProps"
import { stripComments } from "./sourceScan"
import { stepUp } from "./weightScale"

/**
 * v1.17 OO — Astryx 바탕 + 루틴 편집 화면.
 * 이 파일의 describe는 작업별(OO2, OO3)로 이어 붙는다.
 * 소스는 import.meta.glob(?raw)로 읽는다. .css는 ?raw로 읽으면 빈 문자열이라(DEV-RECORD 제약 3)
 * CSS는 빌드 출력으로 확인한다.
 */
const SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>
const PKG = import.meta.glob("/package.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>
const src = (path: string) => stripComments(SOURCES["/" + path] ?? "")
const raw = (path: string) => SOURCES["/" + path] ?? ""
const pkg = JSON.parse(PKG["/package.json"]) as { dependencies: Record<string, string> }

describe("OO2 — Astryx 바탕", () => {
  it("package.json: Astryx 두 패키지는 0.7.13 정확한 버전이고 서로 같다, stylex도 캐럿이 없다", () => {
    const core = pkg.dependencies["@astryxdesign/core"]
    const theme = pkg.dependencies["@astryxdesign/theme-neutral"]
    expect(core).toBe("0.7.13")
    expect(theme).toBe("0.7.13")
    expect(core).toBe(theme)
    for (const v of [core, theme, pkg.dependencies["@stylexjs/stylex"]]) {
      expect(v).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it("clampStep: 경계와 스텝", () => {
    expect(clampStep(10, 1, 1, 1, 10)).toBe(10)
    expect(clampStep(1, -1, 1, 1, 10)).toBe(1)
    expect(clampStep(90, 1, 15, 0, 600)).toBe(105)
    expect(clampStep(0, -1, 15, 0, 600)).toBe(0)
    expect(clampStep(5, 1, 1, 1, 10)).toBe(stepUp(5, { step: 1 }))
  })

  it("clampStep.ts는 Astryx도 ./index도 import하지 않는다, 이 테스트도 ax 진입점을 읽지 않는다", () => {
    const s = src("src/ax/clampStep.ts")
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toContain("@astryxdesign")
    expect(s).not.toMatch(/from\s+['"]\.\/index['"]/)
    // 자기 자신이 패턴에 걸리지 않도록 정규식을 조각으로 만든다
    const entry = new RegExp("from\\s+['\"]\\.\\./ax(/index)?['\"]")
    expect(src("src/lib/v117.test.ts")).not.toMatch(entry)
  })

  it("AX_NO_AUTOFILL은 NO_AUTOFILL을 따른다", () => {
    expect(AX_NO_AUTOFILL.autoComplete).toBe(NO_AUTOFILL.autoComplete)
    expect(AX_NO_AUTOFILL.autoCapitalize).toBe(NO_AUTOFILL.autoCapitalize)
    expect(AX_NO_AUTOFILL.hasAutoCorrect).toBe(NO_AUTOFILL.autoCorrect !== "off")
    expect(AX_NO_AUTOFILL.hasSpellCheck).toBe(NO_AUTOFILL.spellCheck)
  })

  it("AX_NO_AUTOFILL 정의는 NO_AUTOFILL.을 네 번 쓰고 리터럴 값을 직접 적지 않는다", () => {
    const s = src("src/lib/inputProps.ts")
    const m = s.match(/export const AX_NO_AUTOFILL = \{[\s\S]*?\} as const/)
    expect(m).not.toBeNull()
    const body = m![0]
    expect(body.match(/NO_AUTOFILL\./g)?.length).toBe(4)
    expect(body).not.toMatch(/:\s*'off'/) // `!== 'off'` 비교는 허용, 값으로 적는 것만 막는다
    expect(body).not.toMatch(/:\s*(false|true)\b/)
  })

  it("src/ax/index.tsx는 TextInput·NumberInput을 다시 내보내지 않는다", () => {
    const s = src("src/ax/index.tsx")
    const exports = s.match(/^export\s*\{[^}]*\}(\s*from\s*['"][^'"]+['"])?/gm) ?? []
    expect(exports.length).toBeGreaterThan(0)
    for (const e of exports) {
      expect(e).not.toMatch(/\bTextInput\b|\bNumberInput\b/)
      expect(e).not.toMatch(/\/(TextInput|NumberInput)['"]/)
    }
  })

  it("isIconOnly 버튼마다 같은 태그 안에 icon=이 있고, Stepper는 감소·증가 이름을 쓴다", () => {
    const s = src("src/ax/index.tsx")
    // 자기닫힘 `/>`가 줄 맨 앞에 오는 형식이라 줄 시작의 `/>`까지를 한 태그로 본다
    const iconOnly = (s.match(/<Button\b[\s\S]*?\n\s*\/>/g) ?? []).filter((t) => t.includes("isIconOnly"))
    expect(iconOnly.length).toBeGreaterThanOrEqual(2)
    for (const t of iconOnly) expect(t).toContain("icon=")
    expect(s).toContain("`${label} 감소`")
    expect(s).toContain("`${label} 증가`")
  })

  it("@astryxdesign/을 import하는 파일은 src/ax/ 밖에 없다", () => {
    const offenders = Object.keys(SOURCES).filter(
      (p) => !p.startsWith("/src/ax/") && p !== "/src/lib/v117.test.ts" && /@astryxdesign\//.test(stripComments(SOURCES[p])),
    )
    expect(offenders).toEqual([])
  })

  it("main.tsx·App.tsx는 Astryx를 정적으로 읽지 않고, main.tsx는 styles/index.css를 읽는다", () => {
    for (const f of ["src/main.tsx", "src/App.tsx"]) {
      const s = src(f)
      expect(s).not.toContain("@astryxdesign")
      expect(s).not.toMatch(/from\s+['"]\.{1,2}\/ax(\/[^'"]*)?['"]/)
      expect(s).not.toMatch(/^\s*import\s+['"]\.{1,2}\/ax/m)
    }
    const main = raw("src/main.tsx")
    expect(main).toContain("./styles/index.css")
    expect(main).not.toContain("global.css")
  })

  it("AxRoot는 mode=system만 쓰고 reset.css·fonts.css를 읽지 않는다", () => {
    const s = src("src/ax/index.tsx")
    expect(s).toContain('mode="system"')
    expect(s).not.toContain('mode="dark"')
    expect(s).not.toContain('mode="light"')
    expect(s).not.toMatch(/reset\.css|fonts\.css/)
  })

  it("TextField·Stepper 정의에 자동완성 억제가 있다", () => {
    const s = src("src/ax/index.tsx")
    const textField = s.match(/export function TextField[\s\S]*?\n}\n/)
    const stepper = s.match(/export function Stepper[\s\S]*?\n}\n/)
    expect(textField![0]).toContain("AX_NO_AUTOFILL")
    // PLAN은 autoComplete="off" 리터럴이었지만 X5·Y2 스캔이 필드별 autoComplete=를 막아 NO_AUTOFILL 파생 값으로 대체
    expect(stepper![0]).toContain("NUMBER_AUTOFILL")
    expect(s).toMatch(/const NUMBER_AUTOFILL = \{ autoComplete: AX_NO_AUTOFILL\.autoComplete \}/)
  })
})
