#!/usr/bin/env node
/**
 * AI 티 스캐너 — 브라우저 1회 기동으로 섹션 분할·측정·티 판정·섹션 크롭까지.
 *
 * 렌더 모드:  node detect.mjs --url <URL> --out <dir> [--viewports 1440x900,768x1024,390x844] [--headed]
 * 정적 저하:  node detect.mjs --static --src <dir> --out <dir>     (표면성 서브셋만, 게이트 약함)
 *
 * 산출: <out>/scan.json + <out>/crops/s<i>.png
 * exit 0 성공 / 1 스캔 실패 / 2 실행 불가(playwright 미설치 등)
 */
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { argv, exit } from "node:process";
import {
  RULES, EPS, normText, hasEmoji, parseColor, rgbToHsl, contrast,
  purpleGradient, KOREAN_FONT_RE, DEFAULT_STACK_RE, signatureOf, rowsOf, hashStr,
} from "./rules-lib.mjs";

const args = parseArgs(argv.slice(2));
if (!args.out || (!args.url && !(args.static && args.src))) {
  console.error("usage: detect.mjs --url <URL> --out <dir>  |  detect.mjs --static --src <dir> --out <dir>");
  exit(2);
}
await mkdir(args.out, { recursive: true });

if (args.static) {
  await staticScan();
  exit(0);
}

const { load, missing } = await import("./_deps.mjs");
const pw = await load("playwright");
if (!pw) {
  missing(["playwright"]);
  console.error("dev 서버가 없거나 playwright를 못 쓰면: detect.mjs --static --src <소스디렉토리>");
  exit(2);
}

const viewports = (args.viewports ?? "1440x900,768x1024,390x844").split(",").map((v) => {
  const [w, h] = v.trim().split("x").map(Number);
  return { label: v.trim(), width: w, height: h };
});

const browser = await pw.chromium.launch({ headless: !args.headed });
const context = await browser.newContext({ reducedMotion: "reduce" });
const page = await context.newPage();

const scan = {
  meta: { url: args.url, mode: "render", renderable: true, viewports: viewports.map((v) => v.label), themes: ["light"], scannedAt: new Date().toISOString() },
  desktop: null,
  page: null,
  tells: [],
};

let failed = false;
for (let i = 0; i < viewports.length; i++) {
  const vp = viewports[i];
  const isDesktop = i === 0;
  await page.setViewportSize({ width: vp.width, height: vp.height });
  try {
    await page.goto(args.url, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    console.error(`goto 실패 (${vp.label}): ${e.message}`);
    failed = true;
    continue;
  }
  await page.addStyleTag({ content: `*,*::before,*::after{transition:none!important;scroll-behavior:auto!important}` });
  // 지연 로딩 콘텐츠 확보: 끝까지 훑고 0으로 복귀 후 측정 (측정은 항상 scrollTop 0 = 문서 좌표)
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y <= h; y += window.innerHeight) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);

  const raw = await extract(page);
  const tells = evaluateTells(raw, vp.label, "light", isDesktop);
  mergeTells(tells);

  if (isDesktop) {
    raw.sections.forEach((s) => (s.signature = signatureOf(s)));
    scan.desktop = { viewport: vp.label, sections: raw.sections.map(({ children, containers, textEls, mediaEls, ...keep }, idx) => ({ id: `s${idx}`, ...keep, signature: raw.sections[idx].signature })) };
    scan.page = {
      textBlocks: raw.textBlocks.map(normText).filter(Boolean),
      links: raw.links.map(([t, h]) => [normText(t), h]),
      imagesInformative: raw.images.filter((im) => im.informative).map((im) => im.src),
      imagesDecorative: raw.images.filter((im) => !im.informative).map((im) => im.src),
      bodyFont: raw.bodyFont,
      bodyBg: raw.bodyBg,
      fontSizes: raw.fontSizes,
      koreanPage: raw.koreanPage,
    };
    // 섹션 크롭 — 전후 비교 증빙용
    const cropDir = join(args.out, "crops");
    await mkdir(cropDir, { recursive: true });
    for (let sIdx = 0; sIdx < raw.sections.length; sIdx++) {
      const s = raw.sections[sIdx];
      const clip = { x: Math.max(0, s.left), y: Math.max(0, s.top), width: Math.min(s.width, vp.width), height: Math.min(s.height, 4000) };
      if (clip.width < 2 || clip.height < 2) continue;
      await page.screenshot({ path: join(cropDir, `s${sIdx}.png`), clip }).catch(() => {});
    }
    // 다크 테마 지원 감지 — 지원하면 다크에서도 스캔 (데스크톱만)
    const lightBg = raw.bodyBg;
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (darkBg !== lightBg) {
      scan.meta.themes.push("dark");
      const rawDark = await extract(page);
      mergeTells(evaluateTells(rawDark, vp.label, "dark", true));
    }
    await page.emulateMedia({ colorScheme: "light" });
  }
}
await browser.close();

