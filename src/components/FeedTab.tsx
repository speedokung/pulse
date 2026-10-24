import { useEffect, useState } from "react";
import type { FeedPost, FollowingItem, LatLng, Pulse } from "../lib/types";
import { loadFollowingFeed } from "../lib/api";
import { openProfile } from "../lib/profileBus";
import { PulseCard } from "./PulseCard";
import { CATS, catName } from "../lib/categories";
import { accepted, HOUR, isOver, isParticipant, ms, openSpots, pos, status } from "../lib/pulse";
import { distanceM } from "../lib/geo";
import { ago, dist, walkMin } from "../lib/format";
import { Actions, Avatar, JoinButton, NavButton, Place, When } from "./ui";
import { Composer, photoSrc, PostLine } from "./Posts";
import { t } from "../lib/i18n";

/** "What's it like right now?" A scroll of live updates, photos and check-ins nearby. */
export function FeedTab({ pulses, posts, uid, me, radiusM, a }: {
  pulses: Pulse[]; posts: FeedPost[]; uid: string | null; me: LatLng; radiusM: number; a: Actions;
}) {
  const now = Date.now();
  const near = pulses.filter((p) => distanceM(me, pos(p)) <= radiusM);
  const byPulse = new Map<string, FeedPost[]>();
  posts.forEach((f) => { const l = byPulse.get(f.pulse_id) || []; l.push(f); byPulse.set(f.pulse_id, l); });
  const lastActivity = (p: Pulse) => Math.max(ms(p.created_at), ...(byPulse.get(p.id) || []).map((f) => ms(f.created_at)));

  const live = near.filter((p) => status(p, now).k === "live").sort((x, y) => lastActivity(y) - lastActivity(x));
  const soon = near.filter((p) => status(p, now).k === "soon" && ms(p.starts_at) - now <= 3 * HOUR).sort((x, y) => ms(x.starts_at) - ms(y.starts_at));
  const ended = near.filter((p) => isOver(p, now) && now - ms(p.ends_at) < 3 * HOUR && (byPulse.get(p.id)?.length || 0) > 0)
    .sort((x, y) => ms(y.ends_at) - ms(x.ends_at));

  if (!live.length && !soon.length && !ended.length)
    return <div className="empty" dangerouslySetInnerHTML={{ __html: t("emptyFeed") }} />;

  const Section = ({ title, list }: { title: string; list: Pulse[] }) =>
    list.length ? <><div className="slot">{title}</div>{list.map((p) => <FeedCard key={p.id} p={p} posts={byPulse.get(p.id) || []} uid={uid} me={me} a={a} />)}</> : null;

  return (
    <div className="feed">
      <Section title={t("gLive")} list={live} />
      <Section title={t("gSoon")} list={soon} />
      <Section title={t("gWrapped")} list={ended} />
    </div>
  );
}

function FeedCard({ p, posts, uid, me, a }: { p: Pulse; posts: FeedPost[]; uid: string | null; me: LatLng; a: Actions }) {
  const d = distanceM(me, pos(p)), past = isOver(p), c = CATS[p.category];
  const photo = posts.find((f) => photoSrc(f));
  const text = posts.filter((f) => f.kind !== "photo" || f.body).slice(0, 3);
  const here = new Set(posts.filter((f) => f.kind === "checkin").map((f) => f.author_id)).size;
  const going = accepted(p).length + 1;
  return (
    <article className={`fcard${past ? " past" : ""}`}>
      <header onClick={() => a.select(p.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") a.select(p.id); }}>
        <span className="fdot" style={{ background: past ? "var(--ghost)" : c.color }} />
        <div className="cbody">
          <div className="kicker" style={{ color: past ? "var(--muted)" : c.color }}>{catName(p.category)}</div>
          <h4>{p.title}</h4>
          <div className="meta"><When p={p} /><span>{dist(d)}{past ? "" : ` · ${t("walk", { n: walkMin(d) })}`}</span></div>
          <div className="meta"><Place p={p} /></div>
        </div>
      </header>
      {photo && <img className="fphoto" src={photoSrc(photo)!} alt={`Photo from ${p.title}, ${ago(photo.created_at)}`} loading="lazy" />}
      <div className="fstats">
        <span>{past ? t("metUp", { n: going }) : <><b>{going}</b> {t("going")}</>}</span>
        {here > 0 && <span><b>{here}</b> {t("checkedIn")}</span>}
        {!past && <span>{t("spotsOpen", { n: Math.max(0, openSpots(p)) })}</span>}
        {posts[0] && <span>{t("lastUpdate", { t: ago(posts[0].created_at) })}</span>}
      </div>
      {text.length > 0 && <div className="thread">{text.map((f) => <PostLine key={f.id} f={f} p={p} uid={uid} />)}</div>}
      {!past && (
        <div className="cfoot">
          <button className="mini" onClick={() => a.select(p.id)}>{t("seeOnMap")}</button>
          <div className="btnrow"><NavButton p={p} /><JoinButton p={p} uid={uid} a={a} /></div>
        </div>
      )}
      {isParticipant(p, uid) && !past && <Composer p={p} uid={uid} a={a} />}
    </article>
  );
}

/** What people you follow are hosting or joining, at any distance. */
export function FollowingFeed({ uid, me, selectedId, a, canFollow, reloadKey, onLoaded }: {
  uid: string | null; me: LatLng; selectedId: string | null; a: Actions; canFollow: boolean; reloadKey: number;
  onLoaded: (list: Pulse[]) => void;
}) {
  const [items, setItems] = useState<FollowingItem[] | null>(null);
  useEffect(() => {
    if (!canFollow) { setItems([]); return; }
    let dead = false;
    loadFollowingFeed().then((l) => { if (!dead) { setItems(l); onLoaded(l.map((x) => x.pulse)); } }).catch(() => { if (!dead) setItems([]); });
    return () => { dead = true; };
  }, [reloadKey, canFollow]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!canFollow) return <div className="empty">{t("ffSignIn")}</div>;
  if (items === null) return <div className="empty">…</div>;
  if (!items.length) return <div className="empty" dangerouslySetInnerHTML={{ __html: t("ffEmpty") }} />;
  const now = Date.now();
  const on = items.filter((x) => !isOver(x.pulse, now)).sort((p, q) => ms(p.pulse.starts_at) - ms(q.pulse.starts_at));
  const done = items.filter((x) => isOver(x.pulse, now)).sort((p, q) => ms(q.pulse.ends_at) - ms(p.pulse.ends_at));
  const Row = ({ x }: { x: FollowingItem }) => (
    <div className="ffrow">
      <button type="button" className="linkbtn ffwho" onClick={() => openProfile(x.via.id)}>
        <Avatar name={x.via.display_name} url={x.via.avatar_url} size={22} />
        <span>{x.kind === "hosted" ? t("ffHosts", { n: x.via.display_name || t("someone") }) : t("ffJoins", { n: x.via.display_name || t("someone") })}</span>
      </button>
      <PulseCard p={x.pulse} uid={uid} me={me} sel={selectedId === x.pulse.id} a={a} />
    </div>
  );
  return (
    <div className="feed">
      {on.length > 0 && <><div className="slot">{t("gSoon")}</div>{on.map((x) => <Row key={x.pulse.id} x={x} />)}</>}
      {done.length > 0 && <><div className="slot">{t("gWrapped")}</div>{done.map((x) => <Row key={x.pulse.id} x={x} />)}</>}
    </div>
  );
}
