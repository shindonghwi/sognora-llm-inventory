/** rules/state.mjs — 상태 커버리지(소스 필요): 목록 렌더에 빈 상태 분기가 있는가. ctx.srcFiles = [{path, text}]. 순수. */
import { finding } from "./_util.mjs";

export const rules = [
  {
    id: "state.empty-missing", axis: "state", severity: "🟡", title: "목록·표를 그리는 컴포넌트에 빈 상태(0건) 분기가 없다",
    evidence: "page-rules §5(빈 상태는 가장 가치 높은 신호 — 'No data found'만 있으면 미달) · CHI EA 2026(오류 예방·복구 지원율 낮음)",
    threshold: { value: 0, basis: "definition" },
    run(scan, { srcFiles }) {
      if (!srcFiles) return [finding(this, "미제공", "소스 디렉터리가 없어 판정되지 않음(--src)")];
      const out = [];
      for (const f of srcFiles) {
        if (!/\.(tsx|jsx|vue|svelte|astro|html)$/.test(f.path)) continue;
        const renders = (f.text.match(/\.map\(\s*\(?\s*[\w{},\s]+\)?\s*=>/g) || []).length;
        if (!renders) continue;
        const hasEmpty = /(length\s*===?\s*0|\.length\s*\?|!\w+\.length|isEmpty|EmptyState|empty-state|비어|없습니다|아직 .{0,10}없)/.test(f.text);
        if (!hasEmpty) out.push(f.path);
      }
      return out.length ? [finding(this, "🟡", `빈 상태 분기 없는 목록 렌더 ${out.length}파일 — 예: ${out[0]}`)] : [];
    },
  },
  {
    id: "state.hardcoded-metric", axis: "state", severity: "🟡", title: "정적 마크업의 가짜 지표('10K+ users'·'99.9%')와 샘플 이름",
    evidence: "page-rules §6 가짜 데이터(Acme Corp·John Doe·Item 1/2/3, 모든 지표 카드에 초록 상승 화살표)",
    threshold: { value: 1, basis: "definition" },
    run(scan, { vp }) {
      const hits = vp.copy.filter((c) => /(Acme|John Doe|Jane Doe|Lorem|ipsum|홍길동|Item \d|테스트 사용자|\b99\.9%|10K\+|\bTBD\b)/i.test(c.text));
      return hits.length ? [finding(this, "🟡", `샘플·가짜 데이터 흔적 ${hits.length} — "${hits[0].text.slice(0, 40)}"`)] : [];
    },
  },
];
