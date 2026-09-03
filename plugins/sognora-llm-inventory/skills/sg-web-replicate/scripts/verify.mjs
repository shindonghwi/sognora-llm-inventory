#!/usr/bin/env node
/**
 * verify.mjs — 복제 원장의 결정적 검사. 브라우저 없이, 인자 없이 돈다.
 *
 * 왜 있나 — 1.15.3에서 범용 crawler·diff를 걷어낸 뒤 "잔존 0건·pending 0건·원장 전 셀 pass·slot=asset·라우트 전부 방문"이
 * 산문으로만 남아 판정자가 없었다(2026-09-03 감사). 이 다섯은 파일만 읽어도 결정적으로 잴 수 있다.
 * 브라우저가 필요한 축(≤1px 오차·가로 overflow·console)은 에이전트가 인앱 브라우저 증거 원장으로 판정하고, 여기서는 "미제공"으로 남긴다.
 *
 * usage: node verify.mjs            (cwd에서 .sognora/replica/ 를 찾는다 — 옵션 없음. 필요한 값은 계약·manifest에서 읽는다)
 *   .sognora/replica/contract.json   → brand.original(원본 브랜드 문자열 목록)·brand.originDomains·layout.preset·imagegen.fallback
 *   .sognora/replica/manifest.json   → originAssets[{url, sha256}] (원본 자산 지문) · slots[{assetId, file, width, height, alpha}]
 *   .sognora/replica/routes.json · states.json · qa-ledger.json
 *   프로젝트 소스 = cwd에서 위로 올라가 package.json이 있는 곳(없으면 cwd) — node_modules·.git·.sognora 제외
 * exit 0 = 🔴 0 · 1 = 🔴 있음 · 2 = .sognora/replica 없음
 */
import { readdir, readFile, stat, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname, resolve, extname } from "node:path";
import { argv, exit, cwd } from "node:process";

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const readJson = async (p) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; } };
const F = (id, severity, detail) => ({ id, severity, detail });

/** 프로젝트 루트: cwd에서 위로 package.json. 없으면 cwd. */
export async function findProjectRoot(start) {
  let d = resolve(start);
  for (let i = 0; i < 6; i++) { if (await exists(join(d, "package.json"))) return d; const up = dirname(d); if (up === d) break; d = up; }
  return resolve(start);
}

/** 소스 파일 전수(텍스트 + 이미지). .sognora·node_modules·.git·.next·dist 제외. */
export async function walk(root, { max = 6000 } = {}) {
  const out = []; const stack = [root];
  const SKIP = new Set(["node_modules", ".git", ".sognora", ".next", "dist", "build", "out", ".turbo", "coverage"]);
  while (stack.length && out.length < max) {
    const d = stack.pop(); let ents = [];
    try { ents = await readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { if (SKIP.has(e.name)) continue; const p = join(d, e.name); if (e.isDirectory()) stack.push(p); else out.push(p); }
  }
  return out;
}

const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro|html?|css|scss|sass|less|json|md|mdx|ya?ml|toml|txt|svg|xml)$/i;

/** PNG 헤더만 읽어 width/height/colorType. 라이브러리 없이. JPEG는 SOF 마커에서 크기. */
export function readImageMeta(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString("ascii", 12, 16) === "IHDR") {
    const colorType = buf[25];
    return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { format: "jpeg", width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), alpha: false };
      i += 2 + len;
    }
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { format: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), alpha: !!(buf[20] & 0x10) };
    if (chunk === "VP8 ") return { format: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, alpha: false };
    if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { format: "webp", width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff), alpha: !!((b >> 28) & 1) }; }
  }
  return null;
}

