import { DAY, HOUR, MIN } from "./pulse";

export const clock = (t: number | string) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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
