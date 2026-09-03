/**
 * foundation.mjs — 프로젝트 발판(기본 스택) 진단·처방·적용.
 *
 * 왜 있나 — 스킬이 만드는 화면은 컴포넌트 층·토큰·모션 어휘 위에 선다. 발판이 없는 프로젝트에서 페이지부터 짓면
 * 화면마다 CSS를 다시 짜고 문단으로 수렴한다(wiki/systems/components.md). 그래서 P0에서 발판을 먼저 재고,
 * 빠진 층이 있으면 "먼저 잡을까요?"를 한 번 묻고(사용자 지시 2026-09-04), 승인 시 --apply로 깐다.
 *
 * 기본 스택(SKILL.md "기본 스택"): Next.js + TypeScript + Tailwind + shadcn/ui(Radix 또는 Base UI) + TanStack Query
 * + zod + react-hook-form + Motion. 프로젝트에 다른 스택이 이미 있으면 그것을 존중한다 — 갈아엎지 않고 빠진 층만 처방한다.
 *
 * usage: node foundation.mjs           인자 없이 — cwd 프로젝트 진단 · --apply: 사용자 승인 뒤 빠진 층 설치
 *   exit 0 = 발판 완비 · 1 = 빠진 층 있음(처방 출력) · 2 = 프로젝트 아님(package.json 없음)
 */
import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { spawnSync } from "node:child_process";
import { parseArgs } from "./_deps.mjs";

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const major = (v) => { const m = String(v || "").match(/(\d+)/); return m ? Number(m[1]) : null; };

async function findGlobalsCss(root) {
  for (const c of ["src/app/globals.css", "app/globals.css", "src/styles/globals.css", "styles/globals.css", "src/index.css", "src/app/global.css"]) if (await exists(join(root, c))) return join(root, c);
  return null;
}

