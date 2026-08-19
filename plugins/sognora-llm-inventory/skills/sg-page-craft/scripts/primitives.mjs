/**
 * primitives.mjs — "이 프로젝트에 컴포넌트 층이 있는가" (프로젝트 단위, 1회)
 *
 * usage: primitives.mjs --src <소스 디렉터리> [--pkg package.json] [--out <dir>]
 *
 * 왜 있나 — 사용자 지적: *"왜 라이브러리 같은 걸 안 쓰는 거지? 글만 있는 페이지는
 * 사실상 최악이긴 함. 컴포넌트도 없고."*
 *
 * 실측(실제 프로젝트): 의존성이 `next`·`react`·`react-dom` **3개뿐**이고 UI 라이브러리는
 * 0개, `components/ui/`는 **빈 디렉터리**였다. 그런데 CSS 모듈 11개 중 **9개가 버튼을
 * 각자 정의**하고, 9개가 카드를, 5개가 입력을 각자 정의했다. 컨트롤 높이(40/44/48px)를
 * 7개 파일에 직접 박아뒀다.
 *
 * **이것이 "글만 있는 페이지"의 기계적 원인이다.** 드롭인할 Button·Input·Table·EmptyState가
 * 없으면 화면마다 CSS를 처음부터 짜야 하고, 그러면 제일 싸게 쓸 수 있는 것 — 문단 — 으로
 * 수렴한다. 룰북은 §1에서 **치수(숫자)만** 관할했고 컴포넌트 층 자체에는 아무 의무가 없었다.
 *
 * 판정 원칙: **라이브러리를 쓰라고 강요하지 않는다.** 직접 만든 프리미티브 층도 층이다.
 * 이 계기가 보는 것은 "**같은 프리미티브를 여러 곳에서 처음부터 다시 그리고 있는가**"뿐이다.
 * 어떤 라이브러리를 쓸지는 이 스킬의 관할이 아니다.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, basename, relative } from "node:path";
import { argv, exit } from "node:process";

const args = parseArgs(argv.slice(2));
if (!args.src) { console.error("usage: primitives.mjs --src <소스 디렉터리> [--pkg package.json] [--out <dir>]"); exit(2); }
const SRC = String(args.src);

// 프리미티브 시그니처 — CSS 선언의 동시 출현으로 판정한다(클래스 이름에 기대지 않는다).
const SIGS = [
  { key: "버튼", re: /min-height:\s*(?:3[2-9]|4\d|5[0-6])px[\s\S]{0,400}?border-radius/ },
  { key: "입력", re: /(?:^|\})[^{]*\b(?:input|textarea|select)\b[^{]*\{[\s\S]{0,400}?border(?:-(?:width|color|style))?\s*:/m },
  { key: "카드", re: /border-radius:[^;]+;[\s\S]{0,300}?(?:background|box-shadow|border:)/ },
  { key: "배지", re: /border-radius:\s*(?:999|9999|100)px|border-radius:\s*50%/ },
];
// 공용 층으로 인정하는 컴포넌트 이름
const PRIMITIVE_NAMES = /\b(Button|IconButton|Input|TextField|Field|Textarea|Select|Checkbox|Radio|Switch|Card|Badge|Tag|Chip|Table|DataTable|Modal|Dialog|Tabs|Tooltip|EmptyState|Skeleton|Alert|Banner)\b/;

const cssFiles = [];
const compFiles = [];
await (async function walk(d) {
  let entries;
  try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!["node_modules", ".next", "dist", "build", ".git"].includes(e.name)) await walk(join(d, e.name)); continue; }
    const p = join(d, e.name);
    if (e.name.endsWith(".module.css") || extname(e.name) === ".css") cssFiles.push(p);
    else if ([".tsx", ".jsx"].includes(extname(e.name))) compFiles.push(p);
  }
})(SRC);

if (!cssFiles.length && !compFiles.length) { console.error(`${SRC}에서 소스를 찾지 못했다`); exit(2); }

// ── 1) 프리미티브가 몇 곳에서 각자 정의되는가 ────────────────────────────
const perSig = new Map(SIGS.map((s) => [s.key, []]));
for (const f of cssFiles) {
  let css = "";
  try { css = await readFile(f, "utf8"); } catch { continue; }
  for (const s of SIGS) if (s.re.test(css)) perSig.get(s.key).push(basename(f));
}

// ── 2) 공용 프리미티브 층이 실제로 존재하는가 ────────────────────────────
// 디렉터리 이름(ui/, primitives/)만 보면 **빈 디렉터리도 층으로 센다** — 실측에서
// `components/ui/`가 비어 있었다. 그래서 파일과 export 이름으로 판정한다.
const shared = [];
for (const f of compFiles) {
  if (!/(^|[\\/])(ui|primitives|common|design-system|ds)[\\/]/.test(f)) continue;
  let src = "";
  try { src = await readFile(f, "utf8"); } catch { continue; }
  const m = src.match(/export\s+(?:default\s+)?(?:function|const)\s+(\w+)/g) ?? [];
  const names = m.map((x) => x.split(/\s+/).pop()).filter((n) => PRIMITIVE_NAMES.test(n));
  if (names.length) shared.push(`${relative(SRC, f)} → ${names.join(", ")}`);
}

// ── 3) 판정 ─────────────────────────────────────────────────────────────
// 기준: 같은 프리미티브를 **3개 이상 파일**이 각자 정의하면 재사용이 실패한 것이다.
// 2개는 예외(페이지 전용 변형)일 수 있지만 3개부터는 패턴이다 — 관행 기준이며,
// 실측 사례는 11개 모듈 중 9개(82%)가 버튼을 각자 정의한 상태였다.
const DUP_MIN = args["dup-min"] ? parseInt(args["dup-min"], 10) : 3;
const findings = [];
const dup = [...perSig.entries()].filter(([, files]) => files.length >= DUP_MIN).sort((a, b) => b[1].length - a[1].length);

if (dup.length && !shared.length) {
  findings.push(["red", "NO-PRIMITIVE-LAYER",
    `공용 프리미티브가 하나도 없는데 같은 것을 여러 곳에서 각자 정의한다 — 화면마다 CSS를 처음부터 짜게 되고, ` +
    `그러면 제일 싼 것(문단)으로 수렴한다(§1b):\n` +
    dup.map(([k, f]) => `    · ${k} — ${f.length}/${cssFiles.length}개 파일: ${f.slice(0, 6).join(", ")}${f.length > 6 ? " 외" : ""}`).join("\n") +
    `\n    처방: 이 화면들이 실제로 쓰는 프리미티브를 먼저 세우고(직접 만들든 라이브러리를 쓰든 무방), 페이지 CSS에서 다시 그리지 않는다`]);
} else if (dup.length) {
  findings.push(["yellow", "PRIMITIVE-DUPLICATED",
    `공용 프리미티브가 있는데도 각자 정의하는 곳이 있다 — 공용 층으로 흡수할 수 있는지 확인하라:\n` +
    dup.map(([k, f]) => `    · ${k} — ${f.length}/${cssFiles.length}개 파일: ${f.slice(0, 6).join(", ")}`).join("\n")]);
}
if (!shared.length && cssFiles.length >= 3)
  findings.push(["yellow", "NO-SHARED-COMPONENTS",
    `ui/·primitives/·common/ 아래에서 재사용 컴포넌트를 찾지 못했다(빈 디렉터리는 층으로 세지 않는다). ` +
    `외부 라이브러리를 쓰고 있다면 이 경고는 무시`]);

const red = findings.filter((f) => f[0] === "red");
const md =
  `# 컴포넌트 층 검사 — ${SRC}\n\n` +
  `> 이 계기는 **같은 프리미티브를 여러 곳에서 다시 그리고 있는가**만 본다. ` +
  `특정 라이브러리를 쓰라고 강요하지 않는다 — 직접 만든 프리미티브 층도 층이다.\n\n` +
  `- CSS 파일 ${cssFiles.length}개 · 컴포넌트 파일 ${compFiles.length}개\n` +
  `- 공용 프리미티브: ${shared.length ? `${shared.length}개\n` + shared.slice(0, 10).map((s) => `  - ${s}`).join("\n") : "**없음**"}\n\n` +
  (findings.length
    ? findings.map(([sev, rule, detail]) => `- ${sev === "red" ? "🔴" : "🟡"} **${rule}** — ${detail}`).join("\n")
    // 파일이 적으면 중복될 여지 자체가 없다. 그 통과를 "컴포넌트 층이 갖춰졌다"로 읽으면
    // 안 되므로 도장에 새긴다(v1.6.9 원칙 — 관측 범위를 도장 자체에 적는다).
    : cssFiles.length < 3
      ? `- ✅ 프리미티브 중복 정의 없음 — **다만 CSS 파일이 ${cssFiles.length}개뿐이라 중복될 여지가 없었다.** 화면이 늘어나면 다시 재라(지금 통과가 컴포넌트 층이 갖춰졌다는 뜻은 아니다)`
      : "- ✅ 프리미티브 중복 정의 없음") +
  `\n\n**${red.length ? `실패 ${red.length}건` : cssFiles.length < 3 ? "통과(표본 부족)" : "통과"}** · 경고 ${findings.length - red.length}건\n`;

if (args.out) { await mkdir(String(args.out), { recursive: true }); await writeFile(join(String(args.out), "primitives.md"), md); }
console.log(md);
exit(red.length ? 1 : 0);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
