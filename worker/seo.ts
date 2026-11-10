// Search pages: one per activity, per Bangkok area, and per activity × area, in Thai (/th/…) and English (/en/…).
// Each page lists the real ก๊วน coming up there (straight from Supabase) and links into the map.
// A page with nothing in the last 90 days is served with noindex and kept out of the sitemap, so Google
// never sees hundreds of empty look-alike pages; the activity and area hubs are always indexable.

interface SeoEnv { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string; APP_URL?: string }
type Lang = "th" | "en";
type Cat = "sport" | "music" | "games" | "outdoor" | "make";

const CAT: Record<Cat, { th: string; en: string; color: string }> = {
  sport: { th: "กีฬา", en: "Sports", color: "#e8590c" },
  music: { th: "ดนตรี", en: "Music", color: "#c2255c" },
  games: { th: "บอร์ดเกม", en: "Board games", color: "#6741d9" },
  outdoor: { th: "กลางแจ้ง", en: "Outdoors", color: "#2b8a3e" },
  make: { th: "งานศิลป์", en: "Making", color: "#0b7285" },
};

// Same keys as src/lib/categories.ts SUBS. `q` = how people search for it.
const ACTS: { k: string; cat: Cat; th: string; en: string; qTh: string; qEn: string }[] = [
  { k: "badminton", cat: "sport", th: "แบดมินตัน", en: "Badminton", qTh: "หาเพื่อนตีแบด", qEn: "Badminton partners" },
  { k: "football", cat: "sport", th: "ฟุตบอล", en: "Football", qTh: "หาคนเตะบอล", qEn: "Pickup football" },
  { k: "basketball", cat: "sport", th: "บาสเกตบอล", en: "Basketball", qTh: "หาคนเล่นบาส", qEn: "Pickup basketball" },
  { k: "pickleball", cat: "sport", th: "พิกเกิลบอล", en: "Pickleball", qTh: "หาคู่ตีพิกเกิลบอล", qEn: "Pickleball partners" },
  { k: "tennis", cat: "sport", th: "เทนนิส", en: "Tennis", qTh: "หาคู่ตีเทนนิส", qEn: "Tennis partners" },
  { k: "volleyball", cat: "sport", th: "วอลเลย์บอล", en: "Volleyball", qTh: "หาคนเล่นวอลเลย์บอล", qEn: "Pickup volleyball" },
  { k: "pingpong", cat: "sport", th: "ปิงปอง", en: "Table tennis", qTh: "หาคู่ตีปิงปอง", qEn: "Table tennis partners" },
  { k: "gym", cat: "sport", th: "ฟิตเนส", en: "Gym", qTh: "หาบัดดี้เข้ายิม", qEn: "Gym buddies" },
  { k: "jam", cat: "music", th: "แจมดนตรี", en: "Music jam", qTh: "หาเพื่อนแจมดนตรี", qEn: "Music jam sessions" },
  { k: "acoustic", cat: "music", th: "กีตาร์โปร่ง", en: "Acoustic", qTh: "หาเพื่อนเล่นกีตาร์ร้องเพลง", qEn: "Acoustic sing-alongs" },
  { k: "karaoke", cat: "music", th: "คาราโอเกะ", en: "Karaoke", qTh: "หาเพื่อนร้องคาราโอเกะ", qEn: "Karaoke buddies" },
  { k: "livemusic", cat: "music", th: "ดูดนตรีสด", en: "Live music", qTh: "หาเพื่อนไปดูดนตรีสด", qEn: "Live music buddies" },
  { k: "boardgame", cat: "games", th: "บอร์ดเกม", en: "Board games", qTh: "หาเพื่อนเล่นบอร์ดเกม", qEn: "Board game groups" },
  { k: "cards", cat: "games", th: "เกมการ์ด", en: "Card games", qTh: "หาเพื่อนเล่นการ์ดเกม", qEn: "Card game players" },
  { k: "werewolf", cat: "games", th: "เกมหมาป่า", en: "Party games", qTh: "หาคนเล่นเกมหมาป่า", qEn: "Werewolf & party games" },
  { k: "chess", cat: "games", th: "หมากรุก", en: "Chess", qTh: "หาคู่เล่นหมากรุก", qEn: "Chess partners" },
  { k: "videogame", cat: "games", th: "เกมคอนโซล", en: "Video games", qTh: "หาเพื่อนเล่นเกม", qEn: "Gaming buddies" },
  { k: "run", cat: "outdoor", th: "วิ่ง", en: "Running", qTh: "หาเพื่อนวิ่ง", qEn: "Running buddies" },
  { k: "bike", cat: "outdoor", th: "ปั่นจักรยาน", en: "Cycling", qTh: "หาเพื่อนปั่นจักรยาน", qEn: "Cycling groups" },
  { k: "walk", cat: "outdoor", th: "เดินเล่น", en: "Walks", qTh: "หาเพื่อนเดินเล่น", qEn: "Walking groups" },
  { k: "yoga", cat: "outdoor", th: "โยคะ", en: "Yoga", qTh: "หาเพื่อนเล่นโยคะในสวน", qEn: "Yoga in the park" },
  { k: "photo", cat: "outdoor", th: "เดินถ่ายรูป", en: "Photo walks", qTh: "หาเพื่อนเดินถ่ายรูป", qEn: "Photo walks" },
  { k: "sketch", cat: "make", th: "วาดรูป", en: "Sketching", qTh: "หาเพื่อนนั่งวาดรูป", qEn: "Sketching meetups" },
  { k: "craft", cat: "make", th: "งานฝีมือ", en: "Crafts", qTh: "หาเพื่อนทำงานฝีมือ", qEn: "Craft meetups" },
  { k: "bookclub", cat: "make", th: "อ่านหนังสือ", en: "Book club", qTh: "หาเพื่อนอ่านหนังสือ", qEn: "Book clubs" },
  { k: "cowork", cat: "make", th: "นั่งทำงาน", en: "Co-working", qTh: "หาเพื่อนนั่งทำงาน", qEn: "Co-working buddies" },
];

