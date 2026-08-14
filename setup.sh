#!/usr/bin/env bash
# sognora-llm-inventory — 원라인 설치 부트스트랩
#
#   curl -fsSL https://raw.githubusercontent.com/shindonghwi/sognora-llm-inventory/main/setup.sh | bash
#
# claude / codex CLI를 자동 감지해 마켓플레이스 등록 + 플러그인 설치까지 한 번에 끝낸다.
# 재실행하면 업데이트로 동작한다(멱등). plugin 명령이 없는 구버전 CLI는
# ~/.sognora-llm-inventory 클론 + 심링크 설치로 자동 fallback.
#
# Env:
#   SOGNORA_REPO=owner/repo   # 기본 슬러그 override
#   SOGNORA_DRY=1             # 실행할 명령만 출력
set -euo pipefail

GH_SLUG="${SOGNORA_REPO:-shindonghwi/sognora-llm-inventory}"
PLUGIN="sognora-llm-inventory"
MARKET="sognora-llm-inventory"

run() {
  if [ "${SOGNORA_DRY:-0}" = 1 ]; then echo "DRY: $*"; else "$@"; fi
}

ok=0
fallback_needed=0

# ---- Claude Code ----
if command -v claude >/dev/null 2>&1; then
  echo "== Claude Code =="
  if claude plugin marketplace --help >/dev/null 2>&1; then
    run claude plugin marketplace add "$GH_SLUG" 2>/dev/null \
      || run claude plugin marketplace update "$MARKET"
    run claude plugin install -y "$PLUGIN@$MARKET"
    echo "  설치 완료 — 새 세션부터 사용 가능"
    ok=1
  else
    echo "  plugin 명령 미지원 버전 → fallback 예정"
    fallback_needed=1
  fi
fi

# ---- Codex CLI ----
if command -v codex >/dev/null 2>&1; then
  echo "== Codex CLI =="
  if codex plugin --help >/dev/null 2>&1; then
    run codex plugin marketplace add "$GH_SLUG" 2>/dev/null \
      || run codex plugin marketplace upgrade
    run codex plugin add "$PLUGIN@$MARKET"
    echo "  설치 완료 — 새 스레드부터 사용 가능"
    ok=1
  else
    echo "  plugin 명령 미지원 버전 → fallback 예정"
    fallback_needed=1
  fi
fi

# ---- Fallback: 클론 + 심링크 (구버전 CLI) ----
if [ "$fallback_needed" = 1 ]; then
  DEST="$HOME/.sognora-llm-inventory"
  echo "== Fallback: 클론 + 심링크 =="
  if [ -d "$DEST/.git" ]; then
    run git -C "$DEST" pull --ff-only
  else
    run git clone "https://github.com/$GH_SLUG.git" "$DEST"
  fi
  run "$DEST/install.sh"
  ok=1
fi

if [ "$ok" != 1 ]; then
  echo "claude 또는 codex CLI를 찾지 못했습니다. 먼저 설치해 주세요:"
  echo "  Claude Code: https://claude.com/claude-code"
  echo "  Codex CLI  : https://developers.openai.com/codex"
  exit 1
fi

echo ""
echo "완료. 업데이트도 같은 명령을 재실행하면 됩니다."
