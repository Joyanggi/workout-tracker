#!/usr/bin/env node
// 역할별 토큰 사용량 — 어느 단계가 한도를 많이 쓰는지 재서, 규칙 정비(agents/RULES-KEEPER.md)가 아낄 구간을 고르게 한다.
//
// 재는 법: 일꾼은 모두 따로 뜬 에이전트 세션이고, 세션 기록 파일에 메시지마다 모델·작업 폴더(cwd)·시각·토큰이 남는다.
//   Claude Code: ~/.claude/projects/**/*.jsonl  (CLAUDE_CONFIG_DIR가 있으면 그 아래 projects)
//   Codex:       ~/.codex/sessions/**/*.jsonl   (CODEX_HOME이 있으면 그 아래 sessions)
//   Antigravity: 로컬 기록 형식을 모른다. "측정 안 됨"으로 적는다.
// 역할은 세션의 첫 지시문에 나오는 역할 파일(agents/DESIGNER.md 등)로 가린다. 프롬프트 내용은 출력하지 않는다.
//
// 사용:
//   node scripts/token-usage.mjs --since 2026-11-10T13:02:00+09:00 [--until <시각>] [--match workout-tracker]
//       → PR 본문에 붙일 "## 토큰 사용" 절 (표 + 기계가 읽는 JSON 주석)
//   node scripts/token-usage.mjs --collect [--after-pr <번호>] [--limit 40]
//       → 머지된 PR 본문의 토큰 절을 모아 역할별로 합친 보고서 (gh 필요)
//
// "입력 환산"은 한도를 얼마나 쓰는지 비교하려고 만든 근삿값이다. 새 입력 1을 기준으로
//   Claude: 캐시 읽기 0.1, 캐시 쓰기 1.25(5분)·2(1시간), 출력 5 / OpenAI(Codex): 캐시 읽기 0.1, 출력 8
// API 가격 비율에서 가져왔다. 모델 사이(Opus·Sonnet·Fable)의 차이는 넣지 않았다. 표의 모델 칸을 같이 본다.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROLES = [
  ['COORDINATOR', '지휘자'],
  ['DESIGNER', '설계자'],
  ['PLAN-REVIEWER', '설계 검토자'],
  ['IMPLEMENTER', '구현자'],
  ['REVIEWER', '리뷰어'],
  ['QUALITY-KEEPER', '품질 관리자'],
  ['RULES-KEEPER', '규칙 정비자'],
];
const ROLE_RE = new RegExp(`agents/(${ROLES.map(([f]) => f).join('|')})\\.md`, 'g');
const WEIGHTS = {
  claude: { input: 1, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2, output: 5 },
  openai: { input: 1, cacheRead: 0.1, cacheWrite5m: 0, cacheWrite1h: 0, output: 8 },
};
const START = '<!-- token-usage ';
const END = ' -->';

const empty = () => ({ input: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, output: 0 });

/** 첫 지시문에서 역할을 가린다. 여러 역할 파일이 나오면 가장 앞에 나온 것이다(리뷰어 spec이 QUALITY-KEEPER.md를 함께 가리키는 경우). */
export function roleOf(prompt) {
  let best = null;
  for (const m of String(prompt ?? '').matchAll(ROLE_RE)) {
    if (best === null || m.index < best.index) best = m;
  }
  return best ? ROLES.find(([f]) => f === best[1])[1] : '기타';
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : (c?.text ?? ''))).join('\n');
  return '';
}

function parseLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // 쓰는 도중의 마지막 줄은 잘려 있을 수 있다. 그 줄만 건너뛴다.
    }
  }
  return out;
}

const inWindow = (ts, since, until) => {
  const t = Date.parse(ts);
  return Number.isFinite(t) && t >= since && t <= until;
};

/**
 * Claude Code 세션 기록 하나. 한 응답이 여러 줄(내용 블록마다)로 남고 같은 usage가 반복되므로 message.id마다 한 번만 센다.
 * match(cwd)가 거짓인 줄은 세지 않는다(한 세션이 여러 폴더를 오간 경우 이 레포에서 쓴 것만).
 * @returns {{ provider: 'claude', cwd: string, prompt: string, models: Record<string, ReturnType<typeof empty>>, first: number, last: number } | null}
 */
