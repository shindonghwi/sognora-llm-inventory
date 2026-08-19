#!/usr/bin/env node
/**
 * sg-growth-expose 감사 계측기 — 산문이던 처분을 기계로 내린다.
 *
 * 웹 감사:   node audit.mjs --origin <url> [--locales en,ko] [--paths <file>] [--out <dir>] [--max-pages 30]
 * 프리플라이트: node audit.mjs --preflight <repoDir>          (수정 착수 가능 여부 — 철칙 1)
 * 리스팅 검증: node audit.mjs --listing <dir> --store play|appstore
 *
 * 의존성 0 (Node 내장 fetch·fs). SSR 체크는 의도적으로 JS 없는 raw GET이다.
 * UA 원장은 crawlers.json — 각 행에 1차 출처와 대조일. 값 갱신 시 checkedAt 갱신.
 *
 * 판정: red(수정 필수) / yellow(권고) / intent(의도 확인 전 수정 금지) / note(정보)
 * fix:  auto(스킬이 수정 가능) / report-only(보고만 — 아키텍처·무효 지시어) / forbidden(불가침 — 훈련 옵트아웃)
 * exit: 0 clean(green·note뿐) / 1 RED 존재 / 2 preflight 더티(수정 착수 금지) / 3 실행 오류
 */
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const TIMEOUT = 10_000;
const args = parseArgs(argv.slice(2));

// ---- 휴리스틱 임계 (스펙이 아니라 관행·실측 기반 — 출력에 그렇게 명시한다) ----
const SSR_RED = 150;    // CSR 빈 셸 실측 < 150자 (nolpop 실측 랜딩 2,877자)
const SSR_YELLOW = 500;
const TITLE_LEN = 60;   // 표시 절단 관행 — 공식 스펙 아님
const DESC_LEN = 160;   // 동일

const findings = [];
const add = (id, verdict, evidence, fix) => findings.push({ id, verdict, evidence, fix });

const STORE_LIMITS = {
  play: {  // 1차: support.google.com/googleplay/android-developer/answer/9859152
    "title.txt": { max: 30, req: true },
    "short_description.txt": { max: 80, req: true },
    "full_description.txt": { max: 4000, req: true },
  },
  appstore: {  // 1차: developer.apple.com app-information + product-page (설명·릴리스노트 4000은 1차 미확인 — 2차 일치)
    "name.txt": { max: 30, req: true },
    "subtitle.txt": { max: 30, req: false },
    "keywords.txt": { max: 100, req: true },
    "description.txt": { max: 4000, req: true, unverified: true },
    "promotional_text.txt": { max: 170, req: false },
    "release_notes.txt": { max: 4000, req: false, unverified: true },
  },
};

if (args.preflight) exit(await preflight(args.preflight));
else if (args.listing) exit(await listing(args.listing, args.store));
else if (args.origin) exit(await webAudit());
else {
  console.error("usage: audit.mjs --origin <url> [--locales en,ko] [--paths <file>] [--out <dir>]\n" +
    "       audit.mjs --preflight <repoDir>\n       audit.mjs --listing <dir> --store play|appstore");
  exit(3);
}

// ================= 프리플라이트 (철칙 1: 복원 지점 없이 수정 금지) =================

async function preflight(dir) {
  const git = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  if (git("rev-parse", "--is-inside-work-tree").stdout.trim() !== "true") {
    console.log("preflight: git 아님 — 수정 시 .bak 백업 경로를 쓸 것 (git 안전망 없음)");
    return 0;
  }
  const dirty = git("status", "--porcelain").stdout.trim();
  if (dirty) {
    console.log("preflight: DIRTY — 수정 착수 금지. 스냅샷 커밋 또는 작업 브랜치를 먼저 만들 것:");
    console.log(dirty.split("\n").slice(0, 20).map((l) => "  " + l).join("\n"));
    return 2;
  }
  console.log(`preflight: clean (HEAD ${git("rev-parse", "--short", "HEAD").stdout.trim()}) — 수정 후 한 커밋으로 묶고 해시를 보고에 기재`);
  return 0;
}

// ================= 리스팅 자수 검증 (자수는 코드포인트 — Play 1차: 전각·반각 동일) =================

