// Facebook Page auto-poster. Same plan as Instagram (public/ig/queue.json), run from the same cron.
//
//   reel     → Page Reel (video_reels: start → upload from thaew.com URL → wait until ready → finish/PUBLISHED)
//   carousel → one Page post with all the slides (photos uploaded unpublished, then attached to a feed post)
//
// Status per post is kept in Supabase ig_posts under the id "fb:<post id>", so no extra tables.
//
// Settings (Cloudflare → Worker → Variables and Secrets):
//   FB_PAGE_ID     text    the Page's id
//   FB_PAGE_TOKEN  secret  Page access token (from a long-lived user token, so it doesn't expire)
//   FB_PAUSED      text    "1" stops Facebook posting (Instagram carries on)

import { db, save, type IgEnv, type PostRow, type QueueItem } from "./instagram";

export interface FbEnv extends IgEnv {
  FB_PAGE_ID?: string;
  FB_PAGE_TOKEN?: string;
  FB_PAUSED?: string;
}

const G = "https://graph.facebook.com/v24.0";
const RUPLOAD = "https://rupload.facebook.com/video-upload/v24.0";
const MIN_GAP_H = 20;
const MAX_ATTEMPTS = 3;
const PREFIX = "fb:";

async function fb(path: string, params: Record<string, string>, token: string, method: "GET" | "POST" = "POST") {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(method === "GET" ? `${G}/${path}?${q}` : `${G}/${path}`, method === "GET" ? {} : { method: "POST", body: q });
  const j = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!r.ok || j.error) throw new Error(`facebook: ${j.error?.message ?? r.status}`);
  return j;
}

/** On Facebook the link in the caption is clickable, so "link in bio" isn't needed. */
const fbCaption = (q: QueueItem) =>
  (q.fb_caption ?? q.caption).replace(/\s*\(ลิงก์ใน bio\)/g, "").replace(/\s*\(link in bio\)/gi, "");

export async function fbTick(env: FbEnv, opts: { dryRun?: boolean } = {}): Promise<string[]> {
  const log: string[] = [];
  if (env.FB_PAUSED === "1") return ["paused"];
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) return ["not set up: FB_PAGE_ID / FB_PAGE_TOKEN missing"];
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return ["not set up: Supabase settings missing"];
  const tok = env.FB_PAGE_TOKEN, page = env.FB_PAGE_ID;
  const base = (env.APP_URL || "https://thaew.com").replace(/\/$/, "");
  const qr = await env.ASSETS.fetch(new Request(`${base}/ig/queue.json`));
  if (!qr.ok) return ["no queue.json"];
  const queue = ((await qr.json()) as { posts: QueueItem[] }).posts;
  const rows = ((await db(env, `ig_posts?select=*&id=like.${encodeURIComponent(PREFIX)}*`)) as PostRow[]);
  const byId = new Map(rows.map((r) => [r.id.slice(PREFIX.length), r]));

  // 1) a Reel that's uploading/processing → publish once Facebook says it's ready
  const busy = rows.find((r) => r.status === "processing");
  if (busy) {
    const item = queue.find((q) => PREFIX + q.id === busy.id);
    const st = (await fb(busy.container_id!, { fields: "status" }, tok, "GET")) as { status?: { video_status?: string; processing_phase?: { error?: { message?: string } } } };
    const vs = st.status?.video_status;
    log.push(`${busy.id}: ${vs}`);
    if (vs === "ready") {
      if (opts.dryRun) return [...log, "dry run: would publish"];
      await fb(`${page}/video_reels`, {
        upload_phase: "finish", video_id: busy.container_id!, video_state: "PUBLISHED",
        description: item ? fbCaption(item) : "", is_ai_generated: "true",
      }, tok);
      await save(env, { id: busy.id, status: "published", media_id: busy.container_id, published_at: new Date().toISOString(), error: null });
      log.push(`${busy.id}: published`);
    } else if (vs === "error" || vs === "expired" || vs === "upload_failed") {
      await save(env, { id: busy.id, status: "error", error: `video ${vs}: ${st.status?.processing_phase?.error?.message ?? ""}`.slice(0, 500), attempts: busy.attempts + 1 });
    } else if (Date.now() - Date.parse(busy.updated_at) > 6 * 3_600_000) {
      await save(env, { id: busy.id, status: "error", error: `stuck at ${vs} for 6h`, attempts: busy.attempts + 1 });
    }
    return log;
  }

  // 2) start the next due post
  const last = rows.filter((r) => r.published_at).map((r) => Date.parse(r.published_at!)).sort((a, b) => b - a)[0] ?? 0;
  if (Date.now() - last < MIN_GAP_H * 3_600_000) return [...log, "waiting: posted recently"];
  const next = queue
    .filter((q) => Date.parse(q.publish_at) <= Date.now())
    .filter((q) => { const r = byId.get(q.id); return !r || (r.status === "error" && r.attempts < MAX_ATTEMPTS); })
    .sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at))[0];
  if (!next) return [...log, "nothing due"];
  const id = PREFIX + next.id;
  if (opts.dryRun) return [...log, `dry run: would start ${id}`];
  const attempts = byId.get(next.id)?.attempts ?? 0;

  try {
    if (next.type === "reel") {
      const start = (await fb(`${page}/video_reels`, { upload_phase: "start" }, tok)) as { video_id: string };
      const up = await fetch(`${RUPLOAD}/${start.video_id}`, {
        method: "POST", headers: { authorization: `OAuth ${tok}`, file_url: `${base}/${next.video}` },
      });
      const uj = (await up.json()) as { success?: boolean; debug_info?: { message?: string } };
      if (!up.ok || !uj.success) throw new Error(`facebook upload: ${uj.debug_info?.message ?? up.status}`);
      await save(env, { id, status: "processing", container_id: start.video_id, attempts, error: null });
      log.push(`${id}: uploading ${start.video_id}`);
    } else {
      const photos: string[] = [];
      for (const img of next.images ?? [])
        photos.push(((await fb(`${page}/photos`, { url: `${base}/${img}`, published: "false" }, tok)) as { id: string }).id);
      const params: Record<string, string> = { message: fbCaption(next) };
      photos.forEach((p, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: p }); });
      const post = (await fb(`${page}/feed`, params, tok)) as { id: string };
      await save(env, { id, status: "published", media_id: post.id, published_at: new Date().toISOString(), attempts, error: null });
      log.push(`${id}: published ${post.id}`);
    }
  } catch (e) {
    await save(env, { id, status: "error", error: (e as Error).message.slice(0, 500), attempts: attempts + 1 });
    log.push(`${id}: ${(e as Error).message}`);
  }
  return log;
}
