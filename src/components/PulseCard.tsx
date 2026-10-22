import type { LatLng, Pulse } from "../lib/types";
import { accepted, isOver, pos } from "../lib/pulse";
import { distanceM } from "../lib/geo";
import { dist, walkMin } from "../lib/format";
import { Actions, by, Glyph, JoinButton, NavButton, Place, Seats, When } from "./ui";

export function PulseCard({ p, uid, me, sel, a }: { p: Pulse; uid: string | null; me: LatLng; sel: boolean; a: Actions }) {
  const d = distanceM(me, pos(p)), past = isOver(p);
  return (
    <div className={`card${past ? " past" : ""}${sel ? " sel" : ""}`} onClick={() => a.select(p.id)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") a.select(p.id); }}>
      <Glyph p={p} />
      <div className="cbody">
        <p className="ctitle">{p.title}</p>
        <div className="meta"><When p={p} /></div>
        <div className="meta"><Place p={p} /><span>{dist(d)}{past ? "" : ` · ${walkMin(d)} min walk`}</span><span>{by(p, uid)}</span></div>
        {past ? (
          <div className="cfoot">
            <span className="meta">{accepted(p).length + 1} met up</span>
            <div className="btnrow">
              <button className="mini" onClick={(e) => { e.stopPropagation(); a.again(p); }}>Pulse again</button>
              <button className="mini pri" onClick={(e) => { e.stopPropagation(); a.share(p); }}>Share recap</button>
            </div>
          </div>
        ) : (
          <div className="cfoot"><Seats p={p} uid={uid} /><div className="btnrow"><NavButton p={p} /><JoinButton p={p} uid={uid} a={a} /></div></div>
        )}
      </div>
    </div>
  );
}
