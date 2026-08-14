#!/usr/bin/env node
/**
 * 원본 캡처 + 측정 — 브라우저 1회 기동으로 한 페이지의 전 상태를 훑는다.
 *
 * node capture.mjs --url <URL> --out <dir> [--viewports 1440x900,768x1024,390x844]
 *                  [--headed] [--dpr 1] [--scrolls 0,50,100] [--force] [--storage <state.json>]
 *
 * 산출: <out>/<viewport>/<state>.png + measure.json + meta.json
 * exit 0 성공 / 1 캡처 실패 / 2 playwright 미설치
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) {
  console.error("usage: capture.mjs --url <URL> --out <dir> [--viewports WxH,...] [--headed]");
  exit(2);
}

const pw = await load("playwright");
if (!pw) {
  missing(["playwright"]);
  exit(2);
}
const { chromium } = pw;

const viewports = (args.viewports ?? "1440x900,768x1024,390x844")
  .split(",")
  .map((v) => {
    const [w, h] = v.trim().split("x").map(Number);
    return { label: v.trim(), width: w, height: h };
  });
const scrolls = (args.scrolls ?? "0,50,100").split(",").map(Number);
const dpr = Number(args.dpr ?? 1);

// 측정 대상: 의미 있는 블록만. 모든 노드를 재는 것은 낭비다(rules.md).
const MEASURE_SELECTOR =
  "header, nav, main, footer, section, h1, h2, h3, [class*=hero], [class*=container], " +
  "[class*=card], button, a[class*=btn], a[class*=button]";

const browser = await chromium.launch({ headless: !args.headed });
const context = await browser.newContext({
  deviceScaleFactor: dpr,
  reducedMotion: "reduce", // 애니메이션 정지 — 같은 페이지가 매번 다르게 찍히는 것 방지
  storageState: args.storage || undefined,
});
const page = await context.newPage();

let failed = 0;
for (const vp of viewports) {
  const dir = join(args.out, vp.label);
  await mkdir(dir, { recursive: true });
  if (!args.force && (await exists(join(dir, "measure.json")))) {
    console.log(`skip (이미 있음): ${vp.label} — 다시 찍으려면 --force`);
    continue;
  }

  await page.setViewportSize({ width: vp.width, height: vp.height });
  try {
    await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    console.error(`goto 실패 (${vp.label}): ${e.message}`);
    failed++;
    continue;
  }
  await page.addStyleTag({
    content: `*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}`,
  });
  await page.waitForTimeout(300); // robots 예의 + 폰트 안정화

  // 실측 뷰포트 — 요청값과 다르면 이 캡처는 기준으로 쓰지 않는다(rules.md)
  const measured = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  const meta = {
    url: args.url,
    viewportRequested: [vp.width, vp.height],
    viewportMeasured: measured,
    dpr,
    trustworthy: measured[0] === vp.width && measured[1] === vp.height,
    capturedAt: new Date().toISOString(),
    headless: !args.headed,
  };

  // 상태별 캡처 — 한 번의 기동 안에서 전부 처리
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (const pct of scrolls) {
    await page.evaluate((p) => window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * (p / 100)), pct);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(dir, `scroll-${pct}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(dir, "full.png"), fullPage: true });

  // hover 상태 — 첫 번째 주요 CTA
  const cta = page.locator("button, a[class*=btn], a[class*=button]").first();
  let hoverDelta = null;
  if (await cta.count()) {
    const before = await boxOf(cta);
    await cta.hover({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(dir, "hover-cta.png") });
    hoverDelta = { before, after: await boxOf(cta) };
    await page.mouse.move(0, 0);
  }

  const elements = await page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      out.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        cls: (el.className && String(el.className).slice(0, 60)) || null,
        box: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        font: `${cs.fontFamily.split(",")[0].trim()} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
        color: cs.color,
        bg: cs.backgroundColor,
        pad: cs.padding,
        margin: cs.margin,
        radius: cs.borderRadius,
        shadow: cs.boxShadow === "none" ? null : cs.boxShadow,
        position: cs.position,
      });
      if (out.length >= 250) break; // 상한 — 측정은 의미 있는 블록까지만
    }
    return out;
  }, MEASURE_SELECTOR);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );

  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  await writeFile(
    join(dir, "measure.json"),
    JSON.stringify({ meta, pageHeight, horizontalOverflow, hoverDelta, elements }, null, 2)
  );
  console.log(
    `captured ${vp.label}: 요소 ${elements.length}개` +
      (meta.trustworthy ? "" : `  ⚠ 뷰포트 불일치 ${measured.join("x")} — 기준 자료로 쓰지 말 것`) +
      (horizontalOverflow ? "  ⚠ 가로 스크롤 발생" : "")
  );
}

await browser.close();
exit(failed ? 1 : 0);

async function boxOf(loc) {
  const b = await loc.boundingBox().catch(() => null);
  return b ? { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } : null;
}
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
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
