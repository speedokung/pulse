import type { FeedPost, LatLng, Pulse } from "../lib/types";
import { CATS, catName } from "../lib/categories";
import { accepted, isHost, isOver, isParticipant, myStatus, pos, showsExact, status } from "../lib/pulse";
import { distanceM } from "../lib/geo";
import { dist, walkMin } from "../lib/format";
import { Actions, Avatar, by, JoinButton, Lock, NavButton, Place, Seats, When } from "./ui";
import { Composer, photoSrc, PostLine } from "./Posts";
import { ContactBox, GroupChat } from "./Contact";
import { t } from "../lib/i18n";

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
        {past ? `${t("ended")} · ` : ""}{catName(p.category)}
      </div>
      <h3>{p.title}</h3>
      <div className="meta"><When p={p} /></div>
      <div className="meta"><Place p={p} /><span>{dist(d)}{past ? "" : ` · ${t("walk", { n: walkMin(d) })}`}</span><span>{by(p, uid)}</span></div>
      {photo && <img className="detail-photo" src={photoSrc(photo)!} alt={`Photo from ${p.title}`} />}

      {!past && showsExact(p) && <NavButton p={p} label={t("navigateG")} />}
      {!past && !showsExact(p) && (
        <div className="lockline"><Lock /><span>{myStatus(p, uid) === "requested"
          ? t("waitingHost", { h: p.host?.display_name || t("theHost") })
          : t("hostSharesSpot")}</span></div>
      )}

      {past ? (
        <div className="cfoot"><span className="meta">{t("metUp", { n: accepted(p).length + 1 })}</span>
          <div className="btnrow"><button className="mini" onClick={() => a.again(p)}>{t("again")}</button><button className="mini pri" onClick={() => a.share(p)}>{t("shareRecap")}</button></div>
        </div>
      ) : (
        <div className="cfoot"><Seats p={p} uid={uid} />
          <div className="btnrow">
            {!host && <button className="mini" onClick={() => a.share(p)}>{t("share")}</button>}
            <JoinButton p={p} uid={uid} a={a} />
          </div>
        </div>
      )}

      {host && !past && (
        <>
          {reqs.length > 0 && (
            <div className="reqs"><div className="meta">{t("requests")}</div>
              {reqs.map((r) => (
                <div className="req" key={r.user_id}>
                  <Avatar name={r.profile?.display_name} url={r.profile?.avatar_url} />
                  <span>{r.profile?.display_name || t("someone")}</span>
                  <button className="mini pri" onClick={() => a.respond(p, r.user_id, true)}>{t("accept")}</button>
                  <button className="mini" onClick={() => a.respond(p, r.user_id, false)}>{t("decline")}</button>
                </div>
              ))}
            </div>
          )}
          <div className="cfoot"><span className="meta">{p.visibility === "all" ? t("spotEveryone") : t("spotAccepted")}</span>
            <div className="btnrow"><button className="mini" onClick={() => a.extend(p, 30)}>{t("extend30")}</button><button className="mini" onClick={() => a.end(p)}>{status(p).k === "live" ? t("endNow") : t("cancel")}</button></div></div>
        </>
      )}

      {(isParticipant(p, uid) || host || (!past && showsExact(p))) && <ContactBox p={p} uid={uid} a={a} />}
      <GroupChat p={p} uid={uid} a={a} />

      {(mine.length > 0 || canPost) && (
        <div className="thread">
          <div className="meta">{t("fromSpot")}</div>
          {mine.slice(0, 5).map((f) => <PostLine key={f.id} f={f} p={p} uid={uid} />)}
          {!mine.length && <div className="sub">{t("noUpdates")}</div>}
          {canPost && <Composer p={p} uid={uid} a={a} />}
        </div>
      )}
    </div>
  );
}
