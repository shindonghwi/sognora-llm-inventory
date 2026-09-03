#!/usr/bin/env node
/**
 * copylint.mjs — scan.json의 가시 카피를 잰다. 길이·금칙어·상투어 + 형제 스킬(sg-en-humanize)의 detect_bilingual.py(한·영 알려진 패턴).
 *
 * usage: node copylint.mjs --scan scan.json [--genre landing|UI] [--out dir]
 * 규칙: copy.length(문장 25단어·문단 5문장·제목 65자 — 인용 GOV.UK 콘텐츠 가이드·NN/G) · copy.forbidden-words(오류 문구 금칙 + 한글 상투어) · copy.bilingual-pattern(외부 계기, 없으면 미제공)
 * 통과는 자연스러움의 증명이 아니다 — 의미·문맥은 사람이 읽는다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { parseArgs, siblingSkillFile } from "./_deps.mjs";
import { pickViewports } from "./rules/_util.mjs";

const FORBIDDEN = /(forbidden|illegal|\bsorry\b|\bplease\b|\binvalid\b|\boops\b|an error occurred)/i;   // 인용: GOV.UK 오류 문구 금칙
const CLICHE = /(혁신적인|손쉽게|간편하게|최고의 경험|지금 시작하세요|한 차원 높은|새로운 차원|완벽한|최적화된 솔루션|원스톱|토탈 솔루션|고객 만족을 위해|다양한 니즈)/;   // 근거: sg-ko-humanize 상투어 목록 요약(랜딩 장르)

export function lintCopy(scan, genre = "landing") {
  const { desktop } = pickViewports(scan); const vp = scan.viewports[desktop]; const findings = [];
  const heads = vp.copy.filter((c) => /^h[1-3]$/.test(c.tag)); const paras = vp.copy.filter((c) => /^(p|li|dd)$/.test(c.tag));
  const longHead = heads.filter((c) => c.text.length > 65);   // 인용: 제목 65자(GOV.UK)
  if (longHead.length) findings.push({ id: "copy.length", severity: "🟡", detail: `65자 초과 제목 ${longHead.length}개 — "${longHead[0].text.slice(0, 50)}…"` });
  const longSent = paras.flatMap((c) => c.text.split(/(?<=[.!?。])\s+/)).filter((s) => s.split(/\s+/).length > 25);   // 인용: 문장 25단어(GOV.UK)
  if (longSent.length) findings.push({ id: "copy.length", severity: "🟡", detail: `25단어 초과 문장 ${longSent.length}개` });
  const longPara = paras.filter((c) => c.text.split(/(?<=[.!?。])\s+/).length > 5);   // 인용: 문단 5문장
  if (longPara.length) findings.push({ id: "copy.length", severity: "🟡", detail: `5문장 초과 문단 ${longPara.length}개` });
  const forb = vp.copy.filter((c) => FORBIDDEN.test(c.text)); if (forb.length) findings.push({ id: "copy.forbidden-words", severity: "🟡", detail: `금칙 오류 문구 ${forb.length} — "${forb[0].text.slice(0, 40)}"` });
  const cli = vp.copy.filter((c) => CLICHE.test(c.text)); if (cli.length >= (genre === "landing" ? 2 : 3)) findings.push({ id: "copy.forbidden-words", severity: "🟡", detail: `한글 상투어 ${cli.length} — "${cli[0].text.slice(0, 40)}"` });   // 정의: 랜딩 2·UI 3 이상
  return { findings, copyText: vp.copy.map((c) => c.text) };
}

export function runBilingual(copyText, genre) {
  const py = siblingSkillFile("sg-en-humanize", "scripts/detect_bilingual.py");
  if (!py) return { severity: "미제공", detail: "sg-en-humanize/scripts/detect_bilingual.py 없음 — 한·영 패턴 축은 판정되지 않음" };
  const r = spawnSync("python3", [py, "-", "--genre", genre], { input: copyText.join("\n"), encoding: "utf8" });
  if (r.error) return { severity: "미제공", detail: `python3 실행 불가: ${r.error.message}` };
  const tail = (r.stdout || r.stderr || "").trim().split("\n").slice(-6).join(" / ").slice(0, 300);
  /* exit 규약(detect_bilingual.py): 0 통과 · 1 🔴 패턴 · 2 판정 안 함(장르 미지원 등) · 3 실행 오류(ko 검출기 부재 등) — 2·3은 결함이 아니라 판정되지 않음 */
  if (r.status === 0) return { severity: "✅", detail: `detect_bilingual exit 0 — ${tail}` };
  if (r.status === 1) return { severity: "🔴", detail: `detect_bilingual exit 1 — ${tail}` };
  return { severity: "미제공", detail: `detect_bilingual exit ${r.status}(판정 안 함/실행 오류) — ${tail}` };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(argv.slice(2)); if (!args.scan) { console.error("usage: copylint.mjs --scan scan.json [--genre landing|UI] [--out dir]"); exit(2); }
  const scan = JSON.parse(await readFile(args.scan, "utf8")); const genre = args.genre || "landing";
  const { findings, copyText } = lintCopy(scan, genre);
  const bi = runBilingual(copyText, genre); findings.push({ id: "copy.bilingual-pattern", ...bi });
  const md = [`# copylint — ${scan.finalUrl || scan.url} (${genre})`, "", ...findings.map((f) => `- ${f.severity} \`${f.id}\` ${f.detail}`), "", "통과는 자연스러움의 증명이 아니다 — 소리 내어 읽는다."].join("\n");
  if (args.out) { await mkdir(args.out, { recursive: true }); await writeFile(join(args.out, "copylint.md"), md); await writeFile(join(args.out, "copylint.json"), JSON.stringify(findings, null, 2)); }
  console.log(md); exit(findings.some((f) => f.severity === "🔴") ? 1 : 0);
}
