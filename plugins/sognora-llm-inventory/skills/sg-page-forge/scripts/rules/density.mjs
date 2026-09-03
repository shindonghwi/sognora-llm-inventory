/** rules/density.mjs — 밀도 축: 여백 지배 밴드(단독 🔴), 여백 지배 섹션, 저밀도 카드 행, 서술형 스탯 밴드, 반폭 공백. 순수. */
import { finding, childrenOf, hasMeasurement } from "./_util.mjs";
import { cardRows } from "./layout.mjs";

/** 박스 안 콘텐츠의 세로 범위(자손 중 텍스트·이미지가 있는 노드의 y 범위) */
function contentSpan(vp, n) {
  let top = Infinity, bottom = -Infinity; const stack = [n.i];
  while (stack.length) { const i = stack.pop(); for (const c of childrenOf(vp, i)) { if (c.visible && (c.textLen > 0 || c.tag === "img" || c.tag === "svg" || c.tag === "video")) { top = Math.min(top, c.rect.y); bottom = Math.max(bottom, c.rect.y + c.rect.h); } stack.push(c.i); } }
  if (n.textLen > 0) { top = Math.min(top, n.rect.y); bottom = Math.max(bottom, n.rect.y + n.rect.h); }
  return top === Infinity ? 0 : bottom - top;
}
const isHeaderStack = (vp, n) => { const kids = childrenOf(vp, n.i).filter((c) => c.visible); return kids.length >= 2 && kids.every((c) => c.textLen > 0 || childrenOf(vp, c.i).every((g) => g.textLen > 0)) && kids.some((c) => /^h[1-3]$/.test(c.tag)); };

