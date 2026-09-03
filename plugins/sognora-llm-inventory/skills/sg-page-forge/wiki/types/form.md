# 유형 — 문의·신청 폼 `form` (적는다)

- 근거 수준: GOV.UK Design System(govuk-frontend MIT / 문서 OGL v3.0) — 유일한 개방 규범 소스. NN/G 폼 길이 실측.
- 판정자: 기계(scan 규칙 `form.too-few-fields`(2개 미만 🔴)·`copy.forbidden-words`·`work.below-fold`·`sameness.*`).

## 동사와 필수 구조

| 항목 | 값 |
|---|---|
| 사용자 동사 | 적는다 |
| 필수 구조 | 필드 3~5개(NN/G), 선택 필드 1~2개까지 |
| 소개문으로 열어도 되나 | ❌ |
| 블록 간 세로 간격 | 16~32px — 필드 간격은 Spectrum 내부 여백 8/9/12/15/18 인용([spacing](../systems/spacing.md)) |
| 일 점유율 실측 | `/contact` 입력 폼 **59%** |

## GOV.UK 규범

- 라벨은 입력창 **위**, 힌트는 라벨 아래·입력창 위, 오류는 힌트 다음·입력창 앞
- **포커스가 떠날 때 검증하지 말 것**(제출 시점까지 대기), 오류 시 **입력값 초기화 절대 금지**, HTML5 기본 검증 끄기(`novalidate`)
- 이메일 254자 수용·최소 30자 표시, 전화번호는 **단일 필드**
- 오류 문구 금칙: forbidden, illegal, sorry, please, valid/invalid, oops, "An error occurred"
- 문의 폼은 **3~5개 필드**, 선택 필드는 1~2개까지

## 관측 한계

빈 화면 한가운데 폼 하나가 뜬 로그인 화면은 "나머지가 글"이 아니라 "나머지가 여백"이다. 기계(`sameness.mjs`)는 잉크율과 일 점유율을 갈라 적는다 — 잉크율 > 점유율이면 "소개문을 걷어내라", 아니면 "실체를 넣어라". 처방이 반대이므로 문구를 그대로 옮기지 말고 어느 쪽인지 본다.

관련: [types/ 목차](index.md) · [components](../systems/components.md) · [spacing](../systems/spacing.md) · [tool](tool.md)
