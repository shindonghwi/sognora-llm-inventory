#!/usr/bin/env node
/** 깨끗한 브라우저 상태로 전 라우트·viewport의 첫 진입 팝업을 찾아 states.json 시나리오를 생성한다. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";
import { loadStateContract, routeTarget, sha256 } from "./_shared.mjs";
import { buildEntryScenarios, ENTRY_CHECKPOINTS_MS, inspectEntrySurfaces, mergeStateScenarios } from "./_popup.mjs";

const args = parseArgs(argv.slice(2));
if ((!args.routes && !args.url) || !args.out) {
  console.error("usage: probe-states.mjs (--routes routes.json | --url URL) --out states.json [--base existing-states.json] [--force]");
  exit(2);
}
if (!args.force && await exists(args.out)) {
  console.error(`${args.out}가 이미 있습니다. 덮어쓰려면 --force, 기존 계약과 합치려면 --base를 사용하세요`);
  exit(2);
}
const pw = await load("playwright");
if (!pw) { missing(["playwright"]); exit(2); }
const ledger = args.routes ? JSON.parse(await readFile(args.routes, "utf8")) : null;
const origin = ledger?.origin ?? new URL(args.url).origin;
const routes = ledger ? ledger.routes.map((entry) => entry.route ?? entry.path) : [routeTarget(args.url)];
const viewports = parseViewports(args.viewports ?? "1440x900,768x1024,390x844");
const checkpoints = parseCheckpoints(args.checkpoints);
const base = args.base ? await loadStateContract(args.base) : { version: 2, scenarios: [], exclusions: [] };
const browser = await pw.chromium.launch({ headless: !args.headed });
const findings = [];
const failed = [];
const probed = [];

for (const route of routes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      storageState: args.storage || undefined,
      reducedMotion: "no-preference",
      hasTouch: viewport.width <= 500,
    });
    const page = await context.newPage();
    try {
      await page.goto(new URL(route, origin).href, { waitUntil: "domcontentloaded", timeout: 45000 });
      let elapsed = 0;
      const bySelector = new Map();
      for (const checkpoint of checkpoints) {
        if (checkpoint > elapsed) await page.waitForTimeout(checkpoint - elapsed);
        elapsed = checkpoint;
        for (const surface of await inspectEntrySurfaces(page)) {
          if (!bySelector.has(surface.selector)) bySelector.set(surface.selector, { ...surface, discoveredAtMs: checkpoint });
        }
      }
      if (bySelector.size) findings.push({
        route: routeTarget(route), viewport: viewport.label,
        discoveredAtMs: Math.min(...[...bySelector.values()].map((item) => item.discoveredAtMs)),
        surfaces: [...bySelector.values()],
      });
      probed.push({ route: routeTarget(route), viewport: viewport.label });
    } catch (error) {
      failed.push({ route: routeTarget(route), viewport: viewport.label, reason: error.message });
    } finally {
      await context.close();
    }
  }
}
await browser.close();

const generated = buildEntryScenarios(findings);
const contract = mergeStateScenarios(base, generated.scenarios);
const payload = {
  ...contract,
  popupProbe: {
    version: 1,
    calendarMode: "browser-current-time-no-override",
    checkpointsMs: checkpoints,
    routesSha256: sha256(JSON.stringify(routes.map(routeTarget))),
    observedAt: new Date().toISOString(),
    probed,
    findings,
    unresolved: generated.unresolved,
    failed,
  },
};
await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, JSON.stringify(payload, null, 2));
console.log(`첫 진입 surface ${findings.reduce((sum, item) => sum + item.surfaces.length, 0)}개 · 자동 시나리오 ${generated.scenarios.length}개 · 미해결 ${generated.unresolved.length}개`);
exit(failed.length || generated.unresolved.length ? 1 : 0);

function parseViewports(value) {
  return String(value).split(",").map((label) => {
    const match = /^(\d+)x(\d+)$/.exec(label.trim());
    if (!match) throw new Error(`잘못된 viewport: ${label}`);
    return { label: label.trim(), width: Number(match[1]), height: Number(match[2]) };
  });
}
function parseCheckpoints(value) {
  if (!value) return ENTRY_CHECKPOINTS_MS;
  const points = [...new Set(String(value).split(",").map(Number))].sort((a, b) => a - b);
  if (!points.length || points.some((point) => !Number.isFinite(point) || point < 0)) throw new Error("--checkpoints는 0 이상 ms 목록이어야 합니다");
  return points;
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function parseArgs(values) { const out={};for(let i=0;i<values.length;i++){if(!values[i].startsWith("--"))continue;const key=values[i].slice(2);out[key]=values[i+1]&&!values[i+1].startsWith("--")?values[++i]:true;}return out; }
