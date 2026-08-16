# stripe.com 분석

장르/단위: B2B 핀테크(결제·금융 인프라) / 랜딩 · 분석일 2026-08-15 · 상태: **완전** (detect + probe + capture + fetch-assets + 라이브 DOM + 풀페이지 직접 관찰)

## 수치 (detect.mjs + capture.mjs 실측, 1440×900)

- 페이지 높이 **14,656px** · 가로 오버플로 없음 · 렌더 요소 **2,996개**
- 최상위 밴드 **9개**(nav / 히어로 / 벤토 / 세션 프로모 / 통계 / 고객 / 개발자 / 소식 / 마감 CTA + 푸터)
- 폰트 사이즈 고유값 **15개**: 8·9·10·11·12·13·14·15·16·18·22·26·32·48·56 — 배율 7.0×. 다만 8~13px는 **전부 제품 목업 내부**다. 페이지 본문의 실사용 단은 16/22/26/32/48/56 **6단**
- 굵기 분포: **300 ×454 · 400 ×262** · 500 ×37(전부 코드 폰트) · **700 ×1**(코드 블록의 `await` 키워드 하나). 텍스트에 500 이상이 없다
- radius 분포: **0px ×2,770** · 4px ×102 · 6px ×89. 기본값이 각짐이고 라운드는 예외다
- box-shadow가 붙은 요소 **약 20개**(2,996개 중)
- 그라데이션을 가진 요소 **34개 = 전체의 1.1%**
- 자산: img 52 · inline SVG 266 · **canvas 6** · iframe 2 · 폰트 파일 **2개**
- CSS 변수 **715개**(`--hds-*` 699: color 431 · font 116 · space 93 · shadow 45)
- 키프레임 애니메이션 **총 2개** · `transition: all` **0건** · 스크롤 리빌 **0건**
- 티 프로필: 🔴8 🟡9. 🔴 중 CO1(보라 그라데이션 배경) 2건과 IC1(SVG 반복) 3건은 아래에서 전부 뒤집힌다. QF2(정지 시 안 보이는 텍스트 10건)는 **통계 밴드의 스크린리더용 중복 목록**이라 오탐

## 실측 토큰

### 타이포 — 전부 300, "볼드"가 400이다

디자인 시스템이 스스로 그렇게 선언한다.

```
--hds-font-weight-normal = 300
--hds-font-weight-bold   = 400
```

| 역할 | 크기/행간 | 굵기 | 자간 | 색 |
|---|---|---|---|---|
| h1 히어로 | 48px / 55.2px (1.15) | 300 | −0.96px (**−0.02em**) | #061b31 |
| h2 통계 밴드 | 56px / 57.68px (**1.03**) | 300 | −1.4px (**−0.025em**) | #fff |
| h2 섹션 | 32px / 35.2px (1.1) | 300 | −0.64px (−0.02em) | #061b31 |
| h3 서브섹션 | 26px / 29.12px (1.12) | 300 | −0.26px (−0.01em) | #061b31 |
| h3 고객 행 | 22px / 24.2px (1.1) | 300 | −0.22px (−0.01em) | #061b31 |
| 통계 숫자 | 48px / 49.44px (1.03) | 300 | −0.96px | #fff |
| 본문 | 16px / 22.4px (1.4) | 300 | **normal** | #50617a |
| 강조 리드인 | 16px / 22.4px | **400** | normal | #061b31 |
| 버튼 | 16px / 16px (1.0) | 400 | normal | — |
| 네비 | 14px / 14px (1.0) | 400 | normal | #061b31 |
| 코드(터미널) | SourceCodePro 12px / 24px (**2.0**) | 500 | normal | — |
| 코드(목업 주석) | SourceCodePro **9px** / 9px | 500 | normal | — |

- **자간은 크기에 비례해 조인다**: 22–26px는 −0.01em, 32–48px는 −0.02em, 56px는 −0.025em. 본문 16px는 `normal` 509건으로 압도적 — 본문에는 자간을 절대 안 건다
- 행간은 디스플레이일수록 1.0에 붙는다(56px→1.03, 48px→1.03~1.15), 본문은 1.4 고정
- 폰트 패밀리 **2개**: `sohne-var`(가변 woff2, weight 1–1000, `font-display: block`) + `SourceCodePro-Medium`(코드 전용, swap). 스택은 `sohne-var, "SF Pro Display", sans-serif`

### 색 — 회색이 아니라 청색 계열 중성색

| 토큰 | 값 | 역할 |
|---|---|---|
| `--hds-color-heading-solid` / `text-solid` | **#061b31** | 헤딩·본문 최상 (순수 검정 아님) |
| `--hds-color-text-soft` | #50617a | 본문 기본 |
| `--hds-color-text-subdued` / `heading-subdued` | #64748d | 헤딩의 뒷문장 |
| `--hds-color-text-quiet` | #7d8ba4 | 캡션 |
| `--hds-color-surface-bg-subdued` | **#f8fafd** | 마감 CTA·푸터·카드 바닥면 |
| `--hds-color-surface-border-quiet` | **#e5edf5** | 유일한 헤어라인 색 |
| `--hds-color-action-*` / `button-primary-bg` | **#533afd** | 브랜드 보라. 링크·버튼 전용 |
| `button-primary-bgHover` | #4032c8 | |
| `action-text-solidHover` | #2e2b8c | |
| 다크 섹션 배경 | **#0d1738** (`core-neutralDark-990`) | |
| 다크 본문 | #839bc8 / #a3b5d6 | |

