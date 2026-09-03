import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { check as historyCheck, paletteFamily, parseAxes } from "../scripts/history.mjs";
import { extractBrief, fill, JUDGES } from "../scripts/judge-pack.mjs";
import { buildRows, OTHER_RULES } from "../scripts/rule-index.mjs";
import { ALL_RULES, STANDALONE_RED } from "../scripts/rules/index.mjs";
import { compileBrief, codexAvailable, CODEX_MISSING_NOTE } from "../scripts/comp.mjs";
import { check as contractCheck, scaffold } from "../scripts/contract.mjs";
const here = dirname(fileURLToPath(import.meta.url));

test("history: 이력 없음 = 미제공(실패 아님), 최근 3회 리드 재사용 🔴, 팔레트 계열 동일 🔴, 7축 3미만 🟡", () => {
  const na = historyCheck(null, { lead: "stripe-com" });
  assert.equal(na.findings[0].severity, "미제공"); assert.equal(na.findings[0].id, "history.unavailable");
  const hist = { runs: [
    { date: "2026-08-01", lead: "toss-im", palette: "#F4F1EA", axes: { typo: "serif", color: "cream", layout: "editorial", density: "airy", decor: "rule", motion: "reveal", signature: "type" } },
    { date: "2026-08-20", lead: "stripe-com", palette: "#0B0908", axes: { typo: "grotesk", color: "dark", layout: "grid", density: "dense", decor: "photo", motion: "point", signature: "hero" } },
  ] };
  const r = historyCheck(hist, { lead: "stripe-com", palette: "#0F0D0C", axes: parseAxes("typo=grotesk,color=dark,layout=grid,density=dense,decor=photo,motion=static,signature=hero") });
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes("lead.reuse")); assert.ok(ids.includes("palette.history-repeat")); assert.ok(ids.includes("direction.axes-repeat"));
  const ok = historyCheck(hist, { lead: "linear-app", palette: "#2A6F3A", axes: parseAxes("typo=serif,color=green,layout=asym,density=dense,decor=illus,motion=static,signature=color") });
  assert.deepEqual(ok.findings, []);
  assert.equal(paletteFamily("#F4F1EA"), paletteFamily("#EFE7DE"), "크림·베이지는 한 계열");
  assert.notEqual(paletteFamily("#F4F1EA"), paletteFamily("#0B0908"));
});

test("judge-pack: 블록인용만 추출(근거·처분·[[링크]] 제외), comp-judge 자리표시자가 전부 치환된다", async () => {
  for (const j of JUDGES) {
    const md = await readFile(join(here, "..", "wiki", "judge", `${j}.md`), "utf8");
    const { body } = extractBrief(md);
    assert.ok(body.length > 50, `${j} 브리프 본문`);
    assert.ok(!/근거:|실전 사고|\[\[|## 처분|## 통과선/.test(body), `${j} 블라인드 누수`);
  }
  const comp = extractBrief(await readFile(join(here, "..", "wiki", "judge", "comp-judge.md"), "utf8")).body;
  const vars = { "<board.png>": "b.png", "<desktop.png>": "d.png", "<mobile.png>": "m.png", "<대상 캡처>": "d.png", "<모바일 캡처>": "m.png", "<시안>": "b.png", "<타깃 페르소나>": "p", "<경쟁A>": "a", "<경쟁B>": "b", "<장르>": "g", "<자산 목록>": "x" };
  const { unreplaced } = fill(comp, vars);
  assert.deepEqual(unreplaced, [], "미치환 자리표시자");
  const tail = extractBrief(await readFile(join(here, "..", "wiki", "judge", "ai-slop-judge.md"), "utf8")).tail;
  assert.ok(/y좌표순/.test(tail), "공통 꼬리말 추출");
});

test("rule-index: 코드의 모든 ID가 색인에 있고 중복이 없다", () => {
  const rows = buildRows(); const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of ALL_RULES) assert.ok(ids.includes(r.id), r.id);
  for (const id of STANDALONE_RED) assert.ok(ids.includes(id), `standalone ${id}`);
  for (const o of OTHER_RULES) assert.match(o.id, /^[a-z]+\.[a-z0-9<>-]+$/);
});

test("comp: codex 부재는 죽지 않는다 — 안내 문구가 있고 프롬프트 산출 경로가 --out을 따른다", () => {
  assert.equal(typeof codexAvailable(), "boolean");
  assert.match(CODEX_MISSING_NOTE(".sognora/page/comps", "home"), /미제공/);
  const c = scaffold(["/"]); c.pages[0].type = "landing"; c.pages[0].decision = "결정"; c.pages[0].facts = ["사실"]; c.center = "장면";
  const b = compileBrief(c, c.pages[0], null, { variants: 2, out: "custom/comps" });
  assert.ok(b.includes("custom/comps/home.prompt.md") && b.includes("home-2.png"));
});

test("contract: foundation은 deferred만 허용", () => {
  const c = scaffold(["/"]); c.pages[0].type = "about"; c.pages[0].decision = "d"; c.pages[0].facts = ["f"];
  assert.deepEqual(contractCheck(c), []);
  c.foundation = "deferred"; assert.deepEqual(contractCheck(c), []);
  c.foundation = "later"; assert.ok(contractCheck(c).some((e) => /foundation/.test(e)));
});
