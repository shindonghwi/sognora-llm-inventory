#!/usr/bin/env node
/**
 * sg-growth-expose 감사 계측기 — 산문이던 처분을 기계로 내린다.
 *
 * 인자는 최소다 — 스킬은 쓰기 편해야 한다(사용자 원칙). 필수는 --origin의 URL 하나.
 *   웹 감사:     node audit.mjs --origin <url>     로케일은 sitemap에서 자동 감지, 산출물 .sognora/growth/qa/audit.json
 *   대상 판별:   node audit.mjs --detect           cwd 기준(웹/앱/둘 다/판별 불가 — 파일 존재 검사, 결정적)
 *   프리플라이트: node audit.mjs --preflight        cwd 기준(수정 착수 가능 여부 — 철칙 1)
 *   리스팅 검증: node audit.mjs --listing          fastlane/metadata 또는 .sognora/growth/store-listing, 스토어는 파일명으로 자동 판별
 *   (고급, 문서에 내지 않는다: --locales --paths --out --max-pages --store — 기본값이 틀릴 때만)
 *
 * 의존성 0 (Node 내장 fetch·fs). SSR 체크는 의도적으로 JS 없는 raw GET이다.
 * UA 원장은 crawlers.json — 각 행에 1차 출처·대조일·처분(fix). 코드는 원장의 fix를 그대로 쓴다(이중 진실 금지).
 * 산출물은 항상 `.sognora/growth/` 아래(README ⑥).
 *
 * 판정: red(수정 필수) / yellow(권고) / intent(의도 확인 전 수정 금지) / note(정보)
 * fix:  auto(스킬이 수정 가능) / report-only(보고만 — 아키텍처·무효 지시어) / forbidden(불가침 — 훈련 옵트아웃)
 * exit: 0 clean(green·note뿐) / 1 RED 존재 / 2 preflight 더티(수정 착수 금지) / 3 실행 오류
 *
 * 테스트: 순수 함수(parsePage·parseSitemapIndex·parseUrlset·guessLocales·localeOf·listingFindings·detectTarget·
 * crawlerFindings·ledgerStaleness)는 export되어 네트워크 없이 검증된다(tests/*.test.mjs).
 */
import { readFile, writeFile, mkdir, readdir, stat, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { argv, exit } from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const TIMEOUT = 10_000;
const DEFAULT_OUT = ".sognora/growth/qa";   // README ⑥ 산출물 위치 규칙

// ---- 휴리스틱 임계 (스펙이 아니라 관행·실측 기반 — 출력에 그렇게 명시한다) ----
export const SSR_RED = 150;     // 실측: CSR 빈 셸 < 150자 (nolpop 실측 랜딩 2,877자)
export const SSR_YELLOW = 500;  // 실측: 헤더·푸터·내비만 SSR되고 본문이 CSR인 페이지가 300~450자 대에 분포(nolpop 2026-08 감사) — 그 위부터 "본문 있음"으로 본다
export const TITLE_LEN = 60;    // 표시 절단 관행 — 공식 스펙 아님
export const DESC_LEN = 160;    // 동일
export const LEDGER_STALE_DAYS = 180;   // 정의: 크롤러 문서 재대조 주기 — 6개월 넘은 checkedAt은 🟡(1차 출처 재확인 요구)

// 로케일 화이트리스트 — `/ai`·`/qa`·`/tv` 같은 2글자 경로를 로케일로 오인하던 것(실측)을 막는다.
// ISO 639-1 전수 + 지역 코드는 `xx-YY` 형식일 때만. 기준: IANA language subtag registry.
export const LOCALE_CODES = new Set(("aa ab af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu").split(" "));
export const isLocaleSeg = (s) => { if (!s) return false; const m = s.match(/^([a-z]{2})(?:-([A-Za-z]{2}|[A-Za-z]{4}))?$/); return !!m && LOCALE_CODES.has(m[1]); };

export const STORE_LIMITS = {
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

const findings = [];
const add = (id, verdict, evidence, fix) => findings.push({ id, verdict, evidence, fix });
let args = {};


// ================= 대상 판별 (rules.md §대상 판별 — 파일 존재 검사라 결정적) =================

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

/** 순수: {pkg, files} → {target, reasons}. target ∈ web|app|both|none. */
export function detectTarget({ pkg, files }) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);
  const reasons = [];
  const excluded = ["src-tauri", "electron", "react-native", "expo"].filter((s) => (s === "src-tauri" ? files.srcTauri : has(s)));
  const webFw = ["next", "react", "vite", "astro", "nuxt", "@remix-run/react", "svelte"].filter(has);
  const routing = files.routingDir || files.staticHtml;
  const appSignals = [files.brandBundleId && "brand.yaml bundle_id", files.androidDir && "android/", files.iosDir && "ios/", files.fastlane && "fastlane/", files.firebaseApp && "firebase 앱 설정"].filter(Boolean);
  let web = false;
  if (excluded.length) reasons.push(`웹 배제 신호: ${excluded.join(", ")} — 라우팅 디렉터리가 있어도 웹으로 보지 않는다`);
  else if (webFw.length && routing) { web = true; reasons.push(`웹: ${webFw.join(",")} + ${files.routingDir ? "라우팅 디렉터리" : "정적 html"}`); }
  else if (files.staticHtml && !webFw.length) { web = true; reasons.push("웹: 정적 html 사이트"); }
  const app = appSignals.length > 0; if (app) reasons.push(`앱: ${appSignals.join(", ")}`);
  const both = files.brandWebDomain && files.brandBundleId;
  if (both) reasons.push("brand.yaml에 web_domain + bundle_id — 둘 다");
  const target = (web && app) || both ? "both" : web ? "web" : app ? "app" : "none";
  if (target === "none") reasons.push(`판별 불가: 웹 프레임워크(${webFw.join(",") || "없음"})·라우팅(${routing ? "있음" : "없음"})·앱 신호(없음)`);
  return { target, reasons, excluded, webFw, appSignals };
}

