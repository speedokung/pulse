import type { LatLng, Pulse } from "../lib/types";
import { PulseCard } from "./PulseCard";
import type { Actions } from "./ui";
import { t } from "../lib/i18n";

export type Period = "day" | "week" | "all";
export const PERIODS: Record<Period, { label: () => string; ms: number | null }> = {
  day: { label: () => t("periodDay"), ms: 86_400_000 },
  week: { label: () => t("periodWeek"), ms: 7 * 86_400_000 },
  all: { label: () => t("periodAll"), ms: null },
};

export function HistoryTab({ results, loading, q, uid, me, selectedId, a }: {
  results: Pulse[]; loading: boolean; q: string; uid: string | null; me: LatLng; selectedId: string | null; a: Actions;
}) {
  if (loading && !results.length) return <div className="empty">{t("searching")}</div>;
  if (!results.length)
    return <div className="empty">{t("emptyHist", { q: q ? ` “${q}”` : "" }).split("<br>").map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>)}</div>;
  return (
    <>
      <div className="slot">{t("gNewest")}</div>
      {results.map((p) => <PulseCard key={p.id} p={p} uid={uid} me={me} sel={selectedId === p.id} a={a} />)}
    </>
  );
}
