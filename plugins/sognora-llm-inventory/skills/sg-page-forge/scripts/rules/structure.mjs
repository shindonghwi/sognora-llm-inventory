/** rules/structure.mjs — 유형별 필수 구조와 "일이 첫 화면의 주인공인가". ctx.type이 정한다. 순수.
 *  유형: landing · about · document · catalog · tool · pricing · form · dashboard · read:<라벨> · do:<라벨> */
import { finding, inViewport, childrenOf } from "./_util.mjs";
import { cardRows } from "./layout.mjs";

export const TYPES = ["landing", "about", "document", "catalog", "tool", "pricing", "form", "dashboard"];
export const READ_TYPES = new Set(["landing", "about", "document"]);
export function verbOf(type) { if (!type) return null; if (type.startsWith("read:")) return "read"; if (type.startsWith("do:")) return "do"; return READ_TYPES.has(type) ? "read" : TYPES.includes(type) ? "do" : null; }

const inputs = (vp) => vp.interactive.filter((i) => !i.fixed && (i.tag === "input" || i.tag === "textarea" || i.tag === "select") && !/^(hidden|submit|button|checkbox|radio)$/.test(i.type));
const visibleInputs = (vp) => inputs(vp).filter((i) => i.rect.w > 1 && i.rect.h > 1);   // 정의: 1×1 숨은 file input은 세지 않는다
const tables = (vp) => vp.nodes.filter((n) => n.visible && n.tag === "table");
const canvases = (vp) => vp.nodes.filter((n) => n.visible && (n.tag === "canvas" || n.tag === "video") && n.rect.w >= 200);

/** 유형별 "일" 요소의 첫 y와 첫 화면 점유 면적 */
export function workOf(vp, type) {
  const v = verbOf(type);
  let els = [];
  if (type === "tool" || type?.startsWith("do:")) els = [...visibleInputs(vp).map((i) => i.rect), ...canvases(vp).map((n) => n.rect)];
  if (type === "catalog") els = cardRows(vp).flatMap((r) => r.cards.map((c) => c.rect));
  if (type === "form") els = visibleInputs(vp).map((i) => i.rect);
  if (type === "dashboard") els = [...tables(vp).map((n) => n.rect), ...cardRows(vp).flatMap((r) => r.cards.map((c) => c.rect)), ...visibleInputs(vp).map((i) => i.rect)];
  if (type === "pricing") els = [...tables(vp).map((n) => n.rect), ...cardRows(vp).flatMap((r) => r.cards.map((c) => c.rect))];
  if (v === "read") els = vp.copy.map((c) => vp.nodes[c.i].rect);
  const firstY = els.length ? Math.min(...els.map((r) => r.y)) : null;
  /* 첫 화면 점유율: 뷰포트와 겹치는 면적 합 / 뷰포트 면적(겹침 중복은 무시 — 상한 1) */
  const share = Math.min(1, els.reduce((s, r) => { const y0 = Math.max(0, r.y), y1 = Math.min(vp.height, r.y + r.h); return y1 > y0 ? s + Math.max(0, Math.min(vp.width, r.x + r.w) - Math.max(0, r.x)) * (y1 - y0) : s; }, 0) / (vp.width * vp.height));
  return { verb: v, firstY, share, count: els.length, measured: els.length > 0 };
}

