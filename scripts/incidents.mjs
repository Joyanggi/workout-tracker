#!/usr/bin/env node
// 규칙 메모 모으기 — PR 본문의 `## 규칙 메모`와 PR·이슈 댓글의 `## 규칙 메모 (추가)`에서
// `- [분류] 단계: 무슨 일 → 어떻게 넘김 (키: <키>)` 줄을 모아, 키마다 몇 번 나왔는지와
// docs/INCIDENTS.md 대장의 상태(열림·막음·재발)를 한 표로 보인다. 규칙 정비자(agents/RULES-KEEPER.md)가 쓴다.
//
//   node scripts/incidents.mjs [--after-pr <번호>] [--limit 60]
//   node scripts/incidents.mjs --keys     대장에 있는 키만 찍는다(지휘자가 메모에 쓸 키를 고를 때. gh가 필요 없다)
//
// --after-pr: 그 PR(보통 지난 규칙 정비 PR)보다 뒤에 머지된 PR과, 그 PR이 머지된 뒤에 달린 댓글만 센다.
// 같은 PR 안에서 같은 키가 여러 번 나와도 PR 하나로 센다(횟수 = 나온 PR·이슈 수).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CATEGORIES = ['명령', '환경', '일꾼', '규칙', '반려', '검사', '사람'];
const LINE_RE = /^\s*[-*]\s*\[([^\]]+)\]\s*(.+?)\s*\(키:\s*([a-z0-9][a-z0-9-]*)\)\s*$/;

/** 글에서 `## 규칙 메모`로 시작하는 절(다음 `## ` 머리까지)들의 목록 줄을 뽑는다. */
export function memoLines(text) {
  const out = [];
  let inMemo = false;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (/^##\s/.test(raw)) {
      inMemo = /^##\s*규칙 메모/.test(raw);
      continue;
    }
    if (!inMemo || !/^\s*[-*]\s+\S/.test(raw)) continue;
    const line = raw.trim();
    if (/^[-*]\s*없음\.?$/.test(line)) continue;
    const m = LINE_RE.exec(line);
    out.push(m ? { category: m[1].trim(), text: m[2].trim(), key: m[3] } : { category: null, text: line.replace(/^[-*]\s*/, ''), key: null });
  }
  return out;
}

/**
 * docs/INCIDENTS.md의 표 줄 `| \`키\` | 분류 | 상태 | 막은 방법 | 막은 PR | 나온 곳 |`을 읽는다.
 * "다른 이름" 표의 줄 `| \`다른 키\` | \`원래 키\` |`은 ledger.aliases(Map)에 담는다 — 같은 원인에 지휘자가 다른 이름을 지어 쓴 것이다.
 */
export function parseLedger(md) {
  const ledger = new Map();
  ledger.aliases = new Map();
  const KEY = /^`([a-z0-9][a-z0-9-]*)`$/;
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim());
    const key = KEY.exec(cells[1] ?? '')?.[1];
    if (!key) continue;
    const target = KEY.exec(cells[2] ?? '')?.[1];
    if (target) {
      ledger.aliases.set(key, target);
      continue;
    }
    // '이번 정비' = 막은 PR 번호를 아직 모른다(정비 PR을 만들기 전). 번호가 채워질 때까지 재발로 올리지 않는다
    const fixedPr = /이번 정비/.test(cells[5] ?? '') ? Infinity : Number(/#(\d+)/.exec(cells[5] ?? '')?.[1] ?? 0);
    ledger.set(key, { category: cells[2], status: cells[3], fix: cells[4], fixedPr, seen: cells[6] ?? '' });
  }
  return ledger;
}

/**
 * sources: [{ ref: '#39', number: 39, text }] (PR 본문·댓글, 이슈 댓글)
 * 반환: { rows: [{ key, category, count, refs, status, recurred, isNew, sample }], unkeyed: [{ ref, text }] }
 */
