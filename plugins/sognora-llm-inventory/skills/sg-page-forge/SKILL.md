---
name: sg-page-forge
description: 웹 페이지를 레퍼런스급 품질로 단조한다 — 랜딩·소개·문서·카탈로그·도구·요금제·폼·대시보드 전부 한 스킬. 순서가 품질이다 — 계약(동사·facts) → 리드 IR 실측 → imagegen 시안 2~3안을 사용자가 고름 → 시안·IR을 토큰·브리프로 전사(창조 금지) → 모션 프리셋 어휘로 빌드 → 기계 배터리(AI 티·한글 서체·토큰 준수·동작·교차 동일성) → 시안 대비 블라인드 판정. 지식은 wiki/ 트리, 규칙은 판정자가 있는 것만. 스킬 폴더 밖 캐시 없이 돈다. 트리거 — "랜딩 만들어줘", "페이지 만들어", "요금제/문의/소개 페이지", "사이트 개편", "레퍼런스급으로", "페이지 AI 티 점검", "사이트 페이지 진단"
---

# sg-page-forge — 페이지 단조

> 이 파일은 절차와 판정자 지도만 갖는다. 규칙·수치·근거는 [위키](wiki/index.md)에 있고, 판정은 `scripts/`와 [판정 브리프](wiki/judge/index.md)가 한다. 산출물은 사용자 프로젝트의 `.sognora/page/`에 쌓인다. Claude Code와 Codex 양쪽에서 같은 문서로 동작한다.

> **사용자가 부르는 것은 `/sg-page-forge` 하나다.** 나머지 계기는 에이전트가 프로젝트 루트에서 **인자 없이** 돌린다 — 계약은 `.sognora/page/contract.json`, 산출물은 `.sognora/page/`, 소스는 `src/`, 뷰포트는 1440×900·390×844가 기본값이다. 정말 대체 불가한 것(리드 URL·이름)만 인자다. 선택 플래그는 코드에 남아 있어도 이 문서에 쓰지 않는다.

> **계기 위치** — 스킬은 사용자 프로젝트에서 돌고 계기는 플러그인 안에 있다. 첫 실행에 한 번 잡고 이후 `$S`로 쓴다:
> ```bash
> S=$(sg path sg-page-forge 2>/dev/null) || S=$(ls -td ~/.claude/plugins/cache/*/*/*/skills/sg-page-forge/scripts ~/.codex/plugins/cache/*/*/*/skills/sg-page-forge/scripts 2>/dev/null | head -1)
> node "$S/preflight.mjs" --install     # playwright 모듈과 chromium 바이너리를 따로 확인하고 갖춘다(패키지 매니저는 lockfile로 판정). 사람에게 넘기지 않는다
> ```
> 다른 곳의 playwright를 쓰려면 `SG_PLAYWRIGHT=<모듈 경로>`. 리드 번들·history 같은 상태는 스킬 폴더가 아니라 `SG_PAGE_FORGE_HOME`(기본 `~/.cache/sg-page-forge/`)에 둔다 — **스킬 폴더 안에 있는 것만으로 어디서든 같은 결과가 나와야 하고, 캐시가 있어야 도는 축은 설계 결함이다.** 캐시가 없어 못 재는 축은 "미제공(판정되지 않음)"으로 보고하고 통과로 쓰지 않는다.

## 세계관 — 왜 이 순서인가

이전 세대 스킬 셋(랜딩 전용·나머지 페이지 전용·3D)이 남긴 실측:

1. **스펙의 침묵은 LLM 사전분포로 채워진다(=AI 티).** 생성에서는 그렇고, 변환에서는 리드 실측값으로 채워진다. 그래서 골격은 리드 IR에서 온다. 그러나 **리드를 겉모습까지 옮기면 "그냥 가져다 쓴 것"으로 거절된다** — 리드에서 오는 것은 좌표계·리듬·모션 계기뿐이다.
2. **판정 기준이 취향인 사용자에게는 코드 전에 그림이 필요하다.** 세 번 연속 완성 화면이 거절된 뒤, 이미지 모델이 그린 시안 3안 중 사용자가 고른 것을 전사하자 통했다. 그래서 P2는 시안이고, 스킬에서 인터뷰 다음으로 허용되는 유일한 질문은 "어느 시안입니까"다.
3. **규칙은 판정자가 있는 것만.** 산문 규칙은 실행 에이전트를 구속하지 못한다(토큰 13개를 선언한 런이 hex 32개를 썼다). 판정자를 적을 수 없는 규칙은 이 스킬에 추가할 수 없다.
4. **규칙의 자는 레퍼런스다.** AI 티 검출기가 프리미엄 레퍼런스에서 발동하면 그것은 슬롭이 아니라 취향을 재는 것이다. 임계는 상수가 아니라 코퍼스 실측이다.
5. **글만 있는 페이지는 컴포넌트 층이 없어서 생긴다.** 드롭인할 Button·Input·Table이 없으면 화면마다 CSS를 다시 짜고 제일 싼 것(문단)으로 수렴한다. 그래서 이 스킬은 기본 스택을 갖는다(아래) — 프로젝트에 스택이 있으면 그것을 따르고, 없으면 기본 스택으로 세운다.
6. **페이지 유형은 사용자의 동사가 정한다.** 목록에 없는 화면은 랜딩으로 회귀한다 — 그래서 미등재 화면은 그 자리에서 `read:`/`do:`를 선언한다.

## 기본 스택 — 랜딩·앱 페이지 공통, 갈래 없음

프로젝트에 스택이 있으면 그것이 법이다. 없을 때 이 스킬이 세우는 스택은 하나다:

| 층 | 기본값 | 왜 |
|---|---|---|
| 프레임워크 | Next.js(App Router) + TypeScript | 랜딩과 앱 페이지를 한 코드베이스에서. 정적 출력도 된다 |
| 스타일 | Tailwind + CSS 변수 토큰(`tokens.json` → `globals.css`) | 값은 토큰만, 유틸은 토큰을 참조 |
| 컴포넌트 층 | **shadcn/ui**(Radix/Base UI 프리미티브) — 단, 테마 토큰 전부 재정의 후 사용 | AI가 가장 잘 다루고 코드가 레포 안에 있다. 기본 테마 그대로는 `token.shadcn-default`(소스에서 확정되면 🔴, 렌더 추정만이면 🟡) |
| 모션 | Motion(구 framer-motion) + `assets/presets/` 6종 어휘 | 프리셋 밖 애니메이션을 새로 짜지 않는다 |
| 데이터·폼 | TanStack Query · zod · react-hook-form | 앱 페이지의 상태·검증 |
| 서체 | 한글 본문 1 + 디스플레이 1 + 숫자 1(`references/design-baseline.md`) | Inter·Geist 단독 금지 |

**발판 먼저(P0).** 스킬을 실행하면 `node "$S/foundation.mjs"`로 위 층을 잰다. 빠진 층(❌)이 있으면 계약 인터뷰의 6번 문항으로 **"먼저 발판을 잡을까요?"**를 한 번 묻고, 승인하면 `--apply`로 깐다(토큰 층은 명령이 아니라 편집이라 `design-baseline.md` 씨앗으로 처방만). 기존 프레임워크·자체 컴포넌트 층은 존중한다 — 갈아엎지 않고 빠진 층만. Tailwind 3→4, framer-motion→motion은 🟡 점진 이행 권장으로만 보고한다.

```bash
node "$S/foundation.mjs"            # 층별 상태·처방 표, 빠진 층 있으면 exit 1
node "$S/foundation.mjs" --apply    # 사용자 승인 후에만
```

판정자: `foundation.mjs`(❌ 층 = audit 교차 축 🔴, 사용자가 보류하면 계약 `foundation: "deferred"` → 🟡) · `primitives.mjs`(층 부재·중복) · `token.shadcn-default` · `conform.mjs` · `motion.*`.

## 강제 지도 — 의무 → 판정자 → 시점

새 의무는 이 표에 행을 더하는 것으로만 생긴다.

