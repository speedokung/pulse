import { useState } from "react";
import type { Category } from "../lib/types";
import { CAT_KEYS, CATS } from "../lib/categories";
import { configured } from "../lib/supabase";
import type { Auth } from "../auth";
import { Avatar } from "./ui";

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
export function ProfileSheet({ auth, reason, onClose, toast }: { auth: Auth; reason: string | null; onClose: () => void; toast: (s: string) => void }) {
  const [name, setName] = useState(auth.profile?.display_name && auth.profile.display_name !== "Someone" ? auth.profile.display_name : "");
  const [interests, setInterests] = useState<Category[]>(auth.profile?.interests ?? []);
  const [busy, setBusy] = useState(false);
  const toggle = (k: Category) => setInterests((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));

  const google = async () => {
    try { setBusy(true); await auth.signInWithGoogle(); }
    catch (e) { setBusy(false); toast((e as Error).message || "Couldn't open Google sign-in."); }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { setBusy(true); await auth.saveProfile({ display_name: name.trim(), interests }); toast("Profile saved."); onClose(); }
    catch { toast("Couldn't save your profile. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="mbox profile" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="pf-h">
        <div className="pf-head">
          <Avatar name={name || "You"} url={auth.profile?.avatar_url} size={52} />
          <div>
            <h3 id="pf-h">{reason ? "Quick intro first" : "Your profile"}</h3>
            <div className="sub">{auth.isGuest ? "Guest · no account needed" : `Signed in with Google${auth.email ? ` · ${auth.email}` : ""}`}</div>
          </div>
        </div>
        {reason && <div className="sub">{reason}</div>}

        {auth.isGuest && (
          <div className="pf-google">
            <button type="button" className="gbtn" onClick={google} disabled={busy || !configured}><G />Continue with Google</button>
            <div className="sub">{configured
              ? "Uses your Google name and photo, and keeps your Pulses on every device. Pulse never posts anything to Google."
              : "Google sign-in turns on once the app is connected to Supabase."}</div>
            <div className="or"><span>or just pick a name</span></div>
          </div>
        )}

        <label className="f" htmlFor="pf-name">Name people see
          <input id="pf-name" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nat" autoFocus={auth.isGuest ? undefined : true} />
        </label>
        <div className="f-label">What are you into? <span className="sub">These show first on the map.</span></div>
        <div className="row">
          {CAT_KEYS.map((k) => (
            <button type="button" key={k} className="chip" aria-pressed={interests.includes(k)} onClick={() => toggle(k)}>
              <i style={{ background: CATS[k].color }} />{CATS[k].name}
            </button>
          ))}
        </div>
        <div className="btns">
          {!auth.isGuest && <button type="button" className="ghostbtn" onClick={async () => { await auth.signOut(); toast("Signed out. You're a guest now."); onClose(); }}>Sign out</button>}
          <button type="button" className="ghostbtn" onClick={onClose}>{reason ? "Not now" : "Close"}</button>
          <button type="submit" className="go" disabled={busy || !name.trim()}>{reason ? "Continue" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
