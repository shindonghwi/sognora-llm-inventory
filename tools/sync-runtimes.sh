#!/usr/bin/env bash
# 현재 작업트리의 한 소스를 Claude와 Codex에 모두 재설치하고 지문까지 대조한다.
set -euo pipefail

SYNC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_PLUGIN="sognora-llm-inventory"
SYNC_MARKET="sognora-llm-inventory"
SYNC_PLUGIN_ROOT="$SYNC_ROOT/plugins/$SYNC_PLUGIN"
SYNC_CODEX_MANIFEST="$SYNC_PLUGIN_ROOT/.codex-plugin/plugin.json"
SYNC_CACHEBUSTER="${PLUGIN_CREATOR_ROOT:-$HOME/.codex/skills/.system/plugin-creator}/scripts/update_plugin_cachebuster.py"

for command_name in claude codex python3 node; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "필수 명령 누락: $command_name" >&2; exit 2; }
done
test -f "$SYNC_CACHEBUSTER" || { echo "plugin-creator cachebuster를 찾지 못함: $SYNC_CACHEBUSTER" >&2; exit 2; }

echo "== 소스 검증 =="
"$SYNC_ROOT/tools/check.sh"
if command -v uv >/dev/null 2>&1; then
  uv run --with pyyaml python "${PLUGIN_CREATOR_ROOT:-$HOME/.codex/skills/.system/plugin-creator}/scripts/validate_plugin.py" "$SYNC_PLUGIN_ROOT"
elif python3 -c 'import yaml' >/dev/null 2>&1; then
  python3 "${PLUGIN_CREATOR_ROOT:-$HOME/.codex/skills/.system/plugin-creator}/scripts/validate_plugin.py" "$SYNC_PLUGIN_ROOT"
else
  echo "플러그인 검증에 PyYAML이 필요합니다: python3 -m pip install pyyaml" >&2
  exit 2
fi

echo "== Claude Code: 현재 작업트리로 재설치 =="
SYNC_CLAUDE_SOURCE="$(claude plugin marketplace list --json | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s).find(v=>v.name==="sognora-llm-inventory");process.stdout.write(x?.source==="directory"||x?.source==="local"?String(x.path??x.directory??""):x?"REMOTE":"MISSING")})')"
if [ "$SYNC_CLAUDE_SOURCE" != "$SYNC_ROOT" ]; then
  if [ "$SYNC_CLAUDE_SOURCE" != "MISSING" ]; then claude plugin marketplace remove "$SYNC_MARKET" --scope user; fi
  claude plugin marketplace add "$SYNC_ROOT" --scope user
fi
claude plugin uninstall "$SYNC_PLUGIN@$SYNC_MARKET" --scope user --keep-data >/dev/null 2>&1 || true
claude plugin install "$SYNC_PLUGIN@$SYNC_MARKET" --scope user -y

echo "== Codex: 현재 작업트리로 재설치 =="
SYNC_CODEX_SOURCE="$(codex plugin marketplace list --json | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s).marketplaces.find(v=>v.name==="sognora-llm-inventory");process.stdout.write(String(x?.marketplaceSource?.source??x?.root??"MISSING"))})')"
if [ "$SYNC_CODEX_SOURCE" != "$SYNC_ROOT" ]; then
  if [ "$SYNC_CODEX_SOURCE" != "MISSING" ]; then codex plugin marketplace remove "$SYNC_MARKET"; fi
  codex plugin marketplace add "$SYNC_ROOT"
fi

SYNC_MANIFEST_BACKUP="$(mktemp /tmp/sognora-codex-manifest.XXXXXX)"
cp "$SYNC_CODEX_MANIFEST" "$SYNC_MANIFEST_BACKUP"
restore_manifest() {
  cp "$SYNC_MANIFEST_BACKUP" "$SYNC_CODEX_MANIFEST"
  if command -v trash >/dev/null 2>&1; then trash "$SYNC_MANIFEST_BACKUP"; else rm -f "$SYNC_MANIFEST_BACKUP"; fi
}
trap restore_manifest EXIT
python3 "$SYNC_CACHEBUSTER" "$SYNC_PLUGIN_ROOT"
codex plugin remove "$SYNC_PLUGIN@$SYNC_MARKET" >/dev/null 2>&1 || true
codex plugin add "$SYNC_PLUGIN@$SYNC_MARKET"
restore_manifest
trap - EXIT

echo "== 양쪽 버전·지문 검증 =="
node "$SYNC_ROOT/tools/verify-runtime-sync.mjs" "$SYNC_ROOT"
echo "동기화 완료 — Claude는 새 세션, Codex는 새 스레드에서 반영됩니다."
