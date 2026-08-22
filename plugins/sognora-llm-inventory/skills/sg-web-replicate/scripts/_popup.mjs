/** 첫 진입 팝업·모달·쿠키 레이어를 찾고 재현 가능한 상태 시나리오를 만든다. */
import { CAPTURE_SETTLE_MS, routeTarget, sha256 } from "./_shared.mjs";

export const ENTRY_CHECKPOINTS_MS = [0, 500, CAPTURE_SETTLE_MS];

export async function inspectEntrySurfaces(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
    };
    const attr = (name, value) => `[${name}=${JSON.stringify(value)}]`;
    const unique = (selector) => {
      try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
    };
    const selectorFor = (el) => {
      if (el.id) {
        const selector = `#${CSS.escape(el.id)}`;
        if (unique(selector)) return selector;
      }
      for (const name of ["data-testid", "data-qa", "aria-label", "name"]) {
        const value = el.getAttribute(name);
        if (!value) continue;
        const selector = `${el.tagName.toLowerCase()}${attr(name, value)}`;
        if (unique(selector)) return selector;
      }
      const role = el.getAttribute("role");
      if (role) {
        const selector = attr("role", role);
        if (unique(selector)) return selector;
      }
      const classes = [...el.classList].filter((value) => value.length < 80 && !/^[a-z0-9_-]{20,}$/i.test(value));
      for (const value of classes) {
        const selector = `${el.tagName.toLowerCase()}.${CSS.escape(value)}`;
        if (unique(selector)) return selector;
      }
      const parts = [];
      for (let node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
        const tag = node.tagName.toLowerCase();
        const siblings = node.parentElement ? [...node.parentElement.children].filter((item) => item.tagName === node.tagName) : [];
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
        const selector = parts.join(" > ");
        if (unique(selector)) return selector;
      }
      return parts.join(" > ");
    };
    const labelFor = (el) => {
      const labels = el.labels ? [...el.labels].map((label) => label.textContent) : [];
      return [el.getAttribute("aria-label"), el.getAttribute("title"), ...labels, el.textContent]
        .filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 240);
    };
    const classifyControl = (el) => {
      const label = labelFor(el);
      const metadata = `${el.id} ${String(el.className)}`.replace(/[^a-z0-9가-힣]+/gi, " ");
      const close = /(?:^|\s)(?:close|dismiss)(?:\s|$)|닫기|창\s*닫|[×✕❌]|^x$/i.test(label) ||
        /(?:^|\s)(?:close|dismiss)(?:\s|$)/i.test(metadata);
      const context = `${label} ${el.parentElement?.textContent ?? ""}`.replace(/\s+/g, " ").slice(0, 400);
      const suppress = /오늘.{0,12}(?:열지|보지|띄우지|그만)|하루.{0,12}(?:열지|보지)|다시.{0,12}(?:열지|보지)|do\s+not\s+show|don['’]?t\s+show|hide.{0,20}(?:today|day)/i.test(context);
      return close ? "close" : suppress ? "suppress" : "other";
    };
    const parseTimes = (value) => String(value).split(",").map((part) => {
      const text = part.trim();
      if (text.endsWith("ms")) return Number.parseFloat(text) || 0;
      if (text.endsWith("s")) return (Number.parseFloat(text) || 0) * 1000;
      return 0;
    });
    const motionMs = (el) => {
      const style = getComputedStyle(el);
      const durations = [...parseTimes(style.transitionDuration), ...parseTimes(style.animationDuration)];
      const delays = [...parseTimes(style.transitionDelay), ...parseTimes(style.animationDelay)];
      return Math.ceil(Math.max(0, ...durations.map((value, index) => value + (delays[index] ?? 0))));
    };
    const controlsFor = (root) => {
      const controls = [...root.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[role="checkbox"],[onclick],[tabindex],[class*="close" i],[id*="close" i]')]
        .filter(visible).map((el) => ({
          selector: selectorFor(el), assertionSelector: selectorFor(el), tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type"), role: el.getAttribute("role"), label: labelFor(el), action: classifyControl(el),
          checkable: el.matches('input[type="checkbox"],input[type="radio"],[role="checkbox"]'),
        }));
      for (const label of root.querySelectorAll("label")) {
        const input = label.querySelector('input[type="checkbox"],input[type="radio"]');
        if (!input || !visible(label) || classifyControl(label) !== "suppress") continue;
        controls.push({
          selector: selectorFor(label), assertionSelector: selectorFor(input), tag: "label", type: input.type,
          role: null, label: labelFor(label), action: "suppress", checkable: true,
        });
      }
      const bySelector = new Map();
      for (const item of controls.filter((item) => item.action !== "other")) bySelector.set(`${item.action}\0${item.selector}`, item);
      return [...bySelector.values()];
    };
    const tokenPattern = /popup|modal|dialog|overlay|layer|notice|cookie|banner|dimmed|lightbox/i;
    const raw = [];
    for (const el of document.body?.querySelectorAll("*") ?? []) {
      if (!visible(el) || ["HTML", "BODY", "HEADER", "NAV"].includes(el.tagName)) continue;
      const style = getComputedStyle(el);
      const semantic = el.matches('dialog[open],[role="dialog"],[aria-modal="true"]');
      const token = tokenPattern.test(`${el.id} ${String(el.className)}`);
      const controls = controlsFor(el);
      const actionableFixed = style.position === "fixed" && controls.some((item) => item.action !== "other");
      const positionedToken = token && ["fixed", "absolute", "sticky"].includes(style.position);
      if (!semantic && !positionedToken && !actionableFixed) continue;
      const box = el.getBoundingClientRect();
      const rank = semantic ? 3 : /popup|modal|dialog|lightbox/i.test(`${el.id} ${String(el.className)}`) ? 2 : token ? 1 : 0;
      raw.push({
        selector: selectorFor(el), rank, semantic, position: style.position,
        zIndex: style.zIndex, motionMs: motionMs(el),
        box: { x: box.x, y: box.y, w: box.width, h: box.height },
        controls,
      });
    }
    raw.sort((a, b) => b.rank - a.rank || (a.box.w * a.box.h) - (b.box.w * b.box.h));
    const selected = [];
    for (const item of raw) {
      const actionSelectors = item.controls.filter((control) => control.action !== "other").map((control) => control.selector);
      if (selected.some((chosen) => actionSelectors.some((selector) =>
        chosen.controls.some((control) => control.action !== "other" && control.selector === selector)))) continue;
      selected.push(item);
    }
    return selected;
  });
}

