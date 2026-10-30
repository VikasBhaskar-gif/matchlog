import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { usePlayers, useMyFollows } from "../hooks/queries";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { LoadingState, EmptyState } from "../components/States";
import { formatPosition, playerInitials } from "../lib/format";
import type { Player } from "../api/types";

export function PlayersPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(() => searchParams.get("q") || "");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = searchInput.trim();
      setDebouncedQuery(q);
      setSearchParams(q ? { q } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setSearchParams]);

  const follows = useMyFollows();
  const players = usePlayers(debouncedQuery || undefined);

  const followedPlayersList = useMemo(() => {
    return follows.data?.players ?? [];
  }, [follows.data?.players]);

  const followedIds = useMemo(() => {
    return new Set(followedPlayersList.map((p) => p.id));
  }, [followedPlayersList]);

  // Filter followed players by search term if active
  const filteredFollowed = useMemo(() => {
    if (!debouncedQuery) return followedPlayersList;
    const q = debouncedQuery.toLowerCase();
    return followedPlayersList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.position?.toLowerCase().includes(q) ||
        (q === "attack" && p.position?.toLowerCase() === "offence") ||
        (q === "offence" && p.position?.toLowerCase() === "attack") ||
        p.teamName?.toLowerCase().includes(q) ||
        p.nationality?.toLowerCase().includes(q)
    );
  }, [followedPlayersList, debouncedQuery]);

  // General players list, excluding any player already displayed in followed section
  const otherPlayers = useMemo(() => {
    const list = players.data?.players ?? [];
    return list.filter((p) => !followedIds.has(p.id));
  }, [players.data?.players, followedIds]);

  const hasAny = filteredFollowed.length > 0 || otherPlayers.length > 0;
  const isLoading = players.isLoading || (user ? follows.isLoading : false);

  async function handleToggleFollow(playerId: string, isCurrentlyFollowing: boolean) {
    if (!user || pendingIds.has(playerId)) return;
    setPendingIds((prev) => new Set(prev).add(playerId));

    const previousFollows = qc.getQueryData<{ teams: any[]; competitions: any[]; players: any[] }>(["me", "follows"]);
    if (previousFollows) {
      const allPlayersList = players.data?.players ?? [];
      const targetPlayer = allPlayersList.find((p) => p.id === playerId);
      qc.setQueryData(["me", "follows"], {
        ...previousFollows,
        players: isCurrentlyFollowing
          ? previousFollows.players.filter((p) => p.id !== playerId)
          : targetPlayer
          ? [...previousFollows.players, targetPlayer]
          : previousFollows.players,
      });
    }

    try {
      if (isCurrentlyFollowing) {
        await api.delete(`/players/${playerId}/follow`);
      } else {
        await api.post(`/players/${playerId}/follow`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me", "follows"] }),
        qc.invalidateQueries({ queryKey: ["players"] }),
        qc.invalidateQueries({ queryKey: ["player", playerId] }),
      ]);
    } catch (err) {
      console.error("Follow error:", err);
      if (previousFollows) {
        qc.setQueryData(["me", "follows"], previousFollows);
      }
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Players Database</h1>
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
          Follow your favorite players to track their appearances, matchlog minutes, and People's MOTM honors.
        </p>
      </div>

      {/* Modern Search */}
      <div className="relative">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search players (e.g. Saka, Bellingham, Mbappé, Yamal)..."
          className="w-full px-4 py-3 pl-11 rounded-2xl bg-[var(--color-surface)] border border-white/10 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-sm"
        />
        <svg
          className="w-4 h-4 absolute left-4 top-3.5 text-slate-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {isLoading && <LoadingState label="Searching players..." />}
      {!isLoading && !hasAny && <EmptyState title="No players found" />}

      {/* Followed Players Section */}
      {user && filteredFollowed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 px-1">
            <h2 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Followed Players ({filteredFollowed.length})</span>
            </h2>
          </div>
          <div className="space-y-2.5">
            {filteredFollowed.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                isFollowing={true}
                isPending={pendingIds.has(p.id)}
                canFollow={!!user}
                onToggle={() => handleToggleFollow(p.id, true)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Other Players Section */}
      {otherPlayers.length > 0 && (
        <div className="space-y-3">
          {user && filteredFollowed.length > 0 && (
            <div className="flex items-center justify-between border-b border-white/10 pb-2 pt-2 px-1">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
                {debouncedQuery ? "Other Matches" : "All Players"}
              </h2>
            </div>
          )}
          <div className="space-y-2.5">
            {otherPlayers.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                isFollowing={false}
                isPending={pendingIds.has(p.id)}
                canFollow={!!user}
                onToggle={() => handleToggleFollow(p.id, false)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  isFollowing,
  isPending,
  canFollow,
  onToggle,
}: {
  player: Player;
  isFollowing: boolean;
  isPending: boolean;
  canFollow: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="glass-card flex items-center justify-between rounded-2xl p-3.5 group">
      <Link
        to={`/players/${player.id}`}
        viewTransition
        className="flex items-center gap-3.5 flex-1 min-w-0 pr-3"
      >
        <div className="w-11 h-11 rounded-xl bg-white/[0.04] flex items-center justify-center font-bold text-xs text-emerald-400 flex-shrink-0 border border-white/10 overflow-hidden shadow-inner group-hover:border-emerald-500/40 transition-colors tracking-wider">
          {player.photoUrl ? (
            <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform" />
          ) : (
            playerInitials(player.name)
          )}
        </div>
        <div className="min-w-0">
          <p className="font-extrabold text-sm text-slate-200 group-hover:text-emerald-400 transition-colors truncate">
            {player.name}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-400 truncate mt-0.5">
            {player.position && (
              <span className="font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 text-[11px]">
                {formatPosition(player.position)}
              </span>
            )}
            {player.position && (player.teamName || player.nationality) && <span>•</span>}
            {player.teamName ? (
              <span className="flex items-center gap-1.5 truncate">
                {player.teamBadgeUrl && <img src={player.teamBadgeUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                <span className="font-medium text-slate-300">{player.teamName}</span>
              </span>
            ) : (
              player.nationality && <span>{player.nationality}</span>
            )}
          </div>
        </div>
      </Link>

      {canFollow && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          disabled={isPending}
          className={`text-xs font-black px-3.5 py-1.5 rounded-xl transition-all shadow-sm ${
            isFollowing
              ? "bg-white/[0.06] text-emerald-400 border border-emerald-500/40 hover:bg-white/[0.1]"
              : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98]"
          } disabled:opacity-50`}
        >
          {isPending ? "..." : isFollowing ? "✓ Following" : "+ Follow"}
        </button>
      )}
    </div>
  );
}
