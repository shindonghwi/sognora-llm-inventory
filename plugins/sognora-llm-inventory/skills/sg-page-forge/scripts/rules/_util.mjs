/**
 * rules/_util.mjs — 규칙 모듈이 공유하는 순수 도우미. 브라우저·파일 접근 없음.
 * scan.json 한 뷰포트(`vp`)의 nodes/sections/images/interactive/copy만 다룬다.
 */

export const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** 뷰포트 선택: 데스크톱(가장 넓은 것)과 모바일(800 미만) */
export function pickViewports(scan) {
  const keys = Object.keys(scan.viewports || {});
  const byW = keys.map((k) => [k, scan.viewports[k].width]).sort((a, b) => b[1] - a[1]);
  return { desktop: byW[0]?.[0], mobile: byW.find(([, w]) => w < 800)?.[0], all: keys };   // 정의: 800px 미만 = 모바일
}

export function parseRgb(s) {
  if (!s) return null;
  const m = String(s).match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}
export function hex(c) { return c ? "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("") : null; }
export function luminance(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
export function contrast(a, b) { const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); }
export function hue(c) { const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return null; let h; if (mx === r) h = (g - b) / (mx - mn); else if (mx === g) h = 2 + (b - r) / (mx - mn); else h = 4 + (r - g) / (mx - mn); return ((h * 60) + 360) % 360; }
export function saturation(c) { const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
export const isPurpleish = (c) => { const h = hue(c); return h !== null && h >= 235 && h <= 300 && saturation(c) > 0.35; };   // 정의: 남보라~보라 hue 대역

export const pxOf = (s) => { const m = String(s ?? "").match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null; };
export const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
export const inViewport = (n, vp) => n.rect.y < vp.height && n.rect.y + n.rect.h > 0;
export const visibleText = (vp) => vp.nodes.filter((n) => n.visible && n.textLen > 0 && n.rect.w > 0 && n.rect.h > 0);
export const bodyText = (vp) => visibleText(vp).filter((n) => n.cs.fs <= 20 && n.textLen >= 20);   // 정의: 본문 = 20px 이하·20자 이상(디스플레이·라벨 제외)
export function textArea(nodes) { return nodes.reduce((s, n) => s + area(n.rect), 0); }
export const isHeadingTag = (t) => /^h[1-6]$/.test(t);
export const childrenOf = (vp, i) => vp.nodes.filter((n) => n.parent === i);
export const nodeById = (vp, i) => vp.nodes[i];

/** 한글 대응 서체 이름 목록(정의). 스택에 이 중 하나라도 있으면 한글 폰트 지정으로 본다. 라틴만 있으면 폴백이다. */
export const HANGUL_FAMILIES = /pretendard|noto sans kr|noto serif kr|noto sans cjk|apple sd gothic|malgun|맑은|nanum|나눔|spoqa|suit|wanted sans|gmarket|ibm plex sans kr|gothic a1|maruburi|마루부리|ridibatang|리디바탕|iropke|이롭게|gowun|고운|hahmlet|black han sans|do hyeon|jua|sunflower|stylish|poor story|single day|gaegu|kirang|dokdo|gamja|cute font|east sea|hi melody|yeon sung|song myung|source han|본고딕|본명조|kopub|kopubworld|tmoney|tmon|binggrae|cafe24|nexon|배달의민족|bm|jeju|제주|gangwon|paperlogy|freesentation|s-core|escore|sd gothic|apple sd|sf pro|system-ui/i;
/** AI가 근거 없이 고르는 기본 서체(근거: developersdigest 16패턴 1·2, 925studios, Anthropic frontend-design 금지 목록) */
export const AI_DEFAULT_FAMILIES = /^(inter|roboto|arial|helvetica( neue)?|space grotesk|instrument serif|geist|poppins|open sans|segoe ui|system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|ui-sans-serif)$/i;
export const splitFamilies = (ff) => String(ff || "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

/** 숫자·날짜·고유명사 흔적이 있는 문장인가(스탯 밴드 판정용) */
export const hasMeasurement = (t) => /\d/.test(t) || /[A-Z][a-z]{2,}|[가-힣]+(시|구|동|사|㈜|주식회사)/.test(t);

export function finding(rule, sev, detail, extra = {}) {
  return { id: rule.id, axis: rule.axis, severity: sev, title: rule.title, detail, evidence: rule.evidence, ...extra };
}

/** 코퍼스 기준선에서 임계를 읽는다. 없으면 폴백 값과 함께 basis를 표기한다(엄격해지는 방향으로만 — 기준선이 폴백보다 느슨하면 폴백 유지). */
export function thresholdFrom(baseline, id, fallback, { stricterIsLower = true } = {}) {
  const b = baseline?.rules?.[id]?.threshold;
  if (typeof b !== "number") return { value: fallback, basis: "폴백" };
  const v = stricterIsLower ? Math.min(b, fallback) : Math.max(b, fallback);
  return { value: v, basis: v === b ? "코퍼스" : "폴백(기준선이 더 느슨)" };
}