await writeFile(join(args.out, "scan.json"), JSON.stringify(scan, null, 2));
const reds = scan.tells.filter((t) => t.sev === "red").length;
const yellows = scan.tells.filter((t) => t.sev === "yellow").length;
console.log(`scan 완료: 섹션 ${scan.desktop?.sections.length ?? 0}개 · 티 🔴${reds} 🟡${yellows} (혐의 ${scan.tells.filter((t) => t.judge === "suspect").length}건 — LLM 확정 필요) → ${join(args.out, "scan.json")}`);
exit(failed ? 1 : 0);

// ---------------- 브라우저 내 수집 ----------------

async function extract(p) {
  return p.evaluate((cfg) => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
    };
    const area = (el) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    };
    const ownText = (el) => {
      let t = "";
      for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
      return t.replace(/\s+/g, " ").trim();
    };
    const vh = window.innerHeight, vw = window.innerWidth;
    const docH = document.documentElement.scrollHeight;

    // ---- 섹션 분할 캐스케이드 (rules.md 게이트 기준) ----
    let roots = [];
    const semantic = [...document.querySelectorAll("header,footer,nav,section,article,main")].filter(vis);
    const top = semantic.filter((el) => !semantic.some((o) => o !== el && o.contains(el)));
    let expanded = [];
    for (const el of top) {
      if (el.tagName === "MAIN") expanded.push(...[...el.children].filter(vis));
      else expanded.push(el);
    }
    const cover = expanded.reduce((s, el) => s + el.getBoundingClientRect().height, 0);
    if (expanded.length >= 2 && cover >= cfg.semanticCover * docH) {
      roots = expanded;
    } else {
      let el = document.body;
      for (;;) {
        const kids = [...el.children].filter(vis);
        const big = kids.find((k) => area(k) >= cfg.wrapper * area(el));
        if (big && kids.length <= 3) el = big;
        else break;
      }
      roots = [...el.children].filter(vis);
    }
    roots.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    // 소형 섹션 병합
    const merged = [];
    for (const el of roots) {
      const h = el.getBoundingClientRect().height;
      if (h < cfg.smallSection * vh && merged.length && merged[merged.length - 1].pending) merged[merged.length - 1].members.push(el);
      else if (h < cfg.smallSection * vh) merged.push({ members: [el], pending: true });
      else {
        const prev = merged[merged.length - 1];
        if (prev?.pending) { prev.members.push(el); prev.pending = false; }
        else merged.push({ members: [el], pending: false });
      }
    }
    if (merged.length && merged[merged.length - 1].pending && merged.length > 1)
      merged[merged.length - 2].members.push(...merged.pop().members);

    // ---- 섹션별 측정 ----
    const sections = merged.map((m, idx) => {
      const rects = m.members.map((el) => el.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left)), topY = Math.min(...rects.map((r) => r.top));
      const right = Math.max(...rects.map((r) => r.right)), bottom = Math.max(...rects.map((r) => r.bottom));
      // 컨테이너 수집: 자식 3개 이상인 하위 요소 전부 (깊이 5, 섹션당 15개 상한) — LA1·LA2·DE2 판정용
      const secW = right - left;
      const childInfo = (c) => {
        const r = c.getBoundingClientRect();
        const cs2c = getComputedStyle(c);
        return {
          tag: c.tagName.toLowerCase(), x: r.x, y: r.y, w: r.width, h: r.height,
          skeleton: [...c.children].map((g) => g.tagName.toLowerCase()).join(","),
          textLen: (c.innerText || "").trim().length,
          numText: /^\s*\d[\d,.]*\s*[+%]?/.test((c.innerText || "").trim()),
          surface: cs2c.backgroundColor !== "rgba(0, 0, 0, 0)" || cs2c.boxShadow !== "none",
          // 실미디어(100x100+ 이미지·비디오) 보유 여부 — 아이콘은 미디어로 치지 않는다
          hasMedia: [...c.querySelectorAll("img,video,canvas,picture,svg")].some((mm) => {
            const mr = mm.getBoundingClientRect();
            return mr.width * mr.height >= 10000;
          }),
        };
      };
      const containers = [];
      const walk = (el, depth) => {
        if (depth > 5 || containers.length >= 15) return;
        for (const k of [...el.children].filter(vis)) {
          const kids = [...k.children].filter(vis);
          if (kids.length >= 3) {
            const r = k.getBoundingClientRect();
            containers.push({ w: r.width, depth, children: kids.map(childInfo) });
          }
          walk(k, depth + 1);
        }
      };
      m.members.forEach((el) => walk(el, 0));
      // 시그니처용 레이아웃 컨테이너: 섹션 폭 50% 이상 중 자식이 가장 많은 것 (동률은 얕은 쪽), 없으면 섹션 루트
      const wide = containers.filter((c) => c.w >= 0.5 * secW).sort((a, b) => b.children.length - a.children.length || a.depth - b.depth);
      const children = wide.length ? wide[0].children : m.members.flatMap((el) => [...el.children].filter(vis).map(childInfo));
      const textEls = [], mediaEls = [], textBlocks = [];
      let contentArea = 0;
      const all = m.members.flatMap((el) => [el, ...el.querySelectorAll("*")]);
      for (const el of all) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        const t = ownText(el);
        if (t) {
          textEls.push({ x: r.x, y: r.y, w: r.width, h: r.height });
          textBlocks.push(t);
          contentArea += r.width * r.height;
        }
        const cs = getComputedStyle(el);
        const isMedia =
          ["IMG", "VIDEO", "CANVAS", "PICTURE"].includes(el.tagName) ||
          (el.tagName === "svg" && r.width * r.height >= 0.02 * vw * vh) ||
          (cs.backgroundImage.includes("url(") && r.width * r.height >= 0.05 * vw * vh);
        if (isMedia) {
          mediaEls.push({ x: r.x, y: r.y, w: r.width, h: r.height });
          contentArea += r.width * r.height;
        }
        if (textEls.length + mediaEls.length > 400) break;
      }
      return {
        index: idx, tag: m.members[0].tagName.toLowerCase(),
        left, top: topY, width: right - left, height: bottom - topY,
        children, containers, textEls, mediaEls, textBlocks, contentArea,
      };
    });

    // ---- 페이지 전역 요소 표본 (티 판정용) ----
    const els = [];
    const sectionOf = (el) => {
      for (let i = 0; i < merged.length; i++) if (merged[i].members.some((mm) => mm.contains(el))) return i;
      return -1;
    };
    const effBg = (el) => {
      let cur = el;
      while (cur && cur !== document.documentElement) {
        const c = getComputedStyle(cur).backgroundColor;
        const m2 = /rgba?\([^)]*\)/.exec(c);
        if (m2 && !/,\s*0\)$/.test(c) && c !== "rgba(0, 0, 0, 0)") return c;
        cur = cur.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    for (const el of document.querySelectorAll("body *")) {
      if (els.length >= 1500) break;
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const t = ownText(el);
      const svg = el.tagName === "svg" ? [...el.querySelectorAll("path")].map((pp) => pp.getAttribute("d") || "").join("|").slice(0, 400) : null;
      const bws = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map((v) => parseFloat(v) || 0);
      const bmax = Math.max(...bws);
      els.push({
        bw: bws,
        bwc: bmax >= 2 ? [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor][bws.indexOf(bmax)] : null,
        clipText: (cs.webkitBackgroundClip || cs.backgroundClip || "").includes("text"),
        sized: el.tagName === "IMG" ? el.hasAttribute("width") && el.hasAttribute("height") : null,
        sec: sectionOf(el), tag: el.tagName.toLowerCase(),
        x: r.x, y: r.y, w: r.width, h: r.height,
        fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) || null,
        ls: parseFloat(cs.letterSpacing) || 0, fstyle: cs.fontStyle,
        br: parseFloat(cs.borderRadius) || 0,
        bg: cs.backgroundColor, bgImage: cs.backgroundImage.slice(0, 300),
        color: cs.color, effBg: t ? effBg(el) : null,
        shadow: cs.boxShadow === "none" ? null : cs.boxShadow.slice(0, 160),
        backdrop: (cs.backdropFilter && cs.backdropFilter !== "none") ? cs.backdropFilter : null,
        pos: cs.position, animIter: cs.animationIterationCount, animName: cs.animationName,
        text: t.slice(0, 80), textLen: t.length,
        korean: /[가-힣]/.test(t),
        svgD: svg, alt: el.getAttribute("alt"), aria: el.getAttribute("aria-label"),
        parentText: (el.parentElement?.innerText || "").trim().length,
        hasOwnBg: cs.backgroundColor !== "rgba(0, 0, 0, 0)",
      });
    }

    const links = [...document.querySelectorAll("a[href]")].filter(vis)
      .map((a) => [(a.innerText || "").trim(), a.href]).filter(([t]) => t).slice(0, 400);
    const images = [...document.querySelectorAll("img")].filter(vis).map((im) => {
      const r = im.getBoundingClientRect();
      return {
        src: im.currentSrc || im.src,
        informative: !!(im.alt && im.alt.trim()) || r.width * r.height >= 0.05 * vw * vh,
      };
    });
    // 대형 요소의 배경 이미지도 정보성으로 (히어로 사진이 CSS 배경인 경우)
    for (const el of document.querySelectorAll("body *")) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 0.3 * vh) continue;
      const bgi = getComputedStyle(el).backgroundImage;
      const m3 = /url\("?([^")]+)"?\)/.exec(bgi);
      if (m3) images.push({ src: m3[1], informative: true });
    }

    // 정지 상태에서 안 보이는 텍스트 — reduced-motion 환경에서 스크롤 리빌이 영영 안 풀리는 실버그
    const hiddenText = [];
    for (const el of document.querySelectorAll("body *")) {
      if (hiddenText.length >= 10) break;
      const t2 = ownText(el);
      if (!t2 || t2.length < 8) continue;
      const cs2 = getComputedStyle(el);
      const r2 = el.getBoundingClientRect();
      if ((parseFloat(cs2.opacity) === 0 || cs2.visibility === "hidden") && r2.width > 1 && r2.height > 1 && !el.closest('[aria-hidden="true"]'))
        hiddenText.push(t2.slice(0, 40));
    }
    // 중첩 카드(카드 안의 카드)
    const isCard = (el) => {
      const r3 = el.getBoundingClientRect();
      if (r3.width * r3.height < 20000) return false;
      const c3 = getComputedStyle(el);
      return (parseFloat(c3.borderRadius) || 0) >= 8 && c3.backgroundColor !== "rgba(0, 0, 0, 0)";
    };
    const nestedCards = [];
    let cardScan = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (++cardScan > 2000 || nestedCards.length >= 6) break;
      if (!vis(el) || !isCard(el)) continue;
      let anc = el.parentElement;
      while (anc && anc !== document.body) {
        if (isCard(anc)) { nestedCards.push(sectionOf(el)); break; }
        anc = anc.parentElement;
      }
    }

    const bodyCs = getComputedStyle(document.body);
    // 사용자 눈에 보이는 "페이지 필드" 색 — body가 투명하거나 main이 화면 대부분을 덮으면 main의 배경이 실체다
    let baseBg = bodyCs.backgroundColor;
    const mainEl = document.querySelector("main");
    if (mainEl) {
      const mc = getComputedStyle(mainEl).backgroundColor;
      const mr = mainEl.getBoundingClientRect();
      if (mc !== "rgba(0, 0, 0, 0)" && mr.height >= 0.6 * docH) baseBg = mc;
    }
    const fontSizes = [...new Set(els.filter((e) => e.textLen > 0 && e.fs).map((e) => Math.round(e.fs * 2) / 2))].sort((a, b) => a - b);
    return {
      viewport: { w: vw, h: vh }, sections,
      textBlocks: sections.flatMap((s) => s.textBlocks),
      els, links, images, hiddenText, nestedCards,
      hOverflow: document.documentElement.scrollWidth > vw + 1,
      bodyFont: bodyCs.fontFamily, bodyBg: baseBg,
      fontSizes, koreanPage: /[가-힣]/.test((document.body.innerText || "").slice(0, 4000)),
    };
  }, EPS);
}

