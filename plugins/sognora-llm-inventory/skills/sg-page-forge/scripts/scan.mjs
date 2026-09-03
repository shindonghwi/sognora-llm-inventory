#!/usr/bin/env node
/**
 * scan.mjs — 이 스킬의 **유일한 페이지 관측 패스**. 한 URL을 뷰포트별로 열어 scan.json과 캡처를 남긴다.
 * 그 뒤의 모든 규칙(detect·conform·sameness·irdiff·copylint)은 scan.json만 읽는 순수 함수다 — 브라우저를 다시 열지 않는다.
 *
 * usage: node scan.mjs --url <URL> --out <dir> [--viewports 1440x900,390x844] [--settle 1500] [--no-shots]
 * 산출: <out>/scan.json · <out>/shots/<vp>-full.png · <out>/shots/<vp>-band-<n>.png(뷰포트 높이 단위 밴드, 판정자 입력)
 *
 * scan.json (version 1)
 *   { version, url, finalUrl, title, collectedAt, errors:{console[], page[]}, fonts[], keyframesCount,
 *     viewports: { "<w>x<h>": { width, height, scrollHeight, overflowX, nodes[], sections[], images[], interactive[], copy[], shots } } }
 *   node: { i, parent, depth, tag, role, text, textLen, hangul, rect:{x,y,w,h}, visible, fixed, cs:{ff,fs,fw,lh,ls,fst,color,bg,bgi,bw,radius,shadow,tr,anim,bd,tt,wb,ov,disp,op} }
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { loadPlaywright, missingPlaywright, parseArgs } from "./_deps.mjs";

export const SCAN_VERSION = 1;
export const DEFAULT_VIEWPORTS = "1440x900,390x844";   // 정의: 데스크톱·모바일 기준 프레임(모든 실측·IR이 같은 크기라 비교가 성립한다)

/** 브라우저 안에서 실행되는 관측 함수 — 외부 심볼 참조 금지(toString으로 주입). */
function collectInPage(maxNodes) {
  const vw = innerWidth, vh = innerHeight;
  const doc = document;
  const nodes = [], copy = [], images = [], interactive = [];
  const hangul = /[ㄱ-ㆎ가-힣]/;
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "PATH", "HEAD", "META", "LINK", "BR"]);
  const isVisible = (cs, r) => cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.02 && r.width > 0 && r.height > 0;
  const sx = scrollX, sy = scrollY;
  let idx = 0;
  const walk = (el, parent, depth) => {
    if (idx >= maxNodes) return;
    if (el.nodeType !== 1 || skip.has(el.tagName)) return;
    const cs = getComputedStyle(el);
    const rb = el.getBoundingClientRect();
    const r = { x: Math.round(rb.left + sx), y: Math.round(rb.top + sy), w: Math.round(rb.width), h: Math.round(rb.height) };
    const visible = isVisible(cs, rb);
    let ownText = "";
    for (const c of el.childNodes) if (c.nodeType === 3) ownText += c.nodeValue;
    ownText = ownText.replace(/\s+/g, " ").trim();
    const me = idx++;
    nodes.push({
      i: me, parent, depth, tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", text: ownText.slice(0, 200), textLen: ownText.length, hangul: hangul.test(ownText),
      rect: r, visible, fixed: cs.position === "fixed" || cs.position === "sticky",
      cs: { ff: cs.fontFamily, fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight, 10) || 400, lh: cs.lineHeight, ls: cs.letterSpacing, fst: cs.fontStyle, color: cs.color, bg: cs.backgroundColor, bgi: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 160), bw: cs.borderLeftWidth + "|" + cs.borderTopWidth + "|" + cs.borderRightWidth + "|" + cs.borderBottomWidth + "|" + cs.borderLeftColor, radius: cs.borderRadius, shadow: cs.boxShadow === "none" ? "" : cs.boxShadow.slice(0, 120), tr: cs.transitionProperty + " " + cs.transitionDuration, anim: cs.animationName === "none" ? "" : cs.animationName + " " + cs.animationIterationCount, bd: cs.backdropFilter === "none" ? "" : cs.backdropFilter, tt: cs.textTransform, wb: cs.wordBreak, ov: cs.overflowX, disp: cs.display, op: parseFloat(cs.opacity) },
      attrs: { href: el.getAttribute("href") || "", type: el.getAttribute("type") || "", ariaHidden: el.getAttribute("aria-hidden") === "true", cls: (el.className && typeof el.className === "string") ? el.className.slice(0, 80) : "" },
    });
    if (visible && ownText.length >= 2 && /^(P|H1|H2|H3|H4|H5|H6|LI|BUTTON|A|SPAN|DT|DD|TD|TH|LABEL|FIGCAPTION|BLOCKQUOTE|SUMMARY|SMALL|STRONG|EM)$/.test(el.tagName)) copy.push({ i: me, tag: el.tagName.toLowerCase(), text: ownText.slice(0, 400) });
    if (el.tagName === "IMG" || el.tagName === "PICTURE" || el.tagName === "VIDEO") images.push({ i: me, src: (el.currentSrc || el.getAttribute("src") || "").slice(0, 200), alt: el.getAttribute("alt") ?? null, rect: r, natural: { w: el.naturalWidth || el.videoWidth || 0, h: el.naturalHeight || el.videoHeight || 0 }, sized: el.hasAttribute("width") && el.hasAttribute("height"), visible });
    if (visible && (el.matches("a[href],button,input,select,textarea,[role=button],[tabindex]") )) interactive.push({ i: me, tag: el.tagName.toLowerCase(), text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80), rect: r, href: el.getAttribute("href") || "", type: el.getAttribute("type") || "", fixed: cs.position === "fixed" || cs.position === "sticky" });
    for (const c of el.children) walk(c, me, depth + 1);
  };
  walk(doc.body, -1, 0);
  /* 섹션: body 아래 첫 "큰" 컨테이너의 직계 자식 중 높이 있는 블록. 정의: 뷰포트 높이 8% 이상인 블록만 섹션으로 센다 */
  const minH = Math.round(vh * 0.08);
  let host = doc.body;
  for (let k = 0; k < 4; k++) { const kids = [...host.children].filter((c) => !skip.has(c.tagName) && c.getBoundingClientRect().height >= minH); if (kids.length === 1 && kids[0].children.length) host = kids[0]; else break; }
  const sections = [...host.children].filter((c) => !skip.has(c.tagName)).map((c) => {
    const rb = c.getBoundingClientRect(); const cs = getComputedStyle(c);
    const h = c.querySelector("h1,h2,h3");
    return { y: Math.round(rb.top + sy), h: Math.round(rb.height), tag: c.tagName.toLowerCase(), cls: (typeof c.className === "string" ? c.className : "").slice(0, 60), bg: cs.backgroundColor, bgi: cs.backgroundImage !== "none", textLen: (c.innerText || "").replace(/\s+/g, " ").trim().length, imgCount: c.querySelectorAll("img,video,canvas,svg").length, heading: h ? (h.innerText || "").trim().slice(0, 120) : "", headingTag: h ? h.tagName.toLowerCase() : "", fixed: cs.position === "fixed" || cs.position === "sticky", pad: { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 } };
  }).filter((s) => s.h >= minH || s.fixed);
  const kf = [...doc.styleSheets].reduce((n, ss) => { try { for (const r of ss.cssRules) if (r.type === 7) n++; } catch { /* cross-origin */ } return n; }, 0);
  const fonts = [...doc.fonts].map((f) => ({ family: f.family.replace(/["']/g, ""), weight: f.weight, style: f.style, status: f.status }));
  return { width: vw, height: vh, scrollHeight: Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight), overflowX: doc.documentElement.scrollWidth > vw + 1, nodes, sections, images, interactive, copy, keyframesCount: kf, fonts, title: doc.title, lang: doc.documentElement.lang || "" };
}

export async function scanUrl(pw, { url, out, viewports = DEFAULT_VIEWPORTS, settle = 1500, shots = true, maxNodes = 6000 }) {
  const browser = await pw.chromium.launch({ headless: true });
  const result = { version: SCAN_VERSION, url, finalUrl: url, title: "", collectedAt: new Date().toISOString(), errors: { console: [], page: [] }, fonts: [], keyframesCount: 0, viewports: {} };
  try {
    for (const vp of viewports.split(",")) {
      const [w, h] = vp.split("x").map(Number);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, locale: "ko-KR", deviceScaleFactor: 1 });   // 정의: 800px 미만은 모바일 에뮬레이션
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") result.errors.console.push(`[${vp}] ${m.text().slice(0, 200)}`); });
      page.on("pageerror", (e) => result.errors.page.push(`[${vp}] ${String(e.message || e).slice(0, 200)}`));
      await page.goto(url, { waitUntil: "load", timeout: 60000 });
      /* 리빌·지연 로드를 깨우기 위해 끝까지 한 번 스크롤한 뒤 맨 위로 */
      await page.evaluate(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += Math.max(300, innerHeight * 0.8)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.waitForTimeout(settle);
      const data = await page.evaluate(collectInPage, maxNodes);
      result.finalUrl = page.url(); result.title = data.title; result.fonts = data.fonts; result.keyframesCount = Math.max(result.keyframesCount, data.keyframesCount);
      const vpOut = { width: data.width, height: data.height, scrollHeight: data.scrollHeight, overflowX: data.overflowX, lang: data.lang, nodes: data.nodes, sections: data.sections, images: data.images, interactive: data.interactive, copy: data.copy, shots: null };
      if (shots) {
        await mkdir(join(out, "shots"), { recursive: true });
        const full = `shots/${vp}-full.png`; await page.screenshot({ path: join(out, full), fullPage: true });
        const bands = []; const nBands = Math.min(12, Math.ceil(data.scrollHeight / h));   // 정의: 판정자 입력 밴드 상한 12(문맥 한계), 한 밴드 = 뷰포트 높이
        for (let b = 0; b < nBands; b++) { await page.evaluate((y) => scrollTo(0, y), b * h); await page.waitForTimeout(120); const f = `shots/${vp}-band-${String(b).padStart(2, "0")}.png`; await page.screenshot({ path: join(out, f) }); bands.push({ file: f, y: b * h }); }
        vpOut.shots = { full, bands };
      }
      result.viewports[vp] = vpOut;
      await ctx.close();
    }
  } finally { await browser.close(); }
  return result;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2));
  if (!args.url || !args.out) { console.error("usage: scan.mjs --url <URL> --out <dir> [--viewports 1440x900,390x844] [--settle ms] [--no-shots]"); exit(2); }
  const pw = await loadPlaywright(); if (!pw) { console.error(missingPlaywright()); exit(2); }
  await mkdir(args.out, { recursive: true });
  const scan = await scanUrl(pw, { url: args.url, out: args.out, viewports: args.viewports || DEFAULT_VIEWPORTS, settle: args.settle ? Number(args.settle) : 1500, shots: !args["no-shots"] });
  await writeFile(join(args.out, "scan.json"), JSON.stringify(scan));
  const vps = Object.entries(scan.viewports).map(([k, v]) => `${k}: nodes ${v.nodes.length} · sections ${v.sections.length} · scrollH ${v.scrollHeight}`).join(" | ");
  console.log(`scan → ${join(args.out, "scan.json")} · ${vps} · errors ${scan.errors.console.length + scan.errors.page.length}`);
}
