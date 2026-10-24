import { useEffect, useRef, useState } from "react";
import { inAppBrowser, renderGoogleButton } from "../lib/google";
import { getLang } from "../lib/i18n";
import { prefersDark } from "../lib/mapStyle";
import type { LatLng } from "../lib/types";
import { loadFollowRequests, loadNotifyPrefs, myLineLink, respondFollow, saveNotifyPrefs, startLineLink } from "../lib/api";
import type { FollowRequest } from "../lib/types";
import { completeLineLink, inLineApp, lineConfigured, openLineToLink } from "../lib/line";
import type { Category } from "../lib/types";
import { CAT_KEYS, CATS, catName } from "../lib/categories";
import { configured } from "../lib/supabase";
import type { Auth } from "../auth";
import { Avatar } from "./ui";
import { t } from "../lib/i18n";

const G = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/**
 * Profile + sign-in. `reason` is set when someone tries to join/post/drop without a name yet.
 */
export function ProfileSheet({ auth, me, reason, onClose, toast, onViewMine }: { auth: Auth; me: LatLng; reason: string | null; onClose: () => void; toast: (s: string) => void; onViewMine?: () => void }) {
  const [bio, setBio] = useState(auth.profile?.bio ?? "");
  const [reqs, setReqs] = useState<FollowRequest[]>([]);
  const uid = auth.uid;
  useEffect(() => { if (uid && !reason) loadFollowRequests(uid).then(setReqs).catch(() => {}); }, [uid, reason]);
  const answer = async (f: string, ok: boolean) => {
    try { await respondFollow(f, ok); setReqs((l) => l.filter((r) => r.follower !== f)); toast(ok ? t("tAccepted") : t("tDeclined")); }
    catch (e) { toast((e as Error).message); }
  };
  const togglePrivate = async (priv: boolean) => {
    try { await auth.setPublic(!priv); if (!priv) setReqs([]); } catch (e) { toast((e as Error).message); }
  };
  const [name, setName] = useState(auth.profile?.display_name && auth.profile.display_name !== "Someone" ? auth.profile.display_name : "");
  const [interests, setInterests] = useState<Category[]>(auth.profile?.interests ?? []);
  const [busy, setBusy] = useState(false);
  const toggle = (k: Category) => setInterests((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));

  const google = async () => {
    try { setBusy(true); await auth.signInWithGoogle(); }
    catch (e) { setBusy(false); toast((e as Error).message || t("pfGoogleFail")); }
  };
  // Google's own button (popup) when it loads; the redirect button otherwise (LINE's browser, script blocked)
  const gBox = useRef<HTMLDivElement>(null);
  const [gsi, setGsi] = useState<"loading" | "ok" | "fallback">(configured && auth.isGuest && !inAppBrowser() ? "loading" : "fallback");
  useEffect(() => {
    if (gsi !== "loading" || !gBox.current) return;
    let dead = false;
    renderGoogleButton(gBox.current, getLang(), prefersDark(), async (token, nonce) => {
      try { setBusy(true); await auth.signInWithGoogleToken(token, nonce); onClose(); }
      catch (e) { toast((e as Error).message || t("pfGoogleFail")); }
      finally { setBusy(false); }
    }).then((ok) => { if (!dead) setGsi(ok ? "ok" : "fallback"); });
    return () => { dead = true; };
  }, [gsi]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { setBusy(true); await auth.saveProfile({ display_name: name.trim(), interests, bio }); toast(t("pfSaved")); onClose(); }
    catch { toast(t("pfSaveFail")); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="mbox profile" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="pf-h">
        <div className="pf-head">
          <Avatar name={name || t("you")} url={auth.profile?.avatar_url} size={52} />
          <div>
            <h3 id="pf-h">{reason ? t("pfIntro") : t("pfTitle")}</h3>
            <div className="sub">{auth.isGuest ? t("pfGuest") : `${t("pfGoogle")}${auth.email ? ` · ${auth.email}` : ""}`}</div>
          </div>
        </div>
        {reason && <div className="sub">{reason}</div>}

        {auth.isGuest && (
          <div className="pf-google">
            {gsi !== "fallback" && <div ref={gBox} className="gsi" aria-busy={gsi === "loading" || busy} />}
            {gsi === "fallback" && <button type="button" className="gbtn" onClick={google} disabled={busy || !configured}><G />{t("pfContinueG")}</button>}
            <div className="sub">{configured
              ? t("pfGoogleWhy")
              : t("pfGoogleOff")}</div>
            <div className="or"><span>{t("pfOr")}</span></div>
          </div>
        )}

        <label className="f" htmlFor="pf-name">{t("pfName")}
          <input id="pf-name" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pfNamePh")} autoFocus={auth.isGuest ? undefined : true} />
        </label>
        <div className="f-label">{t("pfInto")} <span className="sub">{t("pfIntoSub")}</span></div>
        <div className="row">
          {CAT_KEYS.map((k) => (
            <button type="button" key={k} className="chip" aria-pressed={interests.includes(k)} onClick={() => toggle(k)}>
              <i style={{ background: CATS[k].color }} />{catName(k)}
            </button>
          ))}
        </div>
        {!reason && (
          <>
            <label className="f" htmlFor="pf-bio">{t("pfBio")}
              <textarea id="pf-bio" maxLength={160} rows={2} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("pfBioPh")} />
            </label>
            <label className="switchrow" htmlFor="pf-private">
              <span><b>{t("pfPrivate")}</b><small>{t("pfPrivateSub")}</small></span>
              <input id="pf-private" type="checkbox" role="switch" checked={auth.profile?.is_public === false} onChange={(e) => togglePrivate(e.target.checked)} />
            </label>
            {reqs.length > 0 && (
              <div className="reqs"><div className="meta">{t("pfRequests")} · {reqs.length}</div>
                {reqs.map((r) => (
                  <div className="req" key={r.follower}>
                    <Avatar name={r.profile?.display_name} url={r.profile?.avatar_url} />
                    <span>{r.profile?.display_name || t("someone")}</span>
                    <button type="button" className="mini pri" onClick={() => answer(r.follower, true)}>{t("accept")}</button>
                    <button type="button" className="mini" onClick={() => answer(r.follower, false)}>{t("decline")}</button>
                  </div>
                ))}
              </div>
            )}
            {onViewMine && <button type="button" className="mini pv-mine" onClick={onViewMine}>{t("pvMine")}</button>}
            <LineSection auth={auth} me={me} interests={interests} toast={toast} />
          </>
        )}
        <div className="btns">
          {!auth.isGuest && <button type="button" className="ghostbtn" onClick={async () => { await auth.signOut(); toast(t("pfSignedOut")); onClose(); }}>{t("pfSignOut")}</button>}
          <button type="button" className="ghostbtn" onClick={onClose}>{reason ? t("pfNotNow") : t("close")}</button>
          <button type="submit" className="go" disabled={busy || !name.trim()}>{reason ? t("pfContinue") : t("pfSave")}</button>
        </div>
        <div className="legal"><a href="/privacy" target="_blank" rel="noopener">{t("privacy")}</a> · <a href="/terms" target="_blank" rel="noopener">{t("terms")}</a></div>
      </form>
    </div>
  );
}

