# 근거 — 코퍼스 보정과 레퍼런스 라이브러리

- 근거 수준: 실측(코퍼스 11종 중 제외 2(차단 페이지)·측정 9에 scan→detect 전수 실행, 2026-09-04).
- 판정자: 기계(코퍼스 기준선 생성·규칙별 판정 명령 — SKILL.md 계기 표). 기준선 파일 `references/corpus-baseline.json`, 제외 목록 `references/corpus-exclude.json`.

## 원리 — 규칙을 판정하는 자

규칙의 임계는 대부분 스킬 저자가 정했고 그 숫자가 옳은지 물어본 적이 없었다. 같은 목적의 공개 스킬은 판정 기준이 전부 **스킬 밖**에 있다 — 목표 PNG(colbymchenry/frontend-audit-skill), Nielsen 휴리스틱(mistyhx/frontend-design-audit), HTTP Archive 백분위(Lighthouse: 25퍼센타일=50점·8퍼센타일=90점). 기준이 밖에 있으면 임계가 자의적일 수 없다.

> **AI 티 검출기가 프리미엄 레퍼런스에서 발동하면 그건 AI 티가 아니다.**

## 판정 결과 (측정 9종, 2026-09-04)

발동한 33개 규칙 중 한 번도 안 켜진 규칙 0건. 과반 발동 4건 삭제:

| 삭제 | 발동 | 왜 규칙이 아닌가 |
|---|---|---|
| `icon.no-label(삭제)` 텍스트·aria 없는 아이콘 | 13/16 | 장식 아이콘은 `aria-hidden`이 정답인데 위반으로 셌다. 접근성은 axe-core 관할 |
| `color.gradient-count(삭제)` 그라데이션 배경 3곳+ | 11/16 | linear 9곳·stripe 11곳. 개수는 취향. 보라 대역 `color.purple-gradient`만 남긴다 |
| `asset.unsized-img(삭제)` width/height 미지정 img | 10/16 | 속성 프록시. CLS는 Lighthouse 실측 |
| `type.size-count(삭제)` 폰트 사이즈 9개+ | 9/16 | stripe 15개. 스케일 유무를 개수로 못 잰다 |
| `type.scale-ratio(삭제)` 인접비 불규칙 3쌍+ | 4→13/16 | `type.size-count(삭제)` 삭제로 모집단이 바뀌며 드러남. 절대 개수라 사이즈가 많을수록 자동 발동 |

**삭제는 남은 규칙의 모집단을 바꾼다 — 삭제 후 반드시 재측정한다.** 삭제한 관심사(타입 스케일 일관성·그라데이션 남용·아이콘 접근성)는 판정자가 패널로 바뀐다. 남은 규칙에도 무죄 추정 없음 — 1~8/16 발동 규칙은 기준선에 발동률·증거가 있다. 규칙을 고칠 때 그 파일을 먼저 읽는다.

**한계**: "레퍼런스에서 안 켜짐"만 본다. 안 켜진다고 슬롭을 잡는다는 뜻은 아니다 — 슬롭 코퍼스를 모으면 그때 판정자가 생긴다.

## 기준선 읽는 법

`references/corpus-baseline.json`: 규칙 ID → `{ fired: n, of: 16, evidence: [{site, count, sample}] }`. 새 규칙을 넣을 때는 코퍼스 기준선 재측정 명령으로 기준선을 갱신하고 과반 발동이면 규칙이 아니라 취향이다. 번들이 필요한 명령이므로 번들 캐시(`$SG_PAGE_FORGE_HOME/bundles/`)가 없으면 리드 수집 계기로 먼저 수집한다 — 기준선 파일 자체는 커밋된 사실이라 판정에는 번들이 필요 없다.

## 레퍼런스 라이브러리 — 2단

- **Tier-S** `references/library/*.md`(23종): 요약 실측 문서 — 방향 인터뷰·문법 교차 결론의 근거. 커밋. 목차는 `references/library/INDEX.md`(리드 자격 [R]/[R·조건부]/[보류]/[실패]/[미시험] 표기).
- **Tier-R** 두 층: `references/ir/<이름>.json`(**커밋** — 번들에서 증류한 측정 사실, 골격 입력, `completeness` 스탬프) / 번들(**스킬 밖 캐시** `$SG_PAGE_FORGE_HOME/bundles/<이름>/` — 원본 CSS·자산 사본이라 재배포 금지, 리드로 지목될 때 온디맨드 수집). 스킬 폴더는 커밋된 것만으로 완결이다 — 번들이 없어도 IR로 빌드·검수가 끝까지 돈다.
- 문서 추가 규칙: 신규 레퍼런스 분석 1회 → `<이름>.md` 저장 → INDEX 등록. 문서 없는 벤치마크 금지.

관련: [evidence/ 목차](index.md) · [ai-slop](ai-slop.md) · [sources](sources.md)
