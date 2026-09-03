# P0 — 계약: 의도를 파일로 굳힌다

> 판정자: `contract.mjs --check`(미기입 TODO면 exit 1) · `audit.mjs`(facts 없는 페이지는 빌드 감사에서 exit 2). 되묻기는 계약이 없을 때 한 번뿐이다.

## 왜 파일인가

"의도가 뭐였냐"고 사람에게 되묻는 것은 예의가 아니라 구조 결함이다(실전 사고: 도구 화면을 "제일 잘 만들어졌다"고 보고했는데 기획과 다른 화면이었고, 그 뒤에 되물었다). 의도를 `.sognora/page/contract.json`에 한 번 선언하면 이후 모든 실행은 그 파일 대비로 무인 완주한다.

## 인터뷰 — 시작 시 한 번 (유일한 질문 배치)

계약이 이미 있으면 읽고 진행한다. 없을 때만 한 번의 질문 배치(Claude=선택형 질문 도구, Codex·기타=번호 목록으로 묻고 답을 계약에 적는다):

1. **페이지 목록과 동사** — 만들 화면마다 사용자가 거기서 하는 것: 읽는다(설득/회사/조건) · 고른다 · 쓴다 · 정한다 · 적는다 · 본다. 동사가 유형을 정한다([types](../types/index.md)). 목록에 없는 화면은 `read:<라벨>`·`do:<라벨>`로 선언한다 — 없다고 랜딩으로 회귀하는 것이 이 스킬 최대 사고다.
2. **사실 재고** — 상호·문구·가격·플랜·제약이 있는가. 없는 것은 지어내지 않고 "임시 표기"로 남긴다. 페이지마다 `facts`: 실제로 들어갈 것(항목·수치·상태·컨트롤)을 제품에서 전수 추출한다. 채울 게 없으면 "콘텐츠가 부족하다"가 답이다 — 장식으로 채우지 않는다.
3. **자산 정책** — 실캡처·실사진 중심 / 생성 적극 / 혼합. 증거(E클래스: 얼굴·후기·실적)는 수집만, 생성 절대 금지. 고객 사진이 오기 전에는 imagegen 임시 사진을 사진 창에 두어도 된다(라벨 필수). [systems/assets](../systems/assets.md).
4. **리드 레퍼런스** — 골격을 소유할 사이트 1개(URL 또는 `references/library/` 문서명). 사용자가 지목하면 그것이 리드. 없으면 P1에서 스킬이 고르고 이유를 적는다. 요청 성격: "복제"인가 "동일 품질"인가.
5. **환경** — 대상 브라우저, 모바일 필수 여부, 로케일(단일 언어가 기본 — 다국어는 요구가 있을 때만).
6. **발판** — `node "$S/foundation.mjs"` 결과에 ❌ 층이 있으면 이 문항이 생긴다: "기본 스택(Next + TS + Tailwind + shadcn + TanStack Query + zod/RHF + Motion) 중 빠진 <층>을 먼저 잡을까요?" 승인 → `--apply`(토큰 층은 design-baseline 씨앗으로 편집). 보류 → 계약에 `foundation: "deferred"`를 적고 audit 교차 축이 🔴로 남는다. ❌가 없으면 이 문항은 묻지 않는다.

## contract.json

```json
{
  "foundation": "deferred  (선택 — 발판 보류를 사용자가 결정했을 때만; audit 교차 축이 🟡로 남는다)",
  "palette": "#FAF8F5  (선택 — 베이스 팔레트, history 대조)",
  "direction": { "typo": "serif", "color": "warm-neutral", "layout": "editorial", "density": "airy", "decor": "photo", "motion": "reveal", "signature": "type" },
  "pages": [
    { "route": "/", "type": "landing", "decision": "이 페이지가 돕는 결정 한 문장",
      "facts": ["실제로 들어갈 것 — 항목·수치·상태·컨트롤"], "must": ["css:.hero [data-demo]", "예약하기"], "mustNot": ["후기 섹션"],
      "lead": "stripe-com  (이름 — .sognora/page/ir/<이름>.json → 없으면 스킬 배포 references/ir/; URL은 먼저 ir.mjs로 수집)", "comp": ".sognora/page/comps/home-2.png",
      "tokens": ".sognora/page/tokens.json", "engineering": ".sognora/page/engineering.json" },
    { "route": "/pricing", "type": "pricing", "decision": "…", "facts": ["플랜 3개: …"], "must": [], "mustNot": [] }
  ],
  "locale": "ko", "assets": "mixed", "center": "중심 장면 한 문장 — 히어로가 팔 결과 장면"
}
```

- `type`·`decision`·`facts`는 사람이 채운다(P0). `TODO`가 남으면 감사가 멈춘다 — 빈칸을 추측으로 메우지 않는다.
- `must`/`mustNot`은 **존재만** 기계가 본다. "잘 만들어졌는가"는 시안 대비 판정(P6)의 몫이다.
- `center`(중심 장면)는 랜딩이 있을 때 의무. 히어로는 결과를 판다 — 사용자가 해야 할 입력 작업을 파는 히어로 금지([types/landing](../types/landing.md)).

## 경계 규칙

- 사용자가 정한 범위·언어·금지 수단을 유지한다. 고품질을 이유로 섹션·다국어·시연 패널을 더하지 않는다.
- 기존 사이트가 있으면 P0 전에 진단을 먼저 한다([verify](verify.md) `--diagnose`) — 갈아엎을 대상은 인상이 아니라 계기로 고른다.
- 이 스킬은 페이지를 만든다. 3D 장면·WebGL 월드는 범위 밖이다(재현 불가 목록에 정직하게 적는다).

## 다음

[P1 리드와 근거](lead.md)
