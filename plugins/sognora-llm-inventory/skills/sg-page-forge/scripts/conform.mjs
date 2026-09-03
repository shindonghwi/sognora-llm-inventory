#!/usr/bin/env node
/**
 * conform.mjs — tokens.json이 법전이다. 렌더(scan.json)와 소스 둘 다 어휘 밖 값을 찾는다.
 *
 * usage: node conform.mjs --tokens tokens.json [--scan scan.json] [--src dir] [--expect-hash sha256] [--out dir]
 *   --tokens만: 스키마·어휘 예산 린트(token.budget)
 *   --scan:     렌더 전수 — 색(token.color-outside-set)·font-size(token.size-outside-set)·radius(token.radius-outside-set)·duration(token.duration-outside-set)
 *   --src:      소스 리터럴 — raw hex/rgb·px font-size가 토큰 파일 밖에 있는가(token.source-literal)
 *   --expect-hash: 승인 시점 해시와 대조(빌더가 색을 추가해 합법화하는 최후 수단 차단)
 *
 * tokens.json 스키마(wiki/systems/color.md):
 *   { colors:{ base:[{hex,role:neutral|brand|semantic}], derived:[{name,formula,resolved}], alphaPolicy:"rgb-in-set-alpha-free", budget:{neutral,brand,semantic} },
 *     type:{ viewports:[1440,390], steps:[{name,px:{"1440":16,"390":15}}], families:[{name,role,hangul:true}] },
 *     radius:[0,8,16], motion:{ durationsMs:[160], easings:["cubic-bezier(.2,0,0,1)"] }, skipSelectors:[], tokenFiles:["src/styles/tokens.css"] }
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs, SKILL_ROOT } from "./_deps.mjs";
import { parseRgb, hex, pxOf } from "./rules/_util.mjs";

const BUDGET = { neutral: 6, brand: 2, semantic: 2, durations: 2, easings: 1 };   // 인용: 어휘 예산(wiki/systems/color.md — 중립≤6·브랜드≤2·시맨틱≤2·duration≤2·easing≤1)

export function lintTokens(t) {
  const out = [];
  const base = t?.colors?.base || [];
  if (!Array.isArray(base) || base.length < 3) out.push({ id: "token.budget", severity: "🔴", detail: `colors.base ${base.length}개 — 4~6색에 이름·역할이 있어야 한다` });
  for (const role of ["neutral", "brand", "semantic"]) { const n = base.filter((c) => c.role === role).length; const cap = t?.colors?.budget?.[role] ?? BUDGET[role]; if (n > cap) out.push({ id: "token.budget", severity: "🔴", detail: `${role} ${n} > 예산 ${cap}` }); }
  if ((t?.motion?.durationsMs || []).length > BUDGET.durations) out.push({ id: "token.budget", severity: "🔴", detail: `duration ${t.motion.durationsMs.length} > ${BUDGET.durations}` });
  if ((t?.motion?.easings || []).length > BUDGET.easings) out.push({ id: "token.budget", severity: "🔴", detail: `easing ${t.motion.easings.length} > ${BUDGET.easings}` });
  const famsRaw = t?.type?.families || [];
  /* families는 두 형식을 받는다: [{name, hangul}] 배열 | {display:[...], text:[...], numeral:[...]} 역할 맵(design-baseline.md). 한글 대응은 hangul:true 또는 알려진 한글 서체명으로 판정 */
  const HANGUL_FONTS = /pretendard|suit|wanted sans|noto (sans|serif) kr|ibm plex sans kr|apple sd gothic|malgun|nanum|gowun|hahmlet|maruburi|마루부리|이롭게|ridibatang|리디바탕|spoqa|gothic a1|black han sans/i;
  const famList = Array.isArray(famsRaw) ? famsRaw.map((f) => (typeof f === "string" ? { name: f } : f)) : Object.entries(famsRaw).map(([role, stack]) => ({ role, name: Array.isArray(stack) ? stack.join(", ") : String(stack) }));
  if (!famList.some((f) => f.hangul || HANGUL_FONTS.test(f.name || ""))) out.push({ id: "token.hangul-family", severity: "🔴", detail: "type.families에 한글 대응 서체가 없다(hangul:true 또는 Pretendard·SUIT·Noto Sans KR 같은 한글 서체명)" });
  const heavy = (t?.type?.steps || []).filter((s) => Number(s.weight) > 600);
  if (heavy.length) out.push({ id: "token.heavy-weight", severity: "🟡", detail: `굵기 600 초과 단계 ${heavy.map((s) => s.name).join(",")} — 방향이 명시 채택할 때만(exemptions.md)` });
  return out;
}

