/**
 * copylint.mjs — 페이지 카피 린터 (GOV.UK 규범 + 이 저장소의 실전 규칙)
 *
 * usage: copylint.mjs --url <URL> [--genre landing|UI] [--out <dir>]
 *
 * 근거: GOV.UK 콘텐츠 가이드(OGL v3.0, 상업적 재사용 허용)의 수치화된 규칙과
 * NN/G 열람 실측(79%가 스캔 / 111단어 이하일 때만 절반이 읽는다 / 간결·스캔가능·객관 문체 조합 +124%).
 * 취향이 아니라 **문장 길이·문단 길이·금칙어**만 본다 — 나머지는 사람이 판단할 몫이다.
 *
 * 검사:
 *   S1 문장 25단어 초과 (평균 14단어에서 이해도 90%+, 43단어에서 10% 미만)
 *   S2 문단 5문장 초과
 *   S3 제목 65자 초과
 *   W1 금칙어(GOV.UK 목록 + 한글 대응) — 기능 소개 페이지가 정확히 손대는 어휘
 *   W2 제작자 시점 서술(랜딩 규칙 KO5 계승) — "~해 두었습니다" 류
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { argv, exit } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { load } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url) { console.error("usage: copylint.mjs --url <URL> [--genre landing|UI] [--out <dir>]"); exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const genre = args.genre === "landing" ? "landing" : "UI";

// GOV.UK 금칙어(원문) + 한국어 대응 상투어
const BANNED_EN = ["deliver", "leverage", "robust", "streamline", "empower", "facilitate", "foster", "transform",
  "going forward", "in order to", "utilise", "utilize", "seamless", "cutting-edge", "state-of-the-art",
  "best-in-class", "revolutionize", "unlock", "elevate", "supercharge", "effortless"];
const BANNED_KO = ["극대화", "최적화된 경험", "혁신적인", "차별화된", "손쉽게", "간편하게 관리", "원스톱", "올인원",
  "한 차원 높은", "새로운 패러다임", "고도화", "니즈", "솔루션을 제공", "가치를 전달", "함께 성장"];

const pw = await load("playwright");
if (!pw) { console.error("playwright 미설치"); exit(2); }
const browser = await pw.chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
await page.waitForTimeout(800);

const blocks = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("p, li, h1, h2, h3, h4, [class*='desc' i], [class*='sub' i]")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    if (own.length < 8) continue;
    out.push({ tag: el.tagName.toLowerCase(), text: own.slice(0, 400) });
  }
  return out;
});
await browser.close();

// 길이·금칙어와 별개로 한·영 AI 문체의 **알려진 패턴**을 함께 본다.
// 이 결과는 자연스러움 도장이 아니다 — 두 언어 모두 의미 검토가 별도라는 scope를 그대로 남긴다.
const detector = join(here, "..", "..", "sg-en-humanize", "scripts", "detect_bilingual.py");
const patternRun = await pipePython(detector, ["-", "--genre", genre, "--json"], blocks.map((b) => b.text).join("\n"));
let patternReport = null;
try { patternReport = JSON.parse(patternRun.out); } catch { /* 아래에서 판정 안 됨으로 처리 */ }

const findings = [];
const add = (rule, detail) => findings.push({ rule, detail });
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s) => s.split(/(?<=[.!?。])\s+|(?<=(?:다|요|음|까)\.)\s+/).map((x) => x.trim()).filter((x) => x.length > 3);

for (const b of blocks) {
  if (/^h[1-4]$/.test(b.tag)) {
    if (b.text.length > 65) add("S3", `제목 ${b.text.length}자(65 초과): "${b.text.slice(0, 50)}…"`);
    continue;
  }
  const ss = sentences(b.text);
  if (ss.length > 5) add("S2", `문단 ${ss.length}문장(5 초과): "${b.text.slice(0, 48)}…"`);
  for (const s of ss) {
    const w = words(s);
    if (w > 25) add("S1", `문장 ${w}단어(25 초과): "${s.slice(0, 60)}…"`);
  }
  const low = b.text.toLowerCase();
  for (const w of BANNED_EN) if (new RegExp(`\\b${w}\\b`, "i").test(low)) add("W1", `금칙어 "${w}": "${b.text.slice(0, 50)}…"`);
  for (const w of BANNED_KO) if (b.text.includes(w)) add("W1", `상투어 "${w}": "${b.text.slice(0, 50)}…"`);
  if (/(해\s?두었|배치했|구성했|담았|이어\s?붙였|정리해\s?두었)(습니다|어요)/.test(b.text))
    add("W2", `제작자 시점 서술: "${b.text.slice(0, 50)}…" — 카피의 주어는 고객이다`);
}

const byRule = {};
for (const f of findings) (byRule[f.rule] ??= []).push(f.detail);
const patternRed = patternReport?.total?.red ?? 0;
const patternYellow = patternReport?.total?.yellow ?? 0;
const patternHits = (patternReport?.files?.[0]?.findings ?? [])
  .map((f) => `${f.language}:${f.rule}(${f.name})×${f.count}`).join(", ");
const patternSection = patternReport
  ? `## 한·영 알려진 패턴\n\n🔴 ${patternRed} · 🟡 ${patternYellow}${patternHits ? ` — ${patternHits}` : ""}\n\n> ${patternReport.scope}\n`
  : `## 한·영 알려진 패턴\n\n- ⛔ 판정되지 않음 — ${tail(patternRun.err || patternRun.out, 3) || "detect_bilingual.py 실행 불가"}\n`;
const md = `# 카피 린트 — ${args.url}

검사 블록 ${blocks.length}개 · 길이/어휘 지적 ${findings.length}건 · 알려진 패턴 🔴${patternRed} 🟡${patternYellow}

${Object.keys(byRule).length ? Object.entries(byRule).map(([r, ds]) => `## ${r} (${ds.length}건)\n${ds.slice(0, 8).map((d) => `- ${d}`).join("\n")}${ds.length > 8 ? `\n- … 외 ${ds.length - 8}건` : ""}`).join("\n\n") : "- ✅ 이상 없음"}

${patternSection}

> 근거: GOV.UK 콘텐츠 가이드(문장 25단어·문단 5문장·제목 65자·금칙어), NN/G 열람 실측(79% 스캔).
> 기계 규칙은 길이·어휘·알려진 패턴만 본다. **무엇을 말할지와 자연스러움은 사람이 정한다.**
`;
if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "copylint.md"), md); }
console.log(md);
if (!patternReport) exit(2);
exit(findings.some((f) => f.rule === "W1" || f.rule === "W2") || patternRed ? 1 : 0);

function pipePython(script, pythonArgs, input) {
  return new Promise((resolve) => {
    const child = spawn("python3", [script, ...pythonArgs], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (data) => (out += data));
    child.stderr.on("data", (data) => (err += data));
    child.on("error", (error) => resolve({ code: 2, out: "", err: String(error) }));
    child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    child.stdin.end(input);
  });
}

function tail(text, count = 3) { return String(text).split("\n").filter(Boolean).slice(-count).join(" / "); }

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
