#!/usr/bin/env node
/** Claude와 Codex가 같은 로컬 플러그인 소스·기본 버전·스킬 지문을 보는지 판정한다. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, readlink, realpath } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { exit } from "node:process";

const root = process.argv[2] ? await realpath(process.argv[2]) : await realpath(join(dirname(fileURLToPath(import.meta.url)), ".."));
const pluginRoot = join(root, "plugins", "sognora-llm-inventory");
const pluginId = "sognora-llm-inventory@sognora-llm-inventory";
const claudeManifest = JSON.parse(await readFile(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
const codexManifest = JSON.parse(await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
const sourceVersion = String(claudeManifest.version);
const failures = [];
if (baseVersion(codexManifest.version) !== baseVersion(sourceVersion)) failures.push("소스의 Claude/Codex 기본 버전 불일치");

let claude = null;
let codex = null;
try {
  claude = JSON.parse(execFileSync("claude", ["plugin", "list", "--json"], { encoding: "utf8" }))
    .find((item) => item.id === pluginId && item.scope === "user");
} catch (error) { failures.push(`Claude 설치 목록 확인 실패: ${error.message}`); }
try {
  codex = JSON.parse(execFileSync("codex", ["plugin", "list", "--json"], { encoding: "utf8" })).installed
    .find((item) => item.pluginId === pluginId);
} catch (error) { failures.push(`Codex 설치 목록 확인 실패: ${error.message}`); }

if (!claude) failures.push("Claude 사용자 설치본 누락");
if (!codex) failures.push("Codex 설치본 누락");
if (claude && baseVersion(claude.version) !== baseVersion(sourceVersion)) failures.push(`Claude 버전 ${claude.version} != source ${sourceVersion}`);
if (codex && baseVersion(codex.version) !== baseVersion(sourceVersion)) failures.push(`Codex 버전 ${codex.version} != source ${sourceVersion}`);

const sourceSkills = join(pluginRoot, "skills");
const sourceHash = await hashTree(sourceSkills);
let claudeHash = null;
if (claude?.installPath) {
  try {
    claudeHash = await hashTree(join(claude.installPath, "skills"));
    if (claudeHash !== sourceHash) failures.push("Claude 설치 스킬 지문이 소스와 다름");
  } catch (error) { failures.push(`Claude 스킬 지문 확인 실패: ${error.message}`); }
}
let codexSource = null;
if (codex?.source?.path) {
  try {
    codexSource = await realpath(codex.source.path);
    if (codexSource !== await realpath(pluginRoot)) failures.push(`Codex source가 현재 작업트리가 아님: ${codexSource}`);
  } catch (error) { failures.push(`Codex source 확인 실패: ${error.message}`); }
}

const result = {
  pass: failures.length === 0,
  sourceVersion,
  claude: claude ? { version: claude.version, installPath: claude.installPath, skillsSha256: claudeHash } : null,
  codex: codex ? { version: codex.version, source: codexSource } : null,
  sourceSkillsSha256: sourceHash,
  failures,
};
console.log(JSON.stringify(result, null, 2));
exit(result.pass ? 0 : 1);

function baseVersion(value) { return String(value ?? "").split("+")[0]; }
async function hashTree(dir) {
  const files = [];
  await walk(dir, files);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const path = join(dir, file);
    const info = await lstat(path);
    hash.update(file).update("\0");
    if (info.isSymbolicLink()) hash.update(`link:${await readlink(path)}`);
    else hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}
async function walk(dir, out, base = dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out, base);
    else out.push(relative(base, path));
  }
}
