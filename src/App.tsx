import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, LatLng, Pulse } from "./lib/types";
import { CAT_KEYS, CATS, RADII, RadiusKey } from "./lib/categories";
import { configured } from "./lib/supabase";
import { createPulse, endPulse, extendPulse, errText, joinPulse, leavePulse, postToFeed, respondRequest, searchHistory } from "./lib/api";
import { isOver, pos, status } from "./lib/pulse";
import type { Lang } from "./lib/captions";
import { prefs, useLiveData, useLocation, useTick } from "./hooks";
import { useAuth } from "./auth";
import { MapView } from "./components/MapView";
import { PulseDetail } from "./components/PulseDetail";
import { NearbyTab, nearbyList } from "./components/NearbyTab";
import { FeedTab } from "./components/FeedTab";
import { HistoryTab, Period, PERIODS } from "./components/HistoryTab";
import { GrowTab } from "./components/GrowTab";
import { ShareModal } from "./components/ShareModal";
import { DropPrefill, DropPulse } from "./components/DropPulse";
import { ProfileSheet } from "./components/ProfileSheet";
import { Avatar, type Actions } from "./components/ui";

type Tab = "map" | "near" | "feed" | "hist" | "grow";
const TAB_LABEL: Record<Exclude<Tab, "map">, string> = { near: "Nearby", feed: "Feed", hist: "History", grow: "Grow" };

