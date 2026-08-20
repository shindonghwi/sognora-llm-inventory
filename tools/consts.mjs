#!/usr/bin/env node
/**
 * consts.mjs — **판정을 가르는 숫자에 근거가 있는가**를 판정한다.
 *
 * 왜 있나 — 사용자 지적: *"하드코딩이 왜 이렇게 많은 거 같지, 모든 스킬에."*
 * 세어보니 판정(🔴/🟡)에 닿는 숫자가 8개 파일에 100건대였다. 그런데 **전부 결함은 아니다** —
 * 성격이 넷으로 갈린다:
 *
 *   1) 인용     — WCAG 44px 탭 타깃, 본문 12px 하한, GOV.UK 25단어, HTTP 400.
 *                 바꾸면 안 된다. 근거가 프로젝트 밖에 있다.
 *   2) 정의     — "배지는 80×80 이하", "글래스는 alpha<0.9". 무엇을 셀지 정하는 값이지
 *                 몇 개부터 실패인지를 정하는 값이 아니다.
 *   3) 방어     — 게이트가 일부러 소유하는 하한(forge `behavior.mjs`의 FLOOR=3).
 *                 검증 대상이 임계를 정하면 `{"minCount":0}`으로 통과한다 — 실제 사고다.
 *                 **자가 보정으로 바꾸면 그 구멍이 다시 열린다.**
 *   4) 임계     — 실제로 합격선을 긋는 값. 프로젝트가 바뀌면 틀린다.
 *                 여기만이 "자가 보정, 상수 금지"의 대상이다.
 *
 * 기계는 1~4를 구분하지 못한다. 그래서 **사람이 근거를 적었는가**로 판정한다:
 * 같은 줄이나 바로 위 주석에 근거 표지가 있으면 통과, 없으면 미근거로 센다.
 *
 * 그리고 **전량을 한 번에 실패시키지 않는다.** 항상 빨간 게이트는 무시당하고,
 * 이 레포의 원칙은 "막지 못하는 것을 막는 척하는 게 가장 나쁜 실패"다.
 * 대신 **래칫**이다 — 지금 수를 기준선으로 박고, 늘어나면 실패한다.
 * 임계 자가 보정과 같은 원리로, **엄격해지는 방향으로만 움직인다.**
 *
 * usage:
 *   node tools/consts.mjs             # 판정 (기준선 대비)
 *   node tools/consts.mjs --list      # 미근거 상수를 파일·줄까지 전부 출력
 *   node tools/consts.mjs --bless     # 현재 수를 새 기준선으로 기록(줄어들 때만)
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SKILLS = join(ROOT, "plugins", "sognora-llm-inventory", "skills");
const BASELINE = join(ROOT, "tools", "consts-baseline.json");

// 판정 방출 지점 — 스킬마다 시그니처가 다르다(add(sev,…) / add(ruleId,…) / flag(…) / *.push).
const EMIT = /(?<![\w.$])(add|flag)\s*\(|(findings|gates|T)\.push\s*\(|\bfindings\.append\(/;
// 판정 지점 위 몇 줄까지를 "그 판정의 조건절"로 볼 것인가
const LOOKBACK = 6;
const NUM = /(?<![\w.$])(\d+(?:\.\d+)?)(?![\w.])/g;
// 판정과 무관한 줄 — `tail(err, 8)`은 로그 꼬리 길이지 합격선이 아니다
const NOT_A_VERDICT = /timeout|waitFor|viewport|slice\(|substring|toFixed|padEnd|padStart|Math\.round|\.length - 1|exit\(|argv|process\.|parseInt\(|\btail\(|\.code ===/i;
// HTTP 상태코드는 표준이다 — 프로젝트가 바뀌어도 400은 400이다
const HTTP_LINE = /status/i;
const isHttpCode = (n) => /^\d{3}$/.test(n) && +n >= 100 && +n <= 599;
// 어디서나 나오는 구조적 숫자 — 임계로 세지 않는다
const TRIVIAL = new Set(["0", "1", "2", "100", "1000", "10"]);
// 근거 표지 — 사람이 "이 숫자가 어디서 왔는지" 적었다는 증거.
// 코드 주석뿐 아니라 **사용자에게 보여주는 판정 문구**도 근거가 된다("최대 5(NN/G)", "3~5개 권장(§4)").
// 룰북 절 참조(§0c)는 인용이다 — 숫자의 출처가 SSOT에 있다는 뜻이기 때문이다.
const GROUNDED = /근거|실측|인용|출처|표준|규범|권장|WCAG|GOV\.UK|Spectrum|Carbon|Primer|NN\/G|EU |폴백|자가 보정|기준선|사다리|코퍼스|일부러|소유한다|사고:|§/;

const args = new Set(argv.slice(2));
const rows = [];

for (const skill of readdirSync(SKILLS).filter((d) => statSync(join(SKILLS, d)).isDirectory())) {
  const dir = join(SKILLS, skill, "scripts");
  let files = [];
  try { files = readdirSync(dir); } catch { continue; }
  for (const f of files.filter((x) => /\.(mjs|js|py)$/.test(x))) {
    const path = join(dir, f);
    const lines = readFileSync(path, "utf8").split("\n");
    const seen = new Set();
    for (let i = 0; i < lines.length; i++) {
      if (!EMIT.test(lines[i])) continue;
      for (let k = Math.max(0, i - LOOKBACK); k <= i; k++) {
        const L = lines[k];
        if (/^\s*(\/\/|#|\*|\/\*)/.test(L)) continue;      // 주석줄 자체는 조건절이 아니다
        if (!/(>=|<=|>|<|===|!==|==)/.test(L)) continue;
        if (NOT_A_VERDICT.test(L)) continue;
        // 근거는 위 3줄 주석 ~ 조건절 ~ 판정 문구까지에서 찾는다.
        // 판정 문구를 포함하는 이유: 근거가 코드 주석이 아니라 사용자에게 보여주는
        // 문장에 적힌 경우가 많다 — "최대 5(NN/G)"처럼. 어디에 적혔든 적힌 것은 적힌 것이다.
        const context = [...lines.slice(Math.max(0, k - 3), k), ...lines.slice(k, i + 4)].join("\n");  // 판정 문구는 여러 줄에 걸친다
        const grounded = GROUNDED.test(context);
        for (const m of L.matchAll(NUM)) {
          if (TRIVIAL.has(m[1])) continue;
          const key = `${k}:${m[1]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const std = HTTP_LINE.test(L) && isHttpCode(m[1]);
          rows.push({ file: relative(ROOT, path), line: k + 1, num: m[1], grounded: grounded || std, code: L.trim().slice(0, 100) });
        }
      }
    }
  }
}

const bare = rows.filter((r) => !r.grounded);
const now = {};
for (const r of bare) now[r.file] = (now[r.file] ?? 0) + 1;

if (args.has("--list")) {
  for (const [file, n] of Object.entries(now).sort((a, b) => b[1] - a[1])) {
    console.log(`\n### ${file} — 미근거 ${n}건`);
    for (const r of bare.filter((x) => x.file === file)) console.log(`  L${String(r.line).padStart(4)} [${r.num}] ${r.code}`);
  }
}

let base = {};
try { base = JSON.parse(readFileSync(BASELINE, "utf8")).files ?? {}; }
catch { /* 첫 실행 — --bless로 기준선을 만든다 */ }

