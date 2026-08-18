/**
 * signals.mjs — 수요 신호 수집기 (증거 코퍼스 + 수집 로그)
 *
 * usage:
 *   signals.mjs --q "invoice approval,inventory count" --out <dir> [--channels appstore,reddit,hn,github] [--market us]
 *               [--en "..."] [--limit 12]
 *
 * 금지 채널: 외주·구인 마켓(크몽·숨고·잡코리아 등) — 정책상 증거로 쓰지 않는다.
 *
 * 왜 스크립트인가: WebFetch로는 대부분 실패한다(실측 2026-08 — G2 403, 크몽은 JS라 빈 껍데기).
 * 산문으로 "리뷰를 조사하라"고 적으면 에이전트는 조사한 척하고 지어낸다. 계기가 있어야 실측이 된다.
 *
 * 산출:
 *   corpus.jsonl        신호 1건 = 1줄 {channel, class, url, date, quote, meta}
 *   collection-log.md   채널별 시도/성공/차단/획득 건수 — **차단은 숨기지 않고 기록한다(우회 금지)**
 *
 * 증거 클래스 (rules §1):
 *   A = 돈이 오간 흔적만 (유료 앱 사용자의 결제·해지·가격 불만, 공개 가격표)
 *   B = 시간·노력 (커뮤니티 고통, 이슈 스레드)
 *   C = 정황 (출시·규제·해외 사례) — 단독으로 카드 성립 불가
 */
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.q || !args.out) { console.error('usage: signals.mjs --q "키워드,키워드" --out <dir> [--en "english kw"] [--channels ...] [--limit 12]'); exit(2); }
const KWS = String(args.q).split(",").map((s) => s.trim()).filter(Boolean);
const EN = args.en ? String(args.en).split(",").map((s) => s.trim()).filter(Boolean) : [];
const LIMIT = +(args.limit ?? 12);
const CHANNELS = new Set(String(args.channels ?? "appstore,shopify,wordpress,reddit,hn,github").split(",").map((s) => s.trim()));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
await mkdir(args.out, { recursive: true });
const corpusPath = join(args.out, "corpus.jsonl");
await writeFile(corpusPath, "");
const log = [];
let total = 0;
const seen = new Set();
const push = async (rows) => {
  for (const r of rows) {
    const k = `${r.channel}|${(r.quote ?? "").slice(0, 80)}`;
    if (seen.has(k)) continue; // 중복 신호는 수요 강도를 부풀린다
    seen.add(k);
    await appendFile(corpusPath, JSON.stringify(r) + "\n"); total++;
  }
};
const relevant = (text, kw) => { // 키워드 토큰이 실제로 등장하는 항목만 — 검색 페이지의 무관 목록 배제
  const toks = String(kw).split(/\s+/).filter((s) => s.length >= 2);
  const low = String(text).toLowerCase();
  return toks.some((tk) => low.includes(tk.toLowerCase()));
};
const note = (channel, status, detail, got = 0) => log.push({ channel, status, detail, got });

// ── 개방 API 채널 (구조화·인용 확실) ─────────────────────────────────────
if (CHANNELS.has("hn")) {
  let got = 0, err = null;
  for (const kw of [...EN, ...KWS]) {
    try {
      const u = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(kw)}&tags=story&hitsPerPage=${LIMIT}`;
      const j = await (await fetch(u, { headers: { "user-agent": UA } })).json();
      const rows = (j.hits ?? []).filter((h) => h.title).map((h) => ({
        channel: "hn", class: "B", url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        date: (h.created_at ?? "").slice(0, 10), quote: h.title,
        meta: { points: h.points, comments: h.num_comments, kw },
      })).filter((r) => (r.meta.comments ?? 0) >= 3);
      await push(rows); got += rows.length;
    } catch (e) { err = String(e.message).slice(0, 60); }
  }
  note("hn(Algolia API)", err && !got ? "fail" : "ok", err ?? "스토리 제목·댓글수(공감 강도)", got);
}

if (CHANNELS.has("github")) {
  let got = 0, err = null;
  for (const kw of [...EN, ...KWS].slice(0, 4)) {
    try {
      const u = `https://api.github.com/search/issues?q=${encodeURIComponent(kw + " in:title state:open")}&sort=reactions&per_page=${LIMIT}`;
      const res = await fetch(u, { headers: { "user-agent": UA, accept: "application/vnd.github+json" } });
      if (!res.ok) { err = `HTTP ${res.status}`; continue; }
      const j = await res.json();
      const rows = (j.items ?? []).map((i) => ({
        channel: "github", class: "B", url: i.html_url, date: (i.created_at ?? "").slice(0, 10),
        quote: i.title, meta: { reactions: i.reactions?.total_count ?? 0, comments: i.comments, kw },
      })).filter((r) => r.meta.reactions >= 2 || r.meta.comments >= 5);
      await push(rows); got += rows.length;
    } catch (e) { err = String(e.message).slice(0, 60); }
  }
  note("github(Issues API)", err && !got ? "fail" : "ok", err ?? "미해결 이슈 제목·반응수", got);
}

