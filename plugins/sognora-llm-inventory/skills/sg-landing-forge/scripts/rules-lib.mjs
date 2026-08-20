/**
 * 룰 메타데이터 + 순수 판정 로직 — detect.mjs(수집→판정)와 audit.mjs(배터리)가 공유한다.
 * **룰 ID의 SSOT는 이 파일이다** — forge-rules.md의 서술과 어긋나면 이 파일이 맞다.
 */

// 코퍼스 판정(v1.6.0) — `corpus.mjs`가 프리미엄 레퍼런스 16종에 detect를 돌린 결과
// **과반에서 발동한 규칙 4건(TS1·CO2·IC3·QF6)은 삭제했다.** 레퍼런스는 정의상 슬롭이
// 아니므로 거기서 켜지는 규칙은 슬롭이 아니라 취향을 잰다. 근거: references/corpus-baseline.json
export const RULES = {
  TS3: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  CO1: { sev: "red", layer: "surface", judge: "det", scope: "section" },
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
  IC4: { sev: "yellow", layer: "surface", judge: "suspect", scope: "section" },
  DE1: { sev: "red", layer: "structural", judge: "det", scope: "section" },
  DE2: { sev: "yellow", layer: "structural", judge: "det", scope: "section" },
  DE4: { sev: "red", layer: "structural", judge: "det", scope: "section" },
  AS1: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  BD1: { sev: "red", layer: "surface", judge: "det", scope: "section" },
  CO5: { sev: "red", layer: "surface", judge: "det", scope: "section" },
  LA4: { sev: "yellow", layer: "structural", judge: "det", scope: "section" },
  QF1: { sev: "red", layer: "surface", judge: "det", scope: "page" },
  QF2: { sev: "red", layer: "surface", judge: "det", scope: "page" },
  QF3: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  QF4: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  QF5: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  TS4: { sev: "yellow", layer: "surface", judge: "suspect", scope: "section" },
  IC5: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  IC6: { sev: "red", layer: "structural", judge: "det", scope: "section" },
  DE3: { sev: "red", layer: "structural", judge: "suspect", scope: "section" },
  AS2: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  MO1: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO1: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO2: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO3: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO4: { sev: "yellow", layer: "surface", judge: "det", scope: "page" },
  KO5: { sev: "red", layer: "content", judge: "det", scope: "page" },
  KO6: { sev: "red", layer: "content", judge: "suspect", scope: "page" },
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
  const s = String(str ?? "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+))?/.exec(s);
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
}

// 두 색이 같은 "베이스 팔레트 계열"인가 — 게이트 5(탈바꿈 검사)의 결정 기준
export function samePaletteFamily(c1, c2) {
  if (!c1 || !c2) return false;
  const a = rgbToHsl(c1), b = rgbToHsl(c2);
  const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  if (a.s < 0.15 && b.s < 0.15) return Math.abs(a.l - b.l) < 0.15; // 둘 다 무채색권: 명도대만 비교
  return dh < 30 && Math.abs(a.l - b.l) < 0.15 && Math.abs(a.s - b.s) < 0.25;
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

// 자식 박스 y-겹침 행 클러스터링 → 행 단위 멤버 목록 (DE4가 행별 여백을 재려면 멤버가 필요하다)
export function rowGroups(children) {
  const boxes = children.filter((c) => c.w > 8 && c.h > 8).sort((a, b) => a.y - b.y);
  const rows = [];
  for (const b of boxes) {
    const row = rows.find((r) => {
      const top = Math.max(r.y, b.y), bottom = Math.min(r.y + r.h, b.y + b.h);
      return bottom - top >= 0.5 * Math.min(r.h, b.h);
    });
    if (row) {
      row.members.push(b);
      row.y = Math.min(row.y, b.y);
      row.h = Math.max(row.h, b.h);
    } else rows.push({ y: b.y, h: b.h, members: [b] });
  }
  return rows;
}

// 행별 열 수 시퀀스 (시그니처용)
export function rowsOf(children) {
  return rowGroups(children).map((r) => r.members.length);
}


// ---------- 잉크 박스 (브라우저 주입용 — detect와 alive가 공유) ----------
//
// **이 함수는 문자열로 주입돼 페이지 안에서 실행된다.** 외부 클로저에 의존하면 안 되므로
// 필요한 헬퍼를 내부에 품는다. 두 계기가 각자 복제본을 들고 있으면 한쪽만 고쳐져 갈라진다
// (실제로 이 함수는 하루 사이 두 번 고쳐졌다 — 요소 rect → 텍스트 노드 Range 구간 합 → 투명 필러·배경이미지 대응).
export function inkBox(c) {
  const __vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  };

        const runs = [];
        let n = 0, mediaH = 0, pinned = false;
        const walk = (node, alpha) => {
          if (++n > 600) return;
          for (const nd of node.childNodes) {
            if (nd.nodeType === 3) {
              if (!nd.textContent.trim()) continue;
              // 보이지 않는 글자는 잉크가 아니다 — opacity .011짜리 180px 마침표로 박스를
              // 채워 DE4를 침묵시키는 우회가 실측됐다. 누적 opacity와 글자색 알파를 함께 본다.
              const pcs = getComputedStyle(node);
              const ca = /rgba?\([^)]*?,\s*([\d.]+)\s*\)/.exec(pcs.color);
              if (alpha < 0.1 || (ca && parseFloat(ca[1]) < 0.1)) continue;
              const rg = document.createRange();
              rg.selectNodeContents(nd);
              const rr = rg.getBoundingClientRect();
              if (rr.height > 0) runs.push([rr.top, rr.bottom]);
              continue;
            }
            if (nd.nodeType !== 1 || !__vis(nd)) continue;
            const ncs = getComputedStyle(nd);
            const a2 = alpha * (parseFloat(ncs.opacity) || 0);
            const nr = nd.getBoundingClientRect();
            if (ncs.position === "sticky" || ncs.position === "fixed") pinned = true;
            const isEl = ["IMG", "VIDEO", "CANVAS", "PICTURE", "SVG"].includes(nd.tagName.toUpperCase());
            // 배경 이미지로 그린 포토 카드도 잉크다 — <img>면 통과하고 background-image면 걸리던
            // 비대칭이 airbnb식 표준 패턴을 오탐시켰다(toss 실측).
            const isBg = ncs.backgroundImage.includes("url(");
            // CSS로 그린 것도 잉크다 — 그라데이션 서피스·스켈레톤 바로 조립한 제품 목업은
            // 텍스트도 <img>도 없지만 화면에는 꽉 차 있다(toss 실측 오탐의 정체).
            // 판정은 "자기 서피스를 가진 요소": 배경(색·그라데이션) 또는 보더.
            const drawn = ncs.backgroundImage !== "none" ||
              ncs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
              [ncs.borderTopWidth, ncs.borderRightWidth, ncs.borderBottomWidth, ncs.borderLeftWidth]
                .some((v) => parseFloat(v) >= 1);
            if ((isEl || isBg || drawn) && nr.width * nr.height >= 256 && a2 >= 0.1) {
              runs.push([nr.top, nr.bottom]);
              if (isEl || isBg) mediaH = Math.max(mediaH, nr.height);
              if (isEl || isBg) continue;   // 실미디어는 내부를 더 볼 것이 없다
            }
            walk(nd, a2);
          }
        };
        walk(c, 1);
        if (!runs.length) return { inkTop: 0, inkH: 0, inkMin: 0, inkMax: 0, mediaH: 0, pinned };
        runs.sort((a, b) => a[0] - b[0]);
        let sum = 0, [s, e] = runs[0];
        const min = runs[0][0];
        let max = runs[0][1];
        for (let i = 1; i < runs.length; i++) {
          max = Math.max(max, runs[i][1]);
          if (runs[i][0] <= e) e = Math.max(e, runs[i][1]);
          else { sum += e - s; [s, e] = runs[i]; }
        }
        sum += e - s;
        // inkMin/inkMax는 밴드 분기(bandVoid)의 기하 계산용 — inkH가 '합'이 된 뒤로
        // inkTop+inkH를 하단으로 쓰던 산술이 깨져 있었다.
        return { inkTop: min, inkH: sum, inkMin: min, inkMax: max, mediaH, pinned };
      }

