import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useMatch } from "../hooks/queries";
import { WatchModal } from "../components/WatchModal";
import { LoadingState, ErrorState } from "../components/States";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PredictionForm } from "../components/PredictionForm";
import { PotmPicker } from "../components/PotmPicker";
import { MatchReviewsSection } from "../components/MatchReviewsSection";
import { MatchPredictionsLeaderboard } from "../components/MatchPredictionsLeaderboard";
import { formatKickoff, statusLabel, canRecordWatch, teamInitials, formatRound, formatMatchMinute } from "../lib/format";
import type { MatchEvent } from "../api/types";

interface GoalMinuteItem {
  minute: number;
  isOwnGoal: boolean;
  isPenalty: boolean;
}

interface GoalGroup {
  playerId: string | null;
  playerName: string;
  items: GoalMinuteItem[];
}

function groupGoalsByPlayer(events: MatchEvent[], teamId?: string | null): GoalGroup[] {
  if (!events || events.length === 0) return [];
  const teamEvents = teamId ? events.filter((e) => e.teamId === teamId) : events;

  const playerMap = new Map<string, GoalGroup>();

  for (const ev of teamEvents) {
    const key = ev.playerId ?? ev.playerName;
    const existing = playerMap.get(key);
    const item: GoalMinuteItem = {
      minute: ev.minute,
      isOwnGoal: ev.type === "OWN_GOAL",
      isPenalty: ev.type === "PENALTY_GOAL",
    };

    if (existing) {
      existing.items.push(item);
    } else {
      playerMap.set(key, {
        playerId: ev.playerId,
        playerName: ev.playerName,
        items: [item],
      });
    }
  }

  return Array.from(playerMap.values());
}

