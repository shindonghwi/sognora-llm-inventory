/**
 * behavior.mjs — 동작 검증 게이트 (선언→검증 분리)
 *
 * usage: behavior.mjs --url <URL> --spec <engineering.json> [--out <dir>]
 *
 * engineering.json은 아트디렉터가 선언하고(무엇이 움직여야 하는가), 이 게이트는
 * 선언된 것이 실제로 일어나는지만 검증한다. 통과해야 하는 자(빌더)는 무엇이
 * 세어지는지 통제하지 못한다 — 카운트 게이트의 "억지 인터랙션" 유인을 구조로 차단.
 *
 * engineering.json:
 * {
 *   "minCount": 3,
 *   "roles": ["hero-interactive", "scroll", "micro"],   // 최소 1개씩 커버돼야 하는 역할
 *   "items": [{
 *     "id": "hero-slider", "section": "01-hero", "role": "hero-interactive",
 *     "selector": ".hero [data-demo]",
 *     "trigger": "hover" | "click" | "scroll",
 *     "expect": { "props": ["transform","boxShadow"],   // 트리거 시 반드시 변해야 하는 computed 속성
 *                 "to": { "opacity": "1" } },            // (scroll) 도달해야 하는 최종값
 *     "durationMs": 160,                                 // 선언 시 transition-duration 대조
 *     "jsRequired": true, "reducedMotionSafe": true,
 *     "source": "framer-com.md §스프링"
 *   }]
 * }
 *
 * 배터리: ① 선언 하한(개수·역할 커버리지) ② 항목별 트리거 실행→선언된 diff 실검증
 * ③ no-JS 가시성(JS 꺼도 텍스트가 보이는가 — opacity:0 잔류 사고 차단)
 * ④ reduced-motion 가시성. 실패 1건이면 exit 1.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.spec) { console.error("usage: behavior.mjs --url <URL> --spec <engineering.json> [--out <dir>]"); exit(2); }
const spec = JSON.parse(await readFile(args.spec, "utf8"));
const items = spec.items ?? [];
const failures = [];
const results = [];

// ① 선언 하한 — AD 단계의 의무를 기계로 확인
const minCount = spec.minCount ?? 3;
if (items.length < minCount) failures.push({ id: "_floor", detail: `엔지니어드 모먼트 선언 ${items.length} < 하한 ${minCount}` });
for (const role of spec.roles ?? []) if (!items.some((i) => i.role === role)) failures.push({ id: "_floor", detail: `역할 미커버: ${role}` });

const pw = await load("playwright");
if (!pw) { console.error("playwright 미설치"); exit(2); }
const browser = await pw.chromium.launch({ headless: true });
const PROPS = ["color", "backgroundColor", "borderColor", "boxShadow", "transform", "opacity", "filter", "textDecorationLine", "maskImage", "backdropFilter", "width", "height", "clipPath"];

// ② 항목별 트리거 실검증 — scroll 항목은 초기 상태 보존을 위해 항목마다 새 로드
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
for (const it of items) {
  const page = await ctx.newPage();
  const r = { id: it.id, status: "pass", detail: [] };
  try {
    await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 });
    const el = page.locator(it.selector).first();
    if (!(await el.count())) throw new Error(`selector 미존재: ${it.selector}`);

    if (it.trigger === "scroll") {
      const before = await computed(el);
      const inView = await el.evaluate((e) => { const b = e.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; });
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      const after = await computed(el);
      for (const [prop, want] of Object.entries(it.expect?.to ?? {}))
        if (String(after[prop]) !== String(want)) r.detail.push(`${prop}: 기대 ${want}, 실측 ${after[prop]}`);
      if (inView) r.detail.push("요소가 초기 뷰포트 안 — 리빌 검증 불가(untestable), 선언을 재검토하라");
      else if (!Object.keys(diff(before, after, it.expect?.props ?? ["opacity", "transform"])).length)
        r.detail.push("스크롤 전후 선언 속성 무변화 — 리빌이 실제로 없다");
    } else {
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const before = await computed(el);
      if (it.trigger === "hover") await el.hover();
      else await el.click({ trial: false }).catch(() => el.click({ force: true }));
      await page.waitForTimeout(Math.max(it.durationMs ?? 0, 250) + 150);
      const after = await computed(el);
      const d = diff(before, after, it.expect?.props ?? []);
      for (const p of it.expect?.props ?? []) if (!(p in d)) r.detail.push(`${p} 무변화(선언과 다름)`);
      if (it.durationMs != null) {
        const td = parseFloat(before.transitionDuration ?? "0") * 1000;
        if (Math.abs(td - it.durationMs) > 1 && td !== 0) r.detail.push(`duration ${td}ms ≠ 선언 ${it.durationMs}ms`);
      }
      r.diff = d;
    }
  } catch (e) { r.detail.push(String(e.message ?? e)); }
  if (r.detail.length) { r.status = "fail"; failures.push({ id: it.id, detail: r.detail.join(" · ") }); }
  results.push(r);
  await page.close();
}
await ctx.close();

async function computed(el) {
  return el.evaluate((e, props) => { const cs = getComputedStyle(e); const o = { transitionDuration: cs.transitionDuration }; for (const p of props) o[p] = cs[p]; return o; }, PROPS);
}
function diff(a, b, only) {
  const d = {};
  for (const k of Object.keys(b)) if ((!only.length || only.includes(k)) && a[k] !== b[k]) d[k] = { from: a[k], to: b[k] };
  return d;
}

// ③④ 가시성 배터리 — JS 꺼도, reduced-motion에서도 콘텐츠는 보여야 한다
async function visibilityCheck(opts, label) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await c.newPage();
  await page.goto(args.url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
  }).catch(() => {});
  await page.waitForTimeout(500);
  const hidden = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
      if (!hasText) continue;
      if (!el.getClientRects().length) continue; // display:none 계열(모달·메뉴)은 판정 밖
      const cs = getComputedStyle(el);
      let op = 1;
      for (let e = el; e && e !== document.body; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity || "1");
      if (op < 0.1 || cs.visibility === "hidden")
        out.push({ text: el.textContent.trim().slice(0, 40), path: el.tagName.toLowerCase() + (el.classList[0] ? "." + el.classList[0] : "") });
    }
    return out.slice(0, 20);
  }).catch(() => []);
  await c.close();
  if (hidden.length) failures.push({ id: `_${label}`, detail: `${label}에서 비가시 텍스트 ${hidden.length}건 — 예: ${hidden.slice(0, 3).map((h) => `${h.path}"${h.text}"`).join(", ")}` });
  return hidden;
}
const nojs = await visibilityCheck({ javaScriptEnabled: false }, "no-JS");
const rm = await visibilityCheck({ reducedMotion: "reduce" }, "reduced-motion");
await browser.close();

const out = { pass: failures.length === 0, declared: items.length, minCount, failures, results, nojsHidden: nojs, reducedMotionHidden: rm };
if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "behavior.json"), JSON.stringify(out, null, 2)); }
if (failures.length) {
  console.error(`✖ behavior 실패 ${failures.length}건`);
  for (const f of failures) console.error(`  [${f.id}] ${f.detail}`);
  exit(1);
}
console.log(`✔ behavior 통과 — 선언 ${items.length}건 전부 실측 확인, no-JS/reduced-motion 가시성 이상 없음`);
exit(0);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
