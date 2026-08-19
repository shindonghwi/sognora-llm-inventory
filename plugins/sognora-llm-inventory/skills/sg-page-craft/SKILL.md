---
name: sg-page-craft
description: 랜딩 말고 **나머지 페이지**를 같은 제품처럼 만든다 — 카탈로그(고르는 화면)·도구 화면(직접 써보는 곳)·요금제·문의·정책·대시보드. **페이지 유형을 사용자의 동사로 먼저 정하고**(고른다/쓴다/정한다/적는다/본다), 랜딩 구조로 흘러가면 기계가 잡는다. 랜딩이 정한 토큰을 상속해 팔레트 표류를 막고, 페이지 유형별 근거 규칙(요금제 비교 구조·가격 표기 법적 요건·폼 규범)을 따르며, "페이지가 실제로 살아 있는가"(런타임 에러·콘솔·CSS 클래스 불일치·빈 상태)를 기계로 검사한다. 치수는 Spectrum·Carbon·Primer 토큰에서 인용하고 지어내지 않는다. 트리거 — "요금제 페이지 만들어줘", "기능 소개 페이지", "문의 페이지", "대시보드 화면 만들어줘", "하위 페이지 개편", "이 페이지도 같은 톤으로". 비대상 — 랜딩 자체는 sg-landing-forge, 픽셀 복제는 sg-web-replicate.
---

# sg-page-craft — 나머지 페이지

> 규칙·수치·근거는 `references/page-rules.md`(SSOT).
> **랜딩은 방문자를 설득하고, 이 페이지들은 결정을 돕는다.** 목적이 다르니 규칙도 다르다 — 랜딩 규칙(히어로는 결과를 판다 등)을 그대로 가져오면 안 된다.

## 왜 필요한가

랜딩만 공들이면 하위 페이지가 다른 제품처럼 보인다. 실전 사고 셋이 이 스킬의 근거다:

1. **팔레트 표류** — 랜딩과 요금제가 서로 다른 계열의 팔레트를 썼다. 헤더·푸터는 공유하는데 본문에 들어서는 순간 다른 팀이 만든 것처럼 보인다. (이후 랜딩이 개편되며 상당 부분 수렴했지만, **본문 뉴트럴 계열이 여전히 갈렸다** — 한쪽은 웜 그레이, 한쪽은 쿨 슬레이트. 토큰이 한 벌로 정리되지 않으면 이 미세 이탈이 남는다.)
2. **비교 불가능한 비교표** — 세 플랜의 항목이 서로 달라(사용자 1명 / 팀 공유 크레딧 / 브랜드 설정) 행 축이 성립하지 않았다. 정작 "기능은 전 플랜 동일, 크레딧·인원·팀 관리만 다름"이라는 핵심 사실은 접힌 FAQ 안에 있었다.
3. **죽은 페이지** — CSS는 `.planLedger/.planRow`를 정의하는데 컴포넌트는 `.planGrid/.planCard`를 써서 레이아웃이 통째로 안 먹었고, 나중엔 `plan.highlights` undefined로 런타임 에러가 났다. **한 번 열어보기만 했어도** 잡혔다.

## 강제 지도 (의무 → 판정자)

| 의무 | 판정자 |
|---|---|
| 랜딩 토큰 상속(하위 페이지가 자기 팔레트를 만들지 않음) | `conform.mjs`(sg-landing-forge 계기, `--tokens`로 랜딩 tokens.json 지정) |
| 페이지가 살아 있음 — 런타임 에러·콘솔 에러·빈 화면 | `alive.mjs` |
| **CSS 모듈 클래스 불일치**(컴포넌트가 쓰는 styles.X가 CSS에 없음) | `alive.mjs` — 절반 이상이면 🔴 |
| 컨테이너 적용(본문이 화면 좌단에 밀착하지 않음) | `alive.mjs` |
| 목록 렌더에 빈 상태 분기 존재 | `alive.mjs`(경고) + 사람 확인 |
| **유형별 필수 구조**(카탈로그=그리드+진입 액션, 도구=입력+실행) | `alive.mjs --type` — 미달 시 🔴 |
| **랜딩 표류 금지**(카탈로그·도구에 후기·가격 섹션 금지) | `alive.mjs --type` LANDING-DRIFT |
| 카피 길이·금칙어(문장 25단어·문단 5문장·제목 65자) | `copylint.mjs` |
| AI 티 | `detect.mjs`(sg-landing-forge) — **단일 패턴으로 실패시키지 않는다** |
| 컴포넌트 치수를 지어내지 않음 | Spectrum·Carbon·Primer 토큰 인용(§1) |
| 근거 없는 통설을 규칙·주장으로 쓰지 않음 | page-rules §9 격리 목록 |

