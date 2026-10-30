import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCompetitions, useCompetitionStandings, useMyFollows, useMatches } from "../hooks/queries";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { LoadingState, EmptyState, ErrorState } from "../components/States";
import { LEAGUE_LOGOS, sortCompetitions } from "../lib/competitions";
import { MatchCard } from "../components/MatchCard";
import { WatchModal } from "../components/WatchModal";
import { PredictModal } from "../components/PredictModal";
import type { Match } from "../api/types";

export function LeaguesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const competitionsQuery = useCompetitions();
  const follows = useMyFollows();
  const [followBusy, setFollowBusy] = useState(false);

  const followedCompIds = useMemo(() => {
    return new Set((follows.data?.competitions ?? []).map((c) => c.id));
  }, [follows.data?.competitions]);

  const competitions = useMemo(() => {
    const raw = (competitionsQuery.data?.competitions ?? []).filter(
      (c) => c.name !== "Premier League" || c.id !== "cfdaac95-eac0-40a4-a281-6c47145ef3b4"
    );
    return sortCompetitions(raw, followedCompIds, follows.data?.teams ?? []);
  }, [competitionsQuery.data, followedCompIds, follows.data?.teams]);

  const selectedId = searchParams.get("id") || (competitions.length > 0 ? competitions[0].id : undefined);

  const selectedComp = useMemo(() => {
    return competitions.find((c) => c.id === selectedId) || competitions[0];
  }, [competitions, selectedId]);

  const standingsQuery = useCompetitionStandings(selectedComp?.id);

  const [watchTarget, setWatchTarget] = useState<Match | null>(null);
  const [predictTarget, setPredictTarget] = useState<Match | null>(null);
  const [selectedMatchday, setSelectedMatchday] = useState<string | "ALL">("ALL");

  const upcomingMatchesQuery = useMatches(
    selectedComp?.id
      ? {
          competition: selectedComp.id,
          status: "SCHEDULED",
          sort: "asc",
          limit: "380",
        }
      : undefined
  );

  const matchdays = useMemo(() => {
    const matchesList = upcomingMatchesQuery.data?.matches ?? [];
    const map = new Map<string, { round: string; minKickoff: number; matches: Match[] }>();

    for (const m of matchesList) {
      const roundName = m.round || "Upcoming Matches";
      let entry = map.get(roundName);
      if (!entry) {
        entry = {
          round: roundName,
          minKickoff: new Date(m.kickoffAt).getTime(),
          matches: [],
        };
        map.set(roundName, entry);
      }
      entry.matches.push(m);
      const kTime = new Date(m.kickoffAt).getTime();
      if (kTime < entry.minKickoff) entry.minKickoff = kTime;
    }

    return Array.from(map.values()).sort((a, b) => a.minKickoff - b.minKickoff);
  }, [upcomingMatchesQuery.data?.matches]);

  const isFollowing = selectedComp ? followedCompIds.has(selectedComp.id) : false;

  async function handleToggleFollow(comp: typeof selectedComp) {
    if (!user || !comp || followBusy) return;
    setFollowBusy(true);
    const following = followedCompIds.has(comp.id);
    try {
      if (following) {
        await api.delete(`/competitions/${comp.id}/follow`);
      } else {
        await api.post(`/competitions/${comp.id}/follow`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me", "follows"] }),
        qc.invalidateQueries({ queryKey: ["competitions"] }),
      ]);
    } catch (err) {
      console.error("Failed to follow competition", err);
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Leagues & Standings</h1>
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
          Official league tables, live standings, and follow your favorite tournaments
        </p>
      </div>

      {competitionsQuery.isLoading && <LoadingState label="Loading leagues..." />}
      {competitionsQuery.isError && <ErrorState message="Could not load competitions." onRetry={competitionsQuery.refetch} />}

      {/* Horizontal League Switcher Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {competitions.map((comp) => {
          const isSelected = comp.id === selectedComp?.id;
          const logo = LEAGUE_LOGOS[comp.name] || comp.logoUrl;

          return (
            <button
              key={comp.id}
              onClick={() => setSearchParams({ id: comp.id })}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-2 group ${
                isSelected
                  ? "bg-emerald-500/15 border-emerald-500 shadow-lg shadow-emerald-500/10 scale-[1.02]"
                  : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10 hover:border-white/20"
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 group-hover:border-emerald-500/30 flex items-center justify-center p-2 overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform shadow-inner">
                {logo ? (
                  <img src={logo} alt={comp.name} className="w-full h-full object-contain drop-shadow" />
                ) : (
                  <span className="text-xs font-black text-emerald-400">⚽</span>
                )}
              </div>
              <span className={`text-xs font-extrabold line-clamp-1 ${isSelected ? "text-emerald-400" : "text-slate-300"}`}>
                {comp.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected League Header Banner */}
      {selectedComp && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-gradient-to-b from-[#111927]/90 to-[#0c121e]/90 border border-white/10 backdrop-blur-xl shadow-xl relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/[0.06] border border-white/15 p-3 flex items-center justify-center flex-shrink-0 shadow-lg backdrop-blur-md">
              {LEAGUE_LOGOS[selectedComp.name] || selectedComp.logoUrl ? (
                <img
                  src={LEAGUE_LOGOS[selectedComp.name] || selectedComp.logoUrl || ""}
                  alt={selectedComp.name}
                  className="w-full h-full object-contain hover:scale-105 transition-transform drop-shadow"
                />
              ) : (
                <span className="text-2xl font-black text-emerald-400">⚽</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {selectedComp.country ?? "Europe"}
                </span>
                {isFollowing && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    Following
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{selectedComp.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">2026/27 Official Regular Season Table</p>
            </div>
          </div>

          {user && (
            <button
              onClick={() => handleToggleFollow(selectedComp)}
              disabled={followBusy}
              className={`text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-md self-start sm:self-auto disabled:opacity-50 ${
                isFollowing
                  ? "bg-white/[0.06] text-emerald-400 border border-emerald-500/40 hover:bg-white/[0.1] hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] shadow-emerald-500/20"
              }`}
            >
              {isFollowing ? "✓ Following League" : "+ Follow League"}
            </button>
          )}
        </div>
      )}

      {/* Standings Table Container */}
      <div className="bg-[#0f1520]/80 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl">
        <div className="px-5 py-3.5 bg-white/[0.03] border-b border-white/10 flex items-center justify-between text-xs text-slate-400 font-bold">
          <span className="uppercase tracking-wider">League Standings</span>
        </div>

        {standingsQuery.isLoading && <LoadingState label="Computing standings table..." />}
        {standingsQuery.isError && <ErrorState message="Could not load standings for this league." onRetry={standingsQuery.refetch} />}

        {standingsQuery.data && standingsQuery.data.standings.length === 0 && (
          <EmptyState title="No standings available" subtitle="Standings will appear once matches have been played in this competition." />
        )}

        {standingsQuery.data && standingsQuery.data.standings.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="py-3 px-3 sm:px-4 w-12 text-center">#</th>
                  <th className="py-3 px-2 sm:px-4">Club</th>
                  <th className="py-3 px-2 sm:px-3 text-center">MP</th>
                  <th className="py-3 px-2 sm:px-3 text-center">W</th>
                  <th className="py-3 px-2 sm:px-3 text-center">D</th>
                  <th className="py-3 px-2 sm:px-3 text-center">L</th>
                  <th className="py-3 px-2 sm:px-3 text-center hidden md:table-cell">GF</th>
                  <th className="py-3 px-2 sm:px-3 text-center hidden md:table-cell">GA</th>
                  <th className="py-3 px-2 sm:px-3 text-center">GD</th>
                  <th className="py-3 px-3 sm:px-5 text-center font-extrabold text-white">PTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {standingsQuery.data.standings.map((row) => {
                  const isTop4 = row.rank <= 4;
                  const isEuropa = row.rank === 5 || row.rank === 6;
                  const isRelegation = row.rank >= standingsQuery.data.standings.length - 2;

                  return (
                    <tr
                      key={row.teamId}
                      className="hover:bg-white/[0.04] transition-colors group"
                    >
                      {/* Rank with qualification indicator */}
                      <td className="py-3 px-3 sm:px-4 text-center font-bold relative">
                        <span className="inline-block w-6 text-center tabular-nums text-slate-300 font-bold">
                          {row.rank}
                        </span>
                        {isTop4 && (
                          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-emerald-400" title="UEFA Champions League" />
                        )}
                        {isEuropa && (
                          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-cyan-400" title="UEFA Europa League" />
                        )}
                        {isRelegation && (
                          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-rose-500" title="Relegation Zone" />
                        )}
                      </td>

                      {/* Club info */}
                      <td className="py-3 px-2 sm:px-4">
                        <Link
                          to={`/teams/${row.teamId}`}
                          viewTransition
                          className="flex items-center gap-2.5 group-hover:text-emerald-400 transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {row.teamLogoUrl ? (
                              <img src={row.teamLogoUrl} alt="" className="w-4 h-4 object-contain group-hover:scale-110 transition-transform" />
                            ) : (
                              <span className="text-[9px] font-bold text-slate-400">{row.teamName.slice(0, 2)}</span>
                            )}
                          </div>
                          <span className="font-extrabold text-slate-200 group-hover:text-emerald-400 transition-colors truncate max-w-[140px] sm:max-w-[220px]">
                            {row.teamName}
                          </span>
                        </Link>
                      </td>

                      {/* Match records */}
                      <td className="py-3 px-2 sm:px-3 text-center tabular-nums text-slate-400">{row.played}</td>
                      <td className="py-3 px-2 sm:px-3 text-center tabular-nums text-emerald-400 font-semibold">{row.won}</td>
                      <td className="py-3 px-2 sm:px-3 text-center tabular-nums text-slate-400">{row.drawn}</td>
                      <td className="py-3 px-2 sm:px-3 text-center tabular-nums text-rose-400 font-semibold">{row.lost}</td>
                      <td className="py-3 px-2 sm:px-3 text-center tabular-nums text-slate-400 hidden md:table-cell">{row.goalsFor}</td>
                      <td className="py-3 px-2 sm:px-3 text-center tabular-nums text-slate-400 hidden md:table-cell">{row.goalsAgainst}</td>
                      <td className="py-3 px-2 sm:px-3 text-center tabular-nums font-bold text-slate-300">
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="py-3 px-3 sm:px-5 text-center tabular-nums font-black text-white text-sm sm:text-base bg-white/[0.02]">
                        {row.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Table Foot Legend */}
            <div className="p-3 bg-white/[0.02] border-t border-white/10 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Champions League</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>Europa League</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Relegation</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Upcoming League Fixtures by Matchday Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-lg">📅</span>
              <h2 className="text-lg font-black text-white tracking-tight">
                Upcoming Fixtures by Matchday
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Full schedule for {selectedComp?.name ?? "this tournament"} arranged chronologically by round
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-slate-300 self-start sm:self-auto">
            {upcomingMatchesQuery.data?.matches?.length ?? 0} upcoming fixtures
          </span>
        </div>

        {upcomingMatchesQuery.isLoading && <LoadingState label="Loading upcoming matchdays..." />}

        {matchdays.length === 0 && !upcomingMatchesQuery.isLoading && (
          <EmptyState
            title="No upcoming fixtures"
            subtitle="All matches in this competition schedule may have already concluded or not yet released."
          />
        )}

        {/* Matchday Quick Filter Pills */}
        {matchdays.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 green-scrollbar">
            <button
              onClick={() => setSelectedMatchday("ALL")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedMatchday === "ALL"
                  ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                  : "bg-white/[0.04] text-slate-400 hover:text-white border border-white/10"
              }`}
            >
              All Matchdays ({matchdays.length})
            </button>
            {matchdays.map((md) => (
              <button
                key={md.round}
                onClick={() => setSelectedMatchday(md.round)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedMatchday === md.round
                    ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                    : "bg-white/[0.04] text-slate-400 hover:text-white border border-white/10"
                }`}
              >
                {md.round}
              </button>
            ))}
          </div>
        )}

        {/* Matchdays List */}
        <div className="space-y-6">
          {matchdays
            .filter((md) => selectedMatchday === "ALL" || selectedMatchday === md.round)
            .map((md) => (
              <div key={md.round} className="space-y-3">
                <div className="flex items-center justify-between px-1 border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <h3 className="text-sm font-black text-white tracking-wide uppercase">
                      {md.round}
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {md.matches.length} {md.matches.length === 1 ? "fixture" : "fixtures"}
                  </span>
                </div>
                <div className="space-y-3">
                  {md.matches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      onRecordWatch={setWatchTarget}
                      onPredict={setPredictTarget}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {watchTarget && (
        <WatchModal
          match={watchTarget}
          existingWatch={watchTarget.myWatch}
          onClose={() => setWatchTarget(null)}
          onSaved={() => {
            setWatchTarget(null);
            qc.invalidateQueries();
          }}
        />
      )}

      {predictTarget && (
        <PredictModal
          match={predictTarget}
          existingPrediction={predictTarget.myPrediction}
          onClose={() => setPredictTarget(null)}
          onSaved={() => {
            setPredictTarget(null);
            qc.invalidateQueries({ queryKey: ["matches"] });
            qc.invalidateQueries({ queryKey: ["match", predictTarget.id] });
            qc.invalidateQueries({ queryKey: ["predictions"] });
            qc.invalidateQueries({ queryKey: ["stats"] });
          }}
        />
      )}
    </div>
  );
}
