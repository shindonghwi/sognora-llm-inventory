/**
 * audit.mjs — 계약 하나로 전 페이지를 무인 감사한다
 *
 * usage: audit.mjs --contract .sognora/page/contract.json [--diagnose] [--src src] [--out .sognora/page/qa]
 *                  [--viewports 1440x900,390x844] [--locale ""] [--only /pricing]
 *
 * 왜 있나 — 실전 사고: 29개 라우트를 감사하면서 **URL과 유형을 손으로 짝지어** 명령을
 * 스무 번 넘게 쳤다. 그 과정에서 유형을 추측했고, 추측이 막히자 사람에게 되물었다.
 * **매번 되묻는 것은 스킬의 실패다** — 의도는 P0에서 한 번 받아 계약에 굳히고(§0e),
 * 그다음부터는 이 러너가 계약을 읽어 무인으로 완주한다.
 *
 * 하는 일: 계약의 모든 페이지 × 로케일에 대해 `alive.mjs`(유형·must·mustNot 포함)를 돌리고,
 * 이어서 `sameness.mjs`로 교차 검사를 한 뒤, 한 장짜리 보고서로 합친다.
 *
 * 도장의 범위: 이 감사는 **구조·렌더와 계약에 선언된 항목의 존재**만 본다.
 * "이 화면이 잘 만들어졌는가"는 판정하지 않는다 — 관측 불가 영역에 도장을 찍지 않는다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { argv, exit } from "node:process";
import { loadContract, pageUrl } from "./contract.mjs";
import { load, missing } from "./_deps.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(argv.slice(2));
if (!args.contract) {
  console.error("usage: audit.mjs --contract <계약파일> [--diagnose] [--src <소스 디렉터리>] [--out <dir>] [--viewports 1440x900,390x844] [--locale <접두사>] [--only <route>]");
  console.error("  --diagnose  이미 있는 사이트를 재는 모드(§P0-a) — 시안 검사를 생략한다");
  console.error("계약이 없으면 먼저: node contract.mjs --init --base <URL> --routes </a,/b,...>");
  exit(2);
}

let contract;
try { contract = await loadContract(String(args.contract)); }
catch (e) { console.error("🔴 " + e.message); exit(2); }

if (contract.todos.length) {
  console.error(
    `🔴 계약에 미기입 ${contract.todos.length}건 — 기계가 지어내지 않는다. 사람이 채운 뒤 다시 돌려라:\n  - ` +
    contract.todos.join("\n  - "));
  exit(2);
}

// facts(콘텐츠 조달)는 **빌드 의무**다. 진단은 있는 화면을 재기만 하므로 요구하지 않는다.
if (args.diagnose !== true && contract.buildTodos?.length) {
  console.error(
    `🔴 콘텐츠 조달 미기입 ${contract.buildTodos.length}건 — 이게 비면 구조만 갖춘 빈 틀이 나온다(§0g).\n  - ` +
    contract.buildTodos.join("\n  - ") +
    `\n\n진단만 할 거면 --diagnose 로 돌려라(그때는 요구하지 않는다).`);
  exit(2);
}

const viewports = String(args.viewports ?? "1440x900,390x844");
const outDir = args.out ? String(args.out) : null;
const onlyRoute = typeof args.only === "string" ? args.only : null;
// 교차 검사는 로케일 하나로 한다 — 같은 페이지의 en/ko는 당연히 같은 골격이고, 그건 정상이다.
const crossLocale = typeof args.locale === "string" ? args.locale : contract.locales[0] ?? "";

const targets = contract.pages.filter((p) => !p.skip && (!onlyRoute || p.route === onlyRoute));
if (!targets.length) { console.error("대상 페이지가 없다(--only 오타이거나 전부 skip)"); exit(2); }

const urlOf = (route, loc) => pageUrl(contract.baseUrl, loc, route);
// 보고서의 화면 열은 **실제로 요청한 URL의 경로**를 그대로 쓴다.
// 실전 사고: 로케일과 라우트를 여기서 또 이어붙이다가 영문(로케일 "")에서
// `//product`가 찍혔다. URL 생성은 멀쩡했는데 **표만 틀렸고**, 그걸 본 사람은
// URL 결합 버그로 읽었다 — 결합 규칙을 세 번째로 복사한 대가다(v1.8.4).
const shownPath = (r) => { try { return new URL(r.url).pathname; } catch { return r.url; } };

// ── 0) 사전 점검 — **브라우저 없이 48개 URL을 돌지 않는다** ────────────────
// 실전 사고: playwright가 없는 프로젝트에서 24페이지×2로케일을 전부 돌고 **6분 50초 뒤에**
// "모듈을 찾지 못했다"가 나왔다. 화면별 판정은 하나도 안 나왔는데 시간만 태운 것이다.
// 못 할 검사는 시작 전에 못 한다고 말한다 — 여기서 멈추는 것이 48번 실패하는 것보다 낫다.
if (!(await load("playwright"))) {
  missing(["playwright"]);
  console.error(`감사를 시작하지 않았다 — 화면 ${targets.length}개는 하나도 판정되지 않았다.`);
  console.error(`갖추고 다시 돌려라:  node ${join(here, "preflight.mjs")} --install`);
  console.error(`이미 다른 곳에 있으면: SG_PLAYWRIGHT=<모듈 경로>`);
  exit(2);
}

// 진단 모드 — **이미 있는 사이트를 재는 경우**(§P0-a). 시안(§1c)은 빌드 의무이지
// 진단 의무가 아니다. 아직 무엇을 다시 만들지 정하지도 않았는데 24장 전부에
// `NO-COMP` 🔴을 찍으면, 정작 찾으려던 신호가 그 밑에 묻힌다.
const diagnose = args.diagnose === true;

// ── 0a) 시안 존재 — 코드를 짜기 전에 보고 만들 목표물이 있어야 한다(§1c) ──
let compOut = "", compCode = 0;
if (diagnose) {
  compOut = "- (진단 모드 — 시안 검사 생략. §1c는 **빌드** 의무다. 다시 만들 화면을 정한 뒤 `--diagnose` 없이 다시 돌려라)\n";
  process.stderr.write("⏭  시안 (진단 모드 — 생략)\n");
} else {
  const r = await run([join(here, "comp.mjs"), "--contract", String(args.contract), "--check",
    ...(args["comps"] ? ["--out", String(args["comps"])] : [])]);
  compOut = r.out; compCode = r.code;
  process.stderr.write(`${compCode === 0 ? "✅" : "🔴"} 시안\n`);
}

// ── 0b) 컴포넌트 층 — 프로젝트 단위라 **1회만** 돈다 ──────────────────────
// 페이지마다 내면 같은 🔴이 열 번 찍혀 보고서를 못 읽는 물건으로 만든다.
let primOut = "- (건너뜀 — `--src`를 주면 컴포넌트 층을 검사한다)\n", primCode = 0;
const srcDir = typeof args.src === "string" ? args.src : (typeof contract.src === "string" ? contract.src : null);
if (srcDir) {
  const r = await run([join(here, "primitives.mjs"), "--src", srcDir]);
  primOut = r.out; primCode = r.code;
  process.stderr.write(`${primCode === 0 ? "✅" : "🔴"} 컴포넌트 층 (${srcDir})\n`);
}

// ── 1) 페이지마다 alive ──────────────────────────────────────────────────
const rows = [];
for (const p of targets) {
  for (const loc of p.locales) {
    const url = urlOf(p.route, loc);
    const a = [join(here, "alive.mjs"), "--url", url, "--type", p.type.declared ? "landing" : p.type.name, "--viewports", viewports];
    // read:/do: 로 그 자리에서 선언한 유형은 alive의 유형별 구조 검사 대상이 아니다(§0b 미등재).
    // 그런 페이지는 유형 검사를 건너뛰고 계약(must/mustNot)과 생존 검사만 받는다 — 지어내지 않는다.
    if (p.type.declared) a.splice(a.indexOf("--type"), 2);
    if (p.expectStatus != null) a.push("--expect-status", String(p.expectStatus));
    if (p.must.length) a.push("--must", p.must.join("||"));
    if (p.mustNot.length) a.push("--must-not", p.mustNot.join("||"));
    const { code, out } = await run(a);
    const findings = out.split("\n").filter((l) => /^- (🔴|🟡)/.test(l));
    rows.push({ route: p.route, loc, url, type: p.type, decision: p.decision, code, findings, declared: p.type.declared });
    process.stderr.write(`${code === 0 ? "✅" : code === 1 ? "🔴" : "⚠️ "} ${url}\n`);
  }
}

// ── 2) 교차 검사(sameness) — 등재 유형만, 한 로케일로 ─────────────────────
const crossPages = targets.filter((p) => p.locales.includes(crossLocale));
let crossOut = "", crossCode = 0;
if (crossPages.length >= 2) {
  const s = [join(here, "sameness.mjs"),
    "--pages", crossPages.map((p) => urlOf(p.route, crossLocale)).join(","),
    "--types", crossPages.map((p) => (p.type.declared ? `${p.type.verb}:${p.type.name}` : p.type.name)).join(",")];
  const r = await run(s);
  crossOut = r.out; crossCode = r.code;
  process.stderr.write(`${crossCode === 0 ? "✅" : "🔴"} 교차 검사 ${crossPages.length}페이지\n`);
} else {
  crossOut = `- (교차 검사 생략 — 로케일 "${crossLocale}"에 페이지가 ${crossPages.length}개뿐이다)\n`;
}

// ── 3) 보고 ──────────────────────────────────────────────────────────────
const failed = rows.filter((r) => r.code === 1);
const errored = rows.filter((r) => r.code !== 0 && r.code !== 1);
const md =
  `# 페이지 감사 — ${contract.baseUrl} · ${rows.length}개 화면\n\n` +
  `> 이 감사는 **구조·렌더와 계약에 선언된 항목의 존재**만 본다. ` +
  `"이 화면이 잘 만들어졌는가"는 판정하지 않는다 — 그건 P0에서 의도를 선언한 사람의 일이다.\n\n` +
  `| 화면 | 유형 | 이 화면이 돕는 결정 | 결과 |\n|---|---|---|---|\n` +
  rows.map((r) => `| \`${shownPath(r)}\` | ${r.type.name}${r.declared ? " (계약 선언)" : ""} | ${r.decision ?? "—"} | ${r.code === 0 ? "통과" : r.code === 1 ? `🔴 ${r.findings.filter((f) => f.includes("🔴")).length}건` : "⚠️ 실행 실패"} |`).join("\n") +
  `\n\n## 화면별 지적\n\n` +
  (rows.every((r) => !r.findings.length)
    ? "- ✅ 구조·계약 이상 없음(의도 부합은 미판정)\n"
    : rows.filter((r) => r.findings.length).map((r) => `### \`${shownPath(r)}\` (${r.type.name})\n\n${r.findings.join("\n")}\n`).join("\n")) +
  `\n## 교차 검사 — 서로 같은 화면인가\n\n${crossOut}\n` +
  `\n## 시안 (§1c · 빌드 전 목표물)${diagnose ? " — 진단 모드에서는 미판정" : ""}\n\n${compOut}\n` +
  `\n## 컴포넌트 층 (프로젝트 단위 · 1회)\n\n${primOut}\n` +
  `\n---\n\n**화면 ${rows.length}개 중 실패 ${failed.length}개**${errored.length ? ` · 실행 실패 ${errored.length}개` : ""}` +
  ` · 교차 검사 ${crossCode === 0 ? "통과" : "실패"} · 시안 ${diagnose ? "미판정(진단 모드)" : compCode === 0 ? "통과" : "실패"}` +
  `${srcDir ? ` · 컴포넌트 층 ${primCode === 0 ? "통과" : "실패"}` : ""}\n`;

if (outDir) { await mkdir(outDir, { recursive: true }); await writeFile(join(outDir, "audit.md"), md); }
console.log(md);
exit(failed.length || crossCode === 1 || primCode === 1 || compCode === 1 || errored.length ? 1 : 0);

function run(argv2) {
  return new Promise((res) => {
    const ch = spawn(process.execPath, argv2, { env: process.env });
    let out = "";
    ch.stdout.on("data", (d) => (out += d));
    ch.stderr.on("data", (d) => (out += d));
    ch.on("close", (code) => res({ code, out }));
  });
}
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
