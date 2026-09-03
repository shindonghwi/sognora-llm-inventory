# sognora-llm-inventory

**Claude Code · Codex CLI 겸용 개인 스킬 무기고.** 설치 한 번이면 전체 스킬이 장착되고, 각 스킬은 독립적으로 동작합니다.

스킬 본체는 한 벌만 유지합니다 — Codex의 스킬 포맷은 Anthropic Agent Skills 스펙과 호환이라 같은 `SKILL.md`가 양쪽에서 그대로 돌고, 이 레포는 두 생태계의 카탈로그 파일만 각각 둡니다.

## 설치

```bash
curl -fsSL https://raw.githubusercontent.com/shindonghwi/sognora-llm-inventory/main/setup.sh | bash
```

claude/codex를 자동 감지해 마켓플레이스 등록과 플러그인 설치까지 처리합니다. 로컬 개발본 업데이트는 `./update.sh` 한 명령이 **Claude와 Codex를 함께 재설치하고 버전·전체 스킬 SHA-256이 다르면 실패**합니다. 발동은 Claude `/<스킬명>`, Codex `$<스킬명>` 또는 자연어 트리거.

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

**스킬 이름을 부르면 끝입니다.** 나머지는 스킬이 알아서 합니다 — 브라우저 준비도, 라우트 수집도, 감사도.

```
/sg-page-forge 랜딩 다시 만들어줘
/sg-page-forge 하위 페이지들 진단해줘
/sg-biz-validate 이 아이디어 되는지 봐줘
```

Codex에서는 `$sg-page-forge`, 자연어 트리거(“요금제 페이지 만들어줘”)로도 발동합니다. 각 스킬의 트리거 문구는 아래 표의 `description`에 있습니다.

되묻는 것은 스킬의 실패로 봅니다. 의도가 필요한 자리(페이지 유형·이 화면이 돕는 결정)는 **한 번만 받아 파일로 굳히고**(`.sognora/page/contract.json`), 이후 실행은 그 파일을 읽어 무인 완주합니다.

<details>
<summary>내부 계기 — 스킬과 레포가 쓰는 것 (사람이 외울 필요 없음)</summary>

설치 시 `sg`가 PATH에 놓입니다. **사용자 인터페이스가 아닙니다** — 스킬이 자기 계기를 찾을 때, 그리고 스킬을 고칠 때 씁니다.

| | |
|---|---|
| `sg path <스킬>` | 그 스킬의 `scripts` 경로 — SKILL.md의 `$S`가 이걸 씁니다(없으면 플러그인 캐시에서 결정적으로 찾는 폴백) |
| `sg check` | 레포 자체 점검 — push 전 |
| `sg corpus` · `sg corpus report` | AI 티 규칙이 판별력 있는지 — sg-page-forge의 레퍼런스 코퍼스(`references/corpus.json`)에 재측정 |

</details>

## 스킬

| 스킬 | 하는 일 |
|---|---|
| `sg-inventory-sync` | **이름만 호출하면** 현재 로컬 무기고 소스를 Claude Code와 Codex에 함께 설치·업데이트. clean 작업트리는 원격 최신을 fast-forward한 뒤 반영하고, dirty 작업트리는 사용자 변경을 보존한 채 현재 소스를 반영한다. 양쪽 버전과 전체 스킬 SHA-256이 모두 일치해야 완료 |
| `sg-ko-humanize` | AI가 쓴 한글 텍스트의 "AI 티"를 제거하는 윤문. 폴더·문서 일괄 모드(메시지·i18n 파일은 명시 지정 시에만). **내용 불변을 게이트가 결정적으로 판정** — 문장 쌍 단위로 숫자·부정·극성·조건을 대조해 의미가 뒤집힌 윤문을 중단시킨다. 랜딩·제품 카피는 `랜딩`/`UI` 장르로 **내부 기획 용어 노출**까지 검출(같은 "읽기 전용"이 마케팅 카피에서는 🔴, 기능 화면에서는 🟡). 용어 표류는 파일 안·파일 간 모두, 로케일 쌍 정합은 `locale_parity.py`가 별도 판정 |
| `sg-en-humanize` | AI가 쓴 영어 텍스트의 추상 연결·빈 동사·상투 광고 공식을 걷어내는 윤문. 알려진 패턴 검사와 **행동·결과 의미 검토를 분리**하고, 수치·부정·URL·보호어 및 30%/50% 변경률을 게이트로 지킨다. `detect_bilingual.py`는 한·영 카피를 한 번에 검사하지만 자연스러움과 문맥 적합성은 별도 검토로 남긴다 |
| `sg-web-replicate` | 인앱 브라우저와 서브에이전트가 레퍼런스 프론트의 전 라우트·반응형·상호작용·모션을 직접 조사·복제. 범용 crawler/diff 스크립트가 작업을 차단하지 않으며, 브랜드는 유사한 가상 이름으로 교체하고 영역·규격을 먼저 만든 뒤 사진·아이콘·문구 포함 배너·지도·평면도·QR·로고까지 모든 시각 자산을 고유 asset/variant별 imagegen으로 생성 |
| `sg-biz-validate` | 사업 아이디어 검증. 인터뷰(질문 수 예고) → 경쟁사 3곳+ 실물 분석 → 진입/조건부/철회 판정 → PRD |
| `sg-growth-expose` | 검색·스토어·AI 답변 노출 최적화. 웹/앱을 자동 판별해 — 웹은 SEO+GEO 감사 후 적용, 앱은 스토어 리스팅 생성. **처분을 코드가 강제한다**: 훈련 크롤러 옵트아웃은 불가침, 코드에 명시된 제외는 의도로 존중, 렌더링 아키텍처는 보고만 |
| `sg-page-forge` | 웹 페이지 전부를 한 스킬로 — 랜딩·소개·문서·카탈로그·도구·요금제·폼·대시보드. **순서가 품질이다**: 계약(동사·facts) → 리드 IR 실측 → `imagegen` 시안 2~3안을 사용자가 고름 → 시안·IR을 토큰·브리프로 전사(창조 금지) → 모션 프리셋 어휘로 빌드 → 기계 배터리(AI 티·한글 서체·토큰 준수·동작·교차 동일성) → 시안 대비 블라인드 판정. 지식은 `wiki/` 트리, 규칙은 판정자가 있는 것만, 임계는 프리미엄 레퍼런스 코퍼스로 보정. 스킬 폴더 밖 캐시 없이 돈다 |

