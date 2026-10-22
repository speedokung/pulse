import type { FeedPost, LatLng, Pulse } from "../lib/types";
import { CATS } from "../lib/categories";
import { accepted, HOUR, isOver, isParticipant, ms, openSpots, pos, status } from "../lib/pulse";
import { distanceM } from "../lib/geo";
import { ago, dist, walkMin } from "../lib/format";
import { Actions, JoinButton, NavButton, Place, When } from "./ui";
import { Composer, photoSrc, PostLine } from "./Posts";

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
    return <div className="empty">It's quiet around you right now.<br />Widen the distance, or drop a Pulse and be the first update here.</div>;

  const Section = ({ title, list }: { title: string; list: Pulse[] }) =>
    list.length ? <><div className="slot">{title}</div>{list.map((p) => <FeedCard key={p.id} p={p} posts={byPulse.get(p.id) || []} uid={uid} me={me} a={a} />)}</> : null;

  return (
    <div className="feed">
      <Section title="Live now" list={live} />
      <Section title="Starting soon" list={soon} />
      <Section title="Just wrapped up" list={ended} />
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
          <div className="kicker" style={{ color: past ? "var(--muted)" : c.color }}>{c.name.toUpperCase()}</div>
          <h4>{p.title}</h4>
          <div className="meta"><When p={p} /><span>{dist(d)}{past ? "" : ` · ${walkMin(d)} min walk`}</span></div>
          <div className="meta"><Place p={p} /></div>
        </div>
      </header>
      {photo && <img className="fphoto" src={photoSrc(photo)!} alt={`Photo from ${p.title}, ${ago(photo.created_at)}`} loading="lazy" />}
      <div className="fstats">
        <span><b>{going}</b> {past ? "met up" : "going"}</span>
        {here > 0 && <span><b>{here}</b> checked in</span>}
        {!past && <span><b>{Math.max(0, openSpots(p))}</b> spots open</span>}
        {posts[0] && <span>last update {ago(posts[0].created_at)}</span>}
      </div>
      {text.length > 0 && <div className="thread">{text.map((f) => <PostLine key={f.id} f={f} p={p} uid={uid} />)}</div>}
      {!past && (
        <div className="cfoot">
          <button className="mini" onClick={() => a.select(p.id)}>See on map</button>
          <div className="btnrow"><NavButton p={p} /><JoinButton p={p} uid={uid} a={a} /></div>
        </div>
      )}
      {isParticipant(p, uid) && !past && <Composer p={p} uid={uid} a={a} />}
    </article>
  );
}
