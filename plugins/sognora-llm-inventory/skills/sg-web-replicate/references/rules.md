# sg-web-replicate 룰북

## 기본 계약

- viewport: `1440x900`, `768x1024`, `390x844`; DPR 1. 원본에서 별도 breakpoint가 관찰되면 추가한다.
- 범위: 브라우저에서 발견하고 실제 방문한 전 라우트. pathname과 query를 별개 상태로 보존한다.
- 테마/locale: 원본 기본 상태. 사용자가 지정하면 계약에 추가한다.
- 인증: guest 기본. 제공받은 로그인 상태나 개인정보는 산출물에 복사하지 않는다.
- 시각: 원본과 로컬을 가능한 한 가까운 시점과 같은 viewport·state에서 비교한다. 날짜 기반 레이어를 임의 시각으로 숨기지 않는다.
- 준비 판정: 핵심 본문·폰트·이미지·상태가 보이고 사용자 입력에 정상 반응하면 관찰을 시작한다. 끝나지 않는 Cloudflare·광고·분석·iframe 요청만으로 페이지를 실패시키지 않는다.
- 안전: 결제·가입·삭제·작성·전송·장바구니 등 외부 상태를 바꾸는 입력은 실행하지 않는다.

## 브라우저 비교 기준

| 대상 | 완료 조건 |
|---|---|
| 주요 블록 x/y/w/h | 같은 viewport에서 오차 ≤ 1px |
| font family/weight/size/line-height | 원본 computed style과 일치 |
| 색·radius·shadow | 원본 computed style과 시각적으로 일치 |
| responsive 구조·overflow | 원본과 동일, 의도하지 않은 가로 overflow 0건 |
| route × viewport × state | 원본/로컬 증거와 QA 판정 100% |
| 동적 인벤토리 | scenario/exclusion/근거 있는 `none observed` 분류 100% |
| interaction/motion | before/mid/after·복귀·저장상태 재현 100% |
| visual slot | imagegen asset/variant 연결·검증 100% |
| 이미지 내부 문구·브랜드 매핑 | 오탈자·원본 브랜드 잔존 0건 |
| status·redirect·canonical·404 | 원본에서 관찰한 동작과 일치 |
| console·링크·asset·runtime | 신규 오류·깨짐·누락 0건 |
| 원본·stock·placeholder 자산 | 최종 앱 잔존 0건 |

수치 오차는 인앱 브라우저의 DOM box와 computed style로 확인한다. 생성 이미지 내부는 원본 pixel equality 대상이 아니지만 slot 경계·위치·크기·aspect·crop과 주변 UI는 정확히 맞춘다. 주제·구도·색감·정보 밀도·문구 정확성은 확대된 원본/생성 결과를 나란히 보고 판정한다.

## 증거 원장

`.sognora/replica/`에 다음 파일을 유지한다.

- `contract.json`: URL, viewport, DPR, locale/theme, 범위와 의도적 차이
- `routes.json`: route/query, 발견 근거, 실제 방문, status/redirect/canonical/404
- `states.json`: 안전한 입력, before/mid/after, duration/easing, 복귀와 저장상태
- `spec.md`: 디자인·동작·visual slot과 각 값의 브라우저 근거
- `qa-ledger.json`: route×viewport×state별 reference/local 증거, 판정, 미해결 항목
- `evidence/reference/`, `evidence/local/`: route·viewport·state가 드러나는 screenshot과 조사 메모

증거 파일 이름과 원장 항목이 서로 연결되어야 한다. screenshot이 없는 상태, 실행하지 않은 입력, 이유 없는 `pass`는 인정하지 않는다. 원본이 외부 요청 때문에 완전한 network idle에 도달하지 않아도 화면과 입력이 정상이라면 `externalNoise`에 요청과 영향을 기록하고 계속한다.

`qa-ledger.json`의 최소 셀 형식은 다음과 같다.

```json
{
  "route": "/pricing?plan=pro",
  "viewport": "390x844",
  "stateId": "mobile-menu-open",
  "referenceEvidence": ["evidence/reference/pricing/390x844/mobile-menu-open.png"],
  "localEvidence": ["evidence/local/pricing/390x844/mobile-menu-open.png"],
  "checks": {
    "layout": "pass",
    "behavior": "pass",
    "responsive": "pass",
    "visualSlots": "pass",
    "content": "pass"
  },
  "measurements": [
    {"selector": "header", "field": "height", "reference": 72, "local": 72, "unit": "px"}
  ],
  "externalNoise": [],
  "status": "pass",
  "notes": ""
}
```

`status: pass`는 모든 `checks`가 pass이고 reference/local 증거가 모두 있을 때만 쓴다. 한 항목이라도 미확인·미달이면 `fail` 또는 `pending`으로 남긴다.

## 브랜드·시각 자산

