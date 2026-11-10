#!/usr/bin/env node
// 코드 품질 검사 — 품질 관리자(agents/QUALITY-KEEPER.md)가 읽을 곳을 좁히고, CI가 새로 생긴 흔적을 막는다.
//
// AI가 코드를 고칠 때 옛 코드를 지우지 않고 옆에 새로 짜거나, 테스트만 살려 두거나, 검사를 꺼서 넘어가는 흔적을 찾는다.
// - 중복 정의: 같은 이름의 최상위 함수·상수가 src의 두 파일 이상에 있다 (공용 함수를 두고 복사본을 만든 흔적)
// - 테스트에서만 쓰이는 export: 앱 코드는 아무도 안 부르는데 테스트가 살려 두는 코드
// - 아무도 안 쓰는 export
// - 건너뛴 테스트(.only/.skip/.todo), @ts-ignore·@ts-nocheck, eslint-disable
// - 무력화: 늘 같은 조건(if (false) 등)으로 꺼 둔 코드, any로 타입 검사 피하기, 이유 없이 빈 catch
// - 호환 분기 표지("옛 루틴", "KK 이전", LEGACY_ 등) 파일별 개수 — 버전마다 쌓이는 분기
//
// 사용: node scripts/quality-scan.mjs          → 보고서(마크다운)
//       node scripts/quality-scan.mjs --ci     → 막을 것이 있으면 종료 코드 1 (CI)
// 알고 있는 중복은 scripts/quality-allow.json에 이유와 함께 적는다. 정리되면 그 줄을 지운다.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOP_DECL = /^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_DECL = /^export\s+(?:async\s+)?(?:function\*?|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
const SKIPPED_TEST = /\b(?:it|test|describe)\.(only|skip|todo)\s*\(/g;
const COMPAT_MARK = /옛 (?:루틴|세션|모양|기록|백업)|\b[A-Z]{2} 이전|v\d+\.\d+(?:\.\d+)? 이전|\bLEGACY_[A-Z_]+/g;
// 무력화: 고치는 대신 꺼 두거나 피해 가는 흔적. 주석·문자열 안은 세지 않는다(stripComments).
const NEUTRALIZE = [
  { kind: '늘 같은 조건', re: /\b(?:if|while)\s*\(\s*(?:false|true|0|1|!0|!1)\s*\)|&&\s*false\b|\|\|\s*true\b/g, fix: '조건으로 꺼 두지 말고 안 쓰는 코드를 지운다' },
  { kind: 'any', re: /\bas\s+any\b|:\s*any\b|<any>/g, fix: 'unknown으로 받고 좁히거나, 맞는 타입을 쓴다' },
  // 주석만 있는 catch는 이유를 적은 것이라 통과한다. 그래서 이것만 주석을 지우기 전 글에서 찾는다.
  { kind: '빈 catch', re: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g, fix: '오류를 처리하거나, 무시해도 되는 이유를 catch 안에 주석으로 적는다', raw: true },
];

/** 줄 주석·블록 주석·문자열을 같은 길이의 공백으로 바꾼다(위치는 그대로). 대충이지만 이 검사에는 충분하다. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, (m) =>
    m.startsWith('/*') || m.startsWith('//') ? m.replace(/[^\n]/g, ' ') : m[0] + m.slice(1, -1).replace(/[^\n]/g, ' ') + m.slice(-1),
  );
}

const isTest = (path) => /\.test\.[cm]?[jt]sx?$/.test(path);
const escape = (s) => s.replace(/[$]/g, '\\$');
const count = (text, re) => (text.match(re) ?? []).length;

/** 이름이 글 안에 낱말로 몇 번 나오는가 */
function uses(text, name) {
  return count(text, new RegExp(`(?<![\\w$])${escape(name)}(?![\\w$])`, 'g'));
}

/**
 * 파일 목록을 검사한다. 파일 시스템을 모르는 순수 함수라 테스트에서 그대로 부른다.
 * @param {{ path: string, text: string }[]} files  src와 scripts의 .ts/.tsx/.mjs 파일
 * @param {{ duplicates?: Record<string, string>, testSupport?: string[] }} allow
 *   duplicates: 알고 있는 중복과 이유 / testSupport: 테스트 전용 도우미 파일(테스트에서만 쓰이는 게 정상)
 */
export function scan(files, allow = {}) {
  const app = files.filter((f) => f.path.startsWith('src/') && !isTest(f.path));
  const tests = files.filter((f) => isTest(f.path));
  const allowed = allow.duplicates ?? {};
  const testSupport = new Set(allow.testSupport ?? []);

  // 1. 중복 정의
  const defined = new Map();
  for (const f of app) {
    for (const m of f.text.matchAll(TOP_DECL)) {
      const list = defined.get(m[1]) ?? [];
      if (!list.includes(f.path)) list.push(f.path);
      defined.set(m[1], list);
    }
  }
  const duplicates = [...defined].filter(([, paths]) => paths.length > 1).map(([name, paths]) => ({ name, paths, allowed: name in allowed }));
  const staleAllow = Object.keys(allowed).filter((name) => !duplicates.some((d) => d.name === name));

  // 2·3. export 사용처
  const testOnly = [];
  const unused = [];
  for (const f of app) {
    if (testSupport.has(f.path)) continue;
    for (const m of f.text.matchAll(EXPORT_DECL)) {
      const name = m[1];
      const inApp = app.reduce((n, g) => n + uses(g.text, name) - (g === f ? 1 : 0), 0);
      if (inApp > 0) continue;
      const inTests = tests.reduce((n, g) => n + (uses(g.text, name) > 0 ? 1 : 0), 0);
      (inTests > 0 ? testOnly : unused).push({ name, path: f.path, tests: inTests });
    }
  }

  // 4. 건너뛴 테스트, 검사 끄기
  const skipped = [];
  for (const f of tests) for (const m of f.text.matchAll(SKIPPED_TEST)) skipped.push({ path: f.path, kind: m[1] });
  const tsIgnore = app
    .filter((f) => /@ts-(?:ignore|nocheck)/.test(f.text))
    .map((f) => ({ path: f.path, n: count(f.text, /@ts-(?:ignore|nocheck)/g) }));

  // 4-1. 무력화
  const neutralized = [];
  for (const f of app) {
    const code = stripComments(f.text);
    for (const rule of NEUTRALIZE) {
      const n = count(rule.raw ? f.text : code, rule.re);
      if (n > 0) neutralized.push({ path: f.path, kind: rule.kind, n, fix: rule.fix });
    }
  }
  const lintOff = app.filter((f) => f.text.includes('eslint-disable')).map((f) => ({ path: f.path, n: count(f.text, /eslint-disable/g) }));

  // 5. 호환 분기 표지
  const compat = app
    .map((f) => ({ path: f.path, n: count(f.text, COMPAT_MARK) }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);

  return { files: app.length, duplicates, staleAllow, testOnly, unused, skipped, tsIgnore, neutralized, lintOff, compat };
}

/** CI가 막을 것. 새 중복(허용 목록 밖), 건너뛴 테스트, @ts-ignore·@ts-nocheck, 무력화 */
export function ciFailures(result) {
  const out = [];
  for (const d of result.duplicates.filter((x) => !x.allowed)) {
    out.push(`중복 정의 ${d.name}: ${d.paths.join(', ')} — 이미 있는 것을 import해서 쓴다. 정말 따로 있어야 하면 scripts/quality-allow.json에 이유를 적는다`);
  }
  for (const s of result.skipped) out.push(`건너뛴 테스트 .${s.kind}: ${s.path} — 테스트를 꺼서 통과시키지 않는다`);
  for (const t of result.tsIgnore) out.push(`@ts-ignore·@ts-nocheck ${t.n}개: ${t.path} — 타입 오류를 고치거나, 정말 필요하면 이유를 단 @ts-expect-error를 쓴다`);
  for (const z of result.neutralized) out.push(`${z.kind} ${z.n}개: ${z.path} — ${z.fix}`);
  return out;
}

/** 품질 관리자가 읽는 보고서 */
export function report(result) {
  const lines = [`# 품질 검사 (src 파일 ${result.files}개)`, ''];
  const section = (title, rows, fmt) => {
    lines.push(`## ${title} (${rows.length})`);
    for (const r of rows) lines.push(`- ${fmt(r)}`);
    lines.push('');
  };
  section('중복 정의', result.duplicates, (d) => `${d.name}: ${d.paths.join(', ')}${d.allowed ? ' (허용 목록)' : ''}`);
  if (result.staleAllow.length) section('허용 목록에 남은 정리된 항목 (지운다)', result.staleAllow, (n) => n);
  section('테스트에서만 쓰이는 export', result.testOnly, (e) => `${e.path}: ${e.name} (테스트 파일 ${e.tests}개)`);
  section('아무도 안 쓰는 export', result.unused, (e) => `${e.path}: ${e.name}`);
  section('건너뛴 테스트', result.skipped, (s) => `${s.path}: .${s.kind}`);
  section('@ts-ignore·@ts-nocheck', result.tsIgnore, (t) => `${t.path}: ${t.n}`);
  section('무력화 (늘 같은 조건·any·빈 catch)', result.neutralized, (z) => `${z.path}: ${z.kind} ${z.n}`);
  section('eslint-disable', result.lintOff, (t) => `${t.path}: ${t.n}`);
  section('호환 분기 표지 (파일별)', result.compat, (c) => `${c.path}: ${c.n}`);
  return lines.join('\n');
}

function listFiles(dir, root) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, root));
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push({ path: relative(root, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') });
  }
  return out;
}

function main() {
  const root = process.cwd();
  const files = [...listFiles(join(root, 'src'), root), ...listFiles(join(root, 'scripts'), root)];
  let allow = {};
  try {
    allow = JSON.parse(readFileSync(join(root, 'scripts/quality-allow.json'), 'utf8'));
  } catch {
    // 없으면 빈 목록
  }
  const result = scan(files, allow);
  if (process.argv.includes('--ci')) {
    const fails = ciFailures(result);
    for (const s of result.staleAllow) console.log(`알림: 허용 목록의 ${s}는 이제 중복이 아니다. scripts/quality-allow.json에서 지운다`);
    if (fails.length) {
      console.error(`[quality-scan] 막음 ${fails.length}건\n- ${fails.join('\n- ')}`);
      process.exit(1);
    }
    console.log('[quality-scan] 통과');
    return;
  }
  console.log(report(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