// ── 앱스토어: 유료 사용자 불만 = A급 지불 증거 (G2·Trustpilot 차단의 대체 경로) ──────
if (CHANNELS.has("appstore")) {
  const MK = args.market ?? "us";
  let got = 0, err = null;
  const PAY = /(charge|charged|refund|subscription|renew|price|pricing|paid|per month|per year|cancel|billing|결제|환불|구독|가격|요금|해지)/i;
  for (const kw of [...EN, ...KWS]) {
    try {
      const s = await (await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(kw)}&entity=software&limit=8&country=${MK}`, { headers: { "user-agent": UA } })).json();
      for (const a of (s.results ?? []).filter((x) => (x.userRatingCount ?? 0) >= 200).slice(0, 3)) {
        const r = await (await fetch(`https://itunes.apple.com/${MK}/rss/customerreviews/id=${a.trackId}/sortBy=mostRecent/json`, { headers: { "user-agent": UA } })).json();
        const rows = (r?.feed?.entry ?? []).filter((x) => x["im:rating"]).map((x) => ({
          stars: +x["im:rating"].label, date: (x.updated?.label ?? "").slice(0, 10),
          text: `${x.title?.label ?? ""} — ${(x.content?.label ?? "").replace(/\s+/g, " ")}`.slice(0, 260),
        })).filter((x) => x.stars <= 3).map((x) => ({
          channel: "appstore", class: PAY.test(x.text) ? "A" : "B", // 결제·해지 언급이면 지불 증거
          url: a.trackViewUrl, date: x.date, quote: x.text,
          meta: { app: a.trackName, stars: x.stars, ratings: a.userRatingCount, kw, why: "유료 앱 사용자의 최근 불만 = 검증된 지불 의사 + 현재 미충족" },
        }));
        await push(rows); got += rows.length;
      }
    } catch (e) { err = String(e.message).slice(0, 60); }
  }
  note("appstore(유료 사용자 불만)", err && !got ? "fail" : "ok", err ?? "★≤3 리뷰 원문+날짜(결제 언급은 A급)", got);
}

// ── B2B 앱 마켓플레이스: 앱스토어가 구조적으로 못 잡는 업무용 3자 앱의 유료 사용자 ────
// (실전 발견: 앱스토어 검색은 어떤 B2B 용어든 최대 소비자 앱으로 수렴한다 — QuickBooks 생태계를 한 건도 못 잡았다)
const VERTICAL = [
  ["shopify", (kw) => `https://apps.shopify.com/search?q=${encodeURIComponent(kw)}`,
    () => [...document.querySelectorAll('[data-controller~="app-card"], li, article')].map((el) => el.innerText.replace(/\s+/g, " ").trim())
      .filter((x) => x.length > 30 && /\d\.\d/.test(x)).slice(0, 12)],
  ["wordpress", (kw) => `https://wordpress.org/plugins/search/${encodeURIComponent(kw)}/`,
    () => [...document.querySelectorAll("article, .plugin-card")].map((el) => el.innerText.replace(/\s+/g, " ").trim())
      .filter((x) => x.length > 30).slice(0, 12)],
];

