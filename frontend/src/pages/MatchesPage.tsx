import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useMatches, useCompetitions, useMyFollows } from "../hooks/queries";
import { MatchCard } from "../components/MatchCard";
import { WatchModal } from "../components/WatchModal";
import { PredictModal } from "../components/PredictModal";
import { LoadingState, EmptyState, ErrorState } from "../components/States";
import { sortCompetitions } from "../lib/competitions";
import type { Match } from "../api/types";

const STATUS_TABS = [
  { value: "SCHEDULED", label: "Upcoming" },
  { value: "FINISHED", label: "Finished" },
  { value: "LIVE", label: "Live" },
  { value: "ALL", label: "All Matches" },
];

const PAGE_SIZE = 50;

type Group = {
  competitionId: string;
  competitionName: string;
  country?: string;
  matches: Match[];
};

function groupMatches(
  matchesList: Match[],
  sortDirection: "asc" | "desc",
  onlyNextMatchday: boolean = false
): Group[] {
  const groups: Group[] = [];
  const map = new Map<string, Group>();

  for (const m of matchesList) {
    const cId = m.competitionId ?? "other";
    const cName = m.competition?.name ?? "Other Matches";
    let g = map.get(cId);
    if (!g) {
      g = {
        competitionId: cId,
        competitionName: cName,
        country: m.competition?.country ?? undefined,
        matches: [],
      };
      map.set(cId, g);
      groups.push(g);
    }
    g.matches.push(m);
  }

  for (const g of groups) {
    if (sortDirection === "desc") {
      g.matches.sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime());
    } else {
      g.matches.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
    }

    // When requested, filter upcoming matches to only the single next upcoming matchday
    if (onlyNextMatchday && g.matches.length > 0) {
      const nextRound = g.matches[0].round;
      if (nextRound) {
        g.matches = g.matches.filter((m) => m.round === nextRound);
      }
    }
  }

  return groups;
}

