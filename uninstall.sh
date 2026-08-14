#!/usr/bin/env bash
# 이 저장소를 가리키는 심링크만 제거한다 (직접 둔 파일·백업·--copy 설치본은 보존).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

removed=0
for dir in "$CLAUDE_HOME/skills" "$CLAUDE_HOME/agents" "$CODEX_HOME/skills"; do
  [ -d "$dir" ] || continue
  for f in "$dir"/*; do
    [ -L "$f" ] || continue
    case "$(readlink "$f")" in
      "$REPO"/*) rm "$f"; echo "removed: $f"; removed=$((removed+1)) ;;
    esac
  done
done

echo "완료 — 심링크 ${removed}개 제거. (--copy 설치본은 수동 삭제 필요)"