export const rules = [
  {
    id: "density.void-band", axis: "density", severity: "🔴", title: "카드·열·밴드 박스의 상하 공백이 안쪽 콘텐츠보다 크다(여백 지배)",
    evidence: "forge-rules §2d DE4 실측(박스 209px에 콘텐츠 59px) · aside.com 실측으로 헤더 스택 제외 확정 · 사용자 무관용 지시. 단독 🔴(계측이지 취향이 아니다)",
    threshold: { value: 120, basis: "definition" },   // 정의: 박스 120px·공백 64px 하한(1열), 경계 있는 다열 밴드 140/96 — 그 아래는 리듬
    run(scan, { vp }) {
      const hits = [];
      for (const n of vp.nodes) {
        if (!n.visible || n.rect.h < 120 || n.rect.w < 160 || n.fixed) continue;
        /* 대상은 '아이템 박스'다(forge §2d: 분모는 섹션이 아니라 카드·열). 테두리/그림자가 있거나, 같은 폭의 형제가 2개 이상인 반복 박스만 센다 — 배경색만 있는 단독 블록(히어로·헤더)은 리듬이다. 코퍼스 보정 2026-09-04(channel/notion 단독 블록 오탐) */
        const hasEdge = n.cs.bw.split("|").slice(0, 4).some((w) => w !== "0px") || !!n.cs.shadow;
        const siblings = childrenOf(vp, n.parent).filter((s) => s.i !== n.i && s.visible && Math.abs(s.rect.w - n.rect.w) < 8 && s.rect.h >= 80).length;
        const isItem = hasEdge || (n.cs.bg !== "rgba(0, 0, 0, 0)" && siblings >= 1);
        if (!isItem) continue;
        if (isHeaderStack(vp, n)) continue;
        if (n.cs.bgi && n.cs.bgi !== "none") continue;   /* 코퍼스 보정(2026-09-03 apple·channel): 배경 이미지 박스는 이미지가 콘텐츠다 — 텍스트 범위로 공백을 재면 오탐 */
        const kids = childrenOf(vp, n.i).filter((c) => c.visible && c.rect.w > 0);
        const multiCol = kids.length >= 2 && kids.every((k) => Math.abs(k.rect.y - kids[0].rect.y) < 8);
        if (!multiCol && n.rect.w >= vp.width * 0.8) continue;   /* 코퍼스 보정(notion header 364/96): 분모는 섹션이 아니라 아이템 박스 — 전폭 단열 밴드의 패딩은 리듬(forge §2d) */
        const minBox = multiCol ? 140 : 120, minGap = multiCol ? 96 : 64;   // 정의: 다열 밴드 하한 140/96
        if (n.rect.h < minBox) continue;
        const content = contentSpan(vp, n); if (content < 40) continue;   /* 코퍼스 보정(2026-09-04 stripe 600/12·vercel): 콘텐츠 40px 미만은 스페이서·장식 박스 — 여백 지배가 아니라 레이아웃 */
        const gap = n.rect.h - content;
        if (gap > content && gap >= minGap) hits.push({ n, content, gap });
      }
      if (!hits.length) return [];
      const worst = hits.sort((a, b) => b.gap / b.content - a.gap / a.content)[0];
      return [finding(this, "🔴", `여백 지배 박스 ${hits.length}개 — 최악: <${worst.n.tag}> 높이 ${worst.n.rect.h}, 콘텐츠 ${worst.content}, 공백 ${worst.gap} (y=${worst.n.rect.y}). 처방: 실체 투입 → 한 줄 압축 → 밴드 삭제. 패딩만 줄여 통과 금지`, { count: hits.length })];
    },
  },
  {
    id: "density.void-section", axis: "density", severity: "🟡", title: "섹션 높이 대비 콘텐츠가 희박(여백으로 부풀린 얇은 섹션)",
    evidence: "forge-rules §1 DE1 · §2d 콘텐츠 예산(말할 것이 없으면 섹션을 줄여라)",
    threshold: { value: 0.25, basis: "definition" },   // 정의: 섹션 텍스트+이미지 잉크가 섹션 면적의 25% 미만이고 높이 ≥ 뷰포트 60%
    run(scan, { vp }) {
      const hits = vp.sections.filter((s) => !s.fixed && s.h >= vp.height * 0.6 && s.textLen < 200 && s.imgCount === 0);
      return hits.length ? [finding(this, "🟡", `콘텐츠 희박 섹션 ${hits.length}개 (y=${hits[0].y}, h=${hits[0].h}, 텍스트 ${hits[0].textLen}자)`)] : [];
    },
  },
  {
    id: "density.sparse-card-row", axis: "density", severity: "ℹ️", title: "카드 행의 카드마다 한 줄 설명뿐(보고만 — 로고·아이콘 그리드는 정상)",
    evidence: "developersdigest #12 · 코퍼스 보정(2026-09-04): 프리미엄 5/9에서 발동(omneky 로고 그리드 14행) → 판정에서 내리고 보고만. 슬롭 여부는 layout.empty-3cards·AI-티 판정자가 본다",
    threshold: { value: 40, basis: "definition" },   // 정의: 카드 텍스트 40자 미만
    run(scan, { vp }) {
      const rows = cardRows(vp).filter((r) => r.cards.every((c) => { let t = c.textLen; const st = [c.i]; while (st.length) { const i = st.pop(); for (const k of childrenOf(vp, i)) { t += k.textLen; st.push(k.i); } } return t < 40; }));
      return rows.length ? [finding(this, "ℹ️", `저밀도 카드 행 ${rows.length}개(보고만)`)] : [];
    },
  },
  {
    id: "density.prose-stat-band", axis: "density", severity: "🔴", title: "스탯 자리에 숫자 없는 서술문('검토 중')",
    evidence: "forge-rules §2d DE3(스탯·상태 밴드는 측정값만) · Krirox 축 5(숫자·고유명사 없음)",
    threshold: { value: 3, basis: "definition" },   // 정의: 큰 글자(≥28px) 3개 이상이 한 행에 나란한데 숫자가 하나도 없음
    run(scan, { vp }) {
      const big = vp.nodes.filter((n) => n.visible && n.textLen > 0 && n.textLen <= 24 && n.cs.fs >= 28 && !/^h1$/.test(n.tag));
      const rows = new Map(); for (const n of big) { const k = Math.round(n.rect.y / 30); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(n); }
      const bad = [...rows.values()].filter((r) => r.length >= 3 && new Set(r.map((n) => n.parent)).size <= 3 && !r.some((n) => hasMeasurement(n.text)));
      return bad.length ? [finding(this, "🔴", `숫자 없는 스탯 밴드 ${bad.length}개 — 예: "${bad[0].map((n) => n.text).join(" / ").slice(0, 60)}"`)] : [];
    },
  },
  {
    id: "density.half-width-blank", axis: "density", severity: "🟡", title: "카드·밴드에서 콘텐츠가 좌측 절반만 쓰고 우측이 통째로 빈다",
    evidence: "forge-rules §2d 반폭 공백 실측(폭 1270 CTA 카드에서 우측 435px 공백)",
    threshold: { value: 0.4, basis: "definition" },   // 정의: 자손 콘텐츠 최대 x가 박스 폭 60% 미만이고 박스 폭 ≥ 800
    run(scan, { vp }) {
      const hits = [];
      for (const n of vp.nodes) {
        if (!n.visible || n.rect.w < 800 || n.rect.h < 120 || n.fixed) continue;
        if (!(n.cs.bg !== "rgba(0, 0, 0, 0)" || n.cs.shadow || n.cs.bw.split("|").slice(0, 4).some((w) => w !== "0px"))) continue;
        let maxX = 0, any = false; const st = [n.i];
        while (st.length) { const i = st.pop(); for (const c of childrenOf(vp, i)) { if (c.visible && (c.textLen > 0 || c.tag === "img")) { any = true; maxX = Math.max(maxX, c.rect.x + c.rect.w); } st.push(c.i); } }
        if (any && (maxX - n.rect.x) / n.rect.w < 0.6) hits.push(n);
      }
      return hits.length ? [finding(this, "🟡", `반폭 공백 박스 ${hits.length}개 (y=${hits[0].rect.y})`)] : [];
    },
  },
];
