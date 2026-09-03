# 시스템 — 색

- 근거 수준: 레퍼런스 실측(어휘 예산), 코퍼스 보정(`color.gradient-count(삭제)` 삭제), 공개 AI-슬롭 자료(925studios·developersdigest·Anthropic frontend-design), 실전 사고(팔레트 표류).
- 판정자: 기계(`conform.mjs` `token.*`)(tokens.json 어휘만, 소스 린트 + 렌더 전수, 해시 대조) · 기계(scan) `color.purple-gradient`(보라 대역)·`color.gradient-text`(그라데이션 텍스트) · 기계(`irdiff.mjs` `lead.residue`) · history 대조(``history.mjs` paletteFamily`).

## tokens.json — scan 규칙 `token.*`의 법전

`json
{ "colors": { "base": [{"hex":"#…","role":"neutral|brand|semantic"}],
    "derived": [{"name":"glass","formula":"#FFFFFF @ .7 blur(20px)","resolved":"rgba(255,255,255,0.7)"}],
    "alphaPolicy": "rgb-in-set-alpha-free", "budget": {"neutral":6,"brand":2,"semantic":2} },
  "type": { "viewports":[1440,390], "steps":[{"name":"body","px":{"1440":16,"390":15}}] },
  "radius": [0,8,16], "motion": {"durationsMs":[160],"easings":["cubic-bezier(.2,0,0,1)"]},
  "skipSelectors": [], "tokenFiles": ["src/styles/tokens.css"] }
`

- **어휘 예산**: 중립 ≤6 · 브랜드 ≤2 · 시맨틱 ≤2 · duration ≤2 · easing ≤1. 기계(scan 규칙 `token.budget`)가 즉석 린트.
- **alpha 정책**: computed 색의 (r,g,b)가 base∪derived∪{흰·검}에 있으면 alpha 자유 — 유리·스크림·글로우는 토큰의 alpha 변형으로 합법. derived는 AD 선언만. skipSelectors는 AD 소유(빌더 자기 면제 금지). radius 미선언=미관할, 빈 배열=0·full 외 금지.
- **승인 해시**: AD 승인 시점 sha256을 provenance에 기록, `--expect-hash` 대조 — 빌더가 색을 추가해 합법화하는 최후 수단 차단.
- 실전 사고: 토큰 13개를 선언한 런이 hex 32개를 썼다(산문 규칙은 빌더를 구속하지 못한다 — 그래서 기계 게이트).

## 컬러 전략 (방향 7축 중 2축 — [directions](../directions.md))

- 단색 지배 + 예리한 강조 1색 · 어스톤 · 고대비 흑백 + 유채 1점 · 저채도 2색 조화 · 딥톤 배경 + 밝은 전경
- 강조색은 브랜드 색이 있으면 그 hue에서 유도(보색·인접색), 없으면 도메인에서(외벽 도장 서비스면 실제 도료 색 계열). **예시 hex를 옮겨 적지 않는다.**
- 그라데이션은 방향이 명시 채택할 때만, 페이지 1곳. ※ "그라데이션 배경 3곳+"(`color.gradient-count(삭제)`)는 코퍼스에서 11/16 발동 → 삭제. 개수는 취향이다. 보라 대역 지목 `color.purple-gradient`만 남는다.
- **색 커밋**: 지배 1 + 강조 1이 전 섹션 관통(퀄리티 바 #4). 강조 ~10%(Squint ④ 소심한 색).
- **리드와 팔레트 계열 상이 의무** — 리드 색은 tokens.json에 없으므로 잔존이 `token.color-outside-set` 위반으로 자동 검출.
- 팔레트는 4~6개 이름 붙인 hex로(Anthropic frontend-design).

## AI 수렴 팔레트 (반프로필 — 빈 축을 이걸로 채우면 위반)

| 룩 | 출처 |
|---|---|
| 인디고→보라 그라데이션("2026년 가장 시끄러운 티", Tailwind indigo-500 2019 유래) | 925studios.co/blog/ai-slop-design-tells |
| "VibeCode 라벤더"(이미지 생성 기본값에서 온 특정 보라) | developersdigest #4 |
| 크림 배경 + 고대비 세리프 + 테라코타 | Anthropic frontend-design 명시 회피 클러스터 |
| near-black + 애시드 그린·버밀리언 단일 액센트 | 〃 |
| 브로드시트 헤어라인 · radius 0 | 〃 |
| 상시 다크모드 + 회색 본문(대비 미달) + 대문자 라벨 | developersdigest #5·#6·#16 |
| 컬러 글로우·컬러 섀도 | developersdigest #8, no-slop-ui |
| 카드 왼쪽 컬러 테두리(가장 강한 단일 티) | developersdigest #11, 기계(scan) `border.side-accent` |

이 목록은 유통기한이 있다 — 벤치마크 실측에서 "요즘 AI가 다 이렇게 뽑는 룩"을 감지하면 갱신. 금지가 아니라 근거 없는 기본값 소비가 죄.

## 대비 (판정: 기계(scan) `type.min-size` 보조 + 접근성은 axe-core 관할)

본문 대비 WCAG AA 4.5:1. 다크 테마의 회색 본문이 가장 흔한 실패(developersdigest #6).

관련: [systems/ 목차](index.md) · [typography](typography.md) · [directions](../directions.md) · [ai-slop](../evidence/ai-slop.md) · [corpus](../evidence/corpus.md)
