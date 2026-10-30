import { useState } from "react";
import { Link } from "react-router-dom";
import { useWatchHistory } from "../hooks/queries";
import { LoadingState, EmptyState, ErrorState } from "../components/States";

export function HistoryPage() {
  const { data, isLoading, isError, refetch } = useWatchHistory();
  const [fullOnly, setFullOnly] = useState(false);

  const watches = (data?.watches ?? []).filter(
    (w) => w && w.match && (!fullOnly || w.watchType === "FULL_MATCH")
  );

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-4">Watch History</h1>

      <label className="flex items-center gap-2 text-sm mb-4 text-[var(--color-text-dim)]">
        <input type="checkbox" checked={fullOnly} onChange={(e) => setFullOnly(e.target.checked)} />
        Full matches only
      </label>

      {isLoading && <LoadingState label="Loading your watch history..." />}
      {isError && <ErrorState message="We couldn't load your history." onRetry={refetch} />}
      {data && watches.length === 0 && (
        <EmptyState title="No watched matches yet" subtitle="Record a match you've watched to start building your history." />
      )}

      <div className="space-y-2">
        {watches.map((w) => (
          <Link
            key={w.id}
            to={`/matches/${w.match?.id}`}
            className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-primary)]/40"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-sm">
                {w.match?.homeTeam?.name ?? "TBD"} {w.match?.homeScore ?? "-"}–{w.match?.awayScore ?? "-"} {w.match?.awayTeam?.name ?? "TBD"}
              </p>
            </div>
            <p className="text-xs text-[var(--color-text-dim)]">
              {w.match?.competition?.name ?? "Match"} · {new Date(w.createdAt).toLocaleDateString()} · {watchTypeLabel(w.watchType)} ·{" "}
              {w.watchDurationMinutes} min
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function watchTypeLabel(type: string) {
  switch (type) {
    case "FULL_MATCH": return "✓ Full Match";
    case "FIRST_HALF": return "First Half";
    case "SECOND_HALF": return "Second Half";
    default: return "Custom";
  }
}
