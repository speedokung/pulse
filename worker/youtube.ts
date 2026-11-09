// YouTube Shorts auto-uploader: every Reel in public/ig/queue.json also goes to the YouTube channel as a Short.
// Same cron as Instagram; status per post in Supabase ig_posts as "yt:<post id>"; refresh token in ig_state ("yt_refresh").
//
// One-time connect: open https://thaew.com/api/yt/connect?key=<WEBHOOK_SECRET>, sign in with the channel's Google account.
// Settings (Cloudflare → Worker → Variables and Secrets):
//   YT_CLIENT_ID      text    OAuth client id (Web application) with redirect https://thaew.com/api/yt/callback
//   YT_CLIENT_SECRET  secret  its secret
//   YT_PAUSED         text    "1" stops uploads

import { db, save, type IgEnv, type PostRow, type QueueItem } from "./instagram";

export interface YtEnv extends IgEnv { YT_CLIENT_ID?: string; YT_CLIENT_SECRET?: string; YT_PAUSED?: string; WEBHOOK_SECRET?: string }

const PREFIX = "yt:";
const MIN_GAP_H = 20, MAX_ATTEMPTS = 3;
const REDIRECT = "https://thaew.com/api/yt/callback";
const SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

const page = (title: string, body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;max-width:520px;margin:40px auto;padding:0 16px;line-height:1.6"><h2>${title}</h2><p>${body}</p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } });

/** /api/yt/connect?key=… → Google sign-in;  /api/yt/callback → store the refresh token. */
export async function ytAuth(url: URL, env: YtEnv): Promise<Response> {
  if (!env.YT_CLIENT_ID || !env.YT_CLIENT_SECRET) return page("ยังไม่ได้ตั้งค่า", "ใส่ YT_CLIENT_ID และ YT_CLIENT_SECRET ใน Cloudflare ก่อน", 400);
  const cache = caches.default;
  if (url.pathname === "/api/yt/connect") {
    if (!env.WEBHOOK_SECRET || url.searchParams.get("key") !== env.WEBHOOK_SECRET) return page("ลิงก์ไม่ถูกต้อง", "ต้องมี ?key= เป็น WEBHOOK_SECRET", 403);
    const state = crypto.randomUUID();
    await cache.put(new Request(`https://thaew.com/_yt_state/${state}`), new Response("1", { headers: { "cache-control": "max-age=900" } }));
    const q = new URLSearchParams({ client_id: env.YT_CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state });
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, 302);
  }
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code");
  const key = new Request(`https://thaew.com/_yt_state/${state}`);
  if (!code || !(await cache.match(key))) return page("เชื่อมไม่สำเร็จ", "ลิงก์หมดอายุหรือถูกยกเลิก ลองเปิดลิงก์เชื่อมใหม่อีกครั้ง", 400);
  await cache.delete(key);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ code, client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" }) });
  const j = (await r.json()) as { refresh_token?: string; access_token?: string; error_description?: string };
  if (!j.refresh_token) return page("เชื่อมไม่สำเร็จ", `Google ไม่ส่ง refresh token กลับมา (${j.error_description ?? r.status})`, 400);
  await db(env, "ig_state?on_conflict=key", { method: "POST", body: JSON.stringify({ key: "yt_refresh", value: j.refresh_token, updated_at: new Date().toISOString() }) });
  const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${j.access_token}` } }).then((x) => x.json()).catch(() => ({})) as { items?: { snippet: { title: string } }[] };
  return page("เชื่อม YouTube แล้ว ✅", `ช่อง: <b>${ch.items?.[0]?.snippet.title ?? "?"}</b><br>Reel ในคิวจะถูกอัปขึ้นเป็น Shorts อัตโนมัติ ปิดหน้านี้ได้เลย`);
}

async function accessToken(env: YtEnv): Promise<string | null> {
  const rows = (await db(env, "ig_state?key=eq.yt_refresh&select=value")) as { value: string }[];
  if (!rows[0] || !env.YT_CLIENT_ID || !env.YT_CLIENT_SECRET) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ refresh_token: rows[0].value, client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, grant_type: "refresh_token" }) });
  const j = (await r.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!j.access_token) throw new Error(`youtube token: ${j.error_description ?? j.error ?? r.status}`);
  return j.access_token;
}

/** Title ≤ 100 chars from the caption's first line, tagged #Shorts; description = full caption + link. */
function meta(q: QueueItem) {
  const cap = (q.fb_caption ?? q.caption).replace(/\s*\((ลิงก์ใน bio|link in bio)\)/gi, "");
  const first = cap.split("\n").find((l) => l.trim() && !l.trim().startsWith("#"))?.trim() ?? "แถว";
  const title = [...`${first} #Shorts`].length > 100 ? [...first].slice(0, 90).join("") + "… #Shorts" : `${first} #Shorts`;
  return { title: title.replace(/[<>]/g, ""), description: `${cap}\n\nhttps://thaew.com`.slice(0, 4900) };
}

