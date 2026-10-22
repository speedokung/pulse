import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng, Pulse } from "../lib/types";
import { CATS, catIcon } from "../lib/categories";
import { t } from "../lib/i18n";
import { circle } from "../lib/geo";
import { bury, isHost, isOver, openSpots, pos, showsExact, status } from "../lib/pulse";

import { prefersDark, simpleStyle } from "../lib/mapStyle";

const EMPTY = { type: "FeatureCollection" as const, features: [] };
function addOverlays(m: maplibregl.Map, dark: boolean) {
  const you = dark ? "#5b8cff" : "#1a5cff";
  if (!m.getSource("radius")) m.addSource("radius", { type: "geojson", data: EMPTY });
  if (!m.getSource("areas")) m.addSource("areas", { type: "geojson", data: EMPTY });
  m.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": you, "fill-opacity": 0.05 } });
  m.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": you, "line-opacity": 0.5, "line-width": 1.5, "line-dasharray": [3, 3] } });
  m.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 } });
  m.addLayer({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": ["get", "color"], "line-opacity": 0.6, "line-width": 1.5, "line-dasharray": [2, 2] } });
}
const LOCK = '<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5" width="8" height="6" rx="1.5" fill="currentColor"/><path d="M4 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

interface Props {
  me: LatLng;
  items: Pulse[];
  uid: string | null;
  selectedId: string | null;
  surfaced: Set<string> | null;
  radiusM: number;
  placing: boolean;
  pin: LatLng | null;
  centerOn: { ll: LatLng; k: number } | null;
  onSelect: (id: string | null) => void;
  onPick: (ll: LatLng) => void;
}

export function MapView(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marks = useRef(new Map<string, maplibregl.Marker>());
  const meMark = useRef<maplibregl.Marker | null>(null);
  const pinMark = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const live = useRef(p); live.current = p;

  const [styleV, setStyleV] = useState(0); // bumps when the style (re)loads, so overlays get their data back

  // create the map once, with the simplified style
  useEffect(() => {
    let m: maplibregl.Map | null = null, dead = false;
    const dark = prefersDark();
    simpleStyle(dark).then((style) => {
      if (dead) return;
      m = new maplibregl.Map({
        container: box.current!, style, center: [live.current.me.lng, live.current.me.lat], zoom: 15,
        attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.on("style.load", () => { addOverlays(m!, prefersDark()); setStyleV((v) => v + 1); });
      m.on("click", (e) => {
        if ((e.originalEvent.target as HTMLElement).closest(".pm")) return;
        if (live.current.placing) live.current.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        else live.current.onSelect(null);
      });
      map.current = m;
      setReady(true);
    });
    // follow the system light/dark setting
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onTheme = () => { simpleStyle(mq.matches).then((s) => map.current?.setStyle(s)); };
    mq?.addEventListener?.("change", onTheme);
    return () => { dead = true; mq?.removeEventListener?.("change", onTheme); m?.remove(); map.current = null; };
  }, []);

  // you + radius
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!meMark.current) {
      const el = document.createElement("div"); el.className = "me-dot"; el.setAttribute("aria-label", "You are here");
      meMark.current = new maplibregl.Marker({ element: el }).setLngLat([p.me.lng, p.me.lat]).addTo(m);
    } else meMark.current.setLngLat([p.me.lng, p.me.lat]);
    const src = m.getSource("radius") as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: [circle(p.me, p.radiusM)] });
  }, [p.me, p.radiusM, ready, styleV]);

  // drop-pin (draggable)
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!p.pin) { pinMark.current?.remove(); pinMark.current = null; return; }
    if (!pinMark.current) {
      pinMark.current = new maplibregl.Marker({ color: "#ff5a36", draggable: true }).setLngLat([p.pin.lng, p.pin.lat]).addTo(m);
      pinMark.current.on("dragend", () => { const ll = pinMark.current!.getLngLat(); live.current.onPick({ lat: ll.lat, lng: ll.lng }); });
    } else pinMark.current.setLngLat([p.pin.lng, p.pin.lat]);
  }, [p.pin, ready]);

  useEffect(() => { map.current?.getCanvas().style.setProperty("cursor", p.placing ? "crosshair" : ""); }, [p.placing]);

  useEffect(() => {
    if (!p.centerOn || !map.current) return;
    map.current.easeTo({ center: [p.centerOn.ll.lng, p.centerOn.ll.lat], duration: 600 });
  }, [p.centerOn]);

  // Pulses
  useEffect(() => {
    const m = map.current; if (!m) return;
    const now = Date.now();
    const { buried, stack } = bury(p.items, p.surfaced, now);
    const seen = new Set<string>();
    // draw order: buried < ghosts < active < selected
    const rank = (x: Pulse) => (x.id === p.selectedId ? 3 : buried.has(x.id) ? 0 : isOver(x, now) ? 1 : 2);
    [...p.items].sort((a, b) => rank(a) - rank(b)).forEach((x) => {
      seen.add(x.id);
      const ll = pos(x, now);
      let mk = marks.current.get(x.id);
      if (!mk) {
        // outer element belongs to MapLibre (it positions it); we style the inner one
        const outer = document.createElement("div");
        outer.appendChild(document.createElement("div"));
        outer.addEventListener("click", (e) => { e.stopPropagation(); live.current.onSelect(x.id); });
        outer.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); live.current.onSelect(x.id); } });
        mk = new maplibregl.Marker({ element: outer }).setLngLat([ll.lng, ll.lat]).addTo(m);
        marks.current.set(x.id, mk);
      } else mk.setLngLat([ll.lng, ll.lat]);
      mk.getElement().style.zIndex = String(rank(x) + 1);
      const el = mk.getElement().firstElementChild as HTMLDivElement;
      el.style.setProperty("--c", CATS[x.category].color);
      const sel = x.id === p.selectedId, n = stack.get(x.id) || 0;
      if (buried.has(x.id)) {
        el.className = "pm pm-buried"; el.innerHTML = ""; el.tabIndex = -1; el.removeAttribute("role");
        return;
      }
      el.tabIndex = 0; el.setAttribute("role", "button");
      if (isOver(x, now)) {
        el.className = `pm pm-ghost${sel ? " sel" : ""}${p.surfaced ? " hi" : ""}`;
        el.setAttribute("aria-label", `${t("ended")}: ${x.title}`);
        el.innerHTML = `${n ? '<i class="pm-sheet"></i><i class="pm-sheet b"></i>' : ""}<span class="pm-core">${catIcon(x.category, 13)}</span>`
          + (sel || p.surfaced ? `<span class="pm-label">${esc(x.title)}</span>` : "")
          + (n ? `<span class="pm-stack">${t("earlier", { n })}</span>` : "");
        return;
      }
      const st = status(x, now), o = openSpots(x);
      const frac = st.k === "live" ? st.left / Math.max(1, (new Date(x.ends_at).getTime() - new Date(x.starts_at).getTime()) / 60000) : 1 - Math.min(st.k === "soon" ? st.in : 0, 60) / 60;
      const C = 2 * Math.PI * 26;
      el.className = `pm pm-${st.k}${sel ? " sel" : ""}${isHost(x, p.uid) ? " mine" : ""}`;
      el.setAttribute("aria-label", x.title);
      el.innerHTML = `${st.k === "live" ? '<i class="pm-ripple"></i>' : ""}
        <svg class="pm-ring" viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" class="t"/><circle cx="30" cy="30" r="26" class="f" stroke-dasharray="${C * frac} ${C}"/></svg>
        <span class="pm-core">${o > 0 ? `+${o}` : "✓"}</span>
        ${showsExact(x, now) ? "" : `<span class="pm-lock">${LOCK}</span>`}
        <span class="pm-label">${esc(showsExact(x, now) ? x.exact!.place_name : t("around", { a: x.area_name }))}</span>
        ${n ? `<span class="pm-stack">${t("earlierHere", { n })}</span>` : ""}`;
    });
    for (const [id, mk] of marks.current) if (!seen.has(id)) { mk.remove(); marks.current.delete(id); }

    const areas = p.items.filter((x) => !isOver(x, now) && !showsExact(x, now))
      .map((x) => circle({ lat: x.rough_lat, lng: x.rough_lng }, 260, { color: CATS[x.category].color }));
    (m.getSource("areas") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: areas });
  });

  return <div ref={box} className="map" />;
}
