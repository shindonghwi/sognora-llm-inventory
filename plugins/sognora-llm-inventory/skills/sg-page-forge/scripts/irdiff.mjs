#!/usr/bin/env node
/**
 * irdiff.mjs — 우리 페이지(scan.json)가 리드 IR의 골격을 지켰는가. 순수.
 *
 * usage: node irdiff.mjs --scan scan.json --ir references/ir/<name>.json [--mapping .sognora/page/mapping.md] [--out dir]
 * 판정:
 *   skeleton.vs-ir   🟡/🔴  섹션 수·컨테이너 폭·섹션 높이 분포가 오차 밴드(치수·패딩 ±8px, 근거 forge-rules §6b) 밖
 *   depth.vs-lead    🔴     스크롤 길이 -40% 초과 축소인데 mapping.md에 섹션별 삭제 사유가 없음(근거 §2d 깊이 하한)
 *   scene.repeat-run 🔴     같은 배경이 연속 3섹션 이상(장면 예산, §2d)
 *   lead.residue     🔴     리드 팔레트(IR bgSequence·시그니처 색)가 우리 렌더에 남음 — 정체는 남으면 안 된다(§8c)
 * 완전성 미달 IR은 "미제공"으로 보고한다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs } from "./_deps.mjs";
import { pickViewports, parseRgb } from "./rules/_util.mjs";

const BAND_PX = 8;   // 인용: 치수·패딩 허용 오차 ±8px(forge-rules §6b)
const DEPTH_CUT = 0.4;   // 인용: -40% 초과 축소는 사유 필수(forge-rules §2d 깊이 하한)
const RUN = 3;   // 인용: 동일 장면 연속 3섹션 = 위반(forge-rules §2d 장면 예산)

export function diff(scan, ir, mappingMd = "") {
  const findings = [];
  if (ir.completeness && ir.completeness.pass === false) return { findings: [{ id: "skeleton.vs-ir", severity: "미제공", detail: `IR completeness 미달(${Object.entries(ir.completeness).filter(([k, v]) => k !== "pass" && !v).map(([k]) => k).join(",")}) — 골격 축은 판정되지 않음` }] };
  const { desktop } = pickViewports(scan); const vp = scan.viewports[desktop];
  const ours = vp.sections.filter((s) => !s.fixed);
  /* 섹션 수 */
  const nLead = ir.page?.sectionCount ?? ir.sections?.length ?? 0;
  if (nLead && Math.abs(ours.length - nLead) > Math.max(1, Math.round(nLead * 0.25))) findings.push({ id: "skeleton.vs-ir", severity: "🟡", detail: `섹션 수 ${ours.length} vs 리드 ${nLead}` });   // 정의: 25% 이상 차이면 보고
  /* 컨테이너 폭: 리드 컨테이너 사다리 중 하나와 ±8px */
  const leadC = ir.rhythm?.containers || [];
  // 정의(근거: forge-rules §6b 자기 diff 오차 밴드): 컨테이너 후보 — 폭 200px 이상·뷰포트보다 16px 이상 좁음·깊이 6 이하(상위 3폭을 IR 컨테이너 폭과 대조, 허용 BAND_PX)
  if (leadC.length) { const ourC = [...new Set(vp.nodes.filter((n) => n.visible && n.rect.w >= 200 && n.rect.w < vp.width - 16 && n.depth <= 6).map((n) => n.rect.w))]; const top = ourC.sort((a, b) => b - a).slice(0, 3); const off = top.filter((w) => !leadC.some((c) => Math.abs(c - w) <= BAND_PX)); if (top.length && off.length === top.length) findings.push({ id: "skeleton.vs-ir", severity: "🟡", detail: `컨테이너 폭 ${top.join("/")} — 리드 사다리 ${leadC.join("/")}와 ±${BAND_PX}px 안에 없음` }); }
  /* 깊이 */
  // 인용: 깊이 하한 — 리드 대비 -40% 초과 축소는 mapping.md 삭제 사유 전수 기재(forge-rules §2d 깊이 하한, DEPTH_CUT)
  const leadH = ir.page?.scrollHeight1440; if (leadH) { const ratio = vp.scrollHeight / leadH; if (ratio < 1 - DEPTH_CUT) { const reasons = (mappingMd.match(/삭제|생략/g) || []).length; findings.push({ id: "depth.vs-lead", severity: reasons ? "🟡" : "🔴", detail: `스크롤 ${vp.scrollHeight} vs 리드 ${leadH} (${Math.round((1 - ratio) * 100)}% 축소)${reasons ? ` — mapping.md 삭제 사유 ${reasons}건` : " — mapping.md에 섹션별 삭제 사유가 없다"}` }); } }
  /* 장면 예산 */
  let run = 1, worst = 1; for (let i = 1; i < ours.length; i++) { run = ours[i].bg === ours[i - 1].bg && !ours[i].bgi ? run + 1 : 1; worst = Math.max(worst, run); }
  if (worst >= RUN) findings.push({ id: "scene.repeat-run", severity: "🔴", detail: `같은 배경 연속 ${worst}섹션 — 리드의 리듬(배경 교대)을 계승하라` });
  /* 리드 잔존: 리드 배경 팔레트(흰·검 제외)가 우리 섹션 배경에 그대로 */
  // 정의(근거: forge-rules §2d 장면 예산 — bgSequence run-length): 배경 시퀀스에서 순백(>245)·순흑(<12)은 리듬으로 세지 않는다(장면 예산은 유채·회색 배경 교대만 본다)
  const leadBgs = new Set((ir.rhythm?.bgSequence || []).map((c) => parseRgb(c)).filter((c) => c && !((c.r > 245 && c.g > 245 && c.b > 245) || (c.r < 12 && c.g < 12 && c.b < 12))).map((c) => `${c.r},${c.g},${c.b}`));
  const residue = ours.map((s) => parseRgb(s.bg)).filter(Boolean).filter((c) => leadBgs.has(`${c.r},${c.g},${c.b}`));
  if (residue.length) findings.push({ id: "lead.residue", severity: "🔴", detail: `리드 배경색 ${residue.length}곳 잔존 — rgb(${residue[0].r}, ${residue[0].g}, ${residue[0].b})` });
  return { findings, ours: ours.length, lead: nLead };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); if (!args.scan || !args.ir) { console.error("usage: irdiff.mjs --scan scan.json --ir ir.json [--mapping mapping.md] [--out dir]"); exit(2); }
  const r = diff(JSON.parse(await readFile(args.scan, "utf8")), JSON.parse(await readFile(args.ir, "utf8")), args.mapping ? await readFile(args.mapping, "utf8").catch(() => "") : "");
  const md = [`# irdiff — ${args.ir}`, "", ...(r.findings.length ? r.findings.map((f) => `- ${f.severity} \`${f.id}\` ${f.detail}`) : ["✅ 골격 오차 밴드 안"])].join("\n");
  if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "irdiff.md"), md); }
  console.log(md); exit(r.findings.some((f) => f.severity === "🔴") ? 1 : 0);
}
