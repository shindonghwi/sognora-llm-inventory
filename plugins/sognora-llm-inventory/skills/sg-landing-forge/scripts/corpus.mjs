#!/usr/bin/env node
/**
 * corpus.mjs — **AI 티 규칙 자체를 판정한다.**
 *
 * 왜 있나 — `detect.mjs`의 규칙 대부분은 상수로 발동한다("글래스 3곳 이상", "폰트 사이즈
 * 고유값 9개 이상"). 그 숫자의 근거는 스킬 저자였고, 그래서 프로젝트가 바뀌면 틀린다.
 *
 * 같은 목적의 공개 스킬을 조사해보니 판정 기준이 전부 **스킬 밖**에 있었다 —
 * goal PNG(colbymchenry/frontend-audit-skill), Nielsen 휴리스틱(mistyhx/frontend-design-audit),
 * HTTP Archive 백분위(Lighthouse: 25퍼센타일=50점·8퍼센타일=90점). 기준이 밖에 있으면
 * 임계가 자의적일 수 없다.
 *
 * **이 스킬은 이미 코퍼스를 갖고 있었다** — `references/bundles/`에 Apple·Linear·Stripe·
 * Toss·Notion 등 프리미엄 레퍼런스 18종이 실측된 채로 있는데, `detect.mjs`는 그걸 안 보고
 * 상수를 쓴다. 코퍼스를 두고 취향을 쓴 것이다.
 *
 * 판정 원리 — **"AI 티" 검출기가 프리미엄 레퍼런스에서 발동하면 그건 AI 티가 아니다.**
 * 임계가 필요 없는 판정이다. 레퍼런스는 정의상 슬롭이 아니므로, 거기서 켜지는 규칙은
 * 슬롭이 아니라 **그 저자의 취향**을 재고 있는 것이다.
 *
 * 실측 예고(IR만 봐도 드러난다): `CP3`는 "글래스모피즘 3곳 이상"에서 🔴인데,
 * 코퍼스의 glassNodes는 meshy 84 · netflix 4 · linear 3 · omneky 3이다 — 규칙이
 * 프리미엄 레퍼런스 4종을 슬롭으로 신고한다.
 *
 * usage:
 *   node corpus.mjs --run [--only linear-app,stripe-com] [--out references/corpus-baseline.json]
 *   node corpus.mjs --report            # 기준선을 읽어 규칙별 판정만 출력
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { argv, exit } from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = join(here, "..");
const BUNDLES = join(SKILL, "references", "bundles");
const args = parseArgs(argv.slice(2));
const OUT = String(args.out ?? join(SKILL, "references", "corpus-baseline.json"));

if (args.report) { await report(JSON.parse(await readFile(OUT, "utf8"))); exit(0); }
if (!args.run) {
  console.error("usage: corpus.mjs --run [--only <이름,이름>] [--out <파일>]\n       corpus.mjs --report");
  exit(2);
}

// ── 코퍼스 목록 — 번들의 meta.json이 원본 URL을 들고 있다 ────────────────
const only = args.only ? String(args.only).split(",").map((s) => s.trim()) : null;
// 장르 표본·차단 페이지는 코퍼스가 아니다 — "레퍼런스는 정의상 슬롭이 아니다"는
// 품질 기준 레퍼런스에만 성립한다. 목록은 커밋되는 파일에 둔다(번들은 gitignore).
let excluded = {};
try { excluded = JSON.parse(await readFile(join(SKILL, "references", "corpus-exclude.json"), "utf8")).exclude ?? {}; } catch { /* 없으면 전량 */ }
const refs = [];
for (const name of (await readdir(BUNDLES)).sort()) {
  if (only && !only.includes(name)) continue;
  if (excluded[name]) { process.stderr.write(`⏭  ${name} — 코퍼스 제외: ${excluded[name]}\n`); continue; }
  try {
    const meta = JSON.parse(await readFile(join(BUNDLES, name, "meta.json"), "utf8"));
    if (meta.url) refs.push({ name, url: meta.url });
  } catch { /* meta 없는 번들은 건너뛴다 */ }
}
if (!refs.length) { console.error(`🔴 코퍼스가 비었다 — ${BUNDLES}`); exit(2); }
console.error(`코퍼스 ${refs.length}종에 detect를 돌린다 (레퍼런스는 정의상 슬롭이 아니다)\n`);

const tmp = join(SKILL, ".corpus-tmp");
await mkdir(tmp, { recursive: true });

