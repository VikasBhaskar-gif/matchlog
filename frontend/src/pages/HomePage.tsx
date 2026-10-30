import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useMatches, useMyFollows } from "../hooks/queries";
import { MatchCard } from "../components/MatchCard";
import { WatchModal } from "../components/WatchModal";
import { LoadingState, EmptyState, ErrorState } from "../components/States";
import type { Match } from "../api/types";

const COMPETITION_ORDER = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "UEFA Champions League"];

function competitionRank(name: string): number {
  const idx = COMPETITION_ORDER.indexOf(name);
  return idx === -1 ? COMPETITION_ORDER.length : idx;
}

export function HomePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [watchTarget, setWatchTarget] = useState<Match | null>(null);

  const follows = useMyFollows();
  const followed = useMatches({ followed: "true", status: "SCHEDULED", timeline: "upcoming" });
  const live = useMatches({ status: "LIVE" });
  const upcoming = useMatches({ status: "SCHEDULED", timeline: "upcoming" });

  const isLoading = (user ? follows.isLoading || followed.isLoading : false) || live.isLoading || upcoming.isLoading;
  const isError = (user ? follows.isError || followed.isError : false) || live.isError || upcoming.isError;

  const followedTeams = useMemo(() => follows.data?.teams ?? [], [follows.data?.teams]);
  const liveMatches = useMemo(() => live.data?.matches ?? [], [live.data?.matches]);

  // Select only the single next upcoming fixture for each followed team across all competitions
  const yourTeamsMatches = useMemo(() => {
    if (!user || followedTeams.length === 0) return [];

    const candidateMatches = new Map<string, Match>();
    for (const m of (followed.data?.matches ?? [])) {
      if (m.status === "SCHEDULED") candidateMatches.set(m.id, m);
    }
    for (const m of (upcoming.data?.matches ?? [])) {
      if (m.status === "SCHEDULED") candidateMatches.set(m.id, m);
    }

    const nextMatchesByTeam = new Map<string, Match>();

    for (const team of followedTeams) {
      let earliest: Match | null = null;
      let earliestTime = Infinity;

      for (const m of candidateMatches.values()) {
        const isTeamMatch =
          m.homeTeamId === team.id ||
          m.awayTeamId === team.id ||
          m.homeTeam?.id === team.id ||
          m.awayTeam?.id === team.id;

        if (isTeamMatch) {
          const time = new Date(m.kickoffAt).getTime();
          if (time < earliestTime) {
            earliestTime = time;
            earliest = m;
          }
        }
      }

      if (earliest) {
        nextMatchesByTeam.set(team.id, earliest);
      }
    }

    const uniqueMatches = Array.from(
      new Map(Array.from(nextMatchesByTeam.values()).map((m) => [m.id, m])).values()
    );

    uniqueMatches.sort(
      (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()
    );

    return uniqueMatches;
  }, [user, followedTeams, followed.data, upcoming.data]);

  const yourTeamsIds = useMemo(() => new Set(yourTeamsMatches.map((m) => m.id)), [yourTeamsMatches]);

  // General feed = live + upcoming, minus anything already shown under "Your Teams".
  const generalGroups = useMemo(() => {
    const pool = [...liveMatches, ...(upcoming.data?.matches ?? [])].filter(
      (m) => !yourTeamsIds.has(m.id)
    );
    const byCompetition = new Map<string, Match[]>();
    for (const m of pool) {
      const name = m.competition?.name ?? "Other";
      if (!byCompetition.has(name)) byCompetition.set(name, []);
      byCompetition.get(name)!.push(m);
    }
    for (const list of byCompetition.values()) {
      list.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
    }
    return [...byCompetition.entries()].sort(
      (a, b) => competitionRank(a[0]) - competitionRank(b[0]) || a[0].localeCompare(b[0])
    );
  }, [liveMatches, upcoming.data, yourTeamsIds]);

  const hasYourTeamsContent = yourTeamsMatches.length > 0;
  const hasAnyContent = hasYourTeamsContent || generalGroups.length > 0;

  function invalidate() {
    setWatchTarget(null);
    qc.invalidateQueries();
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Hero Welcome / Matchlog HUD */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#101827]/90 via-[#0d131f]/90 to-[#080d14]/90 p-5 sm:p-6 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Match Center
              </span>
              {liveMatches.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {liveMatches.length} Live Now
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {user ? `Welcome back, ${user.username}` : "Welcome to Matchlog"}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-text-dim)] mt-0.5">
              Track real-time fixtures, record watch time, and vote for Player of the Match.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/matches"
              viewTransition
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--color-surface-2)] border border-white/10 hover:border-emerald-500/50 text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm"
            >
              Browse All Matches →
            </Link>
          </div>
        </div>

        {/* Followed Teams Quick Dock / Carousel */}
        {followedTeams.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
                Your Followed Clubs
              </span>
              <Link
                to="/teams"
                viewTransition
                className="text-[11px] font-medium text-emerald-400 hover:underline"
              >
                Manage ({followedTeams.length})
              </Link>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {followedTeams.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  viewTransition
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-emerald-500/40 transition-all text-xs font-semibold text-slate-200 whitespace-nowrap flex-shrink-0 group"
                >
                  <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt="" className="w-3.5 h-3.5 object-contain group-hover:scale-110 transition-transform" />
                    ) : (
                      <span className="text-[9px] font-bold">{team.name.slice(0, 2)}</span>
                    )}
                  </div>
                  <span>{team.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live Match Spotlight if any match is LIVE */}
      {liveMatches.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-rose-400">
                Live Coverage Now
              </h2>
            </div>
            <span className="text-xs text-[var(--color-text-dim)] font-medium">Real-time</span>
          </div>
          <div className="space-y-3">
            {liveMatches.map((m) => (
              <MatchCard key={m.id} match={m} onRecordWatch={setWatchTarget} />
            ))}
          </div>
        </section>
      )}

      {isLoading && <LoadingState label="Loading your matches..." />}
      {isError && <ErrorState message="We couldn't load the latest match data. Try again." />}

      {!isLoading && !isError && !hasAnyContent && (
        <EmptyState
          title="Your live football journey starts here."
          subtitle="Follow a team or competition to personalize your match feed, or browse all matches."
          action={
            <Link
              to="/teams"
              viewTransition
              className="inline-flex items-center gap-1 text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Follow a team →
            </Link>
          }
        />
      )}

      {/* Next Fixtures for Followed Teams */}
      {hasYourTeamsContent && (
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">
                Next Up For Your Teams
              </h2>
            </div>
            <span className="text-xs text-[var(--color-text-dim)]">Earliest kickoff first</span>
          </div>
          <div className="space-y-3">
            {yourTeamsMatches.map((m) => (
              <MatchCard key={m.id} match={m} onRecordWatch={setWatchTarget} />
            ))}
          </div>
        </section>
      )}

      {/* General Competition Matches */}
      {generalGroups.length > 0 && (
        <section className="space-y-6 pt-2">
          {hasYourTeamsContent && (
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">
                Explore Competitions
              </h2>
              <Link
                to="/matches"
                viewTransition
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                View all fixtures →
              </Link>
            </div>
          )}
          <div className="space-y-6">
            {generalGroups.map(([competitionName, matchList]) => (
              <div key={competitionName} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-extrabold text-[var(--color-text-dim)] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-emerald-400">❖</span>
                    <span>{competitionName}</span>
                  </h3>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[var(--color-text-dim)]">
                    {matchList.length} {matchList.length === 1 ? "fixture" : "fixtures"}
                  </span>
                </div>
                <div className="space-y-3">
                  {matchList.map((m) => (
                    <MatchCard key={m.id} match={m} onRecordWatch={setWatchTarget} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {watchTarget && (
        <WatchModal
          match={watchTarget}
          existingWatch={watchTarget.myWatch}
          onClose={() => setWatchTarget(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}
