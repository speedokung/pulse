import { DAY, HOUR, MIN } from "./pulse";

export const clock = (t: number | string | Date) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** "19:30", "tomorrow 19:30" or "Sat 25 Oct 19:30". */
export function dayClock(t: number | string) {
  const d = new Date(t), now = new Date();
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return clock(d);
  if (days === 1) return `tomorrow ${clock(d)}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${clock(d)}`;
}

/** 90 → "1 h 30 min" */
export function span(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}

export function ago(t: number | string) {
  const d = Date.now() - new Date(t).getTime();
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`;
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`;
  const n = Math.round(d / DAY);
  return n === 1 ? "yesterday" : `${n} days ago`;
}

export const dist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
export const walkMin = (m: number) => Math.max(1, Math.round(m / 80));