async function listing(dir, store) {
  const limits = STORE_LIMITS[store];
  if (!limits) { console.error("--store play|appstore 필요"); return 3; }
  // 로케일 하위 디렉토리가 있으면 로케일별, 없으면 dir 자체를 단일 로케일로
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) { console.error(`읽기 실패: ${dir}`); return 3; }
  const localeDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const targets = localeDirs.length ? localeDirs.map((l) => [l, join(dir, l)]) : [["(단일)", dir]];
  for (const [locale, d] of targets) {
    for (const [file, rule] of Object.entries(limits)) {
      const p = join(d, file);
      const st = await stat(p).catch(() => null);
      if (!st) {
        if (rule.req) add("L1", "yellow", `${locale}/${file} 없음 — ${store} 필수 필드`, "auto");
        continue;
      }
      const raw = (await readFile(p, "utf8")).replace(/\r?\n$/, "");
      const n = [...raw].length; // 코드포인트 계수 — Play 1차 명시: full-width/half-width 동일 자수
      if (n > rule.max) add("L2", "red", `${locale}/${file} ${n}자 > 한도 ${rule.max}${rule.unverified ? "(한도 1차 미확인 — 2차 일치)" : ""}`, "auto");
      if (store === "appstore" && file === "keywords.txt" && /,\s/.test(raw))
        add("L3", "yellow", `${locale}/keywords.txt 쉼표 뒤 공백 — Apple 1차: "terms separated by commas and no spaces"`, "auto");
    }
  }
  return report(null);
}

// ================= 웹 감사 =================

