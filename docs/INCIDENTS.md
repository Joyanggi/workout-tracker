# 문제 대장

에이전트 작업 중에 계획대로 안 된 일을 **키**로 묶어 두는 표다. 규칙 정비자(`agents/RULES-KEEPER.md`)만 고친다.
지휘자는 PR의 `## 규칙 메모`에 키를 붙여 적고(`agents/coordinator/PR.md` 3절), `node scripts/incidents.mjs --after-pr <지난 정비 PR>`가 키마다 몇 번 나왔는지 세어 이 표와 맞춰 본다.

**상태**
- `열림`: 아직 못 막았다. 2회 이상이면 다음 정비에서 막는다
- `막음(글)`: 규칙 문장으로 막았다. 다시 나오면 재발 → 장치(테스트·CI·`agent-guard`·스크립트 검사)로 바꾼다
- `막음(장치)`: 장치로 막았다. 다시 나오면 재발 → 장치가 왜 못 막았는지 PR에 쓰고 고친다
- `일회성`: 한도·네트워크처럼 규칙으로 막을 수 없다. 규칙대로 넘겼는지만 본다

`막은 PR`은 막은 변경이 들어간 PR 번호다. 그보다 뒤 PR에서 같은 키가 나오면 스크립트가 재발로 올린다. 번호가 비어 있으면 나오기만 해도 재발이다.

| 키 | 분류 | 상태 | 막은 방법 | 막은 PR | 나온 곳 (키 없던 옛 메모 포함) |
|---|---|---|---|---|---|
| `npm-lock-ci-version` | 환경 | 막음(장치) | CI·배포의 Node를 24로(잠금 파일이 npm 11) | #39 | #39 |
| `antigravity-limit-release` | 일꾼 | 열림 | | | #34 #35 #38 — 한도로 끝난 검토자를 release하면 `dispatch_inactive`, stop으로 닫음 |
| `rejection-text-truncated` | 명령 | 열림 | | | #35 #39 — 반려 "고칠 것"이 worker_done 알림에서 잘림, `orchestration inbox --full`로 읽음 |
| `worker-setup-timeout` | 일꾼 | 열림 | | | #32 — 새 작업 트리의 `npm ci`가 대기 시간을 넘김, `--task`·`--retry-of`로 다시 띄움 |
| `worktree-remove-permission` | 환경 | 열림 | | | #39 — 작업 트리 삭제가 Permission denied |
| `ack-delivery-id` | 명령 | 열림 | | | #32 — check 결과에 deliveryId가 없어 ack 못 함 |
| `review-range-start-commit` | 규칙 | 열림 | | | #35 — 설계→구현으로 넘어갈 때 리뷰 범위 시작 커밋을 PLAN 머지 전 SHA로 줌 |
| `screenshot-regen-committed` | 규칙 | 열림 | | | #39 — 되돌리기가 막혀 다시 찍은 스크린샷을 그대로 커밋 |
| `px-gate-flaky` | 검사 | 막음(장치) | 스크린샷 검사에서 크기 칸(탭 영역·버튼 높이)은 참고만, 숫자 기준 없앰 | | #39 — 시트 탭 영역 44px 기준이 실행마다 흔들려 사람 결정 두 번 |
| `usage-limit-resume` | 일꾼 | 일회성 | COORDINATOR.md 3절(한도면 gate, 풀리면 send) | | #32 #34 #35 #38 #39 |
| `push-after-pr` | 규칙 | 막음(글) | PR.md 1절 "PR을 만든 뒤에는 push하지 않는다" | | #16 #18 |
| `duplicate-issue` | 규칙 | 막음(글) | INTAKE.md 중복 확인 | #25 | #23 #24 |
