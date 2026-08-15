/**
 * 룰 메타데이터 + 순수 판정 로직 — detect.mjs(수집→판정)와 gate.mjs(비교)가 공유한다.
 * 룰 ID는 references/rules.md와 1:1. 한쪽만 고치면 게이트가 어긋난다.
 */

export const RULES = {
  TS1: { sev: "red", layer: "surface", judge: "det", scope: "page" },
  TS2: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  TS3: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  CO1: { sev: "red", layer: "surface", judge: "det", scope: "section" },
  CO2: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  CO3: { sev: "yellow", layer: "surface", judge: "det", scope: "section" },
  CO4: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  LA1: { sev: "red", layer: "structural", judge: "det", scope: "section" },
  LA2: { sev: "red", layer: "structural", judge: "det", scope: "section" },
  LA3: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  CP1: { sev: "red", layer: "structural", judge: "det", scope: "section" },
  CP2: { sev: "red", layer: "structural", judge: "det", scope: "section" },
  CP3: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  IC1: { sev: "red", layer: "structural", judge: "suspect", scope: "section" },
  IC2: { sev: "red", layer: "surface", judge: "det", scope: "section" },
  IC3: { sev: "yellow", layer: "surface", judge: "suspect", scope: "section" },
  IC4: { sev: "yellow", layer: "surface", judge: "suspect", scope: "section" },
  DE1: { sev: "red", layer: "structural", judge: "det", scope: "section" },
  DE2: { sev: "yellow", layer: "structural", judge: "det", scope: "section" },
  AS1: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  BD1: { sev: "red", layer: "surface", judge: "det", scope: "section" },
  CO5: { sev: "red", layer: "surface", judge: "det", scope: "section" },
  LA4: { sev: "yellow", layer: "structural", judge: "det", scope: "section" },
  QF1: { sev: "red", layer: "surface", judge: "det", scope: "page" },
  QF2: { sev: "red", layer: "surface", judge: "det", scope: "page" },
  QF3: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  QF4: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  QF5: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  QF6: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  TS4: { sev: "yellow", layer: "surface", judge: "suspect", scope: "section" },
  IC5: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  AS2: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  MO1: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO1: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO2: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO3: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO4: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
};

export const EPS = { size: 4, wrapper: 0.95, smallSection: 0.15, semanticCover: 0.7 };

// ---------- 텍스트 정규화 (게이트 3의 기준 — detect·gate 동일 코드 필수) ----------

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

export function normText(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(EMOJI_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasEmoji(s) {
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(String(s ?? ""));
}

// 순수 서수 블록 — CP2 티가 있을 때만 삭제 허용(rules.md 게이트 3)
export function isOrdinal(s) {
  return /^(0?\d{1,2}|step\s?\d{1,2}|단계\s?\d{1,2})[.)]?$/i.test(s.trim());
}

// ---------- 색 ----------

export function parseColor(str) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+))?/.exec(str ?? "");
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
}

export function rgbToHsl({ r, g, b }) {
  (r /= 255), (g /= 255), (b /= 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

export function contrast(c1, c2) {
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [a, b] = [lum(c1), lum(c2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// gradient 문자열에서 보라 계열(hue 240–290) 스톱 검출
export function purpleGradient(bgImage) {
  if (!bgImage || !bgImage.includes("gradient")) return false;
  const stops = bgImage.match(/rgba?\([^)]+\)/g) ?? [];
  return stops.some((s) => {
    const c = parseColor(s);
    if (!c) return false;
    const { h, s: sat } = rgbToHsl(c);
    return h >= 240 && h <= 290 && sat > 0.25;
  });
}

export const KOREAN_FONT_RE =
  /pretendard|noto sans kr|malgun|맑은|apple sd|spoqa|suit|wanted|gmarket|nanum|나눔|본고딕|source han/i;
export const DEFAULT_STACK_RE = /^(inter|roboto|system-ui|-apple-system|arial|helvetica|segoe ui|sans-serif|ui-sans-serif)$/i;

// ---------- 시그니처 (게이트 2 — 이산 4성분) ----------

// 자식 박스 y-겹침 행 클러스터링 → 행별 열 수 시퀀스
export function rowsOf(children) {
  const boxes = children.filter((c) => c.w > 8 && c.h > 8).sort((a, b) => a.y - b.y);
  const rows = [];
  for (const b of boxes) {
    const row = rows.find((r) => {
      const top = Math.max(r.y, b.y), bottom = Math.min(r.y + r.h, b.y + b.h);
      return bottom - top >= 0.5 * Math.min(r.h, b.h);
    });
    if (row) {
      row.n++;
      row.y = Math.min(row.y, b.y);
      row.h = Math.max(row.h, b.h);
    } else rows.push({ y: b.y, h: b.h, n: 1 });
  }
  return rows.map((r) => r.n);
}

export function uniformSiblings(children) {
  const boxes = children.filter((c) => c.w > 8 && c.h > 8);
  if (boxes.length < 2) return false;
  const key = (c) => `${Math.round(c.w / EPS.size)}x${Math.round(c.h / EPS.size)}|${c.skeleton}`;
  const groups = {};
  for (const c of boxes) groups[key(c)] = (groups[key(c)] ?? 0) + 1;
  return Math.max(...Object.values(groups)) / boxes.length >= 0.6;
}

export function signatureOf(section) {
  const rows = rowsOf(section.children ?? []);
  const uniform = uniformSiblings(section.children ?? []);
  let align = "left";
  const texts = section.textEls ?? [];
  if (texts.length) {
    const mid = section.left + section.width / 2;
    const avgOff =
      texts.reduce((s, t) => s + (t.x + t.w / 2 - mid), 0) / texts.length;
    if (Math.abs(avgOff) <= section.width * 0.02) align = "centered";
    else align = avgOff > 0 ? "right" : "left";
  }
  let media = "none";
  const m = (section.mediaEls ?? []).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (m) {
    const t = texts.sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (!t) media = "background";
    else if (m.w * m.h >= section.width * section.height * 0.8) media = "background";
    else if (m.y + m.h <= t.y || t.y + t.h <= m.y) media = "above";
    else media = "side";
  }
  return { rows, uniform, align, media };
}

// 변한 성분 목록 — 빈 배열 = 4성분 전부 불변 = "조정만 했음"
export function signatureDiff(a, b) {
  const changed = [];
  if (JSON.stringify(a.rows) !== JSON.stringify(b.rows)) changed.push("rows");
  if (a.uniform !== b.uniform) changed.push("uniform");
  if (a.align !== b.align) changed.push("align");
  if (a.media !== b.media) changed.push("media");
  return changed;
}

// ---------- 매핑 ----------

export function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / (setA.size + setB.size - inter);
}

export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
