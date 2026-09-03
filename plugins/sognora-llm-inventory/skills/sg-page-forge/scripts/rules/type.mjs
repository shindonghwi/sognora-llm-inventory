/** rules/type.mjs — 타이포 축: 최소 크기, 굵기 비율, 스케일 단수(보고). 순수. */
import { finding, visibleText, bodyText, textArea, thresholdFrom } from "./_util.mjs";

export const rules = [
  {
    id: "type.min-size", axis: "type", severity: "🔴", corpus: "exempt", title: "판독 불능 크기의 텍스트(12px 하한, 본문 15px)",   /* 접근성 결함: 레퍼런스(stripe 10px 349개)가 어겨도 규칙은 남는다 — 코퍼스 판정 제외 */
    evidence: "인용: 본문 12px 절대 하한(WCAG 본문 가독 관행·forge-rules §1b) · 본문 15px 권장",
    threshold: { value: 12, basis: "citation" },
    run(scan, { vp }) {
      const small = visibleText(vp).filter((n) => n.cs.fs < 12 && n.textLen >= 2 && !n.attrs?.ariaHidden);   // 인용: 12px 하한(법적 고지·캡션 포함)
      const out = [];
      if (small.length) out.push(finding(this, "🔴", `12px 미만 텍스트 ${small.length}개 — 예: "${small[0].text.slice(0, 40)}" ${small[0].cs.fs}px`, { count: small.length }));
      const body = bodyText(vp); const under = body.filter((n) => n.cs.fs < 15);   // 권장: 본문 15px(forge-rules §1b)
      if (body.length && under.length / body.length > 0.5) out.push(finding(this, "🟡", `본문 노드 ${under.length}/${body.length}가 15px 미만`));
      return out;
    },
  },
  {
    id: "type.heavy-weight-share", axis: "type", severity: "🟡", title: "굵기 700 이상이 위계의 수단이다(가시 텍스트 면적 비율)",
    evidence: "실측: Kage 300/400/500 위주·600 1회·700+ 0, Sylva 300~600 — 위계는 서체 대비·크기·자간으로. 담화 v3(700/800)는 '허접'으로 판정됨. 임계는 코퍼스 기준선",
    threshold: { value: 0.35, basis: "corpus" },   // 폴백 0.35 — 코퍼스 기준선(references/corpus-baseline.json)이 있으면 그 값으로 자가 보정
    run(scan, { vp, baseline }) {
      const txt = visibleText(vp); if (!txt.length) return [];
      const heavy = txt.filter((n) => n.cs.fw >= 700);
      const share = textArea(heavy) / Math.max(1, textArea(txt));
      const th = thresholdFrom(baseline, this.id, this.threshold.value);
      if (share <= th.value) return [];
      return [finding(this, "🟡", `굵기 700+ 텍스트 면적 ${(share * 100).toFixed(0)}% (임계 ${(th.value * 100).toFixed(0)}%, ${th.basis}) — 300~600 안에서 서체 대비·크기·자간으로 위계를 만든다`)];
    },
  },
  {
    id: "type.scale-steps", axis: "type", severity: "ℹ️", title: "타입 스케일 단수(면적 가중 고유 크기) — 보고만",
    evidence: "forge-rules §1d: 절대 개수 규칙(TS1·TS2)은 코퍼스에서 과반 발동해 삭제됨(stripe 15개). 스케일 일관성은 패널이 캡처를 보고 판정한다",
    threshold: { value: 0, basis: "definition" },
    run(scan, { vp }) {
      const sizes = new Map();
      for (const n of visibleText(vp)) { const k = Math.round(n.cs.fs); sizes.set(k, (sizes.get(k) || 0) + n.rect.w * n.rect.h); }
      const total = [...sizes.values()].reduce((a, b) => a + b, 0);
      const steps = [...sizes.entries()].filter(([, a]) => a / total > 0.005).map(([k]) => k).sort((a, b) => a - b);   // 정의: 면적 0.5% 미만 크기는 잡음
      return [finding(this, "ℹ️", `크기 단계 ${steps.length}: ${steps.join("/")}px`, { steps })];
    },
  },
];
