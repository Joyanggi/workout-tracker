# 에이전트 하네스 지도 (사람용)

이 레포를 AI 여러 모델로 설계·구현·리뷰하는 방식 전체를 한 장에 모은 것이다.
에이전트는 이 파일을 읽지 않는다. 에이전트용 규칙은 `CLAUDE.md`와 이 폴더의 역할 파일이다.

## 1. 흐름

```
요청 ─ 지휘자에게 보낸 기획(지휘자가 이슈로 만든다), GitHub 이슈, 또는 docs/FIELD-REPORT-*.md
  │  지휘자가 흐름을 고른다. 모르면 설계다 (coordinator/INTAKE.md)
  │
  ├─ 작은 수정 ── 구현자(Sonnet) → 리뷰어(Opus) ──────────────────────┐
  │                                                                    │
  └─ 설계 ── 설계자(Opus) → 검토자 Codex ∥ Antigravity(동시, 무료 한도)  │
              → 설계자가 검토 반영                                      │
              → 자동 승인 조건 맞음 ─┐   안 맞음 → PLAN PR ─[사람 머지]─┐  │
                                    ▼                                ▼  │
                         여러 작업 구현: 작업마다 구현자 → 리뷰어 (반려 1회까지)
                                    │                                   │
                                    ▼                                   ▼
                     PR (CI: 흔적 검사·test·build 필수) ──[사람: 화면 확인 → 머지]──▶ main
                                    │                                   │
                PR 본문 "규칙 메모"·"토큰 사용"                GitHub Pages 배포 → 폰 앱
                                    ▼                                   │
                     규칙 정비(주간) → 규칙 PR ─[사람 머지]        실사용 → 다음 실사용 보고

PLAN 구현 PR이 머지되면 (같은 지휘자 세션에서 이어서)
  품질 정리 ── 품질 관리자(Sonnet) → 리뷰어(Opus) → 정리 PR(동작 변경 없음) ─[사람 머지]
```

## 2. 역할과 모델

| 역할 | 파일 | 에이전트·모델 | 왜 |
|---|---|---|---|
| 지휘자 | `COORDINATOR.md` (+ `coordinator/`) | Claude Sonnet · low | 코드를 안 읽고 보고 첫 줄만 보고 판단한다. 싸게 오래 돈다 |
| 설계자 | `DESIGNER.md` | Claude Opus · high (첫 메시지에 `설계자 모델: fable`처럼 지정하면 그 Run만 바뀜) | 품질 차이가 가장 큰 단계. 호출은 적다 |
| 설계 검토자 | `PLAN-REVIEWER.md` | Codex, Antigravity (한도 시 Claude Sonnet·high 하나) | 다른 회사 모델이 놓치는 곳이 다르다. 무료 한도로 돈다 |
| 구현자 | `IMPLEMENTER.md` | Claude Sonnet · medium | 토큰을 가장 많이 쓰는 단계 |
| 리뷰어 | `REVIEWER.md` | Claude Opus · high (작은 수정은 medium) | 구현자와 다른 모델이어야 한다. 읽는 양은 적다 |
| 규칙 정비자 | `RULES-KEEPER.md` | Claude (사람이 직접 띄움) | 규칙 메모를 모아 규칙·안전장치를 고친다 |
| 품질 관리자 | `QUALITY-KEEPER.md` (+ `coordinator/QUALITY.md`) | Claude Sonnet · high, 리뷰는 Opus | PLAN 구현 PR이 머지되면 지휘자가 이어서 띄운다. 복사본·안 쓰는 코드·테스트만 살린 코드를 동작 변경 없이 치운다 |

## 3. 사람이 하는 말

지휘자는 main 작업 트리에서 띄운다: `claude --model sonnet --effort low --add-dir C:\Users\jyg66\orca\workspaces`
첫 메시지는 `agents/COORDINATOR.md를 읽고 ` 다음에 아래 중 하나를 붙인다.

