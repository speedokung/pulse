// Demo mode: example Pulses around central Bangkok, kept in memory on this device.
// Used automatically when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.
import type { FeedPost, MemberStatus, NewPulse, Pulse } from "./types";
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
  Array.from({ length: k }, () => ({ user_id: `ex${n++}`, status, profile: { display_name: ["Fon", "Tee", "Lek", "Gun", "Oat", "Nan", "Bank", "Mild"][n % 8] } }));

function P(o: {
  id: string; category: Pulse["category"]; title: string; place: string; area: string; host: string;
  lat: number; lng: number; start: number; dur: number; need: number; joined?: number; visibility?: Pulse["visibility"]; created?: number;
}): Pulse {
  const vis = o.visibility ?? "all";
  return {
    id: o.id, host_id: "h-" + o.host, host: { display_name: o.host }, category: o.category, title: o.title, need: o.need,
    starts_at: iso(o.start), ends_at: iso(o.start + o.dur * MIN), visibility: vis, area_name: o.area,
    rough_lat: roughen(o.lat), rough_lng: roughen(o.lng), created_at: iso(o.created ?? o.start - 10 * MIN),
    memberships: crowd(o.joined ?? 0),
    exact: vis === "all" ? { lat: o.lat, lng: o.lng, place_name: o.place } : null,
  };
}
// exact spots for "accepted only" Pulses, revealed once accepted
const hidden: Record<string, { lat: number; lng: number; place_name: string }> = {
  "ex-catan": { lat: 13.7337, lng: 100.5287, place_name: "Board game café, Samyan Mitrtown 2F" },
  "ex-sketch": { lat: 13.7436, lng: 100.5003, place_name: "Pak Khlong Talat, flower market steps" },
};

let pulses: Pulse[] = [
  P({ id: "ex-pickle", category: "sport", title: "Need 2 for pickleball doubles", place: "Court 3, Lumphini Park courts", area: "Lumphini", host: "Mai", lat: 13.7298, lng: 100.5395, start: T - 15 * MIN, dur: 75, need: 2, created: T - 20 * MIN }),
  P({ id: "ex-jam", category: "music", title: "Jamming acoustic guitar, come sit", place: "Lakeside lawn, Lumphini Park", area: "Lumphini", host: "Ton", lat: 13.7316, lng: 100.5424, start: T - 30 * MIN, dur: 90, need: 4, joined: 2 }),
  P({ id: "ex-catan", category: "games", title: "Catan table, 1 seat open", place: "", area: "Samyan", host: "Bee", lat: 13.7337, lng: 100.5287, start: T + 25 * MIN, dur: 120, need: 1, visibility: "accepted" }),
  P({ id: "ex-run", category: "outdoor", title: "Sunset run, easy 5 km pace", place: "Benjakitti Forest Park, skywalk entrance", area: "Benjakitti", host: "Nat", lat: 13.7296, lng: 100.5594, start: T + 55 * MIN, dur: 45, need: 5, joined: 2 }),
  P({ id: "ex-hoops", category: "sport", title: "3-on-3 basketball, half court", place: "Chula sports field court", area: "Pathum Wan", host: "Jay", lat: 13.7389, lng: 100.5266, start: T + 10 * MIN, dur: 60, need: 3, joined: 1 }),
  P({ id: "ex-futsal", category: "sport", title: "Futsal 5-a-side, short 3 players", place: "Siam futsal, court B", area: "Siam", host: "Arm", lat: 13.7466, lng: 100.5318, start: T + 130 * MIN, dur: 60, need: 3 }),
  P({ id: "ex-sketch", category: "make", title: "Sketching the flower market, all levels", place: "", area: "Pak Khlong Talat", host: "Ploy", lat: 13.7436, lng: 100.5003, start: T + 90 * MIN, dur: 90, need: 6, joined: 3, visibility: "accepted" }),
  // ended: history, buried under newer Pulses nearby
  P({ id: "ex-uke", category: "music", title: "Ukulele circle", place: "Lakeside lawn, Lumphini Park", area: "Lumphini", host: "Fon", lat: 13.7312, lng: 100.5418, start: T - DAY, dur: 60, need: 5, joined: 5 }),
  P({ id: "ex-wolf", category: "games", title: "Werewolf, 8 players", place: "Pavilion, Lumphini Park", area: "Lumphini", host: "Tee", lat: 13.7322, lng: 100.5409, start: T - 3 * DAY, dur: 90, need: 7, joined: 7 }),
  P({ id: "ex-taichi", category: "outdoor", title: "Morning tai chi", place: "Lumphini Park clock tower", area: "Lumphini", host: "Lek", lat: 13.7306, lng: 100.5432, start: T - 6 * DAY, dur: 45, need: 6, joined: 4 }),
  P({ id: "ex-rally", category: "sport", title: "Pickleball rally practice", place: "Court 1, Lumphini Park courts", area: "Lumphini", host: "Mai", lat: 13.7295, lng: 100.5391, start: T - 2 * DAY, dur: 60, need: 3, joined: 3 }),
  P({ id: "ex-chess", category: "games", title: "Chess at Samyan, bring a board", place: "Samyan Mitrtown atrium", area: "Samyan", host: "Krit", lat: 13.7340, lng: 100.5282, start: T - 5 * HOUR, dur: 120, need: 2, joined: 2 }),
  P({ id: "ex-film", category: "make", title: "Film photo walk", place: "Talat Noi alleys", area: "Talat Noi", host: "Ploy", lat: 13.7310, lng: 100.5130, start: T - 4 * DAY, dur: 90, need: 6, joined: 5 }),
  P({ id: "ex-frisbee", category: "outdoor", title: "Frisbee toss, beginners welcome", place: "Benjakitti lawn", area: "Benjakitti", host: "Oat", lat: 13.7302, lng: 100.5600, start: T - 26 * HOUR, dur: 60, need: 6, joined: 6 }),
  P({ id: "ex-badminton", category: "sport", title: "Badminton doubles", place: "Siam sports hall", area: "Siam", host: "Arm", lat: 13.7462, lng: 100.5322, start: T - DAY - 3 * HOUR, dur: 60, need: 4, joined: 4 }),
];