- 텍스트 색 실사용 빈도: #061b31 ×218 · #50617a ×213 · #64748d ×69 · #fff ×53 · **#533afd ×42**. 보라는 텍스트 요소의 약 5.7%, 그것도 전부 링크·버튼이다
- **그림자는 검정이 아니다.** `--hds-shadow-md = 0 6px 22px #0037701a, 0 4px 8px #003b8905` — `#003770`/`#003b89` 청색 틱. 실사용 최대 그림자도 `rgba(50,50,93,.25) 0 30px 45px -30px`로 **스프레드가 크게 음수**라 요소 바로 아래 고인 웅덩이가 된다. 후광이 안 생긴다

### 레이아웃

```
--hds-space-layout-columns          = 12
--hds-space-layout-gap              = 16px
--hds-space-layout-content-maxWidth = 1264px
--hds-canary-layout-content-maxWidth-borders = calc(1264px + 2px)
--hds-space-section-gap-top-md / bottom-md   = 96px
--hds-space-section-gap-top-sm / bottom-sm   = 48px
--hds-space-section-gap-top-subsection = 64px / bottom = 96px
--hds-space-button-height = 48px · button-radius-lg = 4px
--hds-space-core-radius-md = 6px · radius-round = 99999px
--navigation-height = 76px
```

1440 기준 실측 좌표:

- `section` 좌우 패딩 16px → `.section-container` **1266px**(1264 + 좌우 1px 보더), x=87
- 컨테이너 내부 패딩 16px → **12칼럼 그리드 1232px, x=104**. 칼럼 88px + 갭 16px (`12×88 + 11×16 = 1232`)
- 칼럼 시작 x: 104 · 208 · 312 · 416 · **520** · 624 · 728 · 832 · **936** · 1040 · 1144 · 1248
- 섹션 상하 패딩 **96px** 기본(통계·세션 프로모만 80px)
- **구분선은 그리드가 아니라 컨테이너 폭을 쓴다**: `section-header-divider`가 x=88, w=1264 — 그리드(1232)보다 좌우 16px씩 더 뻗어 나간다
- 헤더 76px, sticky 아님 (probe: sticky 요소 0개)

## 구조 (풀페이지 캡처 직접 관찰 — 섹션 전부)

**1. 네비 76px** — 좌: stripe 워드마크 + 드롭다운 4(Products·Solutions·Developers·Resources) + Pricing. 우: `Sign in`(투명, 보라 텍스트) + `Contact sales`(보라 채움). 네비 버튼 높이 40px / 14px / radius 4px. 드롭다운은 **패널을 안 그린다** — 그림자·라운드·배경 전부 `none`이고 헤더 표면 위에 평평하게 열린다

**2. 히어로 685px** — 배경은 순수 흰색. 콘텐츠는 그리드 **1칼럼 들여쓰고 10칼럼 폭**(x=208, w=1024)
- 아이브로우: `Global GDP running on Stripe: 1.69864520%` — **살아 움직이는 카운터**다. `__content-outgoing` / `__content-incoming` 두 span이 18px 간격으로 세로 롤(오도미터). `tabular-nums--tight`로 자릿수 흔들림을 막았다. 뒤에 계산 방식을 설명하는 각주 문장이 시각적으로만 숨겨져 있다
- h1 48px 4줄. **첫 문장과 뒷문장이 같은 h1 안에 있다** — `<em class="title-main">` 진한 남색 + `<span class="title-copy">` 회색. 크기·굵기·행간 전부 동일, **색만 다르다**
- 버튼 2개: `Get started`(보라 채움, 141×48) + `Sign up with Google`(212×48, 배경 `rgba(255,255,255,.65)` — 반투명이라 뒤 그라데이션이 은은히 비친다)
- 상·하단에 1px 풀블리드 라인 2줄. `mix-blend-mode: multiply`라 그라데이션 위를 지날 때 회색 선이 얹히는 게 아니라 **어두워진다**
- **그라데이션 리본의 정체**: `<canvas class="hero-wave-animation__canvas">` **1393×761**을 x=330에 놓아 화면 오른쪽으로 ~300px 넘긴다(가로 스크롤은 안 생김). JS가 실시간으로 그린다. 폴백은 `wave-fallback-desktop.png` 1392×975, `opacity:0`으로 대기하다 캔버스가 그려지면(`--drawn`) 사라진다

**3. 로고 마퀴 73px** — OpenAI·Amazon·Nvidia·Ford·Coinbase·Google·Shopify·Mindbody·MetLife·Ramp·Marriott·Figma·WooCommerce·Vercel·Uber·Anthropic·Lightspeed·Cursor **18개**를 2벌 복제해 36개로 무한 스크롤. 전부 **142×34 동일 박스, 172px 피치**. 그리고 **원본 브랜드 컬러 그대로**다(Google 4색, Coinbase 파랑, Shopify 초록). grayscale 필터 없음

