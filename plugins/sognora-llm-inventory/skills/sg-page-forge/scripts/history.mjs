#!/usr/bin/env node
/**
 * history.mjs — 같은 형태 반복 금지의 판정자. 실행 이력(`$SG_PAGE_FORGE_HOME/history.json`)에 리드·팔레트·방향 7축을 적고, 새 실행이 최근 것과 겹치는지 잰다.
 *
 * usage: node history.mjs check --lead <name> [--palette #hex] [--axes typo,color,layout,density,decor,motion,signature] [--project <이름>]
 *        node history.mjs append --lead <name> [--palette #hex] [--axes ...] [--project <이름>] [--note "..."]
 *        node history.mjs list
 * 규칙: lead.reuse(최근 3회 내 동일 리드 🔴 — 인용 wiki/workflow/lead.md 리드 회전) · palette.history-repeat(직전 실행과 베이스 팔레트 계열 동일 🔴) · direction.axes-repeat(7축 중 3축 미만 상이 🟡)
 * history.json이 없으면 "미제공(첫 실행)" — 캐시 부재는 실패가 아니라 판정되지 않음이다. 그 사실을 출력한다.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs, forgeHome } from "./_deps.mjs";
import { parseRgb, hue, saturation, luminance } from "./rules/_util.mjs";

const RECENT = 3;   // 인용: 동일 리드 최근 3회 내 재사용 금지(wiki/workflow/lead.md)
const AXES_MIN_DIFF = 3;   // 인용: 7축 중 3축 이상 상이(wiki/directions.md 유도 절차 0)
const AXES = ["typo", "color", "layout", "density", "decor", "motion", "signature"];

export const historyPath = () => join(forgeHome(), "history.json");

export async function load() {
  try { return JSON.parse(await readFile(historyPath(), "utf8")); } catch { return null; }
}

/** 팔레트 계열: 무채(밝음/어둠) · 유채는 hue 60° 버킷 — 정의: 크림·베이지·웜오프화이트가 한 계열로 묶이도록 채도<0.12는 밝기 3단으로만 나눈다 */
export function paletteFamily(hex) {
  const c = parseRgb(hex) || hexToRgb(hex); if (!c) return null;
  const s = saturation(c), l = luminance(c);
  if (s < 0.12) return l > 0.6 ? "neutral-light" : l > 0.2 ? "neutral-mid" : "neutral-dark";
  const h = hue(c); if (h === null) return "neutral-mid";
  const bucket = ["red", "yellow", "green", "cyan", "blue", "magenta"][Math.floor(((h % 360) + 360) % 360 / 60)];
  return `${bucket}-${l > 0.6 ? "light" : l > 0.2 ? "mid" : "dark"}`;
}
function hexToRgb(h) { const m = String(h || "").replace("#", ""); const s = m.length === 3 ? m.split("").map((c) => c + c).join("") : m; if (!/^[0-9a-f]{6}$/i.test(s)) return null; return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a: 1 }; }

/** 순수: 이력 + 새 실행 → findings. hist가 null이면 미제공 1건. */
export function check(hist, { lead = null, palette = null, axes = null, project = null } = {}) {
  if (!hist || !Array.isArray(hist.runs) || !hist.runs.length) return { findings: [{ id: "history.unavailable", severity: "미제공", detail: `history.json 없음(첫 실행) — 리드 회전·팔레트 계열·7축 반복 축은 판정되지 않음. 완료 시 history.mjs append로 기록한다` }] };
  const runs = hist.runs.slice(-RECENT); const last = hist.runs[hist.runs.length - 1]; const findings = [];
  if (lead) { const hit = runs.filter((r) => r.lead === lead && !r.userPinned); if (hit.length) findings.push({ id: "lead.reuse", severity: "🔴", detail: `리드 "${lead}"가 최근 ${RECENT}회 안에 ${hit.length}회 쓰였다(${hit.map((r) => r.date).join(", ")}) — 다른 리드를 고르거나 사용자 지명(userPinned)을 기록` }); }
  if (palette && last?.palette) { const a = paletteFamily(palette), b = paletteFamily(last.palette); if (a && b && a === b) findings.push({ id: "palette.history-repeat", severity: "🔴", detail: `베이스 팔레트 계열 ${a}가 직전 실행(${last.date}, ${last.palette})과 같다 — 계열을 바꾼다` }); }
  // 인용: 방향 7축 중 3축 이상이 마지막 실행과 달라야 한다(wiki/directions.md 유도 절차 0) — 3 미만이면 같은 형태의 반복
  if (axes && last?.axes) { const diff = AXES.filter((k) => axes[k] && last.axes[k] && axes[k] !== last.axes[k]).length; const known = AXES.filter((k) => axes[k] && last.axes[k]).length; if (known && diff < AXES_MIN_DIFF) findings.push({ id: "direction.axes-repeat", severity: "🟡", detail: `7축 중 직전 실행과 다른 축 ${diff}/${known} (< ${AXES_MIN_DIFF}) — 방향이 같은 조합으로 수렴했다` }); }
  return { findings, compared: { runs: runs.length, last: last?.date } };
}

export function parseAxes(s) { if (!s) return null; const o = {}; for (const part of String(s).split(",")) { const [k, v] = part.split("="); if (k && v) o[k.trim()] = v.trim(); else if (k && AXES[Object.keys(o).length]) o[AXES[Object.keys(o).length]] = k.trim(); } return Object.keys(o).length ? o : null; }

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const cmd = args._[0];
  if (!cmd) { console.error("usage: history.mjs check|append|list --lead x [--palette #hex] [--axes typo=..,color=..] [--project p] [--pinned]"); exit(2); }
  const hist = (await load()) || { version: 1, runs: [] };
  if (cmd === "list") { for (const r of hist.runs) console.log(`${r.date} ${r.project || "-"} lead=${r.lead} palette=${r.palette || "-"} axes=${r.axes ? Object.values(r.axes).join("/") : "-"}`); if (!hist.runs.length) console.log("(이력 없음)"); exit(0); }
  const entry = { lead: args.lead || null, palette: args.palette || null, axes: parseAxes(args.axes), project: args.project || null };
  if (cmd === "check") { const r = check(hist.runs.length ? hist : null, entry); for (const f of r.findings) console.log(`${f.severity} ${f.id} — ${f.detail}`); if (!r.findings.length) console.log(`✅ 최근 ${r.compared.runs}회와 겹치지 않는다`); exit(r.findings.some((f) => f.severity === "🔴") ? 1 : 0); }
  if (cmd === "append") { hist.runs.push({ ...entry, date: new Date().toISOString().slice(0, 10), userPinned: !!args.pinned, note: args.note || "" }); await writeFile(historyPath(), JSON.stringify(hist, null, 2)); console.log(`append → ${historyPath()} (${hist.runs.length}회)`); exit(0); }
  console.error(`알 수 없는 명령 ${cmd}`); exit(2);
}
