#!/usr/bin/env bash
# 레포 자체 점검 — 스킬이 아니라 **이 레포를 판정한다**.
# push 전에 돌린다: ./tools/check.sh
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
echo "── 스킬 간 공유 파일 동일성 ──────────────────────────────"
node tools/check-shared.mjs || fail=1
echo
echo "── 매니페스트 버전 정합 ──────────────────────────────────"
node tools/check-version.mjs || fail=1
echo
echo "── 판정을 가르는 숫자의 근거(래칫) ───────────────────────"
node tools/consts.mjs || fail=1
echo
echo "── sg-ko-humanize 회귀 테스트 ──────────────────────────"
python3 -m unittest discover \
  -s plugins/sognora-llm-inventory/skills/sg-ko-humanize/tests \
  -p 'test_*.py' || fail=1
echo
echo "── sg-en-humanize 회귀 테스트 ──────────────────────────"
python3 -m unittest discover \
  -s plugins/sognora-llm-inventory/skills/sg-en-humanize/tests \
  -p 'test_*.py' || fail=1

echo
echo "── sg-web-replicate 악성 회귀 테스트 ───────────────────"
node --test plugins/sognora-llm-inventory/skills/sg-web-replicate/tests/*.test.mjs || fail=1

echo
echo "── 양쪽 런타임 동기화 계기 문법 ────────────────────────"
bash -n setup.sh install.sh update.sh tools/sync-runtimes.sh || fail=1
node --check tools/verify-runtime-sync.mjs || fail=1

echo
if [ "$fail" -ne 0 ]; then echo "🔴 자체 점검 실패"; exit 1; fi
echo "✅ 자체 점검 통과"
