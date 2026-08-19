/**
 * audit.mjs — P6 기계 배터리 + P7 패널 준비를 한 명령으로 (e2e 판정 러너)
 *
 * usage:
 *   audit.mjs --url <URL> --out <dir>
 *             [--tokens <tokens.json>] [--engineering <engineering.json>]
 *             [--ir <리드 ir.json>] [--lint <소스 디렉터리>] [--exemptions <exemptions.md>]
 *
 * 왜 있나: 게이트가 스크립트 5개로 흩어져 있으면 실행 에이전트가 일부만 돌리고 "통과"를 선언한다.
 * 이 러너는 배터리 전체를 돌리고 **누락 게이트를 미제공으로 명시**한 판정표를 남긴다 —
 * 스킬 규칙("모든 의무에 판정자")의 실행 형태다.
 *
 * 산출: <out>/audit.md(사람용 판정표) · <out>/audit.json(기계용) · <out>/shots-1440|390/(패널 입력 캡처)
 * 종료 코드: 0=전 게이트 통과, 1=실패 게이트 존재, 2=실행 불가
 *
 * P7 패널(AI-티 §7c·매력 §7d·페르소나·게이트키퍼)은 사람 판정이므로 이 러너가 채점하지 않는다.
 * 대신 audit.md 끝에 **패널 브리프 경로와 캡처 경로를 박아** 다음 단계가 곧바로 시작되게 한다
 * (브리프 원문: references/panel-prompts.md).
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) {
  console.error("usage: audit.mjs --url <URL> --out <dir> [--tokens f] [--engineering f] [--ir f] [--lint dir]");
  exit(2);
}
await mkdir(args.out, { recursive: true });
const gates = [];
const add = (name, status, detail, extra = {}) => gates.push({ name, status, detail, ...extra });

const run = (script, a) => new Promise((res) => {
  const p = spawn(process.execPath, [join(HERE, script), ...a], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  p.on("close", (code) => res({ code, out: out.trim(), err: err.trim() }));
});
const readJson = async (f) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return null; } };
const tail = (s, n = 6) => s.split("\n").filter(Boolean).slice(-n).join("\n");

// ── 0. 캡처 (패널 입력 + 장면 예산·깊이 대조의 원자료) ───────────────────
console.log("▶ 캡처(bundle.mjs) …");
const cap = await run("bundle.mjs", ["--url", args.url, "--out", args.out]);
if (cap.code !== 0) { add("capture", "fail", `bundle.mjs 실패: ${tail(cap.err, 3)}`); }
else add("capture", "pass", cap.out.split("\n").find((l) => l.startsWith("bundle 완료")) ?? "완료");
const tree = await readJson(join(args.out, "tree-1440.json"));

// ── 1. detect (AI 티 37+룰) ───────────────────────────────────────────────
console.log("▶ detect.mjs …");
const det = await run("detect.mjs", ["--url", args.url, "--out", join(args.out, "detect"), ...(args.exemptions ? ["--exemptions", args.exemptions] : [])]);
const scan = await readJson(join(args.out, "detect", "scan.json"));
{
  const findings = [];
  (function walk(o) {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") { if (o.rule) findings.push(o); else Object.values(o).forEach(walk); }
  })(scan ?? {});
  const uniq = [...new Map(findings.map((f) => [`${f.rule}|${f.sec}`, f])).values()];
  const red = uniq.filter((f) => (f.sev ?? f.severity) === "red");
  const yellow = uniq.filter((f) => (f.sev ?? f.severity) === "yellow");
  // forge-rules §1의 통과 조건은 "🔴 0 · **차단 QF 0**"이다.
  // QF를 전부 fail로 올렸다가 되돌렸다 — 바닥의 정의는 "콘텐츠·조작이 파손됨(이진적)"이고,
  // QF3(가독 저하)·QF6(unsized img)은 거기 안 든다. 특히 QF6은 **속성 프록시**라
  // CSS로 치수를 고정한 이미지를 오탐한다(실측) — 프록시 검사를 바닥으로 승격하면 억울한 실패를 양산한다.
  const BLOCKING_QF = /^QF[1245]$/;
  const qf = uniq.filter((f) => BLOCKING_QF.test(f.rule ?? ""));
  const fail = [...red, ...qf.filter((f) => (f.sev ?? f.severity) !== "red")];
  add("detect", scan ? (fail.length === 0 ? "pass" : "fail") : "error",
    scan ? `🔴 ${red.length} · 🟡 ${yellow.length}${qf.length ? ` · 차단QF ${qf.length}(콘텐츠·조작 파손 — 등급 무관 실패)` : ""}${fail.length ? ` — ${fail.map((f) => f.rule + (f.sec != null ? `§${f.sec}` : "")).join(", ")}` : ""}` : tail(det.err, 3),
    { red: red.map((f) => ({ rule: f.rule, sec: f.sec })), yellow: yellow.map((f) => f.rule) });
}

// ── 2. conform (토큰 준수) ────────────────────────────────────────────────
if (args.tokens) {
  if (args.lint) {
    console.log("▶ conform.mjs --lint …");
    const r = await run("conform.mjs", ["--tokens", args.tokens, "--lint", args.lint, "--out", args.out]);
    add("conform:lint", r.code === 0 ? "pass" : r.code === 1 ? "fail" : "error", r.code === 0 ? "raw 리터럴 0" : tail(r.err, 5));
  } else add("conform:lint", "skip", "--lint 소스 디렉터리 미지정");
  console.log("▶ conform.mjs --url …");
  const r = await run("conform.mjs", ["--tokens", args.tokens, "--url", args.url, "--out", args.out]);
  add("conform:render", r.code === 0 ? "pass" : r.code === 1 ? "fail" : "error", r.code === 0 ? "토큰 밖 값 0" : tail(r.err, 8));
} else {
  add("conform:lint", "missing", "tokens.json 없음 — 아트디렉터(P2) 산출물 미제공. 색·폰트 어휘가 기계 판정되지 않는 상태다");
  add("conform:render", "missing", "tokens.json 없음 — 같은 사유");
}

// ── 3. behavior (동작 검증 + 가시성) ─────────────────────────────────────
if (args.engineering) {
  console.log("▶ behavior.mjs …");
  const r = await run("behavior.mjs", ["--url", args.url, "--spec", args.engineering, "--out", args.out]);
  add("behavior", r.code === 0 ? "pass" : r.code === 1 ? "fail" : "error", r.code === 0 ? r.out : tail(r.err, 8));
} else {
  add("behavior", "missing", "engineering.json 없음 — 엔지니어드 모먼트 하한(3)과 no-JS/reduced-motion 가시성이 판정되지 않는 상태다");
}

// ── 4. 장면 예산 (§2d — 같은 배경·시그니처 연속 3섹션 금지) ───────────────
if (tree) {
  const bands = [];
  (function walk(n, depth, bg) {
    const b = n.styles?.backgroundColor ?? bg;
    if (n.rect.w >= 1440 * 0.75 && n.rect.h >= 200 && n.rect.h <= Math.min(5500, tree.scrollHeight * 0.7) && depth <= 14 && !["fixed", "absolute", "sticky"].includes(n.styles?.position))
      bands.push({ y: n.rect.y, h: n.rect.h, bg: b ?? null, cols: (n.children ?? []).filter((c) => c.rect.w >= 120 && c.rect.h >= 60).length });
    for (const c of n.children ?? []) walk(c, depth + 1, b);
  })(tree.tree, 0, null);
  bands.sort((a, b) => a.y - b.y);
  const dedup = [];
  for (const b of bands) if (!dedup.some((s) => Math.max(0, Math.min(b.y + b.h, s.y + s.h) - Math.max(b.y, s.y)) > 0.7 * Math.min(b.h, s.h))) dedup.push(b);
  let worst = 1, cur = 1;
  for (let i = 1; i < dedup.length; i++) {
    const same = dedup[i].bg === dedup[i - 1].bg && dedup[i].cols === dedup[i - 1].cols;
    cur = same ? cur + 1 : 1;
    if (cur > worst) worst = cur;
  }
  add("scene-budget", worst >= 3 ? "fail" : "pass", `동일 배경·열구성 최장 연속 ${worst}밴드 (하한: 3 미만) · 섹션 ${dedup.length}개`, { sections: dedup.length, longestRun: worst });
  // ── 5. 깊이 대조 (리드 IR 대비) ────────────────────────────────────────
  const ir = args.ir ? await readJson(args.ir) : null;
  if (ir) {
    const dH = tree.scrollHeight / ir.page.scrollHeight1440 - 1;
    const dS = dedup.length / Math.max(1, ir.sections.length) - 1;
    const bad = dH < -0.4 || dS < -0.4;
    add("depth", bad ? "fail" : "pass",
      `스크롤 ${tree.scrollHeight}px(리드 ${ir.page.scrollHeight1440}, ${pct(dH)}) · 섹션 ${dedup.length}(리드 ${ir.sections.length}, ${pct(dS)})${bad ? " — -40% 초과 축소는 mapping.md에 섹션별 삭제 사유 전수 기재 필요" : ""}`);
  } else add("depth", "missing", "--ir 리드 IR 미지정 — 깊이 하한이 판정되지 않는 상태다");
} else {
  add("scene-budget", "error", "tree-1440.json 없음");
  add("depth", "error", "tree-1440.json 없음");
}

// ── 보고서 ────────────────────────────────────────────────────────────────
const icon = { pass: "✅", fail: "❌", missing: "⚠️ 미제공", skip: "— 생략", error: "⛔ 오류" };
const failed = gates.filter((g) => g.status === "fail" || g.status === "error");
const missing = gates.filter((g) => g.status === "missing");
const md = `# 기계 배터리 판정 — ${args.url}

| 게이트 | 판정 | 상세 |
|---|---|---|
${gates.map((g) => `| ${g.name} | ${icon[g.status]} | ${String(g.detail).replace(/\n/g, " / ").replace(/\|/g, "\\|").slice(0, 300)} |`).join("\n")}

**결과: ${failed.length === 0 && missing.length === 0 ? "전 게이트 통과" : `실패 ${failed.length} · 미제공 ${missing.length}`}**
${missing.length ? `\n> 미제공 게이트는 "통과"가 아니다 — 해당 계약 파일(tokens.json·engineering.json·리드 IR)이 없으면 그 축은 판정되지 않은 상태이며, 보고서에 그대로 고지해야 한다.\n` : ""}
## P7 패널 (사람 판정 — 이 러너가 채점하지 않는다)

브리프 원문: \`references/panel-prompts.md\` (그대로 복사해 신선한 컨텍스트 에이전트에 전달)

| 판정 | 브리프 | 통과선 |
|---|---|---|
| AI-티 시각 채점(§7c) | panel-prompts.md §A | 전 섹션 ≥4 · ≤3점은 철거 후 재단조 |
| 매력 채점(§7d) | §B | 절대 ≥70 · 경쟁 최고 −20 이내 |
| 페르소나(§7b) | §C | ② 정답 · 🔴 0 |
| 이미지 게이트키퍼(§2b) | §D | 인슬롯 렌더 캡처로 판정 |

패널 입력 캡처: \`${join(args.out, "shots-1440")}\`(데스크톱 밴드) · \`${join(args.out, "shots-390")}\`(모바일 밴드)
`;
await writeFile(join(args.out, "audit.md"), md);
await writeFile(join(args.out, "audit.json"), JSON.stringify({ url: args.url, gates, failed: failed.length, missing: missing.length }, null, 2));
console.log("\n" + md.split("## P7")[0]);
console.log(`→ ${join(args.out, "audit.md")}`);
exit(failed.length ? 1 : 0);

function pct(x) { return (x >= 0 ? "+" : "") + Math.round(x * 100) + "%"; }
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
