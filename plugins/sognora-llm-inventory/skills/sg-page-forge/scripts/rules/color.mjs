/** rules/color.mjs — 색 축: 보라 그라데이션, 그라데이션 텍스트, 컬러 글로우. 순수. */
import { finding, parseRgb, isPurpleish, saturation } from "./_util.mjs";

const gradientColors = (bgi) => [...String(bgi).matchAll(/rgba?\([^)]+\)/g)].map((m) => parseRgb(m[0])).filter(Boolean);

export const rules = [
  {
    id: "color.purple-gradient", axis: "color", severity: "🔴", title: "남보라~보라 그라데이션(2026년 가장 큰 AI 티)",
    evidence: "developersdigest 16패턴 #4 'VibeCode Purple' · 925studios(indigo→purple = Tailwind indigo-500 유산) · avoid-ai-design P0. 면제 가능(방향이 채택 선언 시)",
    threshold: { value: 1, basis: "definition" },
    run(scan, { vp }) {
      const hits = vp.nodes.filter((n) => n.visible && /gradient/.test(n.cs.bgi) && gradientColors(n.cs.bgi).some(isPurpleish) && n.rect.w * n.rect.h > 40 * 40);   // 정의: 40×40 이상 면적만(아이콘 제외)
      return hits.length ? [finding(this, "🔴", `보라 대역 그라데이션 ${hits.length}곳 — 예: <${hits[0].tag}> ${hits[0].rect.w}×${hits[0].rect.h}`)] : [];
    },
  },
  {
    id: "color.gradient-text", axis: "color", severity: "🟡", title: "그라데이션으로 채운 헤드라인(bg-clip:text)",
    evidence: "avoid-ai-design(gradient text headlines) · developersdigest #7",
    threshold: { value: 1, basis: "definition" },
    run(scan, { vp }) {
      const hits = vp.nodes.filter((n) => n.visible && n.textLen > 0 && /gradient/.test(n.cs.bgi) && /rgba\(\s*0,\s*0,\s*0,\s*0\)|transparent/.test(n.cs.color));
      return hits.length ? [finding(this, "🟡", `그라데이션 텍스트 ${hits.length}개 — 예: "${hits[0].text.slice(0, 30)}"`)] : [];
    },
  },
  {
    id: "color.glow-shadow", axis: "color", severity: "🟡", title: "채도 있는 컬러 글로우 섀도",
    evidence: "developersdigest #8 · no-slop-ui(restrained shadows) · page-rules §6",
    threshold: { value: 3, basis: "definition" },   // 정의: 3곳 이상이면 패턴(1~2곳은 시그니처일 수 있다)
    run(scan, { vp }) {
      const hits = vp.nodes.filter((n) => { if (!n.visible || !n.cs.shadow) return false; const cs = [...n.cs.shadow.matchAll(/rgba?\([^)]+\)/g)].map((m) => parseRgb(m[0])).filter(Boolean); const blur = [...n.cs.shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => +m[1]); return cs.some((c) => saturation(c) > 0.45) && blur.some((b) => b >= 20); });   // 정의: 채도 .45+ 색에 블러 20px+
      return hits.length >= this.threshold.value ? [finding(this, "🟡", `컬러 글로우 섀도 ${hits.length}곳`)] : [];
    },
  },

  {
    id: "token.shadcn-default", axis: "color", severity: "🟡", title: "렌더가 shadcn 기본 테마 조합(흰 배경 #fff·전경 #212121·보더 #e0e0e0)",
    evidence: "소스 축(conform token.shadcn-default)의 렌더 보조. 근거: 프로젝트 3개 globals.css 동일(2026-09-03 실측) · avoid-ai-design P0(untouched shadcn zinc)",
    threshold: { value: 3, basis: "definition" },   // 정의: 세 조합이 모두 맞을 때만
    run(scan, { vp }) {
      const body = vp.nodes.find((n) => n.tag === "body"); const bg = body ? parseRgb(body.cs.bg) : null;
      const white = bg && bg.r === 255 && bg.g === 255 && bg.b === 255;
      const fg = vp.nodes.filter((n) => n.visible && n.textLen > 20).map((n) => parseRgb(n.cs.color)).filter(Boolean);
      const dark = fg.length && fg.filter((c) => c.r === 33 && c.g === 33 && c.b === 33).length / fg.length > 0.5;
      const border = vp.nodes.some((n) => n.visible && /rgb\(224, 224, 224\)/.test(n.cs.bw));
      return white && dark && border ? [finding(this, "🟡", "body #ffffff · 본문 #212121 · 보더 #e0e0e0 — shadcn 기본 테마 렌더. 소스에서 token.shadcn-default 확인")] : [];
    },
  },
];
