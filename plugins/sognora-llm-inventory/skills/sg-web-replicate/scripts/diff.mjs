#!/usr/bin/env node
/**
 * 비교 게이트 — 원본 캡처 vs 로컬 구현본을 동일 조건에서 비교한다.
 *
 * node diff.mjs --ref <ref-dir> --local <로컬URL> --out <diff-dir> [--strict] [--override <override.json>]
 *               [--no-pixel: 픽셀 의존성 없이 수치만(판정 보류 exit 3)] [--no-clock: 구버전 ref 호환용]
 * 클록·스크롤 지점은 ref의 meta에 기록된 조건을 그대로 재현한다 — 조건이 어긋나면 판정을 거부한다.
 *
 * 로컬을 원본과 같은 뷰포트·DPR·스크롤 지점으로 캡처한 뒤:
 *   1) 요소별 위치·크기·폰트 수치 비교
 *   2) 스크린샷 픽셀 불일치율
 * exit 0 통과 / 1 게이트 미달 / 2 실행 불가
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { load, missing } from "./_deps.mjs";
import { coveragePct, normalizeConsoleError, installFrozenClock } from "./_shared.mjs";

const args = parseArgs(argv.slice(2));
if (!args.ref || !args.local || !args.out) {
  console.error("usage: diff.mjs --ref <dir> --local <URL> --out <dir> [--strict]");
  exit(2);
}

const pw = await load("playwright");
if (!pw) {
  missing(["playwright"]);
  exit(2);
}
const { chromium } = pw;

const pngMod = await load("pngjs");
const pmMod = await load("pixelmatch");
const PNG = pngMod?.PNG ?? null;
const pixelmatch = pmMod?.default ?? null;
if (!PNG || !pixelmatch) {
  // 미제공 게이트는 통과가 아니라 "판정되지 않음"이다(sg-landing-forge audit.mjs와 같은 원칙).
  // 실측 사고: 이 상태에서 **빈 페이지·색 반전·전부 굵게·문구 전면 교체가 전부 exit 0**으로 통과했다.
  // 수치 게이트만으로는 화면이 같은지 판정할 수 없다 — 그러면 판정을 거부해야지, 통과시키면 안 된다.
  console.error("⚠ pixelmatch/pngjs 없음 — 픽셀 게이트를 실행할 수 없어 판정을 거부합니다.");
  console.error("  설치: npm i -D pixelmatch pngjs");
  console.error("  수치 비교만으로 진행하려면 --no-pixel 을 명시하세요(이 런은 '픽셀 미판정'으로 보고서에 기록되고 A급 판정을 받을 수 없습니다).");
  if (!args["no-pixel"]) exit(2);
}
const pixelJudged = Boolean(PNG && pixelmatch);

const GATE = args.strict
  ? { box: 1, font: 0, pixel: 0.5 }
  : { box: 2, font: 1, pixel: 2 };

const override = args.override ? JSON.parse(await readFile(args.override, "utf8")) : { ignore: [] };
const ignore = new Set((override.ignore ?? []).map(String));
// masks: 뷰포트별 픽셀 면제 영역. rules.md §측정 불가 영역의 계약을 여기서 집행한다.
//   { "masks": { "1440x900": [{ "x":0,"y":120,"w":1408,"h":700,"reason":"히어로 타이핑 애니메이션" }] } }
// 면적은 기계가 계산해 report에 강제 기록하고, 20% 초과면 등급을 낮춘다 — 자기 선언이 무한 면제가 되지 않도록.
const MASK_AREA_CAP = 0.20;
const masksFor = (label) => (override.masks?.[label] ?? []).filter((m) => m && m.w > 0 && m.h > 0);
for (const [label, ms] of Object.entries(override.masks ?? {}))
  for (const m of ms)
    if (!m.reason) {
      console.error(`override.masks[${label}]에 reason이 없는 마스크가 있습니다 — 사유 없는 픽셀 면제는 받지 않습니다.`);
      exit(2);
    }

const viewportDirs = (await readdir(args.ref, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d+x\d+$/.test(d.name))
  .map((d) => d.name);
if (!viewportDirs.length) {
  console.error(`기준 캡처가 없습니다: ${args.ref} (capture.mjs를 먼저 실행하세요)`);
  exit(2);
}

// ref를 로컬 URL에서 재캡처해 "자기 대 자기"로 통과시키는 경로를 막는다.
// 고의적 위조(report.json 날조)는 스킬 설계 밖이지만, 이건 "ref가 오래됐으니 재캡처하자"로
// **자기 정당화가 서는 경로**라 실제로 밟힌다 — 방어 비용 몇 줄로 막을 값어치가 있다.
// meta.json은 뷰포트 하위에 있다(ref 루트가 아니다). 루트를 읽던 초판은 항상 ENOENT로 검사를 건너뛰었다.
try {
  const refMeta = JSON.parse(await readFile(join(args.ref, viewportDirs[0], "meta.json"), "utf8"));
  // localhost·127.0.0.1·[::1]은 같은 기계다 — 호스트명 표기만 바꾸는 우회를 막는다.
  const normHost = (u) => {
    const url = new URL(u);
    const host = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) ? "loopback" : url.hostname;
    return `${url.protocol}//${host}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
  };
  if (refMeta?.url && normHost(refMeta.url) === normHost(args.local)) {
    console.error(`ref의 출처(${refMeta.url})와 --local(${args.local})의 origin이 같습니다 — 자기 대 자기 비교는 게이트가 아닙니다.`);
    console.error("원본 URL에서 캡처한 ref를 쓰세요.");
    exit(2);
  }
} catch { /* meta.json이 없거나 URL 파싱 실패 시 검사 생략 */ }