// ---------- 여백 판정 (DE4 — "박스가 내용보다 크다") ----------
//
// 분모는 섹션이 아니라 **아이템 박스**다. 섹션 패딩은 리듬이므로 무죄이고,
// 죄는 카드·열 안쪽이 내용보다 큰 것 — 화면에서 "미완성"으로 읽히는 그 공백이다.
export const VOID = { minBoxH: 120, minVoidPx: 64, fillRatio: 0.5, minBandH: 140, minBandVoid: 96 };

// 진짜 "열"인가 — 멤버들이 가로로 **서로소**여야 나란한 다열이다.
// rowGroups는 y-겹침만 보므로 "나란한 3열"과 "같은 자리에 포개진 3층"을 구분하지 못한다.
// 후자는 크로스페이드 스크롤텔링·캐러셀의 표준 구조이고, 잉크 비율 개념이 성립하지 않는다
// (toss 실측: x=0·w=1440 전폭 absolute 레이어 3장이 "3열 여백 지배"로 잡혔다).
export function isColumnRow(members) {
  if (!members || members.length < 2) return false;
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i], b = members[j];
      const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (ov > 0.2 * Math.min(a.w, b.w)) return false;   // 겹치면 열이 아니라 층이다
    }
  return true;
}

// 아이템 1개 판정: 자기 박스의 절반도 못 채우고, 남은 공백이 절대량으로도 크다
export function isVoidBox(c) {
  if (!c || !(c.inkH > 0)) return false;
  if (c.h < VOID.minBoxH) return false;
  // 핀 고정 스크롤텔링(sticky/fixed 자손)의 박스 높이는 '스크롤 길이'이지 방의 크기가 아니다.
  // 화면에는 늘 꽉 찬 장면이 보이므로 잉크 비율 개념이 성립하지 않는다(toss 히어로 실측).
  if (c.pinned) return false;
  // 미디어가 박스 높이의 30%+를 차지하면 '빈 방'이 아니다 — 스태거(오프셋) 갤러리처럼
  // 리듬용 여백을 가진 사진 열이 걸리던 오탐(toss 실측).
  if (c.mediaH && c.mediaH >= 0.3 * c.h) return false;
  const gap = c.h - c.inkH;
  return gap >= VOID.minVoidPx && c.inkH < VOID.fillRatio * c.h;
}

// 컨테이너 1개 판정: 경계(배경·보더)가 있는 **다열 밴드**인데 잉크가 자기 높이의 절반도 안 됨.
// 패딩이 열마다가 아니라 컨테이너에 걸린 형태를 잡는다.
// 다열(row.members ≥ 3)을 요구하는 것이 핵심 — 아이브로+제목+본문이 세로로 쌓인 섹션 헤더는
// 같은 수치가 나와도 정상 리듬이다(aside.com `border-x ... py-24` 오검으로 확인).
export function bandVoid(box, row) {
  const inked = (row?.members ?? []).filter((c) => c.inkH > 0);
  if (inked.length < 3 || box.h < VOID.minBandH) return null;
  if (!box.surface && !box.bordered) return null;
  if (inked.some((c) => c.pinned)) return null;
  const top = Math.min(...inked.map((c) => c.inkMin ?? c.inkTop));
  const bottom = Math.max(...inked.map((c) => c.inkMax ?? c.inkTop + c.inkH));
  const ink = bottom - top;
  const gap = box.h - ink;
  if (gap < VOID.minBandVoid || ink >= VOID.fillRatio * box.h) return null;
  return { ink: Math.round(ink), gap: Math.round(gap), h: Math.round(box.h) };
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