export function aggregate(sources, ledger = new Map()) {
  const byKey = new Map();
  const unkeyed = [];
  for (const src of sources) {
    for (const m of memoLines(src.text)) {
      if (!m.key) {
        unkeyed.push({ ref: src.ref, text: m.text });
        continue;
      }
      const key = ledger.aliases?.get(m.key) ?? m.key;
      const row = byKey.get(key) ?? { key, category: m.category, refs: [], numbers: [], sample: m.text };
      if (!row.refs.includes(src.ref)) {
        row.refs.push(src.ref);
        row.numbers.push(src.number);
      }
      byKey.set(key, row);
    }
  }
  const rows = [...byKey.values()].map((r) => {
    const known = ledger.get(r.key);
    const blocked = known && /^막음/.test(known.status ?? '');
    // 막은 PR보다 뒤(번호가 큰 PR·이슈)에서 다시 나오면 재발이다. 막은 PR 번호가 없으면 다시 나온 것만으로 재발이다
    const recurred = Boolean(blocked && r.numbers.some((n) => n > known.fixedPr));
    return {
      key: r.key,
      category: r.category,
      count: r.refs.length,
      refs: r.refs,
      sample: r.sample,
      status: known?.status ?? '새것',
      isNew: !known,
      recurred,
    };
  });
  const rank = (r) => (r.recurred ? 0 : /^일회성/.test(r.status) ? 4 : r.count >= 2 ? 1 : r.isNew ? 2 : 3);
  rows.sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.key.localeCompare(b.key));
  return { rows, unkeyed };
}

export function render({ rows, unkeyed }, scanned) {
  const lines = [`## 규칙 메모 모음 (PR·이슈 ${scanned}개를 봄)`, ''];
  if (rows.length === 0 && unkeyed.length === 0) return lines.concat('규칙 메모 없음').join('\n');
  if (rows.length > 0) lines.push('| 키 | 분류 | 횟수 | 나온 곳 | 대장 상태 | 판단 | 한 줄 예 |', '|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const verdict = r.recurred
      ? '**재발** — 막은 방법이 못 막았다'
      : /^일회성/.test(r.status)
        ? '일회성 — 규칙대로 넘겼는지만 본다'
        : r.count >= 2
          ? '고친다 (2회 이상)'
          : r.isNew
            ? '대장에 올린다'
            : '지켜본다';
    lines.push(`| \`${r.key}\` | ${r.category} | ${r.count} | ${r.refs.join(' ')} | ${r.status} | ${verdict} | ${r.sample.replace(/\|/g, '\\|')} |`);
  }
  if (unkeyed.length > 0) {
    lines.push('', `### 키 없는 메모 ${unkeyed.length}줄 (모양을 안 지킨 메모. 키를 정해 대장에 올린다)`, '');
    for (const u of unkeyed) lines.push(`- ${u.ref}: ${u.text}`);
  }
  return lines.join('\n');
}

// ───────────────────────── CLI ─────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function gh(path) {
  // REST로 읽는다. GraphQL(gh pr list)이 막힌 환경에서도 돈다. {owner}/{repo}는 gh가 현재 레포로 채운다
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  let ledgerMd = '';
  try {
    ledgerMd = readFileSync(join(root, 'docs', 'INCIDENTS.md'), 'utf8');
  } catch {
    // 대장이 아직 없으면 모든 키가 새것이다
  }
  const ledger = parseLedger(ledgerMd);
  if (process.argv.includes('--keys')) {
    for (const [key, v] of ledger) console.log(`${key} [${v.category}] ${v.seen.replace(/^[#\d\s]*—?\s*/, '')}`);
    return;
  }
  const afterPr = Number(arg('--after-pr', '0'));
  const limit = Math.min(Number(arg('--limit', '60')) || 60, 100);
  const since = afterPr > 0 ? gh(`repos/{owner}/{repo}/pulls/${afterPr}`).merged_at : null;
  const prs = gh(`repos/{owner}/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${limit}`).filter(
    (p) => p.merged_at && p.number > afterPr,
  );
  const sources = prs.map((p) => ({ ref: `#${p.number}`, number: p.number, text: p.body ?? '' }));
  // PR과 이슈의 댓글은 같은 목록에서 나온다. `## 규칙 메모 (추가)`가 있는 것만 쓴다
  const comments = gh(`repos/{owner}/{repo}/issues/comments?per_page=100${since ? `&since=${since}` : ''}`);
  for (const c of comments) {
    if (!/##\s*규칙 메모/.test(c.body ?? '')) continue;
    const number = Number(/\/(\d+)$/.exec(c.issue_url ?? '')?.[1] ?? 0);
    sources.push({ ref: `#${number}`, number, text: c.body });
  }
  console.log(render(aggregate(sources, ledger), new Set(sources.map((s) => s.ref)).size));
  const pending = [...ledger].filter(([, v]) => v.fixedPr === Infinity).map(([k]) => k);
  if (pending.length > 0) console.log(`\n막은 PR이 '이번 정비'로 남은 키 ${pending.length}개 — 지난 정비 PR 번호로 바꾼다: ${pending.join(', ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
