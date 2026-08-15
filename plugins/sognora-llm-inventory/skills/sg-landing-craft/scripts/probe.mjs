#!/usr/bin/env node
/**
 * 인터랙션 프로브 — 레퍼런스(또는 자기 페이지)의 "움직임 언어"를 관찰해 기록한다.
 * detect.mjs가 정지 화면의 수치를 재면, probe.mjs는 호버·스크롤·모션의 동작을 잰다.
 *
 * node probe.mjs --url <URL> --out <dir> [--max-hover 14] [--headed]
 *
 * 산출: <out>/interactions.json
 *  - hoverDiffs: 인터랙티브 요소별 호버 전후 computed 스타일 변화(변한 속성만)
 *  - scrollReveals: 정지 시 숨김(opacity/transform) → 스크롤 후 등장한 요소 수와 표본
 *  - motionLanguage: transition-duration·easing 분포 (모션 언어의 일관성 판독용)
 *  - sticky: fixed/sticky 요소 목록 (내비 거동)
 *  - media: video/canvas/iframe 존재와 자동재생 여부
 *
 * exit 0 성공 / 1 실패 / 2 실행 불가
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) {
  console.error("usage: probe.mjs --url <URL> --out <dir> [--max-hover 14]");
  exit(2);
}
const pw = await load("playwright");
if (!pw) { missing(["playwright"]); exit(2); }
await mkdir(args.out, { recursive: true });

const maxHover = Number(args["max-hover"] ?? 14);
const browser = await pw.chromium.launch({ headless: !args.headed });
// 주의: reducedMotion을 켜지 않는다 — 모션을 관찰하는 게 목적이다
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(args.url, { waitUntil: "networkidle", timeout: 60000 });
} catch (e) {
  console.error(`goto 실패: ${e.message}`);
  await browser.close();
  exit(1);
}
await page.waitForTimeout(800);

// ---- 1) 정지 상태에서 숨김 후보 기록 (스크롤 리빌 탐지의 before) ----
const HIDDEN_PROPS = ["opacity", "transform", "visibility"];
const restHidden = await page.evaluate(() => {
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (++i > 4000 || out.length >= 200) break;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const cs = getComputedStyle(el);
    const op = parseFloat(cs.opacity);
    const tr = cs.transform;
    if ((op < 0.99 || (tr !== "none" && !tr.startsWith("matrix(1, 0, 0, 1"))) && (el.innerText || "").trim().length > 4) {
      el.setAttribute("data-probe-id", String(out.length));
      out.push({ id: out.length, text: (el.innerText || "").trim().slice(0, 40), opacity: op, transform: tr.slice(0, 60) });
    }
  }
  return out;
});

// ---- 2) 스크롤 통과 후 같은 요소 재측정 → 리빌 패턴 ----
await page.evaluate(async () => {
  const h = document.body.scrollHeight;
  for (let y = 0; y <= h; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 160)); }
});
await page.waitForTimeout(600);
const afterScroll = await page.evaluate(() =>
  [...document.querySelectorAll("[data-probe-id]")].map((el) => ({
    id: Number(el.getAttribute("data-probe-id")),
    opacity: parseFloat(getComputedStyle(el).opacity),
    transform: getComputedStyle(el).transform.slice(0, 60),
  }))
);
const revealed = restHidden.filter((b) => {
  const a = afterScroll.find((x) => x.id === b.id);
  return a && b.opacity < 0.99 && a.opacity >= 0.99;
});

// ---- 3) 모션 언어: transition 분포 ----
const motion = await page.evaluate(() => {
  const durations = {}, easings = {}, props = {};
  let i = 0;
  for (const el of document.querySelectorAll("a, button, [role=button], [class*=card], [class*=item], input, select")) {
    if (++i > 600) break;
    const cs = getComputedStyle(el);
    if (cs.transitionDuration && cs.transitionDuration !== "0s") {
      // 쉼표 분리 시 괄호 안(cubic-bezier 인자)은 건너뛴다 — 파편 카운트 방지
      const splitTop = (s) => s.split(/,(?![^(]*\))/).map((x) => x.trim());
      for (const d of splitTop(cs.transitionDuration)) durations[d] = (durations[d] ?? 0) + 1;
      for (const e of splitTop(cs.transitionTimingFunction)) easings[e.slice(0, 48)] = (easings[e.slice(0, 48)] ?? 0) + 1;
      for (const p of splitTop(cs.transitionProperty)) props[p] = (props[p] ?? 0) + 1;
    }
  }
  const top = (o, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  return { durations: top(durations), easings: top(easings), properties: top(props, 8), transitionAll: props["all"] ?? 0 };
});

// ---- 4) 호버 diff — 보이는 인터랙티브 요소 표본 ----
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
const HOVER_PROPS = ["color", "backgroundColor", "borderColor", "boxShadow", "transform", "opacity", "textDecorationLine", "outlineWidth", "filter"];
const targets = await page.evaluate((max) => {
  const seen = new Set();
  const out = [];
  for (const el of document.querySelectorAll("a, button, [role=button], [class*=card]")) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 14 || r.top < 0 || r.top > 2400) continue;
    const key = el.className + "|" + el.tagName;
    if (seen.has(key)) continue; // 같은 클래스는 1개만 (반복 표본 낭비 방지)
    seen.add(key);
    el.setAttribute("data-probe-hover", String(out.length));
    out.push({ idx: out.length, label: ((el.innerText || el.getAttribute("aria-label") || el.tagName).trim()).slice(0, 30), cls: String(el.className).slice(0, 60) });
    if (out.length >= max) break;
  }
  return out;
}, maxHover);

const hoverDiffs = [];
for (const t of targets) {
  const sel = `[data-probe-hover="${t.idx}"]`;
  const before = await page.evaluate(({ sel, props }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs[p]]));
  }, { sel, props: HOVER_PROPS });
  if (!before) continue;
  await page.hover(sel, { timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(280);
  const after = await page.evaluate(({ sel, props }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs[p]]));
  }, { sel, props: HOVER_PROPS });
  await page.mouse.move(4, 4);
  if (!after) continue;
  const changed = {};
  for (const p of HOVER_PROPS) if (before[p] !== after[p]) changed[p] = [String(before[p]).slice(0, 60), String(after[p]).slice(0, 60)];
  hoverDiffs.push({ label: t.label, cls: t.cls, changed, dead: Object.keys(changed).length === 0 });
}

// ---- 5) 고정 요소·미디어 ----
const env = await page.evaluate(() => {
  const sticky = [];
  let i = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (++i > 3000 || sticky.length >= 8) break;
    const cs = getComputedStyle(el);
    if ((cs.position === "fixed" || cs.position === "sticky") && el.getBoundingClientRect().height > 20)
      sticky.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), pos: cs.position });
  }
  return {
    sticky,
    media: {
      video: [...document.querySelectorAll("video")].map((v) => ({ autoplay: v.autoplay, loop: v.loop, muted: v.muted })),
      canvas: document.querySelectorAll("canvas").length,
      iframe: document.querySelectorAll("iframe").length,
    },
    cursorPointer: document.querySelectorAll('[style*="cursor: pointer"]').length,
  };
});

await browser.close();

const result = {
  meta: { url: args.url, probedAt: new Date().toISOString() },
  hoverDiffs,
  hoverDead: hoverDiffs.filter((h) => h.dead).map((h) => h.label),
  scrollReveals: { hiddenAtRest: restHidden.length, revealedAfterScroll: revealed.length, samples: revealed.slice(0, 8).map((r) => r.text) },
  motionLanguage: motion,
  sticky: env.sticky,
  media: env.media,
};
await writeFile(join(args.out, "interactions.json"), JSON.stringify(result, null, 2));
console.log(
  `probe 완료: 호버 표본 ${hoverDiffs.length}개(무반응 ${result.hoverDead.length}) · 리빌 ${revealed.length}/${restHidden.length} · ` +
  `duration 상위 ${motion.durations.map(([d, n]) => `${d}×${n}`).join(", ") || "없음"} → ${join(args.out, "interactions.json")}`
);
exit(0);

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