async function readInputs(root) {
  let pkg = null; try { pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")); } catch { /* 없음 */ }
  let brand = ""; for (const b of ["brand.yaml", "brand.yml"]) { try { brand = await readFile(join(root, b), "utf8"); break; } catch { /* 없음 */ } }
  const routingDir = (await exists(join(root, "src/app"))) || (await exists(join(root, "app"))) || (await exists(join(root, "pages"))) || (await exists(join(root, "src/pages")));
  let staticHtml = false; try { staticHtml = (await readdir(root)).some((f) => /\.html?$/.test(f)); } catch { /* 없음 */ }
  let firebaseApp = false; try { firebaseApp = (await readdir(root)).some((f) => /^(google-services\.json|GoogleService-Info\.plist|firebase\.json)$/.test(f)); } catch { /* 없음 */ }
  return { pkg, files: { srcTauri: await exists(join(root, "src-tauri")), routingDir, staticHtml, androidDir: await exists(join(root, "android")), iosDir: await exists(join(root, "ios")), fastlane: await exists(join(root, "fastlane")),
    firebaseApp, brandBundleId: /^\s*bundle_id\s*:/m.test(brand), brandWebDomain: /^\s*web_domain\s*:/m.test(brand) } };
}

async function detectCli(root) {
  let r = detectTarget(await readInputs(root));
  if (r.target === "none") {   // 모노레포: 1단계 하위 package.json까지 스캔(rules.md)
    for (const sub of ["packages", "apps"]) {
      let kids = []; try { kids = await readdir(join(root, sub)); } catch { continue; }
      for (const k of kids) { const rr = detectTarget(await readInputs(join(root, sub, k))); if (rr.target !== "none") { rr.reasons.unshift(`모노레포 하위 ${sub}/${k}`); r = rr; break; } }
      if (r.target !== "none") break;
    }
  }
  console.log(`detect: ${r.target}\n${r.reasons.map((x) => "  - " + x).join("\n")}`);
  return r.target === "none" ? 1 : 0;
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

/** 순수: {locale: {file: text|null}} → findings. 필수 필드 누락은 red(제출 불가 — 자수 초과보다 심각). */
export function listingFindings(store, byLocale) {
  const limits = STORE_LIMITS[store]; const out = [];
  for (const [locale, files] of Object.entries(byLocale)) {
    for (const [file, rule] of Object.entries(limits)) {
      const raw = files[file];
      if (raw == null) { if (rule.req) out.push({ id: "L1", verdict: "red", evidence: `${locale}/${file} 없음 — ${store} 필수 필드(제출 불가)`, fix: "auto" }); continue; }
      const n = [...raw.replace(/\r?\n$/, "")].length; // 코드포인트 계수 — Play 1차 명시: full-width/half-width 동일 자수
      if (n > rule.max) out.push({ id: "L2", verdict: "red", evidence: `${locale}/${file} ${n}자 > 한도 ${rule.max}${rule.unverified ? "(한도 1차 미확인 — 2차 일치)" : ""}`, fix: "auto" });
      if (store === "appstore" && file === "keywords.txt" && /,\s/.test(raw)) out.push({ id: "L3", verdict: "yellow", evidence: `${locale}/keywords.txt 쉼표 뒤 공백 — Apple 1차: "terms separated by commas and no spaces"`, fix: "auto" });
    }
  }
  return out;
}

/** 리스팅 디렉터리 기본값 — 레포 관례(fastlane metadata) → 스킬 산출물 위치. 없으면 사용법 안내. */
async function defaultListingDir() {
  for (const c of ["fastlane/metadata/android", "fastlane/metadata", ".sognora/growth/store-listing", "store-listing"]) if (await exists(c)) return c;
  return ".sognora/growth/store-listing";
}
/** 순수: 파일명 집합으로 스토어를 판별한다 — 사람이 --store를 외우지 않게. */
export function guessStore(fileNames) {
  const f = new Set(fileNames);
  if (f.has("title.txt") || f.has("short_description.txt") || f.has("full_description.txt")) return "play";
  if (f.has("name.txt") || f.has("keywords.txt") || f.has("subtitle.txt")) return "appstore";
  return null;
}
async function listing(dir, store) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) { console.error(`읽기 실패: ${dir} — 리스팅 디렉터리(fastlane/metadata 또는 .sognora/growth/store-listing)가 없다`); return 3; }
  const localeDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const targets = localeDirs.length ? localeDirs.map((l) => [l, join(dir, l)]) : [["(단일)", dir]];
  if (!STORE_LIMITS[store]) {
    const names = new Set(); for (const [, d] of targets) for (const n of await readdir(d).catch(() => [])) names.add(n);
    store = guessStore([...names]);
    if (!store) { console.error(`스토어 판별 불가: ${dir}에 title.txt/short_description.txt(Play) 또는 name.txt/keywords.txt(App Store)가 없다`); return 3; }
  }
  const byLocale = {};
  for (const [locale, d] of targets) { byLocale[locale] = {}; for (const file of Object.keys(STORE_LIMITS[store])) { const st = await stat(join(d, file)).catch(() => null); byLocale[locale][file] = st ? await readFile(join(d, file), "utf8") : null; } }
  for (const f of listingFindings(store, byLocale)) add(f.id, f.verdict, f.evidence, f.fix);
  return report(null);
}