export default function App() {
  useTick();
  const auth = useAuth();
  const loc = useLocation();
  const data = useLiveData(loc.me, auth.ready && (!!auth.uid || !configured));
  const uid = auth.uid;

  const [tab, setTab] = useState<Tab>(() => (window.innerWidth < 820 ? "map" : "near"));
  const [radius, setRadius] = useState<RadiusKey>(() => prefs.read("radius", "walk"));
  const [cats, setCats] = useState<Set<Category>>(new Set(CAT_KEYS));
  const [showPast, setShowPast] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [placing, setPlacing] = useState<null | "pin" | "me">(null);
  const [drop, setDrop] = useState<{ pin: LatLng; prefill: DropPrefill | null; k: number } | null>(null);
  const [share, setShare] = useState<Pulse | "poster" | null>(null);
  const [lang, setLangState] = useState<Lang>(() => prefs.read("lang", "en"));
  const [profileOpen, setProfileOpen] = useState<null | { reason: string | null }>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [centerOn, setCenterOn] = useState<{ ll: LatLng; k: number } | null>(null);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [hist, setHist] = useState<{ list: Pulse[]; loading: boolean }>({ list: [], loading: false });

  const toastT = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback((s: string) => { setToastMsg(s); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 3200); }, []);
  const setLang = (l: Lang) => { setLangState(l); prefs.write("lang", l); };
  const radiusM = RADII[radius].m;
  const panelTab: Exclude<Tab, "map"> = tab === "map" ? "near" : tab;

  // follow GPS the first time it arrives
  const centred = useRef(false);
  useEffect(() => { if (loc.source === "gps" && !centred.current) { centred.current = true; setCenterOn({ ll: loc.me, k: Date.now() }); } }, [loc.source, loc.me]);

  // history search (server-side, any age)
  useEffect(() => {
    if (panelTab !== "hist") return;
    let dead = false;
    setHist((h) => ({ ...h, loading: true }));
    const t = setTimeout(() => {
      searchHistory(loc.me, q, PERIODS[period].ms)
        .then((list) => { if (!dead) setHist({ list, loading: false }); })
        .catch((e) => { if (!dead) { setHist({ list: [], loading: false }); toast(errText(e)); } });
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [panelTab, q, period, loc.me, data.pulses, toast]);

  const byCat = (p: Pulse) => cats.has(p.category);
  const pulses = useMemo(() => data.pulses.filter(byCat), [data.pulses, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const histList = useMemo(() => hist.list.filter(byCat), [hist.list, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const near = nearbyList(pulses, loc.me, radiusM, uid);
  const all = useMemo(() => { const m = new Map<string, Pulse>(); [...data.pulses, ...hist.list].forEach((p) => m.set(p.id, p)); return m; }, [data.pulses, hist.list]);
  const selected = sel ? all.get(sel) ?? null : null;

  const mapItems = useMemo(() => {
    const m = new Map<string, Pulse>();
    pulses.forEach((p) => { if (showPast || !isOver(p)) m.set(p.id, p); });
    if (panelTab === "hist") histList.forEach((p) => m.set(p.id, p));
    return [...m.values()];
  }, [pulses, histList, panelTab, showPast]);
  const surfaced = panelTab === "hist" ? new Set(histList.map((p) => p.id)) : null;

  // deep link: ?p=<id>
  const deep = useRef(new URLSearchParams(location.search).get("p"));
  useEffect(() => {
    const id = deep.current; if (!id) return;
    const p = all.get(id); if (!p) return;
    deep.current = null; setSel(id); setCenterOn({ ll: pos(p), k: Date.now() }); if (isOver(p)) setTab("hist");
  }, [all]);

  const select = useCallback((id: string | null) => {
    setSel(id);
    if (!id) return;
    const p = all.get(id);
    if (p) setCenterOn({ ll: pos(p), k: Date.now() });
    if (window.innerWidth < 820) setTab("map");
  }, [all]);

  const hasName = !!auth.profile && auth.profile.display_name !== "Someone";
  const needName = (why = "Hosts see your name when you join. Pick one, or use your Google account.") => {
    if (configured && !hasName) { setProfileOpen({ reason: why }); return true; }
    return false;
  };

  // show sign-in results, and start with the person's interests selected
  useEffect(() => { if (auth.notice) toast(auth.notice); }, [auth.notice, toast]);
  useEffect(() => { if (auth.error) toast(auth.error); }, [auth.error, toast]);
  const interestsApplied = useRef(false);
  useEffect(() => {
    const i = auth.profile?.interests;
    if (i?.length && !interestsApplied.current) { interestsApplied.current = true; setCats(new Set(i)); }
  }, [auth.profile]);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast(ok); data.reload(); return true; } catch (e) { toast(errText(e)); return false; }
  };

  const a: Actions = {
    select,
    join: (p) => { if (needName("Hosts see your name when you ask to join. Pick one, or use your Google account.")) return;
      run(async () => { const st = await joinPulse(p.id); toast(st === "accepted" ? `You're in. ${p.exact ? "See you at " + p.exact.place_name + "." : ""}` : `Request sent to ${p.host?.display_name || "the host"}.`); }); },
    leave: (p) => { run(() => leavePulse(p.id), `Left “${p.title}”`); },
    respond: (p, user, ok) => { run(() => respondRequest(p.id, user, ok), ok ? "Accepted. They can see the exact spot now." : "Declined."); },
    end: (p) => { const later = status(p).k === "soon"; if (later) setSel(null); run(() => endPulse(p.id), later ? "Cancelled." : "Ended. It stays on the map as history."); },
    extend: (p, m) => { run(() => extendPulse(p.id, m), `Extended by ${m} min.`); },
    share: (p) => setShare(p),
    again: (p) => {
      const ll = p.exact ? { lat: p.exact.lat, lng: p.exact.lng } : { lat: p.rough_lat, lng: p.rough_lng };
      setSel(null); setTab(window.innerWidth < 820 ? "map" : "near");
      setDrop({ pin: ll, prefill: { title: p.title, category: p.category, need: p.need, place: p.exact?.place_name ?? "" }, k: Date.now() });
      setCenterOn({ ll, k: Date.now() });
    },
    post: async (p, kind, body, file) => {
      if (needName("People see your name next to your update.")) return false;
      return run(() => postToFeed(uid!, p.id, kind, body, file), kind === "checkin" ? "Checked in. People nearby can see you're there." : "Posted.");
    },
  };

  const openDrop = () => { if (needName("People nearby see who is hosting. Pick a name, or use your Google account.")) return; setSel(null); setDrop({ pin: loc.me, prefill: null, k: Date.now() }); if (window.innerWidth < 820) setTab("map"); };
  const onPick = (ll: LatLng) => {
    if (placing === "me") { loc.setManual(ll); setPlacing(null); toast("Your spot is set. Distances are measured from here."); return; }
    if (drop) { setDrop({ ...drop, pin: ll }); setPlacing(null); }
  };
  const submitDrop = async (np: Parameters<typeof createPulse>[0]) => {
    try {
      const id = await createPulse(np);
      setDrop(null); toast(np.startInMin <= 1 ? "Your Pulse is live. People nearby can see it now." : "Posted. People nearby can see it and join ahead of time."); await data.reload(); setSel(id);
      return true;
    } catch (e) { toast(errText(e)); return false; }
  };

  const live = near.filter((p) => status(p).k === "live").length;
  const soon3 = near.filter((p) => status(p).k === "soon" && new Date(p.starts_at).getTime() - Date.now() <= 3 * 3_600_000).length;
  const summary = panelTab === "near" ? `${live} live now · ${soon3} in the next 3 hours · ${near.length - live - soon3} later`
    : panelTab === "feed" ? "Updates, photos and check-ins from activities around you"
    : panelTab === "hist" ? `${histList.length} past Pulses` : "Free ways to spread Pulse, written from what's on the map";

  return (
    <div className={`app tab-${tab}`}>
      <div className="mapwrap">
        <MapView me={loc.me} items={mapItems} uid={uid} selectedId={sel} surfaced={surfaced} radiusM={radiusM}
          placing={!!placing} pin={drop && !placing ? drop.pin : placing === "pin" && drop ? drop.pin : null}
          centerOn={centerOn} onSelect={select} onPick={onPick} />
        <div className="brand"><span className="dot" /><b>Pulse</b><span className="brand-sub">{configured ? "live" : "demo"}</span></div>
        <div className="mapctl">
          <button className="me-btn" onClick={() => setProfileOpen({ reason: null })} aria-label="Your profile">
          <Avatar name={auth.profile?.display_name || "You"} url={auth.profile?.avatar_url} size={30} />
          <span className="me-name">{auth.isGuest ? (hasName ? auth.profile!.display_name : "Sign in") : auth.profile?.display_name}</span>
        </button>
          <button className="mapbtn" aria-pressed={showPast} onClick={() => setShowPast(!showPast)}>Past Pulses</button>
          {loc.source === "manual"
            ? <button className="mapbtn" onClick={() => { loc.useGps(); toast("Using your GPS location."); }}>Use my GPS</button>
            : <button className="mapbtn" onClick={() => { setPlacing("me"); }}>Set my spot</button>}
        </div>
        {placing && <div className="placehint">{placing === "me" ? "Tap where you are" : "Tap where it's happening"} <button onClick={() => setPlacing(null)}>Cancel</button></div>}
        {selected && !drop && <PulseDetail p={selected} uid={uid} me={loc.me} posts={data.posts} a={a} />}
        {!drop && !placing && <button className="fab" onClick={openDrop}><span className="ring" />Drop a Pulse</button>}
        {drop && (
          <DropPulse key={drop.k} hidden={!!placing} pin={drop.pin} me={loc.me} prefill={drop.prefill} onMovePin={() => setPlacing("pin")} onPin={(ll) => { setDrop((d) => (d ? { ...d, pin: ll } : d)); setCenterOn({ ll, k: Date.now() }); }} onCancel={() => setDrop(null)} onSubmit={submitDrop} />
        )}
      </div>

      <aside className="side">
        <div className="sidehead">
          <div className="tabs" role="tablist">
            {(Object.keys(TAB_LABEL) as (keyof typeof TAB_LABEL)[]).map((t) => (
              <button key={t} role="tab" aria-selected={panelTab === t} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
            ))}
          </div>
          <div className="sub">{summary}</div>
          {panelTab === "hist" && <input className="search" type="search" id="h-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search past Pulses: pickleball, Lumphini, chess…" />}
          {panelTab === "hist" && (
            <div className="seg" role="group" aria-label="When">
              {(Object.keys(PERIODS) as Period[]).map((k) => <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>{PERIODS[k].label}</button>)}
            </div>
          )}
          {(panelTab === "near" || panelTab === "feed") && (
            <div className="seg" role="group" aria-label="Distance">
              {(Object.keys(RADII) as RadiusKey[]).map((k) => <button key={k} aria-pressed={radius === k} onClick={() => { setRadius(k); prefs.write("radius", k); }}>{RADII[k].label}</button>)}
            </div>
          )}
          {panelTab !== "grow" && (
            <div className="row">
              {CAT_KEYS.map((k) => (
                <button key={k} className="chip" aria-pressed={cats.has(k)} onClick={() => { const s = new Set(cats); s.has(k) ? s.delete(k) : s.add(k); setCats(s); }}>
                  <i style={{ background: CATS[k].color }} />{CATS[k].name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="list">
          {!configured && <div className="banner">Demo mode: example Pulses around central Bangkok, saved only on this device. Add your Supabase keys to go live.</div>}
          {loc.source === "default" && <div className="banner"><span>Location is off, so distances are from central Bangkok.</span><button onClick={() => setPlacing("me")}>Set my spot</button></div>}
          {data.error && <div className="banner">Couldn't load Pulses: {data.error}</div>}
          {data.loading && !data.pulses.length ? <div className="empty">Finding what's happening near you…</div> : (
            <>
              {panelTab === "near" && <NearbyTab list={near} uid={uid} me={loc.me} selectedId={sel} a={a} />}
              {panelTab === "feed" && <FeedTab pulses={pulses} posts={data.posts} uid={uid} me={loc.me} radiusM={radiusM} a={a} />}
              {panelTab === "hist" && <HistoryTab results={histList} loading={hist.loading} q={q} uid={uid} me={loc.me} selectedId={sel} a={a} />}
              {panelTab === "grow" && <GrowTab pulses={data.pulses} selected={selected} lang={lang} setLang={setLang} onShare={setShare} onPoster={() => setShare("poster")} toast={toast} />}
            </>
          )}
        </div>
      </aside>

      <nav className="tabbar" aria-label="Sections">
        {(["map", "near", "feed", "hist", "grow"] as Tab[]).map((t) => (
          <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t === "map" ? "Map" : TAB_LABEL[t]}</button>
        ))}
      </nav>

      {share && <ShareModal target={share} lang={lang} setLang={setLang} onClose={() => setShare(null)} toast={toast} />}
      {profileOpen && <ProfileSheet auth={auth} reason={profileOpen.reason} onClose={() => setProfileOpen(null)} toast={toast} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
