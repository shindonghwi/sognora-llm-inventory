#!/usr/bin/env node
/**
 * sameness.mjs — 페이지들끼리 서로 같은가(한 장씩 보면 절대 안 보이는 축). 여러 scan.json을 순수하게 비교한다.
 *
 * usage: node sameness.mjs --scans a/scan.json,b/scan.json,... --types landing,catalog,... [--out dir]
 * 판정(wiki/types·page-rules §0d·§0f):
 *   sameness.cross-type-clone 🔴  다른 유형 쌍의 골격 지문 자카드가 기준 이상
 *   sameness.same-opening    🔴  하는 화면이 읽는 화면과 첫 3역할을 똑같이 연다
 *   sameness.flat-density    🟡  유형 간 첫 화면 잉크율 차이가 같은 유형 안 차이를 넘지 못함
 *   sameness.untyped-clone   🟡  유형 미선언 쌍이 닮음
 *   work.starved / work.unmeasured  하는 화면의 일 점유율(자 = 읽는 화면 본문 점유율 중앙값, 폴백 25%, 엄격해지는 방향으로만)
 * 임계는 절대값이 아니다 — 그 프로젝트의 같은 유형 쌍(같아도 되는 쌍)의 **최고치**를 자로 쓴다(최저치는 쌍봉 분포라 뜻이 없다 — v1.6.8 정정). 폴백 60%(실측: 같은 렌더러 문서 4종 100% · 진짜 다른 유형 0~25%, 그 사이가 비어 있다).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs } from "./_deps.mjs";
import { pickViewports } from "./rules/_util.mjs";
import { workOf, verbOf } from "./rules/structure.mjs";

const FALLBACK_CLONE = 0.6;   // 폴백: 실측 사다리(같은 틀 100% ↔ 다른 유형 0~25%) 사이
const FALLBACK_STARVED = 0.25;   // 폴백 하한(page-rules §0f 실측: 23%와 59% 사이가 비어 있다)

/** 골격 지문: 섹션 순서대로 (태그·헤딩 유무·반복/입력 버킷) — 개수는 버킷으로 뭉갠다(h2 8개와 9개는 같은 모양) */
export function skeleton(vp) {
  const bucket = (n) => (n === 0 ? "0" : n <= 2 ? "s" : n <= 6 ? "m" : "l");
  return vp.sections.filter((s) => !s.fixed).map((s) => {
    const kids = vp.nodes.filter((n) => n.rect.y >= s.y && n.rect.y < s.y + s.h && n.visible);
    const inputs = kids.filter((n) => /^(input|textarea|select)$/.test(n.tag)).length;
    const imgs = kids.filter((n) => n.tag === "img").length;
    const repeats = kids.filter((n) => n.tag === "li" || n.tag === "article" || n.tag === "tr").length;
    return `${s.tag}:${s.headingTag || "-"}:${bucket(repeats)}:${bucket(inputs)}:${bucket(imgs)}:${s.textLen > 400 ? "T" : s.textLen > 80 ? "t" : "-"}`;
  });
}
export function jaccard(a, b) { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); }
export function opening(vp) { return skeleton(vp).slice(0, 3).map((s) => s.split(":").slice(0, 2).join(":")).join("|"); }
export function inkShare(vp) { return Math.min(1, vp.copy.reduce((s, c) => { const r = vp.nodes[c.i].rect; return r.y < vp.height && r.y + r.h > 0 ? s + r.w * (Math.min(vp.height, r.y + r.h) - Math.max(0, r.y)) : s; }, 0) / (vp.width * vp.height)); }

