#!/usr/bin/env node
/**
 * routes.json의 전 라우트에 diff.mjs를 실행하고 route × viewport × state × 404를 한 파일로 판정한다.
 * 일부 라우트만 돌린 report 묶음은 exit 0이 될 수 없다.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";
import { canonicalTarget, rendererMeta, routeId, routeTarget, scriptFingerprint, sha256, verifyEvidence, writeEvidence } from "./_shared.mjs";
import { validateSiteCompletion } from "./_verify.mjs";

const args = parseArgs(argv.slice(2));
if (!args.routes || !args.ref || !args.local || !args.out) {
  console.error("usage: verify-site.mjs --routes routes.json --ref ref-root --local http://localhost:3000 --out diff-root [--override override.json]");
  exit(2);
}
const ledger = JSON.parse(await readFile(args.routes, "utf8"));
if (!Array.isArray(ledger.routes) || !ledger.origin) { console.error("routes.json v2 원장이 필요합니다"); exit(2); }
await mkdir(args.out, { recursive: true });
const override = args.override ? JSON.parse(await readFile(args.override, "utf8")) : {};

const diffScript = fileURLToPath(new URL("./diff.mjs", import.meta.url));
const routeReports = new Map();
const execution = [];
for (const entry of ledger.routes) {
  const route = entry.route ?? entry.path;
  const id = routeId(route);
  const refDir = join(args.ref, id);
  const outDir = join(args.out, "routes", id);
  const localUrl = new URL(route, args.local).href;
  const childArgs = [diffScript, "--ref", refDir, "--local", localUrl, "--out", outDir];
  if (args.override) childArgs.push("--override", args.override);
  if (args.storage) childArgs.push("--storage", args.storage);
  if (args.headed) childArgs.push("--headed");
  let code = null;
  if (!args["reports-only"]) code = await run(process.execPath, childArgs);
  try {
    const report = JSON.parse(await readFile(join(outDir, "report.json"), "utf8"));
    routeReports.set(route, report);
    execution.push({ route, routeId:id, exitCode:code, reportPass:report.pass });
    for (const vp of report.report ?? []) {
      const evidence = await verifyEvidence(join(outDir, vp.viewport));
      if (!evidence.ok) execution.push({ route, viewport:vp.viewport, evidenceErrors:evidence.errors });
      const fingerprintFiles = evidence.evidence.scriptFingerprint?.files ?? [];
      if (!fingerprintFiles.includes("_shared.mjs") || !fingerprintFiles.includes("_deps.mjs")) {
        execution.push({ route, viewport:vp.viewport, evidenceErrors:["script fingerprint가 _shared.mjs/_deps.mjs를 포함하지 않음"] });
      }
    }
  } catch (error) {
    execution.push({ route, routeId:id, exitCode:code, error:error.message });
  }
}

let notFoundLocal = null;
if (ledger.notFoundProbe) {
  const pw = await load("playwright");
  if (!pw) { missing(["playwright"]); exit(2); }
  const browser = await pw.chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({ storageState: args.storage || undefined });
  const page = await context.newPage();
  try {
    const route = ledger.notFoundProbe.route;
    const response = await page.goto(new URL(route, args.local).href, { waitUntil:"domcontentloaded", timeout:30000 });
    const render = await rendererMeta(page);
    notFoundLocal = { route, status:response?.status()??null, finalRoute:routeTarget(page.url()),
      canonical:canonicalTarget(render.canonical), renderer:render.framework,
      renderSignature:sha256(`${render.text}\0${render.structure}`) };
  } catch (error) { execution.push({ route:ledger.notFoundProbe.route, error:`404 probe: ${error.message}` }); }
  await browser.close();
}

const validation = validateSiteCompletion({ ledger, routeReports, notFoundLocal });
if ((override.substituted_assets ?? []).length) {
  validation.failures.push({ kind:"substituted-assets", count:override.substituted_assets.length });
  validation.pass = false;
}
for (const item of execution) if (item.error || item.evidenceErrors || (item.exitCode !== null && item.exitCode !== 0)) {
  validation.failures.push({ kind:"execution", ...item }); validation.pass = false;
}
const scripts = await scriptFingerprint(dirname(fileURLToPath(import.meta.url)));
const completion = {
  version:3, pass:validation.pass, strict:true, routesExpected:ledger.routes.length,
  routesReported:routeReports.size, notFound:{ref:ledger.notFoundProbe,local:notFoundLocal},
  rows:validation.rows, failures:validation.failures, execution,
  routesSha256:sha256(await readFile(args.routes)), scriptFingerprint:scripts,
  completedAt:new Date().toISOString(),
};
await writeFile(join(args.out,"completion.json"),JSON.stringify(completion,null,2));
await writeEvidence(args.out, { routesSha256:completion.routesSha256, routeIds:ledger.routes.map((r)=>routeId(r.route??r.path)), strict:true }, { scriptFingerprint:scripts });
console.log(validation.pass ? `PASS 전 라우트 ${ledger.routes.length}개 × 전 viewport × 전 상태 + 404` : `FAIL ${validation.failures.length}건 — completion.json 참조`);
exit(validation.pass ? 0 : 1);

function run(command, childArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, childArgs, { stdio:"inherit" });
    child.on("error", reject); child.on("exit", (code)=>resolve(code));
  });
}
function parseArgs(values) { const out={};for(let i=0;i<values.length;i++){if(!values[i].startsWith("--"))continue;const key=values[i].slice(2);out[key]=values[i+1]&&!values[i+1].startsWith("--")?values[++i]:true;}return out; }