const AREAS: { k: string; th: string; en: string; lat: number; lng: number; km: number }[] = [
  { k: "bangkok", th: "กรุงเทพฯ", en: "Bangkok", lat: 13.7563, lng: 100.5018, km: 30 },
  { k: "ladprao", th: "ลาดพร้าว", en: "Lat Phrao", lat: 13.816, lng: 100.596, km: 4 },
  { k: "chatuchak", th: "จตุจักร", en: "Chatuchak", lat: 13.8285, lng: 100.559, km: 3.5 },
  { k: "ari", th: "อารีย์", en: "Ari", lat: 13.7797, lng: 100.5446, km: 2.5 },
  { k: "bang-sue", th: "บางซื่อ", en: "Bang Sue", lat: 13.804, lng: 100.534, km: 3 },
  { k: "ratchathewi", th: "ราชเทวี", en: "Ratchathewi", lat: 13.7586, lng: 100.534, km: 2.5 },
  { k: "siam", th: "สยาม ปทุมวัน", en: "Siam & Pathum Wan", lat: 13.7454, lng: 100.534, km: 2.5 },
  { k: "silom-sathorn", th: "สีลม สาทร", en: "Silom & Sathorn", lat: 13.7246, lng: 100.53, km: 2.5 },
  { k: "sukhumvit", th: "สุขุมวิท", en: "Sukhumvit", lat: 13.733, lng: 100.57, km: 3 },
  { k: "rama9", th: "พระราม 9 ห้วยขวาง", en: "Rama 9 & Huai Khwang", lat: 13.757, lng: 100.565, km: 3 },
  { k: "onnut", th: "อ่อนนุช", en: "On Nut", lat: 13.705, lng: 100.601, km: 3 },
  { k: "bangna", th: "บางนา", en: "Bang Na", lat: 13.668, lng: 100.605, km: 4 },
  { k: "bangkapi", th: "บางกะปิ", en: "Bang Kapi", lat: 13.765, lng: 100.647, km: 4 },
  { k: "thonburi", th: "ฝั่งธนบุรี", en: "Thonburi", lat: 13.723, lng: 100.486, km: 4 },
  { k: "taling-chan", th: "ตลิ่งชัน", en: "Taling Chan", lat: 13.777, lng: 100.456, km: 4 },
  { k: "nonthaburi", th: "นนทบุรี", en: "Nonthaburi", lat: 13.859, lng: 100.521, km: 5 },
  { k: "don-mueang", th: "ดอนเมือง", en: "Don Mueang", lat: 13.913, lng: 100.6, km: 5 },
];