| 하고 싶은 것 | 말 |
|---|---|
| **기획 던지기 (기본)** | `진행해.` 다음 줄부터 하고 싶은 것을 그냥 쓴다. 지휘자가 이슈를 만들고 흐름·PLAN 버전·작업 ID를 정한다 |
| 이미 있는 이슈 | `이슈 #24 진행해` (흐름은 지휘자가 고른다) |
| 작은 수정으로 정해서 | `이슈 #23을 작은 수정으로 진행해` |
| 설계로 정해서 | `설계 작업. 주제: 이슈 #24` (PLAN 파일·작업 ID는 적으면 그대로 쓴다) |
| 설계 검토자 지정 | 위 문장 끝에 `검토자: codex` (Antigravity 한도가 없을 때 등) |
| 모델 지정 (그 Run만) | 위 문장 끝에 `설계자 모델: fable`. 구현자와 리뷰어를 같은 모델로 만드는 지정은 거절된다 |
| PLAN 작업 하나 | `docs/PLAN-v1.14.md의 LL1을 진행해` |
| PLAN 남은 작업 전부 | `docs/PLAN-v1.14.md의 미구현 작업을 전부 진행해` |
| 멈춘 일 이어서 | 새 세션에서 같은 문장 + `이어서 진행해` (진행 파일 `.reports/run-*.md`를 읽고 이어간다) |
| 규칙 정비 | (지휘자 말고 그냥 Claude 세션에서) `agents/RULES-KEEPER.md를 읽고 규칙 정비해` |
| 품질 정리 (따로) | `품질 정리해` (PLAN이 끝나면 지휘자가 알아서 하므로 보통은 필요 없다) |

## 4. 사람이 하는 일 (관문)

