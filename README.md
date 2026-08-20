# sognora-llm-inventory

**Claude Code · Codex CLI 겸용 개인 스킬 무기고.** 설치 한 번이면 전체 스킬이 장착되고, 각 스킬은 독립적으로 동작합니다.

스킬 본체는 한 벌만 유지합니다 — Codex의 스킬 포맷은 Anthropic Agent Skills 스펙과 호환이라 같은 `SKILL.md`가 양쪽에서 그대로 돌고, 이 레포는 두 생태계의 카탈로그 파일만 각각 둡니다.

## 설치

```bash
curl -fsSL https://raw.githubusercontent.com/shindonghwi/sognora-llm-inventory/main/setup.sh | bash
```

claude/codex를 자동 감지해 마켓플레이스 등록과 플러그인 설치까지 처리합니다. **업데이트도 같은 명령 재실행**(멱등). 발동은 Claude `/<스킬명>`, Codex `$<스킬명>` 또는 자연어 트리거.

<details>
<summary>수동 설치</summary>

```bash
# Claude Code
/plugin marketplace add shindonghwi/sognora-llm-inventory
/plugin install sognora-llm-inventory@sognora-llm-inventory

# Codex CLI (0.147+)
codex plugin marketplace add shindonghwi/sognora-llm-inventory
codex plugin add sognora-llm-inventory@sognora-llm-inventory

# 심링크 (개발용 — 저장 즉시 반영)
git clone https://github.com/shindonghwi/sognora-llm-inventory.git && cd sognora-llm-inventory
./install.sh
```

</details>

## 쓰는 법

설치하면 `sg` 한 단어로 전부 됩니다. **첫 진단은 두 줄입니다.**

```bash
cd <내 프로젝트>
sg preflight && sg diagnose      # 브라우저 갖추고 → 있는 페이지 전수 진단
```

계약(`_page/contract.json`)이 없으면 만드는 법을 알려주고 멈춥니다 — 무엇을 재야 하는지는 기계가 지어내지 않습니다.

| 프로젝트에서 | |
|---|---|
| `sg preflight` | 브라우저를 갖춘다 (없으면 설치) |
| `sg contract "/,/pricing"` | 라우트를 계약에 올린다 |
| `sg diagnose` | 있는 페이지 전수 진단 — 갈아엎을 대상을 기계가 고른다 |
| `sg audit` | 빌드 후 정식 감사 (시안 검사 포함) |
| `sg alive <URL> <유형>` | 화면 하나만 빠르게 |

| 스킬을 고칠 때 | |
|---|---|
| `sg check` | 레포 자체 점검 — push 전 |
| `sg corpus` | AI 티 규칙이 판별력 있는지 (프리미엄 레퍼런스 18종) |
| `sg eval <과제>` | 스킬을 붙이면 결과가 나아지는지 |

만드는 것 자체는 여전히 자연어입니다 — `/sg-page-craft 요금제 페이지 만들어줘`. `sg`는 **재는 자리**를 한 단어로 만든 것입니다.

## 스킬

