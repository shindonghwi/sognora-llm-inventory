# 시스템 — 모션 프리셋 어휘

- 근거 수준: 레퍼런스 실측(toss IO 리빌 `opacity = 1 − translateY/50`, framer JS 스프링 175건 전부 임계감쇠, linear·toss 호버 = 색·알파만, jobber `mask-image` 밴드), Emil Kowalski 모션 규칙, 코퍼스 `motion.infinite-loop`.
- 판정자: 기계(`behavior.mjs` `motion.engineered-floor`·`motion.nojs-visible`·`motion.reduced-safe`)(engineering.json 선언 실행·검증, no-JS/reduced-motion 가시성) · 기계(scan) `motion.infinite-loop`(infinite 루프 장식) · 기계(`conform.mjs` `token.*`)(duration·easing은 tokens.json 어휘만).

## 왜 프리셋인가

Framer 사이트가 좋아 보이는 이유는 빌더가 아니라 **몇 개 안 되는 모션 프리셋 안에서만 만들기** 때문이다(Appear · Scroll Transform · Smart Animate). 매번 새 애니메이션을 짜면 결과는 흩뿌린 효과가 되고, "과한 애니메이션이 AI 생성물 느낌을 준다"(Anthropic frontend-design). **잘 오케스트레이션된 한 순간이 흩뿌린 효과들보다 세다.** 그래서 이 스킬은 아래 6개만 쓴다. 코드는 `assets/presets/motion.css`·`motion.js`(의존성 0).

## 프리셋 6종

| 프리셋 | 대응(Framer) | 규칙 | 근거 |
|---|---|---|---|
| `appear` | Appear | 진입 1회, IntersectionObserver, `opacity 0→1` + `translateY 12~16px→0`, **150~250ms**, ease-out. 재은닉 없음. 기본 가시(JS 실패 시 보임) | Emil Kowalski 150~250ms, toss 리빌 시스템, `text.hidden-at-rest`(정지 시 숨은 텍스트 금지) |
| `scroll-progress` | Scroll Transform | 스크롤 진행도(0~1)를 CSS 변수 `--p`로 발행, transform은 `translate`·`scale`·`opacity`만. 스크롤 잠금·하이재킹 금지 | toss `opacity = 1 − translateY/50` 결합 |
| `layout-morph` | Smart Animate | View Transitions API: 같은 `view-transition-name`을 가진 요소가 상태 전환 시 자동 모핑. 미지원 브라우저는 즉시 전환 | 표준 API. 피그마 Smart Animate·Keynote Magic Move와 같은 개념 |
| `hover-state` | Hover | **색 전환·옅은 알파 필·brightness만**, transform·box-shadow 금지, 100~200ms, `@media (hover: hover)` 가드 | toss·linear 실측 |
| `press` | Tap | `active`에서 brightness 0.92 또는 알파 필 진하게, 80~120ms. scale 금지 | 개폐·전환 0ms 금지 120~150 하한과 같은 원칙 |
| `reveal-mask` | — | `clip-path`/`mask-image`로 밴드·이미지가 드러남, 1회, 300ms 이내 | jobber mask-image 밴드 전환 |

## 공통 규칙

- duration은 **1~2개 값으로 수렴**(0.1~0.2s), easing 1개, `transition: all` 0 — 전부 tokens.json `motion` 어휘여야 기계(`conform.mjs` `token.*`)이 통과.
- 진입에 `ease-in` 금지, `scale(0)` 진입 금지, 300ms 초과 금지, 퇴장은 진입보다 빠르게(Emil Kowalski).
- **infinite 루프 장식 금지**(`motion.infinite-loop`) — 어느 자세에서도.
- `prefers-reduced-motion: reduce`에서 전환·애니메이션 제거, **텍스트는 항상 보인다**(리빌의 opacity:0 잔류 사고 = 기계(`behavior.mjs` `motion.engineered-floor`·`motion.nojs-visible`·`motion.reduced-safe`) 실패).
- no-JS에서도 콘텐츠 가시 — `.js` 클래스가 있을 때만 초기 숨김을 건다.
- 엔지니어드 모먼트 **하한 3 · 역할 3종**(히어로 인터랙티브·스크롤 연출·시그니처 마이크로)은 기계(scan 규칙 `motion.engineered-floor`)의 하한가 소유한다. 스펙은 올릴 수만 있다(예전엔 `{"minCount":0}` 한 줄로 통과하던 구조 — 스펙 작성자와 통과 희망자가 같은 에이전트).
- `durationMs`는 CSS transition 항목 전용. rAF·WAAPI 스프링은 선언하지 않는다.
- 모션 자세(directions 6축): 정적 · 진입 1회(1패턴만) · 포인트 모션(핵심 1~2곳). 어느 자세든 위 6종 밖의 애니메이션을 새로 짜지 않는다.

## engineering.json (behavior의 법전)

`json
{ "minCount": 3, "roles": ["hero-interactive","scroll","micro"],
  "items": [{ "id":"hero-demo", "section":"01", "role":"hero-interactive",
    "selector":".hero [data-demo]", "trigger":"hover|click|scroll",
    "expect": {"props":["transform","boxShadow"], "to":{"opacity":"1"}},
    "durationMs":160, "jsRequired":true, "reducedMotionSafe":true, "source":"ir.json §hover[2]" }] }
`

리드 번들 record/probe에서 자동 시드 후 AD가 가감. 선언(AD)과 통과 의무(빌더)의 분리가 억지 인터랙션을 구조로 차단한다.

## 사용법

`html
<link rel="stylesheet" href="assets/presets/motion.css">
<script src="assets/presets/motion.js" defer></script>
<section data-appear>…</section>
<img data-appear data-appear-delay="120" …>
<div data-scroll-progress style="transform: translateY(calc((1 - var(--p, 0)) * 24px))">…</div>
<button class="m-hover m-press">…</button>
<figure data-reveal-mask>…</figure>
<!-- layout-morph: 상태를 바꾸는 코드에서 SG.morph(() => { …DOM 갱신… }) -->
`

관련: [systems/ 목차](index.md) · [components](components.md) · [color](color.md) · [directions](../directions.md)
