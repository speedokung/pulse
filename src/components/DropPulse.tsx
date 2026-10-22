import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, LatLng, NewPulse, Visibility } from "../lib/types";
import { CAT_KEYS, catName } from "../lib/categories";
import { t, type Key } from "../lib/i18n";
import { areaName, distanceM, parseMapsLink } from "../lib/geo";
import { searchPlaces, type PlaceHit } from "../lib/places";
import { dayClock, dist, span } from "../lib/format";

export interface DropPrefill { title?: string; category?: Category; need?: number; place?: string }

const MIN = 60_000;
const START_CHIPS: [Key, number][] = [["fNow", 0], ["fIn15", 15], ["fIn30", 30], ["fIn1h", 60], ["fIn2h", 120]];
const DUR_CHIPS: number[] = [30, 60, 90, 120, 180, 240];
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
  // contact is remembered on this device for next time
  const [lineId, setLineId] = useState(() => { try { return localStorage.getItem("pulse.lineId") || ""; } catch { return ""; } });
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem("pulse.phone") || ""; } catch { return ""; } });
  const [landmark, setLandmark] = useState("");
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
    const txt = q.trim();
    setHits([]);
    if (!txt) { setWhereMsg(null); return; }
    if (/^https?:\/\//i.test(txt) || /^-?\d{1,2}\.\d+\s*,/.test(txt)) {
      const r = parseMapsLink(txt);
      if (r === "short") setWhereMsg(t("fShortLink"));
      else if (!r) setWhereMsg(t("fBadLink"));
      else { onPin(r.ll); if (r.place) setAutoPlace(r.place, r.ll); setWhereMsg(t("fPinned", { p: r.place ?? t("fFromLink") })); setQ(""); }
      return;
    }
    if (txt.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setWhereMsg(null);
      try { const h = await searchPlaces(txt, me, ctl.signal); setHits(h); if (!h.length) setWhereMsg(t("fNoHits")); }
      catch { if (!ctl.signal.aborted) setWhereMsg(t("fSearchDown")); }
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
  const choose = (h: PlaceHit) => { onPin(h.ll); setAutoPlace(h.name, h.ll); setQ(""); setHits([]); setWhereMsg(t("fPinned", { p: h.name })); };

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
  const timeError = startAt < Date.now() - 5 * MIN ? t("fErrPast")
    : startAt > Date.now() + MAX_AHEAD_DAYS * 86_400_000 ? t("fErrFar", { n: MAX_AHEAD_DAYS })
    : durMin < 15 ? t("fErrShort") : durMin > MAX_DUR ? t("fErrLong") : null;

  const d = distanceM(me, pin);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) { titleRef.current?.focus(); return; }
    if (timeError) return;
    setBusy(true);
    try { localStorage.setItem("pulse.lineId", lineId.trim()); localStorage.setItem("pulse.phone", phone.trim()); } catch { /* ignore */ }
    const ok = await onSubmit({
      category, title: title.trim(), need, startInMin: Math.max(0, Math.round((startAt - Date.now()) / MIN)), durationMin: durMin,
      visibility: vis, lat: pin.lat, lng: pin.lng, place: place.trim(), area: area === "…" ? "Nearby" : area,
      contact: { line_id: lineId.trim().replace(/^@?/, "") || null, phone: phone.trim() || null, landmark: landmark.trim() || null },
    });
    setBusy(false);
    if (!ok) titleRef.current?.focus();
  };

  return (
    <form className="sheet" onSubmit={submit} hidden={hidden}>
      <h2>{prefill ? t("dropAgain") : t("dropTitle")}</h2>
      <label className="f" htmlFor="f-title">{t("fWhat")}
        <input ref={titleRef} type="text" id="f-title" maxLength={80} required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("fWhatPh")} />
      </label>
      <div className="grid2">
        <label className="f" htmlFor="f-cat">{t("fType")}
          <select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>{CAT_KEYS.map((k) => <option key={k} value={k}>{catName(k)}</option>)}</select>
        </label>
        <label className="f" htmlFor="f-need">{t("fNeed")}
          <select id="f-need" value={need} onChange={(e) => setNeed(+e.target.value)}>{Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}</select>
        </label>
      </div>

      <fieldset className="group">
        <legend>{t("fWhere")}</legend>
        <div className="searchbox">
          <input type="search" id="f-where" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
            placeholder={t("fWherePh")} aria-label={t("fWherePh")} />
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
          <button type="button" className="mini" onClick={() => { onPin(me); setWhereMsg(t("fPinnedAtYou")); }}>{t("fUseLoc")}</button>
          <button type="button" className="mini" onClick={onMovePin}>{t("fPickMap")}</button>
        </div>
        <label className="f" htmlFor="f-place">{t("fSpotName")}
          <input type="text" id="f-place" maxLength={60} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t("fSpotPh")} />
        </label>
        <div className="where">{d < 40 ? t("fAtYou") : t("fFromYou", { d: dist(d) })} · {t("around", { a: area })} · {t("fDragHint")}</div>
      </fieldset>

      <fieldset className="group">
        <legend>{t("fWhen")}</legend>
        <div className="row" role="group" aria-label="Start">
          {START_CHIPS.map(([l, v]) => <button type="button" key={l} className="chip" aria-pressed={startPreset === v} onClick={() => setStartPreset(v)}>{t(l)}</button>)}
          <button type="button" className="chip" aria-pressed={startPreset === "custom"} onClick={() => setStartPreset("custom")}>{t("fPickTime")}</button>
        </div>
        {startPreset === "custom" && (
          <label className="f" htmlFor="f-start">{t("fStarts")}
            <input type="datetime-local" id="f-start" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
              min={toLocalInput(new Date())} max={toLocalInput(new Date(Date.now() + MAX_AHEAD_DAYS * 86_400_000))} />
          </label>
        )}
        <div className="row" role="group" aria-label="How long">
          {DUR_CHIPS.map((v) => <button type="button" key={v} className="chip" aria-pressed={durPreset === v} onClick={() => setDurPreset(v)}>{span(v)}</button>)}
          <button type="button" className="chip" aria-pressed={durPreset === "until"} onClick={() => setDurPreset("until")}>{t("fUntil")}</button>
        </div>
        {durPreset === "until" && (
          <label className="f" htmlFor="f-until">{t("fEndsAt")}
            <input type="time" id="f-until" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        )}
        <div className={`where${timeError ? " err" : ""}`} role="status">
          {timeError ?? t("fWhenSummary", { s: startPreset === 0 ? t("fStartsNow") : t("startsAt", { t: dayClock(startAt) }), e: dayClock(startAt + durMin * MIN), d: span(durMin) })}
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>{t("fContact")}</legend>
        <div className="sub">{t("fContactWhy")}</div>
        <div className="grid2">
          <label className="f" htmlFor="f-line">{t("fLine")}
            <input type="text" id="f-line" maxLength={40} autoCapitalize="off" autoCorrect="off" value={lineId} onChange={(e) => setLineId(e.target.value)} placeholder={t("fLinePh")} />
          </label>
          <label className="f" htmlFor="f-phone">{t("fPhone")}
            <input type="tel" id="f-phone" maxLength={20} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("fPhonePh")} />
          </label>
        </div>
        <label className="f" htmlFor="f-landmark">{t("fLandmark")}
          <input type="text" id="f-landmark" maxLength={120} value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder={t("fLandmarkPh")} />
        </label>
      </fieldset>

      <fieldset className="vis">
        <legend>{t("fWho")}</legend>
        <label className="opt" htmlFor="f-vis-all"><input type="radio" id="f-vis-all" name="vis" checked={vis === "all"} onChange={() => setVis("all")} />
          <span>{t("fEveryone")}<small>{t("fEveryoneSub")}</small></span></label>
        <label className="opt" htmlFor="f-vis-acc"><input type="radio" id="f-vis-acc" name="vis" checked={vis === "accepted"} onChange={() => setVis("accepted")} />
          <span>{t("fAcceptOnly")}<small>{t("fAcceptOnlySub")}</small></span></label>
      </fieldset>
      <div className="btns">
        <button type="button" className="ghostbtn" onClick={onCancel}>{t("cancel")}</button>
        <button type="submit" className="go" disabled={busy || !!timeError}>{busy ? t("posting") : startPreset === 0 ? t("fGoLive") : t("fPost")}</button>
      </div>
    </form>
  );
}
