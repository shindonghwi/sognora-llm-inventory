---
name: sg-web-replicate
description: 레퍼런스 웹사이트의 프론트를 첫 진입 팝업·저장상태·전 라우트·반응형·상호작용·모션까지 측정값과 원본 자산으로 완전 복제하고 route×viewport×state strict 게이트로 검증한다. 트리거 — "이 사이트 똑같이 만들어줘", "완전 복제", "레퍼런스 복제", "이 페이지 클론", "원본이랑 비교", "픽셀 단위로 맞춰줘", "replicate this site", "clone this page". 비대상 — 새 디자인 창작은 sg-landing-forge, 백엔드·서버 기능 구현은 아님.
---

# sg-web-replicate — 완전 복제 게이트

목표는 정적 스크린샷 유사가 아니다. 대상 프론트의 **탐색된 모든 라우트 × 모든 계약 viewport × 모든 관찰 가능한 상태**를 같은 조건에서 재현하고, 기계 집계가 모두 통과한 경우에만 완료다. 서버 데이터 영역은 같은 화면의 로컬 fixture로 채우며 서버 로직·DB·실결제 같은 기능은 구현하지 않는다.

측정값·게이트·안전 경계는 [rules.md](references/rules.md)가 SSOT다. 상호작용 형식은 [state-contract.md](references/state-contract.md), 명세는 [spec-template.md](references/spec-template.md), 빈 프로젝트 배치는 [layout-presets.md](references/layout-presets.md)를 필요할 때 읽는다.

## 계기 경로

플러그인 경로는 결정적으로 해석한다. 임의 `find … | head -1` 폴백으로 다른 버전을 고르지 않는다. `sg`가 없는 Codex 플러그인 환경은 설치 목록의 정확한 plugin id로 찾고, Claude 플러그인은 제공된 root를 쓴다.

```bash
if command -v sg >/dev/null 2>&1; then
  S=$(sg path sg-web-replicate 2>/dev/null)
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  S="$CLAUDE_PLUGIN_ROOT/skills/sg-web-replicate/scripts"
elif command -v codex >/dev/null 2>&1; then
  S=$(codex plugin list --json | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      const p=JSON.parse(s).installed.find(x=>x.pluginId==="sognora-llm-inventory@sognora-llm-inventory");
      if(p?.source?.path) process.stdout.write(p.source.path+"/skills/sg-web-replicate/scripts");
    })')
fi
test -d "$S" || exit 2
```

## 불변식

1. 눈대중이나 캡처 장수는 완료 근거가 아니다. 완료 근거는 `verify-site.mjs` exit 0과 `completion.json.pass=true`뿐이다.
2. 원본에서 측정하지 않은 치수·브레이크포인트·duration·easing을 지어내지 않는다.
3. 폰트·이미지·아이콘·영상은 원본 파일을 쓴다. 불가피한 대체는 `override.json`에 사유와 함께 남기며 strict 완료는 대체 자산 0건이다.
4. 정적 모드와 정상 모션 모드를 섞지 않는다. 정적 레이아웃은 모션을 끄고, 상호작용은 정상 모션에서 before/mid/after를 캡처한다.
5. `full.png`, 모든 연속 스크롤 타일, 모든 선언 상태를 실제로 diff한다. 캡처만 하고 비교하지 않은 상태는 누락이다.
6. 페이지 커버리지 100%, 이미지 크기 정확 일치, 상태별 diff 성공이 필수다. 한 장의 깨진 PNG도 전체 실패다.
7. query 상태·canonical·alias·redirect·HTTP status·renderer 증거·catch-all fallback·404를 전 라우트 집계에서 검증한다.
8. 기준/로컬 증거의 개별 SHA-256, 실행 조건 해시, 모든 스크립트(`_shared.mjs`, `_deps.mjs` 포함) 지문을 보존한다.
9. 결제·가입·삭제·전송처럼 원본 상태를 바꾸는 조작은 실행하지 않는다. 상태 계약의 click·press·drag·swipe는 `safe:true`가 없으면 계기가 거부한다.
10. 임의의 고정 날짜를 기본값으로 쓰지 않는다. 기준 캡처가 실제로 시작된 시각을 기록해 같은 증거의 원본/로컬 재현에만 공유한다.

## 절차

### 1. 계약과 라우트 원장

`.sognora/replica/contract.json`에 대상 URL·viewport·DPR·의도적 차이·배치 규칙을 기록한다. 사용자가 범위를 줄이지 않았다면 사이트 전체가 범위다.

```bash
node "$S/discover.mjs" --url <원본URL> --out .sognora/replica/routes.json
```

`discover.mjs`는 sitemap·robots·desktop/mobile DOM·동일 origin JS 번들 후보를 합치고 **모든 후보를 실제 방문**한다. pathname+query, status, redirect chain, canonical, renderer와 404 probe를 기록한다. `limitReached`, `skipped`, 미방문 후보가 있으면 원장이 불완전하므로 다음 단계로 완료할 수 없다.

고유 화면이 20개를 넘거나 이질적 하위 사이트가 섞인 경우에만 그룹별 실제 개수와 함께 범위를 사용자에게 확인한다. 인증 벽은 guest 구간을 계속 진행하면서 세션/테스트 계정/guest 한정 중 하나를 요청한다. 자격증명은 산출물에 남기지 않는다.

### 2. 상태 계약

먼저 깨끗한 브라우저 상태로 전 라우트·viewport의 첫 진입 레이어를 탐색한다. 탐색은 브라우저의 실제 현재 시각을 사용하며 달력 날짜를 덮어쓰지 않는다.

```bash
node "$S/probe-states.mjs" \
  --routes .sognora/replica/routes.json \
  --out .sognora/replica/states.json
```