/** ① 잔존 — 순수. files: [{path, text?, sha256?}] */
export function checkResidue({ files, brands = [], domains = [], hashes = [] }) {
  const out = [];
  const brandRe = brands.filter(Boolean).map((b) => new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  const domRe = domains.filter(Boolean).map((d) => new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  const hashSet = new Set(hashes.filter(Boolean).map((h) => h.toLowerCase()));
  const brandHits = [], urlHits = [], hashHits = [];
  for (const f of files) {
    if (typeof f.text === "string") {
      for (const re of brandRe) if (re.test(f.text)) { brandHits.push(f.path); break; }
      for (const re of domRe) if (re.test(f.text)) { urlHits.push(f.path); break; }
    }
    if (f.sha256 && hashSet.has(f.sha256.toLowerCase())) hashHits.push(f.path);
  }
  if (brandHits.length) out.push(F("residue.brand", "🔴", `원본 브랜드 문자열 잔존 ${brandHits.length}파일 — ${brandHits.slice(0, 5).join(", ")}`));
  if (urlHits.length) out.push(F("residue.asset-url", "🔴", `원본 도메인·asset URL 잔존 ${urlHits.length}파일 — ${urlHits.slice(0, 5).join(", ")}`));
  if (hashHits.length) out.push(F("residue.asset-hash", "🔴", `원본 자산 SHA-256 일치 ${hashHits.length}파일 — ${hashHits.slice(0, 5).join(", ")}`));
  if (!brandRe.length && !domRe.length && !hashSet.size) out.push(F("residue.unmeasured", "미제공", "contract.json brand.original·brand.originDomains 또는 manifest.json originAssets가 없어 잔존 축 판정되지 않음"));
  return out;
}

/** ② 상태 계약 — 순수. state-contract.md: version 2, scenarios[], exclusions[{reason}] */
export function checkStateContract(states) {
  const out = [];
  if (!states) return [F("contract.pending", "🔴", "states.json 없음 — 동적 인벤토리가 계약되지 않았다")];
  if (states.version !== 2) out.push(F("contract.pending", "🔴", `states.json version ${JSON.stringify(states.version)} — state-contract.md는 version 2`));
  const raw = JSON.stringify(states);
  const pend = (raw.match(/\b(pending|TODO|TBD|FIXME)\b/gi) || []).length;
  if (pend) out.push(F("contract.pending", "🔴", `states.json에 pending/TODO ${pend}건 — 완료 계약이 아니다`));
  const sc = Array.isArray(states.scenarios) ? states.scenarios : null;
  if (!sc) out.push(F("contract.pending", "🔴", "scenarios 배열이 없다"));
  else {
    if (!sc.length && !states.noneObserved) out.push(F("contract.pending", "🔴", "scenarios: [] 인데 noneObserved(관찰 시간·실행 입력·확인 URL/storage) 근거가 없다"));
    const ids = sc.map((s) => s.id).filter(Boolean); const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) out.push(F("contract.pending", "🔴", `scenario id 중복: ${[...new Set(dup)].join(", ")}`));
    for (const s of sc) {
      if (!s.id || !s.trigger?.type) { out.push(F("contract.pending", "🔴", `scenario ${s.id || "(무명)"}: id 또는 trigger.type 없음`)); continue; }
      if (["click", "press", "drag", "swipe"].includes(s.trigger.type) && s.safe !== true) out.push(F("contract.pending", "🔴", `scenario ${s.id}: ${s.trigger.type}는 safe:true 필수`));
      if (!Array.isArray(s.frames) || !s.frames.some((f) => f.phase === "before") || s.frames.length < 2) out.push(F("contract.pending", "🔴", `scenario ${s.id}: before + 조작 후 프레임이 없다`));
    }
  }
  for (const ex of states.exclusions || []) if (!ex.reason || ex.reason.trim().length < 6) out.push(F("contract.pending", "🔴", `exclusion ${ex.selector || "(무명)"}: 사유 없는 제외는 거부`));
  return out;
}

/** ③ qa-ledger — 순수. evidenceExists(path) → boolean */
export function checkLedger(ledger, evidenceExists) {
  const out = [];
  const cells = Array.isArray(ledger) ? ledger : Array.isArray(ledger?.cells) ? ledger.cells : null;
  if (!cells) return [F("ledger.incomplete", "🔴", "qa-ledger.json 없음 또는 셀 배열이 아니다")];
  if (!cells.length) return [F("ledger.incomplete", "🔴", "qa-ledger.json 셀 0개")];
  let notPass = 0, noEvidence = 0, noReason = 0;
  for (const c of cells) {
    const checks = Object.values(c.checks || {});
    const allPass = checks.length && checks.every((v) => v === "pass");
    if (c.status !== "pass" || !allPass) notPass++;
    const ev = [...(c.referenceEvidence || []), ...(c.localEvidence || [])];
    if (!(c.referenceEvidence || []).length || !(c.localEvidence || []).length || !ev.every(evidenceExists)) noEvidence++;
    if (c.status === "pass" && allPass && !(c.measurements || []).length && !(c.notes || "").trim()) noReason++;
  }
  if (notPass) out.push(F("ledger.incomplete", "🔴", `pass 아닌 셀 ${notPass}/${cells.length}`));
  if (noEvidence) out.push(F("ledger.incomplete", "🔴", `reference/local 증거 파일이 없거나 실존하지 않는 셀 ${noEvidence}/${cells.length}`));
  if (noReason) out.push(F("ledger.no-reason", "🟡", `측정값·메모 없는 pass 셀 ${noReason} — 이유 없는 pass는 인정하지 않는다(rules.md 증거 원장)`));
  return out;
}

/** ④ slot ↔ asset — 순수. slots[{assetId,file,width,height,alpha}], metaOf(file) → {width,height,alpha} | null */
export function checkSlots(slots, metaOf) {
  const out = [];
  if (!Array.isArray(slots)) return [F("asset.slot-mismatch", "미제공", "manifest.json slots가 없어 slot↔asset 축 판정되지 않음")];
  if (!slots.length) return [F("asset.slot-mismatch", "🔴", "visual slot 0개 — 이미지 영역·규격 계약이 없다")];
  const ids = slots.map((s) => s.assetId); const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) out.push(F("asset.slot-mismatch", "🔴", `assetId 중복: ${[...new Set(dup)].join(", ")}`));
  const missing = [], bad = [];
  for (const s of slots) {
    if (!s.file) { missing.push(s.assetId); continue; }
    const m = metaOf(s.file);
    if (!m) { missing.push(`${s.assetId}(${s.file})`); continue; }
    const why = [];
    if (s.width && Math.abs(m.width - s.width) > 0) why.push(`w ${m.width}≠${s.width}`);
    if (s.height && Math.abs(m.height - s.height) > 0) why.push(`h ${m.height}≠${s.height}`);
    if (typeof s.alpha === "boolean" && m.alpha !== s.alpha) why.push(`alpha ${m.alpha}≠${s.alpha}`);
    if (why.length) bad.push(`${s.assetId}: ${why.join(", ")}`);
  }
  if (missing.length) out.push(F("asset.slot-mismatch", "🔴", `생성 파일 없는 slot ${missing.length}: ${missing.slice(0, 6).join(", ")}`));
  if (bad.length) out.push(F("asset.slot-mismatch", "🔴", `규격 불일치 ${bad.length}: ${bad.slice(0, 6).join(" · ")}`));
  return out;
}

