/**
 * alive.mjs — "이 페이지가 실제로 살아 있는가" 검사
 *
 * usage: alive.mjs --url <URL> [--type catalog|tool|pricing|form|dashboard|landing]
 *                  [--src <dir>] [--out <dir>]
 *                  [--viewports 1440x900,390x844] [--expect-status <n>]
 *
 * 왜 있나: 실전 사고 — 요금제 페이지가 런타임 에러로 죽어 있었고(plan.highlights undefined),
 * 그 전에는 CSS가 `.planLedger/.planRow`를 정의하는데 컴포넌트는 `.planGrid/.planCard`를 써서
 * 레이아웃이 통째로 안 먹었다(겹치는 클래스 8개뿐). 둘 다 **한 번 열어보기만 했어도** 잡혔다.
 * 접근성 감사가 아니다. 페이지가 렌더되고, 콘솔이 조용하고, 스타일이 실제로 붙었는지만 본다.
 *
 * 검사:
 *   1) HTTP 상태·렌더 결과(에러 오버레이·빈 화면). --expect-status로 에러 페이지(404 등)도 검사 가능
 *   2) 콘솔 에러·페이지 예외
 *   3) CSS 모듈 클래스 불일치 — 컴포넌트가 쓰는 styles.X 중 CSS에 없는 것(--src 지정 시)
 *   4) 스타일 미적용 혐의 — 컨테이너 좌우 여백 0, 요소가 뷰포트 좌단에 붙음
 *   5) 상태 화면 존재 — 빈 상태·로딩·오류 문구가 소스에 있는가(--src 지정 시, 제품 화면용)
 *   6) **유형별 필수 구조** — 카탈로그인데 카드 그리드가 없거나, 도구 화면인데 입력이 없으면 실패.
 *      실전 사고: /product를 만들라 했더니 또 설득형 랜딩이 나왔다(히어로+CTA+후기).
 *      **알 수 없는 --type은 exit 2** — 오타가 "✅ 통과"로 초록 도장을 찍는 것이 최악의 상태다.
 *
 * 판정 원칙(요금제): 기계는 **존재·개수만** 판정한다. 다음은 기계로 판정하지 않는다(오탐 소지 —
 * 초록 도장이 거짓 확신을 만든다): 세금 포함 여부의 사실 판정 / DMCCA "동등한 시각 비중" /
 * 로케일 자동 판별 / §17602 "동의 지점 바로 옆"의 거리 판정 / 플랜 수 적정성 / 차별 속성 개수.
 * 대상 시장(로케일)은 P0 계약에서 사람이 선언한다. 법 관련 룰은 전부 🟡이고 문구에
 * "존재만 확인" 을 명시한다 — 통과가 적법을 뜻하지 않는다.
 *
 * 카드 판정: 크기 버킷(20px 격자)이 아니라 **형제 시그니처** — 같은 부모의 자식을 태그+1뎁스
 * 골격으로 묶고 페이지 전체 합산(§7 "그룹 소제목마다 카드 몇 개" 분산 카탈로그 대응). 크기
 * 상한이 없어 행(list-row) 카탈로그도 잡고, 설명 길이 차이로 높이가 갈라져도 쪼개지지 않는다.
 * 빈 상자 검출(HOLLOW-CARDS)은 forge detect.mjs의 inkBox와 같은 계측(텍스트 노드 Range 구간
 * 합) — rules-lib가 inkBox를 export하면 그 소스를 주입해 쓴다(단일 소스). 그때까지는 내장 동일본.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { argv, exit } from "node:process";
import { load } from "./_deps.mjs";

const TYPES = ["landing", "catalog", "tool", "pricing", "form", "dashboard"];
const args = parseArgs(argv.slice(2));
if (!args.url) { console.error("usage: alive.mjs --url <URL> [--type " + TYPES.join("|") + "] [--src <dir>] [--out <dir>] [--viewports 1440x900,390x844] [--expect-status <n>]"); exit(2); }
if (args.type && !TYPES.includes(args.type)) {
  console.error(`알 수 없는 유형 "${args.type}" — 허용: ${TYPES.join("|")}. 오타면 고치고, 새 유형이면 page-rules §0b에 먼저 등재하라.`);
  exit(2);
}
const expectStatus = args["expect-status"] ? parseInt(args["expect-status"], 10) : null;
const viewports = (args.viewports ?? "1440x900").split(",").map((v) => {
  const [w, h] = v.trim().split("x").map(Number);
  if (!w || !h) { console.error(`--viewports 형식 오류: "${v}" (예: 1440x900,390x844)`); exit(2); }
  return { width: w, height: h };
});
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

// forge rules-lib가 inkBox를 export하면 그 소스를 페이지에 주입해 쓴다(계측 단일 소스).
// 아직 추출 전이면 null — 프로브의 내장 동일본(detect.mjs 이식)이 쓰인다.
async function loadInkSrc() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const rl = await import(pathToFileURL(join(here, "..", "..", "sg-landing-forge", "scripts", "rules-lib.mjs")).href);
    if (typeof rl.inkBox === "function") return rl.inkBox.toString();
  } catch { /* forge 미설치 — 내장본으로 */ }
  return null;
}
const inkSrcShared = await loadInkSrc();

