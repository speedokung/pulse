// Demo mode: example Pulses around central Bangkok, kept in memory on this device.
// Used automatically when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.
import type { ChatMessage, Contact, FeedPost, Level, MemberStatus, NewPulse, Pulse, Signal } from "./types";
import { roughen } from "./geo";
import { DAY, HOUR, MIN } from "./pulse";

export const DEMO_UID = "demo-me";
const listeners = new Set<() => void>();
export const onDemoChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((f) => f());

const T = Date.now();
const iso = (t: number) => new Date(t).toISOString();
let n = 0;
const crowd = (k: number, status: MemberStatus = "accepted") =>
  Array.from({ length: k }, () => ({ user_id: `ex${n++}`, status, profile: { display_name: ["ฝน", "ตี๋", "เล็ก", "กัน", "โอ๊ต", "แนน", "แบงก์", "มายด์"][n % 8] } }));

function P(o: {
  id: string; category: Pulse["category"]; title: string; place: string; area: string; host: string;
  lat: number; lng: number; start: number; dur: number; need: number; joined?: number; visibility?: Pulse["visibility"]; created?: number;
  level?: Level; series?: string; verified?: "google" | "line"; interested?: number; omw?: number[];
}): Pulse {
  const vis = o.visibility ?? "all";
  return {
    id: o.id, host_id: "h-" + o.host, host: { display_name: o.host, verified: o.verified ?? null }, category: o.category, title: o.title, need: o.need,
    level: o.level ?? "any", series_id: o.series ?? null,
    pulse_signals: [
      ...Array.from({ length: o.interested ?? 0 }, (_, i): Signal => ({ user_id: `int-${o.id}-${i}`, kind: "interested", eta_min: null, updated_at: iso(T - 20 * MIN) })),
      ...(o.omw ?? []).map((eta, i): Signal => ({ user_id: `ex${i}`, kind: "omw", eta_min: eta, updated_at: iso(T - 2 * MIN) })),
    ],
    starts_at: iso(o.start), ends_at: iso(o.start + o.dur * MIN), visibility: vis, area_name: o.area,
    rough_lat: roughen(o.lat), rough_lng: roughen(o.lng), created_at: iso(o.created ?? o.start - 10 * MIN),
    memberships: crowd(o.joined ?? 0),
    exact: vis === "all" ? { lat: o.lat, lng: o.lng, place_name: o.place } : null,
  };
}
// exact spots for "accepted only" Pulses, revealed once accepted
const hidden: Record<string, { lat: number; lng: number; place_name: string }> = {
  "ex-catan": { lat: 13.7337, lng: 100.5287, place_name: "ร้านบอร์ดเกม สามย่านมิตรทาวน์ ชั้น 2" },
  "ex-sketch": { lat: 13.7436, lng: 100.5003, place_name: "บันไดหน้าตลาดดอกไม้ ปากคลองตลาด" },
};

