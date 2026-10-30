import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "../api/client";
import type { Match, Prediction } from "../api/types";

type Props = {
  match: Match;
  existingPrediction?: Prediction | null;
  onClose: () => void;
  onSaved: () => void;
};

export function PredictModal({ match, existingPrediction, onClose, onSaved }: Props) {
  const existing = existingPrediction ?? match.myPrediction;
  const isLocked =
    match.status === "LIVE" ||
    match.status === "PAUSED" ||
    match.status === "FINISHED" ||
    new Date(match.kickoffAt).getTime() <= Date.now();

  const [homeScore, setHomeScore] = useState(existing?.predictedHomeScore ?? 0);
  const [awayScore, setAwayScore] = useState(existing?.predictedAwayScore ?? 0);
  const [goesToExtraTime, setGoesToExtraTime] = useState(existing?.predictedGoesToExtraTime ?? false);
  const [goesToPenalties, setGoesToPenalties] = useState(existing?.predictedGoesToPenalties ?? false);
  const [advancingSide, setAdvancingSide] = useState<"HOME" | "AWAY">(
    existing?.predictedAdvancingSide ?? "HOME"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const homeName = match.homeTeam?.name ?? match.homeTeamPlaceholder ?? "Home Team";
  const awayName = match.awayTeam?.name ?? match.awayTeamPlaceholder ?? "Away Team";
  const outcome = homeScore > awayScore ? "HOME" : awayScore > homeScore ? "AWAY" : "DRAW";

  async function handleSave() {
    if (isLocked) {
      setError("Predictions are closed once the match kicks off.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/matches/${match.id}/prediction`, {
        predictedOutcome: outcome,
        predictedHomeScore: homeScore,
        predictedAwayScore: awayScore,
        ...(match.isKnockout
          ? {
              predictedGoesToExtraTime: goesToExtraTime,
              predictedGoesToPenalties: goesToPenalties,
              predictedAdvancingSide: advancingSide,
            }
          : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your prediction.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0f1520]/95 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-2xl animate-scale-in relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <h2 className="text-lg font-black text-white tracking-tight">
              {existing ? "Edit Match Prediction" : "Predict Match Score"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-5 flex items-center gap-1.5">
          <span className="font-semibold text-slate-200">{homeName}</span>
          <span>vs</span>
          <span className="font-semibold text-slate-200">{awayName}</span>
        </p>

        {isLocked ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 space-y-2 mb-4">
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <span>🔒</span>
              <span>Predictions Closed</span>
            </div>
            {existing ? (
              <p>
                Your locked prediction for this match:{" "}
                <strong className="text-emerald-400 text-sm">
                  {existing.predictedHomeScore} – {existing.predictedAwayScore}
                </strong>
              </p>
            ) : (
              <p>Predictions are locked at kickoff.</p>
            )}
          </div>
        ) : (
          <>
            {/* Projected Outcome Badge */}
            <div className="flex justify-center mb-5">
              <span className="text-xs font-black uppercase tracking-wider px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm">
                {outcome === "HOME"
                  ? `${homeName} Win`
                  : outcome === "AWAY"
                  ? `${awayName} Win`
                  : "Draw"}
              </span>
            </div>

            {/* Score Selector Controls */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Home Team Stepper */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col items-center">
                <div className="w-10 h-10 mb-2 flex items-center justify-center">
                  {match.homeTeam?.logoUrl ? (
                    <img src={match.homeTeam.logoUrl} alt="" className="w-8 h-8 object-contain" />
                  ) : (
                    <span className="text-xs font-black text-slate-400">
                      {homeName.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-slate-300 truncate max-w-[120px] text-center mb-3">
                  {homeName}
                </span>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setHomeScore((s) => Math.max(0, s - 1))}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-black text-base flex items-center justify-center transition-colors cursor-pointer"
                  >
                    –
                  </button>
                  <span className="text-2xl font-black text-white tabular-nums w-8 text-center">
                    {homeScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHomeScore((s) => s + 1)}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-black text-base flex items-center justify-center transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Away Team Stepper */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col items-center">
                <div className="w-10 h-10 mb-2 flex items-center justify-center">
                  {match.awayTeam?.logoUrl ? (
                    <img src={match.awayTeam.logoUrl} alt="" className="w-8 h-8 object-contain" />
                  ) : (
                    <span className="text-xs font-black text-slate-400">
                      {awayName.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-slate-300 truncate max-w-[120px] text-center mb-3">
                  {awayName}
                </span>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAwayScore((s) => Math.max(0, s - 1))}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-black text-base flex items-center justify-center transition-colors cursor-pointer"
                  >
                    –
                  </button>
                  <span className="text-2xl font-black text-white tabular-nums w-8 text-center">
                    {awayScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAwayScore((s) => s + 1)}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-black text-base flex items-center justify-center transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Knockout Match Options */}
            {match.isKnockout && (
              <div className="space-y-2 mb-5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={goesToExtraTime}
                    onChange={(e) => setGoesToExtraTime(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Goes to Extra Time</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={goesToPenalties}
                    onChange={(e) => setGoesToPenalties(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Goes to Penalty Shootout</span>
                </label>
                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <span>Advancing Team:</span>
                  <select
                    value={advancingSide}
                    onChange={(e) => setAdvancingSide(e.target.value as "HOME" | "AWAY")}
                    className="bg-[#141c2a] border border-white/15 rounded-lg px-2.5 py-1 text-white text-xs font-semibold"
                  >
                    <option value="HOME">{homeName}</option>
                    <option value="AWAY">{awayName}</option>
                  </select>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-400">
            {error}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
          {!isLocked && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-xs sm:text-sm hover:bg-emerald-400 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {saving ? "Saving..." : existing ? "Update Prediction" : "Confirm Prediction"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
