#!/usr/bin/env node
/**
 * 전 라우트 × 전 viewport × 선언 상호작용에서 실제 로드된 폰트·이미지·영상·Lottie 후보·SVG를 수집한다.
 * response 저장 Promise를 모두 기다린 뒤 assets.json과 SHA-256을 기록한다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";
import { advance, loadStateContract, routeTarget, runScenarioSetup, runTrigger, scenariosFor, sha256 } from "./_shared.mjs";
import { validatePopupProbe } from "./_popup.mjs";

const args = parseArgs(argv.slice(2));
if ((!args.url && !args.routes) || !args.out) {
  console.error("usage: fetch-assets.mjs (--url <URL> | --routes routes.json) --out <dir> [--viewports WxH,...] [--states states.json]");
  exit(2);
}
const pw = await load("playwright");
if (!pw) { missing(["playwright"]); exit(2); }
const { chromium } = pw;

let ledger = null;
if (args.routes) ledger = JSON.parse(await readFile(args.routes, "utf8"));
const origin = ledger?.origin ?? new URL(args.url).origin;
const routes = ledger ? ledger.routes.map((r) => r.route ?? r.path) : [routeTarget(args.url)];
const viewports = parseViewports(args.viewports ?? args.viewport ?? "1440x900,768x1024,390x844");
let stateContract;
try { stateContract = await loadStateContract(args.states); }
catch (error) { console.error(`상태 계약 오류: ${error.message}`); exit(2); }
if (ledger) {
  const popupProbeErrors = validatePopupProbe(stateContract, routes, viewports.map((viewport) => viewport.label));
  if (popupProbeErrors.length) { console.error(popupProbeErrors.join("\n")); exit(2); }
}

const dirs = {
  fonts: join(args.out, "fonts"), images: join(args.out, "images"),
  media: join(args.out, "media"), data: join(args.out, "data"),
};
for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ headless: !args.headed });
const saved = { fonts: [], images: [], media: [], data: [], inlineSvgs: [] };
const failed = [];
const seen = new Set();
const cssTexts = [];
const fontFaces = [];
const inventories = [];
const pending = new Set();

for (const route of routes) {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, storageState: args.storage || undefined,
      reducedMotion: "no-preference", hasTouch: vp.width <= 500,
    });
    const page = await context.newPage();
    observeResponses(page);
    const url = new URL(route, origin).href;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await page.evaluate(async () => {
        const height = Math.max(document.body?.scrollHeight ?? 0, document.documentElement?.scrollHeight ?? 0);
        for (let y = 0; y < height; y += window.innerHeight) {
          window.scrollTo(0, y); await new Promise((resolve) => setTimeout(resolve, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500);
      await recordDom(page, route, vp.label);
      for (const scenario of scenariosFor(stateContract, route, vp.label)) {
        const scenarioContext = await browser.newContext({
          viewport: { width: vp.width, height: vp.height }, storageState: args.storage || undefined,
          reducedMotion: "no-preference", hasTouch: vp.width <= 500,
        });
        const scenarioPage = await scenarioContext.newPage();
        observeResponses(scenarioPage);
        try {
          await scenarioPage.goto(url, { waitUntil: "networkidle", timeout: 45000 });
          await runScenarioSetup(scenarioPage, scenario, null);
          await runTrigger(scenarioPage, scenario.trigger);
          const last = Math.max(0, ...scenario.frames.map((f) => Number(f.atMs ?? 0)));
          await advance(scenarioPage, last, null);
          await recordDom(scenarioPage, route, vp.label, scenario.id);
        } catch (error) {
          failed.push({ route, viewport: vp.label, scenario: scenario.id, reason: error.message });
        } finally {
          await Promise.allSettled([...pending]);
          await scenarioContext.close();
        }
      }
    } catch (error) {
      failed.push({ route, viewport: vp.label, reason: `goto: ${error.message}` });
    }
    await Promise.allSettled([...pending]);
    await context.close();
  }
}
await Promise.allSettled([...pending]);

// CORS로 DOM CSSOM을 못 읽은 @font-face도 응답 원문에서 보충한다.
for (const { url, text } of cssTexts) {
  for (const match of text.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const body = match[1];
    const pick = (prop) => body.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, "i"))?.[1].trim() ?? null;
    const family = pick("font-family");
    if (family) fontFaces.push({ family:family.replace(/["']/g,""), weight:pick("font-weight")??"normal",
      style:pick("font-style")??"normal", display:pick("font-display"), unicodeRange:pick("unicode-range"),
      src:pick("src"), fromStylesheet:url });
  }
}

const payload = {
  version: 2, origin, routes, viewports: viewports.map((v)=>v.label), fetchedAt: new Date().toISOString(),
  stateContractSha256: sha256(JSON.stringify(stateContract)),
  fontFaces: dedupe(fontFaces), inventories,
  saved, failed,
};
await writeFile(join(args.out, "assets.json"), JSON.stringify(payload, null, 2));
await browser.close();
console.log(`routes ${routes.length} × viewports ${viewports.length} · fonts ${saved.fonts.length} · images ${saved.images.length} · media ${saved.media.length} · data ${saved.data.length} · inline SVG ${saved.inlineSvgs.length}`);
if (failed.length) console.error(`수집 실패 ${failed.length}건 — assets.json 참조`);
exit(failed.length ? 1 : 0);

function observeResponses(page) {
  page.on("response", (response) => {
    const task = handleResponse(response).finally(() => pending.delete(task));
    pending.add(task);
  });
}

async function recordDom(page, route, viewport, scenario = "baseline") {
  const dom = await page.evaluate(() => {
    const faces = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules ?? []) {
        if (rule.type !== 5 && rule.constructor.name !== "CSSFontFaceRule") continue;
        const s = rule.style;
        faces.push({ family:s.getPropertyValue("font-family").replace(/["']/g,"").trim(),
          weight:s.getPropertyValue("font-weight")||"normal", style:s.getPropertyValue("font-style")||"normal",
          display:s.getPropertyValue("font-display")||null, unicodeRange:s.getPropertyValue("unicode-range")||null,
          src:s.getPropertyValue("src") });
      }
    }
    const usedFonts = [...new Set([...document.querySelectorAll("body,h1,h2,h3,p,a,button,nav,footer")].map((el)=>getComputedStyle(el).fontFamily))];
    const cssVars = {}; const cs = getComputedStyle(document.documentElement);
    for (const name of cs) if (name.startsWith("--")) cssVars[name] = cs.getPropertyValue(name).trim();
    const svgs = [...document.querySelectorAll("svg")].map((svg)=>svg.outerHTML);
    const canvases = [...document.querySelectorAll("canvas")].map((canvas)=>({ width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight }));
    const embeds = [...document.querySelectorAll("video,audio,iframe,object,embed,lottie-player")].map((el)=>({tag:el.tagName.toLowerCase(),src:el.src||el.data||null,width:el.clientWidth,height:el.clientHeight}));
    return { faces, usedFonts, cssVars, svgs, canvases, embeds };
  });
  for (const face of dom.faces) fontFaces.push({ ...face, route, viewport, scenario });
  for (const svg of dom.svgs) await saveInlineSvg(svg, route, `${viewport}:${scenario}`);
  inventories.push({ route, viewport, scenario, usedFonts: dom.usedFonts, cssVars: dom.cssVars, canvases: dom.canvases, embeds: dom.embeds });
}

async function handleResponse(response) {
  const url = response.url();
  if (seen.has(url) || url.startsWith("data:") || url.startsWith("blob:")) return;
  const type = response.request().resourceType();
  const contentType = response.headers()["content-type"] ?? "";
  if (type === "stylesheet") {
    seen.add(url);
    try { cssTexts.push({ url, text: await response.text() }); }
    catch (error) { failed.push({ url, reason: `stylesheet: ${error.message}` }); }
    return;
  }
  let bucket = null;
  if (type === "font") bucket = "fonts";
  else if (type === "image") bucket = "images";
  else if (type === "media" || /^(video|audio)\//i.test(contentType)) bucket = "media";
  else if (["xhr","fetch"].includes(type) && /json/i.test(contentType) && /lottie|animation|\.json(?:\?|$)/i.test(url)) bucket = "data";
  if (!bucket) return;
  seen.add(url);
  if (!response.ok()) { failed.push({ url, status:response.status(), reason:"http" }); return; }
  try {
    const body = await response.body();
    const file = safeName(url, bucket, contentType);
    await writeFile(join(dirs[bucket], file), body);
    saved[bucket].push({ url, file:`${bucket}/${file}`, bytes:body.length, sha256:sha256(body), contentType });
  } catch (error) { failed.push({ url, reason:error.message }); }
}

async function saveInlineSvg(body, route, viewport) {
  const hash = sha256(body);
  if (saved.inlineSvgs.some((item) => item.sha256 === hash)) return;
  const file = `inline-${hash.slice(0,16)}.svg`;
  await writeFile(join(dirs.images, file), body);
  saved.inlineSvgs.push({ route, viewport, file:`images/${file}`, bytes:Buffer.byteLength(body), sha256:hash });
}
function safeName(url, bucket, contentType) {
  const u = new URL(url); let name = basename(u.pathname) || "asset"; let ext = extname(name);
  if (!ext) { ext = bucket === "fonts" ? ".woff2" : bucket === "data" ? ".json" : bucket === "media" ? mediaExt(contentType) : ".bin"; name += ext; }
  return `${name.slice(0,-ext.length)}-${sha256(url).slice(0,12)}${ext}`;
}
function mediaExt(type) { if (/webm/i.test(type))return ".webm";if(/ogg/i.test(type))return ".ogg";if(/audio/i.test(type))return ".mp3";return ".mp4"; }
function dedupe(items) { const seen=new Set();return items.filter((item)=>{const key=JSON.stringify(item);if(seen.has(key))return false;seen.add(key);return true;}); }
function parseViewports(value) { return String(value).split(",").map((label)=>{const m=/^(\d+)x(\d+)$/.exec(label.trim());if(!m)throw new Error(`잘못된 viewport: ${label}`);return{label:label.trim(),width:+m[1],height:+m[2]};}); }
function parseArgs(values) { const out={};for(let i=0;i<values.length;i++){if(!values[i].startsWith("--"))continue;const key=values[i].slice(2);out[key]=values[i+1]&&!values[i+1].startsWith("--")?values[++i]:true;}return out; }
