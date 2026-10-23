import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Contact, Pulse, Signal } from "../lib/types";
import { errText, loadMessages, subscribeChat } from "../lib/api";
import { isHost, isOver, isParticipant, ms } from "../lib/pulse";
import { clock } from "../lib/format";
import { t, type Key } from "../lib/i18n";
import { Avatar, Lock, mySignal, SignalSummary, signalsOf, type Actions } from "./ui";

const lineUrl = (id: string) => `https://line.me/ti/p/~${encodeURIComponent(id.replace(/^@/, ""))}`;
const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Host's LINE / phone / landmark. Shown only to the host and accepted people (the server enforces it). */
export function ContactBox({ p, uid, a }: { p: Pulse; uid: string | null; a: Actions }) {
  const host = isHost(p, uid), member = isParticipant(p, uid) || host;
  const [editing, setEditing] = useState(false);
  if (isOver(p) && !member) return null;
  if (!member) return <div className="lockline"><Lock /><span>{t("cLocked")}</span></div>;

  const c = p.contact;
  if (editing || (host && !c)) {
    if (!editing) return (
      <div className="contact"><div className="contact-h"><b>{t("cTitle")}</b><span className="sub">{t("cMine")}</span></div>
        <button className="mini" onClick={() => setEditing(true)}>{t("cAdd")}</button></div>
    );
    return <ContactEditor initial={c ?? { line_id: null, phone: null, landmark: null }} onCancel={() => setEditing(false)}
      onSave={async (v) => { const ok = await a.saveContact(p, v); if (ok) setEditing(false); }} />;
  }
  return (
    <div className="contact">
      <div className="contact-h"><b>{t("cTitle")}</b>{host && <><span className="sub">{t("cMine")}</span><button className="linkbtn" onClick={() => setEditing(true)}>{t("cEdit")}</button></>}</div>
      {c?.landmark && <div className="landmark"><span>{t("cSpot")}:</span> {c.landmark}</div>}
      {c && (c.line_id || c.phone) ? (
        <div className="btnrow">
          {c.line_id && <a className="mini line" href={lineUrl(c.line_id)} target="_blank" rel="noreferrer">{t("cLine")} · {c.line_id}</a>}
          {c.phone && <a className="mini" href={telUrl(c.phone)}>{t("cCall")} {c.phone}</a>}
        </div>
      ) : !host && <div className="sub">{t("cNone")}</div>}
    </div>
  );
}

function ContactEditor({ initial, onSave, onCancel }: { initial: Contact; onSave: (c: Contact) => void; onCancel: () => void }) {
  const [line, setLine] = useState(initial.line_id ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [mark, setMark] = useState(initial.landmark ?? "");
  return (
    <form className="contact" onSubmit={(e) => { e.preventDefault(); onSave({ line_id: line.trim().replace(/^@/, "") || null, phone: phone.trim() || null, landmark: mark.trim() || null }); }}>
      <div className="contact-h"><b>{t("cTitle")}</b><span className="sub">{t("cMine")}</span></div>
      <div className="grid2">
        <label className="f" htmlFor="ce-line">{t("fLine")}<input id="ce-line" type="text" maxLength={40} value={line} onChange={(e) => setLine(e.target.value)} placeholder={t("fLinePh")} /></label>
        <label className="f" htmlFor="ce-phone">{t("fPhone")}<input id="ce-phone" type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("fPhonePh")} /></label>
      </div>
      <label className="f" htmlFor="ce-mark">{t("fLandmark")}<input id="ce-mark" type="text" maxLength={120} value={mark} onChange={(e) => setMark(e.target.value)} placeholder={t("fLandmarkPh")} /></label>
      <div className="btnrow" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="mini" onClick={onCancel}>{t("cancel")}</button>
        <button type="submit" className="mini pri">{t("pfSave")}</button>
      </div>
    </form>
  );
}

const QUICK: Key[] = ["qrHere", "qr5", "qrWhere", "qrWave", "qrLate"];

