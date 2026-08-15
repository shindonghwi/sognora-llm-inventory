# getjobber.com 분석

장르/단위: 현장 서비스 B2B SaaS(청소·배관·조경·도장 업체용 운영 소프트웨어) / 랜딩 1페이지 · 분석일 2026-08-15 · 상태: **완전** (detect + probe + capture + fetch-assets + 풀페이지 3조각 육안 확인 + 확대 12컷 + 호버·마퀴·리듀스드모션 실측)

측정 조건: 1440×900, light, 문서 전체 높이 **6,700px**, 콘텐츠 컨테이너 1345px(좌우 여백 40px, 일부 섹션 1265px/80px). Next.js + Emotion, CMS는 Sanity. 루트 폰트 크기 **10px**(`--font-size-text-md: 1.6rem` = 16px, `--font-size-heading-lg: 5rem` = 50px).

접근 메모: Cloudflare가 headless 크롬을 챌린지로 막는다. 헤디드 영속 컨텍스트(`launchPersistentContext` + `channel: "chrome"`)로만 통과했고, `networkidle`은 끝까지 도달하지 않아 `domcontentloaded` + 본문 높이 폴링으로 대체했다.

## 수치

**폰트 8단** — 14 / 15 / 16 / 18 / 24 / 32 / 40 / **50**px
빈도 실측(직접 텍스트 노드를 가진 요소 183개 기준): `14/400` 75회 → `16/900` 22회 → `16/400` 21회 → `14/700` 20회 → `24/900` 14회 → `16/700` 10회 → `18/900` 7회 → `40/900` 5회 → `14/600` 4회 → `32/900` 3회 → `15/400` 1회 → `50/900` 1회.

본문은 `16/400`, 그래서 **디스플레이 배율 3.13×**(50 ÷ 16). 가장 흔한 크기인 14px 기준으로 잡아도 3.57×. **랜딩 평균(5~7×)의 절반이고, 이게 이 페이지의 가장 중요한 수치다.** 히어로 헤드라인이 50px밖에 안 되는데도 작아 보이지 않는 이유는 아래 두 가지로 벌충하기 때문이다.

**웨이트는 400 / 500 / 600 / 700 / 900 다섯인데 실질은 2단.** Inter 400(본문·캡션) + JobberPro **900**(제목·버튼·수치) 대비가 전부다. 500은 업종 카드 라벨 한 곳, 600은 내비 링크 4곳, 700은 헤더 CTA와 푸터 일부에만 있다. **디스플레이 웨이트가 700이 아니라 900**인 게 배율 3.13×를 버티게 해준다.

**행간이 완벽한 단조 램프** — 50/56(1.12) → 40/48(1.20) → 32/40(1.25) → 24/32(1.33) → 16/24(1.50) → 14/24(1.71). 크기가 한 단 올라갈 때마다 행간이 한 단 조여지고, **행간 값이 전부 8의 배수**(56·48·40·32·24)다. 8px 베이스라인 그리드 위에 타입 램프를 통째로 올렸다.

**트래킹은 사실상 없다.** 내비 링크 4곳에 `0.1px`, 나머지 전부 `normal`. 음수 트래킹 0건 — JobberPro가 이미 조여진 글꼴이라 손댈 필요가 없다.

**밀도**(contentArea ÷ 섹션면적) 중앙값 **143.8%**
섹션별: s0 220.6% · s1 143.8% · s2 116.5% · s3 100.0% · s4 154.4% · s5 116.9% · s6 188.8% · s7 167.4% · s8 **13.7%**.
100%를 넘는 값은 스크립트가 중첩 요소를 겹쳐 세기 때문이라 절대치로는 못 쓴다. 읽을 건 **상대 순서**: 히어로(220.6%)와 인용+CTA 밴드(188.8%)가 가장 빽빽하고, 사진 스트립(100.0%)과 푸터(13.7%)가 비어 있다. 푸터가 641px 높이에 13.7%인 건 5열 링크 사이 여백을 크게 잡았기 때문.

**이미지 59개 중 고유 32개.** 재사용은 두 곳에서만 나온다 — 히어로 마퀴가 고객 사진 8장을 각 4벌씩 DOM에 심고(무한 루프용), `spackle` 텍스처가 7회. 정보성 자산(제품 화면·리소스 썸네일·인물)은 **재사용 0**.
인라인 SVG 76개 · 링크 152개 · 트라이얼/데모 CTA 8개.

**그림자가 페이지 전체에 1개.** `rgb(128,128,128) 0 0 5px`짜리 하나뿐이고 그나마 서드파티 잔재로 보인다. 카드·버튼·내비·폼 어디에도 `box-shadow`가 없다. **깊이를 전부 색 밴드와 종이 질감으로 만든다.**

**radius 분포**: `4px` 25개(지배) · `90px` 4개(탭 알약) · `50%` 2개(아바타) · `4px 0 0 4px` 2개 + `0 4px 4px 0` 2개(이메일 입력+버튼 분할) · `2px` 1개. 단일값 지배지만 나머지가 전부 목적이 분명해서 plai.io식 `radius:12px` 100% 지배와는 성격이 다르다.

**텍스트 색이 4개뿐** — 흰색 120회 · 네이비 `#012939` 59회 · 라임 `#a8e300` 3회 · 연라임 `#cbee66` 1회. **액센트 라임을 글자색으로 쓰는 건 딱 3번.** 배경으로는 22회(베이지 카드) / 10회(네이비 밴드) / 6회(베이지 페이지) / 4회(라임 버튼).

**티 프로필** — 🔴9 🟡6

- 🔴 **LA1** s5 — 동일 크기·동일 골격 형제 카드 **12개**(324×96) 가로 나열, 실미디어 없음
- 🔴 **BD1** ×5(s0·s1·s2·s4·s6) — 유채색 사이드 액센트 보더 총 8곳
- 🔴 **IC1** ×3(혐의, s0·s2·s7) — 동일 SVG 글리프 3/4/5회 반복. 실제로는 그리드 장식이 아니라 히어로 캡션 세로 룰·테이프 path·리소스 카드 화살표라 **오탐**이다
- 🟡 **TS2** 스케일 인접비 불규칙 5쌍 (14→15→16→18 구간이 뭉개짐)
- 🟡 **TS3** 본문 스택이 기본값뿐(`Inter, system-ui, sans-serif`)
- 🟡 **IC3** s0에 텍스트·aria 없는 아이콘 5개
- 🟡 **QF4** 본문 타이포 하한 미달 3곳
- 🟡 **QF6** width/height 미지정 이미지 2개
- 🟡 **AS1** `spackle-on-dark`×3 / `spackle-on-light`×4 재사용

