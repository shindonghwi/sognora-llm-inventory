/**
 * sg-web-replicate 공통 계약과 증거 헬퍼.
 * 캡처와 diff가 이 파일의 같은 구현을 써야 "동일 조건"이 성립한다.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const CAPTURE_SETTLE_MS = 3000;
export const EVIDENCE_VERSION = 3;
export const MAX_SCROLL_SHOTS = 2000; // 폭주 방지. 이 상한에 닿으면 축약하지 않고 캡처를 거부한다.

/**
 * 임의의 달력 날짜를 기본값으로 쓰지 않는다. 기준 캡처가 실제로 시작된 순간을
 * 동결해 같은 캡처 안의 viewport/state와 이후 로컬 재현만 동일하게 맞춘다.
 */
export function captureClock(explicitEpoch, now = new Date()) {
  const date = explicitEpoch ? new Date(String(explicitEpoch)) : new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error(`잘못된 --clock 시각: ${explicitEpoch}`);
  return {
    source: explicitEpoch ? "explicit" : "observed-at-capture",
    epoch: date.toISOString(),
    runFor: CAPTURE_SETTLE_MS,
  };
}

/** goto 이전에 호출: 고정 시각으로 설치+동결. */
export async function installFrozenClock(page, epoch) {
  await page.clock.install({ time: new Date(epoch) });
  await page.clock.pauseAt(new Date(epoch));
}

/** 동결 시계가 있으면 가상 시간을, 없으면 실제 시간을 진행한다. */
export async function advance(page, ms, clock) {
  if (ms <= 0) return;
  if (clock) await page.clock.runFor(ms);
  else await page.waitForTimeout(ms);
}

/** 페이지 전체를 빈틈 없이 덮는 문서 y 좌표. */
export function autoScrollPositions(pageHeight, viewportHeight) {
  const ph = Math.max(0, Math.ceil(Number(pageHeight) || 0));
  const vh = Math.max(1, Math.ceil(Number(viewportHeight) || 1));
  if (ph <= vh) return [0];
  const last = ph - vh;
  const positions = [];
  for (let y = 0; y < last; y += vh) positions.push(y);
  positions.push(last);
  if (positions.length > MAX_SCROLL_SHOTS) {
    throw new Error(`스크롤 캡처 ${positions.length}장이 필요해 안전 상한 ${MAX_SCROLL_SHOTS}장을 넘습니다`);
  }
  return positions;
}

/** 문서 y 좌표 캡처들이 실제로 덮는 비율. */
export function coveragePct(positions, pageHeight, viewportHeight) {
  const ph = Number(pageHeight) || 0;
  const vh = Number(viewportHeight) || 0;
  if (ph <= 0 || ph <= vh) return 100;
  const intervals = [...new Set((positions ?? []).map(Number).filter(Number.isFinite))]
    .sort((a, b) => a - b)
    .map((y) => [Math.max(0, y), Math.min(ph, Math.max(0, y) + vh)]);
  let covered = 0;
  let end = 0;
  for (const [a, b] of intervals) {
    const start = Math.max(a, end);
    if (b > start) covered += b - start;
    end = Math.max(end, b);
  }
  return Number(((covered / ph) * 100).toFixed(6));
}

/** 구버전 퍼센트 캡처를 읽기 위한 변환. 새 캡처는 항상 y 좌표를 쓴다. */
export function percentToScrollY(percent, pageHeight, viewportHeight) {
  return Math.round(Math.max(0, pageHeight - viewportHeight) * (Number(percent) / 100));
}

export function scrollFile(y) {
  return `scroll-y-${String(Math.max(0, Math.round(y))).padStart(8, "0")}.png`;
}

export function scrollYFromFile(file, pageHeight, viewportHeight) {
  const y = /^scroll-y-(\d+)\.png$/.exec(file);
  if (y) return Number(y[1]);
  const pct = /^scroll-(\d+(?:\.\d+)?)\.png$/.exec(file);
  return pct ? percentToScrollY(Number(pct[1]), pageHeight, viewportHeight) : null;
}

