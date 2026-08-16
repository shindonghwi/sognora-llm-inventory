/**
 * 의존성 해석 헬퍼.
 *
 * 이 스크립트들은 플러그인 캐시에서 실행되지만 playwright는 사용자 프로젝트에
 * 설치된다. Node는 bare import를 "스크립트 위치" 기준으로 찾으므로 그대로는
 * 실패한다. cwd(사용자 프로젝트) 기준으로도 찾아본다.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export async function load(name) {
  let mod = null;
  try {
    mod = await import(name); // 스크립트 위치 기준
  } catch {
    try {
      // cwd(사용자 프로젝트) 기준으로 재시도
      const req = createRequire(join(process.cwd(), "package.json"));
      mod = await import(pathToFileURL(req.resolve(name)).href);
    } catch {
      return null;
    }
  }
  // CJS를 파일 URL로 로드하면 named export가 default 아래로 들어간다. 평탄화해서 넘긴다.
  if (mod?.default && typeof mod.default === "object") {
    return { ...mod.default, ...mod, default: mod.default };
  }
  return mod;
}

export function missing(names) {
  console.error(
    `${names.join(", ")}가 없습니다. 프로젝트 루트에서 설치하세요:\n` +
      `  npm i -D playwright && npx playwright install chromium`
  );
}
