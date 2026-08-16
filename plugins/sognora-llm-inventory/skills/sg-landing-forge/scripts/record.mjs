/**
 * record.mjs — 동작 타임라인 기록 (Tier R 번들의 동적 절반)
 *
 * usage: record.mjs --url <URL> --out <dir> [--selectors "a,b"] [--max 10] [--window 1400]
 *
 * probe.mjs가 "무엇이 변하는가"(전후 diff)를 재면, record는 "어떻게 변하는가"를 잰다:
 * rAF 샘플링으로 트리거 전→중→후의 속성 궤적을 기록 — 스프링(오버슈트), 시퀀스(지연 사슬),
 * 이징의 실제 곡선을 재현 가능한 수치로 남긴다.
 *
 * 산출: record.json
 *   hover:  [{selector, timeline:[{t, transform, opacity, boxShadow, filter, backgroundColor}], overshoot}]
 *   reveal: [{selector, timeline, startY}]   — 스크롤 리빌의 궤적
 *   listeners: {click, mousemove, scroll…}   — CDP 리스너 인벤토리(어떤 상호작용이 존재하는가)
 *   animations: getAnimations() 스냅샷(이름·duration·easing·iterations)
 *
 * 한계(정직 고지): 슬라이더·캔버스·WebGL 복합 위젯의 내부 로직은 기록되지 않는다 —
 * 그런 위젯은 분석 에이전트가 조작하며 파라미터를 측정해 기술로 남긴다. 과약속 금지.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) { console.error("usage: record.mjs --url <URL> --out <dir> [--selectors a,b] [--max 10] [--window 1400]"); exit(2); }
const pw = await load("playwright");
if (!pw) { console.error("playwright 미설치"); exit(2); }
const WIN = +(args.window ?? 1400); // 샘플링 창(ms)
const MAX = +(args.max ?? 10);

const browser = await pw.chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(args.url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});

const SAMPLER = `(el, windowMs) => new Promise((done) => {
  const t0 = performance.now(); const frames = [];
  const tick = () => {
    const cs = getComputedStyle(el); const t = performance.now() - t0;
    frames.push({ t: Math.round(t), transform: cs.transform, opacity: cs.opacity, boxShadow: cs.boxShadow === "none" ? undefined : cs.boxShadow, filter: cs.filter === "none" ? undefined : cs.filter, backgroundColor: cs.backgroundColor });
    if (t < windowMs) requestAnimationFrame(tick); else done(compress(frames));
  };
  const compress = (fs) => { // 무변화 프레임 제거(첫·끝 유지)
    const out = [fs[0]];
    for (let i = 1; i < fs.length - 1; i++) { const a = JSON.stringify({ ...fs[i], t: 0 }), b = JSON.stringify({ ...out[out.length - 1], t: 0 }); if (a !== b) out.push(fs[i]); }
    out.push(fs[fs.length - 1]); return out;
  };
  requestAnimationFrame(tick);
})`;

// ── 호버 타임라인 ─────────────────────────────────────────────────────────
const selectors = args.selectors
  ? args.selectors.split(",").map((s) => s.trim())
  : await page.evaluate((max) => {
      const seen = new Set(); const out = [];
      for (const el of document.querySelectorAll('a,button,[role="button"],[class*="card" i],[class*="btn" i],[class*="tile" i]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20 || r.width > 900) continue;
        const key = el.tagName + "|" + [...el.classList].sort().join(".");
        if (seen.has(key)) continue; seen.add(key);
        let sel = el.tagName.toLowerCase();
        if (el.classList.length) sel += "." + CSS.escape(el.classList[0]);
        if (document.querySelectorAll(sel).length > 1 && el.classList.length > 1) sel += "." + CSS.escape(el.classList[1]);
        out.push(sel);
        if (out.length >= max) break;
      }
      return out;
    }, MAX);

const hover = [];
for (const sel of selectors) {
  try {
    const el = page.locator(sel).first();
    if (!(await el.count())) continue;
    await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
    const handle = await el.elementHandle();
    const [timeline] = await Promise.all([
      page.evaluate(`(async () => { const el = document.querySelector(${JSON.stringify(sel)}); return (${SAMPLER})(el, ${WIN}); })()`),
      (async () => { await page.waitForTimeout(120); await handle.hover(); })(),
    ]);
    const overshoot = detectOvershoot(timeline);
    hover.push({ selector: sel, frames: timeline.length, timeline, overshoot });
  } catch {}
}

// ── 스크롤 리빌 타임라인 ──────────────────────────────────────────────────
await page.reload({ waitUntil: "networkidle" }).catch(() => {});
const hiddenSel = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("main *, body > * *")) {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight || r.width < 80 || r.height < 40) continue;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 0.1 || (cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)")) {
      let sel = el.tagName.toLowerCase();
      if (el.classList.length) sel += "." + CSS.escape(el.classList[0]);
      if (document.querySelectorAll(sel).length === 1) out.push({ sel, y: Math.round(r.top + scrollY) });
    }
    if (out.length >= 6) break;
  }
  return out;
});
const reveal = [];
for (const { sel, y } of hiddenSel) {
  try {
    const [timeline] = await Promise.all([
      page.evaluate(`(async () => { const el = document.querySelector(${JSON.stringify(sel)}); return (${SAMPLER})(el, ${WIN}); })()`),
      page.evaluate((ty) => { scrollTo({ top: ty - innerHeight * 0.7, behavior: "instant" }); }, y),
    ]);
    reveal.push({ selector: sel, startY: y, timeline });
  } catch {}
}

// ── 리스너 인벤토리(CDP) + 애니메이션 스냅샷 ──────────────────────────────
let listeners = null;
try {
  const cdp = await page.context().newCDPSession(page);
  const { result } = await cdp.send("Runtime.evaluate", {
    // getEventListeners는 CDP의 커맨드라인 API로만 접근 가능 — 대표 요소들의 리스너 유형 분포
    expression: `(() => { const counts = {}; const els = [window, document, ...document.querySelectorAll('body, main, section, a, button, [role="button"], [class*="card" i], [class*="slider" i], canvas')].slice(0, 250);
      for (const el of els) { try { const ls = getEventListeners(el); for (const t of Object.keys(ls)) counts[t] = (counts[t] ?? 0) + ls[t].length; } catch {} }
      return counts; })()`,
    includeCommandLineAPI: true, returnByValue: true,
  });
  listeners = result.value ?? null;
} catch {}
const animations = await page.evaluate(() =>
  document.getAnimations().slice(0, 60).map((a) => ({
    name: a.animationName ?? a.constructor.name,
    duration: a.effect?.getTiming?.().duration ?? null,
    easing: a.effect?.getTiming?.().easing ?? null,
    iterations: a.effect?.getTiming?.().iterations ?? null,
    state: a.playState,
  }))
).catch(() => []);

await browser.close();
await mkdir(args.out, { recursive: true });
const out = { url: args.url, window: WIN, hover, reveal, listeners, animations };
await writeFile(join(args.out, "record.json"), JSON.stringify(out, null, 2));
console.log(`record 완료: hover ${hover.length}건(오버슈트 ${hover.filter((h) => h.overshoot).length}), reveal ${reveal.length}건, 실행중 애니메이션 ${animations.length}건 → ${args.out}/record.json`);

function detectOvershoot(tl) {
  // transform matrix의 translate/scale 성분이 최종값을 넘었다 돌아오면 스프링(오버슈트)
  const nums = tl.map((f) => { const m = /matrix\(([^)]+)\)/.exec(f.transform ?? ""); return m ? m[1].split(",").map(Number) : null; }).filter(Boolean);
  if (nums.length < 4) return false;
  const last = nums[nums.length - 1];
  for (const idx of [0, 3, 4, 5]) { // scaleX, scaleY, tx, ty
    const series = nums.map((n) => n[idx]); const fin = last[idx];
    const max = Math.max(...series), min = Math.min(...series);
    if (max > fin + 0.002 && min < fin - 0.002) continue;
    if (max - fin > Math.abs(fin - series[0]) * 0.02 && max !== series[0]) return true;
    if (fin - min > Math.abs(fin - series[0]) * 0.02 && min !== series[0]) return true;
  }
  return false;
}
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
