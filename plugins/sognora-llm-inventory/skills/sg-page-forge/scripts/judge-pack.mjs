#!/usr/bin/env node
/**
 * judge-pack.mjs — 사람 축 판정 브리프를 조립한다. wiki/judge/*.md에서 **블록인용(`>`) 부분만** 뽑아 <치환 변수>를 채우고 qa/judge/<name>.md로 낸다.
 * 근거·실전 사고·처분 절·위키 링크는 판정자에게 주지 않는다(블라인드). 공통 꼬리말(ai-slop-judge.md)은 모든 브리프 끝에 붙인다.
 *
 * usage: node judge-pack.mjs            인자 없이 — .sognora/page/qa, 계약의 첫 페이지, 계약 comp 필드의 시안, 계약 persona/competitors
 *   (내부 옵션 --qa --route --comp --persona --competitors --genre 는 남아 있지만 문서에 쓰지 않는다)
 * 산출: qa/judge/{comp-judge,ai-slop-judge,desire-judge,persona-judge,gatekeeper-judge,sameness-judge}.md — 각 파일 머리에 입력 캡처 목록. 미제공 입력(시안·경쟁)은 그 브리프 머리에 "미제공"으로 표기한다.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs, SKILL_ROOT } from "./_deps.mjs";

export const JUDGES = ["comp-judge", "ai-slop-judge", "desire-judge", "persona-judge", "gatekeeper-judge", "sameness-judge"];

/** 순수: 위키 문서에서 블록인용 문단들만 꺼낸다(연속 `>` 줄을 한 블록으로). "## 공통 꼬리말" 아래 블록은 tail로 분리. */
export function extractBrief(md) {
  const lines = String(md || "").split("\n"); const blocks = []; let cur = null, section = "";
  for (const l of lines) {
    if (/^#{2,3}\s/.test(l)) { section = l.replace(/^#+\s*/, ""); if (cur) { blocks.push(cur); cur = null; } continue; }
    if (/^>/.test(l)) { const t = l.replace(/^>\s?/, ""); if (!cur) cur = { section, text: [] }; cur.text.push(t); }
    else if (cur) { blocks.push(cur); cur = null; }
  }
  if (cur) blocks.push(cur);
  const tail = blocks.filter((b) => /공통 꼬리말/.test(b.section)).map((b) => b.text.join("\n")).join("\n");
  const body = blocks.filter((b) => !/공통 꼬리말/.test(b.section)).map((b) => b.text.join("\n")).join("\n\n");
  return { body, tail };
}

/** 순수: 치환 변수 채우기. 남은 <…> 자리표시자는 미치환 목록으로 돌려준다. */
export function fill(text, vars) {
  let out = text; for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v);
  const left = [...new Set((out.match(/<[^>\n]{1,40}>/g) || []).filter((m) => !/^<\/?[a-z]+>$/.test(m)))];
  return { text: out, unreplaced: left };
}

export async function pack(qa, { route = "/", comp = null, persona = "대상 사용자", competitors = [], genre = "랜딩" } = {}) {
  const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/[^\w가-힣-]+/g, "-").toLowerCase();
  const pageDir = join(qa, "pages", slug); let shots = [];
  try { shots = (await readdir(join(pageDir, "shots"))).filter((f) => f.endsWith(".png")).sort().map((f) => join(pageDir, "shots", f)); } catch { /* 캡처 없음 */ }
  const desk = shots.filter((f) => /1440x900/.test(f)), mob = shots.filter((f) => /390x844/.test(f));
  const deskList = desk.join("\n") || "(캡처 없음 — audit을 먼저 돌려라)", mobList = mob.join("\n") || "(없음)";
  const vars = {
    "<대상 캡처>": deskList, "<모바일 캡처>": mobList, "<desktop.png>": deskList, "<mobile.png>": mobList,
    "<시안>": comp || "(미제공 — 시안 경로를 --comp로)", "<board.png>": comp || "(미제공 — 시안 경로를 --comp로)",
    "<타깃 페르소나>": persona, "<경쟁A>": competitors[0] || "(미제공)", "<경쟁B>": competitors[1] || "(미제공)", "<장르>": genre, "<자산 목록>": join(qa, "..", "assets.md"),
  };
  const common = extractBrief(await readFile(join(SKILL_ROOT, "wiki", "judge", "ai-slop-judge.md"), "utf8").catch(() => "")).tail;
  const outDir = join(qa, "judge"); await mkdir(outDir, { recursive: true }); const made = [], na = [];
  for (const j of JUDGES) {
    let md; try { md = await readFile(join(SKILL_ROOT, "wiki", "judge", `${j}.md`), "utf8"); } catch { continue; }
    const { body } = extractBrief(md); if (!body) continue;
    const { text, unreplaced } = fill(body + (common ? `\n\n${common}` : ""), vars);
    const missing = [];
    if (j === "comp-judge" && !comp) missing.push("시안(--comp) 미제공 — 시안 대비 축(parity) 판정되지 않음");
    if (j === "desire-judge" && competitors.length < 2) missing.push("경쟁 캡처 2종 미제공 — '경쟁 −20 이내' 축 판정되지 않음(절대 점수만)");
    if (missing.length) na.push(...missing.map((m) => `${j}: ${m}`));
    const head = `<!-- judge-pack: ${route} · 입력 캡처 데스크톱 ${desk.length}·모바일 ${mob.length}${comp ? ` · 시안 ${comp}` : ""}${missing.length ? ` · 미제공: ${missing.join(" / ")}` : ""} · 판정자는 이 파일과 이미지만 본다(수치·JSON 금지) -->\n\n`;
    await writeFile(join(outDir, `${j}.md`), head + text + "\n"); made.push(`${j}.md`);
    if (unreplaced.length) na.push(`${j}: 미치환 자리표시자 ${unreplaced.join(" ")}`);
  }
  return { outDir, made, shots: shots.length, unmeasured: na };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const qa = args.qa || join(".sognora", "page", "qa");
  let c = null; try { c = JSON.parse(await readFile(join(qa, "..", "contract.json"), "utf8")); } catch { /* 계약 없이도 캡처만으로 조립 */ }
  const page = c?.pages?.find((p) => !p.skip) || null;
  const r = await pack(qa, { route: args.route || page?.route || "/", comp: args.comp || page?.comp || null, persona: args.persona || c?.persona || "대상 사용자", competitors: (args.competitors || (c?.competitors || []).join(",") || "").split(",").filter(Boolean), genre: args.genre || (page?.type === "landing" ? "랜딩" : "UI") });
  console.log(`judge-pack → ${r.outDir} (${r.made.join(", ")}) · 캡처 ${r.shots}장. 각 브리프를 신선한 컨텍스트에 문면 그대로 전달한다.`);
  for (const u of r.unmeasured) console.log(`미제공 ${u}`);
}
