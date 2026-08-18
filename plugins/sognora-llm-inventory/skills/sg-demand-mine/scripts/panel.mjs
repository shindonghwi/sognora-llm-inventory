/**
 * panel.mjs — 킬 패널 기록 강제 (P4를 산문에서 파일 계약으로)
 *
 * usage:
 *   panel.mjs --cards <dir> --out <dir> --init          판정 서식 생성(카드마다 빈 칸)
 *   panel.mjs --cards <dir> --panel <verdicts.json>     완결성 검증 — 미기재가 있으면 종료 코드 1
 *
 * 왜 있나: 룰북이 스스로 "산문 규칙은 에이전트를 구속하지 못한다"고 적어놓고, 정작 가장 강한 판정
 * 단계(킬 패널)만 산문이었다. 안 돌리고 "죽였습니다"라고 쓸 수 있었다는 실전 지적이 근거다.
 * 이 스크립트는 판정을 대신하지 않는다(판정은 신선한 컨텍스트 에이전트의 몫) — **기록을 강제**한다.
 * P5 숏리스트는 이 파일 없이 쓸 수 없다.
 *
 * verdicts.json:
 * [{ "cardId": "...",
 *    "kill":    { "verdict": "survive|dead", "criteria": {"already-exists":"...", "commodity":"...",
 *                 "no-distribution":"...", "laundering":"...", "timing":"...", "regulatory":"..."},
 *                 "competitorsChecked": [{"name":"ServiceM8","pricing":"$0~$349/월","url":"..."}] },
 *    "reverse": { "problemReconstructed": "인용만 보고 복원한 문제", "matchesCard": true|false, "note": "..." } }]
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";

const args = parseArgs(argv.slice(2));
if (!args.cards) { console.error("usage: panel.mjs --cards <dir> (--init --out <dir> | --panel <verdicts.json>)"); exit(2); }
const CRITERIA = ["already-exists", "commodity", "no-distribution", "laundering", "timing", "regulatory"];
const cardIds = [];
for (const f of await readdir(args.cards)) if (f.endsWith(".json")) cardIds.push(JSON.parse(await readFile(join(args.cards, f), "utf8")).id ?? f);

if (args.init) {
  const tpl = cardIds.map((id) => ({
    cardId: id,
    kill: { verdict: "", criteria: Object.fromEntries(CRITERIA.map((c) => [c, ""])), competitorsChecked: [] },
    reverse: { problemReconstructed: "", matchesCard: null, note: "" },
  }));
  const out = args.out ?? args.cards;
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "verdicts.json"), JSON.stringify(tpl, null, 2));
  console.log(`판정 서식 생성: ${join(out, "verdicts.json")} (카드 ${cardIds.length}장)`);
  console.log("→ 킬 판정자와 역구성 판정자에게 mine-rules §킬 기준 브리프를 주고, 결과를 이 파일에 채운 뒤 --panel로 검증하라.");
  exit(0);
}
if (!args.panel) { console.error("--init 또는 --panel 중 하나가 필요하다"); exit(2); }

const v = JSON.parse(await readFile(args.panel, "utf8"));
const problems = [];
for (const id of cardIds) {
  const e = v.find((x) => x.cardId === id);
  if (!e) { problems.push(`${id}: 판정 없음 — 킬 패널을 돌리지 않았다`); continue; }
  if (!["survive", "dead"].includes(e.kill?.verdict)) problems.push(`${id}: kill.verdict 미기재`);
  for (const c of CRITERIA) if (!String(e.kill?.criteria?.[c] ?? "").trim()) problems.push(`${id}: 킬 기준 미심문 — ${c}`);
  // "이미 있음"은 실물 확인 없이 판정할 수 없다 (실전 사고: ServiceM8·Wave Data Export를 못 보고 카드를 썼다)
  if (!(e.kill?.competitorsChecked ?? []).length) problems.push(`${id}: competitorsChecked 비어 있음 — 살아있는 대안을 실물로 확인하지 않았다`);
  else for (const c of e.kill.competitorsChecked) if (!c.name || !c.pricing) problems.push(`${id}: 경쟁 제품 기재 불완전(name·pricing 필수)`);
  if (!String(e.reverse?.problemReconstructed ?? "").trim()) problems.push(`${id}: 역구성 판정 없음 — 인용만 보고 문제를 복원시켜야 세탁이 잡힌다`);
  if (e.reverse?.matchesCard !== true && e.reverse?.matchesCard !== false) problems.push(`${id}: reverse.matchesCard 미기재`);
  if (e.reverse?.matchesCard === false && e.kill?.verdict === "survive") problems.push(`${id}: 역구성 불일치(증거 세탁)인데 survive — 모순`);
}
const survivors = v.filter((x) => x.kill?.verdict === "survive" && x.reverse?.matchesCard === true).map((x) => x.cardId);
const dead = v.filter((x) => x.kill?.verdict === "dead" || x.reverse?.matchesCard === false);
console.log(`# 킬 패널 검증\n`);
if (problems.length) {
  console.log(`❌ 미완 ${problems.length}건 — P5 숏리스트를 쓸 수 없다\n`);
  problems.forEach((p) => console.log(`  - ${p}`));
  exit(1);
}
console.log(`✅ 판정 완결 · 생존 ${survivors.length} · 사망 ${dead.length}`);
console.log(survivors.length ? `생존: ${survivors.join(", ")}` : "생존자 0 — 카드 0개도 정직한 결과다(rules §8). 사망자 명부를 숏리스트 대신 보고하라.");
for (const d of dead) {
  const why = d.reverse?.matchesCard === false ? "증거 세탁(역구성 불일치)" : Object.entries(d.kill?.criteria ?? {}).find(([, val]) => /사망|dead|치명/.test(String(val)))?.[0] ?? "킬 기준";
  console.log(`  ✝ ${d.cardId} — ${why}`);
}
exit(0);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
