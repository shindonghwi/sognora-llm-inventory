# 시스템 — 화면을 이루는 층

계약(`tokens.json`·`engineering.json`·DESIGN.md)에 오른 층만 읽는다. 각 문서는 근거 수준과 판정자를 머리에 적는다.

| 문서 | 무엇 | 판정자 |
|---|---|---|
| [typography](typography.md) | 하한·상한·단수, 한글 제약(대응 폰트·이탤릭·자간·행간·keep-all), 무게 300~600 창, AI 기본값 서체, 한글 페어 표 | 기계(scan) `type.min-size`·`korean.*`, 기계(`conform.mjs` `token.*`), AD 검수 |
| [color](color.md) | tokens.json 스키마·어휘 예산·alpha 정책·승인 해시, 컬러 전략, AI 수렴 팔레트 | 기계(`conform.mjs` `token.*`), 기계(scan) `color.purple-gradient`·`color.gradient-text`, 잔존 검사 |
| [spacing](spacing.md) | 유형별 밀도 표, 인용 치수(Spectrum·Carbon·Primer), `density.void-band` 여백 지배, 일의 위치·점유율 | 기계(scan) `density.*`, 기계(scan) `work.*`, 기계(`sameness.mjs`) `work.starved` |
| [components](components.md) | 프리미티브 층, 글만 있는 페이지, 상태 커버리지, 인터랙션 언어 | 기계(`primitives.mjs` `component.*`), 기계(scan) `structure.prose-only`, 기계(scan 규칙 `motion.*`·`hover.*`) |
| [motion](motion.md) | 프리셋 6종(appear·scroll-progress·layout-morph·hover-state·press·reveal-mask), engineering.json, reduced-motion | `behavior`, 기계(scan) `motion.infinite-loop`, 기계(`conform.mjs` `token.*`) |
| [assets](assets.md) | E/P/I 3클래스, 슬롯 우선, imagegen 경로, SVG 정책, 산출물 리얼리즘, 성능 예산 | 기계(scan) `asset.reuse`·`asset.placeholder`, [gatekeeper-judge](../judge/gatekeeper-judge.md) |

프리셋 코드: `assets/presets/motion.css` · `assets/presets/motion.js`.

관련: [types/ 목차](../types/index.md) · [evidence/ 목차](../evidence/index.md) · [judge/ 목차](../judge/index.md)
