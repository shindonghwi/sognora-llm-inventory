#!/usr/bin/env node
/**
 * rule-index.mjs — 규칙 색인 생성기. scripts/rules/*.mjs(ALL_RULES)와 다른 계기가 내는 ID(conform·sameness·primitives·irdiff·behavior·copylint·history·foundation)를 한 표로 모아
 * wiki/evidence/rule-index.md를 다시 쓴다. 문서는 산출물이다 — 규칙을 고치면 이 스크립트를 다시 돌린다.
 *
 * usage: node rule-index.mjs [--out wiki/evidence/rule-index.md] [--check]     --check: 문서가 코드와 다르면 exit 1
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs, SKILL_ROOT } from "./_deps.mjs";
import { ALL_RULES, STANDALONE_RED, NON_EXEMPT } from "./rules/index.mjs";

/** 규칙 모듈 밖 계기가 내는 ID — 여기서 선언한다(코드의 finding id와 1:1). */
export const OTHER_RULES = [
  { id: "token.budget", axis: "token", severity: "🔴", title: "토큰 어휘 예산 초과(중립≤6·브랜드≤2·시맨틱≤2·duration≤2·easing≤1)", basis: "citation", evidence: "conform.mjs lintTokens — wiki/systems/color.md 어휘 예산(리드 실측: 팔레트 4~6색)", emitter: "conform.mjs" },
  { id: "token.hangul-family", axis: "token", severity: "🔴", title: "tokens.json 서체에 한글 대응 서체가 없다", basis: "definition", evidence: "conform.mjs lintTokens — wiki/systems/typography.md 한글 대응 폰트 필수", emitter: "conform.mjs" },
  { id: "token.heavy-weight", axis: "token", severity: "🟡", title: "타입 스케일 단계에 굵기 600 초과", basis: "corpus", evidence: "conform.mjs lintTokens — 리드 CSS 집계 700+ 0회(wiki/systems/typography.md)", emitter: "conform.mjs" },
  { id: "token.color-outside-set", axis: "token", severity: "🔴", title: "렌더 색이 토큰 집합 밖(alpha 변형 제외)", basis: "definition", evidence: "conform.mjs conformScan — alphaPolicy rgb-in-set-alpha-free", emitter: "conform.mjs" },
  { id: "token.size-outside-set", axis: "token", severity: "🔴", title: "렌더 font-size가 스케일 밖", basis: "definition", evidence: "conform.mjs conformScan", emitter: "conform.mjs" },
  { id: "token.radius-outside-set", axis: "token", severity: "🟡", title: "렌더 radius가 사다리 밖", basis: "definition", evidence: "conform.mjs conformScan", emitter: "conform.mjs" },
  { id: "token.duration-outside-set", axis: "token", severity: "🟡", title: "렌더 transition duration이 토큰 밖", basis: "definition", evidence: "conform.mjs conformScan", emitter: "conform.mjs" },
  { id: "token.source-literal", axis: "token", severity: "🔴", title: "토큰 파일 밖 소스에 raw 색·px font-size 리터럴", basis: "definition", evidence: "conform.mjs conformSrc — 실전 사고: 토큰 13개 선언한 런이 hex 32개를 썼다", emitter: "conform.mjs" },
  { id: "token.hash-mismatch", axis: "token", severity: "🔴", title: "tokens.json 해시가 승인본과 다르다(빌더의 사후 합법화)", basis: "definition", evidence: "conform.mjs --expect-hash", emitter: "conform.mjs" },
  { id: "token.shadcn-default", axis: "token", severity: "🔴", title: "소스 globals.css에 shadcn 기본 테마(중립 0 0% 팔레트·radius 8px·Inter 단독)가 그대로", basis: "definition", evidence: "conform.mjs shadcnDefault(소스 확정 🔴) · rules/color.mjs(렌더 추정은 🟡) — avoid-ai-design P0·sognora-front-* 3개 실측", emitter: "conform.mjs·rules/color.mjs" },
  { id: "sameness.cross-type-clone", axis: "sameness", severity: "🔴", title: "다른 유형 쌍의 골격 지문 일치도가 기준 이상", basis: "corpus", evidence: "sameness.mjs — 임계는 그 프로젝트의 같은 유형 쌍(최고치)로 자가 보정, 폴백 60%", emitter: "sameness.mjs" },
  { id: "sameness.same-opening", axis: "sameness", severity: "🔴", title: "하는 화면이 읽는 화면과 첫 3역할을 똑같이 연다", basis: "definition", evidence: "sameness.mjs — 실전 사고 SAME-OPENING 9건", emitter: "sameness.mjs" },
  { id: "sameness.flat-density", axis: "sameness", severity: "🟡", title: "유형 간 첫 화면 잉크율 차이가 유형 안 차이를 넘지 못한다", basis: "definition", evidence: "sameness.mjs", emitter: "sameness.mjs" },
  { id: "sameness.untyped-clone", axis: "sameness", severity: "🟡", title: "유형 미선언 쌍이 닮았다", basis: "definition", evidence: "sameness.mjs", emitter: "sameness.mjs" },
  { id: "work.low", axis: "structure", severity: "🟡", title: "하는 화면의 일이 첫 화면 하단 1/3에서 시작", basis: "definition", evidence: "rules/structure.mjs work.below-fold의 하위 판정", emitter: "rules/structure.mjs" },
  { id: "work.unmeasured", axis: "structure", severity: "🟡", title: "일 요소를 표준 마크업에서 찾지 못함(없다는 뜻이 아니다)", basis: "definition", evidence: "rules/structure.mjs·sameness.mjs — 실전 사고: 커스텀 드롭존을 0%로 단정", emitter: "rules/structure.mjs·sameness.mjs" },
  { id: "component.no-primitive-layer", axis: "component", severity: "🔴", title: "공유 컴포넌트 export 0 + 같은 프리미티브 중복 정의", basis: "definition", evidence: "primitives.mjs — 실전 사고: CSS 모듈 11개 중 카드 9·버튼 8 파일이 각자 정의", emitter: "primitives.mjs" },
  { id: "component.duplicated", axis: "component", severity: "🟡", title: "같은 프리미티브를 3개 이상 파일이 각자 정의", basis: "definition", evidence: "primitives.mjs DUP_MIN 3(관행 — 실측 사례 82%)", emitter: "primitives.mjs" },
  { id: "component.no-shared", axis: "component", severity: "🟡", title: "components/·ui/ 아래 export된 공유 컴포넌트가 없다", basis: "definition", evidence: "primitives.mjs", emitter: "primitives.mjs" },
  { id: "skeleton.vs-ir", axis: "skeleton", severity: "🟡", title: "골격(섹션 수·컨테이너 폭)이 리드 IR 오차 밴드 밖 / IR completeness 미달이면 미제공", basis: "citation", evidence: "irdiff.mjs BAND_PX 8(자기 diff 오차 밴드 — wiki/workflow/transcribe.md)", emitter: "irdiff.mjs" },
  { id: "depth.vs-lead", axis: "depth", severity: "🔴", title: "스크롤 깊이가 리드 대비 -40% 초과 축소인데 mapping.md에 삭제 사유가 없다", basis: "citation", evidence: "irdiff.mjs DEPTH_CUT 0.4(wiki/types/landing.md 깊이 하한)", emitter: "irdiff.mjs" },
  { id: "scene.repeat-run", axis: "scene", severity: "🔴", title: "같은 배경 연속 3섹션(장면 예산)", basis: "citation", evidence: "irdiff.mjs RUN 3(wiki/types/landing.md 장면 예산)", emitter: "irdiff.mjs" },
  { id: "lead.residue", axis: "lead", severity: "🔴", title: "리드 배경색이 결과에 잔존", basis: "definition", evidence: "irdiff.mjs — 덜 치환된 클론의 방어선", emitter: "irdiff.mjs" },
  { id: "lead.reuse", axis: "history", severity: "🔴", title: "동일 리드를 최근 3회 안에 재사용", basis: "citation", evidence: "history.mjs RECENT 3(wiki/workflow/lead.md 리드 회전) — history.json 없으면 미제공", emitter: "history.mjs" },
  { id: "palette.history-repeat", axis: "history", severity: "🔴", title: "베이스 팔레트 계열이 직전 실행과 같다", basis: "definition", evidence: "history.mjs paletteFamily(무채 3단·유채 hue 60° 버킷) — wiki/directions.md 유도 절차 0", emitter: "history.mjs" },
  { id: "direction.axes-repeat", axis: "history", severity: "🟡", title: "7축 중 직전 실행과 다른 축이 3 미만", basis: "citation", evidence: "history.mjs AXES_MIN_DIFF 3(wiki/directions.md)", emitter: "history.mjs" },
  { id: "history.unavailable", axis: "history", severity: "미제공", title: "history.json 없음(첫 실행) — 반복 축 판정되지 않음", basis: "definition", evidence: "history.mjs — 캐시 부재는 실패가 아니라 미제공", emitter: "history.mjs" },
  { id: "motion.engineered-floor", axis: "motion", severity: "🔴", title: "엔지니어드 모먼트 하한 3·역할 3종 미달, 선택자 없음, 트리거 후 변화 없음, 120ms 미만", basis: "definition", evidence: "behavior.mjs FLOOR 3(게이트가 소유 — 검증 대상이 임계를 정하면 {minCount:0}으로 통과하던 사고)", emitter: "behavior.mjs" },
  { id: "motion.nojs-visible", axis: "motion", severity: "🔴", title: "no-JS에서 첫 화면 텍스트 90% 미만 가시", basis: "definition", evidence: "behavior.mjs TEXT_VISIBLE_MIN 0.9 — 리빌의 opacity:0 잔류 사고", emitter: "behavior.mjs" },
  { id: "motion.reduced-safe", axis: "motion", severity: "🔴", title: "reduced-motion에서 첫 화면 텍스트 90% 미만 가시", basis: "definition", evidence: "behavior.mjs TEXT_VISIBLE_MIN 0.9", emitter: "behavior.mjs" },
  { id: "copy.length", axis: "copy", severity: "🟡", title: "문장 25단어·문단 5문장·제목 65자 초과", basis: "citation", evidence: "copylint.mjs — GOV.UK 콘텐츠 가이드·NN/G", emitter: "copylint.mjs" },
  { id: "copy.forbidden-words", axis: "copy", severity: "🟡", title: "GOV.UK 오류 문구 금칙어 · 한글 상투어(랜딩 2·UI 3 이상)", basis: "citation", evidence: "copylint.mjs — GOV.UK · sg-ko-humanize 상투어 요약", emitter: "copylint.mjs" },
  { id: "copy.bilingual-pattern", axis: "copy", severity: "🔴", title: "한·영 알려진 AI 문체 패턴(sg-en-humanize detect_bilingual.py) — 계기 없음·판정 안 함·실행 오류는 미제공", basis: "definition", evidence: "copylint.mjs runBilingual — exit 1만 🔴, exit 2/3은 미제공", emitter: "copylint.mjs" },
  { id: "foundation.<layer>", axis: "foundation", severity: "🔴", title: "기본 스택 층 부재(framework·typescript·tailwind·components·query·forms·motion·tokens) — 🟡는 점진 이행 권장, deferred는 🟡 보류", basis: "definition", evidence: "foundation.mjs — SKILL.md 기본 스택 절", emitter: "foundation.mjs" },
  { id: "comp.missing", axis: "comp", severity: "🔴", title: "계약 페이지에 시안 PNG가 없다 — codex CLI 부재로 못 만들었으면 미제공", basis: "definition", evidence: "comp.mjs --check · audit.mjs", emitter: "comp.mjs" },
];

