import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, Level, LatLng, NewPulse, Visibility } from "../lib/types";
import { resolveMapLink } from "../lib/api";
import { CATS, catIcon } from "../lib/categories";
import { getLang } from "../lib/i18n";
import { levelLabel } from "./ui";
import { CAT_KEYS, catName } from "../lib/categories";
import { t, type Key } from "../lib/i18n";
import { areaName, distanceM, parseMapsLink } from "../lib/geo";
import { searchPlaces, type PlaceHit } from "../lib/places";
import { dayClock, dist, span } from "../lib/format";

export interface DropPrefill { title?: string; category?: Category; need?: number; place?: string; where?: string }

/** One tap fills the form; people only adjust what's different. */
const TEMPLATES: { th: string; en: string; cat: Category; need: number; dur: number; level: Level }[] = [
  { th: "ตีแบดคู่ ขาด 2 คน", en: "Doubles badminton, need 2", cat: "sport", need: 2, dur: 120, level: "casual" },
  { th: "ฟุตบอล 7 คน ขาดอีก 3", en: "7-a-side football, need 3", cat: "sport", need: 3, dur: 90, level: "casual" },
  { th: "พิกเกิลบอล หาคู่ตี", en: "Pickleball, looking for a partner", cat: "sport", need: 1, dur: 90, level: "any" },
  { th: "วิ่งชิล 5 กม.", en: "Easy 5 km run", cat: "outdoor", need: 4, dur: 60, level: "beginner" },
  { th: "บอร์ดเกมคืนนี้", en: "Board games tonight", cat: "games", need: 3, dur: 180, level: "beginner" },
  { th: "แจมดนตรี ใครเล่นอะไรมาได้", en: "Music jam, bring anything", cat: "music", need: 4, dur: 120, level: "any" },
  { th: "ปั่นจักรยานรอบสวน", en: "Bike ride around the park", cat: "outdoor", need: 4, dur: 90, level: "casual" },
  { th: "นั่งสเก็ตช์ภาพด้วยกัน", en: "Sketch together", cat: "make", need: 4, dur: 120, level: "any" },
];
const LEVELS: Level[] = ["any", "beginner", "casual", "serious"];
const REPEATS: [Key, number][] = [["rpOnce", 1], ["rp4", 4], ["rp8", 8]];

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
  const [level, setLevel] = useState<Level>("any");
  const [repeat, setRepeat] = useState(1);
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
  const [q, setQ] = useState(prefill?.where ?? "");
  const [resolving, setResolving] = useState(false);
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [whereMsg, setWhereMsg] = useState<string | null>(null);
  useEffect(() => {
    const txt = q.trim();
    setHits([]);
    if (!txt) { setWhereMsg(null); return; }
    // a link may come with other text when shared from the Google Maps app ("Place name\nhttps://maps.app.goo.gl/…")
    const link = txt.match(/https?:\/\/\S+/)?.[0];
    if (link || /^-?\d{1,2}\.\d+\s*,/.test(txt)) {
      const r = parseMapsLink(link ?? txt);
      if (r && r !== "short") { onPin(r.ll); if (r.place) setAutoPlace(r.place, r.ll); setWhereMsg(t("fPinned", { p: r.place ?? t("fFromLink") })); setQ(""); return; }
      if (!link) { setWhereMsg(t("fBadLink")); return; }
      // short links (maps.app.goo.gl) and name-only links: our server follows the link and reads it
      let dead = false;
      setResolving(true); setWhereMsg(t("fResolving"));
      resolveMapLink(link).then((res) => {
        if (dead) return;
        setResolving(false);
        if (res?.lat != null && res.lng != null) {
          const ll = { lat: res.lat, lng: res.lng };
          onPin(ll); if (res.name) setAutoPlace(res.name, ll);
          setWhereMsg(t("fPinned", { p: res.name ?? t("fFromLink") })); setQ("");
        } else if (res?.name) {
          setWhereMsg(t("fFoundName", { n: res.name })); setQ(res.name);
        } else {
          // the name before the link, if the share included one
          const before = txt.replace(link, "").trim().split("\n")[0]?.trim();
          if (before && before.length > 1) { setWhereMsg(t("fFoundName", { n: before })); setQ(before); }
          else setWhereMsg(res === null ? t("fShortNoServer") : t("fBadLink"));
        }
      });
      return () => { dead = true; };
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
  const applyTemplate = (tp: (typeof TEMPLATES)[number]) => {
    setTitle(getLang() === "th" ? tp.th : tp.en); setCategory(tp.cat); setNeed(tp.need); setLevel(tp.level);
    if (DUR_CHIPS.includes(tp.dur)) setDurPreset(tp.dur); else setDurPreset(60);
  };
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
      level, repeatWeeks: repeat,
      contact: { line_id: lineId.trim().replace(/^@?/, "") || null, phone: phone.trim() || null, landmark: landmark.trim() || null },
    });
    setBusy(false);
    if (!ok) titleRef.current?.focus();
  };

  return (
    <form className="sheet" onSubmit={submit} hidden={hidden}>
      <h2>{prefill ? t("dropAgain") : t("dropTitle")}</h2>
      {!prefill && (
        <div className="templates" role="group" aria-label={t("fQuick")}>
          {TEMPLATES.map((tp) => (
            <button type="button" key={tp.en} className="tpl" onClick={() => applyTemplate(tp)} style={{ ["--c" as string]: CATS[tp.cat].color }}>
              <span dangerouslySetInnerHTML={{ __html: catIcon(tp.cat, 16) }} />{getLang() === "th" ? tp.th : tp.en}
            </button>
          ))}
        </div>
      )}
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

      <div className="row" role="group" aria-label={t("fLevel")}>
        <span className="f-label">{t("fLevel")}</span>
        {LEVELS.map((l) => <button type="button" key={l} className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>{levelLabel(l)}</button>)}
      </div>

      <fieldset className="group">
        <legend>{t("fWhere")}</legend>
        <div className="searchbox">
          <input type="search" id="f-where" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
            placeholder={t("fWherePh")} aria-label={t("fWherePh")} />
          {(searching || resolving) && <span className="spin" aria-hidden="true" />}
          {!q && "clipboard" in navigator && (
            <button type="button" className="pastebtn" onClick={async () => { try { const v = await navigator.clipboard.readText(); if (v) setQ(v.trim()); } catch { /* permission refused */ } }}>{t("fPaste")}</button>
          )}
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
        <div className="row" role="group" aria-label={t("fRepeat")}>
          <span className="f-label">{t("fRepeat")}</span>
          {REPEATS.map(([k, v]) => <button type="button" key={k} className="chip" aria-pressed={repeat === v} onClick={() => setRepeat(v)}>{t(k)}</button>)}
        </div>
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
