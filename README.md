# sognora-llm-inventory

개인 스킬 무기고. **양쪽 모두 마켓플레이스로 설치** — 설치 한 번이면 전체 스킬이 장착되고, 각 스킬은 자기 폴더 안에서 독립적으로 동작한다. Claude Code + Codex CLI 지원.

스킬 파일은 **하나의 소스를 양쪽이 공유**한다 — Codex CLI의 스킬 포맷은 Anthropic Agent Skills 스펙과 호환이고(SKILL.md 동일), Codex 0.147+는 `.claude-plugin/plugin.json`도 직접 읽는다. 이 레포는 두 생태계의 카탈로그 파일만 각각 두고 스킬 본체는 한 벌만 유지한다.

## 설치 — 한 줄이면 끝

```bash
curl -fsSL https://raw.githubusercontent.com/shindonghwi/sognora-llm-inventory/main/setup.sh | bash
```

claude/codex CLI를 자동 감지해 마켓플레이스 등록 + 플러그인 설치까지 한 번에 처리한다.
**업데이트도 같은 명령 재실행이면 된다**(멱등). plugin 명령이 없는 구버전 CLI는 클론 + 심링크로 자동 fallback.

- Claude: 새 세션에서 `/<스킬명>` 또는 자연어 트리거 · Codex: `$<스킬명>` 또는 `/skills` 메뉴

<details>
<summary>수동 설치 (한 줄 스크립트를 쓰기 싫을 때)</summary>

**Claude Code**

```
/plugin marketplace add shindonghwi/sognora-llm-inventory
/plugin install sognora-llm-inventory@sognora-llm-inventory
```

**Codex CLI (0.147+)**

```bash
codex plugin marketplace add shindonghwi/sognora-llm-inventory
codex plugin add sognora-llm-inventory@sognora-llm-inventory
```

- 업데이트: Claude `/plugin marketplace update sognora-llm-inventory` · Codex `codex plugin marketplace upgrade` 후 `codex plugin add` 재실행
- fallback(구버전 CLI·오프라인): `git clone` 후 `./install.sh` — 같은 스킬 소스를 `~/.claude/skills`·`~/.codex/skills`에 심링크

</details>

## 구조

```
├── .claude-plugin/marketplace.json      # Claude 마켓플레이스 카탈로그
├── .agents/plugins/marketplace.json     # Codex 마켓플레이스 카탈로그 (같은 플러그인 지향)
├── plugins/sognora-llm-inventory/       # 플러그인 본체 (양쪽 공용)
│   ├── .claude-plugin/plugin.json       #   Claude manifest
│   ├── .codex-plugin/plugin.json        #   Codex manifest (interface 블록 필수)
│   ├── skills/<스킬>/                    #   스킬 하나 = 폴더 하나 (자기완결, 양쪽 공용)
│   │   ├── SKILL.md                     #     Agent Skills 스펙 — Claude·Codex 동일 파일
│   │   ├── references/rules.md          #     본체 룰 (SSOT)
│   │   └── CHANGELOG.md
│   └── agents/                          #   (Claude 전용 다콜 스킬만) 서브에이전트 정의
├── _template/                           # 새 스킬 스켈레톤
└── new-skill.sh / install.sh / update.sh / uninstall.sh
```

## 네이밍 규칙

스킬 이름은 **`sg-<도메인>-<동작>`** kebab-case로 짓는다. `sg-` 접두사가 내 스킬임을 표시해 타 플러그인과의 충돌을 막고, 도메인 접두사로 목록이 묶인다.

- 도메인 어휘(고정, 필요 시 추가): `ko`(한국어 글) · `code` · `doc` · `git` · `web` · `test`
- 동작은 동사 하나: `sg-ko-humanize`, `sg-ko-proofread`, `sg-git-release`, `sg-doc-translate`
- 소문자·숫자·하이픈만. 버전·날짜를 이름에 넣지 않는다.

## 새 스킬 추가

```bash
./new-skill.sh sg-ko-humanize   # 네이밍 규칙 준수
```

1. `SKILL.md`의 **description**부터 채운다 — 자동 발동을 결정하는 전부다. 트리거 문구(변형 포함)와 **비대상**(인접 요청은 어느 스킬 담당인지)을 명시할 것. 스킬이 늘수록 오발동 방지가 핵심.
2. `references/rules.md`에 본체 룰 작성.
3. push 후 사용자 쪽에서 marketplace update — **manifest 수정 없음** (plugin.json이 `skills/` 디렉토리 전체를 가리킴).

**로컬 개발 루프**
- Claude: `/plugin marketplace add /path/to/sognora-llm-inventory` (로컬 경로 등록 가능)
- Codex: `codex plugin marketplace add ./path` 후, 수정할 때마다 plugin-creator의 cachebuster 절차(`version`에 `+codex.<ts>` suffix) + `codex plugin add` 재설치. 간단히 하려면 `./install.sh` 심링크가 제일 빠르다(저장 즉시 반영).

## 설계 원칙

- **스킬은 런타임 중립으로 작성** — SKILL.md 하나가 양쪽에서 돈다. 특정 런타임 전용 문법(도구명·환경변수)을 본문에 넣지 않는다. 다콜·서브에이전트가 꼭 필요한 스킬만 "Claude Code 전용 확장" 섹션 + `agents/` 정의를 추가하고, 다른 런타임은 단일 호출 절차를 따르게 한다.
- **단일 콜 기본** — 다콜 파이프라인은 그 스킬에 실측 근거가 생겼을 때만.
- **스킬 간 참조 금지** — 스킬 폴더는 자기완결. 공용 코드가 생기면 복제가 낫다(독립성 > DRY).
- **description은 짧고 밀도 있게** — 설치된 전 스킬의 description이 매 세션 컨텍스트에 올라간다.

## 릴리스 컨벤션

- **main = 배포 브랜치.** 양쪽 마켓플레이스 모두 main을 바라본다. 작업은 dev 브랜치에서, main 머지 = 배포.
- 릴리스 시 버전 bump는 **세 곳 동시**: `plugins/sognora-llm-inventory/.claude-plugin/plugin.json` + `.codex-plugin/plugin.json`(strict semver 필수) + `.claude-plugin/marketplace.json`. → git tag `v<버전>` + 스킬별 CHANGELOG 갱신.
- 롤백: main에서 `git revert` 후 사용자 쪽 marketplace update. 클론 사용자는 `git checkout v<버전>`으로 특정 버전 고정 가능.
- Codex manifest 검증: `python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/sognora-llm-inventory`

## Credits

- `sg-ko-humanize`의 패턴 체계는 [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai) (MIT)의 quick-rules를 기반으로 간소화·재구성했다.
