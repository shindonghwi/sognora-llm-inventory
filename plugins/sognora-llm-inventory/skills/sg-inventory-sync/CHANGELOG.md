# sg-inventory-sync — CHANGELOG

## 0.1.2 — 2026-10-23

- Codex 0.163에서 plugin-creator가 시스템 스킬에서 빠져 동기화가 cachebuster를 찾지 못하고 exit 2로 멈췄다. `codex plugin remove`가 로컬 캐시까지 지우므로 제거 뒤 재설치로 바꾸고, 검증기는 있을 때만 쓴다.
- 검증이 Codex 쪽은 source 경로만 봐서, 버전이 같은 낡은 캐시(sg-en-humanize 변경분 누락)가 통과했다. Codex 캐시의 전체 스킬 SHA-256도 대조한다.

## 0.1.1 — 2026-08-24

- 인자 없는 명시적 호출을 Claude Code와 Codex 양쪽 업데이트 승인으로 정의했다.
- “확인만”을 명시했을 때만 읽기 전용 검증을 수행하며, 빈 입력에 추가 질문하지 않는다.

## 0.1.0 — 2026-08-24

- 현재 로컬 `sognora-llm-inventory` 소스를 Claude Code와 Codex에 함께 재설치하는 스킬을 추가했다.
- 저장소의 `update.sh`와 `tools/sync-runtimes.sh`를 재사용하고, 버전과 전체 스킬 SHA-256이 모두 맞아야 완료로 판정한다.
- 더티 작업트리는 원격 pull 없이 보존하며, 캐시·manifest·marketplace를 직접 수정하지 않는다.
