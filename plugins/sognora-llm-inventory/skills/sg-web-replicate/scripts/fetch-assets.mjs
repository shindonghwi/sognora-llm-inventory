#!/usr/bin/env node
/**
 * 원본 자산 수집 — 페이지가 실제로 로드한 폰트·이미지·아이콘을 그대로 내려받는다.
 *
 * node fetch-assets.mjs --url <URL> --out <dir> [--viewport 1440x900] [--storage state.json] [--headed]
 *
 * 목표는 "완전히 똑같이"다. 대체·근사가 아니라 원본 파일을 확보하는 것이 이 스크립트의 일이다.
 * 산출: <out>/fonts/* , <out>/images/* , <out>/assets.json(@font-face·CSS변수·실패 목록)
 * exit 0 전부 성공 / 1 일부 실패(assets.json의 failed 참조) / 2 실행 불가
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) {
  console.error("usage: fetch-assets.mjs --url <URL> --out <dir> [--viewport 1440x900]");
  exit(2);
}

const pw = await load("playwright");
if (!pw) {
  missing(["playwright"]);
  exit(2);
}
const { chromium } = pw;

const [vw, vh] = (args.viewport ?? "1440x900").split("x").map(Number);
const fontsDir = join(args.out, "fonts");
const imagesDir = join(args.out, "images");
await mkdir(fontsDir, { recursive: true });
await mkdir(imagesDir, { recursive: true });

const browser = await chromium.launch({ headless: !args.headed });
const context = await browser.newContext({
  viewport: { width: vw, height: vh },
  storageState: args.storage || undefined,
});
const page = await context.newPage();

const saved = { fonts: [], images: [] };
const failed = [];
const seen = new Set();
const cssTexts = []; // CORS로 DOM에서 못 읽는 시트를 대비해 원문을 모아둔다

// 네트워크 응답에서 직접 건진다 — 페이지가 실제로 쓴 자산만 정확히 남는다
page.on("response", async (res) => {
  const url = res.url();
  if (seen.has(url) || url.startsWith("data:")) return;
  const type = res.request().resourceType();
  if (type === "stylesheet") {
    seen.add(url);
    res
      .text()
      .then((t) => cssTexts.push({ url, text: t }))
      .catch(() => {});
    return;
  }
  if (type !== "font" && type !== "image") return;
  seen.add(url);
  if (!res.ok()) {
    failed.push({ url, status: res.status(), reason: "http" });
    return;
  }
  try {
    const buf = await res.body();
    const dir = type === "font" ? fontsDir : imagesDir;
    const name = safeName(url, type);
    await writeFile(join(dir, name), buf);
    saved[type === "font" ? "fonts" : "images"].push({
      url,
      file: `${type === "font" ? "fonts" : "images"}/${name}`,
      bytes: buf.length,
      contentType: res.headers()["content-type"] ?? null,
    });
  } catch (e) {
    failed.push({ url, reason: e.message.slice(0, 80) });
  }
});

try {
  await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 });
} catch (e) {
  console.error(`goto 실패: ${e.message}`);
  await browser.close();
  exit(2);
}

// 지연 로딩 자산까지 끌어내기 위해 한 번 훑어 내린다
await page.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1200);

// @font-face 규칙 — 어떤 파일이 어떤 family/weight인지 알아야 그대로 재현할 수 있다
const fontFaces = await page.evaluate(() => {
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // CORS로 못 읽는 시트
    }
    for (const rule of rules ?? []) {
      if (rule.constructor.name !== "CSSFontFaceRule" && rule.type !== 5) continue;
      const s = rule.style;
      out.push({
        family: s.getPropertyValue("font-family").replace(/["']/g, "").trim(),
        weight: s.getPropertyValue("font-weight") || "normal",
        style: s.getPropertyValue("font-style") || "normal",
        display: s.getPropertyValue("font-display") || null,
        unicodeRange: s.getPropertyValue("unicode-range") || null,
        src: s.getPropertyValue("src"),
      });
    }
  }
  return out;
});

// DOM에서 못 읽은 시트(CORS)는 응답 원문을 직접 파싱해 @font-face를 건진다.
// 어떤 파일이 어떤 family/weight인지 모르면 폰트를 그대로 재현할 수 없다.
if (!fontFaces.length) {
  for (const { url, text } of cssTexts) {
    for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const body = m[1];
      const pick = (prop) => body.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, "i"))?.[1].trim() ?? null;
      const family = pick("font-family");
      if (!family) continue;
      fontFaces.push({
        family: family.replace(/["']/g, ""),
        weight: pick("font-weight") ?? "normal",
        style: pick("font-style") ?? "normal",
        display: pick("font-display"),
        unicodeRange: pick("unicode-range"),
        src: pick("src"),
        fromStylesheet: url,
      });
    }
  }
}

// 실제로 렌더에 쓰인 폰트 스택 + CSS 커스텀 프로퍼티(디자인 토큰)
const usedFonts = await page.evaluate(() => {
  const set = new Set();
  for (const el of document.querySelectorAll("body, h1, h2, h3, p, a, button, nav, footer")) {
    set.add(getComputedStyle(el).fontFamily);
  }
  return [...set];
});
const cssVars = await page.evaluate(() => {
  const out = {};
  const cs = getComputedStyle(document.documentElement);
  for (const name of cs) {
    if (name.startsWith("--")) out[name] = cs.getPropertyValue(name).trim();
  }
  return out;
});
// 인라인 SVG는 네트워크를 안 타므로 DOM에서 직접 건진다
const inlineSvgs = await page.evaluate(() =>
  [...document.querySelectorAll("svg")].slice(0, 40).map((s) => s.outerHTML)
);

for (let i = 0; i < inlineSvgs.length; i++) {
  await writeFile(join(imagesDir, `inline-${String(i).padStart(2, "0")}.svg`), inlineSvgs[i]);
}

const stylesheetLinks = await page.evaluate(() =>
  [...document.querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="font"]')].map((l) => l.href)
);

await writeFile(
  join(args.out, "assets.json"),
  JSON.stringify(
    {
      url: args.url,
      viewport: [vw, vh],
      fetchedAt: new Date().toISOString(),
      fontFaces,
      usedFonts,
      cssVars,
      stylesheetLinks,
      saved,
      inlineSvgCount: inlineSvgs.length,
      failed,
    },
    null,
    2
  )
);

await browser.close();

console.log(`fonts ${saved.fonts.length}개 · images ${saved.images.length}개 · inline SVG ${inlineSvgs.length}개 저장`);
console.log(`@font-face ${fontFaces.length}건 · CSS 변수 ${Object.keys(cssVars).length}개 추출`);
if (usedFonts.length) console.log(`실제 폰트 스택: ${usedFonts.slice(0, 3).join(" / ")}`);
if (failed.length) {
  console.log(`⚠ 실패 ${failed.length}건 — 대체가 필요하면 override.json에 기록하고 보고에 명시할 것`);
  for (const f of failed.slice(0, 5)) console.log(`   ${f.status ?? ""} ${f.url.slice(0, 90)}`);
}
exit(failed.length ? 1 : 0);

function safeName(url, type) {
  try {
    const u = new URL(url);
    let name = basename(u.pathname) || "asset";
    if (!extname(name)) name += type === "font" ? ".woff2" : ".bin";
    // 같은 파일명이 다른 경로에 있을 수 있으므로 짧은 해시를 붙인다
    let h = 0;
    for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ext = extname(name);
    return `${name.slice(0, name.length - ext.length)}-${h.toString(36).slice(0, 5)}${ext}`;
  } catch {
    return `asset-${Date.now()}`;
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