export function parseClaude(text, since, until, match = () => true) {
  const lines = parseLines(text);
  const prompt = textOf(lines.find((l) => l.type === 'user' && !l.isMeta)?.message?.content);
  const byId = new Map();
  let cwd = '';
  for (const l of lines) {
    if (l.cwd) cwd = l.cwd;
    if (l.type !== 'assistant' || !l.message?.usage || !inWindow(l.timestamp, since, until) || !match(l.cwd ?? cwd)) continue;
    const model = l.message.model;
    if (!model || model.startsWith('<')) continue; // <synthetic> 같은 가짜 응답
    const id = l.message.id ?? l.uuid;
    // usage는 같은 응답의 마지막 줄 것을 쓰고, 시각은 그 응답의 첫 줄 것을 쓴다
    byId.set(id, { model, usage: l.message.usage, ts: byId.get(id)?.ts ?? Date.parse(l.timestamp) });
  }
  if (byId.size === 0) return null;
  const models = {};
  let first = Infinity;
  let last = -Infinity;
  for (const { model, usage: u, ts } of byId.values()) {
    const s = (models[model] ??= empty());
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens;
    const w5m = u.cache_creation?.ephemeral_5m_input_tokens;
    const write = u.cache_creation_input_tokens ?? 0;
    s.input += u.input_tokens ?? 0;
    s.cacheRead += u.cache_read_input_tokens ?? 0;
    if (w1h !== undefined || w5m !== undefined) {
      s.cacheWrite1h += w1h ?? 0;
      s.cacheWrite5m += w5m ?? 0;
    } else {
      s.cacheWrite1h += write; // 구독은 1시간 캐시가 기본이다
    }
    s.output += u.output_tokens ?? 0;
    first = Math.min(first, ts);
    last = Math.max(last, ts);
  }
  return { provider: 'claude', cwd, prompt, models, first, last };
}

/**
 * Codex 세션 기록 하나. token_count 이벤트의 total_token_usage는 누적값이라, 창 안 마지막 값에서 창 앞 마지막 값을 뺀다.
 * input_tokens에는 cached_input_tokens가 들어 있다.
 */
export function parseCodex(text, since, until) {
  const lines = parseLines(text);
  let cwd = '';
  let model = 'codex';
  let prompt = '';
  let before = null;
  let lastIn = null;
  let first = Infinity;
  let last = -Infinity;
  for (const l of lines) {
    const p = l.payload ?? {};
    if (p.cwd) cwd = p.cwd;
    if (p.model) model = p.model;
    if (!prompt && l.type === 'response_item' && p.type === 'message' && p.role === 'user') prompt = textOf(p.content);
    const total = l.type === 'event_msg' && p.type === 'token_count' ? p.info?.total_token_usage : null;
    if (!total) continue;
    const t = Date.parse(l.timestamp);
    if (t < since) before = total;
    else if (t <= until) {
      lastIn = total;
      first = Math.min(first, t);
      last = Math.max(last, t);
    }
  }
  if (!lastIn) return null;
  const d = (k) => (lastIn[k] ?? 0) - (before?.[k] ?? 0);
  const cached = d('cached_input_tokens');
  const s = { ...empty(), input: d('input_tokens') - cached, cacheRead: cached, output: d('output_tokens') };
  return { provider: 'openai', cwd, prompt, models: { [model]: s }, first, last };
}

export function weighted(s, provider) {
  const w = WEIGHTS[provider] ?? WEIGHTS.claude;
  return Math.round(
    s.input * w.input + s.cacheRead * w.cacheRead + s.cacheWrite5m * w.cacheWrite5m + s.cacheWrite1h * w.cacheWrite1h + s.output * w.output,
  );
}