// ---------------- 판정 (Node 측 — 룰 ID는 rules-lib·rules.md와 1:1) ----------------

function evaluateTells(raw, viewport, theme, isDesktop) {
  const T = [];
  const add = (rule, sec, evidence) => T.push({ rule, sev: RULES[rule].sev, layer: RULES[rule].layer, judge: RULES[rule].judge === "suspect" ? "suspect" : "det", sec: RULES[rule].scope === "page" ? null : sec, viewport, theme, evidence });
  const { els, sections } = raw;
  const vh = raw.viewport.h, vw = raw.viewport.w;
  const textEls = els.filter((e) => e.textLen > 0);

  // 1. 타이포·스케일
  const sizes = raw.fontSizes;
  if (sizes.length >= 9) add("TS1", null, `폰트 사이즈 고유값 ${sizes.length}개: ${sizes.join(", ")}`);
  else if (sizes.length >= 4) {
    const ratios = sizes.slice(1).map((s, i) => s / sizes[i]);
    const med = [...ratios].sort()[Math.floor(ratios.length / 2)];
    const irregular = ratios.filter((r) => Math.abs(r - med) / med > 0.05).length;
    if (irregular >= 3) add("TS2", null, `스케일 인접비 불규칙 ${irregular}쌍 (사이즈: ${sizes.join(", ")})`);
  }
  const fams = raw.bodyFont.split(",").map((f) => f.replace(/["']/g, "").trim());
  if (!fams.some((f) => !DEFAULT_STACK_RE.test(f))) add("TS3", null, `본문 스택이 기본값뿐: ${raw.bodyFont.slice(0, 80)}`);

  // 2. 색·테마
  const gradEls = els.filter((e) => e.bgImage.includes("gradient") && e.w * e.h >= 0.01 * vw * vh);
  for (const sec of new Set(gradEls.filter((e) => purpleGradient(e.bgImage)).map((e) => e.sec)))
    add("CO1", sec, "hue 240–290 보라 그라데이션 배경");
  if (gradEls.length >= 3) add("CO2", null, `그라데이션 배경 ${gradEls.length}곳`);
  for (const s of sections) {
    const body = textEls.filter((e) => e.sec === s.index && e.fs <= 20 && e.textLen >= 40 && e.effBg);
    if (body.length < 2) continue;
    const cons = body.map((e) => {
      const c1 = parseColor(e.color), c2 = parseColor(e.effBg);
      return c1 && c2 ? contrast(c1, c2) : null;
    }).filter(Boolean).sort((a, b) => a - b);
    if (cons.length >= 2 && cons[Math.floor(cons.length / 2)] < 4.5)
      add("CO3", s.index, `본문 대비 중앙값 ${cons[Math.floor(cons.length / 2)].toFixed(2)}:1 < 4.5:1${theme === "dark" ? " (다크)" : ""}`);
  }
  const glow = els.filter((e) => {
    if (!e.shadow) return false;
    const c = parseColor(e.shadow);
    if (!c) return false;
    const { s } = rgbToHsl(c);
    const px = e.shadow.match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
    return s > 0.3 && (px[2] ?? 0) >= 24;
  });
  if (glow.length >= 3) add("CO4", null, `컬러 글로우 섀도 ${glow.length}곳`);

  // 3·6. 레이아웃 골격 + 밀도 (섹션 단위 — 밀도는 데스크톱 기준만, 모바일은 스택 오판)
  const ratios = sections.map((s) => s.contentArea / Math.max(1, s.width * s.height));
  const medRatio = [...ratios].sort()[Math.floor(ratios.length / 2)] || 0;
  const sideBySide = (g) => rowsOf(g).some((n) => n >= 2); // 가로 나열/그리드만 카드 티 — 세로 목록은 정상
  for (const s of sections) {
    if (["header", "footer", "nav"].includes(s.tag)) continue;
    const pools = [...(s.containers ?? []).map((c) => c.children), s.children];
    for (const pool of pools) {
      const cards = pool.filter((c) => c.h >= 80);
      const groups = {};
      for (const c of cards) {
        const k = `${Math.round(c.w / EPS.size)}x${Math.round(c.h / EPS.size)}|${c.skeleton}`;
        (groups[k] = groups[k] ?? []).push(c);
      }
      // 실미디어가 들어찬 카드 나열은 티가 아니다(레퍼런스 검증: 빈 카드가 죄) — 과반이 미디어 없을 때만
      // 카드(서피스) 나열만 티다 — 배경·그림자 없는 텍스트 칼럼(신문 칼럼)은 정당한 에디토리얼
      const uni = Object.values(groups).find((g) => g.length >= 3 && sideBySide(g) && g.filter((c) => !c.hasMedia).length > g.length / 2 && g.filter((c) => c.surface).length > g.length / 2);
      if (uni) {
        add("LA1", s.index, `동일 크기·동일 골격 형제 카드 ${uni.length}개 가로 나열, 실미디어 없음 (${Math.round(uni[0].w)}x${Math.round(uni[0].h)})`);
        if (isDesktop) {
          const thin = uni.filter((c) => c.textLen <= 60 && c.h >= 150);
          if (thin.length > uni.length / 2) add("DE2", s.index, `카드 ${uni.length}개 중 ${thin.length}개가 저밀도(텍스트 ≤60자, 높이 ≥150px)`);
        }
      }
      const nums = pool.filter((c) => c.numText && c.textLen <= 40);
      if (nums.length >= 3 && nums.length <= 4 && sideBySide(nums)) add("LA2", s.index, `숫자 지배 형제 ${nums.length}개 가로 나열(통계 배너)`);
    }
    const r = s.contentArea / Math.max(1, s.width * s.height);
    if (isDesktop && medRatio > 0 && r < 0.5 * medRatio && s.height > 0.6 * vh && s.mediaEls.length === 0)
      add("DE1", s.index, `콘텐츠 면적비 ${(r * 100).toFixed(1)}% < 페이지 중앙값(${(medRatio * 100).toFixed(1)}%)의 절반 ∧ 높이 ${Math.round((s.height / vh) * 100)}vh ∧ 미디어 없음`);
  }
  const rounded = els.filter((e) => e.br >= 12 && (e.hasOwnBg || e.shadow));
  if (rounded.length >= 8) {
    const byVal = {};
    for (const e of rounded) byVal[Math.round(e.br)] = (byVal[Math.round(e.br)] ?? 0) + 1;
    const [topVal, topCnt] = Object.entries(byVal).sort((a, b) => b[1] - a[1])[0];
    if (topCnt / rounded.length >= 0.9) add("LA3", null, `radius ${topVal}px가 라운드 요소 ${rounded.length}개 중 ${topCnt}개 지배`);
  }

  // 4. 컴포넌트 클리셰
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (!["h1", "h2"].includes(e.tag)) continue;
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const p = els[j];
      if (p.sec !== e.sec || e.y - (p.y + p.h) > 120 || e.y < p.y) continue;
      if (p.h <= 48 && p.w <= 320 && p.textLen >= 1 && p.textLen <= 20 && p.br >= p.h / 2 && p.hasOwnBg) {
        add("CP1", e.sec, `필 뱃지 "${p.text}"가 ${e.tag.toUpperCase()} 바로 위`);
        break;
      }
    }
  }
  const numBadges = els.filter((e) => /^0?\d{1,2}$/.test(e.text) && e.w <= 80 && e.h <= 80 && e.hasOwnBg && e.br >= 4);
  if (numBadges.length >= 2)
    for (const sec of new Set(numBadges.map((e) => e.sec))) add("CP2", sec, `번호 뱃지(${numBadges.filter((e) => e.sec === sec).map((e) => `"${e.text}"`).join(",")}) 카드 패턴`);
  const glass = els.filter((e) => e.backdrop?.includes("blur") && (parseColor(e.bg)?.a ?? 1) < 0.9);
  if (glass.length >= 3) add("CP3", null, `글래스모피즘 ${glass.length}곳`);

  // 5. 장식·아이콘
  const svgGroups = {};
  for (const e of els.filter((e) => e.svgD)) {
    const k = `${e.sec}|${hashStr(e.svgD)}`;
    (svgGroups[k] = svgGroups[k] ?? []).push(e);
  }
  for (const g of Object.values(svgGroups))
    if (g.length >= 3) add("IC1", g[0].sec, `동일 SVG 글리프 ${g.length}회 반복(그리드 장식 혐의)`);
  const emojiIcons = els.filter((e) => ["li", "a", "button", "h1", "h2", "h3", "span", "div"].includes(e.tag) && e.textLen <= 40 && hasEmoji(e.text));
  if (emojiIcons.length >= 2)
    for (const sec of new Set(emojiIcons.map((e) => e.sec))) add("IC2", sec, `이모지 아이콘 ${emojiIcons.filter((e) => e.sec === sec).length}곳`);
  const mute = els.filter((e) => (e.tag === "svg" || e.tag === "img") && !e.alt && !e.aria && e.parentText === 0 && e.w <= 64);
  if (mute.length >= 3) for (const sec of new Set(mute.map((e) => e.sec))) add("IC3", sec, `텍스트·aria 없는 아이콘 ${mute.filter((e) => e.sec === sec).length}개`);
  const blobs = els.filter((e) => e.pos === "absolute" && e.textLen === 0 && Math.min(e.w, e.h) >= 80 && e.br >= Math.min(e.w, e.h) / 2 && (e.hasOwnBg || e.bgImage.includes("gradient")));
  for (const sec of new Set(blobs.map((e) => e.sec))) add("IC4", sec, `장식 블롭(absolute 원형) ${blobs.filter((e) => e.sec === sec).length}개`);

  // 4b. 사이드 액센트 보더 — 한 변만 2px+ 유채색(가장 알아보기 쉬운 AI 티 중 하나)
  const sideAccent = els.filter((e) => {
    if (!e.bw || !e.bwc) return false;
    if (!e.hasOwnBg && !e.shadow) return false; // 티의 본질은 "서피스에 붙은 스트라이프" — 구획용 괘선·타임라인 스파인은 무죄
    const mx = Math.max(...e.bw);
    const rest = e.bw.filter((v) => v !== mx);
    if (mx < 2 || mx < 2 * Math.max(...rest, 0.01)) return false;
    const c = parseColor(e.bwc);
    return c && c.a > 0.2 && rgbToHsl(c).s > 0.3 && e.w * e.h > 2000;
  });
  for (const sec of new Set(sideAccent.map((e) => e.sec)))
    add("BD1", sec, `유채색 사이드 액센트 보더 ${sideAccent.filter((x) => x.sec === sec).length}곳`);

  // 2b. 그라데이션 텍스트
  const gradText = els.filter((e) => e.clipText && e.bgImage.includes("gradient"));
  for (const sec of new Set(gradText.map((e) => e.sec))) add("CO5", sec, "그라데이션 텍스트(background-clip)");

  // 3b. 중첩 카드
  for (const sec of new Set(raw.nestedCards ?? [])) add("LA4", sec, "카드 안의 카드(중첩 라운드 서피스)");

  // 9. 품질 바닥 (QF) — 미학 이전의 하한선
  if (raw.hOverflow) add("QF1", null, `가로 오버플로 발생 (${viewport})`);
  if ((raw.hiddenText ?? []).length)
    add("QF2", null, `정지 상태에서 안 보이는 텍스트 ${raw.hiddenText.length}건 (예: "${raw.hiddenText[0]}") — 스크롤 리빌 미발화 의심`);
  if (isDesktop) {
    const longLines = textEls.filter((e) => e.textLen >= 80 && (e.korean ? e.w / e.fs > 42 : e.w / (e.fs * 0.52) > 95));
    if (longLines.length >= 2) add("QF3", null, `본문 행폭 과대 ${longLines.length}곳 (가독 한계 초과)`);
  }
  const floorMiss = textEls.filter((e) => !e.korean && e.textLen >= 40 && (e.fs < 12 || (e.lh && e.lh / e.fs < 1.3)));
  if (floorMiss.length >= 3) add("QF4", null, `본문 타이포 하한 미달 ${floorMiss.length}곳 (12px 미만 또는 행간 1.3 미만)`);
  if (raw.viewport.w <= 480) {
    const smallTap = els.filter((e) => (["button", "input", "select"].includes(e.tag) || (e.tag === "a" && e.hasOwnBg)) && (e.w < 44 || e.h < 44) && e.w > 2 && e.h > 2);
    if (smallTap.length >= 3) add("QF5", null, `44px 미만 탭 타깃 ${smallTap.length}개 (모바일)`);
  }
  const unsized = els.filter((e) => e.tag === "img" && e.sized === false);
  if (unsized.length >= 2) add("QF6", null, `width/height 미지정 이미지 ${unsized.length}개 (CLS 위험)`);

  // 6b. 자산 빈곤 — 같은 이미지를 돌려쓰는 것은 "채울 자산이 없다"는 신호
  const assetKey = (src) => {
    // 이미지 최적화 프록시(/_next/image?url=… 등)는 원본 url 파라미터가 실체다
    try {
      const u = new URL(src, "http://x");
      const inner = u.searchParams.get("url") || u.searchParams.get("src");
      return decodeURIComponent(inner || u.pathname).split("?")[0].split("/").pop();
    } catch {
      return String(src).split("?")[0].split("/").pop();
    }
  };
  const srcCount = {};
  for (const im of raw.images) {
    const k = assetKey(im.src);
    if (k) srcCount[k] = (srcCount[k] ?? 0) + 1;
  }
  const reused = Object.entries(srcCount).filter(([, n]) => n >= 3);
  if (reused.length) add("AS1", null, `동일 이미지 재사용: ${reused.map(([k, n]) => `${k}×${n}`).slice(0, 3).join(", ")}`);
  const placeholders = raw.images.filter((im) => /dicebear|pravatar|boringavatars|placehold|placekitten|via\.placeholder/i.test(String(im.src)));
  if (placeholders.length) add("AS2", null, `플레이스홀더 자산 ${placeholders.length}개 — "진짜가 아직 없다"는 신호`);
  const arrows = els.filter((e) => ["a", "button", "h1", "h2", "h3"].includes(e.tag) && /[→←↑↓➔➜]/.test(e.text));
  if (arrows.length >= 2) add("IC5", null, `텍스트에 박은 화살표 글리프 ${arrows.length}곳 (예: "${arrows[0].text.slice(0, 24)}")`);

  // 7. 모션
  const loops = els.filter((e) => e.animIter?.includes("infinite") && e.animName && e.animName !== "none");
  if (loops.length) add("MO1", null, `infinite 애니메이션 ${loops.length}곳 (${[...new Set(loops.map((e) => e.animName))].slice(0, 3).join(", ")})`);

  // 8. 한글 타이포
  if (raw.koreanPage) {
    const ko = textEls.filter((e) => e.korean && e.fs <= 20 && e.lh);
    const lhs = ko.map((e) => e.lh / e.fs).sort((a, b) => a - b);
    if (lhs.length >= 3 && lhs[Math.floor(lhs.length / 2)] < 1.5) add("KO1", null, `한글 본문 행간 중앙값 ${lhs[Math.floor(lhs.length / 2)].toFixed(2)} < 1.5`);
    const italic = textEls.filter((e) => e.korean && e.fstyle === "italic");
    if (italic.length) add("KO2", null, `한글 이탤릭 ${italic.length}곳`);
    const spaced = ko.filter((e) => e.ls > 0);
    if (spaced.length >= 3) add("KO3", null, `한글 본문 양수 자간 ${spaced.length}곳`);
    if (!KOREAN_FONT_RE.test(raw.bodyFont)) add("KO4", null, `한글 페이지인데 스택에 한글 폰트 없음: ${raw.bodyFont.slice(0, 60)}`);
  }

  // 같은 룰+섹션은 1건만
  const seen = new Set();
  return T.filter((t) => {
    const k = `${t.rule}|${t.sec}|${t.theme}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mergeTells(tells) {
  for (const t of tells) {
    if (!scan.tells.some((o) => o.rule === t.rule && o.sec === t.sec && o.theme === t.theme)) scan.tells.push(t);
  }
}

// ---------------- 정적 저하 모드 (렌더 불가 폴백 — 표면성 서브셋만) ----------------

async function staticScan() {
  const exts = new Set([".html", ".htm", ".css", ".scss", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".js", ".ts", ".mdx"]);
  const skip = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "out", "coverage", "_design"]);
  const files = [];
  await (async function walk(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (skip.has(ent.name) || ent.name.startsWith(".")) continue;
      const p = join(dir, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (exts.has(extname(ent.name)) && files.length < 800) files.push(p);
    }
  })(args.src);

  const tells = [];
  const add = (rule, evidence) => {
    if (!tells.some((t) => t.rule === rule)) tells.push({ rule, sev: RULES[rule].sev, layer: RULES[rule].layer, judge: "det", sec: null, viewport: "static", theme: null, evidence });
  };
  const PURPLE_TW = /\b(?:from|via|to|bg|text)-(?:purple|violet|indigo|fuchsia)-\d{3}\b/;
  const PURPLE_HEX = /#(?:7c3aed|8b5cf6|a855f7|6d28d9|9333ea|4f46e5|6366f1)/i;
  const hits = {};
  for (const f of files) {
    const src = await readFile(f, "utf8").catch(() => "");
    if (!src) continue;
    const rel = f.slice(args.src.length + 1);
    if (/font-family[^;]*\b(inter|roboto)\b/i.test(src) || /["']Inter["']/.test(src)) (hits.TS3 ??= []).push(rel);
    if ((PURPLE_TW.test(src) && /bg-gradient-to-/.test(src)) || (PURPLE_HEX.test(src) && /gradient/i.test(src))) (hits.CO1 ??= []).push(rel);
    if (/backdrop-blur|backdrop-filter/.test(src)) (hits.CP3 ??= []).push(rel);
    if (/animate-(?:pulse|bounce|ping)|animation[^;]*infinite/.test(src)) (hits.MO1 ??= []).push(rel);
    if (/rounded-(?:2xl|3xl)[^"']*shadow-(?:lg|xl)|shadow-(?:lg|xl)[^"']*rounded-(?:2xl|3xl)/.test(src)) (hits.LA3 ??= []).push(rel);
    const emojiLine = src.split("\n").find((l) => hasEmoji(l) && !/^\s*(\/\/|\/\*|\*|#|<!--)/.test(l));
    if (emojiLine) (hits.IC2 ??= []).push(rel);
    if (/[→➔➜]/.test(src) && /button|href|<a\s/i.test(src)) (hits.IC5 ??= []).push(rel);
    if (/dicebear|pravatar|boringavatars|placehold|placekitten/i.test(src)) (hits.AS2 ??= []).push(rel);
    if (/--radius:\s*0\.5rem/.test(src)) (hits.LA3 ??= []).push(rel);
  }
  for (const [rule, fs] of Object.entries(hits)) add(rule, `${fs.length}개 파일: ${fs.slice(0, 4).join(", ")}${fs.length > 4 ? " …" : ""}`);

  const out = {
    meta: { src: args.src, mode: "static", renderable: false, weakGate: true, scannedAt: new Date().toISOString(), filesScanned: files.length },
    desktop: null, page: null, tells,
  };
  await writeFile(join(args.out, "scan.json"), JSON.stringify(out, null, 2));
  console.log(`정적 스캔 완료(게이트 약함): 파일 ${files.length}개 · 티 ${tells.length}건 — 구조성 티·밀도·시그니처는 렌더 모드에서만 잡힌다`);
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
