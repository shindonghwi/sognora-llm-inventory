/**
 * seeds.mjs — 시드 발견 (사람이 주제를 상상하지 못하게 하는 장치, 시장 무관·최신성 강제)
 *
 * usage:
 *   seeds.mjs --out <dir> [--market kr|us|jp] [--stems "..."] [--top 20]
 *             [--fresh-days 180]  리뷰 최신성 창(이 기간의 리뷰만 불만율에 센다)
 *
 * 왜 있나: 수집 키워드를 사람(또는 에이전트)이 정하는 순간, 결국 그가 아이디어를 낸 것이다.
 * "엑셀 자동화"를 시드로 넣으면 엑셀 자동화 아이디어가 나온다 — 발굴처럼 보이는 생성이다.
 * 그래서 시드는 **데이터가 고른다**. 사람이 주는 것은 주제어가 아니라 **문형**뿐이다.
 *
 * 파이프라인(전부 공개 엔드포인트, 인증 없음):
 *   1) 자동완성(구글 + 한국은 네이버 병행) 문형×알파벳 확장 → 사람들이 실제로 치는 질의(순서=인기 근사)
 *   2) 질의에서 문형을 걷어낸 **문제 구절**만 추출 — 단어 빈도로 자르면 파편이 남는다
 *   3) 앱스토어 검색(country=<market>)으로 **유료 규모**(평점 수 합) 실측
 *   4) 리뷰 RSS로 **최신 불만율** 실측 — `--fresh-days` 창 안의 리뷰만 센다(오래된 불만은 이미 해결됐을 수 있다)
 *   5) HN 최근 90일 vs 이전 90일 언급량으로 **추세**(상승/하강) 판정
 *
 * 산출: queries.jsonl · seeds.json · seeds.md — 모든 수치에 수집 시각과 표본 날짜 범위가 붙는다.
 * 원리: **누적(스톡)이 아니라 유량(플로우)으로 잰다.** 누적 평점 55만은 5년치 합계일 뿐 오늘의 수요가 아니다.
 *   수요 유량 = 최근 리뷰 N건이 며칠에 걸쳐 쌓였나(일평균 유입)
 *   불만 유량 = 그 최근 리뷰 중 ★≤3 비율
 *   방치도    = 1위 앱의 마지막 업데이트 경과일(오래 방치될수록 기회)
 *   진입 유량 = 최근 1년 출시 앱 수 / 언급량 추세(90일 대 이전 90일)
 */
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";

const args = parseArgs(argv.slice(2));
if (!args.out) { console.error('usage: seeds.mjs --out <dir> [--market kr|us] [--stems "..."] [--top 20] [--fresh-days 180]'); exit(2); }
const MARKET = (args.market ?? "us").toLowerCase();
const KO = MARKET === "kr";
const HL = KO ? "ko" : "en";
const TOP = +(args.top ?? 20);
const FRESH_DAYS = +(args["fresh-days"] ?? 180);
const NOW = new Date();
const FRESH_CUT = new Date(NOW.getTime() - FRESH_DAYS * 86400e3);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// 문형만 준다 — 주제어가 아니므로 도메인을 상상하지 않는다. 지불 의사가 드러나는 문형을 기본값으로.
const DEFAULT_STEMS = KO
  ? ["관리 프로그램", "자동화 프로그램", "업체 프로그램", "매장 프로그램", "엑셀로 관리하는", "프로그램 추천", "솔루션 비용", "외주 비용", "대행 비용", "직접 만들려면"]
  : ["software to manage", "tool for", "app for small business to", "we still use spreadsheets to",
     "how much does it cost to hire someone to", "cheapest software for", "software that integrates with",
     "alternative to", "why is it so hard to", "best way to keep track of"];
const STEMS = (args.stems ? String(args.stems).split(",") : DEFAULT_STEMS).map((s) => s.trim()).filter(Boolean);
const EXPAND = KO ? "가나다라마바사아자차카타파하".split("") : "abcdefghijklmnopqrstuvwxyz".split("");

