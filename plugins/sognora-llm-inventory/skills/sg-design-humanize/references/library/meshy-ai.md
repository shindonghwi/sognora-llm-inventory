# meshy.ai 분석

장르/단위: AI 3D 생성 도구 / 랜딩 · 분석일 2026-08-15 · 상태: **완전**

## 수치 (1440×900 실측)

- 폰트 **18단**: 10/11/12/13/14/15/16/18/20/24/28/40/48/58/60/68/80/**100** — 디스플레이 배율 **6.25×**(본문 16 → 최종 CTA 100)
- 서체 **Barlow 단독**(측정 요소 183개 중 180개). 로드된 패밀리는 7종(Inter·Karma·Inter Tight·Figtree·League Gothic·Barlow·Barlow Semi Condensed)인데 이 라우트에서 실제로 쓰인 건 Barlow뿐 — 나머지는 죽은 로드
- 잉크 밀도(뷰포트 12구간 자체 측정) 중앙값 **49%**, 범위 **17–74%** — 성긴 검정 구간(17·21·23·25%)과 꽉 찬 채색 밴드(63·71·74%)가 번갈아 온다. 균질하지 않은 게 요점
- 컨테이너 **1200px 단일**(1440에서 좌우 여백 120px, 관측 54회). 갤러리·푸터·색 밴드만 풀블리드
- 고유 자산: 이미지 태그 207개 중 **고유 URL 109개**(정보성 72 + 장식 37) + canvas 2 + iframe 1 + **video 0**
- 티 프로필: 🔴 TS1(폰트 18단)·CO1(hue 240–290 보라 그라데이션)·CO5(background-clip 그라데이션 텍스트)·IC1 🟡 CO2(그라데이션 배경 115곳)·LA4(카드 속 카드)·QF4·QF6(w/h 미지정 83장)·AS1·IC3·MO1(infinite 애니 7곳)
- **티가 8개 잡히는데 싸구려로 안 읽힌다.** 이유는 자산: 화면에 있는 3D는 전부 이 제품이 실제로 만든 산출물이라, 그라데이션이 장식이 아니라 산출물의 배경 역할만 한다

## 실측 토큰 (measure.json + computed style 근거)

**주 CTA — 어두운 면 위 (히어로·최종)**
```
bg-image  linear-gradient(155.056deg, #AAFFCA 0%, #BAFF4A 50%, #AAFFCA 100%)
          → animation: cta-flow 5s ease-in-out infinite (양끝 같은 색 = 무한 스윕)
color     #000 / font Barlow 16px/24px · radius 20px
size      217×55 (pad 0 40px, 화살표 없음) · 264×55 (pad 0 25px 0 30px, 화살표 포함)
hover     boxShadow none → 글로우 부여 (스케일·투명도 변화 없음)
```

**주 CTA — 채색 밴드 위 (반전형)**
```
bg-image  linear-gradient(90deg, #000 0%, #3A3A3A 50%, #000 100%)
          → animation: ctaSurfaceFlow 11s linear infinite
size      269×60 · radius 20px · pad 0
color     밴드 액센트를 그대로 라벨색으로: 3D Printing 밴드 #C6FF4A ·
          Creative Labs 카드 #00FFC3 · Game Dev 밴드 #AF89F8 (border-color도 동일)
```

**네비 CTA (Sign Up Free)**
```
bg #C5F955 · color #000 · Barlow 14px/20px 700 · pad 0 16px · radius 10px · 112×32
hover bg #C5F955 → #A8E328 (색만 어두워짐)
```

**카드 (채색 밴드 위 유리)**
```
bg        rgba(255,255,255,0.7)
backdrop  blur(20px) saturate(2.2)   ← 밴드 색이 채도 2.2배로 비쳐 올라와 민트/라벤더로 읽힘
radius    30px · border 0 · shadow none · pad 0
size      593×443 (2열) / 390×460 (3열) / 1200×257·1200×150 (와이드)
```

**h1 / 디스플레이**
```
h1   Barlow 80px/88px 500 · ls -3.2px(-0.04em) · #fff · 780px 2줄
     2행만 background-clip 그라데이션: #8BFFFF(좌) → #CEFFA8(우)
디스플레이 스케일 = weight 500 + ls -0.04em + lh 1.1 고정
     80(h1) / 60(밴드 제목) / 68(커뮤니티) / 100(최종 CTA, ls -4px)
섹션 제목 스케일 = weight 600 + ls normal + lh 1.1 → 40px 전용
     (두 스케일이 겹치지 않는다: 40px는 절대 -ls를 안 쓴다)
```

**본문**
```
리드    Barlow 20px/28px 400 · rgba(255,255,255,0.7)
부제    Barlow 20px/24px 400 · rgba(255,255,255,0.5)
카드본문 Barlow 18px/25.2px 400 · rgba(255,255,255,0.5)
아이브로우 Barlow 18px/21.6px 600 · rgba(255,255,255,0.5)
푸터 열제목 Barlow 14px/16.8px 500 · rgba(0,0,0,0.5) + tracking
통계 수치 Barlow 58px/69.6px 500 · color transparent
        → background-clip 그라데이션 #FFA976→#FFB071, trustStatsGradientFlow 2.86s linear infinite
```

**베이스**
```
페이지 bg #0E0E0E (html/body는 #181818) · 기본 텍스트 #DEDEDE
radius 분포: 8px 120회 / 0px 36 / 30px 8 / 10px 7 / full 7 / 12px 4
  → 8px는 내부 소품, 30px는 섹션급 카드, 20px는 CTA. 값이 역할별로 갈린다
고정 앰비언트: position:fixed 1500×1500 원 2개,
  radial-gradient(circle closest-side, #253A00 0%, #0C1600 60%, #0E0E0E 100%)
  z-index -10 — 스크롤과 무관하게 화면 중앙에 붙어 있는 올리브 글로우
```

## 구조 (풀페이지 + 뷰포트 12컷 직접 관찰)

fullPage 캡처에서 4000–6500px 구간이 통째로 검게 비었다. 뷰포트를 한 칸씩 내리며 다시 찍으니 채워졌다 — **스크롤 도달 전에는 마운트조차 안 되는 구조**다.

1. **스티키 헤더** 56px — 로고(컬러 메시 마크 + 라임 워드마크) 좌 / 7항목 중앙(Features·Solutions·Community·Resources·Creative Lab·API·Pricing, 드롭다운 4개) / Contact Sales·Log In·Sign Up Free·언어 우. 헤더 자체는 bg 투명 + backdrop-filter none, **뒤에 별도 검정 스크림(≈70%)**이 깔려 밴드 색을 어둡게 물들인다(라임 위 #3F511B, 라벤더 위 #453A51, 히어로 위 #081421)
2. **히어로** — 좌 텍스트 780px / 우 3D. 좌: 알림 필(New 뱃지 + "Meshy 7 is live"), h1 80px 2줄(2행 그라데이션), 리드 20px, 라임 CTA. 우: **바로크 대리석 조각 실산출물 1점**이 초록 와이어프레임 격자 바닥 위에. 좌우에 다음/이전 모델이 흐릿하게 걸쳐 있고 하단에 점 3개(가운데만 알약형) — 3점 캐러셀
3. **로고 마퀴 + 평점** — Meta·Supercell·FLASHFORGE·ELEGOO·FUNPLUS·SQUARE ENIX·PICO·Stanford 모노 로고가 `banner-sweep 6s linear infinite`로 흐른다. 바로 밑에 G2 4.8 / TrustPilot 4.8을 작게 인라인
4. **Image to 3D / Text to 3D 탭** + 기능 카드 1200×630 — 좌 1/3에 h2 40px(ls -1.2px) + 본문 + "Learn more →" + 라임 CTA, 우 2/3에 **맥 브라우저 크롬을 씌운 제품 스크린샷**(주소창 meshy.ai/workspace). 스크린샷 안에서 가짜 커서가 `featureCursorNudge 1.8s`로 업로드 존을 계속 가리키고, 결과 흉상이 우측에 렌더돼 있다
5. **AI Agent** — 아이브로우 "AI AGENT"(로고 마크 + 18px 600 반투명), h2 40px 600 "Meshy can help you create **Miniatures**" 뒷단어가 시안 그라데이션 + `caretBlink 1.1s` 타이프라이터, 부제 2줄. 아래 1200×630 dot-grid 카드가 **실제 에이전트 대화를 재생**한다: 좌열에 2D 콘셉트아트가 붙은 사용자 말풍선(프롬프트가 라임색) → 어시스턴트 답변 2개 → 입력창 타이핑, 우열에 결과 3D 모델이 "3D Model" 칩과 함께 뜬다
6. **핀 고정 색 밴드 A — 3D Printing (라임)**
   - 배경: `radial-gradient(130% 100% at 25% 0%, #CAFF58 0%, #C3FF79 48%, #89FFD4 100%)` + 도트 텍스처. 100vh 레이어를 `transition-opacity`로 깔았다
   - 상단 세그먼트 필(150×40, radius 12, 18px/19.8 500)이 **헤더 밑에 sticky로 붙어 따라온다**. 활성=흰 알약+검정, 비활성=투명+검정 50%
   - h2 60px 검정(ls -2.4px) + 부제 + **검정 CTA(라벨만 라임)**
   - 유리 카드 2장(593×443): 좌 "Born Printable, Not Patched" — 손상/복구 **대각선 와이프 비교** + 떠 있는 검정 HUD(Watertight Yes / Volume 702.19cm³ / Holes 0 / Non-manifold edges 0) + 이미지-텍스트 경계에 걸친 흰 "AI Auto-Repair" 필. 우 "Print in Multi-Color, or Split to Fit" — 골격 크리처 + "Auto Split" 토글 칩
   - 와이드 카드(1200×150): "Straight to Your Slicer" + **실제 슬라이서 앱 아이콘 8종 풀컬러**(Bambu·Creality·OrcaSlicer·Cura·Snapmaker·Flash·Elegoo·Lychee) + 메타 스트립(Formats 3MF·STL·OBJ / FDM+Resin / Publish to ✓MakerWorld ✓Printables ✓Thingiverse)
   - CTA 카드: "No printer?" 40px + 검정 CTA(라벨 민트 #00FFC3). 좌엔 실제 반려동물 사진 폴라로이드 3장, 우엔 **출력된 실물 사진**(펜던트를 단 개) 카드 밖으로 블리드
7. **핀 고정 색 밴드 B — Game Dev (라벤더)** — 같은 골격, 배경만 #BC91FF→#9891FF로 크로스페이드. 탭을 누르지 않아도 **스크롤만으로 A→B가 넘어간다**(전환 중 h2가 겹쳐 보인다)
   - h2 60px + 검정 CTA(라벨 #AF89F8)
   - 유리 카드 3장(390×460): 각 카드 이미지 우하단에 상태 칩("Metalness"·"Running"), 3번 카드는 **드래그 핸들 달린 전/후 슬라이더**(무텍스처 로우폴리 ↔ 텍스처)
   - 칩 줄: "Compatible with [Unity][Unreal][Godot][Blender][Maya]" + "Export formats [FBX][GLB][OBJ][USDZ]"
   - "Other Use Cases ›" + 5칩(Interior design·Industrial Design·VR/AR·Education·Film & VFX), 좌→우로 밝기가 단계적으로 올라간다
8. **통계 밴드** (검정 복귀) — h2 40px 600 + 헤어라인 + 3열 100M+/12M+/10M+ 58px 피치 그라데이션 + 회색 라벨
9. **후기 캐러셀** — 배경에 흐릿한 자주 글로우(#1D0814대). 3D 캐릭터 렌더를 **아바타로** 쓴다. 이름 18px + 직함 회색 + 인용 40px 5줄 + "Read Full Story →" 작은 어두운 필 + 원형 이전/다음(35px, bg 흰색 5%, full radius)
10. **커뮤니티 갤러리** — h2 68px + 라임 CTA. 아래로 **풀블리드 마퀴 2줄 이상**(`showcaseMarquee 96.67s linear infinite`, 줄마다 반대 방향, 양끝 카드가 잘려 나감). 카드 bg #202020, 렌더 아래 메타바 #151515에 조회수(눈)·아바타·아이디·좋아요·별. 갑옷·왕관·낫·오크·얼굴 머그·성배·눈알·흉상·가면·허수아비·고사리·그라피티 로봇손·부츠·물약병·핼러윈 머그·광선총 — **장르가 하나도 안 겹친다**
11. **최종 CTA** — 갤러리 밑에서 히어로의 평평한 격자가 **초록 와이어프레임 지형**으로 되살아나며 화면을 채운다. h2 100px/110 400(ls -4px) "Start Creating in 3D" + 회색 부제 + 라임 CTA
12. **푸터** 1440×861 · bg #C5F955 · **radius 30px 30px 0 0** — 하단은 지름 1440px 시안 원(#95F4FF)이 비쳐 #9DF5E2 민트로 빠진다. 7열(FEATURES·LEARN·PROGRAMS·TOOLS·PLUGINS·USE CASES·COMPARE). COMPARE 열이 "Meshy vs. Tripo / Trellis 2 / Hunyuan3D". 좌하단에 ISO 27001·SOC 2·GDPR 배지 3개 + 평점 재게시 + 소셜 6개 + **"Ask AI about Meshy" 원형 AI 서비스 아이콘 6개**. 최하단 바에 저작권·법무 링크·언어 셀렉터

## 자산 운용

**섹션당 자산 1점이 아니라, 섹션마다 자산의 종류를 바꾼다.** 히어로=단품 조각 렌더, 4번=브라우저 크롬 씌운 제품 스크린샷, 5번=재생되는 대화 로그, 6번=비교 와이프 + 물성 HUD + 실물 사진, 7번=상태 칩 붙은 렌더 + 드래그 슬라이더, 10번=사용자 산출물 마퀴. 같은 표현이 두 번 안 나온다.

산출물 갤러리는 "예쁜 것 6개 골라 그리드"가 아니라 **장르가 최대한 안 겹치게 고른 수십 개를 무한 마퀴로** 흘린다. 재사용된 이미지는 화살표 아이콘(×8)과 후기 아바타(×4~6)뿐 — 콘텐츠 자산은 전부 고유.

video 태그 0개. 움직이는 건 전부 CSS 애니메이션·canvas(2개)·이미지 시퀀스다.

## 인터랙션

**호버 표** (probe 표본 14, 무반응 4)

| 대상 | 변화 | 값 |
|---|---|---|
| 네비 텍스트(Features·API·Community…) | bg만 | `transparent → rgba(255,255,255,0.05)` |
| Contact Sales · Log In | bg만 | 동일 |
| Sign Up Free (라임) | bg 색상 | `#C5F955 → #A8E328` |
| 아이콘 버튼 | color + bg | `#DEDEDE → #fff` + 흰색 5% |
| 알림 필 | border만 | `흰색 10% → 20%` |
| 히어로 CTA | box-shadow | `none → 글로우` |
| 로고 · 3D 캐러셀 모델 | **무반응** | 클릭 가능한데 호버 피드백 없음 |

호버 어휘가 **흰색 5% 배경 하나로 통일**돼 있다. transform·scale·translate를 쓰는 호버가 하나도 없다.

**스크롤 리빌** — probe의 자동 판정은 0/12로 잡혔지만, fullPage 캡처가 4000–6500px를 통째로 비워낸 것이 증거다. 도달 전 미마운트 + 도달 시 마운트.

**모션 언어**
- 인터랙션 전이: **0.15s ×110 · 0.1s ×77 · 0.3s ×16 · 0.2s ×13** → 0.15s가 사실상 기본값
- 이징: `cubic-bezier(0.4, 0, 0.2, 1)` ×118이 지배
- **`transition: all` 사용 0회.** 전이 속성을 background-color·color·border-color·outline-color·fill·stroke·--tw-gradient-from로 열거
- 앰비언트 루프 **12종, 전부 infinite**: cta-flow 5s / ctaSurfaceFlow 11s / creativeLabBorderSpin 7s / flowBorderSpinAngle 7s / banner-sweep 6s / showcaseMarquee 96.67s / trustStatsGradientFlow 2.86s / gradientFlow 2s / arrow-nudge 1.2s / caretBlink 1.1s / featureCursorNudge 1.8s / design4-upload-flow-x 2.5s
- **응답(0.1–0.3s)과 분위기(1.1–96.7s)의 시간대가 완전히 갈린다.** 겹치는 값이 없다

**고정 요소** — `header sticky top-0 z-50` 56px, `sticky top-0 h-screen` 배경 레이어(밴드 크로스페이드용), `position:fixed -z-10` 앰비언트 글로우 2개, 밴드 안 세그먼트 필 sticky. **화면에 고정되는 것이 4종류인데 서로 층이 안 겹친다.**

## 배울 것

1. **디스플레이 스케일과 섹션 제목 스케일을 겹치지 않게 분리한다.** 디스플레이는 weight 500 + `ls -0.04em` + lh 1.1(80/60/68/100), 섹션 제목은 weight 600 + `ls normal` + lh 1.1(40). 40px에는 절대 음수 자간을 안 준다 — 크기가 아니라 **자간 부호가 역할을 나눈다**
2. **자간을 크기에 비례시킨다.** 80→-3.2 / 60→-2.4 / 68→-2.72 / 100→-4, 전부 정확히 -0.04em. 큰 글자에만 눈대중으로 -1px 주는 것과 결과가 다르다
3. **CTA 라벨색으로 섹션을 표시한다.** 채색 밴드 위 CTA는 면(`linear-gradient(90deg,#000,#3A3A3A,#000)` 269×60)을 고정하고 **라벨·보더 색만 밴드 액센트로 교체**(#C6FF4A / #00FFC3 / #AF89F8). 버튼을 새로 디자인하지 않고 밴드에 소속시킨다
4. **CTA 그라데이션은 양끝을 같은 색으로 둔다.** `155.056deg, #AAFFCA 0%, #BAFF4A 50%, #AAFFCA 100%` — 이래야 `cta-flow 5s infinite`로 끊김 없이 스윕된다. 3스톱 대칭이 무한 루프의 전제
5. **채색 밴드 위 카드는 흰색 70% + `backdrop-filter: blur(20px) saturate(2.2)`.** 채도 2.2배가 핵심 — 밴드 색이 카드를 통과해 올라오면서 라임 위에선 민트, 라벤더 위에선 연보라로 카드가 알아서 물든다. 카드 색을 밴드마다 따로 안 만들어도 된다
6. **호버 어휘를 하나로 통일한다.** 흰색 5% 배경 + 0.15s + `cubic-bezier(0.4,0,0.2,1)`. transform·scale 호버 0회, `transition: all` 0회(속성 7개 열거). 요소마다 다른 호버를 발명하는 것보다 이쪽이 비싸 보인다
7. **응답 시간과 분위기 시간을 분리한다.** 전이는 0.1–0.3s, 앰비언트 루프는 1.1–96.7s. 겹치는 값이 없어서 "반응했다"와 "살아있다"가 서로를 안 방해한다
8. **밀도를 일부러 요동치게 만든다.** 뷰포트별 잉크 밀도 17/21/23/25% ↔ 63/71/74%. 검정 여백 구간과 꽉 찬 채색 밴드를 번갈아 배치하면 균질한 45%짜리 페이지보다 길이가 짧게 느껴진다
9. **제품 스크린샷 위에 가짜 커서를 얹어 계속 움직인다**(`featureCursorNudge 1.8s`). 정지 스크린샷이 "어디를 보라"고 지시하는 방법. 영상보다 싸고 반복 재생이 자연스럽다
10. **에이전트/챗 기능은 대화 로그를 재생해서 보여준다.** 콘셉트아트 첨부 → 프롬프트 → 응답 2개 → 결과 3D가 우측에 등장까지 전체를 자동 재생. 기능 설명 문장 3줄보다 이해가 빠르다
11. **섹션마다 자산의 종류를 바꾼다.** 렌더 / 브라우저 크롬 스크린샷 / 대화 로그 / 비교 와이프 / 실물 사진 / 사용자 마퀴 — 같은 표현을 두 번 안 쓴다. 이게 "티가 8개인데 프리미엄으로 읽히는" 실제 원인
12. **산출물 갤러리는 큐레이션이 아니라 범위 증명으로 쓴다.** 장르가 겹치지 않는 수십 개(갑옷·머그·고사리·광선총·성배…)를 96초 마퀴로 흘리고 카드마다 조회수·좋아요·제작자를 붙인다. "잘 만든 6개"보다 "뭐든 만들어진다"가 이 제품의 주장이라서 맞는 선택
13. **정합성 신호를 물성 수치로 준다.** Watertight Yes / Volume 702.19cm³ / Holes 0 / Non-manifold edges 0 — 형용사 대신 검증 가능한 숫자. 뱃지·별점보다 강하다
14. **호환성을 로고 대신 실제 앱 아이콘 풀컬러로.** 슬라이서 8종 + 엔진 5종 + 포맷 4종을 칩으로 나열. 모노 실루엣으로 통일하는 것보다 "진짜 그 앱"으로 읽힌다
15. **탭을 스크롤에 물린다.** 세그먼트 필을 헤더 밑에 sticky로 붙이고, 100vh 배경 레이어 2장을 opacity로 크로스페이드하면 클릭 없이 스크롤만으로 밴드가 넘어간다. 탭 = 클릭 대상이자 현재 위치 표시기
16. **페이지 시작과 끝을 같은 모티프로 묶는다.** 히어로의 평평한 초록 격자가 최종 CTA에서 굽이치는 지형으로 돌아온다 — 장르(3D 메시)를 배경 자체가 말한다
17. **푸터에 "Ask AI about Meshy" + AI 서비스 아이콘 6개.** 2026년 GEO 패턴. 비교 페이지 열(Meshy vs. Tripo/Trellis 2/Hunyuan3D)도 같은 목적
18. **radius를 역할별로 쓴다.** 8px 내부 소품(120회) / 10px 네비 버튼 / 12px 탭·칩 / 20px CTA / 30px 섹션급 카드·푸터. 단일값 지배(LA3)를 피하는 실전 예

## 버릴 것

- **폰트 18단 + 죽은 폰트 6종 로드**(Inter·Karma·Inter Tight·Figtree·League Gothic·Barlow Semi Condensed가 로드되는데 쓰이는 건 Barlow뿐). 스케일은 8–10단으로 줄이고, 안 쓰는 패밀리는 라우트에서 빼야 한다
- **`width`/`height` 미지정 이미지 83장** — 이 페이지 자산 비중이면 CLS가 그대로 비용이다
- **본문 타이포 하한 미달 10곳**(12px 미만 또는 행간 1.3 미만). 카드 본문 `14px/16.8px`(lh 1.2)는 3줄 이상에서 읽기 힘들다
- **infinite 애니메이션 12종 상시 재생.** `prefers-reduced-motion` 대응 없이 그대로 가져오면 안 된다
- **로고·히어로 3D 캐러셀 화살표가 호버 무반응** — 클릭 가능한데 피드백이 없다(probe dead 4건)
- 카드 속 카드(LA4) 중첩, 텍스트·aria 없는 아이콘 24개(IC3)
