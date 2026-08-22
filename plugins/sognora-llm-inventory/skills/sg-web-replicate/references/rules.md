# sg-web-replicate 룰북 (SSOT)

## 기본 계약

- viewport: `1440x900`, `768x1024`, `390x844`; DPR 1.
- 범위: 발견 후 실제 방문 검증된 전 라우트. pathname과 query를 별개 상태로 보존한다.
- 테마/locale: 원본 기본 상태. 사용자가 지정하면 계약에 추가한다.
- 인증: guest 기본. 제공받은 storage state는 저장소·보고서에 복사하지 않는다.
- 시각: 임의 고정 날짜를 쓰지 않는다. 원본 캡처 시작 순간을 기록해 해당 증거의 로컬 재현에만 사용한다.
- 스크롤: 문서 y좌표 기준 연속 viewport 타일. 마지막 타일은 문서 끝에 맞추며 커버리지 100%가 아니면 실패한다.
- 게이트: strict 한 종류만 완료 판정에 사용한다. relaxed/no-pixel은 진단일 뿐이다.

## 측정과 strict 게이트

| 대상 | 완료 조건 |
|---|---|
| 주요 블록 x/y/w/h | 오차 ≤ 1px |
| font family/weight | 정확 일치, 실제 로드 |
| font size/line-height | 오차 0px |
| 색 | 정규화 RGBA 채널 오차 ≤ 3 |
| radius/shadow 수치 | 오차 ≤ 1px |
| 상태별 pixel diff | ≤ 0.5% |
| full/scroll/interaction 이미지 크기 | 정확 일치 |
| 문서 pixel 커버리지 | ref/local 모두 100% |
| route × viewport × state 캡처·diff | 100% |
| 선언 interaction before/mid/after | 100% |
| transition/animation duration·easing | 문자열 정확 일치 |
| HTTP status·redirect·canonical | 원본 route 기준과 정확 일치 |
| 가로 overflow·신규 console error·누락 asset | 0건 |
| catch-all fallback·404 오동작 | 0건 |
| 대체 자산 | 0건 |

pixel diff는 안티앨리어싱을 흡수하기 위한 비율일 뿐 상태 누락·크기 불일치·디코드 실패를 면제하지 않는다. 비교 실패 상태를 결과에서 제외하지 않는다.

## 두 캡처 모드

1. **정적 레이아웃 모드**: `reducedMotion: reduce`와 CSS transition/animation 비활성화. full page와 y좌표 타일, 요소 치수를 결정적으로 측정한다.
2. **정상 모션 상태 모드**: `reducedMotion: no-preference`, CSS 비활성화 없음. 상태마다 새 context에서 before → trigger → 선언된 `atMs` 순으로 캡처한다.

두 모드는 실제 관찰 시작 시각, elapsed settle budget, viewport, DPR, storage 조건을 증거에 기록한다. 기준과 로컬 조건이 다르면 비교하지 않는다. 날짜 기반 팝업을 억지로 켜거나 끄는 전역 기본 시각은 금지한다.

## 첫 진입 팝업과 저장상태

- 전 라우트·viewport를 각각 새 context로 방문해 `dialog`, `aria-modal`, positioned popup/modal/overlay/cookie layer를 elapsed checkpoint별로 탐색한다.
- 탐색에는 브라우저의 실제 달력 시각을 사용한다. checkpoint는 지연 등장 관찰 시간이지 달력 날짜가 아니다.
- 닫기 전 open, 닫기 transition의 before/mid/after, 닫힌 본문을 모두 캡처한다.
- 오늘 하루 보지 않기·다시 보지 않기처럼 checkable 제어가 있으면 unchecked/checked와 close→reload 후 미노출 assertion을 모두 통과해야 한다.
- 닫기 제어를 식별하지 못한 surface, assertion 실패, popup probe 방문 실패는 완료 불가다.
- 팝업 내부 링크·캐러셀·탭·페이지 인디케이터도 일반 interaction inventory와 같은 계약을 적용한다.

