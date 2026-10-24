import type { Category, Level } from "./types";
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

/**
 * Optional sub-types. Picking one also suggests a title, how many people and how long,
 * so it doubles as a quick start. Keys are stored in the database (a-z and _ only).
 */
export interface Sub { k: string; cat: Category; th: string; en: string; titleTh: string; titleEn: string; need: number; dur: number; level: Level }
export const SUBS: Sub[] = [
  { k: "badminton",  cat: "sport", th: "แบดมินตัน", en: "Badminton",    titleTh: "ตีแบดคู่ ขาด 2 คน",       titleEn: "Doubles badminton, need 2",   need: 2, dur: 120, level: "casual" },
  { k: "football",   cat: "sport", th: "ฟุตบอล",    en: "Football",     titleTh: "ฟุตบอล 7 คน ขาดอีก 3",     titleEn: "7-a-side football, need 3",   need: 3, dur: 90,  level: "casual" },
  { k: "basketball", cat: "sport", th: "บาส",       en: "Basketball",   titleTh: "บาส 3x3 ขาด 2 คน",         titleEn: "3x3 basketball, need 2",      need: 2, dur: 90,  level: "casual" },
  { k: "pickleball", cat: "sport", th: "พิกเกิลบอล", en: "Pickleball",  titleTh: "พิกเกิลบอล หาคู่ตี",        titleEn: "Pickleball, need a partner",  need: 1, dur: 90,  level: "any" },
  { k: "tennis",     cat: "sport", th: "เทนนิส",    en: "Tennis",       titleTh: "เทนนิส หาคู่ตี",            titleEn: "Tennis, need a partner",      need: 1, dur: 90,  level: "casual" },
  { k: "volleyball", cat: "sport", th: "วอลเลย์",   en: "Volleyball",   titleTh: "วอลเลย์บอล ขาดอีก 3",       titleEn: "Volleyball, need 3",          need: 3, dur: 90,  level: "any" },
  { k: "pingpong",   cat: "sport", th: "ปิงปอง",    en: "Table tennis", titleTh: "ปิงปอง หาคู่ตี",            titleEn: "Table tennis, need a partner", need: 1, dur: 60, level: "any" },
  { k: "gym",        cat: "sport", th: "ฟิตเนส",    en: "Gym",          titleTh: "หาบัดดี้เข้ายิม",            titleEn: "Gym buddy",                   need: 1, dur: 90,  level: "any" },

  { k: "jam",        cat: "music", th: "แจม",       en: "Jam",          titleTh: "แจมดนตรี ใครเล่นอะไรมาได้", titleEn: "Music jam, bring anything",   need: 4, dur: 120, level: "any" },
  { k: "acoustic",   cat: "music", th: "กีตาร์โปร่ง", en: "Acoustic",   titleTh: "นั่งเล่นกีตาร์ร้องเพลง",     titleEn: "Acoustic sing-along",         need: 4, dur: 120, level: "any" },
  { k: "karaoke",    cat: "music", th: "คาราโอเกะ", en: "Karaoke",      titleTh: "คาราโอเกะ ขาดอีก 3",         titleEn: "Karaoke, need 3",             need: 3, dur: 120, level: "any" },
  { k: "livemusic",  cat: "music", th: "ดูดนตรีสด", en: "Live music",   titleTh: "ไปดูดนตรีสดด้วยกัน",         titleEn: "Live music together",         need: 3, dur: 150, level: "any" },

  { k: "boardgame",  cat: "games", th: "บอร์ดเกม",  en: "Board games",  titleTh: "บอร์ดเกมคืนนี้",             titleEn: "Board games tonight",         need: 3, dur: 180, level: "beginner" },
  { k: "cards",      cat: "games", th: "เกมการ์ด",  en: "Card games",   titleTh: "เล่นการ์ดเกม ขาด 2 คน",      titleEn: "Card games, need 2",          need: 2, dur: 120, level: "any" },
  { k: "werewolf",   cat: "games", th: "หมาป่า/ปาร์ตี้", en: "Party games", titleTh: "เกมหมาป่า ยิ่งเยอะยิ่งสนุก", titleEn: "Werewolf, the more the better", need: 6, dur: 120, level: "any" },
  { k: "chess",      cat: "games", th: "หมากรุก",   en: "Chess",        titleTh: "หาคู่เล่นหมากรุก",           titleEn: "Chess, need an opponent",     need: 1, dur: 90,  level: "any" },
  { k: "videogame",  cat: "games", th: "เกมคอนโซล", en: "Video games",  titleTh: "เล่นเกมคอนโซลด้วยกัน",        titleEn: "Console games together",      need: 2, dur: 120, level: "any" },

  { k: "run",        cat: "outdoor", th: "วิ่ง",     en: "Run",          titleTh: "วิ่งชิล 5 กม.",              titleEn: "Easy 5 km run",               need: 4, dur: 60,  level: "beginner" },
  { k: "bike",       cat: "outdoor", th: "ปั่นจักรยาน", en: "Cycling",   titleTh: "ปั่นจักรยานรอบสวน",           titleEn: "Bike ride around the park",   need: 4, dur: 90,  level: "casual" },
  { k: "walk",       cat: "outdoor", th: "เดินเล่น", en: "Walk",         titleTh: "เดินเล่นในสวน",               titleEn: "Walk in the park",            need: 4, dur: 60,  level: "any" },
  { k: "yoga",       cat: "outdoor", th: "โยคะ",     en: "Yoga",         titleTh: "โยคะในสวน เอาเสื่อมาเอง",     titleEn: "Yoga in the park, bring a mat", need: 5, dur: 60, level: "any" },
  { k: "photo",      cat: "outdoor", th: "ถ่ายรูป",  en: "Photo walk",   titleTh: "เดินถ่ายรูปด้วยกัน",          titleEn: "Photo walk",                  need: 4, dur: 120, level: "any" },

  { k: "sketch",     cat: "make", th: "วาดรูป",     en: "Sketching",    titleTh: "นั่งสเก็ตช์ภาพด้วยกัน",        titleEn: "Sketch together",             need: 4, dur: 120, level: "any" },
  { k: "craft",      cat: "make", th: "งานฝีมือ",   en: "Crafts",       titleTh: "ทำงานฝีมือด้วยกัน",            titleEn: "Craft together",              need: 4, dur: 120, level: "any" },
  { k: "bookclub",   cat: "make", th: "อ่านหนังสือ", en: "Book club",   titleTh: "นั่งอ่านหนังสือด้วยกัน",       titleEn: "Read together",               need: 4, dur: 120, level: "any" },
  { k: "cowork",     cat: "make", th: "นั่งทำงาน",  en: "Co-working",   titleTh: "หาเพื่อนนั่งทำงานด้วยกัน",     titleEn: "Co-work together",            need: 3, dur: 180, level: "any" },
];
export const subsOf = (c: Category) => SUBS.filter((s) => s.cat === c);
export const subByKey = (k: string | null | undefined) => (k ? SUBS.find((s) => s.k === k) ?? null : null);
export const subName = (k: string | null | undefined) => { const s = subByKey(k); return s ? (getLang() === "th" ? s.th : s.en) : null; };
