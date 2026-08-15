# sg-landing-craft — CHANGELOG

## 0.1.0 — 2026-08-15

- 신설. sg-design-humanize(디자인 계층 전용, 텍스트 불변 계약)를 폐기하고 **랜딩 제작·재제작 스킬**로 재정의 — "랜딩은 콘텐츠가 절반"이라는 실전 교훈(디자인만 3회 갈아도 리스킨 상한)에서 출발
- **인터뷰 필수**: 시작 시 수준(신규|디자인만|부분)·방향 후보 3(추천 표시)·자산 정책을 한 번에 질문(Claude=AskUserQuestion, 기타=번호 목록) — 이후 무인 완주
- **차용 강제**: 레퍼런스 라이브러리(8개 사이트 심층 실측 — 구조·자산 프레이밍·호버 표·모션 언어·JS 거동)를 `borrow.md`로 명시 차용 — 근거 없는 디자인 결정 금지
- **사실 강제**: 카피는 `facts.md`(PRD·제품 문서 출처)와 1:1 — 지어내기 금지, 무근 카피는 D등급
- **자산 재사용 기본 금지**: 새 레이아웃 = 새 자산(실캡처 > imagen 생성(투명·trim 파이프라인) > 사진)
- 승계: references/library·directions(7축+history 차별)·layout-alternatives·benchmarks, scripts/detect(37룰)·probe(인터랙션 실측)·rules-lib. 폐기: gate.mjs(텍스트 불변 게이트 — 신규 콘텐츠 제작과 상충)
