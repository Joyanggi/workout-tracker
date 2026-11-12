import { describe, expect, it } from "vitest"
import { once } from "./once"

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

const MAIN = import.meta.glob("/src/main.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>

describe("QQ2 — 눌림·움직임", () => {
  it("main.tsx가 document에 빈 수동 touchstart 처리기를 단다 (iOS :active)", () => {
    const text = MAIN["/src/main.tsx"]
    expect(text).toMatch(/document\.addEventListener\('touchstart'/)
    expect(text).toMatch(/passive: true/)
  })
})

const COMPONENTS = import.meta.glob("/src/components/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>
const ALL_SRC = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("QQ3 — 시트 틀 하나", () => {
  // Astryx를 쓰지 않는 legacy 시트 = components/*Sheet.tsx 가운데 ../ax를 import하지 않고 SheetFrame 자신이 아닌 것
  const legacy = () =>
    Object.entries(COMPONENTS).filter(
      ([path, text]) => /Sheet\.tsx$/.test(path) && !/SheetFrame\.tsx$/.test(path) && !/from '\.\.\/ax/.test(text),
    )

  it("legacy 시트 14개가 전부 SheetFrame을 import하고 sheet-backdrop 글자가 0건이다", () => {
    const files = legacy()
    expect(files.length).toBe(14)
    const offenders = files
      .filter(([, text]) => !/import \{ SheetFrame \} from '\.\/SheetFrame'/.test(text) || /sheet-backdrop/.test(stripComments(text)))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it("sheet-backdrop·className=\"sheet\"·sheet-grip이 나오는 .tsx는 SheetFrame.tsx 하나뿐이다", () => {
    const hits = Object.entries(ALL_SRC)
      .filter(([path, text]) => /\.tsx$/.test(path) && /sheet-backdrop|className="sheet"|sheet-grip/.test(stripComments(text)))
      .map(([path]) => path)
    expect(hits).toEqual(["/src/components/SheetFrame.tsx"])
  })

  it("14개 시트에 onClick={onClose}·onClick={() => onClose()}가 0건이다 (닫기 버튼은 dismiss를 부른다)", () => {
    const offenders = legacy()
      .filter(([, text]) => /onClick=\{onClose\}|onClick=\{\(\) => onClose\(\)\}/.test(stripComments(text)))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it("useSheetDismiss라는 이름이 src에 0건이다 (훅을 두지 않는다 — dismiss는 렌더 프롭)", () => {
    const hits = Object.entries(ALL_SRC)
      .filter(([path, text]) => !/v119\.test\.ts$/.test(path) && /useSheetDismiss/.test(text))
      .map(([path]) => path)
    expect(hits).toEqual([])
  })

  it("SheetFrame.tsx가 ../ax·Astryx 패키지를 import하지 않는다 (헬스장 경로)", () => {
    const text = stripComments(COMPONENTS["/src/components/SheetFrame.tsx"])
    // 글자를 쪼갠 것은 v117 OO2 스캔(src/ax 밖 import 금지)이 이 테스트 파일을 위반으로 세지 않게 하려는 것
    expect(text).not.toMatch(new RegExp("from '\\.\\./ax|@astryx" + "design"))
  })

  it("SheetFrame이 닫힘을 once로 감싸고 움직임 줄이기면 기다리지 않는다 (두 번 누르기·animationend 안 옴 대비)", () => {
    const text = stripComments(COMPONENTS["/src/components/SheetFrame.tsx"])
    expect(text).toMatch(/once\(/)
    expect(text).toMatch(/prefers-reduced-motion: reduce/)
    expect(text).toMatch(/setTimeout\(finish/)
  })

  it("once는 두 번 불러도 한 번, 다른 인자로 불러도 한 번만 통과시킨다", () => {
    const calls: number[] = []
    const f = once((n: number) => calls.push(n))
    f(1)
    f(1)
    f(2)
    expect(calls).toEqual([1])
  })
})

describe("QQ4 — 여백 토큰 한 벌", () => {
  // .css는 vitest에서 빈 문자열이라(제약 3) space.css의 import·값은 ui-check 정적 검사가 읽는다.
  // 여기서는 그 검사가 빠지지 않고 ui-check에 물려 있는지를 잠근다.
  const LIB = import.meta.glob("/scripts/lib/ui-space.mjs", { query: "?raw", import: "default", eager: true }) as Record<string, string>
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

  it("ui-check 정적 검사가 space.css의 layer(legacy) import를 확인한다", () => {
    const text = code(LIB["/scripts/lib/ui-space.mjs"])
    expect(text).toContain("space\\.css")
    expect(text).toContain("layer\\(legacy\\)")
  })

  it("ui-check 정적 검사가 여백 값의 Astryx 단계·--inset- 사용·토큰 순서를 모두 본다", () => {
    const text = code(LIB["/scripts/lib/ui-space.mjs"])
    expect(text).toMatch(/STEPS = new Set\(\[0, 2, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48\]\)/)
    expect(text).toContain("var\\(--inset-")
    expect(text).toMatch(/t\['space-tight'\] < t\['space-row'\]/)
  })

  it("ui-check.mjs가 정적 검사와 여백 한 벌 비교를 부른다", () => {
    const text = code(SCRIPTS["/scripts/ui-check.mjs"])
    expect(text).toMatch(/spaceStaticChecks\(allCss\)/)
    expect(text).toMatch(/spaceSetVerdicts\(layouts\)/)
  })
})

describe("QQ5 — 인라인 여백을 클래스로", () => {
  const TSX = Object.entries(ALL_SRC).filter(([p]) => p.endsWith(".tsx") && !/\.test\./.test(p))
  // 여러 줄로 적힌 style={{ … }}도 잡도록 [\s\S]*? (한 줄 [^}]*는 SubstituteSheet의 여러 줄 style을 놓쳤다)
  const STYLE = /style=\{\{[\s\S]*?\}\}/g
  const SPACE_KEY = /\b(margin(Top|Bottom|Left|Right|Inline|Block)?|padding(Top|Bottom|Left|Right|Inline|Block)?|gap|rowGap|columnGap)\s*:/
  // 예외 목록은 비워 둔다. 필요하면 파일:줄과 이유로 더하고 리뷰어가 본다.
  const ALLOWED: string[] = []
  const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length

  it("src/**/*.tsx에 인라인 여백(margin·padding·gap) 키가 0건이다", () => {
    expect(TSX.length).toBeGreaterThan(40) // 스캔이 아무것도 안 읽은 것이 아니다
    const hits: string[] = []
    for (const [path, text] of TSX) {
      for (const m of text.matchAll(STYLE)) {
        const at = `${path}:${lineOf(text, m.index ?? 0)}`
        if (SPACE_KEY.test(m[0]) && !ALLOWED.includes(at)) hits.push(at)
      }
    }
    expect(hits).toEqual([])
  })

  it("자식 없는 빈 칸 <div style={{ height: N }} />이 0건이다", () => {
    const hits: string[] = []
    for (const [path, text] of TSX) {
      for (const m of text.matchAll(/<div\s+style=\{\{\s*height:\s*\d+\s*\}\}\s*\/>/g)) {
        hits.push(`${path}:${lineOf(text, m.index ?? 0)}`)
      }
    }
    expect(hits).toEqual([])
  })

  it("스캔 정규식이 여러 줄 style과 gap을 잡는다 (SubstituteSheet 사례)", () => {
    const sample = "<span style={{\n  flex: 1,\n  gap: 2,\n}}>"
    const m = sample.match(STYLE)
    expect(m).not.toBeNull()
    expect(SPACE_KEY.test(m![0])).toBe(true)
    expect(SPACE_KEY.test("style={{ marginTop: 10 }}")).toBe(true)
    expect(SPACE_KEY.test("style={{ color: 'red', whiteSpace: 'normal' }}")).toBe(false)
  })

  it("space.css 유틸 클래스가 쓰이는 이름만 있다 (.tsx가 붙인 mt-·mb-·ml-·mr- 클래스는 정의된 여덟 개 안이다)", () => {
    const known = new Set(["mt-row", "mt-group", "mt-section", "mb-row", "mb-group", "ml-inline", "mr-inline", "ml-auto"])
    const used = new Set<string>()
    for (const [, text] of TSX) for (const m of text.matchAll(/\b(m[tblr]-[a-z]+)\b/g)) used.add(m[1])
    expect([...used].filter((c) => !known.has(c))).toEqual([])
  })
})