const BLURB: Record<Cat, Record<Lang, (a: string) => string>> = {
  sport: {
    th: (a) => `จองคอร์ตไว้แล้วแต่ขาดคน หรืออยากเล่น${a}แต่ไม่มีก๊วน บนแถวคนแถวนี้ปักก๊วนไว้บนแผนที่ บอกว่าขาดกี่คน เล่นที่ไหน กี่โมง ระดับไหน แล้วกดจอยได้ทันที มือใหม่ก็หาก๊วนชิลๆ ได้`,
    en: (a) => `Court booked but short of players, or want to play ${a} and don't have a group? On แถว (Thaew) people nearby pin a game on the map with how many they need, where, when and what level, and you join in one tap. Beginners welcome in casual games.`,
  },
  music: {
    th: (a) => `อยากเล่นดนตรีกับคนอื่นแต่ไม่รู้จะหาใคร บนแถวมีคนชวน${a}แถวบ้าน บอกว่าขาดเครื่องอะไร นัดที่ไหน แล้วกดจอยได้เลย`,
    en: (a) => `Want to play music with other people? On แถว (Thaew) people nearby post ${a} meetups with what's missing and where, and you join in one tap.`,
  },
  games: {
    th: (a) => `เกมดีต้องมีคนเล่น บนแถวคนแถวนี้ตั้งโต๊ะ${a}ไว้บนแผนที่ บอกว่าเกมอะไร ร้านไหน ขาดกี่คน สอนเล่นมั้ย แล้วกดจอยได้ทันที`,
    en: (a) => `Games need players. On แถว (Thaew) people nearby set up ${a} tables on the map with the game, the café, how many seats are open and whether they'll teach, and you join in one tap.`,
  },
  outdoor: {
    th: (a) => `${a}คนเดียวมันเหงา บนแถวมีคนชวนกันแถวสวนใกล้บ้าน บอกเพซ ระยะ และจุดนัด แล้วกดจอยได้เลย`,
    en: (a) => `${a} is better with company. On แถว (Thaew) people nearby post meetups in local parks with pace, distance and meeting point, and you join in one tap.`,
  },
  make: {
    th: (a) => `หาเพื่อน${a}ด้วยกันแบบไม่ต้องรู้จักกันมาก่อน บนแถวคนแถวนี้ปักนัดไว้บนแผนที่ คาเฟ่ไหน กี่โมง แล้วกดจอยได้ทันที`,
    en: (a) => `Find people for ${a} without knowing anyone first. On แถว (Thaew) people nearby pin a meetup on the map, which café and when, and you join in one tap.`,
  },
};

