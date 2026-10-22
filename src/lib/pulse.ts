import type { LatLng, Pulse } from "./types";
import { distanceM } from "./geo";
import { t } from "./i18n";

export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export const ms = (iso: string) => new Date(iso).getTime();

export type Status = { k: "over" } | { k: "live"; left: number } | { k: "soon"; in: number };
export function status(p: Pulse, now = Date.now()): Status {
  const s = ms(p.starts_at), e = ms(p.ends_at);
  if (now >= e) return { k: "over" };
  if (now >= s) return { k: "live", left: Math.ceil((e - now) / MIN) };
  return { k: "soon", in: Math.ceil((s - now) / MIN) };
}
export const isOver = (p: Pulse, now = Date.now()) => now >= ms(p.ends_at);
export const accepted = (p: Pulse) => p.memberships.filter((m) => m.status === "accepted");
export const openSpots = (p: Pulse) => p.need - accepted(p).length;
export const myStatus = (p: Pulse, uid: string | null) => p.memberships.find((m) => m.user_id === uid)?.status ?? null;
export const isHost = (p: Pulse, uid: string | null) => !!uid && p.host_id === uid;
export const isParticipant = (p: Pulse, uid: string | null) => isHost(p, uid) || myStatus(p, uid) === "accepted";

/** Where to draw it: ended Pulses and locked ones sit at the rough area. */
export function pos(p: Pulse, now = Date.now()): LatLng {
  if (!isOver(p, now) && p.exact) return { lat: p.exact.lat, lng: p.exact.lng };
  return { lat: p.rough_lat, lng: p.rough_lng };
}
export const showsExact = (p: Pulse, now = Date.now()) => !isOver(p, now) && !!p.exact;
export const placeLabel = (p: Pulse, now = Date.now()) => (showsExact(p, now) ? p.exact!.place_name : t("around", { a: p.area_name }));
export const hostName = (p: Pulse, uid: string | null) => (isHost(p, uid) ? t("you") : p.host?.display_name || t("someone"));

export const BURY_M = 350;
/**
 * A newer Pulse at or near the same spot buries older, ended ones.
 * `surfaced` (search results) are always drawn and never buried.
 */
export function bury(items: Pulse[], surfaced: Set<string> | null, now = Date.now()) {
  const buried = new Set<string>();
  const P = new Map(items.map((p) => [p.id, pos(p, now)]));
  for (const g of items) {
    if (!isOver(g, now)) continue;
    if (surfaced) { if (!surfaced.has(g.id)) buried.add(g.id); continue; }
    const gp = P.get(g.id)!;
    if (items.some((q) => q !== g && ms(q.created_at) > ms(g.created_at) && distanceM(P.get(q.id)!, gp) < BURY_M)) buried.add(g.id);
  }
  const stack = new Map<string, number>();
  for (const p of items) {
    if (buried.has(p.id)) continue;
    const pp = P.get(p.id)!;
    const n = items.filter((g) => buried.has(g.id) && ms(g.created_at) < ms(p.created_at) && distanceM(P.get(g.id)!, pp) < BURY_M).length;
    if (n) stack.set(p.id, n);
  }
  return { buried, stack };
}
