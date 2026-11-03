# CLAUDE.md

이 레포에서 여는 모든 Claude 세션이 자동으로 읽는 공통 규칙이다. 매 세션 비용이 드니 짧게 유지한다.
역할별 규칙은 `agents/`에 있다.

## 역할

지정받은 역할 파일을 먼저 읽고 따른다.
설계자 `agents/DESIGNER.md` · 설계 검토자 `agents/PLAN-REVIEWER.md` · 구현자 `agents/IMPLEMENTER.md` ·
리뷰어 `agents/REVIEWER.md` · 지휘자 `agents/COORDINATOR.md`

역할이 없으면 일반 대화다. 코드를 고치기 전에 무엇을 바꿀지 먼저 말한다.

## 이 앱

1인용 운동·식단 기록 PWA. 서버·로그인이 없고, 데이터는 IndexedDB(Dexie)에 있으며 Gist로 백업한다.
`README.md`의 "핵심 설계 결정"을 뒤집는 변경은 하지 않는다.

## 명령

- 테스트 `npm test`, 타입 확인과 빌드 `npm run build`
- `tsc`를 직접 호출하지 않는다. `npx tsc --noEmit`은 `src`를 검사하지 않는다.

## 토큰 절약 (모든 역할 공통)

- **긴 출력은 끝부분만 본다.** `npm test 2>&1 | tail -15`, `npm run build 2>&1 | tail -8`
  (PowerShell에서는 `| Select-Object -Last 15`)
- **작업 중에는 관련 테스트 파일만 돌린다** (`npx vitest run <파일>`). 전체 테스트는 마무리에 한 번.
- **큰 문서는 통째로 읽지 않는다.** README, PLAN, DEV-RECORD는 `grep -n`으로 필요한 절을 찾아 그 부분만 읽는다.
- **한 번 읽은 파일은** 바뀌지 않았으면 다시 읽지 않는다.
- **세션 중에 모델을 바꾸지 않는다.** 바꾸면 대화 캐시를 처음부터 다시 만든다.

## 브랜치와 배포

- `main`에 push하면 GitHub Pages로 바로 배포되고 실제로 쓰는 폰 앱이 바뀐다.
  그래서 에이전트는 `main`에 머지하거나 push하지 않는다. 머지와 push는 사람이 한다.
- 작업은 최신 `main`에서 시작한 별도 브랜치에서 한다.
  구현은 `feature/<PLAN 버전>-<작업 ID>`, 설계는 `plan-<PLAN 버전>`. Orca가 붙이는 `Joyanggi/` 접두사는 그대로 둔다.
- `package.json` 버전은 PLAN이 정한 시점에만 올린다.

## 문서

- `docs/PLAN-*.md`: 설계서. 설계자만 쓴다.
- `docs/DEV-RECORD-*.md`: 구현 기록. 맨 위에 "이 환경에서 확인된 제약" 목록이 있다. 구현자가 쓴다.

## 환경

- Windows, Orca 작업 트리(작업마다 별도 폴더). Claude Code의 셸은 Git Bash다.
- **PowerShell로 명령을 실행하는 에이전트(Codex 등)는 한글 인코딩에 주의한다.**
  Windows PowerShell 5.1은 기본이 CP949라 UTF-8 파일의 한글이 깨진다.
  - 읽을 때: 처음에 `[Console]::OutputEncoding=[Text.UTF8Encoding]::new()`를 실행하고, `Get-Content`에는 항상 `-Encoding UTF8`을 붙인다.
  - 쓸 때: PowerShell(`Set-Content`, `Out-File`, `>`)로 파일을 쓰지 않는다. 한글이 깨지거나 BOM이 붙는다. 에이전트의 파일 편집 도구를 쓴다.
- 커밋 메시지는 `git commit -F - <<'MSG'`로 쓴다.
- 줄바꿈은 LF로 고정돼 있다(`.gitattributes`).
- 되돌리기는 `git checkout <파일>`이 아니라 `cp` 백업으로 한다. 커밋 안 된 작업을 날리지 않기 위해서다.