const UI = {
  th: {
    home: "สำรวจก๊วนในกรุงเทพฯ", upcoming: "ก๊วนที่กำลังจะเริ่ม", none: "ตอนนี้ยังไม่มีก๊วนที่กำลังจะเริ่มตรงนี้ ตั้งก๊วนแรกได้เลย คนแถวนี้จะเห็นทันที",
    recent: (n: number) => `30 วันที่ผ่านมามีก๊วนแถวนี้ ${n} ก๊วน`, need: (n: number) => `ขาด ${n} คน`, open: "ดูบนแผนที่", start: "ตั้งก๊วนแถวนี้",
    how: "ใช้ยังไง", steps: ["เปิดแผนที่ ดูก๊วนรอบตัว ไม่ต้องสมัครก็ดูได้", "กดจอย ล็อกอินด้วย LINE หรือ Google", "หรือตั้งก๊วนเอง ใส่ว่าขาดกี่คน คนแถวนี้เห็นทันที"],
    faq: [["เสียเงินมั้ย", "ฟรีทั้งดูและตั้งก๊วน ค่าสนามหรือค่าใช้จ่ายอื่นคนตั้งก๊วนเขียนบอกไว้ในก๊วน"], ["ต้องโหลดแอปมั้ย", "ไม่ต้อง เปิด thaew.com ในเบราว์เซอร์ได้เลย"], ["ปลอดภัยมั้ย", "คนตั้งก๊วนเลือกได้ว่าจุดนัดและช่องทางติดต่อจะให้เห็นเฉพาะคนที่รับเข้าก๊วน"]],
    otherAreas: "ย่านอื่น", otherActs: "กิจกรรมอื่นในย่านนี้", allActs: "ทุกกิจกรรม", allAreas: "ทุกย่าน",
    title: (q: string, a: string) => `${q} แถว${a} · แถว`, h1: (q: string, a: string) => `${q} แถว${a}`,
    areaTitle: (a: string) => `หาเพื่อนเล่นแถว${a} ตีแบด เตะบอล บอร์ดเกม วิ่ง · แถว`, areaH1: (a: string) => `หาเพื่อนเล่นแถว${a}`,
    homeTitle: "หาเพื่อนเล่นในกรุงเทพฯ ตีแบด เตะบอล บอร์ดเกม วิ่ง ดนตรี · แถว", homeH1: "หาเพื่อนเล่นแถวบ้าน ในกรุงเทพฯ",
    homeLead: "แถวคือแผนที่ก๊วนเล่นแถวบ้าน เลือกกิจกรรมหรือย่าน ดูว่ามีก๊วนอะไรกำลังจะเริ่ม แล้วกดจอยได้เลย", areaLead: (a: string) => `ก๊วนกีฬา บอร์ดเกม ดนตรี และกิจกรรมกลางแจ้งแถว${a} เลือกกิจกรรมที่สนใจได้เลย`,
    switch: "English", starts: (s: string) => `เริ่ม ${s}`,
  },
  en: {
    home: "Explore meetups in Bangkok", upcoming: "Coming up", none: "Nothing coming up here right now. Start the first one: people nearby see it straight away.",
    recent: (n: number) => `${n} meetups here in the last 30 days`, need: (n: number) => `${n} spots open`, open: "Open the map", start: "Start one here",
    how: "How it works", steps: ["Open the map and see what's on around you; no sign-up to look", "Tap join and sign in with LINE or Google", "Or start your own, say how many you need, and people nearby see it"],
    faq: [["Is it free?", "Yes, looking, joining and starting are free. Any court fee or cost is written in the meetup by the host."], ["Do I need an app?", "No, just open thaew.com in your browser. It works in English."], ["Is it safe?", "Hosts can show the exact spot and contact only to people they accept."]],
    otherAreas: "Other areas", otherActs: "Other activities here", allActs: "All activities", allAreas: "All areas",
    title: (q: string, a: string) => `${q} in ${a} · Thaew`, h1: (q: string, a: string) => `${q} in ${a}`,
    areaTitle: (a: string) => `Things to play in ${a}: badminton, football, board games, running · Thaew`, areaH1: (a: string) => `Find people to play with in ${a}`,
    homeTitle: "Find people to play with in Bangkok: badminton, football, board games, running · Thaew", homeH1: "Find people to play with in Bangkok",
    homeLead: "แถว (Thaew) is a live map of casual meetups near you. Pick an activity or an area, see what's starting soon, and join.", areaLead: (a: string) => `Sports, board games, music and outdoor meetups in ${a}. Pick an activity.`,
    switch: "ภาษาไทย", starts: (s: string) => `Starts ${s}`,
  },
};