**4. 벤토 6장 2,196px** — h2 32px + 뒷문장(한 문단 두 톤). 그리드 정확히:
- 1행: 816px(8칼럼) `Accept and optimize payments globally` + 400px(4칼럼) `Enable any billing model` — 높이 676
- 2행: 400×3 `Monetize through agentic commerce` / `Create a card issuing program` / `Access borderless money movement with stablecoins and crypto` — 높이 676
- 3행: **1232px(12칼럼 전폭)** `Embed payments in your platform` — 높이 450
- 카드 radius 6px, box-shadow **없음**, 배경 투명. 카드를 정의하는 건 1px `#e5edf5` 헤어라인 하나뿐
- 우상단에 확대 아이콘(`__dialog-entry`) — 정지 시 연보라 타일, 호버 시 **보라 채움 + 흰 글리프**
- 결제 목업은 **en-US($) / de-DE(€) / ja-JP(¥) 3개 로케일을 순환**한다. 세금 표기가 각각 Tax / VAT / JCT로 바뀌고 결제수단도 시장별로 바뀐다(Klarna·Affirm·Cash App·Crypto·US bank account ↔ Rechnung ↔ PayPay·FamilyMart)

**5. 세션 프로모 560px** — 1232×400 풀블리드 사진 카드. 무대 위 연사 뒤 LED에 **같은 리본 그라데이션이 실물로 떠 있다**. 좌상단 흰 h2 + 흰 `Watch now` 버튼, 우하단 `stripe sessions` 로고

**6. 통계 밴드 977px** — 이 페이지에서 가장 복잡한 기계
- 배경 `#0d1738` 플랫. 그 위에 `stats-animation-gradient__gradient` **6장이 겹쳐 크로스페이드**한다(`stats-section--time-n`). 전부 `radial-gradient(… at 50% ~103%)` — 광원이 **화면 아래 바깥**에 있는 일출 구도. 6가지 시간대: 파랑→라벤더 / 보라→분홍→살구 / 심해파랑→하늘 / 호박→하늘 / 산호→라일락 / (반전) 흰빛→인디고→짙은 남색. 우상단에 달/해 토글 아이콘이 있다
- h2 56px 2줄 중앙
- 통계 4개: `135+` / `$1.9T` / `99.999%` / `200M+`. **컨테이너 1264px를 4등분**(셀 304px, 피치 320px) — 그리드가 아니라 컨테이너 기준이다. 활성 1개만 흰색, 나머지 3개는 `#6480b2`로 내려앉는다. 활성 셀 위에 **297×1px 양끝이 사라지는 그라데이션 빛줄기**
- 아래 1234×519 데이터비주얼: 화면 아래 광원에서 뻗어 나오는 **가느다란 광선 다발 + 점**. 통계가 바뀌면 그래픽도 바뀐다(`volume-fallback` / `uptime-fallback` / `subscriptions-fallback` 파일이 각각 존재)
- 섹션 테두리를 1px 사각 프레임으로 실제로 그린다(`stats-section__border`, x=87 w=1266)

**7. 고객 섹션 4,610px** — 가장 긴 밴드. h2 32px + 뒷문장. 아래를 3덩이로 나눈다
- **엔터프라이즈 아코디언**: 로고 타일 24px + h3 22px 한 줄 4개(Hertz·URBN·Instacart·Le Monde). 펼쳐진 하나만 1232×531 사진 + **지표 3칸**을 보여준다: `**160** countries` / `**11K+** locations globally` / `**Products used** Payments, Terminal, Connect, Radar, and Stripe Sigma`. 접힌 항목은 `+` 버튼
- **전문 서비스 3칼럼**: 28px 보라 선화 아이콘 타일 + `**Professional services.** Get tailored guidance…` + `View services ›`
- **스타트업 캐러셀 8장**: 344px 폭 · 348px 피치라 3.5장이 잘려 보인다. 각 카드는 고객사 전용 브랜드 아트(Lovable 하트, Gamma 일러스트, Runway 물, Supabase 다크 그리드) + 흰 로고 오버레이 + 하단 캡션 + `Read X's story ›`
- **프로그램 카드 2장**: `#f8fafd` 바닥에 카피는 왼쪽, 오른쪽 절반은 **기하 도형 그라데이션**이 카드 밖으로 잘려나간다(마젠타 램프 / 주황 삼각 쌍). 블롭이 아니라 각진 도형이다
- **플랫폼 블록**: 1232×532 리본 배경 위에 브라우저 목업. 그 위에 흰 주석 카드 4장이 떠 있고 각 카드는 `제목 / 설명 / stripeConnectInstance.create('payments');` — **9px 코드 한 줄**이 들어간다
- **인용**: 48px 원형 아바타 + 26px 회색 중앙 정렬 인용 + `**Kurtis Moyer,** Lead Product Manager of Payments, Mindbody`. 캐러셀이며 **하단 구분선 자체가 진행 인디케이터**다(1264px 트랙 + 활성 구간)

