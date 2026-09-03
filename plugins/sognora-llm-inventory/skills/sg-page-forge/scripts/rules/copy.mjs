/** rules/copy.mjs — 카피 축(scan.copy 기반): 제작자 시점, 설명서 시점, 히어로 복제, 빈 페이지·얇은 콘텐츠. 길이·금칙어는 copylint.mjs. 순수. */
import { finding } from "./_util.mjs";

const MAKER = /(이어\s*붙였습니다|배치했습니다|놓았습니다|구성했습니다|반영했습니다|촬영했습니다|적용했습니다|설계했습니다|제작했습니다|만들었습니다|정리했습니다|넣었습니다)/;
const MANUAL = /(하시면 됩니다|입력하세요|입력해 주세요|먼저 .{1,12}한 뒤|다음 단계|클릭하세요|눌러주세요|선택하세요|업로드하세요)/;

export const rules = [
  {
    id: "copy.maker-voice", axis: "copy", severity: "🔴", title: "제작자 시점 카피(만든 사람이 자기가 한 일을 보고)",
    evidence: "forge-rules §2c-2 KO5 실전 사고('셀프 촬영·사용 장면을 짧게 이어 붙였습니다'). 검증: 문장 앞에 '우리가'를 붙여 자연스러우면 제작 노트",
    threshold: { value: 1, basis: "definition" },
    run(scan, { vp }) {
      const hits = vp.copy.filter((c) => /^(p|li|dd|span|small|blockquote)$/.test(c.tag) && MAKER.test(c.text));
      return hits.length ? [finding(this, "🔴", `제작자 시점 문장 ${hits.length}개 — 예: "${hits[0].text.slice(0, 60)}"`)] : [];
    },
  },
  {
    id: "copy.manual-voice", axis: "copy", severity: "🔴", title: "설명서 시점이 본문을 지배(절차를 가르치는 문장)",
    evidence: "forge-rules §2c-2 KO6·§2d 매뉴얼화 금지(매력 44/100 사고). 도구 화면의 실제 입력 라벨·힌트는 대상이 아니다",
    threshold: { value: 0.3, basis: "definition" },   // 정의: 본문 문장 중 30% 이상이 설명서 시점이면 지배
    run(scan, { vp, type }) {
      if (type && /^(tool|form|dashboard|document)$|^do:/.test(type)) return [];
      const paras = vp.copy.filter((c) => /^(p|li|dd)$/.test(c.tag) && c.text.length >= 15);
      if (paras.length < 4) return [];
      const hits = paras.filter((c) => MANUAL.test(c.text));
      return hits.length / paras.length >= this.threshold.value ? [finding(this, "🔴", `설명서 시점 ${hits.length}/${paras.length} 문장 — 예: "${hits[0].text.slice(0, 60)}"`)] : hits.length >= 3 ? [finding(this, "🟡", `설명서 시점 문장 ${hits.length}개`)] : [];
    },
  },
  {
    id: "copy.hero-repeat", axis: "copy", severity: "🟡", title: "마지막 CTA 헤드라인이 히어로를 어미까지 되풀이",
    evidence: "forge-rules §2d 히어로 카피 복제 금지",
    threshold: { value: 0.8, basis: "definition" },   // 정의: 정규화 후 80% 이상 일치
    run(scan, { vp }) {
      const heads = vp.copy.filter((c) => /^h[12]$/.test(c.tag) && c.text.length >= 8);
      if (heads.length < 2) return [];
      const norm = (s) => s.replace(/[\s.,!?·]/g, "").toLowerCase();
      const a = norm(heads[0].text), b = norm(heads[heads.length - 1].text);
      const common = [...a].filter((ch) => b.includes(ch)).length / Math.max(a.length, b.length);
      return heads[0] !== heads[heads.length - 1] && common >= this.threshold.value ? [finding(this, "🟡", `첫·끝 헤드라인 유사 ${(common * 100).toFixed(0)}% — "${heads[0].text.slice(0, 30)}" ↔ "${heads[heads.length - 1].text.slice(0, 30)}"`)] : [];
    },
  },
  {
    id: "page.blank", axis: "copy", severity: "🔴", title: "빈 화면(가시 텍스트·이미지 거의 없음)",
    evidence: "page-rules §0 alive: 런타임 에러·빈 화면 실전 사고(plan.highlights undefined)",
    threshold: { value: 80, basis: "definition" },   // 정의: 가시 텍스트 총 80자 미만이고 이미지 0
    run(scan, { vp }) {
      const total = vp.copy.reduce((s, c) => s + c.text.length, 0);
      const imgs = vp.images.filter((i) => i.visible).length;
      return total < this.threshold.value && imgs === 0 ? [finding(this, "🔴", `가시 텍스트 ${total}자·이미지 0 — 빈 화면(런타임 에러 ${scan.errors.page.length}건)`)] : [];
    },
  },
  {
    id: "content.thin", axis: "copy", severity: "🟡", title: "콘텐츠가 얇다(본문 300자 미만, 문서·소개 제외 아님)",
    evidence: "page-rules §0g 콘텐츠 조달 — 구조를 시키면 구조만 나온다. 빈 구조가 AI 티의 정체",
    threshold: { value: 300, basis: "definition" },
    run(scan, { vp, type }) {
      if (type && /^(tool|form|dashboard)$|^do:/.test(type)) return [];
      const total = vp.copy.reduce((s, c) => s + c.text.length, 0);
      return total >= 80 && total < this.threshold.value ? [finding(this, "🟡", `본문 총 ${total}자 — facts를 보강하거나 '콘텐츠 부족'으로 보고`)] : [];
    },
  },
];
