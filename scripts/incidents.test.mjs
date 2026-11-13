// scripts/incidents.mjs — 규칙 메모를 키로 묶어 몇 번 나왔는지 세고, 대장에서 막았다고 한 문제가 다시 나오면 재발로 올리는지 잠근다.
import { describe, expect, it } from 'vitest';
import { aggregate, memoLines, parseLedger, render } from './incidents.mjs';

const body = (...lines) => `머리\n\n## 토큰 사용\n- 표\n\n## 규칙 메모\n${lines.join('\n')}\n`;

describe('incidents: 메모 줄 읽기', () => {
  it('규칙 메모 절 안의 목록 줄만 읽고, 분류·키를 가른다', () => {
    const text = body(
      '- [환경] PR: CI의 npm ci가 잠금 파일을 거부 → Node 24로 올림 (키: npm-lock-ci-version)',
      '- 옛 모양 메모 (키 없음)',
      '- 없음',
    );
    expect(memoLines(text)).toEqual([
      { category: '환경', text: 'PR: CI의 npm ci가 잠금 파일을 거부 → Node 24로 올림', key: 'npm-lock-ci-version' },
      { category: null, text: '옛 모양 메모 (키 없음)', key: null },
    ]);
  });

  it('다른 절의 목록 줄과 `## 규칙 메모 (추가)` 댓글을 구분한다', () => {
    expect(memoLines('## 검증\n- [검사] x (키: a-b)\n')).toEqual([]);
    expect(memoLines('## 규칙 메모 (추가)\n- [일꾼] 설계: 시작 시간 초과 (키: worker-setup-timeout)\n## 다음\n- [검사] y (키: c-d)')).toHaveLength(1);
  });
});

describe('incidents: 대장과 모으기', () => {
  const ledger = parseLedger(`
| 키 | 분류 | 상태 | 막은 방법 | 막은 PR |
|---|---|---|---|---|
| \`npm-lock-ci-version\` | 환경 | 막음(장치) | CI Node 24 | #39 |
| \`push-after-pr\` | 규칙 | 막음(글) | PR.md 1절 | #17 |
| \`worker-setup-timeout\` | 일꾼 | 열림 | | |
`);

  it('대장의 키·상태·막은 PR 번호를 읽는다', () => {
    expect(ledger.get('npm-lock-ci-version')).toMatchObject({ status: '막음(장치)', fixedPr: 39 });
    expect(ledger.get('worker-setup-timeout')).toMatchObject({ status: '열림', fixedPr: 0 });
  });

  const sources = [
    { ref: '#40', number: 40, text: body('- [환경] PR: 잠금 파일 거부 (키: npm-lock-ci-version)', '- [환경] PR: 또 (키: npm-lock-ci-version)') },
    { ref: '#41', number: 41, text: body('- [일꾼] 설계: setup 대기 시간 초과 (키: worker-setup-timeout)') },
    { ref: '#42', number: 42, text: body('- [일꾼] 구현: setup 대기 시간 초과 (키: worker-setup-timeout)', '- [반려] 화면 검증: 제목 잘림 (키: screen-title-clipped)') },
    { ref: '#15', number: 15, text: body('- [규칙] PR: 막기 전 일 (키: push-after-pr)') },
  ];
  const { rows, unkeyed } = aggregate(sources, ledger);
  const row = (key) => rows.find((r) => r.key === key);

  it('같은 PR 안의 같은 키는 한 번으로 센다', () => {
    expect(row('npm-lock-ci-version').count).toBe(1);
    expect(row('worker-setup-timeout')).toMatchObject({ count: 2, refs: ['#41', '#42'] });
  });

  it('막은 PR보다 뒤에서 다시 나오면 재발이고, 막기 전 PR에서 나온 것은 재발이 아니다', () => {
    expect(row('npm-lock-ci-version').recurred).toBe(true);
    expect(row('push-after-pr').recurred).toBe(false);
    expect(row('worker-setup-timeout').recurred).toBe(false);
  });

  it('재발 → 2회 이상 → 새것 → 나머지 순서로 보인다', () => {
    expect(rows.map((r) => r.key)).toEqual(['npm-lock-ci-version', 'worker-setup-timeout', 'screen-title-clipped', 'push-after-pr']);
    expect(row('screen-title-clipped')).toMatchObject({ isNew: true, status: '새것' });
    expect(unkeyed).toEqual([]);
  });

  it("막은 PR이 '이번 정비'면 번호가 채워질 때까지 재발로 올리지 않고, 일회성은 여러 번 나와도 고치라고 하지 않는다", () => {
    const l = parseLedger('| `a-b-c` | 명령 | 막음(글) | 방법 | 이번 정비 | #46 |\n| `usage-limit-resume` | 일꾼 | 일회성 | 규칙 | | #32 |\n');
    const out = aggregate(
      [
        { ref: '#46', number: 46, text: body('- [명령] 리뷰: x (키: a-b-c)', '- [일꾼] 구현: 한도 (키: usage-limit-resume)') },
        { ref: '#47', number: 47, text: body('- [일꾼] 구현: 한도 (키: usage-limit-resume)') },
      ],
      l,
    );
    expect(out.rows.find((r) => r.key === 'a-b-c').recurred).toBe(false);
    expect(render(out, 2)).toContain('| `usage-limit-resume` | 일꾼 | 2 | #46 #47 | 일회성 | 일회성 — 규칙대로 넘겼는지만 본다 |');
  });

  it('대장의 "다른 이름" 표에 있는 키는 원래 키로 합쳐 센다', () => {
    const withAlias = parseLedger('| `worker-setup-timeout` | 일꾼 | 열림 | | | #32 |\n\n| 다른 이름 | 원래 키 |\n|---|---|\n| `agent-readiness-slow` | `worker-setup-timeout` |\n');
    expect(withAlias.aliases.get('agent-readiness-slow')).toBe('worker-setup-timeout');
    expect(withAlias.has('agent-readiness-slow')).toBe(false);
    const out = aggregate(
      [
        { ref: '#50', number: 50, text: body('- [일꾼] 구현: 시작 시간 초과 (키: agent-readiness-slow)') },
        { ref: '#51', number: 51, text: body('- [일꾼] 구현: 시작 시간 초과 (키: worker-setup-timeout)') },
      ],
      withAlias,
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ key: 'worker-setup-timeout', count: 2, isNew: false });
  });

  it('표에 판단을 적고, 키 없는 메모는 따로 모은다', () => {
    const out = render(aggregate([...sources, { ref: '#43', number: 43, text: body('- 키를 안 적은 메모') }], ledger), 5);
    expect(out).toContain('| `npm-lock-ci-version` | 환경 | 1 | #40 | 막음(장치) | **재발**');
    expect(out).toContain('키 없는 메모 1줄');
    expect(render({ rows: [], unkeyed: [] }, 3)).toContain('규칙 메모 없음');
  });
});
