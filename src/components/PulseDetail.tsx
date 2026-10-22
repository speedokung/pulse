import type { FeedPost, LatLng, Pulse } from "../lib/types";
import { CATS } from "../lib/categories";
import { accepted, isHost, isOver, isParticipant, myStatus, pos, showsExact } from "../lib/pulse";
import { distanceM } from "../lib/geo";
import { dist, walkMin } from "../lib/format";
import { Actions, Avatar, by, JoinButton, Lock, NavButton, Place, Seats, When } from "./ui";
import { Composer, photoSrc, PostLine } from "./Posts";

export function PulseDetail({ p, uid, me, posts, a }: { p: Pulse; uid: string | null; me: LatLng; posts: FeedPost[]; a: Actions }) {
  const past = isOver(p), d = distanceM(me, pos(p)), host = isHost(p, uid);
  const reqs = p.memberships.filter((m) => m.status === "requested");
  const mine = posts.filter((f) => f.pulse_id === p.id);
  const photo = mine.find((f) => photoSrc(f));
  const canPost = isParticipant(p, uid) && (!past || Date.now() - new Date(p.ends_at).getTime() < 3 * 3600_000);
  return (
    <div className="detail" role="dialog" aria-label={p.title}>
      <button className="x" onClick={() => a.select(null)} aria-label="Close">×</button>
      <div className="kicker" style={{ color: past ? "var(--muted)" : CATS[p.category].color }}>
        {past ? "ENDED · " : ""}{CATS[p.category].name.toUpperCase()}
      </div>
      <h3>{p.title}</h3>
      <div className="meta"><When p={p} /></div>
      <div className="meta"><Place p={p} /><span>{dist(d)}{past ? "" : ` · ${walkMin(d)} min walk`}</span><span>{by(p, uid)}</span></div>
      {photo && <img className="detail-photo" src={photoSrc(photo)!} alt={`Photo from ${p.title}`} />}

      {!past && showsExact(p) && <NavButton p={p} label="Navigate in Google Maps" />}
      {!past && !showsExact(p) && (
        <div className="lockline"><Lock /><span>{myStatus(p, uid) === "requested"
          ? `Waiting for ${p.host?.display_name || "the host"} to accept. The exact spot shows here once you're in.`
          : "The host shares the exact spot with people they accept."}</span></div>
      )}

      {past ? (
        <div className="cfoot"><span className="meta">{accepted(p).length + 1} met up</span>
          <div className="btnrow"><button className="mini" onClick={() => a.again(p)}>Pulse again</button><button className="mini pri" onClick={() => a.share(p)}>Share recap</button></div>
        </div>
      ) : (
        <div className="cfoot"><Seats p={p} uid={uid} />
          <div className="btnrow">
            {!host && <button className="mini" onClick={() => a.share(p)}>Share</button>}
            <JoinButton p={p} uid={uid} a={a} />
          </div>
        </div>
      )}

      {host && !past && (
        <>
          {reqs.length > 0 && (
            <div className="reqs"><div className="meta">REQUESTS</div>
              {reqs.map((r) => (
                <div className="req" key={r.user_id}>
                  <Avatar name={r.profile?.display_name} url={r.profile?.avatar_url} />
                  <span>{r.profile?.display_name || "Someone nearby"}</span>
                  <button className="mini pri" onClick={() => a.respond(p, r.user_id, true)}>Accept</button>
                  <button className="mini" onClick={() => a.respond(p, r.user_id, false)}>Decline</button>
                </div>
              ))}
            </div>
          )}
          <div className="cfoot"><span className="meta">Exact spot: {p.visibility === "all" ? "everyone" : "accepted only"}</span>
            <button className="mini" onClick={() => a.end(p)}>End now</button></div>
        </>
      )}

      {(mine.length > 0 || canPost) && (
        <div className="thread">
          <div className="meta">FROM THE SPOT</div>
          {mine.slice(0, 5).map((f) => <PostLine key={f.id} f={f} p={p} uid={uid} />)}
          {!mine.length && <div className="sub">No updates yet. A quick line helps people decide to come.</div>}
          {canPost && <Composer p={p} uid={uid} a={a} />}
        </div>
      )}
    </div>
  );
}
