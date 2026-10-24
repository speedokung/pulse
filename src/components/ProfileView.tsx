import { useCallback, useEffect, useState } from "react";
import type { ActivityItem, ProfileSummary, Pulse } from "../lib/types";
import { errText, followUser, loadProfile, loadProfileActivity, unfollowUser } from "../lib/api";
import { CATS, catIcon, catName, subName } from "../lib/categories";
import { dayClock } from "../lib/format";
import { isOver, status } from "../lib/pulse";
import { t } from "../lib/i18n";
import { Avatar, Lock } from "./ui";
import { copy } from "./GrowTab";

/** Someone's page: who they are, what they host and join, and a follow button. */
export function ProfileView({ id, uid, canFollow, onNeedName, onEdit, onOpenPulse, onClose, toast }: {
  id: string; uid: string | null; canFollow: boolean;
  onNeedName: () => void; onEdit: () => void; onOpenPulse: (p: Pulse) => void; onClose: () => void; toast: (s: string) => void;
}) {
  const [prof, setProf] = useState<ProfileSummary | null | undefined>(undefined);
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [tab, setTab] = useState<"hosted" | "joined">("hosted");
  const [busy, setBusy] = useState(false);
  const self = id === uid;

  const load = useCallback(async () => {
    try {
      const p = await loadProfile(id);
      setProf(p);
      if (p?.can_see) {
        const list = await loadProfileActivity(id);
        setItems(list);
        if (!list.some((x) => x.kind === "hosted") && list.some((x) => x.kind === "joined")) setTab("joined");
      } else setItems([]);
    } catch (e) { setProf(null); toast(errText(e)); }
  }, [id, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const follow = async () => {
    if (!prof || !uid) return;
    if (!canFollow) { onNeedName(); return; }
    setBusy(true);
    try {
      if (prof.my_follow) { await unfollowUser(uid, prof.id); toast(t("tUnfollowed")); }
      else { const st = await followUser(prof.id); toast(st === "accepted" ? t("tFollowed", { n: prof.display_name }) : t("tRequestedFollow")); }
      await load();
    } catch (e) { toast(errText(e)); }
    finally { setBusy(false); }
  };
  const share = () => copy(`${location.origin}/?u=${id}`, toast, t("pvLinkCopied"));

  const list = (items ?? []).filter((x) => x.kind === tab);
  const upcoming = list.filter((x) => !isOver(x.pulse));
  const past = list.filter((x) => isOver(x.pulse));

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mbox pview" role="dialog" aria-modal="true" aria-labelledby="pv-h">
        <button type="button" className="xbtn pv-x" onClick={onClose} aria-label={t("close")}>×</button>
        {prof === undefined && <div className="empty">{"…"}</div>}
        {prof === null && <div className="empty">{t("pvNotFound")}</div>}
        {prof && (
          <>
            <div className="pv-head">
              <Avatar name={prof.display_name} url={prof.avatar_url} size={64} />
              <div className="pv-id">
                <h3 id="pv-h">{prof.display_name}{!prof.is_public && <span className="pv-lock" title={t("pvPrivate")}><Lock /></span>}</h3>
                {prof.follows_me && !self && <span className="tagchip">{t("pvFollowsYou")}</span>}
                {prof.bio && <p className="pv-bio">{prof.bio}</p>}
              </div>
            </div>
            <div className="pv-stats">
              <div><b>{prof.hosted}</b><span>{t("pvHosted")}</span></div>
              <div><b>{prof.joined}</b><span>{t("pvJoined")}</span></div>
              <div><b>{prof.followers}</b><span>{t("pvFollowers")}</span></div>
              <div><b>{prof.following}</b><span>{t("pvFollowing")}</span></div>
            </div>
            {prof.interests?.length > 0 && (
              <div className="row">{prof.interests.map((k) => <span key={k} className="chip static"><i style={{ background: CATS[k].color }} />{catName(k)}</span>)}</div>
            )}
            <div className="btns pv-btns">
              {self ? (
                <>
                  <button type="button" className="ghostbtn" onClick={share}>{t("pvShare")}</button>
                  <button type="button" className="go" onClick={onEdit}>{t("pvEdit")}</button>
                </>
              ) : (
                <>
                  <button type="button" className="ghostbtn" onClick={share}>{t("pvShare")}</button>
                  <button type="button" className={prof.my_follow ? "ghostbtn on" : "go"} onClick={follow} disabled={busy || !uid}>
                    {prof.my_follow === "accepted" ? t("pvFollowingBtn") : prof.my_follow === "requested" ? t("pvRequested") : prof.follows_me ? t("pvFollowBack") : t("pvFollow")}
                  </button>
                </>
              )}
            </div>

            {!prof.can_see ? (
              <div className="pv-private"><Lock /><div><b>{t("pvPrivate")}</b><span>{t("pvPrivateSub")}</span></div></div>
            ) : (
              <>
                <div className="seg wide" role="tablist">
                  <button role="tab" aria-selected={tab === "hosted"} aria-pressed={tab === "hosted"} onClick={() => setTab("hosted")}>{t("pvTabHosted")} · {prof.hosted}</button>
                  <button role="tab" aria-selected={tab === "joined"} aria-pressed={tab === "joined"} onClick={() => setTab("joined")}>{t("pvTabJoined")} · {prof.joined}</button>
                </div>
                {items === null ? <div className="empty">{"…"}</div> : !list.length ? <div className="empty">{t("pvNone")}</div> : (
                  <div className="pv-list">
                    {[...upcoming.reverse(), ...past].map(({ pulse: p }) => {
                      const st = status(p);
                      return (
                        <button type="button" key={p.id} className={`pv-item${isOver(p) ? " past" : ""}`} onClick={() => onOpenPulse(p)}>
                          <span className="pv-glyph" style={{ background: isOver(p) ? undefined : CATS[p.category].color }} dangerouslySetInnerHTML={{ __html: catIcon(p.category, 16) }} />
                          <span className="pv-txt">
                            <b>{p.title}</b>
                            <span>{st.k === "live" ? t("gLive") : dayClock(new Date(p.starts_at).getTime())} · {t("around", { a: p.area_name })}{subName(p.sub) ? ` · ${subName(p.sub)}` : ""}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
