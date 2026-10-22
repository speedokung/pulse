import type { LatLng, Pulse } from "../lib/types";
import { PulseCard } from "./PulseCard";
import type { Actions } from "./ui";

export type Period = "day" | "week" | "all";
export const PERIODS: Record<Period, { label: string; ms: number | null }> = {
  day: { label: "Today", ms: 86_400_000 },
  week: { label: "This week", ms: 7 * 86_400_000 },
  all: { label: "All time", ms: null },
};

export function HistoryTab({ results, loading, q, uid, me, selectedId, a }: {
  results: Pulse[]; loading: boolean; q: string; uid: string | null; me: LatLng; selectedId: string | null; a: Actions;
}) {
  if (loading && !results.length) return <div className="empty">Searching past Pulses…</div>;
  if (!results.length)
    return <div className="empty">No past Pulses match{q ? ` “${q}”` : ""}.<br />Try All time, or a different word.</div>;
  return (
    <>
      <div className="slot">Newest first · shown on the map at their rough area</div>
      {results.map((p) => <PulseCard key={p.id} p={p} uid={uid} me={me} sel={selectedId === p.id} a={a} />)}
    </>
  );
}
