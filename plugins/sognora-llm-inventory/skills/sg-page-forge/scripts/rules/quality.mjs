/** rules/quality.mjs — 품질 바닥(QF): 미학 이전, 콘텐츠·조작이 파손됨(이진). 가로 오버플로·정지 시 숨은 텍스트·탭 타깃·런타임 오류. 순수. */
import { finding, inViewport } from "./_util.mjs";

export const rules = [
  {
    id: "quality.overflow-x", axis: "quality", severity: "🔴", title: "가로 오버플로(레이아웃 파손)",
    evidence: "forge-rules §1 QF1(차단)",
    threshold: { value: 0, basis: "definition" },
    run(scan, { vp, vpKey }) { return vp.overflowX ? [finding(this, "🔴", `${vpKey}: 문서 폭이 뷰포트를 넘는다`)] : []; },
  },
  {
    id: "text.hidden-at-rest", axis: "quality", severity: "🔴", title: "정지 상태에서 숨은 텍스트(리빌의 opacity:0 잔류)",
    evidence: "forge-rules §1 QF2(콘텐츠 소실 — 리빌은 기본 가시로 설계) · 실전 사고: no-JS·reduced-motion에서 텍스트 비가시",
    threshold: { value: 0.1, basis: "definition" },   // 정의: 뷰포트 안 텍스트 노드의 10% 이상이 opacity<0.05
    run(scan, { vp }) {
      const inView = vp.nodes.filter((n) => n.textLen >= 4 && inViewport(n, vp) && n.rect.w > 0 && n.rect.h > 0);
      const hidden = inView.filter((n) => n.cs.op < 0.05 && n.cs.disp !== "none");
      return inView.length && hidden.length / inView.length >= this.threshold.value ? [finding(this, "🔴", `첫 화면 텍스트 ${hidden.length}/${inView.length}가 opacity 0(스크롤 후 정지 상태) — 예: "${hidden[0].text.slice(0, 40)}"`)] : [];
    },
  },
  {
    id: "quality.tap-target", axis: "quality", severity: "🔴", corpus: "exempt",   /* 접근성 결함(WCAG 2.5.8): 레퍼런스가 어겨도 규칙은 남는다 */ title: "모바일 탭 타깃 44px 미만",
    evidence: "인용: WCAG 2.5.5 Target Size 44×44 CSS px",
    threshold: { value: 44, basis: "citation" },
    run(scan, { vp }) {
      if (vp.width >= 800) return [];
      const small = vp.interactive.filter((i) => !i.fixed && i.rect.w > 0 && i.rect.h > 0 && i.rect.h < 44 && i.rect.w < 44 && i.tag !== "a");   // 인용: WCAG 44px — 본문 인라인 링크는 예외
      const smallBtn = vp.interactive.filter((i) => (i.tag === "button" || i.type === "submit") && i.rect.h > 0 && i.rect.h < 44);
      const n = small.length + smallBtn.length;
      return n ? [finding(this, n >= 3 ? "🔴" : "🟡", `44px 미만 탭 타깃 ${n}개 — 예: <${(small[0] || smallBtn[0]).tag}> "${(small[0] || smallBtn[0]).text.slice(0, 20)}" ${(small[0] || smallBtn[0]).rect.w}×${(small[0] || smallBtn[0]).rect.h}`)] : [];
    },
  },
  {
    id: "quality.runtime-error", axis: "quality", severity: "🔴", corpus: "exempt",   /* 살아있음 축: 외부 사이트의 트래커 콘솔 오류는 취향이 아니라 소음 — 코퍼스 판정 제외 */ title: "런타임·콘솔 오류",
    evidence: "page-rules §0 alive 실전 사고(요금제 페이지 plan.highlights undefined로 죽음)",
    threshold: { value: 0, basis: "definition" },
    run(scan) {
      const p = scan.errors.page.length, c = scan.errors.console.length;
      if (!p && !c) return [];
      return [finding(this, p ? "🔴" : "🟡", `페이지 오류 ${p}·콘솔 오류 ${c} — ${(scan.errors.page[0] || scan.errors.console[0] || "").slice(0, 120)}`)];
    },
  },
];
