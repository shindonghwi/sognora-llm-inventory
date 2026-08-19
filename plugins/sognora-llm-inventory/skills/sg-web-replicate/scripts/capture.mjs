#!/usr/bin/env node
/**
 * 원본 캡처 + 측정 — 브라우저 1회 기동으로 한 페이지의 전 상태를 훑는다.
 *
 * node capture.mjs --url <URL> --out <dir> [--viewports 1440x900,768x1024,390x844]
 *                  [--headed] [--dpr 1] [--scrolls 0,50,100] [--force] [--storage <state.json>]
 * --scrolls 기본값은 자동: 페이지 높이에 비례해 창이 연속 타일이 되도록 증설(_shared.mjs, 상한 12지점).
 * --no-clock: 가상 시계 동결 해제(기본은 동결 — 타이핑·위젯 부트가 매 런 같은 상태로 결정화된다).
 *
 * 산출: <out>/<viewport>/<state>.png + measure.json + meta.json
 * exit 0 성공 / 1 캡처 실패 / 2 playwright 미설치
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";
import { autoScrollPoints, coveragePct, normalizeConsoleError, CLOCK_DEFAULTS, installFrozenClock } from "./_shared.mjs";

const args = parseArgs(argv.slice(2));
if (!args.url || !args.out) {
  console.error("usage: capture.mjs --url <URL> --out <dir> [--viewports WxH,...] [--headed]");
  exit(2);
}

const pw = await load("playwright");
if (!pw) {
  missing(["playwright"]);
  exit(2);
}
const { chromium } = pw;

const viewports = (args.viewports ?? "1440x900,768x1024,390x844")
  .split(",")
  .map((v) => {
    const [w, h] = v.trim().split("x").map(Number);
    return { label: v.trim(), width: w, height: h };
  });
// 스크롤 지점: 명시하지 않으면 페이지 높이에 비례해 자동 증설한다(_shared.mjs).
// 고정 0/50/100은 3×뷰포트보다 긴 페이지에서 밴드 사각지대를 만들었다(실측).
const scrollsArg = args.scrolls ? String(args.scrolls).split(",").map(Number) : null;
const dpr = Number(args.dpr ?? 1);

// 측정 대상: 의미 있는 블록만. 모든 노드를 재는 것은 낭비다(rules.md).
const MEASURE_SELECTOR =
  "header, nav, main, footer, section, h1, h2, h3, [class*=hero], [class*=container], " +
  "[class*=card], button, a[class*=btn], a[class*=button]";

const browser = await chromium.launch({ headless: !args.headed });
// 가상 시계(기본 on, --no-clock으로 해제) — 타이머 구동 비결정을 결정화한다(_shared.mjs 참조).
// clock은 컨텍스트마다 새로 설치해야 하므로 뷰포트마다 컨텍스트를 새로 만든다.
// 부수 효과로 diff.mjs(원래 뷰포트별 새 컨텍스트)와 캐시·클록 조건이 대칭이 된다.
const clock = args["no-clock"] ? null : { ...CLOCK_DEFAULTS };
const written = []; // 이번 런에 캡처한 measure — 콘솔 baseline을 뷰포트 합집합으로 만들어 마지막에 쓴다

let failed = 0;
for (const vp of viewports) {
  const dir = join(args.out, vp.label);
  await mkdir(dir, { recursive: true });
  if (!args.force && (await exists(join(dir, "measure.json")))) {
    console.log(`skip (이미 있음): ${vp.label} — 다시 찍으려면 --force`);
    continue;
  }

  const context = await browser.newContext({
    deviceScaleFactor: dpr,
    reducedMotion: "reduce", // 애니메이션 정지 — 같은 페이지가 매번 다르게 찍히는 것 방지
    storageState: args.storage || undefined,
  });
  const page = await context.newPage();
  // 원본이 스스로 뿜는 콘솔 오류를 baseline으로 기록한다 — diff는 "원본에 없던 새 오류"만 센다.
  // (aside.com 실측: 원본이 오류 2~4건을 뿜어 "콘솔 오류 0건" 게이트를 원본 자신이 통과 못 했다.)
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));

  await page.setViewportSize({ width: vp.width, height: vp.height });
  if (clock) await installFrozenClock(page, clock.epoch); // 로드 "전" 동결이어야 결정적이다(실측)
  try {
    await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    console.error(`goto 실패 (${vp.label}): ${e.message}`);
    failed++;
    await context.close();
    continue;
  }
  await page.addStyleTag({
    content: `*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}`,
  });
  // 동결된 타이머를 고정 예산만큼 가상으로 진행 — 위젯 부트·타이핑이 매 런 같은 상태에서 멈춘다.
  if (clock) await page.clock.runFor(clock.runFor);
  await page.waitForTimeout(300); // robots 예의 + 폰트 안정화

  // 실측 뷰포트 — 요청값과 다르면 이 캡처는 기준으로 쓰지 않는다(rules.md)
  const measured = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  const meta = {
    url: args.url,
    viewportRequested: [vp.width, vp.height],
    viewportMeasured: measured,
    dpr,
    trustworthy: measured[0] === vp.width && measured[1] === vp.height,
    capturedAt: new Date().toISOString(),
    headless: !args.headed,
    clock, // {epoch, runFor} 또는 null — diff는 이 값 그대로 재현해야 동일 조건이다
  };

  // 상태별 캡처 — 한 번의 기동 안에서 전부 처리
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  const scrolls = scrollsArg ?? autoScrollPoints(pageHeight, vp.height);
  const pixelCoveragePct = coveragePct(scrolls, pageHeight, vp.height);
  for (const pct of scrolls) {
    await page.evaluate((p) => window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * (p / 100)), pct);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(dir, `scroll-${pct}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(dir, "full.png"), fullPage: true });

  // hover 상태 — 첫 번째 주요 CTA
  const cta = page.locator("button, a[class*=btn], a[class*=button]").first();
  let hoverDelta = null;
  if (await cta.count()) {
    const before = await boxOf(cta);
    await cta.hover({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(dir, "hover-cta.png") });
    hoverDelta = { before, after: await boxOf(cta) };
    await page.mouse.move(0, 0);
  }

  const elements = await page.evaluate((sel) => {
    // 첫 지정 family가 "실제로 그 폰트로 그려지는가" — 선언 문자열만 비교하면 @font-face가
    // 빠진 복제본이 "폰트 일치"로 통과한다(실측). document.fonts.check는 매칭 face가 없는
    // 미지 family에 true를 주는 스펙 특성이 있어(실측) 못 쓴다 — 캔버스 measureText로
    // "family+폴백"과 "폴백 단독"의 글자 폭을 대조한다. 둘 다 같으면 폴백으로 그려진 것이다.
    const ctx = document.createElement("canvas").getContext("2d");
    const SAMPLE = "abgWQM한글힣 0123ilI.,";
    const famCache = {};
    const famRendered = (fam) => {
      if (fam in famCache) return famCache[fam];
      try {
        ctx.font = `32px ${fam}, monospace`;
        const wm = ctx.measureText(SAMPLE).width;
        ctx.font = "32px monospace";
        const m = ctx.measureText(SAMPLE).width;
        ctx.font = `32px ${fam}, serif`;
        const ws = ctx.measureText(SAMPLE).width;
        ctx.font = "32px serif";
        const sr = ctx.measureText(SAMPLE).width;
        // 두 폴백 모두와 폭이 같으면 그 family는 렌더에 참여하지 않는다(미로드/미존재)
        return (famCache[fam] = wm !== m || ws !== sr);
      } catch { return (famCache[fam] = true); }
    };
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(",")[0].trim();
      out.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        cls: (el.className && String(el.className).slice(0, 60)) || null,
        box: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        font: `${fam} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
        fontLoaded: /^(serif|sans-serif|monospace|system-ui|ui-\w+|cursive|fantasy|math)$/i.test(fam) ? true : famRendered(fam),
        color: cs.color,
        bg: cs.backgroundColor,
        pad: cs.padding,
        margin: cs.margin,
        radius: cs.borderRadius,
        shadow: cs.boxShadow === "none" ? null : cs.boxShadow,
        position: cs.position,
      });
      if (out.length >= 250) break; // 상한 — 측정은 의미 있는 블록까지만
    }
    return out;
  }, MEASURE_SELECTOR);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );

  // 원본의 콘솔 오류 baseline — diff가 "원본에 없던 새 오류"만 세도록 정규화 키로 저장.
  // 원본 오류는 런마다 흔들린다(aside 실측: 3~5종) — 뷰포트 합집합으로 과소 수집을 완화하므로
  // measure.json은 전 뷰포트 캡처가 끝난 뒤에 쓴다.
  const consoleBaseline = [...new Set(consoleErrors.map(normalizeConsoleError))];

  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  written.push({
    dir,
    measure: {
      meta, pageHeight, horizontalOverflow, hoverDelta,
      scrollPoints: scrolls, pixelCoveragePct,
      consoleBaseline, consoleErrorsSample: consoleErrors.slice(0, 5),
      elements,
    },
  });
  console.log(
    `captured ${vp.label}: 요소 ${elements.length}개 · 스크롤 ${scrolls.length}지점 · 커버리지 ${pixelCoveragePct}%` +
      (clock ? "" : " · ⚠클록 없음") +
      (consoleBaseline.length ? ` · 원본 콘솔오류 ${consoleBaseline.length}종(baseline)` : "") +
      (meta.trustworthy ? "" : `  ⚠ 뷰포트 불일치 ${measured.join("x")} — 기준 자료로 쓰지 말 것`) +
      (horizontalOverflow ? "  ⚠ 가로 스크롤 발생" : "")
  );
  await context.close();
}

// 콘솔 baseline 합집합 — 이번 런에 캡처된 전 뷰포트의 오류를 합쳐서 각 measure.json에 쓴다
const baselineUnion = [...new Set(written.flatMap((w) => w.measure.consoleBaseline))];
for (const w of written) {
  w.measure.consoleBaseline = baselineUnion;
  await writeFile(join(w.dir, "measure.json"), JSON.stringify(w.measure, null, 2));
}

await browser.close();
exit(failed ? 1 : 0);

async function boxOf(loc) {
  const b = await loc.boundingBox().catch(() => null);
  return b ? { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } : null;
}
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
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