export function normalizeConsoleError(text) {
  return String(text ?? "")
    .replace(/https?:\/\/[^\s")]+/g, "<url>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function routeTarget(value) {
  const u = new URL(String(value), "http://sognora.invalid");
  return `${u.pathname}${u.search}`;
}

export function routeId(value) {
  const route = routeTarget(value);
  const slug = (route === "/" ? "root" : route)
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "route";
  return `${slug}-${sha256(route).slice(0, 10)}`;
}

export function canonicalTarget(value) {
  if (!value) return null;
  try { return routeTarget(value); } catch { return null; }
}

export function sanitizeStateId(value) {
  const out = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  if (!out) throw new Error("상태 id/name은 비어 있을 수 없습니다");
  return out;
}

export async function loadStateContract(path) {
  if (!path) return { version: 1, scenarios: [], exclusions: [] };
  const value = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(value.scenarios)) throw new Error("상태 계약에는 scenarios 배열이 필요합니다");
  const ids = new Set();
  for (const scenario of value.scenarios) {
    scenario.id = sanitizeStateId(scenario.id);
    if (ids.has(scenario.id)) throw new Error(`중복 상태 시나리오 id: ${scenario.id}`);
    ids.add(scenario.id);
    if (!scenario.trigger?.type) throw new Error(`${scenario.id}: trigger.type이 필요합니다`);
    for (const trigger of [...(scenario.setup ?? []), scenario.trigger]) {
      if (!trigger?.type) throw new Error(`${scenario.id}: setup/trigger.type이 필요합니다`);
      if (["hover", "click", "focus", "press", "drag", "swipe"].includes(trigger.type) && !trigger.selector) {
        throw new Error(`${scenario.id}: ${trigger.type}에는 selector가 필요합니다`);
      }
      if (["click", "press", "drag", "swipe"].includes(trigger.type) && scenario.safe !== true) {
        throw new Error(`${scenario.id}: 상태 변경 가능 조작은 safe:true 선언이 필요합니다`);
      }
    }
    const frames = scenario.frames ?? [{ name: "before", phase: "before" }, { name: "after", atMs: 0 }];
    for (const frame of frames) frame.name = sanitizeStateId(frame.name);
    if (new Set(frames.map((frame) => frame.name)).size !== frames.length) {
      throw new Error(`${scenario.id}: frame name이 중복됐습니다`);
    }
    if (frames.filter((f) => f.phase === "before" || f.name === "before").length !== 1) {
      throw new Error(`${scenario.id}: before 프레임은 정확히 하나여야 합니다`);
    }
    const after = frames.filter((f) => f.phase !== "before" && f.name !== "before");
    if (!after.length) throw new Error(`${scenario.id}: 조작 후 프레임이 필요합니다`);
    let previous = -1;
    for (const frame of after) {
      frame.atMs = Number(frame.atMs ?? 0);
      if (!Number.isFinite(frame.atMs) || frame.atMs < previous) {
        throw new Error(`${scenario.id}: 조작 후 frames.atMs는 0 이상 오름차순이어야 합니다`);
      }
      previous = frame.atMs;
    }
    scenario.frames = frames;
    const frameNames = new Set(frames.map((frame) => frame.name));
    for (const assertion of scenario.assertions ?? []) {
      if (!frameNames.has(assertion?.frame)) throw new Error(`${scenario.id}: assertion frame이 없습니다: ${assertion?.frame}`);
      if (!assertion?.selector) throw new Error(`${scenario.id}: assertion selector가 필요합니다`);
      if (!["visible", "hidden", "exists", "absent", "checked", "unchecked"].includes(assertion.state)) {
        throw new Error(`${scenario.id}: 지원하지 않는 assertion state: ${assertion.state}`);
      }
    }
  }
  for (const exclusion of value.exclusions ?? []) {
    if (!exclusion?.selector || !exclusion?.reason) throw new Error("exclusions에는 selector와 reason이 모두 필요합니다");
  }
  return {
    version: value.version ?? 1,
    scenarios: value.scenarios,
    exclusions: value.exclusions ?? [],
    popupProbe: value.popupProbe ?? null,
  };
}

export function scenariosFor(contract, route, viewport) {
  const target = routeTarget(route);
  return (contract.scenarios ?? []).filter((s) => {
    const routes = s.routes ?? ["*"];
    const viewports = s.viewports ?? ["*"];
    return (routes.includes("*") || routes.map(routeTarget).includes(target)) &&
      (viewports.includes("*") || viewports.includes(viewport));
  });
}

export async function runTrigger(page, trigger) {
  const type = trigger.type;
  const loc = trigger.selector ? page.locator(trigger.selector).first() : null;
  if (loc && !(await loc.count())) throw new Error(`트리거 대상을 찾지 못함: ${trigger.selector}`);
  if (type === "hover") return loc.hover({ timeout: 5000 });
  if (type === "click") return loc.click({ timeout: 5000 });
  if (type === "focus") return loc.focus({ timeout: 5000 });
  if (type === "press") return loc.press(trigger.key ?? "Enter", { timeout: 5000 });
  if (type === "wheel") {
    if (loc) await loc.hover({ timeout: 5000 });
    return page.mouse.wheel(Number(trigger.deltaX ?? 0), Number(trigger.deltaY ?? 600));
  }
  if (type === "scroll") {
    return page.evaluate(({ x, y }) => window.scrollBy(x, y), {
      x: Number(trigger.deltaX ?? 0), y: Number(trigger.deltaY ?? 600),
    });
  }
  if (type === "drag") {
    if (!trigger.to) throw new Error("drag 트리거에는 to 선택자가 필요합니다");
    return loc.dragTo(page.locator(trigger.to).first(), { timeout: 5000 });
  }
  if (type === "swipe") {
    const box = await loc.boundingBox();
    if (!box) throw new Error(`swipe 대상의 좌표를 읽지 못함: ${trigger.selector}`);
    const sx = box.x + box.width * Number(trigger.startX ?? 0.8);
    const sy = box.y + box.height * Number(trigger.startY ?? 0.5);
    const ex = box.x + box.width * Number(trigger.endX ?? 0.2);
    const ey = box.y + box.height * Number(trigger.endY ?? 0.5);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: Number(trigger.steps ?? 8) });
    return page.mouse.up();
  }
  if (type === "reload") {
    return page.reload({ waitUntil: trigger.waitUntil ?? "networkidle", timeout: Number(trigger.timeout ?? 45000) });
  }
  if (type === "wait") return;
  throw new Error(`지원하지 않는 trigger.type: ${type}`);
}