**8. 개발자 다크 섹션 2,341px** (`#0d1738`) — 컨테이너 좌우 경계를 **세로 헤어라인으로 실제로 그린다**(x=88, x=1352). 서브섹션 3개
- `Connect to existing systems.` → 점선 그리드 위 **아키텍처 노드 다이어그램**. 중앙에 stripe 타일(80×80, `linear-gradient(288deg, #0d1738, #4032c8)`), 주변에 보라 알약 노드(SDK·Event Destinations·App Marketplace·Data Pipeline·Orchestration)가 점선으로 연결. 왼쪽엔 실제 파트너 로고 타일 3×2(Mailchimp·Xero·NetSuite·SAP·Adobe)
- `Scale with confidence.` → **선화 리본**(채운 그라데이션이 아니라 수십 가닥의 얇은 곡선). 아래 통계 3개 `500M+` / `10K+` / `150K+`가 **`background-clip: text` 그라데이션 글자**다. 각 숫자의 그라데이션 stop이 음수 %(−215%, −169%)로 오프셋돼 **세 숫자가 하나의 연속 그라데이션을 이어받은 것처럼** 보인다
- `Choose an integration path.` → 3칼럼 목업. ① 채팅 안에 **실제 `buy.stripe.com/test_…` 링크 + 스캔 가능한 QR** ② 파트너 로고 5×3 풀컬러 타일(가장자리는 잘림) ③ **vim 편집기**: 줄번호 · 문법 강조(문자열 `#ffa956`, `await` `#92adff` w700) · 자동완성 드롭다운(`applePayDomains` 하이라이트) · `NORMAL` 모드 배지 · `100% ≡ 6/6 ln : 4` 상태줄 · 아래 터미널 `$ node server.js && stripe listen` → `> Ready! Waiting for requests...`
- 하단 3칼럼 `**Don't code?** …` / `**Use a pre-integrated platform.** …` / `**Build your own integration.** …`

**9. 소식 1,752px** — h2 32px + 뒷문장(줄바꿈). 우상단 화살표 2개. 좌측에 대형 `Annual letter 2025` 카드, 우측으로 소형 카드들이 잘려 이어진다. 아래 22px 한 문단 두 톤 + `Read the letter ›`
- **Book of the week 1232×597** — 핀테크 홈에 책 소개가 있다. `#f8fafd` 카드, 좌측 296×440 실물 책 표지(따뜻한 회갈색 바닥), 우측에 제목·저자·**8줄짜리 실제 서평 문단**, 하단에 `Stripe Press` / `Works in Progress` 링크 2개, 우상단에 "The Library of Stripe" 인장 일러스트. **페이지 유일의 키프레임 애니메이션 2개가 여기 붙어 있다**(`book-of-the-week-fade-in 0.5s`)

**10. 마감 CTA 380px** (`#f8fafd`) — 좌측 `Ready to get started?` + 설명 + `Start now`(보라) / `Contact sales`(외곽선). 우측에 아이콘 + `**See what you'll pay** …` / `**Start building** …` 2칼럼

**11. 푸터 1,078px** — 4칼럼 세로 구분선. 링크 **85개**, 전부 **16px/20px w300 `#50617a`**. 그룹 제목은 16px w400 `#061b31`. **푸터에서 글자를 줄이지 않는다** — 본문과 같은 16px다. 하단에 지구본 아이콘 + `United States (English)` + `© 2026 Stripe, LLC.`

## 이 사이트의 문법 — 한 문단 두 톤

전 페이지에서 가장 많이 반복되는 장치. 헤딩과 그 뒷문장이 **한 문단 안에 인라인으로 붙어** 있고 (`hds-heading--inline` / `hds-text--inline`), **크기·굵기·행간은 완전히 같고 색만 다르다.**

| 스케일 | 앞(헤딩) | 뒤(설명) |
|---|---|---|
| 48px 히어로 | #061b31 | 회색 |
| 32px 섹션 h2 | #061b31 | #64748d |
| 32px 다크 | #fff | #839bc8 |
| 26px 서브섹션 | #061b31 / #fff | #64748d / #839bc8 |
| 22px 뉴스 카드 | #061b31 | #64748d |
| 16px 기능 리드인 | #061b31 **w400** | #50617a w300 |
| 16px 다크 | #fff w400 | #a3b5d6 w300 |

같은 문법이 **숫자에도 그대로** 적용된다: `**160** countries`, `**11K+** locations globally`, `**Less than 3 months** to implement and go live`, `**Products used** Payments, Terminal, Connect, Radar, and Stripe Sigma`. 숫자만 w400 남색, 단위·라벨은 w300 회색. 큰 통계 배너를 따로 만들지 않고 **문장 안에서 숫자를 세운다.**

## 그라데이션 운용 — 왜 이건 "티"가 아닌가

detect가 CO1 🔴 2건 + CO2 🟡 11곳을 잡았다. 전부 오탐이다. 이유는 5가지고, 각각 재현 가능한 규칙이다.

**① 그라데이션이 섹션 배경인 적이 한 번도 없다.**
`<section>` 9개의 배경은 전부 플랫이다 — `#fff` 5개, `#0d1738` 2개, `#f8fafd` 1개. `background-image`를 가진 섹션이 **0개**. 통계 밴드조차 섹션 자체는 `#0d1738` 단색이고, 그라데이션은 그 안의 별도 레이어다.

