import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, LatLng, Pulse } from "./lib/types";
import { CAT_KEYS, CATS, catName, RADII, RadiusKey, subsOf } from "./lib/categories";
import { configured } from "./lib/supabase";
import { createPulse, endPulse, extendPulse, hostStats, sendMessage, setContact, setSignal, errText, joinPulse, leavePulse, postToFeed, setPulseCover, respondRequest, searchHistory } from "./lib/api";
import { accepted, DAY, isOver, ms, pos, status } from "./lib/pulse";
import { distanceM } from "./lib/geo";
import { setHostStats } from "./lib/trust";
import { closeLine, completeLineLink } from "./lib/line";
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from "./lib/pwa";
import { getLang, setLang as setUiLang, t, t as tr, type Lang } from "./lib/i18n";
import { prefs, useLiveData, useLocation, useTick } from "./hooks";
import { useAuth } from "./auth";
import { MapView } from "./components/MapView";
import { PulseDetail } from "./components/PulseDetail";
import { NearbyTab, nearbyList } from "./components/NearbyTab";
import { FeedTab, FollowingFeed } from "./components/FeedTab";
import { HistoryTab, Period, PERIODS } from "./components/HistoryTab";
import { GrowTab } from "./components/GrowTab";
import { ShareModal } from "./components/ShareModal";
import { DropPrefill, DropPulse, readDraft } from "./components/DropPulse";
import { ProfileSheet } from "./components/ProfileSheet";
import { ProfileView } from "./components/ProfileView";
import { PROFILE_EVENT } from "./lib/profileBus";
import { Avatar, type Actions } from "./components/ui";

type Tab = "map" | "near" | "feed" | "hist" | "grow";
const TAB_LABEL: Record<Exclude<Tab, "map">, () => string> = { near: () => t("tabNear"), feed: () => t("tabFeed"), hist: () => t("tabHist"), grow: () => t("tabGrow") };