export async function ytTick(env: YtEnv, opts: { dryRun?: boolean } = {}): Promise<string[]> {
  if (env.YT_PAUSED === "1") return ["paused"];
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return ["not set up: Supabase settings missing"];
  const tok = await accessToken(env);
  if (!tok) return ["not set up: connect YouTube first (/api/yt/connect)"];
  const base = (env.APP_URL || "https://thaew.com").replace(/\/$/, "");
  const queue = ((await (await env.ASSETS.fetch(new Request(`${base}/ig/queue.json`))).json()) as { posts: QueueItem[] }).posts;
  const rows = (await db(env, `ig_posts?select=*&id=like.${encodeURIComponent(PREFIX)}*`)) as PostRow[];
  const byId = new Map(rows.map((r) => [r.id.slice(PREFIX.length), r]));
  const last = rows.filter((r) => r.published_at).map((r) => Date.parse(r.published_at!)).sort((a, b) => b - a)[0] ?? 0;
  if (Date.now() - last < MIN_GAP_H * 3_600_000) return ["waiting: posted recently"];
  const next = queue
    .filter((q) => q.type === "reel" && Date.parse(q.publish_at) <= Date.now())
    .filter((q) => { const r = byId.get(q.id); return !r || (r.status === "error" && r.attempts < MAX_ATTEMPTS); })
    .sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at))[0];
  if (!next) return ["nothing due"];
  const id = PREFIX + next.id;
  if (opts.dryRun) return [`dry run: would upload ${id}`];
  const attempts = byId.get(next.id)?.attempts ?? 0;
  try {
    const video = await (await env.ASSETS.fetch(new Request(`${base}/${next.video}`))).arrayBuffer();
    const m = meta(next);
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": "video/mp4", "x-upload-content-length": String(video.byteLength) },
      body: JSON.stringify({
        snippet: { title: m.title, description: m.description, categoryId: "22", defaultLanguage: "th", defaultAudioLanguage: "th", tags: ["แถว", "thaew", "หาเพื่อนเล่น", "Bangkok"] },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
      }),
    });
    const loc = init.headers.get("location");
    if (!init.ok || !loc) throw new Error(`youtube init ${init.status}: ${(await init.text()).slice(0, 300)}`);
    const up = await fetch(loc, { method: "PUT", headers: { "content-type": "video/mp4" }, body: video });
    const j = (await up.json()) as { id?: string; error?: { message?: string } };
    if (!up.ok || !j.id) throw new Error(`youtube upload ${up.status}: ${j.error?.message ?? ""}`);
    await save(env, { id, status: "published", media_id: j.id, published_at: new Date().toISOString(), attempts, error: null });
    return [`${id}: uploaded https://youtube.com/shorts/${j.id}`];
  } catch (e) {
    await save(env, { id, status: "error", error: (e as Error).message.slice(0, 500), attempts: attempts + 1 });
    return [`${id}: ${(e as Error).message}`];
  }
}

export async function ytCheck(env: YtEnv): Promise<Record<string, unknown>> {
  try {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "Supabase settings missing" };
    const tok = await accessToken(env);
    if (!tok) return { ok: false, error: env.YT_CLIENT_ID ? "not connected yet (/api/yt/connect)" : "YT_CLIENT_ID / YT_CLIENT_SECRET missing" };
    const ch = (await (await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${tok}` } })).json()) as { items?: { snippet: { title: string } }[] };
    return { ok: true, channel: ch.items?.[0]?.snippet.title, paused: env.YT_PAUSED === "1" };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