async function webAudit() {
  const origin = args.origin.replace(/\/$/, "");
  const originHost = new URL(origin).host;
  const maxPages = Number(args["max-pages"] ?? 30);

  // ---- R1·R2·R3: robots.txt ----
  const robotsRes = await get(`${origin}/robots.txt`);
  let robots = null;
  if (!robotsRes || robotsRes.status !== 200) {
    add("R1", "yellow", `robots.txt 없음(${robotsRes?.status ?? "요청 실패"}) — 생성 대상`, "auto");
  } else {
    robots = parseRobots(robotsRes.body);
    if (!robots.sitemaps.length) add("R3", "yellow", "robots.txt에 Sitemap: 선언 없음", "auto");
    await crawlerVerdicts(robots);
  }

  // ---- sitemap 수집 ----
  const sitemapUrl = robots?.sitemaps[0] ?? `${origin}/sitemap.xml`;
  const entries = await loadSitemap(rehost(sitemapUrl, origin, originHost), origin, originHost);
  if (!entries.size) add("S0", "red", `sitemap 없음 또는 비어 있음 (${sitemapUrl})`, "auto");

  const locales = (args.locales ?? guessLocales(entries)).split(",").map((s) => s.trim()).filter(Boolean);

  // ---- H1·H2: hreflang 상호참조 (build가 절대 못 잡는 1순위) ----
  const seen = new Set();
  for (const [key, e] of entries) {
    if (!e.alts.size) continue;
    const values = [...e.alts.values()];
    if (!values.includes(key))
      add("H1", "red", `자기참조 누락: ${e.loc} 의 alternates에 자기 자신이 없음`, "auto");
    for (const [lang, href] of e.alts) {
      if (lang === "x-default") continue;
      const target = entries.get(href);
      if (!target) {
        if (!seen.has(`miss:${href}`)) { seen.add(`miss:${href}`); add("H1", "red", `alternate 대상이 sitemap에 없음: ${e.loc} → ${lang} → ${href}`, "auto"); }
      } else if (![...target.alts.values()].includes(key)) {
        const k = `recip:${[key, href].sort().join("|")}`;
        if (!seen.has(k)) { seen.add(k); add("H1", "red", `비상호 hreflang: ${e.loc} → ${href} 인데 역방향 참조 없음`, "auto"); }
      }
    }
    if (!e.alts.has("x-default")) {
      const k = `xd:${values.sort().join("|")}`;
      if (!seen.has(k)) { seen.add(k); add("H2", "yellow", `x-default 없음: ${e.loc} 그룹`, "auto"); }
    }
  }

  // ---- S1·S2 + 페이지 체크 ----
  const paths = args.paths
    ? (await readFile(args.paths, "utf8")).split("\n").map((s) => s.trim()).filter(Boolean).map((p) => origin + p)
    : [...entries.values()].map((e) => e.fetchUrl);
  const pages = [...new Map(paths.map((u) => [norm(u), u])).values()].slice(0, maxPages);
  if (paths.length > maxPages) add("S0", "note", `페이지 ${paths.length}개 중 ${maxPages}개만 검사(--max-pages)`, "report-only");

  const byLocale = new Map();
  for (const url of pages) {
    const res = await get(rehost(url, origin, originHost));
    if (!res) { add("S1", "red", `요청 실패: ${url}`, "auto"); continue; }
    if (res.status >= 400) { add("S1", "red", `sitemap에 ${res.status} 포함: ${url}`, "auto"); continue; }
    if (res.status >= 300) {
      const loc = res.headers.get("location") ?? "?";
      const slashOnly = norm(new URL(loc, url).href) === norm(url);
      add("S1", slashOnly ? "yellow" : "red", `sitemap에 리다이렉트(${res.status}) 포함: ${url} → ${loc}${slashOnly ? " (trailing-slash 차이)" : ""}`, "auto");
      continue;
    }
    const page = parsePage(res.body);
    const path = new URL(url).pathname;
    const locale = localeOf(path, locales);
    if (!byLocale.has(locale)) byLocale.set(locale, []);
    byLocale.get(locale).push({ url, path, ...page });

    // H1b: 페이지 hreflang이 있으면 sitemap과 대조 (없으면 통과 — sitemap 단독도 유효)
    const ent = entries.get(norm(url));
    if (ent && page.hreflangs.size) {
      const pv = new Set([...page.hreflangs.values()].map(norm));
      const sv = new Set([...ent.alts.values()]);
      if ([...pv].some((v) => !sv.has(v)) || [...sv].some((v) => !pv.has(v)))
        add("H1", "yellow", `페이지·sitemap hreflang 불일치: ${url}`, "auto");
    }
    // H3: canonical
    if (!page.canonical) add("H3", "yellow", `canonical 없음: ${url}`, "auto");
    else {
      const c = norm(new URL(page.canonical, url).href);
      if (c !== norm(url)) {
        const crossLocale = ent && [...ent.alts.values()].includes(c);
        add("H3", crossLocale ? "red" : "yellow",
          `${crossLocale ? "타 로케일 canonical(로케일 표면 디인덱스 위험)" : "비자기참조 canonical"}: ${url} → ${page.canonical}`, "auto");
      }
    }
    // G1: SSR 가시성 (임계는 휴리스틱)
    if (page.textLen < SSR_RED)
      add("G1", "red", `JS 없이 가시 텍스트 ${page.textLen}자 < ${SSR_RED}(휴리스틱 임계 — CSR 빈 셸 실측 기준): ${url}. 렌더링 아키텍처는 이 스킬 수정 범위 밖`, "report-only");
    else if (page.textLen < SSR_YELLOW)
      add("G1", "yellow", `가시 텍스트 ${page.textLen}자(휴리스틱 임계 ${SSR_YELLOW} 미만): ${url}`, "report-only");
    // M1: 존재
    if (!page.title) add("M1", "red", `<title> 없음: ${url}`, "auto");
    if (!page.desc) add("M1", "red", `meta description 없음: ${url}`, "auto");
    // M3: 길이 (표시 절단 관행 — 공식 스펙 아님)
    if (page.title && [...page.title].length > TITLE_LEN)
      add("M3", "yellow", `title ${[...page.title].length}자 > ${TITLE_LEN}(표시 절단 관행 — 공식 제한 아님): ${url}`, "auto");
    if (page.desc && [...page.desc].length > DESC_LEN)
      add("M3", "yellow", `description ${[...page.desc].length}자 > ${DESC_LEN}(표시 절단 관행): ${url}`, "auto");
    // O1: 카드
    const miss = [!page.ogTitle && "og:title", !page.ogImage && "og:image", !page.twitterCard && "twitter:card"].filter(Boolean);
    if (miss.length) add("O1", "yellow", `${miss.join("·")} 없음: ${url}`, "auto");
    // J1: 루트 페이지 JSON-LD
    if ((path === "/" || locales.some((l) => path === `/${l}` || path === `/${l}/`)) &&
        !page.jsonldTypes.some((t) => /Organization|WebSite/i.test(t)))
      add("J1", "yellow", `루트에 Organization/WebSite JSON-LD 없음: ${url}`, "auto");
  }

  // M2: 로케일 내 중복 title/description
  for (const [locale, list] of byLocale) {
    for (const field of ["title", "desc"]) {
      const groups = new Map();
      for (const p of list) if (p[field]) { const k = p[field]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.path); }
      for (const [val, ps] of groups) if (ps.length > 1)
        add("M2", "yellow", `[${locale}] ${field === "title" ? "title" : "description"} 중복 (${ps.join(", ")}): "${val.slice(0, 50)}"`, "auto");
    }
  }

  // S2: 로케일 커버리지 → INTENT (기계는 결함을 단정하지 않는다)
  if (locales.length > 1) {
    const cover = new Map();
    for (const key of entries.keys()) {
      const path = new URL(key).pathname;
      const base = delocalize(path, locales);
      if (!cover.has(base)) cover.set(base, new Set());
      cover.get(base).add(localeOf(path, locales));
    }
    for (const [base, ls] of cover) {
      const missing = locales.filter((l) => !ls.has(l));
      if (missing.length)
        add("S2", "intent", `경로 ${base} 에 로케일 ${missing.join(",")} 없음 — 의도(명시적 filter·indexable 플래그)인지 코드 확인 전 수정 금지`, "report-only");
    }
  }

  return report({ origin, locales, pagesScanned: pages.length });
}