/** ⑤ routes — 순수. routes[{route|path|url, visited}] */
export function checkRoutes(routes) {
  const list = Array.isArray(routes) ? routes : Array.isArray(routes?.routes) ? routes.routes : null;
  if (!list) return [F("routes.unvisited", "🔴", "routes.json 없음 또는 배열이 아니다")];
  if (!list.length) return [F("routes.unvisited", "🔴", "routes.json 후보 0개")];
  const un = list.filter((r) => r.visited !== true && r.visited !== "true");
  return un.length ? [F("routes.unvisited", "🔴", `미방문 후보 ${un.length}/${list.length}: ${un.slice(0, 6).map((r) => r.route || r.path || r.url || "?").join(", ")}`)] : [];
}

export async function verify(root) {
  const R = join(root, ".sognora", "replica");
  if (!(await exists(R))) return null;
  const contract = await readJson(join(R, "contract.json"));
  const manifest = await readJson(join(R, "manifest.json"));
  const states = await readJson(join(R, "states.json"));
  const ledger = await readJson(join(R, "qa-ledger.json"));
  const routes = await readJson(join(R, "routes.json"));
  const findings = [];
  if (!contract) findings.push(F("contract.missing", "🔴", "contract.json 없음 — 원본 URL·viewport·브랜드 매핑이 계약되지 않았다"));
  else {
    if (!contract.layout?.preset) findings.push(F("contract.layout-preset", "🟡", "contract.layout.preset 미기재 — layout-presets.md의 프리셋 이름을 한 번 적어 되묻지 않게 한다"));
    if (contract.imagegen && !("fallback" in contract.imagegen)) findings.push(F("contract.imagegen-fallback", "🟡", "contract.imagegen.fallback 미기재 — built-in 실패 시 처분(none|hold|<승인한 대안>)을 한 번 적어 두면 재승인이 없다"));
  }
  /* ① 잔존 */
  const project = await findProjectRoot(root);
  const paths = await walk(project);
  const files = [];
  for (const p of paths) {
    const ext = extname(p).toLowerCase();
    try {
      if (TEXT_EXT.test(p)) { const st = await stat(p); if (st.size < 2_000_000) files.push({ path: p, text: await readFile(p, "utf8") }); }
      else if (/\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|woff2?|ttf|otf)$/i.test(ext)) files.push({ path: p, sha256: createHash("sha256").update(await readFile(p)).digest("hex") });
    } catch { /* 읽기 실패는 건너뜀 */ }
  }
  findings.push(...checkResidue({ files, brands: contract?.brand?.original || [], domains: contract?.brand?.originDomains || [], hashes: (manifest?.originAssets || []).map((a) => a.sha256) }));
  /* ② 계약 ③ 원장 ④ 슬롯 ⑤ 라우트 */
  findings.push(...checkStateContract(states));
  findings.push(...checkLedger(ledger, (p) => { try { return require_sync_exists(join(R, p)); } catch { return false; } }));
  findings.push(...checkSlots(manifest?.slots ?? null, (file) => { try { const buf = readFileSyncSafe(resolve(project, file)); return buf ? readImageMeta(buf) : null; } catch { return null; } }));
  findings.push(...checkRoutes(routes));
  /* ⑥ 브라우저 축 — 여기서는 잴 수 없다 */
  findings.push(F("browser.layout-tolerance", "미제공", "≤1px 오차·가로 overflow·console 신규 오류는 에이전트가 인앱 브라우저 증거 원장(qa-ledger measurements)으로 판정 — 이 계기 범위 밖"));
  const red = findings.filter((f) => f.severity === "🔴").length, yellow = findings.filter((f) => f.severity === "🟡").length, na = findings.filter((f) => f.severity === "미제공").length;
  return { root: R, project, files: files.length, findings, summary: { red, yellow, unmeasured: na, verdict: red ? "🔴" : yellow ? "🟡" : "✅" } };
}

