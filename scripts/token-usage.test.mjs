// scripts/token-usage.mjs — 역할별 토큰 집계가 세션 기록을 바르게 읽고, PR 본문에 남긴 표를 다시 모을 수 있는지 잠근다.
import { describe, expect, it } from 'vitest';
import { aggregate, cacheHit, parseClaude, parseCodex, parseSection, renderCollect, renderSection, roleOf, summarize, weighted } from './token-usage.mjs';

const T0 = Date.parse('2026-11-10T04:00:00Z');
const T1 = Date.parse('2026-11-10T06:00:00Z');
const jl = (...objs) => objs.map((o) => JSON.stringify(o)).join('\n') + '\n';
const user = (text, ts = '2026-11-10T04:01:00Z', cwd = 'C:\\Users\\me\\orca\\workspaces\\workout-tracker\\v1.14') => ({ type: 'user', timestamp: ts, cwd, message: { role: 'user', content: text } });
const asst = (id, ts, usage, model = 'claude-sonnet-5-5', cwd = 'C:\\Users\\me\\orca\\workspaces\\workout-tracker\\v1.14') => ({ type: 'assistant', timestamp: ts, cwd, message: { id, model, usage } });
const u = (input, read, write, output) => ({ input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: output, cache_creation: { ephemeral_1h_input_tokens: write, ephemeral_5m_input_tokens: 0 } });

describe('token-usage: 역할 가리기', () => {
  it.each([
    ['agents/COORDINATOR.md를 읽고 진행해.', '지휘자'],
    ['=== TASK ===\nagents/DESIGNER.md를 읽고 설계해.', '설계자'],
    ['CLAUDE.md와 agents/PLAN-REVIEWER.md를 읽고 검토해', '설계 검토자'],
    ['agents/IMPLEMENTER.md를 읽고 LL2를 구현해', '구현자'],
    ['agents/REVIEWER.md를 읽고 이 브랜치를 리뷰해. 기준: agents/QUALITY-KEEPER.md 2·3절', '리뷰어'],
    ['agents/SCREEN-CHECKER.md를 읽고 docs/PLAN-v1.18.md의 PP1 화면을 검증해.', '화면 검증자'],
    ['agents/REVIEWER.md를 읽고 PP1 기준으로 리뷰해.\n화면은 .reports/screen-check-PP1.md의 판정과 스크린샷을 근거로 본다.', '리뷰어'],
    ['agents/QUALITY-KEEPER.md를 읽고 품질 정리해', '품질 관리자'],
    ['agents/RULES-KEEPER.md를 읽고 규칙 정비해', '규칙 정비자'],
    ['오늘 날씨 어때', '기타'],
  ])('%j → %s', (prompt, role) => {
    expect(roleOf(prompt)).toBe(role);
  });
});

describe('token-usage: Claude 세션 기록', () => {
  const text = jl(
    user('agents/IMPLEMENTER.md를 읽고 LL2를 구현해'),
    // 한 응답이 내용 블록마다 줄로 남고 같은 usage가 반복된다
    asst('msg_a', '2026-11-10T04:02:00Z', u(10, 1000, 200, 50)),
    asst('msg_a', '2026-11-10T04:02:01Z', u(10, 1000, 200, 50)),
    asst('msg_b', '2026-11-10T04:30:00Z', u(5, 3000, 100, 20)),
    asst('msg_c', '2026-11-10T07:00:00Z', u(999, 999, 999, 999)), // 창 밖
    { type: 'assistant', timestamp: '2026-11-10T04:31:00Z', message: { id: 'x', model: '<synthetic>', usage: u(1, 1, 1, 1) } },
    '{"type":"assistant","timestamp":"2026-11-10T04:40', // 쓰는 도중 잘린 줄
  );

  it('같은 message.id는 한 번만 세고, 창 밖과 가짜 응답은 빼고, 잘린 줄은 건너뛴다', () => {
    const s = parseClaude(text, T0, T1);
    expect(s.models['claude-sonnet-5-5']).toEqual({ input: 15, cacheRead: 4000, cacheWrite5m: 0, cacheWrite1h: 300, output: 70 });
    expect(Object.keys(s.models)).toEqual(['claude-sonnet-5-5']);
    expect((s.last - s.first) / 60000).toBe(28);
  });

  it('match(cwd)가 거짓인 줄은 세지 않는다 (한 세션이 다른 폴더에서 쓴 것)', () => {
    const mixed = jl(user('x'), asst('a', '2026-11-10T04:02:00Z', u(1, 0, 0, 1)), asst('b', '2026-11-10T04:03:00Z', u(100, 0, 0, 100), 'claude-sonnet-5-5', '/home/me/other'));
    const s = parseClaude(mixed, T0, T1, (cwd) => cwd.includes('workout-tracker'));
    expect(s.models['claude-sonnet-5-5'].input).toBe(1);
  });

  it('슬래시 명령(/coord)으로 시작한 세션은 펼친 본문에서 역할을 가린다', () => {
    const cmd = jl(
      { type: 'user', isMeta: true, timestamp: '2026-11-10T04:00:30Z', message: { role: 'user', content: '<local-command-caveat>…</local-command-caveat>' } },
      user('<command-message>coord</command-message>\n<command-name>/coord</command-name>\n<command-args>이슈 #24 진행해</command-args>'),
      { type: 'user', isMeta: true, timestamp: '2026-11-10T04:01:01Z', message: { role: 'user', content: [{ type: 'text', text: 'agents/COORDINATOR.md를 읽고 진행해.\n\n이슈 #24 진행해' }] } },
      asst('a', '2026-11-10T04:02:00Z', u(1, 0, 0, 1)),
    );
    expect(roleOf(parseClaude(cmd, T0, T1).prompt)).toBe('지휘자');
  });

  it('창 안에 응답이 없으면 null', () => {
    expect(parseClaude(jl(user('x')), T0, T1)).toBeNull();
  });
});