function renderGoalMinutes(items: GoalMinuteItem[]) {
  return (
    <span className="text-[var(--color-text-dim)] font-medium text-[11px] inline-flex items-center flex-wrap tabular-nums">
      {items.map((it, idx) => (
        <span key={idx} className="inline-flex items-center">
          <span>{formatMatchMinute(it.minute)}</span>
          {it.isOwnGoal && (
            <span className="text-rose-500 font-extrabold ml-1 px-1 py-0.2 rounded bg-rose-500/10 border border-rose-500/30 text-[10px]" title="Own Goal">
              (o.g.)
            </span>
          )}
          {it.isPenalty && (
            <span className="text-amber-400 font-bold ml-1 text-[10px]" title="Penalty">
              (pen)
            </span>
          )}
          {idx < items.length - 1 && <span className="mr-1.5">,</span>}
        </span>
      ))}
    </span>
  );
}

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useMatch(id);
  const [showWatchModal, setShowWatchModal] = useState(false);
  const [activeSubpart, setActiveSubpart] = useState<"reviews" | "potm" | "predictions">("reviews");
  const qc = useQueryClient();

  if (isLoading) return <LoadingState label="Loading match..." />;
  if (isError || !data) return <ErrorState message="Couldn't load this match." onRetry={refetch} />;

  const { match } = data;
  const isBefore = match.status === "SCHEDULED";
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const isPaused = match.status === "PAUSED";
  const canWatch = canRecordWatch(match);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["match", id] });
    qc.invalidateQueries({ queryKey: ["match-potm", id] });
    qc.invalidateQueries({ queryKey: ["match-reviews", id] });
    qc.invalidateQueries({ queryKey: ["match-predictions", id] });
    qc.invalidateQueries({ queryKey: ["matches"] });
  }

  const homeName = match.homeTeam?.name ?? match.homeTeamPlaceholder ?? "Home Team";
  const awayName = match.awayTeam?.name ?? match.awayTeamPlaceholder ?? "Away Team";

  const events = match.events ?? [];
  const homeGoalGroups = groupGoalsByPlayer(events, match.homeTeamId);
  const awayGoalGroups = groupGoalsByPlayer(events, match.awayTeamId);
  const hasGoals = isFinished && (homeGoalGroups.length > 0 || awayGoalGroups.length > 0);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/matches");
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer group"
        >
          <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
          <span>Back to Match Center</span>
        </button>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-slate-400">
          {match.competition?.name}
          {match.round ? ` · ${formatRound(match.round)}` : ""}
        </span>
      </div>

      {/* Modern Centerpiece Scoreboard Box */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#111927]/90 via-[#0e1422]/90 to-[#090d16]/90 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

        {/* Status Chip */}
        <div className="flex justify-center mb-6">
          {isLive ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-black uppercase tracking-wider animate-live-glow">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>LIVE</span>
            </div>
          ) : isPaused ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-xs font-black uppercase tracking-wider">
              <span>HALF TIME</span>
            </div>
          ) : isFinished ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-wider">
              <span>{statusLabel(match.status)}</span>
              {match.wentToPenalties && (
                <span className="text-amber-400 font-black ml-1">
                  (Pens {match.homePenalties}-{match.awayPenalties})
                </span>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <span>{formatKickoff(match.kickoffAt, match.kickoffTimeConfirmed)}</span>
            </div>
          )}
        </div>

        {/* Main Score & Teams Layout */}
        <div className="grid grid-cols-3 items-center gap-2 sm:gap-6 mb-6">
          {/* Home Team */}
          <TeamBlock
            name={homeName}
            logoUrl={match.homeTeam?.logoUrl}
            teamId={match.homeTeamId || match.homeTeam?.id}
          />

          {/* Central Score Display */}
          <div className="text-center px-2">
            {isFinished || isLive || isPaused ? (
              <div className="flex flex-col items-center">
                <div className="inline-flex items-center justify-center gap-3 sm:gap-4 px-4 py-2 rounded-2xl bg-black/40 border border-white/10 shadow-inner">
                  <span className="text-3xl sm:text-5xl font-black text-white tabular-nums tracking-tight">
                    {match.homeScore ?? 0}
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-500">:</span>
                  <span className="text-3xl sm:text-5xl font-black text-white tabular-nums tracking-tight">
                    {match.awayScore ?? 0}
                  </span>
                </div>

                {/* Score Status / Half-time display (clock removed) */}
                {isLive ? (
                  match.homeScoreHalfTime !== null && match.awayScoreHalfTime !== null ? (
                    <div className="flex flex-col items-center mt-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        HT: {match.homeScoreHalfTime} - {match.awayScoreHalfTime}
                      </span>
                    </div>
                  ) : null
                ) : isPaused ? (
                  <div className="flex flex-col items-center mt-2 space-y-0.5">
                    <span className="text-sm sm:text-base font-black font-mono text-amber-400 tracking-wider uppercase">
                      Half-time
                    </span>
                    {match.homeScoreHalfTime !== null && match.awayScoreHalfTime !== null && (
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        HT: {match.homeScoreHalfTime} - {match.awayScoreHalfTime}
                      </span>
                    )}
                  </div>
                ) : (
                  match.homeScoreHalfTime !== null &&
                  match.awayScoreHalfTime !== null && (
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                      HT: {match.homeScoreHalfTime} - {match.awayScoreHalfTime}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="px-3 py-2 rounded-2xl bg-black/30 border border-white/10 text-center">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block">
                  Kickoff
                </span>
                <span className="text-sm font-semibold text-slate-200 mt-0.5 block">
                  {formatKickoff(match.kickoffAt, match.kickoffTimeConfirmed)}
                </span>
              </div>
            )}
          </div>

          {/* Away Team */}
          <TeamBlock
            name={awayName}
            logoUrl={match.awayTeam?.logoUrl}
            teamId={match.awayTeamId || match.awayTeam?.id}
          />
        </div>

        {/* Goal Scorers under the scoreboard */}
        {hasGoals && (
          <div className="pt-4 pb-4 my-4 border-t border-white/10 grid grid-cols-2 gap-4 text-xs">
            {/* Home Scorers */}
            <div className="space-y-1.5 text-left">
              {homeGoalGroups.map((g) => (
                <div key={g.playerName} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs select-none" title="Goal">⚽</span>
                  {g.playerId ? (
                    <Link
                      to={`/players/${g.playerId}`}
                      viewTransition
                      className="font-bold text-slate-200 hover:text-emerald-400 transition-colors truncate"
                    >
                      {g.playerName}
                    </Link>
                  ) : (
                    <span className="font-bold text-slate-200 truncate">{g.playerName}</span>
                  )}
                  {renderGoalMinutes(g.items)}
                </div>
              ))}
            </div>

            {/* Away Scorers */}
            <div className="space-y-1.5 text-right">
              {awayGoalGroups.map((g) => (
                <div key={g.playerName} className="flex items-center justify-end gap-1.5 flex-wrap">
                  {renderGoalMinutes(g.items)}
                  {g.playerId ? (
                    <Link
                      to={`/players/${g.playerId}`}
                      viewTransition
                      className="font-bold text-slate-200 hover:text-emerald-400 transition-colors truncate"
                    >
                      {g.playerName}
                    </Link>
                  ) : (
                    <span className="font-bold text-slate-200 truncate">{g.playerName}</span>
                  )}
                  <span className="text-xs select-none" title="Goal">⚽</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Match Notification */}
        {isLive && (
          <div className="pt-3 pb-1 my-3 border-t border-white/10 text-center">
            <span className="text-[11px] text-slate-400 font-medium inline-flex items-center gap-1.5">
              <span>⚡</span>
              <span>Live scorecard in progress · Goalscorer breakdown verified at full-time</span>
            </span>
          </div>
        )}

        {/* Watch Action Button */}
        <div className="flex justify-center mt-3 pt-2">
          {match.myWatch ? (
            <button
              onClick={() => setShowWatchModal(true)}
              className="text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm flex items-center gap-2"
            >
              <span>✓</span>
              <span>Watched {match.myWatch.startMinute}–{match.myWatch.endMinute}m ({match.myWatch.watchDurationMinutes} min)</span>
              <span className="text-slate-400 text-xs font-normal">· tap to edit</span>
            </button>
          ) : (
            <button
              onClick={() => setShowWatchModal(true)}
              disabled={!canWatch}
              className={`text-xs sm:text-sm font-extrabold px-6 py-3 rounded-xl transition-all shadow-md ${
                canWatch
                  ? "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.03] active:scale-[0.97] cursor-pointer shadow-emerald-500/20"
                  : "bg-white/[0.04] text-slate-500 border border-white/10 cursor-not-allowed opacity-60"
              }`}
            >
              {canWatch ? "Record Watch" : "Record Watch (Available on match day)"}
            </button>
          )}
        </div>
      </div>

      {/* Subparts Switcher Bar */}
      <div className="glass-panel p-1.5 rounded-2xl flex gap-1.5 overflow-x-auto shadow-lg">
        <button
          type="button"
          onClick={() => setActiveSubpart("reviews")}
          className={`flex-1 min-w-[130px] px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubpart === "reviews"
              ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black"
              : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <span>💬</span>
          <span>1. Reviews & Ratings</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubpart("potm")}
          className={`flex-1 min-w-[130px] px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubpart === "potm"
              ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black"
              : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <span>⭐</span>
          <span>2. Player of the Match</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubpart("predictions")}
          className={`flex-1 min-w-[130px] px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubpart === "predictions"
              ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black"
              : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <span>🎯</span>
          <span>3. Predictions</span>
        </button>
      </div>

      {/* Subpart 1: Match reviews and ratings */}
      {activeSubpart === "reviews" && (
        <ModernSection title="Match Reviews & Ratings" subtitle="Share your thoughts on the tactical display">
          {!isFinished ? (
            <div className="rounded-2xl border border-white/10 bg-[var(--color-surface)]/60 p-6 text-center backdrop-blur-md">
              <p className="text-xs text-slate-400">
                Match reviews and ratings will open once the final whistle sounds.
              </p>
            </div>
          ) : (
            <ErrorBoundary
              fallback={
                <div className="rounded-2xl border border-white/10 bg-[var(--color-surface)]/60 p-6 text-center">
                  <p className="text-xs text-slate-400">Reviews are temporarily unavailable for this match.</p>
                </div>
              }
            >
              <MatchReviewsSection matchId={match.id} />
            </ErrorBoundary>
          )}
        </ModernSection>
      )}

      {/* Subpart 2: Player of the match */}
      {activeSubpart === "potm" && (
        <ModernSection
          title={isFinished ? "Lineups & Player of the Match" : isLive ? "Live Match Lineups" : "Match Lineups"}
          subtitle={
            isFinished
              ? "2D tactical pitch, full team lineups, and official MVP voting"
              : isLive
              ? "Real-time match tactical lineups and formations"
              : "Team squads and formations"
          }
        >
          {!isFinished && !isLive ? (
            <div className="rounded-2xl border border-white/10 bg-[var(--color-surface)]/60 p-6 text-center backdrop-blur-md">
              <p className="text-xs font-medium text-slate-400">
                Tactical lineups and Player of the Match voting will unlock on match day once team sheets are confirmed.
              </p>
            </div>
          ) : (
            <ErrorBoundary
              fallback={
                <div className="rounded-2xl border border-white/10 bg-[var(--color-surface)]/60 p-6 text-center">
                  <p className="text-xs text-slate-400">Lineup and voting data is temporarily unavailable for this match.</p>
                </div>
              }
            >
              <PotmPicker
                matchId={match.id}
                homeTeamName={homeName}
                awayTeamName={awayName}
                homeTeamLogoUrl={match.homeTeam?.logoUrl}
                awayTeamLogoUrl={match.awayTeam?.logoUrl}
                hasWatched={!!match.myWatch}
                canRecordWatch={canWatch}
                isFinished={isFinished}
                isLive={isLive}
                onRecordWatch={() => setShowWatchModal(true)}
                onSaved={invalidate}
              />
            </ErrorBoundary>
          )}
        </ModernSection>
      )}

      {/* Subpart 3: Predictions */}
      {activeSubpart === "predictions" && (
        <ModernSection title="Match Prediction" subtitle="Predict the full-time score and compete on the leaderboard">
          <PredictionForm match={match} locked={!isBefore} onSaved={invalidate} />
          <MatchPredictionsLeaderboard
            matchId={match.id}
            isFinished={isFinished}
            isLive={isLive}
            homeTeamName={homeName}
            awayTeamName={awayName}
          />
        </ModernSection>
      )}

      {showWatchModal && (
        <WatchModal
          match={match}
          existingWatch={match.myWatch}
          onClose={() => setShowWatchModal(false)}
          onSaved={() => {
            setShowWatchModal(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function TeamBlock({
  name,
  logoUrl,
  teamId,
}: {
  name: string;
  logoUrl?: string | null;
  teamId?: string | null;
}) {
  const [imgError, setImgError] = useState(false);

  const content = (
    <>
      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-2.5 overflow-hidden transition-all group-hover:border-emerald-500/40 group-hover:scale-105 shadow-sm">
        {logoUrl && !imgError ? (
          <img
            src={logoUrl}
            alt={name}
            className="h-10 w-10 sm:h-13 sm:w-13 object-contain transition-transform group-hover:scale-110"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-sm font-black text-slate-400 group-hover:text-emerald-400 transition-colors">
            {teamInitials(name)}
          </span>
        )}
      </div>
      <p className="text-xs sm:text-sm font-bold text-slate-200 truncate max-w-[110px] sm:max-w-[150px] group-hover:text-emerald-400 transition-colors">
        {name}
      </p>
    </>
  );

  if (teamId) {
    return (
      <Link
        to={`/teams/${teamId}`}
        viewTransition
        className="group flex flex-col items-center text-center cursor-pointer transition-transform active:scale-95"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      {content}
    </div>
  );
}

function ModernSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="px-1 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
