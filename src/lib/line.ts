// LINE: LIFF (the app opened inside LINE), account linking, and sharing to LINE chats.
// Everything here is optional: without VITE_LIFF_ID the app works as before, and sharing uses LINE's share URL.
import type { Pulse } from "./types";
import { finishLineLink } from "./api";
import { CATS } from "./categories";
import { dayClock, inLang } from "./format";
import { status } from "./pulse";

const LIFF_ID = import.meta.env.VITE_LIFF_ID;
export const lineConfigured = !!LIFF_ID;
type Liff = typeof import("@line/liff").default;
let liff: Liff | null = null;

async function load(): Promise<Liff | null> {
  if (!LIFF_ID) return null;
  if (liff) return liff;
  const mod = await import("@line/liff");
  const l = mod.default;
  await Promise.race([l.init({ liffId: LIFF_ID }), new Promise((_, rej) => setTimeout(() => rej(new Error("LIFF timeout")), 5000))]);
  liff = l;
  return l;
}

/** Run before the app renders: inside LINE (or when coming back from LINE login) LIFF must restore the URL first. */
export async function bootLine() {
  if (!LIFF_ID) return;
  const q = new URLSearchParams(location.search);
  const fromLine = /\bLine\//i.test(navigator.userAgent) || q.has("liff.state") || q.has("code") || q.has("link");
  if (!fromLine) return;
  try { await load(); } catch { /* app still works without LIFF */ }
}
export const inLineApp = () => !!liff?.isInClient();

/** Browser side: send the person to LINE with a one-time code tied to their แถว account. */
export const openLineToLink = (code: string) => { location.href = `https://liff.line.me/${LIFF_ID}?link=${encodeURIComponent(code)}`; };

/** LINE side (?link=code): sign in with LINE if needed, then let the server attach this LINE account. */
export async function completeLineLink(code: string): Promise<{ ok: boolean; name?: string | null; error?: string } | "redirecting"> {
  const l = await load();
  if (!l) return { ok: false, error: "LIFF" };
  if (!l.isLoggedIn()) { l.login({ redirectUri: location.href }); return "redirecting"; }
  const idToken = l.getIDToken();
  if (!idToken) return { ok: false, error: "no ID token (turn on the openid scope in the LIFF app)" };
  return finishLineLink(code, idToken);
}
export const closeLine = () => { try { liff?.closeWindow(); } catch { /* not in LINE */ } };

export const lineOpenUrl = (p: Pulse) => (LIFF_ID ? `https://liff.line.me/${LIFF_ID}?p=${p.id}` : `${location.origin}/?p=${p.id}`);

function flexFor(p: Pulse) {
  const st = status(p), c = CATS[p.category];
  const when = st.k === "live" ? "กำลังเล่นอยู่ตอนนี้" : `เริ่ม ${inLang("th", () => dayClock(p.starts_at))}`;
  const where = p.visibility === "all" && p.exact ? p.exact.place_name : `แถว${p.area_name}`;
  const open = p.need - p.memberships.filter((m) => m.status === "accepted").length;
  return {
    type: "flex" as const,
    altText: `${p.title} · ${when}`,
    contents: {
      type: "bubble", size: "kilo",
      header: { type: "box", layout: "vertical", backgroundColor: c.color, paddingAll: "14px",
        contents: [{ type: "text", text: `${c.th} · แถว`, color: "#ffffff", size: "xs", weight: "bold" }] },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: p.title, weight: "bold", size: "lg", wrap: true },
        { type: "text", text: `${when} · ${where}`, size: "sm", color: "#5d6d6b", wrap: true },
        ...(open > 0 ? [{ type: "text", text: `ขาดอีก ${open} คน`, size: "sm", color: "#e8590c", weight: "bold" }] : []),
      ] },
      footer: { type: "box", layout: "vertical", contents: [
        { type: "button", style: "primary", color: "#14211f", height: "sm", action: { type: "uri", label: open > 0 ? "ดูและจอย" : "ดูรายละเอียด", uri: lineOpenUrl(p) } },
      ] },
    },
  };
}

/** Inside LINE: pick friends/groups and send a card. Elsewhere: LINE's share page with the text. */
export async function shareToLine(text: string, p?: Pulse): Promise<boolean> {
  try {
    const l = liff ?? (inLineApp() ? await load() : null);
    if (l && p && l.isApiAvailable("shareTargetPicker")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await l.shareTargetPicker([flexFor(p) as any]);
      return !!r;
    }
  } catch { /* fall through to the share page */ }
  window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return true;
}
