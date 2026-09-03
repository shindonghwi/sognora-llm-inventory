# 근거 — AI 티(슬롭)의 정체와 검출

- 근거 수준: 공개 자료 6종(2026-09 조사) + 코퍼스 보정 원리(레퍼런스 코퍼스 11종(측정 9·제외 2) 실측) + 실전 사고(담화 v3, 계정 6종, 정책 6종).
- 판정자: 기계(scan 규칙 전수 — 코퍼스 판정으로 5룰 삭제) · [ai-slop-judge](../judge/ai-slop-judge.md)(블라인드 섹션별 1~5) · [sameness-judge](../judge/sameness-judge.md) · 기계(`sameness.mjs`) `work.starved`. **단일 패턴으로 실패시키지 않는다**(Design Slop Cop 1,590개에서 46%가 패턴 0~1개). 예외: 단독 🔴 규칙([규칙 색인](rule-index.md)의 ● 표시 — 품질 바닥·조판·카피 시점·유형 구조·여백 지배)은 합산 없이 페이지를 🔴로 만든다. 취향 계열은 4종 이상 합산일 때만 🔴.

## 원인은 하나다 — 스펙의 침묵을 사전분포가 채운다

모델은 수백만 "모던 SaaS" 사이트의 통계적 평균으로 수렴한다(Krirox). 생성에서 스펙이 비면 LLM 기본값이 채우고(=AI 티), 변환에서 비면 레퍼런스 실측값이 채운다(=품질 바닥 상속). 그래서 이 스킬은 골격을 실측에서 옮기고, 결정을 프롬프트마다 다시 하지 않도록 DESIGN.md·tokens.json에 박는다("Clean sites encode their choices somewhere durable instead of re-deciding on every prompt" — developersdigest).

## 16패턴 (developersdigest, 2026) — 기계(scan) 대응

| # | 패턴 | 기계 |
|---|---|---|
| 1 | Inter 일색 | AD 검수([typography](../systems/typography.md)) |
| 2 | 반복 조합(Space Grotesk + Instrument Serif + Geist) | AD 검수 |
| 3 | 세리프 이탤릭 한 단어 강조 | `korean.italic`(한글) / AD |
| 4 | "VibeCode 보라"(라벤더) | `color.purple-gradient` |
| 5 | 상시 다크모드 + 회색 본문 + 대문자 라벨 | `type.min-size`·대비 / AD |
| 6 | 다크 테마 저대비 | 대비 검사 |
| 7 | 그라데이션 남용 | `color.gradient-text`(텍스트), 개수는 취향(`color.gradient-count(삭제)` 삭제) |
| 8 | 컬러 글로우·섀도 | AD / [ai-slop-judge](../judge/ai-slop-judge.md) |
| 9 | 가운데 정렬 제네릭 히어로 | `layout.*`, [persona-judge](../judge/persona-judge.md) ② |
| 10 | H1 위 배지 | `layout.badge-above-h1` |
| 11 | 카드 좌측 컬러 테두리(가장 강한 단일 티) | `border.side-accent` |
| 12 | 똑같은 아이콘 카드 그리드 | `layout.empty-3cards`·`layout.numbered-badge-card`·`icon.decorative` |
| 13 | 1·2·3 단계 스테퍼 | `icon.numbered-list` |
| 14 | 숫자 배너 행 | `density.prose-stat-band` |
| 15 | 이모지 사이드바·아이콘 | `icon.emoji` |
| 16 | 전부 대문자 라벨 | AD |

## 10축 루브릭 (Krirox/anti-ai-slop-skills) — 각 0~3, 합 16+ = 슬롭

시각 서명 / 타이포 / 히어로 패턴 / 피처 블록 / 카피 레지스터(버즈워드·숫자 없음·고유명사 없음) / 구조 골격(예측 가능한 SaaS 순서) / 소셜 프루프(가짜 후기) / 상태 커버리지(happy path만) / 특정성("어느 업종에나 맞는가") / 미학적 커밋(방향 vs 트렌드 섞기). 원인 넷: **위계 없음·구체성 없음·절제 없음·의견 없음**. 메타 규칙: "다른 AI라면 기본으로 안 했을 선택을 내가 했는가."

## 공개 스킬·가이드 요약

