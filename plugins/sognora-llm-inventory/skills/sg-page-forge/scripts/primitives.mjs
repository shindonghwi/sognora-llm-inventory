#!/usr/bin/env node
/**
 * primitives.mjs — 컴포넌트 층이 있는가. 같은 프리미티브(Button·Input·Card·Badge·Table·EmptyState)를 여러 파일이 각자 정의하면 층이 없는 것이다. 순수 fs.
 *
 * usage: node primitives.mjs         인자 없이 — cwd의 src/(없으면 cwd)
 * 판정: component.no-primitive-layer(🔴 — 공유 컴포넌트 export 0 + 중복 정의 패턴) · component.duplicated(🟡) · component.no-shared(🟡)
 * 근거: page-rules §1b 실측(CSS 모듈 11개 중 카드 9·버튼 8·배지 6·입력 4 파일이 각자 정의, 컨트롤 높이 7파일에 직접 박힘). 기준 3파일 = 패턴(2는 페이지 변형일 수 있음 — 관행 기준)
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs } from "./_deps.mjs";
import { access } from "node:fs/promises";

const PRIMS = { button: /\.(btn|button)[\w-]*\s*\{|<button\b/i, input: /\.(input|field|textfield)[\w-]*\s*\{|<input\b/i, card: /\.(card|tile|panel)[\w-]*\s*\{/i, badge: /\.(badge|chip|tag|pill)[\w-]*\s*\{/i, table: /\.(table|row|cell)[\w-]*\s*\{|<table\b/i, empty: /empty[\w-]*state|EmptyState/i };
const DUP_MIN = 3;   // 관행: 같은 프리미티브를 3개 이상 파일이 각자 정의하면 재사용 실패(실측 사례 82%)

export async function analyzeSrc(dir) {
  const files = []; const stack = [dir];
  while (stack.length) { const d = stack.pop(); let ents = []; try { ents = await readdir(d, { withFileTypes: true }); } catch { continue; } for (const e of ents) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const p = join(d, e.name); if (e.isDirectory()) stack.push(p); else if (/\.(css|scss|module\.css|tsx|jsx|vue|svelte)$/.test(e.name)) files.push({ path: p, text: await readFile(p, "utf8").catch(() => "") }); } }
  const defs = Object.fromEntries(Object.keys(PRIMS).map((k) => [k, []]));
  for (const f of files) if (/\.(css|scss)$/.test(f.path)) for (const [k, re] of Object.entries(PRIMS)) if (re.test(f.text)) defs[k].push(f.path);
  // 정의(근거: page-rules §1b — 파일·export 이름으로 판정, 빈 디렉터리는 층으로 세지 않는다): 공유 컴포넌트 파일 후보의 크기·경로 조건
  const shared = files.filter((f) => /\/(components|ui|primitives|design-system)\//.test(f.path) && /\.(tsx|jsx|vue|svelte)$/.test(f.path) && /export\s+(default|const|function)/.test(f.text) && f.text.trim().length > 40);   // 정의: 빈 디렉터리는 층으로 세지 않는다 — 파일과 export로 판정
  const dup = Object.entries(defs).filter(([, v]) => v.length >= DUP_MIN);
  const findings = [];
  if (!shared.length && dup.length) findings.push({ id: "component.no-primitive-layer", severity: "🔴", detail: `공유 컴포넌트 export 0 + 중복 정의 ${dup.map(([k, v]) => `${k}×${v.length}`).join(" ")} — Button·Input·Table·EmptyState부터 세운다(라이브러리든 직접이든)` });
  else if (dup.length) findings.push({ id: "component.duplicated", severity: "🟡", detail: `같은 프리미티브 중복 정의: ${dup.map(([k, v]) => `${k}×${v.length}`).join(" ")}` });
  if (!shared.length && !dup.length && files.length) findings.push({ id: "component.no-shared", severity: "🟡", detail: "components/·ui/ 아래 export된 공유 컴포넌트가 없다(파일 수 " + files.length + ")" });
  return { files: files.length, shared: shared.length, defs: Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.length])), findings };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const src = args.src || (await access("src").then(() => "src").catch(() => "."));   /* 기본: cwd의 src/, 없으면 cwd */
  const r = await analyzeSrc(src);
  const md = [`# primitives — ${src}`, "", `파일 ${r.files} · 공유 컴포넌트 ${r.shared} · 정의 ${JSON.stringify(r.defs)}`, "", ...(r.findings.length ? r.findings.map((f) => `- ${f.severity} \`${f.id}\` ${f.detail}`) : ["✅ 컴포넌트 층 있음"])].join("\n");
  if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "primitives.md"), md); }
  console.log(md); exit(r.findings.some((f) => f.severity === "🔴") ? 1 : 0);
}
