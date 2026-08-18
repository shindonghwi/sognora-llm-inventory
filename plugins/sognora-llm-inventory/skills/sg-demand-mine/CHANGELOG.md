# sg-demand-mine — CHANGELOG

## 0.1.0 — 2026-08-17 (신규)

"매번 이상한 아이디어, 어디 꽂힌 것, 시대에 안 맞는 것"을 세 장치로 차단하는 수요 채굴 스킬. 하브루타 1라운드 + 전 계기 실행 검증을 거쳐 신설.

- **계기 3종(전부 실측 검증)**: `seeds.mjs`(구글·네이버 자동완성 문형 확장 → 문제 구절 → 앱스토어 유량·불만·방치·신규진입·HN 추세로 랭킹), `signals.mjs`(앱스토어 리뷰·Reddit·HN·GitHub 증거 수집, 차단 채널 정직 기록), `cards.mjs`(카드 린터 — 인용 코퍼스 verbatim 대조·A급 하한·지불자 특정·why-now 날짜·first-dollar·유통·클리셰 입증·ledger 중복)
- **설계 원칙**: 시드를 사람이 고르지 않는다(고르는 순간 그가 아이디어를 낸 것) / 누적이 아니라 유량으로 잰다 / A급은 돈이 오간 흔적만 / 카드 0개도 정직한 결과(할당량 금지) / A급 채널 전멸 시 카드 생성 금지
- **채널 실측(2026-08)**: 열림 — 구글·네이버 자동완성, 앱스토어 검색·리뷰 RSS, HN Algolia, GitHub·StackExchange API, Reddit. 차단 — G2·Capterra·Trustpilot·ProductHunt·Fiverr·Upwork(우회 금지, 로그 기록). 정책 제외 — 외주·구인 마켓
- sg-biz-validate와의 절단선 명문화(발굴 vs 검증, 심층 경쟁분석·TAM·PRD 금지)
