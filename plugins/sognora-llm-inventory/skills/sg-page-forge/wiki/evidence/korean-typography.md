# 근거 — 한글 조판

- 근거 수준: W3C "Requirements for Hangul Text Layout and Typography"(klreq), Google Fonts Korean 쇼케이스, Morisawa Hangeul 가이드, 레퍼런스 실측(toss = 한글 조판 정답지).
- 판정자: 기계(scan) `korean.line-height`(행간<1.5)·`korean.italic`(이탤릭)·`korean.letter-spacing`(양수 자간)·`font.hangul-fallback`(한글 폰트 미지정)·`copy.maker-voice`(제작자 시점)·`copy.manual-voice`(설명서 시점) · 스크립트 밖: keep-all 전역, 2분할 강조 어순 — AD 검수.

## klreq 요점 (이 스킬이 쓰는 것만)

- 한글은 고정폭·가변폭 모두 쓰인다. 웹 본문은 가변폭 서체가 표준.
- 줄바꿈 단위는 **어절**(띄어쓰기) — `word-break: keep-all`이 그 구현. `break-all`은 단어를 찢는다.
- 문장 부호(마침표·쉼표)는 라틴과 같은 반각 사용이 웹 관행. 세로쓰기는 대상 아님.
- 한글 글리프는 라틴보다 **넓고 낮다** — 같은 pt에서 라틴이 크게 보이므로 혼용 시 라틴 서체의 x-height·너비를 맞춰 고른다(Morisawa).
- 한글 서체 3계열: 명조(Mincho/바탕), 고딕(산세리프), 둥근고딕. 라틴 세리프↔명조, 그로테스크↔고딕이 짝.

## 수치 (실측·규범)

| 항목 | 값 | 근거 |
|---|---|---|
| 본문 행간 | 1.5~1.8 | `korean.line-height` 하한 1.5, directions 1.6~1.8, toss 실측 |
| 디스플레이 행간 | 1.05~1.2 정상 | `type.min-size` 오탐 수정 이력 |
| 본문 자간 | 0 ~ 미세 음수 | `korean.letter-spacing` 양수 금지, 라틴 −0.02em을 그대로 쓰면 붙는다 |
| 라벨 트래킹 | 라틴 대문자만 넓게, 한글은 ≤0.1em(관행) | AD |
| 최소 크기 | 12px(전 텍스트), 본문 15px | `type.min-size` |
| 이탤릭 | 금지 | 자형 없음 |
| 강조 | 무게·색. 2분할 강조가 어순을 깨는지 확인 | AD |
| 무게 | 300~600 창(700+는 방향 선언) | Kage·Sylva 집계 |

## 폰트 지정

- `font-family: "Pretendard", "Noto Sans KR", system-ui, sans-serif` 처럼 **한글 서체가 체인에 명시**돼야 한다. 라틴만 있으면 `font.hangul-fallback`.
- 웹폰트 로딩: 한글은 글리프 수가 많아 서브셋(동적 서브셋 Pretendard·Google Fonts `unicode-range`)을 쓴다. `font-display: swap`.
- 숫자·라틴 짝은 x-height가 맞는 것으로. 가격·시간은 `tabular-nums`.

## 출처

- W3C klreq: https://www.w3.org/TR/klreq/
- Google Fonts Korean: https://googlefonts.github.io/korean/ · https://github.com/googlefonts/korean
- Morisawa Hangeul typography guide: https://www.morisawa-usa.com/post/hangeul-typogarphy-guide
- CJK web typography(SymbolFYI): https://symbolfyi.com/guides/cjk-web-typography/

관련: [evidence/ 목차](index.md) · [typography](../systems/typography.md) · [sources](sources.md)
