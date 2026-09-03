# 시스템 — 간격·밀도

- 근거 수준: 실측(imgeditor 카탈로그/랜딩 스크롤 비, aside.com·4열 밴드 사고), Spectrum·Carbon·Primer·Atlaskit 토큰(전부 Apache-2.0/MIT).
- 판정자: 기계(scan) `density.void-section`(여백 지배 섹션)·`density.sparse-card-row`(저밀도 카드 행)·`density.void-band`(여백이 콘텐츠보다 큰 아이템 박스 — 단독 🔴, 코퍼스 보정 2026-09-04로 테두리/그림자 또는 반복 형제가 있는 박스만) · 기계(scan) `work.below-fold`·`work.low` · 기계(`sameness.mjs`) `work.starved`·`sameness.flat-density`. 블록 간격 중앙값 표는 **사람(AD) 판정** — 자동 측정은 DOM 깊이에 흔들려 버렸다("불안정한 게이트는 없느니만 못하다").

## 밀도는 유형이 정한다 — 랜딩 여백을 물려받지 않는다

"같은 제품으로 보이는 것"은 색·글꼴이 하고, "이 페이지가 무엇을 하는 곳인지"는 밀도가 말한다. 밀도까지 상속하면 모든 페이지가 랜딩처럼 보인다.

| 유형 | 블록 간 세로 간격(중앙값) | 근거 |
|---|---|---|
| 랜딩 | 96~120px | 리듬이 상품. 스크롤이 서사 |
| 카탈로그 | 32~64px | 그룹 소제목 사이만 넓게, 카드 갭 좁게(imgeditor 카탈로그 스크롤 = 랜딩의 1/3) |
| 요금제 | 32~64px | 비교표는 눈이 가로로 움직인다 |
| 폼 | 16~32px | Spectrum 내부 여백 8/9/12/15/18 |
| 도구·대시보드 | 16~32px | 입력→실행→결과 한 화면. Carbon 행 높이 xs 24 / sm 32 / md 40 |

`tokens.json`에는 spacing 항목이 없다(colors·type·radius·motion뿐) — "간격까지 상속"은 기계가 강제한 적 없는데 문서가 시켜온 것이었고, 결과가 "어느 페이지나 같은 형태".

## 인용 가능한 치수 (추측 금지)

| 소스 | 무엇을 주나 |
|---|---|
| `@adobe/spectrum-tokens` | 2,469 토큰. 컴포넌트 높이 desktop 24/32/40/48/56/64 · mobile 30/40/50/60/70/80, 내부 여백 8/9/12/15/18, **테이블 = 크기 4 × 밀도 3**(small 24/32/40, medium 32/40/48, large 40/48/56, xl 48/56/64) |
| `@carbon/themes` | DTCG JSON. 데이터 테이블 행 높이 **xs 24 / sm 32 / md 40 / lg 48 / xl 64**, 컬럼 패딩 16, 헤더 14 SemiBold·본문 14 Regular |
| `@primer/primitives` | 컨트롤 xsmall 24 / small 28 / medium 32 / large 40 / xlarge 48, 세로 패딩 2/4/6/10/14, 가로 8/12/16 |
| `@atlaskit/tokens` | spacing·shape·typography·motion |

**Spectrum과 Carbon이 독립적으로 같은 행 높이 스케일(24/32/40/48/56~64)에 수렴한다** — 기본값으로 삼고 이탈을 재라.

## `density.void-band` — 세로 공백 지배 금지 (🔴, 면제 불가)

박스 높이보다 안쪽 콘텐츠가 작으면 위반. 기준: 상하 공백 합 > 콘텐츠 높이(잉크 < 박스 50%), 절대 하한 박스 120px·공백 64px(scan 정의값(박스 120px·공백 64px)). 패딩이 바깥 컨테이너에 걸린 형태는 **경계 있는 다열 밴드**에 한해 같은 비율(하한 140/96). 아이브로+제목+본문 섹션 헤더는 제외(aside.com 실측으로 확정). 실측 사고: 4열 구분선 밴드에서 박스 209px에 콘텐츠 59px, 상하 공백 150px.

- **분모는 섹션이 아니라 아이템 박스** — 섹션 패딩(96~120)은 리듬이므로 무죄.
- **처방은 패딩 축소가 아니라 내용 투입** — ⓐ 실체(제품 화면·현장 사진·수치) 투입 ⓑ 열을 접어 한 줄 흐름 ⓒ 밴드 삭제. 패딩만 줄이면 콘텐츠 예산 위반이 남는다.
- 번호 스테퍼("01 제목 / 한 줄")를 4~5열로 늘어놓은 밴드는 `density.void-band`와 `icon.numbered-list`에 동시에 걸린다.
- 제품 화면의 정상적 조밀함은 `density.void-band`를 건드리지 않는다.

## 일이 첫 화면에 있는가 (판정: `work.below-fold` 🔴 / `work.low` 🟡)

유형별 "일"(도구=입력, 카탈로그=항목, 대시보드=데이터 블록, 폼=필드)의 첫 등장 y좌표. 첫 화면 밖이면 🔴, 하단 1/3 걸치면 🟡. fixed/sticky는 세지 않는다(고정 챗위젯 textarea 오인 구멍). 실측 사다리는 [catalog](../types/catalog.md). 처방: 간격을 좁혀 생긴 자리에 일을 채운다.

## 일 점유율 (판정: `work.starved`) — [dashboard](../types/dashboard.md)에 실측 표

관련: [systems/ 목차](index.md) · [types/ 목차](../types/index.md) · [components](components.md) · [landing](../types/landing.md)
