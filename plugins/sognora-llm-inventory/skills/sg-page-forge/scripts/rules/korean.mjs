/** rules/korean.mjs — 한글 조판 축. 행간·이탤릭·자간·keep-all. 순수. */
import { finding, bodyText, visibleText, pxOf } from "./_util.mjs";

export const rules = [
  {
    id: "korean.line-height", axis: "korean", severity: "🔴", title: "한글 본문 행간이 1.5 미만이다",
    evidence: "인용: W3C klreq·forge-rules §1b(한글 본문 행간 ≥1.5, 20px 이하 본문에만 — 디스플레이의 1.05~1.2는 정상)",
    threshold: { value: 1.5, basis: "citation" },
    run(scan, { vp }) {
      const bad = bodyText(vp).filter((n) => n.hangul && n.textLen >= 40 && pxOf(n.cs.lh) !== null && pxOf(n.cs.lh) / n.cs.fs < 1.5);   // 인용: 1.5
      if (!bad.length) return [];
      return [finding(this, bad.length >= 3 ? "🔴" : "🟡", `행간 1.5 미만 한글 본문 ${bad.length}개 — 예: ${bad[0].cs.fs}px/${bad[0].cs.lh}`)];
    },
  },
  {
    id: "korean.italic", axis: "korean", severity: "🔴", title: "한글에 이탤릭",
    evidence: "인용: 한글 서체에는 이탤릭 자형이 없다(W3C klreq) — 기계 기울임은 조판 결함",
    threshold: { value: 0, basis: "definition" },
    run(scan, { vp }) {
      const bad = visibleText(vp).filter((n) => n.hangul && /italic|oblique/.test(n.cs.fst));
      return bad.length ? [finding(this, "🔴", `한글 이탤릭 ${bad.length}개 — 예: "${bad[0].text.slice(0, 30)}"`)] : [];
    },
  },
  {
    id: "korean.letter-spacing", axis: "korean", severity: "🟡", title: "한글 본문에 양수 자간",
    evidence: "인용: forge-rules §1b(한글 자간 0~미세 음수) · 실측: 라틴용 트래킹을 한글에 걸면 글자가 흩어진다. 소형 라벨(≤12px·짧은 텍스트)의 트래킹은 관행으로 허용",
    threshold: { value: 0.5, basis: "definition" },   // 정의: 0.5px 초과 양수 자간, 본문(20자 이상·13px 이상)에만
    run(scan, { vp }) {
      const bad = bodyText(vp).filter((n) => n.hangul && n.cs.fs >= 13 && pxOf(n.cs.ls) !== null && pxOf(n.cs.ls) > 0.5);
      return bad.length ? [finding(this, "🟡", `양수 자간 한글 본문 ${bad.length}개 — 예: ${bad[0].cs.ls} @${bad[0].cs.fs}px`)] : [];
    },
  },
  {
    id: "korean.keep-all", axis: "korean", severity: "🟡", title: "한글 제목·본문에 word-break:keep-all이 없어 어절이 잘린다",
    evidence: "관행(W3C klreq 어절 단위 줄바꿈) — 판정은 제목(h1~h3)과 리드문에만",
    threshold: { value: 0, basis: "definition" },
    run(scan, { vp }) {
      const heads = visibleText(vp).filter((n) => n.hangul && /^h[1-3]$/.test(n.tag) && n.textLen >= 12 && n.cs.wb !== "keep-all");
      return heads.length ? [finding(this, "🟡", `keep-all 없는 한글 제목 ${heads.length}개`)] : [];
    },
  },
];