export function compare(scans, types) {
  const pages = scans.map((scan, k) => { const { desktop } = pickViewports(scan); const vp = scan.viewports[desktop]; return { url: scan.finalUrl || scan.url, type: types[k] || null, verb: verbOf(types[k]), sk: skeleton(vp), open: opening(vp), ink: inkShare(vp), work: workOf(vp, types[k]) }; });
  const findings = [];
  const sameTypePairs = [], crossPairs = [];
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) { const a = pages[i], b = pages[j]; const s = jaccard(a.sk, b.sk); const shared = a.sk.filter((x) => b.sk.includes(x)).length; const row = { a, b, s, shared }; if (a.type && b.type && a.type === b.type) sameTypePairs.push(row); else if (a.type && b.type) crossPairs.push(row); else findings.push(...(s >= FALLBACK_CLONE && shared ? [{ id: "sameness.untyped-clone", severity: "🟡", detail: `${a.url} ↔ ${b.url} 골격 ${(s * 100).toFixed(0)}% (유형 미선언)` }] : [])); }
  const sameMax = sameTypePairs.length ? Math.max(...sameTypePairs.map((r) => r.s)) : null;
  const cloneTh = Math.min(sameMax ?? FALLBACK_CLONE, FALLBACK_CLONE);   // 자가 보정: 엄격해지는 방향으로만(같은 유형이 전부 100%인 프로젝트에서 바가 올라가지 않게)
  for (const r of crossPairs) if (r.shared && r.s >= cloneTh) findings.push({ id: "sameness.cross-type-clone", severity: "🔴", detail: `${r.a.type}(${r.a.url}) ↔ ${r.b.type}(${r.b.url}) 골격 ${(r.s * 100).toFixed(0)}% ≥ ${(cloneTh * 100).toFixed(0)}%(${sameMax !== null ? "같은 유형 쌍 최고치" : "폴백"})` });
  const readers = pages.filter((p) => p.verb === "read"), doers = pages.filter((p) => p.verb === "do");
  for (const d of doers) for (const r of readers) if (d.open && d.open === r.open) { findings.push({ id: "sameness.same-opening", severity: "🔴", detail: `${d.type}(${d.url})가 ${r.type}(${r.url})와 같은 첫 3역할로 연다: ${d.open}` }); break; }
  if (readers.length && doers.length) {
    const spread = (arr) => arr.length > 1 ? Math.max(...arr) - Math.min(...arr) : 0;
    const within = Math.max(spread(readers.map((p) => p.ink)), spread(doers.map((p) => p.ink)));
    const between = Math.abs(readers.reduce((s, p) => s + p.ink, 0) / readers.length - doers.reduce((s, p) => s + p.ink, 0) / doers.length);
    if (between < within) findings.push({ id: "sameness.flat-density", severity: "🟡", detail: `유형 간 첫 화면 잉크율 차 ${(between * 100).toFixed(0)}% < 유형 안 차 ${(within * 100).toFixed(0)}% — 밀도가 유형을 구별하지 못한다` });
  }
  const readMed = readers.length ? readers.map((p) => p.ink).sort((a, b) => a - b)[Math.floor(readers.length / 2)] : null;
  const starvedTh = Math.max(FALLBACK_STARVED, readMed ?? 0);
  for (const d of doers) {
    if (!d.work.measured) { findings.push({ id: "work.unmeasured", severity: "🟡", detail: `${d.type}(${d.url}) 일 요소 미분류 — 없다는 뜻이 아니다` }); continue; }
    if (d.work.share < starvedTh) findings.push({ id: "work.starved", severity: "🔴", detail: `${d.type}(${d.url}) 일 점유율 ${(d.work.share * 100).toFixed(0)}% < ${(starvedTh * 100).toFixed(0)}%(${readMed !== null ? "읽는 화면 자" : "폴백"}) — ${d.ink > d.work.share ? "소개문을 걷어내라" : "실체를 넣어라"}` });
  }
  return { pages: pages.map((p) => ({ url: p.url, type: p.type, ink: +p.ink.toFixed(3), work: +p.work.share.toFixed(3), sections: p.sk.length })), thresholds: { clone: cloneTh, starved: starvedTh, readShareMedian: readMed }, findings };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); if (!args.scans) { console.error("usage: sameness.mjs --scans a.json,b.json --types t1,t2 [--out dir]"); exit(2); }
  const scans = await Promise.all(args.scans.split(",").map(async (p) => JSON.parse(await readFile(p, "utf8"))));
  const types = (args.types || "").split(",").map((t) => t.trim() || null);
  const r = compare(scans, types);
  const md = [`# sameness — ${scans.length}장`, "", "| 페이지 | 유형 | 첫 화면 잉크율 | 일 점유율 | 섹션 |", "|---|---|---|---|---|", ...r.pages.map((p) => `| ${p.url} | ${p.type || "-"} | ${(p.ink * 100).toFixed(0)}% | ${(p.work * 100).toFixed(0)}% | ${p.sections} |`), "", `임계: 복제 ${(r.thresholds.clone * 100).toFixed(0)}% · 일 점유율 ${(r.thresholds.starved * 100).toFixed(0)}%`, "", ...(r.findings.length ? r.findings.map((f) => `- ${f.severity} \`${f.id}\` ${f.detail}`) : ["✅ 교차 결함 없음(같은 유형끼리 닮은 것은 정상)"])].join("\n");
  if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "sameness.md"), md); await writeFile(join(args.out, "sameness.json"), JSON.stringify(r, null, 2)); }
  console.log(md); exit(r.findings.some((f) => f.severity === "🔴") ? 1 : 0);
}