describe('token-usage: Codex 세션 기록', () => {
  const tc = (ts, input, cached, output) => ({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } } } });
  const text = jl(
    { timestamp: '2026-11-10T03:00:00Z', type: 'session_meta', payload: { cwd: 'C:\\Users\\me\\orca\\workspaces\\workout-tracker\\plan-v1.14' } },
    { timestamp: '2026-11-10T03:00:01Z', type: 'turn_context', payload: { model: 'gpt-5-codex' } },
    { timestamp: '2026-11-10T03:00:02Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'CLAUDE.md와 agents/PLAN-REVIEWER.md를 읽고' }] } },
    tc('2026-11-10T03:30:00Z', 1000, 400, 100), // 창 앞
    tc('2026-11-10T04:10:00Z', 5000, 3000, 600),
    tc('2026-11-10T04:20:00Z', 9000, 6000, 900),
  );

  it('누적값에서 창 앞 값을 빼고, 캐시 입력을 새 입력과 나눈다', () => {
    const s = parseCodex(text, T0, T1);
    expect(roleOf(s.prompt)).toBe('설계 검토자');
    expect(s.models['gpt-5-codex']).toEqual({ input: 2400, cacheRead: 5600, cacheWrite5m: 0, cacheWrite1h: 0, output: 800 });
  });
});

describe('token-usage: 합치기와 PR 본문', () => {
  const sessions = [
    { provider: 'claude', prompt: 'agents/COORDINATOR.md를 읽고', models: { 'claude-sonnet-5-5': { input: 10, cacheRead: 9000, cacheWrite5m: 0, cacheWrite1h: 500, output: 100 } }, first: T0, last: T0 + 60 * 60000 },
    { provider: 'claude', prompt: 'agents/IMPLEMENTER.md를 읽고', models: { 'claude-sonnet-5-5': { input: 20, cacheRead: 20000, cacheWrite5m: 0, cacheWrite1h: 2000, output: 400 } }, first: T0, last: T0 + 30 * 60000 },
    { provider: 'claude', parent: 'sess-impl', prompt: '하위 에이전트 지시', models: { 'claude-haiku-5-5': { input: 5, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 100, output: 10 } }, first: T0, last: T0 },
  ];
  const rows = summarize(sessions, new Map([['sess-impl', '구현자']]));

  it('입력 환산은 캐시 읽기 0.1, 1시간 캐시 쓰기 2, 출력 5배로 센다', () => {
    expect(weighted({ input: 10, cacheRead: 1000, cacheWrite5m: 0, cacheWrite1h: 100, output: 10 }, 'claude')).toBe(10 + 100 + 200 + 50);
  });

  it('역할 순서(지휘자 먼저)로 정렬하고, 하위 에이전트는 부모 역할로 친다', () => {
    expect(rows.map((r) => [r.role, r.model])).toEqual([
      ['지휘자', 'claude-sonnet-5-5'],
      ['구현자', 'claude-sonnet-5-5'],
      ['구현자', 'claude-haiku-5-5'],
    ]);
  });

  it('PR 본문 절을 다시 읽으면 같은 숫자가 나온다', () => {
    const body = `머리\n\n${renderSection(rows, { since: 'a', until: 'b', claude: 3, codex: 0 })}\n\n## 규칙 메모\n없음`;
    expect(body).toContain('| 구현자 | claude-sonnet-5-5 | 1 |');
    const data = parseSection(body);
    expect(data.rows).toHaveLength(3);
    expect(data.rows[1]).toMatchObject({ role: '구현자', input: 20, cacheRead: 20000, output: 400 });
  });

  it('여러 PR을 모아 몫이 큰 순서로 보이고, 토큰 절이 없거나 깨진 PR은 뺀다', () => {
    const section = renderSection(rows, { since: 'a', until: 'b', claude: 3, codex: 0 });
    const prs = [
      { number: 30, body: section },
      { number: 31, body: section },
      { number: 32, body: '토큰 절 없음' },
      { number: 33, body: '<!-- token-usage {깨짐 -->' },
    ];
    const agg = aggregate(prs);
    expect(agg.measured).toBe(2);
    expect(agg.rows[0]).toMatchObject({ role: '구현자', model: 'claude-sonnet-5-5', prs: 2, sessions: 2 });
    expect(renderCollect(agg, prs.length)).toContain('측정된 2개');
  });

  it('캐시 적중은 읽은 입력 중 캐시에서 읽은 몫이다', () => {
    expect(cacheHit({ input: 10, cacheRead: 900, cacheWrite5m: 0, cacheWrite1h: 90 })).toBe(90);
  });
});
