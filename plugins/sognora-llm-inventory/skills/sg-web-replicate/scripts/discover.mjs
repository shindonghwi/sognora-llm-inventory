#!/usr/bin/env node
/**
 * sitemap·robots·desktop/mobile DOM 링크·동일 origin JS 번들 후보를 합쳐 실제 방문 검증한 라우트 원장을 만든다.
 * pathname+query를 보존하고 status·redirect·canonical·renderer·404 기준을 기록한다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";
import { advance, canonicalTarget, loadStateContract, rendererMeta, routeTarget, runScenarioSetup, runTrigger, scenariosFor, sha256 } from "./_shared.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) {
  console.error("usage: discover.mjs --url <URL> --out <routes.json> [--depth 3] [--max 1000]");
  exit(2);
}
const pw = await load("playwright");
if (!pw) { missing(["playwright"]); exit(2); }
const { chromium } = pw;

const start = new URL(args.url);
const origin = start.origin;
const maxDepth = Number(args.depth ?? 3);
const maxRoutes = Number(args.max ?? 1000);
let stateContract;
try { stateContract = await loadStateContract(args.states); }
catch (error) { console.error(`상태 계약 오류: ${error.message}`); exit(2); }
const found = new Map();
const queue = [];
const visited = new Set();
const skipped = [];
const sitemapSeen = new Set();
const bundleSeen = new Set();
let failures = 0;
let limitReached = false;

function enqueue(value, source, depth = 0) {
  let route;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return;
    route = routeTarget(url.href);
  } catch { return; }
  const entry = found.get(route) ?? { route, path: new URL(route, origin).pathname, query: new URL(route, origin).search, sources: [] };
  if (!entry.sources.includes(source)) entry.sources.push(source);
  found.set(route, entry);
  if (!visited.has(route) && !queue.some((q) => q.route === route)) queue.push({ route, depth });
}

// robots가 가리키는 sitemap과 표준 sitemap을 모두 수집한다.
try {
  const robots = await fetch(`${origin}/robots.txt`);
  if (robots.ok) {
    const body = await robots.text();
    for (const match of body.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) await ingestSitemap(match[1]);
  }
} catch { /* robots 없음 */ }
await ingestSitemap(`${origin}/sitemap.xml`);
enqueue(start.href, "seed", 0);

const browser = await chromium.launch({ headless: !args.headed });
const context = await browser.newContext({ storageState: args.storage || undefined });
const page = await context.newPage();

while (queue.length) {
  if (visited.size >= maxRoutes) { limitReached = true; break; }
  const { route, depth } = queue.shift();
  if (visited.has(route)) continue;
  visited.add(route);
  let response;
  try {
    response = await page.goto(new URL(route, origin).href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(300);
  } catch (error) {
    failures++;
    skipped.push({ route, reason: error.message.slice(0, 120) });
    continue;
  }
  const render = await rendererMeta(page);
  const auth = await page.evaluate(() => {
    const top = (document.body?.innerText ?? "").slice(0, 2000).split("\n").slice(0, 6).join(" ");
    return document.querySelector('input[type="password"]') || /로그인|sign in|log in/i.test(top) ? "required" : "guest";
  }).catch(() => "unknown");
  const entry = found.get(route);
  Object.assign(entry, {
    status: response?.status() ?? null,
    finalRoute: routeTarget(page.url()),
    redirectChain: response ? requestRedirectChain(response.request()) : [],
    canonical: canonicalTarget(render.canonical),
    title: render.title,
    auth,
    renderer: render.framework,
    renderSignature: sha256(`${render.text}\0${render.structure}`),
    visited: true,
  });

  if (depth < maxDepth) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const links = await page.evaluate(() => [...document.querySelectorAll("a[href],area[href]")].map((a) => a.href));
      for (const href of links) enqueue(href, viewport.width < 500 ? "mobile-dom" : "desktop-dom", depth + 1);
      const label = `${viewport.width}x${viewport.height}`;
      for (const scenario of scenariosFor(stateContract, route, label)) {
        try {
          await page.goto(new URL(route, origin).href, { waitUntil:"domcontentloaded", timeout:30000 });
          await page.waitForTimeout(300);
          await runScenarioSetup(page, scenario, null);
          await runTrigger(page, scenario.trigger);
          await advance(page, Math.max(0, ...scenario.frames.map((f)=>Number(f.atMs??0))), null);
          const revealed = await page.evaluate(() => [...document.querySelectorAll("a[href],area[href]")].map((a)=>a.href));
          for (const href of revealed) enqueue(href, `interaction:${scenario.id}`, depth + 1);
          if (routeTarget(page.url()) !== route) enqueue(page.url(), `interaction-navigation:${scenario.id}`, depth + 1);
        } catch (error) {
          failures++;
          skipped.push({ route, scenario:scenario.id, reason:`interaction discovery: ${error.message.slice(0,100)}` });
        }
      }
    }
    const scripts = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean));
    for (const script of scripts) await ingestBundle(script, depth + 1);
  }
}

