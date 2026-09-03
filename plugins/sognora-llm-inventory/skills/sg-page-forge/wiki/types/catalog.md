# 유형 — 카탈로그 `catalog` (고른다)

- 근거 수준: 실측 레퍼런스 imgeditor.co/tools(스크롤 2,232px — 같은 사이트 랜딩 6,607px의 1/3) + 실전 사고.
- 판정자: 기계(scan 규칙 `catalog.too-few-items`(4개 미만)·`catalog.no-entry-action`·`card.hollow`·`type.landing-drift`·`work.below-fold`·`work.starved`·`sameness.same-opening`·AI 티 규칙 전수).

## 동사와 필수 구조

| 항목 | 값 |
|---|---|
| 사용자 동사 | 고른다 |
| 필수 구조 | 반복 항목 그리드 + 항목마다 진입 액션 |
| 소개문으로 열어도 되나 | ❌ — 소개문으로 열면 `sameness.same-opening` |
| 블록 간 세로 간격 | 32~64px — 그룹 소제목 사이만 넓게, 카드 갭은 좁게 |
| 일 점유율 실측 | `/product` 카드 격자 **69%**(정상 사례) |

## 규칙

- **헤더는 짧게** — 라벨 + 제목 + 한 줄 설명. 설득 섹션(후기·가격·CTA 밴드) 없음 → 있으면 `type.landing-drift`.
- **그룹 소제목으로 분류**("Editing Tools" + 한 줄 설명), 그 아래 카드 그리드.
- **카드 = 아이콘 + 이름 + 상태 배지 + 한 줄 설명 + 진입 액션**("Use Now →"). **설명만 있고 들어갈 데가 없으면 카탈로그가 아니다.**
- **상태 배지로 가용성 표시** — New / Pro / Coming Soon. 준비 안 된 것도 숨기지 않되 **비활성 처리**(회색 + 클릭 불가).
- 항목 순서는 중요도순, 알파벳순 금지(관행).
- `card.hollow`(🔴): 반복 항목 과반의 잉크 0 — 이름도 설명도 없는 빈 상자. 잉크 판정은 잉크 판정 단일 소스(scan 공용). 가상 요소·배경이미지 전용 카드는 잉크 0으로 잡히므로 문구에 사람 확인 안내가 붙는다.
- `work.below-fold`(🔴) / `work.low`(🟡): 고를 항목의 첫 등장 y좌표. 실측 사다리(1440×900): 히어로 패딩 180/160 → 항목 y=603 통과 · 300/260 → y=783 🟡 · 420/360 → y=1003 🔴. 처방은 패딩만 줄이기가 아니라 그 자리에 항목을 채우는 것.

관련: [types/ 목차](index.md) · [tool](tool.md) · [spacing](../systems/spacing.md) · [components](../systems/components.md) · [sameness-judge](../judge/sameness-judge.md)