interface Row { id: string; title: string; category: Cat; sub: string | null; starts_at: string; ends_at: string; area_name: string; rough_lat: number; rough_lng: number; need: number }

// Cloudflare Web Analytics (cookieless page views); same token as index.html
const BEACON = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "51b9996e7a2e4fdba006026c94885ad7"}'></script>`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const when = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(iso));

async function rows(env: SeoEnv): Promise<Row[]> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/pulses?select=id,title,category,sub,starts_at,ends_at,area_name,rough_lat,rough_lng,need&ends_at=gt.${since}&order=starts_at.asc&limit=2000`, {
    headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
  });
  return r.ok ? ((await r.json()) as Row[]) : [];
}

const inArea = (p: Row, a: (typeof AREAS)[number]) => km({ lat: p.rough_lat, lng: p.rough_lng }, a) <= a.km;
const ofAct = (p: Row, k: string | null) => !k || p.sub === k;

function page(o: { lang: Lang; path: string; alt: string; title: string; h1: string; lead: string; body: string; index: boolean; color: string; ld: unknown[] }) {
  const base = "https://thaew.com";
  return `<!doctype html><html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title><meta name="description" content="${esc(o.lead)}">
${o.index ? "" : '<meta name="robots" content="noindex,follow">'}
<link rel="canonical" href="${base}${o.path}"><link rel="alternate" hreflang="${o.lang}" href="${base}${o.path}"><link rel="alternate" hreflang="${o.lang === "th" ? "en" : "th"}" href="${base}${o.alt}">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.lead)}"><meta property="og:image" content="${base}/og.png"><meta property="og:type" content="website">
<link rel="icon" type="image/png" href="/favicon-32.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;600;700&display=swap">
<style>:root{--bg:#f6f8f8;--panel:#fff;--fg:#14211f;--muted:#5d6d6b;--line:#d6dfdf;--accent:#ff5a36;--cat:${o.color}}
@media (prefers-color-scheme:dark){:root{--bg:#0d1416;--panel:#141d20;--fg:#e6eeec;--muted:#93a4a1;--line:#25343a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:Anuphan,system-ui,sans-serif;line-height:1.6}
main{max-width:860px;margin:0 auto;padding:20px 16px 60px}a{color:inherit}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}.brand{display:flex;gap:8px;align-items:center;font-weight:700;font-size:22px;text-decoration:none}
.brand i{width:14px;height:14px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(255,90,54,.25)}
h1{font-size:clamp(28px,6vw,40px);line-height:1.2;margin:0 0 10px}h2{font-size:20px;margin:30px 0 10px}.lead{color:var(--muted);margin:0 0 18px}
.cta{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 8px}.btn{display:inline-block;padding:10px 18px;border-radius:999px;font-weight:700;text-decoration:none;border:1px solid var(--line)}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#1a0a05}
.card{display:block;background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--cat);border-radius:14px;padding:12px 14px;margin:10px 0;text-decoration:none}
.card b{display:block;font-size:17px}.card span{color:var(--muted);font-size:14px}
.empty{background:var(--panel);border:1px dashed var(--line);border-radius:14px;padding:16px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chips a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:14px;background:var(--panel)}
ol{padding-left:20px}dt{font-weight:700;margin-top:10px}dd{margin:0;color:var(--muted)}footer{margin-top:40px;color:var(--muted);font-size:13px}</style>
${o.ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("")}
</head><body><main><div class="top"><a class="brand" href="/${o.lang}"><i></i>แถว</a><a href="${o.alt}">${esc(UI[o.lang].switch)}</a></div>
<h1>${esc(o.h1)}</h1><p class="lead">${esc(o.lead)}</p>${o.body}
<footer><a href="/">thaew.com</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></footer></main>${BEACON}</body></html>`;
}

function list(ps: Row[], lang: Lang) {
  const L = UI[lang], now = Date.now();
  const up = ps.filter((p) => Date.parse(p.ends_at) > now).slice(0, 30);
  const past = ps.filter((p) => Date.parse(p.ends_at) <= now && now - Date.parse(p.ends_at) < 30 * 86_400_000).length;
  let h = `<h2>${L.upcoming}</h2>`;
  h += up.length ? up.map((p) => `<a class="card" href="/?p=${p.id}"><b>${esc(p.title)}</b><span>${esc(L.starts(when(p.starts_at, lang)))} · ${esc(p.area_name)} · ${esc(L.need(p.need))}</span></a>`).join("")
    : `<div class="empty">${L.none}</div>`;
  if (past) h += `<p class="lead" style="margin-top:12px">${L.recent(past)}</p>`;
  const ld = up.map((p) => ({
    "@context": "https://schema.org", "@type": "Event", name: p.title, startDate: p.starts_at, endDate: p.ends_at,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", eventStatus: "https://schema.org/EventScheduled", isAccessibleForFree: true,
    location: { "@type": "Place", name: p.area_name, address: { "@type": "PostalAddress", addressLocality: p.area_name, addressRegion: "Bangkok", addressCountry: "TH" } },
    organizer: { "@type": "Organization", name: "แถว Thaew", url: "https://thaew.com" }, url: `https://thaew.com/?p=${p.id}`,
  }));
  return { html: h, ld, has: up.length + past > 0 };
}