| 스킬 | 하는 일 |
|---|---|
| `sg-ko-humanize` | AI가 쓴 한글 텍스트의 "AI 티"를 제거하는 윤문. 폴더·문서 일괄 모드(메시지·i18n 파일은 명시 지정 시에만). **내용 불변을 게이트가 결정적으로 판정** — 문장 쌍 단위로 숫자·부정·극성·조건을 대조해 의미가 뒤집힌 윤문을 중단시킨다. 랜딩·제품 카피는 `랜딩`/`UI` 장르로 **내부 기획 용어 노출**까지 검출(같은 "읽기 전용"이 마케팅 카피에서는 🔴, 기능 화면에서는 🟡). 용어 표류는 파일 안·파일 간 모두, 로케일 쌍 정합은 `locale_parity.py`가 별도 판정 |
| `sg-web-replicate` | 레퍼런스 사이트의 화면을 측정값으로 복제. 라우트 탐색 → 캡처·측정 → 원본 자산 수집 → 구현 → pixel/box diff 게이트 수렴. 화면 전용 |
| `sg-biz-validate` | 사업 아이디어 검증. 인터뷰(질문 수 예고) → 경쟁사 3곳+ 실물 분석 → 진입/조건부/철회 판정 → PRD |
| `sg-growth-expose` | 검색·스토어·AI 답변 노출 최적화. 웹/앱을 자동 판별해 — 웹은 SEO+GEO 감사 후 적용, 앱은 스토어 리스팅 생성. **처분을 코드가 강제한다**: 훈련 크롤러 옵트아웃은 불가침, 코드에 명시된 제외는 의도로 존중, 렌더링 아키텍처는 보고만 |
| `sg-page-craft` | 랜딩 외 나머지 페이지(요금제·기능·문의·정책·소개·제품 화면). **의도를 `_page/contract.json`에 한 번 굳히고 이후 감사는 무인 완주**(미기입은 지어내지 않고 멈춘다 — 되묻기는 계약이 없을 때 한 번뿐). **코드를 짜기 전에 시안부터**(계약+토큰을 브리프로 컴파일 → `codex exec` 서브에이전트 → Codex 내장 `imagegen` → 시안 없으면 감사가 막는다). **컴포넌트 층이 없으면 화면마다 CSS를 다시 짜고 결국 문단만 남는다** — 프리미티브 중복 정의(`NO-PRIMITIVE-LAYER`)와 그 결과(`PROSE-ONLY`, 본문 500자당 구조 요소 1개 미만)를 양쪽에서 판정. **정체성 토큰은 상속하고 밀도는 유형이 정한다**(랜딩 여백을 물려받으면 모든 페이지가 랜딩이 된다), **페이지들끼리 서로 같은지를 교차 판정**(같은 유형끼리 닮은 건 정상, 다른 유형이 한 틀에서 나온 것만 🔴 — 임계는 그 프로젝트 자신의 기준선으로 자가 보정). **닮음이 다 통과해도 "전부 템플릿 같다"는 남는다** — `WORK-STARVED`가 하는 화면의 주 행위 요소가 첫 화면을 덮는 비율을 재서, 읽는 화면의 본문보다도 성긴 화면을 잡는다. 페이지 유형별 근거 규칙(요금제 비교 구조·가격 표기 법적 요건·폼 규범), "살아 있는가" 검사(런타임·콘솔·CSS 클래스 불일치·빈 상태), 카피는 상투어·주어 시점·**내부 기획 용어** 3축 검사, 치수는 Spectrum·Carbon·Primer에서 인용 |
| `sg-landing-forge` | 랜딩을 레퍼런스급으로 단조하는 변환 공정(v1). 리드 레퍼런스를 재현급 실측(번들→IR)해 골격을 세우고 토큰·카피·자산·시그니처만 치환. 모든 의무는 기계 게이트(conform·behavior·시각 detect·**카피 detect**·잔존 검사)가 판정, 증거 3클래스·divergence 판정·라운드 2 |

## 원칙

**판정자 없는 규칙은 두지 않는다.** 문서가 시키는 것은 스크립트가 판정하거나, 판정자가 없으면 그렇다고 적는다 — 막지 못하는 것을 막는 척하는 게 가장 나쁜 실패다. 그래서 각 스킬은 산문 룰북(`references/`)과 그것을 집행하는 계기(`scripts/`)를 짝으로 갖는다.

**재는 자는 세 층이다.** 산출물을 재는 계기(각 스킬의 `scripts/`)는 처음부터 있었고, 나머지 둘을 나중에 세웠다:

| 층 | 재는 것 | 계기 |
|---|---|---|
| 1 | **산출물** — 만든 사이트가 살아 있고 규범을 지키는가 | 각 스킬 `scripts/` |
| 2 | **규칙** — 그 규칙이 판별력이 있는가 | `sg-landing-forge/scripts/corpus.mjs` — 프리미엄 레퍼런스에서 켜지는 AI 티 규칙은 규칙이 아니다 |
| 3 | **스킬** — 스킬을 붙이면 결과가 나아지는가 | `tools/eval.mjs` — 같은 과제를 스킬 있음/없음으로 N회 돌려 통과율 델타와 분산 |

```bash
node tools/eval.mjs --list
node tools/eval.mjs --case evals/<스킬>/<과제> --runs 3
```

