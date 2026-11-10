// Threads auto-poster. Same plan as Instagram/Facebook (public/ig/queue.json), same cron.
//   reel     → a Threads video post
//   carousel → a Threads carousel (2–20 images)
// Status per post lives in Supabase ig_posts as "th:<post id>"; the token is refreshed weekly (ig_state key "threads_token").
//
// Settings (Cloudflare → Worker → Variables and Secrets):
//   THREADS_USER_ID  text    optional: the Threads profile id (otherwise taken from the token)
//   THREADS_TOKEN    secret  long-lived Threads user token (only used until the first refresh is stored)
//   THREADS_PAUSED   text    "1" stops Threads posting

import { db, save, type IgEnv, type PostRow, type QueueItem } from "./instagram";

export interface ThEnv extends IgEnv { THREADS_USER_ID?: string; THREADS_TOKEN?: string; THREADS_PAUSED?: string }

const G = "https://graph.threads.net/v1.0";
const PREFIX = "th:";
const MIN_GAP_H = 20, MAX_ATTEMPTS = 3;

async function th(path: string, params: Record<string, string>, token: string, method: "GET" | "POST" = "POST") {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(method === "GET" ? `${G}/${path}?${q}` : `${G}/${path}`, method === "GET" ? {} : { method: "POST", body: q });
  const j = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!r.ok || j.error) throw new Error(`threads: ${j.error?.message ?? r.status}`);
  return j;
}

async function token(env: ThEnv, log: string[]): Promise<string | null> {
  const rows = (await db(env, "ig_state?key=eq.threads_token&select=value,updated_at")) as { value: string; updated_at: string }[];
  let tok = rows[0]?.value || env.THREADS_TOKEN || null;
  const age = rows[0] ? Date.now() - Date.parse(rows[0].updated_at) : Infinity;
  if (tok && age > 7 * 86_400_000) {
    try {
      const r = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(tok)}`);
      const j = (await r.json()) as { access_token?: string };
      if (j.access_token) {
        tok = j.access_token;
        await db(env, "ig_state?on_conflict=key", { method: "POST", body: JSON.stringify({ key: "threads_token", value: tok, updated_at: new Date().toISOString() }) });
        log.push("threads token refreshed");
      }
    } catch (e) { log.push(`threads token refresh failed: ${(e as Error).message}`); }
  }
  return tok;
}

/** Threads takes 500 characters and one topic tag: keep the first hashtag, drop "link in bio" (links are clickable there). */
export function threadsText(q: QueueItem): string {
  let t = (q.fb_caption ?? q.caption).replace(/\s*\((ลิงก์ใน bio|link in bio)\)/gi, "");
  let kept = false;
  t = t.replace(/(^|\s)#[^\s#]+/g, (m) => { if (kept) return ""; kept = true; return m; }).replace(/[ \t]+\n/g, "\n").trim();
  const cps = [...t];
  return cps.length > 490 ? cps.slice(0, 487).join("") + "…" : t;
}

/** THREADS_USER_ID if set, otherwise whoever the token belongs to. */
async function userId(env: ThEnv, tok: string) {
  return env.THREADS_USER_ID || ((await th("me", { fields: "id" }, tok, "GET")) as { id: string }).id;
}

export async function threadsTick(env: ThEnv, opts: { dryRun?: boolean } = {}): Promise<string[]> {
  const log: string[] = [];
  if (env.THREADS_PAUSED === "1") return ["paused"];
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return ["not set up: Supabase settings missing"];
  const tok = await token(env, log);
  if (!tok) return [...log, "not set up: THREADS_TOKEN missing"];
  env = { ...env, THREADS_USER_ID: await userId(env, tok) };
  const base = (env.APP_URL || "https://thaew.com").replace(/\/$/, "");
  const qr = await env.ASSETS.fetch(new Request(`${base}/ig/queue.json`));
  if (!qr.ok) return ["no queue.json"];
  const queue = ((await qr.json()) as { posts: QueueItem[] }).posts;
  const rows = (await db(env, `ig_posts?select=*&id=like.${encodeURIComponent(PREFIX)}*`)) as PostRow[];
  const byId = new Map(rows.map((r) => [r.id.slice(PREFIX.length), r]));

  const busy = rows.find((r) => r.status === "processing");
  if (busy) {
    const st = (await th(busy.container_id!, { fields: "status,error_message" }, tok, "GET")) as { status?: string; error_message?: string };
    log.push(`${busy.id}: ${st.status}`);
    if (st.status === "FINISHED") {
      if (opts.dryRun) return [...log, "dry run: would publish"];
      const pub = (await th(`${env.THREADS_USER_ID}/threads_publish`, { creation_id: busy.container_id! }, tok)) as { id: string };
      await save(env, { id: busy.id, status: "published", media_id: pub.id, published_at: new Date().toISOString(), error: null });
      log.push(`${busy.id}: published ${pub.id}`);
    } else if (st.status === "ERROR" || st.status === "EXPIRED") {
      await save(env, { id: busy.id, status: "error", error: `container ${st.status}: ${st.error_message ?? ""}`.slice(0, 500), attempts: busy.attempts + 1 });
    }
    return log;
  }

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
    let container: string;
    if (next.type === "reel") {
      container = ((await th(`${env.THREADS_USER_ID}/threads`, { media_type: "VIDEO", video_url: `${base}/${next.video}`, text: threadsText(next) }, tok)) as { id: string }).id;
    } else {
      const kids: string[] = [];
      for (const img of (next.images ?? []).slice(0, 20))
        kids.push(((await th(`${env.THREADS_USER_ID}/threads`, { media_type: "IMAGE", image_url: `${base}/${img}`, is_carousel_item: "true" }, tok)) as { id: string }).id);
      container = ((await th(`${env.THREADS_USER_ID}/threads`, { media_type: "CAROUSEL", children: kids.join(","), text: threadsText(next) }, tok)) as { id: string }).id;
    }
    await save(env, { id, status: "processing", container_id: container, attempts, error: null });
    log.push(`${id}: started ${container}`);
  } catch (e) {
    await save(env, { id, status: "error", error: (e as Error).message.slice(0, 500), attempts: attempts + 1 });
    log.push(`${id}: ${(e as Error).message}`);
  }
  return log;
}

export async function threadsCheck(env: ThEnv): Promise<Record<string, unknown>> {
  try {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "Supabase settings missing" };
    const tok = await token(env, []);
    if (!tok) return { ok: false, error: "THREADS_TOKEN missing" };
    const me = (await th("me", { fields: "id,username" }, tok, "GET")) as { id?: string; username?: string };
    return { ok: true, username: me.username, user_id: me.id, paused: env.THREADS_PAUSED === "1" };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
