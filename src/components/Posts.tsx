import { useRef, useState } from "react";
import type { FeedPost, Pulse } from "../lib/types";
import { photoUrl } from "../lib/supabase";
import { ago } from "../lib/format";
import { isHost } from "../lib/pulse";
import { Avatar, type Actions } from "./ui";
import { t } from "../lib/i18n";

export const photoSrc = (f: FeedPost) => f.local_photo || (f.photo_path ? photoUrl(f.photo_path) : null);

export function PostLine({ f, p, uid }: { f: FeedPost; p: Pulse; uid: string | null }) {
  const who = f.author_id === uid ? t("you") : f.author?.display_name || t("someone");
  const host = f.author_id === p.host_id;
  return (
    <div className="post-line">
      <Avatar name={f.author?.display_name || who} url={f.author?.avatar_url} size={20} />
      <b>{who}</b>{host && <span className="tag">{t("host")}</span>}
      <span className="post-body">
        {f.kind === "checkin" ? t("checkinLine") : f.body}
        {f.kind === "photo" && !f.body ? t("addedPhoto") : ""}
      </span>
      <span className="post-time">{ago(f.created_at)}</span>
    </div>
  );
}

/** Updates, photos and check-ins from the host and accepted people. */
export function Composer({ p, uid, a }: { p: Pulse; uid: string | null; a: Actions }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const send = async (kind: FeedPost["kind"]) => {
    if (kind !== "checkin" && !text.trim() && !file) return;
    setBusy(true);
    const ok = await a.post(p, kind, kind === "checkin" ? null : text.trim() || null, kind === "checkin" ? null : file);
    setBusy(false);
    if (ok && kind !== "checkin") { setText(""); setFile(null); if (inp.current) inp.current.value = ""; }
  };
  return (
    <div className="composer" onClick={(e) => e.stopPropagation()}>
      <textarea id={`c-${p.id}`} value={text} maxLength={280} rows={2}
        placeholder={isHost(p, uid) ? t("composeHost") : t("composeGuest")}
        onChange={(e) => setText(e.target.value)} aria-label={t("post")} />
      <div className="composer-row">
        <label className="mini file">
          <input ref={inp} type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? t("photoReady") : t("addPhoto")}
        </label>
        {!isHost(p, uid) && <button className="mini" disabled={busy} onClick={() => send("checkin")}>{t("imHere")}</button>}
        <button className="mini pri" disabled={busy || (!text.trim() && !file)} onClick={() => send(file ? "photo" : "update")}>{busy ? t("posting") : t("post")}</button>
      </div>
    </div>
  );
}