let posts: FeedPost[] = [
  { id: "fp1", pulse_id: "ex-pickle", author_id: "h-Mai", author: { display_name: "Mai" }, kind: "update", body: "Court 3 is ours till 7. Paddles to lend, just bring water.", photo_path: null, created_at: iso(T - 12 * MIN) },
  { id: "fp2", pulse_id: "ex-jam", author_id: "h-Ton", author: { display_name: "Ton" }, kind: "update", body: "Under the big tree by the lake. Playing 90s Thai pop, all levels welcome 🎶", photo_path: null, created_at: iso(T - 25 * MIN) },
  { id: "fp3", pulse_id: "ex-jam", author_id: "ex1", author: { display_name: "Tee" }, kind: "checkin", body: null, photo_path: null, created_at: iso(T - 18 * MIN) },
  { id: "fp4", pulse_id: "ex-jam", author_id: "ex0", author: { display_name: "Fon" }, kind: "update", body: "Brought a cajón. Still room on the mat.", photo_path: null, created_at: iso(T - 8 * MIN) },
  { id: "fp5", pulse_id: "ex-run", author_id: "h-Nat", author: { display_name: "Nat" }, kind: "update", body: "Meeting at the skywalk stairs. 6:30 min/km, nobody gets left behind.", photo_path: null, created_at: iso(T - 5 * MIN) },
  { id: "fp6", pulse_id: "ex-chess", author_id: "h-Krit", author: { display_name: "Krit" }, kind: "update", body: "Great games today, 11 played. Same time next week?", photo_path: null, created_at: iso(T - 3 * HOUR) },
];

const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x));
export const demoPulses = () => clone(pulses);
export const demoFeed = (ids: string[]) => clone(posts.filter((p) => ids.includes(p.pulse_id)));

function find(id: string) { const p = pulses.find((x) => x.id === id); if (!p) throw new Error("Pulse not found"); return p; }

export function demoCreate(np: NewPulse): string {
  const id = "local-" + Date.now().toString(36);
  const start = Date.now() + np.startInMin * MIN;
  pulses.unshift({
    id, host_id: DEMO_UID, host: { display_name: "You" }, category: np.category, title: np.title, need: np.need,
    starts_at: iso(start), ends_at: iso(start + np.durationMin * MIN), visibility: np.visibility, area_name: np.area || "Nearby",
    rough_lat: roughen(np.lat), rough_lng: roughen(np.lng), created_at: iso(Date.now()), memberships: [],
    exact: { lat: np.lat, lng: np.lng, place_name: np.place || np.area || "Pinned spot" },
  });
  emit(); return id;
}
export function demoJoin(id: string): MemberStatus {
  const p = find(id);
  const st: MemberStatus = p.visibility === "all" ? "accepted" : "requested";
  p.memberships.push({ user_id: DEMO_UID, status: st, profile: { display_name: "You" } });
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
export function demoEnd(id: string) { const p = find(id); p.ends_at = iso(Math.max(Date.now(), new Date(p.starts_at).getTime() + MIN)); emit(); }
export function demoPost(pulse_id: string, kind: FeedPost["kind"], body: string | null, file: File | null) {
  posts.unshift({
    id: "fp-" + Date.now(), pulse_id, author_id: DEMO_UID, author: { display_name: "You" }, kind, body, photo_path: null,
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