export function buildEntryScenarios(findings) {
  const scenarios = [];
  const unresolved = [];
  const seen = new Set();
  for (const finding of findings) {
    for (const surface of finding.surfaces ?? []) {
      const key = JSON.stringify([routeTarget(finding.route), finding.viewport, surface.selector]);
      if (seen.has(key)) continue;
      seen.add(key);
      const close = surface.controls.find((control) => control.action === "close");
      const suppress = surface.controls.find((control) => control.action === "suppress" && control.checkable);
      const base = `entry-popup-${sha256(key).slice(0, 10)}`;
      const motion = Math.max(0, Number(surface.motionMs) || 0);
      const dismissFrames = [{ name: "before", phase: "before" }];
      if (motion > 1) dismissFrames.push({ name: "mid", atMs: Math.round(motion / 2) });
      dismissFrames.push({ name: "after", atMs: motion });
      if (!close) {
        unresolved.push({ route: finding.route, viewport: finding.viewport, selector: surface.selector, reason: "닫기 제어를 식별하지 못함" });
        continue;
      }
      scenarios.push({
        id: `${base}-dismiss`, routes: [routeTarget(finding.route)], viewports: [finding.viewport], safe: true,
        trigger: { type: "click", selector: close.selector }, observe: surface.selector,
        frames: dismissFrames,
        assertions: [
          { frame: "before", selector: surface.selector, state: "visible" },
          { frame: "after", selector: surface.selector, state: "hidden" },
        ],
      });
      if (!suppress) continue;
      const suppressAssertionSelector = suppress.assertionSelector ?? suppress.selector;
      scenarios.push({
        id: `${base}-toggle-suppress`, routes: [routeTarget(finding.route)], viewports: [finding.viewport], safe: true,
        trigger: { type: "click", selector: suppress.selector }, observe: suppress.selector,
        frames: [{ name: "before", phase: "before" }, { name: "after", atMs: 0 }],
        assertions: [
          { frame: "before", selector: suppressAssertionSelector, state: "unchecked" },
          { frame: "after", selector: suppressAssertionSelector, state: "checked" },
        ],
      });
      scenarios.push({
        id: `${base}-suppress-reload`, routes: [routeTarget(finding.route)], viewports: [finding.viewport], safe: true,
        setup: [
          { type: "click", selector: suppress.selector },
          { type: "click", selector: close.selector, waitMs: motion },
        ],
        trigger: { type: "reload", waitUntil: "networkidle" }, observe: surface.selector,
        frames: [{ name: "before", phase: "before" }, { name: "after", atMs: Math.max(CAPTURE_SETTLE_MS, Number(surface.discoveredAtMs) || 0) }],
        assertions: [
          { frame: "before", selector: surface.selector, state: "hidden" },
          { frame: "after", selector: surface.selector, state: "hidden" },
        ],
      });
    }
  }
  return { scenarios, unresolved };
}

export function mergeStateScenarios(base, generated) {
  const ids = new Set();
  const scenarios = [];
  for (const scenario of [...(base?.scenarios ?? []), ...(generated ?? [])]) {
    if (ids.has(scenario.id)) continue;
    ids.add(scenario.id);
    scenarios.push(scenario);
  }
  return { version: Math.max(2, Number(base?.version) || 0), scenarios, exclusions: base?.exclusions ?? [] };
}

export function validatePopupProbe(contract, routes, viewports) {
  const probe = contract?.popupProbe;
  const errors = [];
  if (!probe) return ["popupProbe 증거가 없습니다 — probe-states.mjs를 먼저 실행하세요"];
  if ((probe.failed ?? []).length) errors.push(`popup probe 방문 실패 ${(probe.failed ?? []).length}건`);
  if ((probe.unresolved ?? []).length) errors.push(`popup probe 미해결 ${(probe.unresolved ?? []).length}건`);
  if (probe.routesSha256 !== sha256(JSON.stringify(routes.map(routeTarget)))) errors.push("popup probe route 원장 해시 불일치");
  const probed = new Set((probe.probed ?? []).map((item) => `${routeTarget(item.route)}\0${item.viewport}`));
  for (const route of routes.map(routeTarget)) {
    for (const viewport of viewports) {
      if (!probed.has(`${route}\0${viewport}`)) errors.push(`popup probe 누락: ${route} @ ${viewport}`);
    }
  }
  return errors;
}
