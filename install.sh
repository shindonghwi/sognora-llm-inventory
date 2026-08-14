#!/usr/bin/env bash
# sognora-llm-inventory — 심링크 설치 fallback
# 기본 설치 경로는 양쪽 모두 마켓플레이스다 (README 참조):
#   Claude: /plugin marketplace add <user>/sognora-llm-inventory → /plugin install
#   Codex : codex plugin marketplace add <user>/sognora-llm-inventory → codex plugin add
# 이 스크립트는 마켓플레이스를 못 쓰는 환경(구버전 CLI·오프라인)용 fallback으로,
# 같은 스킬 소스를 ~/.claude/skills 와 ~/.codex/skills 에 직접 심링크한다.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO/plugins/sognora-llm-inventory/skills"
AGENTS_DIR="$REPO/plugins/sognora-llm-inventory/agents"
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

MODE=symlink          # symlink | copy
DO_CLAUDE=auto        # auto | yes | no
DO_CODEX=auto
FORCE=0
TS="$(date +%Y%m%d-%H%M%S)"

print_help() {
  cat <<'H'
Usage: ./install.sh [options]

  마켓플레이스를 못 쓰는 환경용 심링크 설치 fallback.
  Claude: ~/.claude/skills/<스킬> (+ agents/*.md → ~/.claude/agents/)
  Codex : ~/.codex/skills/<스킬>  (같은 스킬 소스를 공유)

Options:
  --copy          심링크 대신 복사(저장소를 지워도 유지)
  --claude-only   Claude만
  --codex-only    Codex만
  --force         대상에 기존 파일이 있어도 .bak.<ts> 백업 후 덮어씀
  -h, --help      도움말

Env: CLAUDE_HOME(기본 ~/.claude), CODEX_HOME(기본 ~/.codex)
H
}

while [ $# -gt 0 ]; do
  case "$1" in
    --copy) MODE=copy ;;
    --claude-only) DO_CODEX=no ;;
    --codex-only) DO_CLAUDE=no ;;
    --force) FORCE=1 ;;
    -h|--help) print_help; exit 0 ;;
    *) echo "unknown arg: $1" >&2; print_help; exit 2 ;;
  esac
  shift
done

# rc: 0=대상 비었음(설치 진행) / 1=이미 우리 심링크(스킵) / 2=충돌(거부)
prepare_target() {
  local dest="$1" src="$2"
  if [ -L "$dest" ]; then
    if [ "$(readlink "$dest")" = "$src" ]; then
      echo "ok (already linked): $dest"; return 1
    fi
    mv "$dest" "$dest.bak.$TS"
  elif [ -e "$dest" ]; then
    if [ "$FORCE" != 1 ]; then
      echo "refuse: $dest 가 이미 있음 (--force 로 백업 후 덮어쓰기)"; return 2
    fi
    mv "$dest" "$dest.bak.$TS"
  fi
  return 0
}

install_one() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  local rc=0
  prepare_target "$dest" "$src" || rc=$?
  [ "$rc" = 1 ] && return 0
  [ "$rc" = 2 ] && return 1
  case "$MODE" in
    symlink) ln -s "$src" "$dest" ;;
    copy)    cp -RL "$src" "$dest" ;;
  esac
  echo "installed: $dest"
}

has_claude_target() { command -v claude >/dev/null 2>&1 || [ -d "$CLAUDE_HOME" ]; }
has_codex_target()  { command -v codex  >/dev/null 2>&1 || [ -d "$CODEX_HOME" ]; }

# ---- Claude ----
if [ "$DO_CLAUDE" != no ] && has_claude_target; then
  echo "== Claude Code =="
  for d in "$SKILLS_DIR"/*/; do
    [ -d "$d" ] || continue
    install_one "${d%/}" "$CLAUDE_HOME/skills/$(basename "$d")"
  done
  if compgen -G "$AGENTS_DIR/*.md" >/dev/null 2>&1; then
    for a in "$AGENTS_DIR"/*.md; do
      install_one "$a" "$CLAUDE_HOME/agents/$(basename "$a")"
    done
  fi
else
  echo "== Claude Code: 건너뜀 =="
fi

# ---- Codex (같은 스킬 소스를 공유) ----
if [ "$DO_CODEX" != no ] && has_codex_target; then
  echo "== Codex =="
  for d in "$SKILLS_DIR"/*/; do
    [ -d "$d" ] || continue
    install_one "${d%/}" "$CODEX_HOME/skills/$(basename "$d")"
  done
else
  echo "== Codex: 건너뜀 =="
fi

echo ""
echo "완료 (mode=$MODE)."
echo "  Claude: 새 세션에서 /<스킬명> 또는 자연어 트리거"
echo "  Codex : \$<스킬명> 또는 /skills 메뉴"
echo "  업데이트: ./update.sh · 제거: ./uninstall.sh"
