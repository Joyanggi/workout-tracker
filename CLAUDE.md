# CLAUDE.md

이 파일은 이 레포에서 여는 **모든** Claude 세션이 자동으로 읽는다(지휘자·구현자·리뷰어 공통).
그래서 공통 사실만 짧게 둔다. 역할별 규칙은 `agents/` 아래에 있다.

## 역할

세션을 시작할 때 역할 파일을 지정받으면 그 파일을 먼저 읽고 따른다.

| 역할 | 파일 |
|---|---|
| 구현자 | `agents/IMPLEMENTER.md` |
| 리뷰어 | `agents/REVIEWER.md` |
| 지휘자 | `agents/COORDINATOR.md` (아직 없음) |

역할을 지정받지 않았으면 일반 대화다. 코드를 고치기 전에 무엇을 바꿀지 먼저 말한다.

## 이 앱

1인용 운동·식단 기록 PWA. 서버·로그인이 없다. 데이터는 기기의 IndexedDB(Dexie)에만 있고 Gist로 백업한다.
설계 판단의 근거는 `README.md`의 "핵심 설계 결정"에 있다. 그 결정을 뒤집는 변경은 하지 않는다.

## 명령

- 테스트: `npm test` (vitest run)
- 타입 확인 + 빌드: `npm run build`
- **`tsc`를 직접 호출하지 않는다.** `npx tsc --noEmit`은 `src`를 검사하지 않는다.

## 브랜치와 배포

- **`main`에 push하면 GitHub Pages로 바로 배포되고, 실제로 쓰는 폰 앱이 업데이트된다.**
- 그래서 에이전트는 `main`에 머지하거나 push하지 않는다. 머지와 push는 사람이 한다.
- 작업은 항상 별도 브랜치에서 한다. 브랜치는 최신 `main`에서 시작한다.
- 브랜치 이름은 `feature/<PLAN 버전>-<작업 ID>` 형식이다. 예: `feature/v1.10-ee2`
- `package.json` 버전은 PLAN이 정한 시점에만 올린다.

## 문서

| 위치 | 내용 | 에이전트가 고치나 |
|---|---|---|
| `docs/PLAN-*.md` | 설계서. 무엇을 왜 만드는지, 검증 항목, 범위 제외 | 고치지 않는다 (사람·설계자 몫) |
| `docs/DEV-RECORD-*.md` | 구현 기록. 맨 위에 "이 환경에서 확인된 제약" 누적 목록 | 구현자가 쓴다 |
| `README.md` | 핵심 설계 결정, 데이터 모델 | 설계 결정이 바뀔 때만 |

## 작업 환경 (2026-11~)

- Windows PC, Orca 작업 트리(작업마다 별도 폴더·브랜치). 터미널은 PowerShell.
- Claude Code의 셸 명령은 Git Bash로 실행된다. 커밋 메시지는 heredoc(`git commit -F - <<'MSG'`)으로 쓴다.
- 줄바꿈은 `.gitattributes`로 LF 고정이다. 파일을 새로 만들 때도 LF로 쓴다.
- 되돌리기는 `git checkout <파일>`이 아니라 `cp` 백업으로 한다. 커밋 안 된 작업을 날리지 않기 위해서다.
