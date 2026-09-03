#!/usr/bin/env node
/**
 * behavior.mjs — 정적 페이지 금지. engineering.json의 선언을 브라우저에서 실행해 실제 computed 변화가 나는지 검증한다.
 *
 * usage: node behavior.mjs --url <URL> --engineering engineering.json [--out dir]
 * engineering.json: { items:[{ id, role:"hero-interactive"|"scroll"|"micro", selector, trigger:"hover"|"click"|"scroll", expect:{props:["transform","boxShadow"]}, durationMs?, reducedMotionSafe? }] }
 * 판정: motion.engineered-floor(하한 3·역할 3종은 **게이트가 소유** — 선언 파일이 임계를 정하면 {"minCount":0}으로 통과한다, 실제 사고) · motion.nojs-visible · motion.reduced-safe
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { loadPlaywright, missingPlaywright, parseArgs } from "./_deps.mjs";

const FLOOR = 3;   // 방어: 게이트가 일부러 소유한다 — 하한 3(히어로 인터랙티브·스크롤·시그니처 마이크로)
const ROLES = ["hero-interactive", "scroll", "micro"];
const TEXT_VISIBLE_MIN = 0.9;   // 정의: no-JS·reduced-motion에서 첫 화면 텍스트 90% 이상 가시

export async function run(pw, url, eng) {
  const findings = []; const items = eng.items || [];
  const roles = new Set(items.map((i) => i.role));
  if (items.length < FLOOR || !ROLES.every((r) => roles.has(r))) findings.push({ id: "motion.engineered-floor", severity: "🔴", detail: `선언 ${items.length}개·역할 ${[...roles].join(",")} — 하한 ${FLOOR}, 역할 ${ROLES.join("/")} 전부 필요(게이트 소유 하한)` });
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(url, { waitUntil: "load", timeout: 60000 }); await page.waitForTimeout(1000);
    const results = [];
    for (const it of items) {
      const r = await page.evaluate(async ({ selector, trigger, props }) => {
        const el = document.querySelector(selector); if (!el) return { found: false };
        const snap = () => { const cs = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, cs[p]])); };
        const before = snap();
        if (trigger === "hover") { el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); }
        else if (trigger === "click") el.click();
        else if (trigger === "scroll") { el.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 300)); }
        await new Promise((r) => setTimeout(r, 450));
        const after = snap(); const changed = props.filter((p) => before[p] !== after[p]);
        return { found: true, changed, before, after };
      }, { selector: it.selector, trigger: it.trigger, props: it.expect?.props || ["opacity", "transform"] });
      results.push({ id: it.id, ...r });
      if (!r.found) findings.push({ id: "motion.engineered-floor", severity: "🔴", detail: `${it.id}: 선택자 ${it.selector} 없음` });
      else if (!r.changed.length) findings.push({ id: "motion.engineered-floor", severity: "🔴", detail: `${it.id}: ${it.trigger} 후 ${(it.expect?.props || []).join(",")} 변화 없음` });
      // 인용: 개폐·전환 duration 하한 120~150ms(forge-rules §2c, 라이브러리 실측) — 0ms 면제 폐지
      if (it.durationMs !== undefined && it.durationMs > 0 && it.durationMs < 120) findings.push({ id: "motion.engineered-floor", severity: "🟡", detail: `${it.id}: durationMs ${it.durationMs} — 개폐·전환 120~150ms 하한(인용 forge-rules §2c)` });
    }
    /* reduced-motion 가시성 */
    const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }); const p2 = await rm.newPage(); await p2.goto(url, { waitUntil: "load", timeout: 60000 }); await p2.waitForTimeout(800);
    // 정의(근거: forge-rules §2c no-JS·reduced-motion 가시 배터리): 가시 판정 — opacity > 0.5·visibility hidden 아님, 텍스트 3자 초과만 센다(no-JS 가시성 배터리)
    const vis = await p2.evaluate(() => { const t = [...document.querySelectorAll("h1,h2,h3,p,li,a,button")].filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.height > 0 && e.textContent.trim().length > 3; }); const shown = t.filter((e) => parseFloat(getComputedStyle(e).opacity) > 0.5 && getComputedStyle(e).visibility !== "hidden"); return { total: t.length, shown: shown.length }; });
    if (vis.total && vis.shown / vis.total < TEXT_VISIBLE_MIN) findings.push({ id: "motion.reduced-safe", severity: "🔴", detail: `reduced-motion에서 첫 화면 텍스트 ${vis.shown}/${vis.total} 가시` });
    await rm.close();
    /* no-JS 가시성 */
    const nj = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false }); const p3 = await nj.newPage(); await p3.goto(url, { waitUntil: "load", timeout: 60000 }).catch(() => {}); await p3.waitForTimeout(500);
    // 정의(근거: 같은 §2c 배터리): reduced-motion 가시 판정 — 같은 기준(opacity > 0.5, 텍스트 3자 초과)
    const vis2 = await p3.evaluate(() => { const t = [...document.querySelectorAll("h1,h2,h3,p,li")].filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && e.textContent.trim().length > 3; }); const shown = t.filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && parseFloat(getComputedStyle(e).opacity) > 0.5; }); return { total: t.length, shown: shown.length }; }).catch(() => ({ total: 0, shown: 0 }));
    if (vis2.total && vis2.shown / vis2.total < TEXT_VISIBLE_MIN) findings.push({ id: "motion.nojs-visible", severity: "🔴", detail: `no-JS에서 첫 화면 텍스트 ${vis2.shown}/${vis2.total} 가시 — 리빌의 opacity:0 잔류` });
    else if (!vis2.total) findings.push({ id: "motion.nojs-visible", severity: "🟡", detail: "no-JS에서 텍스트 0 — 클라이언트 렌더 앱이면 SSR/폴백 검토(관측 한계)" });
    await nj.close();
    return { findings, results };
  } finally { await browser.close(); }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); if (!args.url || !args.engineering) { console.error("usage: behavior.mjs --url <URL> --engineering engineering.json [--out dir]"); exit(2); }
  const pw = await loadPlaywright(); if (!pw) { console.error(missingPlaywright()); exit(2); }
  const r = await run(pw, args.url, JSON.parse(await readFile(args.engineering, "utf8")));
  const md = [`# behavior — ${args.url}`, "", ...(r.findings.length ? r.findings.map((f) => `- ${f.severity} \`${f.id}\` ${f.detail}`) : ["✅ 선언 동작 전부 실측 통과"]), "", ...r.results.map((x) => `- ${x.id}: ${x.found ? (x.changed.length ? "변화 " + x.changed.join(",") : "변화 없음") : "선택자 없음"}`)].join("\n");
  if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "behavior.md"), md); await writeFile(join(args.out, "behavior.json"), JSON.stringify(r, null, 2)); }
  console.log(md); exit(r.findings.some((f) => f.severity === "🔴") ? 1 : 0);
}