**② 그라데이션의 끝점이 항상 시스템 토큰이다.**
- 벤토 카드 테두리: `radial-gradient(circle, #7f7dfc, #f44bcc 33%, #e5edf5 66%)` — 마지막 stop `#e5edf5`는 **이 사이트의 기본 헤어라인 색**(`--hds-color-surface-border-quiet`)이다. 반경 66% 바깥은 그냥 평범한 1px 선이다
- 통계 배경 6장: 전부 `… #f8fafd 60%` 또는 `#fcfdfe`로 끝난다 — **`--hds-color-surface-bg-subdued`**
  → 그라데이션의 경계가 안 보인다. 색이 "얹힌" 게 아니라 **기존 평면색이 국소적으로 물든** 것이기 때문이다.

**③ 그라데이션이 정보를 나른다.** 장식으로 면적을 채우는 데 쓰인 그라데이션이 하나도 없다.

| 위치 | 그라데이션 | 무엇을 나르나 |
|---|---|---|
| 벤토 카드 테두리 | radial 753×753, opacity .5 | **포인터 위치** |
| 통계 밴드 배경 ×6 | radial `at 50% 103%` | **시간대(6종) + 현재 활성 통계** |
| 활성 인디케이터 | linear 297×1, 양끝 투명 | **지금 어느 통계인가** |
| 개발자 통계 3개 | `background-clip: text` | **세 숫자가 한 줄의 연속체임** |
| Usage meter 바 | `linear-gradient(90deg, #7232f1, #fb76fa, #ffcf5e)` | **사용량 값** |
| 플랫폼 목업 스켈레톤 | `conic-gradient(#ffd7ef → #a51d85 50% → #ffd7ef)` | **로딩 셔머** |
| 스크린샷 바닥 | 흰색 linear fade | 페이지 배경으로 소멸 |

**④ 진짜 그라데이션은 CSS가 아니라 생산물이다.**
히어로 리본은 `<canvas>`가 실시간으로 그린 3D 리본이고(폴백 PNG 1392×975 별도 준비), 벤토 카드 안의 오로라는 **사진 JPEG**(`payment-bento-background.jpg`, `ConnectBentoBackground.jpg`)다. CSS 그라데이션은 조연이다. 그래서 밴딩도, "6개 stop 무지개"도 없다.

**⑤ 텍스트를 그라데이션 위에 얹지 않고 통과시킨다 — 이 페이지 최고의 기술.**

히어로 h1이 **두 벌** 있다. 같은 텍스트, 같은 박스(x=208, 959×221), 같은 48px/300/−0.02em.

```
h1.hero-section__title--background   z:auto (캔버스 아래)  aria-hidden="false"
   em.title-main  color: #061b31       (남색)
   span.title-copy color: #81b81a      (올리브)      ← 디자인 색이 아니다

h1.hero-section__title--foreground   z:2 (캔버스 위)     aria-hidden="true"
   mix-blend-mode: hard-light
   em.title-main  color: #2d2564
   span.title-copy color: rgba(0,14,255,.5)
```

올리브 `#81b81a`, 파랑 `rgba(0,14,255,.5)` 같은 값은 **눈에 보이라고 고른 색이 아니라 블렌드 연산의 피연산자**다. 결과만 보면 된다 — 실측 픽셀:

| 위치 | 렌더 결과 |
|---|---|
| 흰 배경 위 글자 | **#020827** (거의 남색 먹) |
| 리본(주황·분홍) 위 같은 글자 | **#4F30BA** (짙은 보라남) |

즉 글자가 리본 위에서도 **주변보다 항상 어둡게** 남으면서 리본의 색조를 받아 물든다. 스크림도, 텍스트 뒤 흰 박스도, 리본을 글자 피해 자르기도 없이 대비가 유지된다. 그리고 **블렌드 레이어 쪽 h1에 `aria-hidden="true"`가 붙어 있어** 스크린리더에는 h1이 하나만 읽힌다.

**총량**: 그라데이션 보유 요소 34개 / 2,996개 = **1.1%**. 그중 6개는 통계 밴드 하나의 크로스페이드 스택이고, 6개는 벤토 테두리 규칙 하나가 반복된 것이다. 실질 레시피는 **7종**이다.

## 문서형 신뢰(코드·수치·로고)의 문법

이 페이지가 "믿을 만해 보이는" 이유는 톤이 아니라 **검증 가능한 물체를 계속 내놓기 때문**이다.

**수치** — 셋 다 층위가 다르다.
1. **살아 있는 수**: 히어로 아이브로우의 `Global GDP running on Stripe: 1.69864520%`. 자릿수가 오도미터로 굴러간다. 그리고 **계산 방식을 설명하는 각주가 DOM에 실재**한다("The Global GDP running on Stripe is calculated using a simple algorithm that projects…")
2. **간판 수 4개**: 135+ / $1.9T / 99.999% / 200M+. 각각 단위와 기간이 붙는다("in payments volume processed in **2025**"). `99.999%`의 "historical uptime"은 **status.stripe.com 링크**다 — 검증 경로를 준다
3. **고객별 수**: 160 countries · 11K+ locations · 5+ brands · 700+ stores · 600K+ shoppers · 1.8K partners · 100% · Less than 3 months. 그리고 매번 **`Products used`로 어떤 제품을 썼는지 명시**한다. "Stripe를 씁니다"가 아니라 "Payments, Terminal, Connect, Radar, Stripe Sigma를 씁니다"