/** 순수: package.json·파일 존재 정보 → 층별 상태. 테스트는 이 함수만 본다. */
export function assessFromInputs({ pkg, files }) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);
  const layers = [];
  const push = (id, name, status, found, fix) => layers.push({ id, name, status, found, fix });

  /* 프레임워크 */
  if (has("next")) push("framework", "프레임워크", "✅", `next@${deps.next}`, null);
  else if (has("astro") || has("vite") || has("@remix-run/react") || has("nuxt")) push("framework", "프레임워크", "🟡", Object.keys(deps).find((k) => ["astro", "vite", "@remix-run/react", "nuxt"].includes(k)), "기존 프레임워크 존중 — Next 강제 안 함. 아래 층만 맞춘다");
  else push("framework", "프레임워크", "❌", "없음", "npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --no-import-alias");

  /* TypeScript */
  if (has("typescript") || files.tsconfig) push("typescript", "TypeScript", "✅", files.tsconfig ? "tsconfig.json" : `typescript@${deps.typescript}`, null);
  else push("typescript", "TypeScript", "❌", "없음", "<pm> add -D typescript @types/react @types/node && npx tsc --init");

  /* Tailwind */
  if (has("tailwindcss")) { const v = major(deps.tailwindcss); push("tailwind", "Tailwind", v && v >= 4 ? "✅" : "🟡", `tailwindcss@${deps.tailwindcss}`, v && v >= 4 ? null : "점진 이행 권장: Tailwind 3 → 4(설정이 CSS로, 빠름) — npx @tailwindcss/upgrade"); }
  else push("tailwind", "Tailwind", "❌", "없음", "<pm> add -D tailwindcss @tailwindcss/postcss postcss");

  /* 컴포넌트 층: shadcn(components.json + radix/base-ui) */
  const radix = Object.keys(deps).filter((k) => k.startsWith("@radix-ui/")).length, baseui = Object.keys(deps).filter((k) => k.startsWith("@base-ui")).length;
  if (files.componentsJson && (radix || baseui)) push("components", "컴포넌트 층(shadcn)", "✅", `components.json · radix ${radix} · base-ui ${baseui}`, null);
  else if (files.componentsJson) push("components", "컴포넌트 층(shadcn)", "🟡", "components.json만 있고 프리미티브 의존 0", "npx shadcn@latest add button input dialog table badge — 실제로 쓰는 컴포넌트를 추가");
  else if (files.uiDirFiles > 0) push("components", "컴포넌트 층", "🟡", `자체 층(components/ui ${files.uiDirFiles}파일)`, "자체 층 존중 — primitives.mjs로 중복 정의만 검사");
  else push("components", "컴포넌트 층(shadcn)", "❌", "없음", "npx shadcn@latest init -d && npx shadcn@latest add button input dialog table badge");

  /* 데이터·폼 */
  push("query", "TanStack Query", has("@tanstack/react-query") ? "✅" : "❌", has("@tanstack/react-query") ? `@tanstack/react-query@${deps["@tanstack/react-query"]}` : "없음", has("@tanstack/react-query") ? null : "<pm> add @tanstack/react-query");
  const zod = has("zod"), rhf = has("react-hook-form");
  push("forms", "zod + react-hook-form", zod && rhf ? "✅" : zod || rhf ? "🟡" : "❌", `zod ${zod ? deps.zod : "없음"} · react-hook-form ${rhf ? deps["react-hook-form"] : "없음"}`, zod && rhf ? null : `<pm> add ${!zod ? "zod " : ""}${!rhf ? "react-hook-form @hookform/resolvers" : ""}`.trim());

  /* 모션 */
  if (has("motion")) push("motion", "Motion", "✅", `motion@${deps.motion}`, null);
  else if (has("framer-motion")) push("motion", "Motion", "🟡", `framer-motion@${deps["framer-motion"]}`, "점진 이행 권장: framer-motion → motion(같은 라이브러리의 새 이름) — <pm> add motion 후 import 경로 교체");
  else push("motion", "Motion", "❌", "없음", "<pm> add motion");

  /* 토큰·서체: shadcn 기본 테마 그대로인가, Inter 단독인가 */
  if (files.globalsCss) {
    const css = files.globalsCss;
    const defaults = ["--background: 0 0% 100%", "--foreground: 0 0% 13%", "--foreground: 0 0% 3.9%", "--muted: 0 0% 96%", "--muted: 0 0% 96.1%", "--border: 0 0% 88%", "--border: 0 0% 89.8%"].filter((d) => css.includes(d)).length;
    const inter = /Inter/.test(css) && !/Pretendard|SUIT|Noto (Sans|Serif) KR|Wanted Sans|IBM Plex Sans KR/.test(css);
    if (defaults >= 3 || inter) push("tokens", "디자인 토큰", "❌", `${defaults >= 3 ? "shadcn 기본 중립 팔레트 " + defaults + "개 잔존" : ""}${inter ? (defaults >= 3 ? " · " : "") + "Inter 단독(한글 서체 없음)" : ""}`, "references/design-baseline.md의 JSON을 .sognora/page/tokens.json 씨앗으로 복사 → globals.css의 --background/--foreground/--muted/--border/--radius와 font-family를 토큰으로 재정의(브랜드 색 2개·중립 계열만 결정)");
    else push("tokens", "디자인 토큰", "✅", "기본 테마 아님", null);
  } else push("tokens", "디자인 토큰", "🟡", "globals.css를 찾지 못함", "토큰 파일 위치를 계약(tokens)에 적는다");

  const missing = layers.filter((l) => l.status === "❌"), soft = layers.filter((l) => l.status === "🟡");
  return { layers, missing: missing.map((l) => l.id), soft: soft.map((l) => l.id), ready: missing.length === 0 };
}

function pm(root, files) { return files.pnpmLock ? "pnpm" : files.yarnLock ? "yarn" : files.bunLock ? "bun" : "npm"; }
const addCmd = { pnpm: "pnpm add", yarn: "yarn add", bun: "bun add", npm: "npm install" };

