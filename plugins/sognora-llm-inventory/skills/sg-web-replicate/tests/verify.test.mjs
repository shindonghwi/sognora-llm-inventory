/* verify.mjs는 순수 함수 묶음이다 — 파일 시스템 없이 판정이 재현돼야 한다. PNG 헤더는 실제 바이트로 만든다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResidue, checkStateContract, checkLedger, checkSlots, checkRoutes, readImageMeta } from "../scripts/verify.mjs";

const reds = (fs) => fs.filter((f) => f.severity === "🔴").map((f) => f.id);

/** 최소 PNG: 시그니처 + IHDR(width,height,bitDepth,colorType) */
function png(width, height, colorType) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write("IHDR", 12);
  b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b[24] = 8; b[25] = colorType;
  return b;
}

test("PNG 헤더에서 width·height·alpha를 읽는다(라이브러리 없이)", () => {
  assert.deepEqual(readImageMeta(png(640, 400, 6)), { format: "png", width: 640, height: 400, alpha: true });
  assert.deepEqual(readImageMeta(png(1200, 630, 2)), { format: "png", width: 1200, height: 630, alpha: false });
  assert.equal(readImageMeta(Buffer.from("not an image")), null);
});

test("잔존: 브랜드 문자열·원본 도메인·원본 해시가 있으면 🔴, 없으면 통과", () => {
  const files = [
    { path: "src/app/page.tsx", text: "<h1>Sylva Living</h1>" },
    { path: "src/styles.css", text: "background:url(https://cdn.original.com/hero.jpg)" },
    { path: "public/hero.png", sha256: "abc123" },
    { path: "public/logo.png", sha256: "fff" },
  ];
  const r = checkResidue({ files, brands: ["Sylva"], domains: ["cdn.original.com"], hashes: ["ABC123"] });
  assert.deepEqual(reds(r).sort(), ["residue.asset-hash", "residue.asset-url", "residue.brand"]);
  const clean = checkResidue({ files: [{ path: "a.tsx", text: "<h1>Verdan</h1>" }, { path: "b.png", sha256: "000" }], brands: ["Sylva"], domains: ["cdn.original.com"], hashes: ["abc123"] });
  assert.deepEqual(reds(clean), []);
  const none = checkResidue({ files, brands: [], domains: [], hashes: [] });
  assert.ok(none.some((f) => f.severity === "미제공"), "대조 목록이 없으면 통과가 아니라 미제공");
});

test("상태 계약: version 2·pending 0·safe 필수·before 프레임·exclusion 사유", () => {
  const good = { version: 2, scenarios: [{ id: "menu", trigger: { type: "click", selector: "button" }, safe: true, frames: [{ name: "before", phase: "before" }, { name: "after", atMs: 200 }] }], exclusions: [{ selector: "a.x", reason: "브라우저 기본 링크이며 전 상태 동일" }] };
  assert.deepEqual(reds(checkStateContract(good)), []);
  const bad = { version: 1, scenarios: [{ id: "menu", trigger: { type: "click" }, frames: [{ name: "after", atMs: 200 }], notes: "TODO 확인" }, { id: "menu", trigger: { type: "hover" }, frames: [] }], exclusions: [{ selector: "a" }] };
  const r = checkStateContract(bad);
  assert.ok(reds(r).length >= 5, JSON.stringify(r));
  assert.deepEqual(reds(checkStateContract({ version: 2, scenarios: [] })), ["contract.pending"], "빈 scenarios는 noneObserved 근거 없이는 🔴");
  assert.deepEqual(reds(checkStateContract({ version: 2, scenarios: [], noneObserved: { observedMs: 12000, inputs: ["scroll", "hover"], urls: ["/"] } })), []);
  assert.deepEqual(reds(checkStateContract(null)), ["contract.pending"]);
});

test("qa-ledger: 전 셀 pass + 증거 실존이어야 통과, 이유 없는 pass는 🟡", () => {
  const ev = new Set(["evidence/reference/home/1440x900/initial.png", "evidence/local/home/1440x900/initial.png"]);
  const cell = { route: "/", viewport: "1440x900", stateId: "initial", referenceEvidence: ["evidence/reference/home/1440x900/initial.png"], localEvidence: ["evidence/local/home/1440x900/initial.png"], checks: { layout: "pass", behavior: "pass" }, measurements: [{ selector: "header", field: "height", reference: 72, local: 72 }], status: "pass" };
  assert.deepEqual(reds(checkLedger([cell], (p) => ev.has(p))), []);
  const noReason = checkLedger([{ ...cell, measurements: [], notes: "" }], (p) => ev.has(p));
  assert.ok(noReason.some((f) => f.id === "ledger.no-reason" && f.severity === "🟡"));
  const failing = checkLedger([{ ...cell, checks: { layout: "pass", behavior: "fail" }, status: "fail" }, { ...cell, localEvidence: ["evidence/local/missing.png"] }], (p) => ev.has(p));
  assert.ok(reds(failing).includes("ledger.incomplete"));
  assert.deepEqual(reds(checkLedger([], () => true)), ["ledger.incomplete"]);
});

test("slot↔asset: 파일 규격·alpha 일치만 통과, 파일 없음·불일치·중복 id는 🔴", () => {
  const metas = { "public/images/hero.png": { width: 1440, height: 600, alpha: false }, "public/images/logo.png": { width: 400, height: 400, alpha: true } };
  const slots = [{ assetId: "hero", file: "public/images/hero.png", width: 1440, height: 600, alpha: false }, { assetId: "logo", file: "public/images/logo.png", width: 400, height: 400, alpha: true }];
  assert.deepEqual(reds(checkSlots(slots, (f) => metas[f] || null)), []);
  const bad = [{ assetId: "hero", file: "public/images/hero.png", width: 1440, height: 640 }, { assetId: "hero", file: "public/images/none.png" }, { assetId: "logo", file: "public/images/logo.png", alpha: false }];
  const r = checkSlots(bad, (f) => metas[f] || null);
  assert.ok(reds(r).includes("asset.slot-mismatch"));
  assert.ok(r.some((f) => /중복/.test(f.detail)) && r.some((f) => /규격 불일치/.test(f.detail)) && r.some((f) => /파일 없는/.test(f.detail)), JSON.stringify(r));
  assert.ok(checkSlots(null, () => null).some((f) => f.severity === "미제공"));
});

test("routes: 전부 visited여야 통과", () => {
  assert.deepEqual(reds(checkRoutes([{ route: "/", visited: true }, { route: "/pricing", visited: true }])), []);
  assert.deepEqual(reds(checkRoutes({ routes: [{ route: "/", visited: true }, { route: "/about", visited: false }] })), ["routes.unvisited"]);
  assert.deepEqual(reds(checkRoutes([])), ["routes.unvisited"]);
});
