#!/usr/bin/env node
// 에이전트 안전장치 — Claude Code PreToolUse 훅(.claude/settings.json)이 Bash 명령마다 실행한다.
//
// 규칙 파일(CLAUDE.md, agents/)에 "하지 않는다"고 적힌 것 중 되돌릴 수 없거나 실제 폰 앱에
// 닿는 명령을 여기서 기계적으로 막는다. 글로 적은 규칙은 모델이 잊을 수 있지만 이 검사는 잊지 않는다.
//
// - 입력: 훅이 stdin으로 주는 JSON ({ tool_name, tool_input: { command }, cwd })
// - 막을 때: 이유를 stderr에 쓰고 종료 코드 2 → Claude Code가 명령을 실행하지 않고 이유를 모델에게 보여준다
// - 통과: 종료 코드 0. 검사 자체가 실패해도 0(작업을 멈추지 않는다. 서버 쪽 main 보호 규칙이 마지막 방어선이다)
//
// 막는 목록을 바꾸면 scripts/agent-guard.test.mjs도 함께 고친다. CI에서 돈다.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROTECTED = /^(main|master)$/;

/** 셸 명령 문자열을 명령 단위로 나누고, 각 명령을 토큰 배열로 만든다. 따옴표만 처리하는 단순 분해다. */
export function splitCommands(input) {
  const commands = [];
  let tokens = [];
  let cur = '';
  let has = false;
  let quote = null;
  const pushToken = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  const pushCommand = () => {
    pushToken();
    if (tokens.length) commands.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < input.length) cur += input[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < input.length) {
      cur += input[++i];
      has = true;
    } else if (c === ' ' || c === '\t') {
      pushToken();
    } else if (c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')' || c === '`') {
      pushCommand();
    } else {
      cur += c;
      has = true;
    }
  }
  pushCommand();
  return commands;
}

// git 전역 옵션 중 값을 하나 더 받는 것
const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

/** 토큰 배열에서 git 하위 명령과 그 인자를 찾는다. git 명령이 아니면 null. */
function parseGit(tokens) {
  let i = 0;
  // 앞에 붙는 환경 변수(FOO=bar git ...)와 command/env 같은 래퍼는 건너뛴다
  while (i < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i] === 'command' || tokens[i] === 'env')) i++;
  const bin = tokens[i];
  if (!bin || !/(^|[\\/])git(\.exe)?$/.test(bin)) return null;
  i++;
  let cwdOpt = null;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    if (GIT_OPTS_WITH_VALUE.has(tokens[i])) {
      if (tokens[i] === '-C') cwdOpt = tokens[i + 1];
      i += 2;
    } else i++;
  }
  if (i >= tokens.length) return null;
  return { sub: tokens[i], args: tokens.slice(i + 1), cwdOpt };
}

function isGh(tokens, ...words) {
  if (!/(^|[\\/])gh(\.exe)?$/.test(tokens[0] ?? '')) return false;
  return words.every((w, k) => tokens[k + 1] === w);
}

/** `gh api` 호출이 쓰기인가. 메서드를 GET 말고 다른 것으로 주거나, 필드·입력을 주면(기본이 POST가 된다) 쓰기다. */
function ghApiWrites(tokens) {
  for (let k = 2; k < tokens.length; k++) {
    const t = tokens[k];
    if (t === '-X' || t === '--method') {
      if ((tokens[k + 1] ?? '').toUpperCase() !== 'GET') return true;
    } else if (/^(-X|--method=)/.test(t)) {
      if (t.replace(/^(-X|--method=)/, '').toUpperCase() !== 'GET') return true;
    } else if (/^(-f|-F|--field|--raw-field|--input)(=|$)/.test(t)) {
      return true;
    }
  }
  return false;
}