| 의무 | 판정자 | 시점 |
|---|---|---|
| 의도가 파일에 있다(유형·decision·facts·must/mustNot) — 되묻지 않는다 | `contract.mjs --check` exit 1 · `audit.mjs`(facts 없는 빌드 exit 2) | P0 |
| 발판(기본 스택 층)이 있다 — 없으면 "먼저 잡을까요?" 한 번 묻고 승인 시 적용 | `foundation.mjs`(❌ 층 = exit 1, audit 교차 축 `foundation` 🔴) | P0 |
| 리드 IR이 완전하다(1440/390 트리·scrollHeight·keyframes·자산 rect·record) | `ir.mjs` completeness → 미달은 audit "미제공" | P1 |
| 동일 리드 3회 내 재사용 금지 · 팔레트 계열 상이 · 7축 중 3축 상이 | `history.mjs`(`lead.reuse`·`palette.history-repeat`·`direction.axes-repeat`; history.json 없으면 미제공) — audit 교차 축 | P1·P3·P7 |
| 코드 전에 사용자가 고른 시안이 있다 | `comp.mjs --check` 🔴 · 사용자 선택 기록(계약 `comp`). codex CLI 없으면 프롬프트만 남기고 미제공 | P2 |
| 색·font-size·radius·duration은 tokens.json 어휘만, 어휘 예산·해시 | `conform.mjs`(소스 린트 + 렌더 1440/390) | P3·P5·P6 |
| 한글 대응 폰트 명시 · AI 기본값 서체 단독 금지 · 굵기 700+ 비율 | `detect.mjs` `font.hangul-fallback`·`font.ai-default`·`type.heavy-weight-share`(임계는 `corpus-baseline.json`) | P6 |
| 한글 조판(행간·자간·이탤릭·keep-all) · 카피 시점(제작자·설명서 금지) | `detect.mjs` `korean.*` · `copylint.mjs` `copy.maker-voice`·`copy.manual-voice` · `detect_bilingual.py` | P6 |
| AI 티·품질 바닥·여백 지배 | `detect.mjs` — 단독 🔴 규칙(품질 바닥·조판·시점·유형 구조·여백 지배 등, [규칙 색인](wiki/evidence/rule-index.md)의 ● 표시) 0 · 취향 계열 패턴 합산 4종 미만 | P6 |
| 유형별 필수 구조 · 일이 첫 화면의 주인공 · 글만 있는 페이지 금지 · 살아 있음 | `detect.mjs` `structure.*`(유형별) · `scan.mjs` 콘솔·페이지 오류 | P6 |
| 컴포넌트 층이 있다(없으면 기본 스택 shadcn으로 세운다) · shadcn 기본 테마 그대로 금지 | `primitives.mjs` `component.no-primitive-layer` 🔴 · `conform.mjs` `token.shadcn-default`(소스 확정 🔴 / 렌더 추정 🟡) | P5·P6 |
| 엔지니어드 모먼트 하한 3 · no-JS/reduced-motion 가시 | `behavior.mjs` | P6 |
| 골격이 IR 오차 밴드 내 · 깊이 -40% 초과 축소 금지 · 장면 예산 · 리드 표현 잔존 0 | `irdiff.mjs`(audit이 lead 지정 페이지에 자동 적용) · `conform.mjs` 잔존 | P6 |
| 페이지끼리 다른 유형이 같은 틀이 아님 · 하는 화면이 소개문으로 열지 않음 · 일 점유율(`work.starved`) | `sameness.mjs` | P6 |
| 결과가 고른 시안과 같은 밀도·완성도(parity ≥4) | [시안 대비 판정](wiki/judge/comp-judge.md) 블라인드 | P6 |
| 섹션이 AI스럽지 않음(≤3 = 철거) · 사고 싶음(≥70, 경쟁 캡처 없으면 절대 점수만) · 페르소나 ② 정답 · 자산 실물감 · 페이지 간 동일성 사람 확인 | [판정 브리프](wiki/judge/index.md) 블라인드 동시 — `judge-pack.mjs`가 블록인용만 조립 | P6 |
| 결함은 관찰→층→수정→같은 상태 재검증, 폐기는 사용자 인용 | `lint-docs.mjs`(defects.md) | P7 |
| 산출물 문서 스키마(contract·tokens·comps·defects) | `lint-docs.mjs` | 상시 |
| 판정자 없는 규칙 추가 금지 | 이 표 자체 | 상시 |

