/** rules/font.mjs — 서체 축. 한글 폴백·AI 기본값 서체. 순수. */
import { finding, visibleText, splitFamilies, HANGUL_FAMILIES, AI_DEFAULT_FAMILIES, textArea, bodyText } from "./_util.mjs";

export const rules = [
  {
    id: "font.hangul-fallback", axis: "font", severity: "🔴", title: "한글 텍스트가 한글 대응 서체 없이 시스템 폴백으로 떨어진다",
    evidence: "W3C klreq(한글 조판 요구사항) · 실측: 라틴만 지정하면 한글은 시스템 고딕으로 떨어져 굵기·기준선이 어긋난다(담화 v3)",
    threshold: { value: 0.2, basis: "definition" },   // 정의: 한글 텍스트 면적의 20% 이상이 폴백이면 보고(개별 노드 한두 개는 아이콘 폰트 등 예외)
    run(scan, { vp }) {
      const ko = visibleText(vp).filter((n) => n.hangul);
      if (!ko.length) return [];
      const bad = ko.filter((n) => !splitFamilies(n.cs.ff).some((f) => HANGUL_FAMILIES.test(f)));
      const share = textArea(bad) / Math.max(1, textArea(ko));
      if (share < this.threshold.value) return [];
      const stacks = [...new Set(bad.map((n) => n.cs.ff))].slice(0, 3);
      return [finding(this, "🔴", `한글 텍스트 면적 ${(share * 100).toFixed(0)}%가 한글 서체 미지정 스택 — ${stacks.join(" / ")}`, { count: bad.length })];
    },
  },
  {
    id: "font.ai-default", axis: "font", severity: "🟡", title: "본문 서체가 AI 기본값 하나뿐이다(디스플레이 서체 페어링 없음)",
    evidence: "developersdigest 16패턴 #1·#2(Inter 일색·같은 조합 반복) · 925studios(Inter는 기본값이라 제네릭) · Anthropic frontend-design(기본 페어링 회피). 금지가 아니라 '근거 없이 쓰면' 위반 — exemptions.md로 채택 선언 가능",
    threshold: { value: 2, basis: "definition" },   // 정의: 페이지 전체에 서체 계열이 2개 미만이면 페어링 없음
    run(scan, { vp }) {
      const txt = visibleText(vp);
      if (!txt.length) return [];
      const fams = new Map();
      for (const n of txt) { const first = splitFamilies(n.cs.ff)[0]; if (!first) continue; fams.set(first.toLowerCase(), (fams.get(first.toLowerCase()) || 0) + n.rect.w * n.rect.h); }
      const ranked = [...fams.entries()].sort((a, b) => b[1] - a[1]);
      const primary = ranked[0]?.[0];
      const distinct = ranked.filter(([, a]) => a > ranked[0][1] * 0.03).length;   // 정의: 면적 3% 미만 계열은 페어링으로 세지 않는다
      if (primary && AI_DEFAULT_FAMILIES.test(primary) && distinct < this.threshold.value) return [finding(this, "🟡", `본문 서체 "${primary}" 단독(서체 계열 ${distinct}) — 디스플레이·숫자 서체와 페어링하거나 exemptions.md에 채택 사유를 적는다`)];
      return [];
    },
  },
];
