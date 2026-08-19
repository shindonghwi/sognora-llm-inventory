/**
 * comp.mjs — 시안 우선(comp-first): 코드를 짜기 전에 **보고 만들 목표물**을 만든다
 *
 * usage:
 *   comp.mjs --contract _page/contract.json --route /app/settings/profile [--out _page/comps]
 *   comp.mjs --contract _page/contract.json --all            # comp 없는 페이지 전부
 *   comp.mjs --contract _page/contract.json --check          # 생성 없이 누락만 확인
 *
 * 왜 있나 — 사용자 지시: *"디자이너 서브에이전트를 두고 대화해서 페이지 프롬프트 시안을 뽑고,
 * codex `$imagen` 스킬로 먼저 실제 프리미엄 운영급 시안을 뽑은 뒤에 그걸 보고 작업하라."*
 * 확인해보니 **그렇게 되어 있지 않았다.** page-craft에는 imagen·시안·디자이너 언급이 0건이었고,
 * sg-landing-forge는 imagen을 **자산(아이콘·사진)** 용으로만 쓰며 디자이너 에이전트는
 * P7 **사후 채점**이다. 즉 "먼저 시안, 그다음 코드"라는 순서가 어디에도 없었다.
 *
 * 그 결과가 실측으로 나왔다 — 시각 목표물 없이 CSS부터 짜니 화면마다 제일 싼 것(문단)으로
 * 수렴했고, 앱 화면 8종이 서로 100% 같은 껍데기가 됐다(§1b).
 *
 * 무엇을 하나: 계약(§0e)의 페이지 정보 + 랜딩 토큰을 프롬프트로 컴파일해 `codex exec`에
 * 넘기고, **imagegen 스킬**로 시안 PNG를 받는다. 생성에 쓴 프롬프트 전문을 함께 남긴다
 * (다음 실행이 같은 기준으로 재생성할 수 있어야 한다 — 매번 프롬프트를 새로 지으면
 * 기준이 흔들린다. forge panel-prompts와 같은 원칙).
 *
 * 도장의 범위: 이 계기는 **시안이 존재하는가**와 **무슨 프롬프트로 만들었는가**만 관할한다.
 * "시안이 좋은가"·"구현이 시안과 같은가"는 판정하지 않는다 — 전자는 사람, 후자는
 * 사람 대조 + 기존 기계 게이트(conform 팔레트·PROSE-ONLY 밀도·계약 must/mustNot)의 몫이다.
 * 관측 불가 영역에 도장을 찍지 않는다.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { argv, exit } from "node:process";
import { loadContract } from "./contract.mjs";

const args = parseArgs(argv.slice(2));
if (!args.contract) {
  console.error("usage: comp.mjs --contract <계약파일> (--route <경로> | --all | --check) [--out _page/comps] [--tokens <tokens.json>]");
  exit(2);
}
let contract;
try { contract = await loadContract(String(args.contract)); }
catch (e) { console.error("🔴 " + e.message); exit(2); }

const outDir = String(args.out ?? "_page/comps");
const slug = (route) => (route === "/" ? "home" : route.replace(/^\//, "").replace(/[\/]/g, "-"));
const compPath = (route) => join(outDir, `${slug(route)}.png`);
const promptPath = (route) => join(outDir, `${slug(route)}.prompt.md`);
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

// ── --check: 시안이 없는 페이지를 센다(빌드 전 게이트) ────────────────────
const missing = [];
for (const p of contract.pages.filter((p) => !p.skip)) {
  if (!(await exists(compPath(p.route)))) missing.push(p);
}
if (args.check) {
  if (!missing.length) { console.log(`✅ 계약의 페이지 ${contract.pages.length}개 모두 시안 있음 — **시안이 좋은지는 판정하지 않는다**(사람 검수)`); exit(0); }
  console.error(
    `🔴 시안 없는 페이지 ${missing.length}개 — 코드를 짜기 전에 보고 만들 목표물이 있어야 한다(§1c):\n  - ` +
    missing.map((p) => `${p.route} → ${compPath(p.route)}`).join("\n  - ") +
    `\n\n생성: node comp.mjs --contract ${args.contract} --all`);
  exit(1);
}

const targets = args.all
  ? missing
  : contract.pages.filter((p) => p.route === args.route);
if (!targets.length) {
  console.error(args.all ? "생성할 것이 없다(전부 시안 있음)" : `계약에 "${args.route}" 페이지가 없다`);
  exit(args.all ? 0 : 2);
}

// ── 토큰 적재 — 시안이 자기 팔레트를 만들면 상속이 무너진다(§0-1) ────────
const tokensPath = args.tokens ? String(args.tokens) : contract.tokens;
let tokens = null;
if (tokensPath) {
  try { tokens = JSON.parse(await readFile(tokensPath, "utf8")); }
  catch { console.error(`⚠️  토큰 파일을 못 읽었다: ${tokensPath} — 팔레트 없이 생성하면 시안이 자기 색을 만든다. 계약의 tokens를 확인하라`); }
}

const TYPE_BRIEF = {
  landing: "설득하는 랜딩. 히어로는 결과를 판다",
  about: "회사를 소개하는 읽는 화면. 랜딩의 증거·CTA 밴드를 복제하지 마라",
  document: "정책·약관 문서. 시행일·문의처 + 목차 + 번호 붙은 절",
  catalog: "고르는 화면. 반복 항목 그리드 + 항목마다 진입 액션. 설득 섹션 금지",
  tool: "직접 써보는 화면. 입력 → 실행 → 결과가 한 화면에. 설득 금지",
  pricing: "비교 후 결제하는 화면. 열=플랜, 행=속성. 플랜마다 다른 항목을 나열하지 마라",
  form: "적는 화면. 라벨은 입력창 위, 필드 3~5개",
  dashboard: "보고 관리하는 화면. 반복 데이터 + 빈 상태(0건 문구 + 다음 행동)",
};

let failed = 0;
for (const p of targets) {
  const brief = buildPrompt(p, tokens, contract);
  await mkdir(outDir, { recursive: true });
  await writeFile(promptPath(p.route), brief);
  process.stderr.write(`\n▶ ${p.route} (${p.type.name}) — 시안 생성 중…\n`);
  const code = await runCodex(brief, resolve(dirname(compPath(p.route))), compPath(p.route));
  const made = await exists(compPath(p.route));
  if (code !== 0 || !made) { failed++; process.stderr.write(`🔴 ${p.route} 실패 (codex exit=${code}, 파일=${made})\n`); }
  else process.stderr.write(`✅ ${p.route} → ${compPath(p.route)}\n`);
}

console.log(
  `\n시안 ${targets.length - failed}/${targets.length}개 생성 → ${outDir}\n` +
  `> 이 계기는 **시안이 존재하는가**만 확인한다. 시안이 좋은지, 구현이 시안과 같은지는 판정하지 않는다 — 눈으로 보고 판단하라.\n`);
exit(failed ? 1 : 0);

// ── 프롬프트 컴파일 ──────────────────────────────────────────────────────
// 매 실행 프롬프트를 새로 지어내면 기준이 흔들린다(forge panel-prompts와 같은 원칙).
// 계약·토큰이라는 같은 입력에서 같은 브리프가 나오게 한다.
function buildPrompt(page, tk, ct) {
  const colors = tk?.colors?.base ?? [];
  const byRole = (r) => colors.filter((c) => c.role === r).map((c) => c.hex);
  const type = (tk?.type?.steps ?? []).map((s) => `${s.name} ${s.px?.["1440"] ?? "?"}`).join(" / ");
  const radius = (tk?.radius ?? []).join(" / ");
  return `\`imagegen\` 스킬을 사용해서 UI 시안 이미지를 1장 생성해라.

## 목표

**${page.route}** 화면의 시안. 유형은 **${page.type.name}** — ${TYPE_BRIEF[page.type.name] ?? "계약에 선언된 동사에 맞는 화면"}.
이 화면이 돕는 결정: **${page.decision}**
실제 운영 중인 프리미엄 SaaS 수준으로. 컨셉아트나 랜딩 페이지가 아니라 **일하는 화면**이다.

## 반드시 지킬 것 (실측 토큰 — 지어내지 마라)
${tk ? `
- 중립: ${byRole("neutral").join(", ") || "-"}
- 브랜드/액션: ${byRole("brand").join(", ") || "-"} — **강조는 여기서만. 다른 색조 추가 금지**
- 시맨틱: ${byRole("semantic").join(", ") || "-"}
- radius 사다리: ${radius || "-"} 만 사용
- 타입 스케일(1440): ${type || "-"}
` : `
- ⚠️ 토큰 파일이 없다. **색·치수를 지어내지 말고**, 무채색 뼈대로만 그린 뒤 사람이 토큰을 확정하게 하라.
`}
- 컨트롤 높이 40~48px, 뷰포트 1440×900
- **밀도는 유형이 정한다** — 랜딩 여백(96~120px)을 물려받지 마라. ${page.type.verb === "do" ? "일하는 화면은 16~32px 간격으로 조밀하게." : "읽는 화면이라도 문단만 늘어놓지 마라."}

## 이 화면에 반드시 있어야 하는 것 (계약 must)
${page.must.length ? page.must.map((m) => `- ${m.startsWith("css:") ? `\`${m.slice(4)}\` 에 해당하는 요소` : m}`).join("\n") : "- (계약에 선언된 것 없음 — 유형 필수 구조를 따르라)"}

## 금지
${page.mustNot.length ? page.mustNot.map((m) => `- ${m}`).join("\n") : "- (계약에 선언된 것 없음)"}
- 여백이 콘텐츠보다 큰 밴드 금지(박스 안쪽 잉크가 상하 공백보다 커야 한다)
- **글만 있는 화면 금지** — 제목+문단만 늘어놓지 말고 이 화면의 일(입력·항목·표·데이터)을 넣어라
- 이모지 아이콘, 보라 그라데이션, 컬러 글로우 섀도, 카드 안의 카드 금지
- 로렘입숨 금지 — 실제 한국어 문구를 넣어라
- 제품에 없는 기능을 지어내지 마라

## 산출
1. 생성한 이미지를 \`${compPath(page.route)}\` 로 복사해라(정확히 이 경로, 이 파일명).
2. 실제로 imagegen에 넘긴 프롬프트 전문을 \`${promptPath(page.route)}\` 끝에 \`## imagegen에 넘긴 프롬프트\` 섹션으로 덧붙여라.
`;
}

function runCodex(prompt, cwd, _out) {
  return new Promise((res) => {
    const ch = spawn("codex", ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "-"], {
      cwd: process.cwd(), env: process.env, stdio: ["pipe", "inherit", "inherit"],
    });
    ch.on("error", (e) => { console.error(`codex CLI를 실행하지 못했다: ${e.message}\ncodex가 설치돼 있어야 한다(Codex CLI 0.147+). Claude Code에서도 codex CLI를 호출한다.`); res(127); });
    ch.stdin.end(prompt);
    ch.on("close", (code) => res(code ?? 1));
  });
}
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