// ================= 웹 감사 =================

async function webAudit() {
  const origin = args.origin.replace(/\/$/, "");
  const originHost = new URL(origin).host;
  const maxPages = Number(args["max-pages"] ?? 30);   // 정의: 기본 30페이지 — 감사 1회 시간 상한(초과분은 note로 고지)

  // ---- R1·R2·R3: robots.txt ----
  const robotsRes = await get(`${origin}/robots.txt`);
  let robots = null;
  if (!robotsRes || robotsRes.status !== 200) {
    add("R1", "yellow", `robots.txt 없음(${robotsRes?.status ?? "요청 실패"}) — 생성 대상`, "auto");
  } else {
    robots = parseRobots(robotsRes.body);
    if (!robots.sitemaps.length) add("R3", "yellow", "robots.txt에 Sitemap: 선언 없음", "auto");
    const ledger = JSON.parse(await readFile(join(HERE, "crawlers.json"), "utf8"));
    for (const f of crawlerFindings(robots, ledger)) add(f.id, f.verdict, f.evidence, f.fix);
    for (const f of ledgerStaleness(ledger)) add(f.id, f.verdict, f.evidence, f.fix);
  }

  // ---- sitemap 수집 ----
  const sitemapUrl = robots?.sitemaps[0] ?? `${origin}/sitemap.xml`;
  const { entries, truncated } = await loadSitemap(rehost(sitemapUrl, origin, originHost), origin, originHost);
  if (!entries.size) add("S0", "red", `sitemap 없음 또는 비어 있음 (${sitemapUrl})`, "auto");
  if (truncated.length) add("S0", "note", `sitemap 인덱스 깊이 초과로 읽지 않은 자식 ${truncated.length}개 — 그 안의 URL은 H1·S1 판정에서 "미제공": ${truncated.slice(0, 3).join(", ")}`, "report-only");

  const locales = (args.locales ?? guessLocales(entries)).split(",").map((s) => s.trim()).filter(Boolean);

  // ---- H1·H2: hreflang 상호참조 (build가 절대 못 잡는 1순위) ----
  for (const f of hreflangFindings(entries)) add(f.id, f.verdict, f.evidence, f.fix);

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
    for (const f of pageFindings(url, path, page, entries.get(norm(url)), locales)) add(f.id, f.verdict, f.evidence, f.fix);
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

/** 순수: sitemap entries → H1·H2 findings. */
export function hreflangFindings(entries) {
  const out = []; const seen = new Set();
  const push = (id, verdict, evidence, fix) => out.push({ id, verdict, evidence, fix });
  for (const [key, e] of entries) {
    if (!e.alts.size) continue;
    const values = [...e.alts.values()];
    if (!values.includes(key)) push("H1", "red", `자기참조 누락: ${e.loc} 의 alternates에 자기 자신이 없음`, "auto");
    for (const [lang, href] of e.alts) {
      if (lang === "x-default") continue;
      const target = entries.get(href);
      if (!target) { if (!seen.has(`miss:${href}`)) { seen.add(`miss:${href}`); push("H1", "red", `alternate 대상이 sitemap에 없음: ${e.loc} → ${lang} → ${href}`, "auto"); } }
      else if (![...target.alts.values()].includes(key)) { const k = `recip:${[key, href].sort().join("|")}`; if (!seen.has(k)) { seen.add(k); push("H1", "red", `비상호 hreflang: ${e.loc} → ${href} 인데 역방향 참조 없음`, "auto"); } }
    }
    if (!e.alts.has("x-default")) { const k = `xd:${values.sort().join("|")}`; if (!seen.has(k)) { seen.add(k); push("H2", "yellow", `x-default 없음: ${e.loc} 그룹`, "auto"); } }
  }
  return out;
}

/** 순수: 페이지 파싱 결과 → H1b·H3·G1·M1·M3·O1·J1 findings. */
export function pageFindings(url, path, page, ent, locales) {
  const out = []; const push = (id, verdict, evidence, fix) => out.push({ id, verdict, evidence, fix });
  if (ent && page.hreflangs.size) {
    const pv = new Set([...page.hreflangs.values()].map(norm)); const sv = new Set([...ent.alts.values()]);
    if ([...pv].some((v) => !sv.has(v)) || [...sv].some((v) => !pv.has(v))) push("H1", "yellow", `페이지·sitemap hreflang 불일치: ${url}`, "auto");
  }
  if (!page.canonical) push("H3", "yellow", `canonical 없음: ${url}`, "auto");
  else { const c = norm(new URL(page.canonical, url).href); if (c !== norm(url)) { const crossLocale = ent && [...ent.alts.values()].includes(c); push("H3", crossLocale ? "red" : "yellow", `${crossLocale ? "타 로케일 canonical(로케일 표면 디인덱스 위험)" : "비자기참조 canonical"}: ${url} → ${page.canonical}`, "auto"); } }
  if (page.textLen < SSR_RED) push("G1", "red", `JS 없이 가시 텍스트 ${page.textLen}자 < ${SSR_RED}(휴리스틱 임계 — CSR 빈 셸 실측 기준): ${url}. 렌더링 아키텍처는 이 스킬 수정 범위 밖`, "report-only");
  else if (page.textLen < SSR_YELLOW) push("G1", "yellow", `가시 텍스트 ${page.textLen}자(휴리스틱 임계 ${SSR_YELLOW} 미만): ${url}`, "report-only");
  if (!page.title) push("M1", "red", `<title> 없음: ${url}`, "auto");
  if (!page.desc) push("M1", "red", `meta description 없음: ${url}`, "auto");
  if (page.title && [...page.title].length > TITLE_LEN) push("M3", "yellow", `title ${[...page.title].length}자 > ${TITLE_LEN}(표시 절단 관행 — 공식 제한 아님): ${url}`, "auto");
  if (page.desc && [...page.desc].length > DESC_LEN) push("M3", "yellow", `description ${[...page.desc].length}자 > ${DESC_LEN}(표시 절단 관행): ${url}`, "auto");
  const miss = [!page.ogTitle && "og:title", !page.ogImage && "og:image", !page.twitterCard && "twitter:card"].filter(Boolean);
  if (miss.length) push("O1", "yellow", `${miss.join("·")} 없음: ${url}`, "auto");
  const isRoot = path === "/" || locales.some((l) => path === `/${l}` || path === `/${l}/`);
  if (isRoot && !page.jsonldTypes.some((t) => /Organization|WebSite/i.test(t))) push("J1", "yellow", `루트에 Organization/WebSite JSON-LD 없음: ${url}`, "auto");
  return out;
}

// ---- 크롤러 판정: crawlers.json 원장 기반 — 처분(fix)은 원장이 내리고 코드는 옮긴다 ----

/** 순수: robots + ledger → R2 findings. severity는 class로, fix는 원장의 fix 필드로. */
export function crawlerFindings(robots, ledger) {
  const out = []; const push = (id, verdict, evidence, fix) => out.push({ id, verdict, evidence, fix });
  if (blocked(robots, "*")) { push("R2", "red", "`*` 전면 차단 — 모든 크롤러(검색엔진 포함)에서 제외 상태", "auto"); return out; }
  for (const c of ledger.crawlers) {
    const own = ownGroup(robots, c.ua);
    if (!own) continue; // 개별 그룹 없음 = `*` 정책을 따름(위에서 판정)
    const full = blocked(robots, c.ua);
    if (!c.robotsBound) { if (own.rules.some((r) => r.type === "disallow")) push("R2", "note", `${c.ua} Disallow는 무효 지시어(robots.txt 비구속 — ${c.source}). 지우든 두든 동작이 안 바뀜`, c.fix ?? "report-only"); }
    else if (full && c.class === "training") push("R2", "yellow", `${c.ua} 차단 — 훈련 옵트아웃은 소유자의 권리 의사 표시. 해제 금지, 보고만 (${c.source})`, c.fix ?? "forbidden");
    else if (full) push("R2", "red", `${c.ua} 차단 — ${c.blockedEffect} (1차: ${c.source})`, c.fix ?? "auto");
  }
  for (const l of ledger.legacy ?? []) if (ownGroup(robots, l.ua)) push("R2", "note", `${l.ua} — ${l.status}`, "report-only");
  return out;
}

/** 순수: 원장의 checkedAt이 LEDGER_STALE_DAYS를 넘으면 🟡 — 낡음은 데이터가 드러내야 한다(SKILL.md 철칙). */
export function ledgerStaleness(ledger, now = new Date()) {
  const rows = [...(ledger.crawlers ?? []), ...(ledger.legacy ?? [])];
  const stale = rows.filter((r) => r.checkedAt && (now - new Date(r.checkedAt)) / 86_400_000 > LEDGER_STALE_DAYS);
  if (!stale.length) return [];
  const oldest = stale.map((r) => r.checkedAt).sort()[0];
  return [{ id: "R0", verdict: "yellow", evidence: `crawlers.json 대조일 ${LEDGER_STALE_DAYS}일 초과 ${stale.length}행(가장 오래된 ${oldest}) — 1차 출처를 재대조하고 checkedAt을 갱신할 것: ${stale.map((r) => r.ua).join(", ")}`, fix: "report-only" }];
}

// ================= 파서·유틸 =================

async function get(url) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT), headers: { "user-agent": "sg-growth-expose-audit/1.0 (+https://github.com/shindonghwi/sognora-llm-inventory; 봇 차단 호스트에서는 S1이 오탐될 수 있다 — 결과에 명시)" } });
    return { status: res.status, headers: res.headers, body: res.status >= 300 && res.status < 400 ? "" : await res.text() };
  } catch { return null; }
}