import { existsSync, readFileSync } from "node:fs";
function require_sync_exists(p) { return existsSync(p); }
function readFileSyncSafe(p) { return existsSync(p) ? readFileSync(p) : null; }

export function renderMd(r) {
  const L = [`# verify — ${r.root}`, "", `판정 ${r.summary.verdict} · 🔴 ${r.summary.red} · 🟡 ${r.summary.yellow} · 미제공 ${r.summary.unmeasured} · 검사 파일 ${r.files}`, "", "미제공은 통과가 아니다 — 그 축은 이 계기가 판정하지 않았다.", ""];
  for (const f of r.findings) L.push(`- ${f.severity} \`${f.id}\` ${f.detail}`);
  if (!r.findings.some((f) => f.severity === "🔴" || f.severity === "🟡")) L.push("- ✅ 결정적 축(잔존·계약·원장·슬롯·라우트) 결함 없음");
  return L.join("\n") + "\n";
}

const isMain = argv[1] && import.meta.url === new URL(`file://${argv[1]}`).href;
if (isMain) {
  const r = await verify(cwd());
  if (!r) { console.error(".sognora/replica/ 가 없다 — 복제 원장(contract·routes·states·qa-ledger·manifest)이 있는 프로젝트 루트에서 실행하라"); exit(2); }
  console.log(renderMd(r));
  exit(r.summary.red ? 1 : 0);
}