`popupProbe.failed`와 `popupProbe.unresolved`가 모두 0이어야 한다. 계기는 `role=dialog`·`aria-modal`·positioned popup/overlay와 닫기·오늘 하루 보지 않기 제어를 찾아 열림, 닫힘 before/mid/after, 체크 전후, 닫은 뒤 reload 미노출을 자동 계약한다. 닫기 제어를 안전하게 식별하지 못하면 추측하지 않고 exit 1이다.

[state-contract.md](references/state-contract.md)에 따라 자동 생성 계약에 나머지 상태를 보충한다. DOM의 인터랙티브 요소는 시나리오 selector로 덮거나 `exclusions`에 구체적 사유를 기록한다. 자동 hover 한 건으로 전체 인터랙션을 대신하지 않는다.

- hover, click, focus, keyboard, wheel/scroll, drag/swipe, reload, 메뉴·모달·탭·캐러셀·autoplay를 관찰한다.
- 모션은 before/mid/after 프레임과 `atMs`를 선언한다. 계기는 transition/animation duration·easing도 함께 기록하고 비교한다.
- 여러 요소를 하나의 대표 상태로 검증할 때는 `representativeReason`이 필요하다. 구조·스타일이 다른 요소를 한 대표로 접지 않는다.

상태 계약 뒤에는 메뉴·탭·버튼으로만 드러나는 링크까지 원장에 합치도록 최종 탐색을 다시 실행한다. 이 두 번째 원장이 캡처 범위의 SSOT다.

```bash
node "$S/discover.mjs" --url <원본URL> --states .sognora/replica/states.json --out .sognora/replica/routes.json
```

최종 원장에 새 라우트가 합쳐졌으면 그 라우트의 첫 진입 팝업도 빠지지 않도록 같은 계약에 다시 probe한다.

```bash
node "$S/probe-states.mjs" \
  --routes .sognora/replica/routes.json \
  --base .sognora/replica/states.json \
  --out .sognora/replica/states.json \
  --force
```

`capture-site.mjs`는 최종 route×viewport 전부가 `popupProbe.probed`에 없거나 route 원장 해시가 달라지면 실행을 거부한다.

### 3. 전 라우트 기준 증거와 자산

두 명령은 같은 원장/상태 계약을 읽으므로 동시에 실행할 수 있다.

```bash
node "$S/capture-site.mjs" --routes .sognora/replica/routes.json --states .sognora/replica/states.json --out .sognora/replica/ref &
node "$S/fetch-assets.mjs" --routes .sognora/replica/routes.json --states .sognora/replica/states.json --out .sognora/replica/assets
wait
```

`capture-site.mjs`는 결정적 routeId 아래에 전 viewport 증거를 만들고 하나라도 빠지면 실패한다. `fetch-assets.mjs`는 전 라우트·viewport·상태를 방문해 폰트·이미지·영상·Lottie JSON 후보·모든 inline SVG를 수집하며 비동기 response 저장을 모두 기다린다.

기준 캡처는 실행 시작 순간을 `clock.source=observed-at-capture`로 기록·동결한다. 이는 날짜 기반 노출을 바꾸기 위한 가짜 시각이 아니라, 그 순간 관찰한 원본을 로컬에서 같은 조건으로 재현하기 위한 증거다.

### 4. 명세와 구현

`measure.json`, `state-manifest.json`, `assets.json`을 근거로 [spec-template.md](references/spec-template.md) 형식의 `.sognora/replica/spec.md`를 쓴다. 수치마다 근거 파일·요소·상태를 단다.

대상 프로젝트의 `AGENTS.md`·`CLAUDE.md`·문서 → 기존 관례 → layout preset 순으로 배치를 확정한다. 대표 페이지와 공통 셸을 먼저 수렴시킨 뒤 같은 템플릿 그룹을 구현한다. 자산은 프로젝트 정적 폴더에 놓고, i18n 프로젝트는 기본 locale 메시지로 연결한다.

### 5. 전 사이트 완료 게이트

개별 라우트 진단에는 `diff.mjs`를 쓸 수 있지만 완료 판정은 반드시 집계 명령으로 한다.

```bash
node "$S/verify-site.mjs" \
  --routes .sognora/replica/routes.json \
  --ref .sognora/replica/ref \
  --local http://localhost:3000 \
  --out .sognora/replica/diff \
  --override .sognora/replica/override.json
```

strict는 기본이며 완화할 수 없다. `diff.mjs --relaxed`와 `--no-pixel`은 진단용 exit 3이라 완료 집계가 거부한다. 오차는 위쪽 공통 컨테이너 → 글꼴/자산 → 개별 상태 순으로 고치고 `verify-site.mjs`가 exit 0이 될 때까지 반복한다.

### 6. 완료 보고

`completion.json`을 근거로 라우트 원장, viewport/state 수, 게이트 수치, renderer/fallback/404 결과, override·대체 자산, 미처리 항목을 한 번 보고한다. `pass=false`, 보류 라우트, 선언되지 않은 상태, 대체 자산이 있으면 완료라고 쓰지 않는다.

## 사전 준비와 구버전 증거

```bash
npm i -D playwright pixelmatch pngjs && npx playwright install chromium
```

증거 v3 이전의 `.sognora/replica/ref/`는 재캡처한다. `popupProbe`, 실제 관찰 시작 시각, frame assertion, `evidence.json`, `state-manifest.json`, y좌표 기반 100% 스크롤 타일이 없는 기준은 새 집계 게이트가 거부한다.

범위 확정 직후 goal 기능이 있으면 목표를 “확정된 전 라우트에서 `verify-site.mjs` exit 0”으로 건다. goal은 게이트를 대신하지 않으며 통과 전 complete로 바꾸지 않는다.