const RADIUS_OPTS = [1000, 2000, 5000];
function LineSection({ auth, me, interests, toast }: { auth: Auth; me: LatLng; interests: Category[]; toast: (s: string) => void }) {
  const [linked, setLinked] = useState<{ line_name: string | null } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!configured || !auth.uid) return;
    myLineLink(auth.uid).then(setLinked);
    loadNotifyPrefs(auth.uid).then((p) => { if (p) { setEnabled(p.enabled); setRadius(p.radius_m); } });
  }, [auth.uid]);

  const link = async () => {
    try {
      setBusy(true);
      const code = await startLineLink();
      if (inLineApp()) {
        const r = await completeLineLink(code);
        if (r !== "redirecting") { if (r.ok) { toast(t("lineDone")); setLinked({ line_name: r.name ?? null }); } else toast(t("lineFail", { e: r.error ?? "" })); }
      } else { toast(t("lineOpening")); openLineToLink(code); }
    } catch (e) { toast(t("lineFail", { e: (e as Error).message })); }
    finally { setBusy(false); }
  };
  const save = async (on: boolean, r = radius) => {
    if (!auth.uid) return;
    setEnabled(on); setRadius(r);
    try { await saveNotifyPrefs(auth.uid, { enabled: on, categories: interests, lat: me.lat, lng: me.lng, radius_m: r }); toast(t("notifySaved")); }
    catch { toast(t("pfSaveFail")); }
  };

  return (
    <div className="linesec">
      <div className="f-label">{t("notifyTitle")}</div>
      {!configured || !lineConfigured ? <div className="sub">{t("lineOff")}</div> : (
        <>
          {linked
            ? <div className="sub"><span className="lineok">LINE</span> {t("lineLinked", { n: linked.line_name ? ` · ${linked.line_name}` : "" })}</div>
            : <><div className="sub">{t("lineWhy")}</div><button type="button" className="mini line" disabled={busy} onClick={link}>{t("lineLink")}</button></>}
          <label className="toggle" htmlFor="nt-on">
            <input id="nt-on" type="checkbox" checked={enabled} disabled={!linked} onChange={(e) => save(e.target.checked)} />
            <span>{linked ? t("notifyOn") : t("notifyNeedLine")}</span>
          </label>
          {linked && enabled && (
            <div className="row" role="group" aria-label={t("notifyRadius")}>
              <span className="f-label">{t("notifyRadius")}</span>
              {RADIUS_OPTS.map((m) => <button type="button" key={m} className="chip" aria-pressed={radius === m} onClick={() => save(true, m)}>{m / 1000} {t("km")}</button>)}
            </div>
          )}
          {linked && <div className="sub">{t("notifyCats")}</div>}
        </>
      )}
    </div>
  );
}
