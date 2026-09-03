# 규칙 색인 — `scripts/rule-index.mjs`가 코드에서 생성한다 (수정은 코드에서, 이 문서는 산출물)

> 판정자 열의 계기가 그 ID를 낸다. basis — corpus: `references/corpus-baseline.json` 실측 임계 · citation: 인용 수치 · definition: 무엇을 셀지 정하는 값. corpus 열 `exempt` = 살아있음·접근성 축이라 코퍼스 판정 제외. **단독 🔴** = 다른 패턴과 합산 없이 페이지를 🔴로 만드는 규칙(23종). **면제 불가** = exemptions.md로 "채택"할 수 없는 결함(11종).

규칙 92종(scan 규칙 58 + 다른 계기 35). 다시 생성: `node scripts/rule-index.mjs` · 정합 검사: `--check`.

| id | 심각도 | 단독 🔴 | 면제 불가 | 제목 | basis | corpus | 판정자 | 근거 |
|---|---|---|---|---|---|---|---|---|
| `asset.no-alt` | 🟡 |  |  | alt 없는 콘텐츠 이미지 | citation | exempt | detect.mjs(rules/asset.mjs) | 인용: WCAG 1.1.1(비텍스트 콘텐츠). 장식 이미지는 alt=""가 정답이므로 null만 센다 |
| `asset.placeholder` | 🔴 | ● | ● | 플레이스홀더·샘플 이미지 잔존 | definition |  | detect.mjs(rules/asset.mjs) | forge-rules §1 AS2(면제 불가) · Krirox 축 7(placeholder logos) · page-rules §6 가짜 데이터 |
| `asset.reuse` | 🟡 |  |  | 같은 이미지가 3곳 이상에서 재사용 | definition |  | detect.mjs(rules/asset.mjs) | forge-rules §1 AS1·§2a 동일 시안 반복 금지('여러 시안을 만드는 제품'이 '한 벌을 돌려쓰는 도구'로 보인다) |
| `asset.unsized` | ℹ️ |  |  | width/height 속성 없는 이미지(CLS 보고만) | definition |  | detect.mjs(rules/asset.mjs) | forge-rules §1d: 속성 프록시라 코퍼스 10/16 발동 → 판정에서 삭제, CLS는 Lighthouse 실측 관할. 보고만 남긴다 |
| `border.side-accent` | 🟡 |  |  | 카드 왼쪽·위 컬러 액센트 보더(가장 강한 단일 티) | definition |  | detect.mjs(rules/layout.mjs) | developersdigest #11('strongest single tell') · page-rules §6 |
| `card.hollow` | 🔴 | ● |  | 반복 항목 과반이 잉크 0(이름도 설명도 없는 빈 상자) | definition |  | detect.mjs(rules/layout.mjs) | page-rules §0b HOLLOW-CARDS 실측 — 배경이미지 전용 카드는 오탐 가능(사람 확인) |
| `catalog.no-entry-action` | 🔴 | ● |  | 항목에 진입 액션이 없다(설명만 있고 들어갈 데가 없음) | definition |  | detect.mjs(rules/structure.mjs) | page-rules §7('Use Now →' — 설명만 있고 들어갈 데가 없으면 카탈로그가 아니다) |
| `catalog.too-few-items` | 🔴 | ● |  | 카탈로그 항목 4개 미만 | definition |  | detect.mjs(rules/structure.mjs) | page-rules §7(반복 항목 그리드가 카탈로그의 정체) |
| `color.glow-shadow` | 🟡 |  |  | 채도 있는 컬러 글로우 섀도 | definition |  | detect.mjs(rules/color.mjs) | developersdigest #8 · no-slop-ui(restrained shadows) · page-rules §6 |
| `color.gradient-text` | 🟡 |  |  | 그라데이션으로 채운 헤드라인(bg-clip:text) | definition |  | detect.mjs(rules/color.mjs) | avoid-ai-design(gradient text headlines) · developersdigest #7 |
| `color.purple-gradient` | 🔴 |  |  | 남보라~보라 그라데이션(2026년 가장 큰 AI 티) | definition |  | detect.mjs(rules/color.mjs) | developersdigest 16패턴 #4 'VibeCode Purple' · 925studios(indigo→purple = Tailwind indigo-500 유산) · avoid-ai-design P0. 면제 가능(방향이 채택 선언 시) |
| `comp.missing` | 🔴 |  |  | 계약 페이지에 시안 PNG가 없다 — codex CLI 부재로 못 만들었으면 미제공 | definition |  | comp.mjs | comp.mjs --check · audit.mjs |
| `component.duplicated` | 🟡 |  |  | 같은 프리미티브를 3개 이상 파일이 각자 정의 | definition |  | primitives.mjs | primitives.mjs DUP_MIN 3(관행 — 실측 사례 82%) |
| `component.no-primitive-layer` | 🔴 |  |  | 공유 컴포넌트 export 0 + 같은 프리미티브 중복 정의 | definition |  | primitives.mjs | primitives.mjs — 실전 사고: CSS 모듈 11개 중 카드 9·버튼 8 파일이 각자 정의 |
| `component.no-shared` | 🟡 |  |  | components/·ui/ 아래 export된 공유 컴포넌트가 없다 | definition |  | primitives.mjs | primitives.mjs |
| `content.thin` | 🟡 |  |  | 콘텐츠가 얇다(본문 300자 미만, 문서·소개 제외 아님) | definition |  | detect.mjs(rules/copy.mjs) | page-rules §0g 콘텐츠 조달 — 구조를 시키면 구조만 나온다. 빈 구조가 AI 티의 정체 |
| `copy.bilingual-pattern` | 🔴 |  |  | 한·영 알려진 AI 문체 패턴(sg-en-humanize detect_bilingual.py) — 계기 없음·판정 안 함·실행 오류는 미제공 | definition |  | copylint.mjs | copylint.mjs runBilingual — exit 1만 🔴, exit 2/3은 미제공 |
| `copy.forbidden-words` | 🟡 |  |  | GOV.UK 오류 문구 금칙어 · 한글 상투어(랜딩 2·UI 3 이상) | citation |  | copylint.mjs | copylint.mjs — GOV.UK · sg-ko-humanize 상투어 요약 |
| `copy.hero-repeat` | 🟡 |  |  | 마지막 CTA 헤드라인이 히어로를 어미까지 되풀이 | definition |  | detect.mjs(rules/copy.mjs) | forge-rules §2d 히어로 카피 복제 금지 |
| `copy.length` | 🟡 |  |  | 문장 25단어·문단 5문장·제목 65자 초과 | citation |  | copylint.mjs | copylint.mjs — GOV.UK 콘텐츠 가이드·NN/G |
| `copy.maker-voice` | 🔴 | ● | ● | 제작자 시점 카피(만든 사람이 자기가 한 일을 보고) | definition |  | detect.mjs(rules/copy.mjs) | forge-rules §2c-2 KO5 실전 사고('셀프 촬영·사용 장면을 짧게 이어 붙였습니다'). 검증: 문장 앞에 '우리가'를 붙여 자연스러우면 제작 노트 |
| `copy.manual-voice` | 🔴 |  |  | 설명서 시점이 본문을 지배(절차를 가르치는 문장) | definition |  | detect.mjs(rules/copy.mjs) | forge-rules §2c-2 KO6·§2d 매뉴얼화 금지(매력 44/100 사고). 도구 화면의 실제 입력 라벨·힌트는 대상이 아니다 |
| `dashboard.thin` | 🟡 |  |  | 대시보드에 반복 데이터·조작 요소가 없다 | definition |  | detect.mjs(rules/structure.mjs) | page-rules §5(반복 데이터 + 상태 화면) |
| `density.half-width-blank` | 🟡 |  |  | 카드·밴드에서 콘텐츠가 좌측 절반만 쓰고 우측이 통째로 빈다 | definition |  | detect.mjs(rules/density.mjs) | forge-rules §2d 반폭 공백 실측(폭 1270 CTA 카드에서 우측 435px 공백) |
| `density.prose-stat-band` | 🔴 | ● |  | 스탯 자리에 숫자 없는 서술문('검토 중') | definition |  | detect.mjs(rules/density.mjs) | forge-rules §2d DE3(스탯·상태 밴드는 측정값만) · Krirox 축 5(숫자·고유명사 없음) |
| `density.sparse-card-row` | ℹ️ |  |  | 카드 행의 카드마다 한 줄 설명뿐(보고만 — 로고·아이콘 그리드는 정상) | definition |  | detect.mjs(rules/density.mjs) | developersdigest #12 · 코퍼스 보정(2026-09-04): 프리미엄 5/9에서 발동(omneky 로고 그리드 14행) → 판정에서 내리고 보고만. 슬롭 여부는 layout.empty-3cards·AI-티 판정자가 본다 |
| `density.void-band` | 🔴 | ● |  | 카드·열·밴드 박스의 상하 공백이 안쪽 콘텐츠보다 크다(여백 지배) | definition |  | detect.mjs(rules/density.mjs) | forge-rules §2d DE4 실측(박스 209px에 콘텐츠 59px) · aside.com 실측으로 헤더 스택 제외 확정 · 사용자 무관용 지시. 단독 🔴(계측이지 취향이 아니다) |
| `density.void-section` | 🟡 |  |  | 섹션 높이 대비 콘텐츠가 희박(여백으로 부풀린 얇은 섹션) | definition |  | detect.mjs(rules/density.mjs) | forge-rules §1 DE1 · §2d 콘텐츠 예산(말할 것이 없으면 섹션을 줄여라) |
| `depth.vs-lead` | 🔴 |  |  | 스크롤 깊이가 리드 대비 -40% 초과 축소인데 mapping.md에 삭제 사유가 없다 | citation |  | irdiff.mjs | irdiff.mjs DEPTH_CUT 0.4(wiki/types/landing.md 깊이 하한) |
| `direction.axes-repeat` | 🟡 |  |  | 7축 중 직전 실행과 다른 축이 3 미만 | citation |  | history.mjs | history.mjs AXES_MIN_DIFF 3(wiki/directions.md) |
| `document.no-header` | 🟡 |  |  | 문서에 시행일·문의처가 없다 | definition |  | detect.mjs(rules/structure.mjs) | page-rules §0b(문서 = 시행일·문의처 + 목차 + 번호 붙은 절) |
| `document.no-toc` | 🟡 |  |  | 긴 문서에 목차(앵커)가 없다 | definition |  | detect.mjs(rules/structure.mjs) | page-rules §0b · NN/G 헤딩 스캔(레이어 케이크 패턴) |
| `font.ai-default` | 🟡 |  |  | 본문 서체가 AI 기본값 하나뿐이다(디스플레이 서체 페어링 없음) | definition |  | detect.mjs(rules/font.mjs) | developersdigest 16패턴 #1·#2(Inter 일색·같은 조합 반복) · 925studios(Inter는 기본값이라 제네릭) · Anthropic frontend-design(기본 페어링 회피). 금지가 아니라 '근거 없이 쓰면' 위반 — exemptions.md로 채택 선언 가능 |
| `font.hangul-fallback` | 🔴 | ● | ● | 한글 텍스트가 한글 대응 서체 없이 시스템 폴백으로 떨어진다 | definition |  | detect.mjs(rules/font.mjs) | W3C klreq(한글 조판 요구사항) · 실측: 라틴만 지정하면 한글은 시스템 고딕으로 떨어져 굵기·기준선이 어긋난다(담화 v3) |
| `form.too-few-fields` | 🔴 | ● |  | 폼 필드 2개 미만 | citation |  | detect.mjs(rules/structure.mjs) | page-rules §4(문의 폼 3~5개 필드, NN/G) |
| `foundation.<layer>` | 🔴 |  |  | 기본 스택 층 부재(framework·typescript·tailwind·components·query·forms·motion·tokens) — 🟡는 점진 이행 권장, deferred는 🟡 보류 | definition |  | foundation.mjs | foundation.mjs — SKILL.md 기본 스택 절 |
| `history.unavailable` | 미제공 |  |  | history.json 없음(첫 실행) — 반복 축 판정되지 않음 | definition |  | history.mjs | history.mjs — 캐시 부재는 실패가 아니라 미제공 |
| `icon.decorative` | 🟡 |  |  | 의미 결합 없는 장식 아이콘·블롭 | definition |  | detect.mjs(rules/icon.mjs) | forge-rules §1 IC4(장식 블롭) — 아이콘은 양방향 규칙: 장식 금지, 그러나 앵커 0인 텍스트 벽도 금지 |
| `icon.emoji` | 🟡 |  |  | 이모지를 아이콘으로 쓴다(내비·카드·목록) | citation |  | detect.mjs(rules/icon.mjs) | developersdigest #15(내비 이모지 — 단일 지표로 가장 강함) · page-rules §6(링크 3개 이상 중 40% 초과) · ✦ 반짝이(NN/G n=107, 'AI'로 읽은 사람 0명 — 그래도 서명이다) |
| `icon.generic-set` | 🟡 |  |  | 같은 어미로 끝나는 항목 나열 + 제네릭 시스템 아이콘 세트(이중 위반) | definition |  | detect.mjs(rules/icon.mjs) | forge-rules §2d 동어반복 금지(실전 평가 '가장 AI스러운 프레임') · page-rules §6(Lucide 5종 + 모든 CTA에 ArrowRight) |
| `icon.numbered-list` | 🔴 | ● |  | 번호 텍스트 목록으로 실체(건물·제품·산출물)를 설명 | definition |  | detect.mjs(rules/icon.mjs) | forge-rules §2d(시각 실체는 이미지로 — 레퍼런스 18종 실측 0건) · developersdigest #13 |
| `korean.italic` | 🔴 | ● | ● | 한글에 이탤릭 | definition |  | detect.mjs(rules/korean.mjs) | 인용: 한글 서체에는 이탤릭 자형이 없다(W3C klreq) — 기계 기울임은 조판 결함 |
| `korean.keep-all` | 🟡 |  |  | 한글 제목·본문에 word-break:keep-all이 없어 어절이 잘린다 | definition |  | detect.mjs(rules/korean.mjs) | 관행(W3C klreq 어절 단위 줄바꿈) — 판정은 제목(h1~h3)과 리드문에만 |
| `korean.letter-spacing` | 🟡 |  |  | 한글 본문에 양수 자간 | definition |  | detect.mjs(rules/korean.mjs) | 인용: forge-rules §1b(한글 자간 0~미세 음수) · 실측: 라틴용 트래킹을 한글에 걸면 글자가 흩어진다. 소형 라벨(≤12px·짧은 텍스트)의 트래킹은 관행으로 허용 |
| `korean.line-height` | 🔴 |  | ● | 한글 본문 행간이 1.5 미만이다 | citation |  | detect.mjs(rules/korean.mjs) | 인용: W3C klreq·forge-rules §1b(한글 본문 행간 ≥1.5, 20px 이하 본문에만 — 디스플레이의 1.05~1.2는 정상) |
| `layout.badge-above-h1` | 🟡 |  |  | H1 바로 위 알약 배지 | definition |  | detect.mjs(rules/layout.mjs) | developersdigest #10 · Krirox 축 3(히어로 패턴) |
| `layout.empty-3cards` | 🟡 |  |  | 가운데 히어로 + 카드 3장 한 줄(내용 성긴) | definition |  | detect.mjs(rules/layout.mjs) | developersdigest #9·#12 · avoid-ai-design P0 · Krirox 축 3·4. 카드 자체가 죄가 아니라 내용 없이 세 장 나열이 문제 |
| `layout.numbered-badge-card` | 🔴 | ● |  | 01/02/03 번호 배지 카드·스테퍼로 실체를 대신 설명 | definition |  | detect.mjs(rules/layout.mjs) | forge-rules §2d(IC6 — 실체는 이미지로, 텍스트 목록으로 대체 금지) · developersdigest #13 · 레퍼런스 실측 0건 |
| `lead.residue` | 🔴 |  |  | 리드 배경색이 결과에 잔존 | definition |  | irdiff.mjs | irdiff.mjs — 덜 치환된 클론의 방어선 |
| `lead.reuse` | 🔴 |  |  | 동일 리드를 최근 3회 안에 재사용 | citation |  | history.mjs | history.mjs RECENT 3(wiki/workflow/lead.md 리드 회전) — history.json 없으면 미제공 |
| `motion.engineered-floor` | 🔴 |  |  | 엔지니어드 모먼트 하한 3·역할 3종 미달, 선택자 없음, 트리거 후 변화 없음, 120ms 미만 | definition |  | behavior.mjs | behavior.mjs FLOOR 3(게이트가 소유 — 검증 대상이 임계를 정하면 {minCount:0}으로 통과하던 사고) |
| `motion.infinite-loop` | 🟡 |  |  | 무한 반복 장식 애니메이션 | definition |  | detect.mjs(rules/motion.mjs) | directions §6(infinite 루프 장식은 어느 자세에서도 금지) · Anthropic frontend-design(과한 애니메이션이 AI 티) |
| `motion.nojs-visible` | 🔴 |  |  | no-JS에서 첫 화면 텍스트 90% 미만 가시 | definition |  | behavior.mjs | behavior.mjs TEXT_VISIBLE_MIN 0.9 — 리빌의 opacity:0 잔류 사고 |
| `motion.reduced-safe` | 🔴 |  |  | reduced-motion에서 첫 화면 텍스트 90% 미만 가시 | definition |  | behavior.mjs | behavior.mjs TEXT_VISIBLE_MIN 0.9 |
| `motion.slow-transition` | 🟡 |  |  | 300ms 초과 전환이 다수 | citation |  | detect.mjs(rules/motion.mjs) | page-rules §6(Emil Kowalski: 150~250ms 적정, 300ms 초과 느림) · forge-rules §2(duration 1~2값 0.1~0.2s) |
| `motion.transition-all` | 🟡 |  |  | transition: all | definition |  | detect.mjs(rules/motion.mjs) | page-rules §6(Emil Kowalski) · forge-rules §2(transition: all 0개) |
| `page.blank` | 🔴 | ● | ● | 빈 화면(가시 텍스트·이미지 거의 없음) | definition |  | detect.mjs(rules/copy.mjs) | page-rules §0 alive: 런타임 에러·빈 화면 실전 사고(plan.highlights undefined) |
| `palette.history-repeat` | 🔴 |  |  | 베이스 팔레트 계열이 직전 실행과 같다 | definition |  | history.mjs | history.mjs paletteFamily(무채 3단·유채 hue 60° 버킷) — wiki/directions.md 유도 절차 0 |
| `pricing.legal-notice` | 🟡 |  |  | 요금제 법적 고지 존재 확인(세금 포함·자동갱신·체험 후 가격) — 적법성 판정이 아니다 | citation |  | detect.mjs(rules/structure.mjs) | 인용: EU 소비자권리지침 Art.6(1)(e) · 영국 DMCCA 2024 s.230 · 캘리포니아 B&P §17602 — 기계는 존재만 본다 |
| `pricing.no-price` | 🔴 | ● |  | 요금제 페이지에 가격·문의 마커가 전무 | definition |  | detect.mjs(rules/structure.mjs) | page-rules §0b NOT-A-PRICING(pricing의 유일한 🔴 — 법 관련 검사는 존재만 🟡) |
| `quality.overflow-x` | 🔴 | ● | ● | 가로 오버플로(레이아웃 파손) | definition |  | detect.mjs(rules/quality.mjs) | forge-rules §1 QF1(차단) |
| `quality.runtime-error` | 🔴 | ● | ● | 런타임·콘솔 오류 | definition | exempt | detect.mjs(rules/quality.mjs) | page-rules §0 alive 실전 사고(요금제 페이지 plan.highlights undefined로 죽음) |
| `quality.tap-target` | 🔴 | ● | ● | 모바일 탭 타깃 44px 미만 | citation | exempt | detect.mjs(rules/quality.mjs) | 인용: WCAG 2.5.5 Target Size 44×44 CSS px |
| `sameness.cross-type-clone` | 🔴 |  |  | 다른 유형 쌍의 골격 지문 일치도가 기준 이상 | corpus |  | sameness.mjs | sameness.mjs — 임계는 그 프로젝트의 같은 유형 쌍(최고치)로 자가 보정, 폴백 60% |
| `sameness.flat-density` | 🟡 |  |  | 유형 간 첫 화면 잉크율 차이가 유형 안 차이를 넘지 못한다 | definition |  | sameness.mjs | sameness.mjs |
| `sameness.same-opening` | 🔴 |  |  | 하는 화면이 읽는 화면과 첫 3역할을 똑같이 연다 | definition |  | sameness.mjs | sameness.mjs — 실전 사고 SAME-OPENING 9건 |
| `sameness.untyped-clone` | 🟡 |  |  | 유형 미선언 쌍이 닮았다 | definition |  | sameness.mjs | sameness.mjs |
| `scene.repeat-run` | 🔴 |  |  | 같은 배경 연속 3섹션(장면 예산) | citation |  | irdiff.mjs | irdiff.mjs RUN 3(wiki/types/landing.md 장면 예산) |
| `skeleton.vs-ir` | 🟡 |  |  | 골격(섹션 수·컨테이너 폭)이 리드 IR 오차 밴드 밖 / IR completeness 미달이면 미제공 | citation |  | irdiff.mjs | irdiff.mjs BAND_PX 8(자기 diff 오차 밴드 — wiki/workflow/transcribe.md) |
| `state.empty-missing` | 🟡 |  |  | 목록·표를 그리는 컴포넌트에 빈 상태(0건) 분기가 없다 | definition |  | detect.mjs(rules/state.mjs) | page-rules §5(빈 상태는 가장 가치 높은 신호 — 'No data found'만 있으면 미달) · CHI EA 2026(오류 예방·복구 지원율 낮음) |
| `state.hardcoded-metric` | 🟡 |  |  | 정적 마크업의 가짜 지표('10K+ users'·'99.9%')와 샘플 이름 | definition |  | detect.mjs(rules/state.mjs) | page-rules §6 가짜 데이터(Acme Corp·John Doe·Item 1/2/3, 모든 지표 카드에 초록 상승 화살표) |
| `structure.prose-only` | 🔴 | ● |  | 글만 있는 페이지(본문 500자당 구조 요소 1개 미만) | definition |  | detect.mjs(rules/structure.mjs) | page-rules §1b 실측 사다리: 도구 32·폼 15·요금제 7.5·랜딩 5.6 ‖ 소개 0.92·카탈로그 0 — 1.0에서 갈린다. 문서 유형 제외(글이 본체) |
| `text.hidden-at-rest` | 🔴 | ● | ● | 정지 상태에서 숨은 텍스트(리빌의 opacity:0 잔류) | definition |  | detect.mjs(rules/quality.mjs) | forge-rules §1 QF2(콘텐츠 소실 — 리빌은 기본 가시로 설계) · 실전 사고: no-JS·reduced-motion에서 텍스트 비가시 |
| `token.budget` | 🔴 |  |  | 토큰 어휘 예산 초과(중립≤6·브랜드≤2·시맨틱≤2·duration≤2·easing≤1) | citation |  | conform.mjs | conform.mjs lintTokens — wiki/systems/color.md 어휘 예산(리드 실측: 팔레트 4~6색) |
| `token.color-outside-set` | 🔴 |  |  | 렌더 색이 토큰 집합 밖(alpha 변형 제외) | definition |  | conform.mjs | conform.mjs conformScan — alphaPolicy rgb-in-set-alpha-free |
| `token.duration-outside-set` | 🟡 |  |  | 렌더 transition duration이 토큰 밖 | definition |  | conform.mjs | conform.mjs conformScan |
| `token.hangul-family` | 🔴 |  |  | tokens.json 서체에 한글 대응 서체가 없다 | definition |  | conform.mjs | conform.mjs lintTokens — wiki/systems/typography.md 한글 대응 폰트 필수 |
| `token.hash-mismatch` | 🔴 |  |  | tokens.json 해시가 승인본과 다르다(빌더의 사후 합법화) | definition |  | conform.mjs | conform.mjs --expect-hash |
| `token.heavy-weight` | 🟡 |  |  | 타입 스케일 단계에 굵기 600 초과 | corpus |  | conform.mjs | conform.mjs lintTokens — 리드 CSS 집계 700+ 0회(wiki/systems/typography.md) |
| `token.radius-outside-set` | 🟡 |  |  | 렌더 radius가 사다리 밖 | definition |  | conform.mjs | conform.mjs conformScan |
| `token.shadcn-default` | 🟡(렌더 추정)·🔴(소스 확정) |  |  | 렌더가 shadcn 기본 테마 조합(흰 배경 #fff·전경 #212121·보더 #e0e0e0) | definition |  | detect.mjs(rules/color.mjs) · conform.mjs·rules/color.mjs | 소스 축(conform token.shadcn-default)의 렌더 보조. 근거: 프로젝트 3개 globals.css 동일(2026-09-03 실측) · avoid-ai-design P0(untouched shadcn zinc) ／ conform.mjs shadcnDefault(소스 확정 🔴) · rules/color.mjs(렌더 추정은 🟡) — avoid-ai-design P0·sognora-front-* 3개 실측 |
| `token.size-outside-set` | 🔴 |  |  | 렌더 font-size가 스케일 밖 | definition |  | conform.mjs | conform.mjs conformScan |
| `token.source-literal` | 🔴 |  |  | 토큰 파일 밖 소스에 raw 색·px font-size 리터럴 | definition |  | conform.mjs | conform.mjs conformSrc — 실전 사고: 토큰 13개 선언한 런이 hex 32개를 썼다 |
| `tool.no-input` | 🔴 | ● |  | 도구 화면에 보이는 입력(텍스트·파일·캔버스)이 없다 | definition |  | detect.mjs(rules/structure.mjs) | page-rules §8(입력이 화면 상단에) · hidden csrf로 통과하던 구멍 폐쇄(보이는 입력만 센다) |
| `type.heavy-weight-share` | 🟡 |  |  | 굵기 700 이상이 위계의 수단이다(가시 텍스트 면적 비율) | corpus |  | detect.mjs(rules/type.mjs) | 실측: Kage 300/400/500 위주·600 1회·700+ 0, Sylva 300~600 — 위계는 서체 대비·크기·자간으로. 담화 v3(700/800)는 '허접'으로 판정됨. 임계는 코퍼스 기준선 |
| `type.landing-drift` | 🔴 | ● |  | 하는 화면·소개·문서에 랜딩 설득 섹션(후기·가격 밴드)이 흘러들었다 | definition |  | detect.mjs(rules/structure.mjs) | page-rules §0b LANDING-DRIFT — 단어가 아니라 섹션 실체로 판정(인용 블록 2+ / testimonial 블록 h≥120 / '월 N원' 가격 패턴) |
| `type.min-size` | 🔴 |  | ● | 판독 불능 크기의 텍스트(12px 하한, 본문 15px) | citation | exempt | detect.mjs(rules/type.mjs) | 인용: 본문 12px 절대 하한(WCAG 본문 가독 관행·forge-rules §1b) · 본문 15px 권장 |
| `type.scale-steps` | ℹ️ |  |  | 타입 스케일 단수(면적 가중 고유 크기) — 보고만 | definition |  | detect.mjs(rules/type.mjs) | forge-rules §1d: 절대 개수 규칙(TS1·TS2)은 코퍼스에서 과반 발동해 삭제됨(stripe 15개). 스케일 일관성은 패널이 캡처를 보고 판정한다 |
| `work.below-fold` | 🔴 | ● |  | 하는 화면의 일(입력·항목·데이터)이 첫 화면 밖에서 시작 | definition |  | detect.mjs(rules/structure.mjs) | page-rules §0c 실측 사다리(카탈로그 히어로 패딩 180→y603 통과 · 300→783 🟡 · 420→1003 🔴) |
| `work.low` | 🟡 |  |  | 하는 화면의 일이 첫 화면 하단 1/3에서 시작 | definition |  | rules/structure.mjs | rules/structure.mjs work.below-fold의 하위 판정 |
| `work.starved` | 🔴 | ● |  | 하는 화면인데 일이 첫 화면을 덜 덮는다(읽는 화면보다도) | definition |  | detect.mjs(rules/structure.mjs) | page-rules §0f 실측: 카탈로그 69%·폼 59% vs 굶은 대시보드 20/15/11%, 정책 문서 25/23% — 23%와 59% 사이가 비어 있다. 임계는 그 프로젝트 읽는 화면 본문 점유율 중앙값(sameness가 계산), 폴백 25% |
| `work.unmeasured` | 🟡 |  |  | 일 요소를 표준 마크업에서 찾지 못함(없다는 뜻이 아니다) | definition |  | rules/structure.mjs·sameness.mjs | rules/structure.mjs·sameness.mjs — 실전 사고: 커스텀 드롭존을 0%로 단정 |

관련: [ai-slop](ai-slop.md) · [corpus](corpus.md) · [index](index.md)