## 인터뷰 — 계약이 없을 때 한 번

[workflow/brief](wiki/workflow/brief.md)의 6문항(페이지·동사 / 사실 재고 / 자산 정책 / 리드 / 환경 / 발판 — 마지막은 빠진 층이 있을 때만)을 한 번의 배치로 묻고 `.sognora/page/contract.json`에 굳힌다. 계약이 있으면 읽고 진행한다. 그 뒤 질문은 P2 시안 선택 하나뿐이다.

## 공정 — P0~P7 (읽는 파일 → 쓰는 파일)

| P | 하는 일 | 읽는 것 | 쓰는 것 | 게이트 |
|---|---|---|---|---|
| P0 | **발판 진단**(`foundation.mjs`) → 계약(동사·facts·중심 장면). 기존 사이트면 `--diagnose` 먼저 | [brief](wiki/workflow/brief.md), [types](wiki/types/index.md) | `qa/foundation.md`, `contract.json` | `foundation` ❌ 0(또는 사용자 보류 기록) · `contract.mjs --check` |
| P1 | 리드·비교·대조 + IR 확보 | [lead](wiki/workflow/lead.md), [evidence](wiki/evidence/index.md), `references/library` | `cases.md`, `.sognora/page/ir/<리드>.json`(스킬 배포 IR `references/ir/`은 읽기 전용) | completeness · `history.mjs` |
| P2 | imagegen 시안 2~3안 → **사용자 선택** | [comp](wiki/workflow/comp.md), [directions](wiki/directions.md) | `comps/<slug>*.png`, `<slug>.prompt.md`, 계약 `comp` | `comp.mjs --check` + 선택 |
| P3 | 전사: 시안 실측표 · tokens.json · engineering.json | [transcribe](wiki/workflow/transcribe.md), [systems](wiki/systems/index.md) | `tokens.json`, `engineering.json`, `provenance.md` | `conform` |
| P4 | 섹션 브리프 컴파일(IR 슬라이스 + 시안 실측표 + 토큰 치환표 + 모션 프리셋 + 금지 + 카피) — verbatim 병합 | [transcribe](wiki/workflow/transcribe.md) 브리프 절 | `briefs/<n>.md` | 브리프 완전성(IR 수치 전부 등장) |
| P5 | 컴포넌트 층 → 브리프 전사 → 모션 프리셋 | [build](wiki/workflow/build.md), [systems/motion](wiki/systems/motion.md), `assets/presets/` | 프로젝트 소스 | `primitives.mjs` · `conform.mjs` |
| P6 | 기계 배터리 → 시안 대비 판정 → 패널(AI-티·매력·페르소나·게이트키퍼·동일성) | [verify](wiki/workflow/verify.md), [judge](wiki/judge/index.md) | `qa/audit.md`, `qa/judge/*.md`(judge-pack), 판정 결과 | audit 🔴 0 · parity ≥4 · 패널 통과 |
| P7 | 결함 복구(층별), 보고, `history.mjs append` | [recovery](wiki/workflow/recovery.md) | `defects.md`, 보고서, `$SG_PAGE_FORGE_HOME/history.json` | `lint-docs` |

