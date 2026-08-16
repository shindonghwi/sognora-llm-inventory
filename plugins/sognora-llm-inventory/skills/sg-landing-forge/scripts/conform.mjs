/**
 * conform.mjs — 토큰 준수 게이트 (2단 방어)
 *
 * 1차(소스 린트):  conform.mjs --tokens <tokens.json> --lint <dir>
 *   토큰 파일 밖의 raw 색 리터럴(#hex, rgb/hsl, color-mix)과 var() 없는 font-size를 즉시 실패로.
 *   빌더의 "손번역 이탈"을 렌더 전에 잡는 싼 방어선.
 *
 * 2차(렌더 검증): conform.mjs --tokens <tokens.json> --url <URL> [--out <dir>] [--expect-hash <sha256>]
 *   고정 뷰포트(기본 1440/390)에서 전 요소의 computed 색·폰트·radius·duration을 수집해
 *   토큰 집합 밖 값을 위반 목록으로. 통과선은 위반 0.
 *
 * 판정 정책 (하브루타 합의):
 * - alpha 정책 "rgb-in-set-alpha-free": computed 색의 (r,g,b)가 토큰 집합 ∪ {#fff,#000}에
 *   있으면 alpha는 자유 — 유리·스크림·글로우는 토큰의 alpha 변형으로 합법.
 * - derived: tokens.json에 AD가 이름+공식+resolved를 선언한 값만 추가 허용.
 * - 그라데이션은 stop만 검사(중간 보간값은 computed에 노출되지 않음).
 * - 검사 속성은 고정 목록. svg 내부·img·canvas·iframe·video·폼 내장은 제외.
 * - skipSelectors는 tokens.json에만 존재(AD 소유) — 빌더 자기 면제 차단.
 * - 어휘 예산: base 색 역할별 상한(neutral 6·brand 2·semantic 2), duration ≤2, easing ≤1.
 *   tokens.json 자체가 예산을 넘으면 페이지를 보기 전에 실패한다.
 * - --expect-hash: AD 승인 시점의 tokens.json sha256 대조(빌더 변조 방지).
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, extname, relative } from "node:path";
import { argv, exit } from "node:process";
import { load } from "./_deps.mjs";
import { parseColor } from "./rules-lib.mjs";

const args = parseArgs(argv.slice(2));
if (!args.tokens || (!args.lint && !args.url)) {
  console.error("usage: conform.mjs --tokens <tokens.json> (--lint <dir> | --url <URL>) [--out <dir>] [--expect-hash <sha256>]");
  exit(2);
}

const tokensRaw = await readFile(args.tokens, "utf8");
const T = JSON.parse(tokensRaw);
const violations = [];

// ── tokens.json 자체 검증: 해시 + 어휘 예산 ──────────────────────────────
if (args["expect-hash"]) {
  const h = createHash("sha256").update(tokensRaw).digest("hex");
  if (h !== args["expect-hash"]) violations.push({ kind: "tamper", value: h, detail: "tokens.json이 AD 승인본과 다르다(변조 또는 미승인 수정)" });
}
const BUDGET = { neutral: 6, brand: 2, semantic: 2, ...(T.colors?.budget ?? {}) };
const baseEntries = (T.colors?.base ?? []).map((c) => (typeof c === "string" ? { hex: c, role: "neutral" } : c));
for (const role of Object.keys(BUDGET)) {
  const n = baseEntries.filter((c) => (c.role ?? "neutral") === role).length;
  if (n > BUDGET[role]) violations.push({ kind: "budget", value: `${role}=${n}`, detail: `어휘 예산 초과(상한 ${BUDGET[role]}) — 게이트가 난립을 합법화하지 않게 토큰 자체를 줄여라` });
}
if ((T.motion?.durationsMs ?? []).length > 2) violations.push({ kind: "budget", value: `durations=${T.motion.durationsMs.length}`, detail: "duration 토큰 ≤2" });
if ((T.motion?.easings ?? []).length > 1) violations.push({ kind: "budget", value: `easings=${T.motion.easings.length}`, detail: "easing 토큰 ≤1" });

// 허용 rgb 집합: base ∪ derived.resolved ∪ 흰/검
const allowedRgb = new Set(["255,255,255", "0,0,0"]);
for (const c of baseEntries) { const p = parseColor(c.hex); if (p) allowedRgb.add(`${p.r},${p.g},${p.b}`); }
for (const d of T.colors?.derived ?? []) { const p = parseColor(d.resolved); if (p) allowedRgb.add(`${p.r},${p.g},${p.b}`); }
const alphaFree = (T.colors?.alphaPolicy ?? "rgb-in-set-alpha-free") === "rgb-in-set-alpha-free";
const derivedExact = new Set((T.colors?.derived ?? []).map((d) => normColor(d.resolved)));

function colorOk(str) {
  const p = parseColor(str);
  if (!p) return true; // 파싱 불가(none·currentcolor 등)는 판정 밖
  if (p.a === 0) return true;
  const key = `${p.r},${p.g},${p.b}`;
  if (allowedRgb.has(key)) return alphaFree || p.a === 1 || derivedExact.has(normColor(str));
  return false;
}
function normColor(s) { const p = parseColor(s); return p ? `${p.r},${p.g},${p.b},${p.a}` : String(s); }

// ── 1차: 소스 린트 ────────────────────────────────────────────────────────
if (args.lint) {
  const exts = new Set((args.ext ?? "css,scss,tsx,jsx,ts,js,html,vue,svelte").split(",").map((e) => "." + e.trim()));
  const skipDirs = new Set(["node_modules", ".next", "dist", "build", ".git", "out"]);
  const tokenFiles = (T.tokenFiles ?? []).map((f) => f.replace(/\\/g, "/"));
  const files = [];
  await walk(args.lint);
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skipDirs.has(e.name)) await walk(join(dir, e.name)); continue; }
      if (exts.has(extname(e.name))) files.push(join(dir, e.name));
    }
  }
  const colorLit = /(#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|\bcolor-mix\([^)]*\))/g;
  for (const f of files) {
    const rel = relative(args.lint, f).replace(/\\/g, "/");
    if (tokenFiles.some((tf) => rel.endsWith(tf) || tf.endsWith(rel))) continue;
    const lines = (await readFile(f, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return; // 주석 행
      for (const m of line.matchAll(colorLit)) {
        if (m[0].includes("var(")) continue; // rgba(var(--x), .5) 등은 토큰 경유
        violations.push({ kind: "lint-color", value: m[0], detail: `${rel}:${i + 1} — raw 색 리터럴은 토큰 파일에서만` });
      }
      if (/font-size\s*:/.test(line) && !/var\(/.test(line) && /\d/.test(line.split(/font-size\s*:/)[1] ?? "")) {
        violations.push({ kind: "lint-font", value: line.trim().slice(0, 60), detail: `${rel}:${i + 1} — font-size는 토큰 var()만` });
      }
    });
  }
  report("lint");
}

// ── 2차: 렌더 검증 ────────────────────────────────────────────────────────
if (args.url) {
  const pw = await load("playwright");
  if (!pw) { console.error("playwright 미설치 — 사용자 프로젝트에 설치 필요"); exit(2); }
  const viewports = (T.type?.viewports ?? [1440, 390]).map((w) => ({ width: w, height: w > 800 ? 900 : 844 }));
  const browser = await pw.chromium.launch({ headless: true });
  for (const vp of viewports) {
    const page = await (await browser.newContext({ viewport: vp })).newPage();
    await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    // 전체 스크롤(지연 로드·리빌 트리거) 후 수집
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    const samples = await page.evaluate((skips) => {
      const out = [];
      const skipEls = new Set();
      for (const sel of skips) try { document.querySelectorAll(sel).forEach((e) => { skipEls.add(e); e.querySelectorAll("*").forEach((c) => skipEls.add(c)); }); } catch {}
      const path = (el) => {
        const bits = [];
        for (let e = el, i = 0; e && e.tagName && i < 3; e = e.parentElement, i++)
          bits.unshift(e.tagName.toLowerCase() + (e.classList[0] ? "." + e.classList[0] : ""));
        return bits.join(">");
      };
      for (const el of document.querySelectorAll("body *")) {
        if (skipEls.has(el)) continue;
        const tag = el.tagName.toLowerCase();
        if (["img", "canvas", "iframe", "video", "svg", "source", "track", "select", "option", "input", "textarea", "script", "style", "noscript"].includes(tag)) continue;
        if (el.closest("svg")) continue;
        if (!el.getClientRects().length) continue;
        const cs = getComputedStyle(el);
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        out.push({
          p: path(el), hasText,
          color: hasText ? cs.color : null,
          bg: cs.backgroundColor,
          borders: [...new Set([cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].filter((c, i) => parseFloat([cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth][i]) > 0))],
          shadow: cs.boxShadow !== "none" ? cs.boxShadow : null,
          bgImage: cs.backgroundImage.includes("gradient") ? cs.backgroundImage : null,
          fontSize: hasText ? parseFloat(cs.fontSize) : null,
          radius: cs.borderRadius !== "0px" && (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== "none") ? cs.borderRadius : null,
          durs: [cs.transitionDuration, cs.animationDuration].filter((d) => d && d !== "0s").join(","),
        });
      }
      return out;
    }, T.skipSelectors ?? []);
    const seen = new Map(); // value+prop → {count, example}
    const flag = (prop, value, p) => {
      const k = `${prop}|${value}`;
      const cur = seen.get(k) ?? { kind: "render", prop, value, viewport: vp.width, count: 0, example: p };
      cur.count++; seen.set(k, cur);
    };
    const steps = (T.type?.steps ?? []).map((s) => (typeof s.px === "object" ? s.px[String(vp.width)] : s.px)).filter((v) => v != null);
    const radii = T.radius; // 미선언(undefined) = 미관할, [] = 0·full 외 전부 금지
    const durs = T.motion?.durationsMs ?? [];
    for (const s of samples) {
      if (s.color && !colorOk(s.color)) flag("color", s.color, s.p);
      if (s.bg && !colorOk(s.bg)) flag("background", s.bg, s.p);
      for (const b of s.borders) if (!colorOk(b)) flag("border", b, s.p);
      for (const src of [s.shadow, s.bgImage]) if (src)
        for (const m of src.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/g)) if (!colorOk(m[0])) flag(s.shadow === src ? "shadow" : "gradient-stop", m[0], s.p);
      if (s.fontSize != null && steps.length && !steps.some((px) => Math.abs(px - s.fontSize) <= 0.5)) flag("font-size", `${s.fontSize}px`, s.p);
      if (s.radius && radii) for (const part of s.radius.split(/[\s/]+/)) {
        const v = parseFloat(part);
        if (Number.isNaN(v)) continue;
        const full = part.includes("%") ? v === 50 : v >= 999;
        if (!(v === 0 || full || radii.some((r) => Math.abs(r - v) <= 0.5))) flag("radius", s.radius, s.p);
      }
      if (s.durs && durs.length) for (const d of s.durs.split(",")) {
        const ms = parseDur(d.trim());
        if (ms != null && ms !== 0 && !durs.some((t) => Math.abs(t - ms) <= 1)) flag("duration", d.trim(), s.p);
      }
    }
    violations.push(...seen.values());
    await page.context().close();
  }
  await browser.close();
  report("render");
}

function parseDur(s) { const m = /^([\d.]+)(m?s)$/.exec(s); return m ? +m[1] * (m[2] === "s" ? 1000 : 1) : null; }

async function report(mode) {
  const out = { mode, tokens: args.tokens, pass: violations.length === 0, violationCount: violations.length, violations };
  if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, `conform-${mode}.json`), JSON.stringify(out, null, 2)); }
  if (violations.length) {
    console.error(`✖ conform(${mode}) 위반 ${violations.length}건 — 통과선은 0`);
    for (const v of violations.slice(0, 40))
      console.error(`  [${v.kind}${v.prop ? ":" + v.prop : ""}] ${v.value}${v.count ? ` ×${v.count}` : ""} — ${v.detail ?? v.example ?? ""}${v.viewport ? ` @${v.viewport}` : ""}`);
    if (violations.length > 40) console.error(`  … 외 ${violations.length - 40}건(--out JSON 참조)`);
    exit(1);
  }
  console.log(`✔ conform(${mode}) 통과 — 토큰 집합 밖 값 0`);
  exit(0);
}

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
