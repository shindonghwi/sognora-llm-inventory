#!/usr/bin/env node
/**
 * lint-docs.mjs — `.sognora/page/` 산출물 문서의 계약 검사. 문서 검사는 문서만 증명한다(화면 판정은 audit).
 *
 * usage: node lint-docs.mjs          인자 없이 — .sognora/page 전체(contract·tokens·comps·defects)
 *  contract.json  → contract.mjs check
 *  tokens.json    → conform.mjs lintTokens
 *  comps/         → 계약 페이지마다 시안 PNG + <slug>.prompt.md
 *  defects.md     → 열(관찰·근거·원인 층·수정·재검증·상태), 원인 층 어휘, 해결에는 캡처 파일명(png/뷰포트), 폐기는 사용자 인용
 */
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs } from "./_deps.mjs";
import { check as checkContract } from "./contract.mjs";
import { lintTokens } from "./conform.mjs";
import { checkComps } from "./comp.mjs";

export const LAYERS = ["목적", "구도", "형태", "재질·빛", "재질", "시간", "입력", "합성·렌더링", "합성", "사용성", "실행", "콘텐츠", "카피"];

export function lintDefects(md) {
  const out = [];
  const rows = md.split("\n").filter((l) => /^\|/.test(l) && !/^\|\s*-{2,}/.test(l));
  const header = rows.shift(); if (!header) return [{ severity: "🟡", detail: "결함 표가 없다(결함 0건이면 그렇게 적는다)" }];
  const cols = header.split("|").slice(1, -1).map((s) => s.trim());
  const need = ["관찰", "근거", "원인 층", "수정", "재검증", "상태"];
  const idx = Object.fromEntries(need.map((n) => [n, cols.findIndex((c) => c.includes(n))]));
  for (const n of need) if (idx[n] < 0) out.push({ severity: "🔴", detail: `defects.md 열 없음: ${n}` });
  if (out.length) return out;
  rows.forEach((line, i) => {
    const c = line.split("|").slice(1, -1).map((s) => s.trim());
    const layer = c[idx["원인 층"]] || "", fix = c[idx["수정"]] || "", re = c[idx["재검증"]] || "", st = c[idx["상태"]] || "";
    if (!LAYERS.some((l) => layer.includes(l))) out.push({ severity: "🔴", detail: `행 ${i + 1}: 원인 층 "${layer}"는 정해진 층이 아니다(${LAYERS.slice(0, 11).join("/")})` });
    if (/(폐기|갈아엎|처음부터|전면 삭제)/.test(fix) && !/(사용자|인용|")/.test(fix)) out.push({ severity: "🔴", detail: `행 ${i + 1}: 전체 폐기는 사용자 문장 인용이 있어야 한다` });
    if (!/(미해결|해결|미검증)/.test(st)) out.push({ severity: "🔴", detail: `행 ${i + 1}: 상태는 미해결/해결/미검증 중 하나` });
    if (/해결/.test(st) && !/미해결/.test(st) && !/(\.png|캡처|\d{3,4}\s*[×x]\s*\d{3,4})/.test(re)) out.push({ severity: "🔴", detail: `행 ${i + 1}: 해결인데 재검증에 같은 상태 캡처(파일명/뷰포트)가 없다` });
  });
  return out;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const dir = args.dir || ".sognora/page"; const phase = args.phase || "all";
  const findings = []; const has = async (p) => { try { await access(p); return true; } catch { return false; } };
  let contract = null;
  if (phase === "all" || phase === "contract") { const p = join(dir, "contract.json"); if (await has(p)) { try { contract = JSON.parse(await readFile(p, "utf8")); for (const e of checkContract(contract)) findings.push({ severity: "🔴", detail: `contract: ${e}` }); } catch (e) { findings.push({ severity: "🔴", detail: `contract.json 파싱 실패: ${e.message}` }); } } else if (phase === "contract") findings.push({ severity: "🔴", detail: "contract.json 없음" }); }
  if (phase === "all" || phase === "tokens") { const p = join(dir, "tokens.json"); if (await has(p)) { try { for (const f of lintTokens(JSON.parse(await readFile(p, "utf8")))) findings.push({ severity: f.severity, detail: `tokens: ${f.detail}` }); } catch (e) { findings.push({ severity: "🔴", detail: `tokens.json 파싱 실패: ${e.message}` }); } } else if (phase === "tokens") findings.push({ severity: "🔴", detail: "tokens.json 없음" }); }
  if ((phase === "all" || phase === "comps") && contract) { const miss = await checkComps(contract, join(dir, "comps")); if (miss.length) findings.push({ severity: "🔴", detail: `시안 없는 페이지: ${miss.join(", ")}` }); for (const p of contract.pages) { if (p.skip) continue; const slug = p.route === "/" ? "home" : p.route.replace(/^\//, "").replace(/[^\w가-힣-]+/g, "-").toLowerCase(); if (!(await has(join(dir, "comps", `${slug}.prompt.md`)))) findings.push({ severity: "🟡", detail: `${p.route}: 시안 프롬프트 전문(${slug}.prompt.md) 없음 — 같은 계약이면 같은 브리프가 나와야 한다` }); } }
  if (phase === "all" || phase === "defects") { const p = join(dir, "defects.md"); if (await has(p)) findings.push(...lintDefects(await readFile(p, "utf8")).map((f) => ({ ...f, detail: `defects: ${f.detail}` }))); else if (phase === "defects") findings.push({ severity: "🔴", detail: "defects.md 없음" }); }
  const red = findings.filter((f) => f.severity === "🔴").length;
  console.log(findings.length ? findings.map((f) => `${f.severity} ${f.detail}`).join("\n") : "✅ 문서 계약 통과");
  exit(red ? 1 : 0);
}
