// scripts/agent-guard.mjs — 에이전트 안전장치가 막을 것은 막고, 평소 작업 명령은 통과시키는지 잠근다.
import { describe, expect, it } from 'vitest';
import { checkCommand, splitCommands } from './agent-guard.mjs';

const onMain = () => 'main';
const onFeature = () => 'Joyanggi/v1.13';

describe('agent-guard: 막는 명령', () => {
  it.each([
    ['gh pr merge 20 --merge'],
    ['gh pr merge --squash --delete-branch'],
    ['cd /c/x && gh pr merge 3'],
    ['bash -c "gh pr merge 3"'],
    ['gh api -X PUT repos/Joyanggi/workout-tracker/pulls/20/merge'],
    ['git push origin main'],
    ['git push origin HEAD:main'],
    ['git push origin HEAD:refs/heads/main'],
    ['git push origin :main'],
    ['git push -f origin Joyanggi/v1.13'],
    ['git push --force-with-lease origin Joyanggi/v1.13'],
    ['git push origin +Joyanggi/v1.13'],
    ['git -C /c/orca/workspaces/x push --force'],
    ['git reset --hard origin/main'],
    ['git clean -fd'],
    ['git checkout -- src/lib/a.ts'],
    ['git checkout .'],
    ['git restore src/lib/a.ts'],
    ['git branch -D Joyanggi/v1.13'],
    ['git worktree remove --force ../x'],
    ['git stash clear'],
    ['npm test 2>&1 | tail -15; git reset --hard'],
  ])('%s', (cmd) => {
    expect(checkCommand(cmd, onFeature)).not.toBeNull();
  });

  it('main 브랜치에서 인자 없는 push와 HEAD push를 막는다', () => {
    expect(checkCommand('git push', onMain)).not.toBeNull();
    expect(checkCommand('git push -u origin HEAD', onMain)).not.toBeNull();
  });
});

describe('agent-guard: 통과시키는 명령 (평소 작업)', () => {
  it.each([
    ['git push -u origin Joyanggi/v1.13'],
    ['git push origin HEAD'],
    ['git push'],
    ['git pull --ff-only'],
    ['git fetch -q origin main'],
    ['git checkout main'],
    ['git checkout -b Joyanggi/v1.14-ll1 origin/main'],
    ['git restore --staged src/lib/a.ts'],
    ['git branch -d Joyanggi/v1.13'],
    ['git worktree remove ../x'],
    ['git diff origin/main...HEAD --stat'],
    ['git log --oneline HEAD..origin/main'],
    ['git commit -F - <<\'MSG\'\nfeat(KK1): main 반영 전 확인\nMSG'],
    ['gh pr create --title "x" --body-file .reports/pr.md'],
    ['gh pr view 20 --json state -q .state'],
    ['gh pr comment 20 --body-file .reports/memo.md'],
    ['gh api repos/Joyanggi/workout-tracker/pulls/20 -q .body'],
    ['npm test 2>&1 | tail -15'],
    ['cp src/lib/a.ts /tmp/a.ts.bak && cmp src/lib/a.ts /tmp/a.ts.bak'],
    ['echo "PR 머지는 사람이 한다"'],
  ])('%s', (cmd) => {
    expect(checkCommand(cmd, onFeature)).toBeNull();
  });
});

describe('agent-guard: 명령 분해', () => {
  it('&&, ;, |, 줄바꿈으로 나누고 따옴표 안은 한 토큰으로 둔다', () => {
    expect(splitCommands('a "b c" && d; e | f\ng')).toEqual([['a', 'b c'], ['d'], ['e'], ['f'], ['g']]);
  });
});
