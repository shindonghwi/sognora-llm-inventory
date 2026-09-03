#!/usr/bin/env node
/**
 * ir.mjs — 리드 사이트의 실측. 원본(번들)은 스킬 폴더 밖 홈 캐시에, 증류한 측정 사실(IR)은 **사용자 프로젝트** `.sognora/page/ir/<name>.json`에 쓴다.
 * 스킬의 `references/ir/`는 배포되는 읽기 전용 데이터다 — 런타임에 플러그인 폴더에 쓰지 않는다(설치본에서 업데이트 시 소실·지문 불일치). 스킬에 새 리드 IR을 넣는 것은 저장소 편집이다.
 *
 * usage: node ir.mjs capture --url <URL> --name <name>     → $SG_PAGE_FORGE_HOME/bundles/<name>/{scan.json, record.json, shots/}
 *        node ir.mjs distill --name <name> [--out .sognora/page/ir/<name>.json]
 *        node ir.mjs all --url <URL> --name <name>          capture + distill
 *
 * IR 스키마(irVersion 1 — 기존 19종 IR과 호환): source{url,collectedAt} · page{scrollHeight1440,scrollHeight390,sectionCount}
 *   · rhythm{bgSequence[],heights[],containers[]} · typeScale[{px,weight,count}] · motion{durationsMs[],keyframesCount,hoverTimelines[],revealTimelines[]}
 *   · assetStats{count,images,withRect} · sections[{y,h,bg,tag,cls,container,columns,type[],headline,assetSlots[],padding}] · sectionsMobile[] · completeness{...}
 * 원본 CSS·자산 사본은 재배포 금지라 저장소에 올리지 않는다. IR만으로 irdiff·brief가 돈다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { argv, exit } from "node:process";
import { loadPlaywright, missingPlaywright, parseArgs, forgeHome, SKILL_ROOT } from "./_deps.mjs";
import { scanUrl } from "./scan.mjs";
import { pickViewports } from "./rules/_util.mjs";

/** 호버·리빌 타임라인 — 인터랙티브 요소 몇 개에 호버를 걸어 computed 변화를 관측한다(record) */
async function recordUrl(pw, url) {
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" })).newPage();
    await page.goto(url, { waitUntil: "load", timeout: 60000 }); await page.waitForTimeout(1200);
    const hovers = await page.evaluate(async () => {
      const els = [...document.querySelectorAll("a,button,[role=button]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 20 && r.top < innerHeight; }).slice(0, 12);   // 정의: 첫 화면의 인터랙티브 최대 12개
      const out = [];
      for (const e of els) {
        const before = getComputedStyle(e); const b = { bg: before.backgroundColor, color: before.color, tr: before.transform, sh: before.boxShadow, op: before.opacity };
        e.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); e.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 350));
        const a = getComputedStyle(e); const changed = []; if (a.backgroundColor !== b.bg) changed.push("background"); if (a.color !== b.color) changed.push("color"); if (a.transform !== b.tr) changed.push("transform"); if (a.boxShadow !== b.sh) changed.push("boxShadow"); if (a.opacity !== b.op) changed.push("opacity");
        e.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })); e.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        out.push({ selector: e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.split(/\s+/).slice(0, 2).join(".") : ""), changed, duration: a.transitionDuration });
      }
      return out;
    });
    /* 리빌: 스크롤 전/후 opacity가 바뀐 요소 */
    const before = await page.evaluate(() => [...document.querySelectorAll("section *, main *")].filter((e) => e.children.length === 0 && e.textContent.trim().length > 10).slice(0, 400).map((e) => ({ y: e.getBoundingClientRect().top + scrollY, op: getComputedStyle(e).opacity })));
    await page.evaluate(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } });
    const after = await page.evaluate(() => [...document.querySelectorAll("section *, main *")].filter((e) => e.children.length === 0 && e.textContent.trim().length > 10).slice(0, 400).map((e) => getComputedStyle(e).opacity));
    const reveals = before.map((b, i) => ({ ...b, after: after[i] })).filter((x) => parseFloat(x.op) < 0.5 && parseFloat(x.after) >= 0.5).map((x) => ({ startY: Math.round(x.y) }));
    return { hoverTimelines: hovers.filter((h) => h.changed.length), revealTimelines: reveals.slice(0, 20) };
  } finally { await browser.close(); }
}