[visual-adaptation.md](visual-adaptation.md)를 전부 적용한다. DOM 영역과 source pixel 규격을 먼저 확정한 뒤 사진·배경·아이콘·문구 포함 배너·지도·평면도·차트·QR·로고를 모두 imagegen으로 생성한다. 이미지 내부 내용을 HTML/CSS/SVG/canvas로 다시 그리지 않는다.

고유 자산과 필요한 responsive variant 수가 visual slot 계약과 정확히 맞아야 한다. 원본 파일은 reference evidence로만 보존하며 최종 앱의 import, public/static 파일, CSS URL, runtime request에 들어가면 실패다. 자산 수가 많다는 이유로 대표 이미지·stock·placeholder로 축약하지 않는다.

## 동적 범위 선확정

레퍼런스를 정적 페이지로 가정하지 않는다. 구현 전에 route/template×viewport별로 입력 없는 관찰과 안전한 입력 관찰을 모두 수행한다.

- 입력 없음: 최초 로드, 지연 등장, 인트로, autoplay, 영상·오디오, timer, sticky/header, 자동 캐러셀.
- 포인터·키보드: hover, focus, click, press, escape, tab 이동.
- 스크롤·제스처: wheel, scroll, snap, drag, swipe, touch, 문서/window 전역 입력.
- 상태 복원: reload, 뒤로가기, query/deep link, cookie/localStorage/sessionStorage.
- 비DOM 렌더링: canvas, WebGL, Lottie, SVG animation, 배경 미디어.

각 항목에 trigger, before/mid/after, duration/easing, 역방향·복귀·입력 잠금, URL/storage 변화와 viewport 차이를 기록한다. 공통 템플릿 대표 조사는 가능하지만 `representativeReason`을 남기고 각 route에 별도 동작이 없는지 확인한다. 빈 계약, `pending`, `TODO`, 원인을 모르는 exclusion은 완료 근거가 아니다.

## 첫 진입 레이어와 저장상태

- 전 라우트·viewport를 깨끗한 브라우저 상태로 방문해 dialog, modal, popup, cookie layer, intro를 관찰한다.
- 닫기 전, 닫기 중, 닫힌 뒤와 다시 열기 가능 여부를 기록한다.
- 오늘 하루 보지 않기·다시 보지 않기는 체크 전후와 close→reload 뒤 미노출을 확인한다.
- 팝업 내부 링크·탭·캐러셀·페이지 인디케이터도 일반 interaction과 같은 범위로 다룬다.
- 닫기 제어를 안전하게 식별하지 못하면 추측해서 누르지 말고 미해결로 남긴다.

## 상호작용 완전성

화면에 보이는 링크·버튼·입력·탭·draggable 요소와 전역 입력 동작은 다음 중 하나여야 한다.

- `states.json` scenario가 덮는다.
- `exclusions`에 구체적인 시각/안전 사유가 있다.

열기/닫기, 다음/이전, 진입/이탈, 양방향 drag/swipe, autoplay pause/resume, 마지막 장면 뒤 초기화처럼 사용자에게 보이는 복귀 경로를 한쪽만 확인하지 않는다.

## 라우트 완전성

- desktop/mobile은 각각 새 브라우저 상태로 열고, 로드된 한 페이지의 viewport만 바꿔 조사하지 않는다.
- sitemap/robots, desktop/mobile DOM, 메뉴·팝업·탭·안전한 버튼, 필요한 경우 원본 번들에서 발견한 후보를 합친다.
- 모든 후보를 실제 방문하고 방문 여부와 발견 근거를 `routes.json`에 남긴다.
- 사실상 무한한 날짜·검색어·ID URL만 같은 화면 템플릿과 동작 계약임을 확인한 뒤 route family로 묶고, 대표 URL·파라미터 규칙·근거·예외를 남긴다. 원본이 유한 목록으로 노출한 URL은 전부 방문한다.
- alias, redirect, final route, canonical과 실제 404 화면을 각각 보존한다.
- 서로 달라야 하는 원본 라우트가 로컬에서 같은 catch-all 화면으로 합쳐지지 않았는지 확인한다.

## 구현 배치와 검증

배치는 프로젝트 문서 → 기존 코드 관례 → [layout-presets.md](layout-presets.md) 순이다. 자동 생성 구역은 수정하지 않는다. i18n 프로젝트는 기본 locale 메시지 파일을 사용한다.

대상 프로젝트가 이미 제공하는 lint·type-check·build·test는 실행한다. 이 스킬 자체나 대상 프로젝트에 범용 crawler/capture/diff/완료 게이트를 새로 만들지 않는다. 사이트별 차이는 인앱 브라우저 관찰과 담당 에이전트의 증거 판정으로 처리한다.

## 완료 정의

`qa-ledger.json`의 전 route×viewport×state가 증거와 함께 `pass`이고, 동적 인벤토리·visual slot·브랜드 교체가 모두 완결되며, 원본/stock/placeholder 자산과 `pending`·`TODO`가 0건일 때만 완전 복제다. 일부 캡처, 정적 골격, console error 0건, 사람이 한 번 본 유사성만으로 완료라고 하지 않는다.
