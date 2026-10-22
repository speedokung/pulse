// Share cards (4:5, for stories / LINE / feeds) and an A4 QR poster, drawn on canvas.
import QRCode from "qrcode";
import type { Pulse } from "./types";
import { CATS } from "./categories";
import { accepted, isOver, openSpots, status } from "./pulse";
import { ago, dayClock, inLang, span } from "./format";
import { appUrl, linkFor } from "./captions";
import type { Lang } from "./i18n";

const FD = '"Bricolage Grotesque","Anuphan","Noto Sans Thai",sans-serif';
const FB = '"Instrument Sans","Anuphan","Noto Sans Thai",sans-serif';
const FT = '"Anuphan","Noto Sans Thai",sans-serif';

async function qr(text: string, size: number) {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, text, { width: size, margin: 1, color: { dark: "#14211f", light: "#ffffff" } });
  return c;
}

/** Word-wrap that understands Thai (no spaces between words) via Intl.Segmenter. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  const pieces = Seg ? [...new Seg("th", { granularity: "word" }).segment(text)].map((s) => s.segment) : text.split(/(\s+)/);
  const lines: string[] = []; let cur = "";
  for (const w of pieces) {
    const next = cur + w;
    if (ctx.measureText(next).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = w.trimStart(); } else cur = next;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(x + 16, y - 18, 16, 0, 7); ctx.fill();
  ctx.font = `700 60px ${FT}`; ctx.fillText("แถว", x + 46, y);
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

const T = {
  th: {
    recap: (c: string) => `ความทรงจำ · ${c}`, need: (n: number) => `ขาดอีก ${n} คน`, full: "เต็มแล้ว",
    met: (n: number, a: string) => `มาเจอกัน ${n} คน · ${a}`, live: (l: string) => `กำลังเล่นอยู่ · เหลือ ${l}`, starts: (s: string) => `เริ่ม ${s}`,
    around: (a: string) => `แถว${a}`, cta: "สแกนเพื่อจอย", ctaPast: "รอบหน้ามาด้วยกัน", sub: "แผนที่ก๊วนเล่นแถวบ้าน ดูว่าตอนนี้มีอะไรใกล้ตัว",
  },
  en: {
    recap: (c: string) => `RECAP · ${c.toUpperCase()}`, need: (n: number) => `NEED ${n} MORE`, full: "FULL HOUSE",
    met: (n: number, a: string) => `${n} people met up · ${a}`, live: (l: string) => `Happening now · ${l} left`, starts: (s: string) => `Starts ${s}`,
    around: (a: string) => `Around ${a}`, cta: "Scan to join", ctaPast: "Catch the next one", sub: "Live map of casual meetups happening near you right now",
  },
};

export async function drawCard(p: Pulse, lang: Lang = "th"): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const L = T[lang], W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const past = isOver(p), o = openSpots(p), st = status(p);
  ctx.fillStyle = past ? "#14211f" : CATS[p.category].color; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 3;
  for (let r = 120; r < 1100; r += 110) { ctx.beginPath(); ctx.arc(W - 120, 260, r, 0, 7); ctx.stroke(); }
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(W - 120, 260, 26, 0, 7); ctx.fill();
  wordmark(ctx, 80, 130);
  ctx.font = `600 38px ${FT}`; ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillText(past ? L.recap(lang === "th" ? CATS[p.category].th : CATS[p.category].name) : o > 0 ? L.need(o) : L.full, 80, 300);
  ctx.font = `800 100px ${FD}`; ctx.fillStyle = "#ffffff";
  const tl = wrap(ctx, p.title, W - 160).slice(0, 4);
  tl.forEach((l, i) => ctx.fillText(l, 80, 420 + i * 118));
  let y = 420 + tl.length * 118 + 40;
  ctx.font = `600 44px ${FB}`; ctx.fillStyle = "rgba(255,255,255,.92)";
  const n = accepted(p).length + 1;
  inLang(lang, () => ctx.fillText(past ? L.met(n, ago(p.ends_at)) : st.k === "live" ? L.live(span(st.left)) : L.starts(dayClock(p.starts_at)), 80, y));
  y += 64;
  const place = !past && p.visibility === "all" && p.exact ? p.exact.place_name : L.around(p.area_name);
  wrap(ctx, place, W - 160).slice(0, 2).forEach((l) => { ctx.fillText(l, 80, y); y += 60; });
  ctx.fillStyle = "#ffffff"; rrect(ctx, 60, H - 330, W - 120, 270, 28); ctx.fill();
  ctx.drawImage(await qr(linkFor(p), 220), 90, H - 305, 220, 220);
  ctx.fillStyle = "#14211f"; ctx.font = `800 54px ${FD}`; ctx.fillText(past ? L.ctaPast : L.cta, 340, H - 210);
  ctx.font = `500 32px ${FB}`; ctx.fillStyle = "#5d6d6b";
  wrap(ctx, L.sub, W - 440).slice(0, 2).forEach((l, i) => ctx.fillText(l, 340, H - 155 + i * 44));
  return c;
}

export async function drawPoster(): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const W = 1240, H = 1754, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ff5a36"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 4;
  for (let r = 90; r < 1600; r += 120) { ctx.beginPath(); ctx.arc(W / 2, 660, r, 0, 7); ctx.stroke(); }
  wordmark(ctx, 90, 150);
  ctx.fillStyle = "#ffffff"; ctx.font = `800 120px ${FT}`;
  ["หาเพื่อนเล่น", "แถวนี้ ตอนนี้เลย"].forEach((l, i) => ctx.fillText(l, 90, 340 + i * 136));
  ctx.font = `600 46px ${FB}`; ctx.fillText("Need someone to play with nearby?", 90, 560);
  rrect(ctx, W / 2 - 330, 660, 660, 660, 36); ctx.fill();
  ctx.drawImage(await qr(appUrl(), 560), W / 2 - 280, 710, 560, 560);
  ctx.textAlign = "center"; ctx.font = `800 68px ${FT}`; ctx.fillText("สแกนดูว่าแถวนี้มีก๊วนอะไร", W / 2, 1430);
  ctx.font = `500 42px ${FT}`;
  wrap(ctx, "ตีแบด บอร์ดเกม เล่นดนตรี วิ่ง จอยได้ในคลิกเดียว หรือตั้งก๊วนเอง", W - 220).forEach((l, i) => ctx.fillText(l, W / 2, 1500 + i * 56));
  ctx.font = `500 32px ${FB}`; ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fillText("ฟรี · ไม่ต้องสมัครก็ดูได้ · Free, no sign-up to look", W / 2, 1670);
  return c;
}

export const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't make the image"))), "image/png"));

/** Native share sheet with the image (LINE, IG, Messenger…) where the phone supports it, else download. */
export async function shareImage(c: HTMLCanvasElement, filename: string, text: string): Promise<"shared" | "downloaded"> {
  const blob = await toBlob(c);
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return "shared";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}
