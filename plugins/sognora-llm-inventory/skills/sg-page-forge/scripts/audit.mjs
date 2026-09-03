#!/usr/bin/env node
/**
 * audit.mjs — 무인 러너. 계약을 읽어 페이지마다 scan → detect(type) → conform(tokens 있으면) → copylint → irdiff(lead 있으면) → behavior(engineering 있으면),
 * 교차 1회: sameness · primitives · comp --check. audit.md 한 장으로 보고한다. 미제공 게이트는 통과가 아니라 "판정되지 않음"이다.
 *
 * usage: node audit.mjs            인자 없이 — .sognora/page/contract.json · 계약의 baseUrl · cwd 프로젝트(src/) · .sognora/page/qa 기본값으로 돈다
 *        node audit.mjs --diagnose  기존 사이트 진단 — facts·시안 의무 생략, 화면별 판정과 일 점유율 표만
 *   (내부 옵션 --contract --base --src --project --out --no-shots 는 남아 있지만 문서에 쓰지 않는다 — 스킬은 인자 없이 쓰기 편해야 한다)
 * exit 0 = 🔴 없음 / 1 = 🔴 있음 / 2 = 실행 불가(playwright·계약)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { loadPlaywright, missingPlaywright, parseArgs, SKILL_ROOT } from "./_deps.mjs";
import { scanUrl } from "./scan.mjs";
import { detect, loadSrcFiles, parseExemptions } from "./detect.mjs";
import { lintTokens, conformScan, conformSrc, parseDesignBaseline } from "./conform.mjs";
import { lintCopy, runBilingual } from "./copylint.mjs";
import { diff as irDiff } from "./irdiff.mjs";
import { run as behaviorRun } from "./behavior.mjs";
import { compare as sameness } from "./sameness.mjs";
import { analyzeSrc } from "./primitives.mjs";
import { assess as assessFoundation } from "./foundation.mjs";
import { dirname as _dirname, resolve as _resolve } from "node:path";
import { access as _access } from "node:fs/promises";
/* 프로젝트 루트: --project 또는 src에서 위로 올라가며 package.json을 찾는다 */
async function findProjectRoot(start) { let d = _resolve(start || process.cwd()); for (let i = 0; i < 6; i++) { try { await _access(join(d, "package.json")); return d; } catch { const up = _dirname(d); if (up === d) break; d = up; } } return null; }
import { check as checkContract } from "./contract.mjs";
import { checkComps, slugOf, codexAvailable } from "./comp.mjs";
import { load as loadHistory, check as checkHistory } from "./history.mjs";

const NA = (axis, why) => ({ axis, severity: "미제공", detail: why });

