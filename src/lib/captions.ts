// Posts that write themselves from what's on the map (English + Thai).
import type { Pulse } from "./types";
import { CATS } from "./categories";
import { accepted, DAY, HOUR, isOver, ms, openSpots, status } from "./pulse";
import { ago, dayClock, inLang } from "./format";

import type { Lang } from "./i18n";
export type { Lang };
export const appUrl = () => window.location.origin + window.location.pathname;
export const linkFor = (p?: Pulse) => appUrl() + (p ? `?p=${p.id}` : "");
/** Public shares never reveal an accept-only spot. */
const where = (p: Pulse, lang: Lang) => (p.visibility === "all" && p.exact ? p.exact.place_name : lang === "th" ? `แถว${p.area_name}` : `around ${p.area_name}`);
const TAG = (lang: Lang) => (lang === "th" ? "#แถว" : "#Thaew");

export function pulseCaption(p: Pulse, lang: Lang): string {
  if (isOver(p)) return recapCaption(p, lang);
  const o = openSpots(p), st = status(p), c = CATS[p.category];
  if (lang === "th")
    return `${c.emoji} ${p.title}\n${st.k === "live" ? "กำลังเล่นอยู่ตอนนี้" : `เริ่ม ${inLang("th", () => dayClock(p.starts_at))}`} · ${where(p, "th")}\n${o > 0 ? `ขาดอีก ${o} คน ว่างมาจอยกันได้เลย 👉` : "รอบนี้เต็มแล้ว ดูกิจกรรมอื่นใกล้ๆ 👉"} ${linkFor(p)}\n${TAG("th")} #หาเพื่อน${c.th}`;
  return `${c.emoji} ${p.title}\n${st.k === "live" ? "Happening now" : `Starts ${inLang("en", () => dayClock(p.starts_at))}`} · ${where(p, "en")}\n${o > 0 ? `Need ${o} more. Tap to join:` : "Full this time. See what else is on:"} ${linkFor(p)}\n${TAG("en")} #${c.tag}`;
}

export function recapCaption(p: Pulse, lang: Lang): string {
  const n = accepted(p).length + 1;
  if (lang === "th")
    return `${n} คนมาเจอกันจริงที่ “${p.title}” แถว${p.area_name}\nรอบหน้าอยากเล่นด้วย กดดูกิจกรรมใกล้ตัวได้เลย 👉 ${linkFor(p)}\n${TAG("th")} #หาเพื่อน${CATS[p.category].th}`;
  return `${n} people met up for “${p.title}” around ${p.area_name} (${inLang("en", () => ago(p.ends_at))}).\nWant in next time? See what's on near you: ${linkFor(p)}\n${TAG("en")} #${CATS[p.category].tag}`;
}

export function nowPost(list: Pulse[], lang: Lang): string {
  const now = Date.now();
  const open = list.filter((p) => !isOver(p) && ms(p.starts_at) - now <= 3 * HOUR && openSpots(p) > 0)
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at)).slice(0, 5);
  if (!open.length)
    return lang === "th" ? `ตอนนี้ยังไม่มีใครปักหมุดแถวนี้ เป็นคนแรกเลยไหม? 👉 ${appUrl()}` : `Nothing open nearby right now. Be the first to start something: ${appUrl()}`;
  const lines = open.map((p) => {
    const s = status(p);
    const when = s.k === "live" ? (lang === "th" ? "ตอนนี้" : "now") : inLang(lang, () => dayClock(p.starts_at));
    return `${CATS[p.category].emoji} ${p.title} · ${when} · ${p.area_name} · ${lang === "th" ? "ขาด" : "need"} ${openSpots(p)}`;
  });
  return lang === "th"
    ? `ใกล้ๆ นี้ใน 3 ชม. ข้างหน้า ยังขาดคน:\n${lines.join("\n")}\nกดจอยได้เลย 👉 ${appUrl()}`
    : `Open spots nearby in the next 3 hours:\n${lines.join("\n")}\nJoin in one tap: ${appUrl()}`;
}

export function weekPost(list: Pulse[], lang: Lang): string {
  const now = Date.now();
  const wk = list.filter((p) => isOver(p) && now - ms(p.ends_at) <= 7 * DAY);
  if (!wk.length)
    return lang === "th" ? `สัปดาห์นี้ยังเงียบอยู่ เริ่มกิจกรรมแรกของย่านคุณได้เลย 👉 ${appUrl()}` : `Quiet week so far. Start the first meetup in your area: ${appUrl()}`;
  const people = wk.reduce((s, p) => s + accepted(p).length + 1, 0);
  const byCat: Record<string, number> = {}, byArea: Record<string, number> = {};
  wk.forEach((p) => { byCat[p.category] = (byCat[p.category] || 0) + 1; byArea[p.area_name] = (byArea[p.area_name] || 0) + 1; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => (lang === "th" ? `${CATS[k as Pulse["category"]].th} ${v}` : `${v} ${CATS[k as Pulse["category"]].name.toLowerCase()}`)).join(", ");
  const top = Object.entries(byArea).sort((a, b) => b[1] - a[1])[0][0];
  return lang === "th"
    ? `สัปดาห์นี้บนแอป “แถว”: ${wk.length} กิจกรรม ${people} คนออกมาเจอกันจริง\n(${cats})\nย่านที่คึกคักสุด: ${top}\nสัปดาห์หน้าจะเล่นอะไรดี 👉 ${appUrl()}`
    : `This week on Thaew: ${wk.length} meetups, ${people} people showed up in real life.\n(${cats})\nBusiest spot: ${top}.\nWhat are you starting next week? ${appUrl()}`;
}