**🔴 9건인데도 저렴해 보이지 않는 이유**: LA1(동일 카드 12개)은 업종 선택 UI라 방문자가 자기 업종을 **찾는 행동**을 하는 자리고, 카드마다 들어간 아이콘이 그 업종의 실제 연장(도장=페인트 롤러, 배관=플런저)이다. BD1(유채색 사이드 보더)은 AI 섹션에서 찢은 종이 위에 붙인 UI 조각의 액센트 라인이라 장식이 아니라 콜라주 문법의 일부다. IC1은 전부 오탐. **탐지기가 잡는 "구조적 티"가 재료(종이·테이프·연장)로 재해석되면 티가 아니게 되는 사례.**

## 실측 토큰

CSS 변수 **118개**를 실제로 수확했다. 다만 절반이 별칭이라 실질 체계는 아래가 전부다(별칭 문제는 「버릴 것」 참조).

### 팔레트

```
--color-page-bg:      #f2f0ea   /* 종이 베이지 — 흰색이 아니다 */
--color-page-fg:      #012939   /* 딥 네이비 */
--color-page-accent:  #a8e300   /* 라임 */

--color-navy-100~500:  #677f88 · #345461 · #012939 · #01212e · #011922
--color-beige-100~400: #fff    · #f2f0ea · #dad8d3 · #c2c0bb
--color-green-100~500: #cbee66 · #b9e933 · #a8e300 · #86b600 · #658800
--color-grey-100~400:  #f3f3f3 · #b9b9b9 · #9999(오타) · #787878
--color-orange-100~500: #f5a17d · #f28151 · #ef6226 · #bf4e1e · #8f3b17

--brand-tape-100:     #e5deb3   /* = --color-manila-100 */
--brand-warning-100:  #f5f0d1   --brand-warning-200: #cdb52d
--brand-success-100:  #cbee66   --brand-success-200: #276515
--brand-error-100:    #eec1bc   --brand-error-200:   #b02626
```

**섹션 테마가 3쌍 토큰으로 선언돼 있다** — 이게 이 사이트 레이아웃의 뼈대다.

```
--section-primary-bg: #012939  --section-primary-fg: #f2f0ea  --section-primary-accent: #a8e300
--section-secondary-bg: #f2f0ea --section-secondary-fg: #012939 --section-secondary-accent: #a8e300
```

네이비 밴드와 베이지 밴드가 **fg/bg만 뒤집고 액센트는 같은 라임을 공유**한다. 페이지 전체가 이 두 테마의 교대다.

### 타입

```
--font-headings:  "JobberPro", system-ui, sans-serif   /* 커스텀, 900 단일 + italic */
--font-body:      "Inter", system-ui, sans-serif
--font-monospace: "SF Mono", "Monaco", ...

--font-size-heading-lg: 5rem     --line-height-heading-lg: 5.6rem   /* 50/56 = 1.12 */
--font-size-heading-md: 4rem     --line-height-heading-md: 4.8rem   /* 40/48 = 1.20 */
--font-size-heading-sm: 3.2rem   --line-height-heading-sm: 4rem     /* 32/40 = 1.25 */
--font-size-heading-xs: 2.4rem   --line-height-heading-xs: 3.2rem   /* 24/32 = 1.33 */
--font-size-text-lg: 1.8rem      --line-height-text-lg: 2.8rem      /* 18/28 = 1.56 */
--font-size-text-md: 1.6rem      --line-height-text-md: 2.4rem      /* 16/24 = 1.50 */
--font-size-text-sm: 1.4rem      --line-height-text-sm: 2rem        /* 14/20 = 1.43 */
--font-size-text-xs: 1.2rem      --line-height-text-xs: 1.8rem      /* 12/18 = 1.50 */
```

**크기와 행간이 항상 쌍으로 선언된다.** 크기 토큰만 있고 행간은 알아서 하는 체계가 아니다.

### 간격·형태

```
--spacing-xxs~xxxl:      0.4 · 0.8 · 1.6 · 2.4 · 3.2 · 4 · 6.4 · 7.2 rem
--page-spacing-xxs~xxxl: 2.4 · 4 · 4.8 · 5.6 · 6.4 · 7.2 · 9.6 · 20 rem   /* 최대 200px */
--radius-xs~xl:  0.2 · 0.4 · 0.8 · 1.6 · 2.4 rem  + --radius-round: 50%  + --radius-none: 0
--border-width-xs/sm/md: 0.1 · 0.2 · 0.3 rem
--container-narrow/reduced/wide/default: 532 · 768 · 1024 · 1440 px
--transition-speed: 0.25s        /* 페이지 전체 단일 속도 토큰 */
```

**요소 간격(`--spacing-*`)과 섹션 간격(`--page-spacing-*`)이 분리된 두 스케일**이다. 섹션 스케일은 24px에서 시작해 200px까지 간다.

### 대표 요소 실측값

| 요소 | 크기 | 타이포 | 색 | 패딩 | radius | 보더 | 그림자 |
|---|---|---|---|---|---|---|---|
| **h1** | 811×56 | `JobberPro 50/56 900` | `#fff` | 0 | 0 | — | none |
| h2 | 1345×48 | `JobberPro 40/48 900` | `#012939` | 0 | 0 | — | none |
| h3 (네이비 밴드) | 1345×40 | `JobberPro 32/40 900` | `#fff` | 0 | 0 | — | none |
| h4 / 카드 제목 / 인용 | — | `JobberPro 24/32 900` | 문맥색 | 0 | 0 | — | none |
| 푸터 열 제목 | 250×28 | `jobberPro 18/28 900` | `#fff` | 0 | 0 | — | none |
| **본문** | 811×48 | `Inter 16/24 400` | 문맥색 | 0 | 0 | — | none |
| 푸터 링크 | — | `Inter 14/24 400` | `#fff` | 0 | 0 | — | none |
| 내비 링크 | 66~84×72 | `Inter 14/normal 600` ls `0.1px` | `#fff` | 0 | 0 | — | none |
| **주 CTA** `Start Free Trial` | **193×56** | `jobberPro 18/24 900` | `#012939` on `#a8e300` | `13px 29px` | **4px** | **3px solid `#a8e300`** | none |
| 고스트 CTA `Find Your Plan` | 189×56 | `jobberPro 18/24 900` | `#a8e300` on transparent | `13px 29px` | 4px | 3px solid `#a8e300` | none |
| 네이비 CTA `Learn more` | 152×40 | `jobberPro 16/24 900` | **`#a8e300`** on `#012939` | `5px 29px` | 4px | 3px solid `#012939` | none |
| 헤더 CTA | 147×40 | `jobberPro 16/24 **700**` | `#012939` on `#a8e300` | `8px 16px` | 4px | 없음 | none |
| 탭 알약 | 109~132×41.2 | `jobberPro 16/19.2 900` | `#012939` on `#dad8d3` @70% | `8px 16px` | **90px** | 3px solid (활성 `#012939` / 비활성 transparent) | none |
| **업종 카드** | **324.3×96** | 라벨 `Inter 15/24 500` | `#012939` on `#dad8d3` @70% | `16px` | 4px | 없음 | none |
| 테이프 통계 카드 | 174×48 | 수치 `JobberPro 24/32 900` | `#012939` on `#e5deb3`(SVG) | 내부 span `8px 24px` | — | — | none |
| 탭 패널 | 1345×480 | — | `#dad8d3` @70% | — | 0 | 없음 | none |
| 인용 카드 | 1345×232 | — | `#01212e` + spackle | — | 0 | 없음 | none |

