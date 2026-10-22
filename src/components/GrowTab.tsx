import { useState } from "react";
import type { Pulse } from "../lib/types";
import { nowPost, recapCaption, weekPost } from "../lib/captions";
import type { Lang } from "../lib/i18n";
import { accepted, isOver, ms } from "../lib/pulse";
import { prefs } from "../hooks";
import { t } from "../lib/i18n";

export function copy(text: string, toast: (s: string) => void) {
  navigator.clipboard?.writeText(text).then(() => toast(t("tCopied")), () => toast(t("tCopyFail")));
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
      <label htmlFor={id}>{label}<button className="mini" onClick={() => copy(text, toast)}>{t("copy")}</button></label>
      <textarea id={id} readOnly value={text} />
    </div>
  );
  const Check = ({ k, b, d }: { k: string; b: string; d: string }) => (
    <li><input type="checkbox" id={`ck-${k}`} checked={!!done[k]} onChange={(e) => tick(k, e.target.checked)} /><label htmlFor={`ck-${k}`}><b>{b}</b> {d}</label></li>
  );
  return (
    <div className="grow">
      <section>
        <h3>{t("gShareTitle")}</h3>
        <p>{t("gShareWhy")}</p>
        {selected ? (
          <div className="selbox">
            <b>{selected.title}</b>
            <div className="btnrow"><button className="mini pri" onClick={() => onShare(selected)}>{isOver(selected) ? t("gMakeRecap") : t("gMakeCard")}</button></div>
          </div>
        ) : <div className="selbox sub">{t("gPick")}</div>}
      </section>
      <section>
        <h3>{t("gAutoTitle")}</h3>
        <p>{t("gAutoWhy")}</p>
        <div className="seg" role="group" aria-label={t("captionLang")}>
          {(["en", "th"] as Lang[]).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l === "en" ? "English" : "ไทย"}</button>)}
        </div>
        <Post id="g-now" label={t("gNow")} text={nowPost(pulses, lang)} />
        <Post id="g-week" label={t("gWeekRecap")} text={weekPost(pulses, lang)} />
        {rec && <Post id="g-rec" label={t("gLatest")} text={recapCaption(rec, lang)} />}
      </section>
      <section>
        <h3>{t("gPoster")}</h3>
        <p>{t("gPosterWhy")}</p>
        <button className="go" onClick={onPoster}>{t("gMakePoster")}</button>
      </section>
      <section>
        <h3>{t("gWhereFree")}</h3>
        <ul className="checks">
          <Check k="line" b={t("gLine")} d={t("gLineT")} />
          <Check k="fb" b={t("gFb")} d={t("gFbT")} />
          <Check k="ig" b={t("gIg")} d={t("gIgT")} />
          <Check k="poster" b={t("gPosterC")} d={t("gPosterCT")} />
          <Check k="hosts" b={t("gHosts")} d={t("gHostsT")} />
        </ul>
      </section>
    </div>
  );
}
