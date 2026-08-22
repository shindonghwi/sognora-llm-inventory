#!/usr/bin/env node
/**
 * 원본 한 라우트의 정적 화면 + 선언된 상호작용/모션 상태를 캡처한다.
 * 정적 모드는 애니메이션을 끄고, 상태 모드는 정상 모션에서 before/mid/after를 보존한다.
 * exit 0 완전 캡처 / 1 누락·불완전 / 2 실행 불가
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";
import {
  advance, autoScrollPositions, canonicalTarget, captureClock, coveragePct,
  evaluateScenarioAssertions, installFrozenClock, loadStateContract, normalizeConsoleError, rendererMeta,
  routeTarget, runScenarioSetup, runTrigger, scenariosFor, scriptFingerprint, scrollFile, sha256,
  stateStyle, verifyEvidence, writeEvidence,
} from "./_shared.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) {
  console.error("usage: capture.mjs --url <URL> --out <dir> [--states states.json] [--viewports WxH,...] [--force]");
  exit(2);
}

const pw = await load("playwright");
if (!pw) { missing(["playwright"]); exit(2); }
const { chromium } = pw;

let stateContract;
try { stateContract = await loadStateContract(args.states); }
catch (error) { console.error(`상태 계약 오류: ${error.message}`); exit(2); }

const viewports = parseViewports(args.viewports ?? "1440x900,768x1024,390x844");
const dpr = Number(args.dpr ?? 1);
const clock = args["no-clock"] ? null : captureClock(args.clock);
const route = routeTarget(args.route ?? args.url);
const scripts = await scriptFingerprint(dirname(fileURLToPath(import.meta.url)));
const browser = await chromium.launch({ headless: !args.headed });
const written = [];
let failures = 0;

for (const vp of viewports) {
  const dir = join(args.out, vp.label);
  await mkdir(dir, { recursive: true });
  if (!args.force && await evidenceIsValid(dir)) {
    console.log(`skip (검증된 증거 있음): ${vp.label} — 다시 찍으려면 --force`);
    continue;
  }

  const allConsoleErrors = [];
  let opened;
  try {
    opened = await openPage(vp, "static", allConsoleErrors);
  } catch (error) {
    console.error(`goto 실패 (${vp.label}): ${error.message}`);
    failures++;
    continue;
  }
  const { context, page, response } = opened;

  const measured = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  const trustworthy = measured[0] === vp.width && measured[1] === vp.height;
  const render = await rendererMeta(page);
  const redirectChain = response ? requestRedirectChain(response.request()) : [];
  const meta = {
    evidenceVersion: 3,
    url: args.url,
    route,
    status: response?.status() ?? null,
    finalRoute: routeTarget(page.url()),
    redirectChain,
    canonical: canonicalTarget(render.canonical),
    renderer: render.framework,
    renderSignature: sha256(`${render.text}\0${render.structure}`),
    viewportRequested: [vp.width, vp.height],
    viewportMeasured: measured,
    dpr,
    trustworthy,
    capturedAt: new Date().toISOString(),
    headless: !args.headed,
    clock,
    modes: { static: "reduced-motion+css-disabled", interaction: "normal-motion" },
  };

  const pageHeight = await page.evaluate(() => Math.max(
    document.body?.scrollHeight ?? 0, document.documentElement?.scrollHeight ?? 0
  ));
  let scrollPositions;
  try {
    if (args["scroll-y"]) scrollPositions = String(args["scroll-y"]).split(",").map(Number);
    else if (args.scrolls) {
      scrollPositions = String(args.scrolls).split(",").map((p) =>
        Math.round(Math.max(0, pageHeight - vp.height) * (Number(p) / 100))
      );
    } else scrollPositions = autoScrollPositions(pageHeight, vp.height);
  } catch (error) {
    console.error(`${vp.label}: ${error.message}`);
    failures++;
    await context.close();
    continue;
  }
  scrollPositions = [...new Set(scrollPositions.map((y) => Math.max(0, Math.round(y))))].sort((a, b) => a - b);
  const pixelCoveragePct = coveragePct(scrollPositions, pageHeight, vp.height);
  const states = [];
  for (const y of scrollPositions) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await advance(page, 150, clock);
    const file = scrollFile(y);
    await page.screenshot({ path: join(dir, file) });
    states.push({ id: `static-scroll-${y}`, kind: "static", file, shotTop: y, fullPage: false });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await advance(page, 150, clock);
  await page.screenshot({ path: join(dir, "full.png"), fullPage: true });
  states.push({ id: "static-full", kind: "static", file: "full.png", shotTop: 0, fullPage: true });

  const elements = await measureElements(page);
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const scenarios = scenariosFor(stateContract, route, vp.label);
  const interactionInventory = await inventoryInteractions(page, scenarios, stateContract.exclusions, route, vp.label);
  for (const item of interactionInventory) item.discoveredIn = ["baseline"];
  await context.close();

  const scenarioReports = [];
  for (const scenario of scenarios) {
    let motion;
    try {
      motion = await openPage(vp, "motion", allConsoleErrors);
      await runScenarioSetup(motion.page, scenario, clock);
      const target = scenario.trigger.selector ? motion.page.locator(scenario.trigger.selector) : null;
      const count = target ? await target.count() : 1;
      if (count === 0) throw new Error(`대상 없음: ${scenario.trigger.selector}`);
      if (count > 1 && !scenario.representativeReason) {
        throw new Error(`대상이 ${count}개입니다. 하나로 좁히거나 representativeReason을 기록하세요`);
      }
      if (target) await target.first().scrollIntoViewIfNeeded().catch(() => {});
      const frames = [];
      const assertions = [];
      const before = scenario.frames.find((f) => f.phase === "before" || f.name === "before");
      const beforeName = before?.name ?? "before";
      const beforeFile = `state-${scenario.id}-${beforeName}.png`;
      await motion.page.screenshot({ path: join(dir, beforeFile) });
      frames.push({ name: beforeName, phase: "before", atMs: 0, file: beforeFile,
        style: await stateStyle(motion.page, scenario.observe ?? scenario.trigger.selector) });
      states.push({ id: `${scenario.id}:${beforeName}`, kind: "interaction", scenario: scenario.id,
        frame: beforeName, phase: "before", atMs: 0, file: beforeFile, shotTop: await scrollTop(motion.page) });
      assertions.push(...await evaluateScenarioAssertions(motion.page, scenario, beforeName));

      await runTrigger(motion.page, scenario.trigger);
      let elapsed = 0;
      for (const frame of scenario.frames.filter((f) => f.phase !== "before" && f.name !== "before")) {
        await advance(motion.page, frame.atMs - elapsed, clock);
        elapsed = frame.atMs;
        const file = `state-${scenario.id}-${frame.name}.png`;
        await motion.page.screenshot({ path: join(dir, file) });
        frames.push({ name: frame.name, phase: "after", atMs: frame.atMs, file,
          style: await stateStyle(motion.page, scenario.observe ?? scenario.trigger.selector) });
        states.push({ id: `${scenario.id}:${frame.name}`, kind: "interaction", scenario: scenario.id,
          frame: frame.name, phase: "after", atMs: frame.atMs, file, shotTop: await scrollTop(motion.page) });
        assertions.push(...await evaluateScenarioAssertions(motion.page, scenario, frame.name));
      }
      const exposed = await inventoryInteractions(motion.page, scenarios, stateContract.exclusions, route, vp.label);
      mergeInteractionInventory(interactionInventory, exposed, scenario.id);
      const assertionFailures = assertions.filter((item) => !item.pass);
      if (assertionFailures.length) failures++;
      scenarioReports.push({ id: scenario.id, setup: scenario.setup, trigger: scenario.trigger, observe: scenario.observe,
        representativeReason: scenario.representativeReason, frames, assertions,
        pass: assertionFailures.length === 0,
        error: assertionFailures.length ? `상태 assertion 실패: ${assertionFailures.map((item) => `${item.frame}:${item.selector}=${item.actual}, expected ${item.state}`).join("; ")}` : undefined });
      if (assertionFailures.length) {
        console.error(`${vp.label}/${scenario.id}: ${scenarioReports.at(-1).error}`);
      }
    } catch (error) {
      failures++;
      scenarioReports.push({ id: scenario.id, setup: scenario.setup, trigger: scenario.trigger, observe: scenario.observe,
        representativeReason: scenario.representativeReason, pass: false, error: error.message });
      console.error(`${vp.label}/${scenario.id}: 상태 캡처 실패 — ${error.message}`);
    } finally {
      await motion?.context.close().catch(() => {});
    }
  }

  const uncontracted = interactionInventory.filter((item) => !item.covered && !item.excluded);
  if (uncontracted.length) {
    failures++;
    console.error(`${vp.label}: 상태 계약/제외 사유가 없는 인터랙티브 요소 ${uncontracted.length}개`);
  }
  if (!trustworthy || pixelCoveragePct !== 100) failures++;

  const consoleBaseline = [...new Set(allConsoleErrors.map(normalizeConsoleError))];
  const measure = {
    meta, pageHeight, horizontalOverflow, scrollPositions, pixelCoveragePct,
    consoleBaseline, consoleErrorsSample: allConsoleErrors.slice(0, 8),
    elements, interactionInventory, uncontractedInteractions: uncontracted,
    scenarios: scenarioReports,
  };
  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  await writeFile(join(dir, "measure.json"), JSON.stringify(measure, null, 2));
  await writeFile(join(dir, "state-manifest.json"), JSON.stringify({ version: 3, route, viewport: vp.label, states }, null, 2));
  written.push({ dir, vp, measure, states });
  console.log(`${vp.label}: 정적 ${scrollPositions.length + 1} · 상호작용 ${states.filter((s) => s.kind === "interaction").length} · 커버리지 ${pixelCoveragePct}%`);
}

// 원본 콘솔 baseline은 전 뷰포트 합집합으로 저장한다.
const baselineUnion = [...new Set(written.flatMap((w) => w.measure.consoleBaseline))];
for (const item of written) {
  item.measure.consoleBaseline = baselineUnion;
  await writeFile(join(item.dir, "measure.json"), JSON.stringify(item.measure, null, 2));
  const conditions = {
    route, viewport: item.vp.label, dpr, clock,
    modes: item.measure.meta.modes,
    scrollPositions: item.measure.scrollPositions,
    stateIds: item.states.map((s) => s.id),
    stateContractSha256: sha256(JSON.stringify(stateContract)),
  };
  await writeEvidence(item.dir, conditions, { scriptFingerprint: scripts });
}

await browser.close();
exit(failures ? 1 : 0);

async function openPage(vp, mode, consoleErrors) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: dpr,
    reducedMotion: mode === "static" ? "reduce" : "no-preference",
    storageState: args.storage || undefined,
    hasTouch: vp.width <= 500,
  });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 240)));
  if (clock) await installFrozenClock(page, clock.epoch);
  let response;
  try {
    response = await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 });
    if (mode === "static") {
      await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}" });
    }
    await advance(page, clock?.runFor ?? 3000, clock);
    return { context, page, response };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function measureElements(page) {
  return page.evaluate((sel) => {
    const ctx = document.createElement("canvas").getContext("2d");
    const sample = "abgWQM한글힣 0123ilI.,";
    const cache = {};
    const rendered = (fam) => {
      if (fam in cache) return cache[fam];
      ctx.font = `32px ${fam}, monospace`; const wm = ctx.measureText(sample).width;
      ctx.font = "32px monospace"; const m = ctx.measureText(sample).width;
      ctx.font = `32px ${fam}, serif`; const ws = ctx.measureText(sample).width;
      ctx.font = "32px serif"; const s = ctx.measureText(sample).width;
      return (cache[fam] = wm !== m || ws !== s);
    };
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(",")[0].trim();
      out.push({
        tag: el.tagName.toLowerCase(), id: el.id || null,
        cls: (el.className && String(el.className).slice(0, 80)) || null,
        box: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        font: `${fam} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
        fontLoaded: /^(serif|sans-serif|monospace|system-ui|ui-\w+|cursive|fantasy|math)$/i.test(fam) || rendered(fam),
        color: cs.color, bg: cs.backgroundColor, pad: cs.padding, margin: cs.margin,
        radius: cs.borderRadius, shadow: cs.boxShadow === "none" ? null : cs.boxShadow,
        position: cs.position,
      });
      if (out.length >= 1000) break;
    }
    return out;
  }, "header,nav,main,footer,section,h1,h2,h3,[class*=hero],[class*=container],[class*=card],button,a,input,select,textarea,[role=button],[role=tab],[role=dialog]");
}

async function inventoryInteractions(page, scenarios, exclusions, currentRoute, viewport) {
  const scenarioSelectors = scenarios.flatMap((scenario) => [
    scenario.trigger?.selector,
    ...(scenario.assertions ?? []).map((assertion) => assertion.selector),
  ].filter(Boolean).map((selector) => ({ id: scenario.id, selector })));
  const relevantExclusions = (exclusions ?? []).filter((e) => {
    const routes = e.routes ?? ["*"]; const vps = e.viewports ?? ["*"];
    return (routes.includes("*") || routes.map(routeTarget).includes(currentRoute)) &&
      (vps.includes("*") || vps.includes(viewport));
  });
  return page.evaluate(({ scenarioSelectors, exclusions }) => {
    const matches = (el, selector) => { try { return el.matches(selector); } catch { return false; } };
    return [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="tab"],[draggable="true"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      })
      .slice(0, 1000)
      .map((el, index) => {
        const coveredBy = scenarioSelectors.filter((s) => matches(el, s.selector)).map((s) => s.id);
        const exclusion = exclusions.find((e) => e.reason && matches(el, e.selector));
        return {
          index, tag: el.tagName.toLowerCase(), id: el.id || null, role: el.getAttribute("role"),
          type: el.getAttribute("type"), href: el.getAttribute("href"),
          label: el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 80),
          covered: coveredBy.length > 0, coveredBy,
          excluded: Boolean(exclusion), exclusionReason: exclusion?.reason ?? null,
        };
      });
  }, { scenarioSelectors, exclusions: relevantExclusions });
}

function mergeInteractionInventory(current, incoming, stateId) {
  for (const item of incoming) {
    const key = JSON.stringify([item.tag, item.id, item.role, item.type, item.href, item.label]);
    const existing = current.find((candidate) =>
      JSON.stringify([candidate.tag, candidate.id, candidate.role, candidate.type, candidate.href, candidate.label]) === key
    );
    if (existing) {
      existing.discoveredIn ??= ["baseline"];
      if (!existing.discoveredIn.includes(stateId)) existing.discoveredIn.push(stateId);
      existing.covered ||= item.covered;
      existing.excluded ||= item.excluded;
    } else current.push({ ...item, discoveredIn: [stateId] });
  }
}

function requestRedirectChain(request) {
  const chain = [];
  for (let r = request; r; r = r.redirectedFrom()) chain.unshift(routeTarget(r.url()));
  return chain;
}

async function scrollTop(page) { return page.evaluate(() => window.scrollY); }
async function evidenceIsValid(dir) {
  try { return (await verifyEvidence(dir)).ok; } catch { return false; }
}
function parseViewports(value) {
  return String(value).split(",").map((label) => {
    const match = /^(\d+)x(\d+)$/.exec(label.trim());
    if (!match) throw new Error(`잘못된 viewport: ${label}`);
    return { label: label.trim(), width: Number(match[1]), height: Number(match[2]) };
  });
}
function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i++) {
    if (!values[i].startsWith("--")) continue;
    const key = values[i].slice(2);
    out[key] = values[i + 1] && !values[i + 1].startsWith("--") ? values[++i] : true;
  }
  return out;
}
