# sg-web-replicate — CHANGELOG

## 0.1.0 — 2026-08-14

- 최초 생성. 측정 기반 복제 루프(계약 → 라우트 탐색 → 캡처·측정 → 명세 → 구현 → diff 게이트).
- scripts: discover.mjs(sitemap+크롤, 로그인 벽 탐지) · capture.mjs(브라우저 1회 기동, 뷰포트×상태) · diff.mjs(수치+pixel 게이트).
- daylab.dev로 실측 검증: 라우트 19개 탐색, 자기 비교 PASS, 오류 페이지 FAIL 확인.

## 0.1.1 — 2026-08-15

- 자산 정책을 "원본 그대로"로 전환. fetch-assets.mjs 추가(폰트·이미지·인라인 SVG 원본 수집, @font-face·CSS 변수 추출).
- 폰트 family 불일치를 독립 실패 조건으로 게이트에 추가.
- CORS 차단 스타일시트는 응답 원문에서 @font-face를 파싱(daylab.dev 실측 0건 → 92건).
