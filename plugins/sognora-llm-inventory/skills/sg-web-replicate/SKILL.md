---
name: sg-web-replicate
description: 인앱 브라우저와 서브에이전트로 레퍼런스 웹사이트의 전 라우트·반응형·상호작용·모션을 직접 관찰해 복제하고, 브랜드는 유사한 가상 이름으로 바꾸며 모든 시각 자산은 영역·규격을 먼저 만든 뒤 imagegen으로 새로 생성한다. 트리거 — "이 사이트 똑같이 만들어줘", "완전 복제", "레퍼런스 복제", "이 페이지 클론", "원본이랑 비교", "픽셀 단위로 맞춰줘", "replicate this site", "clone this page". 비대상 — 새 디자인 창작은 sg-landing-forge, 백엔드·서버 기능 구현은 아님.
---

# sg-web-replicate — 브라우저 우선 완전 복제

목표는 정적 스크린샷 유사가 아니다. 대상 프론트의 **탐색된 모든 라우트 × 계약 viewport × 관찰 가능한 상태**를 직접 재현한다. 레퍼런스가 정적이라고 가정하지 말고 동적 구조를 레이아웃과 같은 범위로 조사·구현한다. 서버 데이터 영역은 같은 화면의 로컬 fixture로 채우며 서버 로직·DB·실결제는 구현하지 않는다.

측정·완료 기준은 [rules.md](references/rules.md), 상호작용 형식은 [state-contract.md](references/state-contract.md), 브랜드·이미지 생성은 [visual-adaptation.md](references/visual-adaptation.md), 명세는 [spec-template.md](references/spec-template.md), 빈 프로젝트 배치는 [layout-presets.md](references/layout-presets.md)를 따른다.

## 작업 원칙

1. 인앱 브라우저에서 실제로 관찰한 화면·DOM·computed style·URL·storage·network·입력을 근거로 삼는다.
2. 이 스킬은 범용 크롤러·캡처·diff 스크립트를 제공하거나 그 통과를 작업 시작 조건으로 삼지 않는다. 대상 프로젝트에도 같은 범용 계기를 새로 만들지 않는다.
3. Cloudflare·광고·분석·iframe 같은 제3자 요청이 계속 열려 있어도 페이지가 화면과 입력에 정상 반응하면 탐색을 계속하고 외부 잡음으로 기록한다.
4. 전 라우트와 viewport를 실제 방문하고 각 동적 상태를 원본과 로컬에서 같은 입력 순서로 재생한다. 캡처 장수만으로 완료를 주장하지 않는다.
5. 원본에서 측정하지 않은 치수·브레이크포인트·duration·easing을 지어내지 않는다.
6. 동적 요소는 후속 장식이 아니다. 정적 UI 구현 전에 트리거·중간 상태·최종 상태·복귀 조건을 상태 계약으로 확정한다.
7. interaction/motion 계약이 비어 있거나 `pending`·`TODO`·미분류 상태가 남아 있으면 완전 복제가 아니다.
8. 원본 브랜드·이미지·아이콘·로고·영상 프레임을 결과물에 쓰지 않는다. 이미지 영역과 규격을 먼저 구현한 뒤 모든 고유 자산을 imagegen으로 생성한다.
9. 이미지 내부 문구·지도·평면도·차트·QR·아이콘·로고도 imagegen 범위다. 실제 시각 내용을 HTML/CSS/SVG/canvas로 다시 그리거나 자산 수 때문에 생략하지 않는다.
10. 결제·가입·삭제·전송처럼 원본 외부 상태를 바꾸는 조작은 실행하지 않는다. 안전한 조회성 입력만 관찰한다.

## 1. 범위와 병렬 조사

`.sognora/replica/`에 다음 원장을 먼저 만든다.

- `contract.json`: 원본 URL, viewport, DPR, locale/theme, 인증 범위, 의도적 차이
- `routes.json`: 요청 route와 query, status/redirect/canonical, 발견 근거, 실제 방문 여부
- `states.json`: route×viewport별 안전한 입력과 before/mid/after 상태
- `spec.md`: 측정값, 디자인 토큰, 동작, visual slot, 근거 위치
- `qa-ledger.json`: 원본/로컬 비교 결과와 증거 파일

서브에이전트를 사용할 수 있으면 시작부터 병렬화한다.