export function tokenSets(t) {
  const colors = new Set(); for (const c of [...(t.colors?.base || []), ...(t.colors?.derived || []).map((d) => ({ hex: d.resolved }))]) { const p = parseRgb(c.hex) || (c.hex?.startsWith("#") ? hexToRgb(c.hex) : null); if (p) colors.add(`${p.r},${p.g},${p.b}`); }
  colors.add("255,255,255"); colors.add("0,0,0");   // 정의: 흰·검은 alpha 변형 허용(alphaPolicy rgb-in-set-alpha-free)
  const sizes = new Map(); for (const s of t.type?.steps || []) for (const [vpw, px] of Object.entries(s.px || {})) { if (!sizes.has(vpw)) sizes.set(vpw, new Set()); sizes.get(vpw).add(Math.round(px * 10) / 10); }
  const radii = t.radius ? new Set(t.radius.map(Number)) : null;
  const durs = t.motion?.durationsMs ? new Set(t.motion.durationsMs.map(Number)) : null;
  return { colors, sizes, radii, durs, skip: new RegExp((t.skipSelectors || []).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "(?!)") };
}
function hexToRgb(h) { const m = h.replace("#", ""); const s = m.length === 3 ? m.split("").map((c) => c + c).join("") : m; if (s.length < 6) return null; return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a: 1 }; }