**주목**: 주 CTA·고스트·네이비 CTA가 **완전히 같은 박스**(radius 4 / border 3px / jobberPro 900 / padding 13·29)이고 색 역할만 다르다. 고스트는 채움 버튼에서 `background`만 뺀 것이다.

## 구조

전체 12밴드, 6,700px. 캡처 3조각(0~3000 / 3000~6000 / 6000~6700)을 전부 열어 확인했고 각 top은 실측값이다.

**1. 공지 바** (top 0, h 40)
- 역할: 이벤트 고지 + 언어 전환 + 로그인.
- 레이아웃: 풀블리드 `#345461`(navy-200 — 헤더보다 **밝은** 네이비). 좌: 고지 문장, 우: `Español` / 세로 구분 룰 / `Log In` + 문 밖으로 나가는 화살표 아이콘.
- 타이포: `Inter 16/24 400` 흰색. `Learn more!`만 라임 + 라임 밑줄.
- 디테일: 문장에 `🔥` 이모지가 그대로 박혀 있다. 스크롤하면 그냥 흘러나가고 다시 안 온다.

**2. 헤더** (top 40, h 73, `position: sticky`)
- 역할: 상시 전환 경로 + 업종/기능 분기.
- 레이아웃: 풀블리드 `#012939`. 좌: 라임 로고마크(중첩 라운드 사각 = 지문/소용돌이) + `JOBBER` 라임 워드마크 → 내비 4개(Product▾ Industries▾ Pricing Resources▾). 우: **전화 아이콘 + `1-888-721-1115`** → 라임 CTA.
- 타이포: 링크 `Inter 14/600` ls `0.1px` 흰색. CTA `jobberPro 16/24 700`.
- 자산: 로고 1개, 전화·셰브론 아이콘.

**3. 히어로** (top 113, h 690 · `#012939` + spackle-on-dark)
- 역할: 한 문장 가치제안 + 이중 CTA + 앱스토어 별점 + 고객 얼굴.
- 레이아웃: **좌 텍스트 / 우 사진 2열 마퀴**. 우측 열이 섹션 상·하단에서 잘려 나간다.
- 좌: h1 `Run a stronger service business`(50/56 900 흰색, 811px 1줄) → 서브 `Inter 16/24` 2줄 → CTA 2개(라임 채움 `Start Free Trial` + 라임 고스트 `Find Your Plan`) → **앱스토어 별점 2쌍**: App Store 아이콘 + `4.8` + 금색 별 4.5개 + `13,861 App Store reviews`, Google Play 아이콘 + `4.5` + `4,883 Google Play Reviews`.
- 우: 세로 2열, 각 열이 **위로 천천히 흐르는 마퀴**(약 51px/s). 사진은 radius 0, 실제 업자 현장 사진. 각 사진 좌하단에 **얇은 흰 세로 룰**(약 4px 폭) + 이름(`jobberPro` 볼드 흰색) / 상호(regular). 예: `Stephen Jobe / Jobe & Sons Plumbing`, `Erica Krupin / Kroopin's Poopin Scoopin`, `Jessica Bannister / Cam Cool Refrigeration`.

**4. 기능 탭 섹션** (top 803, h 798 · `#f2f0ea` + spackle-on-light)
- 역할: 제품 가치를 4개 결과 축으로 쪼개 보여준다.
- 레이아웃: 중앙 h2 `The all-in-one system for high-performing service pros`(40/48 900) → **탭 알약 4개**(Get Noticed / Win Jobs / Work Smarter / Boost Profits, radius 90) → 1345×480 2분할 패널(top 1048).
- 패널 좌(약 68%): 진한 회베이지 판 위에 **고객사 공개 페이지 스크린샷**(`Lawncare Inc. — Transforming lawns with expert care`, Get an Estimate / Client login 버튼, Google 4.8(231), 전화번호, Services offered 체크리스트). 그 위에 흰 카드 3개가 떠 있다 — `Website requests 32 ↑22%` / `Google rating 4.8 ★★★★½` / `Client Referrals 56 ↑13%`. 증감은 작은 초록 알약.
- 패널 우(약 32%): 밝은 베이지. h3 `Help the right customers find you`(24/32 900) → 본문 → 네이비 버튼(라임 글자) `Learn more` → **손으로 그은 듯한 거친 가로 룰** → 굵은 통계 한 줄(`92 million+ Jobs completed by...`) → 고객 인용 한 문단.
- **한 패널 안에 기능 주장 + CTA + 통계 + 후기를 다 넣었다.**

**5. 통계 + 이메일 캡처** (top 1575, h 529 · `#012939` + spackle + **rip 마스크**)
- 역할: 규모 증명 → 즉시 전환.
- 레이아웃: 위 경계가 **찢어진 종이**. 중앙 h3 `Join over 400,000 service pros who trust Jobber`(32/40 900 흰색) — `400,000`에 손그림 밑줄. 아래 통계 4개 균등, 각 수치가 **마스킹테이프 조각 위**에 있다. 그 아래 **인라인 이메일 폼**(입력 + 라임 버튼) + `No credit card required.`
- 통계: `92 million+` / `100K+` / `12 hours+` / `44%`, 캡션 `Inter 16/24 400` 흰색 2줄.