- 라우트·템플릿 그룹별 조사
- 공통 동적 시스템과 전역 입력 조사
- desktop/tablet/mobile 반응형 조사
- visual slot·이미지 내부 문구·브랜드 흔적 조사

각 결과는 route·viewport·상태·입력·before/mid/after·복귀·증거를 포함해야 한다. 정적 캡처만 제출한 결과는 동적 조사 완료로 합치지 않는다. 고유 화면이 20개를 넘거나 이질적 하위 사이트가 섞여도 임의로 줄이지 말고 전부 진행한다. 인증 벽처럼 사용자 권한이 실제로 필요한 경우에만 guest 범위를 계속 조사하면서 필요한 입력을 요청한다.

라우트·동적 상태·visual slot 인벤토리가 끝나기 전에는 구현을 시작하지 않는다. 사이트가 크면 첫 시간 전체를 조사에 쓰며 시간에 맞춰 범위를 줄이지 않는다.

## 2. 인앱 브라우저로 라우트 탐색

깨끗한 브라우저 상태와 각 viewport에서 원본을 연다. 시작 URL, sitemap/robots에 드러난 경로, header/footer 링크, 본문 링크, 모바일 메뉴, 팝업·탭·캐러셀·안전한 버튼 뒤에 드러나는 경로, 필요한 경우 동일 origin 번들에 나타난 후보를 합친다.

후보는 모두 실제로 방문해 다음을 기록한다.

- pathname+query, 최종 URL, redirect, status, canonical, title
- desktop/mobile에서만 보이는 링크와 화면 차이
- 첫 진입 popup/cookie layer와 저장상태
- 실제 404 경로의 화면과 동작
- 정상 화면인지, 인증 벽인지, 외부 위젯만 실패했는지

날짜·검색어·상품 ID처럼 값이 사실상 무한한 동적 URL은 화면 템플릿과 사용자 동작 계약이 같은지 브라우저에서 확인한 뒤 route family로 묶는다. 대표 URL, 파라미터 규칙, 같은 family라는 근거와 예외를 `routes.json`에 기록한다. sitemap·navigation·원본이 실제로 노출한 유한 URL은 family로 숨기지 말고 전부 방문한다.

로드된 페이지에서 viewport만 바꿔 쓰지 말고 viewport별 새 브라우저 상태로 다시 진입한다. 페이지가 보이고 입력에 반응하면 끝나지 않는 제3자 요청을 기다리지 않는다. 반대로 핵심 본문·폰트·라우트·상태가 아직 변하는 중이면 충분히 관찰하고 그 실제 시간을 증거에 남긴다.

## 3. 동적 구조 선조사

각 route/template×viewport에서 두 번 관찰한다.

1. 입력 없이 최초 로드·지연 등장·인트로·autoplay·영상·시간 기반 전환·sticky/header 변화를 본다.
2. 안전한 범위에서 hover·focus·click·keyboard·wheel·scroll·drag·swipe·touch·reload·뒤로가기·query/deep-link 진입을 실행한다.

문서/window 전역 휠·터치 상태 머신, 스크롤 스냅, canvas/WebGL/Lottie, 배경 미디어, 모바일 전용 제스처처럼 DOM 버튼 없이 작동하는 동작도 조사한다. 원본 번들은 동작을 이해하는 보조 근거로만 사용하고 프레임워크 이름으로 동작을 추정하지 않는다.

[state-contract.md](references/state-contract.md)에 따라 관찰한 동작을 scenario 또는 구체적 사유가 있는 exclusion으로 전부 분류한다. 양방향·반복·저장상태는 열기만 보지 말고 닫기, 다음/이전, 진입/이탈, pause/resume, reload 복원까지 기록한다. 동적 요소가 없다고 판단한 셀도 관찰 시간·실행 입력·확인한 URL/storage를 `none observed` 근거로 남긴다.

## 4. 기준 증거와 명세

원본을 정적 레이아웃 관찰과 정상 모션 관찰로 나눈다.

- 정적 레이아웃: full page와 연속 화면, 주요 블록 x/y/w/h, typography, 색·radius·shadow, responsive 변화
- 정상 모션: 각 scenario의 before/mid/after, duration/easing, 입력 잠금, URL/storage 변화

