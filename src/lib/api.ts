// One data layer for both modes: Supabase when configured, the in-memory demo otherwise.
import type { Category, ChatMessage, Contact, FeedPost, LatLng, MemberStatus, NewPulse, PostKind, Pulse, Signal } from "./types";
import { configured, supabase, PHOTO_BUCKET } from "./supabase";
import * as demo from "./demo";
import { getLang } from "./i18n";
import { DAY, MIN } from "./pulse";

const PULSE_SELECT = "*, host:profiles!pulses_host_id_fkey(display_name,avatar_url,verified), memberships(user_id,status,profile:profiles(display_name,avatar_url)), pulse_signals(user_id,kind,eta_min,updated_at)";

function bbox(c: LatLng, km: number) {
  const dLat = km / 111, dLng = km / (111 * Math.cos((c.lat * Math.PI) / 180));
  return { minLat: c.lat - dLat, maxLat: c.lat + dLat, minLng: c.lng - dLng, maxLng: c.lng + dLng };
}
const chunks = <X,>(a: X[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function attachExact(list: Pulse[]): Promise<Pulse[]> {
  if (!list.length) return list;
  const rows: { pulse_id: string; lat: number; lng: number; place_name: string }[] = [];
  for (const ids of chunks(list.map((p) => p.id), 80)) {
    // RLS only returns rows this viewer may see
    const { data, error } = await supabase.from("pulse_locations").select("pulse_id,lat,lng,place_name").in("pulse_id", ids);
    if (error) throw error;
    rows.push(...((data ?? []) as typeof rows));
  }
  // host contact: RLS returns it only to the host and accepted people
  const contacts: (Contact & { pulse_id: string })[] = [];
  for (const ids of chunks(list.map((p) => p.id), 80)) {
    const { data } = await supabase.from("pulse_private").select("pulse_id,line_id,phone,landmark").in("pulse_id", ids);
    contacts.push(...((data ?? []) as typeof contacts));
  }
  const m = new Map(rows.map((r) => [r.pulse_id, r]));
  const c = new Map(contacts.map((r) => [r.pulse_id, r]));
  return list.map((p) => {
    const r = m.get(p.id), k = c.get(p.id);
    return { ...p, exact: r ? { lat: r.lat, lng: r.lng, place_name: r.place_name } : null,
      contact: k ? { line_id: k.line_id, phone: k.phone, landmark: k.landmark } : null };
  });
}

/** Active Pulses plus the last 30 days of history within ~15 km. */
export async function loadPulses(center: LatLng): Promise<Pulse[]> {
  if (!configured) return demo.demoPulses();
  const b = bbox(center, 15);
  const { data, error } = await supabase
    .from("pulses").select(PULSE_SELECT)
    .gte("ends_at", new Date(Date.now() - 30 * DAY).toISOString())
    .gte("rough_lat", b.minLat).lte("rough_lat", b.maxLat)
    .gte("rough_lng", b.minLng).lte("rough_lng", b.maxLng)
    .order("created_at", { ascending: false }).limit(400);
  if (error) throw error;
  return attachExact((data ?? []) as Pulse[]);
}

/** Search all past Pulses in the area, any age. */
export async function searchHistory(center: LatLng, q: string, sinceMs: number | null): Promise<Pulse[]> {
  const term = q.trim().toLowerCase();
  if (!configured) {
    return demo.demoPulses().filter((p) =>
      new Date(p.ends_at).getTime() < Date.now() &&
      (sinceMs == null || new Date(p.ends_at).getTime() > Date.now() - sinceMs) &&
      (!term || `${p.title} ${p.area_name}`.toLowerCase().includes(term)));
  }
  const b = bbox(center, 15);
  let query = supabase.from("pulses").select(PULSE_SELECT)
    .lt("ends_at", new Date().toISOString())
    .gte("rough_lat", b.minLat).lte("rough_lat", b.maxLat)
    .gte("rough_lng", b.minLng).lte("rough_lng", b.maxLng);
  if (sinceMs != null) query = query.gte("ends_at", new Date(Date.now() - sinceMs).toISOString());
  const safe = term.replace(/[%,()*]/g, " ").trim();
  if (safe) query = query.or(`title.ilike.%${safe}%,area_name.ilike.%${safe}%`);
  const { data, error } = await query.order("ends_at", { ascending: false }).limit(200);
  if (error) throw error;
  return attachExact((data ?? []) as Pulse[]);
}

export async function createPulse(np: NewPulse): Promise<string> {
  if (!configured) return demo.demoCreate(np);
  const { data, error } = await supabase.rpc("create_pulse", {
    p_category: np.category, p_title: np.title, p_need: np.need,
    p_starts_at: new Date(Date.now() + np.startInMin * MIN).toISOString(), p_duration_min: np.durationMin,
    p_visibility: np.visibility, p_lat: np.lat, p_lng: np.lng, p_place: np.place, p_area: np.area,
    p_level: np.level, p_repeat_weeks: np.repeatWeeks,
  });
  if (error) throw error;
  const id = data as string;
  if (np.contact.line_id || np.contact.phone || np.contact.landmark) await setContact(id, np.contact);
  return id;
}
export async function setContact(id: string, c: Contact) {
  if (!configured) return demo.demoSetContact(id, c);
  const { error } = await supabase.rpc("set_pulse_contact", { p_id: id, p_line: c.line_id ?? "", p_phone: c.phone ?? "", p_landmark: c.landmark ?? "" });
  if (error) throw error;
}

// ---------- group chat (host + accepted people) ----------
export async function loadMessages(pulseId: string): Promise<ChatMessage[]> {
  if (!configured) return demo.demoMessages(pulseId);
  const { data, error } = await supabase.from("pulse_messages")
    .select("*, author:profiles!pulse_messages_author_id_fkey(display_name,avatar_url)")
    .eq("pulse_id", pulseId).order("created_at", { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}
export async function sendMessage(pulseId: string, body: string) {
  if (!configured) return demo.demoSend(pulseId, body);
  const { error } = await supabase.from("pulse_messages").insert({ pulse_id: pulseId, body });
  if (error) throw error;
}
export function subscribeChat(pulseId: string, fn: () => void): () => void {
  if (!configured) return demo.onDemoChange(fn);
  const ch = supabase.channel(`chat-${pulseId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "pulse_messages", filter: `pulse_id=eq.${pulseId}` }, fn)
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ---------- interested / on my way ----------
export async function setSignal(uid: string, pulseId: string, kind: Signal["kind"] | null, etaMin: number | null = null) {
  if (!configured) return demo.demoSignal(pulseId, kind, etaMin);
  if (!kind) {
    const { error } = await supabase.from("pulse_signals").delete().eq("pulse_id", pulseId).eq("user_id", uid);
    if (error) throw error; return;
  }
  const { error } = await supabase.from("pulse_signals").upsert({ pulse_id: pulseId, user_id: uid, kind, eta_min: etaMin, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------- trust ----------
/** How many meetups each host has run (ended, with at least one other person). */
export async function hostStats(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  if (!configured) return demo.demoHostStats(ids);
  const { data, error } = await supabase.rpc("host_stats", { p_ids: ids });
  if (error) return {};
  return Object.fromEntries(((data ?? []) as { host_id: string; hosted: number }[]).map((r) => [r.host_id, r.hosted]));
}
export async function syncVerified() {
  if (!configured) return null;
  const { data } = await supabase.rpc("sync_verified");
  return (data as string | null) ?? null;
}

// ---------- LINE ----------
export async function startLineLink(): Promise<string> {
  const { data, error } = await supabase.rpc("start_line_link");
  if (error) throw error;
  return data as string;
}
export async function finishLineLink(code: string, idToken: string): Promise<{ ok: boolean; name?: string | null; error?: string }> {
  const r = await fetch("/api/line/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, idToken }) });
  return r.json();
}
export async function myLineLink(uid: string): Promise<{ line_name: string | null } | null> {
  if (!configured) return null;
  const { data } = await supabase.from("line_links").select("line_name").eq("user_id", uid).maybeSingle();
  return (data as { line_name: string | null } | null) ?? null;
}

export interface NotifyPrefs { enabled: boolean; categories: Category[]; lat: number; lng: number; radius_m: number }
export async function loadNotifyPrefs(uid: string): Promise<NotifyPrefs | null> {
  if (!configured) return null;
  const { data } = await supabase.from("notify_prefs").select("enabled,categories,lat,lng,radius_m").eq("user_id", uid).maybeSingle();
  return (data as NotifyPrefs | null) ?? null;
}
export async function saveNotifyPrefs(uid: string, p: NotifyPrefs) {
  if (!configured) return;
  const { error } = await supabase.from("notify_prefs").upsert({ user_id: uid, ...p, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------- Google Maps short links (resolved by our Cloudflare Worker) ----------
export async function resolveMapLink(url: string): Promise<{ lat?: number; lng?: number; name?: string | null } | null> {
  try {
    const r = await fetch(`/api/resolve-map?url=${encodeURIComponent(url)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function joinPulse(id: string): Promise<MemberStatus> {
  if (!configured) return demo.demoJoin(id);
  const { data, error } = await supabase.rpc("join_pulse", { p_id: id });
  if (error) throw error;
  return data as MemberStatus;
}
export async function leavePulse(id: string) {
  if (!configured) return demo.demoLeave(id);
  const { error } = await supabase.rpc("leave_pulse", { p_id: id }); if (error) throw error;
}
export async function respondRequest(id: string, user: string, accept: boolean) {
  if (!configured) return demo.demoRespond(id, user, accept);
  const { error } = await supabase.rpc("respond_request", { p_id: id, p_user: user, p_accept: accept }); if (error) throw error;
}
export async function extendPulse(id: string, minutes: number) {
  if (!configured) return demo.demoExtend(id, minutes);
  const { error } = await supabase.rpc("extend_pulse", { p_id: id, p_minutes: minutes }); if (error) throw error;
}
export async function endPulse(id: string) {
  if (!configured) return demo.demoEnd(id);
  const { error } = await supabase.rpc("end_pulse", { p_id: id }); if (error) throw error;
}

export async function loadFeed(pulseIds: string[]): Promise<FeedPost[]> {
  if (!pulseIds.length) return [];
  if (!configured) return demo.demoFeed(pulseIds);
  const out: FeedPost[] = [];
  for (const ids of chunks(pulseIds, 80)) {
    const { data, error } = await supabase.from("feed_posts")
      .select("*, author:profiles!feed_posts_author_id_fkey(display_name,avatar_url)")
      .in("pulse_id", ids).order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    out.push(...((data ?? []) as FeedPost[]));
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Shrink a phone photo to ≤1280 px JPEG before upload. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read that photo"))), "image/jpeg", 0.82));
}

export async function postToFeed(uid: string, pulseId: string, kind: PostKind, body: string | null, file: File | null) {
  if (!configured) return demo.demoPost(pulseId, kind, body, file);
  let photo_path: string | null = null;
  if (file) {
    const blob = await shrink(file);
    photo_path = `${uid}/${pulseId}/${Date.now()}.jpg`;
    const up = await supabase.storage.from(PHOTO_BUCKET).upload(photo_path, blob, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
  }
  const { error } = await supabase.from("feed_posts").insert({ pulse_id: pulseId, kind: file ? "photo" : kind, body, photo_path });
  if (error) throw error;
}

/** Calls `fn` whenever Pulses, joins or feed posts change anywhere. */
export function subscribe(fn: () => void): () => void {
  if (!configured) return demo.onDemoChange(fn);
  const ch = supabase.channel(`pulse-live-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "pulses" }, fn)
    .on("postgres_changes", { event: "*", schema: "public", table: "memberships" }, fn)
    .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts" }, fn)
    .on("postgres_changes", { event: "*", schema: "public", table: "pulse_signals" }, fn)
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** Friendly message from a Supabase / Postgres error. */
const TH_ERRORS: [RegExp, string][] = [
  [/is full|already full/i, "ก๊วนนี้เต็มแล้ว"],
  [/has (already )?ended/i, "ก๊วนนี้จบไปแล้ว"],
  [/sign in first|not signed in/i, "ต้องเข้าสู่ระบบก่อน"],
  [/only the host/i, "เฉพาะเจ้าของก๊วนเท่านั้น"],
  [/you are hosting/i, "คุณเป็นเจ้าของก๊วนนี้อยู่แล้ว"],
  [/upcoming pulses|active pulses/i, "คุณมีก๊วนที่ยังไม่จบหลายก๊วนแล้ว จบหรือยกเลิกก๊วนเก่าก่อนนะ"],
  [/12 hours/i, "ก๊วนหนึ่งเล่นได้ไม่เกิน 12 ชั่วโมง"],
  [/start time has passed/i, "เวลาเริ่มผ่านไปแล้ว"],
  [/within the next 7 days/i, "เลือกเวลาเริ่มภายใน 7 วันข้างหน้า"],
  [/duration/i, "ระยะเวลาต้องอยู่ระหว่าง 15 นาทีถึง 12 ชั่วโมง"],
  [/not found/i, "ไม่เจอก๊วนนี้ อาจถูกยกเลิกไปแล้ว"],
  [/fetch|network/i, "เชื่อมต่อไม่ได้ ลองเช็กอินเทอร์เน็ตแล้วลองใหม่"],
];
/** Friendly message from a Supabase / Postgres error, in the app's language. */
export const errText = (e: unknown) => {
  const msg = (e as { message?: string })?.message?.replace(/^.*?ERROR:\s*/, "") || "";
  if (getLang() === "th") return TH_ERRORS.find(([re]) => re.test(msg))?.[1] || "มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง";
  return msg || "Something went wrong. Check your connection and try again.";
};
