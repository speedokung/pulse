import { useEffect, useRef, useState } from "react";
import type { Category, LatLng, NewPulse, Visibility } from "../lib/types";
import { CAT_KEYS, CATS } from "../lib/categories";
import { areaName, distanceM, parseMapsLink } from "../lib/geo";
import { dist } from "../lib/format";

export interface DropPrefill { title?: string; category?: Category; need?: number; place?: string }

export function DropPulse({ pin, me, prefill, onMovePin, onPin, onCancel, onSubmit }: {
  pin: LatLng; me: LatLng; prefill: DropPrefill | null;
  onMovePin: () => void; onPin: (ll: LatLng) => void; onCancel: () => void; onSubmit: (np: NewPulse) => Promise<boolean>;
}) {
  const [link, setLink] = useState("");
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const applyLink = (v: string) => {
    setLink(v);
    if (!v.trim()) { setLinkMsg(null); return; }
    const r = parseMapsLink(v);
    if (r === "short") setLinkMsg("Short share links can't be read here. Open the link, then copy the long address from the browser bar, or drag the pin.");
    else if (!r) setLinkMsg("Couldn't find a location in that link. Paste a Google Maps link or coordinates like 13.7310, 100.5414.");
    else {
      onPin(r.ll);
      if (r.place && !place.trim()) setPlace(r.place.slice(0, 60));
      setLinkMsg(`Pin moved to ${r.place ?? `${r.ll.lat.toFixed(5)}, ${r.ll.lng.toFixed(5)}`}.`);
    }
  };
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [place, setPlace] = useState(prefill?.place ?? "");
  const [category, setCategory] = useState<Category>(prefill?.category ?? "sport");
  const [need, setNeed] = useState(prefill?.need ?? 2);
  const [startIn, setStartIn] = useState(0);
  const [dur, setDur] = useState(60);
  const [vis, setVis] = useState<Visibility>("all");
  const [area, setArea] = useState("…");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => { let dead = false; setArea("…"); areaName(pin).then((a) => { if (!dead) setArea(a); }); return () => { dead = true; }; }, [pin.lat, pin.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = distanceM(me, pin);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) { titleRef.current?.focus(); return; }
    setBusy(true);
    const ok = await onSubmit({ category, title: title.trim(), need, startInMin: startIn, durationMin: dur, visibility: vis, lat: pin.lat, lng: pin.lng, place: place.trim(), area: area === "…" ? "Nearby" : area });
    setBusy(false);
    if (!ok) titleRef.current?.focus();
  };

  return (
    <form className="sheet" onSubmit={submit}>
      <h2>{prefill ? "Pulse again" : "Drop a Pulse"}</h2>
      <label className="f" htmlFor="f-title">What's happening
        <input ref={titleRef} type="text" id="f-title" maxLength={80} required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Need 2 for doubles badminton" />
      </label>
      <label className="f" htmlFor="f-place">Exact spot
        <input type="text" id="f-place" maxLength={60} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Court 3, Lumphini Park" />
      </label>
      <label className="f" htmlFor="f-link">Or paste a Google Maps link
        <input type="text" id="f-link" inputMode="url" value={link} onChange={(e) => applyLink(e.target.value)} placeholder="https://www.google.com/maps/place/…" />
      </label>
      {linkMsg && <div className="where" role="status">{linkMsg}</div>}
      <div className="grid2">
        <label className="f" htmlFor="f-cat">Type
          <select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>{CAT_KEYS.map((k) => <option key={k} value={k}>{CATS[k].name}</option>)}</select>
        </label>
        <label className="f" htmlFor="f-need">More people needed
          <select id="f-need" value={need} onChange={(e) => setNeed(+e.target.value)}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <label className="f" htmlFor="f-start">Starting
          <select id="f-start" value={startIn} onChange={(e) => setStartIn(+e.target.value)}>
            <option value={0}>Right now</option><option value={20}>In 20 min</option><option value={45}>In 45 min</option><option value={90}>In 1.5 h</option><option value={150}>In 2.5 h</option>
          </select>
        </label>
        <label className="f" htmlFor="f-dur">For about
          <select id="f-dur" value={dur} onChange={(e) => setDur(+e.target.value)}>
            <option value={45}>45 min</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option><option value={180}>3 hours</option>
          </select>
        </label>
      </div>
      <fieldset className="vis">
        <legend>Who sees the exact spot</legend>
        <label className="opt" htmlFor="f-vis-all"><input type="radio" id="f-vis-all" name="vis" checked={vis === "all"} onChange={() => setVis("all")} />
          <span>Everyone<small>Anyone nearby sees the pin and can join straight away.</small></span></label>
        <label className="opt" htmlFor="f-vis-acc"><input type="radio" id="f-vis-acc" name="vis" checked={vis === "accepted"} onChange={() => setVis("accepted")} />
          <span>Only people I accept<small>Others see a rough area. You approve each request, then they see the pin.</small></span></label>
      </fieldset>
      <div className="where">{d < 40 ? "Pinned at your spot" : `Pinned ${dist(d)} from you`} · around {area} · drag the orange pin to adjust</div>
      <div className="btns">
        <button type="button" className="ghostbtn" onClick={onMovePin}>Tap map to move</button>
        <button type="button" className="ghostbtn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="go" disabled={busy}>{busy ? "Posting…" : "Go live"}</button>
      </div>
    </form>
  );
}
