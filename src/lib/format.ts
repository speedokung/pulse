import { DAY, HOUR, MIN } from "./pulse";
import { getLang, type Lang } from "./i18n";

let forced: Lang | null = null;
const th = () => (forced ?? getLang()) === "th";
/** Format in a specific language (captions can differ from the app language). */
export function inLang<X>(l: Lang, fn: () => X): X { const prev = forced; forced = l; try { return fn(); } finally { forced = prev; } }
const pad = (n: number) => String(n).padStart(2, "0");

/** Always 24-hour, the way Thais read time: "19:30" (Thai adds "น." where it reads naturally). */
export const clock = (t: number | string | Date) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const TH_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "19:30 น.", "พรุ่งนี้ 19:30 น.", "ส. 25 ต.ค. 19:30 น."  /  "19:30", "tomorrow 19:30", "Sat 25 Oct 19:30" */
export function dayClock(t: number | string) {
  const d = new Date(t), now = new Date();
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  const c = clock(d) + (th() ? " น." : "");
  if (days === 0) return c;
  if (days === 1) return th() ? `พรุ่งนี้ ${c}` : `tomorrow ${c}`;
  return th()
    ? `${TH_DAYS[d.getDay()]} ${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${c}`
    : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${c}`;
}

/** 90 → "1 ชม. 30 นาที" / "1 h 30 min" */
export function span(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  const [H, M] = th() ? ["ชม.", "นาที"] : ["h", "min"];
  return [h ? `${h} ${H}` : "", m ? `${m} ${M}` : ""].filter(Boolean).join(" ") || `0 ${M}`;
}

export function ago(t: number | string) {
  const d = Date.now() - new Date(t).getTime();
  if (d < MIN) return th() ? "เมื่อกี้" : "just now";
  if (d < HOUR) { const n = Math.round(d / MIN); return th() ? `${n} นาทีที่แล้ว` : `${n} min ago`; }
  if (d < DAY) { const n = Math.round(d / HOUR); return th() ? `${n} ชม.ที่แล้ว` : `${n} h ago`; }
  const n = Math.round(d / DAY);
  if (n === 1) return th() ? "เมื่อวาน" : "yesterday";
  return th() ? `${n} วันก่อน` : `${n} days ago`;
}

export const dist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} ${th() ? "ม." : "m"}` : `${(m / 1000).toFixed(1)} ${th() ? "กม." : "km"}`);
export const walkMin = (m: number) => Math.max(1, Math.round(m / 80));
