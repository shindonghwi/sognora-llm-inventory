# sg-landing-craft — CHANGELOG

## 0.2.0 — 2026-08-16 (라이브러리 8→18종 — 장르 전면 확장)

- 신규 10종 전부 detect+probe+capture(sg-web-replicate)+fetch-assets(CSS 변수 수확)+풀페이지 육안 판독의 완전판:
  - **getjobber**(현장 서비스 B2B — 동일 장르 최고 가치: 브랜드 물성 CSS·사람 단위 신뢰·그림자 1개) · stripe · framer(JS 스프링 175건 전수) · 오늘의집 · airbnb.co.kr · 채널톡 · youtube/about · mayoclinic(의료 기관) · hyundai(대기업 브랜드) · netflix/kr(전환형 정전)
- INDEX를 장르 분류(B2B SaaS/도구/소비자·커머스/기관·브랜드)로 재편, 교차 결론 7항으로 확장(모션 어휘 제한·신뢰 단위의 장르 의존성·브랜드 물성 등)
- probe.mjs: easing 파싱이 cubic-bezier 인자 쉼표에서 파편화되던 버그 수정(괄호 안 쉼표 무시)

## 0.1.0 — 2026-08-15

- 신설. sg-design-humanize(디자인 계층 전용, 텍스트 불변 계약)를 폐기하고 **랜딩 제작·재제작 스킬**로 재정의 — "랜딩은 콘텐츠가 절반"이라는 실전 교훈(디자인만 3회 갈아도 리스킨 상한)에서 출발
- **인터뷰 필수**: 시작 시 수준(신규|디자인만|부분)·방향 후보 3(추천 표시)·자산 정책을 한 번에 질문(Claude=AskUserQuestion, 기타=번호 목록) — 이후 무인 완주
- **차용 강제**: 레퍼런스 라이브러리(8개 사이트 심층 실측 — 구조·자산 프레이밍·호버 표·모션 언어·JS 거동)를 `borrow.md`로 명시 차용 — 근거 없는 디자인 결정 금지
- **사실 강제**: 카피는 `facts.md`(PRD·제품 문서 출처)와 1:1 — 지어내기 금지, 무근 카피는 D등급
- **자산 재사용 기본 금지**: 새 레이아웃 = 새 자산(실캡처 > imagen 생성(투명·trim 파이프라인) > 사진)
- 승계: references/library·directions(7축+history 차별)·layout-alternatives·benchmarks, scripts/detect(37룰)·probe(인터랙션 실측)·rules-lib. 폐기: gate.mjs(텍스트 불변 게이트 — 신규 콘텐츠 제작과 상충)
