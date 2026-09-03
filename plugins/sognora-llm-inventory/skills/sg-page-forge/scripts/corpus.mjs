#!/usr/bin/env node
/**
 * corpus.mjs — 규칙을 판정하는 자. 프리미엄 레퍼런스(references/corpus.json)에 scan→detect를 돌려 규칙별 발동률을 기록한다.
 * "AI 티 검출기가 프리미엄 레퍼런스에서 발동하면 그것은 슬롭이 아니라 취향을 잰다." 과반 발동 규칙은 삭제 후보로 표기한다.
 *
 * usage: node corpus.mjs --run [--limit N] [--concurrency 2]      라이브 URL을 스캔해 references/corpus-baseline.json 갱신(스캔 캐시는 홈)
 *        node corpus.mjs --report                                  기준선만 읽어 규칙별 판정 출력
 * corpus.json: { sites:[{ name, url, type }] } — references/library/*.md의 리드 URL(현재 11). corpus-exclude.json의 이름은 스캔하지 않는다.
 * baseline: { collectedAt, corpusSize, measured, excluded:{name:사유}, sites:{name:{ok,error?}}, rules:{ id:{ fired, of, rate, threshold?, deleteCandidate } } }
 *   threshold: 연속값 규칙(type.heavy-weight-share)은 코퍼스 분포의 최대값을 임계로 기록한다 — 레퍼런스가 쓰는 만큼은 취향이다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { loadPlaywright, missingPlaywright, parseArgs, forgeHome, SKILL_ROOT } from "./_deps.mjs";
import { scanUrl } from "./scan.mjs";
import { detect } from "./detect.mjs";
import { ALL_RULES } from "./rules/index.mjs";
import { pickViewports, visibleText, textArea } from "./rules/_util.mjs";

const MAJORITY = 0.5;   // 정의: 과반 발동 = 삭제 후보(forge-rules §1d 원칙)

export function summarize(perSite) {
  const ok = perSite.filter((s) => s.ok); const rules = {};
  for (const r of ALL_RULES) {
    const fired = ok.filter((s) => s.findings.some((f) => f.id === r.id && (f.severity === "🔴" || f.severity === "🟡"))).length;
    rules[r.id] = { fired, of: ok.length, rate: ok.length ? +(fired / ok.length).toFixed(2) : null, corpus: r.corpus || "", deleteCandidate: r.corpus === "exempt" ? false : (ok.length ? fired / ok.length > MAJORITY : false) };   /* exempt: 살아있음·접근성 축은 취향이 아니라 결함 — 레퍼런스가 어겨도 규칙은 남는다 */
  }
  /* 연속값 임계: 굵기 700+ 면적 비율 — 레퍼런스 분포 최대값 */
  const heavy = ok.map((s) => s.metrics?.heavyShare).filter((v) => typeof v === "number");
  if (heavy.length) rules["type.heavy-weight-share"].threshold = +Math.max(...heavy).toFixed(3);
  return rules;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const basePath = join(SKILL_ROOT, "references", "corpus-baseline.json");
  if (args.report) { const b = JSON.parse(await readFile(basePath, "utf8")); console.log(`기준선 ${b.collectedAt} · 측정 ${Object.values(b.sites).filter((s) => s.ok).length}/${Object.keys(b.sites).length} · 제외 ${Object.keys(b.excluded || {}).length}`); for (const [id, r] of Object.entries(b.rules)) console.log(`${r.deleteCandidate ? "🗑" : " "} ${id.padEnd(30)} ${r.fired}/${r.of}${r.threshold !== undefined ? ` th=${r.threshold}` : ""}`); exit(0); }
  if (!args.run) { console.error("usage: corpus.mjs --run [--limit N] | --report"); exit(2); }
  const corpus = JSON.parse(await readFile(join(SKILL_ROOT, "references", "corpus.json"), "utf8"));
  /* 제외 목록: 차단 페이지·장르 표본은 "레퍼런스는 정의상 슬롭이 아니다"가 성립하지 않는다 — 스캔하지 않고 baseline.excluded에 사유와 함께 기록 */
  let excluded = {}; try { excluded = JSON.parse(await readFile(join(SKILL_ROOT, "references", "corpus-exclude.json"), "utf8")).exclude || {}; } catch { /* 없음 */ }
  const pw = await loadPlaywright(); if (!pw) { console.error(missingPlaywright()); exit(2); }
  const eligible = corpus.sites.filter((s) => !excluded[s.name]);
  for (const s of corpus.sites) if (excluded[s.name]) console.log(`– ${s.name}: 제외(${excluded[s.name]})`);
  const sites = eligible.slice(0, args.limit ? Number(args.limit) : undefined); const perSite = [];
  for (const site of sites) {
    const dir = join(forgeHome(), "corpus", site.name); await mkdir(dir, { recursive: true });
    try {
      let scan; try { scan = JSON.parse(await readFile(join(dir, "scan.json"), "utf8")); } catch { scan = await scanUrl(pw, { url: site.url, out: dir, shots: false, settle: 1200 }); await writeFile(join(dir, "scan.json"), JSON.stringify(scan)); }
      const res = detect(scan, { type: site.type || "landing" });
      const { desktop } = pickViewports(scan); const vp = scan.viewports[desktop]; const txt = visibleText(vp); const heavyShare = txt.length ? textArea(txt.filter((n) => n.cs.fw >= 700)) / Math.max(1, textArea(txt)) : null;
      perSite.push({ name: site.name, ok: true, findings: res.findings, metrics: { heavyShare } });
      console.log(`✓ ${site.name}: 🔴 ${res.summary.red} 🟡 ${res.summary.yellow} heavy ${heavyShare?.toFixed(2)}`);
    } catch (e) { perSite.push({ name: site.name, ok: false, error: String(e.message || e).slice(0, 120) }); console.log(`✗ ${site.name}: ${String(e.message || e).slice(0, 80)}`); }
  }
  const baseline = { collectedAt: new Date().toISOString(), corpusSize: corpus.sites.length, measured: perSite.filter((s) => s.ok).length, excluded: Object.fromEntries(Object.entries(excluded).filter(([n]) => corpus.sites.some((s) => s.name === n))), sites: Object.fromEntries(perSite.map((s) => [s.name, { ok: s.ok, error: s.error }])), rules: summarize(perSite) };
  await writeFile(basePath, JSON.stringify(baseline, null, 2));
  const del = Object.entries(baseline.rules).filter(([, r]) => r.deleteCandidate).map(([id, r]) => `${id}(${r.fired}/${r.of})`);
  console.log(`기준선 → ${basePath} · 삭제 후보 ${del.length}: ${del.join(", ") || "없음"}`);
}