// ── 브라우저 채널 (JS 렌더·봇 판별 회피용 표준 UA) ────────────────────────
const browserChannels = ["reddit", ...VERTICAL.map((v) => v[0])].filter((c) => CHANNELS.has(c));
if (browserChannels.length) {
  const pw = await load("playwright");
  if (!pw) { note("browser", "fail", "playwright 미설치 — npm i -D playwright && npx playwright install chromium"); }
  else {
    const browser = await pw.chromium.launch({ headless: true });
    const visit = async (url, fn) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA, locale: "ko-KR" });
      const page = await ctx.newPage();
      try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        const status = res?.status() ?? 0;
        if (status >= 400) { await ctx.close(); return { status, rows: [] }; }
        await page.waitForTimeout(3500);
        const rows = await fn(page);
        await ctx.close();
        return { status, rows };
      } catch (e) { await ctx.close().catch(() => {}); return { status: -1, rows: [], err: String(e.message).slice(0, 60) }; }
    };
    const today = new Date().toISOString().slice(0, 10);

    for (const [name, urlOf, extract] of VERTICAL) {
      if (!CHANNELS.has(name)) continue;
      let got = 0, blocked = 0;
      for (const kw of [...EN, ...KWS].slice(0, 5)) {
        const { status, rows } = await visit(urlOf(kw), (page) => page.evaluate(extract));
        if (status >= 400 || status === -1) { blocked++; continue; }
        const mapped = rows.filter((x) => relevant(x, kw)).map((x) => ({
          channel: name, class: /\$\s?\d|\/month|per month|free plan|pricing/i.test(x) ? "A" : "B",
          url: urlOf(kw), date: today, quote: x.slice(0, 240),
          meta: { kw, why: "업무용 3자 앱 마켓 — 유료로 붙여 쓰는 도구의 평점·가격이 드러난다" },
        }));
        await push(mapped); got += mapped.length;
      }
      note(`${name}(B2B 앱 마켓)`, blocked ? "blocked" : "ok", blocked ? `${blocked}개 질의 차단` : "앱 카드(평점·가격)", got);
    }

    if (CHANNELS.has("reddit")) { // B급: 고통 신호 + 유료 이탈 언급(A급 승격 후보)
      let got = 0, blocked = 0;
      const queries = [...EN, ...KWS].slice(0, 6);
      for (const kw of queries) {
        const { status, rows } = await visit(`https://www.reddit.com/search/?q=${encodeURIComponent(kw)}&sort=relevance&t=year`, (page) =>
          page.evaluate(() => {
            const out = [];
            for (const a of document.querySelectorAll('a[href*="/comments/"]')) {
              const t = a.innerText.replace(/\s+/g, " ").trim();
              if (t.length > 20) out.push({ text: t.slice(0, 200), href: a.href });
              if (out.length >= 15) break;
            }
            return out;
          }));
        if (status >= 400 || status === -1) { blocked++; continue; }
        const mapped = rows.filter((r) => relevant(r.text, kw)).map((r) => ({
          channel: "reddit", class: /cancel|switch(ing)? (from|to)|pay(ing)?|\$\d|per month|\/mo\b|subscription|refund|invoice|quote|해지|결제|유료|구독/i.test(r.text) ? "A" : "B",
          url: r.href, date: today, quote: r.text, meta: { kw, note: "날짜는 수집일 — 스레드 원 날짜는 카드 작성 시 확인" },
        }));
        await push(mapped); got += mapped.length;
      }
      note("reddit(고통·이탈)", blocked === queries.length ? "blocked" : "ok", blocked ? `${blocked}개 질의 차단` : "스레드 제목", got);
    }
    await browser.close();
  }
}

// 차단이 확인된 채널은 시도하지 않고 사실만 기록한다(우회 금지 — Tier-R 수집 원칙 계승)
note("G2·Capterra·Trustpilot·ProductHunt·Fiverr·Upwork", "blocked", "실측(2026-08): playwright+표준 UA로도 403. 우회 시도 금지 — 유료 사용자 불만은 appstore 채널로 대체", 0);
note("외주·구인 마켓(크몽·숨고·잡코리아 등)", "excluded", "정책상 사용 금지 — 이 스킬은 외주 단가를 증거로 쓰지 않는다", 0);

const byClass = { A: 0, B: 0, C: 0 };
for (const line of (await import("node:fs")).readFileSync(corpusPath, "utf8").split("\n").filter(Boolean))
  byClass[JSON.parse(line).class] = (byClass[JSON.parse(line).class] ?? 0) + 1;

const md = `# 수집 로그 — ${new Date().toISOString().slice(0, 10)}

키워드(ko): ${KWS.join(", ")}${EN.length ? `\n키워드(en): ${EN.join(", ")}` : ""}

| 채널 | 상태 | 획득 | 비고 |
|---|---|---|---|
${log.map((l) => `| ${l.channel} | ${l.status === "ok" ? "✅" : l.status === "blocked" ? "⛔ 차단" : l.status === "excluded" ? "🚫 정책 제외" : "❌ 실패"} | ${l.got} | ${l.detail} |`).join("\n")}

**총 ${total}건 — A급 ${byClass.A} · B급 ${byClass.B} · C급 ${byClass.C}**

수집 언어·지역: 질의 ko ${KWS.length}개 / en ${EN.length}개 · 시장 ${args.market ?? "us"} — **영어권 과대·국내 과소 편향을 감안하고 읽어라**(rules §9).

${byClass.A === 0 ? "> ⛔ **A급(지불) 증거 0건. 이 실행은 카드를 만들 수 없다** — 키워드를 바꾸거나 수동 투입 경로를 쓴다. 근거 없는 생성보다 URL이 붙은 생성이 더 위험하다(rules §0).\n" : ""}
`;
await writeFile(join(args.out, "collection-log.md"), md);
console.log(md);
console.log(`→ ${corpusPath}`);
exit(byClass.A === 0 ? 1 : 0);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
