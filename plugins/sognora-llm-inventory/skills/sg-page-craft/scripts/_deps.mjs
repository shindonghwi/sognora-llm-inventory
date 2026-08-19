/**
 * 의존성 해석 헬퍼.
 *
 * 이 스크립트들은 플러그인 캐시에서 실행되지만 playwright는 사용자 프로젝트에
 * 설치된다. Node는 bare import를 "스크립트 위치" 기준으로 찾으므로 그대로는
 * 실패한다. cwd(사용자 프로젝트) 기준으로도 찾아본다.
 *
 * `playwright`를 요청하면 **`playwright-core`도 후보로 본다.** 실전 사고: 검사
 * 대상 프로젝트에 playwright가 없어 `alive`·`detect`·`conform`이 전부 "미설치"로
 * exit 2를 냈고, **검사를 안 돌린 것과 통과가 구분되지 않았다.** core는 브라우저를
 * 내려받지 않을 뿐 API는 같고, 머신에 이미 받아둔 chromium을 그대로 쓴다.
 * 모듈 위치를 직접 지정하려면 `SG_PLAYWRIGHT=<경로>`.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

// playwright를 요청하면 core까지 훑는다. 그 외 모듈은 이름 그대로.
const ALIASES = { playwright: ["playwright", "playwright-core"] };

export async function load(name) {
  const candidates = ALIASES[name] ?? [name];
  const envPath = name === "playwright" ? process.env.SG_PLAYWRIGHT : null;
  if (envPath) {
    const m = await tryImport(pathToFileURL(envPath).href);
    if (m) return flatten(m);
  }
  for (const cand of candidates) {
    let mod = await tryImport(cand); // 스크립트 위치 기준
    if (!mod) {
      // cwd(사용자 프로젝트) 기준으로 재시도
      try {
        const req = createRequire(join(process.cwd(), "package.json"));
        mod = await tryImport(pathToFileURL(req.resolve(cand)).href);
      } catch { /* 다음 후보로 */ }
    }
    if (mod) return flatten(mod);
  }
  return null;
}

async function tryImport(spec) {
  try { return await import(spec); } catch { return null; }
}

// CJS를 파일 URL로 로드하면 named export가 default 아래로 들어간다. 평탄화해서 넘긴다.
function flatten(mod) {
  if (mod?.default && typeof mod.default === "object") {
    return { ...mod.default, ...mod, default: mod.default };
  }
  return mod;
}

export function missing(names) {
  console.error(
    `${names.join(", ")}가 없습니다. 프로젝트 루트에서 설치하세요:\n` +
      `  npm i -D playwright && npx playwright install chromium\n` +
      `이미 다른 곳에 있으면: SG_PLAYWRIGHT=<모듈 경로> 로 지정`
  );
}
