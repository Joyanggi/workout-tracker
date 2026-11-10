# 지휘자 — 품질 정리 (PLAN이 끝난 뒤)

PLAN 구현 PR이 머지되고 정리(`agents/coordinator/PR.md` 5절)까지 끝나면, **같은 세션에서** 이 흐름을 한 번 돈다(COORDINATOR.md 6절 예외).
사람이 "품질 정리해"라고 따로 시켜도 이 흐름이다. 이때 범위는 마지막 품질 정리 PR 이후 전체다.
`agents/COORDINATOR.md`의 1·3·5·7절과 "기다리는 법"·"작업 트리 지정"은 그대로 따른다. PR은 `agents/coordinator/PR.md`를 따른다.

## 1. 건너뛰는 경우

- 작은 수정(SMALL.md)과 PLAN PR만 머지된 경우에는 돌지 않는다. PLAN 구현이 끝났을 때만이다.
- 같은 PLAN으로 이미 품질 정리 PR을 만들었으면 돌지 않는다(`gh pr list --state all --search "품질 정리 <PLAN 버전> in:title"`).

## 2. 일꾼 배치

| 순서 | 역할 | 에이전트 | 모델 | effort | 작업 트리 |
|---|---|---|---|---|---|
| 1 | 품질 관리자 | claude | sonnet | high | **새 작업 트리** `quality-<PLAN 버전>`, 방금 pull한 `main` 기준 |
| 2 | 리뷰어 | claude | opus | high | 품질 관리자의 작업 트리 (경로로 지정) |

정리는 판정보다 손이 많이 가서 sonnet이 하고, 동작이 그대로인지는 opus가 본다. 같은 모델이 자기 정리를 리뷰하지 않는다.

## 3. spec

품질 관리자:
```
agents/QUALITY-KEEPER.md를 읽고 품질 정리해.
범위: <PLAN 구현 PR의 첫 커밋 부모>..<머지 커밋> (이번 PLAN이 바꾼 것)
끝나면 5절 형식의 보고를 worker_done 요약으로 보내.
```

`결과: 정리할 것 없음`이면 리뷰어를 띄우지 않고 release한 뒤 4절 보고로 끝낸다.
`결과: 정리함`이면 리뷰어를 띄운다.
```
agents/REVIEWER.md를 읽고 이 브랜치를 리뷰해. 품질 정리라 PLAN이 없다.
기준: agents/QUALITY-KEEPER.md 2·3절. 동작이 바뀌지 않았는지(골든 테스트를 고치지 않았는지, 판정·내보내기 결과), 지운 것이 정말 안 쓰이는지, 복사본을 지울 때 두 벌의 동작이 같았는지를 본다.
판정 전문을 worker_done 요약으로 보내.
```
반려 규칙은 COORDINATOR.md 3·4절과 같다.

## 4. 마무리

승인되면 PR.md대로 PR을 만든다. 제목: `refactor(quality): 품질 정리 <PLAN 버전>`.
PR 본문 머리 항목: `품질 정리 (동작 변경 없음) · 범위 <범위>`, 품질 관리자 보고의 표 전체, 남긴 이슈 번호.
`package.json` 버전은 올리지 않는다.

```
완료: 품질 정리 <PLAN 버전> (<정리함 | 정리할 것 없음>)
<정리함이면 PR.md 5절의 공통 줄. 사람이 할 일: PR 머지 (화면 확인 없음 — 동작 변경 없음)>
<정리할 것 없음이면 "남긴 것" 줄만>
```
