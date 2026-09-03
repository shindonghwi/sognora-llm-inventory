/* 규칙은 순수다 — 기록된 scan.json 픽스처만으로 판정이 재현돼야 한다(브라우저 없음). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detect } from "../scripts/detect.mjs";
import { ALL_RULES, byId } from "../scripts/rules/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const load = async (n) => JSON.parse(await readFile(join(here, "fixtures", n), "utf8"));

test("규칙 메타: 모든 규칙에 축.의미 ID·심각도·근거·threshold basis가 있다", () => {
  assert.ok(ALL_RULES.length >= 50);
  for (const r of ALL_RULES) {
    assert.match(r.id, /^[a-z]+\.[a-z0-9-]+$/, r.id);
    assert.ok(["🔴", "🟡", "ℹ️"].includes(r.severity), `${r.id} severity`);   // ℹ️ = 보고만(판정 없음)
    assert.ok(r.evidence && r.evidence.length > 8, `${r.id} evidence`);
    assert.ok(!r.threshold || ["corpus", "citation", "definition"].includes(r.threshold.basis), `${r.id} threshold.basis`);
    assert.equal(typeof r.run, "function");
  }
  assert.equal(new Set(ALL_RULES.map((r) => r.id)).size, ALL_RULES.length, "ID 중복");
});

test("슬롭 픽스처(보라 그라데이션·카드 3·이모지·Inter·제작자 시점)는 🔴 판정", async () => {
  const scan = await load("slop-landing.scan.json");
  const res = detect(scan, { type: "landing" });
  const ids = new Set(res.findings.filter((f) => f.severity === "🔴" || f.severity === "🟡").map((f) => f.id));
  for (const id of ["color.purple-gradient", "font.hangul-fallback", "font.ai-default", "icon.emoji", "layout.badge-above-h1", "copy.maker-voice", "type.heavy-weight-share"]) assert.ok(ids.has(id), `missing ${id}`);
  assert.ok(res.summary.red > 0);
  assert.equal(res.summary.verdict, "🔴", JSON.stringify(res.summary));
});

test("깨끗한 문서 픽스처(Pretendard·400·목차·시행일)는 🔴 0", async () => {
  const scan = await load("clean-document.scan.json");
  const res = detect(scan, { type: "document" });
  assert.equal(res.summary.red, 0, JSON.stringify(res.findings.filter((f) => f.severity === "🔴").map((f) => f.id + ":" + f.detail)));
  assert.notEqual(res.summary.verdict, "🔴");
});

test("면제(exemptions)는 취향 규칙만 '채택'으로 바꾸고 품질 바닥은 못 바꾼다", async () => {
  const scan = await load("slop-landing.scan.json");
  const ex = new Map([["color.purple-gradient", "다크 시네마 방향"], ["font.hangul-fallback", "시도"]]);
  const res = detect(scan, { type: "landing", exemptions: ex });
  assert.ok(res.findings.some((f) => f.id === "color.purple-gradient" && f.severity === "채택"));
  assert.ok(res.findings.some((f) => f.id === "font.hangul-fallback" && f.severity === "🔴"), "한글 폴백은 면제 불가");
});

test("유형별 구조 규칙은 그 유형에서만 켜진다", async () => {
  const scan = await load("clean-document.scan.json");
  const asCatalog = detect(scan, { type: "catalog" });
  assert.ok(asCatalog.findings.some((f) => f.id === "catalog.too-few-items"), "문서를 카탈로그로 선언하면 항목 부족");
  const asDoc = detect(scan, { type: "document" });
  assert.ok(!asDoc.findings.some((f) => f.id === "catalog.too-few-items"));
  assert.ok(byId["document.no-toc"]);
});
