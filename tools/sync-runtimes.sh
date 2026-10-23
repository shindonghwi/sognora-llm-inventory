#!/usr/bin/env bash
# 현재 작업트리의 한 소스를 Claude와 Codex에 모두 재설치하고 지문까지 대조한다.
set -euo pipefail

SYNC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_PLUGIN="sognora-llm-inventory"
SYNC_MARKET="sognora-llm-inventory"
SYNC_PLUGIN_ROOT="$SYNC_ROOT/plugins/$SYNC_PLUGIN"
SYNC_VALIDATOR="${PLUGIN_CREATOR_ROOT:-$HOME/.codex/skills/.system/plugin-creator}/scripts/validate_plugin.py"

for command_name in claude codex python3 node; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "필수 명령 누락: $command_name" >&2; exit 2; }
done

echo "== 소스 검증 =="
"$SYNC_ROOT/tools/check.sh"
# 사고: Codex 0.163에서 plugin-creator가 시스템 스킬에서 빠져 동기화가 exit 2로 멈췄다(2026-10-23).
# 검증기가 있으면 쓰고, 없으면 codex plugin add 자체의 매니페스트 검증과 마지막 지문 대조에 맡긴다.
if [ ! -f "$SYNC_VALIDATOR" ]; then
  echo "plugin-creator 검증기 없음 — codex plugin add의 매니페스트 검증으로 대신한다"
elif command -v uv >/dev/null 2>&1; then
  uv run --with pyyaml python "$SYNC_VALIDATOR" "$SYNC_PLUGIN_ROOT"
elif python3 -c 'import yaml' >/dev/null 2>&1; then
  python3 "$SYNC_VALIDATOR" "$SYNC_PLUGIN_ROOT"
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

# codex plugin remove는 로컬 캐시까지 지운다(0.163 도움말). 같은 버전이어도 add가 현재 작업트리를 새로 복사하므로
# 매니페스트 버전을 임시로 바꾸던 cachebuster는 필요 없다. 복사가 실제로 새로 됐는지는 아래 지문 대조가 판정한다.
codex plugin remove "$SYNC_PLUGIN@$SYNC_MARKET" >/dev/null 2>&1 || true
codex plugin add "$SYNC_PLUGIN@$SYNC_MARKET"

echo "== 양쪽 버전·지문 검증 =="
node "$SYNC_ROOT/tools/verify-runtime-sync.mjs" "$SYNC_ROOT"
echo "동기화 완료 — Claude는 새 세션, Codex는 새 스레드에서 반영됩니다."
