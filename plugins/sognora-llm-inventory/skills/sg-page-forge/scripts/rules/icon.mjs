/** rules/icon.mjs — 아이콘 축: 이모지 아이콘, 번호 텍스트 목록, 제네릭 세트+동어반복. 순수. */
import { finding, childrenOf } from "./_util.mjs";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2728}]/u;

export const rules = [
  {
    id: "icon.emoji", axis: "icon", severity: "🟡", title: "이모지를 아이콘으로 쓴다(내비·카드·목록)",
    evidence: "developersdigest #15(내비 이모지 — 단일 지표로 가장 강함) · page-rules §6(링크 3개 이상 중 40% 초과) · ✦ 반짝이(NN/G n=107, 'AI'로 읽은 사람 0명 — 그래도 서명이다)",
    threshold: { value: 0.4, basis: "citation" },   // 인용: 내비 링크 40% 초과(page-rules §6)
    run(scan, { vp }) {
      const emo = vp.nodes.filter((n) => n.visible && EMOJI.test(n.text));
      if (!emo.length) return [];
      const links = vp.interactive.filter((i) => i.tag === "a"); const linkEmo = links.filter((i) => EMOJI.test(i.text));
      const sev = links.length >= 3 && linkEmo.length / links.length > this.threshold.value ? "🔴" : "🟡";
      return [finding(this, sev, `이모지 아이콘 ${emo.length}곳(내비 링크 ${linkEmo.length}/${links.length})`)];
    },
  },
  {
    id: "icon.numbered-list", axis: "icon", severity: "🔴", title: "번호 텍스트 목록으로 실체(건물·제품·산출물)를 설명",
    evidence: "forge-rules §2d(시각 실체는 이미지로 — 레퍼런스 18종 실측 0건) · developersdigest #13",
    threshold: { value: 3, basis: "definition" },
    run(scan, { vp }) {
      const items = vp.nodes.filter((n) => n.visible && /^(0?[1-9]|STEP\s*0?[1-9]|단계\s*[1-9])\b/i.test(n.text.trim()) && n.textLen >= 12 && n.rect.h >= 40);   // 정의: "01 건물의 주요 외벽" 형태의 항목
      return items.length >= this.threshold.value ? [finding(this, "🔴", `번호 텍스트 항목 ${items.length}개 — 예: "${items[0].text.slice(0, 40)}"`)] : [];
    },
  },
  {
    id: "icon.generic-set", axis: "icon", severity: "🟡", title: "같은 어미로 끝나는 항목 나열 + 제네릭 시스템 아이콘 세트(이중 위반)",
    evidence: "forge-rules §2d 동어반복 금지(실전 평가 '가장 AI스러운 프레임') · page-rules §6(Lucide 5종 + 모든 CTA에 ArrowRight)",
    threshold: { value: 3, basis: "definition" },   // 정의: 같은 행 제목 3개 이상이 같은 마지막 어절로 끝남
    run(scan, { vp }) {
      const heads = vp.nodes.filter((n) => n.visible && /^h[3-5]$/.test(n.tag) && n.textLen >= 4 && n.textLen <= 30);
      const rows = new Map(); for (const h of heads) { const k = Math.round(h.rect.y / 24); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(h); }
      const bad = [...rows.values()].filter((r) => r.length >= this.threshold.value && new Set(r.map((h) => h.text.trim().split(/\s+/).pop())).size === 1);
      if (!bad.length) return [];
      const svgAbove = bad[0].filter((h) => childrenOf(vp, h.parent).some((c) => c.tag === "svg" && c.rect.y < h.rect.y)).length;
      return [finding(this, "🟡", `동어반복 항목 행 ${bad.length}개 — 예: "${bad[0].map((h) => h.text).join(" / ").slice(0, 70)}"${svgAbove ? ` (+아이콘 ${svgAbove})` : ""}`)];
    },
  },
  {
    id: "icon.decorative", axis: "icon", severity: "🟡", title: "의미 결합 없는 장식 아이콘·블롭",
    evidence: "forge-rules §1 IC4(장식 블롭) — 아이콘은 양방향 규칙: 장식 금지, 그러나 앵커 0인 텍스트 벽도 금지",
    threshold: { value: 3, basis: "definition" },   // 정의: 텍스트 없는 부모 아래 큰(≥120px) 원형 그라데이션 블록 3개 이상
    run(scan, { vp }) {
      const blobs = vp.nodes.filter((n) => n.visible && n.textLen === 0 && n.rect.w >= 120 && n.rect.h >= 120 && /gradient/.test(n.cs.bgi) && /50%|9999|999px/.test(n.cs.radius) && (n.cs.op < 1 || /blur/.test(n.cs.bd)));
      return blobs.length >= this.threshold.value ? [finding(this, "🟡", `장식 블롭 ${blobs.length}개`)] : [];
    },
  },
];
