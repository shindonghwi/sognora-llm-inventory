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
 * 배터리: ① 선언 하한(개수·역할 커버리지 — 하한 3·역할 3종은 게이트에 하드코딩, 스펙은 올릴 수만 있음)
 * ② 항목별 트리거 실행→선언된 diff 실검증(durationMs는 CSS transition 항목 전용 — 0ms 면제 없음)
 * ③ no-JS 가시성 — 숨은 텍스트 + **JS-on 대비 가시 텍스트 총량 ≥50%**(CSR 백지 페이지 차단)
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

// ① 선언 하한 — forge-rules §2c의 법(하한 3 · 역할 3종)은 이 게이트에 하드코딩된다.
// engineering.json은 피심판자(런타임 중립 폴백에선 AD=빌더=같은 에이전트)가 쓰는 파일이므로
// 하한을 스펙에서 읽으면 minCount:0 한 줄로 게이트가 무력화된다(감사 실측). 스펙은 올릴 수만 있다.
const FLOOR = { minCount: 3, roles: ["hero-interactive", "scroll", "micro"] };
const minCount = Math.max(FLOOR.minCount, spec.minCount ?? 0);
if (items.length < minCount) failures.push({ id: "_floor", detail: `엔지니어드 모먼트 선언 ${items.length} < 하한 ${minCount}(하한은 스펙이 아니라 게이트 소유)` });
for (const role of new Set([...FLOOR.roles, ...(spec.roles ?? [])])) if (!items.some((i) => i.role === role)) failures.push({ id: "_floor", detail: `역할 미커버: ${role}` });

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
        // td=0 면제 분기가 있었다 — §2c "전환류 0ms 금지"와 정반대로, 0ms 즉시 전환이 duration
        // 검증을 자동 통과했다(감사 실측). durationMs는 CSS transition 항목 전용 계약이다:
        // rAF/WAAPI 구동 항목(스프링 등)은 durationMs를 선언하지 않는다(선택 필드).
        if (Math.abs(td - it.durationMs) > 1)
          r.detail.push(`duration ${td}ms ≠ 선언 ${it.durationMs}ms${td === 0 ? " (전환 0ms — §2c 0ms 금지. JS 구동 항목이면 durationMs를 선언하지 말 것)" : ""}`);
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
// "존재하는데 안 보이는 텍스트"만 찾으면 최악의 no-JS 실패 — 콘텐츠가 아예 안 그려지는
// CSR 백지 페이지 — 가 통과한다(감사 실측: 본문 100% JS 렌더 페이지가 '이상 없음').
// 그래서 JS-on 가시 텍스트 총량을 기준선으로 잡고 no-JS 총량과 비교한다.
async function visibilityCheck(opts, label, baseVisible) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await c.newPage();
  await page.goto(args.url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
  }).catch(() => {});
  await page.waitForTimeout(500);
  const mass = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").trim().length).catch(() => 0);
  const { hidden, visibleTexts } = await page.evaluate(() => {
    const hid = [], vis = [];
    for (const el of document.querySelectorAll("body *")) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
      if (!hasText) continue;
      if (!el.getClientRects().length) continue; // display:none 계열(모달·메뉴)은 판정 밖
      const cs = getComputedStyle(el);
      let op = 1;
      for (let e = el; e && e !== document.body; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity || "1");
      const key = el.textContent.trim().slice(0, 40);
      if (op < 0.1 || cs.visibility === "hidden") {
        if (hid.length < 20) hid.push({ text: key, path: el.tagName.toLowerCase() + (el.classList[0] ? "." + el.classList[0] : "") });
      } else if (vis.length < 4000) vis.push(key);
    }
    return { hidden: hid, visibleTexts: vis };
  }).catch(() => ({ hidden: [], visibleTexts: [] }));
  await c.close();
  // baseline(JS-on)은 기준선 수집용 — 판정은 no-JS·reduced-motion 축의 몫.
  // **기준선에서 사용자가 실제로 보던 텍스트가 이 조건에서 사라졌을 때만** 결함이다.
  // 판정 기준은 같은 문자열의 '가시 등장 횟수' 감소다 — 집합 소속만 보면 두 가지가 오탐 난다
  // (aside.com 실측): ⓐ 닫힌 드롭다운은 조건마다 숨김 기제가 다르고(JS-on display:none ↔
  // no-JS opacity:0) ⓑ 같은 라벨의 사본(내비 버튼 ↔ 서랍 버튼)이 문자열 키로 충돌한다.
  const myVisible = countMap(visibleTexts);
  const newlyHidden = baseVisible ? hidden.filter((h) => (baseVisible.get(h.text) ?? 0) > (myVisible.get(h.text) ?? 0)) : hidden;
  if (label !== "baseline" && newlyHidden.length) failures.push({ id: `_${label}`, detail: `${label}에서 비가시 텍스트 ${newlyHidden.length}건(기준선에선 가시) — 예: ${newlyHidden.slice(0, 3).map((h) => `${h.path}"${h.text}"`).join(", ")}` });
  return { hidden: newlyHidden, visibleTexts, mass };
}
function countMap(arr) { const m = new Map(); for (const t of arr) m.set(t, (m.get(t) ?? 0) + 1); return m; }
const base = await visibilityCheck({}, "baseline");
const baseVisible = countMap(base.visibleTexts);
const nojs = await visibilityCheck({ javaScriptEnabled: false }, "no-JS", baseVisible);
const rm = await visibilityCheck({ reducedMotion: "reduce" }, "reduced-motion", baseVisible);
// 총량 비교 — 기준선이 유의미할 때만(초소형 페이지 나눗셈 노이즈 방지), 절반 미만이면 콘텐츠 소실
if (base.mass >= 200 && nojs.mass < 0.5 * base.mass)
  failures.push({ id: "_no-JS", detail: `no-JS 가시 텍스트 ${nojs.mass}자 < JS-on ${base.mass}자의 50% — 콘텐츠가 JS 없이는 그려지지 않는다` });
await browser.close();

const out = { pass: failures.length === 0, declared: items.length, minCount, failures, results, textMass: { js: base.mass, nojs: nojs.mass }, nojsHidden: nojs.hidden, reducedMotionHidden: rm.hidden };
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
