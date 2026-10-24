// Sign-in: everyone starts as a guest (anonymous Supabase user, no sign-up).
// "Continue with Google" links Google to that same guest account, so their Pulses,
// joins and posts carry over, and fills the profile with their Google name and photo.
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Category, MyProfile } from "./lib/types";
import { configured, supabase } from "./lib/supabase";
import { DEMO_UID } from "./lib/demo";
import { errText, syncVerified } from "./lib/api";
import { t } from "./lib/i18n";

const SWITCH_FLAG = "pulse.googleSwitch";

export interface Auth {
  ready: boolean;
  uid: string | null;
  isGuest: boolean;
  email: string | null;
  profile: MyProfile | null;
  error: string | null;
  notice: string | null;
  signInWithGoogle: () => Promise<void>;
  /** Popup flow: a Google ID token from Google's own button. */
  signInWithGoogleToken: (token: string, nonce: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (p: { display_name: string; interests: Category[] }) => Promise<void>;
}

const hasGoogle = (u: User) => (u.identities || []).some((i) => i.provider === "google");
const returnUrl = () => location.origin + location.pathname + location.search;

export function useAuth(): Auth {
  const [ready, setReady] = useState(!configured);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(configured ? null : { display_name: "", avatar_url: null, interests: [] });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const applied = useRef<string>("");

  /** Load (and for Google users, create/fill) the profile row. */
  const apply = useCallback(async (u: User) => {
    const key = `${u.id}:${hasGoogle(u)}`;
    if (applied.current === key) return;
    applied.current = key;
    setUser(u);
    const { data } = await supabase.from("profiles").select("display_name,avatar_url,interests").eq("id", u.id).maybeSingle();
    let prof = data as MyProfile | null;
    if (hasGoogle(u)) {
      const m = u.user_metadata || {};
      const gName = String(m.full_name || m.name || "").slice(0, 40) || null;
      const gPic = (m.avatar_url || m.picture || null) as string | null;
      if (!prof || prof.display_name === "Someone" || !prof.avatar_url) {
        const row = { id: u.id, display_name: prof && prof.display_name !== "Someone" ? prof.display_name : gName || "Someone", avatar_url: prof?.avatar_url || gPic };
        const { error } = await supabase.from("profiles").upsert(row);
        if (!error) prof = { interests: [], ...prof, ...row } as MyProfile;
      }
    }
    setProfile(prof ? { display_name: prof.display_name, avatar_url: prof.avatar_url ?? null, interests: prof.interests ?? [] } : null);
    if (hasGoogle(u)) syncVerified().catch(() => {}); // the "verified" badge on their Pulses
  }, []);

  useEffect(() => {
    if (!configured) return;
    let dead = false;

    // Coming back from Google with an error?
    const q = new URLSearchParams(location.hash.slice(1) || location.search);
    const oauthErr = q.get("error_description");
    if (oauthErr) {
      const clean = new URL(location.href); clean.hash = "";
      ["error", "error_code", "error_description"].forEach((k) => clean.searchParams.delete(k));
      history.replaceState(null, "", clean.toString());
      if (/already|exists|linked/i.test(oauthErr) && !sessionStorage.getItem(SWITCH_FLAG)) {
        // This Google account already has a Pulse profile (e.g. from another phone): sign in to it instead.
        sessionStorage.setItem(SWITCH_FLAG, "1");
        supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: returnUrl() } });
        return;
      }
      setError(oauthErr);
    }
    sessionStorage.removeItem(SWITCH_FLAG);

    (async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const r = await supabase.auth.signInAnonymously();
          if (r.error) throw r.error;
          session = r.data.session;
        }
        if (!dead && session) await apply(session.user);
      } catch (e) { if (!dead) setError(errText(e)); }
      finally { if (!dead) setReady(true); }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // supabase-js asks callers not to await other auth calls inside this callback
      if (session?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) setTimeout(() => apply(session.user), 0);
      if (event === "USER_UPDATED" && session?.user && hasGoogle(session.user)) setNotice(t("tGoogleOk"));
    });
    return () => { dead = true; sub.subscription.unsubscribe(); };
  }, [apply]);

  const signInWithGoogle = useCallback(async () => {
    if (!configured) throw new Error(t("pfGoogleOff"));
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u?.is_anonymous) {
      // keep everything the guest already did
      const { error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: returnUrl() } });
      if (!error) return;
      if (!/manual linking/i.test(error.message)) throw error;
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: returnUrl() } });
    if (error) throw error;
  }, []);

  const signInWithGoogleToken = useCallback(async (token: string, nonce: string) => {
    if (!configured) throw new Error(t("pfGoogleOff"));
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u?.is_anonymous) {
      // keep everything the guest already did
      const { error } = await supabase.auth.linkIdentity({ provider: "google", token, nonce });
      if (!error) {
        const { data } = await supabase.auth.refreshSession();
        if (data.user) { applied.current = ""; await apply(data.user); }
        setNotice(t("tGoogleOk"));
        return;
      }
      // this Google account already has a แถว profile (e.g. from another phone): switch to it with the same token
      if (!/already|exists|linked|manual linking/i.test(error.message)) throw error;
    }
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce });
    if (error) throw error;
    if (data.user) { applied.current = ""; await apply(data.user); }
    setNotice(t("tGoogleOk"));
  }, [apply]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    await supabase.auth.signOut();
    applied.current = "";
    setProfile(null);
    const r = await supabase.auth.signInAnonymously(); // back to a fresh guest
    if (r.data.session) await apply(r.data.session.user);
  }, [apply]);

  const saveProfile = useCallback(async (p: { display_name: string; interests: Category[] }) => {
    if (!configured) { setProfile((x) => ({ avatar_url: null, ...x, ...p })); return; }
    if (!user) throw new Error("Not signed in yet");
    const { error } = await supabase.from("profiles").upsert({ id: user.id, display_name: p.display_name, interests: p.interests, avatar_url: profile?.avatar_url ?? null });
    if (error) throw error;
    setProfile({ avatar_url: profile?.avatar_url ?? null, ...p });
  }, [user, profile]);

  return {
    ready,
    uid: configured ? user?.id ?? null : DEMO_UID,
    isGuest: configured ? !user || !hasGoogle(user) : true,
    email: user && hasGoogle(user) ? user.email ?? null : null,
    profile, error, notice, signInWithGoogle, signInWithGoogleToken, signOut, saveProfile,
  };
}
