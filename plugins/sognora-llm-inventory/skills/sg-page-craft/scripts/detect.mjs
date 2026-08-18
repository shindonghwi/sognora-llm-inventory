/**
 * detect.mjs — sg-landing-forge의 계기를 이 스킬에서 그대로 쓰기 위한 심(shim).
 *
 * 왜 있나: SKILL.md에 `../sg-landing-forge/scripts/detect.mjs`처럼 상대경로를 적어두면
 * 실행 위치(cwd)에 따라 깨진다. 이 심은 **자기 파일 위치를 기준으로** 원본을 찾아 그대로 실행한다.
 * 인자는 손대지 않고 넘긴다 — 원본 usage와 동일하게 쓰면 된다.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { argv, exit } from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "..", "sg-landing-forge", "scripts", "detect.mjs");
if (!existsSync(target)) {
  console.error("sg-landing-forge 계기를 찾을 수 없다: " + target);
  console.error("두 스킬은 같은 플러그인에 함께 설치되어야 한다.");
  exit(2);
}
spawn(process.execPath, [target, ...argv.slice(2)], { stdio: "inherit" }).on("close", (c) => exit(c ?? 0));
