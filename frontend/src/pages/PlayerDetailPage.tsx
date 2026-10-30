import { useParams, Link, useNavigate } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { usePlayer } from "../hooks/queries";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { LoadingState, ErrorState } from "../components/States";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { formatPosition, formatDateTimeline, formatMatchMinute } from "../lib/format";
import type { Match } from "../api/types";
import { useState } from "react";

export function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = usePlayer(id);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [followPending, setFollowPending] = useState(false);

  const { data: myStats } = useQuery({
    queryKey: ["player-my-stats", id],
    queryFn: () =>
      api.get<{
        matchesWatchedWith: number;
        minutesWatchedWith: number;
        timesSelectedAsPotm: number;
        matches: Array<Match & {
          minutesWatched: number;
          isStarter: boolean;
          minutesPlayed: number | null;
          subInMinute: number | null;
        }>;
      }>(`/players/${id}/my-stats`),
    enabled: !!id && !!user,
  });

  if (isLoading) return <LoadingState label="Loading player profile..." />;
  if (isError || !data?.player) {
    return <ErrorState message="Player not found." onRetry={() => refetch()} />;
  }

  const p = data.player;

  async function handleToggleFollow() {
    if (!user || followPending) return;
    setFollowPending(true);
    try {
      if (p.isFollowing) {
        await api.delete(`/players/${p.id}/follow`);
      } else {
        await api.post(`/players/${p.id}/follow`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["player", p.id] }),
        qc.invalidateQueries({ queryKey: ["me", "follows"] }),
        qc.invalidateQueries({ queryKey: ["players"] }),
      ]);
    } catch (err) {
      console.error("Follow error:", err);
    } finally {
      setFollowPending(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate("/players");
          }
        }}
        className="text-xs font-bold text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 transition-colors cursor-pointer group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
        <span>Back</span>
      </button>

      {/* Header Card */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#111927]/90 to-[#0c121e]/90 p-6 sm:p-7 relative overflow-hidden backdrop-blur-xl shadow-xl">
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <PlayerAvatar
              name={p.name}
              photoUrl={p.photoUrl}
              className="w-18 h-18 sm:w-20 sm:h-20"
              roundedClassName="rounded-2xl"
              textClassName="text-2xl font-black text-emerald-400"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{p.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs sm:text-sm text-slate-400">
                {p.position && (
                  <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    {formatPosition(p.position)}
                  </span>
                )}
                {p.position && p.nationality && <span>•</span>}
                {p.nationality && <span className="font-medium text-slate-300">{p.nationality}</span>}
              </div>
              {p.team && (
                <Link
                  to={`/teams/${p.team.id}`}
                  viewTransition
                  className="text-xs text-slate-400 hover:text-white mt-1.5 inline-flex items-center gap-1.5 transition-colors"
                >
                  {p.team.logoUrl && <img src={p.team.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="font-semibold">{p.team.name}</span>
                </Link>
              )}
            </div>
          </div>

          {user && (
            <button
              onClick={handleToggleFollow}
              disabled={followPending}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all shadow-md ${
                p.isFollowing
                  ? "bg-white/[0.06] text-emerald-400 border border-emerald-500/40 hover:bg-white/[0.1] hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] shadow-emerald-500/20"
              }`}
            >
              {p.isFollowing ? "✓ Following" : "+ Follow Player"}
            </button>
          )}
        </div>

        {/* People's MOTM Awards Badge */}
        <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between bg-gradient-to-r from-amber-500/15 via-transparent to-transparent -mx-6 -mb-6 sm:-mx-7 sm:-mb-7 px-6 sm:px-7 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl select-none">⭐</span>
            <div>
              <p className="text-xs uppercase font-black tracking-wider text-amber-400">People's MOTM Awards</p>
              <p className="text-xs text-slate-400">Community match-level Player of the Match honors</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-amber-400 tabular-nums">{p.peoplesMotmAwards}</span>
            <span className="text-xs text-slate-400 ml-1">won</span>
          </div>
        </div>
      </div>

      {/* Watch Stats with Player */}
      {user && myStats && (
        <div className="rounded-3xl border border-white/10 bg-[var(--color-surface)]/70 p-6 backdrop-blur-xl shadow-lg space-y-6">
          <div>
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="text-emerald-400">❖</span>
              <span>Your Matchlog with {p.name.split(" ")[0]}</span>
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-emerald-500/30 transition-all">
                <p className="text-2xl sm:text-3xl font-black text-emerald-400 tabular-nums">{myStats.matchesWatchedWith}</p>
                <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Matches Watched</p>
              </div>
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-500/30 transition-all">
                <p className="text-2xl sm:text-3xl font-black text-cyan-400 tabular-nums">
                  {myStats.minutesWatchedWith.toLocaleString()}'
                </p>
                <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Minutes Watched</p>
              </div>
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-amber-500/30 transition-all">
                <p className="text-2xl sm:text-3xl font-black text-amber-400 tabular-nums">{myStats.timesSelectedAsPotm}</p>
                <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Your MOTM Picks</p>
              </div>
            </div>
          </div>

          {/* List of Matches Watched Featuring This Player */}
          {myStats.matches && myStats.matches.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <span className="text-emerald-400">📜</span>
                  <span>Matches Watched Featuring {p.name.split(" ")[0]} ({myStats.matches.length})</span>
                </h3>
                <span className="text-[11px] text-slate-500 font-semibold">Verified on-pitch</span>
              </div>

              <div className="space-y-2.5">
                {myStats.matches.map((m) => (
                  <Link
                    key={m.id}
                    to={`/matches/${m.id}`}
                    viewTransition
                    className="glass-card flex items-center justify-between p-3.5 rounded-2xl border border-white/10 hover:border-emerald-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all group"
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
                        {m.homeTeam?.shortName ?? m.homeTeam?.name ?? "Home"}
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
                      <span className="text-[9px] font-bold text-slate-400 max-w-full truncate text-center mt-0.5">
                        {m.competition?.name ?? "League"}
                      </span>
                    </div>

                    {/* Away Team */}
                    <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-200 truncate text-right group-hover:text-emerald-400 transition-colors">
                        {m.awayTeam?.shortName ?? m.awayTeam?.name ?? "Away"}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                        {m.awayTeam?.logoUrl ? (
                          <img src={m.awayTeam.logoUrl} alt="" className="w-5 h-5 object-contain" />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400">{(m.awayTeam?.name ?? "A").slice(0, 2)}</span>
                        )}
                      </div>
                    </div>

                    {/* Player Appearance Badge */}
                    <div className="ml-3 pl-2.5 border-l border-white/10 flex-shrink-0 text-right">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 block tabular-nums">
                        {m.minutesWatched}' watched
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        {m.isStarter ? "Started (XI)" : m.subInMinute ? `Sub on ${formatMatchMinute(m.subInMinute)}` : "Substitute"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
