import { useState } from "react";
import { Link } from "react-router-dom";
import type { Match, MatchEvent } from "../api/types";
import { formatKickoff, countdown, teamInitials, statusLabel, canRecordWatch, formatRound, formatMatchMinute } from "../lib/format";

interface ScorerItem {
  minute: number;
  isOwnGoal: boolean;
  isPenalty: boolean;
}

function formatTeamScorers(events?: MatchEvent[], teamId?: string | null): React.ReactNode {
  if (!events || events.length === 0 || !teamId) return null;
  const teamEvents = events.filter((e) => e.teamId === teamId);
  if (teamEvents.length === 0) return null;

  const map = new Map<string, ScorerItem[]>();
  for (const ev of teamEvents) {
    const list = map.get(ev.playerName) ?? [];
    list.push({
      minute: ev.minute,
      isOwnGoal: ev.type === "OWN_GOAL",
      isPenalty: ev.type === "PENALTY_GOAL",
    });
    map.set(ev.playerName, list);
  }

  const entries = Array.from(map.entries());

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
      {entries.map(([fullName, items]) => {
        const lastName = fullName.split(" ").slice(-1)[0];
        return (
          <span
            key={fullName}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-slate-300"
          >
            <span className="font-semibold text-white">{lastName}</span>
            <span className="text-slate-400">
              {items.map((it, itIdx) => (
                <span key={itIdx}>
                  {formatMatchMinute(it.minute)}
                  {it.isOwnGoal && <span className="text-rose-400 font-bold ml-0.5">(o.g.)</span>}
                  {it.isPenalty && <span className="text-amber-400 font-semibold ml-0.5">(p)</span>}
                  {itIdx < items.length - 1 ? ", " : ""}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function MatchCard({ match, onRecordWatch }: { match: Match; onRecordWatch: (m: Match) => void }) {
  const cd = match.status === "SCHEDULED" ? countdown(match.kickoffAt) : null;
  const allowedToWatch = canRecordWatch(match);

  const isFinished = match.status === "FINISHED";
  const homeScorers = isFinished ? formatTeamScorers(match.events, match.homeTeamId) : null;
  const awayScorers = isFinished ? formatTeamScorers(match.events, match.awayTeamId) : null;

  const isLive = match.status === "LIVE";

  return (
    <div
      className={`group relative rounded-2xl glass-card p-4 transition-all duration-200 overflow-hidden ${
        isLive ? "border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]" : ""
      }`}
    >
      {/* Top subtle glow line for live matches */}
      {isLive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent" />
      )}

      {/* Header: Competition & Status */}
      <div className="flex items-center justify-between mb-3">
        <Link
          to={`/matches/${match.id}`}
          viewTransition
          className="text-xs font-semibold text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
        >
          <span>{match.competition?.name ?? "Competition"}</span>
          {match.round && <span className="text-slate-600">· {formatRound(match.round)}</span>}
        </Link>
        <StatusPill status={match.status} />
      </div>

      {/* Main Scoreboard Clickable Area */}
      <Link to={`/matches/${match.id}`} viewTransition className="block space-y-2 py-1">
        <TeamRow
          name={match.homeTeam?.name ?? match.homeTeamPlaceholder ?? "TBD"}
          score={match.homeScore}
          logoUrl={match.homeTeam?.logoUrl}
          scorers={homeScorers}
          isWinning={
            match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore
          }
        />
        <TeamRow
          name={match.awayTeam?.name ?? match.awayTeamPlaceholder ?? "TBD"}
          score={match.awayScore}
          logoUrl={match.awayTeam?.logoUrl}
          scorers={awayScorers}
          isWinning={
            match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore
          }
        />
      </Link>

      {/* Footer: Kickoff time & Interactive Action button */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06] text-xs">
        <span className="text-slate-400 flex items-center gap-1.5 font-medium">
          <span>🕒</span>
          <span>{formatKickoff(match.kickoffAt, match.kickoffTimeConfirmed)}</span>
          {cd && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[10px] font-bold">
              {cd}
            </span>
          )}
        </span>

        <div className="flex items-center gap-2">
          {match.myPrediction && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/[0.05] text-slate-300 border border-white/10">
              🎯 Predicted
            </span>
          )}

          {match.myWatch ? (
            <button
              onClick={() => onRecordWatch(match)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>✓</span> {match.myWatch.watchDurationMinutes}m watched
            </button>
          ) : (
            <button
              onClick={() => onRecordWatch(match)}
              disabled={!allowedToWatch}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                allowedToWatch
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400 text-black hover:brightness-110 active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.25)] cursor-pointer"
                  : "bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed opacity-60"
              }`}
              title={allowedToWatch ? "Record Watch" : "Watch recording is only available on match day"}
            >
              <span>⏱️</span> Record Watch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamRow({
  name,
  score,
  logoUrl,
  scorers,
  isWinning,
}: {
  name: string;
  score: number | null;
  logoUrl?: string | null;
  scorers?: React.ReactNode;
  isWinning?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center justify-between w-full py-0.5">
      <div className="flex items-center gap-2.5 min-w-0 pr-3">
        <div className="h-7 w-7 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0 overflow-hidden shadow-sm p-0.5">
          {logoUrl && !imgError ? (
            <img src={logoUrl} alt="" className="h-5 w-5 object-contain" onError={() => setImgError(true)} />
          ) : (
            teamInitials(name)
          )}
        </div>
        <div className="min-w-0">
          <span
            className={`text-sm truncate block transition-colors ${
              isWinning ? "font-extrabold text-white" : "font-semibold text-slate-200"
            }`}
          >
            {name}
          </span>
          {scorers}
        </div>
      </div>

      {score !== null && (
        <span
          className={`text-base sm:text-lg font-black tabular-nums px-2.5 py-0.5 rounded-lg border ml-2 ${
            isWinning
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-white/[0.03] text-slate-300 border-white/[0.06]"
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "LIVE") {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-black tracking-wider animate-live-glow">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
        LIVE
      </span>
    );
  }

  if (status === "FINISHED") {
    return (
      <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] font-bold text-slate-400 uppercase tracking-wide">
        FT
      </span>
    );
  }

  return (
    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
      {statusLabel(status)}
    </span>
  );
}
