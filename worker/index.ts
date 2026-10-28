// Cloudflare Worker in front of the app (static files are served from ./dist).
//
//   GET  /api/resolve-map?url=…   turns a Google Maps short link (maps.app.goo.gl) into coordinates
//   POST /api/line/link           links a LINE account to a แถว account (from inside LINE / LIFF)
//   POST /api/notify              Supabase Database Webhook on new Pulses → LINE messages to people nearby
//   GET  /?p=<id>                 the app, with link-preview tags for that Pulse (LINE, Facebook, etc.)
//
// Settings (Cloudflare → Worker → Settings → Variables and Secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY                 plain text
//   SUPABASE_SERVICE_ROLE_KEY                       secret
//   LINE_LOGIN_CHANNEL_ID                           plain text (LINE Login channel that owns the LIFF app)
//   LINE_MESSAGING_TOKEN                            secret (Messaging API channel access token of your LINE OA)
//   WEBHOOK_SECRET                                  secret (any long random string; also set on the Supabase webhook)
//   APP_URL                                         plain text, e.g. https://thaew.com
//   LIFF_ID                                         plain text (optional, makes LINE messages open inside LINE)

import { igTick } from "./instagram";
import { fbTick, fbCheck } from "./facebook";
import { igCheck } from "./instagram";

export interface Env {
  IG_USER_ID?: string;
  IG_ACCESS_TOKEN?: string;
  IG_PAUSED?: string;
  FB_PAGE_ID?: string;
  FB_PAGE_TOKEN?: string;
  FB_PAUSED?: string;
  ASSETS: Fetcher;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  LINE_LOGIN_CHANNEL_ID?: string;
  LINE_MESSAGING_TOKEN?: string;
  WEBHOOK_SECRET?: string;
  APP_URL?: string;
  LIFF_ID?: string;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });

export default {
  // Instagram + Facebook Page auto-posters (wrangler.jsonc → triggers.crons)
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(igTick(env).then((l) => console.log("ig:", l.join(" | "))).catch((e) => console.log("ig error:", (e as Error).message)));
    ctx.waitUntil(fbTick(env).then((l) => console.log("fb:", l.join(" | "))).catch((e) => console.log("fb error:", (e as Error).message)));
  },
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.hostname.startsWith("www.")) { url.hostname = url.hostname.slice(4); return Response.redirect(url.toString(), 301); }
    try {
      if (url.pathname === "/api/resolve-map") return await resolveMap(url);
      if (url.pathname === "/api/line/link" && req.method === "POST") return await lineLink(req, env);
      if (url.pathname === "/api/line/member" && req.method === "POST") return await memberNotify(req, env, ctx);
      if (url.pathname === "/api/notify" && req.method === "POST") return await notify(req, env, ctx);
      // run the Instagram poster by hand (same secret as the Supabase webhook); ?dry=1 only says what it would do
      if (url.pathname === "/api/ig/tick" && req.method === "POST") {
        if (!env.WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== env.WEBHOOK_SECRET) return json({ error: "forbidden" }, 403);
        const dryRun = url.searchParams.get("dry") === "1";
        const run = (f: () => Promise<string[]>) => f().catch((e) => [`error: ${(e as Error).message}`]);
        return json({ log: await run(() => igTick(env, { dryRun })), fb: await run(() => fbTick(env, { dryRun })) });
      }
      // is posting set up? (public names only; cached 10 min so it can't be used to burn API calls)
      if (url.pathname === "/api/social/status") {
        const cache = caches.default, key = new Request(`${url.origin}/api/social/status`);
        const hit = await cache.match(key);
        if (hit && !url.searchParams.has("fresh")) return hit;
        const res = json({ instagram: await igCheck(env), facebook: await fbCheck(env), checked_at: new Date().toISOString() }, 200, { "cache-control": "public, max-age=600" });
        ctx.waitUntil(cache.put(key, res.clone()));
        return res;
      }
      if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
      if (url.pathname === "/") return await withPreview(req, env, url.searchParams.get("p"));
    } catch (e) {
      return json({ error: (e as Error).message || "error" }, 500);
    }
    return env.ASSETS.fetch(req);
  },
};