// 존재하지 않는 경로가 어떤 status/redirect/canonical로 처리되는지 기준을 남긴다.
const notFoundRoute = `/.sognora-replica-not-found-${sha256(origin).slice(0, 12)}`;
let notFoundProbe = null;
try {
  const response = await page.goto(origin + notFoundRoute, { waitUntil: "domcontentloaded", timeout: 30000 });
  const render = await rendererMeta(page);
  notFoundProbe = {
    route: notFoundRoute,
    status: response?.status() ?? null,
    finalRoute: routeTarget(page.url()),
    redirectChain: response ? requestRedirectChain(response.request()) : [],
    canonical: canonicalTarget(render.canonical),
    renderer: render.framework,
    renderSignature: sha256(`${render.text}\0${render.structure}`),
  };
} catch (error) {
  failures++;
  skipped.push({ route: notFoundRoute, reason: `404 probe: ${error.message.slice(0, 100)}` });
}
await browser.close();

const routes = [...found.values()].sort((a, b) => a.route.localeCompare(b.route));
const unvisited = routes.filter((r) => !r.visited);
if (unvisited.length) failures++;
await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, JSON.stringify({
  version: 2, origin, routes, notFoundProbe, skipped, limitReached,
  discoveredAt: new Date().toISOString(),
}, null, 2));

console.log(`routes ${routes.length}개 · 실제 방문 ${routes.length - unvisited.length}개 · query 상태 ${routes.filter((r) => r.query).length}개`);
if (limitReached) console.error(`--max ${maxRoutes} 도달 — 원장이 불완전하므로 실패`);
if (unvisited.length) console.error(`미방문(sitemap/bundle 후보) ${unvisited.length}개 — 완료 불가`);
const authRoutes = routes.filter((r) => r.auth === "required");
if (authRoutes.length) console.log(`인증 필요 ${authRoutes.length}개: ${authRoutes.slice(0,5).map((r) => r.route).join(", ")}`);
exit(failures || limitReached || unvisited.length ? 1 : 0);

async function ingestSitemap(url) {
  if (sitemapSeen.has(url)) return;
  sitemapSeen.add(url);
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const body = await response.text();
    for (const match of body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      const loc = decodeXml(match[1]);
      if (/\.xml(?:\?|$)/i.test(loc)) await ingestSitemap(loc);
      else enqueue(loc, "sitemap", 0);
    }
  } catch { /* 없는 sitemap은 정상 */ }
}

async function ingestBundle(url, depth) {
  if (bundleSeen.has(url)) return;
  bundleSeen.add(url);
  let text;
  try {
    const response = await fetch(url);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || length > 5_000_000) return;
    text = await response.text();
    if (text.length > 5_000_000) return;
  } catch { return; }
  for (const match of text.matchAll(/["'`]((?:\/|https?:\/\/)[^"'`\s]{1,240})["'`]/g)) {
    let candidate = match[1].replace(/\\\//g, "/");
    if (/^(?:\/api\/|\/_next\/|\/assets?\/|\/static\/)/.test(candidate)) continue;
    if (/\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?|map|json)(?:\?|$)/i.test(candidate)) continue;
    enqueue(candidate, "js-bundle", depth);
  }
}

function requestRedirectChain(request) { const chain=[];for(let r=request;r;r=r.redirectedFrom())chain.unshift(routeTarget(r.url()));return chain; }
function decodeXml(value) { return value.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim(); }
function parseArgs(values) { const out={};for(let i=0;i<values.length;i++){if(!values[i].startsWith("--"))continue;const key=values[i].slice(2);out[key]=values[i+1]&&!values[i+1].startsWith("--")?values[++i]:true;}return out; }