const runs = [];
for (const r of refs) {
  const out = join(tmp, r.name);
  const { code } = await run([join(here, "detect.mjs"), "--url", r.url, "--out", out, "--viewports", "1440x900"]);
  let tells = [];
  try { tells = JSON.parse(await readFile(join(out, "scan.json"), "utf8")).tells ?? []; }
  catch { /* 수집 실패 — 아래에서 ok:false로 기록한다 */ }
  const ok = code === 0 || tells.length > 0;
  runs.push({ ...r, ok, tells });
  process.stderr.write(`${ok ? "✅" : "⚠️ "} ${r.name.padEnd(16)} tells ${String(tells.length).padStart(3)}  ${r.url}\n`);
}

// ── 규칙별 집계 ──────────────────────────────────────────────────────────
const usable = runs.filter((r) => r.ok);
const byRule = new Map();
for (const r of usable) {
  for (const t of r.tells) {
    if (!byRule.has(t.rule)) byRule.set(t.rule, { rule: t.rule, sev: t.sev, sites: new Set(), samples: [] });
    const e = byRule.get(t.rule);
    e.sites.add(r.name);
    if (e.samples.length < 4) e.samples.push(`${r.name}: ${t.evidence}`);
  }
}
const baseline = {
  $comment: "AI 티 규칙을 프리미엄 레퍼런스 코퍼스로 판정한 결과. 레퍼런스에서 발동하는 규칙은 슬롭이 아니라 취향을 재고 있다.",
  corpus: usable.map((r) => r.name),
  corpusSize: usable.length,
  skipped: runs.filter((r) => !r.ok).map((r) => r.name),
  rules: [...byRule.values()]
    .map((e) => ({ rule: e.rule, sev: e.sev, firedOn: e.sites.size, sites: [...e.sites].sort(), samples: e.samples }))
    .sort((a, b) => b.firedOn - a.firedOn),
};
await writeFile(OUT, JSON.stringify(baseline, null, 2) + "\n");
console.error(`\n기준선 → ${OUT}`);
await report(baseline);
exit(0);

// ── 보고 ─────────────────────────────────────────────────────────────────
async function report(b) {
  const n = b.corpusSize;
  console.log(`# AI 티 규칙 판정 — 프리미엄 레퍼런스 ${n}종 대비\n`);
  console.log(`> 원리: **레퍼런스는 정의상 슬롭이 아니다.** 거기서 켜지는 규칙은 슬롭이 아니라 취향을 잰다.`);
  if (b.skipped?.length) console.log(`> 수집 실패로 제외: ${b.skipped.join(", ")}\n`);
  console.log(`\n| 규칙 | 심각도 | 레퍼런스 발동 | 판정 |`);
  console.log(`|---|---|---|---|`);
  for (const r of b.rules) {
    const ratio = r.firedOn / n;
    const verdict = ratio > 0.5 ? "🔴 **규칙 아님 — 삭제/재정의**" : ratio > 0 ? "🟡 취향 혐의 — 근거 필요" : "✅ 유효";
    console.log(`| \`${r.rule}\` | ${r.sev} | ${r.firedOn}/${n} | ${verdict} |`);
  }
  const dead = b.rules.filter((r) => r.firedOn / n > 0.5);
  if (dead.length) {
    console.log(`\n## 🔴 삭제/재정의 대상 ${dead.length}건 — 프리미엄 레퍼런스 과반에서 발동한다\n`);
    for (const r of dead) {
      console.log(`### \`${r.rule}\` — ${r.firedOn}/${n} (${r.sites.slice(0, 6).join(", ")}${r.sites.length > 6 ? " …" : ""})`);
      for (const s of r.samples) console.log(`  · ${s}`);
      console.log("");
    }
  }
  const clean = b.rules.filter((r) => r.firedOn === 0).length;
  console.log(`\n**코퍼스에서 한 번도 안 켜진 규칙: ${clean}건** — 이것만이 "AI 티"를 잰다고 말할 수 있다.`);
  console.log(`> 코퍼스에 없는 규칙(집계에 안 나온 것)은 이 판정의 대상이 아니다 — 발동 사례가 0이라 측정되지 않았다.`);
}

function run(a) {
  return new Promise((res) => {
    const ch = spawn(process.execPath, a, { env: process.env });
    let out = "";
    ch.stdout.on("data", (d) => (out += d));
    ch.stderr.on("data", (d) => (out += d));
    ch.on("close", (code) => res({ code, out }));
  });
}
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
