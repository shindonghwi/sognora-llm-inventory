#!/usr/bin/env node
/**
 * contract.mjs — 의도의 자리. `.sognora/page/contract.json`을 만들고 검증한다. 되묻기는 계약이 없을 때 한 번뿐이다.
 *
 * usage: node contract.mjs               인자 없이 — .sognora/page/contract.json이 없으면 발판 생성(TODO 채움), 있으면 검증(exit 0 통과 / 1 미기입·스키마 위반)
 *   (내부 옵션 --init --check --routes --diagnose 는 남아 있지만 문서에 쓰지 않는다)
 *
 * 스키마 v2:
 *   { version:2, locale:"ko", assets:"mixed|real|generated", center:"중심 장면 한 문장(랜딩 있을 때 의무)", foundation?:"deferred"(발판 보류 — 사용자 결정, audit 교차 축 🟡),
 *     direction?:{ typo,color,layout,density,decor,motion,signature }(7축 — history 대조), palette?:"#hex"(베이스 팔레트 — history 대조),
 *     pages:[{ route, type, decision, facts:[...], must:[...], mustNot:[...], lead?, comp?, tokens?, engineering?, skip? }] }
 *   type ∈ landing|about|document|catalog|tool|pricing|form|dashboard | read:<라벨> | do:<라벨>
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs } from "./_deps.mjs";
import { TYPES } from "./rules/structure.mjs";

export const CONTRACT_VERSION = 2;
export const TYPE_RE = new RegExp(`^(${TYPES.join("|")}|read:[^\\s]{1,40}|do:[^\\s]{1,40})$`);
const isTodo = (v) => v === undefined || v === null || v === "" || (typeof v === "string" && /^TODO\b/i.test(v)) || (Array.isArray(v) && v.some((x) => typeof x === "string" && /^TODO\b/i.test(x)));

export function scaffold(routes) {
  return { version: CONTRACT_VERSION, locale: "ko", assets: "mixed", center: "TODO 중심 장면 — 히어로가 팔 결과 장면 한 문장(랜딩이 있을 때 의무)",
    pages: routes.map((r) => ({ route: r, type: "TODO landing|about|document|catalog|tool|pricing|form|dashboard|read:<라벨>|do:<라벨>", decision: "TODO 이 화면이 돕는 결정 한 문장", facts: ["TODO 실제로 들어갈 것 — 항목·수치·상태·컨트롤(제품에서 전수 추출)"], must: [], mustNot: [], lead: null, comp: null, tokens: null, engineering: null })) };
}

export function check(c, { diagnose = false } = {}) {
  const errs = [];
  if (!c || typeof c !== "object") return ["JSON 객체가 아니다"];
  if (!Array.isArray(c.pages) || !c.pages.length) errs.push("pages[]가 비었다");
  const hasLanding = (c.pages || []).some((p) => p.type === "landing");
  if (hasLanding && isTodo(c.center)) errs.push("center(중심 장면)가 미기입 — 랜딩이 있으면 의무");
  const routes = new Set();
  for (const [i, p] of (c.pages || []).entries()) {
    const tag = `pages[${i}] ${p.route || "?"}`;
    if (!p.route || !p.route.startsWith("/")) errs.push(`${tag}: route는 /로 시작`);
    if (routes.has(p.route)) errs.push(`${tag}: route 중복`); routes.add(p.route);
    if (p.skip) continue;
    if (isTodo(p.type)) errs.push(`${tag}: type 미기입`); else if (!TYPE_RE.test(p.type)) errs.push(`${tag}: type "${p.type}"는 목록에 없다 — 오타면 고치고, 새 화면이면 read:<라벨>/do:<라벨>로 선언`);
    if (isTodo(p.decision)) errs.push(`${tag}: decision 미기입`);
    if (!diagnose && (!Array.isArray(p.facts) || !p.facts.length || isTodo(p.facts))) errs.push(`${tag}: facts 미기입 — 무엇이 들어가는지 모르는 화면은 빈 틀이 된다(진단 --diagnose는 면제)`);
    for (const k of ["must", "mustNot"]) if (p[k] !== undefined && !Array.isArray(p[k])) errs.push(`${tag}: ${k}는 배열`);
  }
  if (c.foundation !== undefined && c.foundation !== "deferred") errs.push(`foundation은 "deferred"만 허용(빠진 층을 사용자가 보류했다는 기록) — 값 "${c.foundation}"`);
  return errs;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const DEFAULT = join(".sognora", "page", "contract.json");
  if (!args.init && !args.check) { try { await access(DEFAULT); args.check = DEFAULT; } catch { args.init = DEFAULT; } }
  if (args.init) { const routes = (args.routes || "/").split(",").map((s) => s.trim()).filter(Boolean); await mkdir(dirname(args.init), { recursive: true }); await writeFile(args.init, JSON.stringify(scaffold(routes), null, 2)); console.log(`발판 → ${args.init} (${routes.length}페이지). TODO를 채운 뒤 --check`); exit(0); }
  if (args.check) { const c = JSON.parse(await readFile(args.check, "utf8")); const errs = check(c, { diagnose: !!args.diagnose }); if (errs.length) { console.error(`🔴 contract ${errs.length}건\n- ${errs.join("\n- ")}`); exit(1); } console.log(`✅ contract ${c.pages.length}페이지 · locale ${c.locale}`); exit(0); }
  console.error("usage: contract.mjs   (인자 없이: 계약이 없으면 발판 생성, 있으면 검증)"); exit(2);
}
