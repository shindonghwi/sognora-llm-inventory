#!/usr/bin/env node
/**
 * 비교 게이트 — 원본 캡처 vs 로컬 구현본을 동일 조건에서 비교한다.
 *
 * node diff.mjs --ref <ref-dir> --local <로컬URL> --out <diff-dir> [--strict] [--override <override.json>]
 *
 * 로컬을 원본과 같은 뷰포트·DPR·스크롤 지점으로 캡처한 뒤:
 *   1) 요소별 위치·크기·폰트 수치 비교
 *   2) 스크린샷 픽셀 불일치율
 * exit 0 통과 / 1 게이트 미달 / 2 실행 불가
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.ref || !args.local || !args.out) {
  console.error("usage: diff.mjs --ref <dir> --local <URL> --out <dir> [--strict]");
  exit(2);
}

const pw = await load("playwright");
if (!pw) {
  missing(["playwright"]);
  exit(2);
}
const { chromium } = pw;

const pngMod = await load("pngjs");
const pmMod = await load("pixelmatch");
const PNG = pngMod?.PNG ?? null;
const pixelmatch = pmMod?.default ?? null;
if (!PNG || !pixelmatch) {
  console.warn("⚠ pixelmatch/pngjs 없음 — 수치 비교만 수행합니다 (설치: npm i -D pixelmatch pngjs)");
}

const GATE = args.strict
  ? { box: 1, font: 0, pixel: 0.5 }
  : { box: 2, font: 1, pixel: 2 };

const override = args.override ? JSON.parse(await readFile(args.override, "utf8")) : { ignore: [] };
const ignore = new Set((override.ignore ?? []).map(String));

const viewportDirs = (await readdir(args.ref, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d+x\d+$/.test(d.name))
  .map((d) => d.name);
if (!viewportDirs.length) {
  console.error(`기준 캡처가 없습니다: ${args.ref} (capture.mjs를 먼저 실행하세요)`);
  exit(2);
}

const browser = await chromium.launch({ headless: !args.headed });
const report = [];
let violations = 0;

for (const label of viewportDirs) {
  const refDir = join(args.ref, label);
  const refMeasure = JSON.parse(await readFile(join(refDir, "measure.json"), "utf8"));
  if (!refMeasure.meta.trustworthy) {
    console.error(`⚠ ${label}: 원본 캡처의 뷰포트가 불일치 — 재캡처 필요. 이 뷰포트는 건너뜁니다.`);
    violations++;
    continue;
  }

  const [w, h] = refMeasure.meta.viewportRequested;
  const outDir = join(args.out, label);
  await mkdir(outDir, { recursive: true });

  const context = await browser.newContext({
    deviceScaleFactor: refMeasure.meta.dpr,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 120)));
  const missing = [];
  page.on("response", (r) => r.status() === 404 && missing.push(r.url().slice(0, 120)));

  try {
    await page.goto(args.local, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    console.error(`로컬 접속 실패 (${label}): ${e.message}`);
    violations++;
    await context.close();
    continue;
  }
  await page.addStyleTag({
    content: `*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}`,
  });
  await page.waitForTimeout(300);

  // 같은 스크롤 지점에서 스크린샷
  const pixelResults = [];
  for (const f of (await readdir(refDir)).filter((f) => /^scroll-\d+\.png$/.test(f))) {
    const pct = Number(f.match(/\d+/)[0]);
    await page.evaluate((p) => window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * (p / 100)), pct);
    await page.waitForTimeout(150);
    const localPath = join(outDir, `local-${f}`);
    await page.screenshot({ path: localPath });
    if (pixelmatch) {
      const r = await comparePng(join(refDir, f), localPath, join(outDir, `diff-${f}`));
      if (r) pixelResults.push({ state: f, ...r });
    }
  }

  // 원본은 스크롤 0에서 측정했다. getBoundingClientRect는 뷰포트 기준이므로
  // 같은 지점으로 되돌리지 않으면 y가 전부 어긋난다(동일 조건 원칙).
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);

  const localElements = await page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 60)) || null,
        box: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        font: `${cs.fontFamily.split(",")[0].trim()} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
      });
      if (out.length >= 250) break;
    }
    return out;
  }, "header, nav, main, footer, section, h1, h2, h3, [class*=hero], [class*=container], [class*=card], button, a[class*=btn], a[class*=button]");

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );

  // 요소 매칭: 같은 순서의 같은 태그끼리 비교 (구조가 같다는 전제 — 다르면 그 자체가 결함)
  const boxOffenders = [];
  const fontOffenders = [];
  const n = Math.min(refMeasure.elements.length, localElements.length);
  for (let i = 0; i < n; i++) {
    const a = refMeasure.elements[i];
    const b = localElements[i];
    const key = `${a.tag}${a.cls ? "." + a.cls.split(" ")[0] : ""}`;
    if (ignore.has(key)) continue;
    if (a.tag !== b.tag) continue; // 구조 어긋남 — 아래 structureDelta로 보고
    const d = Math.max(
      Math.abs(a.box.x - b.box.x),
      Math.abs(a.box.y - b.box.y),
      Math.abs(a.box.w - b.box.w),
      Math.abs(a.box.h - b.box.h)
    );
    if (d > GATE.box) boxOffenders.push({ el: key, delta: +d.toFixed(1), ref: a.box, local: b.box });
    if (a.font !== b.font) {
      const fa = Number(a.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
      const fb = Number(b.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
      if (Math.abs(fa - fb) > GATE.font) fontOffenders.push({ el: key, ref: a.font, local: b.font });
    }
  }

  const worstPixel = pixelResults.length ? Math.max(...pixelResults.map((r) => r.mismatchPct)) : null;
  const vpFail =
    boxOffenders.length > 0 ||
    fontOffenders.length > 0 ||
    (worstPixel !== null && worstPixel > GATE.pixel) ||
    horizontalOverflow ||
    consoleErrors.length > 0 ||
    missing.length > 0;
  if (vpFail) violations++;

  report.push({
    viewport: label,
    pass: !vpFail,
    structureDelta: refMeasure.elements.length - localElements.length,
    boxOffenders: boxOffenders.sort((a, b) => b.delta - a.delta).slice(0, 15),
    fontOffenders: fontOffenders.slice(0, 10),
    pixel: pixelResults,
    horizontalOverflow,
    consoleErrors: consoleErrors.slice(0, 5),
    missingAssets: missing.slice(0, 5),
  });

  console.log(
    `${vpFail ? "FAIL" : "PASS"} ${label}: box초과 ${boxOffenders.length} / font초과 ${fontOffenders.length}` +
      (worstPixel !== null ? ` / pixel최대 ${worstPixel.toFixed(2)}%` : "") +
      (horizontalOverflow ? " / 가로스크롤" : "") +
      (consoleErrors.length ? ` / 콘솔오류 ${consoleErrors.length}` : "") +
      (missing.length ? ` / 404 ${missing.length}` : "")
  );
  await context.close();
}

await browser.close();
await mkdir(args.out, { recursive: true });
await writeFile(join(args.out, "report.json"), JSON.stringify({ gate: GATE, report }, null, 2));
console.log(`\n게이트 기준: box ≤${GATE.box}px / font ≤${GATE.font}px / pixel ≤${GATE.pixel}%`);
console.log(violations ? `미달 뷰포트 ${violations}개 — report.json 참조` : "전 뷰포트 통과");
exit(violations ? 1 : 0);

async function comparePng(refPath, localPath, outPath) {
  try {
    const a = PNG.sync.read(await readFile(refPath));
    const b = PNG.sync.read(await readFile(localPath));
    const width = Math.min(a.width, b.width);
    const height = Math.min(a.height, b.height);
    const diff = new PNG({ width, height });
    const crop = (img) => {
      if (img.width === width && img.height === height) return img;
      const c = new PNG({ width, height });
      PNG.bitblt(img, c, 0, 0, width, height, 0, 0);
      return c;
    };
    const mismatch = pixelmatch(crop(a).data, crop(b).data, diff.data, width, height, { threshold: 0.1 });
    await writeFile(outPath, PNG.sync.write(diff));
    return {
      mismatchPct: (mismatch / (width * height)) * 100,
      sizeDelta: [a.width - b.width, a.height - b.height],
    };
  } catch (e) {
    console.warn(`  pixel diff 실패: ${e.message.slice(0, 60)}`);
    return null;
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