const howFaq = (lang: Lang) => {
  const L = UI[lang];
  return `<h2>${L.how}</h2><ol>${L.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><h2>FAQ</h2><dl>${L.faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl>`;
};
const faqLd = (lang: Lang) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: UI[lang].faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
const chips = (items: { href: string; label: string }[]) => `<div class="chips">${items.map((i) => `<a href="${i.href}">${esc(i.label)}</a>`).join("")}</div>`;

/** Handles /th, /en, /th/<area>, /th/<activity>, /th/<activity>/<area> (and /en/…). Returns null when the path isn't ours. */
export async function seoPage(url: URL, env: SeoEnv): Promise<Response | null> {
  const m = url.pathname.replace(/\/+$/, "").match(/^\/(th|en)(?:\/([a-z0-9-]+))?(?:\/([a-z0-9-]+))?$/);
  if (!m) return null;
  const lang = m[1] as Lang, L = UI[lang], other: Lang = lang === "th" ? "en" : "th";
  const actA = ACTS.find((a) => a.k === m[2]), areaA = AREAS.find((a) => a.k === m[2]);
  const act = actA ?? null, area = actA ? AREAS.find((a) => a.k === (m[3] ?? "bangkok")) ?? null : areaA ?? null;
  if ((m[2] && !act && !area) || (m[3] && !(act && area))) return null;
  const all = await rows(env);
  const nm = (a: { th: string; en: string }) => (lang === "th" ? a.th : a.en);
  const at = (a: (typeof AREAS)[number]) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}`;
  let o: Parameters<typeof page>[0];

  if (act) {
    const ar = area ?? AREAS[0];
    const ps = all.filter((p) => ofAct(p, act.k) && inArea(p, ar));
    const li = list(ps, lang), q = lang === "th" ? act.qTh : act.qEn;
    const path = `/${lang}/${act.k}${ar.k === "bangkok" ? "" : `/${ar.k}`}`;
    const body = `<div class="cta"><a class="btn pri" href="/?new=1&sub=${act.k}&at=${at(ar)}">${L.start}</a><a class="btn" href="/?sub=${act.k}&at=${at(ar)}">${L.open}</a></div>`
      + li.html + `<p>${esc(BLURB[act.cat][lang](nm(act)))}</p>` + howFaq(lang)
      + `<h2>${L.otherAreas}</h2>` + chips(AREAS.filter((a) => a.k !== ar.k).map((a) => ({ href: `/${lang}/${act.k}${a.k === "bangkok" ? "" : `/${a.k}`}`, label: nm(a) })))
      + `<h2>${L.otherActs}</h2>` + chips(ACTS.filter((a) => a.k !== act.k).map((a) => ({ href: `/${lang}/${a.k}${ar.k === "bangkok" ? "" : `/${ar.k}`}`, label: nm(a) })));
    o = { lang, path, alt: path.replace(/^\/(th|en)/, `/${other}`), title: L.title(q, nm(ar)), h1: L.h1(q, nm(ar)), lead: lang === "th" ? `${q} แถว${nm(ar)} ดูก๊วนที่กำลังจะเริ่มแล้วกดจอยได้เลย หรือตั้งก๊วนเองให้คนแถวนี้เห็น ฟรี ไม่ต้องโหลดแอป`
        : `${q} in ${nm(ar)}: see what's starting soon and join, or start one for people nearby to see. Free, no app needed.`,
      body, index: ar.k === "bangkok" || li.has, color: CAT[act.cat].color, ld: [...li.ld, faqLd(lang)] };
  } else if (area && area.k !== "bangkok") {
    const ps = all.filter((p) => inArea(p, area));
    const li = list(ps, lang), path = `/${lang}/${area.k}`;
    const body = `<div class="cta"><a class="btn pri" href="/?new=1&at=${at(area)}">${L.start}</a><a class="btn" href="/?at=${at(area)}">${L.open}</a></div>`
      + li.html + `<h2>${L.allActs}</h2>` + chips(ACTS.map((a) => ({ href: `/${lang}/${a.k}/${area.k}`, label: nm(a) }))) + howFaq(lang)
      + `<h2>${L.otherAreas}</h2>` + chips(AREAS.filter((a) => a.k !== area.k && a.k !== "bangkok").map((a) => ({ href: `/${lang}/${a.k}`, label: nm(a) })));
    o = { lang, path, alt: `/${other}/${area.k}`, title: L.areaTitle(nm(area)), h1: L.areaH1(nm(area)), lead: L.areaLead(nm(area)), body, index: true, color: "#ff5a36", ld: [...li.ld, faqLd(lang)] };
  } else {
    const li = list(all, lang), path = `/${lang}`;
    const body = `<div class="cta"><a class="btn pri" href="/">${L.open}</a></div>`
      + `<h2>${L.allActs}</h2>` + chips(ACTS.map((a) => ({ href: `/${lang}/${a.k}`, label: nm(a) })))
      + `<h2>${L.allAreas}</h2>` + chips(AREAS.filter((a) => a.k !== "bangkok").map((a) => ({ href: `/${lang}/${a.k}`, label: nm(a) })))
      + li.html + howFaq(lang);
    o = { lang, path, alt: `/${other}`, title: L.homeTitle, h1: L.homeH1, lead: L.homeLead, body, index: true, color: "#ff5a36", ld: [...li.ld, faqLd(lang)] };
  }
  return new Response(page(o), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600" } });
}

/** sitemap.xml: hubs always; activity × area pages only when something happened there in the last 90 days; upcoming ก๊วน. */
export async function sitemap(env: SeoEnv): Promise<Response> {
  const all = await rows(env), base = "https://thaew.com", urls: string[] = [`${base}/`];
  for (const l of ["th", "en"]) {
    urls.push(`${base}/${l}`);
    for (const a of ACTS) urls.push(`${base}/${l}/${a.k}`);
    for (const ar of AREAS) if (ar.k !== "bangkok") urls.push(`${base}/${l}/${ar.k}`);
    for (const a of ACTS) for (const ar of AREAS) if (ar.k !== "bangkok" && all.some((p) => ofAct(p, a.k) && inArea(p, ar))) urls.push(`${base}/${l}/${a.k}/${ar.k}`);
  }
  for (const p of all) if (Date.parse(p.ends_at) > Date.now()) urls.push(`${base}/?p=${p.id}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
