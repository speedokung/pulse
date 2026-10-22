import type { LatLng } from "./types";

export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Same snapping the database uses, for demo mode. */
export const roughen = (v: number) => Math.floor(v / 0.003) * 0.003 + 0.0015;

export function circle(center: LatLng, radiusM: number, props: Record<string, unknown> = {}, steps = 64) {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111320, dLng = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: props, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

/** Opens Google Maps (the app on phones) with walking directions to the spot. */
export const googleNavUrl = (ll: LatLng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}&travelmode=walking`;

/**
 * Reads a spot from a pasted Google Maps link or "lat, lng".
 * Short share links (maps.app.goo.gl) can't be read from the browser.
 */
export function parseMapsLink(input: string): { ll: LatLng; place: string | null } | "short" | null {
  const s = input.trim();
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s)) return "short";
  let t = s; try { t = decodeURIComponent(s.replace(/\+/g, " ")); } catch { /* keep raw */ }
  const m = t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/)
    || t.match(/[?&](?:q|query|ll|destination|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
    || t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
    || t.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const place = t.match(/\/place\/([^/@]+)/)?.[1]?.trim() || null;
  return { ll: { lat, lng }, place };
}

/** Area name for a spot, from OpenStreetMap Nominatim (free; keep usage light). */
export async function areaName(ll: LatLng): Promise<string> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=en&lat=${ll.lat}&lon=${ll.lng}`,
      { signal: ctl.signal },
    );
    clearTimeout(t);
    const j = await r.json();
    const a = j.address || {};
    return a.park || a.suburb || a.neighbourhood || a.quarter || a.city_district || a.road || "Nearby";
  } catch {
    return "Nearby";
  }
}