/* ---------------- Google Maps short links ---------------- */

const MAP_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+)$/i;
// Only these hosts are followed. A full google.com/maps address already holds what we need, and
// fetching it from Cloudflare gets Google's bot check ("/sorry") instead of the page.
const SHORT_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/i;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
/** Google's bot check wraps the real address in ?continue=… */
function unwrap(u: string): string {
  try {
    const x = new URL(u);
    if (/\/sorry\//.test(x.pathname) && x.searchParams.get("continue")) return x.searchParams.get("continue")!;
  } catch { /* keep */ }
  return u;
}
function coordsFrom(s: string): { lat: number; lng: number } | null {
  const t = safeDecode(s);
  const m = t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/)
    || t.match(/\/maps\/(?:search|place|dir\/[^/]*)\/(-?\d{1,2}\.\d+),\s*\+?(-?\d{1,3}\.\d+)/)
    || t.match(/[?&](?:q|query|ll|destination|center|daddr)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
    || t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
const plusDecode = (s: string) => safeDecode(s.replace(/\+/g, " ")).trim();
function nameFrom(s: string): string | null {
  let u: URL; try { u = new URL(s); } catch { return null; }
  if (!/google\./i.test(u.hostname) || !(u.pathname.startsWith("/maps") || /^maps\./i.test(u.hostname))) return null;
  const seg = u.pathname.match(/\/(?:place|search)\/([^/@]+)/)?.[1];
  let n = seg ? plusDecode(seg) : (u.searchParams.get("q") || u.searchParams.get("query") || "").trim();
  if (!n || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(n)) return null;
  // first part is the place; the rest is the address ("Lumphini Park, Pathum Wan, Bangkok 10330")
  return n.length > 40 && n.includes(",") ? n.split(",")[0].trim() : n;
}

/** Google's feature id ("0x30e2…:0x2ea1…"), found in links shared from the phone app, which carry no coordinates. */
function ftidFrom(s: string): string | null {
  const t = safeDecode(s);
  const m = t.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || t.match(/[?&]ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (m) return m[1].toLowerCase();
  const cid = t.match(/[?&]cid=(\d{5,20})/)?.[1];
  return cid ? `0x0:0x${BigInt(cid).toString(16)}` : null;
}
/** Asks Google Maps' own place-data endpoint where that feature is. */
async function coordsForFtid(ftid: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const pb = encodeURIComponent(`!1m2!1s${ftid}!3m0`);
    const r = await fetch(`https://www.google.com/maps/preview/place?hl=th&pb=${pb}`, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", "accept-language": "th,en" },
      redirect: "manual",
    });
    if (!r.ok) return null;
    const m = (await r.text()).match(/\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/);
    return m ? { lat: +m[1], lng: +m[2] } : null;
  } catch { return null; }
}

async function resolveMap(url: URL): Promise<Response> {
  const raw = url.searchParams.get("url") || "";
  let target: URL;
  try { target = new URL(raw); } catch { return json({ error: "bad url" }, 400); }
  if (!MAP_HOSTS.test(target.hostname)) return json({ error: "not a Google Maps link" }, 400);

  // follow short-link redirects ourselves (browsers can't, because of CORS), stopping at the full address
  let current = target.toString();
  for (let i = 0; i < 6; i++) {
    const host = new URL(current).hostname;
    if (!SHORT_HOSTS.test(host)) break;
    const r = await fetch(current, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (thaew link preview)" } });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { current = unwrap(new URL(loc, current).toString()); continue; }
    break;
  }
  current = unwrap(current);
  // Only trust coordinates written in the address. Without them the app searches the place name instead.
  let ll = coordsFrom(current);
  const name = nameFrom(current);
  if (!ll) { const f = ftidFrom(current); if (f) ll = await coordsForFtid(f); }
  const ok = ll || name;
  return json({ url: current, ...(ll ?? {}), name }, 200, { "cache-control": ok ? "public, max-age=86400" : "no-store" });
}

/* ---------------- Supabase helpers (server side) ---------------- */

async function sb(env: Env, path: string, init: RequestInit = {}, service = true) {
  if (!env.SUPABASE_URL) throw new Error("SUPABASE_URL not set");
  const key = service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  if (!key) throw new Error(service ? "SUPABASE_SERVICE_ROLE_KEY not set" : "SUPABASE_ANON_KEY not set");
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/* ---------------- LINE account linking ---------------- */

async function lineLink(req: Request, env: Env): Promise<Response> {
  const { code, idToken } = (await req.json()) as { code?: string; idToken?: string };
  if (!code || !idToken) return json({ error: "missing code or idToken" }, 400);
  if (!env.LINE_LOGIN_CHANNEL_ID) return json({ error: "LINE_LOGIN_CHANNEL_ID not set" }, 500);

  // verify the LINE ID token with LINE
  const v = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: env.LINE_LOGIN_CHANNEL_ID }),
  });
  if (!v.ok) return json({ error: "LINE sign-in could not be verified" }, 401);
  const line = (await v.json()) as { sub: string; name?: string; picture?: string };

  const rows = (await sb(env, `line_link_codes?code=eq.${encodeURIComponent(code)}&expires_at=gt.${new Date().toISOString()}&select=user_id`)) as { user_id: string }[];
  if (!rows.length) return json({ error: "This link has expired. Start again from แถว." }, 410);
  const userId = rows[0].user_id;

  await sb(env, "line_links?on_conflict=user_id", {
    method: "POST", headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, line_user_id: line.sub, line_name: line.name ?? null }),
  });
  await sb(env, `line_link_codes?code=eq.${encodeURIComponent(code)}`, { method: "DELETE" });

  // fill in the profile from LINE where it's still empty, and mark it verified
  const prof = (await sb(env, `profiles?id=eq.${userId}&select=display_name,avatar_url,verified`)) as { display_name: string; avatar_url: string | null; verified: string | null }[];
  const patch: Record<string, string> = {};
  if (!prof[0] || prof[0].display_name === "Someone") patch.display_name = (line.name || "Someone").slice(0, 40);
  if (!prof[0]?.avatar_url && line.picture) patch.avatar_url = line.picture;
  if (!prof[0]?.verified) patch.verified = "line";
  if (Object.keys(patch).length) await sb(env, `profiles?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify(patch) });

  return json({ ok: true, name: line.name ?? null });
}

/* ---------------- notifications ---------------- */

interface PulseRow { cover_path?: string | null; id: string; host_id: string; category: string; title: string; need: number; starts_at: string; ends_at: string; area_name: string; rough_lat: number; rough_lng: number; level?: string }
const CAT_TH: Record<string, string> = { sport: "กีฬา", music: "ดนตรี", games: "บอร์ดเกม", outdoor: "กลางแจ้ง", make: "งานศิลป์" };
const CAT_COLOR: Record<string, string> = { sport: "#e8590c", music: "#c2255c", games: "#6741d9", outdoor: "#2b8a3e", make: "#0b7285" };

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const s = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const bkkTime = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

function openUrl(env: Env, id: string) {
  return env.LIFF_ID ? `https://liff.line.me/${env.LIFF_ID}?p=${id}` : `${env.APP_URL}/?p=${id}`;
}

