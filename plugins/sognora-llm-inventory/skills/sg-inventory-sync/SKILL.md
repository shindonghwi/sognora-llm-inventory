---
name: sg-inventory-sync
description: 현재 sognora-llm-inventory 개발 소스를 이 기기의 Claude Code와 Codex에 함께 설치·업데이트하고 버전과 전체 스킬 SHA-256을 대조한다. 트리거 — "클로드 코덱스에 최신 스킬 설치해줘", "양쪽 플러그인 업데이트", "인벤토리 동기화", "최신 로컬 스킬 반영해줘", "update sognora skills on Claude and Codex". 비대상 — 다른 플러그인·Claude/Codex 앱 자체 업데이트, 원격 릴리스·커밋·푸시는 아님.
---

# sg-inventory-sync

현재 `sognora-llm-inventory` 소스 한 벌을 Claude Code와 Codex 설치본에 동일하게 반영한다. 캐시 파일을 직접 고치는 작업이 아니라 저장소가 소유한 검증·재설치 경로를 실행하는 스킬이다.

상세 경계와 판정 기준은 [rules.md](references/rules.md)를 전부 읽고 따른다.

## 불변식

1. 사용자가 이 스킬을 이름으로 호출한 것 자체를 설치·업데이트 승인으로 본다. 인자가 없으면 Claude Code와 Codex 양쪽 업데이트를 즉시 실행하고, “확인만”을 명시했을 때만 읽기 전용 검증을 수행한다.
2. 설치 캐시, marketplace 설정, manifest 버전을 손으로 고치지 않는다. 현재 소스의 `update.sh`가 호출하는 `tools/sync-runtimes.sh`만 사용한다.
3. 더티 작업트리를 덮어쓰거나 stash·reset·checkout하지 않는다. 더티면 원격 pull 없이 현재 로컬 소스를 최신 대상으로 삼고 그 사실을 보고한다.
4. 성공은 명령 exit 0과 Claude/Codex 버전·전체 스킬 지문 검증 통과가 모두 있어야 한다. 설치 명령이 실행됐다는 사실만으로 완료하지 않는다.
5. 커밋·푸시·태그·원격 릴리스와 Claude/Codex 애플리케이션 자체 업그레이드는 범위 밖이다.

## 실행

1. 인자가 비어 있으면 기본 모드인 `Claude+Codex 양쪽 설치·업데이트`로 확정한다. 추가 질문을 하지 않는다.
2. [rules.md](references/rules.md)의 결정적 순서로 로컬 marketplace가 가리키는 저장소 루트를 찾는다. 캐시의 `installPath`를 소스 루트로 사용하지 않는다.
3. `git status --short --branch`로 clean/dirty를 확인한다.
4. 상태 확인만 요청이면 다음을 실행하고 끝낸다.

```bash
node <repo-root>/tools/verify-runtime-sync.mjs <repo-root>
```

5. 기본 모드 또는 설치·업데이트 요청이면 다음 한 명령을 실행한다. 하위 설치 명령을 임의로 재작성하지 않는다.

```bash
bash <repo-root>/update.sh
```

6. 실패하면 마지막 성공 단계와 실제 오류를 보고하고 성공으로 표현하지 않는다. 성공하면 소스 경로·clean/dirty·버전·양쪽 지문 일치·재시작 경계를 짧게 보고한다.

Claude Code는 새 세션, Codex는 새 스레드에서 갱신된 스킬을 로드한다.
