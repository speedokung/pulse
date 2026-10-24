// Instagram auto-poster. Runs from the Worker's cron (wrangler.jsonc → triggers.crons).
//
// The plan lives in public/ig/queue.json (made by marketing/reels); media is served from thaew.com/ig/….
// Each run does at most one step, so nothing piles up:
//   1. a post that's processing at Instagram → check it, publish when ready
//   2. otherwise, if the last post was > MIN_GAP_H ago, start the earliest due post
// What happened to each post is kept in Supabase (ig_posts); the token is refreshed every week (ig_state).
//
// Settings (Cloudflare → Worker → Variables and Secrets):
//   IG_USER_ID       text    the Instagram professional account's user id
//   IG_ACCESS_TOKEN  secret  long-lived Instagram user token (only used until the first refresh is stored)
//   IG_PAUSED        text    "1" stops posting

export interface IgEnv {
  ASSETS: Fetcher;
  APP_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  IG_USER_ID?: string;
  IG_ACCESS_TOKEN?: string;
  IG_PAUSED?: string;
}

export interface QueueItem {
  id: string; type: "reel" | "carousel"; publish_at: string; caption: string;
  video?: string; cover?: string; images?: string[]; fb_caption?: string;
}
export interface PostRow { id: string; status: "processing" | "published" | "error"; container_id: string | null; media_id: string | null; attempts: number; error: string | null; published_at: string | null; updated_at: string }

const G = "https://graph.instagram.com/v22.0";
const MIN_GAP_H = 20;          // never two posts within 20 hours, even if the plan fell behind
const MAX_ATTEMPTS = 3;

export async function db(env: IgEnv, path: string, init: RequestInit = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 || r.status === 201 ? null : r.json();
}
export const save = (env: IgEnv, row: Partial<PostRow> & { id: string }) =>
  db(env, "ig_posts?on_conflict=id", { method: "POST", body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) });

async function ig(path: string, params: Record<string, string>, token: string, method: "GET" | "POST" = "POST") {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(method === "GET" ? `${G}/${path}?${q}` : `${G}/${path}`, method === "GET" ? {} : { method: "POST", body: q });
  const j = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!r.ok || j.error) throw new Error(`instagram: ${j.error?.message ?? r.status}`);
  return j;
}

/** The current token: the stored (refreshed) one, refreshed again when it's a week old. */
async function token(env: IgEnv, log: string[]): Promise<string | null> {
  const rows = (await db(env, "ig_state?key=eq.token&select=value,updated_at")) as { value: string; updated_at: string }[];
  let tok = rows[0]?.value || env.IG_ACCESS_TOKEN || null;
  const age = rows[0] ? Date.now() - Date.parse(rows[0].updated_at) : Infinity;
  if (tok && age > 7 * 86_400_000) {
    try {
      const j = await ig("refresh_access_token", { grant_type: "ig_refresh_token" }, tok, "GET").catch(async () =>
        (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${tok}`)).json());
      if ((j as { access_token?: string }).access_token) {
        tok = (j as { access_token: string }).access_token;
        await db(env, "ig_state?on_conflict=key", { method: "POST", body: JSON.stringify({ key: "token", value: tok, updated_at: new Date().toISOString() }) });
        log.push("token refreshed");
      }
    } catch (e) { log.push(`token refresh failed: ${(e as Error).message}`); }
  }
  return tok;
}

export async function igTick(env: IgEnv, opts: { dryRun?: boolean } = {}): Promise<string[]> {
  const log: string[] = [];
  if (env.IG_PAUSED === "1") return ["paused"];
  if (!env.IG_USER_ID || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return ["not set up: IG_USER_ID / Supabase settings missing"];
  const base = (env.APP_URL || "https://thaew.com").replace(/\/$/, "");
  const qr = await env.ASSETS.fetch(new Request(`${base}/ig/queue.json`));
  if (!qr.ok) return ["no queue.json"];
  const queue = ((await qr.json()) as { posts: QueueItem[] }).posts;
  const rows = ((await db(env, "ig_posts?select=*")) as PostRow[]).filter((r) => !r.id.startsWith("fb:")); // fb: rows belong to facebook.ts
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tok = await token(env, log);
  if (!tok) return [...log, "no token"];

  // 1) finish what's processing
  const busy = rows.find((r) => r.status === "processing");
  if (busy) {
    const st = (await ig(busy.container_id!, { fields: "status_code" }, tok, "GET")) as { status_code?: string };
    log.push(`${busy.id}: ${st.status_code}`);
    if (st.status_code === "FINISHED") {
      if (opts.dryRun) return [...log, "dry run: would publish"];
      const pub = (await ig(`${env.IG_USER_ID}/media_publish`, { creation_id: busy.container_id! }, tok)) as { id: string };
      await save(env, { id: busy.id, status: "published", media_id: pub.id, published_at: new Date().toISOString(), error: null });
      log.push(`${busy.id}: published ${pub.id}`);
    } else if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
      await save(env, { id: busy.id, status: "error", error: `container ${st.status_code}`, attempts: busy.attempts + 1 });
    }
    return log;
  }

  // 2) start the next due post, keeping a gap between posts
  const last = rows.filter((r) => r.published_at).map((r) => Date.parse(r.published_at!)).sort((a, b) => b - a)[0] ?? 0;
  if (Date.now() - last < MIN_GAP_H * 3_600_000) return [...log, "waiting: posted recently"];
  const next = queue
    .filter((q) => Date.parse(q.publish_at) <= Date.now())
    .filter((q) => { const r = byId.get(q.id); return !r || (r.status === "error" && r.attempts < MAX_ATTEMPTS); })
    .sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at))[0];
  if (!next) return [...log, "nothing due"];
  if (opts.dryRun) return [...log, `dry run: would start ${next.id}`];

  try {
    let container: string;
    if (next.type === "reel") {
      const p: Record<string, string> = { media_type: "REELS", video_url: `${base}/${next.video}`, caption: next.caption, share_to_feed: "true" };
      if (next.cover) p.cover_url = `${base}/${next.cover}`;
      container = ((await ig(`${env.IG_USER_ID}/media`, p, tok)) as { id: string }).id;
    } else {
      const kids: string[] = [];
      for (const img of next.images ?? []) kids.push(((await ig(`${env.IG_USER_ID}/media`, { image_url: `${base}/${img}`, is_carousel_item: "true" }, tok)) as { id: string }).id);
      container = ((await ig(`${env.IG_USER_ID}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption: next.caption }, tok)) as { id: string }).id;
    }
    await save(env, { id: next.id, status: "processing", container_id: container, attempts: (byId.get(next.id)?.attempts ?? 0), error: null });
    log.push(`${next.id}: started ${container}`);
  } catch (e) {
    await save(env, { id: next.id, status: "error", error: (e as Error).message.slice(0, 500), attempts: (byId.get(next.id)?.attempts ?? 0) + 1 });
    log.push(`${next.id}: ${(e as Error).message}`);
  }
  return log;
}
