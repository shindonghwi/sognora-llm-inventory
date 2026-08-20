/**
 * 의존성 해석 헬퍼. **세 스킬(page-craft·landing-forge·web-replicate)이 같은 파일을 갖는다.**
 * 스킬은 자기완결 폴더라 복사본으로 두고, 동일성은 `tools/check-shared.mjs`가 판정한다 —
 * 이 파일이 갈라지면 "검사를 안 돌린 것"이 스킬마다 다르게 나타난다(아래 실전 사고).
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
 *
 * 이 완화가 page-craft에만 들어가고 forge·web-replicate 복사본에는 **소급되지 않아**,
 * 같은 머신 같은 프로젝트에서 `sameness`는 돌고 `detect`는 "미설치"로 죽는 상태가
 * 남아 있었다(v1.8.2에서 동기화). 그래서 안내 문구도 요청 모듈에서 만든다 —
 * 스킬마다 손으로 다르게 적던 그 한 줄이 복사본이 갈라진 유일한 이유였다.
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
  const needsBrowser = names.includes("playwright") || names.includes("playwright-core");
  console.error(
    `${names.join(", ")}가 없습니다. 프로젝트 루트에서 설치하세요:\n` +
      `  npm i -D ${names.join(" ")}${needsBrowser ? " && npx playwright install chromium" : ""}\n` +
      (needsBrowser ? `이미 다른 곳에 있으면: SG_PLAYWRIGHT=<모듈 경로> 로 지정\n` : "")
  );
}
