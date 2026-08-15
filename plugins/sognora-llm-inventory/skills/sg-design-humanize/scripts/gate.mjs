#!/usr/bin/env node
/**
 * 게이트 판정기 — before/after scan.json 두 개만으로 오프라인 판정. 브라우저·git 무의존.
 *
 * node gate.mjs --before <dir> --after <dir> [--overhaul] [--confirmed <json>] [--out <json>]
 *
 * 게이트 1: 티 사후조건 — before의 확정 🔴 룰이 매핑된 after 섹션에서 재탐지되면 실패
 * 게이트 2: 시그니처 린트 — 재설계 요구 섹션의 이산 4성분이 전부 불변이면 "조정만 했음" 실패
 * 게이트 3: 불변 — 텍스트(연접 커버+삭제 허용 목록)·링크·정보성 이미지
 *
 * exit 0 통과 / 1 실패 / 2 실행 불가
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { RULES, isOrdinal, jaccard, signatureDiff } from "./rules-lib.mjs";

const args = parseArgs(argv.slice(2));
if (!args.before || !args.after) {
  console.error("usage: gate.mjs --before <dir> --after <dir> [--overhaul] [--confirmed <json>] [--out <json>]");
  exit(2);
}

const before = await loadScan(args.before);
const after = await loadScan(args.after);
if (!before || !after) exit(2);

const confirmed = await readFile(args.confirmed ?? join(args.before, "confirmed.json"), "utf8")
  .then((s) => new Set(JSON.parse(s).map((c) => (typeof c === "string" ? c : `${c.rule}|${c.sec ?? "null"}`))))
  .catch(() => new Set());

const failures = [], warnings = [], notes = [];
const weakGate = before.meta.renderable === false || after.meta.renderable === false;

// 확정 티 = 결정적 전부 + 혐의 중 confirmed.json에 오른 것. 미확정 혐의는 경고로만.
const activeTells = (scan) =>
  scan.tells.filter((t) => t.judge !== "suspect" || confirmed.has(`${t.rule}|${t.sec ?? "null"}`));
for (const t of before.tells.filter((t) => t.judge === "suspect" && !confirmed.has(`${t.rule}|${t.sec ?? "null"}`)))
  warnings.push(`미확정 혐의 ${t.rule}(섹션 ${t.sec}) — confirmed.json에 승격/기각을 기록할 것`);

// ---- 섹션 매핑 (자카드 그리디, n:1 허용) ----
let mapping = {};
if (!weakGate) {
  const bSecs = before.desktop.sections, aSecs = after.desktop.sections;
  const setOf = (s) => new Set((s.textBlocks ?? []).map((t) => t.trim()).filter(Boolean));
  for (const b of bSecs) {
    let bestIdx = -1, bestJ = -1;
    for (const a of aSecs) {
      const j = jaccard(setOf(b), setOf(a));
      if (j > bestJ + 1e-9) { bestJ = j; bestIdx = a.index; }
    }
    // 텍스트 근거가 전혀 없으면 문서 순서 비례로 대응
    mapping[b.index] = bestJ > 0 ? bestIdx : Math.min(aSecs.length - 1, Math.round((b.index / Math.max(1, bSecs.length - 1)) * (aSecs.length - 1)));
  }
}

// ---- 게이트 1: 티 사후조건 ----
const afterActive = activeTells(after);
for (const t of activeTells(before).filter((t) => t.sev === "red")) {
  const hit =
    RULES[t.rule].scope === "page"
      ? afterActive.find((a) => a.rule === t.rule)
      : afterActive.find((a) => a.rule === t.rule && a.sec === (mapping[t.sec] ?? t.sec));
  if (hit) failures.push(`[사후조건] ${t.rule} 재탐지 — before 섹션 ${t.sec ?? "페이지"} → after ${hit.sec ?? "페이지"}: ${hit.evidence}`);
}
for (const t of afterActive.filter((t) => t.sev === "yellow")) notes.push(`🟡 잔존 ${t.rule}(${t.sec ?? "페이지"}): ${t.evidence}`);

// ---- 게이트 2: 시그니처 린트 ("조정만 했음" 차단) — 재설계 요구 섹션만, 데스크톱 ----
if (!weakGate) {
  const required = new Set(
    activeTells(before)
      .filter((t) => t.layer === "structural" && t.sec !== null && (t.sev === "red" || (args.overhaul && t.sev === "yellow")))
      .map((t) => t.sec)
  );
  for (const secIdx of required) {
    const b = before.desktop.sections.find((s) => s.index === secIdx);
    const a = after.desktop.sections.find((s) => s.index === mapping[secIdx]);
    if (!b?.signature || !a?.signature) continue;
    const changed = signatureDiff(b.signature, a.signature);
    if (changed.length === 0)
      failures.push(`[조정만 했음] 섹션 ${secIdx} → ${mapping[secIdx]}: 시그니처 4성분(rows/uniform/align/media) 전부 불변 — 스켈레톤을 갈지 않고 스타일만 바꿨다`);
    else notes.push(`섹션 ${secIdx} 재설계 인정 — 변한 성분: ${changed.join(", ")}`);
  }
} else {
  warnings.push("게이트 약함: 정적 저하 모드 — 시그니처 린트·밀도·텍스트 불변 게이트 생략됨");
}

// ---- 게이트 3: 텍스트·링크·이미지 불변 ----
if (!weakGate) {
  const hasCP2 = before.tells.some((t) => t.rule === "CP2");
  const bBlocks = (before.page.textBlocks ?? []).filter(Boolean);
  const aBlocks = (after.page.textBlocks ?? []).filter(Boolean);

  // 1) 정확 멀티셋 소거
  const aCount = new Map();
  for (const t of aBlocks) aCount.set(t, (aCount.get(t) ?? 0) + 1);
  const bLeft = [];
  for (const t of bBlocks) {
    if (aCount.get(t) > 0) aCount.set(t, aCount.get(t) - 1);
    else bLeft.push(t);
  }
  const aLeft = [];
  for (const [t, n] of aCount) for (let i = 0; i < n; i++) aLeft.push(t);

  // 2) 연접 커버 — 병합(before 여러 개 → after 하나)과 분할(그 역) 모두
  coverConcat(bLeft, aLeft); // aLeft의 블록이 bLeft 연접과 일치하면 양쪽 소거
  coverConcat(aLeft, bLeft); // 역방향(분할)

  // 3) 잔여 판정
  const deleted = [];
  for (const t of bLeft) {
    if (hasCP2 && isOrdinal(t)) deleted.push(t); // CP2 티의 서수 뱃지 — 삭제 허용, 보고 필수
    else failures.push(`[텍스트 소실] "${t.slice(0, 60)}"`);
  }
  for (const t of aLeft) failures.push(`[텍스트 추가] "${t.slice(0, 60)}" — 콘텐츠 불변 위반(내용 추가 금지)`);
  if (deleted.length) notes.push(`삭제 허용된 장식 텍스트 ${deleted.length}건: ${deleted.slice(0, 6).join(", ")} — 보고서에 기재할 것`);
  if (!bLeft.length && !aLeft.length && JSON.stringify(bBlocks) !== JSON.stringify(aBlocks))
    warnings.push("텍스트 순서 변경 감지 — 내용은 보존됨(병합/재배치). 보고서에 명시할 것");

  // 링크: (앵커텍스트|href) 멀티셋 — 삭제는 무조건 위반, 추가는 경고
  const linkKey = ([t, h]) => `${t}|${h}`;
  const aLinks = new Map();
  for (const l of after.page.links ?? []) aLinks.set(linkKey(l), (aLinks.get(linkKey(l)) ?? 0) + 1);
  for (const l of before.page.links ?? []) {
    const k = linkKey(l);
    if (aLinks.get(k) > 0) aLinks.set(k, aLinks.get(k) - 1);
    else failures.push(`[링크 소실] ${l[0]} → ${l[1]}`);
  }
  for (const [k, n] of aLinks) if (n > 0) warnings.push(`링크 추가됨: ${k}`);

  // 정보성 이미지: basename 멀티셋 (자산 이동은 허용, 삭제는 위반)
  const base = (u) => String(u).split("?")[0].split("/").pop();
  const aImgs = new Map();
  for (const s of after.page.imagesInformative ?? []) aImgs.set(base(s), (aImgs.get(base(s)) ?? 0) + 1);
  for (const s of before.page.imagesInformative ?? []) {
    const k = base(s);
    if (aImgs.get(k) > 0) aImgs.set(k, aImgs.get(k) - 1);
    else failures.push(`[정보성 이미지 소실] ${k}`);
  }
  const decoRemoved = (before.page.imagesDecorative ?? []).map(base).filter((k) => !(after.page.imagesDecorative ?? []).map(base).includes(k));
  if (decoRemoved.length) notes.push(`장식 이미지 제거 ${decoRemoved.length}건 — 제거 목록으로 보고할 것`);
}

// ---- 보고 ----
const report = {
  pass: failures.length === 0,
  weakGate,
  overhaul: !!args.overhaul,
  failures, warnings, notes,
  mapping,
  redsRemaining: activeTells(after).filter((t) => t.sev === "red").length,
  yellowsRemaining: activeTells(after).filter((t) => t.sev === "yellow").length,
  judgedAt: new Date().toISOString(),
};
await writeFile(args.out ?? join(args.after, "gate-report.json"), JSON.stringify(report, null, 2));

console.log(`게이트 ${report.pass ? "통과 ✓" : `실패 ✗ (${failures.length}건)`}${weakGate ? " [게이트 약함 — 정적 모드]" : ""}`);
for (const f of failures) console.log("  ✗ " + f);
for (const w of warnings) console.log("  ⚠ " + w);
for (const n of notes) console.log("  · " + n);
console.log(`  🔴 잔존 ${report.redsRemaining} · 🟡 잔존 ${report.yellowsRemaining}`);
exit(failures.length ? 1 : 0);

// after 블록 하나가 before 블록들의 연접(원문 순서 보존)과 일치하면 병합으로 인정하고 양쪽에서 소거.
// wide 배열에서 연속 항목들의 공백/무공백 연접이 narrow의 항목과 정확히 일치해야 한다 — 재작성은 못 뚫는다.
function coverConcat(wide, narrow) {
  for (let n = narrow.length - 1; n >= 0; n--) {
    const target = narrow[n];
    outer: for (let i = 0; i < wide.length; i++) {
      let joined = wide[i];
      const used = [i];
      for (let j = i + 1; j < wide.length && joined.length <= target.length; j++) {
        if (joined === target && used.length >= 2) break;
        joined = joined + " " + wide[j];
        used.push(j);
        if (joined === target || used.map((u) => wide[u]).join("") === target) {
          for (const u of used.reverse()) wide.splice(u, 1);
          narrow.splice(n, 1);
          break outer;
        }
      }
    }
  }
}

async function loadScan(dir) {
  try {
    return JSON.parse(await readFile(join(dir, "scan.json"), "utf8"));
  } catch (e) {
    console.error(`scan.json 로드 실패 (${dir}): ${e.message} — detect.mjs를 먼저 실행할 것`);
    return null;
  }
}

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    const v = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true;
    o[k] = v;
  }
  return o;
}
