import type { FeedPost, Pulse } from "../lib/types";
import { CATS } from "../lib/categories";
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
}

export const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="2" y="5" width="8" height="6" rx="1.5" fill="currentColor" />
    <path d="M4 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export function Glyph({ p }: { p: Pulse }) {
  return <div className={`glyph${isOver(p) ? " past" : ""}`} style={{ background: CATS[p.category].color }}>{CATS[p.category].glyph}</div>;
}

export function When({ p }: { p: Pulse }) {
  const st = status(p);
  if (st.k === "over") return <span>Ended {ago(p.ends_at)}</span>;
  if (st.k === "live") return <span className="live">● Live · {st.left} min left</span>;
  return <span>Starts {dayClock(p.starts_at)}{st.in <= 180 ? ` · in ${st.in < 60 ? `${st.in} min` : span(st.in)}` : ""}</span>;
}

export function Place({ p }: { p: Pulse }) {
  return showsExact(p) || isOver(p)
    ? <span>{placeLabel(p)}</span>
    : <span className="lock"><Lock />Around {p.area_name}</span>;
}

export function Seats({ p, uid }: { p: Pulse; uid: string | null }) {
  const n = accepted(p).length, mine = myStatus(p, uid) === "accepted";
  return (
    <div className="seats" aria-label={`${Math.max(0, openSpots(p))} of ${p.need} spots open`}>
      {Array.from({ length: p.need }, (_, i) => <span key={i} className={i < n ? (mine && i === n - 1 ? "me" : "f") : ""} />)}
    </div>
  );
}

export function JoinButton({ p, uid, a }: { p: Pulse; uid: string | null; a: Actions }) {
  if (isHost(p, uid)) return <button className="join" onClick={(e) => { e.stopPropagation(); a.share(p); }}>{openSpots(p) > 0 ? "Share to fill spots" : "Share"}</button>;
  const s = myStatus(p, uid);
  if (s === "accepted") return <button className="join in" onClick={(e) => { e.stopPropagation(); a.leave(p); }}>You're in · Leave</button>;
  if (s === "requested") return <button className="join wait" onClick={(e) => { e.stopPropagation(); a.leave(p); }}>Requested · Cancel</button>;
  if (openSpots(p) <= 0) return <button className="join" disabled>Full</button>;
  return <button className="join" onClick={(e) => { e.stopPropagation(); a.join(p); }}>{p.visibility === "all" ? "Join" : "Ask to join"}</button>;
}

export const by = (p: Pulse, uid: string | null) => `by ${hostName(p, uid)}`;

/** Walking directions in Google Maps. Only offered when this viewer may see the exact spot. */
export function NavButton({ p, label = "Navigate" }: { p: Pulse; label?: string }) {
  if (isOver(p) || !showsExact(p)) return null;
  return (
    <a className="mini nav" href={googleNavUrl(p.exact!)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      aria-label={`${label} to ${p.exact!.place_name} in Google Maps`}>
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