/** 세션들을 역할·모델별로 합친다. 하위 에이전트 세션은 부모 세션의 역할로 친다. */
export function summarize(sessions, parentRole = new Map()) {
  const rows = new Map();
  for (const s of sessions) {
    const role = s.parent ? (parentRole.get(s.parent) ?? '기타') : roleOf(s.prompt);
    for (const [model, t] of Object.entries(s.models)) {
      const key = `${role}\u0000${model}`;
      const r = rows.get(key) ?? { role, model, provider: s.provider, sessions: 0, minutes: 0, ...empty() };
      r.sessions += 1;
      r.minutes += Math.round((s.last - s.first) / 60000);
      for (const k of Object.keys(empty())) r[k] += t[k];
      rows.set(key, r);
    }
  }
  const rank = (role) => {
    const i = ROLES.findIndex(([, r]) => r === role);
    return i < 0 ? ROLES.length : i; // '기타'는 맨 뒤
  };
  return [...rows.values()]
    .map((r) => ({ ...r, weighted: weighted(r, r.provider) }))
    .sort((a, b) => rank(a.role) - rank(b.role) || b.weighted - a.weighted);
}

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
/** 캐시 적중률: 읽은 입력 중 캐시에서 읽은 몫. 낮으면 세션을 자주 새로 열었거나 1시간 넘게 쉬었거나 모델을 바꿨다 */
export const cacheHit = (r) => {
  const all = r.input + r.cacheRead + r.cacheWrite5m + r.cacheWrite1h;
  return all ? Math.round((r.cacheRead / all) * 100) : 0;
};

/** PR 본문에 붙일 절. 사람이 읽는 표와, --collect가 읽는 JSON 주석을 함께 쓴다. */
export function renderSection(rows, meta) {
  const total = rows.reduce((n, r) => n + r.weighted, 0);
  const lines = [
    '## 토큰 사용',
    '',
    `측정: ${meta.since} ~ ${meta.until} · Claude 세션 ${meta.claude} · Codex 세션 ${meta.codex} · Antigravity 측정 안 됨`,
    '',
    '| 역할 | 모델 | 세션 | 새 입력 | 캐시 쓰기 | 캐시 읽기 | 출력 | 입력 환산 | 몫 | 캐시 적중 | 분 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.role} | ${r.model} | ${r.sessions} | ${fmt(r.input)} | ${fmt(r.cacheWrite5m + r.cacheWrite1h)} | ${fmt(r.cacheRead)} | ${fmt(r.output)} | ${fmt(r.weighted)} | ${total ? Math.round((r.weighted / total) * 100) : 0}% | ${cacheHit(r)}% | ${r.minutes} |`,
    ),
    '',
    '입력 환산은 한도 비교용 근삿값이다(`scripts/token-usage.mjs` 머리 주석). 모델 사이 차이는 넣지 않았다.',
    '',
    `${START}${JSON.stringify({ v: 1, since: meta.since, until: meta.until, rows: rows.map(({ role, model, provider, sessions, minutes, input, cacheRead, cacheWrite5m, cacheWrite1h, output }) => ({ role, model, provider, sessions, minutes, input, cacheRead, cacheWrite5m, cacheWrite1h, output })) })}${END}`,
  ];
  return lines.join('\n');
}

/** PR 본문에서 토큰 절의 JSON을 읽는다. 없거나 깨졌으면 null */
export function parseSection(body) {
  const i = String(body ?? '').lastIndexOf(START);
  if (i < 0) return null;
  const j = body.indexOf(END, i + START.length);
  try {
    const data = JSON.parse(body.slice(i + START.length, j));
    return data?.v === 1 && Array.isArray(data.rows) ? data : null;
  } catch {
    return null; // 사람이 PR 본문을 고치다 깨뜨렸을 수 있다. 그 PR만 빼고 센다
  }
}

/** 여러 PR의 토큰 절을 역할·모델별로 합친다 */
export function aggregate(prs) {
  const acc = new Map();
  let measured = 0;
  for (const pr of prs) {
    const data = parseSection(pr.body);
    if (!data) continue;
    measured += 1;
    for (const r of data.rows) {
      const key = `${r.role}\u0000${r.model}`;
      const a = acc.get(key) ?? { role: r.role, model: r.model, provider: r.provider, prs: new Set(), sessions: 0, minutes: 0, ...empty() };
      a.prs.add(pr.number);
      a.sessions += r.sessions;
      a.minutes += r.minutes;
      for (const k of Object.keys(empty())) a[k] += r[k] ?? 0;
      acc.set(key, a);
    }
  }
  const rows = [...acc.values()].map((a) => ({ ...a, prs: a.prs.size, weighted: weighted(a, a.provider) })).sort((a, b) => b.weighted - a.weighted);
  return { measured, rows };
}

