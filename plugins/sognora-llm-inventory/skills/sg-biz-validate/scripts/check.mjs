#!/usr/bin/env node
/**
 * check.mjs — 사업성 검토 런의 자체검증. 인자 없이 cwd의 `.sognora/biz/` 가장 최근 run을 잰다.
 *
 * 왜 있나 — rules.md §자체검증 12항목이 전부 에이전트 체크박스였고, 그중 결정적으로 잴 수 있는 것(산출물 4종·원장 표·8축 열·손익분기 숫자·
 * 금칙어·출처 표시·경로)도 사람이 봐야 했다(2026-09-03 감사). 실전 사고 셋(유통 채널 열 소실·손익분기 생략·홈 디렉터리에 런 생성)은 전부 이 계기가 잡는다.
 * 인지도 2/5·불리한 근거 누락·MVP-틈 연결 같은 판단은 "에이전트 판정"으로 남긴다.
 *
 * usage: node check.mjs            (옵션 없음 — cwd/.sognora/biz/<가장 최근 YYYY-MM-DD-NNN>)
 * exit 0 = 🔴 0 · 1 = 🔴 있음 · 2 = run 없음
 */
import { readdir, readFile, access } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { argv, exit, cwd } from "node:process";

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const F = (id, severity, detail) => ({ id, severity, detail });

/** rules.md가 정한 산출물 4종(순서 고정) */
export const OUTPUTS = ["00_brief.md", "01_competitors.md", "02_verdict.md", "03_prd.md"];
/** rules.md §경쟁사 분석 8축 — 열 이름 그대로 고정 */
export const AXES = ["핵심 기능", "차별점", "가격", "타깃", "수익모델", "유통 채널", "규모 신호", "약점"];
/** rules.md §진입 판정 기준 "금지" — 흐린 표현 */
export const VAGUE = ["가능성은 있어 보", "가능성이 있어 보", "나쁘지 않아 보", "긍정적으로 검토", "충분히 고려", "추가 검토가 필요", "상황에 따라 다를", "판단이 어렵", "확실하지 않지만"];
/** 운영자 프로필 스키마(rules.md §운영자 프로필 표) */
export const PROFILE_FIELDS = ["형태", "보유 강점", "목표 수준", "병렬 한도", "접는 선", "작성일"];

const RUN_RE = /^\d{4}-\d{2}-\d{2}-\d{3}$/;

export async function latestRun(bizDir) {
  let ents = []; try { ents = await readdir(bizDir, { withFileTypes: true }); } catch { return null; }
  const runs = ents.filter((e) => e.isDirectory() && RUN_RE.test(e.name)).map((e) => e.name).sort();
  return runs.length ? join(bizDir, runs[runs.length - 1]) : null;
}

/** 마크다운 표 파싱 — 헤더 셀 배열과 본문 행 수 */
export function tables(md) {
  const out = []; const lines = md.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*\|/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const header = lines[i].split("|").slice(1, -1).map((s) => s.replace(/\*\*/g, "").trim());
      let rows = 0; for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) rows++;
      out.push({ header, rows, line: i + 1 });
    }
  }
  return out;
}