export function buildRows() {
  const rows = ALL_RULES.map((r) => ({ id: r.id, axis: r.axis, severity: r.severity, title: r.title, basis: r.threshold?.basis || "-", corpus: r.corpus || "", evidence: r.evidence || "", emitter: "detect.mjs(rules/" + (r.axis || "?") + ".mjs)", standalone: STANDALONE_RED.has(r.id), nonExempt: NON_EXEMPT.has(r.id) }));
  for (const o of OTHER_RULES) { const dup = rows.find((r) => r.id === o.id); if (dup) { dup.emitter += " · " + o.emitter; dup.evidence += " ／ " + o.evidence; dup.severity = `${dup.severity}(렌더 추정)·${o.severity}(소스 확정)`; continue; } rows.push({ ...o, corpus: "", standalone: STANDALONE_RED.has(o.id), nonExempt: NON_EXEMPT.has(o.id) }); }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}

const esc = (s) => String(s ?? "").replace(/\|/g, "／").replace(/\r?\n/g, " ").trim();

export function render(rows) {
  const L = [
    "# 규칙 색인 — `scripts/rule-index.mjs`가 코드에서 생성한다 (수정은 코드에서, 이 문서는 산출물)",
    "",
    `> 판정자 열의 계기가 그 ID를 낸다. basis — corpus: \`references/corpus-baseline.json\` 실측 임계 · citation: 인용 수치 · definition: 무엇을 셀지 정하는 값. corpus 열 \`exempt\` = 살아있음·접근성 축이라 코퍼스 판정 제외. **단독 🔴** = 다른 패턴과 합산 없이 페이지를 🔴로 만드는 규칙(${[...STANDALONE_RED].length}종). **면제 불가** = exemptions.md로 "채택"할 수 없는 결함(${[...NON_EXEMPT].length}종).`,
    "",
    `규칙 ${rows.length}종(scan 규칙 ${ALL_RULES.length} + 다른 계기 ${OTHER_RULES.length}). 다시 생성: \`node scripts/rule-index.mjs\` · 정합 검사: \`--check\`.`,
    "",
    "| id | 심각도 | 단독 🔴 | 면제 불가 | 제목 | basis | corpus | 판정자 | 근거 |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) L.push(`| \`${r.id}\` | ${r.severity} | ${r.standalone ? "●" : ""} | ${r.nonExempt ? "●" : ""} | ${esc(r.title)} | ${r.basis} | ${r.corpus} | ${esc(r.emitter)} | ${esc(r.evidence)} |`);
  L.push("", "관련: [ai-slop](ai-slop.md) · [corpus](corpus.md) · [index](index.md)");
  return L.join("\n") + "\n";
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const out = args.out || join(SKILL_ROOT, "wiki", "evidence", "rule-index.md");
  const md = render(buildRows());
  if (args.check) { const cur = await readFile(out, "utf8").catch(() => ""); if (cur !== md) { console.error(`🔴 rule-index.md가 코드와 다르다 — node scripts/rule-index.mjs 로 다시 생성`); exit(1); } console.log("✅ rule-index.md 정합"); exit(0); }
  await writeFile(out, md); console.log(`rule-index → ${out} (${buildRows().length}종)`);
}