function rehost(url, origin, originHost) {
  const u = new URL(url, origin);
  if (u.host !== originHost) { const o = new URL(origin); u.protocol = o.protocol; u.host = o.host; }
  return u.href;
}

export function norm(url) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return u.origin + (p || "/");
  } catch { return url; }
}

export function parseRobots(text) {
  const groups = []; const sitemaps = [];
  let cur = null, rulesStarted = false;
  for (let line of text.split("\n")) {
    line = line.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, val] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === "user-agent") { if (!cur || rulesStarted) { cur = { agents: [], rules: [] }; groups.push(cur); rulesStarted = false; } cur.agents.push(val.toLowerCase()); }
    else if ((key === "disallow" || key === "allow") && cur) { cur.rules.push({ type: key, path: val }); rulesStarted = true; }
    else if (key === "sitemap") sitemaps.push(val);
  }
  return { groups, sitemaps };
}

function ownGroup(robots, ua) { return robots.groups.find((g) => g.agents.includes(ua.toLowerCase())); }
function blocked(robots, ua) {
  const g = ownGroup(robots, ua) ?? (ua === "*" ? null : ownGroup(robots, "*"));
  if (!g) return false;
  return g.rules.some((r) => r.type === "disallow" && r.path === "/") && !g.rules.some((r) => r.type === "allow" && r.path === "/");
}

