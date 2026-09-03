# 시스템 — 컴포넌트 층

- 근거 수준: 실전 사고(의존성 3개뿐·UI 라이브러리 0·CSS 모듈 11개 중 카드 9·버튼 8·배지 6·입력 4 파일이 각자 정의, 컨트롤 높이 7개 파일에 직접 박음) + 구조 밀도 실측 사다리.
- 판정자: 기계(`primitives.mjs` `component.*`)(`component.no-primitive-layer` 🔴 / `component.duplicated`·`component.no-shared` 🟡, 프로젝트 단위 1회) · 기계(scan) `structure.prose-only` 🔴 · 상태 커버리지는 기계(scan) 빈 상태 분기 경고 + 사람.

## 프리미티브 층 — "글만 있는 페이지"의 기계적 원인

사용자 지적: *"왜 라이브러리 같은 걸 안 쓰는 거지? 글만 있는 페이지는 사실상 최악이긴 함. 컴포넌트도 없고."*

드롭인할 `Button`·`Input`·`Table`·`EmptyState`가 없으면 화면마다 CSS를 처음부터 짜야 하고, **제일 싸게 쓸 수 있는 것(문단)으로 수렴한다.** "설정 화면 입력 필드 0개"·"빈 상태에 다음 행동 없음"·"앱 화면 8종이 서로 100% 동일"이 전부 같은 뿌리.

- 특정 라이브러리를 강요하지 않는다. 직접 만든 프리미티브 층도 층이다. 재는 것은 **같은 프리미티브를 여러 곳에서 다시 그리는가**뿐.
- 기준: 같은 프리미티브를 **3개 이상 파일**이 각자 정의하면 실패(2개는 페이지 전용 변형일 수 있음. 실측 사례 82%).
- **빈 디렉터리는 층으로 세지 않는다** — `ui/` 이름이 아니라 파일과 export로 판정.
- 빌드 순서: 기계(`primitives.mjs` `component.*`) 먼저 → 없으면 그 화면들이 실제로 쓰는 것(Button·Input·Table·EmptyState 등)을 먼저 세운 뒤 페이지 CSS.

## 치수는 인용한다 — [spacing](spacing.md) §인용 가능한 치수

## 글만 있는 페이지 — 결과 쪽에서도 잰다 (`structure.prose-only`)

구조 밀도 = 본문 500자당 구조 요소 개수(컨트롤·표·항목 3개 이상 목록·큰 미디어 200×150+·균일 반복 그리드·목차 앵커. **본문 링크는 세지 않는다**).

| 도구 | 폼 | 요금제 | 랜딩 ‖ | 소개 | 카탈로그·대시보드·설정 |
|---|---|---|---|---|---|
| 32 | 15 | 7.5 | 5.6 ‖ | 0.92 | 0 |

**1.0 아래에서 깨끗이 갈린다.** 문서(정책·약관)에는 적용하지 않는다(privacy 0.88 — 글이 본체). 본문 80자 미만은 건너뛴다(`content.thin`·`page.blank`의 일).

## 상태 커버리지 (제품 화면)

빈 상태(0건 + 다음 행동) · 로딩(구역별 스켈레톤, 빈 상태 선노출 금지) · 오류·권한 없음(원시 에러 노출 금지) · hover/active/focus 실제 차이 · 실데이터 내성(긴 이름·약어·0/1/다수). 기계는 빈 상태 분기 존재만 안다. [dashboard](../types/dashboard.md)

## 인터랙션 언어 (판정: 기계(`behavior.mjs` `motion.engineered-floor`·`motion.nojs-visible`·`motion.reduced-safe`))

- 호버: **색 전환·옅은 알파 필·brightness만** — transform·그림자 금지(toss·linear 실측)
- duration 1~2개 값(0.1~0.2s), easing 1개, `transition: all` 0
- 무반응 인터랙티브 0 목표(로고 예외), 리빌 1회성·재은닉 없음
- active·focus-visible·disabled 정의. 개폐·전환 0ms 금지(120~150ms 하한)
- 상세 프리셋은 [motion](motion.md)

관련: [systems/ 목차](index.md) · [spacing](spacing.md) · [motion](motion.md) · [dashboard](../types/dashboard.md) · [tool](../types/tool.md)

## shadcn — 층으로는 정답, 테마로는 기본값 (2026-09-03 추가)

- 이 스킬의 기본 스택은 Next.js + Tailwind + **shadcn/ui** + Motion이다(SKILL.md 기본 스택 절). 랜딩과 앱 페이지를 가르지 않는다 — 랜딩도 같은 프리미티브 층 위에서 만든다. 컴포넌트 층이 없는 프로젝트에는 shadcn을 세운다. 코드가 레포 안에 있어 AI가 가장 잘 다루고, Button·Input·Table·Dialog·EmptyState가 처음부터 있어 "글만 있는 페이지"의 원인을 가장 싸게 없앤다.
- 그러나 **손 안 댄 shadcn이 곧 AI 티**다. 공개 슬롭 검출 스킬 셋(avoid-ai-design·no-slop-ui·anti-ai-slop)이 "untouched shadcn zinc/slate · rounded-2xl shadow-lg"를 P0로 꼽는다. 실측: sognora-front-* 10개 중 shadcn을 쓰는 6개 가운데 확인한 3개(template·puanai·company)의 `globals.css`가 shadcn 중립 팔레트(`--background 0 0% 100%`·`--foreground 0 0% 13%`·`--muted 0 0% 96%`·`--border 0 0% 88%`·`--radius 8px`) 그대로였고, 바뀐 것은 primary 색 하나였다.
- 규칙: **shadcn은 쓰되 테마 토큰을 전부 재정의한 뒤 쓴다.** 층이 없는 프로젝트는 P0 `foundation.mjs`가 잡아 "먼저 발판을 잡을까요?"를 묻는다 — 승인 시 `--apply`가 shadcn init·add를 실행한다. 기준선은 [references/design-baseline.md](../../references/design-baseline.md).
- 판정자: 기계(src 규칙 `token.shadcn-default` — shadcn 테마 파일이 있는 프로젝트에서만 평가. 기본 중립 3개 이상 + radius 8px + Inter/Geist/system-ui 단독이면 🔴) · `type.heavy-weight-share`(굵기 700+ 면적 비율, 코퍼스 보정).