## 공정

- **P0 계약** — **먼저 동사를 정한다**: 이 페이지에서 사용자가 읽는가·고르는가·쓰는가·정하는가·적는가·보는가. 동사가 유형을 결정한다(page-rules §0b). **랜딩 구조를 쓸 수 있는 건 '읽는다'뿐이다.** 그다음 랜딩 tokens.json 위치와 이 페이지가 돕는 결정을 한 문장으로. 사실 재고는 프로젝트 문서·실제 제품에서 전수 추출한다(가격·플랜·제약은 지어내지 않는다).
- **P1 유형 규칙 적재** — `references/page-rules.md`에서 해당 유형 절만 읽는다. 치수가 필요하면 §1 토큰 소스에서 인용(추측 금지).
- **P2 빌드** — 랜딩 토큰만 사용. 요금제면 **열=플랜·행=속성** 구조로, 카드 노출 차별 속성은 2~3개. 폼이면 GOV.UK 규범(라벨 위·제출 시 검증·입력값 보존).
- **P3 검사** — 한 번에:
  ```
  node scripts/alive.mjs --url <URL> --type <catalog|tool|pricing|form|dashboard|landing> --src <컴포넌트 디렉터리> --out _page/qa
  node scripts/copylint.mjs --url <URL> --out _page/qa
  node scripts/conform.mjs --tokens <랜딩 tokens.json> --url <URL>   # 토큰 상속 검증(forge 계기 심)
  node scripts/detect.mjs --url <URL> --out _page/qa/detect          # 시각 AI 티(forge 계기 심)
  # 카피 AI 티 — 내부 기획 용어·능력 서술 도배·용어 표류
  # GENRE: --type landing 이면 랜딩, 그 외(catalog/tool/pricing/form/dashboard)는 UI
  GENRE=$([ "<TYPE>" = "landing" ] && echo 랜딩 || echo UI)
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((j.desktop?.copy||[]).join("\n"))' \
    _page/qa/detect/scan.json | python3 ../sg-ko-humanize/scripts/detect_ko.py - --genre "$GENRE"
  ```
  마지막 줄이 exit 1이면 실패다. **`detect.mjs`는 보더·레이아웃만 본다 — 카피는 한 글자도 읽지 않는다.** 두 계기는 다른 축이고, 카피 축은 v1.6.4까지 판정자가 없었다.
- **P4 눈 검수** — 랜딩과 나란히 놓고 **같은 제품으로 보이는가**, 그리고 이 페이지가 돕기로 한 결정이 실제로 쉬워졌는가. 제품 화면이면 빈 상태·로딩·오류·권한없음 화면을 직접 열어본다(기계는 존재 여부만 안다).

## 계기

| 계기 | 역할 |
|---|---|
| `alive.mjs` | 살아있는가 — 런타임·콘솔·빈 화면·CSS 클래스 불일치·좌단 밀착·빈 상태 분기 |
| `copylint.mjs` | 카피 길이·금칙어(GOV.UK 규범 + 한글 상투어 + 제작자 시점 서술) |
| `conform.mjs`·`detect.mjs` | sg-landing-forge 계기를 자기 위치 기준으로 찾아 실행하는 심 — 토큰 상속 검증·**시각** AI 티. 상대경로에 의존하지 않는다 |
| `detect_ko.py`(sg-ko-humanize) | **카피** AI 티 — 내부 기획 용어(§8)·능력 서술 도배. `detect.mjs`가 `scan.json`에 실은 실제 렌더 카피를 받는다. `copylint.mjs`(마케팅 상투어·주어 시점)와는 다른 축이다 |

## 사전 준비

```
npm i -D playwright && npx playwright install chromium
```

## 옵션

- `유형: 랜딩|카탈로그|도구|요금제|폼|대시보드` / `토큰: <경로>` / `소스: <컴포넌트 디렉터리>`
