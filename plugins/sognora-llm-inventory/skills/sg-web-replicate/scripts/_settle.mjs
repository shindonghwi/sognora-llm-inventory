/**
 * 늦은 API·동적 import·클라이언트 navigation 뒤 DOM을 읽기 위한 공통 안정화 계기.
 * networkidle 하나만 쓰면 폴링 사이트는 끝나지 않고, 고정 sleep 하나만 쓰면 느린 API를 놓친다.
 * 그래서 최소 관찰 구간 + 실제 요청/DOM quiet + 전체 상한을 함께 사용한다.
 */
import { setTimeout as delay } from "node:timers/promises";

export const DEFAULT_SETTLE = Object.freeze({
  observeMs: 3000,
  quietMs: 500,
  timeoutMs: 15000,
  pollMs: 100,
});

const TRACKED_RESOURCE_TYPES = new Set([
  "document", "stylesheet", "script", "image", "media", "font", "xhr", "fetch",
]);

export function parseSettleOptions(args = {}, defaults = {}) {
  const options = {
    observeMs: duration(args.settle ?? defaults.observeMs ?? DEFAULT_SETTLE.observeMs, "--settle"),
    quietMs: duration(args["settle-quiet"] ?? defaults.quietMs ?? DEFAULT_SETTLE.quietMs, "--settle-quiet"),
    timeoutMs: duration(args["settle-timeout"] ?? defaults.timeoutMs ?? DEFAULT_SETTLE.timeoutMs, "--settle-timeout"),
    pollMs: duration(args["settle-poll"] ?? defaults.pollMs ?? DEFAULT_SETTLE.pollMs, "--settle-poll", 10),
  };
  if (options.timeoutMs < options.observeMs + options.quietMs) {
    throw new Error("--settle-timeout은 --settle + --settle-quiet 이상이어야 합니다");
  }
  return options;
}

/** goto 전에 설치해야 최초 document와 그 뒤 API 요청까지 놓치지 않는다. */
export function trackPageActivity(page) {
  const pending = new Map();
  let lastActivityAt = Date.now();
  const touch = () => { lastActivityAt = Date.now(); };
  const onRequest = (request) => {
    if (!TRACKED_RESOURCE_TYPES.has(request.resourceType())) return;
    pending.set(request, { type: request.resourceType(), url: request.url() });
    touch();
  };
  const onRequestDone = (request) => {
    if (pending.delete(request)) touch();
  };
  const onFrameNavigated = (frame) => {
    if (frame === page.mainFrame()) touch();
  };
  page.on("request", onRequest);
  page.on("requestfinished", onRequestDone);
  page.on("requestfailed", onRequestDone);
  page.on("framenavigated", onFrameNavigated);
  return {
    get lastActivityAt() { return lastActivityAt; },
    get pendingCount() { return pending.size; },
    pendingSummary() {
      return [...pending.values()].slice(0, 5).map((item) => `${item.type}:${item.url.slice(0, 120)}`);
    },
    touch,
    dispose() {
      page.off("request", onRequest);
      page.off("requestfinished", onRequestDone);
      page.off("requestfailed", onRequestDone);
      page.off("framenavigated", onFrameNavigated);
    },
  };
}

/**
 * advance가 있으면 observeMs만큼 가상 시계를 먼저 진행한 뒤 실제 IO/DOM quiet를 기다린다.
 * routesOnly는 텍스트 애니메이션 때문에 라우트 탐색이 영원히 흔들리지 않도록 링크·script만 판정한다.
 */
export async function settlePage(page, tracker, options, { advance = null, routesOnly = false } = {}) {
  const config = parseSettleOptions({}, options);
  const startedAt = Date.now();
  let observationComplete = false;
  let lastSignature = null;
  let lastChangedAt = startedAt;
  const links = new Set();
  const scripts = new Set();

  if (advance) {
    await advance(config.observeMs);
    observationComplete = true;
  }

  while (true) {
    const now = Date.now();
    let snapshot;
    try {
      snapshot = await page.evaluate((onlyRoutes) => {
        const hrefs = [...new Set([...document.querySelectorAll("a[href],area[href]")]
          .map((element) => element.href).filter(Boolean))].sort();
        const scriptSrcs = [...new Set([...document.scripts].map((script) => script.src).filter(Boolean))].sort();
        const base = {
          url: location.href,
          readyState: document.readyState,
          fonts: document.fonts?.status ?? "loaded",
          links: hrefs,
          scripts: scriptSrcs,
        };
        if (onlyRoutes) return base;
        const text = (document.body?.innerText ?? "").slice(0, 100000);
        let textHash = 2166136261;
        for (let index = 0; index < text.length; index++) {
          textHash ^= text.charCodeAt(index);
          textHash = Math.imul(textHash, 16777619);
        }
        return {
          ...base,
          elementCount: document.getElementsByTagName("*").length,
          textHash: textHash >>> 0,
        };
      }, routesOnly);
    } catch (error) {
      if (!isNavigationRace(error)) throw error;
      tracker.touch();
      if (Date.now() - startedAt >= config.timeoutMs) {
        throw new Error(`navigation이 ${config.timeoutMs}ms 안에 안정화되지 않았습니다: ${error.message}`);
      }
      await delay(config.pollMs);
      continue;
    }

    for (const href of snapshot.links) links.add(href);
    for (const src of snapshot.scripts) scripts.add(src);
    const signature = JSON.stringify({ ...snapshot, links: snapshot.links, scripts: snapshot.scripts });
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastChangedAt = now;
    }
    if (!advance && now - startedAt >= config.observeMs) observationComplete = true;

    const quietFor = now - Math.max(lastChangedAt, tracker.lastActivityAt);
    if (observationComplete && tracker.pendingCount === 0 && snapshot.readyState !== "loading" &&
        snapshot.fonts !== "loading" && quietFor >= config.quietMs) {
      return {
        options: config,
        elapsedMs: now - startedAt,
        reason: "quiet",
        links: [...links],
        scripts: [...scripts],
      };
    }

    if (now - startedAt >= config.timeoutMs) {
      if (tracker.pendingCount) {
        throw new Error(
          `페이지가 ${config.timeoutMs}ms 안에 안정화되지 않았습니다; 진행 중 요청 ${tracker.pendingCount}개: ` +
          tracker.pendingSummary().join(", ")
        );
      }
      return {
        options: config,
        elapsedMs: now - startedAt,
        reason: "bounded-dom-activity",
        links: [...links],
        scripts: [...scripts],
      };
    }
    await delay(config.pollMs);
  }
}

function duration(value, name, minimum = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new Error(`${name}은 ${minimum} 이상 ms여야 합니다`);
  return number;
}

function isNavigationRace(error) {
  return /Execution context was destroyed|Cannot find context with specified id/i.test(String(error?.message ?? error));
}
