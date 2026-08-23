# 페이지 명세 — {라우트}

> 모든 수치에는 근거를 단다: `(evidence/reference/home/1440x900/initial.png · #hero-title computed style)`
> 근거 없는 수치는 명세에 적지 않는다.

## 0. 계약 요약

- 원본 URL / route(status·redirect·canonical 포함) / 관찰 일시 / 뷰포트 세트 / DPR
- `routes.json`·`states.json`·`qa-ledger.json`의 연결 항목
- locale/theme/storage 조건과 의도적 차이

## 1. 디자인 토큰

| 토큰 | 값 | 근거 |
|---|---|---|
| color/bg | #ffffff | (…) |
| font/body | Pretendard 16px/1.6 | (…) |
| space/section-y | 96px | (…) |

간격 스케일은 실측값을 나열한 뒤 공통 배수를 찾아 정리한다(4/8px 그리드 가정 금지 — 원본이 그렇지 않을 수 있다).

## 2. 공통 셸

- 헤더: 높이, sticky 여부·offset, 내부 정렬, 로고 크기, 내비 간격
- 푸터: 높이, 컬럼 구성, 여백

## 3. 섹션별 치수

섹션마다: 컨테이너 max-width · 좌우 padding · 상하 padding · 내부 요소 gap · 정렬 · 그리드 컬럼

## 4. 타이포그래피 계층

| 역할 | size/weight/line-height | 근거 |
|---|---|---|

## 5. 브랜드 계약

| 원본 역할 | 새 가상 값 | 적용 범위 | 잔존 검사 |
|---|---|---|---|

업종·톤·음절/단어 길이·화면 점유 폭은 유사하게 유지하되 원본과 구별되는 이름을 쓴다. 브랜드명·법인명·도메인·연락처·metadata·alt의 매핑을 한 곳에서 관리한다.

## 6. visual slot과 imagegen 자산

| assetId | route/viewport/state | selector·렌더 박스 | source px·aspect | crop/focal/alpha | 이미지 내부 문구 | imagegen 파일·검증 |
|---|---|---|---|---|---|---|

영역·규격을 먼저 구현한 뒤 고유 asset/variant별 prompt와 최종 workspace 경로를 기록한다. 원본 asset은 reference evidence일 뿐 결과물 경로에 넣지 않는다.

## 7. 상호작용 상태표

| 상태 ID | 트리거 | 관찰 대상 | before → mid → after | duration/easing | 근거 |
|---|---|---|---|---|---|

## 8. 반응형

| 브레이크포인트 | 변화 | 근거 |
|---|---|---|

## 9. 미해결·주의

- 측정 못 한 항목과 이유
- 화면은 정상이나 끝나지 않는 제3자 요청 등 관찰에 영향 없는 외부 잡음
- 원본의 의도된 결함(그대로 복제할지 여부)
- interaction inventory의 exclusion과 representativeReason
- 미생성 visual slot·원본 자산 잔존·placeholder(있으면 완전 복제 미달로 표시)
