# 판정 — 기계가 못 재는 것을 재는 사람 브리프

매 실행 프롬프트를 새로 지어내면 기준이 흔들린다. 아래 브리프를 **문면 그대로** 신선한 컨텍스트 에이전트에 전달한다(`<...>`만 치환). 전원 **블라인드** — 제작 과정·스펙·의도를 주지 않는다. 캡처는 audit이 이미 떠 뒀으므로 판정자는 브라우저를 띄우지 않는다. 서브에이전트를 쓸 수 없으면 자기 판정을 하되 보고서에 "자기 판정(비블라인드)"라고 쓴다.

| 브리프 | 무엇 | 통과선 | 기록 |
|---|---|---|---|
| [ai-slop-judge](ai-slop-judge.md) §A | 섹션별 AI-스러움 역척도 1~5 | 전 섹션 ≥4, ≤3 = 철거 후 재단조 | `qa/ai-score.md` |
| [desire-judge](desire-judge.md) §B | 욕망 /100, 경쟁 2종 대비 | 절대 ≥70 · 경쟁 −20 이내, 미달 = 방향 재설계 | `qa/desire-score.md` |
| [persona-judge](persona-judge.md) §C | 타깃 페르소나 5문항 | ② 틀리면 🔴 | `qa/persona.md` |
| [gatekeeper-judge](gatekeeper-judge.md) §D | 이미지 인슬롯 판정, 등급 A~D | 자산 등급 = 페이지 상한 | `qa/gatekeeper.md` |
| [comp-judge](comp-judge.md) §E | 사용자가 고른 시안 대비 10축 | 전 축 ≥4, parity ≥4 | `qa/comp-judge.md` |
| [sameness-judge](sameness-judge.md) | 기계(sameness — 페이지 교차) 결과의 사람 확인 6항목 | `sameness.cross-type-clone`·`sameness.same-opening`·`work.starved` 🔴 0 | `qa/audit.md` |

## 실행 순서

1. 기계 배터리(`audit.mjs`)를 먼저 닫는다 — 기계 결함을 안고 패널에 보내면 패널 시간이 낭비된다. 미제공 게이트는 통과가 아니라 "판정되지 않음".
2. §A·§B·§C·§D(·시안이 있으면 §E)를 **동시에** 신선한 컨텍스트에 전달.
3. 철거 목록(§A)과 버릴 것 목록(§B)을 합쳐 처리: **철거는 재단조, 그 외는 정밀 수리** → audit 재실행 + §A 재채점.

관련: [types/ 목차](../types/index.md) · [systems/ 목차](../systems/index.md) · [evidence/ 목차](../evidence/index.md)
