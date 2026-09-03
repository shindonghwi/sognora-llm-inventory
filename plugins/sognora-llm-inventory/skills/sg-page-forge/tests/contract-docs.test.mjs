import { test } from "node:test";
import assert from "node:assert/strict";
import { scaffold, check } from "../scripts/contract.mjs";
import { lintDefects } from "../scripts/lint-docs.mjs";
import { lintTokens, parseDesignBaseline, shadcnDefault } from "../scripts/conform.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));

test("계약 발판은 TODO로 시작하고 --check가 막는다; 채우면 통과", () => {
  const c = scaffold(["/", "/pricing"]);
  assert.ok(check(c).length >= 4, "TODO가 잡혀야 한다");
  for (const p of c.pages) { p.type = p.route === "/" ? "landing" : "pricing"; p.decision = "결정"; p.facts = ["사실 1"]; p.must = []; p.mustNot = []; }
  c.center = "중심 장면";
  assert.deepEqual(check(c), []);
  c.pages[1].type = "catlog";
  assert.ok(check(c).some((e) => /type/.test(e)), "오타 유형은 초록 도장을 못 받는다");
  c.pages[1].type = "do:갤러리";
  assert.deepEqual(check(c), [], "미등재 화면은 동사 선언으로 통과");
});

test("진단 모드는 facts·시안 의무를 면제한다", () => {
  const c = scaffold(["/"]); c.pages[0].type = "landing"; c.pages[0].decision = "결정"; c.center = "장면";
  assert.ok(check(c).some((e) => /facts/.test(e)));
  assert.deepEqual(check(c, { diagnose: true }).filter((e) => /facts/.test(e)), []);
});

test("defects.md: 해결에는 캡처 파일명, 폐기에는 사용자 인용이 있어야 한다", () => {
  const ok = `| # | 관찰 | 근거 | 원인 층 | 수정 | 재검증 | 상태 |\n|---|---|---|---|---|---|---|\n| 1 | 여백 지배 | qa/x.png | 구도 | 실체 투입 | qa/y-1440x900.png | 해결 |\n`;
  assert.deepEqual(lintDefects(ok).filter((f) => f.severity === "🔴"), []);
  const bad = `| # | 관찰 | 근거 | 원인 층 | 수정 | 재검증 | 상태 |\n|---|---|---|---|---|---|---|\n| 1 | 여백 지배 | qa/x.png | 취향 | 전면 폐기 | 없음 | 해결 |\n`;
  const reds = lintDefects(bad).filter((f) => f.severity === "🔴");
  assert.ok(reds.length >= 2, JSON.stringify(reds));
});

test("design-baseline.md의 JSON 블록은 tokens로 읽히고 한글 서체가 있다", async () => {
  const md = await readFile(join(here, "..", "references", "design-baseline.md"), "utf8");
  const t = parseDesignBaseline(md);
  assert.ok(t && t.colors && t.type, "JSON 블록 파싱");
  const lint = lintTokens(t);
  assert.ok(!lint.some((l) => l.id === "token.hangul-family"), JSON.stringify(lint));
  assert.ok(!lint.some((l) => l.severity === "🔴"), JSON.stringify(lint));
});

test("shadcn 기본 테마 잔존은 CSS 텍스트에서 잡힌다", () => {
  const css = `:root{--background: 0 0% 100%;--foreground: 0 0% 13%;--muted: 0 0% 96%;--border: 0 0% 88%;--radius: 0.5rem;} body{font-family: Inter, sans-serif}`;
  const r = shadcnDefault(css);
  assert.ok(r.hits.length >= 3, JSON.stringify(r));
  const clean = `:root{--background: 40 20% 98%;--foreground: 30 10% 15%;--muted: 40 10% 93%;--border: 35 12% 82%;--radius: 8px;} body{font-family: Pretendard, sans-serif}`;
  assert.ok(shadcnDefault(clean).hits.length < 3);
});
