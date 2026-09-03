/**
 * _deps.mjs — 이 스킬의 외부 의존은 playwright 하나다. 그 위치와, 스킬 폴더 밖 상태 디렉터리를 한 곳에서 정한다.
 *
 * - playwright: 사용자 프로젝트에 있으면 그것, 아니면 `SG_PLAYWRIGHT=<모듈 경로>`. 없으면 어떤 계기도 브라우저를 열지 않고 안내만 낸다.
 * - 홈: `SG_PAGE_FORGE_HOME`(기본 `~/.cache/sg-page-forge`). 리드 원본 번들·history 같은 **재배포 금지·가변 상태**만 여기 둔다.
 *   스킬 폴더 안에는 커밋되는 것만 있다 — 캐시가 있어야 도는 축은 설계 결함이므로 그런 축은 "미제공"으로 보고한다.
 */
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, existsSync } from "node:fs";
import { cwd } from "node:process";

export const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function forgeHome() {
  const h = process.env.SG_PAGE_FORGE_HOME || join(homedir(), ".cache", "sg-page-forge");
  mkdirSync(h, { recursive: true });
  return h;
}

/** playwright 모듈을 찾는다. 반환: 모듈 또는 null. */
export async function loadPlaywright() {
  const env = process.env.SG_PLAYWRIGHT;
  const candidates = [];
  if (env) candidates.push(env);
  for (const base of [cwd(), SKILL_ROOT]) {
    try { candidates.push(createRequire(join(base, "package.json")).resolve("playwright")); } catch { /* 없음 */ }
  }
  for (const c of candidates) {
    try { return await import(c.startsWith("file:") ? c : pathToFileURL(c).href); } catch { /* 다음 후보 */ }
  }
  return null;
}

export function missingPlaywright() {
  return [
    "playwright를 찾지 못했다 — 브라우저 없이 이 계기는 아무 말도 못 한다.",
    "  프로젝트에 설치: npm i -D playwright && npx playwright install chromium",
    "  다른 곳에 있으면: SG_PLAYWRIGHT=<.../node_modules/playwright/index.mjs>",
    "  한 번에 갖추기: node scripts/preflight.mjs --install",
  ].join("\n");
}

/** 형제 스킬의 파일을 자기 위치 기준으로 찾는다(상대경로 의존 금지). 없으면 null. */
export function siblingSkillFile(skill, rel) {
  const p = join(SKILL_ROOT, "..", skill, rel);
  return existsSync(p) ? p : null;
}

export function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const k = a.slice(2); const v = argv[i + 1]; if (v !== undefined && !v.startsWith("--")) { o[k] = v; i++; } else o[k] = true; }
    else o._.push(a);
  }
  return o;
}