```bash
# 전부 프로젝트 루트에서, 인자 없이. 기본값 = .sognora/page/*, src/, 1440×900·390×844
node "$S/foundation.mjs"               # P0 발판 — 빠진 층이면 사용자에게 한 번 묻고, 승인 시 --apply
node "$S/contract.mjs"                 # 계약 없으면 발판(TODO) 생성, 있으면 검증
node "$S/ir.mjs" all --url <리드 URL> --name <이름>   # P1 리드 실측(유일하게 인자가 필요한 계기) → .sognora/page/ir/<이름>.json
node "$S/comp.mjs"                     # P2 시안 3안씩 → .sognora/page/comps/ (codex 없으면 프롬프트만·미제공)
node "$S/history.mjs" check --lead <이름>   # P1·P3 반복 금지(history 없으면 미제공)
node "$S/primitives.mjs"               # P5 컴포넌트 층
node "$S/conform.mjs"                  # P5 토큰 준수(tokens.json 없으면 design-baseline)
node "$S/audit.mjs"                    # P6 기계 배터리 일괄 → .sognora/page/qa/audit.md
node "$S/audit.mjs" --diagnose         # 기존 사이트 진단(시안·facts 의무 생략)
node "$S/judge-pack.mjs"               # P6 판정 브리프 조립(블록인용만) → .sognora/page/qa/judge/
node "$S/lint-docs.mjs"                # 산출물 문서 스키마
node "$S/history.mjs" append --lead <이름>  # P7 완료 시 기록
```

## 계기 (scripts/ — node + playwright, 양 런타임 공통)

| 계기 | 역할 | CLI |
|---|---|---|
| `preflight.mjs` | playwright 모듈·chromium 바이너리를 따로 확인, `--install`로 갖춘다(lockfile로 pnpm/yarn/bun/npm 판정) | `node $S/preflight.mjs --install` |
| `foundation.mjs` | **발판 진단·처방·적용** — 기본 스택 8층 상태표. ❌면 exit 1, `--apply`는 사용자 승인 후 | `node $S/foundation.mjs` |
| `contract.mjs` | 계약 발판 생성(없을 때)·검증(있을 때). TODO면 exit 1 | `node $S/contract.mjs` |
| `ir.mjs` | 리드 수집(`$SG_PAGE_FORGE_HOME` 캐시)과 증류(`.sognora/page/ir/<이름>.json`, completeness). 스킬의 `references/ir/`는 배포 데이터(읽기 전용) | `node $S/ir.mjs all --url <URL> --name <이름>` |
| `history.mjs` | 반복 금지 — 리드 3회·팔레트 계열·7축(`lead.reuse`·`palette.history-repeat`·`direction.axes-repeat`). 이력 없으면 미제공 | `node $S/history.mjs check --lead <이름>` · `append --lead <이름>` |
| `comp.mjs` | 계약·방향·토큰 → imagegen 브리프 → `codex exec` 시안 3안, 프롬프트 전문 보존. codex 없으면 프롬프트만 쓰고 미제공(exit 0). `--check`는 시안 존재 | `node $S/comp.mjs` · `--check` |
| `scan.mjs` | **유일한 페이지 관측 패스**(audit이 페이지마다 자동으로 돈다) | (audit 내부) |
| `rules/*.mjs` | 순수 규칙(축.의미 ID, 근거·basis). 전체 목록은 [규칙 색인](wiki/evidence/rule-index.md) — `rule-index.mjs`가 코드에서 생성 | (라이브러리) |
| `detect.mjs` | scan.json에 규칙 적용 — AI 티·한글 조판·서체·여백·유형별 구조. 단독 🔴 규칙 또는 취향 패턴 4종 이상이면 페이지 🔴 | (audit 내부) |
| `conform.mjs` | 토큰 준수(렌더 색·font-size·radius·duration) + 소스 리터럴 + 어휘 예산 + `token.shadcn-default`. tokens.json 없으면 `references/design-baseline.md` | `node $S/conform.mjs` |
| `copylint.mjs` | 문장·문단·제목 길이, 금칙어, 제작자·설명서 시점, 한·영 알려진 패턴(`detect_bilingual.py` 심 — 없거나 판정 안 하면 미제공) | (audit 내부) |
| `sameness.mjs` | 페이지끼리 같은 틀인가(`sameness.*`) + 일 점유율(`work.*`). 임계는 그 프로젝트 자신으로 자가 보정 | (audit 내부) |
| `primitives.mjs` | 컴포넌트 층 존재·중복 정의(`component.*`). 없으면 기본 스택 shadcn 처방 | `node $S/primitives.mjs` |
| `behavior.mjs` | engineering.json 선언 동작 실측(하한 3·역할 3) + no-JS·reduced-motion 가시 | (audit 내부, 계약에 engineering 있을 때) |
| `irdiff.mjs` | 골격이 IR 오차 밴드 내인가, 깊이 -40%, 장면 예산, 리드 잔존 | (audit 내부, 계약에 lead 있을 때) |
| `corpus.mjs` | 규칙을 판정하는 자 — `references/corpus.json`의 레퍼런스(11, 제외 2)를 scan→detect 해 발동률을 `corpus-baseline.json`에. 과반 발동 = 삭제 후보(살아있음·접근성 축은 면제) | `node $S/corpus.mjs --run` · `--report` |
| `rule-index.mjs` | 규칙 색인 생성(`wiki/evidence/rule-index.md`). `--check`는 정합 검사 | `node $S/rule-index.mjs` |
| `lint-docs.mjs` | `.sognora/page/` 산출물 스키마(contract·tokens·comps·defects) | `node $S/lint-docs.mjs` |
| `judge-pack.mjs` | 판정 브리프 6종의 **블록인용만** 뽑아 캡처 목록·치환 변수를 채워 `qa/judge/*.md`로. 시안·경쟁 캡처 없으면 그 축 미제공 표기 | `node $S/judge-pack.mjs` |
| `audit.mjs` | **러너** — 계약을 읽어 페이지마다 scan→detect→conform→copylint(+irdiff·behavior), 교차 1회 sameness·foundation·history·primitives·comp. 미제공은 "판정되지 않음". 🔴 있으면 exit 1 | `node $S/audit.mjs` · `--diagnose` |