export async function audit({ contract, base = "", src = null, out, diagnose = false, shots = true, pw, project = null }) {
  const report = { collectedAt: new Date().toISOString(), diagnose, pages: [], cross: [], unmeasured: [] };
  const srcFiles = src ? await loadSrcFiles(src) : null;
  let baseline = null; try { baseline = JSON.parse(await readFile(join(SKILL_ROOT, "references", "corpus-baseline.json"), "utf8")); } catch { report.unmeasured.push("corpus-baseline.json 없음 — 코퍼스 임계는 폴백"); }
  let designBase = null; try { designBase = parseDesignBaseline(await readFile(join(SKILL_ROOT, "references", "design-baseline.md"), "utf8")); } catch { /* 없음 */ }
  const exemptions = parseExemptions(await readFile(join(out, "..", "exemptions.md"), "utf8").catch(() => ""));
  const scans = [], types = [];
  for (const p of contract.pages) {
    if (p.skip) continue;
    const url = /^https?:/.test(p.route) ? p.route : (base || contract.baseUrl || "").replace(/\/$/, "") + p.route;
    const slug = slugOf(p.route); const pageOut = join(out, "pages", slug); await mkdir(pageOut, { recursive: true });
    const axes = [];
    let scan;
    try { scan = await scanUrl(pw, { url, out: pageOut, shots }); await writeFile(join(pageOut, "scan.json"), JSON.stringify(scan)); }
    catch (e) { report.pages.push({ route: p.route, type: p.type, url, axes: [{ axis: "scan", severity: "🔴", detail: `열 수 없음: ${String(e.message || e).slice(0, 120)}` }] }); continue; }
    scans.push(scan); types.push(p.type);
    const det = detect(scan, { type: p.type, srcFiles, exemptions, baseline });
    await writeFile(join(pageOut, "findings.json"), JSON.stringify(det, null, 2));
    axes.push({ axis: "detect", severity: det.summary.verdict, detail: `🔴 ${det.summary.red} 🟡 ${det.summary.yellow} 채택 ${det.summary.adopted}${det.summary.standaloneRed.length ? " · 단독 " + det.summary.standaloneRed.join(",") : ""}${det.summary.tastePatterns.length ? " · 취향 패턴 " + det.summary.tastePatterns.length : ""}`, findings: det.findings.filter((f) => f.severity === "🔴" || f.severity === "🟡") });
    /* conform */
    let tokens = null; if (p.tokens) { try { tokens = JSON.parse(await readFile(p.tokens, "utf8")); } catch { axes.push(NA("conform", `tokens.json 읽기 실패: ${p.tokens}`)); } }
    if (tokens || designBase) { const t = tokens || designBase; const cf = [...lintTokens(t), ...conformScan(t, scan), ...(src ? await conformSrc(t, src) : [])]; const red = cf.filter((f) => f.severity === "🔴").length; axes.push({ axis: "conform", severity: red ? "🔴" : cf.length ? "🟡" : "✅", detail: `${tokens ? "프로젝트 tokens.json" : "design-baseline 기준"} · 🔴 ${red} 🟡 ${cf.length - red}`, findings: cf }); }
    else axes.push(NA("conform", "tokens.json도 design-baseline.md도 없음 — 토큰 축 판정되지 않음"));
    /* copylint */
    const genre = p.type === "landing" ? "landing" : "UI"; const cl = lintCopy(scan, genre); const bi = runBilingual(cl.copyText, genre); cl.findings.push({ id: "copy.bilingual-pattern", ...bi });
    axes.push({ axis: "copylint", severity: cl.findings.some((f) => f.severity === "🔴") ? "🔴" : bi.severity === "미제공" ? "🟡" : cl.findings.length > 1 ? "🟡" : "✅", detail: cl.findings.map((f) => `${f.severity} ${f.id}`).join(" · "), findings: cl.findings });
    /* irdiff — lead 해석: ① .json 경로(cwd 기준) → ② 이름이면 .sognora/page/ir/<name>.json → ③ 스킬 배포 IR references/ir/<name>.json → ④ URL이면 미제공(먼저 ir.mjs capture --url) */
    if (p.lead) { let ir = null, cand = null;
      if (/^https?:/.test(p.lead)) axes.push(NA("irdiff", `lead가 URL — 먼저 node ir.mjs all --url ${p.lead} --name <이름> 으로 수집·증류하고 계약 lead에 그 이름을 적는다`));
      else { const cands = /\.json$/.test(p.lead) ? [p.lead] : [join(".sognora", "page", "ir", `${p.lead}.json`), join(SKILL_ROOT, "references", "ir", `${p.lead}.json`)];
        for (const c of cands) { try { ir = JSON.parse(await readFile(c, "utf8")); cand = c; break; } catch { /* 다음 후보 */ } }
        if (!ir) axes.push(NA("irdiff", `IR 없음: ${cands.join(" | ")} — ir.mjs all --url <리드 URL> --name ${p.lead}`)); } if (ir) { const mapping = await readFile(join(out, "..", "mapping.md"), "utf8").catch(() => ""); const d = irDiff(scan, ir, mapping); const red = d.findings.filter((f) => f.severity === "🔴").length; axes.push({ axis: "irdiff", severity: d.findings.some((f) => f.severity === "미제공") ? "미제공" : red ? "🔴" : d.findings.length ? "🟡" : "✅", detail: d.findings.map((f) => `${f.severity} ${f.id}`).join(" · ") || "골격 밴드 안", findings: d.findings }); } }
    else if (p.type === "landing") axes.push(NA("irdiff", "계약에 lead(IR)가 없음 — 골격·깊이·장면 예산 축 판정되지 않음"));
    /* behavior */
    if (p.engineering) { try { const eng = JSON.parse(await readFile(p.engineering, "utf8")); const b = await behaviorRun(pw, url, eng); const red = b.findings.filter((f) => f.severity === "🔴").length; axes.push({ axis: "behavior", severity: red ? "🔴" : b.findings.length ? "🟡" : "✅", detail: b.findings.map((f) => `${f.severity} ${f.id}`).join(" · ") || "선언 동작 실측 통과", findings: b.findings }); } catch (e) { axes.push(NA("behavior", `engineering.json 실패: ${String(e.message || e).slice(0, 80)}`)); } }
    else if (p.type === "landing") axes.push(NA("behavior", "engineering.json 없음 — 정적 페이지 금지 축 판정되지 않음"));
    /* contract must/mustNot — 존재만 */
    const copyAll = Object.values(scan.viewports)[0].copy.map((c) => c.text).join("\n"); const missMust = (p.must || []).filter((m) => m.startsWith("css:") ? false : !new RegExp(m, "i").test(copyAll)); const hitNot = (p.mustNot || []).filter((m) => !m.startsWith("css:") && new RegExp(m, "i").test(copyAll));
    if (missMust.length || hitNot.length) axes.push({ axis: "contract", severity: "🔴", detail: `${missMust.length ? "must 없음: " + missMust.join(", ") : ""} ${hitNot.length ? "mustNot 있음: " + hitNot.join(", ") : ""}`.trim() }); else axes.push({ axis: "contract", severity: "✅", detail: "must/mustNot 존재 확인(잘 만들어졌는가는 시안 대비 판정)" });
    report.pages.push({ route: p.route, type: p.type, url, axes, shots: scan.viewports[Object.keys(scan.viewports)[0]]?.shots?.bands?.length ?? 0 });
  }
  /* 교차 */
  if (scans.length >= 2) { const s = sameness(scans, types); report.cross.push({ axis: "sameness", severity: s.findings.some((f) => f.severity === "🔴") ? "🔴" : s.findings.length ? "🟡" : "✅", detail: `복제 임계 ${(s.thresholds.clone * 100).toFixed(0)}% · 일 점유율 임계 ${(s.thresholds.starved * 100).toFixed(0)}%`, findings: s.findings, pages: s.pages }); }
  else report.cross.push(NA("sameness", "페이지 2장 미만 — 교차 동일성은 판정되지 않음"));
  /* 발판(P0): 기본 스택 층이 빠져 있으면 🔴 — 페이지를 짓기 전에 "먼저 발판을 잡을까요?"를 묻는 단계의 판정자. 사용자가 보류(contract.foundation="deferred")했으면 🟡 — 되묻지 않고 기록으로 남긴다 */
  { const root = await findProjectRoot(project || src); const fd = root ? await assessFoundation(root) : null; const deferred = contract.foundation === "deferred";
    if (fd) report.cross.push({ axis: "foundation", severity: fd.ready ? (fd.soft.length ? "🟡" : "✅") : deferred ? "🟡" : "🔴", detail: fd.ready ? `발판 완비${fd.soft.length ? " · 점진 이행 권장 " + fd.soft.join(", ") : ""}` : `${deferred ? "보류(사용자 결정) — " : ""}빠진 층 ${fd.missing.join(", ")} — node foundation.mjs${deferred ? "" : " (승인 시 --apply)"}`, findings: fd.layers.filter((l) => l.status !== "✅").map((l) => ({ severity: l.status === "❌" && !deferred ? "🔴" : "🟡", id: `foundation.${l.id}`, detail: `${l.found} → ${l.fix}` })) });
    else report.cross.push(NA("foundation", "package.json을 찾지 못함 — 발판 축 판정되지 않음(프로젝트 루트에서 실행)")); }
  /* 반복 금지(history): 계약에 lead·palette·direction이 있을 때만. history.json 없으면 미제공 */
  { const lead = contract.pages.find((p) => p.lead && !/^https?:/.test(p.lead))?.lead || null; const palette = contract.palette || null; const axes = contract.direction || null;
    if (lead || palette || axes) { const h = checkHistory(await loadHistory(), { lead, palette, axes }); const red = h.findings.filter((f) => f.severity === "🔴").length; const na = h.findings.some((f) => f.severity === "미제공");
      report.cross.push({ axis: "history", severity: na ? "미제공" : red ? "🔴" : h.findings.length ? "🟡" : "✅", detail: na ? h.findings[0].detail : h.findings.map((f) => `${f.severity} ${f.id}`).join(" · ") || `최근 ${h.compared.runs}회와 겹치지 않음`, findings: h.findings.filter((f) => f.severity !== "미제공") }); }
    else report.cross.push(NA("history", "계약에 lead·palette·direction 없음 — 반복 금지 축 판정되지 않음")); }
  if (src) { const pr = await analyzeSrc(src); report.cross.push({ axis: "primitives", severity: pr.findings.some((f) => f.severity === "🔴") ? "🔴" : pr.findings.length ? "🟡" : "✅", detail: `파일 ${pr.files} · 공유 ${pr.shared}`, findings: pr.findings }); } else report.cross.push(NA("primitives", "--src 없음 — 컴포넌트 층 축 판정되지 않음"));
  if (!diagnose) { const miss = await checkComps(contract, join(out, "..", "comps")); report.cross.push(miss.length ? (codexAvailable() ? { axis: "comp", severity: "🔴", detail: `시안 없는 페이지: ${miss.join(", ")} — node comp.mjs 로 생성 후 사용자가 고른다` } : NA("comp", `시안 없는 페이지 ${miss.join(", ")} · codex CLI 없음 — 프롬프트(.sognora/page/comps/<slug>.prompt.md)를 다른 생성기에 넣어 PNG를 두면 판정된다`)) : { axis: "comp", severity: "✅", detail: "모든 페이지에 시안 있음" }); }
  const all = [...report.pages.flatMap((p) => p.axes), ...report.cross];
  report.summary = { red: all.filter((a) => a.severity === "🔴").length, yellow: all.filter((a) => a.severity === "🟡").length, na: all.filter((a) => a.severity === "미제공").length, grade: all.some((a) => a.severity === "🔴") ? "C" : all.some((a) => a.severity === "미제공") ? "B(미제공 있음)" : "A-후보(패널 통과 시 A)" };
  return report;
}

