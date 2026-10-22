import type { Category } from "./types";
import { getLang, t } from "./i18n";

export const CATS: Record<Category, { name: string; th: string; color: string; glyph: string; thGlyph: string; emoji: string; tag: string }> = {
  sport:   { name: "Sports",      th: "กีฬา",     color: "#e8590c", glyph: "SP", thGlyph: "กีฬา", emoji: "🏸", tag: "pickupsports" },
  music:   { name: "Music",       th: "ดนตรี",    color: "#c2255c", glyph: "MU", thGlyph: "ดนตรี", emoji: "🎸", tag: "jam" },
  games:   { name: "Board games", th: "บอร์ดเกม", color: "#6741d9", glyph: "BG", thGlyph: "เกม", emoji: "🎲", tag: "boardgames" },
  outdoor: { name: "Outdoors",    th: "กลางแจ้ง", color: "#2b8a3e", glyph: "OD", thGlyph: "แจ้ง", emoji: "🌳", tag: "outdoors" },
  make:    { name: "Making",      th: "งานศิลป์",  color: "#0b7285", glyph: "MK", thGlyph: "ศิลป์", emoji: "✏️", tag: "makers" },
};
export const CAT_KEYS = Object.keys(CATS) as Category[];
export const catName = (k: Category) => (getLang() === "th" ? CATS[k].th : CATS[k].name);
/** Short mark for markers and list icons. */
export const catGlyph = (k: Category) => (getLang() === "th" ? CATS[k].thGlyph : CATS[k].glyph);

export const RADII = {
  walk:  { label: () => t("radiusWalk"),  m: 1000 },
  bike:  { label: () => t("radiusBike"),  m: 3000 },
  drive: { label: () => t("radiusDrive"), m: 10000 },
} as const;
export type RadiusKey = keyof typeof RADII;

/** Small line icons, the same in every language (Thai words don't fit inside a map marker). */
const ICON_PATHS: Record<Category, string> = {
  sport: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5c5 1.5 12 1.5 17 0M3.5 14.5c5-1.5 12-1.5 17 0"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  games: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  outdoor: '<path d="M12 3l6 8h-3.5l4.5 6H5l4.5-6H6z"/><path d="M12 17v4"/>',
  make: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
};
export const catIcon = (k: Category, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[k]}</svg>`;
