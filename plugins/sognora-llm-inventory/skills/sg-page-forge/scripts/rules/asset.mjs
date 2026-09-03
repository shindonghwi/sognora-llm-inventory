/** rules/asset.mjs — 자산 축: 플레이스홀더, 동일 이미지 재사용, 치수 미지정, 무알트. 순수. */
import { finding } from "./_util.mjs";

const PLACEHOLDER = /placeholder|placehold\.|via\.placeholder|dummyimage|picsum|lorem|unsplash\.com\/random|data:image\/gif;base64,R0lGOD|\/img\/sample|example\.com/i;

export const rules = [
  {
    id: "asset.placeholder", axis: "asset", severity: "🔴", title: "플레이스홀더·샘플 이미지 잔존",
    evidence: "forge-rules §1 AS2(면제 불가) · Krirox 축 7(placeholder logos) · page-rules §6 가짜 데이터",
    threshold: { value: 1, basis: "definition" },
    run(scan, { vp }) {
      const hits = vp.images.filter((i) => i.visible && PLACEHOLDER.test(i.src));
      const alt = vp.images.filter((i) => i.visible && /^(image|img|photo|placeholder|사진|이미지)\d*$/i.test((i.alt || "").trim()));
      const out = [];
      if (hits.length) out.push(finding(this, "🔴", `플레이스홀더 이미지 ${hits.length}개 — ${hits[0].src.slice(0, 60)}`));
      if (alt.length >= 2) out.push(finding(this, "🟡", `자리표시 alt ${alt.length}개("${alt[0].alt}")`));
      return out;
    },
  },
  {
    id: "asset.reuse", axis: "asset", severity: "🟡", title: "같은 이미지가 3곳 이상에서 재사용",
    evidence: "forge-rules §1 AS1·§2a 동일 시안 반복 금지('여러 시안을 만드는 제품'이 '한 벌을 돌려쓰는 도구'로 보인다)",
    threshold: { value: 3, basis: "definition" },
    run(scan, { vp }) {
      const cnt = new Map(); for (const i of vp.images) if (i.visible && i.src && i.rect.w >= 80) cnt.set(i.src, (cnt.get(i.src) || 0) + 1);   // 정의: 80px 이상(아이콘·로고 제외)
      const dup = [...cnt.entries()].filter(([, c]) => c >= this.threshold.value);
      return dup.length ? [finding(this, "🟡", `재사용 이미지 ${dup.length}종 — 예: ${dup[0][0].split("/").pop().slice(0, 40)} ×${dup[0][1]}`)] : [];
    },
  },
  {
    id: "asset.unsized", axis: "asset", severity: "ℹ️", title: "width/height 속성 없는 이미지(CLS 보고만)",
    evidence: "forge-rules §1d: 속성 프록시라 코퍼스 10/16 발동 → 판정에서 삭제, CLS는 Lighthouse 실측 관할. 보고만 남긴다",
    threshold: { value: 0, basis: "definition" },
    run(scan, { vp }) {
      const n = vp.images.filter((i) => i.visible && i.rect.w >= 200 && !i.sized).length;
      return n ? [finding(this, "ℹ️", `치수 속성 없는 큰 이미지 ${n}개`)] : [];
    },
  },
  {
    id: "asset.no-alt", axis: "asset", severity: "🟡", corpus: "exempt",   /* 접근성 결함: 코퍼스 판정 제외 */ title: "alt 없는 콘텐츠 이미지",
    evidence: "인용: WCAG 1.1.1(비텍스트 콘텐츠). 장식 이미지는 alt=\"\"가 정답이므로 null만 센다",
    threshold: { value: 0, basis: "citation" },
    run(scan, { vp }) {
      const n = vp.images.filter((i) => i.visible && i.rect.w >= 120 && i.alt === null).length;
      return n ? [finding(this, "🟡", `alt 속성 없는 이미지 ${n}개`)] : [];
    },
  },
];
