import type { FeedPost, LatLng, Pulse } from "../lib/types";
import { CATS, catName } from "../lib/categories";
import { accepted, isHost, isOver, isParticipant, myStatus, pos, showsExact, status } from "../lib/pulse";
import { distanceM } from "../lib/geo";
import { dist, walkMin } from "../lib/format";
import { Actions, Avatar, HostLine, JoinButton, Tags, Lock, NavButton, Place, Seats, When, WhoGoing } from "./ui";
import { openProfile } from "../lib/profileBus";
import { Composer, photoSrc, PostLine } from "./Posts";
import { ContactBox, GroupChat, SignalsBox } from "./Contact";
import { t } from "../lib/i18n";
import { coverSrc } from "../lib/api";

export function PulseDetail({ p, uid, me, posts, a }: { p: Pulse; uid: string | null; me: LatLng; posts: FeedPost[]; a: Actions }) {
  const past = isOver(p), d = distanceM(me, pos(p)), host = isHost(p, uid);
  const reqs = p.memberships.filter((m) => m.status === "requested");
  const mine = posts.filter((f) => f.pulse_id === p.id);
  const photo = mine.find((f) => photoSrc(f));
  const canPost = isParticipant(p, uid) && (!past || Date.now() - new Date(p.ends_at).getTime() < 3 * 3600_000);
  const cover = coverSrc(p);
  return (
    <div className={`detail${cover ? " hascover" : ""}`} role="dialog" aria-label={p.title}>
      <button className="x" onClick={() => a.select(null)} aria-label="Close">×</button>
      {cover && <img className="detail-cover" src={cover} alt="" />}
      <div className="kicker" style={{ color: past ? "var(--muted)" : CATS[p.category].color }}>
        {past ? `${t("ended")} · ` : ""}{catName(p.category)}
      </div>
      <h3>{p.title}</h3>
      <Tags p={p} />
      <div className="meta"><When p={p} /></div>
      <div className="meta"><Place p={p} /><span>{dist(d)}{past ? "" : ` · ${t("walk", { n: walkMin(d) })}`}</span><HostLine p={p} uid={uid} /></div>
      {photo && !cover && <img className="detail-photo" src={photoSrc(photo)!} alt={`Photo from ${p.title}`} />}

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

      <WhoGoing p={p} />
      <SignalsBox p={p} uid={uid} a={a} />

      {host && !past && (
        <>
          {reqs.length > 0 && (
            <div className="reqs"><div className="meta">{t("requests")}</div>
              {reqs.map((r) => (
                <div className="req" key={r.user_id}>
                  <button type="button" className="linkbtn req-who" onClick={() => openProfile(r.user_id)}>
                    <Avatar name={r.profile?.display_name} url={r.profile?.avatar_url} />
                    <span>{r.profile?.display_name || t("someone")}</span>
                  </button>
                  <button className="mini pri" onClick={() => a.respond(p, r.user_id, true)}>{t("accept")}</button>
                  <button className="mini" onClick={() => a.respond(p, r.user_id, false)}>{t("decline")}</button>
                </div>
              ))}
            </div>
          )}
          <div className="cfoot"><span className="meta">{p.visibility === "all" ? t("spotEveryone") : t("spotAccepted")}</span>
            <div className="btnrow">
              <label className="mini">{cover ? t("coverChange") : t("coverAdd")}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) a.setCover(p, f); e.target.value = ""; }} /></label>
              {cover && <button className="mini" onClick={() => a.setCover(p, null)}>{t("coverRemove")}</button>}
              <button className="mini" onClick={() => a.extend(p, 30)}>{t("extend30")}</button><button className="mini" onClick={() => a.end(p)}>{status(p).k === "live" ? t("endNow") : t("cancel")}</button></div></div>
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