export const rules = [
  {
    id: "work.below-fold", axis: "structure", severity: "🔴", title: "하는 화면의 일(입력·항목·데이터)이 첫 화면 밖에서 시작",
    evidence: "page-rules §0c 실측 사다리(카탈로그 히어로 패딩 180→y603 통과 · 300→783 🟡 · 420→1003 🔴)",
    threshold: { value: 1, basis: "definition" },   // 정의: 뷰포트 높이의 1배 밖 = 🔴, 하단 1/3 = 🟡
    run(scan, { vp, type }) {
      const w = workOf(vp, type); if (w.verb !== "do") return [];
      if (!w.measured) return [finding(this, "🟡", `일 요소를 표준 마크업에서 찾지 못함(${type}) — 없다는 뜻이 아니다(커스텀 컨트롤·가상 스크롤). 마크업을 표준으로`, { id: "work.unmeasured" })];
      if (w.firstY >= vp.height) return [finding(this, "🔴", `일의 첫 등장 y=${w.firstY} (뷰포트 ${vp.height}) — 소개문·여백을 걷어내고 일을 위로`)];
      if (w.firstY >= vp.height * 2 / 3) return [finding(this, "🟡", `일의 첫 등장 y=${w.firstY} — 첫 화면 하단 1/3`, { id: "work.low" })];
      return [];
    },
  },
  {
    id: "work.starved", axis: "structure", severity: "🔴", title: "하는 화면인데 일이 첫 화면을 덜 덮는다(읽는 화면보다도)",
    evidence: "page-rules §0f 실측: 카탈로그 69%·폼 59% vs 굶은 대시보드 20/15/11%, 정책 문서 25/23% — 23%와 59% 사이가 비어 있다. 임계는 그 프로젝트 읽는 화면 본문 점유율 중앙값(sameness가 계산), 폴백 25%",
    threshold: { value: 0.25, basis: "definition" },   // 폴백 하한 25%(실측 사다리) — 프로젝트 읽는 화면으로 자가 보정(엄격해지는 방향으로만)
    run(scan, { vp, type, readShareMedian }) {
      const w = workOf(vp, type); if (w.verb !== "do" || !w.measured) return [];
      const th = Math.max(this.threshold.value, readShareMedian || 0);
      if (w.share >= th) return [];
      const inkShare = Math.min(1, vp.copy.reduce((s, c) => { const r = vp.nodes[c.i].rect; return r.y < vp.height ? s + r.w * Math.min(r.h, vp.height - r.y) : s; }, 0) / (vp.width * vp.height));
      const rx = inkShare > w.share ? "소개문을 걷어내라" : "실체(항목·데이터·컨트롤)를 넣어라";
      return [finding(this, "🔴", `일 점유율 ${(w.share * 100).toFixed(0)}% < ${(th * 100).toFixed(0)}%(${readShareMedian ? "읽는 화면 자" : "폴백"}) — 나머지는 ${inkShare > w.share ? "글" : "여백"}: ${rx}. 분류된 요소가 그 화면의 일이 아니면 계기의 오분류다`)];
    },
  },
  {
    id: "structure.prose-only", axis: "structure", severity: "🔴", title: "글만 있는 페이지(본문 500자당 구조 요소 1개 미만)",
    evidence: "page-rules §1b 실측 사다리: 도구 32·폼 15·요금제 7.5·랜딩 5.6 ‖ 소개 0.92·카탈로그 0 — 1.0에서 갈린다. 문서 유형 제외(글이 본체)",
    threshold: { value: 1.0, basis: "definition" },
    run(scan, { vp, type }) {
      if (type === "document" || type?.startsWith("read:")) return [];
      const chars = vp.copy.reduce((s, c) => s + c.text.length, 0); if (chars < 80) return [];   // 정의: 80자 미만은 THIN의 일
      const lists = vp.nodes.filter((n) => n.visible && (n.tag === "ul" || n.tag === "ol") && childrenOf(vp, n.i).length >= 3).length;
      const media = vp.images.filter((i) => i.visible && i.rect.w >= 200 && i.rect.h >= 150).length;
      const structural = visibleInputs(vp).length + tables(vp).length + lists + media + cardRows(vp).length + vp.interactive.filter((i) => /^#/.test(i.href)).length;
      const density = structural / (chars / 500);
      return density < this.threshold.value ? [finding(this, "🔴", `구조 밀도 ${density.toFixed(2)}/500자 (구조 요소 ${structural}, 본문 ${chars}자) — 컴포넌트 층부터 세운다`)] : [];
    },
  },
  {
    id: "catalog.too-few-items", axis: "structure", severity: "🔴", title: "카탈로그 항목 4개 미만",
    evidence: "page-rules §7(반복 항목 그리드가 카탈로그의 정체)",
    threshold: { value: 4, basis: "definition" },
    run(scan, { vp, type }) { if (type !== "catalog") return []; const items = cardRows(vp).reduce((s, r) => s + r.cards.length, 0); return items < this.threshold.value ? [finding(this, "🔴", `반복 항목 ${items}개`)] : []; },
  },
  {
    id: "catalog.no-entry-action", axis: "structure", severity: "🔴", title: "항목에 진입 액션이 없다(설명만 있고 들어갈 데가 없음)",
    evidence: "page-rules §7('Use Now →' — 설명만 있고 들어갈 데가 없으면 카탈로그가 아니다)",
    threshold: { value: 0.5, basis: "definition" },
    run(scan, { vp, type }) {
      if (type !== "catalog") return [];
      const rows = cardRows(vp); if (!rows.length) return [];
      const withAction = rows.flatMap((r) => r.cards).filter((c) => vp.interactive.some((i) => i.rect.x >= c.rect.x && i.rect.y >= c.rect.y && i.rect.x + i.rect.w <= c.rect.x + c.rect.w + 1 && i.rect.y + i.rect.h <= c.rect.y + c.rect.h + 1));
      const total = rows.reduce((s, r) => s + r.cards.length, 0);
      return withAction.length / total < this.threshold.value ? [finding(this, "🔴", `진입 액션 있는 항목 ${withAction.length}/${total}`)] : [];
    },
  },
  {
    id: "tool.no-input", axis: "structure", severity: "🔴", title: "도구 화면에 보이는 입력(텍스트·파일·캔버스)이 없다",
    evidence: "page-rules §8(입력이 화면 상단에) · hidden csrf로 통과하던 구멍 폐쇄(보이는 입력만 센다)",
    threshold: { value: 1, basis: "definition" },
    run(scan, { vp, type }) { if (type !== "tool" && !type?.startsWith("do:")) return []; const n = visibleInputs(vp).length + canvases(vp).length; return n < this.threshold.value ? [finding(this, "🔴", `보이는 입력 0 — 커스텀 드롭존이면 <form>/<label>로 감싸 표준 마크업으로`)] : []; },
  },
  {
    id: "pricing.no-price", axis: "structure", severity: "🔴", title: "요금제 페이지에 가격·문의 마커가 전무",
    evidence: "page-rules §0b NOT-A-PRICING(pricing의 유일한 🔴 — 법 관련 검사는 존재만 🟡)",
    threshold: { value: 1, basis: "definition" },
    run(scan, { vp, type }) { if (type !== "pricing") return []; const priceLike = vp.copy.filter((c) => /(₩|\$|€|원|USD|KRW|\/\s*(월|년|month|year|mo|yr)|무료|free|문의|contact)/i.test(c.text)).length; return priceLike < this.threshold.value ? [finding(this, "🔴", "가격·주기·문의 마커 0")] : []; },
  },
  {
    id: "pricing.legal-notice", axis: "structure", severity: "🟡", title: "요금제 법적 고지 존재 확인(세금 포함·자동갱신·체험 후 가격) — 적법성 판정이 아니다",
    evidence: "인용: EU 소비자권리지침 Art.6(1)(e) · 영국 DMCCA 2024 s.230 · 캘리포니아 B&P §17602 — 기계는 존재만 본다",
    threshold: { value: 0, basis: "citation" },
    run(scan, { vp, type }) { if (type !== "pricing") return []; const txt = vp.copy.map((c) => c.text).join(" "); const miss = []; if (!/(VAT|부가세|세금|tax)/i.test(txt)) miss.push("세금 포함 여부"); if (!/(자동\s*갱신|auto-?renew|갱신)/i.test(txt)) miss.push("자동갱신 조건"); return miss.length ? [finding(this, "🟡", `고지 미발견: ${miss.join(", ")} — 존재만 확인, 적법성 판정이 아니다`)] : []; },
  },
  {
    id: "form.too-few-fields", axis: "structure", severity: "🔴", title: "폼 필드 2개 미만",
    evidence: "page-rules §4(문의 폼 3~5개 필드, NN/G)",
    threshold: { value: 2, basis: "citation" },
    run(scan, { vp, type }) { if (type !== "form") return []; const n = visibleInputs(vp).length; return n < this.threshold.value ? [finding(this, "🔴", `보이는 필드 ${n}개`)] : []; },
  },
  {
    id: "dashboard.thin", axis: "structure", severity: "🟡", title: "대시보드에 반복 데이터·조작 요소가 없다",
    evidence: "page-rules §5(반복 데이터 + 상태 화면)",
    threshold: { value: 1, basis: "definition" },
    run(scan, { vp, type }) { if (type !== "dashboard") return []; const n = tables(vp).length + cardRows(vp).length + visibleInputs(vp).length; return n < this.threshold.value ? [finding(this, "🟡", "표·반복 항목·입력 0 — 빈 상태면 데이터를 넣고 다시 재라")] : []; },
  },
  {
    id: "document.no-header", axis: "structure", severity: "🟡", title: "문서에 시행일·문의처가 없다",
    evidence: "page-rules §0b(문서 = 시행일·문의처 + 목차 + 번호 붙은 절)",
    threshold: { value: 0, basis: "definition" },
    run(scan, { vp, type }) { if (type !== "document") return []; const txt = vp.copy.map((c) => c.text).join(" "); const miss = []; if (!/(시행일|시행\s*20\d\d|effective|updated|개정)/i.test(txt)) miss.push("시행일"); if (!/(문의|contact|@|전화|tel)/i.test(txt)) miss.push("문의처"); return miss.length ? [finding(this, "🟡", `문서 헤더 미발견: ${miss.join(", ")}`)] : []; },
  },
  {
    id: "document.no-toc", axis: "structure", severity: "🟡", title: "긴 문서에 목차(앵커)가 없다",
    evidence: "page-rules §0b · NN/G 헤딩 스캔(레이어 케이크 패턴)",
    threshold: { value: 3, basis: "definition" },   // 정의: h2 3개 이상인 문서에 앵커 링크 0
    run(scan, { vp, type }) { if (type !== "document") return []; const h2 = vp.copy.filter((c) => c.tag === "h2").length; const anchors = vp.interactive.filter((i) => /^#./.test(i.href)).length; return h2 >= this.threshold.value && anchors === 0 ? [finding(this, "🟡", `h2 ${h2}개인데 목차 앵커 0`)] : []; },
  },
  {
    id: "type.landing-drift", axis: "structure", severity: "🔴", title: "하는 화면·소개·문서에 랜딩 설득 섹션(후기·가격 밴드)이 흘러들었다",
    evidence: "page-rules §0b LANDING-DRIFT — 단어가 아니라 섹션 실체로 판정(인용 블록 2+ / testimonial 블록 h≥120 / '월 N원' 가격 패턴)",
    threshold: { value: 2, basis: "definition" },
    run(scan, { vp, type }) {
      if (!type || type === "landing" || type === "pricing") return [];
      const quotes = vp.nodes.filter((n) => n.visible && (n.tag === "blockquote" || /testimonial|review|후기/i.test(n.attrs?.cls || "")) && n.rect.h >= 120).length;
      const prices = vp.copy.filter((c) => /(월|년|\/mo|\/month)\s*[\d,]+\s*원|₩\s*[\d,]+|\$\s*\d+\s*\/\s*(mo|month)/i.test(c.text)).length;
      const hits = [];
      if (quotes >= this.threshold.value) hits.push(`후기 블록 ${quotes}`);
      if (prices >= this.threshold.value && type !== "pricing") hits.push(`가격 패턴 ${prices}`);
      return hits.length ? [finding(this, "🔴", `랜딩 표류: ${hits.join(", ")} (${type})`)] : [];
    },
  },
];