export function conformScan(t, scan) {
  const sets = tokenSets(t); const out = [];
  for (const [vpKey, vp] of Object.entries(scan.viewports)) {
    const vpw = String(vp.width); const sizeSet = sets.sizes.get(vpw) || [...sets.sizes.values()][0];
    const badColor = new Map(), badSize = new Map(), badRadius = new Map(), badDur = new Map();
    for (const n of vp.nodes) {
      if (!n.visible) continue;
      if (n.attrs?.cls && sets.skip.test(n.attrs.cls)) continue;
      for (const c of [n.cs.color, n.cs.bg]) { const p = parseRgb(c); if (p && p.a > 0 && !sets.colors.has(`${p.r},${p.g},${p.b}`)) badColor.set(hex(p), (badColor.get(hex(p)) || 0) + 1); }
      if (n.textLen > 0 && sizeSet && ![...sizeSet].some((s) => Math.abs(s - n.cs.fs) < 0.6)) badSize.set(n.cs.fs, (badSize.get(n.cs.fs) || 0) + 1);
      if (sets.radii) { const r = pxOf(n.cs.radius); if (r !== null && r > 0 && r < 500 && !sets.radii.has(Math.round(r))) badRadius.set(r, (badRadius.get(r) || 0) + 1); }
      if (sets.durs) { const d = n.cs.tr.split(" ").pop(); const ms = /ms$/.test(d) ? parseFloat(d) : /s$/.test(d) ? parseFloat(d) * 1000 : 0; if (ms > 0 && !sets.durs.has(Math.round(ms))) badDur.set(ms, (badDur.get(ms) || 0) + 1); }
    }
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`).join(" ");
    if (badColor.size) out.push({ id: "token.color-outside-set", severity: "🔴", viewport: vpKey, detail: `토큰 밖 색 ${badColor.size}종: ${top(badColor)} — 리드 색 잔존이면 lead.residue` });
    if (badSize.size) out.push({ id: "token.size-outside-set", severity: "🔴", viewport: vpKey, detail: `스케일 밖 font-size ${badSize.size}종: ${top(badSize)}` });
    if (badRadius.size) out.push({ id: "token.radius-outside-set", severity: "🟡", viewport: vpKey, detail: `사다리 밖 radius ${badRadius.size}종: ${top(badRadius)}` });
    if (badDur.size) out.push({ id: "token.duration-outside-set", severity: "🟡", viewport: vpKey, detail: `어휘 밖 duration ${badDur.size}종: ${top(badDur)}` });
  }
  return out;
}

/** shadcn 기본 테마가 손 안 댄 채로 남았는가(소스). 근거: 사장님 프로젝트 3개(template·puanai·company) globals.css가 글자 하나 안 다르게 같음(2026-09-03 실측) + avoid-ai-design/no-slop-ui/anti-ai-slop 셋이 P0 */
export function shadcnDefault(cssText) {
  const hits = [];
  if (/--background\s*:\s*0 0% 100%/.test(cssText)) hits.push("--background 0 0% 100%");
  if (/--foreground\s*:\s*0 0% (13|3\.9)%/.test(cssText)) hits.push("--foreground 기본");
  if (/--muted\s*:\s*0 0% 96(\.1)?%/.test(cssText)) hits.push("--muted 기본");
  if (/--border\s*:\s*0 0% (88|89\.8)%/.test(cssText)) hits.push("--border 기본");
  const radius = /--radius\s*:\s*(0\.5rem|8px)/.test(cssText);
  const font = /font-family\s*:\s*(["']?(Inter|Geist)["']?|system-ui)\s*[,;]?\s*(sans-serif)?\s*;/i.test(cssText);
  return { hits, radius, font, verdict: hits.length >= 3 && radius && font };   // 정의: 변수 3개 이상 + radius 기본 + 기본 서체 단독
}

/** references/design-baseline.md의 ```json 펜스를 tokens.json 형식으로 읽는다(프로젝트 DESIGN.md·tokens.json이 없을 때의 기준) */
export function parseDesignBaseline(md) {
  const m = String(md).match(/```json\s*([\s\S]*?)```/); if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export async function conformSrc(t, dir) {
  const tokenFiles = new Set((t.tokenFiles || []).map((f) => f.replace(/^\.\//, "")));
  const out = []; const stack = [dir]; const hits = [];
  while (stack.length) {
    const d = stack.pop(); let ents = []; try { ents = await readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const p = join(d, e.name); if (e.isDirectory()) { stack.push(p); continue; } if (!/\.(css|scss|tsx|jsx|vue|svelte|html)$/.test(e.name)) continue; if ([...tokenFiles].some((tf) => p.endsWith(tf))) continue;
      const text = await readFile(p, "utf8").catch(() => "");
      const colors = (text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g) || []).filter((c) => !/^#(fff|000|ffffff|000000)$/i.test(c)).length;
      const sizes = (text.match(/font-size\s*:\s*\d+(\.\d+)?px/g) || []).length;
      if (colors || sizes) hits.push({ path: p, colors, sizes }); }
  }
  for (const h of hits.concat()) { /* no-op: hits는 리터럴 집계 */ }
  const cssAll = []; const st2 = [dir];
  while (st2.length) { const d = st2.pop(); let ents = []; try { ents = await readdir(d, { withFileTypes: true }); } catch { continue; } for (const e of ents) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const p = join(d, e.name); if (e.isDirectory()) st2.push(p); else if (/\.(css|scss)$/.test(e.name)) cssAll.push(await readFile(p, "utf8").catch(() => "")); } }
  const sd = shadcnDefault(cssAll.join("\n"));
  if (sd.verdict) out.push({ id: "token.shadcn-default", severity: "🔴", detail: `shadcn 기본 테마 그대로: ${sd.hits.join(", ")} + --radius 기본 + 기본 서체 단독 — 프로젝트 3개가 글자 하나 안 다른 같은 파일이었다(실측). 팔레트·radius·서체를 이 제품 것으로` });
  else if (sd.hits.length >= 3) out.push({ id: "token.shadcn-default", severity: "🟡", detail: `shadcn 기본 변수 ${sd.hits.length}개 잔존: ${sd.hits.join(", ")}` });
  const c = hits.reduce((s, h) => s + h.colors, 0), s = hits.reduce((x, h) => x + h.sizes, 0);
  if (c || s) out.push({ id: "token.source-literal", severity: "🔴", detail: `토큰 파일 밖 raw 색 ${c}·px font-size ${s} (${hits.length}파일) — 예: ${hits[0].path}` });
  return out;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2));
  let raw = null, t = null, source = args.tokens;
  if (args.tokens) { raw = await readFile(args.tokens, "utf8"); t = JSON.parse(raw); }
  else { const bp = args.baseline || join(SKILL_ROOT, "references", "design-baseline.md"); const md = await readFile(bp, "utf8").catch(() => null); t = md ? parseDesignBaseline(md) : null; raw = t ? JSON.stringify(t) : null; source = `${bp} (기준선 — 프로젝트 tokens.json 없음)`; }
  if (!t) { console.error("usage: conform.mjs --tokens tokens.json [--scan scan.json] [--src dir] [--expect-hash sha] [--out dir]  (tokens 없으면 --baseline design-baseline.md)"); exit(2); }
  const findings = lintTokens(t);
  const h = createHash("sha256").update(raw).digest("hex");
  if (args["expect-hash"] && args["expect-hash"] !== h) findings.push({ id: "token.hash-mismatch", severity: "🔴", detail: `tokens.json 해시 불일치 — 승인 ${args["expect-hash"].slice(0, 12)} vs 현재 ${h.slice(0, 12)}` });
  if (args.scan) findings.push(...conformScan(t, JSON.parse(await readFile(args.scan, "utf8"))));
  if (args.src) findings.push(...await conformSrc(t, args.src));
  const red = findings.filter((f) => f.severity === "🔴").length;
  const md = [`# conform — ${source} (sha256 ${h.slice(0, 12)})`, "", `🔴 ${red} · 🟡 ${findings.length - red}`, "", ...findings.map((f) => `- ${f.severity} \`${f.id}\`${f.viewport ? ` [${f.viewport}]` : ""} ${f.detail}`)].join("\n");
  if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "conform.json"), JSON.stringify({ hash: h, findings }, null, 2)); await writeFile(join(args.out, "conform.md"), md); }
  console.log(md);
  exit(red ? 1 : 0);
}
