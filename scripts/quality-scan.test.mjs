// scripts/quality-scan.mjs — AI가 남기는 흔적(복사본, 테스트만 살려 둔 코드, 꺼진 테스트)을 찾고 CI가 새로 생긴 것을 막는지 잠근다.
import { describe, expect, it } from 'vitest';
import { ciFailures, report, scan } from './quality-scan.mjs';

const f = (path, text) => ({ path, text });

describe('quality-scan: 중복 정의', () => {
  const files = [
    f('src/lib/derive.ts', 'export function orderDeviations(s) {\n  return s\n}\n'),
    f('src/screens/Summary.tsx', 'import x from "y"\nfunction orderDeviations(s) {\n  return s\n}\nexport default function Summary() { return orderDeviations(1) }\n'),
    f('src/lib/a.ts', 'export function helper() {\n  const orderDeviations = 1\n  return orderDeviations\n}\n'),
  ];

  it('같은 이름의 최상위 함수가 두 파일에 있으면 중복이다 (들여쓴 지역 변수는 세지 않는다)', () => {
    const r = scan(files);
    expect(r.duplicates).toEqual([{ name: 'orderDeviations', paths: ['src/lib/derive.ts', 'src/screens/Summary.tsx'], allowed: false }]);
  });

  it('허용 목록 밖의 중복은 CI가 막는다', () => {
    expect(ciFailures(scan(files))).toHaveLength(1);
    expect(ciFailures(scan(files, { duplicates: { orderDeviations: '정리 예정' } }))).toEqual([]);
  });

  it('정리돼서 더는 중복이 아닌 허용 항목을 알린다', () => {
    const r = scan([files[0]], { duplicates: { orderDeviations: '정리 예정' } });
    expect(r.staleAllow).toEqual(['orderDeviations']);
  });

  it('테스트 파일 안의 정의는 세지 않는다', () => {
    const r = scan([files[0], f('src/lib/derive.test.ts', 'function orderDeviations() {}\n')]);
    expect(r.duplicates).toEqual([]);
  });
});

describe('quality-scan: export 사용처', () => {
  const files = [
    f('src/lib/m.ts', 'export function used() {}\nexport function onlyTests() {}\nexport function nobody() {}\nexport type Local = number\nconst v: Local = 1\n'),
    f('src/screens/S.tsx', 'import { used } from "../lib/m"\nused()\n'),
    f('src/lib/m.test.ts', 'import { onlyTests } from "./m"\nonlyTests()\n'),
    f('src/lib/testFixtures.ts', 'export function fixture() {}\n'),
    f('src/lib/x.test.ts', 'fixture()\n'),
  ];
  const r = scan(files, { testSupport: ['src/lib/testFixtures.ts'] });

  it('앱 코드는 안 부르고 테스트만 부르는 export를 찾는다', () => {
    expect(r.testOnly).toEqual([{ name: 'onlyTests', path: 'src/lib/m.ts', tests: 1 }]);
  });

  it('아무도 안 쓰는 export를 찾는다. 자기 파일 안에서 쓰면 쓰는 것이다', () => {
    expect(r.unused.map((e) => e.name)).toEqual(['nobody']);
  });

  it('테스트 도우미 파일은 테스트에서만 쓰여도 잡지 않는다', () => {
    expect(r.testOnly.some((e) => e.name === 'fixture')).toBe(false);
  });

  it('export 사용처는 보고만 하고 CI를 막지 않는다', () => {
    expect(ciFailures(r)).toEqual([]);
  });
});

describe('quality-scan: 꺼진 테스트와 검사 끄기', () => {
  it.each(['only', 'skip', 'todo'])('it.%s는 CI가 막는다', (kind) => {
    const r = scan([f('src/lib/a.test.ts', `it.${kind}('x', () => {})\n`)]);
    expect(ciFailures(r)).toHaveLength(1);
  });

  it('@ts-ignore는 CI가 막고, eslint-disable은 보고만 한다', () => {
    const r = scan([f('src/lib/a.ts', '// @ts-ignore\nconst a = 1\n'), f('src/lib/b.ts', '// eslint-disable-next-line\nconst b = 1\n')]);
    expect(ciFailures(r)).toHaveLength(1);
    expect(r.lintOff).toEqual([{ path: 'src/lib/b.ts', n: 1 }]);
  });
});

describe('quality-scan: 무력화 (고치지 않고 꺼 두거나 피해 간 흔적)', () => {
  it.each([
    ['if (false) {\n  old()\n}\n', '늘 같은 조건'],
    ['while (true) {}\n', '늘 같은 조건'],
    ['const on = flag && false\n', '늘 같은 조건'],
    ['const x = (data as any).weight\n', 'any'],
    ['function f(x: any) { return x }\n', 'any'],
    ['try {\n  run()\n} catch (e) {}\n', '빈 catch'],
    ['try { run() } catch {\n}\n', '빈 catch'],
  ])('%j는 CI가 막는다 (%s)', (code, kind) => {
    const r = scan([f('src/lib/a.ts', code)]);
    expect(r.neutralized.map((z) => z.kind)).toEqual([kind]);
    expect(ciFailures(r)).toHaveLength(1);
  });

  it('이유를 주석으로 적은 catch, 주석·문자열 속 낱말, 테스트 파일은 잡지 않는다', () => {
    const r = scan([
      f('src/lib/a.ts', 'try { run() } catch {\n  /* 프라이빗 모드에서는 저장이 막힌다 */\n}\n// if (false) 로 끄지 않는다\nconst msg = "as any || true"\n'),
      f('src/lib/a.test.ts', 'const x = y as any\n'),
    ]);
    expect(r.neutralized).toEqual([]);
    expect(ciFailures(r)).toEqual([]);
  });

  it('@ts-nocheck도 @ts-ignore처럼 막는다', () => {
    expect(ciFailures(scan([f('src/lib/a.ts', '// @ts-nocheck\nconst a = 1\n')]))).toHaveLength(1);
  });
});

describe('quality-scan: 호환 분기 표지', () => {
  it('버전마다 쌓이는 "옛 모양" 분기를 파일별로 센다', () => {
    const r = scan([f('src/lib/setPlan.ts', '// 옛 루틴은\n// KK 이전 세션\n// v1.12 이전\nconst LEGACY_RETURN_PROTOCOL = 1\n')]);
    expect(r.compat).toEqual([{ path: 'src/lib/setPlan.ts', n: 4 }]);
    expect(report(r)).toContain('src/lib/setPlan.ts: 4');
  });
});
