import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTeams, useMyFollows } from "../hooks/queries";
import { api } from "../api/client";
import { LoadingState, EmptyState } from "../components/States";
import type { Team } from "../api/types";

export function TeamsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") || "");

  useEffect(() => {
    setSearchParams(query.trim() ? { q: query.trim() } : {}, { replace: true });
  }, [query, setSearchParams]);

  const teams = useTeams(query || undefined);
  const follows = useMyFollows();

  const followedTeamIds = useMemo(() => new Set((follows.data?.teams ?? []).map((t) => t.id)), [follows.data?.teams]);

  const { followedTeamsList, otherTeamsList } = useMemo(() => {
    const list = teams.data?.teams ?? [];
    const followed: Team[] = [];
    const other: Team[] = [];
    for (const t of list) {
      if (followedTeamIds.has(t.id)) {
        followed.push(t);
      } else {
        other.push(t);
      }
    }
    return { followedTeamsList: followed, otherTeamsList: other };
  }, [teams.data?.teams, followedTeamIds]);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Teams</h1>
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
          Follow your favorite clubs to personalize your match feed
        </p>
      </div>

      {/* Search Bar */}
      <section className="space-y-4">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams (e.g. Manchester City, Inter)..."
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
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {teams.isLoading && <LoadingState label="Loading clubs..." />}
        {teams.data && teams.data.teams.length === 0 && <EmptyState title="No clubs found" />}

        {followedTeamsList.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Following ({followedTeamsList.length})</span>
            </h3>
            {followedTeamsList.map((t) => (
              <TeamRow key={t.id} team={t} following={true} />
            ))}
          </div>
        )}

        <div className="space-y-2.5">
          {followedTeamsList.length > 0 && otherTeamsList.length > 0 && (
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider pt-2">
              All Other Clubs
            </h3>
          )}
          {otherTeamsList.map((t) => (
            <TeamRow key={t.id} team={t} following={false} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamRow({ team, following }: { team: Team; following: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (following) await api.delete(`/teams/${team.id}/follow`);
      else await api.post(`/teams/${team.id}/follow`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me", "follows"] }),
        qc.invalidateQueries({ queryKey: ["team", team.id] }),
        qc.invalidateQueries({ queryKey: ["teams"] }),
      ]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to update follow status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => navigate(`/teams/${team.id}`)}
      className="glass-card flex items-center justify-between rounded-2xl p-4 cursor-pointer group"
    >
      <div className="flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-white/[0.04] flex items-center justify-center text-xs font-black overflow-hidden border border-white/10 flex-shrink-0 group-hover:border-emerald-500/50 transition-colors">
          {team.logoUrl ? (
            <img
              src={team.logoUrl}
              alt=""
              className="h-7 w-7 object-contain group-hover:scale-110 transition-transform"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span className="text-emerald-400">{team.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div>
          <p className="font-extrabold text-sm text-slate-200 group-hover:text-emerald-400 transition-colors">{team.name}</p>
          {team.country && <p className="text-xs text-slate-400">{team.country}</p>}
          {error && <p className="text-xs text-rose-400 mt-0.5">{error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-slate-400 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
          View fixtures →
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          disabled={busy}
          className={`text-xs font-black px-3.5 py-1.5 rounded-xl transition-all shadow-sm disabled:opacity-50 ${
            following
              ? "bg-white/[0.06] text-emerald-400 border border-emerald-500/40 hover:bg-white/[0.1]"
              : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98]"
          }`}
        >
          {following ? "✓ Following" : "+ Follow"}
        </button>
      </div>
    </div>
  );
}