// 클록 조건 해석 — ref의 meta에 기록된 조건을 **그대로** 재현해야 동일 조건이다.
// 조용히 다른 조건으로 비교하는 것이 최악이므로, 어긋나면 판정을 거부한다.
let clockCfg = null;
{
  const metas = [];
  for (const label of viewportDirs) {
    try {
      metas.push(JSON.parse(await readFile(join(args.ref, label, "measure.json"), "utf8")).meta ?? {});
    } catch { metas.push({}); }
  }
  const specs = new Set(metas.map((m) => JSON.stringify("clock" in m ? m.clock : "__old__")));
  if (specs.size > 1) {
    console.error("ref 뷰포트 간 클록 조건이 서로 다릅니다 — --force로 일괄 재캡처하세요.");
    exit(2);
  }
  const spec = "clock" in metas[0] ? metas[0].clock : undefined;
  if (spec === undefined) {
    // 구버전 ref(클록 미기록) + 신버전 diff 혼용 — 명시 동의 없이는 진행하지 않는다
    if (args["no-clock"]) {
      console.warn("⚠ 구버전 ref(클록 미기록) — --no-clock 동의 하에 구조건(클록 없음)으로 비교합니다.");
    } else {
      console.error("ref가 클록 없이(구버전) 캡처됐습니다 — 조용히 다른 조건으로 비교하지 않습니다.");
      console.error("  ref를 재캡처하거나(권장), 구조건 그대로 비교하려면 --no-clock을 명시하세요.");
      exit(2);
    }
  } else if (spec === null) {
    clockCfg = null; // ref가 의도적으로 --no-clock 캡처 — 그대로 따른다
  } else {
    if (args["no-clock"]) {
      console.error("ref는 클록으로 캡처됐는데 --no-clock이 지정됐습니다 — 조건 충돌. 플래그를 빼거나 ref를 --no-clock으로 재캡처하세요.");
      exit(2);
    }
    clockCfg = spec; // ref가 기록한 epoch·runFor 그대로
  }
}

const browser = await chromium.launch({ headless: !args.headed });
const report = [];
let violations = 0;

