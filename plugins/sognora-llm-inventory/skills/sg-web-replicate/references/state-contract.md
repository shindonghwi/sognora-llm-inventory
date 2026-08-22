# 상호작용·모션 상태 계약

`states.json`은 원본과 로컬에 **똑같이 실행할 관찰 시나리오**다. 서버 mutation을 수행하는 기능 테스트가 아니다.

첫 진입 팝업은 먼저 `probe-states.mjs`로 자동 생성한다. 생성된 계약을 지우지 말고 나머지 메뉴·탭·캐러셀 상태를 보충한다.

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
- `trigger.type`: `hover`, `click`, `focus`, `press`, `wheel`, `scroll`, `drag`, `swipe`, `wait`, `reload`.
- `setup`: 메뉴를 연 뒤 항목 hover처럼 선행 상태가 필요할 때 순서대로 실행할 trigger 배열. 각 단계는 선택적으로 `waitMs`를 가진다.
- `trigger.selector`: 대상 하나로 좁히는 selector. `press`는 `key`, `drag`는 `to`, wheel/scroll은 `deltaX/Y`, swipe는 `startX/Y`, `endX/Y`를 추가한다.
- `safe:true`: click·press·drag·swipe에 필수. 외부 상태를 바꾸지 않는다는 계약이다.
- `observe`: transition/animation style을 읽을 대상. 생략 시 trigger selector.
- `frames`: before 한 장과 조작 후 `atMs` 오름차순 프레임. duration/easing과 중간 프레임을 증명하려면 before/mid/after를 둔다.
- `assertions`: 프레임별 `selector` 상태. `visible`, `hidden`, `exists`, `absent`, `checked`, `unchecked`를 지원하며 원본과 로컬 모두 동일하게 통과해야 한다.
- `representativeReason`: selector가 여러 요소를 잡을 때만 필요. 같은 component contract임을 근거로 적는다.
- `exclusions`: 시나리오에서 제외할 인터랙티브 요소의 selector와 구체적 사유. 사유 없는 제외는 거부한다.

메뉴/모달/탭/캐러셀처럼 닫힘과 열림이 모두 의미 있으면 각각 관찰 가능한 프레임에 포함한다. autoplay는 `wait`, 키보드는 `focus` 뒤 `press`, 스크롤 전환은 `wheel` 또는 `scroll`로 별도 시나리오를 둔다.

오늘 하루 보지 않기는 체크 전후와 `setup: checkbox click → close click`, `trigger: reload` 뒤 popup `hidden` assertion을 별도 시나리오로 둔다. 각 시나리오는 새 context에서 시작하므로 다른 시나리오의 cookie/localStorage가 섞이지 않는다.