**6. 사진 스트립** (top 2102, h 160 · `#f2f0ea`, spackle 없음, rip 없음)
- 역할: 밴드 사이의 숨 고르기 겸 "이 사람들이 우리 고객" 재확인.
- 레이아웃: 풀블리드 가로 1행, 사진 5~6장을 **폭이 제각각인 채로** 작은 간격을 두고 붙였다. **정지 상태**(마퀴 아님 — transform·animation 모두 none).
- 자산: 얼굴이 위아래로 잘리도록 타이트하게 크롭. 주황 안전조끼 남성 / 노란 승용 예초기 위 여성 / 폰 화면에 라임 Jobber 앱 아이콘을 띄운 손 / 체크셔츠 남성과 여성의 대화 / 작업복 남성.

**7. AI 섹션** (top 2262, h 809 · `#f2f0ea` + spackle)
- 역할: AI 기능을 "현장 언어"로 소개.
- 레이아웃: 중앙 h2 `AI built for blue collar businesses` → 3열. 각 열 = 콜라주 자산 → h3(24/32 900 중앙) → 본문(중앙). 마지막에 중앙 네이비 버튼 `Learn More`.
- 소제목: `Made for the field` / `Adapts to your style` / `Shows up when it matters`.
- 자산: **찢은 종이 조각 위에 실제 제품 UI 파편을 붙이고, 그 사이를 검은 손그림 마커 화살표가 잇는다.** UI 조각마다 유채색 액센트 보더(주황·틸·빨강)가 붙고 라임 스파클 획이 튄다. 실제 데이터가 들어 있다(`Jasmine Williams`, `New high value quote just came in. Close the deal 🎉`).

**8. 업종 그리드** (top 3071, h 617 · `#f2f0ea` + spackle)
- 역할: 업종별 랜딩으로 분기.
- 레이아웃: 중앙 h2 `Proud partner to service pros in over 50 industries.` → **4열 × 3행 = 12장**, 카드 324.3×96, `#dad8d3` @70%, radius 4, padding 16 → 중앙 `See All Industries →`.
- 카드 내부: **좌상단 연장 아이콘**(네이비 아웃라인 단일 두께) → 아래 라벨(`Inter 15/24 500`). **좌측 정렬**.
- 아이콘이 전부 그 업종의 실제 연장이다: 청소=빗자루, 건설=교차 공구, 전기=플러그, HVAC=팬, 만능수리=렌치+드라이버, 조경=모종삽+삽, 잔디=나뭇잎, **도장=페인트 롤러**, 배관=플런저, 고압세척=세척기, 지붕=집, 수목=나무.
- 링크는 전부 `/industries/<trade>-software/` 계열.

**9. 인용 + 최종 CTA** (top 3661, h 653 · `#012939` + spackle + rip 마스크)
- 역할: 정서적 마무리 → 두 번째 이메일 캡처.
- 레이아웃: 위·아래 경계 모두 찢어진 종이. 상단에 인용 카드(top 3733, 1345×232, `#01212e` — **밴드보다 한 단계 진한 네이비**). 그 아래 중앙 정렬 h3 + 서브 + 이메일 폼 + `No credit card required`.
- 인용: `"Jobber has taken a lot of stress off my shoulders. I can invoice from my cell phone. I'm not tied to my office."` (jobberPro 24/32 900 흰색 2줄) + 원형 아바타 56px + `Mitchell Gordy / MITHGO Outdoor Services`.
- 자산: 카드 우측에 **거대한 Jobber 로고마크 워터마크**를 극저대비로 깔고 카드 밖으로 잘라낸다.
- h3: `You've got this, and we've got your back.`

**10. 리소스 벤토** (top 4287, h 1773 · `#f2f0ea` + spackle + rip)
- 역할: 커뮤니티·교육 자산으로 브랜드 신뢰 쌓기.
- 레이아웃: 중앙 h2 `Our business is helping yours succeed.`(2줄, `yours`에 손그림 밑줄) → **비대칭 벤토**: 2열 대형 카드 → **전폭 저상 카드 1개** → 2열 대형 카드.
- 카드 5개: `Masters of Home Service`(팟캐스트) · `Jobber Academy` · `Free Tools` · `Jobber Grants` · `Jobber Events`. 각각 이미지 → 회베이지 판 → h3(24/32 900) → 본문 → `Learn more →`.
- 자산: 카드 아트가 전부 **실제 브랜드 미디어**다. 팟캐스트 커버(실인물 + 굵은 흰 제목), `ACADEMY`가 거대한 라임 글자로 사진 콜라주 위에, `JOBBER**GRANTS**` 락업, `MASTERS OF HOME SERVICE • LIVE` 빨간 박스 + 얼굴 썸네일 그리드.
- Free Tools 카드만 사진 대신 **네이비 손그림 선화 + 라임 오프셋 스팟**(계산기·연필·클립보드+자·계산기 프린터).

**11. 푸터** (top 6059, h 641 · `#012939`, **spackle 없음, rip 없음 — 직선 경계**)
- 역할: 사이트맵 + 앱 배포 + 법적 고지.
- 레이아웃: 대형 라임 로고 → 5열(`Industries We Serve` 14 / `Features` 9 / `Resources` 9 / `Company` 11 / 연락처) → 헤어라인 → 법적 링크 줄.
- **업종 열이 첫 번째이고 가장 길다.** 기능보다 업종이 먼저 온다.
- 연락처 열: 전화번호, `hello@getjobber.com`, 소셜 6개(Facebook·X·Instagram·YouTube·LinkedIn·**TikTok**), **Google Play / App Store 공식 배지 2장**.
- 열 제목 `jobberPro 18/28 900`, 링크 `Inter 14/24 400`.
- `Company` 열에 `Hey AI, learn about us` 링크가 있다 — AI 크롤러용 진입점.

## 자산 운용

**핵심 문법: 브랜드의 물성이 "종이·테이프·연장"이고, 그게 CSS 변수 이름과 파일명에 그대로 박혀 있다.** `--brand-tape-100`, `--color-manila-100`, `spackle-on-dark.webp`(스패클 = 벽 메움재), `rip.svg`, `underline-shallow.svg`. 은유가 디자인 파일이 아니라 코드 층에 있으니 구현자가 바뀌어도 톤이 안 흔들린다.

**종이 질감 = 500×500 타일 1장 + blend-mode.** 밴드는 플랫한 `background-color`를 깔고 그 위에 `background-image: url(spackle-*.webp)`를 `background-size: 500px 500px; background-repeat: repeat`로 반복시킨 뒤 **`background-blend-mode`로 섞는다 — 어두운 밴드는 `lighten`, 밝은 밴드는 `darken`.** 별도 오버레이 레이어도, 의사요소도 없다. 파일 2장(124KB + 44KB)으로 전 페이지 종이감을 만든다. 사진 스트립 밴드와 푸터에는 일부러 안 깔았다.

