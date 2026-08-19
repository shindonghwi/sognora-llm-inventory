/**
 * sameness.mjs — "이 페이지들이 서로 같은 화면인가" 검사 (교차 페이지)
 *
 * usage: sameness.mjs --pages <url1,url2,...> [--types <t1,t2,...>]
 *                     [--out <dir>] [--viewport 1440x900] [--threshold 0.6]
 *
 * 왜 있나 — 실전 사고: 소개·문의·개인정보·약관·이용정책·환불 **6종을 한 번에 만들었더니
 * 전부 같은 화면으로 나왔다.** 그런데 기존 계기는 전부 통과했다. `alive.mjs`는 URL을
 * **하나씩만** 보고, `conform.mjs`는 토큰이 같은지를 보고(같은 게 의무다), `detect.mjs`는
 * 한 페이지 안의 AI 티를 본다. **"페이지들끼리 서로 같다"를 보는 눈이 하나도 없었다.**
 * 여섯 개가 완전히 똑같아도 여섯 개의 ✅가 찍힌다 — 검사 부재보다 나쁜 초록 도장이다.
 *
 * 판정 원칙 — **같음이 곧 결함은 아니다.**
 *   같은 유형끼리 같은 골격 = **정상**이다. 개인정보·약관·이용정책·환불은 같은 장르의
 *   법무 문서고, 한 틀을 쓰는 것이 옳다. 유형마다 화면을 새로 발명하면 그게 표류다.
 *   결함은 **다른 유형인데 같은 골격**일 때다 — 고르는 화면과 읽는 화면과 적는 화면이
 *   한 틀에서 나왔다는 뜻이고, 그때 페이지는 자기 목적을 잃는다(page-rules §0b·§0d).
 *   그래서 이 계기는 유형 선언 없이는 🔴을 찍지 않는다(🟡까지만).
 *
 * 재는 것:
 *   1) 골격 지문 — main 아래 블록의 (태그 + 헤딩 버킷 + 반복 버킷 + 입력/액션 버킷).
 *      개수는 **버킷**으로 뭉갠다(h2 8개 vs 9개는 같은 모양이다). 쌍마다 자카드.
 *   2) 도입부 지문 — 첫 화면에 나오는 역할 시퀀스(eyebrow>h1>lead>cta 같은).
 *      다른 유형 3개+가 같은 도입부로 시작하면 모든 페이지가 소개문으로 시작한다는 뜻.
 *   3) 첫 화면 잉크율 — 밀도가 유형을 말하는가(§0c). 다른 유형인데 전부 같은 밀도면
 *      밀도 토큰을 유형이 정한 게 아니라 한 값을 물려받은 것이다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";

// 유형 → 동사 부류. **이 표는 취향이 아니라 page-rules §0b의 전사**다.
// 사람이 P0에서 선언한 동사가 부류를 정한다: 읽는다(read)만 소개문으로 열 수 있다.
const KNOWN = {
  landing: "read", about: "read", document: "read",
  catalog: "do", tool: "do", pricing: "do", form: "do", dashboard: "do",
};
// 서비스마다 화면 종류는 다르다. §0b에 없는 페이지는 **동사를 직접 선언**해서 넣는다:
//   read:<라벨>  — 읽는 화면(소개문으로 여는 것이 옳다)
//   do:<라벨>    — 하는 화면(그 페이지의 일이 첫 화면에 와야 한다)
// 맨 유형명은 여전히 화이트리스트로 막는다 — 오타가 "✅ 통과"를 찍는 것이 최악이기 때문이다(v1.6.3).
const parseType = (raw) => {
  const m = /^(read|do):(.+)$/.exec(raw);
  if (m) return { name: m[2], verb: m[1], declared: true };
  if (KNOWN[raw]) return { name: raw, verb: KNOWN[raw], declared: false };
  return null;
};

const args = parseArgs(argv.slice(2));
const usage = `usage: sameness.mjs --pages <url1,url2,...> [--types <${Object.keys(KNOWN).join("|")}|read:<라벨>|do:<라벨>>,...] [--out <dir>] [--viewport 1440x900] [--threshold <0~1>]`;

const pages = String(args.pages ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (pages.length < 2) { console.error("최소 2개 URL이 필요하다 — 교차 검사다.\n" + usage); exit(2); }

const rawTypes = args.types ? String(args.types).split(",").map((s) => s.trim()) : [];
if (rawTypes.length && rawTypes.length !== pages.length) {
  console.error(`--types 개수(${rawTypes.length})가 --pages 개수(${pages.length})와 다르다 — 순서대로 1:1 대응이다.\n` + usage);
  exit(2);
}
const types = [];
for (const raw of rawTypes) {
  const t = parseType(raw);
  if (!t) {
    console.error(
      `알 수 없는 유형 "${raw}" — 등재된 유형: ${Object.keys(KNOWN).join("|")}.\n` +
      `오타면 고치고, 이 서비스에만 있는 화면이면 동사를 선언하라: read:${raw}(읽는 화면) 또는 do:${raw}(하는 화면).\n` +
      `여러 프로젝트에서 반복되는 화면이면 page-rules §0b에 등재하라.`);
    exit(2);
  }
  types.push(t);
}

// 임계는 **그 서비스 자신의 기준선**으로 자가 보정한다(아래 baseline 계산).
// 여기 값은 같은 유형 쌍이 하나도 없을 때만 쓰는 폴백이고, 실측 사다리에 근거한다:
// 같은 렌더러에서 나온 문서 4종 = 100% / 진짜 다른 유형 = 0~25%. 그 사이가 비어 있다.
const FALLBACK = args.threshold ? Number(args.threshold) : 0.6;
if (!(FALLBACK > 0 && FALLBACK <= 1)) { console.error("--threshold는 0<t<=1"); exit(2); }
const [vw, vh] = String(args.viewport ?? "1440x900").split("x").map(Number);
if (!vw || !vh) { console.error("--viewport 형식 오류 (예: 1440x900)"); exit(2); }

const findings = [];
const add = (sev, rule, detail) => findings.push({ sev, rule, detail });

const pw = await load("playwright");
if (!pw) { missing(["playwright"]); exit(2); }
const browser = await pw.chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
const page = await ctx.newPage();

const measured = [];
for (let i = 0; i < pages.length; i++) {
  const url = pages[i];
  let res = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }).catch(() => null);
  if (!res) res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(1200);
  const status = res?.status?.() ?? -1;
  const probe = await page.evaluate(probeFn, { fold: vh });
  measured.push({ url, type: types[i] ?? null, status, ...probe });
  if (status >= 400 || status < 0)
    add("yellow", "HTTP", `${short(url)} — HTTP ${status}. 측정값이 이 페이지에서는 의미 없다`);
  if (probe.blocks.length === 0)
    add("yellow", "NO-BLOCKS", `${short(url)} — main에서 블록을 하나도 못 찾았다(빈 화면·렌더 실패 의심). alive.mjs로 먼저 확인하라`);
}
await browser.close();

// ── 쌍별 골격 자카드 ─────────────────────────────────────────────────────
const pairs = [];
for (let i = 0; i < measured.length; i++) {
  for (let j = i + 1; j < measured.length; j++) {
    const A = new Set(measured[i].blocks), B = new Set(measured[j].blocks);
    if (!A.size && !B.size) continue;
    const inter = [...A].filter((x) => B.has(x)).length;
    const uni = new Set([...A, ...B]).size;
    pairs.push({ a: measured[i], b: measured[j], jac: uni ? inter / uni : 0 });
  }
}

const typed = (p) => p.a.type && p.b.type;
const crossType = pairs.filter((p) => typed(p) && p.a.type.name !== p.b.type.name);
const sameType = pairs.filter((p) => typed(p) && p.a.type.name === p.b.type.name);
const untyped = pairs.filter((p) => !typed(p));

// ── 임계 자가 보정 ───────────────────────────────────────────────────────
// 절대값을 박으면 서비스마다 틀린다. 골격 지문의 절대 수준은 그 사이트의 마크업 관습
// (래퍼 깊이·시맨틱 태그 사용량)에 좌우되기 때문이다.
// 그래서 **그 서비스 자신의 "같아도 되는 쌍"을 자로 쓴다**: 같은 유형끼리의 일치도가
// 이 프로젝트에서 "한 틀에서 나왔다"가 실제로 몇 %로 찍히는지를 말해준다.
// 다른 유형 쌍이 그 자를 넘으면, 같아도 되는 쌍만큼 닮았다는 뜻이다.
// 같은 유형 쌍이 하나도 없을 때만 폴백 상수를 쓰고, 보고서에 그렇게 썼다고 밝힌다.
// 기준선은 **"이 프로젝트에서 한 틀을 공유하면 몇 %로 찍히는가"**다.
//
// 실측 사고: 처음엔 같은 유형 쌍의 **최저치**를 썼다가 계기가 터졌다 — 같은 유형이라고
// 반드시 한 틀인 건 아니다(공개 카탈로그와 앱 안 카탈로그는 남남이다). 그 한 쌍이 0%를
// 찍는 순간 바가 0%로 무너져, **0% 일치 쌍까지 "복제"로 신고**했다(실사이트 95건).
// 같은 유형 분포는 쌍봉이라 최저치는 아무것도 뜻하지 않는다 — **한 틀을 공유할 때의
// 점수는 분포의 위쪽**에 있다. 그래서 최고치를 "템플릿 점수"로 읽는다.
//
// 그리고 **보정은 엄격해지는 방향으로만 작동한다.** 템플릿 점수가 100%인 프로젝트에서
// 그대로 쓰면 바가 100%로 올라가 95%짜리 복제본이 통과하므로, 실측 사다리의 폴백을 상한으로 둔다.
const baseline = (() => {
  if (!sameType.length) return { value: FALLBACK, from: "같은 유형 쌍이 없어 폴백 기준 사용 — --threshold로 조정" };
  const templateScore = Math.max(...sameType.map((p) => p.jac));
  return templateScore < FALLBACK
    ? { value: templateScore, from: `이 프로젝트가 한 틀을 공유할 때의 점수 ${pct(templateScore)}(같은 유형 쌍 ${sameType.length}개 중 최고치) — 폴백(${pct(FALLBACK)})보다 엄격해 이쪽을 쓴다` }
    : { value: FALLBACK, from: `한 틀 공유 점수는 ${pct(templateScore)}지만, 보정은 엄격해지는 방향으로만 쓴다(폴백 ${pct(FALLBACK)} 상한)` };
})();

// 공유 블록이 하나도 없으면 복제가 아니다 — 기준선이 아무리 낮아도 0% 쌍은 신고하지 않는다.
const clonish = (p) => p.jac > 0 && p.jac >= baseline.value;
// 지문이 얇으면(블록 1개) 100%가 쉽게 나온다. 숨기지는 않되 문구에 밝힌다.
const thinNote = (p) => (Math.min(p.a.blocks.length, p.b.blocks.length) < 2
  ? " ※ 두 페이지 다 골격이 얇다(블록 1개) — 화면이 비어 있어 쉽게 100%가 됐을 수 있다. 내용을 채운 뒤 다시 재라" : "");

// 1) 다른 유형인데 같은 골격 — 이 계기의 존재 이유.
// 쌍마다 한 건씩 내면 15페이지에서 100건이 넘어 읽을 수 없다 — 한 건으로 묶는다.
{
  const hits = crossType.filter(clonish).sort((x, y) => y.jac - x.jac);
  if (hits.length) {
    const lines = hits.slice(0, 8).map((p) =>
      `${short(p.a.url)}(${p.a.type.name}) ↔ ${short(p.b.url)}(${p.b.type.name}) ${pct(p.jac)}${thinNote(p)}`);
    add("red", "CROSS-TYPE-CLONE",
      `유형이 다른데 같은 틀에서 나온 쌍 ${hits.length}건 (기준 ${pct(baseline.value)} 이상)\n` +
      lines.map((l) => `    · ${l}`).join("\n") +
      (hits.length > 8 ? `\n    · … 외 ${hits.length - 8}건` : "") +
      `\n    공유 블록: ${sharedOf(hits[0]).slice(0, 4).join(" / ") || "-"} — 유형별 필수 구조(page-rules §0b)를 각자 갖추게 하라`);
  }
}

// 2) 유형 미선언 쌍 — 🔴을 찍을 근거가 없다. 유형을 선언하면 판정이 올라간다
{
  const hits = untyped.filter(clonish).sort((x, y) => y.jac - x.jac);
  if (hits.length)
    add("yellow", "UNTYPED-CLONE",
      `유형 미선언 쌍 ${hits.length}건이 닮았다 — 정상인지 판정할 수 없다. --types로 각 페이지의 동사(§0b)를 선언하라\n` +
      hits.slice(0, 5).map((p) => `    · ${short(p.a.url)} ↔ ${short(p.b.url)} ${pct(p.jac)}`).join("\n"));
}

// 3) 도입부 — **읽는 화면과 하는 화면이 똑같이 여는가**
//
// 도입부는 시퀀스 전체가 아니라 **앞 3역할**이다. 전체를 비교하면 뒤쪽 한 칸 차이로
// 갈라져서, "셋 다 eyebrow>h1>lead로 시작한다"는 육안으로 명백한 증상을 놓친다(실측 사고).
//
// 그리고 **같은 도입부가 곧 결함은 아니다.** 소개·정책·랜딩은 읽는 화면이라 소개문으로 여는 게
// 옳다. 결함은 **하는 화면(고른다·쓴다·정한다·적는다·본다)이 읽는 화면과 똑같이 열 때**다 —
// 그 페이지의 일이 소개문 뒤로 밀렸다는 뜻이다(§0c). y좌표로 재는 alive.mjs의
// `PURPOSE-BELOW-FOLD`와 같은 병을 다른 축(페이지 간 비교)에서 잡는다.
{
  const WORK_ROLES = new Set(["input", "grid", "table"]);
  const open3 = (m) => (m.preamble ? m.preamble.split(">").slice(0, 3).join(">") : null);

  const byOpen = new Map();
  for (const m of measured) {
    const k = open3(m);
    if (!k) continue;
    if (!byOpen.has(k)) byOpen.set(k, []);
    byOpen.get(k).push(m);
  }
  for (const [open, group] of byOpen) {
    const hasWork = open.split(">").some((r) => WORK_ROLES.has(r));
    const doing = group.filter((m) => m.type?.verb === "do");
    const reading = group.filter((m) => m.type?.verb === "read");
    if (doing.length && reading.length && !hasWork) {
      add("red", "SAME-OPENING",
        `${doing.map((m) => `${short(m.url)}(${m.type.name})`).join(", ")} 이(가) ` +
        `읽는 화면 ${reading.map((m) => `${short(m.url)}(${m.type.name})`).join(", ")} 와(과) 첫 화면을 똑같이 "${open}"로 연다 — ` +
        `하는 화면인데 소개문으로 시작한다. 그 페이지의 일(입력·고를 항목·비교표)을 첫 화면으로 올려라(§0c)`);
    } else if (group.length >= 3 && new Set(group.map((m) => m.type?.name)).size >= 2) {
      add("yellow", "SAME-OPENING",
        `유형이 다른 ${group.length}개 페이지가 첫 화면을 똑같이 "${open}"로 연다 — 도입부가 유형과 무관하게 한 틀이다` +
        (hasWork ? " (일이 첫 화면에 있어 🔴은 아니다)" : ""));
    }
  }
}

// 4) 밀도가 유형을 말하는가(§0c) — 여기도 절대 기준을 안 쓴다.
// "몇 %가 적정 밀도"는 서비스마다 다르다. 대신 **정보량으로 판정**한다:
// 유형이 다른 페이지들 사이의 밀도 차이가, 같은 유형 안에서의 차이보다 크지 않다면
// 밀도는 유형을 구별하는 정보를 담고 있지 않다 — 한 값을 물려받았다는 뜻이다.
{
  const withType = measured.filter((m) => m.type && m.blocks.length);
  const byType = new Map();
  for (const m of withType) {
    if (!byType.has(m.type.name)) byType.set(m.type.name, []);
    byType.get(m.type.name).push(m.foldInk);
  }
  if (byType.size >= 2 && withType.length >= 3) {
    const spread = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
    const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const within = Math.max(...[...byType.values()].map(spread));
    const across = spread([...byType.values()].map(med));
    const groupsWithPeers = [...byType.values()].filter((v) => v.length >= 2).length;
    const flat = groupsWithPeers ? across <= within : across < 0.05;
    if (flat)
      add("yellow", "FLAT-DENSITY",
        `유형 ${byType.size}종의 첫 화면 잉크율 차이(${(across * 100).toFixed(1)}%p)가 ` +
        (groupsWithPeers
          ? `같은 유형 안에서의 차이(${(within * 100).toFixed(1)}%p)를 넘지 못한다`
          : `${(across * 100).toFixed(1)}%p뿐이다(같은 유형 짝이 없어 폴백 기준 5%p 사용)`) +
        ` — 밀도가 유형을 구별하지 못한다. 한 값을 물려받았는지 확인하라(§0c): 랜딩은 넓게, 도구·폼·대시보드는 조밀하게`);
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────
const red = findings.filter((f) => f.sev === "red");
const table = [
  "| 페이지 | 유형(동사) | 블록 | 도입부 | 첫 화면 잉크율 | 스크롤 |",
  "|---|---|---|---|---|---|",
  ...measured.map((m) => `| ${short(m.url)} | ${m.type ? `${m.type.name}(${m.type.verb === "read" ? "읽는다" : "한다"})` : "—"} | ${m.blocks.length} | ${m.preamble ?? "—"} | ${(m.foldInk * 100).toFixed(0)}% | ${m.scrollH}px |`),
].join("\n");
// 쌍은 N(N-1)/2로 불어난다(15페이지 = 105쌍). 닮은 쪽부터 보여주고, 자른 것은 밝힌다.
const MATRIX_MAX = 20;
const ranked = pairs.slice().sort((a, b) => b.jac - a.jac);
const shown = ranked.filter((p) => p.jac > 0).slice(0, MATRIX_MAX);
const matrix = pairs.length
  ? ["", "**쌍별 골격 일치** (겹치는 쌍만, 닮은 순)", "", ...shown.map((p) => {
      const kind = !typed(p) ? "유형 미선언" : p.a.type.name === p.b.type.name ? "같은 유형 — 정상" : "다른 유형";
      return `- ${short(p.a.url)} ↔ ${short(p.b.url)} — **${pct(p.jac)}** (${kind})`;
    }), `- (전체 ${pairs.length}쌍 중 겹치는 ${ranked.filter((p) => p.jac > 0).length}쌍, 상위 ${shown.length}쌍 표시 · 나머지는 0%)`].join("\n")
  : "";
const note = sameType.filter((p) => p.jac >= baseline.value).length
  ? `\n> 같은 유형끼리의 높은 일치 ${sameType.filter((p) => p.jac >= baseline.value).length}쌍은 **정상**이다 — 같은 장르는 한 틀을 쓰는 것이 옳다. 이 계기는 그것을 벌하지 않는다.\n`
  : "";

const md = `# 서로 같은 화면인가 — ${measured.length}개 페이지 (${vw}x${vh})\n\n> 기준 ${pct(baseline.value)} — ${baseline.from}\n\n${table}\n${matrix}\n${note}\n${
  findings.length ? findings.map((f) => `- ${f.sev === "red" ? "🔴" : "🟡"} **${f.rule}** — ${f.detail}`).join("\n") : "- ✅ 유형이 다른 페이지끼리 골격이 갈렸다"
}\n\n**${red.length ? `실패 ${red.length}건` : "통과"}** · 경고 ${findings.length - red.length}건\n`;

if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "sameness.md"), md); }
console.log(md);
exit(red.length ? 1 : 0);

// ── 헬퍼 ────────────────────────────────────────────────────────────────
function sharedOf(p) {
  const B = new Set(p.b.blocks);
  return p.a.blocks.filter((x) => B.has(x));
}
function short(u) { try { return new URL(u).pathname || "/"; } catch { return u; } }
function pct(x) { return (x * 100).toFixed(0) + "%"; }
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}

// ── 페이지 안에서 도는 프로브 ────────────────────────────────────────────
function probeFn({ fold }) {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width >= 2 && r.height >= 2; };
  const root = document.querySelector("main, [role=main]") || document.body;
  // main이 있으면 그 안쪽은 **전부 본문**이다. 실측 사고: `header, nav`를 무조건 걷어냈더니
  // main 안의 페이지 히어로(<header>)와 문서 목차(<nav>)까지 사라져,
  // 어느 문서 페이지를 재도 도입부가 "head>lead"로 나오고 eyebrow·h1이 실종됐다.
  // main이 없어 body로 떨어질 때만 사이트 크롬을 걷어낸다.
  const scoped = root !== document.body;
  const chromeless = (el) => scoped || !el.closest("header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]");

  // 개수를 버킷으로 뭉갠다 — h2 8개와 9개는 "같은 모양"이다.
  // 이 뭉개기가 없으면 같은 템플릿에서 나온 두 문서가 항목 수 차이만으로 "다르다"고 나온다.
  // 실측 사고: 처음엔 상한 버킷을 4-8/9+로 갈랐더니 약관(h2 9개)과 개인정보(8개)가
  // **같은 렌더러에서 나왔는데도** 33%로 떨어졌다. 경계가 내용량을 모양으로 오해한 것이다.
  const bucket = (n) => (n === 0 ? "0" : n === 1 ? "1" : n <= 3 ? "2-3" : "4+");

  const blocks = [];
  const walk = (node, depth) => {
    for (const c of node.children) {
      if (!vis(c)) continue;
      const tag = c.tagName.toLowerCase();
      const r = c.getBoundingClientRect();
      // 폭 하한은 120 — 200으로 두면 목차 사이드바(180px)가 통째로 사라져
      // "헤더 + 본문" 2블록짜리 납작한 지문만 남는다(실측 사고).
      if (r.height < 40 || r.width < 120) continue;
      // 순수 래퍼(직접 텍스트 없고 자식 3개 이하)는 층이 아니다 — 한 겹씩 뚫는다
      const ownText = [...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const kids = [...c.children].filter(vis);
      if (!ownText && kids.length <= 3 && depth < 3 && ["div", "section", "span"].includes(tag) && kids.length) {
        walk(c, depth + 1);
        continue;
      }
      const heads = bucket(c.querySelectorAll("h2,h3").length);
      let reps = 0;
      for (const p of [c, ...c.querySelectorAll("*")]) {
        const k = [...p.children].filter(vis).length;
        if (k >= 3) reps = Math.max(reps, k);
      }
      const inputs = bucket([...c.querySelectorAll("input,textarea,select")].filter((el) => (el.getAttribute("type") || "text").toLowerCase() !== "hidden").length);
      const acts = bucket(c.querySelectorAll("a,button,[role=button]").length);
      blocks.push(`${tag}:h${heads}:r${bucket(reps)}:i${inputs}:a${acts}`);
    }
  };
  walk(root, 0);

  // ── 도입부 역할 시퀀스 ────────────────────────────────────────────────
  const roleOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (tag === "h1") return "h1";
    if (["input", "textarea", "select", "canvas"].includes(tag)) return "input";
    if (tag === "table") return "table";
    if (["img", "svg", "video", "picture"].includes(tag) && r.width >= 200 && r.height >= 150) return "media";
    if (["a", "button"].includes(tag)) {
      const solid = cs.backgroundColor && !/rgba?\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
      return solid && r.height >= 36 ? "cta" : null; // 본문 링크는 역할이 아니다
    }
    // 텍스트 역할은 **자기 텍스트 노드를 직접 가진 요소**에만 준다.
    // 실측 사고: innerText로 재면 헤더를 감싼 <div>가 통째로 "lead"가 되고,
    // 자식(eyebrow·h1·본문)은 부모가 이미 역할을 받아 전부 건너뛰어진다 —
    // 그래서 어느 페이지를 재도 도입부가 "lead" 하나로만 나왔다.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
    if (!own) return null;
    if (["h2", "h3", "h4"].includes(tag)) return "head";
    if (["p", "span", "div", "strong", "em", "small", "label", "li", "dt", "dd"].includes(tag)) {
      const size = parseFloat(cs.fontSize) || 16;
      const upper = cs.textTransform === "uppercase" || parseFloat(cs.letterSpacing) > 0.5;
      if (own.length <= 30 && (size < 15 || upper)) return "eyebrow";
      if (own.length > 40) return "lead";
    }
    return null;
  };
  const seq = [];
  const seen = new Set();
  for (const el of root.querySelectorAll("*")) {
    if (!chromeless(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top >= fold || r.height < 8) continue;
    // 부모가 이미 역할을 받았으면 자식은 세지 않는다
    let skip = false;
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (seen.has(p)) { skip = true; break; }
    if (skip) continue;
    const role = roleOf(el);
    if (!role) continue;
    seen.add(el);
    if (seq[seq.length - 1] !== role) seq.push(role); // 연속 중복은 접는다
    if (seq.length >= 5) break;
  }
  // 반복 항목 그리드가 첫 화면에 있으면 그것도 역할이다(카탈로그·대시보드의 "일")
  {
    let gridTop = null;
    for (const p of root.querySelectorAll("*")) {
      if (!chromeless(p)) continue;
      const kids = [...p.children].filter(vis);
      if (kids.length < 3) continue;
      const rs = kids.map((k) => k.getBoundingClientRect());
      if (!rs.every((r) => r.height >= 40 && r.width >= 120)) continue;
      // 고를 항목은 서로 크기가 비슷하다. 높이가 제각각인 것은 문서의 절(節)이지 그리드가 아니다
      // — 이 조건이 없으면 약관 본문이 "grid"로 잡혀 도입부 지문이 오염된다(실측 사고).
      const hs = rs.map((r) => r.height);
      if (Math.max(...hs) > Math.min(...hs) * 2 || Math.max(...hs) > fold * 0.6) continue;
      const top = Math.min(...rs.map((r) => r.top));
      if (top < fold && (gridTop === null || top < gridTop)) gridTop = top;
    }
    if (gridTop !== null && !seq.includes("grid")) seq.push("grid");
  }

  // ── 첫 화면 잉크율 — 화면 높이 중 실제 글자·이미지가 덮은 비율 ─────────
  const runs = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = 0;
  while (w.nextNode() && ++n < 2000) {
    const nd = w.currentNode;
    if (!nd.textContent.trim()) continue;
    if (nd.parentElement && !chromeless(nd.parentElement)) continue;
    const rg = document.createRange();
    rg.selectNodeContents(nd);
    const rr = rg.getBoundingClientRect();
    if (rr.height > 0 && rr.top < fold && rr.bottom > 0) runs.push([Math.max(0, rr.top), Math.min(fold, rr.bottom)]);
  }
  for (const el of root.querySelectorAll("img,svg,video,canvas,picture")) {
    if (!chromeless(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height >= 256 && r.top < fold && r.bottom > 0) runs.push([Math.max(0, r.top), Math.min(fold, r.bottom)]);
  }
  let inkH = 0;
  if (runs.length) {
    runs.sort((a, b) => a[0] - b[0]);
    let [s, e] = runs[0];
    for (let i = 1; i < runs.length; i++) {
      if (runs[i][0] <= e) e = Math.max(e, runs[i][1]);
      else { inkH += e - s; [s, e] = runs[i]; }
    }
    inkH += e - s;
  }

  return {
    blocks,
    preamble: seq.length ? seq.join(">") : null,
    foldInk: Math.min(1, inkH / fold),
    scrollH: document.documentElement.scrollHeight,
  };
}
