# 상호작용·모션 상태 계약

`states.json`은 담당 에이전트가 인앱 브라우저에서 원본과 로컬에 **똑같이 실행할 관찰 시나리오 원장**이다. 서버 mutation을 수행하는 기능 테스트나 범용 자동 실행 스크립트의 입력이 아니다.

첫 진입 팝업·인트로·cookie layer부터 깨끗한 브라우저 상태로 직접 관찰하고, 나머지 메뉴·탭·캐러셀·전역 입력 상태를 같은 원장에 보충한다.

## 계약 작성 전 동적 인벤토리

구현 전에 브라우저에서 route/template×viewport별로 다음을 직접 관찰한다.

- 최초 로드·지연 등장·인트로·autoplay·timer·영상처럼 입력 없이 변하는 상태
- hover·focus·click·keyboard로 변하는 컨트롤과 메뉴·모달·탭·캐러셀
- wheel·scroll·snap·drag·swipe·touch로 움직이는 장면과 전역 상태 머신
- reload·뒤로가기·query/deep link·cookie/localStorage/sessionStorage로 복원되는 상태
- canvas·WebGL·Lottie·SVG·배경 미디어처럼 일반 DOM 컨트롤 밖에서 변하는 화면

관찰한 동작마다 trigger, before/mid/after, duration/easing, 역방향·복귀·입력 잠금, URL/storage 변화, viewport 차이를 정리한 뒤 아래 `scenarios`로 옮긴다. 시각 변화가 없거나 안전상 실행하지 않는 항목만 구체적 근거와 함께 `exclusions`에 둔다.

`scenarios: []`는 기본값이나 미완성 표시가 아니다. 모든 route/template×viewport에서 동적 요소가 관찰되지 않았을 때만 관찰 시간·실행한 입력·확인한 URL/storage 조건을 `spec.md`에 `none observed`로 남기고 사용할 수 있다. `pending`, `TODO`, 빈 motion/interaction 목록, 원인을 모르는 제외는 완료 계약이 아니다.

```json
{
  "version": 2,
  "scenarios": [
    {
      "id": "entry-popup-dismiss",
      "routes": ["/"],
      "viewports": ["1440x900"],
      "safe": true,
      "trigger": {"type": "click", "selector": "button[aria-label='닫기']"},
      "observe": "[role='dialog']",
      "frames": [
        {"name": "before", "phase": "before"},
        {"name": "mid", "atMs": 100},
        {"name": "after", "atMs": 200}
      ],
      "assertions": [
        {"frame": "before", "selector": "[role='dialog']", "state": "visible"},
        {"frame": "after", "selector": "[role='dialog']", "state": "hidden"}
      ]
    },
    {
      "id": "mobile-menu",
      "routes": ["/", "/pricing"],
      "viewports": ["390x844"],
      "safe": true,
      "trigger": {"type": "click", "selector": "button[aria-label='Menu']"},
      "observe": "nav[aria-label='Primary']",
      "frames": [
        {"name": "before", "phase": "before"},
        {"name": "mid", "atMs": 120},
        {"name": "after", "atMs": 240}
      ]
    },
    {
      "id": "primary-cta-hover",
      "routes": ["*"],
      "viewports": ["1440x900", "768x1024"],
      "trigger": {"type": "hover", "selector": "a[data-qa='primary-cta']"},
      "frames": [
        {"name": "before", "phase": "before"},
        {"name": "mid", "atMs": 75},
        {"name": "after", "atMs": 150}
      ]
    },
    {
      "id": "mobile-menu-item-hover",
      "routes": ["*"],
      "viewports": ["390x844"],
      "safe": true,
      "setup": [
        {"type": "click", "selector": "button[aria-label='Menu']", "waitMs": 240}
      ],
      "trigger": {"type": "hover", "selector": "nav[aria-label='Mobile'] a[href='/pricing']"},
      "frames": [
        {"name": "before", "phase": "before"},
        {"name": "after", "atMs": 150}
      ]
    }
  ],
  "exclusions": [
    {
      "routes": ["*"],
      "viewports": ["*"],
      "selector": "a[data-no-visual-state]",
      "reason": "브라우저 기본 링크이며 원본 computed style의 전 상태가 동일"
    }
  ]
}
```

## 필드

- `id`: 전 파일에서 유일한 상태 이름.
- `routes`, `viewports`: 생략 시 `*`. query 포함 route를 쓸 수 있다.
- `trigger.type`: `hover`, `click`, `focus`, `press`, `wheel`, `scroll`, `drag`, `swipe`, `touch`, `wait`, `reload`, `back`.
- `setup`: 메뉴를 연 뒤 항목 hover처럼 선행 상태가 필요할 때 순서대로 실행할 trigger 배열. 각 단계는 선택적으로 `waitMs`를 가진다.
- `trigger.selector`: 대상 하나로 좁히는 selector. `press`는 `key`, `drag`는 `to`, wheel/scroll은 `deltaX/Y`, swipe는 `startX/Y`, `endX/Y`를 추가한다.
- `safe:true`: click·press·drag·swipe에 필수. 외부 상태를 바꾸지 않는다는 계약이다.
- `observe`: transition/animation style을 읽을 대상. 생략 시 trigger selector.
- `frames`: before 한 장과 조작 후 `atMs` 오름차순 프레임. duration/easing과 중간 프레임을 증명하려면 before/mid/after를 둔다.
- `assertions`: 프레임별 selector와 기대 상태. `visible`, `hidden`, `exists`, `absent`, `checked`, `unchecked`처럼 원본에서 관찰한 결과를 적고 로컬에서 같은 방식으로 확인한다.
- `representativeReason`: selector가 여러 요소를 잡을 때만 필요. 같은 component contract임을 근거로 적는다.
- `exclusions`: 시나리오에서 제외할 인터랙티브 요소의 selector와 구체적 사유. 사유 없는 제외는 거부한다.

메뉴/모달/탭/캐러셀처럼 닫힘과 열림이 모두 의미 있으면 각각 관찰 가능한 프레임에 포함한다. autoplay는 `wait`, 키보드는 `focus` 뒤 `press`, 스크롤 전환은 `wheel` 또는 `scroll`로 별도 시나리오를 둔다.

양방향이나 반복 동작은 한쪽만 검증하지 않는다. 열기/닫기, 다음/이전, 스크롤 진입/이탈, drag/swipe 방향, autoplay pause/resume, 마지막 장면 뒤 초기화처럼 사용자에게 보이는 복귀 경로를 별도 시나리오 또는 setup+trigger 조합으로 선언한다.

오늘 하루 보지 않기는 체크 전후와 `setup: checkbox click → close click`, `trigger: reload` 뒤 popup `hidden` assertion을 별도 시나리오로 둔다. 각 시나리오는 깨끗한 브라우저 상태에서 시작하되, 저장상태 복원 시나리오만 해당 시나리오 안에서 만든 cookie/localStorage를 이어서 사용한다.