/** 순수: sitemapindex XML → 자식 URL 전부(절단 없음 — 예전 .slice(0,5)가 로케일 6개 이상 사이트에서 H1 거짓 발화를 냈다). */
export function parseSitemapIndex(xml) {
  return [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>/gi)].map((m) => m[1]);
}

/** 순수: urlset XML → Map(normKey → {loc, fetchUrl, alts}). */
export function parseUrlset(xml, origin, originHost) {
  const out = new Map();
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
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

// 정의: sitemap 인덱스 재귀 깊이 상한 — sitemaps.org 프로토콜은 인덱스의 인덱스를 허용하지 않으므로(인덱스 → urlset 1단) 2면 충분. 넘치면 잘라내지 않고 "미제공"으로 보고한다.
const SITEMAP_MAX_DEPTH = 2;
async function loadSitemap(url, origin, originHost, depth = 0, truncated = []) {
  const out = new Map();
  if (depth > SITEMAP_MAX_DEPTH) { truncated.push(url); return { entries: out, truncated }; }
  const res = await get(url);
  if (!res || res.status !== 200) return { entries: out, truncated };
  if (/<sitemapindex/i.test(res.body)) {
    for (const c of parseSitemapIndex(res.body)) { const r = await loadSitemap(rehost(c, origin, originHost), origin, originHost, depth + 1, truncated); for (const [k, v] of r.entries) out.set(k, v); }
    return { entries: out, truncated };
  }
  return { entries: parseUrlset(res.body, origin, originHost), truncated };
}

export function parsePage(html) {
  const attr = (tag, name) => tag?.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
  const findTag = (re) => html.match(re)?.[0];
  const metaBy = (kind, val) => { for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) if (new RegExp(`${kind}\\s*=\\s*["']${val}["']`, "i").test(tag)) return attr(tag, "content"); return undefined; };
  const hreflangs = new Map();
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) { if (!/rel\s*=\s*["']alternate["']/i.test(tag)) continue; const lang = attr(tag, "hreflang"); const href = attr(tag, "href"); if (lang && href) hreflangs.set(lang, href); }
  const jsonldTypes = [];
  for (const [, body] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectTypes(JSON.parse(body), jsonldTypes); } catch { /* 깨진 JSON-LD는 타입 미상으로 둔다 */ }
  }
  let text = html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  text = text.replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  return {
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim(),
    desc: metaBy("name", "description"),
    canonical: attr(findTag(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i), "href"),
    ogTitle: metaBy("property", "og:title"), ogImage: metaBy("property", "og:image"), twitterCard: metaBy("name", "twitter:card"),
    hreflangs, jsonldTypes, textLen: text.length,
  };
}

/** JSON-LD @type을 재귀 수집 — 문자열·배열(["Organization","Brand"])·@graph 전부. 예전 정규식은 배열 @type을 놓쳐 J1 오탐. */
export function collectTypes(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectTypes(n, out); return; }
  if (!node || typeof node !== "object") return;
  const t = node["@type"];
  if (typeof t === "string") out.push(t); else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.push(x);
  for (const [k, v] of Object.entries(node)) if (k !== "@type" && (Array.isArray(v) || (v && typeof v === "object"))) collectTypes(v, out);
}

