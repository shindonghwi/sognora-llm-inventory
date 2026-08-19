/**
 * contract.mjs — 페이지 계약(`_page/contract.json`)의 스키마·로더·발판 생성기
 *
 * 왜 있나 — 실전 사고: 감사에서 도구 화면을 "제일 잘 만들어졌다"고 보고했는데
 * **기획 의도와 다른 화면**이었다. 그다음 사고는 더 나쁘다 — 그래서 "의도가 뭐였냐"고
 * 사람에게 되물었다. **매번 되묻는 것은 스킬의 실패다.**
 *
 * 원인은 예의가 아니라 구조였다. sg-landing-forge는 `_forge/contract.md`·`tokens.json`을
 * 남겨서 다음 실행이 그걸 읽고 무인으로 간다. page-craft는 P0 계약을 **말로만** 하고
 * 어디에도 남기지 않았다. 그러니 실행마다 유형을 추측하고, 추측이 막히면 사람을 부른다.
 *
 * 이 파일이 그 자리를 만든다: **의도를 한 번 선언해 파일로 굳히고, 이후 판정은 그 파일 대비로 무인 수행.**
 *
 * 의도를 어떻게 기계가 보나 — 통째로는 못 본다. 그래서 **검사 가능한 형태로만** 받는다:
 *   must     : 이 화면에 반드시 있어야 하는 것
 *   mustNot  : 이 화면에 있으면 안 되는 것
 * 각 항목은 `css:<셀렉터>`(요소 존재) 또는 그냥 문자열(본문 텍스트 포함, 정규식 허용).
 * **존재만 확인한다** — 그것이 잘 만들어졌는지는 여전히 사람의 일이고, 보고서에 그렇게 새긴다.
 *
 * usage:
 *   node contract.mjs --init --base http://localhost:3010 --routes /,/pricing,/contact [--locales "",/ko] [--out _page/contract.json]
 *   node contract.mjs --check _page/contract.json      # 스키마·미기입(TODO) 검사
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { argv, exit } from "node:process";

export const TYPES = ["landing", "catalog", "tool", "pricing", "form", "dashboard", "document", "about"];
const VERB = { landing: "read", about: "read", document: "read", catalog: "do", tool: "do", pricing: "do", form: "do", dashboard: "do" };
export const TODO = "TODO";

/** 유형 문자열 → {name, verb}. §0b에 없는 화면은 `read:<라벨>`·`do:<라벨>`로 그 자리에서 선언한다. */
export function parseType(raw) {
  if (typeof raw !== "string") return null;
  const m = /^(read|do):(.+)$/.exec(raw.trim());
  if (m) return { name: m[2], verb: m[1], declared: true };
  const t = raw.trim();
  if (VERB[t]) return { name: t, verb: VERB[t], declared: false };
  return null;
}

