# 문제 대장

에이전트 작업 중에 계획대로 안 된 일을 **키**로 묶어 두는 표다. 규칙 정비자(`agents/RULES-KEEPER.md`)만 고친다.
키는 **원인**의 이름이다(작업 ID나 날짜를 넣지 않는다). 있는 키는 `node scripts/incidents.mjs --keys`로 본다.
지휘자는 PR의 `## 규칙 메모`에 키를 붙여 적고(`agents/coordinator/PR.md` 3절), `node scripts/incidents.mjs --after-pr <지난 정비 PR>`가 키마다 몇 번 나왔는지 세어 이 표와 맞춰 본다.

**상태**
- `열림`: 아직 못 막았다. 2회 이상이면 다음 정비에서 막는다
- `막음(글)`: 규칙 문장으로 막았다. 다시 나오면 재발 → 장치(테스트·CI·`agent-guard`·스크립트 검사)로 바꾼다
- `막음(장치)`: 장치로 막았다. 다시 나오면 재발 → 장치가 왜 못 막았는지 PR에 쓰고 고친다
- `일회성`: 한도·네트워크처럼 규칙으로 막을 수 없다. 규칙대로 넘겼는지만 본다

`막은 PR`은 막은 변경이 들어간 PR 번호다. 그보다 뒤 PR에서 같은 키가 나오면 스크립트가 재발로 올린다. 번호가 비어 있으면 나오기만 해도 재발이다.
`이번 정비`는 막은 PR 번호를 아직 모른다는 뜻이다(정비 PR을 만들기 전에 쓴다). 그동안은 재발로 올리지 않는다. 다음 정비가 번호로 바꾼다.

| 키 | 분류 | 상태 | 막은 방법 | 막은 PR | 나온 곳 (키 없던 옛 메모 포함) |
|---|---|---|---|---|---|
| `npm-lock-ci-version` | 환경 | 막음(장치) | CI·배포의 Node를 24로(잠금 파일이 npm 11). `scripts/check.test.mjs`가 로컬 검사와 CI 목록이 같은지 본다 | #39 | #39 — CI의 npm ci가 잠금 파일을 거부 |
| `rejection-text-truncated` | 명령 | 막음(글) | 리뷰어가 판정 전문을 `.reports/review-<작업 ID>.md`에 쓰고 지휘자는 그 파일에서 "고칠 것"을 읽는다(REVIEWER.md 3절, COORDINATOR.md 4절) | 이번 정비 | #35 #39 #43 #46 — 반려 "고칠 것"이 worker_done 알림에서 잘림 |
| `antigravity-limit-release` | 일꾼 | 막음(글) | 한도로 끝난 일꾼은 release가 거부되면 `worker-stop`(COORDINATOR.md "release 확인") | 이번 정비 | #34 #35 #38 #42 — 한도로 끝난 검토자를 release하면 `dispatch_inactive` |
| `worker-setup-timeout` | 일꾼 | 막음(글) | 새 작업 트리는 시작 대기 5분, `agent_readiness` 시간 초과면 `--retry-of`로 한 번 자동 재시도(COORDINATOR.md "작업 트리 지정") | 이번 정비 | #32 #43 — 새 작업 트리의 `npm ci`가 대기 시간을 넘김 |
| `worktree-remove-permission` | 환경 | 막음(글) | 다시 시도하지 않고 브랜치만 지운 뒤 남은 폴더를 `정리:` 줄에 적는다(PR.md 5절). 원인(Windows에서 폴더를 연 프로세스)은 못 없앴다 | 이번 정비 | #39 #43 #46 — 작업 트리 삭제가 Permission denied |
| `incident-key-renamed` | 규칙 | 막음(장치) | `node scripts/incidents.mjs --keys`로 있는 키를 먼저 보고, 그래도 다른 이름을 쓰면 아래 "다른 이름" 표가 합쳐 센다 | 이번 정비 | #45 #46 — 대장에 있는 원인에 새 키를 지어 씀(4건), 작업 ID를 넣은 키(3건) |
| `review-range-start-commit` | 규칙 | 막음(글) | 설계에서 넘어온 첫 작업도 구현자 띄우기 직전에 시작 커밋을 새로 잰다(BATCH.md) | 이번 정비 | #35 — 리뷰 범위 시작 커밋을 PLAN 머지 전 SHA로 줌 |
| `px-gate-flaky` | 검사 | 막음(장치) | 스크린샷 검사에서 크기 칸(탭 영역·버튼 높이)은 참고만, 숫자 기준 없앰 | #40 | #39 — 시트 탭 영역 44px 기준이 실행마다 흔들려 사람 결정 두 번 |
| `review-missed-check-coverage` | 반려 | 열림 | | | #46 — 검사 도구·기록이 PLAN의 검사 항목 일부를 빠뜨림(QQ0 유리 판정 3항목, QQ2 실측 1건). 한 PR 안에서 두 번 |
| `css-scope-regression` | 반려 | 열림 | | | #46 — 공용 클래스(`.row-sub`) 여백을 토큰으로 바꾸며 요소별 차이가 사라짐 |
| `plan-amend-after-merge` | 규칙 | 열림 | | | #46 — PLAN 머지 뒤 사람이 새 요구를 줘 구현 브랜치에서 PLAN 보정. 규칙에 길이 없다 |
| `design-call-by-human` | 사람 | 일회성 | 설계 판단은 사람 몫이다(REVIEWER.md `사람 필요`) | | #46 — 라이트 시트 농도를 사람이 정함 |
| `ack-delivery-id` | 명령 | 열림 | | | #32 — check 결과에 deliveryId가 없어 ack 못 함 |
| `screenshot-regen-committed` | 규칙 | 열림 | | | #39 — 되돌리기가 막혀 다시 찍은 스크린샷을 그대로 커밋 |
| `usage-limit-resume` | 일꾼 | 일회성 | COORDINATOR.md 3절(한도면 gate, 풀리면 send). 검토자 한도는 Claude 검토자로 교체(coordinator/DESIGN.md) | | #32 #34 #35 #38 #39 #42 #45 #46 — 사용량 한도로 멈춤 |
| `push-after-pr` | 규칙 | 막음(글) | PR.md 1절 "PR을 만든 뒤에는 push하지 않는다" | | #16 #18 — 머지 뒤 올라온 커밋이 main에 빠짐 |
| `duplicate-issue` | 규칙 | 막음(글) | INTAKE.md 중복 확인 | #25 | #23 #24 — 같은 요청 이슈가 두 개 |

## 다른 이름

같은 원인에 지휘자가 다른 키를 지어 쓴 것이다. `scripts/incidents.mjs`가 원래 키로 합쳐 센다. 새 원인이 아니면 위 표에 줄을 더하지 말고 여기에 올린다.

| 다른 이름 | 원래 키 |
|---|---|
| `review-verdict-truncated` | `rejection-text-truncated` |
| `worktree-remove-denied` | `worktree-remove-permission` |
| `antigravity-quota` | `usage-limit-resume` |
| `claude-5h-limit` | `usage-limit-resume` |
| `qq0-check-gaps` | `review-missed-check-coverage` |
| `qq2-record-gaps` | `review-missed-check-coverage` |
| `qq4-row-sub-margin` | `css-scope-regression` |
| `sheet-alpha-human-call` | `design-call-by-human` |
