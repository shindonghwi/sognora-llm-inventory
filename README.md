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

## 스킬

| 스킬 | 하는 일 |
|---|---|
| `sg-ko-humanize` | AI가 쓴 한글 텍스트의 "AI 티"를 제거하는 윤문. 폴더·문서 일괄 모드(메시지·i18n 파일은 명시 지정 시에만). **내용 불변을 게이트가 결정적으로 판정** — 문장 쌍 단위로 숫자·부정·극성·조건을 대조해 의미가 뒤집힌 윤문을 중단시킨다 |
| `sg-web-replicate` | 레퍼런스 사이트의 화면을 측정값으로 복제. 라우트 탐색 → 캡처·측정 → 원본 자산 수집 → 구현 → pixel/box diff 게이트 수렴. 화면 전용 |
| `sg-biz-validate` | 사업 아이디어 검증. 인터뷰(질문 수 예고) → 경쟁사 3곳+ 실물 분석 → 진입/조건부/철회 판정 → PRD |
| `sg-growth-expose` | 검색·스토어·AI 답변 노출 최적화. 웹/앱을 자동 판별해 — 웹은 SEO+GEO 감사 후 적용, 앱은 스토어 리스팅 생성. **처분을 코드가 강제한다**: 훈련 크롤러 옵트아웃은 불가침, 코드에 명시된 제외는 의도로 존중, 렌더링 아키텍처는 보고만 |
| `sg-page-craft` | 랜딩 외 나머지 페이지(요금제·기능·문의·정책·제품 화면). **정체성 토큰은 상속하고 밀도는 유형이 정한다**(랜딩 여백을 물려받으면 모든 페이지가 랜딩이 된다), 페이지 유형별 근거 규칙(요금제 비교 구조·가격 표기 법적 요건·폼 규범), "살아 있는가" 검사(런타임·콘솔·CSS 클래스 불일치·빈 상태), 치수는 Spectrum·Carbon·Primer에서 인용 |
| `sg-landing-forge` | 랜딩을 레퍼런스급으로 단조하는 변환 공정(v1). 리드 레퍼런스를 재현급 실측(번들→IR)해 골격을 세우고 토큰·카피·자산·시그니처만 치환. 모든 의무는 기계 게이트(conform·behavior·detect·잔존 검사)가 판정, 증거 3클래스·divergence 판정·라운드 2 |

## 원칙

**판정자 없는 규칙은 두지 않는다.** 문서가 시키는 것은 스크립트가 판정하거나, 판정자가 없으면 그렇다고 적는다 — 막지 못하는 것을 막는 척하는 게 가장 나쁜 실패다. 그래서 각 스킬은 산문 룰북(`references/`)과 그것을 집행하는 계기(`scripts/`)를 짝으로 갖는다.

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

**설계 원칙** — 스킬은 런타임 중립으로(한 파일이 양쪽에서 동작) · 단일 콜 기본 · 스킬 간 참조 금지 · 판정은 LLM이 아니라 스크립트가.

## 릴리스

- `main` = 배포 브랜치. push 전 README가 실제 상태와 맞는지 확인.
- 버전: 일상 변경 **patch** / 새 스킬 **minor** / 구조 변경 **major**. manifest 3곳 동시 bump + `v<버전>` 태그.
- 검증: `python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/sognora-llm-inventory`

## License

[MIT](LICENSE)