let pulses: Pulse[] = [
  P({ id: "ex-pickle", category: "sport", title: "ขาด 2 คน พิกเกิลบอลคู่", place: "คอร์ต 3 สนามสวนลุมพินี", area: "ลุมพินี", host: "ใหม่", verified: "google", level: "casual", interested: 3, lat: 13.7298, lng: 100.5395, start: T - 15 * MIN, dur: 75, need: 2, created: T - 20 * MIN }),
  P({ id: "ex-jam", category: "music", title: "เล่นกีตาร์โปร่งริมน้ำ มานั่งฟังได้", place: "สนามหญ้าริมน้ำ สวนลุมพินี", area: "ลุมพินี", host: "ต้น", verified: "line", level: "any", omw: [5, 12], interested: 2, lat: 13.7316, lng: 100.5424, start: T - 30 * MIN, dur: 90, need: 4, joined: 2 }),
  P({ id: "ex-catan", category: "games", title: "Catan ขาด 1 ที่", place: "", area: "สามย่าน", host: "บี", lat: 13.7337, lng: 100.5287, start: T + 25 * MIN, dur: 120, need: 1, visibility: "accepted" }),
  P({ id: "ex-run", category: "outdoor", title: "วิ่งชิลตอนเย็น 5 กม.", place: "สวนป่าเบญจกิติ ทางขึ้นสกายวอล์ก", area: "เบญจกิติ", host: "แนท", verified: "google", level: "beginner", interested: 4, series: "run-weekly", lat: 13.7296, lng: 100.5594, start: T + 55 * MIN, dur: 45, need: 5, joined: 2 }),
  P({ id: "ex-hoops", category: "sport", title: "บาส 3 ต่อ 3 ครึ่งสนาม", place: "สนามบาส สนามกีฬาจุฬาฯ", area: "ปทุมวัน", host: "เจ", level: "serious", lat: 13.7389, lng: 100.5266, start: T + 10 * MIN, dur: 60, need: 3, joined: 1 }),
  P({ id: "ex-futsal", category: "sport", title: "ฟุตซอล 5 คน ขาด 3", place: "สนามฟุตซอลสยาม คอร์ต B", area: "สยาม", host: "อาร์ม", lat: 13.7466, lng: 100.5318, start: T + 130 * MIN, dur: 60, need: 3 }),
  P({ id: "ex-boardnight", category: "games", title: "บอร์ดเกมไนท์ มือใหม่ก็มาได้", place: "ร้านบอร์ดเกม สามย่านมิตรทาวน์ ชั้น 2", area: "สามย่าน", host: "บี", level: "beginner", series: "bg-weekly", lat: 13.7337, lng: 100.5287, start: new Date(new Date(T + DAY).setHours(19, 0, 0, 0)).getTime(), dur: 180, need: 6, joined: 2 }),
  P({ id: "ex-sketch", category: "make", title: "สเก็ตช์ภาพปากคลองตลาด ทุกระดับ", place: "", area: "ปากคลองตลาด", host: "พลอย", lat: 13.7436, lng: 100.5003, start: T + 90 * MIN, dur: 90, need: 6, joined: 3, visibility: "accepted" }),
  // ended: history, buried under newer Pulses nearby
  P({ id: "ex-uke", category: "music", title: "วงอูคูเลเล่", place: "สนามหญ้าริมน้ำ สวนลุมพินี", area: "ลุมพินี", host: "ฝน", lat: 13.7312, lng: 100.5418, start: T - DAY, dur: 60, need: 5, joined: 5 }),
  P({ id: "ex-wolf", category: "games", title: "Werewolf 8 คน", place: "ศาลา สวนลุมพินี", area: "ลุมพินี", host: "ตี๋", lat: 13.7322, lng: 100.5409, start: T - 3 * DAY, dur: 90, need: 7, joined: 7 }),
  P({ id: "ex-taichi", category: "outdoor", title: "ไทเก๊กยามเช้า", place: "หอนาฬิกา สวนลุมพินี", area: "ลุมพินี", host: "เล็ก", lat: 13.7306, lng: 100.5432, start: T - 6 * DAY, dur: 45, need: 6, joined: 4 }),
  P({ id: "ex-rally", category: "sport", title: "ซ้อมพิกเกิลบอล", place: "คอร์ต 1 สนามสวนลุมพินี", area: "ลุมพินี", host: "ใหม่", lat: 13.7295, lng: 100.5391, start: T - 2 * DAY, dur: 60, need: 3, joined: 3 }),
  P({ id: "ex-chess", category: "games", title: "หมากรุกที่สามย่าน เอากระดานมาด้วย", place: "ลานกลาง สามย่านมิตรทาวน์", area: "สามย่าน", host: "กฤต", lat: 13.7340, lng: 100.5282, start: T - 5 * HOUR, dur: 120, need: 2, joined: 2 }),
  P({ id: "ex-film", category: "make", title: "เดินถ่ายรูปฟิล์ม", place: "ตรอกตลาดน้อย", area: "ตลาดน้อย", host: "พลอย", lat: 13.7310, lng: 100.5130, start: T - 4 * DAY, dur: 90, need: 6, joined: 5 }),
  P({ id: "ex-frisbee", category: "outdoor", title: "โยนฟริสบี้ มือใหม่ยินดี", place: "สนามหญ้าเบญจกิติ", area: "เบญจกิติ", host: "โอ๊ต", lat: 13.7302, lng: 100.5600, start: T - 26 * HOUR, dur: 60, need: 6, joined: 6 }),
  P({ id: "ex-badminton", category: "sport", title: "ตีแบดคู่", place: "สนามกีฬาในร่มสยาม", area: "สยาม", host: "อาร์ม", lat: 13.7462, lng: 100.5322, start: T - DAY - 3 * HOUR, dur: 60, need: 4, joined: 4 }),
];