**코드** — 3단계로 추상도를 낮춘다.
- 9px 주석 코드: `stripeConnectInstance.create('payments');` — 읽으라고 놓은 게 아니라 **질감**이다. 메서드는 인디고 `#5b6bff`, 문자열은 초록 `#00b261`
- 12px 터미널: **vim 버퍼**다. 줄번호, 자동완성 드롭다운(accountLinks / accounts / applePayDomains / applicationFees / balances), `NORMAL` 모드 배지, `100% ≡ 6/6 ln : 4` 상태줄, 아래 실행 중인 셸. 일반적인 "코드 카드"가 아니라 **개발자가 실제로 보는 화면**
- 실행 가능한 물체: `https://buy.stripe.com/test_eVa3do41l…` 테스트 결제 링크와 **스캔되는 QR 코드**

**로고** — 3가지 다른 용법을 섞는다.
- 신뢰 마퀴: 18개, 142×34 균일 박스, **풀컬러**, 무한 스크롤
- 고객 사례: 24px 정사각 타일 + 한 문장 + 지표 3개
- 통합 파트너: 5×3 컬러 타일 그리드, 가장자리를 일부러 잘라 "더 있다"를 만든다

**제품 목업** — 결제 화면을 en-US / de-DE / ja-JP **3개 로케일로 순환**시킨다. Tax → VAT → JCT, 결제수단은 Klarna/Affirm/Cash App ↔ Rechnung ↔ PayPay/FamilyMart. "글로벌"을 형용사로 쓰지 않고 UI로 증명한다.

## 자산 운용

- 폰트 파일 **2개뿐**: `Sohne.woff2`(가변, 1–1000축, `font-display: block`) + `SourceCodePro-Medium.woff2`(swap). 히어로 폰트는 block이라 FOUT 대신 잠깐 비운다
- 모든 래스터는 CDN 파라미터를 탄다: `?w=…&fm=webp&q=…`. **q값이 역할별로 다르다** — 제품/사진 `q=90`, 배경 `q=80`, 히어로 폴백 `q=60`
- **모바일용 별도 아트가 거의 전부에 존재**한다: `-mobile.png`, `?w=296`, `?w=336`, `?w=368`. 리사이즈가 아니라 **다른 크롭**이다(`ConnectMobileBackground.jpg`, `sessions-2026-on-demand-bg-mobile.png`, `the-happenings-*-mobile.png` 8종)
- 표시 크기 대비 원본: 히어로 폴백 1392 표시 / 1392 원본(1:1), 아코디언 사진 1232 표시 / 1632 요청(1.32×), 책 표지 296 표시 / 1440 원본(4.9× 다운스케일), 아바타 48 표시 / 48 원본. **업스케일 0건**
- 고객 사례 8장은 스크린샷이 아니라 **고객사별 전용 브랜드 아트**다(432px 소스 → 344px 표시)
- canvas 6개: 히어로 리본, 통계 데이터비주얼, 개발자 다이어그램 등. 전부 **정적 PNG 폴백을 짝으로 가진다**(`wave-fallback-desktop`, `dataviz-fallback_2x`, `volume-fallback_2x`, `uptime-fallback_2x`, `subscriptions-fallback_2x`, `money-movement-fallback_2x`, `card-placeholder_2x`)
- inline SVG 266개 — 아이콘·로고·다이어그램. 아이콘은 전부 **1.5px 선화 보라** 계열이고 28px 연보라 타일 안에 담긴다

## 인터랙션

### 호버 표 (probe.mjs 14표본 + 직접 측정)

| 대상 | 변화 | 값 |
|---|---|---|
| 텍스트 링크 (`.hds-link`) | color + **opacity** + text-decoration-color | `#533afd → #2e2b8c`, `opacity 1 → 0.6` |
| 네비 항목 | color만 | `#4d5e76 → #061b31` |
| 1차 버튼 | background만 | `#533afd → #4032c8` |
| 2차 버튼 | color + border-color | `#533afd → #2e2b8c`, `#b9b9f9 → #4032c8` |
| **벤토 카드** | 그라데이션 원반 이동 + 6px 대칭 패럴랙스 | 아래 참조 |
| 고객 사례 카드 / 프로그램 카드 | **없음** (transform·shadow·border 전부 불변) | — |
| 무반응 표본 | 6/14 | — |

**전체 호버 레시피 5종.** lift·scale·glow·shadow 변화는 **카드에 단 한 건도 없다.**

### 벤토 카드 호버 — 그라데이션이 커서를 따라간다

```
테두리:  1px solid #e5edf5, radius 6px, box-shadow: none  (정지·호버 동일)
원반:    753×753 radial-gradient(circle, #7f7dfc, #f44bcc 33%, #e5edf5 66%)
         opacity: 0.5
         transition: transform 1s cubic-bezier(0.16, 1, 0.3, 1)   ← easeOutExpo
```

실측 이동량:

| 커서 | 원반 transform |
|---|---|
| 정지(중앙) | `none` |
| 좌상단 | `translate(−404.9px, −313.6px)` |
| 우하단 | `translate(+403.8px, +222.8px)` |

원반이 커서 쪽으로 미끄러지면 그 부근의 테두리만 보라→마젠타로 물들고, 66% 바깥은 원래의 `#e5edf5`다. **카드는 뜨지도, 커지지도, 그림자를 얻지도 않는다.** 대신 제목이 `(−4.8, −4.0)`, 확대 아이콘이 `(+4.8, −4.0)` — **6px짜리 반대 방향 패럴랙스**로 카드가 살짝 벌어진다. 확대 아이콘만 연보라 → 보라 채움으로 바뀐다.

