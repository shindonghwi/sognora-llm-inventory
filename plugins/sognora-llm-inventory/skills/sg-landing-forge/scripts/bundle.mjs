/**
 * bundle.mjs — 재현급 정적 수집 (Tier R 번들의 정적 절반)
 *
 * usage: bundle.mjs --url <URL> --out <dir> [--viewports 1440,390]
 *
 * 산출(전부 로컬 캐시 전용 — 원본 CSS·자산 사본은 재배포이므로 저장소 커밋 절대 금지,
 * `references/bundles/`는 gitignore. 커밋 가능한 것은 ir.mjs가 증류한 측정 사실뿐):
 *   meta.json          수집 시각·URL·뷰포트
 *   tree-<w>.json      DOM 트리 + rect + 핵심 computed styles 전수 덤프
 *   css/NNN.css        스타일시트 원문(외부 링크 fetch + inline <style>)
 *   atrules.json       @keyframes 블록 원문·@media 쿼리 목록 (css에서 추출)
 *   assets.json        네트워크 매니페스트(이미지·폰트·미디어: url·타입·용량·표시 rect·natural 치수)
 *   fonts.json         document.fonts (family·weight·style)
 *
 * 동적 절반은 별도 계기: probe.mjs(호버 diff·리빌 유무) + record.mjs(타임라인).
 * 번들 = 이 산출들이 모인 디렉터리 하나.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) { console.error("usage: bundle.mjs --url <URL> --out <dir> [--viewports 1440,390]"); exit(2); }
const pw = await load("playwright");
if (!pw) { console.error("playwright 미설치"); exit(2); }
const viewports = (args.viewports ?? "1440,390").split(",").map(Number);
await mkdir(join(args.out, "css"), { recursive: true });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const browser = await pw.chromium.launch({ headless: true });
const assets = new Map();
const cssTexts = [];

for (const [vi, w] of viewports.entries()) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 }, userAgent: UA, locale: "ko-KR" });
  const page = await ctx.newPage();
  if (vi === 0) {
    page.on("response", async (res) => {
      try {
        const rt = res.request().resourceType();
        if (!["image", "media", "font", "stylesheet"].includes(rt)) return;
        const url = res.url();
        if (assets.has(url)) return;
        const headers = res.headers();
        assets.set(url, { url, type: rt, contentType: headers["content-type"] ?? null, bytes: +(headers["content-length"] ?? 0) || null });
      } catch {}
    });
  }
  await page.goto(args.url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.evaluate(async () => { // 전체 스크롤: 지연 로드·리빌 강제
    for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(800);

  const tree = await page.evaluate(() => {
    const KEEP = ["display", "position", "backgroundColor", "color", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "gap",
      "gridTemplateColumns", "flexDirection", "alignItems", "justifyContent", "borderRadius", "boxShadow",
      "border", "transition", "animation", "backdropFilter", "maskImage", "zIndex", "overflow", "objectFit", "aspectRatio", "textAlign", "maxWidth", "opacity", "transform", "mixBlendMode", "filter"];
    const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META"]);
    const dump = (el, depth) => {
      if (SKIP.has(el.tagName) || depth > 22) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const isSvg = el.tagName.toLowerCase() === "svg";
      const node = {
        tag: el.tagName.toLowerCase(),
        cls: [...el.classList].slice(0, 3),
        id: el.id || undefined,
        rect: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
        text: undefined, styles: {}, children: [],
      };
      const direct = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
      if (direct) node.text = direct.slice(0, 120);
      for (const k of KEEP) { const v = cs[k]; if (v && v !== "none" && v !== "normal" && v !== "auto" && v !== "0px" && v !== "rgba(0, 0, 0, 0)" && v !== "visible" && v !== "static") node.styles[k] = String(v).slice(0, 160); }
      if (el.tagName === "IMG") node.media = { src: el.currentSrc || el.src, natural: [el.naturalWidth, el.naturalHeight], alt: el.alt?.slice(0, 60) };
      if (el.tagName === "VIDEO") node.media = { src: el.currentSrc || el.src, poster: el.poster };
      if (isSvg) { node.svg = { paths: el.querySelectorAll("path").length, viewBox: el.getAttribute("viewBox") }; return node; } // 내부 미탐색
      let kids = [...el.children].filter((c) => !SKIP.has(c.tagName));
      if (kids.length > 64) { // script류 제거 후에도 넘치면 가시 요소 우선(문서 순서 유지)
        node.childrenTruncated = kids.length;
        const vis = kids.filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        kids = (vis.length ? vis : kids).slice(0, 64);
      }
      for (const c of kids) { const d = dump(c, depth + 1); if (d) node.children.push(d); }
      return node;
    };
    return { scrollHeight: document.body.scrollHeight, tree: dump(document.body, 0) };
  });
  await writeFile(join(args.out, `tree-${w}.json`), JSON.stringify(tree));
  await page.screenshot({ fullPage: true, path: join(args.out, `shot-${w}.png`) }).catch(() => {});
  { // fullPage는 아주 긴 페이지에서 하단이 백지가 되는 결손 사례가 있다(vercel) — 밴드 샷 병행
    const vh = w > 800 ? 900 : 844;
    const dir = join(args.out, `shots-${w}`);
    await mkdir(dir, { recursive: true });
    for (let y = 0, i = 0; y < tree.scrollHeight && i < 24; y += vh, i++) {
      await page.evaluate((ty) => scrollTo(0, ty), y);
      await page.waitForTimeout(220);
      await page.screenshot({ path: join(dir, `y${String(y).padStart(5, "0")}.png`) }).catch(() => {});
    }
    await page.evaluate(() => scrollTo(0, 0));
  }
  console.log(`tree-${w}.json: scrollHeight=${tree.scrollHeight} (+shot-${w}.png, 밴드 샷)`);

  if (vi === 0) {
    // CSS 수확: inline <style> + 외부 시트 fetch
    const inline = await page.evaluate(() => [...document.querySelectorAll("style")].map((s) => s.textContent ?? ""));
    inline.forEach((t, i) => t.trim() && cssTexts.push({ name: `inline-${i}`, text: t }));
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href));
    for (const [i, href] of hrefs.entries()) {
      try { const res = await page.request.get(href); if (res.ok()) cssTexts.push({ name: `sheet-${i}`, href, text: await res.text() }); } catch {}
    }
    const fonts = await page.evaluate(() => [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style })));
    await writeFile(join(args.out, "fonts.json"), JSON.stringify(dedupe(fonts), null, 2));
    // 자산에 표시 rect·natural 치수 결합
    const shown = await page.evaluate(() => [...document.querySelectorAll("img,video")].map((el) => {
      const r = el.getBoundingClientRect();
      return { src: el.currentSrc || el.src, rect: { w: Math.round(r.width), h: Math.round(r.height) }, natural: el.naturalWidth ? [el.naturalWidth, el.naturalHeight] : null };
    }));
    for (const s of shown) { const a = assets.get(s.src); if (a) { a.rect = s.rect; a.natural = s.natural; } }
  }
  await ctx.close();
}
await browser.close();

for (const [i, c] of cssTexts.entries()) await writeFile(join(args.out, "css", `${String(i).padStart(3, "0")}-${c.name}.css`), c.text);

// @keyframes(중괄호 균형 추출)·@media 목록
const at = { keyframes: [], media: new Set() };
for (const c of cssTexts) {
  for (const m of c.text.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g)) {
    let i = m.index + m[0].length, depth = 1;
    while (i < c.text.length && depth > 0) { if (c.text[i] === "{") depth++; else if (c.text[i] === "}") depth--; i++; }
    at.keyframes.push({ name: m[1], body: c.text.slice(m.index, i).slice(0, 2000), from: c.name });
  }
  for (const m of c.text.matchAll(/@media\s*([^{]+)\{/g)) at.media.add(m[1].trim().slice(0, 120));
}
await writeFile(join(args.out, "atrules.json"), JSON.stringify({ keyframes: at.keyframes, media: [...at.media] }, null, 2));
await writeFile(join(args.out, "assets.json"), JSON.stringify([...assets.values()], null, 2));
await writeFile(join(args.out, "meta.json"), JSON.stringify({ url: args.url, viewports, collectedAt: new Date().toISOString(), cssSheets: cssTexts.length, keyframes: at.keyframes.length, assets: assets.size }, null, 2));
console.log(`bundle 완료: css ${cssTexts.length}장, @keyframes ${at.keyframes.length}개, 자산 ${assets.size}건 → ${args.out}`);
console.log("주의: 이 디렉터리는 원본 사본을 포함한다 — 로컬 캐시 전용, 커밋 금지.");

function dedupe(arr) { return [...new Map(arr.map((x) => [JSON.stringify(x), x])).values()]; }
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