for (const label of viewportDirs) {
  const refDir = join(args.ref, label);
  const refMeasure = JSON.parse(await readFile(join(refDir, "measure.json"), "utf8"));
  if (!refMeasure.meta.trustworthy) {
    console.error(`⚠ ${label}: 원본 캡처의 뷰포트가 불일치 — 재캡처 필요. 이 뷰포트는 건너뜁니다.`);
    violations++;
    continue;
  }

  const [w, h] = refMeasure.meta.viewportRequested;
  const outDir = join(args.out, label);
  await mkdir(outDir, { recursive: true });

  const context = await browser.newContext({
    deviceScaleFactor: refMeasure.meta.dpr,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 120)));
  const missing = [];
  page.on("response", (r) => r.status() === 404 && missing.push(r.url().slice(0, 120)));

  if (clockCfg) await installFrozenClock(page, clockCfg.epoch); // 로드 "전" 동결 — capture와 같은 순서
  try {
    await page.goto(args.local, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    console.error(`로컬 접속 실패 (${label}): ${e.message}`);
    violations++;
    await context.close();
    continue;
  }
  await page.addStyleTag({
    content: `*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}`,
  });
  if (clockCfg) await page.clock.runFor(clockCfg.runFor); // capture와 같은 가상 예산만큼 진행 후 동결
  await page.waitForTimeout(300);

  // 같은 스크롤 지점에서 스크린샷
  const pixelResults = [];
  const pending = []; // PNG 비교는 요소 측정 뒤로 미룬다(아래 사유)
  // 캡처와 같은 순서(숫자 오름차순)로 돈다. readdir의 알파벳순(0→100→50)으로 돌면
  // 스크롤 방향에 반응하는 애니메이션이 다른 상태로 도착해 동일 조건이 깨진다.
  const scrollShots = (await readdir(refDir))
    .filter((f) => /^scroll-\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  for (const f of scrollShots) {
    const pct = Number(f.match(/\d+/)[0]);
    await page.evaluate((p) => window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * (p / 100)), pct);
    await page.waitForTimeout(150);
    const localPath = join(outDir, `local-${f}`);
    await page.screenshot({ path: localPath });
    pending.push({ f, localPath, pct });
  }

  // 원본은 스크롤 0에서 측정했다. getBoundingClientRect는 뷰포트 기준이므로
  // 같은 지점으로 되돌리지 않으면 y가 전부 어긋난다(동일 조건 원칙).
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);

  const localElements = await page.evaluate((sel) => {
    // 렌더 폰트 검사 — capture와 동일 로직(캔버스 measureText 이중 폴백 대조).
    // document.fonts.check는 미지 family에 true를 주는 스펙 특성 때문에 못 쓴다(실측).
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
        cls: (el.className && String(el.className).slice(0, 60)) || null,
        box: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        font: `${fam} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
        fontLoaded: /^(serif|sans-serif|monospace|system-ui|ui-\w+|cursive|fantasy|math)$/i.test(fam) ? true : famRendered(fam),
        // 장식 필드 — capture와 같은 항목. 픽셀 없는 런(--no-pixel)에서 색 반전·문구 교체가
        // 통과하던 구멍(실측 evil5)의 최소 방어선이다.
        color: cs.color,
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
        shadow: cs.boxShadow === "none" ? null : cs.boxShadow,
      });
      if (out.length >= 250) break;
    }
    return out;
  }, "header, nav, main, footer, section, h1, h2, h3, [class*=hero], [class*=container], [class*=card], button, a[class*=btn], a[class*=button]");

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );

  // 색 정규화 — 원본이 lab()/oklch()로 색을 내보내면(aside 실측: 38/38 요소가 lab 문자열)
  // 문자열 비교는 같은 색의 rgb 표기를 오탐한다. 캔버스에 1px 칠해 RGBA로 통일한 뒤 ±3/채널로 본다.
  const colorStrings = new Set();
  const addColors = (e) => {
    if (e.color) colorStrings.add(e.color);
    if (e.bg) colorStrings.add(e.bg);
    if (e.shadow) for (const s of splitShadows(e.shadow)) colorStrings.add(shadowColorPart(s));
  };
  refMeasure.elements.forEach(addColors);
  localElements.forEach(addColors);
  colorStrings.delete("");
  const normColor = await page.evaluate((list) => {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const out = {};
    for (const s of list) {
      ctx.fillStyle = "#0102fe"; // 감지용 초기값 — 유효하지 않은 문자열은 fillStyle을 못 바꾼다
      ctx.fillStyle = s;
      if (ctx.fillStyle === "#0102fe" && s.toLowerCase() !== "#0102fe") { out[s] = null; continue; }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[s] = [d[0], d[1], d[2], d[3]];
    }
    return out;
  }, [...colorStrings]);

  // 요소 매칭: 같은 순서의 같은 태그끼리 비교 (구조가 같다는 전제 — 다르면 그 자체가 결함)
  // 이제야 PNG를 비교한다. 디코드+pixelmatch는 수백 ms가 걸려서, 측정 전에 돌리면
  // local의 요소 측정만 ref보다 늦어진다 — 채팅 위젯·쿠키 배너가 1~3초에 부트하는 사이트에서
  // **동일 URL 자기 비교가 구조델타 -1로 실패**하는 결정적 오탐이 여기서 났다(실측).
  for (const { f, localPath, pct } of pending) {
    // 마스크는 기본 "문서 좌표"다. 스크롤 지점이 늘어난 뒤(자동 증설) 뷰포트 고정 좌표를 쓰면
    // 같은 화면 좌표가 모든 창에서 다른 콘텐츠를 가려 실제 차이를 숨긴다(침묵 오탈락).
    // 각 창의 문서상 시작 y로 환산해 그 창에 걸치는 부분만 가린다. sticky/fixed용은 "space":"viewport".
    const shotTop = (Math.max(0, refMeasure.pageHeight - h) * pct) / 100;
    const r = await comparePng(join(refDir, f), localPath, join(outDir, `diff-${f}`), masksFor(label), shotTop);
    if (r) pixelResults.push({ state: f, ...r });
  }

  const boxOffenders = [];
  const fontOffenders = [];
  const decoOffenders = [];
  const n = Math.min(refMeasure.elements.length, localElements.length);
  for (let i = 0; i < n; i++) {
    const a = refMeasure.elements[i];
    const b = localElements[i];
    const key = `${a.tag}${a.cls ? "." + a.cls.split(" ")[0] : ""}`;
    if (ignore.has(key)) continue;
    if (a.tag !== b.tag) continue; // 구조 어긋남 — 아래 structureDelta로 보고
    const d = Math.max(
      Math.abs(a.box.x - b.box.x),
      Math.abs(a.box.y - b.box.y),
      Math.abs(a.box.w - b.box.w),
      Math.abs(a.box.h - b.box.h)
    );
    if (d > GATE.box) boxOffenders.push({ el: key, delta: +d.toFixed(1), ref: a.box, local: b.box });
    if (a.font !== b.font) {
      // 폰트 family 불일치는 크기 오차와 무관하게 그 자체로 실패다(rules.md).
      // 다른 폰트로 그리면 글자 폭이 달라져 모든 치수가 어긋난다.
      // 실측 사고: 예전 코드가 `font.split(" ")[0]`으로 **첫 단어만** 비교해
      // "Arial Black" vs "Arial Narrow", "Noto Sans KR" vs "Noto Serif KR"이 통과했다.
      const fa = parseFont(a.font), fb = parseFont(b.font);
      if (fa.family !== fb.family) {
        fontOffenders.push({ el: key, kind: "family", ref: a.font, local: b.font });
      } else {
        if (Math.abs(fa.size - fb.size) > GATE.font)
          fontOffenders.push({ el: key, kind: "size", ref: a.font, local: b.font });
        // weight는 예전에 문자열 안에만 있고 비교되지 않아 400→700이 통과했다. 정확 일치를 요구한다.
        if (fa.weight !== fb.weight)
          fontOffenders.push({ el: key, kind: "weight", ref: a.font, local: b.font });
        // normal(파싱 0) vs px 명시는 그 자체로 불일치다 — 예전엔 `fa.lh && fb.lh` 가드가 스킵시켜 통과했다.
        if ((fa.lh === 0) !== (fb.lh === 0) || (fa.lh && fb.lh && Math.abs(fa.lh - fb.lh) > GATE.font))
          fontOffenders.push({ el: key, kind: "line-height", ref: a.font, local: b.font });
      }
    }
    // 렌더 폰트 게이트 — family "선언"이 같아도 로컬에 그 폰트가 로드돼 있지 않으면
    // 폴백으로 그려진다(선언 검사만으로는 @font-face 누락이 통과했다 — 실측).
    // ref true·local false 쌍만 결함: 원본조차 못 실은 폰트를 로컬에 요구하지 않는다.
    if (a.fontLoaded === true && b.fontLoaded === false)
      fontOffenders.push({ el: key, kind: "not-loaded", ref: a.font, local: `${b.font} (family 미로드 — 폴백 렌더)` });
    // 장식 비교 — 색·배경은 정규화 RGBA(±3/채널), radius·shadow는 수치 ±1px.
    // 픽셀 없는 런에서 색 반전·문구 교체가 통과하던 구멍(실측 evil5)의 최소 방어선.
    if (!sameColor(a.color, b.color, normColor))
      decoOffenders.push({ el: key, kind: "color", ref: a.color, local: b.color });
    if (!sameColor(a.bg, b.bg, normColor))
      decoOffenders.push({ el: key, kind: "bg", ref: a.bg, local: b.bg });
    if (!radiusClose(a.radius ?? "", b.radius ?? ""))
      decoOffenders.push({ el: key, kind: "radius", ref: a.radius, local: b.radius });
    if (!shadowClose(a.shadow ?? null, b.shadow ?? null, normColor))
      decoOffenders.push({ el: key, kind: "shadow", ref: a.shadow, local: b.shadow });
  }

  const worstPixel = pixelResults.length ? Math.max(...pixelResults.map((r) => r.mismatchPct)) : null;
  // 구조 델타 = 요소 수 차이. 예전엔 보고서에 적히기만 하고 게이트에 없어서
  // **로컬이 빈 페이지여도(비교 쌍 0개) 통과**했다. 요소 수가 다르면 화면이 다른 것이다.
  const structureDelta = refMeasure.elements.length - localElements.length;
  const worstMask = pixelResults.length ? Math.max(...pixelResults.map((r) => r.maskedPct ?? 0)) : 0;
  // 원본이 스스로 뿜는 콘솔 오류(aside 실측 2~4건)는 baseline으로 빼고 "새 오류"만 결함으로 센다.
  // baseline이 없는 구버전 ref는 예전과 같이 전 오류를 센다.
  const baseline = new Set(refMeasure.consoleBaseline ?? []);
  const newConsoleErrors = consoleErrors.filter((e) => !baseline.has(normalizeConsoleError(e)));
  // 픽셀 커버리지 — 스크롤 창들이 페이지를 실제로 덮는 비율(필수 필드). 구버전 3지점 ref는 여기서 드러난다.
  const scrollPcts = scrollShots.map((f) => Number(f.match(/\d+/)[0]));
  const pixelCoveragePct = coveragePct(scrollPcts, refMeasure.pageHeight, h);
  const vpFail =
    worstMask > MASK_AREA_CAP * 100 || // 화면의 20% 넘게 가리면 "픽셀 대조했다"고 말할 수 없다
    boxOffenders.length > 0 ||
    fontOffenders.length > 0 ||
    decoOffenders.length > 0 ||
    structureDelta !== 0 ||
    (worstPixel !== null && worstPixel > GATE.pixel) ||
    (pixelJudged && pixelResults.length === 0) || // 픽셀 판정이 가능한데 한 장도 못 비교했으면 실패
    horizontalOverflow ||
    newConsoleErrors.length > 0 ||
    missing.length > 0;
  if (vpFail) violations++;

  report.push({
    viewport: label,
    pass: !vpFail,
    structureDelta,
    pixelCoveragePct,
    boxOffenders: boxOffenders.sort((a, b) => b.delta - a.delta).slice(0, 15),
    fontOffenders: fontOffenders.slice(0, 10),
    decoOffenders: decoOffenders.slice(0, 15),
    pixel: pixelResults,
    horizontalOverflow,
    consoleErrors: newConsoleErrors.slice(0, 5),
    consoleBaselineMatched: consoleErrors.length - newConsoleErrors.length,
    missingAssets: missing.slice(0, 5),
  });

  console.log(
    `${vpFail ? "FAIL" : "PASS"} ${label}: box초과 ${boxOffenders.length} / font초과 ${fontOffenders.length} / 장식초과 ${decoOffenders.length}` +
      ` / 커버리지 ${pixelCoveragePct}%` +
      (structureDelta !== 0 ? ` / 구조델타 ${structureDelta}` : "") +
      (worstMask > 0 ? ` / 마스크 ${worstMask.toFixed(1)}%${worstMask > MASK_AREA_CAP * 100 ? "(상한 20% 초과)" : ""}` : "") +
      (pixelJudged ? "" : " / ⚠픽셀 미판정") +
      (worstPixel !== null ? ` / pixel최대 ${worstPixel.toFixed(2)}%` : "") +
      (horizontalOverflow ? " / 가로스크롤" : "") +
      (newConsoleErrors.length ? ` / 콘솔오류(신규) ${newConsoleErrors.length}` : "") +
      (consoleErrors.length - newConsoleErrors.length > 0 ? ` / 콘솔오류(원본과 동일) ${consoleErrors.length - newConsoleErrors.length}` : "") +
      (missing.length ? ` / 404 ${missing.length}` : "")
  );
  await context.close();
}

await browser.close();
await mkdir(args.out, { recursive: true });
await writeFile(join(args.out, "report.json"), JSON.stringify({ gate: GATE, report }, null, 2));
console.log(`\n게이트 기준: box ≤${GATE.box}px / font family·weight 정확일치·size ≤${GATE.font}px / 색 ±3·radius·shadow ±1px / pixel ≤${GATE.pixel}% / 구조델타 0 / 콘솔 신규 오류 0`);
if (!pixelJudged) console.log("⚠ 이 런은 픽셀 게이트 미판정입니다 — 보고서에 명시하고 A급으로 선언하지 마세요.");
console.log(violations ? `미달 뷰포트 ${violations}개 — report.json 참조` : "전 뷰포트 통과");
// 미판정 런에 exit 0을 주면 goal("전 라우트 exit 0")이 --no-pixel로 달성된다 — 기계가 읽는 신호로는 통과다.
// 그래서 별도 코드 3으로 내보낸다: 실패는 아니지만 통과도 아니다.
if (!pixelJudged) {
  console.log("⚠ 픽셀 미판정 런 — exit 3(판정 보류). 완료 선언의 근거로 쓸 수 없습니다.");
  exit(violations ? 1 : 3);
}
exit(violations ? 1 : 0);

// ---- 장식 비교 헬퍼 ----
// 색: 캔버스 정규화 RGBA로 비교(±3/채널 — 반투명 un-premultiply 반올림 흡수).
// 정규화 실패 + 표기까지 다르면 불일치로 본다(모르는 것을 통과로 치지 않는다).
function sameColor(a, b, normMap) {
  if ((a ?? "") === (b ?? "")) return true;
  const na = normMap[a], nb = normMap[b];
  if (!na || !nb) return false;
  return na.every((v, i) => Math.abs(v - nb[i]) <= 3);
}
// radius: 단위 패턴(px vs %)이 같을 때만 수치 ±1px. % vs px는 박스가 변하면 다르게 렌더되므로 불일치.
function radiusClose(a, b) {
  if (a === b) return true;
  if (String(a).replace(/-?[\d.]+/g, "#") !== String(b).replace(/-?[\d.]+/g, "#")) return false;
  const na = [...String(a).matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
  const nb = [...String(b).matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
  return na.length === nb.length && na.every((v, i) => Math.abs(v - nb[i]) <= 1);
}
// shadow: 괄호 밖 콤마로 다중 그림자 분리 → 개수·inset·수치(±1px)·색(정규화) 비교.
function splitShadows(s) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of String(s)) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
function shadowColorPart(one) {
  return one.replace(/-?[\d.]+px/g, "").replace(/\binset\b/g, "").replace(/\s+/g, " ").trim();
}
function shadowClose(a, b, normMap) {
  if ((a ?? null) === (b ?? null)) return true;
  if (!a || !b) return false;
  const pa = splitShadows(a), pb = splitShadows(b);
  if (pa.length !== pb.length) return false;
  for (let i = 0; i < pa.length; i++) {
    const na = [...pa[i].matchAll(/-?[\d.]+px/g)].map((m) => parseFloat(m[0]));
    const nb = [...pb[i].matchAll(/-?[\d.]+px/g)].map((m) => parseFloat(m[0]));
    if (na.length !== nb.length || na.some((v, j) => Math.abs(v - nb[j]) > 1)) return false;
    if (/\binset\b/.test(pa[i]) !== /\binset\b/.test(pb[i])) return false;
    if (!sameColor(shadowColorPart(pa[i]), shadowColorPart(pb[i]), normMap)) return false;
  }
  return true;
}

// capture가 저장하는 형식: "<family> <size>px/<line-height> <weight>"  예: "Noto Sans KR 16px/24px 700"
// family에 공백이 있으므로 뒤에서부터 잘라내야 한다.
function parseFont(s) {
  const m = /^(.*?)\s+([\d.]+)px\/(\S+)\s+(\d+)\s*$/.exec(String(s ?? ""));
  if (!m) return { family: String(s ?? ""), size: 0, lh: 0, weight: 0 };
  return { family: m[1].trim(), size: Number(m[2]), lh: parseFloat(m[3]) || 0, weight: Number(m[4]) };
}

async function comparePng(refPath, localPath, outPath, masks = [], shotTop = 0) {
  try {
    const a = PNG.sync.read(await readFile(refPath));
    const b = PNG.sync.read(await readFile(localPath));
    const width = Math.min(a.width, b.width);
    const height = Math.min(a.height, b.height);
    const diff = new PNG({ width, height });
    const crop = (img) => {
      if (img.width === width && img.height === height) return img;
      const c = new PNG({ width, height });
      PNG.bitblt(img, c, 0, 0, width, height, 0, 0);
      return c;
    };
    const ca = crop(a), cb = crop(b);
    // 마스크 영역은 양쪽을 같은 값으로 덮어 비교에서 제외한다(제외지 통과가 아니다 — 면적을 기록한다).
    // 좌표는 기본 "문서 기준"(y = 페이지 최상단부터): 이 창의 시작(shotTop)을 빼서 창 좌표로 환산한다.
    // sticky/fixed 요소(비디오 컨트롤 등)만 {"space":"viewport"}로 화면 고정 좌표를 쓴다.
    let masked = 0;
    for (const m of masks) {
      const my = m.space === "viewport" ? m.y : m.y - shotTop;
      const x0 = Math.max(0, Math.round(m.x)), y0 = Math.max(0, Math.round(my));
      const x1 = Math.min(width, x0 + Math.round(m.w)), y1 = Math.min(height, Math.round(my) + Math.round(m.h));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (width * y + x) << 2;
          ca.data[i] = cb.data[i] = 0; ca.data[i + 1] = cb.data[i + 1] = 0;
          ca.data[i + 2] = cb.data[i + 2] = 0; ca.data[i + 3] = cb.data[i + 3] = 255;
        }
      masked += Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    }
    const mismatch = pixelmatch(ca.data, cb.data, diff.data, width, height, { threshold: 0.1 });
    await writeFile(outPath, PNG.sync.write(diff));
    const maskedPct = (masked / (width * height)) * 100;
    return {
      mismatchPct: (mismatch / (width * height)) * 100,
      maskedPct: Number(maskedPct.toFixed(2)),
      sizeDelta: [a.width - b.width, a.height - b.height],
    };
  } catch (e) {
    console.warn(`  pixel diff 실패: ${e.message.slice(0, 60)}`);
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
