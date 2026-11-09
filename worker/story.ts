// Daily Instagram Story "ก๊วนวันนี้": once a day (09:00–12:00 Bangkok) when at least 3 ก๊วน in Bangkok start today,
// the Worker renders /story/today (1080×1920) with Cloudflare Browser Rendering, stores the picture in Supabase
// storage and posts it as an IG Story. Days with fewer ก๊วน are skipped, so the account never looks empty.
// Status per day in ig_posts as "story:YYYY-MM-DD". STORY_PAUSED = "1" stops it.

import puppeteer from "@cloudflare/puppeteer";
import { db, save, token, type IgEnv, type PostRow } from "./instagram";

export interface StoryEnv extends IgEnv { BROWSER?: Fetcher; STORY_PAUSED?: string; SUPABASE_ANON_KEY?: string }

const MIN = 3;
const CAT: Record<string, { th: string; color: string; emoji: string }> = {
  sport: { th: "กีฬา", color: "#e8590c", emoji: "🏸" }, music: { th: "ดนตรี", color: "#c2255c", emoji: "🎸" },
  games: { th: "บอร์ดเกม", color: "#6741d9", emoji: "🎲" }, outdoor: { th: "กลางแจ้ง", color: "#2b8a3e", emoji: "🌳" },
  make: { th: "งานศิลป์", color: "#0b7285", emoji: "✏️" },
};
interface Row { id: string; title: string; category: string; starts_at: string; ends_at: string; area_name: string; need: number; rough_lat: number; rough_lng: number }

