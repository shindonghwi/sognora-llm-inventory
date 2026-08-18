/**
 * alive.mjs — "이 페이지가 실제로 살아 있는가" 검사
 *
 * usage: alive.mjs --url <URL> [--src <컴포넌트 디렉터리>] [--out <dir>]
 *
 * 왜 있나: 실전 사고 — 요금제 페이지가 런타임 에러로 죽어 있었고(plan.highlights undefined),
 * 그 전에는 CSS가 `.planLedger/.planRow`를 정의하는데 컴포넌트는 `.planGrid/.planCard`를 써서
 * 레이아웃이 통째로 안 먹었다(겹치는 클래스 8개뿐). 둘 다 **한 번 열어보기만 했어도** 잡혔다.
 * 접근성 감사가 아니다. 페이지가 렌더되고, 콘솔이 조용하고, 스타일이 실제로 붙었는지만 본다.
 *
 * 검사:
 *   1) HTTP 상태·렌더 결과(에러 오버레이·빈 화면)
 *   2) 콘솔 에러·페이지 예외
 *   3) CSS 모듈 클래스 불일치 — 컴포넌트가 쓰는 styles.X 중 CSS에 없는 것(--src 지정 시)
 *   4) 스타일 미적용 혐의 — 컨테이너 좌우 여백 0, 요소가 뷰포트 좌단에 붙음
 *   5) 상태 화면 존재 — 빈 상태·로딩·오류 문구가 소스에 있는가(--src 지정 시, 제품 화면용)
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";
import { argv, exit } from "node:process";
import { load } from "./_deps.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url) { console.error("usage: alive.mjs --url <URL> [--src <dir>] [--out <dir>]"); exit(2); }
const findings = [];
const add = (sev, rule, detail) => findings.push({ sev, rule, detail });

// ── 3·5) 소스 정적 검사 ───────────────────────────────────────────────────
if (args.src) {
  const files = [];
  await (async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!["node_modules", ".next", "dist", "build"].includes(e.name)) await walk(join(d, e.name)); continue; }
      if ([".tsx", ".jsx", ".ts", ".js"].includes(extname(e.name))) files.push(join(d, e.name));
    }
  })(args.src);

  for (const f of files) {
    const src = await readFile(f, "utf8");
    // CSS 모듈 import 찾기 → 실제 정의된 클래스와 대조
    for (const m of src.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+\.module\.css)["']/g)) {
      const [, ident, rel] = m;
      let css = "";
      try { css = await readFile(join(dirname(f), rel), "utf8"); } catch { continue; }
      const defined = new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((x) => x[1]));
      const used = [...new Set([...src.matchAll(new RegExp(`\\b${ident}\\.([a-zA-Z_][\\w-]*)`, "g"))].map((x) => x[1]))];
      const missing = used.filter((u) => !defined.has(u));
      if (missing.length)
        add(missing.length > used.length / 2 ? "red" : "yellow", "CLASS-MISMATCH",
          `${basename(f)}: CSS에 없는 클래스 ${missing.length}/${used.length}개 사용 — ${missing.slice(0, 6).join(", ")}${missing.length > used.length / 2 ? " (절반 이상 — 레이아웃이 통째로 안 먹는다)" : ""}`);
    }
    // 상태 화면: 목록·데이터를 map으로 그리면서 빈 배열 처리가 없으면 빈 상태가 없다
    if (/\.map\(/.test(src) && !/length\s*===?\s*0|length\s*\?|isEmpty|empty|없습니다|아직 없|no items|not found/i.test(src))
      add("yellow", "NO-EMPTY-STATE", `${basename(f)}: 목록을 그리는데 빈 상태 분기가 없다 — 데이터 0건일 때 화면이 비어버린다`);
  }
}

// ── 1·2·4) 실제 렌더 검사 ────────────────────────────────────────────────
const pw = await load("playwright");
if (!pw) { console.error("playwright 미설치"); exit(2); }
const browser = await pw.chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e.message).slice(0, 160)));
const res = await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => ({ status: () => -1, err: e }));
const status = res?.status?.() ?? -1;
if (status >= 400 || status < 0) add("red", "HTTP", `HTTP ${status}`);
await page.waitForTimeout(1200);

const probe = await page.evaluate(() => {
  const txt = document.body.innerText.replace(/\s+/g, " ").trim();
  // Next.js/Vite 에러 오버레이
  const overlay = document.querySelector("nextjs-portal, [data-nextjs-dialog], vite-error-overlay, #webpack-dev-server-client-overlay");
  const overlayText = overlay ? (overlay.shadowRoot?.textContent ?? overlay.textContent ?? "").replace(/\s+/g, " ").slice(0, 200) : null;
  // 좌단 밀착: 본문 블록이 x<8에서 시작하면 컨테이너 패딩이 안 먹은 것
  let flush = 0, blocks = 0;
  for (const el of document.querySelectorAll("main *, section *, article *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 24) continue;
    blocks++;
    if (r.x < 8) flush++;
  }
  return { len: txt.length, sample: txt.slice(0, 120), overlayText, flush, blocks,
    h1: document.querySelectorAll("h1").length, imgs: document.querySelectorAll("img,video").length };
});
if (probe.overlayText && /error|Cannot read|undefined|Unhandled|TypeError/i.test(probe.overlayText))
  add("red", "RUNTIME-ERROR", `개발 에러 오버레이: ${probe.overlayText.slice(0, 140)}`);
if (probe.len < 200) add("red", "BLANK", `본문 텍스트 ${probe.len}자 — 사실상 빈 화면(${probe.sample})`);
if (consoleErrors.length) add(consoleErrors.some((e) => /pageerror|TypeError|Cannot read/i.test(e)) ? "red" : "yellow",
  "CONSOLE", `콘솔 에러 ${consoleErrors.length}건 — ${consoleErrors[0]}`);
if (probe.blocks >= 6 && probe.flush / probe.blocks > 0.4)
  add("red", "NO-CONTAINER", `본문 블록 ${probe.blocks}개 중 ${probe.flush}개가 화면 좌단(x<8)에 밀착 — 컨테이너 패딩·그리드가 적용되지 않았다`);
if (probe.h1 === 0) add("yellow", "NO-H1", "h1 없음");

await browser.close();

const red = findings.filter((f) => f.sev === "red");
const md = `# 살아있는가 검사 — ${args.url}\n\n${findings.length ? findings.map((f) => `- ${f.sev === "red" ? "🔴" : "🟡"} **${f.rule}** — ${f.detail}`).join("\n") : "- ✅ 이상 없음"}\n\n**${red.length ? `실패 ${red.length}건` : "통과"}** · 경고 ${findings.length - red.length}건\n`;
if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "alive.md"), md); }
console.log(md);
exit(red.length ? 1 : 0);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