## 원칙

**스킬 산출물은 전부 `.sognora/` 아래에 둔다.** 계약·시안·QA 보고서가 `_page/`·`_forge/`·`_replica/`·`_biz/`로 프로젝트 루트에 흩어져 쌓였다 — 규칙이 없었기 때문이다. 이제 스킬마다 `.sognora/<도메인>/` 한 곳이다(page·forge·replica·biz·growth). 숨김 폴더라 루트가 어지럽지 않고, 통째로 무시하려면 `.gitignore`에 `.sognora/` 한 줄이면 된다(단 `contract.json`·`tokens.json`은 의도의 기록이라 커밋을 권한다). 구 경로가 있는 프로젝트는 `mv _page .sognora/page`처럼 옮기면 되고, 계기가 구 경로를 발견하면 그렇게 알려준다.

**판정자 없는 규칙은 두지 않는다.** 반복 가능하고 고정된 규칙은 스크립트가 판정하고, 사이트마다 구조가 달라지는 규칙은 담당 에이전트가 브라우저 증거 원장으로 판정한다. 판정 주체와 증거가 없으면 그렇다고 적는다 — 막지 못하는 것을 막는 척하는 게 가장 나쁜 실패다.

**재는 자는 두 층이다.**

| 층 | 재는 것 | 계기 |
|---|---|---|
| 1 | **산출물** — 만든 사이트가 살아 있고 규범을 지키는가 | 스킬별 결정적 계기 또는 브라우저 증거를 맡은 에이전트 |
| 2 | **규칙** — 그 규칙이 판별력이 있는가 | `sg-page-forge/scripts/corpus.mjs` — 프리미엄 레퍼런스에서 켜지는 AI 티 규칙은 규칙이 아니다 |

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
│       ├── wiki/                        #   필요한 스킬만: 지식 트리(근거·유형·공정·체계·판정)
│       ├── references/                  #   필요한 스킬만: 실측 데이터(IR·라이브러리·코퍼스 기준선)
│       ├── scripts/                     #   필요한 스킬만: 결정적 검증
│       └── assets/                      #   필요한 스킬만: 산출물 재료
├── _template/                           # 새 스킬 스켈레톤
└── new-skill.sh · install.sh · update.sh · uninstall.sh · setup.sh
```

## 새 스킬 만들기

```bash
./new-skill.sh sg-<도메인>-<동작>    # 예: sg-ko-proofread
# 도메인 어휘: ko(한국어 글) · en(영어 글) · web · biz · growth(노출·유입) · landing(랜딩 제작) · code · doc · git · test
```

1. `SKILL.md`의 **description**부터 — 자동 발동을 결정합니다. 트리거 문구와 비대상을 명시.
2. `references/rules.md`에 본체 룰 작성 (SKILL.md는 절차만, 얇게).
3. README 스킬 표에 한 줄 추가 후 push — manifest 수정은 필요 없습니다.

**설계 원칙** — 스킬은 런타임 중립으로(한 파일이 양쪽에서 동작) · 단일 콜 기본 · 판정은 LLM이 아니라 스크립트가.

**스킬 간 의존** — 룰북은 각자 갖는다(한 스킬의 위키가 다른 스킬을 SSOT로 삼지 않는다). 계기(scripts)는 심으로 재사용한다 — page-forge가 ko/en-humanize의 `detect_bilingual.py`를 자기 위치 기준으로 찾아 실행한다. 상대경로 의존 금지.

## 릴리스

- `main` = 배포 브랜치. push 전 README가 실제 상태와 맞는지 확인.
- 버전: 일상 변경 **patch** / 새 스킬 **minor** / 구조 변경 **major**. 매니페스트 4개 항목 동시 bump + `v<버전>` 태그.
- 검증: `python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/sognora-llm-inventory`

## License

[MIT](LICENSE)