인앱 브라우저의 screenshot과 조사 메모를 `.sognora/replica/evidence/reference/`에 route/viewport/state가 드러나는 이름으로 보존한다. 같은 조건의 로컬 증거는 `evidence/local/`에 둔다. 원본 자산의 screenshot/crop은 imagegen 구도·밀도 참고용 증거일 뿐 최종 앱에 복사하지 않는다.

치수와 style은 인앱 브라우저가 제공하는 DOM·computed-style inspection/evaluation으로 직접 읽는다. 해당 기능이 없는 환경에서는 눈대중으로 수치를 채우거나 범용 계기를 만들지 말고 그 항목을 미측정으로 남겨 완료를 보류한다.

증거를 바탕으로 [spec-template.md](references/spec-template.md) 형식의 `spec.md`를 작성한다. 수치마다 screenshot, selector, computed style 또는 브라우저 관찰 위치를 연결한다.

## 5. 구현과 이미지 생성

대상 프로젝트의 `AGENTS.md`·`CLAUDE.md`·문서 → 기존 관례 → [layout-presets.md](references/layout-presets.md) 순으로 배치를 결정한다. 기존 정상 코드는 재사용하고 대표 페이지와 공통 셸을 먼저 수렴시킨 뒤 같은 템플릿 그룹을 구현한다.

원본이 CSS·Web Animations·jQuery·Framer Motion·GSAP·canvas 중 무엇을 썼는지는 강제하지 않는다. 프로젝트에 맞는 수단으로 관찰된 상태 전환, timing/easing, 입력 잠금, 역방향·초기화, URL/storage 복원과 viewport 차이를 재현한다.

이미지는 먼저 전 viewport/state의 컨테이너·규격·crop을 구현하고 visual slot 계약을 완성한다. 그 뒤 가상 브랜드명을 확정하고 [visual-adaptation.md](references/visual-adaptation.md)를 전부 읽어 각 asset/variant마다 built-in imagegen을 별도로 실행한다. 이미지 내부 문구도 생성 결과에 포함하며 HTML/CSS overlay로 보정하지 않는다.

built-in imagegen을 사용할 수 없거나 필수 문구·QR·구조를 반복 생성해도 충족하지 못하면 해당 visual slot을 누락하지 말고 완료를 보류한다. 사용자의 별도 승인 없이 다른 생성 API나 stock 자산으로 우회하지 않는다.

## 6. 브라우저 QA

원본과 로컬을 같은 viewport·route·state로 열어 `qa-ledger.json`의 모든 셀을 직접 비교한다.

- 첫 화면, full page, responsive 구조와 overflow
- 주요 블록·타이포그래피·간격·색·테두리·그림자
- 모든 interaction/motion scenario의 before/mid/after와 복귀
- URL/query/redirect/canonical/404와 reload·storage 복원
- visual slot 규격·crop·주제·구도·문구·QR과 브랜드 잔존
- console error, 깨진 링크, 누락 asset, 런타임 오류

오차는 공통 컨테이너 → font/slot → 개별 상태 순으로 고친다. 대상 프로젝트가 이미 가진 lint·type-check·build·test 명령은 실행하되, 이 스킬을 위해 범용 크롤러나 완료 게이트를 새로 작성하지 않는다. 생성 이미지 내부는 원본 pixel equality 대상이 아니며 slot 경계·위치·크기·crop과 주변 UI는 정확히 맞춘다.

## 7. 완료 보고

다음이 모두 충족될 때만 완전 복제라고 보고한다.

- `routes.json`의 모든 후보가 실제 방문됨
- route×viewport×state의 `qa-ledger.json` 모든 셀이 `pass`
- 동적 인벤토리가 scenario/exclusion/근거 있는 `none observed`로 100% 분류됨
- interaction/motion에 `pending`·`TODO`·빈 미조사 계약이 없음
- visual slot이 생성·연결·검증된 imagegen asset/variant와 1:1로 대응함
- 원본 브랜드·원본 시각 자산·stock·placeholder 잔존이 0건임
- 대상 프로젝트의 기존 lint·type-check·build와 관련 test가 통과함

완료 보고에는 라우트 수, viewport/state 수, 동적 시나리오 수, visual slot/생성 asset 수, 브랜드 잔존 결과, 프로젝트 검증 결과와 미처리 항목을 포함한다. 한 항목이라도 미달이면 현재 상태를 정확히 보고하고 “전체 복제 완료”라고 표현하지 않는다. 커밋·푸시·배포는 사용자가 요청할 때만 한다.