export function distill(scan, record, name) {
  const { desktop, mobile } = pickViewports(scan); const d = scan.viewports[desktop], m = mobile ? scan.viewports[mobile] : null;
  const secOf = (vp) => vp.sections.filter((s) => !s.fixed).map((s) => {
    const inner = vp.nodes.filter((n) => n.visible && n.rect.y >= s.y && n.rect.y < s.y + s.h && n.rect.w >= 200 && n.rect.h >= 40 && n.depth <= 6);   // 정의: 컨테이너 후보 = 폭 200+·깊이 6 이하
    const widths = inner.map((n) => n.rect.w).filter((w) => w < vp.width - 16); const container = widths.length ? Math.max(...widths) : null;
    const rows = new Map(); for (const n of inner) { const k = Math.round(n.rect.y / 20); rows.set(k, (rows.get(k) || 0) + 1); } const columns = Math.max(1, ...rows.values());
    const txt = vp.nodes.filter((n) => n.visible && n.textLen > 0 && n.rect.y >= s.y && n.rect.y < s.y + s.h);
    const typeMap = new Map(); for (const n of txt) { const k = `${Math.round(n.cs.fs)}|${n.cs.fw}`; const e = typeMap.get(k) || { fontSize: Math.round(n.cs.fs), weight: String(n.cs.fw), lineHeight: n.cs.lh, count: 0, sample: n.text.slice(0, 60) }; e.count++; typeMap.set(k, e); }
    const type = [...typeMap.values()].sort((a, b) => b.fontSize - a.fontSize).slice(0, 6);
    const imgs = vp.images.filter((i) => i.visible && i.rect.y >= s.y && i.rect.y < s.y + s.h && i.rect.w >= 80).map((i) => ({ w: i.rect.w, h: i.rect.h, aspect: +(i.rect.w / Math.max(1, i.rect.h)).toFixed(3), x: i.rect.x }));
    return { y: s.y, h: s.h, bg: s.bg, tag: s.tag, cls: s.cls, container, columns, type, headline: type[0] || null, assetSlots: imgs, glassNodes: vp.nodes.filter((n) => n.visible && n.cs.bd && n.rect.y >= s.y && n.rect.y < s.y + s.h).length, motionDecls: [...new Set(vp.nodes.filter((n) => n.rect.y >= s.y && n.rect.y < s.y + s.h && n.cs.tr && !/^all\s+0s|^\w+\s+0s/.test(n.cs.tr)).map((n) => n.cs.tr.split(" ")[0]))].slice(0, 6), padding: { top: `${s.pad?.top ?? 0}px`, bottom: `${s.pad?.bottom ?? 0}px` } };
  });
  const sections = secOf(d); const sectionsMobile = m ? secOf(m).map((s) => ({ y: s.y, h: s.h, container: s.container, columns: s.columns })) : [];
  const typeScale = new Map(); for (const n of d.nodes) if (n.visible && n.textLen > 0) { const k = `${Math.round(n.cs.fs)}|${n.cs.fw}`; typeScale.set(k, (typeScale.get(k) || 0) + 1); }
  const durs = new Map(); for (const n of d.nodes) { const t = n.cs.tr.split(" ").pop(); const ms = /ms$/.test(t) ? parseFloat(t) : /s$/.test(t) ? parseFloat(t) * 1000 : 0; if (ms > 0) durs.set(ms, (durs.get(ms) || 0) + 1); }
  const withRect = d.images.filter((i) => i.visible && i.rect.w > 0).length;
  const completeness = { tree1440: d.nodes.length > 50, tree390: !!(m && m.nodes.length > 50), scrollHeight: d.scrollHeight > d.height, keyframes: scan.keyframesCount > 0, assetRect: d.images.length ? withRect / d.images.length >= 0.5 : true, record: (record?.hoverTimelines?.length || 0) + (record?.revealTimelines?.length || 0) >= 1 };   // 근거: forge-rules §8b(완전성 5항)
  completeness.pass = Object.values(completeness).every(Boolean);
  return { irVersion: 1, name, source: { url: scan.finalUrl || scan.url, collectedAt: scan.collectedAt }, page: { scrollHeight1440: d.scrollHeight, scrollHeight390: m?.scrollHeight ?? null, sectionCount: sections.length },
    rhythm: { bgSequence: sections.map((s) => s.bg), heights: sections.map((s) => s.h), containers: [...new Set(sections.map((s) => s.container).filter(Boolean))].sort((a, b) => b - a) },
    typeScale: [...typeScale.entries()].map(([k, count]) => ({ px: +k.split("|")[0], weight: k.split("|")[1], count })).sort((a, b) => b.px - a.px),
    motion: { durationsMs: [...durs.entries()].map(([ms, count]) => ({ ms, count })).sort((a, b) => b.count - a.count).slice(0, 5), keyframesCount: scan.keyframesCount, hoverTimelines: record?.hoverTimelines || [], revealTimelines: record?.revealTimelines || [] },
    assetStats: { count: d.images.length, images: d.images.filter((i) => i.rect.w >= 80).length, withRect }, sections, sectionsMobile, completeness };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); const cmd = args._[0];
  if (!cmd || !args.name || (cmd !== "distill" && !args.url)) { console.error("usage: ir.mjs capture|distill|all --url <URL> --name <name> [--out path]"); exit(2); }
  const dir = join(forgeHome(), "bundles", args.name); await mkdir(dir, { recursive: true });
  if (cmd === "capture" || cmd === "all") {
    const pw = await loadPlaywright(); if (!pw) { console.error(missingPlaywright()); exit(2); }
    const scan = await scanUrl(pw, { url: args.url, out: dir }); await writeFile(join(dir, "scan.json"), JSON.stringify(scan));
    const record = await recordUrl(pw, args.url); await writeFile(join(dir, "record.json"), JSON.stringify(record, null, 2));
    console.log(`capture → ${dir} (홈 캐시, 커밋 금지) · hover ${record.hoverTimelines.length} · reveal ${record.revealTimelines.length}`);
  }
  if (cmd === "distill" || cmd === "all") {
    const scan = JSON.parse(await readFile(join(dir, "scan.json"), "utf8")); let record = null; try { record = JSON.parse(await readFile(join(dir, "record.json"), "utf8")); } catch { /* 없음 */ }
    const ir = distill(scan, record, args.name); const out = args.out || join(".sognora", "page", "ir", `${args.name}.json`);
    await mkdir(dirname(out), { recursive: true }); await writeFile(out, JSON.stringify(ir, null, 2));
    console.log(`distill → ${out} · 섹션 ${ir.page.sectionCount} · completeness ${ir.completeness.pass ? "✅" : "미달 " + Object.entries(ir.completeness).filter(([, v]) => v === false).map(([k]) => k).join(",")}`);
  }
}
