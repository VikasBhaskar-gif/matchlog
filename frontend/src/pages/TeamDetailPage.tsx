import { useRef, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTeam, useMatches, useMyFollows } from "../hooks/queries";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { LoadingState, EmptyState, ErrorState } from "../components/States";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { formatDateTimeline, formatTimeShort, formatPosition } from "../lib/format";
import { useLiveMatchClock } from "../hooks/useLiveMatchClock";
import type { Match } from "../api/types";

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const teamQuery = useTeam(id);
  const follows = useMyFollows();
  const matchesQuery = useMatches(id ? { team: id, limit: "250", sort: "asc" } : undefined);

  const upcomingRef = useRef<HTMLDivElement | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  const team = teamQuery.data?.team;
  const squad = useMemo(() => team?.squad ?? [], [team?.squad]);
  const [positionFilter, setPositionFilter] = useState<"ALL" | "GK" | "DEF" | "MID" | "ATT">("ALL");
  const [squadSearch, setSquadSearch] = useState("");
  const [playerFollowBusy, setPlayerFollowBusy] = useState<Record<string, boolean>>({});

  const positionCounts = useMemo(() => {
    let gk = 0, def = 0, mid = 0, att = 0;
    for (const p of squad) {
      const pos = (p.position || "").toLowerCase();
      if (pos.includes("goal") || pos === "gk") gk++;
      else if (pos.includes("def") || pos.includes("back")) def++;
      else if (pos.includes("mid")) mid++;
      else if (pos.includes("att") || pos.includes("forw") || pos.includes("strik")) att++;
    }
    return {
      ALL: squad.length,
      GK: gk,
      DEF: def,
      MID: mid,
      ATT: att,
    };
  }, [squad]);

  const filteredSquad = useMemo(() => {
    return squad.filter((p) => {
      const pos = (p.position || "").toLowerCase();
      if (positionFilter === "GK" && !pos.includes("goal") && pos !== "gk") return false;
      if (positionFilter === "DEF" && !pos.includes("def") && !pos.includes("back")) return false;
      if (positionFilter === "MID" && !pos.includes("mid")) return false;
      if (positionFilter === "ATT" && !pos.includes("att") && !pos.includes("forw") && !pos.includes("strik")) return false;

      if (squadSearch.trim()) {
        const q = squadSearch.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesPos = (p.position || "").toLowerCase().includes(q);
        const matchesNat = (p.nationality || "").toLowerCase().includes(q);
        if (!matchesName && !matchesPos && !matchesNat) return false;
      }

      return true;
    });
  }, [squad, positionFilter, squadSearch]);

  async function handleTogglePlayerFollow(e: React.MouseEvent, playerId: string, currentFollowing: boolean) {
    e.preventDefault();
    e.stopPropagation();
    if (!user || playerFollowBusy[playerId]) return;

    setPlayerFollowBusy((prev) => ({ ...prev, [playerId]: true }));
    try {
      if (currentFollowing) {
        await api.delete(`/players/${playerId}/follow`);
      } else {
        await api.post(`/players/${playerId}/follow`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["team", team?.id] }),
        qc.invalidateQueries({ queryKey: ["me", "follows"] }),
        qc.invalidateQueries({ queryKey: ["player", playerId] }),
        qc.invalidateQueries({ queryKey: ["players"] }),
      ]);
    } catch (err) {
      console.error("Failed to toggle player follow", err);
    } finally {
      setPlayerFollowBusy((prev) => ({ ...prev, [playerId]: false }));
    }
  }
  const followedTeams = follows.data?.teams;
  const isFollowing = useMemo(() => {
    if (!id || !followedTeams) return false;
    return followedTeams.some((t) => t.id === id);
  }, [id, followedTeams]);

  const matchesList = useMemo(() => {
    const list = matchesQuery.data?.matches ?? [];
    return [...list].sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
  }, [matchesQuery.data?.matches]);

  const { pastMatches, upcomingMatches, firstUpcomingId, record } = useMemo(() => {
    const nowTime = new Date().getTime();
    const past: Match[] = [];
    const upcoming: Match[] = [];
    let wins = 0;
    let draws = 0;
    let losses = 0;

    for (const m of matchesList) {
      const kickoffTime = new Date(m.kickoffAt).getTime();
      const isPast = m.status === "FINISHED" || m.status === "CANCELLED" || kickoffTime < nowTime;
      if (isPast && m.status !== "LIVE") {
        past.push(m);
        if (m.status === "FINISHED" && team) {
          const isHome = m.homeTeamId === team.id;
          const teamScore = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
          const opponentScore = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
          if (teamScore > opponentScore) wins++;
          else if (teamScore < opponentScore) losses++;
          else draws++;
        }
      } else {
        upcoming.push(m);
      }
    }

    const firstId = upcoming.length > 0 ? upcoming[0].id : null;
    return { pastMatches: past, upcomingMatches: upcoming, firstUpcomingId: firstId, record: { wins, draws, losses } };
  }, [matchesList, team]);

  const watchedCount = useMemo(() => {
    return matchesList.filter((m) => !!m.myWatch).length;
  }, [matchesList]);

  async function handleToggleFollow() {
    if (!user || !team || followBusy) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await api.delete(`/teams/${team.id}/follow`);
      } else {
        await api.post(`/teams/${team.id}/follow`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me", "follows"] }),
        qc.invalidateQueries({ queryKey: ["team", team.id] }),
        qc.invalidateQueries({ queryKey: ["teams"] }),
      ]);
    } catch (err) {
      console.error("Failed to toggle follow", err);
    } finally {
      setFollowBusy(false);
    }
  }

  function scrollToUpcoming() {
    upcomingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (teamQuery.isLoading || matchesQuery.isLoading) {
    return <LoadingState label="Loading team fixtures & results..." />;
  }

  if (teamQuery.isError || !team) {
    return <ErrorState message="Team not found." onRetry={() => teamQuery.refetch()} />;
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Navigation & Header */}
      <div>
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/teams");
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-emerald-400 transition-colors mb-3 cursor-pointer group"
        >
          <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
          <span>Back</span>
        </button>

        {/* Team Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-gradient-to-b from-[#111927]/90 to-[#0c121e]/90 border border-white/10 backdrop-blur-xl shadow-xl relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          <div className="flex items-center gap-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-white/[0.04] flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0 shadow-inner">
              {team.logoUrl ? (
                <img src={team.logoUrl} alt={team.name} className="h-12 w-12 sm:h-14 sm:w-14 object-contain hover:scale-105 transition-transform" />
              ) : (
                <span className="text-xl font-black text-emerald-400">{team.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight">{team.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                {team.country && (
                  <span className="text-xs font-semibold text-slate-400">{team.country}</span>
                )}
                {pastMatches.length > 0 && (
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      {record.wins} W
                    </span>
                    <span className="text-slate-400 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                      {record.draws} D
                    </span>
                    <span className="text-rose-400 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                      {record.losses} L
                    </span>
                  </div>
                )}
                {user && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{watchedCount} {watchedCount === 1 ? "Match" : "Matches"} Watched</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {upcomingMatches.length > 0 && (
              <button
                onClick={scrollToUpcoming}
                className="text-xs font-bold px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-emerald-500/40 text-slate-300 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Jump to Upcoming ↓
              </button>
            )}
            <button
              onClick={handleToggleFollow}
              disabled={followBusy}
              className={`text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-md disabled:opacity-50 ${
                isFollowing
                  ? "bg-white/[0.06] text-emerald-400 border border-emerald-500/40 hover:bg-white/[0.1] hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] shadow-emerald-500/20"
              }`}
            >
              {isFollowing ? "✓ Following" : "+ Follow Team"}
            </button>
          </div>
        </div>
      </div>

      {/* Squad Players Section (BEFORE Matches Schedule) */}
      {squad.length > 0 && (
        <div className="bg-[#0f1520]/80 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl space-y-4 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-base">👥</span>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Squad Players
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold tabular-nums">
                  {squad.length} Players
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Click any player to view their profile, watch stats, and follow them directly
              </p>
            </div>

            {/* Position filter buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { key: "ALL" as const, label: "All", count: positionCounts.ALL },
                { key: "GK" as const, label: "GK", count: positionCounts.GK },
                { key: "DEF" as const, label: "Defenders", count: positionCounts.DEF },
                { key: "MID" as const, label: "Midfielders", count: positionCounts.MID },
                { key: "ATT" as const, label: "Forwards", count: positionCounts.ATT },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPositionFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    positionFilter === tab.key
                      ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black scale-[1.02]"
                      : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/5"
                  }`}
                >
                  {tab.label} <span className="opacity-75 text-[10px]">({tab.count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Squad Search */}
          {squad.length > 8 && (
            <div className="relative">
              <input
                type="text"
                value={squadSearch}
                onChange={(e) => setSquadSearch(e.target.value)}
                placeholder={`Search ${team.shortName ?? team.name} squad (e.g. Yamal, Pedri)...`}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 pl-9 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 transition-colors"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
              {squadSearch && (
                <button
                  type="button"
                  onClick={() => setSquadSearch("")}
                  className="absolute right-3 top-2 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Squad Grid */}
          {filteredSquad.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No players found matching your filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredSquad.map((player) => {
                const pos = player.position?.toLowerCase() ?? "";
                const isGk = pos.includes("goal") || pos === "gk";
                const isDef = pos.includes("def") || pos.includes("back");
                const isMid = pos.includes("mid");
                const isAtt = pos.includes("att") || pos.includes("forw") || pos.includes("strik");

                const posBadgeClass = isGk
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : isDef
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                  : isMid
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : isAtt
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  : "bg-slate-500/10 text-slate-400 border-slate-500/30";

                const isFollowed = !!player.isFollowing;
                const isBusy = !!playerFollowBusy[player.id];

                return (
                  <Link
                    key={player.id}
                    to={`/players/${player.id}`}
                    viewTransition
                    className="glass-card flex items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 hover:border-emerald-500/40 hover:bg-white/[0.04] transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Player Avatar */}
                      <PlayerAvatar
                        name={player.name}
                        photoUrl={player.photoUrl}
                        className="w-11 h-11 group-hover:scale-105 group-hover:border-emerald-500/50 transition-all shadow-sm"
                      />

                      {/* Player Info */}
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-xs text-white truncate group-hover:text-emerald-400 transition-colors">
                          {player.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {player.position && (
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded border ${posBadgeClass}`}
                            >
                              {formatPosition(player.position)}
                            </span>
                          )}
                          {player.nationality && (
                            <span className="text-[10px] text-slate-400 truncate">
                              • {player.nationality}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Follow Button */}
                    {user && (
                      <button
                        type="button"
                        onClick={(e) => handleTogglePlayerFollow(e, player.id, isFollowed)}
                        disabled={isBusy}
                        className={`text-[11px] font-black px-2.5 py-1.5 rounded-xl transition-all flex-shrink-0 flex items-center gap-1 ${
                          isFollowed
                            ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-rose-500/15 hover:border-rose-500/40 hover:text-rose-300"
                            : "bg-white/[0.06] border border-white/10 text-slate-200 hover:bg-emerald-500 hover:text-black hover:border-emerald-400 shadow-sm"
                        }`}
                        title={isFollowed ? "Click to unfollow player" : "Click to follow player"}
                      >
                        {isBusy ? (
                          <span className="opacity-70">...</span>
                        ) : isFollowed ? (
                          <>
                            <span>✓</span>
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <span>+</span>
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Matches Schedule & Results Container */}
      <div className="bg-[#0f1520]/80 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl">
        <div className="px-5 py-3.5 bg-white/[0.03] border-b border-white/10 flex items-center justify-between text-xs text-slate-400 font-bold">
          <div className="flex items-center gap-2.5">
            <span className="uppercase tracking-wider">Match Schedule & Results</span>
            {user && (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold">
                {watchedCount} Watched
              </span>
            )}
          </div>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-slate-300">
            {pastMatches.length} past • {upcomingMatches.length} upcoming
          </span>
        </div>

        {matchesList.length === 0 ? (
          <EmptyState title="No fixtures found for this team." />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {matchesList.map((m) => {
              const isFirstUpcoming = m.id === firstUpcomingId;
              const isFinished = m.status === "FINISHED";
              const isLive = m.status === "LIVE";
              const isCancelled = m.status === "CANCELLED" || m.status === "POSTPONED";

              const isHome = m.homeTeamId === team.id;
              const teamScore = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
              const opponentScore = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);

              let outcomeColor = "bg-slate-700/80 text-white border border-slate-600";
              let outcomeTitle = "Draw";
              if (isFinished) {
                if (teamScore > opponentScore) {
                  outcomeColor = "bg-emerald-600 text-white border border-emerald-500";
                  outcomeTitle = `Won (${teamScore} - ${opponentScore})`;
                } else if (teamScore < opponentScore) {
                  outcomeColor = "bg-rose-600 text-white border border-rose-500";
                  outcomeTitle = `Lost (${teamScore} - ${opponentScore})`;
                } else {
                  outcomeColor = "bg-slate-700 text-slate-200 border border-slate-600";
                  outcomeTitle = `Drew (${teamScore} - ${opponentScore})`;
                }
              }

              return (
                <div key={m.id}>
                  {/* First Upcoming Match Anchor Bar */}
                  {isFirstUpcoming && (
                    <div
                      ref={upcomingRef}
                      className="py-2.5 px-5 bg-emerald-500/10 border-y border-emerald-500/30 flex items-center justify-between text-xs font-black text-emerald-400"
                    >
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="uppercase tracking-wider">Upcoming Matches</span>
                      </div>
                      <span className="text-[11px] font-normal text-slate-400 hidden sm:inline">
                        ↑ Scroll up for completed • ↓ Scroll down for upcoming
                      </span>
                    </div>
                  )}

                  {/* Match Row */}
                  <div
                    onClick={() => navigate(`/matches/${m.id}`)}
                    className="flex items-center justify-between py-3.5 px-4 sm:px-6 hover:bg-white/[0.04] cursor-pointer transition-colors text-sm group"
                  >
                    {/* Date Column */}
                    <div className="w-24 sm:w-32 text-xs sm:text-sm text-slate-400 font-medium flex-shrink-0">
                      {formatDateTimeline(m.kickoffAt)}
                    </div>

                    {/* Match Scoreboard Center */}
                    <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 px-2 min-w-0">
                      {/* Home Team */}
                      <span
                        className={`text-xs sm:text-sm text-right truncate flex-1 ${
                          m.homeTeamId === team.id ? "text-white font-black" : "text-slate-400 font-semibold"
                        }`}
                      >
                        {m.homeTeam?.name ?? m.homeTeamPlaceholder ?? "Home"}
                      </span>

                      {/* Home Crest */}
                      <div className="h-6 w-6 rounded-full bg-white/[0.05] flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/10">
                        {m.homeTeam?.logoUrl ? (
                          <img
                            src={m.homeTeam.logoUrl}
                            alt=""
                            className="h-4 w-4 object-contain group-hover:scale-110 transition-transform"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400">
                            {(m.homeTeam?.name ?? "H").slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Score or Time */}
                      <div className="flex-shrink-0 mx-1">
                        {isFinished ? (
                          <div
                            className={`${outcomeColor} font-black text-xs sm:text-sm px-3 py-0.5 rounded-lg shadow-sm flex items-center gap-1.5 tabular-nums`}
                            title={outcomeTitle}
                          >
                            <span>{m.homeScore ?? 0}</span>
                            <span>:</span>
                            <span>{m.awayScore ?? 0}</span>
                          </div>
                        ) : isLive ? (
                          <LiveMatchRowScore kickoffAt={m.kickoffAt} homeScore={m.homeScore} awayScore={m.awayScore} />
                        ) : isCancelled ? (
                          <span className="text-[11px] font-bold text-rose-400 uppercase bg-rose-500/10 px-2 py-0.5 rounded">
                            {m.status}
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-bold text-slate-200 tabular-nums">
                            {formatTimeShort(m.kickoffAt)}
                          </span>
                        )}
                      </div>

                      {/* Away Crest */}
                      <div className="h-6 w-6 rounded-full bg-white/[0.05] flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/10">
                        {m.awayTeam?.logoUrl ? (
                          <img
                            src={m.awayTeam.logoUrl}
                            alt=""
                            className="h-4 w-4 object-contain group-hover:scale-110 transition-transform"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400">
                            {(m.awayTeam?.name ?? "A").slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Away Team */}
                      <span
                        className={`text-xs sm:text-sm text-left truncate flex-1 ${
                          m.awayTeamId === team.id ? "text-white font-black" : "text-slate-400 font-semibold"
                        }`}
                      >
                        {m.awayTeam?.name ?? m.awayTeamPlaceholder ?? "Away"}
                      </span>
                    </div>

                    {/* Competition Pill & Watched */}
                    <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400 font-medium flex-shrink-0 text-right">
                      {m.myWatch && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                          Watched
                        </span>
                      )}
                      <span className="truncate max-w-[90px] sm:max-w-[140px]">{m.competition?.name ?? "League"}</span>
                      <span className="text-[11px] text-slate-500">⚽</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveMatchRowScore({
  kickoffAt,
  homeScore,
  awayScore,
}: {
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
}) {
  const clock = useLiveMatchClock(kickoffAt, "LIVE");
  return (
    <div className="bg-rose-500/20 border border-rose-500/40 text-rose-400 font-black text-xs px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 tabular-nums">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
      <span>{homeScore ?? 0} : {awayScore ?? 0}</span>
      <span className="text-emerald-400 font-mono text-[10px] font-bold">({clock.minuteText})</span>
    </div>
  );
}
