// "Continue with Google" through Google's own sign-in popup (Google Identity Services).
// Compared with the redirect flow this shows the app (thaew.com / แถว) on Google's screen
// instead of the Supabase address, and never leaves the page, so there is only one account picker.
// Supabase then checks Google's ID token (signInWithIdToken / linkIdentity).

export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  "784830895446-r1sbhgrjm4vro37e3jr4iotjane7otpt.apps.googleusercontent.com"; // public, safe to ship

interface GsiId {
  initialize(o: Record<string, unknown>): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  cancel(): void;
}
declare global { interface Window { google?: { accounts?: { id?: GsiId } } } }

let loading: Promise<GsiId> | null = null;
export function loadGsi(timeoutMs = 6000): Promise<GsiId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GsiId>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    const timer = setTimeout(() => reject(new Error("gsi timeout")), timeoutMs);
    s.onload = () => { clearTimeout(timer); window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("gsi missing")); };
    s.onerror = () => { clearTimeout(timer); reject(new Error("gsi blocked")); };
    document.head.appendChild(s);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function makeNonce() {
  const raw = hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
  const hashed = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  return { raw, hashed };
}

/** In-app browsers (LINE, Facebook, Instagram) are blocked by Google, so they keep the redirect flow. */
export const inAppBrowser = () => /\bLine\/|FBAN|FBAV|Instagram/i.test(navigator.userAgent);

/**
 * Draws Google's button into `el`. `onToken` gets the ID token and the raw nonce Supabase needs.
 * Resolves false if Google's script can't load (offline, blocked), so the caller can show a fallback.
 */
export async function renderGoogleButton(
  el: HTMLElement, lang: "th" | "en", dark: boolean,
  onToken: (token: string, nonce: string) => void,
): Promise<boolean> {
  try {
    const id = await loadGsi();
    const nonce = await makeNonce();
    id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: nonce.hashed,
      ux_mode: "popup",
      use_fedcm_for_button: true,
      itp_support: true,
      callback: (r: { credential?: string }) => { if (r.credential) onToken(r.credential, nonce.raw); },
    });
    el.innerHTML = "";
    id.renderButton(el, {
      type: "standard", theme: dark ? "filled_black" : "outline", size: "large", shape: "pill",
      text: "continue_with", logo_alignment: "left", locale: lang, width: Math.min(360, el.clientWidth || 320),
    });
    return true;
  } catch {
    return false;
  }
}