## 상호작용 완전성

화면에 보이는 `a[href]`, `button`, 입력 컨트롤, role button/tab, draggable 요소는 다음 중 하나여야 한다.

- `states.json` 시나리오 selector가 덮는다.
- `exclusions`의 selector와 구체적 사유가 덮는다.

미분류 요소는 capture 실패다. 클릭·press·drag·swipe는 조회성 조작임을 확인하고 `safe:true`를 선언해야 한다. 결제·가입·삭제·작성·전송·장바구니 등 외부 상태를 바꾸는 조작은 계약에 넣지 않는다.

## 라우트 완전성

- sitemap-only·bundle 후보도 실제 방문하지 않으면 원장 완료가 아니다. 상태 계약 뒤 `discover --states`를 다시 실행해 모바일 메뉴·탭·안전한 버튼 조작으로 드러나는 링크와 navigation도 원장에 합친다.
- alias와 redirect는 요청 route, redirect chain, final route, canonical을 각각 보존한다.
- 원본에서 서로 다른 render signature인 라우트들이 로컬에서 하나의 동일 signature가 되면 catch-all/fallback 결함이다.
- 원장 생성 시 무작위성이 없는 전용 missing path를 방문해 404 status/final/canonical 기준을 남기고 로컬과 비교한다.
- `--max` 도달, skipped, 미방문 후보가 있으면 exit 1이다. 상한을 올려 원장을 완성한다.

## 증거 무결성

각 viewport 증거 v3는 다음을 가진다.

- `meta.json`, `measure.json`, `state-manifest.json`
- `full.png`, 모든 `scroll-y-*.png`, 모든 `state-*.png`
- `evidence.json`: 개별 파일 bytes/SHA-256, 실행 조건 해시, scripts 폴더의 모든 `.mjs` 파일명과 합성 SHA-256
- `measure.json.scenarios[].assertions`: 팝업 open/hidden/checked/reload 결과

한 파일의 누락·변조·깨진 PNG·크기 불일치는 fail-closed다. `_shared.mjs`, `_deps.mjs`, 검증 집계기도 지문에서 제외하지 않는다.

## override와 마스크

```json
{
  "ignore": ["img.logo"],
  "masks": {
    "1440x900": [{"x": 0, "y": 200, "w": 300, "h": 160, "reason": "실시간 영상 프레임"}]
  },
  "substituted_assets": [{"file": "images/hero.jpg", "reason": "원본 403"}],
  "notes": "사용자 지시 로고 교체"
}
```

- `ignore`는 요소 수치, `masks`는 픽셀 영역 면제다. 기본 mask y는 문서 좌표이며 fixed/sticky만 `space:"viewport"`를 쓴다.
- reason 없는 mask는 실행 불가다. 한 상태에서 mask 면적 20% 초과는 실패다.
- override는 미달성 사실을 숨기지 않는다. `substituted_assets`가 있으면 완전 복제 strict 완료로 선언하지 않는다.

## 구현 배치와 안전

배치는 프로젝트 문서 → 기존 코드 관례 → `layout-presets.md` 순이다. 자동 생성 구역은 수정하지 않는다. i18n 프로젝트는 기본 locale 메시지 파일을 사용한다.

개인정보는 저장 전에 마스킹하고 robots 정책과 최소 300ms 요청 간격을 지킨다. 원본 브랜드·유료 폰트를 공개 배포할 권리는 사용자 책임이며, 이 스킬은 자사 리뉴얼·승인된 프로토타입에 사용한다.

## 완료 정의

`verify-site.mjs` exit 0, `completion.json.pass=true`, 대체 자산 0건이 동시에 성립해야 한다. 캡처 장수, console error 0건, 일부 라우트 report, 사람이 본 유사성은 완료 정의가 아니다.
