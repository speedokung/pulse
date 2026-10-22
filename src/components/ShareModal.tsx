import { useEffect, useState } from "react";
import type { Pulse } from "../lib/types";
import { appUrl, Lang, linkFor, pulseCaption } from "../lib/captions";
import { drawCard, drawPoster, shareImage } from "../lib/shareCard";
import { isOver } from "../lib/pulse";
import { copy } from "./GrowTab";

export function ShareModal({ target, lang, setLang, onClose, toast }: {
  target: Pulse | "poster"; lang: Lang; setLang: (l: Lang) => void; onClose: () => void; toast: (s: string) => void;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const poster = target === "poster";
  useEffect(() => {
    let dead = false;
    (poster ? drawPoster() : drawCard(target)).then((c) => { if (!dead) setCanvas(c); });
    return () => { dead = true; };
  }, [target, poster]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const caption = poster ? "" : pulseCaption(target, lang);
  const link = poster ? appUrl() : linkFor(target);
  const file = poster ? "pulse-poster.png" : `pulse-${target.title.replace(/[^\w]+/g, "-").toLowerCase().slice(0, 30)}.png`;
  const note = poster ? "A4 portrait. Print it and put it up where pickup games already happen."
    : isOver(target) ? "Recaps show finished meetups, so people can see that others really turn up."
    : target.visibility === "all" ? "The card shows the exact spot." : "The card shows only the rough area, because this Pulse shares its exact spot with accepted people only.";

  const share = async () => {
    if (!canvas) return;
    try { const r = await shareImage(canvas, file, caption || link); toast(r === "shared" ? "Shared." : "Image saved."); }
    catch (e) { if ((e as DOMException)?.name !== "AbortError") toast("Couldn't share. Try saving the image instead."); }
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mbox" role="dialog" aria-modal="true" aria-labelledby="m-h">
        <h3 id="m-h">{poster ? "QR poster" : isOver(target) ? "Recap card" : "Share card"}</h3>
        {canvas ? <img src={canvas.toDataURL("image/png")} alt="Share image preview" /> : <div className="imgph">Drawing…</div>}
        <div className="sub">{note}</div>
        {!poster && (
          <>
            <div className="seg" role="group" aria-label="Caption language">
              {(["en", "th"] as Lang[]).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l === "en" ? "English" : "ไทย"}</button>)}
            </div>
            <textarea readOnly value={caption} aria-label="Caption" />
          </>
        )}
        <div className="btns">
          <button className="ghostbtn" onClick={onClose}>Close</button>
          <button className="ghostbtn" onClick={() => copy(link, toast)}>Copy link</button>
          {!poster && <button className="ghostbtn" onClick={() => copy(caption, toast)}>Copy caption</button>}
          <button className="go" onClick={share} disabled={!canvas}>Share image</button>
        </div>
      </div>
    </div>
  );
}
