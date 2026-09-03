/** rules/motion.mjs — 모션 축(정적 관측): transition:all, 무한 장식 루프, 300ms 초과 전환. hover transform은 behavior/probe 몫. 순수. */
import { finding, pxOf } from "./_util.mjs";

export const rules = [
  {
    id: "motion.transition-all", axis: "motion", severity: "🟡", title: "transition: all",
    evidence: "page-rules §6(Emil Kowalski) · forge-rules §2(transition: all 0개)",
    threshold: { value: 5, basis: "definition" },   // 정의: 5곳 이상이면 패턴(라이브러리 기본값 한두 곳은 흔함)
    run(scan, { vp }) {
      const hits = vp.nodes.filter((n) => n.visible && /^all\b/.test(n.cs.tr) && !/^all\s+0s/.test(n.cs.tr));
      return hits.length >= this.threshold.value ? [finding(this, "🟡", `transition:all ${hits.length}곳`)] : [];
    },
  },
  {
    id: "motion.infinite-loop", axis: "motion", severity: "🟡", title: "무한 반복 장식 애니메이션",
    evidence: "directions §6(infinite 루프 장식은 어느 자세에서도 금지) · Anthropic frontend-design(과한 애니메이션이 AI 티)",
    threshold: { value: 2, basis: "definition" },   // 정의: 2곳 이상(로딩 스피너 1곳은 정상)
    run(scan, { vp }) {
      const hits = vp.nodes.filter((n) => n.visible && /infinite/.test(n.cs.anim) && n.rect.w * n.rect.h > 24 * 24);   // 정의: 24×24 초과(스피너 제외)
      return hits.length >= this.threshold.value ? [finding(this, "🟡", `무한 루프 애니메이션 ${hits.length}곳 — 예: ${hits[0].cs.anim.split(" ")[0]}`)] : [];
    },
  },
  {
    id: "motion.slow-transition", axis: "motion", severity: "🟡", title: "300ms 초과 전환이 다수",
    evidence: "page-rules §6(Emil Kowalski: 150~250ms 적정, 300ms 초과 느림) · forge-rules §2(duration 1~2값 0.1~0.2s)",
    threshold: { value: 300, basis: "citation" },
    run(scan, { vp }) {
      const durs = vp.nodes.filter((n) => n.visible).map((n) => n.cs.tr.split(" ").pop()).map((d) => /ms$/.test(d) ? parseFloat(d) : /s$/.test(d) ? parseFloat(d) * 1000 : 0).filter((ms) => ms > 0);
      if (durs.length < 5) return [];
      const slow = durs.filter((ms) => ms > this.threshold.value).length;
      return slow / durs.length > 0.5 ? [finding(this, "🟡", `전환 ${durs.length}개 중 ${slow}개가 300ms 초과`)] : [];
    },
  },
];