**밴드 전환 = `mask-image: url(rip.svg)`.** 배경 이미지가 아니라 **밴드 요소 자체를 마스킹**한다. `rip.svg`는 `viewBox="0 0 1440 26"`, `preserveAspectRatio="none"`, `fill: currentColor`인 단일 path — **진폭 26px의 얕고 촘촘한 찢김**이다. 요란한 대각선 절단이 아니라 두꺼운 종이를 손으로 뜯은 결. 같은 자산 하나로 위·아래 양방향을 다 처리한다. 총 4번 쓰고, **푸터에서만 직선으로 끝낸다.**

**마스킹테이프 통계 카드**(`.stat-card-tape`) — 구조가 정확히 이렇다:
```
.stat-card-tape (174×48)
├─ <svg viewBox="0 0 116 32" preserveAspectRatio="none">   ← 글자 폭만큼 가로로 늘어남
│    path fill="currentColor"  color: #e5deb3              ← 손으로 그린 찌그러진 사각
└─ <span z-index:1 padding:8px 24px>
     <h4 JobberPro 24/32 900 #012939>92 million+</h4>
```
기울기와 삐뚤한 모서리가 **CSS `transform`이 아니라 path에 내장**돼 있다(`transform: none` 실측). 그래서 4장이 다 같은 path인데도 글자 길이가 달라 각각 다르게 늘어나 보인다.

**손그림 마크 2종을 역할별로 나눠 쓴다.**
1. `underline-shallow.svg` — `viewBox="0 0 63 3"`, `stroke: #84EA00`, `stroke-width: 2`, `linecap: round`. **내비 링크 호버 전용.** `background-image`로 붙는다.
2. 단어 강조 인라인 SVG — `viewBox="0 0 445 18"`, `fill: currentColor`, `position: absolute; bottom: -8px`, 높이 10px, 단어 폭만큼 stretch. `400,000`(네이비 위, `#345461`)과 `yours`(베이지 위, `#c2c0bb`)에 쓰인다. **강조색이 액센트 라임이 아니라 배경에서 한 단계만 벗어난 톤.**

**인물 사진의 규칙 — 스톡 사진이 한 장도 없다.**
- 전부 실명 + 실제 상호. `Kroopin's Poopin Scoopin`(반려동물 배설물 수거업) 같은 상호도 그대로 쓴다.
- 상황이 지저분하다: 흙, 먼지, 뜯긴 단열재, 공구 트럭, 형광 안전조끼. 정리된 사무실 컷이 0장.
- 캡션은 사진 좌하단에 **얇은 흰 세로 룰 + 이름(볼드) / 상호(regular)** 2줄. 오버레이 그라데이션 없이 사진 위에 바로 얹는다.
- radius 0. 둥근 모서리 인물 사진이 없다.

**제품 화면은 세 가지 방식으로만 나온다.**
1. **고객의 결과 화면**(탭 패널) — Jobber 관리자 UI가 아니라 Jobber가 만들어준 *고객사의 공개 예약 페이지*. 그 옆에 성과 지표 흰 카드를 띄운다.
2. **찢어 붙인 UI 파편**(AI 섹션) — 깨끗한 스크린샷을 안 쓰고 종이 조각 위에 조각조각 붙인 뒤 손그림 화살표로 잇는다.
3. **앱 아이콘이 켜진 실제 폰**(사진 스트립) — 스크린샷이 아니라 사진.
브라우저 크롬도, 디바이스 목업도 없다.

**로고 문법**: 고객사 로고 벽이 **아예 없다.** 이 장르에서 흔한 "믿을 만한 브랜드 6개 회색조 나열"을 안 쓰고, 그 자리를 개인 업자 얼굴 26장과 앱스토어 별점으로 채웠다. B2B SaaS인데 사회적 증거의 단위가 **회사가 아니라 사람**이다.

## 인터랙션

### 호버 표 (probe 14표본 + 직접 실측 7종)

| 요소 | 변한 속성 | 값 |
|---|---|---|
| 내비 링크 (Product/Industries/Pricing/Resources) | `color` + `borderColor` + 배경 SVG | `#fff` → **`#84EA00`** + **손그림 라임 밑줄 등장** |
| 헤더 CTA `Start Free Trial` | `background-color` | `#a8e300` → `#b9e933` (**밝아짐**) |
| 히어로 CTA `Start Free Trial` | `background-color` + `borderColor` | `#a8e300` → `#86b600` (**어두워짐**) |
| 고스트 CTA `Find Your Plan` | `color` + `background-color` | `#a8e300` → `#588a1b` / 투명 → `rgba(168,227,0,.48)` |
| 네이비 CTA `Learn more` | `background-color` + `borderColor` | `#012939` → `#345461` |
| 탭 알약 (비활성) | `borderColor` | `transparent` → `#012939` (3px) |
| `Español` · 헤더 전화번호 | `opacity` | `1` → `0.7` |
| 푸터 텍스트 링크 | `text-decoration` | `none` → `underline` |
| 푸터 소셜 아이콘 | `text-decoration` | `underline` → `none` (**역방향**) |
| **업종 카드 ×12** | — | **무반응** (`transition: .25s ease-in-out` 선언돼 있으나 호버 규칙 없음) |
| `See All Industries →` | — | **무반응** |
| 리소스 카드 `Learn more →` | — | **무반응** |
| 로고 · 공지바 링크 | — | 무반응 (probe `hoverDead`) |

**요약: 살아 있는 건 버튼·내비 링크·탭·푸터 링크뿐.** 페이지의 핵심 분기 UI인 업종 카드 12개와 리소스 카드 화살표가 전부 죽어 있다. 대신 살아 있는 것들의 변화는 명확하다 — 미묘한 그림자 승격 같은 건 애초에 불가능하다(그림자가 없으므로).

### 스크롤 리빌

**0개.** `hiddenAtRest: 0`, `revealedAfterScroll: 0`. 정지 상태에서 `opacity:0`이거나 transform으로 밀려 있는 요소가 단 하나도 없다. **페이드인·슬라이드업이 전면 부재.** 스크롤은 그냥 스크롤이다.

### 모션 언어

- duration: **`0.25s` 72회**(= `--transition-speed` 토큰), `0.2s` 33회, `0.3s` 23회, `0.1s` 1회.
- easing: `ease` 67회 + `ease-in-out` 62회 **두 값**. 커스텀 cubic-bezier 0건.
- 애니메이트 속성: `background` 49 · **`all` 36** · `border` 14 · `color` 10 · `border-color` 10 · `transform` 4 · `opacity` 2.
- 미디어: `<video>` **0**, `<canvas>` 0, `<iframe>` 9(채팅·추적). **동영상 없이 사진과 마퀴만으로 움직임을 처리한다.**

