# sg-page-forge 위키 — 페이지를 만드는 지식의 트리

SKILL.md는 절차와 판정자 지도만 갖는다. 규칙·수치·근거는 전부 여기 있다. 경로에 있는 문서는 끝까지 읽고, 경로 밖 문서는 읽지 않는다.

## 가지

| 가지 | 무엇 | 언제 읽나 |
|---|---|---|
| [evidence/](evidence/index.md) | 근거 — AI 티 패턴과 출처, 한글 조판, 코퍼스 보정 원리, [규칙 색인](evidence/rule-index.md)(코드에서 생성), 출처 URL | P1(리드 고를 때), 규칙을 의심할 때 |
| [types/](types/index.md) | 페이지 유형 — 사용자의 동사가 정하는 8유형(랜딩·소개·문서·카탈로그·도구·요금제·폼·대시보드)과 미등재 화면 선언 | P0(계약), P5(빌드) |
| [workflow/](workflow/brief.md) | 공정 — P0 계약 → P1 리드·근거 → P2 시안 → P3 전사 → P4 브리프 → P5 빌드 → P6 검증 → P7 복구 | 항상, 순서대로 |
| [systems/](systems/index.md) | 화면 체계 — 타이포(한글 포함), 색, 간격, 모션 프리셋, 컴포넌트 층, 자산 | P3(토큰), P5(빌드) |
| [judge/](judge/index.md) | 판정 브리프 — 시안 대비, AI 티, 매력, 페르소나, 게이트키퍼, 교차 동일성. 문면 그대로 쓴다 | P6 |
| [directions.md](directions.md) | 방향 7축 유도 — 스킨 목록이 아니라 조합 축, 히스토리 대비 반복 금지 | P2 |

## 읽기 경로

- **새 페이지·전면 개편**: workflow/brief → types/<유형> → evidence/ai-slop → workflow/lead → workflow/comp → systems(타이포·색·간격·모션) → workflow/transcribe → workflow/build → workflow/verify → judge.
- **기존 사이트 진단만**: workflow/verify의 `--diagnose` 절 + types/<유형> + judge/sameness-judge. 재제작을 시작하지 않는다.
- **섹션 하나 다시**: 그 페이지의 브리프(`.sognora/page/briefs/`) + systems 해당 페이지 + judge/ai-slop-judge.
- **규칙이 의심될 때**: evidence/corpus — 레퍼런스에서 켜지는 규칙은 슬롭이 아니다. 규칙을 고치기 전에 `references/corpus-baseline.json`을 읽는다.

## 이 위키의 규칙

1. 판정자를 적을 수 없는 규칙은 "관행"이라고 표기한다. 관행은 채택해도 되지만 효과를 주장하면 거짓이다.
2. 수치는 출처와 함께. 스킬 저자가 정한 임계는 코퍼스 실측으로 보정한 값만 남긴다.
3. 새 의무는 SKILL.md 강제 지도에 행을 더하는 것으로만 생긴다. 위키에 규칙을 쓰고 지도에 안 적으면 그 규칙은 없는 것이다.
4. 문서는 요약하지 않는다. 브리프에 옮길 때는 verbatim 병합.
