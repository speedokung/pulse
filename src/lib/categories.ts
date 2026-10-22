import type { Category } from "./types";

export const CATS: Record<Category, { name: string; th: string; color: string; glyph: string; emoji: string; tag: string }> = {
  sport:   { name: "Sports",      th: "กีฬา",     color: "#e8590c", glyph: "SP", emoji: "🏓", tag: "pickupsports" },
  music:   { name: "Music",       th: "ดนตรี",    color: "#c2255c", glyph: "MU", emoji: "🎸", tag: "jam" },
  games:   { name: "Board games", th: "บอร์ดเกม", color: "#6741d9", glyph: "BG", emoji: "🎲", tag: "boardgames" },
  outdoor: { name: "Outdoors",    th: "กลางแจ้ง", color: "#2b8a3e", glyph: "OD", emoji: "🌳", tag: "outdoors" },
  make:    { name: "Making",      th: "งานศิลป์",  color: "#0b7285", glyph: "MK", emoji: "✏️", tag: "makers" },
};
export const CAT_KEYS = Object.keys(CATS) as Category[];

export const RADII = {
  walk:  { label: "Walk · 1 km",  m: 1000 },
  bike:  { label: "Bike · 3 km",  m: 3000 },
  drive: { label: "Drive · 10 km", m: 10000 },
} as const;
export type RadiusKey = keyof typeof RADII;
