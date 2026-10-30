import { Link, useNavigate } from "react-router-dom";
import { useMyPotmVotes } from "../hooks/queries";
import { LoadingState, EmptyState, ErrorState } from "../components/States";
import { formatDateTimeline, playerInitials, formatRound } from "../lib/format";
import { getClubStyle } from "../lib/clubColors";

export function MyVotesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useMyPotmVotes();

  const votes = data?.votes ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Top Header with Back Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate("/stats");
                }
              }}
              className="text-xs font-bold text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1 group cursor-pointer"
            >
              <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
              <span>Back to My Stats</span>
            </button>
            <span className="text-slate-600 text-xs">•</span>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Voting Record</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span className="text-amber-400">⭐</span>
            <span>Player of the Match Votes</span>
          </h1>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            Review all your submitted MVP picks and how they compare against the overall community vote.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-black px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1.5 shadow-sm">
            <span>🗳️</span>
            <span>{votes.length} {votes.length === 1 ? "Vote Logged" : "Votes Logged"}</span>
          </span>
        </div>
      </div>

      {isLoading && <LoadingState label="Loading your voting history..." />}
      {isError && <ErrorState message="Could not load your MOTM votes." onRetry={refetch} />}

      {!isLoading && votes.length === 0 && (
        <EmptyState
          title="No MOTM votes yet"
          subtitle="Record matches and cast your Player of the Match vote to see your complete voting breakdown here."
        />
      )}

      {/* Votes List */}
      <div className="space-y-4">
        {votes.map((v) => {
          const m = v.match;
          if (!m) return null;

          const myPlayer = v.myVote.player;
          const overallPlayer = v.overallVote?.player;
          const isAgreed = v.overallVote?.isSameAsMyVote;

          const myClubColors = myPlayer?.team?.name ? getClubStyle(myPlayer.team.name) : null;
          const overallClubColors = overallPlayer?.team?.name ? getClubStyle(overallPlayer.team.name) : null;

          return (
            <div
              key={v.id}
              className="glass-card rounded-2xl border border-white/10 hover:border-white/20 transition-all p-4 space-y-3 shadow-md"
            >
              {/* Row grid: [ Match Box ] | [ My Vote ] | [ Overall Vote ] */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                {/* 1. MATCH BOX (Cols 1-5 on LG) */}
                <div className="lg:col-span-5 bg-white/[0.03] border border-white/10 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 border-b border-white/5 pb-2">
                    <span className="font-semibold flex items-center gap-1.5 truncate">
                      {m.competition?.logoUrl && (
                        <img src={m.competition.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                      )}
                      <span className="truncate">{m.competition?.name ?? "League"}</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {formatDateTimeline(m.kickoffAt)}
                    </span>
                  </div>

                  <Link
                    to={`/matches/${m.id}`}
                    viewTransition
                    className="flex items-center justify-between gap-2 group/match"
                  >
                    {/* Home Team */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {m.homeTeam?.logoUrl ? (
                          <img src={m.homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain" />
                        ) : (
                          <span className="text-[8px] font-bold text-slate-400">{(m.homeTeam?.name ?? "H").slice(0, 2)}</span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-200 truncate group-hover/match:text-emerald-400 transition-colors">
                        {m.homeTeam?.shortName ?? m.homeTeam?.name ?? "Home"}
                      </span>
                    </div>

                    {/* Final Score */}
                    <div className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-black text-white tabular-nums shrink-0">
                      {m.homeScore ?? "-"} : {m.awayScore ?? "-"}
                    </div>

                    {/* Away Team */}
                    <div className="flex items-center justify-end gap-2 flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-200 truncate text-right group-hover/match:text-emerald-400 transition-colors">
                        {m.awayTeam?.shortName ?? m.awayTeam?.name ?? "Away"}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {m.awayTeam?.logoUrl ? (
                          <img src={m.awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain" />
                        ) : (
                          <span className="text-[8px] font-bold text-slate-400">{(m.awayTeam?.name ?? "A").slice(0, 2)}</span>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    <span className="text-slate-500 font-medium">{formatRound(m.round) || "Regular Match"}</span>
                    <Link
                      to={`/matches/${m.id}`}
                      viewTransition
                      className="text-emerald-400 font-bold hover:underline flex items-center gap-0.5"
                    >
                      <span>Match Page</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>

                {/* 2. MY VOTE (Cols 6-8 on LG) */}
                <div className="lg:col-span-3 bg-white/[0.02] border border-white/10 rounded-xl p-3 flex flex-col justify-center gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <span>⭐</span>
                      <span>My Vote</span>
                    </span>
                    <span className="text-[9px] text-slate-500">Your selection</span>
                  </div>

                  {myPlayer ? (
                    <div className="flex items-center gap-3">
                      {/* Circular Profile Picture */}
                      <div
                        className="w-12 h-12 rounded-full p-0.5 flex items-center justify-center shrink-0 shadow-md overflow-hidden"
                        style={{
                          background: myClubColors ? myClubColors.background : "rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 flex items-center justify-center">
                          {myPlayer.photoUrl ? (
                            <img
                              src={myPlayer.photoUrl}
                              alt={myPlayer.name}
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <span className="text-xs font-black text-slate-300 tracking-wider">
                              {playerInitials(myPlayer.name)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-white truncate leading-tight">{myPlayer.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                          {myPlayer.team?.logoUrl && (
                            <img src={myPlayer.team.logoUrl} alt="" className="w-3 h-3 object-contain shrink-0" />
                          )}
                          <span className="truncate">{myPlayer.team?.shortName ?? myPlayer.team?.name ?? myPlayer.position ?? "Player"}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No selection</p>
                  )}
                </div>

                {/* 3. OVERALL VOTE (Cols 9-12 on LG) */}
                <div className={`lg:col-span-4 rounded-xl p-3 flex flex-col justify-center gap-2 border ${
                  isAgreed
                    ? "bg-emerald-500/[0.04] border-emerald-500/20"
                    : "bg-white/[0.02] border-white/10"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                      <span>👑</span>
                      <span>Overall Vote</span>
                    </span>
                    {v.overallVote && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                        {v.overallVote.percentage}% ({v.overallVote.votes} {v.overallVote.votes === 1 ? "vote" : "votes"})
                      </span>
                    )}
                  </div>

                  {overallPlayer ? (
                    <div className="flex items-center gap-3">
                      {/* Circular Profile Picture */}
                      <div
                        className="w-12 h-12 rounded-full p-0.5 flex items-center justify-center shrink-0 shadow-md overflow-hidden"
                        style={{
                          background: overallClubColors ? overallClubColors.background : "rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 flex items-center justify-center">
                          {overallPlayer.photoUrl ? (
                            <img
                              src={overallPlayer.photoUrl}
                              alt={overallPlayer.name}
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <span className="text-xs font-black text-slate-300 tracking-wider">
                              {playerInitials(overallPlayer.name)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-black text-white truncate leading-tight">{overallPlayer.name}</p>
                          {isAgreed && (
                            <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/30 shrink-0">
                              Matched!
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                          {overallPlayer.team?.logoUrl && (
                            <img src={overallPlayer.team.logoUrl} alt="" className="w-3 h-3 object-contain shrink-0" />
                          )}
                          <span className="truncate">{overallPlayer.team?.shortName ?? overallPlayer.team?.name ?? overallPlayer.position ?? "Player"}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No community winner yet</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
