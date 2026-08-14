#!/usr/bin/env node
/**
 * 라우트 탐색 — sitemap·robots·내부 링크·JS 번들에서 라우트 원장을 만든다.
 *
 * node discover.mjs --url <URL> --out <routes.json> [--depth 2] [--max 100] [--storage <state.json>]
 *
 * 출력: { origin, routes: [{path, source, status, title, auth}], skipped: [...] }
 * exit 0 성공 / 1 부분 실패 / 2 playwright 미설치
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) {
  console.error("usage: discover.mjs --url <URL> --out <routes.json> [--depth 2] [--max 100]");
  exit(2);
}

const pw = await load("playwright");
if (!pw) {
  missing(["playwright"]);
  exit(2);
}
const { chromium } = pw;

const start = new URL(args.url);
const origin = start.origin;
// 기본값은 "전부 찾는다"에 맞춘다 — 상한은 폭주 방지용 백스톱일 뿐이다(rules.md).
const maxDepth = Number(args.depth ?? 3);
const maxRoutes = Number(args.max ?? 1000);

const found = new Map(); // path -> {path, source, status, title, auth}
const skipped = [];

// 1) robots.txt / sitemap.xml — 서버가 알려주는 목록이 가장 싸고 정확하다
for (const p of ["/robots.txt", "/sitemap.xml"]) {
  try {
    const res = await fetch(origin + p, { redirect: "follow" });
    if (!res.ok) continue;
    const body = await res.text();
    if (p === "/robots.txt") {
      for (const m of body.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) await ingestSitemap(m[1]);
    } else {
      await ingestSitemap(origin + p, body);
    }
  } catch {
    /* 없으면 넘어간다 */
  }
}

// 2) 실제 브라우저로 링크 크롤 (JS 렌더 후 DOM 기준)
const browser = await chromium.launch({ headless: !args.headed });
const context = await browser.newContext({ storageState: args.storage || undefined });
const page = await context.newPage();

const queue = [{ path: start.pathname, depth: 0 }];
const visited = new Set();
let failures = 0;

while (queue.length && found.size < maxRoutes) {
  const { path, depth } = queue.shift();
  if (visited.has(path)) continue;
  visited.add(path);

  let status = null;
  try {
    const res = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = res?.status() ?? null;
  } catch (e) {
    failures++;
    skipped.push({ path, reason: e.message.slice(0, 80) });
    continue;
  }
  await page.waitForTimeout(300); // 요청 간격 예의(rules.md)

  const title = await page.title().catch(() => null);
  // 로그인 벽 감지 — 자격증명 없이 넘어갈 수 없는 구간을 표시
  const authWall = await page
    .evaluate(() => {
      const t = document.body?.innerText?.slice(0, 2000) || "";
      const hasPw = !!document.querySelector('input[type="password"]');
      return hasPw || /로그인|sign in|log in/i.test(t.split("\n").slice(0, 5).join(" "));
    })
    .catch(() => false);

  const entry = found.get(path) ?? { path, source: "crawl" };
  found.set(path, { ...entry, status, title, auth: authWall ? "required" : "guest" });

  if (depth >= maxDepth) continue;
  const links = await page
    .evaluate(
      (o) =>
        [...document.querySelectorAll("a[href]")]
          .map((a) => a.href)
          .filter((h) => h.startsWith(o))
          .map((h) => new URL(h).pathname),
      origin
    )
    .catch(() => []);
  for (const l of new Set(links)) {
    if (!visited.has(l) && found.size + queue.length < maxRoutes) queue.push({ path: l, depth: depth + 1 });
  }
}

await browser.close();

const routes = [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
const authRoutes = routes.filter((r) => r.auth === "required");
await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, JSON.stringify({ origin, routes, skipped, discoveredAt: new Date().toISOString() }, null, 2));

console.log(`routes: ${routes.length}개 (sitemap ${[...found.values()].filter((r) => r.source === "sitemap").length} / crawl ${routes.length - [...found.values()].filter((r) => r.source === "sitemap").length})`);
if (authRoutes.length) {
  console.log(`⚠ 로그인 필요 추정 ${authRoutes.length}개: ${authRoutes.slice(0, 5).map((r) => r.path).join(", ")}`);
  console.log("  → 자격증명이 필요합니다. 사용자에게 요청하거나 --storage <state.json>으로 세션을 주세요.");
}
if (skipped.length) console.log(`skipped ${skipped.length}개 (보고에 명시할 것)`);
if (found.size >= maxRoutes) console.log(`⚠ --max ${maxRoutes} 상한 도달 — 미탐색 라우트가 남았을 수 있음`);
exit(failures ? 1 : 0);

async function ingestSitemap(url, preloaded) {
  try {
    const body = preloaded ?? (await (await fetch(url)).text());
    for (const m of body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      const loc = m[1];
      if (loc.endsWith(".xml")) {
        await ingestSitemap(loc);
        continue;
      }
      if (!loc.startsWith(origin)) continue;
      const p = new URL(loc).pathname;
      if (!found.has(p) && found.size < maxRoutes) found.set(p, { path: p, source: "sitemap" });
    }
  } catch {
    /* 무시 */
  }
}
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    const v = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true;
    o[k] = v;
  }
  return o;
}
