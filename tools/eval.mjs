#!/usr/bin/env node
/**
 * eval.mjs — **스킬 자체를 잰다.**
 *
 * 이 레포에는 재는 자가 세 층 필요한데 두 층만 있었다:
 *
 *   1. 산출물을 잰다   — `alive`·`sameness`·`detect` … 있음(7,000줄)
 *   2. 규칙을 잰다     — `corpus.mjs`(프리미엄 레퍼런스에서 발동하면 규칙이 아니다) … 신설
 *   3. **스킬을 잰다** — 스킬을 붙였을 때 결과가 실제로 나아지는가 … **없었다**
 *
 * 3층이 없어서 스킬 결함이 전부 사용자 실행에서만 드러났다(한 세션에서 4건). 그리고
 * 사람이 스킬 대신 손으로 감사를 돌렸다 — 재는 자가 없으면 사람이 그 자리를 메운다.
 *
 * 설계 — **채점기는 이미 있다.** 이 레포의 게이트가 곧 assertion이다. eval은 에이전트를
 * 같은 과제에 여러 번 태우고, 산출된 작업공간에 그 게이트를 돌려 통과율을 낸다.
 * 스킬 있음/없음 두 팔을 같은 과제로 돌려 **델타**를 본다 — 절대 점수는 과제 난이도를
 * 재는 것이지 스킬을 재는 것이 아니다.
 *
 * 분산을 반드시 함께 낸다. 1회 실행의 통과/실패는 스킬이 아니라 운이다.
 *
 * usage:
 *   node tools/eval.mjs --case evals/sg-page-craft/pricing --runs 3
 *   node tools/eval.mjs --case <dir> --runs 3 --arms skill        # 한 팔만
 *   node tools/eval.mjs --list
 */
