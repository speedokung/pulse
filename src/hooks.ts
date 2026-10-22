import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPost, LatLng, Pulse } from "./lib/types";
import { errText, loadFeed, loadPulses, subscribe } from "./lib/api";
import { HOUR, isOver, ms } from "./lib/pulse";

const DEFAULT = (() => {
  const [lat, lng] = (import.meta.env.VITE_DEFAULT_CENTER || "13.7383,100.5410").split(",").map(Number);
  return { lat, lng };
})();
const read = <X,>(k: string, d: X): X => { try { const v = localStorage.getItem("pulse." + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem("pulse." + k, JSON.stringify(v)); } catch { /* private mode */ } };
export const prefs = { read, write };

/** GPS when allowed; otherwise a spot the person tapped, otherwise the city centre. */
export function useLocation() {
  const manual = read<LatLng | null>("manualSpot", null);
  const [me, setMe] = useState<LatLng>(manual || DEFAULT);
  const [source, setSource] = useState<"gps" | "manual" | "default">(manual ? "manual" : "default");
  const src = useRef(source); src.current = source;
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => { if (src.current === "manual") return; setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); setSource("gps"); },
      () => { /* denied or unavailable: keep fallback */ },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  const setManual = useCallback((ll: LatLng) => { setMe(ll); setSource("manual"); write("manualSpot", ll); }, []);
  const useGps = useCallback(() => {
    write("manualSpot", null); setSource("default");
    navigator.geolocation?.getCurrentPosition((p) => { setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); setSource("gps"); }, () => {});
  }, []);
  return { me, source, setManual, useGps };
}

/** Pulses near `center` + their feed posts, kept live via realtime. */
export function useLiveData(center: LatLng, enabled: boolean) {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const c = useRef(center); c.current = center;
  const key = `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;

  const reload = useCallback(async () => {
    try {
      const list = await loadPulses(c.current);
      const recent = list.filter((p) => !isOver(p) || Date.now() - ms(p.ends_at) < 24 * HOUR).map((p) => p.id);
      const feed = await loadFeed(recent);
      setPulses(list); setPosts(feed); setError(null);
    } catch (e) { setError(errText(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (enabled) reload(); }, [key, enabled, reload]);
  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = subscribe(() => { clearTimeout(t); t = setTimeout(reload, 350); });
    return () => { clearTimeout(t); off(); };
  }, [enabled, reload]);
  return { pulses, posts, loading, error, reload };
}

/** Re-render every 30 s so "starts in 5 min" and expiry stay current. */
export function useTick(msInterval = 30_000) {
  const [, set] = useState(0);
  useEffect(() => { const i = setInterval(() => set((x) => x + 1), msInterval); return () => clearInterval(i); }, [msInterval]);
}
