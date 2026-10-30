import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useStats, usePredictionsList, useWatchHistory, useMyPotmVotes } from "../hooks/queries";
import { LoadingState, ErrorState, EmptyState } from "./States";
import { formatDateTimeline, playerInitials, formatRound } from "../lib/format";
import { getClubStyle } from "../lib/clubColors";

const PREDICTION_OPTIONS = [
  { id: "SCHEDULED" as const, label: "Upcoming Matches", icon: "⏳" },
  { id: "LIVE" as const, label: "Live Matches", icon: "🔴" },
  { id: "FINISHED" as const, label: "Finished Matches", icon: "🏁" },
];

interface UserStatsViewProps {
  userId?: string;
  userName?: string;
  showHeader?: boolean;
}

export function UserStatsView({ userId, userName, showHeader = true }: UserStatsViewProps) {
  const [scope, setScope] = useState<"current" | "all-time">("current");
  const { data: statsData, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useStats(scope, userId);

  // Predictions List
  const { data: predData, isLoading: predLoading } = usePredictionsList(userId);
  const [predictionFilter, setPredictionFilter] = useState<"SCHEDULED" | "LIVE" | "FINISHED">("SCHEDULED");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // POTM Votes
  const { data: potmData, isLoading: potmLoading } = useMyPotmVotes(userId);
  const [showPotmHistory, setShowPotmHistory] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Watch History
  const { data: watchData, isLoading: watchLoading } = useWatchHistory(userId);
  const [fullMatchesOnly, setFullMatchesOnly] = useState(false);

  // Filtered Predictions
  const filteredPredictions = useMemo(() => {
    const list = predData?.predictions ?? [];
    return list.filter((p) => {
      if (!p || !p.match) return false;
      return p.match.status === predictionFilter;
    });
  }, [predData?.predictions, predictionFilter]);

  // Filtered Watches
  const filteredWatches = useMemo(() => {
    const list = watchData?.watches ?? [];
    return list.filter((w) => {
      if (!w || !w.match) return false;
      if (fullMatchesOnly && w.watchType !== "FULL_MATCH") return false;
      return true;
    });
  }, [watchData?.watches, fullMatchesOnly]);

  const potmVotes = potmData?.votes ?? [];

  return (
    <div className="space-y-8">
      {/* Header and Scope Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {showHeader ? (
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {userName ? `${userName}'s Stats & History` : "My Stats & History"}
            </h1>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              {userName
                ? `Football metrics, match predictions, and verified watch history for @${userName}`
                : "Your match watching metrics, predictions record, and verified watch history"}
            </p>
          </div>
        ) : (
          <div>
            <h3 className="text-base font-black text-white tracking-tight">
              {userName ? `${userName}'s Detailed Statistics` : "Detailed Statistics"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Breakdown of watch metrics, predictions, and Player of the Match selections
            </p>
          </div>
        )}

        <div className="glass-panel p-1 rounded-2xl flex gap-1 self-start sm:self-auto">
          <button
            onClick={() => setScope("current")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              scope === "current"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Current Season
          </button>
          <button
            onClick={() => setScope("all-time")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              scope === "all-time"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All-Time
          </button>
        </div>
      </div>

      {statsLoading && <LoadingState label="Computing stats..." />}
      {statsError && <ErrorState message="Could not load stats." onRetry={refetchStats} />}

      {statsData && (
        <div className="space-y-8">
          {/* 1. Watching Stats */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">⏱️</span>
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Match Watching
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Matches Watched" value={statsData.watching.totalMatches} colorClass="text-emerald-400" />
              <StatCard label="Minutes Logged" value={`${statsData.watching.totalMinutes.toLocaleString()}'`} colorClass="text-cyan-400" />
              <StatCard label="Full 90' Matches" value={statsData.watching.fullMatches} colorClass="text-emerald-300" />
              <StatCard label="Avg Min / Match" value={`${statsData.watching.averageMinutesPerMatch}'`} colorClass="text-slate-200" />
            </div>

            {statsData.watching.mostWatchedTeam && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-inner">
                    {statsData.watching.mostWatchedTeam.logoUrl ? (
                      <img
                        src={statsData.watching.mostWatchedTeam.logoUrl}
                        alt={statsData.watching.mostWatchedTeam.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xl">🏆</span>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🏆</span>
                      <span>Most Watched Club</span>
                    </p>
                    <Link
                      to={`/teams/${statsData.watching.mostWatchedTeam.id}`}
                      viewTransition
                      className="text-sm font-black text-white hover:text-emerald-400 transition-colors"
                    >
                      {statsData.watching.mostWatchedTeam.name}
                    </Link>
                  </div>
                </div>
                <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {statsData.watching.mostWatchedTeam.matches} matches
                </span>
              </div>
            )}
          </div>

          {/* Line separator before Match Predictions */}
          <div className="border-t border-white/10" />

          {/* 2. Prediction Stats */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-amber-400">🎯</span>
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Match Predictions
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Predictions" value={statsData.predictions.totalPredictions} colorClass="text-slate-200" />
              <StatCard label="Correct Outcomes" value={statsData.predictions.correctResults} colorClass="text-amber-400" />
              <StatCard label="Exact Scores" value={statsData.predictions.exactScores} colorClass="text-rose-400" />
              <StatCard label="Accuracy Rate" value={`${statsData.predictions.accuracy}%`} colorClass="text-emerald-400" />
            </div>

            {/* Accuracy Progress Bar */}
            {statsData.predictions.totalPredictions > 0 && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-slate-400">Prediction Precision</span>
                  <span className="text-emerald-400">{statsData.predictions.accuracy}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, statsData.predictions.accuracy))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Predictions List with Dropdown Selector */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <span className="text-amber-400">❖</span>
                  <span>{userName ? `${userName}'s Predictions` : "Predictions"} ({filteredPredictions.length})</span>
                </h3>

                {/* Custom Styled Dark Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                    className="px-3.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 hover:border-amber-400/50 hover:bg-white/[0.08] text-xs font-bold text-slate-200 flex items-center gap-2 transition-all focus:outline-none shadow-sm cursor-pointer"
                  >
                    <span>{PREDICTION_OPTIONS.find((o) => o.id === predictionFilter)?.icon}</span>
                    <span>{PREDICTION_OPTIONS.find((o) => o.id === predictionFilter)?.label}</span>
                    <span className={`text-[9px] text-slate-400 transition-transform duration-200 ml-0.5 ${isDropdownOpen ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-[#0c1017] border border-white/15 shadow-2xl p-1 z-30 backdrop-blur-xl animate-in fade-in zoom-in-95">
                      {PREDICTION_OPTIONS.map((opt) => {
                        const count = (predData?.predictions ?? []).filter((p) => p?.match?.status === opt.id).length;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setPredictionFilter(opt.id);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                              predictionFilter === opt.id
                                ? "bg-amber-500/10 text-amber-300 font-bold"
                                : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span>{opt.icon}</span>
                              <span>{opt.label}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-slate-500">({count})</span>
                              {predictionFilter === opt.id && <span className="text-amber-400 text-xs font-black">✓</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {predLoading && <LoadingState label="Loading predictions..." />}

              {filteredPredictions.length === 0 && !predLoading && (
                <EmptyState
                  title="No predictions found"
                  subtitle="No predictions logged for this category."
                />
              )}

              {/* Predictions Small Boxes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPredictions.map((p) => {
                  const m = p.match;
                  if (!m) return null;

                  const isFinished = m.status === "FINISHED";
                  const isLive = m.status === "LIVE";

                  return (
                    <Link
                      key={p.id}
                      to={`/matches/${m.id}`}
                      viewTransition
                      className="glass-card flex items-center justify-between p-3.5 rounded-2xl border hover:border-amber-400/50 hover:scale-[1.01] active:scale-[0.99] transition-all group"
                    >
                      {/* Home Team */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                          {m.homeTeam?.logoUrl ? (
                            <img src={m.homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain" />
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400">{(m.homeTeam?.name ?? "H").slice(0, 2)}</span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-slate-200 truncate group-hover:text-amber-400 transition-colors">
                          {m.homeTeam?.name ?? "Home"}
                        </span>
                      </div>

                      {/* Prediction Center Info */}
                      <div className="flex flex-col items-center px-2 flex-shrink-0 min-w-[104px]">
                        <div className="px-2.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-black text-xs tabular-nums">
                          <span>Pred: </span>
                          <span>{p.predictedHomeScore}</span>
                          <span> - </span>
                          <span>{p.predictedAwayScore}</span>
                        </div>
                        {(isFinished || isLive) && (
                          <div className="text-[10px] text-slate-400 font-semibold mt-1">
                            Actual: {m.homeScore ?? 0} - {m.awayScore ?? 0}
                          </div>
                        )}
                        <span className="text-[9px] text-slate-500 mt-0.5 truncate max-w-[100px]">
                          {formatDateTimeline(m.kickoffAt)}
                        </span>
                      </div>

                      {/* Away Team */}
                      <div className="flex items-center justify-end gap-2 flex-1 min-w-0">
                        <span className="text-xs font-bold text-slate-200 truncate text-right group-hover:text-amber-400 transition-colors">
                          {m.awayTeam?.name ?? "Away"}
                        </span>
                        <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                          {m.awayTeam?.logoUrl ? (
                            <img src={m.awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain" />
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400">{(m.awayTeam?.name ?? "A").slice(0, 2)}</span>
                          )}
                        </div>
                      </div>

                      {/* Points / Status Badge */}
                      <div className="ml-3 pl-2.5 border-l border-white/10 flex-shrink-0">
                        {p.pointsAwarded !== null ? (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                            p.pointsAwarded >= 8
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : p.pointsAwarded >= 3
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : "bg-white/5 text-slate-400"
                          }`}>
                            +{p.pointsAwarded} pts
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 rounded bg-white/5">
                            {isLive ? "Live" : "Pending"}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Line separator between Predictions and Player of the Match */}
          <div className="border-t border-white/10" />

          {/* 3. Player of the Match */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">⭐</span>
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
                  Player of the Match
                </h2>
              </div>
              {potmVotes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPotmHistory((prev) => !prev)}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{showPotmHistory ? "Hide Breakdown" : "View Breakdown"}</span>
                  <span className={`text-[10px] transition-transform ${showPotmHistory ? "rotate-180" : ""}`}>▼</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setShowPotmHistory((prev) => !prev)}
                className="glass-card p-4 rounded-2xl border border-white/10 hover:border-amber-400/50 hover:bg-white/[0.05] transition-all group flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="text-3xl font-black text-amber-300 group-hover:scale-105 transition-transform origin-left">
                    {statsData.potm.totalSelections}
                  </p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1 group-hover:text-slate-300">
                    Total MVP Votes Submitted
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400/80 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all">
                  <span>{showPotmHistory ? "Hide" : "View"} Votes</span>
                  <span>{showPotmHistory ? "↑" : "→"}</span>
                </div>
              </div>
            </div>

            {/* Inline POTM Voting History Breakdown */}
            {showPotmHistory && (
              <div className="space-y-4 pt-2">
                {potmLoading && <LoadingState label="Loading MOTM votes..." />}
                {potmVotes.length === 0 && !potmLoading && (
                  <EmptyState
                    title="No POTM votes cast yet"
                    subtitle="Cast Player of the Match votes to see voting history here."
                  />
                )}
                <div className="space-y-3">
                  {potmVotes.map((v) => {
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
                        className="glass-card rounded-2xl border border-white/10 hover:border-white/20 transition-all p-3.5 sm:p-4 space-y-3 shadow-md"
                      >
                        {/* Row grid: [ Match Box ] | [ User's Vote ] | [ Overall Vote ] */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
                          {/* 1. MATCH BOX (Cols 1-5 on LG) */}
                          <div className="lg:col-span-5 bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2.5">
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
                                    <span className="text-[8px] font-bold text-slate-400">
                                      {(m.homeTeam?.name ?? "H").slice(0, 2)}
                                    </span>
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
                                    <span className="text-[8px] font-bold text-slate-400">
                                      {(m.awayTeam?.name ?? "A").slice(0, 2)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </Link>

                            <div className="flex items-center justify-between pt-1 text-[10px]">
                              <span className="text-slate-500 font-medium">
                                {formatRound(m.round) || "Regular Match"}
                              </span>
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

                          {/* 2. USER'S VOTE (Cols 6-8 on LG) */}
                          <div className="lg:col-span-3 bg-white/[0.02] border border-white/10 rounded-xl p-3 flex flex-col justify-center gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                                <span>⭐</span>
                                <span>{userName ? `${userName}'s Vote` : "My Vote"}</span>
                              </span>
                              <span className="text-[9px] text-slate-500">Selection</span>
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
                                    <span className="truncate">
                                      {myPlayer.team?.shortName ?? myPlayer.team?.name ?? myPlayer.position ?? "Player"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 italic">No selection</p>
                            )}
                          </div>

                          {/* 3. OVERALL VOTE (Cols 9-12 on LG) */}
                          <div
                            className={`lg:col-span-4 rounded-xl p-3 flex flex-col justify-center gap-2 border ${
                              isAgreed
                                ? "bg-emerald-500/[0.04] border-emerald-500/20"
                                : "bg-white/[0.02] border-white/10"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                                <span>👑</span>
                                <span>Overall Vote</span>
                              </span>
                              {v.overallVote && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                                  {v.overallVote.percentage}% ({v.overallVote.votes}{" "}
                                  {v.overallVote.votes === 1 ? "vote" : "votes"})
                                </span>
                              )}
                            </div>

                            {overallPlayer ? (
                              <div className="flex items-center gap-3">
                                {/* Circular Profile Picture */}
                                <div
                                  className="w-12 h-12 rounded-full p-0.5 flex items-center justify-center shrink-0 shadow-md overflow-hidden"
                                  style={{
                                    background: overallClubColors
                                      ? overallClubColors.background
                                      : "rgba(255, 255, 255, 0.1)",
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
                                    <p className="text-xs font-black text-white truncate leading-tight">
                                      {overallPlayer.name}
                                    </p>
                                    {isAgreed && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                                        Agreed ✓
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                                    {overallPlayer.team?.logoUrl && (
                                      <img
                                        src={overallPlayer.team.logoUrl}
                                        alt=""
                                        className="w-3 h-3 object-contain shrink-0"
                                      />
                                    )}
                                    <span className="truncate">
                                      {overallPlayer.team?.shortName ??
                                        overallPlayer.team?.name ??
                                        overallPlayer.position ??
                                        "Player"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 italic">No community votes yet</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4. Watch History */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <span className="text-emerald-400">📜</span>
                  <span>{userName ? `${userName}'s Watch History` : "Verified Watch History"}</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Small match logs with club logos & final score. Click any match to view its full details.
                </p>
              </div>

              {/* Checkbox filter */}
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer self-start sm:self-auto px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08]">
                <input
                  type="checkbox"
                  checked={fullMatchesOnly}
                  onChange={(e) => setFullMatchesOnly(e.target.checked)}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
                <span>Full 90' matches only</span>
              </label>
            </div>

            {watchLoading && <LoadingState label="Loading watch history..." />}

            {filteredWatches.length === 0 && !watchLoading && (
              <EmptyState
                title="No watch records found"
                subtitle="No recorded matches in this log."
              />
            )}

            {/* Small Boxes for Matches Watched */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredWatches.map((w) => {
                const m = w.match;
                if (!m) return null;

                return (
                  <Link
                    key={w.id}
                    to={`/matches/${m.id}`}
                    viewTransition
                    className="glass-card flex items-center justify-between p-3.5 rounded-2xl border hover:border-emerald-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all group"
                  >
                    {/* Home Team */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                        {m.homeTeam?.logoUrl ? (
                          <img src={m.homeTeam.logoUrl} alt="" className="w-5 h-5 object-contain" />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400">{(m.homeTeam?.name ?? "H").slice(0, 2)}</span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-200 truncate group-hover:text-emerald-400 transition-colors">
                        {m.homeTeam?.name ?? "Home"}
                      </span>
                    </div>

                    {/* Central Scorecard */}
                    <div className="flex flex-col items-center px-2 flex-shrink-0 min-w-[96px] max-w-[124px]">
                      <div className="px-3 py-1 rounded-xl bg-black/40 border border-white/10 flex items-center gap-2 tabular-nums font-black text-sm text-white">
                        <span>{m.homeScore ?? "-"}</span>
                        <span className="text-slate-500 text-xs">:</span>
                        <span>{m.awayScore ?? "-"}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold mt-1">
                        {formatDateTimeline(m.kickoffAt)}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 max-w-full truncate text-center mt-0.5" title={m.competition?.name ?? undefined}>
                        {m.competition?.name ?? "League"}
                      </span>
                    </div>

                    {/* Away Team */}
                    <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-200 truncate text-right group-hover:text-emerald-400 transition-colors">
                        {m.awayTeam?.name ?? "Away"}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                        {m.awayTeam?.logoUrl ? (
                          <img src={m.awayTeam.logoUrl} alt="" className="w-5 h-5 object-contain" />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400">{(m.awayTeam?.name ?? "A").slice(0, 2)}</span>
                        )}
                      </div>
                    </div>

                    {/* Duration Badge */}
                    <div className="ml-3 pl-2.5 border-l border-white/10 flex-shrink-0 text-right">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 block tabular-nums">
                        {w.watchDurationMinutes}' min
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        {w.watchType === "FULL_MATCH" ? "Full Match" : `${w.startMinute}'–${w.endMinute}'`}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number | string;
  colorClass: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] p-4 transition-all">
      <p className={`text-2xl sm:text-3xl font-black tabular-nums tracking-tight ${colorClass}`}>
        {value}
      </p>
      <p className="text-xs font-semibold text-slate-400 mt-1">{label}</p>
    </div>
  );
}
