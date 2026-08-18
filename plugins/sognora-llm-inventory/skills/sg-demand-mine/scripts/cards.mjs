/**
 * cards.mjs — 카드 린터 (증거 세탁·공상 차단의 기계 판정자)
 *
 * usage: cards.mjs --cards <dir|file.json> --corpus <corpus.jsonl> [--ledger ledger.json] [--out <dir>]
 *
 * 이 스킬의 핵심 게이트다. 산문 규칙("증거를 붙여라")은 에이전트를 구속하지 못하고,
 * URL이 붙은 생성은 근거 없는 생성보다 위험하다(사용자가 알아챌 수 없으므로).
 * 그래서 인용문을 **수집 코퍼스와 verbatim 대조**한다 — 지어낸 인용은 여기서 즉사한다.
 *
 * 카드 스키마(JSON):
 * {
 *   "id": "kebab-slug",
 *   "problem": "한 문장",
 *   "payer": "이름·역할로 특정 (예: 외벽 재도장 업체 대표) — '중소기업' 같은 뭉뚱그림은 실패",
 *   "currentSpend": { "amountKRW": 80000, "unit": "건당", "source": "인용에 근거" },
 *   "evidence": [{ "class": "A|B|C", "url": "...", "date": "YYYY-MM-DD", "quote": "코퍼스 원문 그대로" }],
 *   "whyNow": { "type": "기술|규제|가격|행동|플랫폼", "source": "URL", "date": "YYYY-MM-DD", "claim": "..." },
 *   "whyNotYet": "왜 아직 아무도 안 했나 — 최근 가능해짐|시장이 작아 보여서|유통이 어려워서|이미 있음(→탈락)",
 *   "buildScope": "4주 내 첫 버전 범위",
 *   "firstDollar": [{ "actor": "...", "premiseTrueToday": "...", "effort": "...", "failSignal": "..." }],
 *   "distribution": { "mode": "operator-reach|resident-demand", "evidence": "URL 또는 운영자 접근권 서술" },
 *   "pricing": "과금 형태",
 *   "marketSize": "기록 항목 — 탈락 기준 아님",
 *   "clicheType": "two-sided|ai-wrapper|community|logistics|none",
 *   "clicheProof": "클리셰 유형이면 추가 입증(미충족 시 탈락)"
 * }
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { argv, exit } from "node:process";

const args = parseArgs(argv.slice(2));
if (!args.cards || !args.corpus) { console.error("usage: cards.mjs --cards <dir|file> --corpus <corpus.jsonl> [--ledger f] [--out d]"); exit(2); }

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const corpusRows = (await readFile(args.corpus, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
const corpusText = corpusRows.map((r) => norm(r.quote)).join("\n");
const corpusUrls = new Set(corpusRows.map((r) => r.url));
const ledger = args.ledger ? await readFile(args.ledger, "utf8").then((t) => JSON.parse(t)).catch(() => []) : [];

const files = [];
if (extname(args.cards) === ".json") files.push(args.cards);
else for (const f of await readdir(args.cards)) if (f.endsWith(".json")) files.push(join(args.cards, f));

const TODAY = new Date();
const monthsAgo = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? Infinity : (TODAY - t) / 2.63e9; };
const GENERIC = /^(중소기업|소상공인|기업|회사|사업자|사용자|고객|개인|프리랜서|스타트업|모두|누구나)s?$/;

const results = [];
for (const f of files) {
  const card = JSON.parse(await readFile(f, "utf8"));
  const fail = [];
  const warn = [];

  // 1) 증거 verbatim 대조 — 지어낸 인용 즉사
  const ev = card.evidence ?? [];
  if (!ev.length) fail.push("evidence 없음");
  for (const e of ev) {
    if (!e.quote) { fail.push("인용문 없는 증거 항목"); continue; }
    if (!corpusText.includes(norm(e.quote).slice(0, Math.min(40, norm(e.quote).length))))
      fail.push(`인용이 코퍼스에 없음(지어낸 인용 혐의): "${String(e.quote).slice(0, 40)}…"`);
    if (e.url && !corpusUrls.has(e.url)) warn.push(`URL이 코퍼스 밖: ${e.url}`);
    if (e.date && monthsAgo(e.date) > 12) warn.push(`증거 12개월 초과(TTL): ${e.date} — 재확인 필요`);
  }
  // 2) A급 하한 — 돈이 오간 흔적 없으면 카드가 아니다
  const aCount = ev.filter((e) => e.class === "A").length;
  if (aCount === 0) fail.push("A급(지불) 증거 0 — 관찰 목록으로 격리 대상이지 후보가 아니다");

  // 3) 지불자 특정
  if (!card.payer || GENERIC.test(String(card.payer).trim())) fail.push(`지불자가 뭉뚱그려짐: "${card.payer ?? "없음"}"`);
  // 4) 현행 지불액 — 가격 상한의 실물 근거
  if (!card.currentSpend?.amountKRW) fail.push("currentSpend 없음 — 지금 이 문제에 얼마를 내고 있는지가 가격 상한이다");

  // 5) why-now: 유형 + 12개월 내 날짜 출처, "LLM 때문" 단독 무효
  const wn = card.whyNow ?? {};
  if (!wn.type) fail.push("whyNow.type 없음(기술·규제·가격·행동·플랫폼 중 택1)");
  if (!wn.date || monthsAgo(wn.date) > 12) fail.push(`whyNow 날짜 출처가 12개월 밖이거나 없음: ${wn.date ?? "없음"}`);
  if (/^(llm|ai|gpt|생성형|인공지능)[^]*$/i.test(String(wn.claim ?? "")) && String(wn.claim).length < 40)
    fail.push("whyNow가 'LLM 때문' 단독 서술 — 그 자체로는 모든 카드를 AI 래퍼로 만든다");
  // 6) 역-why-now
  if (!card.whyNotYet) fail.push("whyNotYet 없음 — '그럼 왜 아직 아무도 안 했나'에 답해야 한다");
  if (/이미 있음/.test(String(card.whyNotYet))) fail.push("whyNotYet='이미 있음' → 탈락");

  // 7) first-dollar: 첫 단계가 오늘 실행 가능해야 하고 각 단계에 실패 신호
  const fd = card.firstDollar ?? [];
  if (fd.length < 2) fail.push("firstDollar 단계 2개 미만");
  fd.forEach((s, i) => {
    if (!s.premiseTrueToday) fail.push(`firstDollar[${i}] premiseTrueToday 없음`);
    if (!s.failSignal) fail.push(`firstDollar[${i}] failSignal 없음(실패를 무엇으로 관측하나)`);
  });
  if (fd[0] && /모으|확보한 뒤|만든 다음|출시 후|유저.*확보/.test(String(fd[0].premiseTrueToday) + String(fd[0].actor)))
    warn.push("firstDollar 첫 단계가 선행 조건에 의존하는 것으로 보임 — 오늘 실행 가능해야 한다");

  // 8) 유통: 없으면 1인 운영자에게 사망
  const dist = card.distribution ?? {};
  if (!dist.mode || !dist.evidence) fail.push("distribution 없음 — 1인 운영자의 병목은 빌드가 아니라 유통이다");
  else if (dist.mode === "resident-demand" && !/https?:\/\//.test(String(dist.evidence)))
    fail.push("resident-demand는 키워드·스레드 URL 증거 필수(주장 불가)");

  // 9) 클리셰 유형 입증 책임 전환
  if (card.clicheType && card.clicheType !== "none" && !card.clicheProof)
    fail.push(`clicheType=${card.clicheType} — 추가 입증(clicheProof) 미제출로 탈락`);

  // 10) 원장 중복 — 죽은 문제 재제안 금지
  const dead = ledger.find((l) => norm(l.problem).slice(0, 30) === norm(card.problem).slice(0, 30) && l.verdict === "dead");
  if (dead) fail.push(`이전에 사망한 문제 재제안(${dead.date}: ${dead.reason}) — 새 증거·상황 변화 없이 불가`);

  results.push({ file: f, id: card.id ?? f, pass: fail.length === 0, fail, warn, aCount, evCount: ev.length });
}

const md = `# 카드 린트 — ${TODAY.toISOString().slice(0, 10)}

| 카드 | 판정 | A급 | 증거 | 사유 |
|---|---|---|---|---|
${results.map((r) => `| ${r.id} | ${r.pass ? "✅ 통과" : "❌ 탈락"} | ${r.aCount} | ${r.evCount} | ${(r.fail[0] ?? r.warn[0] ?? "-").slice(0, 90)} |`).join("\n")}

${results.filter((r) => !r.pass).map((r) => `## ❌ ${r.id}\n${r.fail.map((x) => `- ${x}`).join("\n")}${r.warn.length ? `\n\n경고:\n${r.warn.map((x) => `- ${x}`).join("\n")}` : ""}`).join("\n\n")}
${results.filter((r) => r.pass && r.warn.length).map((r) => `## ⚠️ ${r.id}(통과, 경고)\n${r.warn.map((x) => `- ${x}`).join("\n")}`).join("\n\n")}
`;
if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "card-lint.md"), md); }
console.log(md);
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed}/${results.length} 통과`);
exit(failed ? 1 : 0);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
