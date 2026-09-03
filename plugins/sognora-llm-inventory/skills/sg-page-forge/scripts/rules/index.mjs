/** rules/index.mjs — 모든 규칙을 한 목록으로. detect·corpus·테스트가 여기서만 규칙을 얻는다. */
import { rules as font } from "./font.mjs";
import { rules as type } from "./type.mjs";
import { rules as korean } from "./korean.mjs";
import { rules as color } from "./color.mjs";
import { rules as layout } from "./layout.mjs";
import { rules as density } from "./density.mjs";
import { rules as icon } from "./icon.mjs";
import { rules as copy } from "./copy.mjs";
import { rules as motion } from "./motion.mjs";
import { rules as asset } from "./asset.mjs";
import { rules as quality } from "./quality.mjs";
import { rules as structure } from "./structure.mjs";
import { rules as state } from "./state.mjs";

export const ALL_RULES = [...font, ...type, ...korean, ...color, ...layout, ...density, ...icon, ...copy, ...motion, ...asset, ...quality, ...structure, ...state];
export const byId = Object.fromEntries(ALL_RULES.map((r) => [r.id, r]));

/** 단독으로 실패시키는 규칙 — 계측이지 취향이 아닌 것(정의) */
export const STANDALONE_RED = new Set(["density.void-band", "quality.overflow-x", "text.hidden-at-rest", "quality.runtime-error", "page.blank", "font.hangul-fallback", "asset.placeholder", "copy.maker-voice", "work.below-fold", "work.starved", "structure.prose-only", "catalog.too-few-items", "catalog.no-entry-action", "tool.no-input", "pricing.no-price", "form.too-few-fields", "type.landing-drift", "korean.italic", "quality.tap-target", "layout.numbered-badge-card", "icon.numbered-list", "density.prose-stat-band", "card.hollow"]);

/** 면제 불가 규칙 — 스타일이 아니라 결함(forge-rules §0) */
export const NON_EXEMPT = new Set(["quality.overflow-x", "text.hidden-at-rest", "type.min-size", "quality.tap-target", "quality.runtime-error", "page.blank", "korean.line-height", "korean.italic", "font.hangul-fallback", "asset.placeholder", "copy.maker-voice"]);