/** 브랜치 이름 하나가 main/master를 가리키는가 (refs/heads/main, origin/main 포함) */
function namesProtected(ref) {
  const r = ref.replace(/^\+/, '').replace(/^refs\/heads\//, '').replace(/^origin\//, '');
  return PROTECTED.test(r);
}

/**
 * 명령 하나를 검사한다. 막아야 하면 이유 문자열, 아니면 null.
 * currentBranch(cwd)는 인자 없는 `git push`가 어느 브랜치를 올리는지 알아내는 데 쓴다.
 */
export function checkTokens(tokens, currentBranch = () => null) {
  if (isGh(tokens, 'pr', 'merge')) {
    return 'PR 머지는 사람이 한다. 에이전트는 `gh pr merge`를 쓰지 않는다(CLAUDE.md "브랜치와 배포"). 머지를 기다려야 하면 agents/coordinator/PR.md의 머지 대기를 따른다.';
  }
  if (isGh(tokens, 'api') && tokens.some((t) => /\/pulls\/\d+\/merge\b|\/merges\b/.test(t))) {
    return 'GitHub API로 머지하는 것도 막는다. 머지는 사람이 한다.';
  }
  if (['delete', 'edit', 'rename', 'archive', 'unarchive'].some((w) => isGh(tokens, 'repo', w))) {
    return '레포 설정·삭제는 사람이 한다. main 보호(ruleset)와 배포가 레포 설정에 걸려 있다.';
  }
  if (isGh(tokens, 'api') && ghApiWrites(tokens) && tokens.some((t) => /\/rulesets\b|\/branches\/[^/\s]+\/protection\b|\/git\/refs\/heads\/(main|master)\b/.test(t))) {
    return 'main 보호 규칙(ruleset·브랜치 보호)과 main 브랜치를 바꾸거나 지우는 API 호출은 막는다. 서버 쪽 마지막 방어선이다.';
  }

  const git = parseGit(tokens);
  if (!git) return null;
  const { sub, args, cwdOpt } = git;
  const has = (...names) => args.some((a) => names.includes(a));
  const shortFlag = (letter) => args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(letter));

  if (sub === 'push') {
    if (has('--force', '--force-with-lease', '--force-if-includes', '--mirror') || args.some((a) => a.startsWith('--force-with-lease=')) || shortFlag('f')) {
      return '강제 push는 막는다. 반려를 반영할 때도 새 커밋을 쌓는다(IMPLEMENTER.md 5절).';
    }
    if (args.some((a) => !a.startsWith('-') && a.startsWith('+'))) {
      return '`+` 붙은 refspec은 강제 push다. 막는다.';
    }
    const refs = args.filter((a) => !a.startsWith('-'));
    // 첫 번째는 원격 이름(origin)이다. 나머지가 refspec
    let pushesHead = refs.length <= 1;
    for (const ref of refs.slice(1)) {
      const dst = ref.includes(':') ? ref.split(':').pop() : ref;
      if (namesProtected(dst)) {
        return '`main`에는 push하지 않는다. main 반영은 PR로만 하고 머지는 사람이 한다. 작업 브랜치를 push한다.';
      }
      if (dst === 'HEAD' || dst === '@') pushesHead = true;
    }
    if (pushesHead) {
      const branch = currentBranch(cwdOpt);
      if (branch && PROTECTED.test(branch)) {
        return '지금 브랜치가 main이다. main에서 push하지 않는다. 작업 브랜치로 옮겨서 push한다.';
      }
    }
    return null;
  }
  if (sub === 'reset' && has('--hard', '--merge', '--keep')) {
    return '`git reset --hard`는 커밋 안 된 작업을 지운다. 되돌리기는 `cp` 백업으로 한다(CLAUDE.md "환경").';
  }
  if (sub === 'clean' && (has('--force') || shortFlag('f'))) {
    return '`git clean -f`는 추적 안 된 파일을 지운다. 지울 파일을 사람에게 알리고 멈춘다.';
  }
  if (sub === 'checkout' && (has('--', '.', '--force') || shortFlag('f'))) {
    return '`git checkout -- <파일>` / `git checkout .`은 커밋 안 된 수정을 버린다. 되돌리기는 `cp` 백업으로 한다(CLAUDE.md "환경").';
  }
  if (sub === 'restore' && !(has('--staged', '-S') && !has('--worktree', '-W'))) {
    return '`git restore`는 커밋 안 된 수정을 버린다. 되돌리기는 `cp` 백업으로 한다. 스테이징만 풀려면 `git restore --staged <파일>`.';
  }
  if (sub === 'branch' && (has('-D') || (has('--delete', '-d') && has('--force', '-f')) || args.some((a) => /^-[a-zA-Z]*D/.test(a)))) {
    return '`git branch -D`는 머지 안 된 브랜치도 지운다. `git branch -d`를 쓴다(머지된 브랜치만 지워진다).';
  }
  if (sub === 'worktree' && args[0] === 'remove' && (has('--force') || shortFlag('f'))) {
    return '`git worktree remove --force`는 커밋 안 된 작업이 있는 작업 트리도 지운다. 강제 없이 지우고, 실패하면 이유를 보고한다.';
  }
  if (sub === 'stash' && (args[0] === 'clear' || args[0] === 'drop')) {
    return '`git stash clear/drop`은 보관한 작업을 지운다. 사람에게 맡긴다.';
  }
  return null;
}

/** 명령 문자열 전체를 검사한다. 막아야 하면 이유, 아니면 null. */
export function checkCommand(command, currentBranch = () => null) {
  // 분해가 놓칠 수 있는 형태(bash -c "...", 변수 치환 등)도 머지만큼은 문자열로 한 번 더 본다
  if (/\bgh(\.exe)?\s+pr\s+merge\b/.test(command)) return checkTokens(['gh', 'pr', 'merge']);
  for (const tokens of splitCommands(command)) {
    const reason = checkTokens(tokens, currentBranch);
    if (reason) return reason;
  }
  return null;
}

function gitCurrentBranch(baseCwd) {
  return (cwdOpt) => {
    try {
      const cwd = cwdOpt ?? baseCwd ?? process.cwd();
      return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch {
      return null;
    }
  };
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const command = input?.tool_input?.command;
  if (typeof command !== 'string') process.exit(0);
  const reason = checkCommand(command, gitCurrentBranch(input.cwd));
  if (reason) {
    process.stderr.write(`[agent-guard] 막음: ${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