/** Private chat for the host and accepted people, open until 6 h after the end. */
export function GroupChat({ p, uid, a }: { p: Pulse; uid: string | null; a: Actions }) {
  const member = isParticipant(p, uid) || isHost(p, uid);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const open = Date.now() < ms(p.ends_at) + 6 * 3_600_000;

  useEffect(() => {
    if (!member) return;
    let dead = false;
    const load = () => loadMessages(p.id).then((m) => { if (!dead) { setMsgs(m); setErr(null); } }).catch((e) => { if (!dead) setErr(errText(e)); });
    load();
    const off = subscribeChat(p.id, load);
    return () => { dead = true; off(); };
  }, [p.id, member]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs.length]);

  if (!member) return null;
  const send = async (body: string) => {
    const b = body.trim(); if (!b || busy) return;
    setBusy(true);
    const ok = await a.chat(p, b);
    setBusy(false);
    if (ok) setText("");
  };
  return (
    <div className="chat">
      <div className="contact-h"><b>{t("chatTitle")}</b><span className="sub">{t("chatWho")}</span></div>
      <div className="chat-list" ref={list}>
        {err && <div className="sub">{err}</div>}
        {!msgs.length && !err && <div className="sub">{t("chatEmpty")}</div>}
        {msgs.map((m) => {
          const mine = m.author_id === uid;
          return (
            <div key={m.id} className={`msg${mine ? " mine" : ""}`}>
              {!mine && <Avatar name={m.author?.display_name} url={m.author?.avatar_url} size={22} />}
              <div className="bubble">
                {!mine && <b>{m.author?.display_name || t("someone")}{m.author_id === p.host_id ? ` · ${t("host")}` : ""}</b>}
                <span>{m.body}</span>
                <time>{clock(m.created_at)}</time>
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <>
          <div className="quick">{QUICK.map((k) => <button key={k} type="button" className="chip" disabled={busy} onClick={() => send(t(k))}>{t(k)}</button>)}</div>
          <form className="chat-in" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input id={`chat-${p.id}`} type="text" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("chatPh")} aria-label={t("chatPh")} />
            <button className="mini pri" type="submit" disabled={busy || !text.trim()}>{t("chatSend")}</button>
          </form>
        </>
      )}
    </div>
  );
}

const ETAS = [5, 10, 20, 30];
/** "Interested" for people deciding, "On my way · 10 min" for people who joined, and the list for the host. */
export function SignalsBox({ p, uid, a }: { p: Pulse; uid: string | null; a: Actions }) {
  if (isOver(p)) return null;
  const host = isHost(p, uid), member = isParticipant(p, uid);
  const mine = mySignal(p, uid);
  const sig = signalsOf(p);
  if (host) {
    const coming = sig.filter((s) => s.kind === "omw");
    const name = (id: string) => p.memberships.find((m) => m.user_id === id)?.profile?.display_name || t("someone");
    const arrive = (s: Signal) => Math.max(1, Math.round((ms(s.updated_at) + (s.eta_min ?? 0) * 60_000 - Date.now()) / 60_000));
    const ints = sig.filter((s) => s.kind === "interested").length;
    if (!coming.length && !ints) return null;
    return (
      <div className="signalbox">
        {coming.length > 0 && <div><b>{t("sComingList")}:</b> {coming.map((s) => `${name(s.user_id)} ${t("sEta", { n: arrive(s) })}`).join(", ")}</div>}
        {ints > 0 && <div className="sub">{t("sInterestedN", { n: ints })}</div>}
      </div>
    );
  }
  if (member) {
    if (mine?.kind === "omw") {
      const at = clock(ms(mine.updated_at) + (mine.eta_min ?? 0) * 60_000);
      return <div className="signalbox row"><span>{t("sYouOmw", { t: at })}</span><button className="mini" onClick={() => a.signal(p, null)}>{t("sCancel")}</button></div>;
    }
    return (
      <div className="signalbox row">
        <b>{t("sOmw")}</b>
        {ETAS.map((n) => <button key={n} className="chip" onClick={() => a.signal(p, "omw", n)}>{t("sOmwIn", { n })}</button>)}
      </div>
    );
  }
  const on = mine?.kind === "interested";
  return (
    <div className="signalbox row">
      <button className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => a.signal(p, on ? null : "interested")}>{on ? `★ ${t("sInterestedOn")}` : `☆ ${t("sInterested")}`}</button>
      <SignalSummary p={p} />
    </div>
  );
}
