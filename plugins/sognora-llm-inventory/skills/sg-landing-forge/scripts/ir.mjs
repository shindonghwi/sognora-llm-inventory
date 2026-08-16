/**
 * ir.mjs — 번들 → IR(중간 표현) 증류
 *
 * usage: ir.mjs --bundle <dir> --out <ir.json>
 *
 * 번들(로컬 캐시, 원본 사본 포함, 커밋 금지)에서 **측정 사실만** 추려 커밋 가능한
 * ir.json을 만든다. IR은 변환 빌드의 골격 입력이다: 섹션 트리·그리드 기하·타입 롤·
 * 자산 슬롯(치수·종횡비 — 슬롯 우선 규칙의 입력이 여기서 공짜로 나온다)·리듬·모션 어휘.
 * 원본 CSS 원문·자산 URL 사본은 IR에 넣지 않는다(재배포 금지) — 수치와 구조만.
 *
 * reproduction.stamp: 재현 시험(IR만으로 원본을 오차 밴드 내 재건축→capture 대조) 통과
 * 시에만 기록한다. 스탬프 없는 IR은 리드 자격이 없다.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";

const args = parseArgs(argv.slice(2));
if (!args.bundle || !args.out) { console.error("usage: ir.mjs --bundle <dir> --out <ir.json>"); exit(2); }
const read = async (f, fallback = null) => { try { return JSON.parse(await readFile(join(args.bundle, f), "utf8")); } catch { return fallback; } };

const meta = await read("meta.json", {});
const t1440 = await read("tree-1440.json");
const t390 = await read("tree-390.json");
const atrules = await read("atrules.json", { keyframes: [], media: [] });
const record = await read("record.json");
const assets = await read("assets.json", []);
if (!t1440) { console.error("tree-1440.json 없음 — bundle.mjs 먼저"); exit(2); }

function sections(root, vw, scrollHeight) {
  const flat = [];
  const maxH = Math.min(4200, (scrollHeight ?? Infinity) * 0.7); // 페이지 래퍼는 섹션이 아니다
  (function walk(n, depth, bgStack) {
    const bg = n.styles?.backgroundColor ?? bgStack;
    if (n.rect.w >= vw * 0.85 && n.rect.h >= 200 && n.rect.h <= maxH && depth <= 9) flat.push({ n, depth, bg });
    for (const c of n.children ?? []) walk(c, depth + 1, bg);
  })(root, 0, null);
  flat.sort((a, b) => a.n.rect.y - b.n.rect.y || a.depth - b.depth);
  const out = [];
  for (const f of flat) { // 바깥쪽 우선, y 중복 70%+ 는 같은 섹션
    const { y, h } = f.n.rect;
    if (out.some((s) => overlap(y, y + h, s.y, s.y + s.h) > 0.7 * h)) continue;
    out.push(distill(f, vw));
  }
  return out.filter((s) => s.h >= 200);
}
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

function distill(f, vw) {
  const { n, bg } = f;
  const s = { y: n.rect.y, h: n.rect.h, bg: n.styles?.backgroundColor ?? bg ?? null, tag: n.tag, cls: n.cls?.[0] ?? null };
  // 컨테이너: 중앙 정렬된 가장 넓은 자손(뷰포트 95% 미만)
  let container = null;
  (function walk(x, d) {
    if (d > 4) return;
    const { w } = x.rect;
    const centered = Math.abs(x.rect.x - (vw - w) / 2) <= 48;
    if (w >= 500 && w < vw * 0.95 && centered && (!container || w > container)) container = w;
    for (const c of x.children ?? []) walk(c, d + 1);
  })(n, 0);
  s.container = container;
  // 열: 같은 y대(±24px)에 나란한 형제 수의 최댓값
  let columns = 1;
  (function walk(x, d) {
    if (d > 5) return;
    const kids = (x.children ?? []).filter((c) => c.rect.w >= 120 && c.rect.h >= 60);
    const rows = {};
    for (const k of kids) { const band = Math.round(k.rect.y / 24); rows[band] = (rows[band] ?? 0) + 1; }
    for (const cnt of Object.values(rows)) if (cnt > columns) columns = cnt;
    for (const c of x.children ?? []) walk(c, d + 1);
  })(n, 0);
  s.columns = Math.min(columns, 6);
  // 타입 롤·헤드라인·자산 슬롯·질감 신호
  const type = new Map(); const slots = []; let glass = 0; const motion = new Set();
  (function walk(x) {
    if (x.text && x.styles?.fontSize) {
      const key = `${x.styles.fontSize}/${x.styles.fontWeight ?? "400"}/${x.styles.lineHeight ?? "-"}`;
      const cur = type.get(key) ?? { fontSize: parseFloat(x.styles.fontSize), weight: x.styles.fontWeight ?? "400", lineHeight: x.styles.lineHeight ?? null, count: 0, sample: x.text.slice(0, 40) };
      cur.count++; type.set(key, cur);
    }
    if (x.media && x.rect.w >= 40 && x.rect.h >= 40)
      slots.push({ kind: x.tag, w: x.rect.w, h: x.rect.h, aspect: +(x.rect.w / Math.max(1, x.rect.h)).toFixed(2), radius: x.styles?.borderRadius ?? null, objectFit: x.styles?.objectFit ?? null });
    if (x.styles?.backdropFilter) glass++;
    if (x.styles?.transition) motion.add(x.styles.transition.slice(0, 80));
    if (x.styles?.animation) motion.add("anim:" + x.styles.animation.slice(0, 80));
    for (const c of x.children ?? []) walk(c);
  })(n);
  s.type = [...type.values()].sort((a, b) => b.fontSize - a.fontSize).slice(0, 8);
  s.headline = s.type[0] ?? null;
  s.assetSlots = slots.slice(0, 12);
  s.glassNodes = glass;
  s.motionDecls = [...motion].slice(0, 10);
  s.padding = { top: n.styles?.paddingTop ?? null, bottom: n.styles?.paddingBottom ?? null };
  return s;
}

const sec1440 = sections(t1440.tree, 1440, t1440.scrollHeight);
const sec390 = t390 ? sections(t390.tree, 390, t390.scrollHeight) : [];

// 페이지 수준 어휘
const allType = new Map();
const durations = new Map();
(function walk(x) {
  if (x.text && x.styles?.fontSize) { const k = `${x.styles.fontSize}/${x.styles.fontWeight ?? "400"}`; allType.set(k, (allType.get(k) ?? 0) + 1); }
  for (const m of String(x.styles?.transition ?? "").matchAll(/([\d.]+)s/g)) { const ms = Math.round(+m[1] * 1000); durations.set(ms, (durations.get(ms) ?? 0) + 1); }
  for (const c of x.children ?? []) walk(c);
})(t1440.tree);

const ir = {
  irVersion: 1,
  source: { url: meta.url, collectedAt: meta.collectedAt },
  page: { scrollHeight1440: t1440.scrollHeight, scrollHeight390: t390?.scrollHeight ?? null, sectionCount: sec1440.length },
  rhythm: {
    bgSequence: sec1440.map((s) => s.bg),
    heights: sec1440.map((s) => s.h),
    containers: [...new Set(sec1440.map((s) => s.container).filter(Boolean))].sort((a, b) => b - a),
  },
  typeScale: [...allType.entries()].map(([k, count]) => { const [px, w] = k.split("/"); return { px: parseFloat(px), weight: w, count }; })
    .sort((a, b) => b.px - a.px).slice(0, 14),
  motion: {
    durationsMs: [...durations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ms, count]) => ({ ms, count })),
    keyframesCount: atrules.keyframes.length,
    keyframesNamed: atrules.keyframes.map((k) => k.name).filter((n) => !/^go\d+$/.test(n)).slice(0, 20),
    runningAnimations: (record?.animations ?? []).slice(0, 20),
    hoverTimelines: (record?.hover ?? []).map((h) => ({ selector: h.selector, frames: h.frames, overshoot: h.overshoot })),
    revealTimelines: (record?.reveal ?? []).map((r) => ({ selector: r.selector, startY: r.startY, frames: r.timeline?.length ?? 0 })),
    listenerProfile: topEntries(record?.listeners ?? {}, 12),
  },
  assetStats: {
    count: assets.length,
    images: assets.filter((a) => a.type === "image").length,
    withRect: assets.filter((a) => a.rect).length,
    totalBytes: assets.reduce((s, a) => s + (a.bytes ?? 0), 0),
  },
  sections: sec1440,
  sectionsMobile: sec390.map((s) => ({ y: s.y, h: s.h, container: s.container, columns: s.columns })),
  reproduction: { stamp: null, note: "IR만으로 원본을 오차 밴드 내 재건축→capture 대조 통과 시 스탬프. 스탬프 없는 IR은 리드 자격 없음." },
};
await writeFile(args.out, JSON.stringify(ir, null, 2));
console.log(`ir 완료: 섹션 ${sec1440.length}개(모바일 ${sec390.length}), 타입 롤 ${ir.typeScale.length}, duration 후보 ${ir.motion.durationsMs.map((d) => d.ms + "ms").join("/")}, keyframes ${ir.motion.keyframesCount} → ${args.out}`);

function topEntries(obj, n) { return Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)); }
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[++i]; }
  return o;
}