**그리고 레포 자신도 판정 대상이다.** `./tools/check.sh` (push 전):

| 계기 | 판정하는 것 |
|---|---|
| `check-shared.mjs` | 스킬 사이에 복사된 파일(`_deps.mjs`)이 갈라졌는가. 표류하면 같은 머신에서 한 스킬은 돌고 다른 스킬은 "미설치"로 죽는다 — **검사를 안 돌린 것과 통과가 구분되지 않는 상태**가 스킬마다 다르게 남는다 |
| `consts.mjs` | 판정(🔴/🟡)을 가르는 숫자에 근거가 적혀 있는가. **전량을 한 번에 실패시키지 않는 래칫**이다(항상 빨간 게이트는 무시당한다) — 현재 수를 기준선으로 박고 늘어나면 실패, 줄이면 `--bless`로 조인다. 임계 자가 보정과 같은 원리로 엄격해지는 방향으로만 돈다 |

숫자가 다 결함인 것은 아니다 — **인용**(WCAG 44px·GOV.UK 25단어·HTTP 400), **정의**(무엇을 셀지 정하는 값), **방어**(게이트가 일부러 소유하는 하한 — 검증 대상이 임계를 정하면 `{"minCount":0}`으로 통과한다), **임계**(합격선을 긋는 값, 프로젝트가 바뀌면 틀린다)가 섞여 있다. 자가 보정 대상은 마지막 하나뿐이고, 기계는 넷을 구분하지 못하므로 **사람이 근거를 적었는가**로 판정한다.

## 구조

```
├── .claude-plugin/marketplace.json      # Claude 카탈로그
├── .agents/plugins/marketplace.json     # Codex 카탈로그
├── plugins/sognora-llm-inventory/
│   ├── .claude-plugin/plugin.json       # Claude manifest
│   ├── .codex-plugin/plugin.json        # Codex manifest
│   └── skills/<스킬>/                    # 스킬 = 자기완결 폴더 (양쪽 공용)
│       ├── SKILL.md                     #   절차 (Agent Skills 스펙)
│       ├── references/                  #   룰북 SSOT
│       ├── scripts/                     #   결정적 검증 (LLM 없이 동작)
│       └── CHANGELOG.md
├── _template/                           # 새 스킬 스켈레톤
└── new-skill.sh · install.sh · update.sh · uninstall.sh · setup.sh
```

## 새 스킬 만들기

```bash
./new-skill.sh sg-<도메인>-<동작>    # 예: sg-ko-proofread
# 도메인 어휘: ko(한국어 글) · web · biz · growth(노출·유입) · landing(랜딩 제작) · code · doc · git · test
```

1. `SKILL.md`의 **description**부터 — 자동 발동을 결정합니다. 트리거 문구와 비대상을 명시.
2. `references/rules.md`에 본체 룰 작성 (SKILL.md는 절차만, 얇게).
3. README 스킬 표에 한 줄 추가 후 push — manifest 수정은 필요 없습니다.

**설계 원칙** — 스킬은 런타임 중립으로(한 파일이 양쪽에서 동작) · 단일 콜 기본 · 판정은 LLM이 아니라 스크립트가.

**스킬 간 의존** — 룰북은 각자 갖는다(한 스킬의 rules.md가 다른 스킬을 SSOT로 삼지 않는다). 다만 **계기(scripts)는 심으로 재사용한다** — page-craft가 forge의 `detect.mjs`·`conform.mjs`를, forge가 ko-humanize의 `detect_ko.py`를 부른다. 판정자를 스킬마다 복제하면 규칙은 갈라지고 고친 쪽만 고쳐진다. "스킬 간 참조 금지"로 적혀 있던 원칙을 실제 구조에 맞게 좁혔다(v1.6.4).

## 릴리스

- `main` = 배포 브랜치. push 전 README가 실제 상태와 맞는지 확인.
- 버전: 일상 변경 **patch** / 새 스킬 **minor** / 구조 변경 **major**. manifest 3곳 동시 bump + `v<버전>` 태그.
- 검증: `python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/sognora-llm-inventory`

## License

[MIT](LICENSE)