| 자료 | 핵심 | 이 스킬에 반영 |
|---|---|---|
| funboy322/avoid-ai-design | 기존 코드를 P0~P2로 채점·재작성. P0 = 보라 그라데이션·Inter 일색·가운데 히어로+카드 3·손 안 댄 shadcn zinc | scan 규칙 `color.purple-gradient`·`layout.empty-3cards`·`layout.badge-above-h1`, [directions](../directions.md) 반프로필 |
| LeoStehlik/no-slop-ui | 사전 규칙 + 리뷰 체크리스트. 버튼 radius 6~10px, 유리·중첩 카드·과한 radius 금지, 호버 bounce·spring 금지, "두 절 이상 실패면 다시" | [components](../systems/components.md) 인터랙션 언어, [motion](../systems/motion.md) hover-state |
| Krirox/anti-ai-slop-skills | 4원인·10축 루브릭·프리플라이트 | [ai-slop-judge](../judge/ai-slop-judge.md) 참고 축 |
| anthropics/skills frontend-design | 서체 3역할(display·body·utility), 팔레트 4~6 hex, "미학적 위험은 한 곳에", 과한 애니메이션 = AI 티, 회피 클러스터 3(크림+세리프+테라코타 / near-black+애시드 / 신문 헤어라인) | [typography](../systems/typography.md)·[color](../systems/color.md) 반프로필·[motion](../systems/motion.md) |
| vercel-labs/web-interface-guidelines | 100+ 검사(접근성·tabular-nums·줄바꿈·곡선 따옴표) | [typography](../systems/typography.md) 숫자 서체 |
| VoltAgent/awesome-design-md | 73개 사이트 DESIGN.md(9절) — 결정을 파일에 박는 형식 | DESIGN.md 산출물 |
| Taste Skill | 금지 목록이 아니라 브리프에서 방향 추론 + 하드 프리플라이트 | 시안 우선·[directions](../directions.md) |
| Design Slop Cop(1,590개) · impeccable.style/slop(64패턴) · CHI EA 2026(138화면) | 단일 히트는 흔함, 상태 부재가 최고 가치 신호 | [dashboard](../types/dashboard.md) |

## 규칙을 판정하는 자 — 코퍼스 보정

> **"AI 티" 검출기가 프리미엄 레퍼런스에서 발동하면, 그건 AI 티가 아니다.** 레퍼런스는 정의상 슬롭이 아니므로 거기서 켜지는 규칙은 저자의 취향을 재고 있다.

레퍼런스 코퍼스 11종(측정 9·제외 2) 실측으로 과반 발동 4룰 삭제(`icon.no-label(삭제)`·`color.gradient-count(삭제)`·`asset.unsized-img(삭제)`·`type.size-count(삭제)`, 이어 `type.scale-ratio(삭제)`). 삭제한 관심사는 판정자가 바뀐다(패널). 남은 규칙도 무죄 추정 없음 — `references/corpus-baseline.json`에 발동률·증거. 한계: "레퍼런스에서 안 켜짐"만 본다. 슬롭 코퍼스에서 켜지는지는 판정자가 없다. [corpus](corpus.md)

## 실전 사고 표본

| 사고 | 관측 | 어느 축 |
|---|---|---|
| 담화 v3(2026-09-03) | 굵기 700/800, 유리 블러 상자 8개, KO/EN/JA 토글, 알약 버튼 — "카드형·텍스트 전부 허접" | 타이포·표면·특정성 |
| 계정 6종 | 계기 전부 초록인데 "규격화된 템플릿" — 일 점유율 11~20% | 상태·특정성 → `work.starved` 신설 |
| 정책 6종 | 유형 목록 공백 → 전부 같은 화면 | 구조 골격 → `sameness.cross-type-clone` 신설 |
| 랜딩 본문 제작 노트 | "이어 붙였습니다·놓았습니다" | 카피 레지스터 → `copy.maker-voice`·`copy.manual-voice` |

## 남는 것

규칙은 나쁜 것을 막을 뿐 좋은 것을 만들지 못한다. 좋은 것은 **사람이 고른 시안**과 **실측 골격**에서 온다. 규칙 목록에 반감기가 있다는 것도 기억한다(보라 그라데이션은 이미 은퇴한 신호 — [types/landing](../types/landing.md) 관행 절). 배점은 상태 커버리지·구조·특정성에 둔다.

관련: [evidence/ 목차](index.md) · [sources](sources.md) · [corpus](corpus.md) · [ai-slop-judge](../judge/ai-slop-judge.md) · [typography](../systems/typography.md) · [color](../systems/color.md)

## 추가 규칙(2026-09-03) — `token.shadcn-default`

shadcn 기본 테마(중립 `0 0%` 팔레트·radius 8px·Inter 단독)가 소스에 그대로 남아 있으면 🔴. 근거: avoid-ai-design P0 "untouched shadcn zinc", no-slop-ui, anti-ai-slop 축 1(Visual signature) + sognora-front-* 실측(template·puanai·company 동일). 처방은 [design-baseline](../../references/design-baseline.md) 토큰으로 재정의 — 컴포넌트 코드는 유지.
