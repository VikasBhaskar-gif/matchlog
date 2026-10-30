import { Link } from "react-router-dom";
import { usePredictionsList } from "../hooks/queries";
import { LoadingState, EmptyState, ErrorState } from "../components/States";

export function PredictionsPage() {
  const { data, isLoading, isError, refetch } = usePredictionsList();

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-4">Predictions</h1>

      {isLoading && <LoadingState label="Loading your predictions..." />}
      {isError && <ErrorState message="We couldn't load your predictions." onRetry={refetch} />}
      {data && data.predictions.length === 0 && (
        <EmptyState title="You haven't made any predictions yet" subtitle="Head to an upcoming match to make your first call." />
      )}

      <div className="space-y-2">
        {(data?.predictions ?? [])
          .filter((p) => p && p.match)
          .map((p) => (
            <Link
              key={p.id}
              to={`/matches/${p.match?.id}`}
              className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-primary)]/40"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-sm">
                  {p.match?.homeTeam?.name ?? "TBD"} vs {p.match?.awayTeam?.name ?? "TBD"}
                </p>
                {p.pointsAwarded !== null ? (
                  <span className="text-xs font-bold text-[var(--color-primary)]">+{p.pointsAwarded} pts</span>
                ) : (
                  <span className="text-xs text-[var(--color-text-dim)]">Pending</span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-dim)]">
                You predicted {p.predictedHomeScore}–{p.predictedAwayScore}
                {p.match?.homeScore !== null && p.match?.homeScore !== undefined && ` · Final: ${p.match.homeScore}–${p.match?.awayScore ?? "-"}`}
              </p>
            </Link>
          ))}
      </div>
    </div>
  );
}
