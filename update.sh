#!/usr/bin/env bash
# 깨끗한 배포 checkout은 pull한 뒤, 같은 작업트리를 Claude와 Codex에 원자적으로 동기화한다.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if git diff --quiet && git diff --cached --quiet; then
  git pull --ff-only
else
  echo "작업트리에 변경이 있어 git pull은 건너뜁니다. 현재 소스를 양쪽에 동기화합니다."
fi
./tools/sync-runtimes.sh "$@"