/** 순수: run 파일 맵 {name: text} + 경로 정보 → findings */
export function checkRun({ files, runPath, cwdPath, profile = null }) {
  const out = [];
  const names = Object.keys(files);
  /* ① 산출물 4종 + 비대상 */
  const missing = OUTPUTS.filter((n) => !names.includes(n));
  if (missing.length) out.push(F("output.missing", missing.includes("03_prd.md") && missing.length === 1 ? "🟡" : "🔴", `산출물 없음: ${missing.join(", ")}${missing.includes("03_prd.md") && missing.length === 1 ? " — 판정이 철회면 정상(02_verdict 확인)" : ""}`));
  const extra = names.filter((n) => !OUTPUTS.includes(n) && /\.md$/i.test(n));
  if (extra.length) out.push(F("output.out-of-scope", "🟡", `비대상 산출물 ${extra.length}: ${extra.join(", ")} — 이 스킬의 산출물은 4종(상세 설계·화면 명세는 비대상, description)`));
  /* ⑦ 경로 */
  const home = homedir();
  if (runPath && resolve(runPath).startsWith(resolve(home, ".sognora", "biz"))) out.push(F("run.location", "🔴", `run이 홈(~/.sognora/biz)에 생성됨 — run은 프로젝트 cwd의 .sognora/biz/ 아래여야 한다(프로필만 홈)`));
  else if (runPath && cwdPath && !resolve(runPath).startsWith(resolve(cwdPath, ".sognora", "biz"))) out.push(F("run.location", "🟡", `run 경로가 cwd/.sognora/biz 아래가 아니다: ${runPath}`));
  if (runPath && !RUN_RE.test(basename(runPath))) out.push(F("run.id", "🟡", `run_id 형식 아님(YYYY-MM-DD-NNN): ${basename(runPath)}`));
  /* ② 00_brief 인터뷰 원장 */
  const brief = files["00_brief.md"];
  if (brief !== undefined) {
    const ledger = tables(brief).find((t) => t.header.some((h) => /질문\s*ID/.test(h)) && t.header.some((h) => /물었/.test(h)) && t.header.some((h) => /쓰인 곳/.test(h)));
    if (!ledger) out.push(F("brief.no-ledger", "🔴", "00_brief에 인터뷰 원장 표(질문 ID | 물었나 | 답 요지 | 쓰인 곳) 없음 — 요구했지만 판정에 안 쓰인 질문이 드러나지 않는다"));
    else {
      const asked = (brief.match(/^\|\s*[A-E]\d\s*\|\s*✓/gm) || []).length;
      if (asked > 8) out.push(F("brief.too-many-questions", "🔴", `실제로 물은 질문 ${asked}개 > 최대 8(SKILL.md Phase 0)`));
      if (!/쓰인 곳 없음/.test(brief)) out.push(F("brief.unused-report", "🟡", `"쓰인 곳 없음" 보고 문장이 없다 — 다음 판에서 지울 질문을 명시해야 한다`));
    }
    if (/(?<![A-Za-z])B1(?![0-9A-Za-z])|월 예산|런웨이|버틸 수 있는 개월/.test(brief))   /* JS \b는 ASCII 단어 경계라 한글 앞에서 매치되지 않는다 */ out.push(F("brief.asked-cost", "🔴", "비용·예산·런웨이 질문 흔적 — 철칙 1 위반(조사로 알 수 있는 값)"));
    if (/superseded by/.test(brief) === false && /이전 런|재검토/.test(brief)) out.push(F("brief.superseded", "🟡", "이전 런을 언급하는데 `superseded by {run_id}` 표기가 없다(에이전트 판정: 같은 아이디어인지는 사람이 본다)"));
  }
  /* ③ 01_competitors 8축 + 최소 3곳 + 대체재 */
  const comp = files["01_competitors.md"];
  if (comp !== undefined) {
    const main = tables(comp).find((t) => AXES.filter((a) => t.header.some((h) => h.includes(a))).length >= 5) || tables(comp).sort((a, b) => b.header.length - a.header.length)[0];
    if (!main) out.push(F("competitors.no-table", "🔴", "01_competitors에 경쟁사 표가 없다"));
    else {
      const lost = AXES.filter((a) => !main.header.some((h) => h.includes(a)));
      if (lost.length) out.push(F("competitors.axis-missing", "🔴", `8축 열 소실: ${lost.join(", ")} (rules.md 열 이름 고정 — 유통 채널 소실 사고)`));
      if (!main.header.some((h) => /충족 기준/.test(h))) out.push(F("competitors.no-criteria-col", "🟡", `"충족 기준" 열이 없다 — 인지도 기준 어느 2개를 통과했는지 적는 열`));
      if (main.rows < 3) out.push(F("competitors.too-few", "🔴", `경쟁사 표 행 ${main.rows} < 3`));
    }
    if (!/대체재/.test(comp)) out.push(F("competitors.no-substitute", "🔴", "대체재(같은 문제를 다른 방식으로 푸는 것) 언급 없음 — 최소 1곳"));
    const weakness = (comp.match(/약점/g) || []).length; const urls = (comp.match(/https?:\/\//g) || []).length;
    if (weakness && urls === 0) out.push(F("competitors.weakness-no-source", "🟡", "약점 축에 URL 인용이 0건 — 근거 없는 약점은 '미확인(제품 분석 기반 추정)'으로 표기해야 한다"));
  }
  /* ④ 02_verdict 손익분기·판정 ⑤ 금칙어 ⑥ 출처 */
  const verdict = files["02_verdict.md"];
  if (verdict !== undefined) {
    if (!/손익분기[^\n]{0,80}\d/.test(verdict)) out.push(F("verdict.no-breakeven", "🔴", "손익분기 고객 수가 숫자로 없다 — 판정이 조건부·철회여도 필수(002 런 사고)"));
    const v = verdict.match(/판정[^\n]{0,20}?(\*\*)?\s*(진입|조건부 진입|조건부|철회)/);
    if (!v) out.push(F("verdict.no-decision", "🔴", "판정이 진입/조건부 진입/철회 중 하나로 명시되지 않았다"));
    if (!/고정비/.test(verdict) || !/변동비/.test(verdict)) out.push(F("verdict.no-cost-split", "🔴", "고정비/변동비 분류가 없다 — 섞으면 손익분기가 실제보다 좋게 나온다"));
    if (!/하향식|top-?down/i.test(verdict) || !/상향식|bottom-?up/i.test(verdict)) out.push(F("verdict.no-market-both", "🟡", "시장 규모 하향식·상향식 둘 다 시도했는지 확인 불가"));
  }
  for (const [name, text] of Object.entries(files)) {
    if (!/\.md$/i.test(name)) continue;
    const hits = VAGUE.filter((p) => text.includes(p));
    if (hits.length) out.push(F("copy.vague-verdict", "🔴", `${name}: 흐린 표현 ${hits.map((h) => `"${h}"`).join(", ")} — 셋 중 하나를 고르고 근거를 댄다`));
  }
  const numeric = [verdict, comp].filter((t) => t !== undefined).join("\n").split("\n").filter((l) => /\d{2,}/.test(l) && !/^\s*\|?\s*-+/.test(l));
  if (numeric.length) {
    const sourced = numeric.filter((l) => /출처|가정|https?:\/\/|\[.*\]\(|추정|실측|미확인/.test(l)).length;
    const ratio = sourced / numeric.length;
    if (ratio < 0.5) out.push(F("numbers.unsourced", "🟡", `숫자 줄 ${numeric.length}개 중 출처·가정 표시 ${sourced}개(${Math.round(ratio * 100)}%) — 모든 숫자에 출처 또는 "가정"`));
  }
  /* 프로필 스키마 */
  if (profile) {
    const t = tables(profile)[0];
    if (!t) out.push(F("profile.no-table", "🟡", "biz-profile.md에 항목 표가 없다"));
    else {
      const rows = profile.split("\n").filter((l) => /^\|/.test(l) && !/^\|[\s:|-]+\|$/.test(l)).slice(1).map((l) => l.split("|")[1]?.replace(/\*\*/g, "").trim()).filter(Boolean);
      const unknown = rows.filter((r) => !PROFILE_FIELDS.some((f) => r.includes(f)));
      if (unknown.length) out.push(F("profile.unknown-field", "🟡", `프로필에 규정 외 항목: ${unknown.join(", ")} — 스키마는 ${PROFILE_FIELDS.join("·")}(금액·기간 금지)`));
      const missingF = PROFILE_FIELDS.filter((f) => !rows.some((r) => r.includes(f)));
      if (missingF.length) out.push(F("profile.missing-field", "🟡", `프로필 항목 없음: ${missingF.join(", ")}`));
      if (/\d+\s*(만원|원|달러|\$|USD|개월|년)\b/.test(profile) && !/작성일/.test(profile)) out.push(F("profile.money-or-period", "🟡", "프로필에 금액·기간이 적혀 있다 — 시점마다 낡는다(rules.md)"));
      const dm = profile.match(/작성일[^\d]*(\d{4}-\d{2}-\d{2})/);
      if (dm) { const age = (Date.now() - new Date(dm[1]).getTime()) / 86400000; if (age > 183) out.push(F("profile.stale", "🟡", `프로필 작성일 ${dm[1]} — 6개월(관행) 초과. 런 시작 시 요약 확인 1회`)); }
    }
  }
  /* 에이전트 판정 항목 — 계기가 잴 수 없다 */
  out.push(F("agent.judgment", "미제공", "인지도 기준 2/5 통과 여부 · 불리한 근거 누락 · MVP 기능↔진입 틈 연결 · 프로필 소비 여부는 에이전트 판정(rules.md §자체검증 1g·2·5·6)"));
  const red = out.filter((f) => f.severity === "🔴").length, yellow = out.filter((f) => f.severity === "🟡").length;
  return { findings: out, summary: { red, yellow, verdict: red ? "🔴" : yellow ? "🟡" : "✅" } };
}

export async function check(root) {
  const bizDir = join(root, ".sognora", "biz");
  const run = await latestRun(bizDir);
  if (!run) return null;
  const files = {};
  for (const e of await readdir(run, { withFileTypes: true })) if (e.isFile() && /\.md$/i.test(e.name)) files[e.name] = await readFile(join(run, e.name), "utf8");
  const profPath = join(homedir(), ".sognora", "biz-profile.md");
  const profile = (await exists(profPath)) ? await readFile(profPath, "utf8") : null;
  const r = checkRun({ files, runPath: run, cwdPath: root, profile });
  return { run, ...r };
}

export function renderMd(r) {
  const L = [`# biz check — ${r.run}`, "", `판정 ${r.summary.verdict} · 🔴 ${r.summary.red} · 🟡 ${r.summary.yellow}`, "", "미제공은 통과가 아니다 — 그 항목은 에이전트가 보고서에서 답해야 한다.", ""];
  for (const f of r.findings) L.push(`- ${f.severity} \`${f.id}\` ${f.detail}`);
  return L.join("\n") + "\n";
}

const isMain = argv[1] && import.meta.url === new URL(`file://${argv[1]}`).href;
if (isMain) {
  const r = await check(cwd());
  if (!r) { console.error(".sognora/biz/<YYYY-MM-DD-NNN>/ 가 없다 — 런이 있는 프로젝트 루트에서 실행하라(홈 디렉터리 run은 위치 위반이다)"); exit(2); }
  console.log(renderMd(r));
  exit(r.summary.red ? 1 : 0);
}