const total = bare.length;
const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);

console.log(
  `\n판정에 닿는 숫자 ${rows.length}건 · 근거 있음 ${rows.length - total}건 · **미근거 ${total}건**` +
  (Object.keys(base).length ? ` (기준선 ${baseTotal}건)` : " (기준선 없음)"));

if (args.has("--bless")) {
  if (Object.keys(base).length && total > baseTotal) {
    console.error(`🔴 기준선을 늘리는 --bless는 받지 않는다 (${baseTotal} → ${total}). 래칫은 조이는 쪽으로만 돈다.`);
    exit(1);
  }
  writeFileSync(BASELINE, JSON.stringify({
    $comment: "판정을 가르는 미근거 숫자의 상한. tools/consts.mjs가 판정한다. 늘릴 수 없고 줄일 수만 있다.",
    total, files: now,
  }, null, 2) + "\n");
  console.log(`✅ 기준선 기록 — ${total}건`);
  exit(0);
}

if (!Object.keys(base).length) {
  console.error("🔴 기준선이 없다. 먼저 만들어라: node tools/consts.mjs --bless");
  exit(2);
}

const grown = Object.entries(now).filter(([f, n]) => n > (base[f] ?? 0));
if (grown.length) {
  console.error(`\n🔴 근거 없는 판정 숫자가 늘었다 — 새 상수에는 근거를 적거나 프로젝트 기준선으로 자가 보정하라:`);
  for (const [f, n] of grown) console.error(`    ${f}  ${base[f] ?? 0} → ${n}`);
  console.error(`\n  근거 표지: 같은 줄이나 바로 위 주석에 실측·인용·표준·폴백·자가 보정 중 하나를 적는다.`);
  console.error(`  줄인 경우에만: node tools/consts.mjs --bless`);
  exit(1);
}
console.log(total < baseTotal ? `\n**통과** — 기준선보다 ${baseTotal - total}건 줄었다. --bless로 조여라` : "\n**통과** — 늘지 않았다");
exit(0);