function flex(env: Env, p: PulseRow, distM: number) {
  const startsSoon = new Date(p.starts_at).getTime() <= Date.now() + 5 * 60_000;
  const when = startsSoon ? "เริ่มแล้ว" : `เริ่ม ${bkkTime(p.starts_at)} น.`;
  const dist = distM < 1000 ? `${Math.round(distM / 10) * 10} ม.` : `${(distM / 1000).toFixed(1)} กม.`;
  return {
    type: "flex",
    altText: `${p.title} · แถว${p.area_name} · ${when}`,
    contents: {
      type: "bubble", size: "kilo",
      header: { type: "box", layout: "vertical", backgroundColor: CAT_COLOR[p.category] ?? "#ff5a36", paddingAll: "14px",
        contents: [{ type: "text", text: `${CAT_TH[p.category] ?? ""} · ห่าง ${dist}`, color: "#ffffff", size: "xs", weight: "bold" }] },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: p.title, weight: "bold", size: "lg", wrap: true },
        { type: "text", text: `${when} · แถว${p.area_name}`, size: "sm", color: "#5d6d6b", wrap: true },
        { type: "text", text: `ขาดอีก ${p.need} คน`, size: "sm", color: "#e8590c", weight: "bold" },
      ] },
      footer: { type: "box", layout: "vertical", contents: [
        { type: "button", style: "primary", color: "#14211f", height: "sm", action: { type: "uri", label: "ดูและจอย", uri: openUrl(env, p.id) } },
      ] },
    },
  };
}

