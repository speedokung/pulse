import { subName } from "../lib/categories";
import type { Contact, FeedPost, Level, Pulse, Signal } from "../lib/types";
import { hostedCount } from "../lib/trust";
import { CATS, catIcon } from "../lib/categories";
import { t } from "../lib/i18n";
import { accepted, hostName, isHost, isOver, myStatus, openSpots, placeLabel, showsExact, status } from "../lib/pulse";
import { ago, dayClock, span } from "../lib/format";
import { googleNavUrl } from "../lib/geo";

export interface Actions {
  select: (id: string | null) => void;
  join: (p: Pulse) => void;
  leave: (p: Pulse) => void;
  respond: (p: Pulse, user: string, accept: boolean) => void;
  end: (p: Pulse) => void;
  extend: (p: Pulse, minutes: number) => void;
  share: (p: Pulse) => void;
  again: (p: Pulse) => void;
  post: (p: Pulse, kind: FeedPost["kind"], body: string | null, file: File | null) => Promise<boolean>;
  chat: (p: Pulse, body: string) => Promise<boolean>;
  saveContact: (p: Pulse, c: Contact) => Promise<boolean>;
  signal: (p: Pulse, kind: Signal["kind"] | null, etaMin?: number | null) => void;
}

export const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="2" y="5" width="8" height="6" rx="1.5" fill="currentColor" />
    <path d="M4 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export function Glyph({ p }: { p: Pulse }) {
  return <div className={`glyph${isOver(p) ? " past" : ""}`} style={{ background: CATS[p.category].color }} dangerouslySetInnerHTML={{ __html: catIcon(p.category, 22) }} />;
}

export function When({ p }: { p: Pulse }) {
  const st = status(p);
  if (st.k === "over") return <span>{t("endedAgo", { t: ago(p.ends_at) })}</span>;
  if (st.k === "live") return <span className="live">{t("liveLeft", { n: span(st.left) })}</span>;
  return <span>{t("startsAt", { t: dayClock(p.starts_at) })}{st.in <= 180 ? ` · ${t("inTime", { n: span(st.in) })}` : ""}</span>;
}

export function Place({ p }: { p: Pulse }) {
  return showsExact(p) || isOver(p)
    ? <span>{placeLabel(p)}</span>
    : <span className="lock"><Lock />{t("around", { a: p.area_name })}</span>;
}

export function Seats({ p, uid }: { p: Pulse; uid: string | null }) {
  const n = accepted(p).length, mine = myStatus(p, uid) === "accepted";
  return (
    <div className="seats" aria-label={t("spotsOpen", { n: Math.max(0, openSpots(p)) })}>
      {Array.from({ length: p.need }, (_, i) => <span key={i} className={i < n ? (mine && i === n - 1 ? "me" : "f") : ""} />)}
    </div>
  );
}

export function JoinButton({ p, uid, a }: { p: Pulse; uid: string | null; a: Actions }) {
  if (isHost(p, uid)) return <button className="join" onClick={(e) => { e.stopPropagation(); a.share(p); }}>{openSpots(p) > 0 ? t("shareFill") : t("share")}</button>;
  const s = myStatus(p, uid);
  if (s === "accepted") return <button className="join in" onClick={(e) => { e.stopPropagation(); a.leave(p); }}>{t("inLeave")}</button>;
  if (s === "requested") return <button className="join wait" onClick={(e) => { e.stopPropagation(); a.leave(p); }}>{t("reqCancel")}</button>;
  if (openSpots(p) <= 0) return <button className="join" disabled>{t("full")}</button>;
  return <button className="join" onClick={(e) => { e.stopPropagation(); a.join(p); }}>{p.visibility === "all" ? t("join") : t("askJoin")}</button>;
}

export const by = (p: Pulse, uid: string | null) => t("by", { n: hostName(p, uid) });

/** Walking directions in Google Maps. Only offered when this viewer may see the exact spot. */
export function NavButton({ p, label = t("navigate") }: { p: Pulse; label?: string }) {
  if (isOver(p) || !showsExact(p)) return null;
  return (
    <a className="mini nav" href={googleNavUrl(p.exact!)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      aria-label={`${label}: ${p.exact!.place_name} (Google Maps)`}>
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor" /></svg>
      {label}
    </a>
  );
}

export function Avatar({ name, url, size = 22 }: { name?: string | null; url?: string | null; size?: number }) {
  const n = (name || "?").trim();
  const hue = [...n].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return url
    ? <img className="avatar" src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" />
    : <span className="avatar" style={{ width: size, height: size, background: `hsl(${hue} 45% 45%)`, fontSize: size * 0.45 }} aria-hidden="true">{[...n][0]?.toUpperCase()}</span>;
}

const LEVEL_KEY = { any: "lvAny", beginner: "lvBeginner", casual: "lvCasual", serious: "lvSerious" } as const;
export const levelLabel = (l: Level) => t(LEVEL_KEY[l]);
/** Skill level + weekly tags shown on cards and in the detail. */
export function Tags({ p }: { p: Pulse }) {
  const lv = p.level && p.level !== "any" ? p.level : null;
  const sub = subName(p.sub);
  if (!lv && !p.series_id && !sub) return null;
  return (
    <span className="tags">
      {sub && <span className="tagchip">{sub}</span>}
      {lv && <span className={`tagchip lv-${lv}`}>{levelLabel(lv)}</span>}
      {p.series_id && <span className="tagchip">↻ {t("weekly")}</span>}
    </span>
  );
}

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 2.1 3.2-.3.8 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.8 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.8-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.8-3.1 3.2.3z" fill="currentColor" /><path d="M8 12.5l2.6 2.5L16 9.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
/** "by Mai ✓ · hosted 23" */
export function HostLine({ p, uid }: { p: Pulse; uid: string | null }) {
  const n = hostedCount(p.host_id), v = p.host?.verified;
  return (
    <span className="hostline">
      {by(p, uid)}
      {v && !isHost(p, uid) && <span className="verified" title={v === "google" ? t("vGoogle") : t("vLine")} aria-label={v === "google" ? t("vGoogle") : t("vLine")}><Check /></span>}
      {!isHost(p, uid) && <span className="hosted">· {n > 0 ? t("hosted", { n }) : t("newHost")}</span>}
    </span>
  );
}

export const signalsOf = (p: Pulse) => p.pulse_signals ?? [];
export const mySignal = (p: Pulse, uid: string | null) => signalsOf(p).find((s) => s.user_id === uid) ?? null;
/** "2 on the way · 3 interested" */
export function SignalSummary({ p }: { p: Pulse }) {
  const s = signalsOf(p);
  const omw = s.filter((x) => x.kind === "omw").length, int = s.filter((x) => x.kind === "interested").length;
  if (!omw && !int) return null;
  return (
    <span className="signals">
      {omw > 0 && <span className="omw">{t("sComing", { n: omw })}</span>}
      {int > 0 && <span>{t("sInterestedN", { n: int })}</span>}
    </span>
  );
}