**유일한 지속 모션 = 히어로 사진 세로 마퀴.** 2열이 위로 약 51px/s(2.5초에 127px)로 끊김 없이 흐른다. 고객 사진 8장을 4벌씩 복제해 무한 루프를 만든다. CSS `animation`이 아니라 JS 구동.
**`prefers-reduced-motion: reduce`에서 완전히 멈춘다**(3초간 이동량 0px 실측). 리빌이 0개라 리듀스드모션에서 잃는 정보도 0이다.

사진 스트립(top 2102)은 마퀴처럼 보이지만 **정지 상태**다 — `transform: none`, `animation: none`, 내부 폭 = 뷰포트 폭.

### 고정 내비 거동

`position: sticky; top: 0`, 높이 73px, 배경 `#012939` 불투명.
정지 시 top 40(공지바 아래)에 있다가 공지바가 흘러나가면 top 0에 붙고, **그 뒤로는 아무것도 변하지 않는다.** 스크롤 200 / 600 / 1500 / 3000 / 5000px, 그리고 위로 되돌린 2000px 지점까지 전부 실측 — 배경 동일, `box-shadow: none` 유지, 높이 축소 없음, 숨김 없음, `backdrop-filter` 없음.
**이미 불투명 네이비라 스크롤 상태에 따라 바꿀 게 없다.** 반투명 헤더를 쓰면 반드시 따라오는 "스크롤 시 배경 채우기 + 그림자 넣기" 로직 자체가 필요 없어진다.

### 업종 분기 내비

`/industries/` 링크가 페이지에 **28개(고유 16 URL)** 있고, 세 자리에서 길이가 다르다.
- 헤더 메가메뉴 **18개**: HVAC · Plumbing · Electrical · Roofing · Landscaping · Lawn Care · Pool Service · Pest Control · **Painting** · Tree Care · Junk Removal · Handyman · Cleaning · Commercial Cleaning · Remodeling & Renovations · Pressure Washing · Window Cleaning · Construction & Contracting
- 홈 그리드 **12개**(위에서 6개 누락)
- 푸터 **14개** + `More...`

Product 메가메뉴도 18개 기능 링크(Quoting · Invoicing · Payments · Online Bookings · Scheduling · Field Documentation · Client Management · Client Hub · Job Management · Sales Pipeline · Team Management · Client Communication · AI Tools · Receptionist · Marketing Tools · Jobber Plus^New · Integrations · See All Features)로 대칭을 이룬다.
**기능 축과 업종 축을 같은 깊이(18/18)로 병렬 배치**한 게 이 내비의 뼈대다.

## 배울 것

우리 제품(도장업체 SaaS)과 같은 장르라, "현장 업자에게 소프트웨어를 파는 문법"에 초점을 맞춰 정리한다.

1. **브랜드 물성을 토큰 이름에 박아라.** `--brand-tape-100: #e5deb3`, `--color-manila-100`, `spackle-on-dark.webp`, `rip.svg`. 마스킹테이프·마닐라 봉투·벽 메움재·찢은 종이 — 전부 현장에서 쓰는 재료다. 은유가 CSS 변수 층에 있으면 페이지를 누가 만들어도 톤이 안 흔들린다. 도장업체라면 **페인터스 테이프·드롭클로스·색상칩·롤러 자국**이 같은 위치를 차지할 수 있다.

2. **종이 질감은 500×500 타일 1장 + `background-blend-mode`로 끝낸다.** 밴드에 플랫 색을 깔고 그 위에 텍스처를 `repeat`시킨 뒤 어두운 밴드는 `lighten`, 밝은 밴드는 `darken`으로 섞는다. 오버레이 div도, 의사요소도, `opacity` 레이어도 필요 없다. 이미지 2장(합계 169KB)으로 전 페이지가 종이가 된다.

3. **밴드 전환은 배경이 아니라 `mask-image`로.** `rip.svg`(`viewBox="0 0 1440 26"`, `preserveAspectRatio="none"`)로 밴드 요소 자체를 마스킹하면 자산 하나로 위·아래 양방향이 다 처리된다. **진폭은 26px로 얕게** — 요란한 절단이 아니라 "두꺼운 종이를 손으로 뜯은 결"이어야 한다. 그리고 **4번 쓰고 푸터에서 한 번은 안 쓴다.** 전부 찢으면 장치가 아니라 배경이 된다.

4. **통계 배너(LA2 🔴)를 재료로 죽인다.** 수치를 마스킹테이프 조각 위에 올려라. 인라인 SVG(`viewBox="0 0 116 32"`, `fill: currentColor`, `preserveAspectRatio="none"`)를 글자 폭만큼 늘리고 그 위에 `z-index:1` span(padding `8px 24px`)에 `JobberPro 24/32 900`을 얹는다. **삐뚤함은 CSS `transform`이 아니라 path에 내장**시켜야 4장이 같은 자산인데도 다 다르게 보인다. plai.io는 같은 티를 "로고 6개를 붙여서" 죽였고, Jobber는 "테이프로 붙여서" 죽였다.

5. **디스플레이 배율을 3.1×로 묶어라 (h1 50px / 본문 16px).** 랜딩 평균의 절반이다. 대신 ①웨이트를 700이 아니라 **900**으로 올리고 ②행간을 1.12(디스플레이)에서 1.71(캡션)까지 단조 램프로 벌린다. 트럭에서 폰으로 일하는 사람에게 필요한 건 큰 글씨가 아니라 **읽히는 글씨**다. 배율로 못 만든 임팩트를 웨이트와 행간 대비로 만든다.

6. **행간 값을 전부 8의 배수로 고정한다** — 56 / 48 / 40 / 32 / 24. 그리고 크기 토큰과 행간 토큰을 **항상 쌍으로 선언**한다(`--font-size-heading-lg` + `--line-height-heading-lg`). 크기만 토큰화하고 행간은 알아서 하게 두면 8단 스케일이 8가지 리듬으로 흩어진다.

7. **신뢰 장치를 G2가 아니라 앱스토어 별점으로 연다.** 히어로 CTA 바로 아래에 App Store `4.8 / 13,861 reviews` + Google Play `4.5 / 4,883 reviews`. 금색 실물 별(반쪽 별 포함)에 각 스토어 아이콘을 그대로. **이 사람들은 데스크톱 리뷰 사이트를 안 본다.** 현장 소프트웨어의 사회적 증거 단위는 앱스토어다.

