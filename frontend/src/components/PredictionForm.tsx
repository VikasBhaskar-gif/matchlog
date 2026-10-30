import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { Match } from "../api/types";

export function PredictionForm({ match, locked, onSaved }: { match: Match; locked: boolean; onSaved: () => void }) {
  const existing = match.myPrediction;
  const [homeScore, setHomeScore] = useState(existing?.predictedHomeScore ?? 0);
  const [awayScore, setAwayScore] = useState(existing?.predictedAwayScore ?? 0);
  const [goesToExtraTime, setGoesToExtraTime] = useState(existing?.predictedGoesToExtraTime ?? false);
  const [goesToPenalties, setGoesToPenalties] = useState(existing?.predictedGoesToPenalties ?? false);
  const [advancingSide, setAdvancingSide] = useState<"HOME" | "AWAY">(existing?.predictedAdvancingSide ?? "HOME");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const outcome = homeScore > awayScore ? "HOME" : awayScore > homeScore ? "AWAY" : "DRAW";

  if (locked && !existing) {
    return <p className="text-sm text-[var(--color-text-dim)]">Predictions closed at kickoff.</p>;
  }

  if (locked && existing) {
    const isFinished = match.status === "FINISHED";
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
        <p className="font-semibold mb-1">
          Your prediction: {existing.predictedHomeScore}–{existing.predictedAwayScore}
        </p>
        {isFinished && existing.pointsAwarded !== null ? (
          <p className="text-[var(--color-primary)] font-medium">
            {existing.pointsAwarded >= 8 ? "🎯 Exact score correct!" : existing.pointsAwarded >= 3 ? "✓ Outcome correct!" : "Incorrect"}
          </p>
        ) : (
          <p className="text-[var(--color-text-dim)]">Locked at kickoff. Result pending.</p>
        )}
      </div>
    );
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/matches/${match.id}/prediction`, {
        predictedOutcome: outcome,
        predictedHomeScore: homeScore,
        predictedAwayScore: awayScore,
        ...(match.isKnockout
          ? { predictedGoesToExtraTime: goesToExtraTime, predictedGoesToPenalties: goesToPenalties, predictedAdvancingSide: advancingSide }
          : {}),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your prediction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="text-xs font-semibold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1 rounded-full border border-[var(--color-primary)]/30">
          {outcome === "HOME"
            ? `${match.homeTeam?.name ?? "Home"} Win`
            : outcome === "AWAY"
            ? `${match.awayTeam?.name ?? "Away"} Win`
            : "Draw"}
        </span>
      </div>

      <div className="flex items-center justify-center gap-3 mb-4">
        <ScoreInput value={homeScore} onChange={setHomeScore} />
        <span className="text-[var(--color-text-dim)] font-bold text-lg">–</span>
        <ScoreInput value={awayScore} onChange={setAwayScore} />
      </div>

      {match.isKnockout && (
        <div className="space-y-2 mb-4 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={goesToExtraTime} onChange={(e) => setGoesToExtraTime(e.target.checked)} />
            Goes to extra time
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={goesToPenalties} onChange={(e) => setGoesToPenalties(e.target.checked)} />
            Goes to penalties
          </label>
          <div className="flex items-center gap-2">
            <span>Advances:</span>
            <select
              value={advancingSide}
              onChange={(e) => setAdvancingSide(e.target.value as "HOME" | "AWAY")}
              className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded px-2 py-1"
            >
              <option value="HOME">{match.homeTeam?.name ?? "Home"}</option>
              <option value="AWAY">{match.awayTeam?.name ?? "Away"}</option>
            </select>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-[var(--color-danger)] mb-2">{error}</p>}
      {saved && <p className="text-sm text-[var(--color-primary)] mb-2">Prediction saved.</p>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-2.5 rounded-lg bg-[var(--color-primary)] text-black font-bold text-sm disabled:opacity-50"
      >
        {existing ? "Update Prediction" : "Save Prediction"}
      </button>
    </div>
  );
}

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="h-8 w-8 rounded-lg bg-[var(--color-surface-2)] text-lg leading-none"
      >
        −
      </button>
      <span className="w-8 text-center text-xl font-bold">{value}</span>
      <button onClick={() => onChange(value + 1)} className="h-8 w-8 rounded-lg bg-[var(--color-surface-2)] text-lg leading-none">
        +
      </button>
    </div>
  );
}
