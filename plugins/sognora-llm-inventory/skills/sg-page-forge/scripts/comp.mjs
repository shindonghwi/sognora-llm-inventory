#!/usr/bin/env node
/**
 * comp.mjs — 시안 우선. 계약·방향·토큰을 imagegen 브리프로 컴파일해 `codex exec`에 파이프한다. 시안이 좋은지는 판정하지 않는다 — 존재와 프롬프트만 관할.
 *
 * usage: node comp.mjs            인자 없이 — .sognora/page/contract.json의 모든 페이지에 3안씩 → .sognora/page/comps/
 *        node comp.mjs --check    계약의 페이지마다 시안 PNG(comp 필드 또는 <slug>-<n>.png) 존재 확인
 *   (내부 옵션 --contract --variants --direction --out --dry-run 은 남아 있지만 문서에 쓰지 않는다)
 * 산출: <out>/<slug>-<n>.png(N안) · <out>/<slug>.prompt.md(프롬프트 전문 — 같은 계약이면 같은 브리프)
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs } from "./_deps.mjs";

export const slugOf = (route) => route === "/" ? "home" : route.replace(/^\//, "").replace(/[^\w가-힣-]+/g, "-").toLowerCase();
const DO_TYPES = /^(catalog|tool|pricing|form|dashboard)$|^do:/;

export function compileBrief(contract, page, tokens, { variants = 3, direction = "", out = ".sognora/page/comps" } = {}) {
  const slug = slugOf(page.route);
  const tok = tokens ? `- 팔레트(hex, 역할): ${(tokens.colors?.base || []).map((c) => `${c.hex}(${c.role})`).join(", ")}\n- 서체: ${(tokens.type?.families || []).map((f) => `${f.name}(${f.role})`).join(", ")}\n- 타입 스케일(1440): ${(tokens.type?.steps || []).map((s) => `${s.name} ${s.px?.["1440"] ?? "?"}px`).join(" / ")}\n- radius: ${(tokens.radius || []).join("/")}` : "- ⚠️ 토큰이 없다. **색을 지어내지 말고 무채색 뼈대로만** 그려라. 팔레트는 사람이 시안을 고른 뒤 확정한다.";
  const isDo = DO_TYPES.test(page.type);
  return `\`imagegen\` 스킬을 사용해서 **${page.route}** 화면의 UI 시안을 ${variants}안 생성해라. 각 안은 서로 방향이 달라야 한다(구도·피사체·밀도 중 최소 1축). 1536×1024, 데스크톱 첫 화면, 실제 운영 중인 프리미엄 사이트 스크린샷처럼.

## 이 화면
- 유형: **${page.type}** (${isDo ? "하는 화면 — 사용자가 여기서 고르거나 쓰거나 정한다" : "읽는 화면"})
- 돕는 결정: ${page.decision}
${contract.center && page.type === "landing" ? `- 중심 장면: ${contract.center} — 히어로는 결과를 판다. 사용자가 해야 할 입력 작업을 파는 히어로 금지` : ""}

## 실제로 들어갈 것 (facts — 이걸로 화면을 채워라, 지어내지 마라)
${(page.facts || []).map((f) => `- ${f}`).join("\n")}

## 반드시 있어야 하는 것
${(page.must || []).length ? page.must.map((m) => `- ${m}`).join("\n") : "- (계약에 선언된 것 없음 — 유형 필수 구조를 따르라)"}

## 있으면 안 되는 것
${(page.mustNot || []).map((m) => `- ${m}`).join("\n")}
- 굵은 고딕(700+)·유리 블러 상자·알약 버튼 남발·보라 그라데이션·가운데 히어로+카드 3장·이모지 아이콘·H1 위 배지·숫자 없는 스탯 밴드 금지(근거: wiki/evidence/ai-slop.md)
- 여백이 콘텐츠보다 큰 밴드 금지. 글만 있는 화면 금지 — 이 화면의 일(항목·입력·표·데이터)이 첫 화면의 주인공
${isDo ? "- **소개문 도입 금지** — 아이브로>큰 제목>리드 문단으로 열지 마라. 제목 한 줄 아래 바로 이 화면의 일이 온다" : ""}
- 로렘입숨·사람 얼굴·로고·워터마크 금지. 한글이 깨지면 자리(회색 블록)만 잡아도 된다 — 카피는 facts에서 온다

## 토큰
${tok}
${direction ? `\n## 방향 축\n${direction}\n` : ""}
## 산출
1. \`${slug}-1.png\` … \`${slug}-${variants}.png\`로 저장(정확히 이 파일명, 현재 디렉터리 기준 \`${out}/\`).
2. 실제로 imagegen에 넘긴 프롬프트 전문을 \`${out}/${slug}.prompt.md\` 끝에 \`## imagegen에 넘긴 프롬프트\` 절로 덧붙여라.`;
}

/** codex CLI가 PATH에 있는가 — 없으면 시안 축은 "미제공"이다(런타임 중립: Claude 단독 환경에서 죽지 않고 프롬프트만 남긴다) */
export function codexAvailable() { const r = spawnSync("codex", ["--version"], { stdio: "ignore" }); return !r.error && r.status === 0; }
export const CODEX_MISSING_NOTE = (out, slug) => `시안 축 미제공 — codex CLI 없음. 프롬프트(${out}/${slug}.prompt.md)를 다른 이미지 생성기(ChatGPT 이미지·Midjourney 등)에 넣어 ${out}/${slug}-1.png … 로 두면 --check가 통과한다`;