8. **히어로 우측에 제품 스크린샷 대신 고객 얼굴을 흘려라.** 2열 세로 마퀴, 51px/s, 사진 8장을 4벌 복제해 무한 루프. 각 사진에 **얇은 흰 세로 룰 + 이름 / 실제 상호**. `Kroopin's Poopin Scoopin` 같은 상호도 그대로 쓴다 — 다듬는 순간 가짜가 된다. 사진은 흙·먼지·단열재·안전조끼가 있는 진짜 현장이어야 하고, radius 0으로.

9. **B2B인데 사회적 증거의 단위를 회사가 아니라 사람으로.** 고객사 로고 벽이 **한 줄도 없다.** 그 자리를 개인 업자 얼굴 26장 + 앱스토어 별점 + 실명 인용으로 채웠다. 상대가 3인 업체 사장이면 포춘 500 로고는 오히려 "내 얘기가 아니다"가 된다.

10. **업종 분기를 3중으로 깔고, 기능 축과 같은 깊이로 병렬 배치한다.** 헤더 메가메뉴 업종 18 : 기능 18로 대칭. 홈 그리드 12장, 푸터 14개, 전부 `/industries/<trade>-software/`. **푸터에서는 업종 열을 첫 번째이자 가장 길게** 둔다. 카드는 324×96에 **그 업종의 실제 연장 아이콘**(도장=페인트 롤러, 배관=플런저, 조경=모종삽+삽)을 좌상단에, 라벨을 아래에. 동일 카드 12장 나열은 LA1 🔴이지만 방문자가 자기 업종을 **찾는** 자리라 성립한다.

11. **버튼은 형태 1벌 × 색 역할 3벌.** `radius: 4px` / `border: 3px solid` / `jobberPro 900` / `padding: 13px 29px`를 고정하고 색만 바꾼다 — ①라임 채움 + 네이비 글자 ②투명 + 라임 테두리 + 라임 글자(**채움 버튼에서 `background`만 뺀 동일 박스**) ③네이비 채움 + **라임 글자**. 3px 보더가 항상 있어서 고스트와 채움의 크기가 1px도 안 어긋난다.

12. **이메일 캡처를 최종 CTA 자리에 인라인으로 박는다.** 입력 + 버튼을 **라임 테두리 하나로 묶고** 라디우스를 `4px 0 0 4px` / `0 4px 4px 0`로 갈라 한 덩어리로 만든다. 바로 아래 `No credit card required.` 한 줄. 같은 폼을 페이지에 2번 쓰되 플레이스홀더를 `Email Address` → `Work Email`로 바꿔 중복감을 지운다. 별도 가입 페이지로 보내는 것보다 마찰이 한 단계 적다.

13. **내비 호버 = 색 변경 + 손그림 밑줄.** `underline-shallow.svg`(`viewBox="0 0 63 3"`, `stroke: #84EA00`, `stroke-width: 2`, `linecap: round`)를 `background-image`로 붙인다. 색만 바꾸는 호버보다 훨씬 싸고 브랜드가 남는다. **이 페이지에서 가장 잘 만든 마이크로 디테일.**

14. **단어 강조는 액센트색이 아니라 배경에서 한 단계만 벗어난 톤으로.** 강조 SVG(`viewBox="0 0 445 18"`, `fill: currentColor`, `absolute; bottom: -8px`, 높이 10px, 단어 폭만큼 stretch)를 네이비 위에서는 `#345461`, 베이지 위에서는 `#c2c0bb`로. 라임을 여기 쓰면 CTA와 경쟁한다. 액센트색은 **클릭할 것에만** 쓴다(실측: 라임을 글자색으로 쓴 게 페이지 전체에 3번).

15. **그림자를 전부 버리고 색 밴드로 깊이를 만든다.** 페이지 전체 `box-shadow` **1개**. 카드는 `beige-300 @70%` 채움 + 보더 0이고, 인용 카드만 밴드보다 한 단계 진한 `#01212e`로 눌러 앉힌다. 종이 질감이 있는 화면에서 그림자는 은유를 깨뜨린다 — 종이는 떠 있지 않고 겹쳐 있다.

16. **제품 화면 대신 "고객의 결과 화면"을 보여준다.** 첫 기능 패널의 스크린샷은 Jobber 관리자 UI가 아니라 Jobber가 만들어준 `Lawncare Inc.`의 공개 예약 페이지다. 그 위에 흰 카드로 `Website requests 32 ↑22%` / `Google rating 4.8` / `Client Referrals 56 ↑13%`를 띄운다. **파는 건 소프트웨어가 아니라 그 사람 사업의 결과**라는 걸 자산 한 장이 말한다.

17. **UI 스크린샷을 찢어 붙여라.** AI 섹션은 깨끗한 스크린샷을 안 쓴다 — 찢은 종이 조각 위에 UI 파편을 올리고, 그 사이를 **검은 손그림 마커 화살표**가 잇고, 라임 스파클 획이 튄다. 화면 안에는 실제 데이터(`Jasmine Williams`, `New high value quote just came in`)를 넣는다. 완제품 목업보다 "작업 중인 노트"처럼 읽힌다.

18. **헤더에 전화번호를 박는다.** `1-888-721-1115`, 전화 아이콘 + 숫자, 라임 CTA 바로 왼쪽. 셀프서브 SaaS 헤더에는 없는 요소지만 현장 업자에게 **"전화를 받는 회사인가"는 신뢰 조건**이다. 푸터에도 다시 넣고 이메일 주소까지 노출한다.

19. **고정 내비를 가능한 한 단순하게.** `position: sticky; top: 0` + 이미 불투명한 배경. 스크롤 6지점에서 실측했는데 **배경·그림자·높이·표시 상태가 하나도 안 변한다.** 반투명 헤더를 쓰면 반드시 따라오는 "스크롤 임계값 넘으면 배경 채우고 그림자 넣기" 로직이 통째로 사라진다. 위 40px 공지 바만 흘러나가게 두면 된다.

20. **스크롤 리빌을 0개로 두는 선택.** 정지 상태 숨김 요소가 하나도 없다. 페이드인 애니메이션은 빠른 스크롤·JS 실패·리듀스드모션에서 전부 실패 모드를 만드는데, 안 쓰면 그 실패 모드가 없다. `--transition-speed: 0.25s` 단일 토큰을 **호버에만** 쓰고, 유일한 지속 모션인 히어로 마퀴는 `prefers-reduced-motion`에서 완전히 멈춘다(실측 이동량 0px). **리빌이 0이라 리듀스드모션에서 잃는 정보도 0이다.**