let posts: FeedPost[] = [
  { id: "fp1", pulse_id: "ex-pickle", author_id: "h-ใหม่", author: { display_name: "ใหม่" }, kind: "update", body: "จองคอร์ต 3 ไว้ถึงหนึ่งทุ่ม มีไม้ให้ยืม เอาน้ำมาเองนะ", photo_path: null, created_at: iso(T - 12 * MIN) },
  { id: "fp2", pulse_id: "ex-jam", author_id: "h-ต้น", author: { display_name: "ต้น" }, kind: "update", body: "อยู่ใต้ต้นไม้ใหญ่ริมน้ำ เล่นเพลงไทยยุค 90 ใครก็มาร้องได้ 🎶", photo_path: null, created_at: iso(T - 25 * MIN) },
  { id: "fp3", pulse_id: "ex-jam", author_id: "ex1", author: { display_name: "ตี๋" }, kind: "checkin", body: null, photo_path: null, created_at: iso(T - 18 * MIN) },
  { id: "fp4", pulse_id: "ex-jam", author_id: "ex0", author: { display_name: "ฝน" }, kind: "update", body: "เอาคาฮองมาด้วย บนเสื่อยังมีที่ว่าง", photo_path: null, created_at: iso(T - 8 * MIN) },
  { id: "fp5", pulse_id: "ex-run", author_id: "h-แนท", author: { display_name: "แนท" }, kind: "update", body: "เจอกันที่บันไดสกายวอล์ก เพซ 6:30 ไม่ทิ้งใครแน่นอน", photo_path: null, created_at: iso(T - 5 * MIN) },
  { id: "fp6", pulse_id: "ex-chess", author_id: "h-กฤต", author: { display_name: "กฤต" }, kind: "update", body: "วันนี้สนุกมาก เล่นไป 11 ตา อาทิตย์หน้าเวลาเดิมไหม", photo_path: null, created_at: iso(T - 3 * HOUR) },
];

const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x));
// host contacts and group chats; contacts show only to the host and accepted people
const contacts: Record<string, Contact> = {
  "ex-pickle": { line_id: "mai.pickle", phone: "081-234-5678", landmark: "เสื้อส้ม ยืนรอหน้าคอร์ต 3" },
  "ex-jam": { line_id: "ton.guitar", phone: null, landmark: "ใต้ต้นจามจุรีใหญ่ริมน้ำ มีเสื่อสีฟ้า" },
  "ex-catan": { line_id: "bee.boardgame", phone: null, landmark: "โต๊ะริมหน้าต่าง ใส่แว่น" },
  "ex-run": { line_id: null, phone: "089-111-2222", landmark: "หมวกแก๊ปสีเขียว ตรงบันไดสกายวอล์ก" },
};
const chats: Record<string, ChatMessage[]> = {
  "ex-jam": [
    { id: "c1", pulse_id: "ex-jam", author_id: "h-ต้น", author: { display_name: "ต้น" }, body: "ใครมาถึงแล้วโทรหรือทักได้เลยนะ อยู่ใต้ต้นไม้ใหญ่", created_at: iso(T - 20 * MIN) },
    { id: "c2", pulse_id: "ex-jam", author_id: "ex1", author: { display_name: "ตี๋" }, body: "อีก 5 นาทีถึงครับ", created_at: iso(T - 9 * MIN) },
  ],
};
const isMember = (p: Pulse) => p.host_id === DEMO_UID || p.memberships.some((m) => m.user_id === DEMO_UID && m.status === "accepted");
export const demoPulses = () => clone(pulses).map((p) => ({ ...p, contact: isMember(p) ? contacts[p.id] ?? null : null }));
export function demoSetContact(id: string, c: Contact) { contacts[id] = c; emit(); }
export const demoMessages = (id: string) => clone(chats[id] ?? []);
export function demoSend(id: string, body: string) {
  (chats[id] ||= []).push({ id: "c" + Date.now(), pulse_id: id, author_id: DEMO_UID, author: { display_name: "คุณ" }, body, created_at: iso(Date.now()) });
  emit();
}
export const demoFeed = (ids: string[]) => clone(posts.filter((p) => ids.includes(p.pulse_id)));

function find(id: string) { const p = pulses.find((x) => x.id === id); if (!p) throw new Error("Pulse not found"); return p; }

