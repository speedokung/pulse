// Free place search from OpenStreetMap data: Photon (made for type-ahead),
// falling back to Nominatim. Results stay within ~35 km of the person.
import type { LatLng } from "./types";
import { distanceM } from "./geo";

export interface PlaceHit { name: string; detail: string; ll: LatLng; dist: number }

const SPAN = 0.32; // degrees around the person (~35 km)
const box = (c: LatLng) => ({ w: c.lng - SPAN, s: c.lat - SPAN, e: c.lng + SPAN, n: c.lat + SPAN });
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

async function photon(q: string, near: LatLng, signal: AbortSignal): Promise<PlaceHit[]> {
  const b = box(near);
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${near.lat}&lon=${near.lng}&limit=8&bbox=${b.w},${b.s},${b.e},${b.n}`, { signal });
  if (!r.ok) throw new Error("photon " + r.status);
  const j = await r.json();
  return (j.features || []).map((f: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }) => {
    const p = f.properties, ll = { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || p.district || "Unnamed place";
    const detail = uniq([p.name ? p.street : "", p.district || p.locality, p.city]).join(", ");
    return { name, detail, ll, dist: distanceM(near, ll) };
  });
}

async function nominatim(q: string, near: LatLng, signal: AbortSignal): Promise<PlaceHit[]> {
  const b = box(near);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=th,en&bounded=1&viewbox=${b.w},${b.n},${b.e},${b.s}&q=${encodeURIComponent(q)}`, { signal });
  if (!r.ok) throw new Error("nominatim " + r.status);
  const j = (await r.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
  return j.map((x) => {
    const parts = x.display_name.split(",").map((s) => s.trim());
    const ll = { lat: +x.lat, lng: +x.lon };
    return { name: x.name || parts[0], detail: parts.slice(x.name ? 1 : 1, 4).join(", "), ll, dist: distanceM(near, ll) };
  });
}

export async function searchPlaces(q: string, near: LatLng, signal: AbortSignal): Promise<PlaceHit[]> {
  let hits: PlaceHit[] = [];
  try { hits = await photon(q, near, signal); } catch (e) { if (signal.aborted) throw e; }
  if (!hits.length) hits = await nominatim(q, near, signal);
  // the same place often appears several times (building, entrance, shop inside): keep one per name per ~300 m
  const kept: PlaceHit[] = [];
  for (const h of hits.sort((a, b) => a.dist - b.dist)) {
    if (!kept.some((k) => k.name === h.name && distanceM(k.ll, h.ll) < 300)) kept.push(h);
  }
  return kept.slice(0, 6);
}