export default function App() {
  useTick();
  const auth = useAuth();
  const loc = useLocation();
  const data = useLiveData(loc.me, auth.ready && (!!auth.uid || !configured));
  const uid = auth.uid;

  const [tab, setTab] = useState<Tab>(() => (window.innerWidth < 820 ? "map" : "near"));
  const [radius, setRadius] = useState<RadiusKey>(() => prefs.read("radius", "walk"));
  const [cats, setCats] = useState<Set<Category>>(new Set(CAT_KEYS));
  const [subF, setSubF] = useState<string | null>(null);
  const allCats = cats.size === CAT_KEYS.length;
  const onlyCat = cats.size === 1 ? [...cats][0] : null;
  // with everything on, tapping a type shows just that type; after that, taps add or remove
  const tapCat = (k: Category) => {
    setSubF(null);
    if (allCats) { setCats(new Set([k])); return; }
    const s = new Set(cats); s.has(k) ? s.delete(k) : s.add(k);
    setCats(s.size ? s : new Set(CAT_KEYS));
  };
  const [showPast, setShowPast] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [placing, setPlacing] = useState<null | "pin" | "me">(null);
  const [drop, setDrop] = useState<{ pin: LatLng; prefill: DropPrefill | null; k: number } | null>(null);
  const [dropDown, setDropDown] = useState(false); // form slid down to look at the map
  const [share, setShare] = useState<Pulse | "poster" | null>(null);
  const [lang, setLangState] = useState<Lang>(getLang);
  const [profileOpen, setProfileOpen] = useState<null | { reason: string | null }>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(() => new URLSearchParams(location.search).get("u"));
  useEffect(() => {
    const on = (e: Event) => setViewing((e as CustomEvent<string>).detail);
    window.addEventListener(PROFILE_EVENT, on); return () => window.removeEventListener(PROFILE_EVENT, on);
  }, []);
  useEffect(() => { // ?u=<id> opens a shared profile once; clean the address afterwards
    if (!new URLSearchParams(location.search).get("u")) return;
    const c = new URL(location.href); c.searchParams.delete("u"); history.replaceState(null, "", c.toString());
  }, []);
  const [centerOn, setCenterOn] = useState<{ ll: LatLng; k: number } | null>(null);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [feedMode, setFeedMode] = useState<"near" | "following">(() => prefs.read("feedMode", "near"));
  const [feedKey, setFeedKey] = useState(0);
  const [hist, setHist] = useState<{ list: Pulse[]; loading: boolean }>({ list: [], loading: false });

  const toastT = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback((s: string) => { setToastMsg(s); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 3200); }, []);
  const [capLang, setCapLang] = useState<Lang>(getLang); // caption language can differ from the app language
  const setLang = (l: Lang) => { setUiLang(l); setLangState(l); setCapLang(l); };
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

  const byCat = (p: Pulse) => cats.has(p.category) && (!subF || p.sub === subF);
  const pulses = useMemo(() => data.pulses.filter(byCat), [data.pulses, cats, subF]); // eslint-disable-line react-hooks/exhaustive-deps
  const histList = useMemo(() => hist.list.filter(byCat), [hist.list, cats, subF]); // eslint-disable-line react-hooks/exhaustive-deps
  const near = nearbyList(pulses, loc.me, radiusM, uid);
  // Pulses opened from a profile or the Following feed can be far away or old, so they're kept here too
  const [extra, setExtra] = useState<Map<string, Pulse>>(new Map());
  const all = useMemo(() => { const m = new Map<string, Pulse>(extra); [...data.pulses, ...hist.list].forEach((p) => m.set(p.id, p)); return m; }, [data.pulses, hist.list, extra]);
  const selected = sel ? all.get(sel) ?? null : null;

  const mapItems = useMemo(() => {
    const m = new Map<string, Pulse>();
    pulses.forEach((p) => { if (showPast || !isOver(p)) m.set(p.id, p); });
    if (panelTab === "hist") histList.forEach((p) => m.set(p.id, p));
    if (sel && extra.has(sel) && !m.has(sel)) m.set(sel, extra.get(sel)!);
    return [...m.values()];
  }, [pulses, histList, panelTab, showPast, sel, extra]);
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

  const hasName = !!auth.profile?.display_name && auth.profile.display_name !== "Someone";
  const needName = (why = t("whyJoin")) => {
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

  // how many meetups each host has run (for the trust line on cards)
  const [, setStatsV] = useState(0);
  const hostKey = [...new Set(data.pulses.map((p) => p.host_id))].sort().join(",");
  useEffect(() => {
    if (!hostKey) return;
    hostStats(hostKey.split(",")).then((s) => { setHostStats(s); setStatsV((v) => v + 1); });
  }, [hostKey]);

  // social proof: people who met up within 5 km this week
  const proof = useMemo(() => {
    const wk = data.pulses.filter((p) => isOver(p) && Date.now() - ms(p.ends_at) < 7 * DAY && distanceM(loc.me, pos(p)) < 5000);
    return { groups: wk.length, people: wk.reduce((n, p) => n + accepted(p).length + 1, 0) };
  }, [data.pulses, loc.me]);

  // shared from the Google Maps app (Android "Share → แถว"): open the form with the link
  useEffect(() => {
    if (location.pathname !== "/share") return;
    const q = new URLSearchParams(location.search);
    const text = [q.get("title"), q.get("text"), q.get("url")].filter(Boolean).join("\n");
    history.replaceState(null, "", "/");
    if (!text) return;
    setDrop({ pin: loc.me, prefill: { where: text }, k: Date.now() });
    if (window.innerWidth < 820) setTab("map");
    toast(t("fShared"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // home-screen shortcut "ตั้งก๊วน" (?new=1)
  useEffect(() => {
    if (new URLSearchParams(location.search).get("new") !== "1") return;
    history.replaceState(null, "", "/");
    setTimeout(() => openDrop(), 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // opened inside LINE to link this LINE account (?link=<code>)
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("link");
    if (!code) return;
    completeLineLink(code).then((r) => {
      if (r === "redirecting") return;
      const clean = new URL(location.href); clean.searchParams.delete("link"); history.replaceState(null, "", clean.toString());
      if (r.ok) { toast(t("lineDone")); setTimeout(closeLine, 2500); }
      else toast(t("lineFail", { e: r.error ?? "" }));
    }).catch((e) => toast(t("lineFail", { e: String(e?.message ?? e) })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Install app" (Android prompt, iPhone instructions)
  const [, setInstallV] = useState(0);
  useEffect(() => onInstallChange(() => setInstallV((v) => v + 1)), []);
  const [installDismissed, setInstallDismissed] = useState(() => prefs.read("installDismissed", false));
  const showInstall = !installDismissed && !isStandalone() && (canPromptInstall() || isIos());

  const a: Actions = {
    select,
    join: (p) => { if (needName(t("whyJoin"))) return;
      run(async () => { const st = await joinPulse(p.id); toast(st === "accepted" ? t("tJoined", { s: p.exact ? t("tSeeYouAt", { p: p.exact.place_name }) : "" }) : t("tRequested", { h: p.host?.display_name || t("theHost") })); }); },
    leave: (p) => { run(() => leavePulse(p.id), t("tLeft", { t: p.title })); },
    respond: (p, user, ok) => { run(() => respondRequest(p.id, user, ok), ok ? t("tAccepted") : t("tDeclined")); },
    end: (p) => { const later = status(p).k === "soon"; if (later) setSel(null); run(() => endPulse(p.id), later ? t("tCancelled") : t("tEnded")); },
    extend: (p, m) => { run(() => extendPulse(p.id, m), t("tExtended", { n: m })); },
    share: (p) => setShare(p),
    again: (p) => {
      const ll = p.exact ? { lat: p.exact.lat, lng: p.exact.lng } : { lat: p.rough_lat, lng: p.rough_lng };
      setSel(null); setTab(window.innerWidth < 820 ? "map" : "near");
      setDrop({ pin: ll, prefill: { title: p.title, category: p.category, need: p.need, place: p.exact?.place_name ?? "", sub: p.sub ?? null }, k: Date.now() });
      setCenterOn({ ll, k: Date.now() });
    },
    chat: async (p, body) => { try { await sendMessage(p.id, body); return true; } catch (e) { toast(errText(e)); return false; } },
    saveContact: (p, c) => run(() => setContact(p.id, c), t("cSaved")),
    signal: (p, kind, eta = null) => {
      if (!uid) return;
      run(() => setSignal(uid, p.id, kind, eta), kind === "omw" ? t("tOmw") : kind === "interested" ? t("tInterested") : undefined);
    },
    setCover: (p, file) => { run(() => setPulseCover(p.id, file), file ? t("tCoverSaved") : t("tCoverRemoved")); },
    post: async (p, kind, body, file) => {
      if (needName(t("whyPost"))) return false;
      return run(() => postToFeed(uid!, p.id, kind, body, file), kind === "checkin" ? t("tCheckedIn") : t("tPosted"));
    },
  };

  const [locating, setLocating] = useState(false);
  const locateMe = async () => {
    if (locating) return;
    setLocating(true); toast(t("locating"));
    const r = await loc.locate();
    setLocating(false);
    if (r.ok) { setCenterOn({ ll: r.ll, k: Date.now() }); setToastMsg(null); }
    else toast(r.denied ? t("locDenied") : t("locFail"));
  };

  const openDrop = () => {
    if (needName(t("whyHost"))) return;
    const d = readDraft();
    setSel(null); setDropDown(false); setDrop({ pin: d?.pin ?? loc.me, prefill: null, k: Date.now() });
    if (d) setCenterOn({ ll: d.pin, k: Date.now() });
    if (window.innerWidth < 820) setTab("map");
  };
  const collapseDrop = (c: boolean) => { setDropDown(c); if (c && drop) setCenterOn({ ll: drop.pin, k: Date.now() }); };
  const onPick = (ll: LatLng) => {
    if (placing === "me") { loc.setManual(ll); setPlacing(null); toast(t("spotSet")); return; }
    if (drop) { setDrop({ ...drop, pin: ll }); setPlacing(null); } // the sheet stays slid down so they can keep adjusting
  };
  const submitDrop = async (np: Parameters<typeof createPulse>[0]) => {
    try {
      const id = await createPulse(np);
      setDrop(null); setDropDown(false); toast(np.startInMin <= 1 ? t("tLiveNow") : t("tScheduled")); await data.reload(); setSel(id);
      return true;
    } catch (e) { toast(errText(e)); return false; }
  };

  const live = near.filter((p) => status(p).k === "live").length;
  const soon3 = near.filter((p) => status(p).k === "soon" && new Date(p.starts_at).getTime() - Date.now() <= 3 * 3_600_000).length;
  const summary = panelTab === "near" ? t("sumNear", { a: live, b: soon3, c: near.length - live - soon3 })
    : panelTab === "feed" ? t("sumFeed")
    : panelTab === "hist" ? t("sumHist", { n: histList.length }) : t("sumGrow");

  return (
    <div className={`app tab-${tab}`}>
      <div className="mapwrap">
        <MapView me={loc.me} items={mapItems} uid={uid} selectedId={sel} surfaced={surfaced} radiusM={radiusM}
          placing={!!placing || (!!drop && dropDown)} pin={drop ? drop.pin : null}
          centerOn={centerOn} onSelect={select} onPick={onPick} />
        <div className="brand"><span className="dot" /><b>{t("brand")}</b>{!configured && <span className="brand-sub">{t("demo")}</span>}
          <button className="langbtn" onClick={() => setLang(lang === "th" ? "en" : "th")} aria-label={t("language")}>{lang === "th" ? "EN" : "ไทย"}</button></div>
        <div className="mapctl">
          <button className="me-btn" onClick={() => setProfileOpen({ reason: null })} aria-label={t("profile")}>
          <Avatar name={auth.profile?.display_name || t("you")} url={auth.profile?.avatar_url} size={30} />
          <span className="me-name">{configured && auth.isGuest && !hasName ? t("signIn") : auth.profile?.display_name || t("you")}</span>
        </button>
          <button className="mapbtn" aria-pressed={showPast} onClick={() => setShowPast(!showPast)}>{t("pastToggle")}</button>
          <button className="mapbtn" onClick={() => { setPlacing("me"); }}>{t("setMySpot")}</button>
        </div>
        {!drop && !placing && (
          <button className="locbtn" data-state={locating ? "busy" : loc.source === "gps" ? "on" : "off"} aria-label={t("locate")} title={t("locate")} onClick={locateMe}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
            </svg>
          </button>
        )}
        {placing && <div className="placehint">{placing === "me" ? t("tapWhereYouAre") : t("tapWhereItIs")} <button onClick={() => setPlacing(null)}>{t("cancel")}</button></div>}
        {selected && !drop && <PulseDetail p={selected} uid={uid} me={loc.me} posts={data.posts} a={a} />}
        {!drop && !placing && <button className="fab" onClick={openDrop}><span className="ring" />{readDraft() ? t("fabDraft") : t("fab")}</button>}
        {drop && (
          <DropPulse key={drop.k} hidden={!!placing} collapsed={dropDown} onCollapse={collapseDrop} pin={drop.pin} me={loc.me} prefill={drop.prefill}
            onMovePin={() => collapseDrop(true)} onPin={(ll) => { setDrop((d) => (d ? { ...d, pin: ll } : d)); setCenterOn({ ll, k: Date.now() }); }}
            onCancel={() => { setDrop(null); setDropDown(false); }}
            onClose={() => { setDrop(null); setDropDown(false); if (readDraft()) toast(t("dKept")); }} onSubmit={submitDrop} />
        )}
      </div>

      <aside className="side">
        <div className="sidehead">
          <div className="tabs" role="tablist">
            {(Object.keys(TAB_LABEL) as (keyof typeof TAB_LABEL)[]).map((t) => (
              <button key={t} role="tab" aria-selected={panelTab === t} onClick={() => setTab(t)}>{TAB_LABEL[t]()}</button>
            ))}
          </div>
          <div className="sub">{summary}</div>
          {panelTab === "hist" && <input className="search" type="search" id="h-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPast")} />}
          {panelTab === "hist" && (
            <div className="seg" role="group" aria-label="When">
              {(Object.keys(PERIODS) as Period[]).map((k) => <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>{PERIODS[k].label()}</button>)}
            </div>
          )}
          {panelTab === "feed" && (
            <div className="seg" role="group" aria-label={t("tabFeed")}>
              {(["near", "following"] as const).map((k) => <button key={k} aria-pressed={feedMode === k} onClick={() => { setFeedMode(k); prefs.write("feedMode", k); setFeedKey((n) => n + 1); }}>{k === "near" ? t("feedNear") : t("feedFollowing")}</button>)}
            </div>
          )}
          {(panelTab === "near" || (panelTab === "feed" && feedMode === "near")) && (
            <div className="seg" role="group" aria-label="Distance">
              {(Object.keys(RADII) as RadiusKey[]).map((k) => <button key={k} aria-pressed={radius === k} onClick={() => { setRadius(k); prefs.write("radius", k); }}>{RADII[k].label()}</button>)}
            </div>
          )}
          {panelTab !== "grow" && !(panelTab === "feed" && feedMode === "following") && (
            <div className="row">
              <button className="chip" aria-pressed={allCats} onClick={() => { setCats(new Set(CAT_KEYS)); setSubF(null); }}>{t("allCats")}</button>
              {CAT_KEYS.map((k) => (
                <button key={k} className="chip" aria-pressed={!allCats && cats.has(k)} onClick={() => tapCat(k)}>
                  <i style={{ background: CATS[k].color }} />{catName(k)}
                </button>
              ))}
            </div>
          )}
          {panelTab !== "grow" && onlyCat && !(panelTab === "feed" && feedMode === "following") && (
            <div className="subrow" role="group" aria-label={catName(onlyCat)}>
              {subsOf(onlyCat).map((sb) => (
                <button key={sb.k} className="chip" aria-pressed={subF === sb.k} onClick={() => setSubF(subF === sb.k ? null : sb.k)}>{lang === "th" ? sb.th : sb.en}</button>
              ))}
            </div>
          )}
        </div>
        <div className="list">
          {!configured && <div className="banner">{t("demoBanner")}</div>}
          {panelTab === "near" && proof.people >= 3 && <div className="banner proof"><span>{t("proof", { p: proof.people, g: proof.groups })}</span></div>}
          {showInstall && panelTab === "near" && (
            <div className="banner install">
              <span><b>{t("install")}</b> · {canPromptInstall() ? t("installWhy") : t("installIos")}</span>
              <span className="btnrow">
                {canPromptInstall() && <button onClick={async () => { if (await promptInstall()) toast(t("installDone")); }}>{t("install")}</button>}
                <button onClick={() => { setInstallDismissed(true); prefs.write("installDismissed", true); }}>{t("dismiss")}</button>
              </span>
            </div>
          )}
          {loc.source === "default" && <div className="banner"><span>{t("locOff")}</span><span className="btnrow"><button onClick={locateMe}>{t("locate")}</button><button onClick={() => setPlacing("me")}>{t("setMySpot")}</button></span></div>}
          {data.error && <div className="banner">{t("loadFail", { e: data.error })}</div>}
          {data.loading && !data.pulses.length ? <div className="empty">{t("loading")}</div> : (
            <>
              {panelTab === "near" && <NearbyTab list={near} uid={uid} me={loc.me} selectedId={sel} a={a} />}
              {panelTab === "feed" && feedMode === "near" && <FeedTab pulses={pulses} posts={data.posts} uid={uid} me={loc.me} radiusM={radiusM} a={a} />}
              {panelTab === "feed" && feedMode === "following" && (
                <FollowingFeed uid={uid} me={loc.me} selectedId={sel} a={a} canFollow={!configured || hasName} reloadKey={feedKey + data.pulses.length}
                  onLoaded={(l) => setExtra((m) => { const n = new Map(m); l.forEach((p) => n.set(p.id, p)); return n; })} />
              )}
              {panelTab === "hist" && <HistoryTab results={histList} loading={hist.loading} q={q} uid={uid} me={loc.me} selectedId={sel} a={a} />}
              {panelTab === "grow" && <GrowTab pulses={data.pulses} selected={selected} lang={capLang} setLang={setCapLang} onShare={setShare} onPoster={() => setShare("poster")} toast={toast} />}
            </>
          )}
        </div>
      </aside>

      <nav className="tabbar" aria-label="Sections" lang={lang}>
        {(["map", "near", "feed", "hist", "grow"] as Tab[]).map((t) => (
          <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t === "map" ? tr("tabMap") : TAB_LABEL[t]()}</button>
        ))}
      </nav>

      {share && <ShareModal target={share} lang={capLang} setLang={setCapLang} onClose={() => setShare(null)} toast={toast} />}
      {viewing && (
        <ProfileView key={viewing} id={viewing} uid={uid} canFollow={!configured || hasName}
          onNeedName={() => { setViewing(null); setProfileOpen({ reason: t("pvNeedName") }); }}
          onEdit={() => { setViewing(null); setProfileOpen({ reason: null }); }}
          onOpenPulse={(p) => { setViewing(null); setExtra((m) => new Map(m).set(p.id, p)); setSel(p.id); setCenterOn({ ll: pos(p), k: Date.now() }); if (window.innerWidth < 820) setTab("map"); }}
          onClose={() => setViewing(null)} toast={toast} />
      )}
      {profileOpen && <ProfileSheet auth={auth} me={loc.me} reason={profileOpen.reason} onClose={() => setProfileOpen(null)} toast={toast}
        onViewMine={uid ? () => { setProfileOpen(null); setViewing(uid); } : undefined} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
