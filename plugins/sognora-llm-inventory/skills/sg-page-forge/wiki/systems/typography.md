# 시스템 — 타이포그래피 (한글 포함)

- 근거 수준: 레퍼런스 라이브러리 실측(디스플레이/본문 4.1~7.2×, toss 한글 조판), W3C klreq, Google Fonts Korean, Kage·Sylva CSS 집계(2026-09-03), 실전 사고(담화 v3).
- 판정자: 기계(scan) `type.min-size`(12px 하한)·`korean.*`(행간·이탤릭·자간·한글 폰트)·`type.scale-steps`(보고만) · 기계(`conform.mjs` `token.*`)(font-size는 tokens.json 스케일 값만) · **폰트 패밀리는 기계가 렌더에서 수집하지 않는다 → 관행(판정자 없음), AD 검수 + [ai-slop-judge](../judge/ai-slop-judge.md)**.

## 하한·상한 (DESIGN.md 계약의 필수 항목)

- **최소**: 모든 텍스트 ≥ **12px**(법적 고지·캡션 포함, `type.min-size` — 한글 포함 전 텍스트) · 본문 ≥ **15px** · 한글 본문 행간 ≥ **1.5**(`korean.line-height`). 행간 프롱은 본문 크기 ≤20px에만(디스플레이 1.05~1.2 오탐 수정).
- **최대**: 디스플레이 상한 = **본문 × 4~7**에서 DESIGN.md가 캡 확정(실측 4.1~7.2×). 프로젝트 기존 상한이 있으면 그것이 우선.
- **단수**: 스케일 5~8단을 DESIGN.md에 전체 목록 명시, **한 화면 동시 위계 ≤ 6단**(toss 실측). ※ 고유 사이즈 개수 규칙(`type.size-count(삭제)`·`type.scale-ratio(삭제)`)은 코퍼스 판정으로 **삭제**됐다 — stripe 15개. 스케일의 유무를 개수로 못 잰다([corpus](../evidence/corpus.md)).
- **토큰 강제**: 모든 font-size는 스케일 값만. 행간은 크기가 아니라 역할에 결합(본문 1.5~1.6 / 리드 1.6 / 디스플레이 1.3~1.4).

## 한글 제약 (항상 적용)

- **한글 대응 폰트 필수** — 라틴 서체만 지정하면 한글이 시스템 폴백(Apple SD Gothic·맑은 고딕)으로 떨어져 굵기·크기·기준선이 어긋난다(`font.hangul-fallback`). `font-family`에 한글 서체가 **먼저** 또는 라틴 서체와 짝으로 명시돼야 한다.
- **이탤릭 금지** — 한글 자형 없음(`korean.italic`). 강조는 무게·색으로.
- **자간** — 한글 본문 0~미세 음수(`korean.letter-spacing`: 양수 자간 🔴). 라벨·캡션의 넓은 트래킹은 **라틴 대문자에만**; 한글 라벨 트래킹 상한 0.1em(관행 — 판정자는 AD 검수).
- **행간** 1.5~1.8, **`word-break: keep-all` 전역**(어절 단위 줄바꿈), 2분할 강조가 어순을 깨는지 확인.
- **혼용 페어링** — 라틴 폰트는 한글 폰트와 x-height가 맞는 것으로. 한글 글리프는 라틴보다 넓고 낮아 같은 pt에서 작아 보인다([korean-typography](../evidence/korean-typography.md)).
- **무게 위계는 300~600 안에서** — 리드 CSS 집계: Kage 500×10·400×6·300×5·600×1·**700+ 0**, Sylva 300×5·400×3·500×2·600×1. 700+는 방향이 명시 채택할 때만(`exemptions.md`). 담화 v3(700/800)는 "카드형·텍스트 전부 허접" 판정. 위계는 무게가 아니라 **서체 대비(세리프 display + 산세리프 text + 숫자 전용)·크기·자간**으로. 단 directions의 "극단 대비"(100–200 vs 800–900)는 방향이 그것을 시그니처로 선언할 때의 선택지다 — 기본값이 아니다.
- **숫자 전용 서체 권장** — 가격·시간·통계는 본문 고딕 대신 숫자 서체(Cormorant Garamond·Fraunces·Instrument Serif 류) 또는 `font-variant-numeric: tabular-nums`(Vercel guidelines).

## AI 기본값 서체 — 금지가 아니라 "근거 없이 쓰면 위반"

| 서체 | 왜 티가 나나 |
|---|---|
| Inter | "universal default"(925studios) — 훌륭하기 때문에 기본값이 됐고 그래서 제네릭 |
| Roboto · Arial · system-ui 단독 | 코드 예제 최빈. 한글 폴백 사고의 주범 |
| Space Grotesk + Instrument Serif | 2026 반복 조합(developersdigest #2) |
| Geist | Vercel 기본값 — 개발자 도구 밖에서는 티 |
| 세리프 이탤릭 한 단어 강조 | developersdigest #3 |

방향이 근거(브랜드 자산·도메인·리드 실측)를 적고 채택하면 무죄. 빈 축을 이 기본값으로 채우는 것이 죄([directions](../directions.md) 반프로필).

## 추천 한글 페어 (라이선스·출처)

| 역할 | 서체 | 라이선스 | 출처 |
|---|---|---|---|
| 고딕(본문·UI) | Pretendard | OFL | github.com/orioncactus/pretendard |
| 고딕 | SUIT | OFL | sun.fo/suit |
| 고딕 | Wanted Sans | OFL | github.com/wanteddev/wanted-sans |
| 고딕 | Noto Sans KR | OFL | fonts.google.com/noto |
| 고딕 | IBM Plex Sans KR | OFL | fonts.google.com |
| 고딕 | Gothic A1 | OFL | fonts.google.com |
| 명조(디스플레이·에디토리얼) | Noto Serif KR | OFL | fonts.google.com/noto |
| 명조 | 마루 부리 | OFL | hangeul.naver.com/fonts/maru |
| 명조 | 이롭게 바탕 | OFL(무료 배포) | font.iropke.com/batang |
| 명조 | 리디바탕 | OFL | ridicorp.com/ridibatang |
| 명조 | 고운바탕 | OFL | fonts.google.com(Gowun Batang) |
| 명조 | Hahmlet | OFL | fonts.google.com |
| 디스플레이(임팩트) | Black Han Sans · Do Hyeon | OFL | fonts.google.com |
| 라틴 숫자·디스플레이 짝 | Cormorant Garamond · Fraunces · Söhne(유료) | OFL / 상용 | fonts.google.com / klim |

페어 원칙: 한글 명조 + 라틴 세리프(x-height 근접), 한글 고딕 + 라틴 그로테스크. 세 계열(display·text·numeral)을 역할로 선언하고 DESIGN.md에 적는다. 폰트 로딩 실패 시 폴백 체인에도 한글 서체를 둔다.

## 디스플레이 모먼트 (판정: 캡처 대조 + 퀄리티 바)

히어로 헤드라인 ≥ 본문 4배. 무게 대비는 크기보다 먼저 검토(한글은 무게 표현이 풍부) — 단 위 300~600 창 안에서 먼저 시도하고, 그 밖은 방향 선언으로.

## 관행 (판정자 없음)

- 한글 라벨 트래킹 상한 0.1em — AD 검수.
- 헤딩 앞머리 11자에 핵심어(NN/G 스캔 실측은 있으나 기계 판정 없음).

관련: [systems/ 목차](index.md) · [korean-typography](../evidence/korean-typography.md) · [ai-slop](../evidence/ai-slop.md) · [color](color.md) · [directions](../directions.md)