export function MatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from searchParams if present, or fallback to saved session state
  const initial = useMemo(() => {
    try {
      const fromUrlStatus = searchParams.get("status");
      const fromUrlComp = searchParams.get("competition");
      const fromUrlQ = searchParams.get("q");
      const fromUrlLimit = searchParams.get("limit");

      if (fromUrlStatus) {
        return {
          status: fromUrlStatus,
          competitionId: fromUrlComp || undefined,
          search: fromUrlQ || "",
          limit: fromUrlLimit ? parseInt(fromUrlLimit, 10) || PAGE_SIZE : PAGE_SIZE,
        };
      }

      const saved = sessionStorage.getItem("matches_page_state");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          status: parsed.status || "SCHEDULED",
          competitionId: parsed.competitionId || undefined,
          search: parsed.search || "",
          limit: parsed.limit || PAGE_SIZE,
        };
      }
    } catch {}
    return { status: "SCHEDULED", competitionId: undefined, search: "", limit: PAGE_SIZE };
  }, []);

  const [status, setStatus] = useState<string>(initial.status);
  const [competitionId, setCompetitionId] = useState<string | undefined>(initial.competitionId);
  const [searchInput, setSearchInput] = useState(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search);
  const [limit, setLimit] = useState(initial.limit);
  const [watchTarget, setWatchTarget] = useState<Match | null>(null);
  const [predictTarget, setPredictTarget] = useState<Match | null>(null);
  const qc = useQueryClient();

  const isInitialMount = useRef(true);

  // Sync state to URL search parameters and session storage
  useEffect(() => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (competitionId) params.competition = competitionId;
    if (debouncedSearch) params.q = debouncedSearch;
    if (limit > PAGE_SIZE) params.limit = String(limit);

    setSearchParams(params, { replace: true });
    try {
      sessionStorage.setItem(
        "matches_page_state",
        JSON.stringify({
          status,
          competitionId,
          search: debouncedSearch,
          limit,
        })
      );
    } catch {}
  }, [status, competitionId, debouncedSearch, limit, setSearchParams]);

  // Handle debounced search typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // When search or tab changes after mount, reset limit to PAGE_SIZE
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setLimit(PAGE_SIZE);
  }, [status, competitionId, debouncedSearch]);

  const follows = useMyFollows();
  const competitions = useCompetitions();

  const followedTeamIds = useMemo(() => {
    return new Set((follows.data?.teams ?? []).map((t) => t.id));
  }, [follows.data?.teams]);

  const followedCompIds = useMemo(() => {
    return new Set((follows.data?.competitions ?? []).map((c) => c.id));
  }, [follows.data?.competitions]);

  const sortedCompetitions = useMemo(() => {
    const raw = (competitions.data?.competitions ?? []).filter(
      (c) => c.name !== "Premier League" || c.id !== "cfdaac95-eac0-40a4-a281-6c47145ef3b4"
    );
    return sortCompetitions(raw, followedCompIds, follows.data?.teams ?? []);
  }, [competitions.data?.competitions, followedCompIds, follows.data?.teams]);

  // Single tab queries
  const singleQuery = useMatches({
    status: status !== "ALL" ? status : undefined,
    timeline: status === "SCHEDULED" ? "upcoming" : status === "FINISHED" ? "past" : undefined,
    competition: competitionId,
    search: debouncedSearch || undefined,
    sort: status === "FINISHED" ? "desc" : "asc",
    limit: String(limit),
  });

  // All matches mode queries
  const allUpcomingQuery = useMatches(
    status === "ALL"
      ? {
          status: "SCHEDULED",
          timeline: "upcoming",
          competition: competitionId,
          search: debouncedSearch || undefined,
          sort: "asc",
          limit: String(limit),
        }
      : undefined
  );

  const allFinishedQuery = useMatches(
    status === "ALL"
      ? {
          status: "FINISHED",
          timeline: "past",
          competition: competitionId,
          search: debouncedSearch || undefined,
          sort: "desc",
          limit: String(limit),
        }
      : undefined
  );

  const allLiveQuery = useMatches(
    status === "ALL"
      ? {
          status: "LIVE",
          competition: competitionId,
          search: debouncedSearch || undefined,
          limit: "50",
        }
      : undefined
  );

  const liveChecker = useMatches({ status: "LIVE", limit: "10" });
  const liveCount = liveChecker.data?.matches?.length ?? 0;

  const isAllMode = status === "ALL";

  const singleMatches = singleQuery.data?.matches ?? [];
  const singleTotal = singleQuery.data?.total ?? singleMatches.length;

  // Split single matches according to user's specified hierarchy:
  // 1. Matches of followed teams (only their single next upcoming match when upcoming)
  // 2. Matches of followed leagues (only next matchday when upcoming)
  // 3. Other leagues (only next matchday when upcoming)
  const { singleFollowedTeamsMatches, singleFollowedLeaguesGroups, singleOtherLeaguesGroups } = useMemo(() => {
    if (isAllMode) return { singleFollowedTeamsMatches: [], singleFollowedLeaguesGroups: [], singleOtherLeaguesGroups: [] };

    const teamMatches: Match[] = [];

    // 1. Matches of followed teams
    if (status === "SCHEDULED") {
      // Pick only the single next upcoming match for each followed team
      const nextMatchPerTeam = new Map<string, Match>();
      const sorted = [...singleMatches].sort(
        (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()
      );
      for (const m of sorted) {
        for (const tid of [m.homeTeamId, m.awayTeamId, m.homeTeam?.id, m.awayTeam?.id]) {
          if (tid && followedTeamIds.has(tid) && !nextMatchPerTeam.has(tid)) {
            nextMatchPerTeam.set(tid, m);
          }
        }
      }
      const unique = Array.from(new Set(nextMatchPerTeam.values())).sort(
        (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()
      );
      teamMatches.push(...unique);
    } else {
      for (const m of singleMatches) {
        const isFollowedTeam =
          (m.homeTeamId && followedTeamIds.has(m.homeTeamId)) ||
          (m.awayTeamId && followedTeamIds.has(m.awayTeamId)) ||
          (m.homeTeam?.id && followedTeamIds.has(m.homeTeam.id)) ||
          (m.awayTeam?.id && followedTeamIds.has(m.awayTeam.id));
        if (isFollowedTeam) teamMatches.push(m);
      }
      if (status === "FINISHED") {
        teamMatches.sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime());
      } else {
        teamMatches.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
      }
    }

    const isUpcoming = status === "SCHEDULED";
    const sortDir = status === "FINISHED" ? "desc" : "asc";

    // 2. Matches of followed leagues (include all league matches, even if team is followed)
    const followedLeagueMatches = singleMatches.filter(
      (m) => m.competitionId && followedCompIds.has(m.competitionId)
    );
    const followedLeaguesGroups = groupMatches(followedLeagueMatches, sortDir, isUpcoming);

    // 3. Other leagues (include all matches of those leagues)
    const otherMatches = singleMatches.filter(
      (m) => !m.competitionId || !followedCompIds.has(m.competitionId)
    );
    const otherLeaguesGroups = groupMatches(otherMatches, sortDir, isUpcoming);

    return {
      singleFollowedTeamsMatches: teamMatches,
      singleFollowedLeaguesGroups: followedLeaguesGroups,
      singleOtherLeaguesGroups: otherLeaguesGroups,
    };
  }, [singleMatches, isAllMode, status, followedTeamIds, followedCompIds]);

  const upcomingMatches = allUpcomingQuery.data?.matches ?? [];
  const finishedMatches = allFinishedQuery.data?.matches ?? [];
  const liveMatches = allLiveQuery.data?.matches ?? [];

  const allUpcomingGroups = useMemo(() => groupMatches(upcomingMatches, "asc", true), [upcomingMatches]);
  const allFinishedGroups = useMemo(() => groupMatches(finishedMatches, "desc"), [finishedMatches]);
  const allLiveGroups = useMemo(() => groupMatches(liveMatches, "asc"), [liveMatches]);

  const allTotal = (allUpcomingQuery.data?.total ?? 0) + (allFinishedQuery.data?.total ?? 0) + (allLiveQuery.data?.total ?? 0);
  const allLoadedCount = upcomingMatches.length + finishedMatches.length + liveMatches.length;

  const isLoading = isAllMode
    ? allUpcomingQuery.isLoading || allFinishedQuery.isLoading
    : singleQuery.isLoading;

  const isError = isAllMode
    ? allUpcomingQuery.isError || allFinishedQuery.isError
    : singleQuery.isError;

  const hasAnyMatches = isAllMode ? allLoadedCount > 0 : singleMatches.length > 0;
  const hasMore = isAllMode ? allLoadedCount < allTotal : singleMatches.length < singleTotal;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Matches</h1>
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                {liveCount} Live
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            Your followed teams, followed leagues, and full season fixtures
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-slate-300">
            {isAllMode ? allTotal : singleTotal} fixtures
          </span>
        </div>
      </div>

      {/* Modern Status Segmented Control Dock */}
      <div className="glass-panel rounded-2xl p-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.value;
          const isLiveTab = tab.value === "LIVE";

          return (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`flex-1 min-w-[90px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
                isActive
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 scale-[1.01]"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {isLiveTab && liveCount > 0 && (
                <span
                  className={`w-2 h-2 rounded-full ${
                    isActive ? "bg-black" : "bg-rose-500 animate-pulse"
                  }`}
                />
              )}
              <span>{tab.label}</span>
              {isLiveTab && liveCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    isActive ? "bg-black/20 text-black" : "bg-rose-500/20 text-rose-400"
                  }`}
                >
                  {liveCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter Controls Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search teams (e.g. Barcelona, Arsenal)..."
            className="w-full px-3.5 py-2.5 pl-10 rounded-xl bg-[var(--color-surface)] border border-white/10 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
          />
          <svg
            className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-3 text-xs text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-white/10"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={competitionId ?? ""}
          onChange={(e) => setCompetitionId(e.target.value || undefined)}
          className="px-3.5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-white/10 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/60 transition-colors"
        >
          <option value="">All Competitions</option>
          {sortedCompetitions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingState label="Loading matches..." />}
      {isError && (
        <ErrorState
          message="We couldn't load matches. Try again."
          onRetry={() => {
            singleQuery.refetch();
            allUpcomingQuery.refetch();
            allFinishedQuery.refetch();
          }}
        />
      )}
      {!isLoading && !hasAnyMatches && (
        <EmptyState title="No matches found" subtitle="Try changing your status, competition, or search filters." />
      )}

      {/* Single Tab Mode: Hierarchy is (1) Followed Teams -> (2) Followed Leagues -> (3) Other Leagues */}
      {!isAllMode && hasAnyMatches && (
        <div className="space-y-8">
          {/* Priority Group 1: Matches of Followed Teams */}
          {singleFollowedTeamsMatches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                  <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400">
                    Your Followed Teams
                  </h2>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {singleFollowedTeamsMatches.length} {singleFollowedTeamsMatches.length === 1 ? "match" : "matches"}
                </span>
              </div>
              <div className="space-y-3">
                {singleFollowedTeamsMatches.map((m) => (
                  <MatchCard key={m.id} match={m} onRecordWatch={setWatchTarget} onPredict={setPredictTarget} />
                ))}
              </div>
            </div>
          )}

          {/* When a specific competition is selected, render it directly without redundant "Followed/Other" category headers */}
          {competitionId ? (
            <div className="space-y-6">
              {[...singleFollowedLeaguesGroups, ...singleOtherLeaguesGroups].map((group) => (
                <CompetitionMatchGroup
                  key={group.competitionId}
                  group={group}
                  onRecordWatch={setWatchTarget}
                  onPredict={setPredictTarget}
                />
              ))}
            </div>
          ) : (
            <>
              {/* Priority Group 2: Matches of Followed Leagues */}
              {singleFollowedLeaguesGroups.length > 0 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <h2 className="text-sm font-black uppercase tracking-wider text-cyan-400">
                        Your Followed Leagues
                      </h2>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {singleFollowedLeaguesGroups.map((group) => (
                      <CompetitionMatchGroup
                        key={group.competitionId}
                        group={group}
                        onRecordWatch={setWatchTarget}
                        onPredict={setPredictTarget}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Priority Group 3: Other Leagues */}
              {singleOtherLeaguesGroups.length > 0 && (
                <div className="space-y-5">
                  {(singleFollowedTeamsMatches.length > 0 || singleFollowedLeaguesGroups.length > 0) && (
                    <div className="flex items-center justify-between border-b border-white/10 pb-2 px-1">
                      <h2 className="text-sm font-black uppercase tracking-wider text-slate-400">
                        Other Competitions
                      </h2>
                    </div>
                  )}
                  <div className="space-y-6">
                    {singleOtherLeaguesGroups.map((group) => (
                      <CompetitionMatchGroup
                        key={group.competitionId}
                        group={group}
                        onRecordWatch={setWatchTarget}
                        onPredict={setPredictTarget}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* All Matches Mode */}
      {isAllMode && (
        <div className="space-y-8">
          {/* Live Section */}
          {allLiveGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-rose-500/30 pb-2 px-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-rose-400">
                  Live Matches
                </h2>
              </div>
              <div className="space-y-6">
                {allLiveGroups.map((group) => (
                  <CompetitionMatchGroup key={group.competitionId} group={group} onRecordWatch={setWatchTarget} onPredict={setPredictTarget} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          {allUpcomingGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 px-1">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-emerald-400">
                  Upcoming Fixtures
                </h2>
                <span className="text-xs text-[var(--color-text-dim)]">Ordered soonest-first</span>
              </div>
              <div className="space-y-6">
                {allUpcomingGroups.map((group) => (
                  <CompetitionMatchGroup key={group.competitionId} group={group} onRecordWatch={setWatchTarget} onPredict={setPredictTarget} />
                ))}
              </div>
            </div>
          )}

          {/* Finished Section */}
          {allFinishedGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 px-1">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-amber-400">
                  Finished Matches
                </h2>
                <span className="text-xs text-[var(--color-text-dim)]">Ordered most-recent first</span>
              </div>
              <div className="space-y-6">
                {allFinishedGroups.map((group) => (
                  <CompetitionMatchGroup key={group.competitionId} group={group} onRecordWatch={setWatchTarget} onPredict={setPredictTarget} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Incremental loading */}
      {hasMore && (
        <div className="pt-6 pb-2 flex flex-col items-center gap-2">
          <p className="text-xs text-[var(--color-text-dim)]">
            Showing {isAllMode ? allLoadedCount : singleMatches.length} of {isAllMode ? allTotal : singleTotal} matches
          </p>
          <button
            onClick={() => setLimit((prev: number) => prev + PAGE_SIZE)}
            disabled={singleQuery.isFetching || allUpcomingQuery.isFetching || allFinishedQuery.isFetching}
            className="px-6 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 hover:border-emerald-500/50 hover:bg-white/[0.08] text-sm font-bold text-slate-200 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-sm"
          >
            Load More Matches (+{PAGE_SIZE})
          </button>
        </div>
      )}

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

function CompetitionMatchGroup({
  group,
  onRecordWatch,
  onPredict,
}: {
  group: Group;
  onRecordWatch: (m: Match) => void;
  onPredict?: (m: Match) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-xs">❖</span>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
            {group.competitionName}
          </h3>
          {group.country && <span className="text-xs text-slate-500 font-medium">({group.country})</span>}
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-slate-400">
          {group.matches.length} {group.matches.length === 1 ? "match" : "matches"}
        </span>
      </div>
      <div className="space-y-3">
        {group.matches.map((m) => (
          <MatchCard key={m.id} match={m} onRecordWatch={onRecordWatch} onPredict={onPredict} />
        ))}
      </div>
    </div>
  );
}
