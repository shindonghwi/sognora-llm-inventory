/* check.mjs 판정은 순수 함수 checkRun으로 재현된다. 픽스처는 실제 런(nolpop 2026-09-02-001)의 형식을 따른다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { checkRun, tables, AXES } from "../scripts/check.mjs";

const reds = (r) => r.findings.filter((f) => f.severity === "🔴").map((f) => f.id);
const yellows = (r) => r.findings.filter((f) => f.severity === "🟡").map((f) => f.id);

const brief = `# 브리프\n\n## 인터뷰 원장\n\n| 질문 ID | 물었나 | 답 요지 | 쓰인 곳 (파일:섹션) |\n|---|---|---|---|\n| A1 | ✓ | 직접 겪은 불편 | 02_verdict §문제 |\n| C1 | ✓ | 소상공인 사장 | 03_prd §사용자 |\n| D2 | ✗(건너뜀) | — | — |\n\n쓰인 곳 없음: 없음.\n`;
const comp = `# 경쟁사\n\n| 경쟁사 | ${AXES.join(" | ")} | 충족 기준 |\n|${"---|".repeat(AXES.length + 2)}\n| [A](https://a.com) | 예약 | 빠름 | 월 9,900원 | 소상공인 | 구독 | 검색 | 리뷰 1,200(출처 https://a.com/reviews) | 느림(https://a.com/r/1) | 리뷰·보도 |\n| [B](https://b.com) | 예약 | 무료 | 0원 | 개인 | 광고 | 앱스토어 | 다운로드 10만(가정) | 광고 많음(https://b.com/r) | 랭킹·후기 |\n| 대체재: 카톡·수기 | 예약 접수 | 익숙함 | 0 | 전부 | 없음 | 구두 | — | 누락 잦음(가정) | 대체재 |\n`;
const verdict = `# 판정\n\n- 판정: **조건부 진입**\n\n## 단위 경제\n\n고정비(호스팅 월 20,000원, 출처 https://vercel.com/pricing)·변동비(AI 추론 건당 30원, 가정). 기여이익 8,000원. 손익분기 고객 수 **25명** (가정).\n\n시장 규모: 하향식 500억×2% = 10억(출처 통계청), 상향식 12,000곳×5%×9,900원×12.\n`;
const prd = `# PRD\n\n1. 한 줄 정의\n5. Non-goal\n`;
const ok = { "00_brief.md": brief, "01_competitors.md": comp, "02_verdict.md": verdict, "03_prd.md": prd };
const project = "/tmp/proj"; const run = join(project, ".sognora", "biz", "2026-09-03-001");

test("정상 런은 🔴 0", () => {
  const r = checkRun({ files: ok, runPath: run, cwdPath: project });
  assert.deepEqual(reds(r), [], JSON.stringify(r.findings));
  assert.ok(r.findings.some((f) => f.severity === "미제공" && f.id === "agent.judgment"), "에이전트 판정 항목은 미제공으로 남는다");
});

test("산출물 결손·비대상 파일·8축 소실(유통 채널)·손익분기 없음", () => {
  const compNoChannel = comp.replace(" | 유통 채널", "");
  const files = { "00_brief.md": brief, "01_competitors.md": compNoChannel, "02_verdict.md": verdict.replace(/손익분기 고객 수 \*\*25명\*\*/, "손익분기는 추후 산출"), "04_frontend_design_spec.md": "# 화면" };
  const r = checkRun({ files, runPath: run, cwdPath: project });
  const R = reds(r);
  assert.ok(R.includes("competitors.axis-missing"), "유통 채널 열 소실");
  assert.ok(R.includes("verdict.no-breakeven"), "손익분기 숫자 없음");
  assert.ok(yellows(r).includes("output.out-of-scope"), "04_ 파일은 비대상");
  assert.ok(yellows(r).includes("output.missing") || R.includes("output.missing"), "03_prd 없음은 보고된다");
});

test("금칙어(흐린 판정)·원장 표 없음·비용 질문 흔적은 🔴", () => {
  const files = { ...ok, "00_brief.md": "# 브리프\n\n종합: 사용자는 월 예산이 50만원이라고 답했다.\n", "02_verdict.md": verdict + "\n결론적으로 가능성은 있어 보입니다.\n" };
  const r = checkRun({ files, runPath: run, cwdPath: project });
  const R = reds(r);
  assert.ok(R.includes("brief.no-ledger")); assert.ok(R.includes("brief.asked-cost")); assert.ok(R.includes("copy.vague-verdict"));
});

test("홈 디렉터리에 만든 런은 위치 🔴", () => {
  const r = checkRun({ files: ok, runPath: join(homedir(), ".sognora", "biz", "2026-08-26-001"), cwdPath: project });
  assert.ok(reds(r).includes("run.location"));
});

test("프로필 스키마: 규정 외 항목·낡은 작성일은 🟡", () => {
  const profile = `# 프로필\n\n| 항목 | 내용 |\n|---|---|\n| 형태 | 1인 |\n| 보유 강점 | Next.js |\n| 목표 수준 | 본업 대체 |\n| 시장 집행 자원 | 마케팅비 있음 |\n| 병렬 한도 | 3 |\n| 접는 선 | 기여이익 0 |\n| 작성일 | 2025-01-01 |\n`;
  const r = checkRun({ files: ok, runPath: run, cwdPath: project, profile });
  const Y = yellows(r);
  assert.ok(Y.includes("profile.unknown-field")); assert.ok(Y.includes("profile.stale"));
});

test("tables()가 헤더·행 수를 읽는다", () => {
  const t = tables(comp)[0];
  assert.equal(t.rows, 3); assert.ok(t.header.includes("유통 채널"));
});
