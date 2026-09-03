#!/usr/bin/env node
/**
 * preflight.mjs — 브라우저를 갖춘다. 검사 스킬은 브라우저 없이 아무 말도 못 하므로 준비는 각주가 아니라 본문이다.
 * 모듈(playwright)과 바이너리(chromium)를 **따로** 본다 — 버전을 올리면 모듈은 있는데 바이너리가 없어 첫 페이지에서 죽는다(실측).
 *
 * usage: node preflight.mjs [--install]      exit 0 = 준비됨, 2 = 미비(안내 출력)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { argv, exit, cwd } from "node:process";
import { loadPlaywright, missingPlaywright, parseArgs } from "./_deps.mjs";

/* 패키지 매니저는 lockfile로 판정한다(foundation.mjs와 같은 규칙) — npm을 무조건 쓰면 pnpm/yarn 프로젝트의 lockfile을 깨뜨린다 */
const PM = existsSync(join(cwd(), "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(cwd(), "yarn.lock")) ? "yarn" : (existsSync(join(cwd(), "bun.lockb")) || existsSync(join(cwd(), "bun.lock"))) ? "bun" : "npm";
const ADD_DEV = { pnpm: ["pnpm", ["add", "-D", "playwright"]], yarn: ["yarn", ["add", "-D", "playwright"]], bun: ["bun", ["add", "-d", "playwright"]], npm: ["npm", ["i", "-D", "playwright"]] }[PM];
const EXEC = { pnpm: "pnpm", yarn: "yarn", bun: "bunx", npm: "npx" }[PM];

const args = parseArgs(argv.slice(2));
let pw = await loadPlaywright();
if (!pw && args.install) {
  if (!existsSync(join(cwd(), "package.json"))) { console.error(`package.json 없음(${cwd()}) — 프로젝트 루트에서 실행하거나 SG_PLAYWRIGHT로 기존 설치를 가리킨다`); exit(2); }
  console.log(`playwright 모듈 설치 중(${PM}, 프로젝트 devDependency)…`);
  const r = spawnSync(ADD_DEV[0], ADD_DEV[1], { stdio: "inherit" });
  if (r.status !== 0) { console.error(`${PM} 설치 실패`); exit(2); }
  pw = await loadPlaywright();
}
if (!pw) { console.error(missingPlaywright()); exit(2); }

let ok = false;
try { const b = await pw.chromium.launch({ headless: true }); await b.close(); ok = true; }
catch (e) {
  if (args.install) {
    console.log("chromium 바이너리 설치 중…");
    const r = spawnSync(EXEC, EXEC === "yarn" ? ["playwright", "install", "chromium"] : ["playwright", "install", "chromium"], { stdio: "inherit" });
    if (r.status === 0) { try { const b = await pw.chromium.launch({ headless: true }); await b.close(); ok = true; } catch { /* 아래에서 보고 */ } }
  } else console.error(`chromium 실행 실패: ${e.message.split("\n")[0]}`);
}
if (!ok) { console.error(`브라우저 바이너리가 없다 — node preflight.mjs --install 또는 ${EXEC} playwright install chromium`); exit(2); }
console.log("✅ playwright 모듈 · chromium 바이너리 준비됨");
