# P5 — 빌드: 전사 + 치환만

> 판정자: `conform.mjs`(raw 색·font-size 리터럴 0, 섹션 완료 즉시) · `primitives.mjs`(컴포넌트 층) · `scan.mjs` 콘솔·페이지 오류(살아 있음).

## 순서

1. **컴포넌트 층부터** — `node "$S/primitives.mjs"`. Button·Input·Table·EmptyState 같은 프리미티브가 없으면 페이지 CSS를 짜기 전에 세운다(직접 만들든 라이브러리든). 이 순서를 건너뛰면 화면마다 CSS를 다시 짜고 결과는 문단만 남은 페이지다([systems/components](../systems/components.md)).
2. **시안을 띄워놓고** 브리프 하나만 읽고 만든다. IR 골격을 프로젝트 실제 스택 코드로 1:1 전사, 겉모습은 시안 실측표대로, 값은 토큰만. 창조 금지.
3. **모션은 프리셋에서** — [systems/motion](../systems/motion.md)의 어휘(appear · scroll-progress · layout-morph · hover-state · press · reveal-mask) 중 브리프가 고른 것만 붙인다. 매번 새 애니메이션을 짜지 않는다. `assets/presets/motion.css`·`motion.js`를 프로젝트 스택에 맞게 옮긴다.
4. **섹션 완료 즉시** `node "$S/conform.mjs"`(토큰 준수 + 소스 리터럴 린트).
5. **정적 페이지 금지** — engineering.json의 하한 3(히어로 인터랙티브·스크롤 연출·시그니처 마이크로)을 구현한다. no-JS·reduced-motion에서 텍스트가 보여야 한다(리빌의 opacity:0 잔류 사고).

## 유형별 필수 구조

[types/<유형>](../types/index.md)를 따른다. 요약: 카탈로그=그리드+진입 액션 / 도구=입력+실행이 첫 화면 / 요금제=열=플랜·행=속성 / 폼=라벨 위·제출 시 검증·입력값 보존 / 대시보드=빈·로딩·오류·권한 상태 전부 / 문서=시행일·목차·번호 절 / 소개=짧은 헤더+사실+연락. 하는 화면(do)은 소개문으로 열지 않는다.

## 카피

- facts 1:1. 대응 없는 문장은 삭제.
- 고객 시점("당신은 무엇을 갖게 되는가"). 제작자 시점("배치했습니다")·설명서 시점("입력하세요")은 🔴(`copy.maker-voice`·`copy.manual-voice`).
- 한글 상투어·번역투는 `copylint.mjs` + `detect_bilingual.py`가 잡는다. 통과는 자연스러움의 증명이 아니다 — 소리 내어 읽는다.
- 다국어 스위처는 계약에 로케일이 둘 이상일 때만.

## 하지 말 것

- 브리프에 없는 값(색·크기·간격)을 쓰는 것.
- 리드의 CSS 리터럴·클래스명·자산을 그대로 두는 것(잔존 검사에 걸린다).
- 시안에 없는 섹션을 "고품질"을 이유로 더하는 것. 시안에 없고 facts에도 없으면 없는 것이다.
- 유리 블러 상자·굵기 700+·이모지 아이콘·보라 그라데이션을 근거 없이 쓰는 것(면제는 `exemptions.md`에 룰 ID+사유).

## 다음

[P6 검증](verify.md)