export function localeOf(path, locales) { const seg = path.split("/")[1]; return locales.includes(seg) ? seg : (locales[0] ?? "default"); }
export function delocalize(path, locales) { const seg = path.split("/")[1]; if (!locales.includes(seg)) return path; const rest = path.slice(seg.length + 1); return rest || "/"; }
export function guessLocales(entries) {
  const segs = new Set();
  for (const key of entries.keys()) { const s = new URL(key).pathname.split("/")[1]; if (isLocaleSeg(s)) segs.add(s); }
  return [...segs].join(",");
}

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) if (list[i].startsWith("--")) { const key = list[i].slice(2); const val = list[i + 1] && !list[i + 1].startsWith("--") ? list[++i] : true; out[key] = val; }
  return out;
}

// ================= 보고 =================

async function report(meta) {
  const rank = { red: 0, intent: 1, yellow: 2, note: 3 };
  findings.sort((a, b) => (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9) || a.id.localeCompare(b.id));
  const icon = { red: "🔴", yellow: "🟡", intent: "🟠", note: "·" };
  for (const f of findings.slice(0, 60)) console.log(`${icon[f.verdict] ?? "?"} [${f.id}] (fix:${f.fix}) ${f.evidence}`);
  if (findings.length > 60) console.log(`… 외 ${findings.length - 60}건 (audit.json 참조)`);
  const count = (v) => findings.filter((f) => f.verdict === v).length;
  console.log(`\n판정: 🔴${count("red")} 🟠intent ${count("intent")} 🟡${count("yellow")} ·note ${count("note")}` + (meta ? `  (${meta.origin} · 페이지 ${meta.pagesScanned} · 로케일 ${meta.locales.join(",") || "-"})` : ""));
  console.log("fix:forbidden = 불가침(훈련 옵트아웃) · fix:report-only = 보고만 · intent = 의도 확인 전 수정 금지");
  const out = args.out === true || !args.out ? DEFAULT_OUT : args.out;
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "audit.json"), JSON.stringify({ meta: { ...meta, scannedAt: new Date().toISOString() }, findings }, null, 2));
  console.log(`→ ${join(out, "audit.json")}`);
  return count("red") ? 1 : 0;
}

