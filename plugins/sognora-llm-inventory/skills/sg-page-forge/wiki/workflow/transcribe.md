# P3·P4 — 전사(토큰·실측표)와 브리프 컴파일 (창조 금지)

> 판정자: `conform.mjs --tokens`(어휘 예산·해시) · 브리프 완전성 린트(IR 슬라이스 수치가 브리프에 전부 등장) · `lint-docs.mjs`(tokens.json 스키마).

## 무엇을 어디서

| 층 | 출처 | 산출 |
|---|---|---|
| 골격(그리드·컨테이너·패딩·높이·리듬·모션 구조) | 리드 IR `.sognora/page/ir/<이름>.json`(없으면 스킬 배포 `references/ir/`) | 섹션별 브리프의 IR 슬라이스(원문 수치) |
| 겉모습(배치·비율·톤·요소) | 사용자가 고른 시안 `comp` | 시안 실측표 — 시안을 픽셀로 재서 좌표·크기·색·자간을 적는다 |
| 토큰(팔레트·타입 스케일·radius·duration) | 시안 + 방향 7축 + 브랜드 입력 | `.sognora/page/tokens.json` |
| 동작(히어로 인터랙티브·스크롤·마이크로) | IR의 record/probe 자동 시드 | `.sognora/page/engineering.json`(하한 3, 역할 3종) |
| 카피 | facts 1:1 | 섹션별 브리프의 카피 절 |

## tokens.json

스키마는 [systems/color](../systems/color.md)·[systems/typography](../systems/typography.md). 요점:
- 팔레트 4~6색에 이름과 역할(neutral/brand/semantic). 어휘 예산 중립≤6·브랜드≤2·시맨틱≤2·duration≤2·easing≤1. **리드와 팔레트 계열 상이 의무.**
- 타입: 서체 2~3계열(디스플레이·본문·숫자/유틸)에 **한글 대응 폰트 명시**, 스케일 5~8단, 굵기는 300~600 안(700+는 방향이 명시 채택할 때만), 한글 자간 0~미세 음수, 이탤릭 금지.
- radius 사다리, motion durations/easings.
- 승인 시점 sha256을 provenance에 기록한다 — 빌더가 색을 추가해 합법화하는 최후 수단을 막는다.

## 시안 실측표

시안은 그림이라 수치가 없다. 전사자가 잰다: 각 요소의 좌표(1600×900 기준 프레임 또는 시안 픽셀), 크기, 색(스포이트), 자간·행간 추정, 요소 목록. 이 표가 브리프의 "겉모습" 절이 되고, P6에서 결과 캡처와 side-by-side로 판정된다.

## P4 — 브리프 컴파일

섹션별 `.sognora/page/briefs/<n>.md` = verbatim 병합(요약 금지):
1. IR 슬라이스(해당 섹션 수치 원문)
2. 시안 실측표(해당 섹션)
3. 토큰 치환표(리드값→우리 토큰)
4. engineering 항목
5. 모션 프리셋 선택([systems/motion](../systems/motion.md) 어휘 중 무엇을 어디에)
6. 금지 목록(면제 반영) + 수용 기준(어느 게이트가 무엇을 재는가)
7. 카피(facts 대응표) + 자산 파일 경로

빌더는 브리프 하나만 읽는다. 브리프에 없는 값을 쓰면 그 자체가 위반이다.

## 다음

[P5 빌드](build.md)