### 스크롤 리빌 — 0건

probe 결과 `hiddenAtRest: 16 / revealedAfterScroll: 0`. 16건의 정체를 확인했더니 **통계 밴드의 스크린리더용 중복 목록**(`stats-section__stats-list`에 135+ / $1.9T / 99.999% / 200M+ 4쌍 전부)과 플랫폼 목업의 접힌 주석 카드였다. 즉 **페이드업·스태거·엔트런스 애니메이션이 아예 없다.**

키프레임 애니메이션은 페이지 전체에 **2개**뿐이고 둘 다 `book-of-the-week-fade-in 0.5s cubic-bezier(0.33,1,0.68,1)`이다.

### 모션 언어

- duration: **0.3s ×164** · 0.8s ×58 · 0.15s ×36 · 0.24s ×26 · 0.12s ×10
- easing: `cubic-bezier(0.25, 1, 0.5, 1)` ×164 (easeOutQuart, 버튼·링크) · `cubic-bezier(0.165, …)` ×58 (easeOutExpo, 대형 요소) · `cubic-bezier(0.45, 0.05, 0.55, 0.95)` (`--navigation-easing`, in-out sine, 네비 전용 0.24s) · `cubic-bezier(0.16, 1, 0.3, 1)` 1s (벤토 원반)
- transition 대상: color 90 · opacity 58 · transform 54 · background-color 39 · outline-color 29 · border 29 · clip-path 12
- **`transition: all` 0건**
- 즉 이 사이트의 모션은 **"0.3초 easeOutQuart로 색이 바뀐다"**가 기본이고, 큰 물체만 0.8~1s easeOutExpo로 미끄러진다

### 그 밖

- **sticky 요소 0개.** 헤더도 안 붙는다
- 포커스: `--hds-focus-outline = 3px solid #5452fbbf`, offset 3px. 버튼은 offset 1px
- 통계 밴드는 **자동 순환**한다(활성 통계 + 배경 시간대 + 데이터비주얼이 동시에 바뀜) + 우상단 수동 토글

## 배울 것

1. **그라데이션의 끝점을 디자인 시스템 토큰으로 잡아라.** 벤토 테두리 그라데이션의 마지막 stop이 기본 헤어라인 색 `#e5edf5`, 통계 배경의 마지막 stop이 기본 서브듀드 배경 `#f8fafd`다. 그래야 그라데이션에 **경계가 안 생긴다**. 색을 얹는 게 아니라 평면색을 국소적으로 물들이는 것 — 그라데이션이 티가 나는 거의 모든 경우는 이 규칙을 안 지켜서다.
2. **그라데이션에 일을 시켜라.** 이 페이지의 그라데이션은 전부 포인터 위치 / 시간대 / 활성 항목 / 사용량 / 로딩 상태를 나른다. 면적을 채우려고 쓴 그라데이션이 0개다. "여기 허전하니까 그라데이션"은 그 자체로 티다.
3. **그라데이션을 섹션 배경으로 쓰지 마라.** 섹션 9개 전부 플랫(`#fff` / `#0d1738` / `#f8fafd`). 그라데이션은 항상 섹션 **안의 별도 레이어**다. 배경으로 깔면 콘텐츠가 그 위에 얹힌 스티커가 되고, 레이어로 두면 콘텐츠와 같은 공간에 산다.
4. **텍스트를 그라데이션 위에 얹지 말고 통과시켜라.** 같은 헤드라인 두 벌을 그라데이션 위아래에 두고, 위쪽에 `mix-blend-mode: hard-light`. 실측 결과 흰 배경 위 `#020827`, 리본 위 `#4F30BA` — 대비가 유지되면서 색을 받는다. **위쪽 사본에 반드시 `aria-hidden="true"`**(Stripe도 그렇게 했다). 스크림으로 그림을 어둡게 죽이는 것보다 압도적으로 낫다.
5. **CSS 그라데이션을 진짜 주인공으로 쓰지 마라.** 히어로 리본은 canvas가 그린 3D 물체, 벤토 오로라는 사진 JPEG이다. CSS 그라데이션은 보조다. 6-stop 무지개를 CSS로 짜는 순간 밴딩과 "AI 배경" 인상이 함께 온다.
6. **헤딩과 설명을 한 문단으로 붙이고 색만 바꿔라.** 크기·굵기·행간 동일, 색만 다름. 48/32/26/22/16px **다섯 스케일 전부**에서 같은 문법을 쓴다. 헤딩 아래 subtitle 블록을 따로 만드는 순간 리듬이 끊긴다.
7. **같은 문법을 숫자에도 적용해라.** `**160** countries`, `**Products used** Payments, Terminal, Connect`. 큰 통계 배너를 만들지 않고 문장 안에서 숫자만 세운다 — 숫자 3개 가로 나열(LA2 🔴)을 피하는 가장 좋은 방법이다.
8. **weight 300을 기본, 400을 "볼드"로 선언해라.** `--hds-font-weight-normal: 300 / --hds-font-weight-bold: 400`. 실측 300 ×454, 400 ×262, 500 이상은 코드 폰트뿐. 두 단계만으로 위계가 다 나온다.
9. **자간은 크기에 비례해서만 조여라.** 22–26px −0.01em / 32–48px −0.02em / 56px −0.025em / **본문 16px는 normal**(509건). 본문에 자간을 거는 순간 읽기가 나빠진다.
10. **radius 기본값을 0으로 두고 예외만 라운드해라.** 0px ×2,770 · 4px ×102(버튼·입력) · 6px ×89(카드면). 벤토 카드조차 6px이고 그림자가 없다. "전부 12px 라운드 + 그림자"가 요즘 티의 핵심인데 정반대로 간다.
11. **그림자를 검정으로 만들지 마라.** `#003770` / `#003b89` / `rgba(50,50,93,…)` 청보라 틱을 쓰고, **스프레드를 크게 음수로**(`-30px`, `-20px`, `-16px`) 줘서 후광 대신 물체 아래 고인 웅덩이로 만든다. 그림자 붙은 요소가 2,996개 중 약 20개뿐이다.
12. **호버에서 카드를 띄우지 마라.** 벤토는 그림자·스케일·리프트가 전부 0이고, 대신 그라데이션 원반이 1초 easeOutExpo로 커서를 따라오고 제목과 아이콘이 **6px 반대 방향으로** 갈라진다. 고객 카드는 아예 무반응이다.
13. **엔트런스 애니메이션 없이도 최상급이 된다.** 스크롤 리빌 0건, 키프레임 총 2개, `transition: all` 0건. 대신 **살아 움직이는 것 3개**(GDP 카운터·통계 순환·로고 마퀴)에 예산을 몰았다. 리빌은 품질의 조건이 아니고, 항상 도는 것 몇 개가 훨씬 강하다.
14. **신뢰는 톤이 아니라 물체로 만들어라.** 검증 링크가 달린 수치(99.999% → status.stripe.com), 계산 각주가 붙은 카운터, 제품명을 명시한 고객 지표, 스캔되는 QR, 자동완성이 뜬 vim 화면, 3개 로케일로 세금 표기가 바뀌는 결제 UI. 형용사를 하나도 안 쓰고 신뢰를 만든다.
15. **로고 벽은 균일 박스 + 풀컬러로 가도 된다.** 142×34 고정, 172px 피치, 원본 브랜드 컬러, 18개를 2벌 복제해 무한 마퀴. (Vercel의 "높이 제각각 + 단색"과 정반대인데 둘 다 성립한다 — 정한 규칙을 끝까지 지키는지가 갈랐다.)
16. **구분선을 그리드보다 넓게 빼라.** 콘텐츠 그리드는 1232px인데 `section-header-divider`는 1264px다. 좌우 16px씩 더 뻗어서 선이 콘텐츠를 "받치는" 인상이 된다.