function runCodex(prompt) {
  return new Promise((res) => {
    const ch = spawn("codex", ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "-"], { stdio: ["pipe", "inherit", "inherit"] });
    ch.on("error", () => res(127));
    ch.stdin.end(prompt); ch.on("close", (code) => res(code ?? 1));
  });
}

export async function checkComps(contract, out) {
  const missing = [];
  for (const p of contract.pages) { if (p.skip) continue; const cand = p.comp ? [p.comp] : [join(out, `${slugOf(p.route)}-1.png`), join(out, `${slugOf(p.route)}.png`)]; let ok = false; for (const c of cand) { try { await access(c); ok = true; break; } catch { /* next */ } } if (!ok) missing.push(p.route); }
  return missing;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const contractPath = args.contract || join(".sognora", "page", "contract.json");
  let contract; try { contract = JSON.parse(await readFile(contractPath, "utf8")); } catch { console.error(`계약 없음: ${contractPath} — node contract.mjs 로 먼저 만든다`); exit(2); }
  const out = args.out || join(".sognora", "page", "comps");
  if (args.check) { const miss = await checkComps(contract, out); if (miss.length) { console.error(`🔴 comp.missing — 시안 없는 페이지 ${miss.length}: ${miss.join(", ")} (사용자가 고른 시안이 계약 comp 필드에 있어야 빌드로 간다)`); exit(1); } console.log("✅ 모든 페이지에 시안 있음"); exit(0); }
  await mkdir(out, { recursive: true });
  let tokens = null; const tPath = contract.pages.find((p) => p.tokens)?.tokens; if (tPath) { try { tokens = JSON.parse(await readFile(tPath, "utf8")); } catch { /* 없음 */ } }
  const direction = args.direction ? await readFile(args.direction, "utf8").catch(() => "") : "";
  let failed = 0; const hasCodex = args["dry-run"] ? false : codexAvailable();
  if (!args["dry-run"] && !hasCodex) console.log("codex CLI 없음 — 프롬프트 파일만 쓴다(시안 축 미제공, exit 0)");
  for (const p of contract.pages) {
    if (p.skip) continue;
    if (!Array.isArray(p.facts) || !p.facts.length || p.facts.some((f) => /^TODO/i.test(f))) { console.error(`🔴 ${p.route}: facts가 비어 시안을 만들지 않는다(빈 틀을 베끼게 된다)`); failed++; continue; }
    const brief = compileBrief(contract, p, tokens, { variants: Number(args.variants || 3), direction, out });
    await writeFile(join(out, `${slugOf(p.route)}.prompt.md`), `# ${p.route} 시안 브리프\n\n${brief}\n`);
    if (args["dry-run"]) { console.log(`(dry-run) ${p.route} → ${slugOf(p.route)}.prompt.md`); continue; }
    if (!hasCodex) { console.log(`미제공 ${p.route}: ${CODEX_MISSING_NOTE(out, slugOf(p.route))}`); continue; }
    const code = await runCodex(brief); if (code !== 0) { failed++; console.error(`🔴 ${p.route} 시안 실패 (codex exit=${code})`); }
  }
  exit(failed ? 1 : 0);
}