## 결함 복구 — 폐기 대신 층

사용자가 화면을 낮은 품질로 판정하면 테스트 PASS로 반박하지 않는다. `defects.md`에 관찰→원인 층→수정→재검증으로 적고, [recovery](wiki/workflow/recovery.md)의 표대로 그 층의 페이즈로만 돌아간다. AI-티 ≤3 섹션은 수리가 아니라 철거 후 재단조(치환 전략 1축 교체). 매력 미달은 P2 시안 재선택. 전체 폐기는 사용자 문장을 인용해야 한다.

## 위키 읽기 경로

[wiki/index.md](wiki/index.md)의 경로를 따른다. 새 페이지·전면 개편은 workflow 전부 + types 해당 유형 + systems 계약에 오른 것 + judge. 진단만은 verify `--diagnose` + sameness-judge, 재제작 없음. 관련 없는 문서를 다 읽지 말고, 경로에 있는 문서는 끝까지 읽는다.

## 런타임 중립

판정자는 제작자와 다른 컨텍스트여야 한다. Claude Code는 `Agent`(general-purpose)에 `judge-pack.mjs`가 만든 브리프와 캡처 경로만, Codex는 `codex exec`에 같은 브리프를 준다. 서브에이전트를 쓸 수 없으면 자기 판정을 하되 보고서에 "자기 판정(비블라인드)"라고 적는다. 시안 생성은 Codex 내장 `imagegen`(`codex exec` 파이프)이 1차 경로다 — codex CLI가 없는 환경(Claude 단독)에서는 `comp.mjs`가 프롬프트 파일만 남기고 시안 축을 미제공으로 보고하며, 사용자가 그 프롬프트를 다른 이미지 생성기에 넣어 PNG를 두면 이어서 진행한다. 사용자에게 시안을 보여 고르게 하는 방법도 런타임별로: Claude=파일 전송+선택 질문, Codex=파일 경로 출력+번호 목록.

## 완료 보고

완료는 audit 🔴 0·미제공 0(사용자가 보류한 발판·경쟁 캡처 없음 같은 미제공은 보고서에 사유와 함께 남긴다), 시안 대비 전 축 ≥4, 패널 통과, `defects.md` 전부 해결, `history.mjs append` 기록일 때다. 보고에는 리드와 근거 수준, 고른 시안, 캡처 위치, audit 결과, 축별 점수, 남은 🟡와 이유, 숙제(촬영·자료)를 적는다. 위키 개편·테스트 PASS·코드 줄 수를 품질 증거로 쓰지 않는다.
