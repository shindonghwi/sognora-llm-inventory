# 디자인 기준선 — 프로젝트에 DESIGN.md가 없을 때의 씨앗

> 판정자: `detect.mjs`(`token.shadcn-default`·`font.ai-default`·`type.heavy-weight-share`·`font.hangul-fallback`) · `conform.mjs --baseline`(이 파일의 JSON 블록을 토큰 어휘로 읽는다). 이 파일은 취향 목록이 아니라 **기본값을 소비하지 않는 결정**의 목록이다. 프로젝트마다 다시 정하지 않도록 한 번 굳힌다. 브랜드 입력이 있으면 그것이 우선이고, 이 파일은 빈 축만 채운다.

## 왜 필요한가 (2026-09-03 실측)

sognora-front-* 10개 중 shadcn을 쓰는 것은 6개(admin·adopsdesk·auneri·company·puanai·template), Tailwind만 2개(kedigram·paint-preview), 자체 CSS 2개(nolpop·showcase)다. 스택은 갈리는데 **기본값은 같았다**: shadcn 3개(template·puanai·company)의 `globals.css`에 shadcn 중립 팔레트(`--background 0 0% 100%` · `--foreground 0 0% 13%` · `--muted 0 0% 96%` · `--border 0 0% 88%` · `--radius 8px`)가 글자 하나 안 다르게 남아 있었고, 서체는 스택과 무관하게 9개에서 Inter가 나왔다(puanai 75회). 제품 화면은 `font-semibold` 369회·`rounded-2xl` 133회·`backdrop-blur` 26회로 위계를 굵기로, 경계를 둥근 유리로 만들었다. 공개 슬롭 검출 스킬 셋(avoid-ai-design·no-slop-ui·anti-ai-slop)이 P0로 꼽는 조합 그대로다.

## 기준 8항

| 항목 | 기준 | 판정 |
|---|---|---|
| 서체 | 한글 본문 1(Pretendard 또는 SUIT) + 디스플레이 1(세리프 또는 성격 있는 고딕) + 숫자·코드 1. 한글 대응 폰트 명시. Inter·Geist·Roboto·system-ui 단독 금지 | `font.hangul-fallback` 🔴 · `font.ai-default` 🟡 |
| 무게 | 위계는 300~600 안에서(서체 대비·크기·자간으로). 700+는 `exemptions.md`에 방향이 명시 채택할 때만 | `type.heavy-weight-share`(코퍼스 보정) |
| 팔레트 | 중립 계열을 브랜드에서 유도(웜/쿨을 결정) + 브랜드 1 + 강조 1. shadcn `0 0%` 중립 그대로 금지. 어휘 예산 중립≤6·브랜드≤2·시맨틱≤2 | `token.shadcn-default` 🔴 · `token.*` |
| radius | 사다리 1개(4/8/12). 24px+는 큰 컨테이너(모달·시트)만. 작은 카드에 24px+ 금지 | `token.radius-outside-set` · 관행(작은 카드 radius) |
| 표면 | 경계는 간격·배경 단차로. 유리 블러·컬러 글로우·카드 속 카드는 페이지 1곳만 | `color.glow-shadow` · 블라인드 AI-티 채점 |
| 모션 | 프리셋 6종만(appear·scroll-progress·layout-morph·hover-state·press·reveal-mask). `transition: all` 금지, 150~250ms, 진입 ease-out | `motion.*` · `behavior.mjs` |
| 컴포넌트 | 기본 스택은 shadcn/ui(프로젝트에 다른 층이 있으면 그것을 따른다). shadcn은 테마 토큰을 전부 재정의한 뒤 사용 | `component.no-primitive-layer` · `token.shadcn-default` |
| 밀도 | 페이지 유형이 정한다. 랜딩 96~120px, 카탈로그·요금제 32~64px, 도구·대시보드 16~32px | `work.below-fold` · `density.void-band` |

## 기준선 토큰 (프로젝트 tokens.json이 없을 때 `conform.mjs --baseline`이 읽는다)

```json
{
  "colors": {
    "base": [
      { "hex": "#FAF8F5", "role": "neutral", "name": "paper" },
      { "hex": "#EFEBE5", "role": "neutral", "name": "paper-2" },
      { "hex": "#D9D3CA", "role": "neutral", "name": "line" },
      { "hex": "#6F6A63", "role": "neutral", "name": "ink-soft" },
      { "hex": "#2A2723", "role": "neutral", "name": "ink" },
      { "hex": "#15130F", "role": "neutral", "name": "ink-deep" }
    ],
    "budget": { "neutral": 6, "brand": 2, "semantic": 2 },
    "alphaPolicy": "rgb-in-set-alpha-free",
    "note": "브랜드·강조 2색은 프로젝트가 채운다(브랜드 hue에서 유도). 중립은 웜 계열 예시 — 쿨 계열로 바꿀 때는 6단 전부 같은 계열로."
  },
  "type": {
    "families": {
      "display": ["Noto Serif KR", "Apple SD Gothic Neo", "serif"],
      "text": ["Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "sans-serif"],
      "numeral": ["Cormorant Garamond", "Noto Serif KR", "serif"]
    },
    "weights": { "min": 300, "max": 600 },
    "viewports": [1440, 390],
    "steps": [
      { "name": "display", "px": { "1440": 56, "390": 34 }, "lineHeight": 1.2 },
      { "name": "h1", "px": { "1440": 40, "390": 28 }, "lineHeight": 1.25 },
      { "name": "h2", "px": { "1440": 28, "390": 22 }, "lineHeight": 1.3 },
      { "name": "lead", "px": { "1440": 18, "390": 16 }, "lineHeight": 1.6 },
      { "name": "body", "px": { "1440": 16, "390": 15 }, "lineHeight": 1.6 },
      { "name": "caption", "px": { "1440": 13, "390": 12 }, "lineHeight": 1.5 }
    ],
    "korean": { "letterSpacing": "0 ~ -0.01em", "italic": false, "wordBreak": "keep-all" }
  },
  "radius": [4, 8, 12],
  "motion": { "durationsMs": [160, 220], "easings": ["cubic-bezier(.2,0,0,1)"] }
}
```

## 적용 순서

1. 프로젝트에 DESIGN.md·tokens.json이 있으면 그것이 법이다. 이 파일은 읽지 않는다.
2. 없으면 이 JSON을 `.sognora/page/tokens.json`의 씨앗으로 복사하고, 브랜드 색 2개와 중립 계열(웜/쿨)만 프로젝트 입력에서 결정한다.
3. shadcn 프로젝트면(`components.json` + radix 의존이 있을 때만) `globals.css`의 `--background/--foreground/--muted/--border/--radius`를 이 토큰으로 재정의한다. 컴포넌트 코드는 건드리지 않는다.
4. `node "$S/audit.mjs"`로 `token.shadcn-default`가 꺼졌는지, `type.heavy-weight-share`가 코퍼스 범위 안인지 잰다.

관련: [wiki/systems/typography](../wiki/systems/typography.md) · [wiki/systems/color](../wiki/systems/color.md) · [wiki/systems/components](../wiki/systems/components.md)
