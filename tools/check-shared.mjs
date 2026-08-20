#!/usr/bin/env node
/**
 * check-shared.mjs — 스킬 사이에 복사된 파일이 갈라졌는지 판정한다.
 *
 * 왜 있나 — 실전 사고: `_deps.mjs`가 세 스킬에 복사돼 있었는데 page-craft 복사본만
 * `playwright-core` 폴백과 `SG_PLAYWRIGHT`를 받았다. 그래서 같은 머신 같은 프로젝트에서
 * `sameness.mjs`는 돌고 `detect.mjs`는 "playwright 미설치"로 죽었다.
 * **검사를 안 돌린 것과 통과가 구분되지 않는 상태**가 스킬마다 다르게 남아 있던 것이다.
 *
 * 스킬은 자기완결 폴더여야 하므로(배포 단위) 공유 파일은 복사본으로 둔다.
 * 그러면 표류는 시간 문제다 — **복사를 금지하는 대신 갈라짐을 판정한다.**
 *
 * usage: node tools/check-shared.mjs
 *   exit 0 = 모든 복사본 동일 · exit 1 = 갈라짐 · exit 2 = 실행 오류
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { exit } from "node:process";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// 스킬 사이에 의도적으로 복사되는 파일들. 새로 생기면 여기 등재한다.
const SHARED = ["scripts/_deps.mjs"];

const skillsDir = join(ROOT, "plugins", "sognora-llm-inventory", "skills");
let skills;
try {
  skills = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory());
} catch (e) {
  console.error(`🔴 스킬 디렉터리를 못 읽었다: ${skillsDir} — ${e.message}`);
  exit(2);
}

let failed = 0;
for (const rel of SHARED) {
  const copies = [];
  for (const s of skills) {
    const p = join(skillsDir, s, rel);
    let body;
    try { body = readFileSync(p, "utf8"); } catch { continue; } // 그 스킬은 이 파일을 안 쓴다
    copies.push({ path: relative(ROOT, p), hash: createHash("sha256").update(body).digest("hex").slice(0, 12) });
  }
  if (copies.length < 2) {
    console.log(`✅ ${rel} — 복사본 ${copies.length}개(비교 대상 없음)`);
    continue;
  }
  const groups = new Map();
  for (const c of copies) {
    if (!groups.has(c.hash)) groups.set(c.hash, []);
    groups.get(c.hash).push(c.path);
  }
  if (groups.size === 1) {
    console.log(`✅ ${rel} — 복사본 ${copies.length}개 전부 동일 (${copies[0].hash})`);
    continue;
  }
  failed++;
  console.error(`🔴 ${rel} — 복사본 ${copies.length}개가 ${groups.size}갈래로 갈라졌다:`);
  for (const [hash, paths] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    console.error(`    ${hash}  ${paths.join("\n              ")}`);
  }
  const [a, b] = [...groups.values()].map((g) => g[0]);
  console.error(`    확인:  diff ${a} ${b}`);
  console.error(`    한쪽이 정본이면 복사해서 맞춰라 — 이 파일이 갈라지면 스킬마다 "검사를 안 돌린 것"이 다르게 나타난다.`);
}

if (failed) {
  console.error(`\n**실패 ${failed}건**`);
  exit(1);
}
console.log("\n**통과** — 스킬 간 공유 파일이 갈라지지 않았다");
exit(0);