// ================= 진입 — 인자는 최소다. 스킬은 쓰기 편해야 한다(사용자 원칙). =================
// --origin <url>            웹 감사. 로케일은 sitemap에서 자동 감지, 산출물은 .sognora/growth/qa/
// --detect [repoDir]        대상 판별(기본 cwd)
// --preflight [repoDir]     복원 지점 확인(기본 cwd)
// --listing [dir]           리스팅 자수 검증(기본 .sognora/growth/store-listing 또는 fastlane metadata). 스토어는 파일명으로 자동 판별
const isMain = import.meta.url === pathToFileURL(argv[1] ?? "").href;
if (isMain) {
  args = parseArgs(argv.slice(2));
  const dirArg = (v) => (v === true || !v ? process.cwd() : v);
  if (args.preflight) exit(await preflight(dirArg(args.preflight)));
  else if (args.detect) exit(await detectCli(dirArg(args.detect)));
  else if (args.listing) exit(await listing(args.listing === true ? await defaultListingDir() : args.listing, args.store));
  else if (args.origin && args.origin !== true) exit(await webAudit());
  else {
    console.error("usage: audit.mjs --origin <url>        웹 감사(로케일·산출물 자동)\n" +
      "       audit.mjs --detect             대상 판별(cwd)\n       audit.mjs --preflight          복원 지점 확인(cwd)\n" +
      "       audit.mjs --listing [dir]      스토어 리스팅 자수(스토어 자동 판별)");
    exit(3);
  }
}