await mkdir(args.out, { recursive: true });
const qPath = join(args.out, "queries.jsonl");
await writeFile(qPath, "");
const j = async (u) => { try { const r = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" } }); return r.ok ? await r.json() : null; } catch { return null; } };
const txt = async (u) => { try { const r = await fetch(u, { headers: { "user-agent": UA } }); return r.ok ? await r.text() : null; } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. 실제 질의 수집 ─────────────────────────────────────────────────────
console.log(`▶ 질의 수집(${MARKET}): 문형 ${STEMS.length}종 × ${EXPAND.length + 1}확장 …`);
const queries = [];
for (const stem of STEMS) {
  for (const ch of ["", ...EXPAND]) {
    const q = `${stem} ${ch}`.trim();
    const g = await j(`https://suggestqueries.google.com/complete/search?client=firefox&hl=${HL}${KO ? "&gl=kr" : ""}&q=${encodeURIComponent(q)}`);
    (g?.[1] ?? []).forEach((text, rank) => queries.push({ src: "google", stem, query: text, rank }));
    if (KO) { // 국내는 네이버 자동완성 병행 — 국내 수요는 여기서 더 잘 잡힌다
      const n = await txt(`https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(q)}&st=100&r_format=json`);
      try {
        const items = JSON.parse(n)?.items?.[0] ?? [];
        items.forEach((it, rank) => queries.push({ src: "naver", stem, query: String(it[0]), rank }));
      } catch {}
    }
    await sleep(60);
  }
}
const uniq = [...new Map(queries.map((q) => [q.query, q])).values()];
for (const q of uniq) await appendFile(qPath, JSON.stringify({ ...q, collectedAt: NOW.toISOString() }) + "\n");
console.log(`  질의 ${uniq.length}개(중복 제거)`);

// ── 2. 문제 구절 추출 ─────────────────────────────────────────────────────
const NOISE = KO ? /(뜻|의미|영어로|가사|드라마|나무위키|디시|인스\s?타|네이버 ?카페|유튜브|다이어트|사진 ?편집|다운로드|무료 ?다운|토렌트|웹툰|게임)/ : /(reddit|meme|lyrics|movie|song|near me|in spanish|quiz|answers)/i;
const phraseMap = new Map();
for (const { stem, query, rank, src } of uniq) {
  let rest = query.toLowerCase();
  const sl = stem.toLowerCase();
  if (rest.startsWith(sl)) rest = rest.slice(sl.length);
  else if (rest.includes(sl)) rest = rest.replace(sl, " ");
  rest = rest.replace(KO ? /[^가-힣a-z0-9 ]/g : /[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!KO) rest = rest.replace(/^(a|an|the|to|for|of|my|your|is|are|do|does)\s+/g, "");
  const toks = rest.split(" ").filter(Boolean);
  if (NOISE.test(rest)) continue;
  if (KO ? (rest.length < 5) : (toks.length < 2 || rest.length < 9)) continue;
  const key = toks.slice(0, 5).join(" ");
  const cur = phraseMap.get(key) ?? { term: key, hits: 0, rankSum: 0, examples: [], stems: new Set(), srcs: new Set() };
  cur.hits++; cur.rankSum += rank; cur.stems.add(stem); cur.srcs.add(src);
  if (cur.examples.length < 3) cur.examples.push(query);
  phraseMap.set(key, cur);
}
const terms = [...phraseMap.values()]
  .map((t) => ({ ...t, stemCount: t.stems.size, srcCount: t.srcs.size,
    demandScore: +((t.hits + t.stems.size * 2 + t.srcs.size) * (1 / (1 + t.rankSum / t.hits / 8))).toFixed(2) }))
  .sort((a, b) => b.demandScore - a.demandScore).slice(0, TOP * 4);
console.log(`  문제 구절 ${terms.length}개`);

// ── 3~5. 유료 규모 · 최신 불만 · 추세 ─────────────────────────────────────
console.log(`▶ 시장 실측(country=${MARKET}, 최신성 ${FRESH_DAYS}일) …`);
const nowSec = Math.floor(NOW.getTime() / 1000), D90 = 90 * 86400;
const seeds = [];
for (const t of terms) {
  if (seeds.length >= TOP) break;
  const s = await j(`https://itunes.apple.com/search?term=${encodeURIComponent(t.term)}&entity=software&limit=50&country=${MARKET}`);
  const all = (s?.results ?? []);
  const apps = all.filter((a) => (a.userRatingCount ?? 0) >= (KO ? 50 : 200))
    .map((a) => ({ id: a.trackId, name: a.trackName, ratings: a.userRatingCount, avg: a.averageUserRating, price: a.formattedPrice, url: a.trackViewUrl,
      updated: (a.currentVersionReleaseDate ?? "").slice(0, 10), released: (a.releaseDate ?? "").slice(0, 10) }))
    .sort((a, b) => b.ratings - a.ratings);
  if (!apps.length) continue;
  // 진입 유량: 최근 1년 신규 출시 앱 수(시장이 살아 있는가)
  const newEntrants = all.filter((a) => NOW - Date.parse(a.releaseDate ?? 0) < 365 * 86400e3).length;

  // 수요·불만 유량: 최근 리뷰가 "며칠에 걸쳐" 쌓였나 = 일평균 유입(누적 아님)
  let perDaySum = 0, measured = 0, low = 0, fresh = 0, oldest = null, newest = null;
  const quotes = [];
  for (const a of apps.slice(0, 3)) {
    const r = await j(`https://itunes.apple.com/${MARKET}/rss/customerreviews/id=${a.id}/sortBy=mostRecent/json`);
    const es = (r?.feed?.entry ?? []).filter((x) => x["im:rating"]).map((x) => ({ d: new Date(x.updated?.label ?? 0), stars: +x["im:rating"].label, e: x }));
    if (es.length >= 8) {
      const span = Math.max(0.5, (es[0].d - es[es.length - 1].d) / 86400e3);
      a.inflowPerDay = +(es.length / span).toFixed(2);
      a.spanDays = +span.toFixed(1);
      perDaySum += a.inflowPerDay; measured++;
    }
    for (const { d, stars, e } of es) {
      if (!(d > FRESH_CUT)) continue;
      fresh++;
      if (!oldest || d < oldest) oldest = d;
      if (!newest || d > newest) newest = d;
      if (stars <= 3) {
        low++;
        if (quotes.length < 4) quotes.push({ app: a.name, appUrl: a.url, stars, date: d.toISOString().slice(0, 10), title: e.title?.label, text: (e.content?.label ?? "").replace(/\s+/g, " ").slice(0, 220) });
      }
    }
    await sleep(80);
  }
  if (fresh < 8 || !measured) continue;
  const inflowPerDay = +(perDaySum).toFixed(2);            // 시장 전체 리뷰 유입(일)
  const staleDays = Math.round((NOW - Date.parse(apps[0].updated || 0)) / 86400e3); // 1위 앱 방치일
  const dissat = +(low / fresh).toFixed(2);

  let trend = null;
  if (!KO) {
    const a1 = await j(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(t.term)}&numericFilters=created_at_i>${nowSec - D90}&hitsPerPage=1`);
    const a2 = await j(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(t.term)}&numericFilters=created_at_i>${nowSec - 2 * D90},created_at_i<${nowSec - D90}&hitsPerPage=1`);
    if (a1 && a2) trend = { recent90: a1.nbHits, prior90: a2.nbHits, ratio: a2.nbHits ? +(a1.nbHits / a2.nbHits).toFixed(2) : null };
  }
  const trendMul = trend?.ratio == null ? 1 : Math.min(1.5, Math.max(0.6, trend.ratio));
  const staleMul = 1 + Math.min(1, staleDays / 365);       // 오래 방치될수록 기회
  seeds.push({
    term: t.term, market: MARKET, collectedAt: NOW.toISOString().slice(0, 10),
    demandScore: t.demandScore, queryHits: t.hits, srcCount: t.srcCount, exampleQueries: t.examples,
    flow: { inflowPerDay, staleDays, newEntrants, sampledApps: measured },
    cumulative: { apps: apps.length, totalRatings: apps.reduce((x, a) => x + a.ratings, 0) }, // 참고값 — 판정에 쓰지 않는다
    top: apps.slice(0, 3),
    freshness: { windowDays: FRESH_DAYS, sampled: fresh, from: oldest?.toISOString().slice(0, 10), to: newest?.toISOString().slice(0, 10) },
    dissatisfaction: dissat, trend,
    opportunity: +(Math.log10(1 + inflowPerDay * 30) * dissat * trendMul * staleMul).toFixed(2), // 전부 유량
    complaintQuotes: quotes,
  });
}
seeds.sort((a, b) => b.opportunity - a.opportunity);
await writeFile(join(args.out, "seeds.json"), JSON.stringify({ market: MARKET, collectedAt: NOW.toISOString(), freshDays: FRESH_DAYS, stems: STEMS, queries: uniq.length, seeds }, null, 2));

const md = `# 시드 발견 — ${NOW.toISOString().slice(0, 10)} · 시장 ${MARKET.toUpperCase()} · 최신성 ${FRESH_DAYS}일

문형 ${STEMS.length}종 → 실제 질의 ${uniq.length}개(${KO ? "구글+네이버" : "구글"}) → 문제 구절 ${terms.length}개 → 시장 실측 ${seeds.length}개.
**주제를 사람이 고르지 않았다** — 검색 질의 빈도와 앱스토어 실측이 골랐다.

| # | 시드 | 기회 | 리뷰 유입(일) | 최신 불만율 | 1위 앱 방치 | 신규 진입(1년) | 추세(90일) | 누적(참고) |
|---|---|---|---|---|---|---|---|---|
${seeds.map((s, i) => `| ${i + 1} | **${s.term}** | ${s.opportunity} | ${s.flow.inflowPerDay}건 | ${Math.round(s.dissatisfaction * 100)}% (n=${s.freshness.sampled}) | ${s.flow.staleDays}일 | ${s.flow.newEntrants}개 | ${s.trend ? `${s.trend.recent90}/${s.trend.prior90}` : "-"} | ${s.cumulative.totalRatings.toLocaleString()} |`).join("\n")}

> **누적이 아니라 유량으로 잰다.** 누적 평점은 5년치 합계일 뿐 오늘의 수요가 아니다(맨 오른쪽 참고값).
> 기회 = log10(1+월 리뷰 유입) × 최신 불만율 × 추세배수 × 방치배수. 리뷰 유입은 최근 리뷰 N건이 실제로 며칠에 걸쳐 쌓였는지로 계산한다.
> 불만율은 **최근 ${FRESH_DAYS}일 리뷰만** 센다. **1위 앱 방치일**이 길수록 기회이고, **신규 진입**이 많으면 수요가 살아 있다는 뜻이다.

${seeds.slice(0, 6).map((s) => `## ${s.term}
- 시장(${s.market}): ${s.top.map((a) => `${a.name}(누적 ${a.ratings.toLocaleString()}★${a.avg?.toFixed(1) ?? "-"}, ${a.price}, 유입 ${a.inflowPerDay ?? "?"}건/일, 최종 업데이트 ${a.updated})`).join(" · ")}
- 실제 질의: ${s.exampleQueries.map((q) => `"${q}"`).join(", ")}
- 지불자 불만(최근 ${FRESH_DAYS}일):
${s.complaintQuotes.map((q) => `  - ${q.date} ★${q.stars} "${q.title}" — ${q.text}`).join("\n") || "  (없음)"}`).join("\n\n")}
`;
await writeFile(join(args.out, "seeds.md"), md);
console.log(md.split("\n## ")[0]);
console.log(`→ ${join(args.out, "seeds.md")}`);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
