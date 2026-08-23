# sg-inventory-sync 룰북

## 대상

이 스킬은 로컬 `sognora-llm-inventory` 저장소를 이 기기의 Claude Code와 Codex에 함께 설치하거나 갱신한다. 다른 플러그인, CLI 애플리케이션 버전, 원격 배포는 다루지 않는다.

## 기본 모드

- `/sg-inventory-sync` 또는 `$sognora-llm-inventory:sg-inventory-sync`처럼 이름만 호출해도 Claude Code와 Codex 양쪽 설치·업데이트를 실행한다.
- 빈 인자를 확인 질문으로 되묻지 않는다. 스킬의 명시적 호출 자체가 이 로컬 플러그인 재설치 승인이다.
- 사용자가 “확인만”, “상태만”, “설치하지 마”라고 명시한 경우에만 `verify-runtime-sync.mjs`를 읽기 전용으로 실행한다.

## 소스 루트 결정

다음 순서에서 처음으로 **유효한 하나**를 선택한다.

1. 현재 작업 디렉터리의 git 루트가 `update.sh`, `tools/sync-runtimes.sh`, `.claude-plugin/marketplace.json`, `plugins/sognora-llm-inventory/.codex-plugin/plugin.json`을 모두 가지면 그 루트.
2. Claude의 `claude plugin marketplace list --json`에서 이름이 `sognora-llm-inventory`이고 source가 `directory` 또는 `local`인 절대 경로.
3. Codex의 `codex plugin marketplace list --json`에서 이름이 `sognora-llm-inventory`이고 `marketplaceSource.sourceType`이 `local`인 root.

후보가 둘 이상이면 `realpath`가 같은지 확인한다. 서로 다르거나 필수 파일이 빠졌으면 임의로 하나를 선택하지 말고 중단한다. `~/.claude/plugins/cache`와 `~/.codex/plugins/cache` 아래 `installPath`는 결과 사본이므로 소스 후보가 아니다.

## 실행 경계

- `claude`, `codex`, `python3`, `node` 중 하나라도 없으면 애플리케이션 자체를 설치하지 말고 누락 명령을 보고한다.
- 먼저 `git -C <repo-root> status --short --branch`를 확인한다.
- clean이면 `update.sh`가 `git pull --ff-only` 후 양쪽을 동기화한다. 이때만 원격 main 기준 최신이라고 보고할 수 있다.
- dirty이면 사용자 변경을 보존하기 위해 pull을 건너뛰고 현재 작업트리를 양쪽에 동기화한다. 이를 “원격 최신”이라고 부르지 말고 “현재 로컬 소스 반영”이라고 보고한다.
- `update.sh`는 저장소 점검, 플러그인 검증, Claude 재설치, Codex 임시 cachebuster 재설치, manifest 복원, 버전·전체 스킬 SHA-256 대조를 소유한다. 이 단계를 따로 복제하거나 캐시를 직접 삭제하지 않는다.
- 설치 중 오류가 나면 자동으로 commit, stash, reset, checkout, 강제 pull을 하지 않는다.

## 완료 판정

`bash <repo-root>/update.sh`가 exit 0이어야 하며 마지막 `verify-runtime-sync.mjs` 결과가 다음을 모두 만족해야 한다.

- `pass: true`
- Claude 사용자 설치본 존재 및 source 기본 버전 일치
- Claude 설치본 `skillsSha256`과 source `sourceSkillsSha256` 일치
- Codex 설치본 존재 및 source가 현재 plugin root와 일치
- Codex 기본 버전과 source 기본 버전 일치

하나라도 다르면 설치 일부 성공으로 보고하고 완료라고 쓰지 않는다.

## 결과 보고

다음만 간결하게 보고한다.

- 사용한 source 절대 경로
- clean: 원격 최신 반영 / dirty: 현재 로컬 변경 포함
- source·Claude·Codex 버전
- Claude/Codex 전체 스킬 지문 일치 여부
- Claude는 새 세션, Codex는 새 스레드가 필요하다는 안내