## 버릴 것

- **`prefers-reduced-motion` 대응이 0건이다.** canvas 6개 + 자동 순환하는 통계 밴드 + 무한 로고 마퀴를 돌리면서 감속 규칙이 하나도 없다. 여기는 그대로 따라가면 안 되는 지점이다.
- **8~13px 타이포**(QF4 21건 — 10px ×193, 9px ×46, 8px ×23). 전부 제품 목업 내부라 Stripe에선 "질감"으로 성립하지만, 실제 읽어야 하는 텍스트에 가져오면 그냥 접근성 위반이다. **9px 코드는 그림이지 코드가 아니다**는 것을 알고 쓸 때만 유효하다.
- **h1 두 벌 기법을 aria 없이 복제하기.** Stripe은 블렌드 레이어에 `aria-hidden="true"`를 붙였다. 이걸 빼면 h1이 2개로 읽히는 명백한 결함이 된다.
- **로고 마퀴의 SVG가 전부 `aria-hidden="true"`다.** `aria-label`을 달아놓고도 숨겼다 — 스크린리더에는 고객사 벽이 존재하지 않는다. Stripe의 실수지 배울 점이 아니다.
- **canvas 히어로를 자산 없이 흉내내기.** 이 리본은 실시간 렌더 + 1392×975 폴백 PNG + 모바일 별도 크롭까지 갖춘 결과물이다. CSS `radial-gradient` 몇 겹으로 대체하면 정확히 CO1 🔴이 된다. 예산이 없으면 **차라리 흰 배경에 그라데이션을 안 쓰는 쪽**이 낫다.
- **`hds-*` 토큰 체계를 통째로 이식하기.** 색 변수만 431개다. 우리 규모에서 필요한 건 이 파일에 정리된 **10개 남짓의 의미 토큰**(text-solid/soft/subdued/quiet, surface-bg-subdued, surface-border-quiet, action-*, 다크 2단)이지 431개가 아니다.
- **책 소개 섹션(Book of the week) 형식만 베끼기.** 이건 Stripe Press라는 실체가 뒤에 있어서 성립한다. 읽을 것이 없는데 자리만 만들면 AS2(플레이스홀더) 그 자체다.
- **통계 밴드 6종 시간대 크로스페이드.** 광원 위치·색 6세트·데이터비주얼 4종·활성 인디케이터가 전부 동기화돼야 성립한다. 부분만 가져오면 "그냥 보라 그라데이션 배너"로 착지한다 — detect가 CO1 🔴을 때린 바로 그 모양이 된다.
