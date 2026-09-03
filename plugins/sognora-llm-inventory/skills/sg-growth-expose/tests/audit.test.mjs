/* 순수 함수만 — 네트워크 없이 감사 로직을 재현한다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSitemapIndex, parseUrlset, hreflangFindings, parsePage, collectTypes, guessLocales, isLocaleSeg, listingFindings, detectTarget, crawlerFindings, ledgerStaleness, parseRobots, guessStore } from "../scripts/audit.mjs";

const O = "https://example.com", H = "example.com";
const urlset = (locales) => `<urlset>${locales.map((l) => `<url><loc>${O}/${l}/</loc>${locales.map((m) => `<xhtml:link rel="alternate" hreflang="${m}" href="${O}/${m}/"/>`).join("")}<xhtml:link rel="alternate" hreflang="x-default" href="${O}/en/"/></url>`).join("")}</urlset>`;

test("sitemap 인덱스 자식 7개가 전부 읽힌다(예전 .slice(0,5)가 6번째 이후를 잘라 H1 거짓 발화)", () => {
  const locales = ["en", "ko", "ja", "zh", "de", "fr", "es"];
  const index = `<sitemapindex>${locales.map((l) => `<sitemap><loc>${O}/sitemap-${l}.xml</loc></sitemap>`).join("")}</sitemapindex>`;
  const children = parseSitemapIndex(index);
  assert.equal(children.length, 7);
  // 자식 7개를 전부 합친 entries에서는 alternate 대상이 전부 존재 → H1 red 0
  const entries = new Map(); for (const [k, v] of parseUrlset(urlset(locales), O, H)) entries.set(k, v);
  const reds = hreflangFindings(entries).filter((f) => f.verdict === "red");
  assert.deepEqual(reds, []);
  // 5개만 합치면(옛 동작) 없는 로케일을 가리키는 H1 red가 난다 — 회귀 방지 근거
  const five = new Map(); for (const [k, v] of parseUrlset(urlset(locales), O, H)) if (locales.slice(0, 5).some((l) => k.endsWith("/" + l))) five.set(k, v);
  assert.ok(hreflangFindings(five).some((f) => f.verdict === "red" && /sitemap에 없음/.test(f.evidence)));
});

test("JSON-LD @type 배열·@graph도 Organization으로 인식한다(J1 오탐 제거)", () => {
  const html = `<html><head><title>t</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":["Organization","Brand"],"name":"X"}]}</script></head><body>${"본문 ".repeat(200)}</body></html>`;
  const page = parsePage(html);
  assert.ok(page.jsonldTypes.includes("Organization"));
  const out = []; collectTypes({ "@type": ["WebSite", "Thing"] }, out); assert.deepEqual(out, ["WebSite", "Thing"]);
});

test("2글자 경로(/ai /qa /tv)는 로케일이 아니다, /ko /en-US는 로케일이다", () => {
  assert.equal(isLocaleSeg("ai"), false); assert.equal(isLocaleSeg("qa"), false); assert.equal(isLocaleSeg("tv"), false);
  assert.equal(isLocaleSeg("ko"), true); assert.equal(isLocaleSeg("en-US"), true); assert.equal(isLocaleSeg("zh-Hant"), true);
  const entries = new Map([[`${O}/ai`, {}], [`${O}/ko/x`, {}], [`${O}/en`, {}], [`${O}/qa`, {}]]);
  assert.equal(guessLocales(entries), "ko,en");
});

test("리스팅: 필수 필드 누락은 red(제출 불가), 자수 초과도 red, 선택 필드 누락은 침묵", () => {
  const out = listingFindings("play", { ko: { "title.txt": "앱", "short_description.txt": null, "full_description.txt": "x".repeat(4001) } });
  assert.ok(out.some((f) => f.id === "L1" && f.verdict === "red"));
  assert.ok(out.some((f) => f.id === "L2" && f.verdict === "red"));
  const ok = listingFindings("appstore", { en: { "name.txt": "App", "keywords.txt": "a,b,c", "description.txt": "d", "subtitle.txt": null, "promotional_text.txt": null, "release_notes.txt": null } });
  assert.deepEqual(ok, []);
  assert.equal(guessStore(["title.txt", "full_description.txt"]), "play");
  assert.equal(guessStore(["name.txt", "keywords.txt"]), "appstore");
  assert.equal(guessStore(["readme.md"]), null);
});

test("대상 판별: Tauri는 웹 아님, next+app 디렉터리는 웹, ios/는 앱, brand.yaml 둘 다는 both", () => {
  const base = { srcTauri: false, routingDir: true, staticHtml: false, androidDir: false, iosDir: false, fastlane: false, firebaseApp: false, brandBundleId: false, brandWebDomain: false };
  assert.equal(detectTarget({ pkg: { dependencies: { next: "16" } }, files: base }).target, "web");
  assert.equal(detectTarget({ pkg: { dependencies: { next: "16" } }, files: { ...base, srcTauri: true } }).target, "none");
  assert.equal(detectTarget({ pkg: null, files: { ...base, routingDir: false, iosDir: true } }).target, "app");
  assert.equal(detectTarget({ pkg: { dependencies: { next: "16" } }, files: { ...base, brandBundleId: true, brandWebDomain: true } }).target, "both");
});

test("크롤러 처분은 원장의 fix가 정한다 · checkedAt 180일 초과는 🟡", () => {
  const robots = parseRobots("User-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: ChatGPT-User\nDisallow: /\n");
  const ledger = { crawlers: [
    { ua: "GPTBot", class: "training", robotsBound: true, fix: "forbidden", source: "s", checkedAt: "2026-08-19" },
    { ua: "OAI-SearchBot", class: "search", robotsBound: true, fix: "auto", blockedEffect: "e", source: "s", checkedAt: "2026-08-19" },
    { ua: "ChatGPT-User", class: "user", robotsBound: false, fix: "report-only", source: "s", checkedAt: "2026-08-19" } ], legacy: [] };
  const f = crawlerFindings(robots, ledger);
  assert.equal(f.find((x) => /GPTBot/.test(x.evidence)).fix, "forbidden");
  assert.equal(f.find((x) => /OAI-SearchBot/.test(x.evidence)).fix, "auto");
  assert.equal(f.find((x) => /ChatGPT-User/.test(x.evidence)).fix, "report-only");
  assert.deepEqual(ledgerStaleness(ledger, new Date("2026-09-01")), []);
  assert.equal(ledgerStaleness(ledger, new Date("2027-04-01")).length, 1);
});