export function renderCollect({ measured, rows }, prCount) {
  const total = rows.reduce((n, r) => n + r.weighted, 0);
  const lines = [
    `# 역할별 토큰 (머지된 PR ${prCount}개 중 측정된 ${measured}개)`,
    '',
    '| 역할 | 모델 | PR | 세션 | PR당 입력 환산 | 세션당 입력 환산 | 몫 | 캐시 적중 | 출력 몫 | PR당 분 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => {
      const outShare = r.weighted ? Math.round(((r.output * (WEIGHTS[r.provider] ?? WEIGHTS.claude).output) / r.weighted) * 100) : 0;
      return `| ${r.role} | ${r.model} | ${r.prs} | ${r.sessions} | ${fmt(Math.round(r.weighted / r.prs))} | ${fmt(Math.round(r.weighted / r.sessions))} | ${total ? Math.round((r.weighted / total) * 100) : 0}% | ${cacheHit(r)}% | ${outShare}% | ${Math.round(r.minutes / r.prs)} |`;
    }),
    '',
    '읽는 법: 몫이 큰 역할부터 본다. 캐시 적중이 낮으면 세션을 새로 열거나 1시간 넘게 쉬거나 모델을 바꾼 것이다. 출력 몫이 크면 보고·기록을 길게 쓰는 것이다.',
  ];
  return lines.join('\n');
}

function listJsonl(dir, sinceMs) {
  const out = [];
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out; // 그 에이전트를 안 쓰는 PC면 폴더가 없다
  }
  for (const name of names) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listJsonl(p, sinceMs));
    else if (name.endsWith('.jsonl') && st.mtimeMs >= sinceMs) out.push(p);
  }
  return out;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function measure() {
  const sinceText = arg('--since');
  const since = Date.parse(sinceText ?? '');
  if (!Number.isFinite(since)) {
    console.error('사용: node scripts/token-usage.mjs --since <ISO 시각> [--until <ISO 시각>] [--match workout-tracker]');
    process.exit(2);
  }
  const untilText = arg('--until', new Date().toISOString());
  const until = Date.parse(untilText);
  const match = arg('--match', 'workout-tracker').toLowerCase();
  const claudeDir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
  const codexDir = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
  const inRepo = (cwd) => String(cwd ?? '').replace(/\\/g, '/').toLowerCase().includes(match);
  const ours = (s) => s && inRepo(s.cwd);

  const sessions = [];
  const parentRole = new Map();
  for (const file of listJsonl(claudeDir, since)) {
    const s = parseClaude(readFileSync(file, 'utf8'), since, until, inRepo);
    if (!s) continue;
    const sub = file.replace(/\\/g, '/').match(/\/([^/]+)\/subagents\//);
    if (sub) s.parent = sub[1];
    else parentRole.set(file.replace(/\\/g, '/').split('/').pop().replace(/\.jsonl$/, ''), roleOf(s.prompt));
    sessions.push(s);
  }
  for (const file of listJsonl(codexDir, since)) {
    const s = parseCodex(readFileSync(file, 'utf8'), since, until);
    if (ours(s)) sessions.push(s);
  }
  const rows = summarize(sessions, parentRole);
  console.log(
    renderSection(rows, {
      since: new Date(since).toISOString(),
      until: new Date(until).toISOString(),
      claude: sessions.filter((s) => s.provider === 'claude').length,
      codex: sessions.filter((s) => s.provider === 'openai').length,
    }),
  );
}

function collect() {
  const limit = arg('--limit', '40');
  const afterPr = Number(arg('--after-pr', '0'));
  // REST로 읽는다. GraphQL(gh pr list)이 막힌 환경에서도 돈다. {owner}/{repo}는 gh가 현재 레포로 채운다
  const json = execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${Math.min(Number(limit) || 40, 100)}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const prs = JSON.parse(json)
    .filter((p) => p.merged_at && p.number > afterPr)
    .map((p) => ({ number: p.number, title: p.title, body: p.body ?? '' }));
  console.log(renderCollect(aggregate(prs), prs.length));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--collect')) collect();
  else measure();
}
