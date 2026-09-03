#!/usr/bin/env node
/**
 * detect.mjs — scan.json에 규칙 전부를 순수하게 적용한다. 브라우저 없음.
 *
 * usage: node detect.mjs --scan <scan.json> --type <유형>     (audit.mjs가 페이지마다 자동으로 돌린다 — 직접 부를 일은 단일 scan 재판정뿐)
 * 산출: <out>/findings.json · <out>/findings.md · exit 0(🔴 없음) / 1(🔴 있음)
 *
 * 배점: 단일 패턴으로 실패시키지 않는다(Design Slop Cop 1,590 코퍼스에서 46%가 패턴 0~1개). 🔴는
 *   ① 단독 실패 규칙(rules/index STANDALONE_RED — 계측·파손·유형 구조) 또는
 *   ② 취향 계열(color·layout·icon·motion) 🟡·🔴가 합쳐 TASTE_PAGE_RED(4)종 이상일 때만 페이지 🔴로 올린다.   // 인용: '트리거 4개 이상 = heavy slop' + 코퍼스 보정(channel.io 3종)
 * 면제: exemptions.md에 `- <rule.id> — <사유>` 행이 있으면 그 규칙은 "채택된 스타일"로 보고(NON_EXEMPT 제외).
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs, SKILL_ROOT } from "./_deps.mjs";
import { ALL_RULES, STANDALONE_RED, NON_EXEMPT } from "./rules/index.mjs";
import { pickViewports } from "./rules/_util.mjs";

const TASTE_PAGE_RED = 4;   /* 인용: "트리거 4개 이상 = heavy slop"(aitoolpick 30-point checklist·developersdigest) · 코퍼스 보정: channel.io(프리미엄 레퍼런스)가 3종 발동 → 3은 취향 범위 */
const TASTE_AXES = new Set(["color", "layout", "icon", "motion"]);

export async function loadSrcFiles(dir, max = 400) {
  const out = []; const stack = [dir];
  while (stack.length && out.length < max) {
    const d = stack.pop(); let ents = []; try { ents = await readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const p = join(d, e.name); if (e.isDirectory()) stack.push(p); else if (/\.(tsx|jsx|ts|js|vue|svelte|astro|html|css|scss|module\.css)$/.test(e.name)) { try { out.push({ path: p, text: await readFile(p, "utf8") }); } catch { /* skip */ } } }
  }
  return out;
}

export function parseExemptions(md) {
  const map = new Map();
  for (const line of String(md || "").split("\n")) { const m = line.match(/^\s*[-*]\s*`?([a-z]+\.[a-z0-9-]+)`?\s*[—\-:]\s*(.+)$/i); if (m) map.set(m[1], m[2].trim()); }
  return map;
}

/** 순수: scan + ctx → { findings, verdict, summary } */
export function detect(scan, { type = null, srcFiles = null, exemptions = new Map(), baseline = null, readShareMedian = null } = {}) {
  const vps = pickViewports(scan);
  const findings = [];
  for (const vpKey of vps.all) {
    const vp = scan.viewports[vpKey];
    const ctx = { vp, vpKey, type, srcFiles, baseline, readShareMedian, isMobile: vp.width < 800 };
    for (const rule of ALL_RULES) {
      if (rule.id.startsWith("state.") && vpKey !== vps.desktop) continue;   // 소스 규칙은 뷰포트 무관 — 한 번만
      let out = [];
      try { out = rule.run(scan, ctx) || []; } catch (e) { out = [{ id: rule.id, axis: rule.axis, severity: "⚠️", title: rule.title, detail: `규칙 실행 오류: ${e.message}` }]; }
      for (const f of out) {
        f.viewport = vpKey;
        const fid = f.id || rule.id;
        if (exemptions.has(fid) && !NON_EXEMPT.has(fid) && (f.severity === "🔴" || f.severity === "🟡")) { f.severity = "채택"; f.exemption = exemptions.get(fid); }
        findings.push(f);
      }
    }
  }
  const reds = findings.filter((f) => f.severity === "🔴");
  const standalone = reds.filter((f) => STANDALONE_RED.has(f.id));
  const taste = findings.filter((f) => TASTE_AXES.has(f.axis) && (f.severity === "🔴" || f.severity === "🟡"));
  const tasteIds = new Set(taste.map((f) => f.id));
  const pageRed = standalone.length > 0 || tasteIds.size >= TASTE_PAGE_RED;
  const summary = { red: reds.length, yellow: findings.filter((f) => f.severity === "🟡").length, adopted: findings.filter((f) => f.severity === "채택").length, standaloneRed: standalone.map((f) => f.id), tastePatterns: [...tasteIds], verdict: pageRed ? "🔴" : tasteIds.size > 0 || findings.some((f) => f.severity === "🟡") ? "🟡" : "✅" };
  return { findings, summary };
}

export function renderMd(res, scan, type) {
  const lines = [`# detect — ${scan.finalUrl || scan.url}${type ? ` (${type})` : ""}`, "", `판정 ${res.summary.verdict} · 🔴 ${res.summary.red} · 🟡 ${res.summary.yellow} · 채택 ${res.summary.adopted}`, ""];
  if (res.summary.standaloneRed.length) lines.push(`단독 실패: ${res.summary.standaloneRed.join(", ")}`);
  if (res.summary.tastePatterns.length) lines.push(`취향 계열 패턴 ${res.summary.tastePatterns.length}종: ${res.summary.tastePatterns.join(", ")}${res.summary.tastePatterns.length >= TASTE_PAGE_RED ? ` → ${TASTE_PAGE_RED}종 이상 = 슬롭` : ""}`);
  lines.push("", "| 심각도 | 규칙 | 뷰포트 | 관찰 |", "|---|---|---|---|");
  const order = { "🔴": 0, "🟡": 1, "채택": 2, "미제공": 3, "ℹ️": 4, "⚠️": 5 };
  for (const f of [...res.findings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))) lines.push(`| ${f.severity} | \`${f.id}\` | ${f.viewport} | ${String(f.detail).replace(/\|/g, "\\|")}${f.exemption ? ` — 채택 사유: ${f.exemption}` : ""} |`);
  lines.push("", "근거는 rules/*.mjs의 evidence 필드와 wiki/evidence/. 레퍼런스에서도 켜지는 규칙은 슬롭이 아니라 취향을 잰다(references/corpus-baseline.json).");
  return lines.join("\n");
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2));
  if (!args.scan) { console.error("usage: detect.mjs --scan scan.json [--type t] [--src dir] [--exemptions md] [--baseline json] [--out dir]"); exit(2); }
  const scan = JSON.parse(await readFile(args.scan, "utf8"));
  let baseline = null; try { baseline = JSON.parse(await readFile(args.baseline || join(SKILL_ROOT, "references", "corpus-baseline.json"), "utf8")); } catch { /* 기준선 없음 → 폴백 임계 */ }
  const exemptions = args.exemptions ? parseExemptions(await readFile(args.exemptions, "utf8").catch(() => "")) : new Map();
  const srcFiles = args.src ? await loadSrcFiles(args.src) : null;
  const res = detect(scan, { type: args.type || null, srcFiles, exemptions, baseline });
  const out = args.out || ".";
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "findings.json"), JSON.stringify(res, null, 2));
  const md = renderMd(res, scan, args.type); await writeFile(join(out, "findings.md"), md);
  console.log(md.split("\n").slice(0, 6).join("\n"));
  exit(res.summary.verdict === "🔴" ? 1 : 0);
}