export function renderAudit(r) {
  const L = [`# audit — ${r.collectedAt}${r.diagnose ? " (진단)" : ""}`, "", `판정 🔴 ${r.summary.red} · 🟡 ${r.summary.yellow} · 미제공 ${r.summary.na} · 기계 등급 ${r.summary.grade}`, "", "미제공은 통과가 아니다 — 그 축은 판정되지 않았다.", ""];
  for (const p of r.pages) { L.push(`## ${p.route} (${p.type})`, "", "| 축 | 판정 | 요약 |", "|---|---|---|"); for (const a of p.axes) L.push(`| ${a.axis} | ${a.severity} | ${String(a.detail).replace(/\|/g, "\\|")} |`); const fs = p.axes.flatMap((a) => (a.findings || []).filter((f) => f.severity === "🔴" || f.severity === "🟡").map((f) => `- ${f.severity} \`${f.id}\`${f.viewport ? ` [${f.viewport}]` : ""} ${String(f.detail).slice(0, 220)}`)); if (fs.length) L.push("", ...fs); L.push(""); }
  L.push("## 교차", "", "| 축 | 판정 | 요약 |", "|---|---|---|"); for (const c of r.cross) L.push(`| ${c.axis} | ${c.severity} | ${String(c.detail).replace(/\|/g, "\\|")} |`);
  for (const c of r.cross) for (const f of c.findings || []) L.push(`- ${f.severity} \`${f.id}\` ${f.detail}`);
  if (r.cross.find((c) => c.pages)) { L.push("", "| 페이지 | 유형 | 첫 화면 잉크율 | 일 점유율 |", "|---|---|---|---|"); for (const p of r.cross.find((c) => c.pages).pages) L.push(`| ${p.url} | ${p.type || "-"} | ${(p.ink * 100).toFixed(0)}% | ${(p.work * 100).toFixed(0)}% |`); }
  if (r.unmeasured.length) L.push("", "관측 한계: " + r.unmeasured.join(" · "));
  L.push("", "다음: 🔴 해소 → judge-pack.mjs로 시안 대비·패널 브리프 조립 → 신선한 컨텍스트 판정(블라인드).");
  return L.join("\n");
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const contractPath = args.contract || join(".sognora", "page", "contract.json");
  let contract; try { contract = JSON.parse(await readFile(contractPath, "utf8")); } catch { console.error(`계약 없음: ${contractPath} — node contract.mjs 로 발판을 만들고 채운다`); exit(2); }
  const srcDefault = args.src || (await _access("src").then(() => "src").catch(() => null));
  const errs = checkContract(contract, { diagnose: !!args.diagnose }); if (errs.length) { console.error(`🔴 계약 미기입/위반 ${errs.length}건 — 기계는 의도를 지어내지 않는다\n- ${errs.join("\n- ")}`); exit(2); }
  const pw = await loadPlaywright(); if (!pw) { console.error(missingPlaywright()); exit(2); }   // 시작 전에 멈춘다 — 48개 URL 돌고 7분 뒤 "모듈 없음" 사고
  const out = args.out || ".sognora/page/qa"; await mkdir(out, { recursive: true });
  const r = await audit({ contract, base: args.base || "", src: srcDefault, out, diagnose: !!args.diagnose, shots: !args["no-shots"], pw, project: args.project || null });
  await writeFile(join(out, "audit.json"), JSON.stringify(r, null, 2)); const md = renderAudit(r); await writeFile(join(out, "audit.md"), md);
  console.log(md.split("\n").slice(0, 4).join("\n") + `\n→ ${join(out, "audit.md")}`);
  exit(r.summary.red ? 1 : 0);
}