export function demoCreate(np: NewPulse): string {
  const base = "local-" + Date.now().toString(36);
  const series = np.repeatWeeks > 1 ? base : null;
  for (let w = np.repeatWeeks - 1; w >= 0; w--) {
    const id = w ? `${base}-w${w}` : base;
    const start = Date.now() + np.startInMin * MIN + w * 7 * DAY;
    pulses.unshift({
      id, host_id: DEMO_UID, host: { display_name: "คุณ" }, category: np.category, title: np.title, need: np.need,
      starts_at: iso(start), ends_at: iso(start + np.durationMin * MIN), visibility: np.visibility, area_name: np.area || "Nearby",
      rough_lat: roughen(np.lat), rough_lng: roughen(np.lng), created_at: iso(Date.now()), memberships: [],
      exact: { lat: np.lat, lng: np.lng, place_name: np.place || np.area || "จุดที่ปักหมุด" },
      level: np.level, series_id: series, pulse_signals: [],
    });
    if (np.contact.line_id || np.contact.phone || np.contact.landmark) contacts[id] = np.contact;
  }
  emit(); return base;
}
export function demoSignal(id: string, kind: Signal["kind"] | null, eta: number | null) {
  const p = find(id);
  p.pulse_signals = (p.pulse_signals ?? []).filter((s) => s.user_id !== DEMO_UID);
  if (kind) p.pulse_signals.push({ user_id: DEMO_UID, kind, eta_min: eta, updated_at: iso(Date.now()) });
  emit();
}
export function demoHostStats(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pulses) if (ids.includes(p.host_id) && new Date(p.ends_at).getTime() < Date.now() && p.memberships.some((m) => m.status === "accepted")) out[p.host_id] = (out[p.host_id] || 0) + 1;
  // the example hosts have been around for a while
  for (const id of ids) if (id.startsWith("h-")) out[id] = (out[id] || 0) + ({ "h-ใหม่": 23, "h-ต้น": 9, "h-บี": 14, "h-แนท": 31 } as Record<string, number>)[id] || out[id] || 0;
  return out;
}
export function demoJoin(id: string): MemberStatus {
  const p = find(id);
  const st: MemberStatus = p.visibility === "all" ? "accepted" : "requested";
  p.memberships.push({ user_id: DEMO_UID, status: st, profile: { display_name: "คุณ" } });
  emit();
  if (st === "requested") setTimeout(() => {
    const m = p.memberships.find((x) => x.user_id === DEMO_UID);
    if (m) { m.status = "accepted"; p.exact = hidden[id] ?? { lat: p.rough_lat, lng: p.rough_lng, place_name: "Pinned spot" }; emit(); }
  }, 3000);
  return st;
}
export function demoLeave(id: string) {
  const p = find(id); p.memberships = p.memberships.filter((m) => m.user_id !== DEMO_UID);
  if (p.visibility === "accepted" && p.host_id !== DEMO_UID) p.exact = null;
  emit();
}
export function demoRespond(id: string, user: string, ok: boolean) {
  const p = find(id);
  if (ok) p.memberships.forEach((m) => { if (m.user_id === user) m.status = "accepted"; });
  else p.memberships = p.memberships.filter((m) => m.user_id !== user);
  emit();
}
export function demoExtend(id: string, minutes: number) {
  const p = find(id);
  const end = new Date(p.ends_at).getTime() + minutes * MIN;
  if (end > new Date(p.starts_at).getTime() + 12 * HOUR) throw new Error("A Pulse can run for 12 hours at most");
  p.ends_at = iso(end); emit();
}
export function demoEnd(id: string) { const p = find(id); if (new Date(p.starts_at).getTime() > Date.now()) { pulses = pulses.filter((x) => x !== p); emit(); return; } p.ends_at = iso(Math.max(Date.now(), new Date(p.starts_at).getTime() + MIN)); emit(); }
export function demoPost(pulse_id: string, kind: FeedPost["kind"], body: string | null, file: File | null) {
  posts.unshift({
    id: "fp-" + Date.now(), pulse_id, author_id: DEMO_UID, author: { display_name: "คุณ" }, kind, body, photo_path: null,
    created_at: iso(Date.now()), local_photo: file ? URL.createObjectURL(file) : undefined,
  });
  emit();
}

// a stranger joins an open example now and then, so the demo feels alive
setInterval(() => {
  const open = pulses.filter((p) => p.id.startsWith("ex-") && p.visibility === "all" && Date.now() < new Date(p.ends_at).getTime() && p.need - p.memberships.filter((m) => m.status === "accepted").length > 1);
  if (!open.length) return;
  const p = open[Math.floor(Math.random() * open.length)];
  p.memberships.push(...crowd(1));
  emit();
}, 15000);
