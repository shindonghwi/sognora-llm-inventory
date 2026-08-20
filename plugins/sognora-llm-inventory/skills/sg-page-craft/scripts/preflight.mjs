#!/usr/bin/env node
/**
 * preflight.mjs — 검사에 필요한 것을 **스킬이 직접 갖춘다**.
 *
 * 왜 있나 — 실전 사고: 검사 대상 프로젝트에 playwright가 없어 24페이지 감사가 통째로
 * 죽었다. 스킬이 한 일은 "설치하세요"라고 적고 멈춘 것뿐이었고, **사람이 대신 뛰었다**
 * (그 대화에서 `SG_PLAYWRIGHT=…`를 손으로 8번 지정했다). 손으로 한 것이 곧 스킬의 결손이다.
 *
 * 같은 목적의 공개 스킬(colbymchenry/frontend-audit-skill)은 SKILL.md 첫 절이 통째로
 * **부트스트랩**이다 — 설정 파일이 없으면 그 자리에서 의존성을 깔고 진행한다. 검사 스킬은
 * 브라우저 없이는 아무 말도 할 수 없으므로, 준비는 본문이지 각주가 아니다.
 *
 * 두 가지를 본다. 모듈이 있어도 브라우저 바이너리가 없으면 못 도는데, 그 둘은 따로 깨진다
 * (버전 올림 뒤 `chromium_headless_shell-XXXX` 없음 — 실측으로 겪었다).
 *
 * usage:
 *   node preflight.mjs              # 점검만. ready면 exit 0
 *   node preflight.mjs --install    # 빠진 것을 설치한다(프로젝트 devDependency를 건드린다)
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { argv, exit, cwd } from "node:process";
import { load } from "./_deps.mjs";

const install = argv.includes("--install");

const pw = await load("playwright");
if (!pw) {
  console.error("🔴 playwright 모듈 없음");
  if (!install) {
    console.error(`  설치: node ${rel()} --install   (또는 npm i -D playwright && npx playwright install chromium)`);
    console.error(`  이미 다른 곳에 있으면: SG_PLAYWRIGHT=<모듈 경로>`);
    exit(1);
  }
  console.error(`  설치한다 — ${cwd()}`);
  if (!run("npm", ["i", "-D", "playwright"])) exit(1);
  if (!run("npx", ["playwright", "install", "chromium"])) exit(1);
  console.log("✅ playwright 설치 완료 — 다시 실행하면 준비 상태를 확인한다");
  exit(0);
}

// 모듈은 있는데 브라우저가 없는 경우 — 여기서 안 잡으면 첫 페이지에서 죽는다
let exe = null;
try { exe = pw.chromium?.executablePath?.() ?? null; } catch { /* 버전에 따라 던진다 */ }
if (exe && !existsSync(exe)) {
  console.error(`🔴 chromium 바이너리 없음 — 모듈은 있는데 브라우저를 안 받았다\n  ${exe}`);
  if (!install) { console.error(`  설치: node ${rel()} --install`); exit(1); }
  if (!run("npx", ["playwright", "install", "chromium"])) exit(1);
  console.log("✅ chromium 설치 완료");
  exit(0);
}

console.log(`✅ 준비됨 — playwright ${exe ? "· chromium 확인" : "(경로 미확인, 실행으로 확인한다)"}`);
exit(0);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error(`🔴 \`${cmd} ${args.join(" ")}\` 실패 — 직접 실행해보라`); return false; }
  return true;
}
function rel() { return "scripts/preflight.mjs"; }