export async function assess(root) {
  let pkg = null; try { pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")); } catch { return null; }
  const globals = await findGlobalsCss(root);
  let uiDirFiles = 0; for (const d of ["src/components/ui", "components/ui", "src/components", "components"]) { try { uiDirFiles += (await readdir(join(root, d))).filter((f) => /\.(tsx|jsx|vue|svelte)$/.test(f)).length; if (uiDirFiles) break; } catch { /* 없음 */ } }
  const files = { tsconfig: await exists(join(root, "tsconfig.json")), componentsJson: await exists(join(root, "components.json")), uiDirFiles, globalsCss: globals ? await readFile(globals, "utf8") : null, globalsPath: globals,
    pnpmLock: await exists(join(root, "pnpm-lock.yaml")), yarnLock: await exists(join(root, "yarn.lock")), bunLock: await exists(join(root, "bun.lockb")) || await exists(join(root, "bun.lock")) };
  const r = assessFromInputs({ pkg, files });
  const manager = pm(root, files);
  for (const l of r.layers) if (l.fix) l.fix = l.fix.replace(/<pm> add(?: -D)?/g, (m) => addCmd[manager] + (m.includes("-D") ? (manager === "npm" ? " --save-dev" : " -D") : ""));
  return { root, manager, ...r };
}

export function renderMd(r) {
  const rows = r.layers.map((l) => `| ${l.status} | ${l.name} | ${l.found} | ${l.fix || "—"} |`).join("\n");
  const head = r.ready ? "✅ 발판 완비 — 빠진 층 없음" : `❌ 빠진 층 ${r.missing.length}: ${r.missing.join(", ")} — 사용자에게 "먼저 발판을 잡을까요?"를 한 번 묻고, 승인 시 --apply`;
  return `# foundation — ${r.root} (${r.manager})\n\n${head}${r.soft.length ? `\n🟡 점진 이행 권장 ${r.soft.length}: ${r.soft.join(", ")}` : ""}\n\n| 상태 | 층 | 현재 | 처방 |\n|---|---|---|---|\n${rows}\n\n> 기존 프레임워크·자체 컴포넌트 층은 존중한다(갈아엎지 않는다). 토큰 층은 명령이 아니라 편집이다 — design-baseline.md를 씨앗으로 사람이 브랜드 색·중립 계열을 정한다.\n`;
}

/** --apply: 사용자가 승인한 뒤에만. 토큰 층(편집)은 적용하지 않고 처방만 남긴다. */
export function applyFixes(r, { dryRun = false } = {}) {
  const ran = [];
  for (const l of r.layers) {
    if (l.status !== "❌" || !l.fix || l.id === "tokens") continue;
    for (const cmd of l.fix.split("&&").map((s) => s.trim())) {
      ran.push({ layer: l.id, cmd, code: dryRun ? null : spawnSync(cmd, { cwd: r.root, shell: true, stdio: "inherit" }).status });
    }
  }
  return ran;
}

if (import.meta.url === `file://${argv[1]}`) {
  const args = parseArgs(argv.slice(2));
  const root = args.project || process.cwd();
  const r = await assess(root);
  if (!r) { console.error(`package.json 없음: ${root} — 프로젝트 루트를 --project로 지정`); exit(2); }
  const md = renderMd(r);
  if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "foundation.md"), md); await writeFile(join(args.out, "foundation.json"), JSON.stringify(r, null, 2)); }
  if (args.json) console.log(JSON.stringify(r, null, 2)); else console.log(md);
  if (args.apply && !r.ready) { const ran = applyFixes(r, { dryRun: args["dry-run"] === "true" }); console.log(ran.map((x) => `${x.code === 0 ? "✅" : x.code === null ? "(dry)" : "🔴"} [${x.layer}] ${x.cmd}`).join("\n")); const again = await assess(root); console.log(again.ready ? "✅ 발판 완비" : `남은 층: ${again.missing.join(", ")}`); exit(again.ready ? 0 : 1); }
  exit(r.ready ? 0 : 1);
}
