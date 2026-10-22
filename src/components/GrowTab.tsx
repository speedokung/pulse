import { useState } from "react";
import type { Pulse } from "../lib/types";
import { Lang, nowPost, recapCaption, weekPost } from "../lib/captions";
import { accepted, isOver, ms } from "../lib/pulse";
import { prefs } from "../hooks";

export function copy(text: string, toast: (s: string) => void) {
  navigator.clipboard?.writeText(text).then(() => toast("Copied."), () => toast("Couldn't copy. Select the text and copy it."));
}

export function GrowTab({ pulses, selected, lang, setLang, onShare, onPoster, toast }: {
  pulses: Pulse[]; selected: Pulse | null; lang: Lang; setLang: (l: Lang) => void;
  onShare: (p: Pulse) => void; onPoster: () => void; toast: (s: string) => void;
}) {
  const [done, setDone] = useState<Record<string, boolean>>(() => prefs.read("checks", {}));
  const tick = (k: string, v: boolean) => { const d = { ...done, [k]: v }; setDone(d); prefs.write("checks", d); };
  const rec = pulses.filter((p) => isOver(p) && accepted(p).length > 0).sort((a, b) => ms(b.ends_at) - ms(a.ends_at))[0];
  const Post = ({ id, label, text }: { id: string; label: string; text: string }) => (
    <div className="post">
      <label htmlFor={id}>{label}<button className="mini" onClick={() => copy(text, toast)}>Copy</button></label>
      <textarea id={id} readOnly value={text} />
    </div>
  );
  const Check = ({ k, b, t }: { k: string; b: string; t: string }) => (
    <li><input type="checkbox" id={`ck-${k}`} checked={!!done[k]} onChange={(e) => tick(k, e.target.checked)} /><label htmlFor={`ck-${k}`}><b>{b}</b> {t}</label></li>
  );
  return (
    <div className="grow">
      <section>
        <h3>Share a Pulse</h3>
        <p>Every Pulse that needs people is an ad for the app. Hosts share to fill their spots, and each share brings new people in.</p>
        {selected ? (
          <div className="selbox">
            <b>{selected.title}</b>
            <div className="btnrow"><button className="mini pri" onClick={() => onShare(selected)}>{isOver(selected) ? "Make recap card" : "Make share card"}</button></div>
          </div>
        ) : <div className="selbox sub">Tap any Pulse on the map or in a list to make its share card.</div>}
      </section>
      <section>
        <h3>Posts that write themselves</h3>
        <p>These rewrite themselves as Pulses start and end. Copy one into LINE, a Facebook group or your story.</p>
        <div className="seg" role="group" aria-label="Post language">
          {(["en", "th"] as Lang[]).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l === "en" ? "English" : "ไทย"}</button>)}
        </div>
        <Post id="g-now" label="Open spots right now" text={nowPost(pulses, lang)} />
        <Post id="g-week" label="This week's recap" text={weekPost(pulses, lang)} />
        {rec && <Post id="g-rec" label="Latest meetup" text={recapCaption(rec, lang)} />}
      </section>
      <section>
        <h3>QR poster</h3>
        <p>Print it for courts, parks, cafés and board game shops, where people already look for someone to play with. Scanning it opens the live map.</p>
        <button className="go" onClick={onPoster}>Make poster</button>
      </section>
      <section>
        <h3>Free places to post</h3>
        <ul className="checks">
          <Check k="line" b="LINE OpenChat groups." t="Join hobby groups (pickleball, running, board games) and paste “Open spots right now” when a Pulse needs people." />
          <Check k="fb" b="Facebook groups." t="Post the weekly recap every Monday in local hobby and neighborhood groups." />
          <Check k="ig" b="Instagram and TikTok stories." t="Share cards are 4:5 and go straight to the share sheet on phones." />
          <Check k="poster" b="QR posters." t="One per spot, where pickup games already happen. Ask the owner first." />
          <Check k="hosts" b="Hosts as promoters." t="Ask your first 10 hosts to share every Pulse. A Pulse with open spots gives them a reason to." />
        </ul>
      </section>
    </div>
  );
}