1. **요청 쓰기.** 지휘자에게 기획을 보내거나 이슈 양식을 채운다. "무엇이 되면 끝인지"(성공 기준)를 한 줄이라도 쓰면 설계·리뷰가 그걸 기준으로 삼는다.
2. **PLAN PR 판단** (자동 승인 안 됐을 때만). 기각된 지적과 설계자가 정한 문구를 읽고 이견을 말하거나 머지한다.
3. **구현 PR 머지.** PR 본문의 "배포 영향"과 "사람이 화면에서 확인할 것"을 보고 머지한다. 머지 = 폰 앱 배포다.
   지휘자가 접수한 일이면 PR 맨 위 `흐름: … — 이유` 줄도 본다. 작은 수정으로 갔는데 판정 규칙이 바뀌었으면 머지하지 말고 말한다.
   **머지 전에 PR의 Commits 탭을 본다.** 마지막 커밋이 PR 화면에 올라온 뒤 머지한다(#16·#18에서 머지 뒤에 올라온 커밋이 main에 빠졌다).
4. **멈췄을 때.** 지휘자가 gate를 걸면 이유가 온다(한도, 권한 창, 사람 판단 필요). 해결하고 "이어서"라고 한다.
5. **품질 정리 PR 머지.** PLAN이 끝나면 하나 올라온다. 동작이 그대로라 화면 확인은 없다. 지운 줄이 더한 줄보다 많은지만 본다.
6. **가끔 규칙 정비.** PLAN 하나가 끝났거나 모델이 바뀌었을 때.

## 5. 무엇이 무엇을 강제하나

글로 쓴 규칙은 모델이 잊을 수 있다. 되돌릴 수 없는 것은 장치가 막는다.

| 장치 | 막는 것 | 위치 |
|---|---|---|
| GitHub ruleset `mainRuleset` | main 직접 push, 강제 push, 삭제, CI 실패한 PR 머지 | 레포 Settings → Rules |
| CI (`ci`) | 테스트·빌드 깨진 PR | `.github/workflows/ci.yml` |
| 흔적 검사 (`quality-scan --ci`, CI에서) | 새로 생긴 같은 이름 함수·상수 복사본, `.skip`·`.only`·`.todo` 테스트, `@ts-ignore`·`@ts-nocheck`, 무력화(`if (false)` 같은 늘 같은 조건, `any`, 이유 없이 빈 `catch`) | `scripts/quality-scan.mjs` (알고 있는 중복: `scripts/quality-allow.json`) |
| 배포 전 테스트 | 깨진 코드 배포 | `.github/workflows/deploy.yml` |
| 에이전트 안전장치 훅 | Claude 일꾼의 `gh pr merge`, main push, 강제 push, `reset --hard`, `clean -f`, `checkout --`, `branch -D`, 그리고 위 ruleset을 끄는 명령(`gh repo edit/delete`, API로 ruleset·브랜치 보호·main 삭제) | `.claude/settings.json` → `scripts/agent-guard.mjs` (테스트: `scripts/agent-guard.test.mjs`) |
| Codex 규칙 | Codex가 orca를 샌드박스 밖에서 실행(허용), 머지 금지(선택, 7절) | `~/.codex/rules/default.rules` (PC마다) |
| `.gitattributes` | CRLF 섞임 | 레포 |
| `.gitignore`의 `.reports/` | 검토 보고·진행 파일이 커밋되는 것 | 레포 |

ruleset은 승인 리뷰 0개로 되어 있다(혼자 쓰는 레포라 자기 PR을 승인할 수 없다). 그래서 **에이전트가 `gh pr merge`를 하면 서버는 막지 못한다.** 훅이 그 자리를 막는다.

## 6. 상태가 있는 곳

| 무엇 | 어디 |
|---|---|
| 해야 할 일 | GitHub 이슈 |
| 지금 하는 일의 진행 | `.reports/run-<대상>.md` (지휘자가 단계마다 고친다. 대화가 끊겨도 이어갈 수 있다) |
| 설계 검토 결과 | `.reports/<PLAN 버전>-<검토자>.md` |
| 설계 | `docs/PLAN-*.md` (바뀐 부분의 기록) |
| 지금 동작의 명세 | `README.md` "핵심 설계 결정" |
| 구현 기록 | `docs/DEV-RECORD-*.md`, 작은 수정은 PR 본문 |
| 규칙과 실제가 어긋난 일 | PR 본문 `## 규칙 메모`, 댓글 `## 규칙 메모 (추가)` |
| 역할·모델별 토큰 | PR 본문 `## 토큰 사용` (지휘자가 PR 직전에 잰다. 표 아래 주석이 기계용 원본) |

## 7. 새 PC 설정 (Windows)

레포 설정 (한 번만, GitHub 웹):
- Settings → General → Pull Requests → **Automatically delete head branches** 켜기 (지휘자는 로컬 브랜치만 지운다. 원격 브랜치는 이 설정이 지운다)
- Issues → Labels에 `개선`, `새 기능`, `구조 변경` 라벨이 있어야 이슈 양식의 라벨이 붙는다

PC마다:

- Orca 에이전트 설정: Claude 인자 `--permission-mode auto`, Codex 인자 비움(자체 설정 사용), Antigravity 인자 없음
- Orca 설정: 하위 에이전트 깊이 1, 끝난 일꾼 자동 닫기, 캐시 타이머 1시간, 잠자기 방지
- `gh auth login` (지휘자가 PR을 만들고 머지를 기다린다)
- `~/.codex/config.toml`:
  ```toml
  approval_policy = "on-request"
  approvals_reviewer = "auto_review"
  default_permissions = ":workspace"
  ```
- `~/.codex/rules/default.rules`:
  ```python
  prefix_rule(
      pattern = ["orca", ["status", "orchestration"]],
      decision = "allow",
      justification = "Orca 작업 보고는 샌드박스 밖에서만 Orca 앱과 통신할 수 있다",
  )
  # 선택: Codex도 머지·강제 되돌리기를 못 하게
  prefix_rule(pattern = ["gh", "pr", "merge"], decision = "forbidden", justification = "PR 머지는 사람이 한다")
  prefix_rule(pattern = ["git", "reset", "--hard"], decision = "forbidden", justification = "되돌리기는 cp 백업으로 한다")
  ```
- 하지 않는 것: `--dangerously-bypass-approvals-and-sandbox`나 bypass 권한을 기본값으로 두기, `powershell.exe`를 백신 예외에 넣기

## 8. 자주 걸리는 것

| 증상 | 원인 | 해결 |
|---|---|---|
| 검토자가 worker_done 없이 끝남 | Codex 샌드박스가 orca 실행을 막음 | 7절 Codex 규칙. 보고 파일 SHA가 맞으면 지휘자가 정상으로 본다 |
| 일꾼이 엉뚱한(main) 작업 트리에 뜸 | `--worktree current` | 경로로 지정(`COORDINATOR.md` "작업 트리 지정") |
| 설계자가 "main에 없다"고 함 | 지휘자 main 작업 트리가 옛것 | 지휘자 시작 때 `git pull --ff-only` (`COORDINATOR.md` 1-4) |
| 한글 깨짐 | PowerShell 5.1 CP949 | `CLAUDE.md` "환경" |
| 지휘자가 작업 트리 파일을 못 읽음 | `--add-dir` 없이 띄움 | 3절 명령으로 다시 띄우기 |
| `[agent-guard] 막음` | 안전장치 | 정상이다. 정말 필요한 명령이면 사람이 직접 터미널에서 한다 |
| Antigravity·Claude 한도 초과 | 주간·5시간 한도 | 지휘자가 시각을 알려주고 멈춘다. 풀리면 "이어서" |
| 지휘자가 "이슈 #N"이 뭐냐고 물음 | 예시 문장의 `#N`을 그대로 보냄 | 이슈가 없으면 번호 대신 요청 본문을 보낸다(기획 던지기) |
| 같은 요청 이슈가 두 개 | 이슈 만들기를 두 번 시킴 | 지휘자는 만들기 전에 같은 제목의 열린 이슈를 찾는다(INTAKE.md 1절). 남은 하나는 사람이 닫는다 |

## 9. 규칙을 바꾸는 법

- 규칙도 PR로 바꾼다. 지휘자는 규칙을 고치지 않고 메모만 남긴다.
- 메모가 두 번 이상 나오면 고친다. "하지 않는다"가 반복해서 어겨지면 글 대신 장치(훅·테스트·CI)로 옮긴다.
- 한 정책은 한 파일에만 둔다. PR 관련은 `coordinator/PR.md` 한 곳이다.
- 모델이 바뀌면 규칙 정비를 한 번 돌린다. 예전 모델 때문에 생긴 규칙은 지울 수 있는지 본다.

## 10. 토큰 기록

- **재는 것:** 지휘자가 PR을 만들기 직전에 `scripts/token-usage.mjs`를 돌려, 그 Run 동안 이 레포 폴더에서 돈 Claude·Codex 세션을 역할·모델별로 합쳐 PR 본문에 붙인다. 역할은 세션의 첫 지시문(`agents/DESIGNER.md를 읽고…`)으로 가린다. 프롬프트 내용은 남기지 않는다.
- **못 재는 것:** Antigravity(로컬 기록 형식을 모른다), Orca 밖에서 한 일(이 대화 같은 claude.ai 채팅)
- **입력 환산:** 새 입력 1을 기준으로 캐시 읽기 0.1, 캐시 쓰기 2(1시간), 출력 5로 센 근삿값이다. 같은 모델 안에서 역할끼리 비교하는 용도다. Opus·Sonnet·Fable 사이 차이는 모델 칸을 같이 본다.
- **보는 법:** `node scripts/token-usage.mjs --collect` (gh 필요) — 머지된 PR들을 모아 역할별 몫·캐시 적중·출력 몫을 보여준다. 주간 규칙 정비가 이 표로 아낄 구간을 고르고(`RULES-KEEPER.md` 5절), 모델 바꾸기는 사람에게 제안만 한다.
- **지금 Run만 보기:** `node scripts/token-usage.mjs --since 2026-11-10T13:00:00+09:00`