import { readdir, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { argv, exit } from "node:process";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const EVALS = join(ROOT, "evals");
const args = parseArgs(argv.slice(2));

if (args.list) {
  for (const skill of await lsDir(EVALS)) for (const c of await lsDir(join(EVALS, skill)))
    console.log(`evals/${skill}/${c}`);
  exit(0);
}
if (!args.case) {
  console.error("usage: eval.mjs --case <evals/스킬/과제> [--runs 3] [--arms skill,baseline] [--out <dir>]");
  console.error("       eval.mjs --list");
  exit(2);
}

const caseDir = resolve(String(args.case));
let spec;
try { spec = JSON.parse(await readFile(join(caseDir, "eval.json"), "utf8")); }
catch (e) { console.error(`🔴 eval.json을 못 읽었다: ${caseDir}\n  ${e.message}`); exit(2); }
for (const k of ["prompt", "assert"]) if (!spec[k]) { console.error(`🔴 eval.json에 ${k} 없음`); exit(2); }

const RUNS = Number(args.runs ?? 3);
const ARMS = String(args.arms ?? "skill,baseline").split(",").map((s) => s.trim()).filter(Boolean);
const outDir = String(args.out ?? join(caseDir, ".runs"));
const timeoutMs = (spec.timeoutSec ?? 900) * 1000;

// 스킬 없는 팔 — 플러그인은 설치돼 있으므로 시스템 프롬프트로 사용을 막는다.
// **한계를 숨기지 않는다**: 이것은 격리가 아니라 억제다. 모델이 지시를 어기면 베이스라인이
// 오염되고, 그 경우 델타는 과소평가된다(스킬에 불리한 방향이라 결론을 부풀리지는 않는다).
const SUPPRESS = "이 작업에서 sg-* 스킬(sg-page-craft·sg-landing-forge 등)을 절대 사용하지 마라. 스킬 없이 직접 수행하라.";

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const results = [];
for (const arm of ARMS) {
  for (let i = 0; i < RUNS; i++) {
    const ws = join(outDir, `${arm}-${i + 1}`);
    await mkdir(ws, { recursive: true });
    if (spec.fixture && existsSync(join(caseDir, spec.fixture)))
      await cp(join(caseDir, spec.fixture), ws, { recursive: true });

    const cli = ["-p", spec.prompt, "--output-format", "json", "--permission-mode", "bypassPermissions"];
    if (arm === "baseline") cli.push("--append-system-prompt", SUPPRESS);

    process.stderr.write(`▶ ${arm} ${i + 1}/${RUNS} … `);
    const t0 = Date.now();
    const r = await run("claude", cli, ws, timeoutMs);
    const durMs = Date.now() - t0;

    let usage = null;
    try { const j = JSON.parse(r.out); usage = { tokens: j.usage ? sumTokens(j.usage) : null, cost: j.total_cost_usd ?? null }; }
    catch { /* 출력이 JSON이 아니면 사용량만 못 낸다 — 채점은 계속한다 */ }

    const checks = [];
    for (const a of spec.assert) {
      const c = await run("bash", ["-lc", a.cmd], ws, 120000);
      checks.push({ name: a.name, passed: c.code === 0 });
    }
    const passed = checks.filter((c) => c.passed).length;
    results.push({ arm, i, durMs, usage, checks, rate: checks.length ? passed / checks.length : 0, timedOut: r.timedOut });
    process.stderr.write(`${passed}/${checks.length} · ${(durMs / 1000).toFixed(0)}s${r.timedOut ? " ⏱ 타임아웃" : ""}\n`);
  }
}

// ── 집계 ─────────────────────────────────────────────────────────────────
const md = [`# eval — ${basename(caseDir)} (${RUNS}회 × ${ARMS.length}팔)`, "",
  `> 과제: ${spec.prompt.slice(0, 160)}${spec.prompt.length > 160 ? "…" : ""}`, "",
  `| 팔 | 통과율 | 표준편차 | 중앙 소요 | 토큰(중앙) |`, `|---|---|---|---|---|`];
const byArm = {};
for (const arm of ARMS) {
  const rs = results.filter((r) => r.arm === arm);
  const rates = rs.map((r) => r.rate);
  const m = mean(rates), sd = stddev(rates);
  byArm[arm] = m;
  md.push(`| ${arm} | ${(m * 100).toFixed(0)}% | ±${(sd * 100).toFixed(0)}%p | ${(median(rs.map((r) => r.durMs)) / 1000).toFixed(0)}s | ${fmt(median(rs.map((r) => r.usage?.tokens).filter(Number.isFinite)))} |`);
}
if (ARMS.includes("skill") && ARMS.includes("baseline")) {
  const d = (byArm.skill - byArm.baseline) * 100;
  md.push("", `**델타 ${d >= 0 ? "+" : ""}${d.toFixed(0)}%p** — 스킬이 통과율을 ${d >= 0 ? "올린" : "내린"} 폭.` +
    ` 표준편차보다 작으면 **표본이 부족한 것이지 효과가 있는 것이 아니다.**`);
}
md.push("", "## assertion별", "", `| 검사 | ${ARMS.join(" | ")} |`, `|---|${ARMS.map(() => "---").join("|")}|`);
for (const a of spec.assert) {
  const cells = ARMS.map((arm) => {
    const rs = results.filter((r) => r.arm === arm);
    return `${rs.filter((r) => r.checks.find((c) => c.name === a.name)?.passed).length}/${rs.length}`;
  });
  md.push(`| ${a.name} | ${cells.join(" | ")} |`);
}
md.push("", `> 베이스라인은 격리가 아니라 **억제**다(시스템 프롬프트로 스킬 사용 금지). 모델이 지시를 어기면 델타는 과소평가된다.`);

const out = md.join("\n") + "\n";
await writeFile(join(outDir, "eval.md"), out);
await writeFile(join(outDir, "results.json"), JSON.stringify({ case: basename(caseDir), runs: RUNS, arms: ARMS, results }, null, 2) + "\n");
console.log(out);
exit(0);

// ── 헬퍼 ─────────────────────────────────────────────────────────────────
function run(cmd, a, cwd, ms) {
  return new Promise((res) => {
    const ch = spawn(cmd, a, { cwd, env: process.env });
    let out = "", timedOut = false;
    const t = setTimeout(() => { timedOut = true; ch.kill("SIGKILL"); }, ms);
    ch.stdout.on("data", (d) => (out += d));
    ch.stderr.on("data", (d) => (out += d));
    ch.on("close", (code) => { clearTimeout(t); res({ code, out, timedOut }); });
    ch.on("error", () => { clearTimeout(t); res({ code: -1, out, timedOut }); });
  });
}
function sumTokens(u) {
  return ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
    .reduce((s, k) => s + (Number(u[k]) || 0), 0) || null;
}
// 집계 헬퍼는 **함수 선언**이다 — 화살표 const로 두면 위쪽 집계부에서 TDZ로 죽는다(실측).
function mean(x) { return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0; }
function stddev(x) { if (x.length < 2) return 0; const m = mean(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); }
function median(x) { return x.length ? [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)] : NaN; }
function fmt(n) { return Number.isFinite(n) ? (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)) : "—"; }
async function lsDir(p) { try { return (await readdir(p, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } }
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