// ── 1·2·4·6) 실제 렌더 검사 ──────────────────────────────────────────────
const pw = await load("playwright");
if (!pw) { console.error("playwright 미설치"); exit(2); }
const browser = await pw.chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: viewports[0] })).newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e.message).slice(0, 160)));

for (let vi = 0; vi < viewports.length; vi++) {
  const vp = viewports[vi];
  const isFirst = vi === 0;
  const at = isFirst ? "" : ` @${vp.width}x${vp.height}`;
  await page.setViewportSize(vp);
  // networkidle은 폴링·소켓이 있는 실사이트에서 영원히 안 온다 — 실패 시 domcontentloaded로 재시도
  let res = await page.goto(args.url, { waitUntil: "networkidle", timeout: 20000 }).catch(() => null);
  if (!res) res = await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => ({ status: () => -1, err: e }));
  const status = res?.status?.() ?? -1;
  if (isFirst) {
    if (expectStatus != null) { if (status !== expectStatus) add("red", "HTTP", `HTTP ${status} (기대: ${expectStatus})`); }
    else if (status >= 400 || status < 0) add("red", "HTTP", `HTTP ${status}`);
  }
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(({ inkSrc }) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width >= 2 && r.height >= 2; };
    const chromeless = (el) => !el.closest("header, nav, footer, [role=banner], [role=navigation]");
    const inFixed = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === "fixed" || p === "sticky") return true;
      }
      return false;
    };
    // 잉크 계측 — forge detect.mjs inkBox 이식(텍스트 노드 Range 렌더 rect 구간 병합 합산).
    // 요소 rect로 재면 패딩까지 잉크가 되고, 위·아래 한 줄씩만 있어도 스팬이 꽉 찬다.
    const inkLocal = (c) => {
      const runs = [];
      let n = 0;
      const walk = (node) => {
        if (++n > 600) return;
        for (const nd of node.childNodes) {
          if (nd.nodeType === 3) {
            if (!nd.textContent.trim()) continue;
            const rg = document.createRange();
            rg.selectNodeContents(nd);
            const rr = rg.getBoundingClientRect();
            if (rr.height > 0) runs.push([rr.top, rr.bottom]);
            continue;
          }
          if (nd.nodeType !== 1 || !vis(nd)) continue;
          const nr = nd.getBoundingClientRect();
          if (["IMG", "VIDEO", "CANVAS", "PICTURE", "SVG"].includes(nd.tagName.toUpperCase()) && nr.width * nr.height >= 256) { runs.push([nr.top, nr.bottom]); continue; }
          walk(nd);
        }
      };
      walk(c);
      if (!runs.length) return 0;
      runs.sort((a, b) => a[0] - b[0]);
      let sum = 0, [s, e] = runs[0];
      for (let i = 1; i < runs.length; i++) {
        if (runs[i][0] <= e) e = Math.max(e, runs[i][1]);
        else { sum += e - s; [s, e] = runs[i]; }
      }
      return sum + e - s;
    };
    let inkShared = null;
    if (inkSrc) { try { inkShared = new Function("return (" + inkSrc + ")")(); } catch { inkShared = null; } } // CSP가 막으면 내장본
    const ink = (el) => {
      try { const r = (inkShared ?? inkLocal)(el); return typeof r === "number" ? r : (r?.inkH ?? 0); }
      catch { return inkLocal(el); }
    };

    const txt = document.body.innerText.replace(/\s+/g, " ").trim();
    // 본문 텍스트(헤더·내비·푸터 제외) — 표류·요금제 단어 검사는 이것만 본다.
    // 실측 사고: 내비·푸터의 "요금제" 링크만으로 사이트 전 페이지가 priceish가 됐다.
    let mainText = "";
    {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const nd = w.currentNode;
        if (!nd.textContent.trim()) continue;
        const el = nd.parentElement;
        if (el && chromeless(el)) mainText += " " + nd.textContent;
      }
      mainText = mainText.replace(/\s+/g, " ");
    }
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

    // ── 반복 항목: 형제 시그니처 그룹화 ──────────────────────────────────
    // 시그니처 = 태그 + 1뎁스 자식 태그 시퀀스. 단일 래퍼(a·div·li) 1겹은 벗기고 계산해
    // 활성(<a>)/비활성(<div>) 카드의 래퍼 차이를 흡수한다. 같은 시그니처는 페이지 전체 합산.
    // 뷰포트보다 큰 박스는 섹션이지 고를 항목이 아니므로 제외(크기 상한은 이것뿐 — 행 레이아웃 허용).
    const vh = window.innerHeight;
    const sigOf = (el) => {
      let core = el;
      const kids = [...core.children].filter(vis);
      if (kids.length === 1 && ["a", "div", "li", "article"].includes(core.tagName.toLowerCase())) core = kids[0];
      return core.tagName.toLowerCase() + "[" + [...core.children].map((c) => c.tagName.toLowerCase()).join(",") + "]";
    };
    const groupsMap = new Map();
    const registered = new Set();
    for (const p of document.querySelectorAll("main, main *, section, section *, body > div, body > div *")) {
      if (!chromeless(p)) continue;
      const kids = [...p.children].filter(vis)
        .flatMap((k) => getComputedStyle(k).display === "contents" ? [...k.children].filter(vis) : [k]); // display:contents는 층이 아니다
      if (kids.length < 3) continue;
      for (const k of kids) {
        if (registered.has(k)) continue;
        registered.add(k);
        const r = k.getBoundingClientRect();
        if (r.width < 120 || r.height < 40 || r.height > vh) continue;
        const key = sigOf(k);
        if (!groupsMap.has(key)) groupsMap.set(key, []);
        groupsMap.get(key).push(k);
      }
    }
    const gStats = [...groupsMap.values()].filter((g) => g.length >= 2).map((g) => {
      const withAction = g.filter((el) => el.querySelector("a,button,[role=button]") || el.closest("a")).length;
      const inkN = Math.min(g.length, 30); // 잉크 계측 상한 — 비용 가드
      const inkZero = g.slice(0, 30).filter((el) => ink(el) < 1).length;
      const ys = g.filter((el) => !inFixed(el)).map((el) => el.getBoundingClientRect())
        .filter((r) => r.width >= 40 && r.height >= 16).map((r) => Math.round(r.top));
      return { n: g.length, withAction, inkZero, inkN, topY: ys.length ? Math.min(...ys) : null };
    });
    const eligible = gStats.filter((s) => s.n >= 4);
    const solid = eligible.filter((s) => s.inkZero <= s.inkN / 2);
    // 카드 그룹 선택: 잉크 있는 그룹 우선 → 진입 액션 커버 ≥80% 우선 → 크기순
    const best = (solid.length ? solid : eligible).slice()
      .sort((a, b) => ((b.withAction >= b.n * 0.8) - (a.withAction >= a.n * 0.8)) || (b.n - a.n))[0] ?? null;
    const hollowCards = eligible.length > 0 && solid.length === 0;
    const repeat2 = gStats.some((s) => s.n >= 2 && s.inkZero <= s.inkN / 2);
    const maxGroup = gStats.reduce((m, s) => Math.max(m, s.n), 0);

    // 도구 입력: 텍스트 입력은 **보이는 것만**(hidden csrf 하나로 도구가 통과하던 구멍).
    // 파일 업로드·캔버스는 비가시 허용 — 스타일드 드롭존이 <input type=file>을 숨기는 게 표준 패턴.
    const visibleTextInputs = [...document.querySelectorAll("input,textarea,select")].filter((el) => {
      const ty = (el.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "file", "submit", "button", "image", "reset"].includes(ty)) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 40 && r.height >= 16;
    }).length;
    const toolInputs = document.querySelectorAll('canvas,input[type=file],[contenteditable="true"]').length + visibleTextInputs;
    // 폼 판정은 "사람이 값을 적는 보이는 필드"만 센다 — canvas·hidden·검색창을 필드로 세면 랜딩이 폼으로 통과한다
    const formFields = [...document.querySelectorAll("input,textarea,select")].filter((el) => {
      const ty = (el.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(ty)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 16) return false;
      const id = el.id;
      return Boolean(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.closest("label") ||
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)));
    }).length;
    const inForm = document.querySelectorAll("form").length;
    const actionButtons = document.querySelectorAll("button,[role=button],input[type=submit]").length;
    // 이 페이지의 "일"이 첫 화면에 있는가 — 측정 시점은 scrollY 0이라 top이 곧 문서 좌표다.
    // 고정(fixed/sticky) 요소는 후보에서 제외 — 챗위젯 입력창이 "일"로 잡히면
    // 진짜 일이 폴드 두 화면 아래 있어도 통과한다(실측 사고).
    const topOf = (els) => {
      const ys = els.filter((el) => chromeless(el) && !inFixed(el)).map((el) => el.getBoundingClientRect())
        .filter((r) => r.width >= 40 && r.height >= 16).map((r) => Math.round(r.top));
      return ys.length ? Math.min(...ys) : null;
    };
    const firstInputY = topOf([...document.querySelectorAll('input:not([type=hidden]),textarea,select,canvas,[contenteditable="true"]')]);
    const firstCardY = best ? best.topY : null;

    // ── 랜딩 표류: 단어 매칭이 아니라 **섹션 실체**로 판정 ────────────────
    // 내비의 "요금제" 링크, 본문의 "요금제 보기 →" 한 줄 링크로는 발동하지 않는다.
    const bq = [...document.querySelectorAll("blockquote")].filter((el) => chromeless(el)).length;
    const testiClassBlock = [...document.querySelectorAll('[class*="testimonial" i],[class*="review" i]')]
      .filter((el) => chromeless(el) && el.getBoundingClientRect().height >= 120).length;
    const headTesti = [...document.querySelectorAll("h2,h3")]
      .filter((el) => chromeless(el) && /후기|고객\s*사례|testimonial|reviews?\b|what\s+\w+\s+(are\s+)?saying/i.test(el.innerText || "")).length;
    const testimonial = bq >= 2 || testiClassBlock > 0 || headTesti > 0;
    // 가격 실체 = 숫자+주기가 붙은 구독 피치("월 9,900원"·"$12/mo") 또는 가격 섹션 헤딩.
    // 항목별 단가만 있는 커머스 카탈로그("9,900원")는 주기 표기가 없어 걸리지 않는다.
    const PRICE_PERIOD_RE = /(?:₩|\$|€|£)\s?[\d.,]+\s*\/\s*(?:mo\b|month|월|년|yr\b|year)|[\d,]+\s*원\s*\/\s*월|월\s*[\d,]+\s*원|[\d.,]+\s*(?:\/|per\s+)(?:mo\b|month)/i;
    const headPrice = [...document.querySelectorAll("h2,h3")]
      .filter((el) => chromeless(el) && /요금제|가격\s*안내|pricing|\bplans\b/i.test(el.innerText || "")).length;
    const priceish = headPrice > 0 || PRICE_PERIOD_RE.test(mainText);

    // ── 요금제 데이터 수집 — 존재·개수만. 적법성 판정이 아니다(파일 상단 원칙) ──
    const PRICE_RE = /(?:₩|\$|€|£)\s?\d[\d.,]*|\d{1,3}(?:,\d{3})+\s*원|\b\d+\s*(?:만|천)\s*원/;
    const PERIOD_NEAR_RE = /\/\s*(?:mo\b|month|월|년|year)|per\s+month|월간|연간|매월|매년|monthly|yearly|annual/i;
    const FREE_RE = /무료|\bfree\b|\b0\s*원|₩\s*0\b/i;
    const priceEls = [...document.querySelectorAll("main *, section *, body > div *")].filter((el) => {
      if (!chromeless(el)) return false;
      const t = (el.innerText || "").trim();
      if (!t || t.length > 400 || !PRICE_RE.test(t)) return false;
      return ![...el.children].some((c) => PRICE_RE.test(c.innerText || "")); // 최심 요소만
    });
    let priceNoPeriod = 0;
    for (const el of priceEls) {
      if (FREE_RE.test(el.innerText || "")) continue;
      let scope = el;
      for (let i = 0; i < 2 && scope.parentElement; i++) scope = scope.parentElement;
      if (!PERIOD_NEAR_RE.test((scope.innerText || "").slice(0, 300))) priceNoPeriod++;
    }
    // 플랜 카드: 가격을 품은 키 큰(≥200px) 가지를 가장 많이 거느린 부모의 가지들 —
    // 비교표의 가격 셀(납작한 행)은 높이 조건에 걸러져 행이 플랜으로 세어지지 않는다.
    const branchMap = new Map();
    for (const el of priceEls) {
      let child = el;
      for (let p = el.parentElement; p && p !== document.body; child = p, p = p.parentElement) {
        const r = child.getBoundingClientRect();
        if (r.height >= 200 && r.width >= 160) {
          if (!branchMap.has(p)) branchMap.set(p, new Set());
          branchMap.get(p).add(child);
        }
      }
    }
    let planCards = [];
    for (const s of branchMap.values()) if (s.size > planCards.length) planCards = [...s];
    const planItemSets = planCards.map((c) => [...c.querySelectorAll("li")]
      .map((li) => (li.innerText || "").trim().toLowerCase().replace(/[\d,.]+/g, "#").replace(/\s+/g, " "))
      .filter((t) => t.length >= 3));
    const low = mainText.toLowerCase();
    const annual = /연간|년\s*결제|yearly|annual/i.test(low);
    const monthlyish = /월\s*환산|월당|매월|\/\s*(?:mo\b|month|월)|월\s*[\d,]+\s*원|[\d,]+\s*원\s*\/?\s*월|per\s+month|monthly/i.test(low);
    // 갱신·해지 문구는 법적 고지라 잔글씨·푸터에 두는 것도 유효 — 이것만 문서 전체를 본다
    const renewal = /갱신|자동\s*결제|자동\s*연장|자동\s*청구|해지|구독\s*취소|auto[-\s]?renew|renewal|cancel\s+anytime/i.test(document.body.innerText);
    const contactSales = /문의|contact\s+(?:sales|us)|견적|영업팀/i.test(low);
    const weakPrice = /\d+\s*원|무료|\bfree\b/i.test(low); // NOT-A-PRICING의 최후 방어(콤마 없는 "500원" 등)
    const emptyStateShown = /아직 없|비어 있|데이터가 없|없습니다|no data|nothing (?:here|yet)|시작해 보|추가해 보|get started/i.test(low);

    return {
      len: txt.length, sample: txt.slice(0, 120), overlayText, flush, blocks,
      firstInputY, firstCardY, fold: vh,
      h1: document.querySelectorAll("h1").length,
      struct: {
        repeatCards: best ? best.n : 0, maxGroup, hollowCards,
        cardsWithAction: best ? best.withAction : 0, repeat2,
        toolInputs, formFields, inForm, actionButtons, testimonial, priceish, emptyStateShown,
      },
      pricing: {
        priceCount: priceEls.length, priceNoPeriod, planCount: planCards.length,
        planItemSets, annual, monthlyish, renewal, contactSales, weakPrice,
      },
    };
  }, { inkSrc: inkSrcShared });

  if (isFirst) {
    if (probe.overlayText && /error|Cannot read|undefined|Unhandled|TypeError/i.test(probe.overlayText))
      add("red", "RUNTIME-ERROR", `개발 에러 오버레이: ${probe.overlayText.slice(0, 140)}`);
    // 에러 페이지(--expect-status ≥400)는 본문이 짧은 게 정상 — 임계를 낮춘다
    const blankMin = expectStatus != null && expectStatus >= 400 ? 40 : 200;
    if (probe.len < blankMin) add("red", "BLANK", `본문 텍스트 ${probe.len}자 — 사실상 빈 화면(${probe.sample})`);
    // --expect-status ≥400이면 그 상태의 리소스 로드 실패 로그는 기대된 동작이다 — 그 외 콘솔 에러만 본다
    const realErrors = expectStatus != null && expectStatus >= 400
      ? consoleErrors.filter((e) => !new RegExp(`Failed to load resource.*${expectStatus}`).test(e))
      : consoleErrors;
    if (realErrors.length) add(realErrors.some((e) => /pageerror|TypeError|Cannot read/i.test(e)) ? "red" : "yellow",
      "CONSOLE", `콘솔 에러 ${realErrors.length}건 — ${realErrors[0]}`);
    if (probe.h1 === 0) add("yellow", "NO-H1", "h1 없음");
  }
  if (probe.blocks >= 6 && probe.flush / probe.blocks > 0.4)
    add("red", "NO-CONTAINER", `본문 블록 ${probe.blocks}개 중 ${probe.flush}개가 화면 좌단(x<8)에 밀착 — 컨테이너 패딩·그리드가 적용되지 않았다${at}`);

  // ── 6) 유형별 필수 구조 — 구조·표류·개수는 첫 뷰포트에서만(뷰포트 불변), PURPOSE는 뷰포트마다 ──
  if (args.type && args.type !== "landing") {
    const s = probe.struct;
    const landingish = s.testimonial || s.priceish;
    if (isFirst && args.type === "catalog") {
      if (s.repeatCards < 4)
        add("red", "NOT-A-CATALOG", `카탈로그인데 반복 항목이 ${s.maxGroup}개 — 고를 것이 나열돼야 한다(같은 구조의 형제 4개+). 항목이 정말 이만큼뿐이면(사실 재고) 지어내지 말고 유형을 다시 정하라 — 상세·쇼케이스는 카탈로그가 아니다(§0b)`);
      else if (s.hollowCards)
        add("red", "HOLLOW-CARDS", `반복 항목 ${s.repeatCards}개의 과반이 잉크 0 — 이름·설명 없는 빈 상자다. 가상 요소·배경이미지로만 그린 카드면 사람이 확인하라`);
      else if (s.cardsWithAction < s.repeatCards * 0.8)
        add("red", "NO-ENTRY-ACTION", `항목 ${s.repeatCards}개 중 진입 액션(링크·버튼)이 ${s.cardsWithAction}개뿐 — 설명만 있고 들어갈 데가 없으면 카탈로그가 아니다`);
      if (landingish) add("yellow", "LANDING-DRIFT", "카탈로그에 후기·가격 섹션이 섞였다 — 설득은 랜딩의 일이다");
    }
    if (isFirst && args.type === "tool") {
      if (s.toolInputs === 0)
        add("red", "NOT-A-TOOL", "도구 화면인데 입력 요소(파일 업로드·보이는 텍스트 입력·캔버스)가 0개 — 여기서 실제로 써볼 수 있어야 한다");
      if (s.actionButtons === 0) add("red", "NO-RUN-ACTION", "실행 버튼이 없다");
      if (landingish) add("red", "LANDING-DRIFT", "도구 화면에 후기·가격 섹션 — 설득형 랜딩으로 흘렀다");
    }
    if (isFirst && args.type === "pricing") {
      const pr = probe.pricing;
      if (pr.priceCount === 0 && !pr.contactSales && !pr.weakPrice)
        add("red", "NOT-A-PRICING", "가격 문자열도 문의(contact sales) 마커도 0 — 요금제 페이지가 아니다");
      else {
        if (pr.planCount === 1)
          add("yellow", "SINGLE-PLAN-INFO", "가격 보유 플랜 블록 1개 — 단일 플랜은 합법(정보). 비교 구조가 의도였는지 확인");
        if (pr.priceNoPeriod > 0)
          add("yellow", "PRICE-NO-PERIOD", `주기 표기(/월·/mo·연간 등) 없는 가격 ${pr.priceNoPeriod}건 — EU 6(1)(e)는 청구 주기당 총액. 존재만 확인하는 검사다, 사람 확인`);
        if (pr.annual && !pr.monthlyish)
          add("yellow", "ANNUAL-NO-MONTHLY-EQUIV", "연간 표기는 있는데 월 환산 표기를 찾지 못했다 — EU 6(1)(e) 병기. 존재만 확인, 사람 확인");
        if (pr.priceCount > 0 && s.actionButtons > 0 && !pr.renewal)
          add("yellow", "RENEWAL-DISCLOSURE-MISSING", "갱신·자동결제·해지 계열 문구를 찾지 못했다 — 존재만 확인했다, 문구가 있어도 적법성 판정이 아니다(§2, §17602 근접 판정은 사람의 일)");
        if (pr.planCount > 5)
          add("yellow", "PLANS-OVER-5", `가격 보유 플랜 블록 ${pr.planCount}개 — 정적 나란히 비교는 최대 5(NN/G)`);
        const sets = pr.planItemSets.filter((x) => x.length >= 2);
        if (sets.length >= 2) {
          let anyOverlap = false;
          for (let i = 0; i < sets.length && !anyOverlap; i++)
            for (let j = i + 1; j < sets.length && !anyOverlap; j++)
              if (sets[i].some((t) => sets[j].includes(t))) anyOverlap = true;
          if (!anyOverlap)
            add("yellow", "NO-COMMON-AXIS", "플랜 카드들의 항목이 서로 전혀 겹치지 않는다(혐의) — 플랜마다 다른 항목을 나열하면 비교표가 아니다(§2 실전 사고)");
        }
      }
    }
    // 목적 표류 — 이 페이지의 "일"이 첫 화면 밖으로 밀렸는가(page-rules §0c). 뷰포트마다 잰다.
    {
      const fold = probe.fold ?? vp.height;
      const work = { tool: ["입력(업로드·텍스트·캔버스)", probe.firstInputY],
                     catalog: ["고를 항목", probe.firstCardY],
                     dashboard: ["데이터 블록", probe.firstCardY ?? probe.firstInputY],
                     form: ["입력 필드", probe.firstInputY] }[args.type];
      if (work) {
        const [what, y] = work;
        if (y === null) { if (isFirst) add("yellow", "NO-WORK-ELEMENT", `${what}을(를) 찾지 못했다 — 유형 구조 검사 결과와 함께 확인하라`); }
        else if (y > fold)
          add("red", "PURPOSE-BELOW-FOLD", `${what}이(가) y=${y}px — 첫 화면(${fold}px) 밖이다. 위쪽 소개·여백을 걷어내고 이 페이지의 일을 첫 화면으로 올린다(page-rules §0c)${at}`);
        else if (y > fold * 0.67)
          add("yellow", "PURPOSE-LOW", `${what}이(가) y=${y}px — 첫 화면 하단 1/3에 걸쳐 있다. 랜딩 밀도를 물려받지 않았는지 확인하라${at}`);
      }
    }
    if (isFirst && args.type === "dashboard" && !s.repeat2 && s.toolInputs === 0) {
      // §5가 요구하는 빈 상태 화면(0건 문구+다음 행동)은 벌하지 않는다
      if (!(s.emptyStateShown && s.actionButtons > 0))
        add("yellow", "THIN-DASHBOARD", "대시보드인데 반복 데이터도 조작 요소도 없다 — 의도된 빈 상태(0건 문구+다음 행동)면 이 경고는 무시");
    }
    if (isFirst && args.type === "form") {
      if (s.formFields < 2)
        add("red", "NOT-A-FORM", `라벨 붙은 입력 필드 ${s.formFields}개 — 폼이 아니다(canvas·hidden은 세지 않는다)`);
      else if (s.formFields > 5)
        add("yellow", "FORM-TOO-LONG", `필드 ${s.formFields}개 — 문의 폼은 3~5개 권장(page-rules §4)`);
      if (s.inForm === 0) add("yellow", "NO-FORM-ELEMENT", "<form> 요소가 없다 — 제출·검증 처리를 확인하라");
      if (landingish) add("yellow", "LANDING-DRIFT", "폼 페이지에 후기·가격 섹션");
    }
  }
}

await browser.close();

const red = findings.filter((f) => f.sev === "red");
const md = `# 살아있는가 검사 — ${args.url}${args.type ? ` (유형: ${args.type})` : ""}${viewports.length > 1 ? ` · 뷰포트 ${viewports.map((v) => `${v.width}x${v.height}`).join(", ")}` : ""}\n\n${findings.length ? findings.map((f) => `- ${f.sev === "red" ? "🔴" : "🟡"} **${f.rule}** — ${f.detail}`).join("\n") : "- ✅ 이상 없음"}\n\n**${red.length ? `실패 ${red.length}건` : "통과"}** · 경고 ${findings.length - red.length}건\n`;
if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "alive.md"), md); }
console.log(md);
exit(red.length ? 1 : 0);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
