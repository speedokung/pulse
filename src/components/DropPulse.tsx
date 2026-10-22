import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, LatLng, NewPulse, Visibility } from "../lib/types";
import { CAT_KEYS, CATS } from "../lib/categories";
import { areaName, distanceM, parseMapsLink } from "../lib/geo";
import { searchPlaces, type PlaceHit } from "../lib/places";
import { dayClock, dist, span } from "../lib/format";

export interface DropPrefill { title?: string; category?: Category; need?: number; place?: string }

const MIN = 60_000;
const START_CHIPS: [string, number][] = [["Now", 0], ["In 15 min", 15], ["In 30 min", 30], ["In 1 h", 60], ["In 2 h", 120]];
const DUR_CHIPS: [string, number][] = [["30 min", 30], ["1 h", 60], ["1.5 h", 90], ["2 h", 120], ["3 h", 180], ["4 h", 240]];
const MAX_AHEAD_DAYS = 7, MAX_DUR = 12 * 60;

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const roundUp15 = (t: number) => Math.ceil(t / (15 * MIN)) * 15 * MIN;

/**
 * Stays mounted while the person taps the map to move the pin (App hides it),
 * so nothing typed here is lost.
 */
export function DropPulse({ pin, me, prefill, hidden, onMovePin, onPin, onCancel, onSubmit }: {
  pin: LatLng; me: LatLng; prefill: DropPrefill | null; hidden: boolean;
  onMovePin: () => void; onPin: (ll: LatLng) => void; onCancel: () => void; onSubmit: (np: NewPulse) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [place, setPlace] = useState(prefill?.place ?? "");
  const [category, setCategory] = useState<Category>(prefill?.category ?? "sport");
  const [need, setNeed] = useState(prefill?.need ?? 2);
  const [vis, setVis] = useState<Visibility>("all");
  const [area, setArea] = useState("…");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => { let dead = false; setArea("…"); areaName(pin).then((a) => { if (!dead) setArea(a); }); return () => { dead = true; }; }, [pin.lat, pin.lng]);

  // ---------- where ----------
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [whereMsg, setWhereMsg] = useState<string | null>(null);
  useEffect(() => {
    const t = q.trim();
    setHits([]);
    if (!t) { setWhereMsg(null); return; }
    if (/^https?:\/\//i.test(t) || /^-?\d{1,2}\.\d+\s*,/.test(t)) {
      const r = parseMapsLink(t);
      if (r === "short") setWhereMsg("Short share links (maps.app.goo.gl) can't be read. Open the link and copy the long address from the browser bar, or search by name.");
      else if (!r) setWhereMsg("Couldn't find a location in that link. Try searching by name instead.");
      else { onPin(r.ll); if (r.place) setAutoPlace(r.place, r.ll); setWhereMsg(`Pinned: ${r.place ?? "location from your link"}`); setQ(""); }
      return;
    }
    if (t.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setWhereMsg(null);
      try { const h = await searchPlaces(t, me, ctl.signal); setHits(h); if (!h.length) setWhereMsg("No places found nearby. Try another name, or drag the pin."); }
      catch { if (!ctl.signal.aborted) setWhereMsg("Search isn't responding. Drag the pin or tap the map instead."); }
      finally { if (!ctl.signal.aborted) setSearching(false); }
    }, 400);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  // a name filled in from search or a link is cleared if the pin is then moved somewhere else
  const autoPlace = useRef<{ name: string; ll: LatLng } | null>(null);
  const setAutoPlace = (name: string, ll: LatLng) => { const n = name.slice(0, 60); autoPlace.current = { name: n, ll }; setPlace(n); };
  useEffect(() => {
    const a = autoPlace.current;
    if (a && distanceM(a.ll, pin) > 150) { if (place === a.name) setPlace(""); autoPlace.current = null; setWhereMsg(null); }
  }, [pin.lat, pin.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (h: PlaceHit) => { onPin(h.ll); setAutoPlace(h.name, h.ll); setQ(""); setHits([]); setWhereMsg(`Pinned: ${h.name}`); };

  // ---------- when ----------
  const [startPreset, setStartPreset] = useState<number | "custom">(0);
  const [customStart, setCustomStart] = useState(() => toLocalInput(new Date(roundUp15(Date.now() + 60 * MIN))));
  const [durPreset, setDurPreset] = useState<number | "until">(60);
  const [until, setUntil] = useState("");
  const startAt = useMemo(() => (startPreset === "custom" ? new Date(customStart).getTime() || Date.now() : Date.now() + startPreset * MIN), [startPreset, customStart]);
  const durMin = useMemo(() => {
    if (durPreset !== "until") return durPreset;
    if (!until) return 60;
    const [h, m] = until.split(":").map(Number);
    const end = new Date(startAt); end.setHours(h, m, 0, 0);
    if (end.getTime() <= startAt) end.setDate(end.getDate() + 1); // past midnight
    return Math.round((end.getTime() - startAt) / MIN);
  }, [durPreset, until, startAt]);
  const timeError = startAt < Date.now() - 5 * MIN ? "That start time has passed."
    : startAt > Date.now() + MAX_AHEAD_DAYS * 86_400_000 ? `Pick a start within the next ${MAX_AHEAD_DAYS} days.`
    : durMin < 15 ? "Make it at least 15 minutes." : durMin > MAX_DUR ? "Keep it under 12 hours. You can extend it later." : null;

  const d = distanceM(me, pin);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) { titleRef.current?.focus(); return; }
    if (timeError) return;
    setBusy(true);
    const ok = await onSubmit({
      category, title: title.trim(), need, startInMin: Math.max(0, Math.round((startAt - Date.now()) / MIN)), durationMin: durMin,
      visibility: vis, lat: pin.lat, lng: pin.lng, place: place.trim(), area: area === "…" ? "Nearby" : area,
    });
    setBusy(false);
    if (!ok) titleRef.current?.focus();
  };

  return (
    <form className="sheet" onSubmit={submit} hidden={hidden}>
      <h2>{prefill ? "Pulse again" : "Drop a Pulse"}</h2>
      <label className="f" htmlFor="f-title">What's happening
        <input ref={titleRef} type="text" id="f-title" maxLength={80} required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Need 2 for doubles badminton" />
      </label>
      <div className="grid2">
        <label className="f" htmlFor="f-cat">Type
          <select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>{CAT_KEYS.map((k) => <option key={k} value={k}>{CATS[k].name}</option>)}</select>
        </label>
        <label className="f" htmlFor="f-need">More people needed
          <select id="f-need" value={need} onChange={(e) => setNeed(+e.target.value)}>{Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}</select>
        </label>
      </div>

      <fieldset className="group">
        <legend>Where</legend>
        <div className="searchbox">
          <input type="search" id="f-where" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
            placeholder="Search a place, or paste a Google Maps link" aria-label="Search a place or paste a Google Maps link" />
          {searching && <span className="spin" aria-hidden="true" />}
          {hits.length > 0 && (
            <ul className="hits" role="listbox" aria-label="Places">
              {hits.map((h, i) => (
                <li key={i}><button type="button" role="option" aria-selected="false" onClick={() => choose(h)}>
                  <b>{h.name}</b><span>{[h.detail, dist(h.dist)].filter(Boolean).join(" · ")}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        {whereMsg && <div className="where" role="status">{whereMsg}</div>}
        <div className="row">
          <button type="button" className="mini" onClick={() => { onPin(me); setWhereMsg("Pinned at your location."); }}>Use my location</button>
          <button type="button" className="mini" onClick={onMovePin}>Pick on map</button>
        </div>
        <label className="f" htmlFor="f-place">Spot name people will see
          <input type="text" id="f-place" maxLength={60} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Court 3, Lumphini Park" />
        </label>
        <div className="where">{d < 40 ? "At your location" : `${dist(d)} from you`} · around {area} · you can also drag the orange pin</div>
      </fieldset>

      <fieldset className="group">
        <legend>When</legend>
        <div className="row" role="group" aria-label="Start">
          {START_CHIPS.map(([l, v]) => <button type="button" key={l} className="chip" aria-pressed={startPreset === v} onClick={() => setStartPreset(v)}>{l}</button>)}
          <button type="button" className="chip" aria-pressed={startPreset === "custom"} onClick={() => setStartPreset("custom")}>Pick a time</button>
        </div>
        {startPreset === "custom" && (
          <label className="f" htmlFor="f-start">Starts
            <input type="datetime-local" id="f-start" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
              min={toLocalInput(new Date())} max={toLocalInput(new Date(Date.now() + MAX_AHEAD_DAYS * 86_400_000))} />
          </label>
        )}
        <div className="row" role="group" aria-label="How long">
          {DUR_CHIPS.map(([l, v]) => <button type="button" key={l} className="chip" aria-pressed={durPreset === v} onClick={() => setDurPreset(v)}>{l}</button>)}
          <button type="button" className="chip" aria-pressed={durPreset === "until"} onClick={() => setDurPreset("until")}>Until…</button>
        </div>
        {durPreset === "until" && (
          <label className="f" htmlFor="f-until">Ends at
            <input type="time" id="f-until" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        )}
        <div className={`where${timeError ? " err" : ""}`} role="status">
          {timeError ?? `${startPreset === 0 ? "Starts now" : `Starts ${dayClock(startAt)}`} · ends ${dayClock(startAt + durMin * MIN)} (${span(durMin)}). You can extend it while it's on.`}
        </div>
      </fieldset>

      <fieldset className="vis">
        <legend>Who sees the exact spot</legend>
        <label className="opt" htmlFor="f-vis-all"><input type="radio" id="f-vis-all" name="vis" checked={vis === "all"} onChange={() => setVis("all")} />
          <span>Everyone<small>Anyone nearby sees the pin and can join straight away.</small></span></label>
        <label className="opt" htmlFor="f-vis-acc"><input type="radio" id="f-vis-acc" name="vis" checked={vis === "accepted"} onChange={() => setVis("accepted")} />
          <span>Only people I accept<small>Others see a rough area. You approve each request, then they see the pin.</small></span></label>
      </fieldset>
      <div className="btns">
        <button type="button" className="ghostbtn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="go" disabled={busy || !!timeError}>{busy ? "Posting…" : startPreset === 0 ? "Go live" : "Post Pulse"}</button>
      </div>
    </form>
  );
}
