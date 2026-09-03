# P6 — 검증: 기계 배터리 → 시안 대비 판정 → 패널

> 판정자: `audit.mjs`(기계 일괄) · [judge/](../judge/index.md) 브리프(사람 축, 블라인드).

## 1. 기계 — 한 명령

```bash
node "$S/audit.mjs"      # 프로젝트 루트에서 인자 없이 — 계약·src/·qa 기본 경로. 기존 사이트 진단은 --diagnose
```

계약을 읽어 페이지마다 scan(관측 한 번) → detect(AI 티·한글 조판·서체·여백 지배·유형별 구조 `structure.*`) → copylint(길이·금칙어·시점·한·영 패턴)를 돌리고, tokens/engineering/lead가 지정된 페이지에는 conform(토큰 준수·잔존)·behavior(선언 동작 실측·no-JS/reduced-motion)·irdiff(골격 오차 밴드·깊이 대조·장면 예산)를 더한다. 교차 축은 1회: sameness(다른 유형이 같은 틀인가·WORK-STARVED)·primitives·comp --check. 결과는 `audit.md` 한 장.

- **미제공 게이트는 통과가 아니라 "판정되지 않음"**이다. 캐시·계약 파일이 없어 못 잰 축은 보고서와 등급에 그대로 남는다.
- 단일 AI 티 패턴으로 실패시키지 않는다(Design Slop Cop 1,590 코퍼스에서 46%가 패턴 0~1개). 예외: 단독 🔴 규칙(품질 바닥·조판·카피 시점·유형 구조·여백 지배 — [규칙 색인](../evidence/rule-index.md)의 ● 표시)은 합산 없이 페이지를 🔴로 만든다(계측·파손이지 취향이 아니다). 취향 계열은 4종 이상 합산일 때만.
- 레퍼런스에서 켜지는 규칙은 슬롭이 아니다([evidence/corpus](../evidence/corpus.md)). 규칙을 의심하면 baseline을 읽는다.
- 기존 사이트 진단은 `--diagnose`: 시안·facts 의무를 생략하고 화면별 판정과 일 점유율 표만 낸다. 🔴이 붙은 화면부터 P2로 들어간다. 통과한 화면을 인상만으로 갈아엎지 않는다.

## 2. 시안 대비 — 자(ruler)는 사용자가 고른 시안

시안이 있으면 `node "$S/judge-pack.mjs"`가 조립한 `qa/judge/comp-judge.md`(브리프의 블록인용만 — 근거·처분은 판정자에게 주지 않는다)와 캡처를 신선한 컨텍스트에 준다. 시안이 없으면 이 축은 미제공이다. 축: match·subject·material·medium·composition·typography·panel·mobile·finish·parity, 각 1~5. **≤3 = 그 층 결함, parity ≥4 필수.** 리드 사례를 자로 쓰지 않는다 — 리드와 계열·명암이 다르면 결함이 아닌 것이 터진다(담화 v5-r4: Kage 대비 🔴 8, 시안 대비 🔴 0).

## 3. 패널 — 블라인드, 동시 실행(`judge-pack.mjs`가 조립)

기계 실패를 해소한 뒤에 보낸다. [judge/](../judge/index.md)의 브리프를 문면 그대로:
- AI-티 시각 채점(섹션별 1~5, ≤3 = 철거 후 재단조)
- 매력 채점(절대 ≥70; 경쟁 캡처 2종이 있을 때만 최고점 −20 이내, 없으면 상대 축 미제공 — 미달은 수리가 아니라 P2 회귀)
- 페르소나 5문항(②를 틀리면 무조건 🔴)
- 이미지 게이트키퍼(자산 등급 = 페이지 등급 상한)
- 페이지가 2장 이상이면 [sameness-judge](../judge/sameness-judge.md)의 사람 확인 항목.

## 완료 조건

- audit 🔴 0 · QF 0 · 미제공 없음(있으면 A 불가)
- 시안 대비 전 축 ≥4
- AI-티 전 섹션 ≥4 · 매력 통과 · 페르소나 ② 정답 · 게이트키퍼 A
- `defects.md`의 결함이 전부 "해결(재검증 캡처 있음)"

등급: A(전부) · B(미제공 있음 / E클래스 부재 캡 / 생성 폴백 캡) · C(🔴 1+ 또는 시안 대비 ≤3 잔존) · D(가짜 증거·사실 무근 카피 — 채택 금지).

## 다음

[P7 복구](recovery.md)
