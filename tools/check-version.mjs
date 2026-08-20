#!/usr/bin/env node
/**
 * check-version.mjs — 매니페스트 3곳의 버전이 서로, 그리고 최신 태그와 맞는가.
 *
 * 왜 있나 — README 릴리스 절이 "manifest 3곳 동시 bump + `v<버전>` 태그"라고 시키는데
 * **판정자가 없었다.** 실제로 갈라졌다: 태그는 `v1.11.2`인데 매니페스트는 셋 다 `1.11.0`.
 * bump를 sed로 하다 보니 앞 버전 문자열이 안 맞으면 조용히 아무것도 안 바꾼다.
 * 설치하는 사람이 보는 버전과 배포된 코드가 어긋나는 것이 이 검사가 막는 것이다.
 *
 * usage: node tools/check-version.mjs
 *   exit 0 = 일치 · 1 = 어긋남
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exit } from "node:process";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const FILES = [
  ["marketplace(metadata)", ".claude-plugin/marketplace.json", (j) => j.metadata?.version],
  ["marketplace(plugins[0])", ".claude-plugin/marketplace.json", (j) => j.plugins?.[0]?.version],
  ["claude plugin.json", "plugins/sognora-llm-inventory/.claude-plugin/plugin.json", (j) => j.version],
  ["codex plugin.json", "plugins/sognora-llm-inventory/.codex-plugin/plugin.json", (j) => j.version],
];

const found = [];
for (const [label, rel, pick] of FILES) {
  let v = null;
  try { v = pick(JSON.parse(readFileSync(join(ROOT, rel), "utf8"))) ?? null; } catch { /* 아래에서 보고 */ }
  found.push({ label, rel, v });
}

let tag = null;
try {
  tag = execSync("git -C " + JSON.stringify(ROOT) + " tag --list 'v*' --sort=-v:refname", { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean)[0]?.replace(/^v/, "") ?? null;
} catch { /* 태그가 없을 수 있다 */ }

const versions = [...new Set(found.map((f) => f.v))];
let failed = 0;

if (versions.length !== 1 || versions[0] == null) {
  failed++;
  console.error("🔴 매니페스트 버전이 서로 다르다:");
  for (const f of found) console.error(`    ${f.v ?? "(못 읽음)"}  ${f.label}  — ${f.rel}`);
} else {
  console.log(`✅ 매니페스트 4개 항목 모두 ${versions[0]}`);
}

// 매니페스트가 태그보다 **앞선** 것은 정상이다 — 다음 릴리스를 준비 중인 상태.
// 막아야 하는 것은 **뒤처진** 경우다: 태그는 나갔는데 매니페스트를 안 올린 것이고,
// 그러면 설치하는 사람이 보는 버전과 배포된 코드가 어긋난다(실제로 v1.11.2에서 났다).
const cmp = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
if (tag && versions.length === 1 && versions[0]) {
  const d = cmp(versions[0], tag);
  if (d < 0) {
    failed++;
    console.error(`🔴 매니페스트 ${versions[0]} 가 최신 태그 v${tag} 보다 뒤처졌다`);
    console.error(`    태그가 나갔는데 매니페스트를 안 올렸다 — 설치하는 사람이 보는 버전이 이 값이다.`);
  } else if (d > 0) {
    console.log(`✅ 매니페스트 ${versions[0]} > 최신 태그 v${tag} — 릴리스 준비 상태`);
  } else {
    console.log(`✅ 최신 태그 v${tag} 와 일치`);
  }
} else if (!tag) {
  console.log("✅ (태그 없음 — 대조 생략)");
}

exit(failed ? 1 : 0);
