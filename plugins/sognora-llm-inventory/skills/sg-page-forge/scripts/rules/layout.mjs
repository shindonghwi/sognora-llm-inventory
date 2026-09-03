/** rules/layout.mjs — 레이아웃 클리셰: 빈 카드 3장, H1 위 배지, 번호 배지 카드, 측면 액센트 보더, 빈 카드. 순수. */
import { finding, childrenOf, isHeadingTag, parseRgb, saturation, pxOf } from "./_util.mjs";

/** 같은 부모 아래 가로로 나란한 같은 크기 블록들 = 카드 행 */
export function cardRows(vp) {
  const byParent = new Map();
  for (const n of vp.nodes) { if (!n.visible || n.rect.w < 120 || n.rect.h < 80) continue; if (!byParent.has(n.parent)) byParent.set(n.parent, []); byParent.get(n.parent).push(n); }   // 정의: 카드 최소 120×80
  const rows = [];
  for (const [p, kids] of byParent) {
    if (kids.length < 3) continue;
    const y0 = kids[0].rect.y; const same = kids.filter((k) => Math.abs(k.rect.y - y0) < 8 && Math.abs(k.rect.w - kids[0].rect.w) < 8);
    if (same.length >= 3) rows.push({ parent: p, cards: same });
  }
  return rows;
}
const inkOf = (vp, n) => { let t = n.textLen, img = 0; const stack = [n.i]; while (stack.length) { const i = stack.pop(); for (const c of childrenOf(vp, i)) { t += c.textLen; if (c.tag === "img" || c.tag === "svg" || c.tag === "video" || c.tag === "canvas") img++; stack.push(c.i); } } return { text: t, img }; };

export const rules = [
  {
    id: "layout.empty-3cards", axis: "layout", severity: "🟡", title: "가운데 히어로 + 카드 3장 한 줄(내용 성긴)",
    evidence: "developersdigest #9·#12 · avoid-ai-design P0 · Krirox 축 3·4. 카드 자체가 죄가 아니라 내용 없이 세 장 나열이 문제",
    threshold: { value: 60, basis: "definition" },   // 정의: 카드당 텍스트 60자 미만이면 성긴 카드
    run(scan, { vp }) {
      const rows = cardRows(vp).filter((r) => r.cards.length === 3 && r.cards.every((c) => { const k = inkOf(vp, c); return k.text < 60 && k.img <= 1; }));
      return rows.length ? [finding(this, "🟡", `내용 성긴 3열 카드 행 ${rows.length}개 (y=${rows[0].cards[0].rect.y})`)] : [];
    },
  },
  {
    id: "layout.badge-above-h1", axis: "layout", severity: "🟡", title: "H1 바로 위 알약 배지",
    evidence: "developersdigest #10 · Krirox 축 3(히어로 패턴)",
    threshold: { value: 80, basis: "definition" },   // 정의: h1 위 80px 안의 알약(radius ≥ 12px, 폭 < 320, 텍스트 있음)
    run(scan, { vp }) {
      const h1 = vp.nodes.find((n) => n.visible && n.tag === "h1"); if (!h1) return [];
      const badge = vp.nodes.find((n) => n.visible && n.textLen > 0 && n.textLen < 40 && n.rect.w < 320 && n.rect.h < 48 && (pxOf(n.cs.radius) ?? 0) >= 12 && n.rect.y + n.rect.h <= h1.rect.y && h1.rect.y - (n.rect.y + n.rect.h) < 80 && (n.cs.bg !== "rgba(0, 0, 0, 0)" || n.cs.bw.split("|")[0] !== "0px"));
      return badge ? [finding(this, "🟡", `H1 위 배지 "${badge.text}"`)] : [];
    },
  },
  {
    id: "layout.numbered-badge-card", axis: "layout", severity: "🔴", title: "01/02/03 번호 배지 카드·스테퍼로 실체를 대신 설명",
    evidence: "forge-rules §2d(IC6 — 실체는 이미지로, 텍스트 목록으로 대체 금지) · developersdigest #13 · 레퍼런스 실측 0건",
    threshold: { value: 3, basis: "definition" },   // 정의: 같은 행에 번호 3개 이상
    run(scan, { vp }) {
      const nums = vp.nodes.filter((n) => n.visible && /^(0?[1-9]|STEP\s*0?[1-9]|단계\s*[1-9]|[1-9]\.)$/i.test(n.text.trim()) && n.rect.h < 80);
      const byParentRow = new Map();
      for (const n of nums) { const gp = vp.nodes[n.parent]?.parent ?? n.parent; const k = `${gp}:${Math.round(n.rect.y / 40)}`; byParentRow.set(k, (byParentRow.get(k) || 0) + 1); }
      const rows = [...byParentRow.values()].filter((c) => c >= this.threshold.value).length;
      const col = nums.length >= 3 && new Set(nums.map((n) => n.rect.x)).size === 1;   // 세로 목록
      return rows || col ? [finding(this, "🔴", `번호 배지 ${nums.length}개(${rows ? "가로 스테퍼" : "세로 목록"}) — 실체 이미지 위 주석으로 바꾸거나 한 줄 흐름으로 압축`)] : [];
    },
  },
  {
    id: "border.side-accent", axis: "layout", severity: "🟡", title: "카드 왼쪽·위 컬러 액센트 보더(가장 강한 단일 티)",
    evidence: "developersdigest #11('strongest single tell') · page-rules §6",
    threshold: { value: 2, basis: "definition" },
    run(scan, { vp }) {
      const hits = vp.nodes.filter((n) => { if (!n.visible || n.rect.w < 120) return false; const [l, t, r, b, col] = n.cs.bw.split("|"); const lw = pxOf(l) || 0, tw = pxOf(t) || 0, rw = pxOf(r) || 0, bw = pxOf(b) || 0; const c = parseRgb(col); return c && saturation(c) > 0.35 && ((lw >= 3 && rw === 0) || (tw >= 3 && bw === 0)); });   // 정의: 한쪽만 3px+ 유채색
      return hits.length >= this.threshold.value ? [finding(this, "🟡", `측면 액센트 보더 카드 ${hits.length}개`)] : [];
    },
  },
  {
    id: "card.hollow", axis: "layout", severity: "🔴", title: "반복 항목 과반이 잉크 0(이름도 설명도 없는 빈 상자)",
    evidence: "page-rules §0b HOLLOW-CARDS 실측 — 배경이미지 전용 카드는 오탐 가능(사람 확인)",
    threshold: { value: 0.5, basis: "definition" },
    run(scan, { vp }) {
      const out = [];
      for (const r of cardRows(vp)) { const hollow = r.cards.filter((c) => { const k = inkOf(vp, c); return k.text === 0 && k.img === 0 && !c.cs.bgi; }); if (hollow.length / r.cards.length > this.threshold.value) out.push(r); }
      return out.length ? [finding(this, "🔴", `빈 카드 행 ${out.length}개 (y=${out[0].cards[0].rect.y}) — 배경이미지 전용 카드면 사람이 확인`)] : [];
    },
  },
];