export async function runScenarioSetup(page, scenario, clock) {
  for (const trigger of scenario.setup ?? []) {
    await runTrigger(page, trigger);
    await advance(page, Number(trigger.waitMs ?? 0), clock);
  }
}

/** 선언 프레임에서 팝업 열림/닫힘·체크·존재 상태를 fail-closed로 판정한다. */
export async function evaluateScenarioAssertions(page, scenario, frameName) {
  const assertions = (scenario.assertions ?? []).filter((item) => item.frame === frameName);
  const results = [];
  for (const assertion of assertions) {
    const locator = page.locator(assertion.selector).first();
    const count = await locator.count();
    let actual;
    if (assertion.state === "exists" || assertion.state === "absent") {
      actual = count > 0 ? "exists" : "absent";
    } else if (assertion.state === "visible" || assertion.state === "hidden") {
      actual = count > 0 && await locator.isVisible().catch(() => false) ? "visible" : "hidden";
    } else {
      actual = count > 0 && await locator.isChecked().catch(() => false) ? "checked" : "unchecked";
    }
    results.push({ ...assertion, actual, pass: actual === assertion.state });
  }
  return results;
}

export async function stateStyle(page, selector) {
  if (!selector) return null;
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
      color: cs.color, backgroundColor: cs.backgroundColor, opacity: cs.opacity,
      transform: cs.transform, visibility: cs.visibility, display: cs.display,
      transitionDuration: cs.transitionDuration, transitionTimingFunction: cs.transitionTimingFunction,
      animationDuration: cs.animationDuration, animationTimingFunction: cs.animationTimingFunction,
    };
  }).catch(() => null);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

export async function scriptFingerprint(scriptDir) {
  const files = (await readdir(scriptDir)).filter((f) => f.endsWith(".mjs")).sort();
  const parts = [];
  for (const file of files) parts.push(`${file}\0${await readFile(join(scriptDir, file), "utf8")}\0`);
  return { sha256: sha256(parts.join("")), files };
}

export async function writeEvidence(dir, conditions, extra = {}) {
  const entries = (await readdir(dir)).filter((f) => f !== "evidence.json").sort();
  const files = [];
  for (const file of entries) {
    const path = join(dir, file);
    if (!(await stat(path)).isFile()) continue;
    const body = await readFile(path);
    files.push({ file, bytes: body.length, sha256: sha256(body) });
  }
  const evidence = {
    version: EVIDENCE_VERSION,
    conditions,
    conditionsSha256: sha256(stableStringify(conditions)),
    files,
    ...extra,
  };
  await writeFile(join(dir, "evidence.json"), JSON.stringify(evidence, null, 2));
  return evidence;
}

export async function verifyEvidence(dir) {
  const evidence = JSON.parse(await readFile(join(dir, "evidence.json"), "utf8"));
  const errors = [];
  if (evidence.version !== EVIDENCE_VERSION) errors.push(`evidence version ${evidence.version} != ${EVIDENCE_VERSION}`);
  if (evidence.conditionsSha256 !== sha256(stableStringify(evidence.conditions))) errors.push("conditions 해시 불일치");
  for (const item of evidence.files ?? []) {
    try {
      const body = await readFile(join(dir, basename(item.file)));
      if (body.length !== item.bytes || sha256(body) !== item.sha256) errors.push(`${item.file} SHA-256 불일치`);
    } catch { errors.push(`${item.file} 누락`); }
  }
  return { ok: errors.length === 0, errors, evidence };
}

export async function rendererMeta(page) {
  return page.evaluate(() => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href ?? null;
    const framework = document.querySelector("#__next") ? "next" :
      document.querySelector("#__nuxt") ? "nuxt" :
      document.querySelector("#___gatsby") ? "gatsby" : "document";
    const root = document.querySelector("main") ?? document.body;
    const text = (root?.innerText ?? "").replace(/\s+/g, " ").trim();
    const structure = [...(root?.querySelectorAll("*") ?? [])].slice(0, 2000)
      .map((el) => `${el.tagName}:${el.getAttribute("role") ?? ""}`).join("|");
    return { canonical, framework, title: document.title, text, structure };
  });
}
