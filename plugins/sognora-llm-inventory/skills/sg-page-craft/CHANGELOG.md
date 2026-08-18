# sg-page-craft — CHANGELOG

## 0.1.0 — 2026-08-18 (신규)

랜딩 외 페이지(요금제·기능 소개·문의·정책 + 제품 화면)를 같은 제품처럼 만드는 스킬. 실전 사고 셋(팔레트 표류·비교 불가능한 비교표·죽은 페이지)과 리서치 실측을 근거로 신설.

- **`alive.mjs`**: "페이지가 실제로 살아 있는가" — 런타임 에러 오버레이·콘솔 에러·빈 화면·**CSS 모듈 클래스 불일치**·컨테이너 좌단 밀착·목록의 빈 상태 분기 부재. 합성 케이스로 검증(3/5 불일치 → 🔴)
- **`copylint.mjs`**: GOV.UK 콘텐츠 규범(문장 25단어·문단 5문장·제목 65자·금칙어 40여 개, OGL v3.0) + 한글 상투어 + 제작자 시점 서술
- **`references/page-rules.md`**: 요금제(플랜 수 실측 CAiSE'25 arXiv:2503.21444 — 4플랜 53%가 최빈 / NN/G 비교표 규칙 / **가격 표기의 법적 요건** EU·영국 DMCCA·캘리포니아), 기능 소개(규범 부재 → NN/G 열람 실측으로 대체), 폼(GOV.UK), 제품 화면(상태 커버리지), AI 티(Design Slop Cop·impeccable.style — 단일 패턴 실패 금지)
- **§9 격리 목록**: 근거 없는 통설을 규칙에서 배제 — "Most Popular 효과"(공개 수치 없음), 선택지 마비(D=0.02), 연간 토글 기본값·FAQ 배치(연구 부재), 그리고 **날조 출처**(ProfitWell 인용·saasresearchlab 등)
- 치수는 지어내지 않고 `@adobe/spectrum-tokens`·`@carbon/themes`·`@primer/primitives`에서 인용(Spectrum·Carbon이 행 높이 24/32/40/48/56~64로 독립 수렴)
