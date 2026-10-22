import type { LatLng, Pulse } from "../lib/types";
import { HOUR, isHost, isOver, ms, pos, status } from "../lib/pulse";
import { distanceM } from "../lib/geo";
import { PulseCard } from "./PulseCard";
import type { Actions } from "./ui";
import { t } from "../lib/i18n";

/** Everything coming up within range: live first, then by start time. */
export function nearbyList(pulses: Pulse[], me: LatLng, radiusM: number, uid: string | null) {
  const now = Date.now();
  return pulses
    .filter((p) => !isOver(p, now) && (distanceM(me, pos(p)) <= radiusM || isHost(p, uid)))
    .sort((a, b) => Math.max(ms(a.starts_at), now) - Math.max(ms(b.starts_at), now) || distanceM(me, pos(a)) - distanceM(me, pos(b)));
}

const endOfDay = (offsetDays: number) => { const d = new Date(); d.setHours(23, 59, 59, 999); d.setDate(d.getDate() + offsetDays); return d.getTime(); };

export function NearbyTab({ list, uid, me, selectedId, a }: { list: Pulse[]; uid: string | null; me: LatLng; selectedId: string | null; a: Actions }) {
  if (!list.length) return <div className="empty" dangerouslySetInnerHTML={{ __html: t("emptyNear") }} />;
  const used = new Set<string>();
  const groups: [string, (p: Pulse) => boolean][] = [
    [t("gLive"), (p) => status(p).k === "live"],
    [t("gHour"), (p) => ms(p.starts_at) - Date.now() <= HOUR],
    [t("g3h"), (p) => ms(p.starts_at) - Date.now() <= 3 * HOUR],
    [t("gToday"), (p) => ms(p.starts_at) <= endOfDay(0)],
    [t("gTomorrow"), (p) => ms(p.starts_at) <= endOfDay(1)],
    [t("gWeek"), () => true],
  ];
  return (
    <>
      {groups.map(([name, fn]) => {
        const items = list.filter((p) => !used.has(p.id) && fn(p));
        items.forEach((p) => used.add(p.id));
        return items.length ? (
          <div key={name}>
            <div className="slot">{name}</div>
            {items.map((p) => <PulseCard key={p.id} p={p} uid={uid} me={me} sel={selectedId === p.id} a={a} />)}
          </div>
        ) : null;
      })}
    </>
  );
}
