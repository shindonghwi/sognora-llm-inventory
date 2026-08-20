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
if [ "$fail" -ne 0 ]; then echo "🔴 자체 점검 실패"; exit 1; fi
echo "✅ 자체 점검 통과"