export async function loadContract(path) {
  let raw;
  try { raw = await readFile(path, "utf8"); }
  catch { throw new Error(`계약 파일을 못 읽었다: ${path}\n먼저 만들어라: node contract.mjs --init --base <URL> --routes <라우트들>`); }
  let c;
  try { c = JSON.parse(raw); }
  catch (e) { throw new Error(`계약 파일이 JSON이 아니다: ${path} — ${e.message}`); }

  const errs = [];
  const todos = [];
  if (!c.baseUrl) errs.push("baseUrl 없음");
  if (!Array.isArray(c.pages) || !c.pages.length) errs.push("pages가 비었다");
  const locales = Array.isArray(c.locales) && c.locales.length ? c.locales : [""];

  const pages = [];
  for (const [i, p] of (c.pages ?? []).entries()) {
    const at = `pages[${i}]${p?.route ? ` (${p.route})` : ""}`;
    if (!p?.route) { errs.push(`${at}: route 없음`); continue; }
    const type = parseType(p.type);
    if (!type) {
      // TODO는 "아직 안 정했다"는 정직한 상태다 — 에러가 아니라 미기입으로 센다.
      if (p.type === TODO || p.type == null) todos.push(`${at}: type 미기입`);
      else errs.push(`${at}: 알 수 없는 유형 "${p.type}" — ${TYPES.join("|")} 또는 read:<라벨>·do:<라벨>`);
    }
    if (!p.decision || p.decision === TODO) todos.push(`${at}: decision 미기입(이 화면이 돕는 결정 한 문장)`);
    for (const k of ["must", "mustNot"]) {
      if (p[k] != null && !Array.isArray(p[k])) errs.push(`${at}: ${k}는 배열이어야 한다`);
    }
    pages.push({
      route: p.route,
      type,
      decision: p.decision ?? null,
      must: (p.must ?? []).filter((x) => typeof x === "string" && x !== TODO),
      mustNot: (p.mustNot ?? []).filter((x) => typeof x === "string" && x !== TODO),
      skip: p.skip === true,
      expectStatus: Number.isInteger(p.expectStatus) ? p.expectStatus : null,
      locales: Array.isArray(p.locales) && p.locales.length ? p.locales : locales,
    });
  }
  if (errs.length) throw new Error(`계약 파일 오류 ${errs.length}건:\n  - ${errs.join("\n  - ")}`);
  return {
    baseUrl: String(c.baseUrl).replace(/\/$/, ""),
    tokens: c.tokens && c.tokens !== TODO ? c.tokens : null,
    src: c.src && c.src !== TODO ? String(c.src) : null, // 컴포넌트 층 검사 대상
    locales, pages, todos,
  };
}

export function urlsOf(contract, page) {
  return page.locales.map((loc) => contract.baseUrl + (loc || "") + (page.route === "/" ? "" : page.route) || contract.baseUrl + "/");
}

// ── CLI ──────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {};
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); args[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }

  if (args.check) {
    try {
      const c = await loadContract(String(args.check));
      console.log(`✅ 스키마 이상 없음 — 페이지 ${c.pages.length}개 · 로케일 ${c.locales.length}개`);
      if (c.todos.length) {
        console.log(`\n🟡 미기입 ${c.todos.length}건 — 사람이 채워야 한다(기계가 지어내지 않는다):\n  - ${c.todos.join("\n  - ")}`);
        exit(1);
      }
      exit(0);
    } catch (e) { console.error("🔴 " + e.message); exit(2); }
  }

  if (args.init) {
    if (!args.base || !args.routes) { console.error("usage: contract.mjs --init --base <URL> --routes </a,/b,...> [--locales \"\",/ko] [--out _page/contract.json]"); exit(2); }
    const routes = String(args.routes).split(",").map((s) => s.trim()).filter(Boolean);
    const locales = args.locales === true || args.locales == null ? [""] : String(args.locales).split(",").map((s) => s.trim());
    const out = String(args.out ?? "_page/contract.json");
    const doc = {
      version: 1,
      $comment: "sg-page-craft 페이지 계약. 사람이 한 번 채우면 이후 검사는 이 파일 대비로 무인 수행된다. TODO는 기계가 지어내지 않는다.",
      baseUrl: String(args.base).replace(/\/$/, ""),
      locales,
      src: "src",
      tokens: TODO,
      pages: routes.map((route) => ({
        route,
        type: TODO,
        decision: TODO,
        must: [],
        mustNot: [],
      })),
    };
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(doc, null, 2) + "\n");
    console.log(
      `${out} 생성 — 페이지 ${routes.length}개.\n\n` +
      `이제 각 항목을 채워라(기계가 지어내지 않는다):\n` +
      `  type      ${TYPES.join("|")} 또는 read:<라벨>·do:<라벨>\n` +
      `  decision  이 화면이 돕는 결정 한 문장\n` +
      `  must      반드시 있어야 하는 것 — "css:input[type=file]" 또는 "사진 업로드"(본문 텍스트)\n` +
      `  mustNot   있으면 안 되는 것 — 예: "월 [0-9,]+원"\n\n` +
      `채운 뒤: node contract.mjs --check ${out}`);
    exit(0);
  }

  console.error("usage: contract.mjs --init --base <URL> --routes </a,/b,...> [--locales] [--out]\n       contract.mjs --check <계약파일>");
  exit(2);
}
