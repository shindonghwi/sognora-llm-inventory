#!/usr/bin/env node
/**
 * 원본 한 라우트의 모든 viewport × 정적/상호작용/모션 상태를 로컬과 비교한다.
 * strict가 기본이며 --relaxed와 --no-pixel은 진단용(exit 3)이라 완료 근거가 될 수 없다.
 * exit 0 전 상태 strict 통과 / 1 미달 / 2 실행 불가 / 3 진단 전용
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";
import { comparePng } from "./_pixel.mjs";
import {
  advance, canonicalTarget, coveragePct, evaluateScenarioAssertions, installFrozenClock, normalizeConsoleError,
  rendererMeta, routeTarget, runScenarioSetup, runTrigger, scriptFingerprint, sha256, stateStyle, verifyEvidence, writeEvidence,
} from "./_shared.mjs";

const args = parseArgs(argv.slice(2));
if (!args.ref || !args.local || !args.out) {
  console.error("usage: diff.mjs --ref <dir> --local <URL> --out <dir> [--override override.json] [--relaxed]");
  exit(2);
}

const pw = await load("playwright");
if (!pw) { missing(["playwright"]); exit(2); }
const { chromium } = pw;
const pngMod = await load("pngjs");
const pmMod = await load("pixelmatch");
const PNG = pngMod?.PNG ?? null;
const pixelmatch = pmMod?.default ?? (typeof pmMod === "function" ? pmMod : null);
const pixelJudged = Boolean(PNG && pixelmatch);
if (!pixelJudged && !args["no-pixel"]) {
  console.error("pixelmatch/pngjs가 없어 모든 상태의 픽셀 판정을 거부합니다. npm i -D pixelmatch pngjs");
  exit(2);
}

const diagnosticOnly = Boolean(args.relaxed || args["no-pixel"]);
const GATE = args.relaxed ? { box: 2, font: 1, pixel: 2 } : { box: 1, font: 0, pixel: 0.5 };
const scripts = await scriptFingerprint(dirname(fileURLToPath(import.meta.url)));
const override = args.override ? JSON.parse(await readFile(args.override, "utf8")) : {};
const ignore = new Set((override.ignore ?? []).map(String));
const MASK_AREA_CAP = 20;
for (const [label, masks] of Object.entries(override.masks ?? {})) {
  for (const mask of masks) {
    if (!mask?.reason) { console.error(`override.masks[${label}]에 reason 없는 마스크가 있습니다`); exit(2); }
    if (![mask.x, mask.y, mask.w, mask.h].every(Number.isFinite)) {
      console.error(`override.masks[${label}] 좌표가 유효하지 않습니다`); exit(2);
    }
  }
}
const masksFor = (label) => override.masks?.[label] ?? [];

const viewportDirs = (await readdir(args.ref, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d+x\d+$/.test(d.name)).map((d) => d.name).sort();
if (!viewportDirs.length) { console.error(`기준 캡처가 없습니다: ${args.ref}`); exit(2); }

const refEvidence = new Map();
for (const label of viewportDirs) {
  let verified;
  try { verified = await verifyEvidence(join(args.ref, label)); }
  catch (error) { console.error(`${label}: evidence.json 필요 — 새 capture.mjs로 재캡처하세요 (${error.message})`); exit(2); }
  if (!verified.ok) { console.error(`${label}: 기준 증거 변조/누락 — ${verified.errors.join(", ")}`); exit(2); }
  if (verified.evidence.scriptFingerprint?.sha256 !== scripts.sha256) {
    console.error(`${label}: 기준 캡처와 현재 계기 지문이 다릅니다 — 같은 스크립트 버전으로 재캡처하세요`);
    exit(2);
  }
  refEvidence.set(label, verified.evidence);
}

// 같은 origin을 원본과 로컬로 주는 자기 비교 차단.
const firstMeta = JSON.parse(await readFile(join(args.ref, viewportDirs[0], "meta.json"), "utf8"));
if (sameOrigin(firstMeta.url, args.local)) {
  console.error(`ref 출처(${firstMeta.url})와 --local(${args.local}) origin이 같습니다 — 자기 비교는 게이트가 아닙니다`);
  exit(2);
}

const clockSpecs = new Set();
for (const label of viewportDirs) {
  const measure = JSON.parse(await readFile(join(args.ref, label, "measure.json"), "utf8"));
  clockSpecs.add(JSON.stringify(measure.meta?.clock));
}
if (clockSpecs.size !== 1) { console.error("ref 뷰포트 간 클록 조건이 다릅니다"); exit(2); }
const clock = JSON.parse([...clockSpecs][0]);
if (args["no-clock"] && clock) { console.error("ref는 클록 캡처인데 --no-clock이 지정됐습니다"); exit(2); }

const browser = await chromium.launch({ headless: !args.headed });
const report = [];
let violations = 0;

for (const label of viewportDirs) {
  const refDir = join(args.ref, label);
  const outDir = join(args.out, label);
  await mkdir(outDir, { recursive: true });
  const refMeasure = JSON.parse(await readFile(join(refDir, "measure.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(refDir, "state-manifest.json"), "utf8"));
  const [width, height] = refMeasure.meta.viewportRequested;
  const vp = { label, width, height, dpr: refMeasure.meta.dpr };
  const consoleErrors = [];
  const missingAssets = [];
  const localStates = new Map();
  const executionErrors = [];
  let opened;
  let localRoute = null;
  let localElements = [];
  let horizontalOverflow = false;
  let localPageHeight = 0;

  if (!refMeasure.meta.trustworthy || refMeasure.pixelCoveragePct !== 100) {
    executionErrors.push(`원본 증거 불완전: trustworthy=${refMeasure.meta.trustworthy}, coverage=${refMeasure.pixelCoveragePct}`);
  }

  try {
    opened = await openPage(vp, "static", consoleErrors, missingAssets);
    const { page, response } = opened;
    const render = await rendererMeta(page);
    localRoute = {
      requested: routeTarget(args.local),
      status: response?.status() ?? null,
      finalRoute: routeTarget(page.url()),
      redirectChain: response ? requestRedirectChain(response.request()) : [],
      canonical: canonicalTarget(render.canonical),
      renderer: render.framework,
      renderSignature: sha256(`${render.text}\0${render.structure}`),
    };
    localPageHeight = await page.evaluate(() => Math.max(document.body?.scrollHeight ?? 0, document.documentElement?.scrollHeight ?? 0));
    for (const state of manifest.states.filter((s) => s.kind === "static")) {
      if (state.fullPage) {
        await page.evaluate(() => window.scrollTo(0, 0));
      } else {
        await page.evaluate((top) => window.scrollTo(0, top), state.shotTop);
      }
      await advance(page, 150, clock);
      const path = join(outDir, `local-${state.file}`);
      await page.screenshot({ path, fullPage: Boolean(state.fullPage) });
      localStates.set(state.id, { ...state, path });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await advance(page, 150, clock);
    localElements = await measureElements(page);
    horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  } catch (error) {
    executionErrors.push(`정적 캡처 실패: ${error.message}`);
  } finally {
    await opened?.context.close().catch(() => {});
  }

  const interactionStyleOffenders = [];
  const interactionAssertionOffenders = [];
  for (const scenario of refMeasure.scenarios ?? []) {
    if (!scenario.pass) { executionErrors.push(`원본 상태 ${scenario.id}가 캡처 실패 상태`); continue; }
    let motion;
    try {
      motion = await openPage(vp, "motion", consoleErrors, missingAssets);
      await runScenarioSetup(motion.page, scenario, clock);
      const target = scenario.trigger.selector ? motion.page.locator(scenario.trigger.selector).first() : null;
      if (target) await target.scrollIntoViewIfNeeded().catch(() => {});
      const before = scenario.frames.find((f) => f.phase === "before");
      if (!before) throw new Error("before 프레임 누락");
      let path = join(outDir, `local-${before.file}`);
      await motion.page.screenshot({ path });
      localStates.set(`${scenario.id}:${before.name}`, {
        id: `${scenario.id}:${before.name}`, kind: "interaction", scenario: scenario.id,
        frame: before.name, file: before.file, path, shotTop: await scrollTop(motion.page),
      });
      compareStateStyle(scenario.id, before, await stateStyle(motion.page, scenario.observe ?? scenario.trigger.selector), interactionStyleOffenders);
      interactionAssertionOffenders.push(...(await evaluateScenarioAssertions(motion.page, scenario, before.name))
        .filter((item) => !item.pass).map((item) => ({ scenario: scenario.id, ...item })));
      await runTrigger(motion.page, scenario.trigger);
      let elapsed = 0;
      for (const frame of scenario.frames.filter((f) => f.phase !== "before")) {
        await advance(motion.page, frame.atMs - elapsed, clock);
        elapsed = frame.atMs;
        path = join(outDir, `local-${frame.file}`);
        await motion.page.screenshot({ path });
        localStates.set(`${scenario.id}:${frame.name}`, {
          id: `${scenario.id}:${frame.name}`, kind: "interaction", scenario: scenario.id,
          frame: frame.name, file: frame.file, path, shotTop: await scrollTop(motion.page),
        });
        compareStateStyle(scenario.id, frame, await stateStyle(motion.page, scenario.observe ?? scenario.trigger.selector), interactionStyleOffenders);
        interactionAssertionOffenders.push(...(await evaluateScenarioAssertions(motion.page, scenario, frame.name))
          .filter((item) => !item.pass).map((item) => ({ scenario: scenario.id, ...item })));
      }
    } catch (error) {
      executionErrors.push(`상태 ${scenario.id} 재현 실패: ${error.message}`);
    } finally {
      await motion?.context.close().catch(() => {});
    }
  }

  const pixelResults = [];
  const missingStates = [];
  if (pixelJudged) {
    for (const expected of manifest.states) {
      const local = localStates.get(expected.id);
      if (!local) { missingStates.push(expected.id); continue; }
      const result = await comparePng({
        PNG, pixelmatch,
        refPath: join(refDir, expected.file), localPath: local.path,
        outPath: join(outDir, `diff-${expected.file}`),
        masks: masksFor(label), shotTop: expected.shotTop ?? 0,
      });
      pixelResults.push({ state: expected.id, file: expected.file, ...result });
    }
  }

  const boxOffenders = [];
  const fontOffenders = [];
  const decoOffenders = [];
  let normColor = {};
  if (opened === undefined || localElements.length || refMeasure.elements.length === 0) {
    normColor = await normalizeColors(vp, refMeasure.elements, localElements).catch(() => ({}));
  }
  const n = Math.min(refMeasure.elements.length, localElements.length);
  for (let i = 0; i < n; i++) compareElement(
    refMeasure.elements[i], localElements[i], GATE, ignore,
    normColor, boxOffenders, fontOffenders, decoOffenders
  );
  const structureDelta = refMeasure.elements.length - localElements.length;
  const baseline = new Set(refMeasure.consoleBaseline ?? []);
  const newConsoleErrors = consoleErrors.filter((e) => !baseline.has(normalizeConsoleError(e)));
  const localCoveragePct = coveragePct(refMeasure.scrollPositions ?? [], localPageHeight, height);
  const routeRef = {
    requested: refMeasure.meta.route,
    status: refMeasure.meta.status,
    finalRoute: refMeasure.meta.finalRoute,
    redirectChain: refMeasure.meta.redirectChain ?? [],
    canonical: refMeasure.meta.canonical,
    renderer: refMeasure.meta.renderer,
    renderSignature: refMeasure.meta.renderSignature,
  };
  const routeOffenders = compareRouteMeta(routeRef, localRoute);
  const failedPixels = pixelResults.filter((r) => !r.ok || r.mismatchPct > GATE.pixel || r.maskedPct > MASK_AREA_CAP);
  const representativeScenarios = (refMeasure.scenarios ?? []).filter((s) => s.representativeReason);
  const pass = executionErrors.length === 0 && missingStates.length === 0 &&
    pixelResults.length === manifest.states.length && failedPixels.length === 0 &&
    refMeasure.pixelCoveragePct === 100 && localCoveragePct === 100 &&
    structureDelta === 0 && boxOffenders.length === 0 && fontOffenders.length === 0 &&
    decoOffenders.length === 0 && interactionStyleOffenders.length === 0 &&
    interactionAssertionOffenders.length === 0 &&
    routeOffenders.length === 0 && !horizontalOverflow && newConsoleErrors.length === 0 && missingAssets.length === 0;
  if (!pass) violations++;

  const vpReport = {
    viewport: label, pass, pixelJudged, expectedStateCount: manifest.states.length,
    comparedStateCount: pixelResults.length, missingStates, failedPixels,
    pixelCoveragePct: { ref: refMeasure.pixelCoveragePct, local: localCoveragePct },
    pageHeight: { ref: refMeasure.pageHeight, local: localPageHeight },
    route: { ref: routeRef, local: localRoute, offenders: routeOffenders },
    structureDelta,
    boxOffenders: boxOffenders.sort((a, b) => b.delta - a.delta).slice(0, 30),
    fontOffenders: fontOffenders.slice(0, 30), decoOffenders: decoOffenders.slice(0, 30),
    interactionStyleOffenders, interactionAssertionOffenders, representativeScenarios,
    horizontalOverflow, newConsoleErrors, missingAssets, executionErrors,
    pixelResults,
  };
  report.push(vpReport);
  await writeFile(join(outDir, "viewport-report.json"), JSON.stringify(vpReport, null, 2));
  await writeEvidence(outDir, {
    route: routeRef.requested, viewport: label, gate: GATE,
    expectedStateIds: manifest.states.map((s) => s.id),
    refConditionsSha256: refEvidence.get(label).conditionsSha256,
  }, { scriptFingerprint: scripts });
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: 상태 ${pixelResults.length}/${manifest.states.length} · ref/local 커버리지 ${refMeasure.pixelCoveragePct}/${localCoveragePct}%`);
}

await browser.close();
await mkdir(args.out, { recursive: true });
const result = {
  version: 3, strict: !args.relaxed, diagnosticOnly, pixelJudged, gate: GATE,
  route: firstMeta.route, local: args.local,
  pass: violations === 0 && !diagnosticOnly && pixelJudged,
  report,
};
await writeFile(join(args.out, "report.json"), JSON.stringify(result, null, 2));
console.log(violations ? `미달 뷰포트 ${violations}개` : "전 뷰포트·전 상태 strict 통과");
if (diagnosticOnly) { console.log("진단 전용 런 — 완료 근거로 사용할 수 없음(exit 3)"); exit(violations ? 1 : 3); }
exit(violations ? 1 : 0);

async function openPage(vp, mode, consoleErrors, missingAssets) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr,
    reducedMotion: mode === "static" ? "reduce" : "no-preference",
    storageState: args.storage || undefined, hasTouch: vp.width <= 500,
  });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 240)));
  page.on("response", (r) => r.status() === 404 && r.request().resourceType() !== "document" && missingAssets.push(r.url().slice(0, 200)));
  if (clock) await installFrozenClock(page, clock.epoch);
  try {
    const response = await page.goto(args.local, { waitUntil: "networkidle", timeout: 45000 });
    if (mode === "static") {
      await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}" });
    }
    await advance(page, clock?.runFor ?? 3000, clock);
    return { context, page, response };
  } catch (error) { await context.close(); throw error; }
}

async function measureElements(page) {
  return page.evaluate((sel) => {
    const ctx = document.createElement("canvas").getContext("2d"); const sample = "abgWQM한글힣 0123ilI.,"; const cache = {};
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
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el); const fam = cs.fontFamily.split(",")[0].trim();
      out.push({ tag: el.tagName.toLowerCase(), id: el.id || null,
        cls: (el.className && String(el.className).slice(0, 80)) || null,
        box: { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1) },
        font: `${fam} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
        fontLoaded: /^(serif|sans-serif|monospace|system-ui|ui-\w+|cursive|fantasy|math)$/i.test(fam) || rendered(fam),
        color: cs.color, bg: cs.backgroundColor, radius: cs.borderRadius,
        shadow: cs.boxShadow === "none" ? null : cs.boxShadow });
      if (out.length >= 1000) break;
    }
    return out;
  }, "header,nav,main,footer,section,h1,h2,h3,[class*=hero],[class*=container],[class*=card],button,a,input,select,textarea,[role=button],[role=tab],[role=dialog]");
}

async function normalizeColors(vp, refElements, localElements) {
  const colors = new Set();
  for (const item of [...refElements, ...localElements]) {
    if (item.color) colors.add(item.color); if (item.bg) colors.add(item.bg);
    if (item.shadow) for (const shadow of splitShadows(item.shadow)) colors.add(shadowColorPart(shadow));
  }
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const result = await page.evaluate((list) => {
    const c = document.createElement("canvas"); c.width = c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true }); const out = {};
    for (const value of list) {
      ctx.fillStyle = "#0102fe"; ctx.fillStyle = value;
      if (ctx.fillStyle === "#0102fe" && value.toLowerCase() !== "#0102fe") { out[value] = null; continue; }
      ctx.clearRect(0,0,1,1); ctx.fillRect(0,0,1,1); out[value] = [...ctx.getImageData(0,0,1,1).data];
    }
    return out;
  }, [...colors]);
  await context.close(); return result;
}

function compareElement(a, b, gate, ignored, colors, boxes, fonts, decorations) {
  const key = `${a.tag}${a.cls ? "." + a.cls.split(" ")[0] : ""}`;
  if (ignored.has(key)) return;
  if (a.tag !== b.tag) { boxes.push({ el: key, kind: "tag", ref: a.tag, local: b.tag, delta: Infinity }); return; }
  const delta = Math.max(...["x","y","w","h"].map((k) => Math.abs(a.box[k] - b.box[k])));
  if (delta > gate.box) boxes.push({ el:key, delta:+delta.toFixed(2), ref:a.box, local:b.box });
  const fa = parseFont(a.font), fb = parseFont(b.font);
  if (fa.family !== fb.family) fonts.push({ el:key, kind:"family", ref:a.font, local:b.font });
  if (Math.abs(fa.size - fb.size) > gate.font) fonts.push({ el:key, kind:"size", ref:a.font, local:b.font });
  if (fa.weight !== fb.weight) fonts.push({ el:key, kind:"weight", ref:a.font, local:b.font });
  if ((fa.lh === 0) !== (fb.lh === 0) || Math.abs(fa.lh - fb.lh) > gate.font) fonts.push({ el:key, kind:"line-height", ref:a.font, local:b.font });
  if (a.fontLoaded === true && b.fontLoaded === false) fonts.push({ el:key, kind:"not-loaded", ref:a.font, local:b.font });
  if (!sameColor(a.color,b.color,colors)) decorations.push({el:key,kind:"color",ref:a.color,local:b.color});
  if (!sameColor(a.bg,b.bg,colors)) decorations.push({el:key,kind:"bg",ref:a.bg,local:b.bg});
  if (!radiusClose(a.radius,b.radius)) decorations.push({el:key,kind:"radius",ref:a.radius,local:b.radius});
  if (!shadowClose(a.shadow,b.shadow,colors)) decorations.push({el:key,kind:"shadow",ref:a.shadow,local:b.shadow});
}

function compareStateStyle(id, refFrame, local, out) {
  if (!refFrame.style || !local) { if (refFrame.style !== local) out.push({ scenario:id, frame:refFrame.name, kind:"style-missing" }); return; }
  for (const key of ["transitionDuration","transitionTimingFunction","animationDuration","animationTimingFunction"]) {
    if (refFrame.style[key] !== local[key]) out.push({ scenario:id, frame:refFrame.name, kind:key, ref:refFrame.style[key], local:local[key] });
  }
}

function compareRouteMeta(ref, local) {
  if (!local) return [{ kind:"route-unmeasured" }];
  const out = [];
  for (const key of ["status","finalRoute","canonical"]) if (ref[key] !== local[key]) out.push({ kind:key, ref:ref[key], local:local[key] });
  if (JSON.stringify(ref.redirectChain) !== JSON.stringify(local.redirectChain)) out.push({kind:"redirectChain",ref:ref.redirectChain,local:local.redirectChain});
  return out;
}

function sameColor(a,b,map) { if ((a??"") === (b??"")) return true; const x=map[a],y=map[b]; return Boolean(x&&y&&x.every((v,i)=>Math.abs(v-y[i])<=3)); }
function radiusClose(a,b) { if ((a??"")===(b??"")) return true; if (String(a).replace(/-?[\d.]+/g,"#")!==String(b).replace(/-?[\d.]+/g,"#")) return false; const x=[...String(a).matchAll(/-?[\d.]+/g)].map((m)=>+m[0]),y=[...String(b).matchAll(/-?[\d.]+/g)].map((m)=>+m[0]); return x.length===y.length&&x.every((v,i)=>Math.abs(v-y[i])<=1); }
function splitShadows(s) { const out=[];let depth=0,cur="";for(const ch of String(s)){if(ch==="(")depth++;else if(ch===")")depth--;if(ch===","&&depth===0){out.push(cur.trim());cur="";}else cur+=ch;}if(cur.trim())out.push(cur.trim());return out; }
function shadowColorPart(s) { return s.replace(/-?[\d.]+px/g,"").replace(/\binset\b/g,"").replace(/\s+/g," ").trim(); }
function shadowClose(a,b,map) { if ((a??null)===(b??null))return true;if(!a||!b)return false;const x=splitShadows(a),y=splitShadows(b);if(x.length!==y.length)return false;return x.every((s,i)=>{const xn=[...s.matchAll(/-?[\d.]+px/g)].map((m)=>parseFloat(m[0])),yn=[...y[i].matchAll(/-?[\d.]+px/g)].map((m)=>parseFloat(m[0]));return xn.length===yn.length&&xn.every((v,j)=>Math.abs(v-yn[j])<=1)&&/\binset\b/.test(s)===/\binset\b/.test(y[i])&&sameColor(shadowColorPart(s),shadowColorPart(y[i]),map);}); }
function parseFont(s) { const m=/^(.*?)\s+([\d.]+)px\/(\S+)\s+(\d+)\s*$/.exec(String(s??""));return m?{family:m[1].trim(),size:+m[2],lh:parseFloat(m[3])||0,weight:+m[4]}:{family:String(s??""),size:0,lh:0,weight:0}; }
function requestRedirectChain(request) { const chain=[];for(let r=request;r;r=r.redirectedFrom())chain.unshift(routeTarget(r.url()));return chain; }
function sameOrigin(a,b) { try { const norm=(value)=>{const u=new URL(value);const host=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)?"loopback":u.hostname;return `${u.protocol}//${host}:${u.port||(u.protocol==="https:"?"443":"80")}`;};return norm(a)===norm(b);} catch{return false;} }
async function scrollTop(page) { return page.evaluate(() => window.scrollY); }
function parseArgs(values) { const out={};for(let i=0;i<values.length;i++){if(!values[i].startsWith("--"))continue;const key=values[i].slice(2);out[key]=values[i+1]&&!values[i+1].startsWith("--")?values[++i]:true;}return out; }