// ---- 크롤러 판정: crawlers.json 원장 기반 (처분을 데이터가 내린다) ----

async function crawlerVerdicts(robots) {
  const ledger = JSON.parse(await readFile(join(HERE, "crawlers.json"), "utf8"));
  if (blocked(robots, "*")) {
    add("R2", "red", "`*` 전면 차단 — 모든 크롤러(검색엔진 포함)에서 제외 상태", "auto");
    return; // 개별 판정은 중복이므로 생략
  }
  for (const c of ledger.crawlers) {
    const own = ownGroup(robots, c.ua);
    if (!own) continue; // 개별 그룹 없음 = `*` 정책을 따름(위에서 판정)
    const full = blocked(robots, c.ua);
    if (!c.robotsBound) {
      if (own.rules.some((r) => r.type === "disallow"))
        add("R2", "note", `${c.ua} Disallow는 무효 지시어(robots.txt 비구속 — ${c.source}). 지우든 두든 동작이 안 바뀜`, "report-only");
    } else if (full && c.class === "training") {
      add("R2", "yellow", `${c.ua} 차단 — 훈련 옵트아웃은 소유자의 권리 의사 표시. 해제 금지, 보고만 (${c.source})`, "forbidden");
    } else if (full) {
      add("R2", "red", `${c.ua} 차단 — ${c.blockedEffect} (1차: ${c.source})`, "auto");
    }
  }
  for (const l of ledger.legacy) {
    if (ownGroup(robots, l.ua))
      add("R2", "note", `${l.ua} — ${l.status}`, "report-only");
  }
}

// ================= 파서·유틸 =================

async function get(url) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT), headers: { "user-agent": "sg-growth-expose-audit/1.0" } });
    return { status: res.status, headers: res.headers, body: res.status >= 300 && res.status < 400 ? "" : await res.text() };
  } catch { return null; }
}

function rehost(url, origin, originHost) {
  const u = new URL(url, origin);
  if (u.host !== originHost) { const o = new URL(origin); u.protocol = o.protocol; u.host = o.host; }
  return u.href;
}

function norm(url) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return u.origin + (p || "/");
  } catch { return url; }
}

function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let cur = null, rulesStarted = false;
  for (let line of text.split("\n")) {
    line = line.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, val] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === "user-agent") {
      if (!cur || rulesStarted) { cur = { agents: [], rules: [] }; groups.push(cur); rulesStarted = false; }
      cur.agents.push(val.toLowerCase());
    } else if ((key === "disallow" || key === "allow") && cur) {
      cur.rules.push({ type: key, path: val });
      rulesStarted = true;
    } else if (key === "sitemap") sitemaps.push(val);
  }
  return { groups, sitemaps };
}

function ownGroup(robots, ua) { return robots.groups.find((g) => g.agents.includes(ua.toLowerCase())); }
function blocked(robots, ua) {
  const g = ownGroup(robots, ua) ?? (ua === "*" ? null : ownGroup(robots, "*"));
  if (!g) return false;
  return g.rules.some((r) => r.type === "disallow" && r.path === "/") &&
        !g.rules.some((r) => r.type === "allow" && r.path === "/");
}

