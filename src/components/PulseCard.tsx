import type { LatLng, Pulse } from "../lib/types";
import { accepted, isOver, pos } from "../lib/pulse";
import { distanceM } from "../lib/geo";
import { dist, walkMin } from "../lib/format";
import { Actions, Glyph, HostLine, JoinButton, NavButton, Place, Seats, SignalSummary, signalsOf, Tags, When } from "./ui";
import { t } from "../lib/i18n";

export function PulseCard({ p, uid, me, sel, a }: { p: Pulse; uid: string | null; me: LatLng; sel: boolean; a: Actions }) {
  const d = distanceM(me, pos(p)), past = isOver(p);
  return (
    <div className={`card${past ? " past" : ""}${sel ? " sel" : ""}`} onClick={() => a.select(p.id)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") a.select(p.id); }}>
      <Glyph p={p} />
      <div className="cbody">
        <p className="ctitle">{p.title} <Tags p={p} /></p>
        <div className="meta"><When p={p} /></div>
        <div className="meta"><Place p={p} /><span>{dist(d)}{past ? "" : ` · ${t("walk", { n: walkMin(d) })}`}</span><HostLine p={p} uid={uid} /></div>
        {!past && signalsOf(p).length > 0 && <div className="meta"><SignalSummary p={p} /></div>}
        {past ? (
          <div className="cfoot">
            <span className="meta">{t("metUp", { n: accepted(p).length + 1 })}</span>
            <div className="btnrow">
              <button className="mini" onClick={(e) => { e.stopPropagation(); a.again(p); }}>{t("again")}</button>
              <button className="mini pri" onClick={(e) => { e.stopPropagation(); a.share(p); }}>{t("shareRecap")}</button>
            </div>
          </div>
        ) : (
          <div className="cfoot"><Seats p={p} uid={uid} /><div className="btnrow"><NavButton p={p} /><JoinButton p={p} uid={uid} a={a} /></div></div>
        )}
      </div>
    </div>
  );
}