async function notify(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== env.WEBHOOK_SECRET) return json({ error: "forbidden" }, 403);
  if (!env.LINE_MESSAGING_TOKEN) return json({ skipped: "LINE_MESSAGING_TOKEN not set" });
  const body = (await req.json()) as { type?: string; record?: PulseRow };
  const p = body.record;
  if (body.type !== "INSERT" || !p) return json({ skipped: "not an insert" });
  // only Pulses starting within the next 6 hours (a weekly series doesn't ping 8 times)
  if (new Date(p.starts_at).getTime() > Date.now() + 6 * 3_600_000) return json({ skipped: "starts later" });

  ctx.waitUntil((async () => {
    const prefs = (await sb(env, "notify_prefs?enabled=is.true&select=user_id,categories,lat,lng,radius_m,last_sent")) as
      { user_id: string; categories: string[]; lat: number; lng: number; radius_m: number; last_sent: string | null }[];
    const now = Date.now();
    const pick = prefs.filter((x) =>
      x.user_id !== p.host_id &&
      (!x.categories.length || x.categories.includes(p.category)) &&
      (!x.last_sent || now - new Date(x.last_sent).getTime() > 30 * 60_000) &&   // at most one message per 30 min
      haversine(x, { lat: p.rough_lat, lng: p.rough_lng }) <= x.radius_m);
    if (!pick.length) return;
    const ids = pick.map((x) => x.user_id);
    const links = (await sb(env, `line_links?user_id=in.(${ids.join(",")})&select=user_id,line_user_id`)) as { user_id: string; line_user_id: string }[];
    if (!links.length) return;
    const byUser = new Map(pick.map((x) => [x.user_id, x]));
    // one multicast per ~distance bucket would be nicer; one message for everyone keeps the quota low
    const d = haversine(byUser.get(links[0].user_id)!, { lat: p.rough_lat, lng: p.rough_lng });
    for (let i = 0; i < links.length; i += 500) {
      const chunk = links.slice(i, i + 500);
      await fetch("https://api.line.me/v2/bot/message/multicast", {
        method: "POST",
        headers: { authorization: `Bearer ${env.LINE_MESSAGING_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ to: chunk.map((l) => l.line_user_id), messages: [flex(env, p, d)] }),
      });
    }
    await sb(env, `notify_prefs?user_id=in.(${links.map((l) => l.user_id).join(",")})`, {
      method: "PATCH", body: JSON.stringify({ last_sent: new Date().toISOString() }),
    });
  })());
  return json({ ok: true });
}

/* ---------------- LINE ping for joins / accepted requests ----------------
   The app calls this right after join_pulse / respond_request succeeds, with the user's own Supabase token.
   Nothing is trusted from the body except ids: the membership is re-read with the service key.
     {pulse_id, event:"join"}                 → the host hears "X joined" / "X asks to join"
     {pulse_id, event:"accept", user_id}      → (caller must be the host) the requester hears "you're in"   */

async function memberNotify(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.LINE_MESSAGING_TOKEN) return json({ skipped: "LINE_MESSAGING_TOKEN not set" });
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: "unauthorized" }, 401);
  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${jwt}` } });
  if (!who.ok) return json({ error: "unauthorized" }, 401);
  const caller = ((await who.json()) as { id: string }).id;
  const { pulse_id, event, user_id } = (await req.json()) as { pulse_id?: string; event?: string; user_id?: string };
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!pulse_id || !uuid.test(pulse_id) || (event !== "join" && event !== "accept") || (user_id && !uuid.test(user_id))) return json({ error: "bad request" }, 400);

  const member = event === "join" ? caller : user_id;
  if (!member) return json({ error: "bad request" }, 400);
  // one ping per (pulse, member, event) per day, so re-clicks don't spam
  const cache = caches.default, key = new Request(`https://thaew.com/_ping/${pulse_id}/${member}/${event}`);
  if (await cache.match(key)) return json({ skipped: "already sent" });

  const [p] = (await sb(env, `pulses?id=eq.${pulse_id}&select=id,host_id,title,starts_at,need`)) as PulseRow[];
  if (!p) return json({ error: "not found" }, 404);
  const [m] = (await sb(env, `memberships?pulse_id=eq.${pulse_id}&user_id=eq.${member}&select=status,created_at`)) as { status: string; created_at: string }[];
  if (!m) return json({ skipped: "no membership" });
  let to: string, text: string;
  if (event === "join") {
    if (caller === p.host_id) return json({ skipped: "host" });
    if (Date.now() - Date.parse(m.created_at) > 15 * 60_000) return json({ skipped: "old" });
    to = p.host_id;
    const [prof] = (await sb(env, `profiles?id=eq.${caller}&select=display_name`)) as { display_name: string | null }[];
    const name = prof?.display_name || "มีคน";
    text = m.status === "accepted" ? `🙌 ${name} จอย “${p.title}” แล้ว` : `🙋 ${name} ขอจอย “${p.title}” · เข้าไปกดรับได้เลย`;
  } else {
    if (caller !== p.host_id || m.status !== "accepted") return json({ skipped: "not allowed" });
    to = member;
    text = `✅ รับคุณเข้าก๊วน “${p.title}” แล้ว · เริ่ม ${bkkTime(p.starts_at)} น. ดูจุดนัดในแถวได้เลย`;
  }
  const [link] = (await sb(env, `line_links?user_id=eq.${to}&select=line_user_id`)) as { line_user_id: string }[];
  if (!link) return json({ skipped: "not linked to LINE" });
  ctx.waitUntil(cache.put(key, new Response("1", { headers: { "cache-control": "max-age=86400" } })));
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { authorization: `Bearer ${env.LINE_MESSAGING_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ to: link.line_user_id, messages: [{
      type: "template", altText: text,
      template: { type: "buttons", text: text.slice(0, 160), actions: [{ type: "uri", label: "เปิดก๊วน", uri: openUrl(env, p.id) }] },
    }] }),
  });
  return json(r.ok ? { ok: true } : { error: `line ${r.status}` }, r.ok ? 200 : 502);
}

/* ---------------- link previews for shared Pulses ---------------- */

async function withPreview(req: Request, env: Env, id: string | null): Promise<Response> {
  const res = await env.ASSETS.fetch(req);
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  // link previews need an absolute image address
  const origin = new URL(req.url).origin;
  const page = new HTMLRewriter().on('meta[property="og:image"]', { element(e) { e.setAttribute("content", `${origin}/og.png`); } }).transform(res);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return page;
  let p: PulseRow | undefined;
  try {
    p = ((await sb(env, `pulses?id=eq.${id}&select=id,title,area_name,starts_at,ends_at,category,need,cover_path`, {}, false)) as PulseRow[])[0];
  } catch { return page; }
  if (!p) return page;
  const ended = new Date(p.ends_at).getTime() < Date.now();
  const title = `${p.title} · แถว${p.area_name}`;
  const desc = ended ? `ก๊วน${CAT_TH[p.category] ?? ""}ที่จบไปแล้ว ดูว่าตอนนี้แถวนี้มีอะไรอีก`
    : `${new Date(p.starts_at).getTime() <= Date.now() ? "กำลังเล่นอยู่ตอนนี้" : `เริ่ม ${bkkTime(p.starts_at)} น.`} · ขาดอีก ${p.need} คน · กดเพื่อจอย`;
  const set = (attr: string) => ({ element(e: Element) { e.setAttribute("content", attr); } });
  return new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(`${title} · แถว`); } })
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:image"]', p.cover_path ? set(`${env.SUPABASE_URL}/storage/v1/object/public/feed-photos/${p.cover_path.split("/").map(encodeURIComponent).join("/")}`) : { element() {} })
    .transform(page);
}