21. **앱스토어 배지를 푸터에, 소셜에 TikTok을 넣는다.** 현장 인력은 모바일 앱으로 일하고 TikTok으로 동종업 정보를 얻는다. 소셜 아이콘 세트가 대상 독자를 드러낸다.

22. **`Hey AI, learn about us` 링크를 푸터 Company 열에.** AI 크롤러/답변 엔진용 진입점을 사람 대상 사이트맵과 같은 자리에 노출한다.

## 버릴 것

- **업종 카드 12개 호버 전멸.** `transition: .25s ease-in-out`이 선언돼 있는데 호버 규칙이 없다. 324×96짜리 링크 12개가 페이지의 핵심 분기 UI인데 마우스에 아무 반응이 없다. `See All Industries →`, 리소스 카드의 `Learn more →`도 같다. 죽은 호버가 하필 **전환 경로**에 몰려 있다.

- **탭 활성 상태가 3px 테두리 하나뿐.** 활성/비활성 둘 다 배경 `#dad8d3 @70%`, 글자색 `#012939` 동일. 차이는 `border-color: transparent → #012939`뿐이다. **그런데 비활성 탭의 호버 변화도 정확히 같은 값**이라 "지금 보고 있는 탭"과 "마우스가 얹힌 탭"이 구분되지 않는다.

- **토큰 체계 2벌 병존.** `--color-navy-*`와 `--brand-primary-*`, `--color-green-*`와 `--brand-accent-*`, `--color-beige-*`와 `--brand-secondary-*`, `--color-grey-*`와 `--brand-grey-*`가 **값까지 완전히 같다.** 118개 중 거의 절반이 별칭이다. 마이그레이션 중간 상태를 그대로 배포했다. 구현자가 어느 쪽을 써야 할지 알 수 없다.

- **`--color-grey-300: #9999`.** 4자리 hex는 `#RRGGBBAA`가 아니라 `#RGBA`로 파싱돼 60% 알파 회색이 된다. `--brand-grey-300`도 같은 값. 나머지 grey는 전부 6자리(`#f3f3f3`·`#b9b9b9`·`#787878`)라 오타가 거의 확실하다.

- **토큰에 없는 라임이 인터랙션에 등장한다.** 정지 라임은 `#a8e300`인데 내비 호버 색과 손그림 밑줄 stroke는 **`#84EA00`**이다. CSS 변수 118개 어디에도 없는 값이라 SVG 파일 안에 하드코딩돼 있다.

- **같은 라임 버튼이 호버 방향을 반대로 간다.** 헤더 CTA `#a8e300 → #b9e933`(밝아짐), 히어로 CTA `#a8e300 → #86b600`(어두워짐). 문구도 목적지도 같은 `Start Free Trial`인데 호버 언어가 둘이다. plai.io와 똑같은 실수다.

- **헤더 CTA만 웨이트가 다르다.** 본문 CTA는 `jobberPro 900`, 헤더는 `700`. 게다가 헤더 CTA만 3px 보더가 없다. 같은 컴포넌트가 아니라 따로 만든 것.

- **고스트 버튼 호버가 대비를 깎는다.** `Find Your Plan`이 글자 `#a8e300 → #588a1b`로 어두워지는 동안 배경에 `rgba(168,227,0,.48)`가 깔린다. 어두워진 글자와 밝아진 배경이 겹쳐 **호버 순간 대비가 정지 상태보다 나빠진다.** 채움 버튼처럼 배경만 채우거나 글자를 네이비로 뒤집었어야 한다.

- **15px 하나를 위해 스케일이 한 단 늘었다.** 업종 카드 라벨만 `Inter 15/24 500`이다. 14와 16이 이미 있는데 그 사이에 15를 끼워 8단을 만들었다(TS2 🟡의 정체). 실질 위계는 14 / 16 / 24 / 40 네 단이다.

- **업종 URL 슬러그가 제각각.** `-business-software`(cleaning) / `-management-software`(construction) / `-contractor-software`(electrical, painting) / `-invoice-software`(handyman) / `-software`(plumbing, roofing…) / 그냥 `/hvac/`. 게다가 **`Construction & Contracting`이 위치에 따라 다른 URL로 간다** — 홈 그리드는 `/industries/construction-management-software/`, 헤더 메뉴는 `/industries/general-contracting/`.

- **업종 목록 길이가 자리마다 다르다.** 내비 18 / 홈 그리드 12 / 푸터 14. 홈 그리드에만 없는 업종(Junk Removal · Window Cleaning · Commercial Cleaning · Remodeling & Renovations 등)이 있어서, 자기 업종을 홈에서 못 찾은 방문자가 이탈한다. `See All Industries →`가 그걸 다 받아내지 못한다.

- **`yours` 손그림 밑줄이 사실상 안 보인다.** `#c2c0bb`를 `#f2f0ea` 위에 10px로 깔았는데 대비가 너무 낮아 렌더링에서 얼룩처럼 읽힌다. 같은 컴포넌트가 네이비 위 `400,000`에서는 잘 보인다 — **밝은 배경 쪽 대비를 따로 잡지 않은 것.**

- **로드만 하고 안 쓰는 폰트 2벌.** `handwritten`(200/400/800 — 3파일)과 `stencil`(400) `@font-face`가 선언돼 있는데 홈에서 실제 렌더되는 건 Inter와 JobberPro뿐이다. 손글씨·스텐실이라는 좋은 재료를 선언만 해놓고 안 썼다.

- **히어로 마퀴 사진을 4벌 복제.** 8장을 각 4벌씩 DOM에 심어 이미지 59개 중 32개만 고유하다. 무한 루프 구현 방식이지만 보통 2벌이면 충분하다. `width`/`height` 미지정 이미지 2개(QF6 🟡)도 여기서 나온다.

- **`transition: all` 36건.** 정리되지 않은 채 남아 있고, 업종 카드가 그 예다 — `all`인데 호버 규칙이 없다.

- **헤드라인 문자열에 이모지.** 공지 바 `...coming in September. 🔥`. 페이지가 손그림 SVG를 이렇게 잘 쓰면서 정작 상단 첫 줄에 OS 기본 이모지를 박았다.

- **Inter 단독 본문 스택**(TS3 🟡). 배울 건 폰트 선택이 아니라 **커스텀 디스플레이(JobberPro 900) 하나만 만들고 본문은 Inter로 두는 배분**이다. 예산이 한 벌뿐이면 제목에 쓴다.