const bkkDay = (t = Date.now()) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkHour = (t = Date.now()) => new Date(t + 7 * 3_600_000).getUTCHours();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** ก๊วน in Bangkok that haven't ended and start before midnight (Bangkok time) today. */
async function today(env: StoryEnv): Promise<Row[]> {
  const end = new Date(`${bkkDay()}T23:59:59+07:00`).toISOString(), now = new Date().toISOString();
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/pulses?select=id,title,category,starts_at,ends_at,area_name,need,rough_lat,rough_lng&ends_at=gt.${now}&starts_at=lt.${end}&order=starts_at.asc&limit=50`, {
    headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
  });
  const rows = r.ok ? ((await r.json()) as Row[]) : [];
  return rows.filter((p) => Math.abs(p.rough_lat - 13.75) < 0.35 && Math.abs(p.rough_lng - 100.55) < 0.4);
}

/** /story/today — the picture itself, as a page (also handy to preview). */
export async function storyPage(env: StoryEnv, sample = false): Promise<Response> {
  const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const ps = sample   // ?sample=1: design preview with made-up rows (never posted)
    ? [["ตีแบดคู่ ขาด 2 คน มือใหม่ก็มาได้", "sport", "ลาดพร้าว"], ["บอร์ดเกมคืนนี้ Catan + Splendor", "games", "อารีย์"], ["วิ่งชิล 5 กม. สวนลุม", "outdoor", "ปทุมวัน"], ["แจมดนตรี ใครเล่นอะไรมาได้", "music", "ราชเทวี"]]
        .map(([title, category, area_name], i) => ({ id: String(i), title, category, area_name, starts_at: at(i + 1), ends_at: at(i + 3), need: 2 + i, rough_lat: 0, rough_lng: 0 }))
    : (await today(env)).slice(0, 5);
  const t = (iso: string) => new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(iso));
  const d = new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bangkok" }).format(new Date());
  const cards = ps.map((p) => {
    const c = CAT[p.category] ?? CAT.sport;
    return `<div class="c" style="--k:${c.color}"><div class="e">${c.emoji}</div><div><b>${esc(p.title)}</b><span>${Date.parse(p.starts_at) <= Date.now() ? "กำลังเล่นอยู่" : `${t(p.starts_at)} น.`} · ${esc(p.area_name)} · ขาด ${p.need} คน</span></div></div>`;
  }).join("");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;600;700&display=swap">
<style>*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden;background:#0d1416;color:#fff;font-family:Anuphan,sans-serif}
.w{position:absolute;inset:0;padding:150px 70px 120px;display:flex;flex-direction:column}
.br{display:flex;align-items:center;gap:16px;font-size:52px;font-weight:700}.br i{width:30px;height:30px;border-radius:50%;background:#ff5a36;box-shadow:0 0 0 8px rgba(255,90,54,.3)}
h1{font-size:118px;line-height:1.08;margin:70px 0 14px}h1 em{font-style:normal;color:#ff5a36}.d{font-size:40px;color:#b9c6c4;margin-bottom:56px}
.c{display:flex;gap:28px;align-items:center;background:#141d20;border:2px solid #25343a;border-left:14px solid var(--k);border-radius:30px;padding:30px 34px;margin-bottom:24px}
.e{font-size:64px}.c b{display:block;font-size:46px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.c span{display:block;font-size:34px;color:#b9c6c4;margin-top:8px}
.f{margin-top:auto;text-align:center}.u{display:inline-block;background:#ff5a36;color:#14211f;font-size:64px;font-weight:700;padding:20px 60px 28px;border-radius:999px}.f p{font-size:38px;color:#b9c6c4;margin-top:22px}</style></head>
<body><div class="w"><div class="br"><i></i>แถว</div><h1>ก๊วนวันนี้<br><em>แถวกรุงเทพฯ</em></h1><div class="d">${esc(d)} · ${ps.length} ก๊วนที่ยังจอยได้</div>${cards}
<div class="f"><div class="u">thaew.com</div><p>กดจอยได้เลย ไม่ต้องโหลดแอป</p></div></div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function storyTick(env: StoryEnv, opts: { dryRun?: boolean; force?: boolean } = {}): Promise<string[]> {
  if (env.STORY_PAUSED === "1") return ["paused"];
  if (!env.BROWSER || !env.IG_USER_ID || !env.SUPABASE_SERVICE_ROLE_KEY) return ["not set up: BROWSER binding / IG / Supabase missing"];
  const day = bkkDay(), id = `story:${day}`;
  if (!opts.force && (bkkHour() < 9 || bkkHour() >= 12)) return ["outside 09–12"];
  const done = (await db(env, `ig_posts?select=*&id=eq.${encodeURIComponent(id)}`)) as PostRow[];
  if (done[0] && (done[0].status === "published" || done[0].attempts >= 2)) return [`${id}: already ${done[0].status}`];
  const ps = await today(env);
  if (ps.length < MIN) return [`only ${ps.length} ก๊วน today, skipping`];
  if (opts.dryRun) return [`dry run: would post story with ${ps.length} ก๊วน`];
  try {
    const browser = await puppeteer.launch(env.BROWSER as never);
    let jpg: Uint8Array;
    try {
      const pg = await browser.newPage();
      await pg.setViewport({ width: 1080, height: 1920 });
      await pg.goto(`${(env.APP_URL || "https://thaew.com").replace(/\/$/, "")}/story/today`, { waitUntil: "networkidle0" });
      jpg = (await pg.screenshot({ type: "jpeg", quality: 88 })) as Uint8Array;
    } finally { await browser.close(); }
    const path = `system/stories/${day}-${Date.now()}.jpg`;
    const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/feed-photos/${path}`, {
      method: "POST", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "image/jpeg" }, body: jpg,
    });
    if (!up.ok) throw new Error(`storage ${up.status}: ${(await up.text()).slice(0, 200)}`);
    const img = `${env.SUPABASE_URL}/storage/v1/object/public/feed-photos/${path}`;
    const tok = await token(env, []);
    if (!tok) throw new Error("no IG token");
    const G = "https://graph.instagram.com/v22.0";
    const c = (await (await fetch(`${G}/${env.IG_USER_ID}/media`, { method: "POST", body: new URLSearchParams({ media_type: "STORIES", image_url: img, access_token: tok }) })).json()) as { id?: string; error?: { message?: string } };
    if (!c.id) throw new Error(`ig story: ${c.error?.message}`);
    for (let i = 0; i < 6; i++) {
      const s = (await (await fetch(`${G}/${c.id}?fields=status_code&access_token=${tok}`)).json()) as { status_code?: string };
      if (s.status_code === "FINISHED") break;
      if (s.status_code === "ERROR") throw new Error("ig story container ERROR");
      await new Promise((r) => setTimeout(r, 3000));
    }
    const pub = (await (await fetch(`${G}/${env.IG_USER_ID}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.id, access_token: tok }) })).json()) as { id?: string; error?: { message?: string } };
    if (!pub.id) throw new Error(`ig story publish: ${pub.error?.message}`);
    await save(env, { id, status: "published", media_id: pub.id, published_at: new Date().toISOString(), attempts: (done[0]?.attempts ?? 0), error: null });
    return [`${id}: posted (${ps.length} ก๊วน)`];
  } catch (e) {
    await save(env, { id, status: "error", error: (e as Error).message.slice(0, 500), attempts: (done[0]?.attempts ?? 0) + 1 });
    return [`${id}: ${(e as Error).message}`];
  }
}
