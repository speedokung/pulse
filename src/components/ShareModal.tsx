import { useEffect, useState } from "react";
import type { Pulse } from "../lib/types";
import { appUrl, linkFor, pulseCaption } from "../lib/captions";
import type { Lang } from "../lib/i18n";
import { drawCard, drawPoster, shareImage } from "../lib/shareCard";
import { isOver } from "../lib/pulse";
import { copy } from "./GrowTab";
import { t } from "../lib/i18n";

export function ShareModal({ target, lang, setLang, onClose, toast }: {
  target: Pulse | "poster"; lang: Lang; setLang: (l: Lang) => void; onClose: () => void; toast: (s: string) => void;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const poster = target === "poster";
  useEffect(() => {
    let dead = false;
    (poster ? drawPoster() : drawCard(target, lang)).then((c) => { if (!dead) setCanvas(c); });
    return () => { dead = true; };
  }, [target, poster, lang]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const caption = poster ? "" : pulseCaption(target, lang);
  const link = poster ? appUrl() : linkFor(target);
  const file = poster ? "thaew-poster.png" : `thaew-${target.title.replace(/[^\w]+/g, "-").toLowerCase().slice(0, 30)}.png`;
  const note = poster ? t("mPosterNote") : isOver(target) ? t("mRecapNote") : target.visibility === "all" ? t("mExactNote") : t("mRoughNote");

  const share = async () => {
    if (!canvas) return;
    try { const r = await shareImage(canvas, file, caption || link); toast(r === "shared" ? t("tShared") : t("tSaved")); }
    catch (e) { if ((e as DOMException)?.name !== "AbortError") toast(t("tShareFail")); }
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mbox" role="dialog" aria-modal="true" aria-labelledby="m-h">
        <h3 id="m-h">{poster ? t("mPoster") : isOver(target) ? t("mRecapCard") : t("mShareCard")}</h3>
        {canvas ? <img src={canvas.toDataURL("image/png")} alt="" /> : <div className="imgph">{t("mDrawing")}</div>}
        <div className="sub">{note}</div>
        {!poster && (
          <>
            <div className="seg" role="group" aria-label={t("captionLang")}>
              {(["en", "th"] as Lang[]).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l === "en" ? "English" : "ไทย"}</button>)}
            </div>
            <textarea readOnly value={caption} aria-label={t("captionLang")} />
          </>
        )}
        <div className="btns">
          <button className="ghostbtn" onClick={onClose}>{t("close")}</button>
          <button className="ghostbtn" onClick={() => copy(link, toast)}>{t("mCopyLink")}</button>
          {!poster && <button className="ghostbtn" onClick={() => copy(caption, toast)}>{t("mCopyCaption")}</button>}
          <button className="go" onClick={share} disabled={!canvas}>{t("mShareImg")}</button>
        </div>
      </div>
    </div>
  );
}
