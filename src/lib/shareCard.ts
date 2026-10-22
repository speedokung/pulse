// Share cards (4:5, for stories / LINE / feeds) and an A4 QR poster, drawn on canvas.
import QRCode from "qrcode";
import type { Pulse } from "./types";
import { CATS } from "./categories";
import { accepted, isOver, openSpots, status } from "./pulse";
import { ago, clock } from "./format";
import { appUrl, linkFor } from "./captions";

const FD = '"Bricolage Grotesque","Noto Sans Thai",sans-serif';
const FB = '"Instrument Sans","Noto Sans Thai",sans-serif';
const FM = '"IBM Plex Mono","Noto Sans Thai",monospace';

async function qr(text: string, size: number) {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, text, { width: size, margin: 1, color: { dark: "#14211f", light: "#ffffff" } });
  return c;
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []; let cur = "";
  for (const w of text.split(/(\s+)/)) {
    const t = cur + w;
    if (ctx.measureText(t).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = w.trimStart(); } else cur = t;
  }
  if (cur.trim()) lines.push(cur.trim());
  // Thai has no spaces between words: break long runs by character
  return lines.flatMap((l) => {
    if (ctx.measureText(l).width <= maxW) return [l];
    const out: string[] = []; let c = "";
    for (const ch of l) { if (ctx.measureText(c + ch).width > maxW) { out.push(c); c = ch; } else c += ch; }
    if (c) out.push(c);
    return out;
  });
}
function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(x + 16, y - 16, 16, 0, 7); ctx.fill();
  ctx.font = `800 52px ${FD}`; ctx.fillText("Pulse", x + 46, y);
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

export async function drawCard(p: Pulse): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const past = isOver(p), o = openSpots(p), st = status(p);
  ctx.fillStyle = past ? "#14211f" : CATS[p.category].color; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 3;
  for (let r = 120; r < 1100; r += 110) { ctx.beginPath(); ctx.arc(W - 120, 260, r, 0, 7); ctx.stroke(); }
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(W - 120, 260, 26, 0, 7); ctx.fill();
  wordmark(ctx, 80, 130);
  ctx.font = `500 34px ${FM}`; ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText(past ? `RECAP · ${CATS[p.category].name.toUpperCase()}` : o > 0 ? `NEED ${o} MORE` : "FULL HOUSE", 80, 300);
  ctx.font = `800 104px ${FD}`; ctx.fillStyle = "#ffffff";
  const tl = wrap(ctx, p.title, W - 160).slice(0, 4);
  tl.forEach((l, i) => ctx.fillText(l, 80, 420 + i * 112));
  let y = 420 + tl.length * 112 + 40;
  ctx.font = `600 44px ${FB}`; ctx.fillStyle = "rgba(255,255,255,.92)";
  const n = accepted(p).length + 1;
  ctx.fillText(past ? `${n} people met up · ${ago(p.ends_at)}` : st.k === "live" ? `Happening now · ${st.left} min left` : `Starts ${clock(p.starts_at)}`, 80, y);
  y += 62;
  const place = !past && p.visibility === "all" && p.exact ? p.exact.place_name : `Around ${p.area_name}`;
  wrap(ctx, place, W - 160).slice(0, 2).forEach((l) => { ctx.fillText(l, 80, y); y += 58; });
  ctx.fillStyle = "#ffffff"; rrect(ctx, 60, H - 330, W - 120, 270, 28); ctx.fill();
  ctx.drawImage(await qr(linkFor(p), 220), 90, H - 305, 220, 220);
  ctx.fillStyle = "#14211f"; ctx.font = `800 52px ${FD}`; ctx.fillText(past ? "Catch the next one" : "Scan to join", 340, H - 215);
  ctx.font = `500 30px ${FB}`; ctx.fillStyle = "#5d6d6b";
  wrap(ctx, "Live map of casual meetups happening near you right now", W - 440).slice(0, 2).forEach((l, i) => ctx.fillText(l, 340, H - 160 + i * 40));
  return c;
}

export async function drawPoster(): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const W = 1240, H = 1754, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ff5a36"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 4;
  for (let r = 90; r < 1600; r += 120) { ctx.beginPath(); ctx.arc(W / 2, 640, r, 0, 7); ctx.stroke(); }
  wordmark(ctx, 90, 150);
  ctx.fillStyle = "#ffffff"; ctx.font = `800 118px ${FD}`;
  ["Need someone", "to play with?"].forEach((l, i) => ctx.fillText(l, 90, 330 + i * 126));
  ctx.font = `600 52px "Noto Sans Thai",${FB}`; ctx.fillText("หาเพื่อนเล่นแถวนี้ ตอนนี้เลย", 90, 560);
  rrect(ctx, W / 2 - 330, 650, 660, 660, 36); ctx.fill();
  ctx.drawImage(await qr(appUrl(), 560), W / 2 - 280, 700, 560, 560);
  ctx.textAlign = "center"; ctx.font = `800 64px ${FD}`; ctx.fillText("Scan to see what's on nearby", W / 2, 1420);
  ctx.font = `500 40px ${FB}`;
  wrap(ctx, "Pickleball, board games, jams, runs. Join with one tap or drop your own Pulse.", W - 220).forEach((l, i) => ctx.fillText(l, W / 2, 1490 + i * 52));
  ctx.font = `500 30px ${FM}`; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillText("Free · no sign-up needed to look", W / 2, 1660);
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