async function loadSitemap(url, origin, originHost, depth = 0) {
  const out = new Map();
  if (depth > 1) return out;
  const res = await get(url);
  if (!res || res.status !== 200) return out;
  if (/<sitemapindex/i.test(res.body)) {
    const children = [...res.body.matchAll(/<sitemap>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>/gi)].map((m) => m[1]).slice(0, 5);
    for (const c of children)
      for (const [k, v] of await loadSitemap(rehost(c, origin, originHost), origin, originHost, depth + 1)) out.set(k, v);
    return out;
  }
  for (const [, block] of res.body.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const loc = block.match(/<loc>\s*(.*?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    const alts = new Map();
    for (const [tag] of block.matchAll(/<xhtml:link\b[^>]*>/gi)) {
      const lang = tag.match(/hreflang\s*=\s*["']([^"']+)["']/i)?.[1];
      const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
      if (lang && href) alts.set(lang, norm(rehost(href, origin, originHost)));
    }
    // fetchUrl은 원본 loc 그대로 — 정규화 URL로 페치하면 서버의 trailing-slash 301을 도구가 만들어내는 오탐이 된다
    out.set(norm(rehost(loc, origin, originHost)), { loc, fetchUrl: rehost(loc, origin, originHost), alts });
  }
  return out;
}

function parsePage(html) {
  const attr = (tag, name) => tag?.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
  const findTag = (re) => html.match(re)?.[0];
  const metaBy = (kind, val) => {
    for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi))
      if (new RegExp(`${kind}\\s*=\\s*["']${val}["']`, "i").test(tag)) return attr(tag, "content");
    return undefined;
  };
  const hreflangs = new Map();
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']alternate["']/i.test(tag)) continue;
    const lang = attr(tag, "hreflang");
    const href = attr(tag, "href");
    if (lang && href) hreflangs.set(lang, href);
  }
  const jsonldTypes = [];
  for (const [, body] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { for (const t of JSON.stringify(JSON.parse(body).valueOf()).matchAll(/"@type"\s*:\s*"([^"]+)"/g)) jsonldTypes.push(t[1]); }
    catch { /* 깨진 JSON-LD는 타입 미상으로 둔다 */ }
  }
  let text = html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  text = text.replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  return {
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim(),
    desc: metaBy("name", "description"),
    canonical: attr(findTag(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i), "href"),
    ogTitle: metaBy("property", "og:title"),
    ogImage: metaBy("property", "og:image"),
    twitterCard: metaBy("name", "twitter:card"),
    hreflangs, jsonldTypes, textLen: text.length,
  };
}

function localeOf(path, locales) {
  const seg = path.split("/")[1];
  return locales.includes(seg) ? seg : (locales[0] ?? "default");
}
function delocalize(path, locales) {
  const seg = path.split("/")[1];
  if (!locales.includes(seg)) return path;
  const rest = path.slice(seg.length + 1);
  return rest || "/";
}
function guessLocales(entries) {
  const segs = new Set();
  for (const key of entries.keys()) {
    const s = new URL(key).pathname.split("/")[1];
    if (/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(s)) segs.add(s);
  }
  return ["", ...segs].filter(Boolean).join(",") || "";
}

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith("--")) {
      const key = list[i].slice(2);
      const val = list[i + 1] && !list[i + 1].startsWith("--") ? list[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

// ================= 보고 =================

async function report(meta) {
  const rank = { red: 0, intent: 1, yellow: 2, note: 3 };
  findings.sort((a, b) => (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9) || a.id.localeCompare(b.id));
  const icon = { red: "🔴", yellow: "🟡", intent: "🟠", note: "·" };
  for (const f of findings.slice(0, 60))
    console.log(`${icon[f.verdict] ?? "?"} [${f.id}] (fix:${f.fix}) ${f.evidence}`);
  if (findings.length > 60) console.log(`… 외 ${findings.length - 60}건 (audit.json 참조)`);
  const count = (v) => findings.filter((f) => f.verdict === v).length;
  console.log(`\n판정: 🔴${count("red")} 🟠intent ${count("intent")} 🟡${count("yellow")} ·note ${count("note")}` +
    (meta ? `  (${meta.origin} · 페이지 ${meta.pagesScanned} · 로케일 ${meta.locales.join(",") || "-"})` : ""));
  console.log("fix:forbidden = 불가침(훈련 옵트아웃) · fix:report-only = 보고만 · intent = 의도 확인 전 수정 금지");
  if (args.out) {
    await mkdir(args.out, { recursive: true });
    await writeFile(join(args.out, "audit.json"), JSON.stringify({ meta: { ...meta, scannedAt: new Date().toISOString() }, findings }, null, 2));
    console.log(`→ ${join(args.out, "audit.json")}`);
  }
  return count("red") ? 1 : 0;
}
